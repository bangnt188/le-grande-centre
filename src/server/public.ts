import "server-only";
import { cache } from "react";
import { unstable_cache, revalidateTag } from "next/cache";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { parsePublicWebsite } from "../shared/public/parse-website";
import d1NextTagCache from "@opennextjs/cloudflare/overrides/tag-cache/d1-next-tag-cache";
import type { PublicWebsite, ContactSubmission } from "../shared/public/contracts";
import { withTransaction, WorkspaceError } from "./database";
import { readPublicWebsiteData } from "./public-data";
import { parseContactInput } from "./contact-input";
import { contactNotificationText } from "./contact-notifications";

export const PUBLIC_WEBSITE_CACHE_TAG = "public-website";

export async function invalidatePublicWebsite(): Promise<void> {
 revalidateTag(PUBLIC_WEBSITE_CACHE_TAG, { expire: 0 });
 // Next flushes route-handler tags in waitUntil. A following public request must
 // not race that background write on Workers; await the configured tag backend.
 if (process.env.OPEN_NEXT_BUILD_ID) {
  const now = Date.now();
  await d1NextTagCache.writeTags([{ tag: PUBLIC_WEBSITE_CACHE_TAG, stale: now, expire: now }]);
 }
}

const readCachedWebsite = unstable_cache(
 async (_databaseScope: string): Promise<PublicWebsite> => {
  if (process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD) {
   const snapshot = process.env.LE_GRANDE_BUILD_PUBLIC_WEBSITE;
   if (!snapshot) throw new Error("Public prerender data is missing. Build through npm run build:cloudflare.");
   return parsePublicWebsite(JSON.parse(snapshot));
  }
  return parsePublicWebsite(await readPublicWebsiteData());
 },
 ["public-website-v2"],
 { tags: [PUBLIC_WEBSITE_CACHE_TAG], revalidate: 60 },
);

// Share one projection across layout, metadata and page; never key cache by credentials.
export const readPublicWebsite = cache(async (): Promise<PublicWebsite> => {
 if (process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD) return readCachedWebsite(`build:${process.env.LE_GRANDE_BUILD_PUBLIC_WEBSITE_KEY}`);
 const connectionString = process.env.DATABASE_URL;
 if (!connectionString) throw new Error("DATABASE_URL is required");
 const database = new URL(connectionString);
 return readCachedWebsite(`${database.host}${database.pathname}`);
});
export async function submitContact(input:ContactSubmission,options:{idempotencyKey:string;ipHash:string}):Promise<{accepted:true;id:string;referenceCode:string;created:boolean}> {
 let fields:ContactSubmission;try{fields=parseContactInput(input);}catch(error){throw new WorkspaceError(error instanceof Error?error.message:'Invalid contact');}
 if(!/^[A-Za-z0-9_-]{16,100}$/.test(options.idempotencyKey)||!/^[a-f0-9]{64}$/.test(options.ipHash))throw new WorkspaceError('Invalid intake identity');
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(fields))),hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 return withTransaction('public:intake',async client=>{
  const property=(await client.query("SELECT id FROM leasing.properties WHERE code='le-grande-centre' FOR UPDATE")).rows[0];if(!property)throw new WorkspaceError('Website has not been initialized',503);
  const p=property.id,receipt=(await client.query('SELECT intake.id,intake.request_sha256,lead.reference_code FROM leasing.contact_intake intake JOIN leasing.leads lead ON lead.id=intake.lead_id WHERE intake.idempotency_key=$1 AND intake.property_id=$2',[options.idempotencyKey,p])).rows[0];
  if(receipt){if(receipt.request_sha256!==hash)throw new WorkspaceError('Intake key reused',409);return {accepted:true,id:receipt.id,referenceCode:receipt.reference_code,created:false};}
  const rate=(await client.query("SELECT count(*) FILTER(WHERE created_at>now()-interval '5 minutes') AS recent,count(*) AS daily FROM leasing.contact_intake WHERE property_id=$1 AND ip_hash=$2 AND created_at>now()-interval '24 hours'",[p,options.ipHash])).rows[0];
  if(Number(rate.recent)>0||Number(rate.daily)>=20)throw new WorkspaceError('Vui lòng chờ năm phút trước khi gửi yêu cầu khác.',429);
  let floor=1;
  if(fields.unitId){const slot=(await client.query('SELECT f.floor_number FROM leasing.slots s JOIN leasing.floors f ON f.id=s.floor_id WHERE s.property_id=$1 AND s.code=$2 AND s.retired_at IS NULL',[p,fields.unitId])).rows[0];if(!slot)throw new WorkspaceError('Mặt bằng không tồn tại.');floor=slot.floor_number;}
  const lead=crypto.randomUUID(),id=crypto.randomUUID(),interest=[fields.intent,fields.business,fields.area].filter(Boolean).join(' · ');
  const createdLead=await client.query("INSERT INTO leasing.leads(id,property_id,name,interest,floor_number,source,status,note,email,phone) VALUES($1,$2,$3,$4,$5,'Form website','Mới',$6,$7,$8) RETURNING reference_code",[lead,p,fields.name,interest,floor,fields.note,fields.email,fields.phone]);
  const referenceCode=createdLead.rows[0].reference_code as string;
  await client.query('INSERT INTO leasing.contact_intake(id,property_id,idempotency_key,request_sha256,ip_hash,lead_id,intent,company_name,business,area_preference,timing,space_code,scope,visit_date,visit_time) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)',[id,p,options.idempotencyKey,hash,options.ipHash,lead,fields.intent,fields.company,fields.business,fields.area,fields.timing,fields.unitId??fields.space,fields.scope??null,fields.visitDate??null,fields.visitTime??null]);
  await client.query("INSERT INTO leasing.contact_notification_outbox(intake_id,channel,payload,subject) VALUES($1,'zalo',$2,NULL),($1,'gmail',$2,$3)",[id,contactNotificationText({...fields,referenceCode}),`Le Grande Centre — Lead ${referenceCode}`]);
  await client.query('UPDATE leasing.properties SET workspace_revision=workspace_revision+1 WHERE id=$1',[p]);
  await client.query("INSERT INTO leasing.audit_events(property_id,system_actor,action_code,entity_type,entity_id) VALUES($1,'public:intake','contact.submit','lead',$2)",[p,lead]);
  // A visit request is a lead/intake record, not a booked appointment or a fabricated company.
  return {accepted:true,id,referenceCode,created:true};
 });
}
