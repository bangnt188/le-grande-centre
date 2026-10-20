import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseAdminCommand } from "../src/shared/admin/parse-command";
import { mergeIssue } from "../src/shared/admin/space-model";
import { getDatabase, resolveAdminIdentity, withAdminTransaction, withTransaction, WorkspaceError, type AdminIdentity } from "../src/server/database";
import { executeCommand } from "../src/server/workspace";
import { readAdminScreen, parseScreenQuery } from "../src/server/admin-screens";
import { readMediaDetail, readMediaPage } from "../src/server/media/queries";
import { uploadMedia, reviewMedia, reconcileMedia } from "../src/server/media/repository";
import { prepareFiles } from "../src/server/media/prepare";
import { sha256 } from "../src/server/media/neon-origin";
import { AdminSessionError } from "../src/server/admin-session";
import { listStaffAccounts, revokeStaffAccount, saveStaffAccount } from "../src/server/staff-accounts";
import { submitContact } from "../src/server/public";
import { readPublicWebsiteData } from "../src/server/public-data";
import { createAdminCrudServices } from "../src/server/admin-crud";
import { BackendError } from "@shared/backend";
import type { AdminCommand } from "../src/shared/admin/contracts";
import { verifyOwnedLocalDatabase } from "../scripts/local-database-guard.mjs";
import { parseCollectionName, parseCollectionQuery, readAdminCollection, readAdminCollectionItem } from "../src/server/admin-collections";

// Test-only aggregation lets existing cross-screen invariant assertions share a fixture.
// Production has no aggregate endpoint or aggregate mutation response.
async function readWorkspace(identity: AdminIdentity) {
 const floors=await readAdminScreen(identity,"floors"),settings=await readAdminScreen(identity,"settings");
 const spaces=await Promise.all(([1,2,3,4,5,6] as const).map(floor=>readAdminScreen(identity,"spaces",{floor})));
 const requests=await readAdminScreen(identity,"requests",{pageSize:100}),leases=await readAdminScreen(identity,"leases",{pageSize:100});
 const companies=await readAdminCollection(identity,"companies",{}),leads=await readAdminCollection(identity,"leads",{}),appointments=await readAdminCollection(identity,"appointments",{});
 const media=await readMediaPage(identity,{pageSize:100});
 return {revision:floors.revision,floors:floors.floors,settings:settings.settings,slots:spaces.flatMap(item=>item.slots),groups:spaces.flatMap(item=>item.groups),requests:requests.requests,reservations:requests.reservations,leases:leases.leases,companies:companies.items,leads:leads.items,appointments:appointments.items,media:media.items,storage:media.storage,collections:{companies,leads,appointments}};
}
// Mutating regressions require the owned local PostgreSQL wrapper, never an arbitrary DATABASE_URL.
test("bounded commands reject extra fields, invalid types and fabricated adjacency", () => {
 const id=crypto.randomUUID();
 for(const value of [{type:'delete-media',mediaId:id,propertyId:id},{type:'update-slot',slotId:id,status:'Đang chọn',tenant:''},{type:'merge',floor:2,slotIds:[id,id],name:'x'},{type:'approve-request',requestId:id,holdHours:721,note:''},{type:'save-company',companyId:id,note:'x'.repeat(601)},{type:'save-request',values:null},{type:'constructor'}]) assert.throws(()=>parseAdminCommand(value));
 const a={id:'a',floor:1 as const,code:'A.1',order:1,side:null,area:190,width:10,status:'Còn trống' as const,tenant:''},b={...a,id:'b',code:'A.2',order:2};
 assert.notEqual(mergeIssue([a,b],[],['a','b'],1),null);
 assert.equal(mergeIssue([{...a,connectedSlotIds:['b']},{...b,connectedSlotIds:['a']}],[],['a','b'],1),null);
});

test("lead qualification commands require exclusive bounded company inputs", () => {
 const leadId=crypto.randomUUID(),companyId=crypto.randomUUID();
 const values={name:"Qualified company",industry:"",brand:"",contact:"",email:"",phone:"",owner:"",note:""};
 assert.deepEqual(parseAdminCommand({type:"link-lead-company",leadId,companyId}),{type:"link-lead-company",leadId,companyId});
 assert.equal(parseAdminCommand({type:"create-company-from-lead",leadId,values}).type,"create-company-from-lead");
 for(const command of [
  {type:"link-lead-company",leadId,companyId,values},
  {type:"link-lead-company",leadId,companyId,constructor:"unexpected"},
  {type:"link-lead-company",leadId,companyId:"not-a-uuid"},
  {type:"link-lead-company",companyId},
  {type:"create-company-from-lead",leadId,companyId,values},
  {type:"create-company-from-lead",leadId,values:{...values,name:NaN}},
  {type:"create-company-from-lead",leadId,values:{...values,industry:Infinity}},
  {type:"create-company-from-lead",leadId,values:{...values,name:"x".repeat(81)}},
  {type:"create-company-from-lead",leadId,values:{...values,status:"Đã xử lý"}},
 ])assert.throws(()=>parseAdminCommand(command));
});

test("collection input rejects unbounded, duplicate and unsupported filters", () => {
 assert.throws(()=>parseCollectionName("media"));
 for(const query of ["page=0","page=1&page=2","pageSize=101","page=9007199254740991&pageSize=100","query="+"x".repeat(201),"ids=not-a-uuid","companyId=not-a-uuid","status=unknown","unexpected=true"]){
  assert.throws(()=>parseCollectionQuery("leads",new URLSearchParams(query)));
 }
 assert.throws(()=>parseCollectionQuery("companies",new URLSearchParams("status=Mới")));
 assert.throws(()=>parseCollectionQuery("companies",new URLSearchParams("companyId="+crypto.randomUUID())));
 assert.deepEqual(parseCollectionQuery("companies",new URLSearchParams()),{page:1,pageSize:20});
 assert.deepEqual(parseCollectionQuery("companies",new URLSearchParams({status:"Đang thuê",includeSummary:"true"})),{page:1,pageSize:20,status:"Đang thuê",includeSummary:true});
 assert.throws(()=>parseCollectionQuery("companies",new URLSearchParams("includeSummary=false")));
 assert.throws(()=>parseCollectionQuery("appointments",new URLSearchParams("includeSummary=true")));
 const ids=[crypto.randomUUID(),crypto.randomUUID()];
 assert.deepEqual(parseCollectionQuery("companies",new URLSearchParams({ids:ids.join(",")})),{page:1,pageSize:2,ids});
});

test("screen boundaries reject unsupported dependencies and legacy document commands", () => {
 for(const query of ["page=0","pageSize=101","floor=7","id=invalid","status=unknown","page=1&page=2","query=%00"])assert.throws(()=>parseScreenQuery("requests",new URLSearchParams(query)));
 for(const query of ["page=1","companyId="+crypto.randomUUID(),"query=company"])assert.throws(()=>parseScreenQuery("floors",new URLSearchParams(query)));
 assert.throws(()=>parseScreenQuery("slot",new URLSearchParams()));
 assert.throws(()=>parseAdminCommand({type:"attach-lease-document",leaseId:crypto.randomUUID(),mediaId:crypto.randomUUID()}));
 assert.throws(()=>parseAdminCommand({type:"record-lease",reservationId:crypto.randomUUID(),mediaId:crypto.randomUUID()}));
 assert.equal(parseAdminCommand({type:"record-lease",reservationId:crypto.randomUUID()}).type,"record-lease");
 const reservationId=crypto.randomUUID();
 assert.deepEqual(parseScreenQuery("leases",new URLSearchParams({reservationId})),{reservationId});
 assert.throws(()=>parseScreenQuery("leases",new URLSearchParams({reservationId:"invalid"})));
 assert.throws(()=>parseScreenQuery("leases",new URLSearchParams(`reservationId=${reservationId}&reservationId=${reservationId}`)));
 assert.throws(()=>parseScreenQuery("requests",new URLSearchParams({reservationId})));
 for(const status of ["expired","cancelled"])assert.equal(parseScreenQuery("requests",new URLSearchParams({status})).status,status);
});

