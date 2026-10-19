import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Pool } from "@neondatabase/serverless";
import { BROCHURE_UNITS } from "../src/features/public/brochure-leasing";
import { DEFAULT_FLOOR_CONTENT } from "../src/shared/admin/space-model";
import { DEFAULT_WEBSITE_SETTINGS } from "../src/shared/admin/website-defaults";

type PlanSeed = {
 floor: number; coordinateSystem: string; canvasWidth: number; canvasHeight: number;
 sourceDocument: string; sourcePage: number; sourceSheet: string | null;
 orientation: { front:string;rear:string;lakeSide:string;waterworksSide:string;sourceUrl:string };
 features: { code: string; kind: string; label: string; geometry: object }[];
};
type SlotPlanSeed = { floor: number; code: string; geometry: { x: number; y: number; width: number; height: number; points?: number[][]; labelPosition?: { x: number; y: number } } };

export async function migrateDatabase(connectionString:string) {
 if(new URL(connectionString).hostname.includes('-pooler'))throw new Error('Migrations require a direct DATABASE_URL');
 const pool=new Pool({connectionString,max:1}),client=await pool.connect();
 try {
  const planSeed=JSON.parse(await readFile('database/seeds/floor-plans.json','utf8')) as {floors:PlanSeed[];slots:SlotPlanSeed[]};
  await client.query("SELECT pg_advisory_lock(hashtext('le-grande:migrations'))");
  const baseline=await client.query("SELECT to_regclass('leasing.properties') AS present");
  if(!baseline.rows[0].present)await client.query(await readFile('database/schema.sql','utf8'));
  await client.query('CREATE TABLE IF NOT EXISTS leasing.schema_migrations(name text PRIMARY KEY,sha256 char(64) NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
  for(const name of (await readdir('database/migrations')).filter(name=>/^\d{3}[-\w]*\.sql$/.test(name)).sort()) {
   const sql=await readFile('database/migrations/'+name,'utf8'),hash=createHash('sha256').update(sql).digest('hex'),previous=await client.query('SELECT sha256 FROM leasing.schema_migrations WHERE name=$1',[name]);
   if(previous.rows[0]){if(previous.rows[0].sha256!==hash)throw new Error('Applied migration changed: '+name);continue;}
   await client.query(sql);await client.query('INSERT INTO leasing.schema_migrations(name,sha256) VALUES($1,$2)',[name,hash]);
  }
  await client.query('BEGIN');await client.query("SELECT set_config('app.actor_id','system:approved-brochure-seed',true)");
  let property=(await client.query("SELECT id FROM leasing.properties WHERE code='le-grande-centre' FOR UPDATE")).rows[0];
  if(!property) {
   const owner=(await client.query("INSERT INTO leasing.organizations(legal_name) VALUES('Le Grande Centre') RETURNING id")).rows[0];
   property=(await client.query("INSERT INTO leasing.properties(code,name,owner_organization_id,contact_email,contact_phone,appointment_location) VALUES('le-grande-centre','Le Grande Centre',$1,$2,$3,'Le Grande Centre') RETURNING id",[owner.id,DEFAULT_WEBSITE_SETTINGS.email,DEFAULT_WEBSITE_SETTINGS.hotline])).rows[0];
  }
  const p=property.id,w=DEFAULT_WEBSITE_SETTINGS;
  await client.query('INSERT INTO leasing.website_settings(property_id,email,hotline,secondary_phone,management_phone,address,zalo_url) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(property_id) DO NOTHING',[p,w.email,w.hotline,w.secondaryPhone,w.managementPhone,w.address,w.zaloUrl]);
  await client.query("INSERT INTO leasing.root_allowlist(property_id,email) VALUES($1,'root@legrandecentre.vn') ON CONFLICT DO NOTHING",[p]);
  await client.query("INSERT INTO leasing.users(auth_issuer,auth_subject,disabled_at) VALUES('system:asset-import','approved-project-assets',now()) ON CONFLICT(auth_issuer,auth_subject) DO NOTHING");
  const importer=(await client.query("SELECT id FROM leasing.users WHERE auth_issuer='system:asset-import' AND auth_subject='approved-project-assets'")).rows[0];
  for(const content of DEFAULT_FLOOR_CONTENT) {
   await client.query('INSERT INTO leasing.floors(property_id,floor_number,name,purpose,public_title,public_description) VALUES($1,$2,$3,$4,$4,$5) ON CONFLICT(property_id,floor_number) DO NOTHING',[p,content.number,'Tầng '+content.number,content.publicTitle,content.publicDescription]);
   const floor=(await client.query('SELECT id FROM leasing.floors WHERE property_id=$1 AND floor_number=$2',[p,content.number])).rows[0];
   const floorPlan=planSeed.floors.find(item=>item.floor===content.number);if(!floorPlan)throw new Error('Approved floor plan seed is missing');
   await client.query("INSERT INTO leasing.plan_versions(property_id,floor_id,version_number,coordinate_system,canvas_width,canvas_height,source_document,source_page,source_sheet,orientation_facts) VALUES($1,$2,1,$3,$4,$5,$6,$7,$8,$9::jsonb) ON CONFLICT(floor_id,version_number) DO NOTHING",[p,floor.id,floorPlan.coordinateSystem,floorPlan.canvasWidth,floorPlan.canvasHeight,floorPlan.sourceDocument,floorPlan.sourcePage,floorPlan.sourceSheet,JSON.stringify(floorPlan.orientation)]);
   const plan=(await client.query('SELECT id FROM leasing.plan_versions WHERE floor_id=$1 AND version_number=1',[floor.id])).rows[0];
   for(const unit of BROCHURE_UNITS.filter(u=>u.floorId===content.number)) {
    const existing=await client.query('SELECT id FROM leasing.slots WHERE floor_id=$1 AND code=$2',[floor.id,unit.id]);if(existing.rows.length)continue;
    const slot=(await client.query('INSERT INTO leasing.slots(property_id,floor_id,code,display_order) VALUES($1,$2,$3,$4) RETURNING id',[p,floor.id,unit.id,Number(unit.id.split('.')[1])])).rows[0];
    const planSlot=planSeed.slots.find(item=>item.floor===content.number&&item.code===unit.id);if(!planSlot)throw new Error('Approved slot geometry is missing');
    const sourceDescription=(content.number<=2?'Architectural drawing ':'Approved project brochure page ')+floorPlan.sourceDocument+' PDF page '+floorPlan.sourcePage+(floorPlan.sourceSheet?' ('+floorPlan.sourceSheet+')':'')+'; commercial reference, not survey';
    const technicalSpec={dimensions:unit.dimensions??null,referenceSource:{document:floorPlan.sourceDocument,pdfPage:floorPlan.sourcePage,sheet:floorPlan.sourceSheet},coordinateMeaning:'diagram-only-not-surveyed'};
    const version=(await client.query('INSERT INTO leasing.slot_versions(property_id,floor_id,slot_id,plan_version_id,version_number,geometry,public_types,orientation_description,public_note,depth_m,technical_spec) VALUES($1,$2,$3,$4,1,$5::jsonb,$6::text[],$7,$8,$9,$10::jsonb) RETURNING id',[p,floor.id,slot.id,plan.id,JSON.stringify(planSlot.geometry),unit.types,unit.orientation,unit.note??'',content.number<=2?unit.dimensions?.depth??null:null,JSON.stringify(technicalSpec)])).rows[0];
    await client.query("INSERT INTO leasing.slot_measurements(slot_version_id,area_kind,area_m2,source_description,verification_state) VALUES($1,'commercial_reference',$2,$3,'provisional')",[version.id,unit.area,sourceDescription]);
    if(unit.dimensions?.width)await client.query("INSERT INTO leasing.slot_frontages(slot_version_id,frontage_kind,width_m,source_description) VALUES($1,'external',$2,$3)",[version.id,unit.dimensions.width,content.number<=2?'Architectural drawing frontage; no inferred azimuth':'Printed brochure width; no inferred azimuth']);
    const space=(await client.query('INSERT INTO leasing.spaces(property_id,floor_id,code,display_name) VALUES($1,$2,$3,$3) RETURNING id',[p,floor.id,unit.id])).rows[0];
    const areaBasis=content.number<=2?'Architectural drawing commercial reference; not surveyed':'Approved brochure commercial reference';
    const sv=(await client.query("INSERT INTO leasing.space_versions(property_id,floor_id,space_id,version_number,area_m2,area_basis,measurement_state,geometry,frontage_snapshot,inventory_basis) VALUES($1,$2,$3,1,$4,$5,'provisional',NULL,'[]','approved_brochure') RETURNING id",[p,floor.id,space.id,unit.area,areaBasis])).rows[0];
    await client.query('INSERT INTO leasing.space_members(space_version_id,property_id,floor_id,slot_id,slot_version_id) VALUES($1,$2,$3,$4,$5)',[sv.id,p,floor.id,slot.id,version.id]);
   }
   const inventory=(await client.query('SELECT id,code FROM leasing.slots WHERE floor_id=$1',[floor.id])).rows;
   const units=BROCHURE_UNITS.filter(u=>u.floorId===content.number);
   for(const a of units)for(const b of units) {
    const shapeA=planSeed.slots.find(item=>item.floor===content.number&&item.code===a.id)?.geometry,shapeB=planSeed.slots.find(item=>item.floor===content.number&&item.code===b.id)?.geometry;
    if(!shapeA||!shapeB||a.id===b.id||shapeA.points||shapeB.points||Math.abs(shapeA.y-shapeB.y)>.001||Math.abs(shapeA.height-shapeB.height)>.001||Math.abs(shapeA.x+shapeA.width-shapeB.x)>.001)continue;
    const left=inventory.find(s=>s.code===a.id),right=inventory.find(s=>s.code===b.id);if(!left||!right)throw new Error('Brochure inventory missing');
    const pair=[left.id,right.id].sort();
    await client.query("INSERT INTO leasing.slot_connections(property_id,floor_id,slot_a_id,slot_b_id,approval_state,technical_conditions,approved_by) VALUES($1,$2,$3,$4,'approved',$5,$6) ON CONFLICT(slot_a_id,slot_b_id) DO NOTHING",[p,floor.id,pair[0],pair[1],'Approved brochure shared boundary in the same diagram row. Diagram coordinates only; not surveyed geometry or structural permission to remove walls.',importer.id]);
   }

  }
  for(const floorPlan of planSeed.floors) {
   const floor=(await client.query('SELECT id FROM leasing.floors WHERE property_id=$1 AND floor_number=$2',[p,floorPlan.floor])).rows[0];
   if(!floor)throw new Error('Approved floor is missing');
   const currentPlan=(await client.query('SELECT id,published_at FROM leasing.plan_versions WHERE floor_id=$1 ORDER BY version_number DESC LIMIT 1',[floor.id])).rows[0];
   if(!currentPlan)throw new Error('Approved floor plan version is missing');
   const existingFeatures=Number((await client.query('SELECT count(*)::int AS count FROM leasing.plan_features WHERE plan_version_id=$1',[currentPlan.id])).rows[0].count);
   const seedBaseline=!currentPlan.published_at&&existingFeatures===0;
   if(seedBaseline)await client.query("UPDATE leasing.plan_versions SET public_state='reference',coordinate_system=$2,canvas_width=$3,canvas_height=$4,source_document=$5,source_page=$6,source_sheet=$7,orientation_facts=$8::jsonb WHERE id=$1",[currentPlan.id,floorPlan.coordinateSystem,floorPlan.canvasWidth,floorPlan.canvasHeight,floorPlan.sourceDocument,floorPlan.sourcePage,floorPlan.sourceSheet,JSON.stringify(floorPlan.orientation)]);
   if(seedBaseline)for(let index=0;index<floorPlan.features.length;index++) {
    const feature=floorPlan.features[index];
    await client.query('INSERT INTO leasing.plan_features(property_id,floor_id,plan_version_id,feature_code,feature_kind,label,geometry,display_order,source_note) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9) ON CONFLICT(plan_version_id,feature_code) DO NOTHING',[p,floor.id,currentPlan.id,feature.code,feature.kind,feature.label,JSON.stringify(feature.geometry),index+1,'Imported from the cited reference drawing; diagram only, not surveyed geometry.']);
   }
   if(seedBaseline)for(const slotSeed of planSeed.slots.filter(item=>item.floor===floorPlan.floor)) {
    const unit=BROCHURE_UNITS.find(item=>item.floorId===floorPlan.floor&&item.id===slotSeed.code);if(!unit)throw new Error('Approved public slot data is missing');
    await client.query(`UPDATE leasing.slot_versions v SET geometry=$4::jsonb
     FROM leasing.slots s WHERE s.id=v.slot_id AND s.floor_id=$1 AND s.code=$2
      AND v.plan_version_id=$3 AND v.published_at IS NULL AND v.geometry IS NULL`,[floor.id,slotSeed.code,currentPlan.id,JSON.stringify(slotSeed.geometry)]);
    await client.query(`UPDATE leasing.slot_versions v SET public_types=$4::text[],orientation_description=$5,public_note=$6
     FROM leasing.slots s WHERE s.id=v.slot_id AND s.floor_id=$1 AND s.code=$2
      AND v.plan_version_id=$3 AND v.published_at IS NULL AND v.orientation_description IS NULL`,[floor.id,slotSeed.code,currentPlan.id,unit.types,unit.orientation,unit.note??'']);
   }
  }
  await client.query('COMMIT');
  console.log('Relational migrations and approved project reference content initialized; no customer transactions seeded.');
 } catch(error){await client.query('ROLLBACK');throw error;}finally{await client.query("SELECT pg_advisory_unlock(hashtext('le-grande:migrations'))").catch(()=>{});client.release();await pool.end();}
}
export async function importApprovedLogo(connectionString:string,metadata:{publicUrl:string;bytes:number;sha256:string}) {
 if(!Number.isSafeInteger(metadata.bytes)||metadata.bytes<=0||!/^[a-f0-9]{64}$/.test(metadata.sha256))throw new Error('Verified logo byte count and SHA-256 required');
 const url=new URL(metadata.publicUrl);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!url.pathname.endsWith('/client-reference/legacy/logo-without-text.png'))throw new Error('Expected approved Neon logo URL');
 const pool=new Pool({connectionString,max:1}),client=await pool.connect();
 try {
  await client.query('BEGIN');await client.query("SELECT set_config('app.actor_id','system:approved-logo-import',true)");
  const p=(await client.query("SELECT id FROM leasing.properties WHERE code='le-grande-centre' FOR UPDATE")).rows[0];if(!p)throw new Error('Seed approved property first');
  await client.query("INSERT INTO leasing.users(auth_issuer,auth_subject,disabled_at) VALUES('system:asset-import','approved-project-assets',now()) ON CONFLICT(auth_issuer,auth_subject) DO NOTHING");
  const uploader=(await client.query("SELECT id FROM leasing.users WHERE auth_issuer='system:asset-import' AND auth_subject='approved-project-assets'")).rows[0];
  let version=(await client.query("SELECT id,sha256,byte_size FROM leasing.document_versions WHERE storage_provider='neon' AND bucket_name='media' AND object_key='client-reference/legacy/logo-without-text.png'")).rows[0];
  if(version&&(version.sha256!==metadata.sha256||Number(version.byte_size)!==metadata.bytes))throw new Error('Stored approved logo metadata differs from verified object');
  if(!version){
   const doc=(await client.query("INSERT INTO leasing.documents(property_id,classification,title) VALUES($1,'public_media','Le Grande Centre logo') RETURNING id",[p.id])).rows[0];
   version=(await client.query("INSERT INTO leasing.document_versions(property_id,document_id,version_number,storage_provider,bucket_name,object_key,content_type,byte_size,sha256,scan_state,original_filename,uploaded_by,public_url) VALUES($1,$2,1,'neon','media','client-reference/legacy/logo-without-text.png','image/png',$3,$4,'clean','logo-without-text.png',$5,$6) RETURNING id",[p.id,doc.id,metadata.bytes,metadata.sha256,uploader.id,metadata.publicUrl])).rows[0];
   await client.query("INSERT INTO leasing.media_object_state(document_version_id,property_id,state) VALUES($1,$2,'ready')",[version.id,p.id]);
   await client.query('INSERT INTO leasing.media_storage(property_id,used_bytes) VALUES($1,$2) ON CONFLICT(property_id) DO UPDATE SET used_bytes=leasing.media_storage.used_bytes+excluded.used_bytes',[p.id,metadata.bytes]);
   await client.query("INSERT INTO leasing.audit_events(property_id,system_actor,action_code,entity_type,entity_id) VALUES($1,'system:approved-logo-import','media.approved-project-import','document',$2)",[p.id,doc.id]);
  }
  await client.query('UPDATE leasing.website_settings SET logo_media_id=$2 WHERE property_id=$1',[p.id,version.id]);
  await client.query('COMMIT');
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();await pool.end();}
}
if(process.argv[1]?.endsWith("migrate-database.ts")) { const connection=process.env.DATABASE_URL_UNPOOLED;if(!connection)throw new Error("DATABASE_URL_UNPOOLED is required for migrations");await migrateDatabase(connection);if(process.env.APPROVED_LOGO_URL)await importApprovedLogo(connection,{publicUrl:process.env.APPROVED_LOGO_URL,bytes:Number(process.env.APPROVED_LOGO_BYTES),sha256:process.env.APPROVED_LOGO_SHA256??""}); }

