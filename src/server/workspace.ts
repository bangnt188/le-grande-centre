import "server-only";
import type { AdminCommand, AdminMutationReceipt, AdminSettings } from "../shared/admin/contracts";
import type { WebsiteSettings } from "../shared/admin/website-settings";
import { parseAdminCommand } from "../shared/admin/parse-command";
import { record, AdminValidationError } from "../shared/admin/validation";
import { withAdminTransaction, WorkspaceError, type AdminIdentity, type PoolClient } from "./database";
import { createAdminCrudServices, type AdminCrudServices } from "./admin-crud";
import { deleteMedia, renameMedia, linkMedia } from "./media/repository";
import { BackendError } from "@shared/backend";
import { assertSessionActive, requireAdministrator } from "./admin-session";
function mapCrudError(error:unknown): WorkspaceError | null {
 if(error instanceof BackendError)return new WorkspaceError(error.code==="INVALID_INPUT"?"Thông tin không hợp lệ.":error.code==="NOT_FOUND"?"Bản ghi không còn tồn tại.":error.code==="CONFLICT"?"Dữ liệu đã thay đổi hoặc vi phạm ràng buộc nghiệp vụ.":"Dịch vụ CRUD tạm thời không khả dụng.",error.status);
 return null;
}
function rethrowCrudError(error:unknown):never {const mapped=mapCrudError(error);if(mapped)throw mapped;throw error;}

type SettingsRow = {workspace_revision:string;name:string;contact_email:string;contact_phone:string;default_hold_hours:number;appointment_minutes:number;appointment_location:string;logo_media_id:string|null;email:string;hotline:string;secondary_phone:string;management_phone:string;address:string;zalo_url:string};
const settingsSql = `SELECT p.workspace_revision::text,p.name,p.contact_email,p.contact_phone,p.default_hold_hours,p.appointment_minutes,p.appointment_location,w.logo_media_id,w.email,w.hotline,w.secondary_phone,w.management_phone,w.address,w.zalo_url FROM leasing.properties p JOIN leasing.website_settings w ON w.property_id=p.id WHERE p.id=$1`;
function decodeSettings(p:SettingsRow|null|undefined):{revision:number;settings:AdminSettings} {
 if(!p)throw new WorkspaceError("Property is not initialized",503);
 const website:WebsiteSettings={logoMediaId:p.logo_media_id??"",email:p.email,hotline:p.hotline,secondaryPhone:p.secondary_phone,managementPhone:p.management_phone,address:p.address,zaloUrl:p.zalo_url};
 return {revision:Number(p.workspace_revision),settings:{propertyName:p.name,contactEmail:p.contact_email,contactPhone:p.contact_phone,defaultHoldHours:p.default_hold_hours,appointmentMinutes:p.appointment_minutes,appointmentLocation:p.appointment_location,website}};
}
export async function readSettings(client:PoolClient,propertyId:string):Promise<{revision:number;settings:AdminSettings}> {
 return decodeSettings((await client.query<SettingsRow>(settingsSql,[propertyId])).rows[0]);
}
export const floorsSql = `SELECT floor_number AS number,purpose,public_title AS "publicTitle",public_description AS "publicDescription" FROM leasing.floors WHERE property_id=$1 ORDER BY floor_number`;
export const slotsSql = (includeInternalStatus = true) => `SELECT s.id,f.floor_number AS floor,s.code,s.display_order AS "order",s.core_zone AS side, m.area_m2::float8 AS area,coalesce(fr.width_m,0)::float8 AS width,
  ${includeInternalStatus ? "s.business_status" : "CASE WHEN s.business_status='Còn trống' THEN 'Còn trống' WHEN s.business_status='Đã thuê' OR (s.business_status='Đã ký' AND l.id IS NOT NULL) THEN 'Đã thuê' ELSE 'Liên hệ' END"} AS status,coalesce(o.legal_name,s.tenant_label) AS tenant, ARRAY(SELECT CASE WHEN c.slot_a_id=s.id THEN c.slot_b_id ELSE c.slot_a_id END FROM leasing.slot_connections c WHERE c.property_id=s.property_id AND c.approval_state='approved' AND (c.slot_a_id=s.id OR c.slot_b_id=s.id)) AS "connectedSlotIds"
  FROM leasing.slots s JOIN leasing.floors f ON f.id=s.floor_id
  JOIN LATERAL(SELECT * FROM leasing.slot_versions WHERE slot_id=s.id ORDER BY version_number DESC LIMIT 1) v ON true
  JOIN leasing.slot_measurements m ON m.slot_version_id=v.id AND m.area_kind='commercial_reference'
  LEFT JOIN LATERAL(SELECT width_m FROM leasing.slot_frontages WHERE slot_version_id=v.id AND frontage_kind='external' LIMIT 1) fr ON true
  LEFT JOIN leasing.slot_allocations a ON a.slot_id=s.id AND a.lease_id IS NOT NULL AND a.released_at IS NULL
  LEFT JOIN leasing.leases l ON l.id=a.lease_id AND l.status='executed' AND l.occupancy_period @> CURRENT_DATE LEFT JOIN leasing.organizations o ON o.id=l.organization_id
  WHERE s.property_id=$1 AND s.retired_at IS NULL ORDER BY f.floor_number,s.display_order`;