test("Local PostgreSQL relational commands: CAS, uncertain-response replay, scope, transitions and public intake", {skip:process.env.RUN_LOCAL_DATABASE_TESTS!=='1'}, async()=>{
 await verifyOwnedLocalDatabase();
 const readDecision=async(statement:string,values:string[])=>{
  const ownerPool=getDatabase();
  try{return (await ownerPool.query(statement,values)).rows[0];}finally{await ownerPool.end();}
 };
 const trusted=(value:AdminIdentity,authSubject:string):AdminIdentity=>({...value,verifiedSession:{issuer,subject:authSubject,expiresAt:Date.now()+3_600_000}});
 const email='workspace-regression-'+crypto.randomUUID()+'@example.test',issuer='https://owned-local-'+process.env.LOCAL_DATABASE_TEST_NONCE+'.invalid',subject=crypto.randomUUID();
 await withTransaction('test:setup',async client=>{const p=(await client.query("SELECT id FROM leasing.properties WHERE code='le-grande-centre'")).rows[0];assert.ok(p);await client.query('INSERT INTO leasing.admin_allowlist(property_id,email) VALUES($1,$2)',[p.id,email]);});
 assert.equal(await resolveAdminIdentity({issuer,subject,email,emailVerified:false}),null);
 const resolved=await resolveAdminIdentity({issuer,subject,email,emailVerified:true});assert.ok(resolved);const identity=trusted(resolved,subject);assert.equal(identity.verifiedSession?.subject,subject);assert.notEqual(identity.verifiedSession?.subject,identity.id);
 assert.equal(await resolveAdminIdentity({issuer,subject:crypto.randomUUID(),email,emailVerified:true}),null);
 const deniedPropertyId=crypto.randomUUID();
 await assert.rejects(readAdminScreen({...identity,propertyId:deniedPropertyId},"floors"),error=>error instanceof WorkspaceError&&error.status===404);
 const beforeDecisions=await readDecision("SELECT count(*)::text AS count FROM leasing.backend_access_decisions WHERE actor_user_id=$1",[identity.id]);
 let data=await readWorkspace(identity);
 const staffEmail='staff-invitation-'+crypto.randomUUID()+'@example.test',staffSubject=crypto.randomUUID();
 const invitation=await saveStaffAccount(identity,staffEmail,'editor');assert.equal(invitation.status,'invited');
 let editor=await resolveAdminIdentity({issuer,subject:staffSubject,email:staffEmail,emailVerified:true});
 assert.equal(editor?.role,'editor');assert.ok(editor);editor=trusted(editor,staffSubject);await readAdminScreen(editor,"floors");
 await assert.rejects(readAdminScreen(editor,"settings"),error=>error instanceof WorkspaceError&&error.status===403);
 await assert.rejects(saveStaffAccount(editor,crypto.randomUUID()+'@example.test','administrator'),error=>error instanceof WorkspaceError&&error.status===403);
 await assert.rejects(executeCommand(editor,{command:{type:'update-settings',values:data.settings},expectedRevision:data.revision,idempotencyKey:crypto.randomUUID()}),error=>error instanceof WorkspaceError&&error.status===403);
 assert.deepEqual(await readDecision("SELECT count(*)::text AS count FROM leasing.backend_access_decisions WHERE actor_user_id=$1",[identity.id]),beforeDecisions);
 const listed=await listStaffAccounts(identity);assert.ok(listed.some(account=>account.email===staffEmail&&account.role==='editor'&&account.status==='active'));
 await saveStaffAccount(identity,staffEmail,'administrator');
 editor=await resolveAdminIdentity({issuer,subject:staffSubject,email:staffEmail,emailVerified:true});assert.equal(editor?.role,'administrator');
 await revokeStaffAccount(identity,staffEmail);assert.equal(await resolveAdminIdentity({issuer,subject:staffSubject,email:staffEmail,emailVerified:true}),null);
 assert.ok((await listStaffAccounts(identity)).some(account=>account.email===staffEmail&&account.status==='revoked'));
 const rootEmail='root@legrandecentre.vn',rootIssuer=issuer,rootSubject=crypto.randomUUID();
 const resolvedRoot=await resolveAdminIdentity({issuer:rootIssuer,subject:rootSubject,email:rootEmail,emailVerified:true});
 assert.equal(resolvedRoot?.role,'root');assert.ok(resolvedRoot);const rootIdentity=trusted(resolvedRoot,rootSubject);
 assert.equal(await resolveAdminIdentity({issuer:rootIssuer,subject:crypto.randomUUID(),email:rootEmail,emailVerified:true}),null);
 const rootProjection=await readWorkspace(identity);
 assert.ok(!JSON.stringify(rootProjection).includes(rootEmail));
 assert.ok(!JSON.stringify(rootProjection).includes(rootIdentity.id));
 assert.ok(!(await listStaffAccounts(identity)).some(account=>account.email===rootEmail));
 await withTransaction('test:root-separation',async client=>{
  assert.equal(Number((await client.query('SELECT count(*) AS n FROM leasing.admin_allowlist WHERE lower(email)=lower($1) AND deleted_at IS NULL',[rootEmail])).rows[0].n),0);
  assert.equal(Number((await client.query('SELECT count(*) AS n FROM leasing.staff_assignments WHERE user_id=$1',[rootIdentity.id])).rows[0].n),0);
 });
 const rootData=await readWorkspace(rootIdentity);
 await executeCommand(rootIdentity,{command:{type:'update-floor',floor:1,purpose:rootData.floors[0].purpose,publicTitle:rootData.floors[0].publicTitle,publicDescription:rootData.floors[0].publicDescription},expectedRevision:rootData.revision,idempotencyKey:crypto.randomUUID()});
 data=await readWorkspace(identity);
 
 const logo = data.media.find(item => item.id === data.settings.website.logoMediaId);
 assert.ok(logo?.hasUploadedFile && logo.mimeType === "image/png" && logo.sizeBytes! > 0);
 assert.equal(logo.url, process.env.APPROVED_LOGO_URL);
 await assert.rejects(executeCommand(identity,{command:{type:"delete-media",mediaId:logo.id},expectedRevision:data.revision,idempotencyKey:crypto.randomUUID()}));
 await executeCommand(identity,{command:{type:'update-settings',values:data.settings},expectedRevision:data.revision,idempotencyKey:crypto.randomUUID()});data=await readWorkspace(identity);
 await executeCommand(identity,{command:{type:'update-floor',floor:1,purpose:data.floors[0].purpose,publicTitle:data.floors[0].publicTitle,publicDescription:data.floors[0].publicDescription},expectedRevision:data.revision,idempotencyKey:crypto.randomUUID()});data=await readWorkspace(identity);
 const run=async(command:AdminCommand)=>{const receipt=await executeCommand(identity,{command,expectedRevision:data.revision,idempotencyKey:crypto.randomUUID()});assert.deepEqual(Object.keys(receipt).sort(),["entityId","revision"]);data=await readWorkspace(identity);assert.equal(data.revision,receipt.revision);return data;};
 const command:AdminCommand={type:'upsert-company',values:{name:'Disposable regression company '+crypto.randomUUID(),industry:'Retail',brand:'',contact:'Reviewer',email:'',phone:'',owner:'',note:'',taxId:'',address:''}},key=crypto.randomUUID(),revision=data.revision;
 const created=await executeCommand(identity,{command,expectedRevision:revision,idempotencyKey:key});data=await readWorkspace(identity);
 const company=(await readAdminCollectionItem(identity,"companies",created.entityId)).item;assert.equal(company.name,command.values.name);assert.equal(company.version,1);
 const replay=await executeCommand(identity,{command,expectedRevision:revision,idempotencyKey:key});assert.deepEqual(replay,created);assert.deepEqual(Object.keys(replay).sort(),["entityId","revision"]);
 await assert.rejects(executeCommand(identity,{command:{type:'save-company',companyId:company.id,note:'different'},expectedRevision:revision,idempotencyKey:key}),error=>error instanceof WorkspaceError&&error.status===409);
 const raced=await Promise.allSettled(['first','second'].map(note=>executeCommand(identity,{command:{type:'save-company',companyId:company.id,note},expectedRevision:data.revision,idempotencyKey:crypto.randomUUID()})));
 assert.equal(raced.filter(r=>r.status==='fulfilled').length,1);assert.equal(raced.filter(r=>r.status==='rejected').length,1);data=await readWorkspace(identity);
 assert.equal(data.companies.find(c=>c.id===company.id)?.version,2);
 await assert.rejects(withTransaction(identity.id,async client=>{const crud=createAdminCrudServices(identity,client);await crud.companies.update(crud.request,company.id,1,{note:"stale version"});}),error=>error instanceof BackendError&&error.code==="CONFLICT");
 // Company logo links use owned ready image metadata, never a guessed upload ID.
 const companyLogoId=crypto.randomUUID(),companyLogoDocument=crypto.randomUUID();
 await withTransaction(identity.id,async client=>{
  await client.query("INSERT INTO leasing.documents(id,property_id,classification,title,media_scope) VALUES($1,$2,'public_media','Company logo fixture','Toàn dự án')",[companyLogoDocument,identity.propertyId]);
  await client.query(`INSERT INTO leasing.document_versions(id,property_id,document_id,version_number,storage_provider,bucket_name,object_key,content_type,byte_size,sha256,scan_state,original_filename,uploaded_by,public_url)
   SELECT $1,property_id,$2,1,storage_provider,bucket_name,$1::uuid::text,content_type,byte_size,sha256,scan_state,'company-logo.png',uploaded_by,public_url FROM leasing.document_versions WHERE id=$3`,[companyLogoId,companyLogoDocument,logo.id]);
  await client.query("INSERT INTO leasing.media_object_state(document_version_id,property_id,state) VALUES($1,$2,'ready')",[companyLogoId,identity.propertyId]);
  await client.query("UPDATE leasing.media_storage SET used_bytes=used_bytes+$2 WHERE property_id=$1",[identity.propertyId,logo.sizeBytes]);
 });
 await run({type:"upsert-company",companyId:company.id,values:{...command.values,logoMediaId:companyLogoId}});
 const withLogo=(await readAdminCollectionItem(identity,"companies",company.id)).item;
 assert.equal(withLogo.logoMediaId,companyLogoId);assert.equal(withLogo.logoUrl,process.env.APPROVED_LOGO_URL);
 assert.equal((await readMediaDetail(identity,companyLogoId)).item.canDelete,false);
 await assert.rejects(run({type:"delete-media",mediaId:companyLogoId}));
 await assert.rejects(run({type:"link-media",mediaId:companyLogoId,scope:"Tầng 1"}));
 await run({type:"save-company",companyId:company.id,note:"Logo survives a note edit"});
 assert.equal((await readAdminCollectionItem(identity,"companies",company.id)).item.logoMediaId,companyLogoId);
 await run({type:"upsert-company",companyId:company.id,values:{...command.values,logoMediaId:""}});
 assert.equal((await readAdminCollectionItem(identity,"companies",company.id)).item.logoMediaId,undefined);
 assert.equal((await readMediaDetail(identity,companyLogoId)).item.canDelete,true);
 await run({type:"upsert-company",companyId:company.id,values:{...command.values,logoMediaId:companyLogoId}});
 await assert.rejects(run({type:"upsert-company",companyId:company.id,values:{...command.values,logoMediaId:crypto.randomUUID()}}));
 const disposableName="Disposable deletable company "+crypto.randomUUID();
 data=await run({type:"upsert-company",values:{name:disposableName,industry:"",brand:"",contact:"",email:"",phone:"",owner:"",note:"",taxId:"",address:""}});
 const disposable=data.companies.find(row=>row.name===disposableName)!;assert.equal(disposable.version,1);
 data=await run({type:"delete-company",companyId:disposable.id});assert.ok(!data.companies.some(row=>row.id===disposable.id));
 await withTransaction(identity.id,async client=>{const row=(await client.query("SELECT revision,deleted_at FROM leasing.property_customers WHERE property_id=$1 AND organization_id=$2",[identity.propertyId,disposable.id])).rows[0];assert.equal(Number(row.revision),2);assert.ok(row.deleted_at);});
 const leadValues={name:"Disposable CRUD lead "+crypto.randomUUID(),interest:"Retail",floor:1 as const,source:"test",status:"Mới" as const,note:"",email:"test@example.test",phone:""};
 data=await run({type:"save-lead",values:leadValues});
 const lead=data.leads.find(row=>row.name===leadValues.name)!;assert.equal(lead.version,1);assert.equal(lead.referenceCode,"LGC-00001");
 data=await run({type:"save-lead",leadId:lead.id,values:{...leadValues,note:"updated"}});
 assert.equal(data.leads.find(row=>row.id===lead.id)?.version,2);
 data=await run({type:"delete-lead",leadId:lead.id});assert.ok(!data.leads.some(row=>row.id===lead.id));
 await withTransaction(identity.id,async client=>{const row=(await client.query("SELECT revision,deleted_at FROM leasing.leads WHERE property_id=$1 AND id=$2",[identity.propertyId,lead.id])).rows[0];assert.equal(Number(row.revision),3);assert.ok(row.deleted_at);});
 // Qualification changes only the company relationship, not source/customer details or status.
 await run({type:"save-lead",values:{...leadValues,name:"Qualification existing "+crypto.randomUUID(),note:"Keep original note",phone:"0973879563",status:"Đang tư vấn"}});
 const qualificationLead=data.leads.find(row=>row.name.startsWith("Qualification existing "))!;
 await withTransaction(identity.id,client=>client.query(`INSERT INTO leasing.contact_intake(property_id,idempotency_key,request_sha256,ip_hash,lead_id,intent,company_name,business,area_preference,timing,space_code)
  VALUES($1,$2,repeat('0',64),repeat('0',64),$3,'consultation','Original intake company','Retail','100','Soon','A.1')`,[identity.propertyId,crypto.randomUUID(),qualificationLead.id]));
 const originalLead=(await readAdminCollectionItem(identity,"leads",qualificationLead.id)).item;
 const linkInput={command:{type:"link-lead-company" as const,leadId:qualificationLead.id,companyId:company.id},expectedRevision:data.revision,idempotencyKey:crypto.randomUUID()};
 const linked=await executeCommand(identity,linkInput);assert.equal(linked.entityId,company.id);
 const linkedLead=(await readAdminCollectionItem(identity,"leads",qualificationLead.id)).item;
 assert.deepEqual(linkedLead,{...originalLead,companyId:company.id,version:originalLead.version+1});
 assert.deepEqual(await executeCommand(identity,linkInput),linked);
 data=await readWorkspace(identity);
 const linkedRevision=data.revision;
 await assert.rejects(run({type:"link-lead-company",leadId:qualificationLead.id,companyId:disposable.id}),error=>error instanceof WorkspaceError&&error.status===409);
 await assert.rejects(run({type:"link-lead-company",leadId:qualificationLead.id,companyId:company.id}),error=>error instanceof WorkspaceError&&error.status===409);
 const qualifiedName="Qualification created "+crypto.randomUUID(),qualificationValues={...command.values,name:qualifiedName};
 await assert.rejects(run({type:"create-company-from-lead",leadId:qualificationLead.id,values:qualificationValues}),error=>error instanceof WorkspaceError&&error.status===409);
 assert.equal((await readAdminCollection(identity,"companies",{query:qualifiedName})).totalItems,0);
 assert.equal((await readAdminScreen(identity,"floors")).revision,linkedRevision);
 await run({type:"save-lead",values:{...leadValues,name:"Qualification rollback "+crypto.randomUUID(),status:"Đang tư vấn"}});
 const creatingLead=data.leads.find(row=>row.name.startsWith("Qualification rollback "))!;
 const createInput={command:{type:"create-company-from-lead" as const,leadId:creatingLead.id,values:qualificationValues},expectedRevision:data.revision,idempotencyKey:crypto.randomUUID()};
 const qualificationSnapshotSql=`SELECT
  (SELECT count(*)::text FROM leasing.organizations) AS organizations,
  (SELECT count(*)::text FROM leasing.property_customers) AS customers,
  (SELECT count(*)::text FROM leasing.brands) AS brands,
  (SELECT count(*)::text FROM leasing.contacts) AS contacts,
  (SELECT count(*)::text FROM leasing.command_receipts WHERE property_id=$1) AS receipts,
  (SELECT count(*)::text FROM leasing.audit_events WHERE property_id=$1) AS audits,
  (SELECT workspace_revision::text FROM leasing.properties WHERE id=$1) AS revision`;
 const beforeQualification=await readDecision(qualificationSnapshotSql,[identity.propertyId]);
 // Inject a real database failure after the company INSERTs, at the atomic link UPDATE.
 const triggerName="qualification_rollback_"+crypto.randomUUID().replaceAll("-",""),triggerPool=getDatabase(),triggerClient=await triggerPool.connect();
 try{
  await triggerClient.query(`CREATE FUNCTION leasing.${triggerName}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='${creatingLead.id}'::uuid THEN RAISE EXCEPTION 'owned qualification rollback'; END IF; RETURN NEW; END; $$`);
  await triggerClient.query(`CREATE TRIGGER ${triggerName} BEFORE UPDATE OF organization_id ON leasing.leads FOR EACH ROW EXECUTE FUNCTION leasing.${triggerName}()`);
  await assert.rejects(executeCommand(identity,createInput),/owned qualification rollback/);
  assert.deepEqual(await readDecision(qualificationSnapshotSql,[identity.propertyId]),beforeQualification);
  assert.deepEqual((await readAdminCollectionItem(identity,"leads",creatingLead.id)).item,creatingLead);
 }finally{
  await triggerClient.query(`DROP TRIGGER IF EXISTS ${triggerName} ON leasing.leads`);
  await triggerClient.query(`DROP FUNCTION IF EXISTS leasing.${triggerName}()`);
  triggerClient.release();await triggerPool.end();
 }
 // The same key may safely retry after rollback; committed replay returns the original company.
 const qualified=await executeCommand(identity,createInput);
 assert.equal((await readAdminCollectionItem(identity,"companies",qualified.entityId)).item.name,qualifiedName);
 assert.deepEqual((await readAdminCollectionItem(identity,"leads",creatingLead.id)).item,{...creatingLead,companyId:qualified.entityId,version:creatingLead.version+1});
 assert.deepEqual(await executeCommand(identity,createInput),qualified);
 data=await readWorkspace(identity);
 assert.equal((await readAdminCollection(identity,"companies",{query:qualifiedName})).totalItems,1);
 await assert.rejects(run({type:"create-company-from-lead",leadId:creatingLead.id,values:qualificationValues}),error=>error instanceof WorkspaceError&&error.status===409);
 assert.equal((await readAdminCollection(identity,"companies",{query:qualifiedName})).totalItems,1);
 await withTransaction(identity.id,async client=>{
  assert.equal(Number((await client.query("SELECT count(*) AS count FROM leasing.command_receipts WHERE property_id=$1 AND actor_user_id=$2 AND idempotency_key=$3",[identity.propertyId,identity.id,createInput.idempotencyKey])).rows[0].count),1);
  assert.equal(Number((await client.query("SELECT count(*) AS count FROM leasing.leasing_requests WHERE property_id=$1 AND organization_id=$2",[identity.propertyId,qualified.entityId])).rows[0].count),0);
  assert.equal(Number((await client.query("SELECT count(*) AS count FROM leasing.reservations WHERE property_id=$1 AND organization_id=$2",[identity.propertyId,qualified.entityId])).rows[0].count),0);
 });
 const appointmentStart=new Date(Date.now()+2*60*60*1000).toISOString();
 const appointmentValues={companyId:company.id,purpose:"Tư vấn mặt bằng",startsAt:appointmentStart,location:"Le Grande Centre",durationMinutes:60};
 data=await run({type:"save-appointment",values:appointmentValues});
 const crudAppointment=data.appointments.find(row=>row.companyId===company.id&&row.startsAt===appointmentStart)!;assert.equal(crudAppointment.version,1);
 await assert.rejects(run({type:"save-appointment",values:{...appointmentValues,purpose:"Trùng lịch"}}),error=>error instanceof WorkspaceError&&error.status===409);
 const movedAppointment={...appointmentValues,startsAt:new Date(Date.now()+4*60*60*1000).toISOString()};
 data=await run({type:"save-appointment",appointmentId:crudAppointment.id,values:movedAppointment});
 assert.equal(data.appointments.find(row=>row.id===crudAppointment.id)?.version,2);
 data=await run({type:"delete-appointment",appointmentId:crudAppointment.id});assert.ok(!data.appointments.some(row=>row.id===crudAppointment.id));
 await withTransaction(identity.id,async client=>{const row=(await client.query("SELECT revision,deleted_at FROM leasing.appointments WHERE property_id=$1 AND id=$2",[identity.propertyId,crudAppointment.id])).rows[0];assert.equal(Number(row.revision),3);assert.ok(row.deleted_at);});
 const a=data.slots.find(s=>s.code==='A.1')!,b=data.slots.find(s=>s.code==='A.2')!,across=data.slots.find(s=>s.code==='A.6')!;
 assert.ok(a&&b&&across);assert.ok(a.connectedSlotIds?.includes(b.id));
 await assert.rejects(run({type:'merge',floor:1,slotIds:[a.id,across.id],name:'Across lobby'}));
 await run({type:'merge',floor:1,slotIds:[a.id,b.id],name:'Regression adjacent group'});const group=data.groups.find(g=>g.name==='Regression adjacent group')!;
 await run({type:'update-group',groupId:group.id,name:'Renamed adjacent group',status:'Đã thuê'});assert.equal(data.slots.find(s=>s.id===a.id)?.status,'Đã thuê');
 await run({type:'update-group',groupId:group.id,name:'Renamed adjacent group',status:'Còn trống'});await run({type:'split',groupId:group.id});
 const start=new Date(Date.now()+86400000).toISOString().slice(0,10),end=new Date(Date.now()+30*86400000).toISOString().slice(0,10);
 await run({type:'save-request',values:{companyId:company.id,floor:1,slotIds:[a.id],start,end,note:''}});let request=data.requests.find(q=>q.companyId===company.id&&q.slotIds.includes(a.id)&&q.status==='submitted')!;
 await run({type:'review-request',requestId:request.id});await assert.rejects(run({type:'review-request',requestId:request.id}));
 await run({type:'approve-request',requestId:request.id,holdHours:48,note:'Approved test'});const hold=data.reservations.find(h=>h.requestId===request.id)!;
 const heldCompanies=await readAdminCollection(identity,"companies",{ids:[company.id],status:"Đang giữ chỗ",pageSize:1});
 assert.equal(heldCompanies.totalItems,1);assert.equal(heldCompanies.items[0].category,"Đang giữ chỗ");
 assert.equal((await readAdminCollection(identity,"companies",{ids:[company.id],status:"Đang thuê"})).totalItems,0);
 assert.equal(data.slots.find(s=>s.id===a.id)?.status,'Còn trống');await assert.rejects(run({type:'update-slot',slotId:a.id,status:'Còn trống',tenant:''}));
 const documentsBefore=await readDecision("SELECT count(*)::text AS count FROM leasing.document_versions WHERE property_id=$1",[identity.propertyId]);
 await run({type:'record-lease',reservationId:hold.id,rentNote:"Bản gốc lưu ngoài hệ thống",referenceNumber:"REGRESSION-METADATA"});
 const lease=data.leases.find(l=>l.reservationId===hold.id)!;
 assert.ok(lease);assert.equal(lease.referenceNumber,"REGRESSION-METADATA");assert.equal(lease.rentNote,"Bản gốc lưu ngoài hệ thống");assert.ok(lease.recordedAt);assert.equal(lease.recordedBy,identity.id);
 assert.equal(data.reservations.find(h=>h.id===hold.id)?.status,'converted');assert.equal(data.slots.find(s=>s.id===a.id)?.status,'Đã thuê');assert.equal(lease.signedOn,undefined);assert.equal(lease.documentMediaId,null);
 assert.deepEqual(await readDecision("SELECT count(*)::text AS count FROM leasing.document_versions WHERE property_id=$1",[identity.propertyId]),documentsBefore);
 assert.equal((await readAdminScreen(identity,"leases",{id:lease.id})).leases[0]?.id,lease.id);
 assert.equal((await readAdminScreen(identity,"leases",{reservationId:hold.id,pageSize:1})).leases[0]?.id,lease.id);
 assert.equal((await readAdminScreen(identity,"leases",{reservationId:crypto.randomUUID()})).totalItems,0);
 assert.equal((await readAdminScreen(identity,"slot",{id:a.id})).leases[0]?.id,lease.id);
 // Exercise the upgrade with existing commitments, not only an empty database.
 // Rollback restores the original schema and fixtures for the remaining checks.
 const migrationPool=getDatabase(),migrationClient=await migrationPool.connect();
 try {
  await migrationClient.query("BEGIN");
  await migrationClient.query("SELECT set_config('app.actor_id','system:migration',true)");
  for(const table of ["leasing_requests","reservations","leases"])await migrationClient.query(`ALTER TABLE leasing.${table} DROP COLUMN reference_code`);
  await migrationClient.query("ALTER TABLE leasing.leases ALTER COLUMN reference_number SET NOT NULL");
  const migration=await readFile(new URL("../database/migrations/016-admin-reference-codes.sql",import.meta.url),"utf8");
  await migrationClient.query(migration.replace(/^BEGIN;\s*/,"").replace(/COMMIT;\s*$/,""));
  const upgraded=(await migrationClient.query(`SELECT q.reference_code AS request_code,r.reference_code AS hold_code,l.reference_code AS lease_code,l.reference_number,l.status,r.status AS hold_status
   FROM leasing.leasing_requests q JOIN leasing.reservations r ON r.request_id=q.id JOIN leasing.leases l ON l.reservation_id=r.id WHERE l.id=$1`,[lease.id])).rows[0];
  assert.match(upgraded.request_code,/^LGC-YC-\d{5}$/);
  assert.match(upgraded.hold_code,/^LGC-GC-\d{5}$/);
  assert.match(upgraded.lease_code,/^LGC-HD-\d{5}$/);
  assert.equal(upgraded.reference_number,"REGRESSION-METADATA");
  assert.equal(upgraded.status,"executed");
  assert.equal(upgraded.hold_status,"converted");
  assert.equal(Number((await migrationClient.query("SELECT count(*) AS count FROM leasing.slot_allocations WHERE lease_id=$1 AND released_at IS NULL",[lease.id])).rows[0].count),lease.slotIds.length);
 } finally {
  await migrationClient.query("ROLLBACK");migrationClient.release();await migrationPool.end();
 }
 const companySummary=(await readAdminCollectionItem(identity,"companies",company.id)).item;
 assert.equal(companySummary.category,"Đang thuê");assert.equal(companySummary.leaseCount,1);assert.equal(companySummary.requestCount,1);
 const rentedCompanies=await readAdminCollection(identity,"companies",{ids:[company.id],status:"Đang thuê",includeSummary:true,pageSize:1});
 assert.equal(rentedCompanies.totalItems,1);assert.equal(rentedCompanies.items[0].id,company.id);
 assert.ok(rentedCompanies.summary!.rentingCompanies>=1);
 assert.equal((await readAdminCollection(identity,"companies",{ids:[company.id],status:"Đang giữ chỗ"})).totalItems,0);
 assert.equal((await readAdminScreen(identity,"tenants",{companyId:company.id})).leases[0]?.id,lease.id);
 await assert.rejects(run({type:'cancel-hold',reservationId:hold.id,reason:'Already converted'}));
 await assert.rejects(run({type:'record-lease',reservationId:hold.id}));
 await assert.rejects(withTransaction(identity.id,client=>client.query("UPDATE leasing.slot_allocations SET occupancy_period=daterange($2::date+1,$3::date+1,'[)') WHERE lease_id=$1 AND released_at IS NULL",[lease.id,start,end])));
 await assert.rejects(withTransaction(identity.id,client=>client.query("UPDATE leasing.slot_allocations SET released_at=now() WHERE lease_id=$1 AND released_at IS NULL",[lease.id])));
 await assert.rejects(withTransaction(identity.id,client=>client.query("INSERT INTO leasing.leases(property_id,organization_id,space_version_id,reference_number,occupancy_period,status) SELECT property_id,organization_id,space_version_id,'INVALID-NO-METADATA',occupancy_period,'executed' FROM leasing.leases WHERE id=$1",[lease.id])));
 await assert.rejects(run({type:"save-request",values:{companyId:company.id,floor:1,slotIds:[a.id],start,end,note:"Overlapping occupied lease"}}));
 const manualSlot=data.slots.find(slot=>slot.code==="B.1")!;
 await run({type:"update-slot",slotId:manualSlot.id,status:"Đã thuê",tenant:"Manual occupant without document"});
 const manualTenants=await readAdminScreen(identity,"tenants",{query:"Manual occupant without document"});
 assert.equal(manualTenants.totalItems,1);assert.equal(manualTenants.slots[0]?.id,manualSlot.id);assert.equal(manualTenants.leases.length,0);
 await run({type:"update-slot",slotId:manualSlot.id,status:"Còn trống",tenant:""});
 const cancellationSlot=data.slots.find(s=>s.code==='C.1')!;
 await run({type:'save-request',values:{companyId:company.id,floor:3,slotIds:[cancellationSlot.id],start,end,note:'Cancellation test'}});const cancellingRequest=data.requests.find(q=>q.companyId===company.id&&q.note==='Cancellation test')!;
 await run({type:'approve-request',requestId:cancellingRequest.id,holdHours:48,note:''});const cancellingHold=data.reservations.find(h=>h.requestId===cancellingRequest.id)!;await run({type:'cancel-hold',reservationId:cancellingHold.id,reason:'Test cancellation'});
 const expiredSlot=data.slots.find(slot=>slot.code==="C.2")!;
 await run({type:"save-request",values:{companyId:company.id,floor:3,slotIds:[expiredSlot.id],start,end,note:"Expired hold test"}});
 const expiredRequest=data.requests.find(item=>item.note==="Expired hold test")!;
 await run({type:"approve-request",requestId:expiredRequest.id,holdHours:1,note:""});
 const expiredHold=data.reservations.find(item=>item.requestId===expiredRequest.id)!;
 await withTransaction(identity.id,client=>client.query("UPDATE leasing.reservations SET held_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' WHERE id=$1",[expiredHold.id]));
 await assert.rejects(run({type:"record-lease",reservationId:expiredHold.id}));

 await run({type:'save-request',values:{companyId:company.id,floor:1,slotIds:[b.id],start,end,note:''}});request=data.requests.find(q=>q.companyId===company.id&&q.slotIds.includes(b.id)&&q.status==='submitted')!;await run({type:'reject-request',requestId:request.id,reason:'Test rejection'});await assert.rejects(run({type:'approve-request',requestId:request.id,holdHours:48,note:''}));
 assert.equal(data.reservations.find(item=>item.id===expiredHold.id)?.status,"expired");
 assert.equal(data.reservations.find(item=>item.id===cancellingHold.id)?.status,"cancelled");
 for(const [status,expected,excluded] of [["expired",expiredHold,cancellingHold],["cancelled",cancellingHold,expiredHold]] as const){
  const filtered=await readAdminScreen(identity,"requests",{status,companyId:company.id,pageSize:100});
  assert.ok(filtered.reservations.some(item=>item.id===expected.id&&item.status===status));
  assert.ok(!filtered.reservations.some(item=>item.id===excluded.id));
 }
 assert.equal((await readAdminScreen(identity,"slot",{id:expiredSlot.id})).reservations.find(item=>item.id===expiredHold.id)?.status,"expired");
 await withTransaction(identity.id,async client=>{
  const rows=(await client.query("SELECT id,status FROM leasing.reservations WHERE id=ANY($1::uuid[])",[[expiredHold.id,cancellingHold.id]])).rows;
  assert.equal(rows.find(row=>row.id===expiredHold.id)?.status,"expired");
  assert.equal(rows.find(row=>row.id===cancellingHold.id)?.status,"cancelled");
 });
 const startsAt=new Date(Date.now()+7*86400000).toISOString();await run({type:'save-appointment',values:{companyId:company.id,purpose:'Visit',startsAt,location:'Le Grande Centre',durationMinutes:30}});const appointment=data.appointments.find(a=>a.companyId===company.id)!;
 await run({type:'confirm-appointment',appointmentId:appointment.id});await run({type:'cancel-appointment',appointmentId:appointment.id});await assert.rejects(run({type:'confirm-appointment',appointmentId:appointment.id}));
 const editable=data.slots.find(slot=>slot.code==="F.1")!;
 await run({type:"update-slot",slotId:editable.id,status:"Còn trống",tenant:"",area:editable.area+1});
 const a5=data.slots.find(slot=>slot.code==="A.5")!;
 await run({type:"update-slot",slotId:a5.id,status:"Đang thương lượng",tenant:""});
 const publicData=await readPublicWebsiteData();assert.ok(publicData.units.length===81);assert.deepEqual(publicData.tenants,[{id:company.id,name:company.name,logoUrl:process.env.APPROVED_LOGO_URL}]);assert.ok(publicData.tenants.every(tenant=>Object.keys(tenant).sort().join(",")==="id,logoUrl,name"));assert.ok(publicData.units.every(u=>!('tenant' in u)));assert.ok(publicData.floors.every(f=>!('purpose' in f)));
 assert.equal(publicData.units.find(unit=>unit.id===a.id)?.status,"Đã thuê");
 assert.equal(publicData.units.find(unit=>unit.id===b.id)?.status,"Còn trống");
 assert.equal(publicData.units.find(unit=>unit.id===a5.id)?.status,"Liên hệ");
 assert.equal((await readAdminScreen(identity,"floors")).slots.find(slot=>slot.id===a5.id)?.status,"Đang thương lượng");
 assert.equal(publicData.units.find(unit=>unit.id===editable.id)?.area,editable.area+1);
 assert.equal(publicData.logoUrl, logo.url);
 const input={intent:'callback' as const,name:'Public regression',company:'',phone:'0973879563',email:'',business:'',area:'',timing:'',space:a5.code,note:'',consent:true},intakeKey=crypto.randomUUID(),ipHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(crypto.randomUUID()))),b=>b.toString(16).padStart(2,'0')).join('');
 const accepted=await submitContact(input,{idempotencyKey:intakeKey,ipHash});const contactReplay=await submitContact(input,{idempotencyKey:intakeKey,ipHash});assert.equal(accepted.created,true);assert.equal(contactReplay.created,false);assert.equal(contactReplay.id,accepted.id);assert.equal(contactReplay.referenceCode,accepted.referenceCode);assert.match(accepted.referenceCode,/^LGC-\d{5}$/);await assert.rejects(submitContact(input,{idempotencyKey:crypto.randomUUID(),ipHash}),error=>error instanceof WorkspaceError&&error.status===429);assert.equal((await readAdminScreen(identity,"floors")).slots.find(slot=>slot.id===a5.id)?.status,"Đang thương lượng");
 const prefix="Boundary "+crypto.randomUUID();
 await withTransaction(identity.id,async client=>{
  await client.query(`WITH inserted AS (INSERT INTO leasing.organizations(legal_name,industry) SELECT $2||' company '||i,'Boundary industry' FROM generate_series(1,105)i RETURNING id) INSERT INTO leasing.property_customers(property_id,organization_id,revision) SELECT $1,id,1 FROM inserted`,[identity.propertyId,prefix]);
  await client.query(`WITH inserted AS (INSERT INTO leasing.leads(property_id,organization_id,name,interest,floor_number,source,status,note,email,phone,revision) SELECT $1,$2,$3||' lead '||i,'Boundary interest',1,'Boundary source','Mới','','boundary@example.test','',1 FROM generate_series(1,105)i RETURNING id)
   INSERT INTO leasing.contact_intake(property_id,idempotency_key,request_sha256,ip_hash,lead_id,intent,company_name,business,area_preference,timing,space_code)
   SELECT $1,gen_random_uuid()::text,repeat('0',64),repeat('0',64),id,'consultation',$3,'Retail','100','Soon','A.1' FROM inserted`,[identity.propertyId,company.id,prefix]);
  await client.query(`INSERT INTO leasing.appointments(property_id,organization_id,purpose,scheduled_period,meeting_location,revision) SELECT $1,$2,$3||' appointment '||i,tstzrange(now()+(365+i)*interval '1 day',now()+(365+i)*interval '1 day'+interval '30 minutes','[)'),'Boundary location',1 FROM generate_series(1,105)i`,[identity.propertyId,company.id,prefix]);
 });
 data=await readWorkspace(identity);
 for(const collection of ["companies","leads","appointments"] as const){
  assert.equal(data[collection].length,20);assert.ok(data.collections[collection].totalItems>100);assert.equal(data.collections[collection].pageSize,20);
  const first=await readAdminCollection(identity,collection,{query:prefix,pageSize:100});
  const second=await readAdminCollection(identity,collection,{query:prefix,page:2,pageSize:100});
  assert.equal(first.totalItems,105);assert.equal(first.items.length,100);assert.equal(second.items.length,5);assert.equal(second.totalPages,2);
  assert.ok(second.items.every(item=>!first.items.some(previous=>previous.id===item.id)));
  const outside=[...first.items,...second.items].find(item=>!data[collection].some(initial=>initial.id===item.id))!;
  assert.ok(outside);
  const detail=await readAdminCollectionItem(identity,collection,outside.id);assert.equal(detail.item.id,outside.id);
  const lookup=await readAdminCollection(identity,collection,{ids:[outside.id],pageSize:100});assert.equal(lookup.totalItems,1);assert.equal(lookup.items[0]?.id,outside.id);
  await assert.rejects(readAdminCollectionItem(identity,collection,crypto.randomUUID()),error=>error instanceof WorkspaceError&&error.status===404);
 }
 const selectedCompany=(await readAdminCollection(identity,"companies",{query:prefix,page:2,pageSize:100})).items[0]!;
 const unleased=await readAdminCollection(identity,"companies",{query:prefix,status:"Chưa thuê",includeSummary:true,pageSize:20,page:6});
 assert.equal(unleased.totalItems,105);assert.equal(unleased.items.length,5);assert.equal(unleased.totalPages,6);
 assert.ok(unleased.items.every(item=>item.category==="Chưa thuê"));
 assert.ok(unleased.summary!.totalCompanies>105);
 const noCompanies=await readAdminCollection(identity,"companies",{query:"no-company-"+crypto.randomUUID(),status:"Đang thuê",includeSummary:true});
 assert.equal(noCompanies.totalItems,0);assert.deepEqual(noCompanies.summary,unleased.summary);
 assert.equal((await readAdminCollection(identity,"companies",{query:prefix,status:"Đang thuê"})).totalItems,0);
 data=await run({type:"save-company",companyId:selectedCompany.id,note:"Outside initial page"});
 assert.equal((await readAdminCollectionItem(identity,"companies",selectedCompany.id)).item.note,"Outside initial page");
 const selectedLead=(await readAdminCollection(identity,"leads",{query:prefix,page:2,pageSize:100})).items[0]!;
 assert.equal(selectedLead.contactDetails?.company,prefix);
 const {id:leadId,referenceCode:_referenceCode,version:_leadVersion,initials:_leadInitials,time:_leadTime,contactDetails:_contactDetails,...selectedLeadInput}=selectedLead;
 await run({type:"save-lead",leadId,values:{...selectedLeadInput,note:"Outside lead page"}});
 assert.equal((await readAdminCollectionItem(identity,"leads",leadId)).item.note,"Outside lead page");
 const selectedAppointment=(await readAdminCollection(identity,"appointments",{query:prefix,page:2,pageSize:100})).items[0]!;
 await run({type:"confirm-appointment",appointmentId:selectedAppointment.id});
 assert.equal((await readAdminCollectionItem(identity,"appointments",selectedAppointment.id)).item.status,"confirmed");
 const scopedLeads=await readAdminCollection(identity,"leads",{companyId:company.id,status:"Mới",query:prefix,pageSize:20});
 assert.equal(scopedLeads.totalItems,105);assert.ok(scopedLeads.items.every(item=>item.companyId===company.id&&item.contactDetails?.company===prefix));
 const confirmed=await readAdminCollection(identity,"appointments",{companyId:company.id,status:"confirmed",query:prefix});
 assert.equal(confirmed.totalItems,1);assert.equal(confirmed.items[0]?.id,selectedAppointment.id);
 const mediaPrefix="Media boundary "+crypto.randomUUID(),mediaIds:string[]=[];
 await withTransaction(identity.id,async client=>{
  for(let i=0;i<60;i++){
   const doc=crypto.randomUUID(),id=crypto.randomUUID();mediaIds.push(id);
   await client.query("INSERT INTO leasing.documents(id,property_id,classification,title,media_scope) VALUES($1,$2,'business_private',$3,'Tầng 1')",[doc,identity.propertyId,mediaPrefix+" "+i]);
   await client.query("INSERT INTO leasing.document_versions(id,property_id,document_id,version_number,storage_provider,bucket_name,object_key,content_type,byte_size,sha256,original_filename,uploaded_by) VALUES($1::uuid,$2,$3,1,'r2','owned-metadata-fixture',$1::uuid::text,$4,5,$5,'fixture',$6)",[id,identity.propertyId,doc,i%2?"image/png":"application/pdf","0".repeat(64),identity.id]);
   await client.query("INSERT INTO leasing.media_object_state(document_version_id,property_id,state) VALUES($1,$2,$3)",[id,identity.propertyId,i%2?"ready":"quarantine"]);
  }
  await client.query("UPDATE leasing.media_storage SET used_bytes=used_bytes+300 WHERE property_id=$1",[identity.propertyId]);
 });
 for(const invalidLogo of [mediaIds[0],mediaIds[1]])await assert.rejects(run({type:"upsert-company",companyId:company.id,values:{...command.values,logoMediaId:invalidLogo}}));
 assert.equal((await readAdminCollectionItem(identity,"companies",company.id)).item.logoMediaId,companyLogoId);
 const uploadedPages=await Promise.all([1,2,3].map(page=>readMediaPage(identity,{source:"uploaded",query:mediaPrefix,page,pageSize:24})));
 assert.deepEqual(uploadedPages.map(page=>page.items.length),[24,24,12]);assert.ok(uploadedPages.every(page=>page.totalItems===60&&page.totalPages===3));
 const uploadedIds=uploadedPages.flatMap(page=>page.items.map(item=>item.id));assert.equal(new Set(uploadedIds).size,60);assert.deepEqual(new Set(uploadedIds),new Set(mediaIds));
 const imagePage=await readMediaPage(identity,{source:"uploaded",query:mediaPrefix,kind:"Ảnh",scope:"Tầng 1",pageSize:100});
 assert.equal(imagePage.totalItems,30);assert.ok(imagePage.items.every(item=>item.kind==="Ảnh"&&item.scope==="Tầng 1"));
 const uploads=await readMediaPage(identity,{source:"uploaded",pageSize:100}),projects=await readMediaPage(identity,{source:"project",pageSize:100});
 const crossingPage=Math.floor(uploads.totalItems/24)+1,crossingOffset=(crossingPage-1)*24;
 const crossing=await readMediaPage(identity,{page:crossingPage,pageSize:24});
 const expected=[...uploads.items.slice(crossingOffset),...projects.items].slice(0,24).map(item=>item.id);
 assert.deepEqual(crossing.items.map(item=>item.id),expected);assert.equal(crossing.totalItems,uploads.totalItems+projects.totalItems);
 const outsideMedia=uploadedPages[2].items[0]!;
 assert.equal((await readMediaDetail(identity,outsideMedia.id)).item.id,outsideMedia.id);
 await withTransaction(identity.id,client=>client.query("INSERT INTO leasing.document_retention(document_version_id,property_id,legal_hold,policy_reference,policy_updated_by) VALUES($1,$2,true,'Owned retention regression',$3)",[outsideMedia.id,identity.propertyId,identity.id]));
 const protectedMedia=(await readMediaDetail(identity,outsideMedia.id)).item;assert.equal(protectedMedia.canDelete,false);assert.ok(protectedMedia.protectedReason);
 await assert.rejects(executeCommand(identity,{command:{type:"delete-media",mediaId:outsideMedia.id},expectedRevision:data.revision,idempotencyKey:crypto.randomUUID()}));
 assert.equal((await readMediaDetail(identity,logo.id)).item.canDelete,false);
 assert.equal((await readMediaPage(identity,{source:"uploaded",page:999})).items.length,0);
 const otherProperty=await withTransaction(identity.id,async client=>(await client.query("INSERT INTO leasing.properties(code,name,owner_organization_id) SELECT $2,'Owned foreign property',owner_organization_id FROM leasing.properties WHERE id=$1 RETURNING id",[identity.propertyId,"foreign-"+crypto.randomUUID()])).rows[0].id as string);
 const foreignIdentity={...identity,propertyId:otherProperty};
 await assert.rejects(withAdminTransaction(foreignIdentity,async client=>{
  const crud=createAdminCrudServices(foreignIdentity,client);
  await crud.companies.create(crud.request,{...command.values,logoMediaId:companyLogoId});
 }));
 const foreignCompanies=await readAdminCollection(foreignIdentity,"companies",{includeSummary:true,status:"Đang thuê"});
 assert.equal(foreignCompanies.totalItems,0);
 assert.deepEqual(foreignCompanies.summary,{totalCompanies:0,rentingCompanies:0,withContracts:0});
 await assert.rejects(readAdminCollectionItem(foreignIdentity,"companies",company.id),error=>error instanceof WorkspaceError&&error.status===404);
 await assert.rejects(readMediaDetail(foreignIdentity,outsideMedia.id),error=>error instanceof WorkspaceError&&error.status===404);
 assert.equal((await readAdminScreen(foreignIdentity,"leases",{companyId:company.id})).leases.length,0);
 const foreignCompany=await withAdminTransaction(foreignIdentity,async client=>{
  const crud=createAdminCrudServices(foreignIdentity,client);
  return crud.companies.create(crud.request,{...command.values,name:"Foreign qualification company "+crypto.randomUUID()});
 });
 const foreignLead=await withAdminTransaction(foreignIdentity,async client=>{
  const crud=createAdminCrudServices(foreignIdentity,client);
  return crud.leads.create(crud.request,{...leadValues,name:"Foreign qualification lead "+crypto.randomUUID()});
 });
 await run({type:"save-lead",values:{...leadValues,name:"Cross-property qualification "+crypto.randomUUID()}});
 const scopedQualificationLead=data.leads.find(row=>row.name.startsWith("Cross-property qualification "))!;
 const scopeRevision=data.revision;
 await assert.rejects(run({type:"link-lead-company",leadId:scopedQualificationLead.id,companyId:foreignCompany.id}));
 await assert.rejects(run({type:"link-lead-company",leadId:foreignLead.id,companyId:company.id}));
 const rejectedName="Foreign rejected creation "+crypto.randomUUID();
 await assert.rejects(run({type:"create-company-from-lead",leadId:foreignLead.id,values:{...command.values,name:rejectedName}}));
 assert.equal((await readAdminCollection(identity,"companies",{query:rejectedName})).totalItems,0);
 assert.deepEqual((await readAdminCollectionItem(identity,"leads",scopedQualificationLead.id)).item,scopedQualificationLead);
 assert.deepEqual((await readAdminCollectionItem(foreignIdentity,"leads",foreignLead.id)).item,foreignLead);
 assert.equal((await readAdminScreen(identity,"floors")).revision,scopeRevision);
 assert.equal((await readAdminScreen(foreignIdentity,"leases",{reservationId:hold.id})).totalItems,0);
 // A durable finalized receipt is replayed verbatim even after newer workspace writes.
 const replayRevision=data.revision-1,reconcileKey=crypto.randomUUID(),reviewKey=crypto.randomUUID(),uploadKey=crypto.randomUUID(),batchId=crypto.randomUUID(),receiptMediaId=crypto.randomUUID(),receiptDoc=crypto.randomUUID(),reviewNote="External review already committed";
 const replayFile=new File(["%PDF-1.7\nowned replay proof\n%%EOF"],"owned-replay.pdf",{type:"application/pdf"}),[prepared]=await prepareFiles([replayFile]);
 const quotaDigest=await sha256(new TextEncoder().encode(JSON.stringify({action:"media.quota-reconcile",expectedRevision:replayRevision-1})));
 const reviewDigest=await sha256(new TextEncoder().encode(JSON.stringify({id:receiptMediaId,note:reviewNote,expectedRevision:replayRevision-1})));
 const uploadDigest=await sha256(new TextEncoder().encode(JSON.stringify({scope:"Toàn dự án",expectedRevision:replayRevision-1,files:[[prepared.name,prepared.mime,prepared.sha256,prepared.bytes.length]]})));
 await withTransaction(identity.id,async client=>{
  await client.query("INSERT INTO leasing.command_receipts(property_id,actor_user_id,idempotency_key,request_sha256,command_code,result_entity_id,result_revision) VALUES($1,$2,$3,$4,'media.quota-reconcile',$1,$5),($1,$2,$6,$7,'media.manual-review',$8,$5)",[identity.propertyId,identity.id,reconcileKey,quotaDigest,replayRevision,reviewKey,reviewDigest,receiptMediaId]);
  await client.query("INSERT INTO leasing.media_batches(id,property_id,actor_user_id,request_key,request_sha256,expected_revision,state,result_revision) VALUES($1,$2,$3,$4,$5,$6,'finalized',$7)",[batchId,identity.propertyId,identity.id,uploadKey,uploadDigest,replayRevision-1,replayRevision]);
  await client.query("INSERT INTO leasing.documents(id,property_id,classification,title,media_scope) VALUES($1,$2,'business_private','Owned replay metadata','Toàn dự án')",[receiptDoc,identity.propertyId]);
  await client.query("INSERT INTO leasing.document_versions(id,property_id,document_id,version_number,storage_provider,bucket_name,object_key,content_type,byte_size,sha256,original_filename,uploaded_by) VALUES($1::uuid,$2,$3,1,'r2','owned-metadata-fixture',$1::uuid::text,'application/pdf',$4,$5,'owned-replay.pdf',$6)",[receiptMediaId,identity.propertyId,receiptDoc,prepared.bytes.length,prepared.sha256,identity.id]);
  await client.query("UPDATE leasing.document_versions SET manual_reviewed_by=$2,manual_reviewed_at=now(),manual_review_note=$3,sealed_at=now() WHERE id=$1",[receiptMediaId,identity.id,reviewNote]);
  await client.query("INSERT INTO leasing.media_object_state(document_version_id,property_id,batch_id,state) VALUES($1,$2,$3,'ready')",[receiptMediaId,identity.propertyId,batchId]);
  await client.query("UPDATE leasing.media_storage SET used_bytes=used_bytes+$2 WHERE property_id=$1",[identity.propertyId,prepared.bytes.length]);
 });
 assert.deepEqual(await reconcileMedia(identity,replayRevision-1,reconcileKey),{revision:replayRevision,entityId:identity.propertyId});
 assert.deepEqual(await reviewMedia(identity,receiptMediaId,reviewNote,replayRevision-1,reviewKey),{revision:replayRevision,entityId:receiptMediaId});
 assert.deepEqual(await uploadMedia(identity,[replayFile],"Toàn dự án",replayRevision-1,uploadKey),{revision:replayRevision,mediaIds:[receiptMediaId]});
 await assert.rejects(reviewMedia(identity,receiptMediaId,"Different review details",replayRevision-1,reviewKey));
 const beforeRollback=await readDecision("SELECT contact_email FROM leasing.properties WHERE id=$1",[identity.propertyId]);
 const expiring={...identity,verifiedSession:{...identity.verifiedSession!,expiresAt:Date.now()+100}};
 await assert.rejects(withAdminTransaction(expiring,async client=>{await client.query("UPDATE leasing.properties SET contact_email='must-rollback@example.test' WHERE id=$1",[identity.propertyId]);await client.query("SELECT pg_sleep(0.15)");}),AdminSessionError);
 assert.deepEqual(await readDecision("SELECT contact_email FROM leasing.properties WHERE id=$1",[identity.propertyId]),beforeRollback);
 await withTransaction('test:assertions',async client=>{const receipts=(await client.query('SELECT count(*) AS count FROM leasing.command_receipts WHERE actor_user_id=$1 AND idempotency_key=$2',[identity.id,key])).rows[0];assert.equal(Number(receipts.count),1);const actor=(await client.query('SELECT current_user AS role')).rows[0];assert.equal(actor.role,'leasing_runtime');await client.query('UPDATE leasing.users SET disabled_at=now() WHERE id=$1',[identity.id]);});
 assert.equal(await resolveAdminIdentity({issuer,subject,email,emailVerified:true}),null);
 // Signed snapshots intentionally survive remote revoke until their fixed expiry.
 await readAdminScreen(identity,"floors");
 const expired={...identity,verifiedSession:{...identity.verifiedSession!,expiresAt:Date.now()-1}};
 await assert.rejects(readAdminScreen(expired,"floors"),error=>error instanceof AdminSessionError&&error.code==="SESSION_EXPIRED");
 await assert.rejects(executeCommand(expired,{command:{type:"delete-company",companyId:company.id},expectedRevision:data.revision,idempotencyKey:crypto.randomUUID()}),error=>error instanceof AdminSessionError);
 await withTransaction('test:revoke-root',async client=>{await client.query('UPDATE leasing.root_allowlist SET revoked_at=now() WHERE lower(email)=lower($1)',[rootEmail]);});
 await readAdminScreen(rootIdentity,"floors");
 assert.equal(await resolveAdminIdentity({issuer:rootIssuer,subject:rootSubject,email:rootEmail,emailVerified:true}),null);
 assert.deepEqual(await readDecision("SELECT count(*)::text AS count FROM leasing.backend_access_decisions WHERE actor_user_id=$1",[identity.id]),beforeDecisions);
});