export const groupsSql = `SELECT s.id,f.floor_number AS floor,s.display_name AS name,array_agg(m.slot_id ORDER BY sl.display_order) AS "slotIds" FROM leasing.spaces s JOIN leasing.floors f ON f.id=s.floor_id JOIN LATERAL(SELECT id FROM leasing.space_versions WHERE space_id=s.id ORDER BY version_number DESC LIMIT 1)v ON true JOIN leasing.space_members m ON m.space_version_id=v.id JOIN leasing.slots sl ON sl.id=m.slot_id WHERE s.property_id=$1 AND s.is_admin_group AND s.retired_at IS NULL GROUP BY s.id,f.floor_number`;
export const requestsSql = `SELECT q.id,q.reference_code AS "referenceCode",q.organization_id AS "companyId",f.floor_number AS floor,array_agg(m.slot_id ORDER BY sl.display_order) AS "slotIds",v.area_m2::float8 AS area,lower(q.requested_period)::text AS start,(upper(q.requested_period)-1)::text AS "end",CASE q.status WHEN 'under_review' THEN 'reviewing' ELSE q.status END AS status,q.customer_note AS note,q.submitted_at::text AS received FROM leasing.leasing_requests q JOIN leasing.request_spaces rs ON rs.request_id=q.id JOIN leasing.space_versions v ON v.id=rs.space_version_id JOIN leasing.floors f ON f.id=v.floor_id JOIN leasing.space_members m ON m.space_version_id=v.id JOIN leasing.slots sl ON sl.id=m.slot_id WHERE q.property_id=$1 GROUP BY q.id,f.floor_number,v.area_m2`;
export const reservationsSql = `SELECT r.id,r.reference_code AS "referenceCode",r.request_id AS "requestId",r.organization_id AS "companyId",f.floor_number AS floor,array_agg(m.slot_id ORDER BY sl.display_order) AS "slotIds",v.area_m2::float8 AS area,lower(r.occupancy_period)::text AS start,(upper(r.occupancy_period)-1)::text AS "end",r.expires_at::text AS "expiresAt",r.status,r.internal_note AS note FROM leasing.reservations r JOIN leasing.request_spaces rs ON rs.id=r.request_space_id JOIN leasing.space_versions v ON v.id=rs.space_version_id JOIN leasing.floors f ON f.id=v.floor_id JOIN leasing.space_members m ON m.space_version_id=v.id JOIN leasing.slots sl ON sl.id=m.slot_id WHERE r.property_id=$1 GROUP BY r.id,f.floor_number,v.area_m2`;
export const leasesSql = `SELECT l.id,l.reference_code AS "referenceCode",l.organization_id AS "companyId",l.reservation_id AS "reservationId",l.reference_number AS "referenceNumber",f.floor_number AS floor,array_agg(m.slot_id ORDER BY sl.display_order) AS "slotIds",v.area_m2::float8 AS area,lower(l.occupancy_period)::text AS start,(upper(l.occupancy_period)-1)::text AS "end",l.status,lv.rent_note AS "rentNote",lv.recorded_at::text AS "recordedAt",lv.recorded_by AS "recordedBy",legacy.title AS "documentName",legacy.media_id AS "documentMediaId" FROM leasing.leases l JOIN leasing.space_versions v ON v.id=l.space_version_id JOIN leasing.floors f ON f.id=v.floor_id JOIN leasing.space_members m ON m.space_version_id=v.id JOIN leasing.slots sl ON sl.id=m.slot_id JOIN LATERAL(SELECT * FROM leasing.lease_versions WHERE lease_id=l.id ORDER BY version_number DESC LIMIT 1) lv ON true LEFT JOIN LATERAL(SELECT d.title,dv.id AS media_id FROM leasing.lease_documents ld JOIN leasing.document_versions dv ON dv.id=ld.document_version_id JOIN leasing.documents d ON d.id=dv.document_id WHERE ld.lease_version_id=lv.id AND ld.property_id=l.property_id ORDER BY dv.uploaded_at DESC,dv.id DESC LIMIT 1) legacy ON true WHERE l.property_id=$1 AND l.status='executed' GROUP BY l.id,f.floor_number,v.area_m2,lv.rent_note,lv.recorded_at,lv.recorded_by,legacy.title,legacy.media_id`;

async function assertVacant(client:PoolClient,p:string,ids:string[]) {
 const {rows}=await client.query(`SELECT s.id FROM leasing.slots s WHERE s.property_id=$1 AND s.id=ANY($2::uuid[]) AND (s.business_status<>'Còn trống' OR s.tenant_label<>'' OR EXISTS(SELECT 1 FROM leasing.slot_allocations a WHERE a.slot_id=s.id AND a.released_at IS NULL))`,[p,ids]);
 if(rows.length)throw new WorkspaceError('Mặt bằng đang có cam kết hoặc đang thuê.',409);
}
async function expireHolds(client:PoolClient,p:string) {
 const expired=(await client.query(`UPDATE leasing.reservations SET status='expired',revision=revision+1 WHERE property_id=$1 AND status='active' AND expires_at<=now() RETURNING id`,[p])).rows;
 if(expired.length)await client.query(`UPDATE leasing.slot_allocations SET released_at=now() WHERE reservation_id=ANY($1::uuid[]) AND released_at IS NULL`,[expired.map(r=>r.id)]);
}
async function createSpace(client:PoolClient,p:string,floor:number,ids:string[],name:string,isGroup=false) {
 const members=(await client.query(`SELECT s.id,s.floor_id,v.id AS version_id,m.area_m2,v.plan_version_id FROM leasing.slots s JOIN leasing.floors f ON f.id=s.floor_id JOIN LATERAL(SELECT * FROM leasing.slot_versions WHERE slot_id=s.id ORDER BY version_number DESC LIMIT 1)v ON true JOIN leasing.slot_measurements m ON m.slot_version_id=v.id AND m.area_kind='commercial_reference' WHERE s.property_id=$1 AND f.floor_number=$2 AND s.id=ANY($3::uuid[]) AND s.retired_at IS NULL ORDER BY s.display_order`,[p,floor,ids])).rows;
 if(members.length!==ids.length)throw new WorkspaceError('Slot không thuộc tầng đã chọn.');
 if(ids.length>1) {
  const connections=(await client.query(`SELECT slot_a_id,slot_b_id FROM leasing.slot_connections WHERE property_id=$1 AND approval_state='approved' AND slot_a_id=ANY($2::uuid[]) AND slot_b_id=ANY($2::uuid[])`,[p,ids])).rows;
  const reached=new Set([ids[0]]);let changed=true;while(changed){changed=false;for(const c of connections)if(reached.has(c.slot_a_id)||reached.has(c.slot_b_id)){const before=reached.size;reached.add(c.slot_a_id);reached.add(c.slot_b_id);changed||=before!==reached.size;}}
  if(reached.size!==ids.length)throw new WorkspaceError('Chưa có cạnh nối được phê duyệt cho các slot này. Không suy diễn topology từ số thứ tự.',409);
 }
 const area=members.reduce((sum,m)=>sum+Number(m.area_m2),0),id=crypto.randomUUID(),version=crypto.randomUUID();
 await client.query(`INSERT INTO leasing.spaces(id,property_id,floor_id,code,display_name,is_admin_group) VALUES($1::uuid,$2,$3,$1::uuid::text,$4,$5)`,[id,p,members[0].floor_id,name,isGroup]);
 await client.query(`INSERT INTO leasing.space_versions(id,property_id,floor_id,space_id,version_number,area_m2,area_basis,measurement_state,geometry,frontage_snapshot,inventory_basis) VALUES($1,$2,$3,$4,1,$5,'Brochure reference','provisional',NULL,'[]','approved_brochure')`,[version,p,members[0].floor_id,id,area]);
 for(const m of members)await client.query(`INSERT INTO leasing.space_members(space_version_id,property_id,floor_id,slot_id,slot_version_id) VALUES($1,$2,$3,$4,$5)`,[version,p,m.floor_id,m.id,m.version_id]);
 return {id,version,area};
}
async function saveWebsite(client:PoolClient,p:string,v:WebsiteSettings) {
 const logo=(await client.query(`SELECT dv.id FROM leasing.document_versions dv JOIN leasing.documents d ON d.id=dv.document_id JOIN leasing.media_object_state os ON os.document_version_id=dv.id WHERE dv.id=$1 AND dv.property_id=$2 AND dv.storage_provider='neon' AND dv.content_type LIKE 'image/%' AND dv.scan_state='clean' AND os.state='ready' AND d.classification='public_media'`,[v.logoMediaId,p])).rows;
 if(!logo.length)throw new WorkspaceError('Logo phải là ảnh đã lưu trên Neon.');
 await client.query(`UPDATE leasing.website_settings SET logo_media_id=$2,email=$3,hotline=$4,secondary_phone=$5,management_phone=$6,address=$7,zalo_url=$8 WHERE property_id=$1`,[p,v.logoMediaId,v.email,v.hotline,v.secondaryPhone,v.managementPhone,v.address,v.zaloUrl]);
}

async function recordLeaseMetadata(client: PoolClient, identity: AdminIdentity, leaseId: string, rentNote: string) {
 const lease=(await client.query("SELECT l.*,o.legal_name,o.registration_number FROM leasing.leases l JOIN leasing.organizations o ON o.id=l.organization_id WHERE l.id=$1 AND l.property_id=$2",[leaseId,identity.propertyId])).rows[0];
 if(!lease)throw new WorkspaceError("Không tìm thấy thông tin thuê.",404);
 const space=(await client.query(`SELECT v.id,v.area_m2::float8 AS area,f.floor_number AS floor,array_agg(m.slot_id ORDER BY s.display_order) AS "slotIds",array_agg(s.code ORDER BY s.display_order) AS codes FROM leasing.space_versions v JOIN leasing.floors f ON f.id=v.floor_id JOIN leasing.space_members m ON m.space_version_id=v.id JOIN leasing.slots s ON s.id=m.slot_id WHERE v.id=$1 AND v.property_id=$2 GROUP BY v.id,f.floor_number`,[lease.space_version_id,identity.propertyId])).rows[0];
 if(!space)throw new WorkspaceError("Không tìm thấy phiên bản mặt bằng.",409);
 const version=crypto.randomUUID();
 await client.query(`INSERT INTO leasing.lease_versions(id,lease_id,property_id,version_number,document_kind,contractual_period,party_snapshot,space_snapshot,rent_note)
  VALUES($1,$2,$3,1,'original',$4::daterange,$5::jsonb,$6::jsonb,$7)`,[version,leaseId,identity.propertyId,lease.occupancy_period,JSON.stringify([{organizationId:lease.organization_id,name:lease.legal_name,registrationNumber:lease.registration_number}]),JSON.stringify({spaceVersionId:space.id,floor:space.floor,slotIds:space.slotIds,codes:space.codes,area:space.area}),rentNote]);
 await client.query("UPDATE leasing.lease_versions SET recorded_at=now(),recorded_by=$2 WHERE id=$1 AND property_id=$3",[version,identity.id,identity.propertyId]);
}
type CommandFacts = {
 companies: {id:string;version:number}[]; leads:{id:string;version:number;companyId:string|null}[];
 appointments:{id:string;version:number;status:string;startsAt:string}[];
 slots:{id:string;area:number}[];
 groups:{id:string;floor:number;slotIds:string[]}[];
 requests:{id:string;floor:number;slotIds:string[];status:string}[];
 reservations:{id:string;status:string;expiresAt:string}[];
};
/** Only authoritative facts needed by this command, under the property write lock. */
async function readCommandFacts(client:PoolClient,p:string,c:AdminCommand):Promise<CommandFacts> {
 const facts:CommandFacts={companies:[],leads:[],appointments:[],slots:[],groups:[],requests:[],reservations:[]};
 const companyId="companyId" in c?c.companyId:("values" in c&&"companyId" in c.values?c.values.companyId:undefined);
 if(companyId)facts.companies=(await client.query('SELECT organization_id AS id,revision AS version FROM leasing.property_customers WHERE property_id=$1 AND organization_id=$2 AND deleted_at IS NULL',[p,companyId])).rows.map(row=>({...row,version:Number(row.version)}));
 if("leadId" in c&&c.leadId)facts.leads=(await client.query('SELECT id,revision AS version,organization_id AS "companyId" FROM leasing.leads WHERE property_id=$1 AND id=$2 AND deleted_at IS NULL',[p,c.leadId])).rows.map(row=>({...row,version:Number(row.version)}));
 if("appointmentId" in c&&c.appointmentId)facts.appointments=(await client.query('SELECT id,revision AS version,status,lower(scheduled_period)::text AS "startsAt" FROM leasing.appointments WHERE property_id=$1 AND id=$2 AND deleted_at IS NULL',[p,c.appointmentId])).rows.map(row=>({...row,version:Number(row.version)}));
 if("reservationId" in c)facts.reservations=(await client.query('SELECT id,status,expires_at::text AS "expiresAt" FROM leasing.reservations WHERE property_id=$1 AND id=$2',[p,c.reservationId])).rows;
 let groupId:string|undefined,slotIds:string[]|undefined,requestId:string|undefined;
 switch(c.type){
  case "split":case "update-group":groupId=c.groupId;break;
  case "merge":slotIds=c.slotIds;break;
  case "save-request":slotIds=c.values.slotIds;requestId=c.requestId;break;
  case "review-request":case "reject-request":case "approve-request":requestId=c.requestId;break;
  case "update-slot":
   slotIds=[c.slotId];
   facts.slots=(await client.query(`SELECT s.id,m.area_m2::float8 AS area FROM leasing.slots s JOIN LATERAL(SELECT id FROM leasing.slot_versions WHERE slot_id=s.id ORDER BY version_number DESC LIMIT 1)v ON true JOIN leasing.slot_measurements m ON m.slot_version_id=v.id AND m.area_kind='commercial_reference' WHERE s.property_id=$1 AND s.id=$2 AND s.retired_at IS NULL`,[p,c.slotId])).rows;
   break;
 }
 if(requestId||c.type==="update-slot"){
  facts.requests=(await client.query(`SELECT q.id,f.floor_number AS floor,CASE q.status WHEN 'under_review' THEN 'reviewing' ELSE q.status END AS status,array_agg(m.slot_id ORDER BY m.slot_id) AS "slotIds"
   FROM leasing.leasing_requests q JOIN leasing.request_spaces rs ON rs.request_id=q.id JOIN leasing.space_versions v ON v.id=rs.space_version_id JOIN leasing.floors f ON f.id=v.floor_id JOIN leasing.space_members m ON m.space_version_id=v.id
   WHERE q.property_id=$1 AND (($2::uuid IS NOT NULL AND q.id=$2) OR ($3::uuid IS NOT NULL AND q.status IN ('submitted','under_review') AND EXISTS(SELECT 1 FROM leasing.space_members sm WHERE sm.space_version_id=v.id AND sm.slot_id=$3))) GROUP BY q.id,f.floor_number`,[p,requestId??null,c.type==="update-slot"?c.slotId:null])).rows;
  if(c.type==="approve-request")slotIds=facts.requests.flatMap(row=>row.slotIds);
 }
 if(groupId||slotIds?.length)facts.groups=(await client.query(`SELECT s.id,f.floor_number AS floor,array_agg(m.slot_id ORDER BY m.slot_id) AS "slotIds" FROM leasing.spaces s JOIN leasing.floors f ON f.id=s.floor_id JOIN LATERAL(SELECT id FROM leasing.space_versions WHERE space_id=s.id ORDER BY version_number DESC LIMIT 1)v ON true JOIN leasing.space_members m ON m.space_version_id=v.id
  WHERE s.property_id=$1 AND s.is_admin_group AND s.retired_at IS NULL AND (($2::uuid IS NOT NULL AND s.id=$2) OR ($3::uuid[] IS NOT NULL AND EXISTS(SELECT 1 FROM leasing.space_members sm WHERE sm.space_version_id=v.id AND sm.slot_id=ANY($3::uuid[])))) GROUP BY s.id,f.floor_number`,[p,groupId??null,slotIds??null])).rows;
 return facts;
}
async function applyCommand(client:PoolClient,identity:AdminIdentity,c:AdminCommand,data:CommandFacts,crud:AdminCrudServices):Promise<string> {
 const p=identity.propertyId;
 switch(c.type) {
 case 'update-floor':await client.query('UPDATE leasing.floors SET purpose=$3,public_title=$4,public_description=$5 WHERE property_id=$1 AND floor_number=$2',[p,c.floor,c.purpose,c.publicTitle,c.publicDescription]);return p;
 case 'update-website-settings':await saveWebsite(client,p,c.values);return p;
 case 'update-settings':await saveWebsite(client,p,c.values.website);await client.query('UPDATE leasing.properties SET name=$2,contact_email=$3,contact_phone=$4,default_hold_hours=$5,appointment_minutes=$6,appointment_location=$7 WHERE id=$1',[p,c.values.propertyName,c.values.contactEmail,c.values.contactPhone,c.values.defaultHoldHours,c.values.appointmentMinutes,c.values.appointmentLocation]);return p;
 case 'merge':{
  if(c.slotIds.length<2)throw new WorkspaceError('Chọn ít nhất hai slot.');
  await assertVacant(client,p,c.slotIds);
  if(data.groups.some(g=>g.slotIds.some(id=>c.slotIds.includes(id))))throw new WorkspaceError('Slot đã thuộc nhóm.');
  return (await createSpace(client,p,c.floor,c.slotIds,c.name,true)).id;
 }
 case 'split':{
  const g=record(data.groups,c.groupId);await assertUncommitted(client,p,g.slotIds);
  await client.query('UPDATE leasing.spaces SET retired_at=now(),revision=revision+1 WHERE id=$1 AND property_id=$2',[g.id,p]);
  await client.query("UPDATE leasing.documents SET media_scope=$1 WHERE property_id=$2 AND media_scope=$3",['Tầng '+g.floor,p,'group:'+g.id]);return g.id;
 }
  case 'update-slot':{
  const s=record(data.slots,c.slotId);await assertUncommitted(client,p,[s.id]);
  if(data.groups.some(g=>g.slotIds.includes(s.id)))throw new WorkspaceError('Cập nhật nhóm thay vì slot thành viên.');
  await client.query('UPDATE leasing.slots SET business_status=$3,tenant_label=$4,revision=revision+1 WHERE id=$1 AND property_id=$2',[s.id,p,c.status,c.status==='Còn trống'?'':c.tenant]);
  if(c.area!==undefined&&c.area!==s.area) {
   const v=(await client.query('SELECT * FROM leasing.slot_versions WHERE slot_id=$1 ORDER BY version_number DESC LIMIT 1',[s.id])).rows[0],id=crypto.randomUUID();
   await client.query('INSERT INTO leasing.slot_versions(id,property_id,floor_id,slot_id,plan_version_id,version_number,geometry,public_types,orientation_description,public_note,technical_spec) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[id,p,v.floor_id,s.id,v.plan_version_id,v.version_number+1,v.geometry,v.public_types,v.orientation_description,v.public_note,v.technical_spec]);
   await client.query("INSERT INTO leasing.slot_measurements(slot_version_id,area_kind,area_m2,source_description,verification_state) VALUES($1,'commercial_reference',$2,'Administrator entered commercial reference; not surveyed','provisional')",[id,c.area]);
   await client.query('INSERT INTO leasing.slot_frontages(slot_version_id,frontage_kind,width_m,azimuth_deg,source_description) SELECT $1,frontage_kind,width_m,azimuth_deg,source_description FROM leasing.slot_frontages WHERE slot_version_id=$2',[id,v.id]);
   for(const pending of data.requests.filter(q=>['submitted','reviewing'].includes(q.status)&&q.slotIds.includes(s.id))) {
    const revised=await createSpace(client,p,pending.floor,pending.slotIds,'Yêu cầu thuê đã cập nhật diện tích');
    await client.query('DELETE FROM leasing.request_spaces WHERE request_id=$1',[pending.id]);
    await client.query('INSERT INTO leasing.request_spaces(property_id,request_id,space_version_id) VALUES($1,$2,$3)',[p,pending.id,revised.version]);
    await client.query('UPDATE leasing.leasing_requests SET revision=revision+1 WHERE id=$1',[pending.id]);
   }
  }return s.id;
 }
 case 'update-group':{
  const g=record(data.groups,c.groupId);await assertUncommitted(client,p,g.slotIds);
  await client.query('UPDATE leasing.spaces SET display_name=$2,revision=revision+1 WHERE id=$1',[g.id,c.name]);
  await client.query("UPDATE leasing.slots SET business_status=$2,tenant_label=CASE WHEN $2='Còn trống' THEN '' ELSE tenant_label END,revision=revision+1 WHERE id=ANY($1::uuid[])",[g.slotIds,c.status]);return g.id;
 }
 case 'save-company':{
  const company=record(data.companies,c.companyId);
  return (await crud.companies.update(crud.request,c.companyId,company.version,{note:c.note})).id;
 }
 case 'upsert-company':{
  if(c.companyId){const company=record(data.companies,c.companyId);return (await crud.companies.update(crud.request,c.companyId,company.version,c.values)).id;}
  return (await crud.companies.create(crud.request,c.values)).id;
 }
 case 'delete-company':{
  const company=record(data.companies,c.companyId);await crud.companies.delete(crud.request,c.companyId,company.version);return c.companyId;
 }
 case 'save-lead':{
  const id=c.leadId??undefined;if(id)record(data.leads,id);if(c.values.companyId)record(data.companies,c.values.companyId);
  if(id){const lead=record(data.leads,id);return (await crud.leads.update(crud.request,id,lead.version,c.values)).id;}
  return (await crud.leads.create(crud.request,c.values)).id;
 }
 case 'link-lead-company':
 case 'create-company-from-lead':{
  const lead=record(data.leads,c.leadId);
  if(lead.companyId)throw new WorkspaceError('Liên hệ đã được liên kết với công ty.',409);
  const companyId=c.type==='link-lead-company'?record(data.companies,c.companyId).id:(await crud.companies.create(crud.request,c.values)).id;
  const linked=await client.query('UPDATE leasing.leads SET organization_id=$3,revision=revision+1 WHERE property_id=$1 AND id=$2 AND revision=$4 AND deleted_at IS NULL AND organization_id IS NULL RETURNING id',[p,lead.id,companyId,lead.version]);
  if(!linked.rows.length)throw new WorkspaceError('Liên hệ đã thay đổi hoặc đã được liên kết.',409);
  return companyId;
 }
 case 'delete-lead':{
  const lead=record(data.leads,c.leadId);await crud.leads.delete(crud.request,c.leadId,lead.version);return c.leadId;
 }
 case 'save-request':{
  const v=c.values,id=c.requestId??crypto.randomUUID();record(data.companies,v.companyId);
  if(c.requestId&&!['submitted','reviewing'].includes(record(data.requests,id).status))throw new WorkspaceError('Chỉ sửa yêu cầu đang chờ.');
  await assertVacant(client,p,v.slotIds);
  const partial=data.groups.some(g=>g.slotIds.some(id=>v.slotIds.includes(id))&&(g.slotIds.length!==v.slotIds.length||!g.slotIds.every(id=>v.slotIds.includes(id))));if(partial)throw new WorkspaceError('Chọn toàn bộ nhóm.');
  const space=await createSpace(client,p,v.floor,v.slotIds,'Yêu cầu thuê');
  if(c.requestId){await client.query('DELETE FROM leasing.request_spaces WHERE request_id=$1',[id]);await client.query("UPDATE leasing.leasing_requests SET organization_id=$2,requested_period=daterange($3::date,$4::date+1,'[)'),customer_note=$5,revision=revision+1 WHERE id=$1",[id,v.companyId,v.start,v.end,v.note]);}
  else await client.query("INSERT INTO leasing.leasing_requests(id,property_id,organization_id,requested_period,customer_note) VALUES($1,$2,$3,daterange($4::date,$5::date+1,'[)'),$6)",[id,p,v.companyId,v.start,v.end,v.note]);
  await client.query('INSERT INTO leasing.request_spaces(property_id,request_id,space_version_id) VALUES($1,$2,$3)',[p,id,space.version]);return id;
 }
 case 'review-request':{
  const q=record(data.requests,c.requestId);if(q.status!=='submitted')throw new WorkspaceError('Yêu cầu đã tiếp nhận.');await client.query("UPDATE leasing.leasing_requests SET status='under_review',revision=revision+1 WHERE id=$1",[q.id]);return q.id;
 }
 case 'reject-request':{
  const q=record(data.requests,c.requestId);if(!['submitted','reviewing'].includes(q.status))throw new WorkspaceError('Yêu cầu đã có quyết định.');await client.query("UPDATE leasing.leasing_requests SET status='rejected',decision_by=$2,decision_at=now(),decision_reason=$3,customer_note=$3,revision=revision+1 WHERE id=$1",[q.id,identity.id,c.reason]);return q.id;
 }
 case 'approve-request':{
  const q=record(data.requests,c.requestId);if(!['submitted','reviewing'].includes(q.status))throw new WorkspaceError('Yêu cầu đã có quyết định.');await assertVacant(client,p,q.slotIds);
  const rs=(await client.query('SELECT * FROM leasing.request_spaces WHERE request_id=$1',[q.id])).rows[0];
  if(!rs)throw new WorkspaceError('Yêu cầu chưa có mặt bằng.');
  await client.query('UPDATE leasing.request_spaces SET acknowledged_at=now() WHERE id=$1',[rs.id]);
  await client.query("UPDATE leasing.leasing_requests SET status='approved',decision_by=$2,decision_at=now(),revision=revision+1 WHERE id=$1",[q.id,identity.id]);
  const id=crypto.randomUUID();await client.query("INSERT INTO leasing.reservations(id,property_id,organization_id,request_id,request_space_id,occupancy_period,expires_at,approved_by,internal_note) SELECT $1,property_id,organization_id,id,$2,requested_period,now()+$3*interval '1 hour',$4,$5 FROM leasing.leasing_requests WHERE id=$6",[id,rs.id,c.holdHours,identity.id,c.note,q.id]);
  await client.query('INSERT INTO leasing.slot_allocations(property_id,slot_id,reservation_id,occupancy_period) SELECT r.property_id,m.slot_id,r.id,r.occupancy_period FROM leasing.reservations r JOIN leasing.space_members m ON m.space_version_id=$2 WHERE r.id=$1',[id,rs.space_version_id]);
  if(q.slotIds.length>1&&!data.groups.some(g=>g.slotIds.every(id=>q.slotIds.includes(id))&&g.slotIds.length===q.slotIds.length))await client.query('UPDATE leasing.spaces SET is_admin_group=true WHERE id=(SELECT space_id FROM leasing.space_versions WHERE id=$1)',[rs.space_version_id]);return id;
 }
 case 'cancel-hold':{
  const h=record(data.reservations,c.reservationId);if(h.status!=='active')throw new WorkspaceError('Giữ chỗ đã kết thúc.');await client.query("UPDATE leasing.reservations SET status='cancelled',internal_note=$2,revision=revision+1 WHERE id=$1",[h.id,c.reason]);await client.query('UPDATE leasing.slot_allocations SET released_at=now() WHERE reservation_id=$1 AND released_at IS NULL',[h.id]);return h.id;
 }
 case 'record-lease':{
  const h=record(data.reservations,c.reservationId);if(h.status!=='active'||Date.parse(h.expiresAt)<=Date.now())throw new WorkspaceError('Giữ chỗ hết hạn hoặc đã kết thúc.');
  const id=crypto.randomUUID();await client.query("INSERT INTO leasing.leases(id,property_id,organization_id,reservation_id,space_version_id,reference_number,occupancy_period) SELECT $1::uuid,r.property_id,r.organization_id,r.id,rs.space_version_id,nullif($3,''),r.occupancy_period FROM leasing.reservations r JOIN leasing.request_spaces rs ON rs.id=r.request_space_id WHERE r.id=$2 AND r.property_id=$4",[id,h.id,c.referenceNumber??"",p]);
  await recordLeaseMetadata(client,identity,id,c.rentNote??"Hợp đồng gốc được lưu ngoài hệ thống");
  await client.query("UPDATE leasing.reservations SET status='converted',revision=revision+1 WHERE id=$1",[h.id]);await client.query('UPDATE leasing.slot_allocations SET reservation_id=NULL,lease_id=$2 WHERE reservation_id=$1 AND released_at IS NULL',[h.id,id]);await client.query("UPDATE leasing.leases SET status='executed',revision=revision+1 WHERE id=$1",[id]);await client.query("UPDATE leasing.slots s SET business_status='Đã ký',revision=revision+1 WHERE EXISTS(SELECT 1 FROM leasing.slot_allocations a WHERE a.property_id=s.property_id AND a.slot_id=s.id AND a.lease_id=$1 AND a.released_at IS NULL)",[id]);return id;
 }
 case 'save-appointment':{
  const v=c.values;record(data.companies,v.companyId);
  if(c.appointmentId){const appointment=record(data.appointments,c.appointmentId);if(appointment.status==='cancelled')throw new WorkspaceError('Không sửa lịch đã hủy.');return (await crud.appointments.update(crud.request,c.appointmentId,appointment.version,v)).id;}
  return (await crud.appointments.create(crud.request,v)).id;
 }
 case 'delete-appointment':{
  const appointment=record(data.appointments,c.appointmentId);await crud.appointments.delete(crud.request,c.appointmentId,appointment.version);return c.appointmentId;
 }
 case 'confirm-appointment':{
  const a=record(data.appointments,c.appointmentId);if(a.status!=='requested'||Date.parse(a.startsAt)<=Date.now())throw new WorkspaceError('Chỉ xác nhận lịch chờ trong tương lai.');await client.query("UPDATE leasing.appointments SET status='confirmed',revision=revision+1 WHERE id=$1",[a.id]);return a.id;
 }
 case 'cancel-appointment':{
  const a=record(data.appointments,c.appointmentId);if(a.status==='cancelled')throw new WorkspaceError('Lịch đã hủy.');await client.query("UPDATE leasing.appointments SET status='cancelled',revision=revision+1 WHERE id=$1",[a.id]);return a.id;
 }
 case 'delete-media':await deleteMedia(client,identity,c.mediaId);return c.mediaId;
 case 'rename-media':await renameMedia(client,identity,c.mediaId,c.name);return c.mediaId;
 case 'link-media':await linkMedia(client,identity,c.mediaId,c.scope);return c.mediaId;
 }
}
async function assertUncommitted(client:PoolClient,p:string,ids:string[]) {
 if((await client.query('SELECT 1 FROM leasing.slot_allocations WHERE property_id=$1 AND slot_id=ANY($2::uuid[]) AND released_at IS NULL',[p,ids])).rows.length)throw new WorkspaceError('Slot đang có cam kết.',409);
}
export async function executeCommand(identity:AdminIdentity,input:{command:unknown;expectedRevision:number;idempotencyKey:string},request?:Request):Promise<AdminMutationReceipt> {
 assertSessionActive(identity);
 if(!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0||typeof input.idempotencyKey!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(input.idempotencyKey))throw new WorkspaceError('Invalid revision or idempotency key');
 let command:AdminCommand;try{command=parseAdminCommand(input.command);}catch(error){throw new WorkspaceError(error instanceof Error?error.message:'Invalid command');}
 if(command.type==="update-slot"||command.type==="update-group")requireAdministrator(identity);
 if(command.type==="update-settings")requireAdministrator(identity);
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({command,expectedRevision:input.expectedRevision}))),hash=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
 return withAdminTransaction(identity,async client=>{
  const property=(await client.query('SELECT workspace_revision FROM leasing.properties WHERE id=$1 FOR UPDATE',[identity.propertyId])).rows[0];
  if(!property)throw new WorkspaceError("Property not found",404);
  const receipt=(await client.query('SELECT request_sha256,result_entity_id,result_revision FROM leasing.command_receipts WHERE property_id=$1 AND actor_user_id=$2 AND idempotency_key=$3',[identity.propertyId,identity.id,input.idempotencyKey])).rows[0];
  if(receipt){if(receipt.request_sha256!==hash)throw new WorkspaceError('Idempotency key reused with different command',409);return {revision:Number(receipt.result_revision),entityId:receipt.result_entity_id};}
  if(Number(property.workspace_revision)!==input.expectedRevision)throw new WorkspaceError('Workspace revision conflict',409);
  await expireHolds(client,identity.propertyId);
  const facts=await readCommandFacts(client,identity.propertyId,command),crud=createAdminCrudServices(identity,client,request);let entity:string;
  try{entity=await applyCommand(client,identity,command,facts,crud);}catch(error){if(error instanceof AdminValidationError)throw new WorkspaceError(error.message);rethrowCrudError(error);}
  assertSessionActive(identity);
  await client.query('UPDATE leasing.properties SET workspace_revision=workspace_revision+1 WHERE id=$1',[identity.propertyId]);
  await client.query('INSERT INTO leasing.command_receipts(property_id,actor_user_id,idempotency_key,request_sha256,command_code,result_entity_id,result_revision) VALUES($1,$2,$3,$4,$5,$6,$7)',[identity.propertyId,identity.id,input.idempotencyKey,hash,command.type,entity,input.expectedRevision+1]);
  await client.query("INSERT INTO leasing.audit_events(property_id,actor_user_id,action_code,entity_type,entity_id,metadata) VALUES($1,$2,$3,'workspace',$4,$5::jsonb)",[identity.propertyId,identity.id,command.type,entity,JSON.stringify({revision:input.expectedRevision+1})]);
  return {revision:input.expectedRevision+1,entityId:entity};
 });
}

