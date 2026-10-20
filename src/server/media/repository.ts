import "server-only";
import { types } from "@neondatabase/serverless";
import type { AdminIdentity, PoolClient } from "../database";
import { withAdminTransaction, WorkspaceError } from "../database";
import { assertSessionActive } from "../admin-session";
import type { AdminUploadReceipt, MediaItem } from "../../shared/admin/contracts";
import { formatStorageBytes, STORAGE_LIMIT_BYTES } from "../../shared/admin/storage-policy";
import { deleteObject, getObject, inventoryPage, mediaLocation, putObject } from "./storage";
import { publicNeonUrl, sha256 } from "./neon-origin";
import type { MediaLocation } from "./storage";
import { prepareFiles } from "./prepare";
import { MediaError, byteRange, mediaHeaders } from "./validation";

export type StoredMedia = MediaLocation & { id:string;document_id:string;title:string;content_type:string;byte_size:string;sha256:string;state:string;media_scope:string;scan_state:string;sealed_at:string|null;public_url:string|null;manual_reviewed_by:string|null;manual_reviewed_at:string|null };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export const storageUsageSql = "SELECT used_bytes::text,reserved_bytes::text,external_bytes::text FROM leasing.media_storage WHERE property_id=$1";
export type StorageUsageRow = {used_bytes:string;reserved_bytes:string;external_bytes:string|null};
export function decodeStorageUsage(row:StorageUsageRow|undefined|null) {
  if(!row)return null;
  return {usedBytes:Number(row.used_bytes)+Number(row.external_bytes??0),reservedBytes:Number(row.reserved_bytes)};
}
export async function readStorageUsage(client:PoolClient,propertyId:string) {
  return decodeStorageUsage((await client.query<StorageUsageRow>(storageUsageSql,[propertyId])).rows[0]);
}
export type MediaSnapshotRow = Pick<StoredMedia,"id"|"title"|"content_type"|"media_scope"|"byte_size"|"state"|"public_url"|"manual_reviewed_at">;
export function decodeMediaRows(rows:readonly MediaSnapshotRow[],jsonDates=false):MediaItem[] {
  // JSON aggregation bypasses the driver's timestamptz parser; restore its existing Date semantics.
  const parseTimestamp=jsonDates?types.getTypeParser(types.builtins.TIMESTAMPTZ,"text"):undefined;
  const parseReviewedAt=parseTimestamp?(value:string)=>parseTimestamp(value.replace("T"," ")):undefined;
  const uploads:MediaItem[] = rows.map(row=>({id:row.id,name:row.title,kind:row.content_type.startsWith('image/')?'Ảnh':row.content_type.startsWith('video/')?'Video':'Tài liệu',scope:row.media_scope,size:formatStorageBytes(Number(row.byte_size)),sizeBytes:Number(row.byte_size),mimeType:row.content_type,hasUploadedFile:row.state==='ready',url:row.state==='ready'?(row.public_url??`/api/admin/media/${row.id}/view`):undefined,uploadState:row.state==='ready'?'ready':'quarantine',reviewUrl:row.state==='quarantine'?`/api/admin/media/${row.id}/view?review=1`:undefined,reviewedAt:row.manual_reviewed_at==null?undefined:parseReviewedAt?parseReviewedAt(row.manual_reviewed_at):row.manual_reviewed_at}));
  return uploads;
}
async function ownedMedia(client:PoolClient,identity:AdminIdentity,id:string) {
  if (!uuid.test(id)) throw new MediaError("Tài nguyên dự án chỉ được xem, không sửa hoặc xóa.",400);
  const {rows} = await client.query<StoredMedia>(`SELECT v.*,d.title,d.media_scope,s.state FROM leasing.document_versions v JOIN leasing.documents d ON d.id=v.document_id JOIN leasing.media_object_state s ON s.document_version_id=v.id WHERE v.property_id=$1 AND v.id=$2 AND s.state IN ('ready','quarantine') FOR UPDATE OF d,s`,[identity.propertyId,id]);
  if (!rows[0]) throw new MediaError("Không tìm thấy tệp thuộc dự án.",404);
  return rows[0];
}
async function assertUnlinked(client:PoolClient,identity:AdminIdentity,row:StoredMedia) {
  const {rows} = await client.query(`SELECT 1 WHERE EXISTS(SELECT 1 FROM leasing.lease_documents WHERE property_id=$1 AND document_version_id=$2) OR EXISTS(SELECT 1 FROM leasing.plan_documents WHERE property_id=$1 AND document_version_id=$2) OR EXISTS(SELECT 1 FROM leasing.document_retention WHERE property_id=$1 AND document_version_id=$2 AND (legal_hold OR retention_until>now()))`,[identity.propertyId,row.id]);
  if (rows.length) throw new MediaError("Tệp đang được lưu trong hồ sơ/hợp đồng hoặc chính sách lưu giữ; không xóa hoặc đổi liên kết.");
  if ((await client.query("SELECT 1 FROM leasing.property_customers WHERE property_id=$1 AND logo_media_id=$2 AND deleted_at IS NULL",[identity.propertyId,row.id])).rows.length) throw new MediaError("Gỡ hoặc thay logo doanh nghiệp trước khi xóa hay đổi liên kết tệp.");
}
async function validScope(client:PoolClient,propertyId:string,scope:string) {
  if (['Toàn dự án','Chưa xác nhận tầng'].includes(scope)||/^Tầng [1-6]$/.test(scope)) return;
  const match = /^(slot|group):([a-f0-9-]{36})$/i.exec(scope);
  if (!match) throw new MediaError("Liên kết media không hợp lệ.");
  const table = match[1]==='slot'?'slots':'spaces';
  const {rows} = await client.query(`SELECT id FROM leasing.${table} WHERE property_id=$1 AND id=$2 AND retired_at IS NULL${table==='spaces'?' AND is_admin_group':''}`,[propertyId,match[2]]);
  if (!rows.length) throw new MediaError("Mặt bằng liên kết không tồn tại.");
}
export async function renameMedia(client:PoolClient,identity:AdminIdentity,id:string,name:string) {
  assertSessionActive(identity);const row=await ownedMedia(client,identity,id);
  if(typeof name!=='string'||!name.trim()||name.length>160||/[\x00-\x1f\x7f]/.test(name))throw new MediaError("Tên tệp không hợp lệ.");
  await client.query('UPDATE leasing.documents SET title=$1 WHERE id=$2 AND property_id=$3',[name.trim(),row.document_id,identity.propertyId]);
}
export async function linkMedia(client:PoolClient,identity:AdminIdentity,id:string,scope:string) {
  assertSessionActive(identity);const row=await ownedMedia(client,identity,id);await assertUnlinked(client,identity,row);
  if(row.state!=='ready')throw new MediaError("Duyệt tệp cách ly trước khi gắn liên kết.");
  await validScope(client,identity.propertyId,scope);
  await client.query('UPDATE leasing.documents SET media_scope=$1 WHERE id=$2 AND property_id=$3',[scope,row.document_id,identity.propertyId]);
}
export async function deleteMedia(client:PoolClient,identity:AdminIdentity,id:string) {
  assertSessionActive(identity);const row=await ownedMedia(client,identity,id);await assertUnlinked(client,identity,row);
  if((await client.query('SELECT 1 FROM leasing.website_settings WHERE property_id=$1 AND logo_media_id=$2',[identity.propertyId,id])).rows.length)throw new MediaError("Chọn và lưu logo khác trước khi xóa logo hiện tại.");
  await client.query("UPDATE leasing.media_object_state SET state='deleting' WHERE document_version_id=$1",[id]);
  // ponytail: low-volume uploads serialize per property; a durable outbox replaces in-lock provider calls if throughput demands it.
  await deleteObject(row);
  await client.query("UPDATE leasing.media_object_state SET state='deleted',deleted_at=now() WHERE document_version_id=$1",[id]);
  await client.query('UPDATE leasing.media_storage SET used_bytes=used_bytes-$2 WHERE property_id=$1',[identity.propertyId,row.byte_size]);
}
async function lockProperty(client:PoolClient,identity:AdminIdentity) {
  assertSessionActive(identity);
  const {rows}=await client.query<{workspace_revision:string}>('SELECT workspace_revision FROM leasing.properties WHERE id=$1 FOR UPDATE',[identity.propertyId]);
  if(!rows.length)throw new MediaError("Dự án chưa được khởi tạo.",503);
  return Number(rows[0].workspace_revision);
}
async function cleanupBatch(identity:AdminIdentity,batchId:string) {
  await withAdminTransaction(identity,async client=>{
    await lockProperty(client,identity);
    const batch=await client.query("SELECT state FROM leasing.media_batches WHERE id=$1 AND property_id=$2 FOR UPDATE",[batchId,identity.propertyId]);
    if(batch.rows[0]?.state!=='reserved')return;
    const {rows}=await client.query<StoredMedia>(`SELECT v.*,s.state FROM leasing.document_versions v JOIN leasing.media_object_state s ON s.document_version_id=v.id WHERE s.batch_id=$1 AND s.state='reserved'`,[batchId]);
    for(const row of rows)await deleteObject(row);
    const bytes=rows.reduce((sum,row)=>sum+Number(row.byte_size),0);
    await client.query("UPDATE leasing.media_object_state SET state='deleted',deleted_at=now() WHERE batch_id=$1 AND state='reserved'",[batchId]);
    await client.query('UPDATE leasing.media_storage SET reserved_bytes=reserved_bytes-$2 WHERE property_id=$1',[identity.propertyId,bytes]);
    await client.query("UPDATE leasing.media_batches SET state='failed' WHERE id=$1",[batchId]);
  });
}
export async function cleanupExpiredMedia(identity:AdminIdentity) {
  const ids=await withAdminTransaction(identity,async client=>(await client.query<{id:string}>("SELECT id FROM leasing.media_batches WHERE property_id=$1 AND state='reserved' AND created_at<now()-interval '15 minutes' ORDER BY created_at LIMIT 20",[identity.propertyId])).rows);
  for(const row of ids)await cleanupBatch(identity,row.id);
}
async function reconcileStorage(client:PoolClient,identity:AdminIdentity) {
  await client.query('INSERT INTO leasing.media_storage(property_id) VALUES($1) ON CONFLICT DO NOTHING',[identity.propertyId]);
  const summary=(await client.query<{private_count:string;private_bytes:string;used_bytes:string;reserved_bytes:string}>(`SELECT count(*) FILTER(WHERE v.storage_provider='r2')::text AS private_count,coalesce(sum(v.byte_size) FILTER(WHERE v.storage_provider='r2'),0)::text AS private_bytes,coalesce(sum(v.byte_size) FILTER(WHERE s.state IN ('ready','quarantine')),0)::text AS used_bytes,coalesce(sum(v.byte_size) FILTER(WHERE s.state='reserved'),0)::text AS reserved_bytes FROM leasing.document_versions v JOIN leasing.media_object_state s ON s.document_version_id=v.id WHERE v.property_id=$1 AND s.state IN ('ready','quarantine','reserved')`,[identity.propertyId])).rows[0];
  const ledger=(await client.query<{used_bytes:string;reserved_bytes:string}>('SELECT used_bytes,reserved_bytes FROM leasing.media_storage WHERE property_id=$1 FOR UPDATE',[identity.propertyId])).rows[0];
  let publicBytes=0,privateBytes=0,privateCount=0,matchedCount=0,valid=true,reason='verified';
  try {
    for(const scope of ['public','private'] as const){
      let cursor:string|undefined;
      do {
        const page=await inventoryPage(scope,cursor);
        let pageBytes=0;
        for(const object of page.objects)pageBytes+=object.size;
        if(scope==='public')publicBytes+=pageBytes;
        else {
          privateBytes+=pageBytes;privateCount+=page.objects.length;
          if(page.objects.length){
            const tracked=await client.query<{object_key:string;byte_size:string}>(`SELECT v.object_key,v.byte_size FROM leasing.document_versions v JOIN leasing.media_object_state s ON s.document_version_id=v.id WHERE v.property_id=$1 AND v.storage_provider='r2' AND s.state IN ('ready','quarantine','reserved') AND v.object_key=ANY($2::text[])`,[identity.propertyId,page.objects.map(object=>object.key)]);
            const expected=new Map(tracked.rows.map(row=>[row.object_key,Number(row.byte_size)]));
            for(const object of page.objects)if(expected.get(object.key)===object.size)matchedCount++;else valid=false;
          }
        }
        if(!Number.isSafeInteger(publicBytes+privateBytes))throw new MediaError("Dung lượng kiểm kê không hợp lệ.",503);
        cursor=page.truncated?page.cursor:undefined;
      }while(cursor);
    }
  } catch { valid=false;reason='provider-unavailable'; }
  if(privateCount!==Number(summary.private_count)||matchedCount!==privateCount||privateBytes!==Number(summary.private_bytes)||Number(ledger.used_bytes)!==Number(summary.used_bytes)||Number(ledger.reserved_bytes)!==Number(summary.reserved_bytes)){valid=false;reason='inventory-ledger-mismatch';}
  if(publicBytes+Number(ledger.used_bytes)+Number(ledger.reserved_bytes)>STORAGE_LIMIT_BYTES){valid=false;reason='account-quota-exceeded';}
  await client.query('UPDATE leasing.media_storage SET external_bytes=$2,external_reconciled_at=$3 WHERE property_id=$1',[identity.propertyId,valid?publicBytes:null,valid?new Date():null]);
  await client.query("INSERT INTO leasing.audit_events(property_id,actor_user_id,action_code,entity_type,entity_id,metadata) VALUES($1,$2,'media.quota-reconcile','property',$1,$3)",[identity.propertyId,identity.id,JSON.stringify({valid,reason,publicBytes,privateBytes,privateCount,matchedCount})]);
  return valid;
}
export async function reconcileMedia(identity:AdminIdentity,expectedRevision:number,requestKey:string,request?:Request) {
  if(!uuid.test(requestKey))throw new MediaError("Thiếu khóa idempotency hợp lệ.");
  const digest=await sha256(new TextEncoder().encode(JSON.stringify({action:'media.quota-reconcile',expectedRevision})));
  return withAdminTransaction(identity,async client=>{
    const revision=await lockProperty(client,identity);
    const prior=await client.query('SELECT request_sha256,result_revision,result_entity_id FROM leasing.command_receipts WHERE property_id=$1 AND actor_user_id=$2 AND idempotency_key=$3',[identity.propertyId,identity.id,requestKey]);
    if(prior.rows.length){if(prior.rows[0].request_sha256!==digest)throw new MediaError("Khóa idempotency đã được dùng.",409);return {revision:Number(prior.rows[0].result_revision),entityId:prior.rows[0].result_entity_id as string};}
    if(revision!==expectedRevision)throw new WorkspaceError("Dữ liệu đã thay đổi. Tải lại trước khi đối soát.",409);
    await reconcileStorage(client,identity);
    await client.query('UPDATE leasing.properties SET workspace_revision=workspace_revision+1 WHERE id=$1',[identity.propertyId]);
    await client.query("INSERT INTO leasing.command_receipts(property_id,actor_user_id,idempotency_key,request_sha256,command_code,result_entity_id,result_revision) VALUES($1,$2,$3,$4,'media.quota-reconcile',$1,$5)",[identity.propertyId,identity.id,requestKey,digest,revision+1]);
    return {revision:revision+1,entityId:identity.propertyId};
  });
}
async function uploadReceipt(client:PoolClient,identity:AdminIdentity,batchId:string):Promise<AdminUploadReceipt> {
  const row=(await client.query<{result_revision:string;media_ids:string[]}>(`SELECT b.result_revision::text,array_agg(s.document_version_id ORDER BY s.document_version_id) AS media_ids FROM leasing.media_batches b JOIN leasing.media_object_state s ON s.batch_id=b.id AND s.property_id=b.property_id WHERE b.id=$1 AND b.property_id=$2 AND b.actor_user_id=$3 AND b.state='finalized' GROUP BY b.id`,[batchId,identity.propertyId,identity.id])).rows[0];
  if(!row)throw new MediaError("Không tìm thấy biên nhận tải lên.",409);
  return {revision:Number(row.result_revision),mediaIds:row.media_ids};
}
export async function uploadMedia(identity:AdminIdentity,files:File[],scope:string,expectedRevision:number,requestKey:string,request?:Request):Promise<AdminUploadReceipt> {
  assertSessionActive(identity);
  if(!uuid.test(requestKey))throw new MediaError("Thiếu khóa idempotency hợp lệ.");
  const prepared=await prepareFiles(files);
  const requestHash=await sha256(new TextEncoder().encode(JSON.stringify({scope,expectedRevision,files:prepared.map(file=>[file.name,file.mime,file.sha256,file.bytes.length])})));
  await cleanupExpiredMedia(identity);
  const checked=await withAdminTransaction(identity,async client=>{
    const revision=await lockProperty(client,identity);
    const prior=(await client.query<{id:string;state:string;request_sha256:string}>('SELECT id,state,request_sha256 FROM leasing.media_batches WHERE property_id=$1 AND actor_user_id=$2 AND request_key=$3',[identity.propertyId,identity.id,requestKey])).rows[0];
    if(prior){
      if(prior.request_sha256!==requestHash)throw new MediaError("Khóa idempotency đã dùng cho nội dung khác.",409);
      if(prior.state==='finalized')return {receipt:await uploadReceipt(client,identity,prior.id),verified:true};
      throw new MediaError("Lần tải này đang xử lý hoặc đã hủy. Tải lại dữ liệu trước khi thử tiếp.",409);
    }
    if(revision!==expectedRevision)throw new WorkspaceError("Dữ liệu đã thay đổi. Tải lại trước khi tải lên.",409);
    return {receipt:null,verified:await reconcileStorage(client,identity)};
  });
  if(checked.receipt)return checked.receipt;
  if(!checked.verified)throw new MediaError("Không xác nhận được toàn bộ dung lượng R2 hoặc số liệu khác ledger. Upload đã khóa; hãy đối soát và xử lý sai lệch.",503);
  const bytes=prepared.reduce((sum,file)=>sum+file.bytes.length,0);
  const reservation=await withAdminTransaction(identity,async client=>{
    const revision=await lockProperty(client,identity);
    const receipt=await client.query<{id:string;state:string;request_sha256:string}>('SELECT id,state,request_sha256 FROM leasing.media_batches WHERE property_id=$1 AND actor_user_id=$2 AND request_key=$3',[identity.propertyId,identity.id,requestKey]);
    if(receipt.rows.length){const prior=receipt.rows[0];if(prior.request_sha256!==requestHash)throw new MediaError("Khóa idempotency đã dùng cho nội dung khác.",409);if(prior.state==='finalized')return {done:true as const,id:prior.id,objects:[]};throw new MediaError("Lần tải này đang xử lý hoặc đã hủy. Tải lại dữ liệu trước khi thử tiếp.",409);}
    if(revision!==expectedRevision)throw new WorkspaceError("Dữ liệu đã thay đổi. Tải lại trước khi lưu.",409);
    await validScope(client,identity.propertyId,scope);
    await client.query('INSERT INTO leasing.media_storage(property_id) VALUES($1) ON CONFLICT DO NOTHING',[identity.propertyId]);
    const usage=await readStorageUsage(client,identity.propertyId);
    if(!usage)throw new MediaError("Chưa đối soát dung lượng R2 công khai. Quản trị viên cần cập nhật kiểm kê trước khi tải thêm.",503);
    const reserved=await client.query('UPDATE leasing.media_storage SET reserved_bytes=reserved_bytes+$2 WHERE property_id=$1 AND used_bytes+reserved_bytes+coalesce(external_bytes,0)+$2<=$3 RETURNING property_id',[identity.propertyId,bytes,STORAGE_LIMIT_BYTES]);
    if(!reserved.rows.length)throw new MediaError("Các tệp vượt giới hạn tài khoản 8,5 GB.",413);
    const batch=await client.query<{id:string}>("INSERT INTO leasing.media_batches(property_id,actor_user_id,request_key,request_sha256,expected_revision,state) VALUES($1,$2,$3,$4,$5,'reserved') RETURNING id",[identity.propertyId,identity.id,requestKey,requestHash,expectedRevision]);
    const objects:{id:string;location:MediaLocation}[]=[];
    for(const file of prepared){
      const document=await client.query<{id:string}>('INSERT INTO leasing.documents(property_id,classification,title,media_scope) VALUES($1,$2,$3,$4) RETURNING id',[identity.propertyId,file.provider==='neon'?'public_media':'business_private',file.name,scope]);
      const id=crypto.randomUUID(),location=mediaLocation(file.provider,`${file.provider==='neon'?'branding':'documents'}/${identity.propertyId}/${id}`);
      await client.query(`INSERT INTO leasing.document_versions(id,property_id,document_id,version_number,storage_provider,bucket_name,object_key,content_type,byte_size,sha256,scan_state,original_filename,uploaded_by,public_url) VALUES($1,$2,$3,1,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,[id,identity.propertyId,document.rows[0].id,location.storage_provider,location.bucket_name,location.object_key,file.mime,file.bytes.length,file.sha256,file.scan,file.name,identity.id,file.provider==='neon'?publicNeonUrl(location.object_key):null]);
      await client.query("INSERT INTO leasing.media_object_state(document_version_id,property_id,batch_id,state) VALUES($1,$2,$3,'reserved')",[id,identity.propertyId,batch.rows[0].id]);
      objects.push({id,location});
    }
    return {done:false as const,id:batch.rows[0].id,objects};
  });
  if(reservation.done)return withAdminTransaction(identity,client=>uploadReceipt(client,identity,reservation.id));
  try {
    for(let i=0;i<prepared.length;i++)await putObject(reservation.objects[i].location,prepared[i].bytes,prepared[i].mime);
    return await withAdminTransaction(identity,async client=>{
      const revision=await lockProperty(client,identity);
      if(revision!==expectedRevision)throw new WorkspaceError("Dữ liệu đã thay đổi trong lúc tải tệp. Tải lại trước khi lưu.",409);
      const batch=await client.query("SELECT state FROM leasing.media_batches WHERE id=$1 FOR UPDATE",[reservation.id]);
      if(batch.rows[0]?.state!=='reserved')throw new MediaError("Lần tải không còn hiệu lực.",409);
      for(let i=0;i<prepared.length;i++){
        await client.query('UPDATE leasing.media_object_state SET state=$2 WHERE document_version_id=$1',[reservation.objects[i].id,prepared[i].provider==='neon'?'ready':'quarantine']);
        if(prepared[i].provider==='neon')await client.query('UPDATE leasing.document_versions SET sealed_at=now() WHERE id=$1',[reservation.objects[i].id]);
      }
      await client.query('UPDATE leasing.media_storage SET reserved_bytes=reserved_bytes-$2,used_bytes=used_bytes+$2 WHERE property_id=$1',[identity.propertyId,bytes]);
      await client.query('UPDATE leasing.properties SET workspace_revision=workspace_revision+1 WHERE id=$1',[identity.propertyId]);
      await client.query("UPDATE leasing.media_batches SET state='finalized',result_revision=$2 WHERE id=$1",[reservation.id,revision+1]);
      await client.query("INSERT INTO leasing.audit_events(property_id,actor_user_id,action_code,entity_type,entity_id,metadata) VALUES($1,$2,'media.upload','media_batch',$3,$4)",[identity.propertyId,identity.id,reservation.id,JSON.stringify({files:reservation.objects.map(row=>row.id),bytes})]);
      return uploadReceipt(client,identity,reservation.id);
    });
  } catch(error) {
    // If COMMIT succeeded but its acknowledgement failed, finalized receipt protects objects from cleanup.
    try{await cleanupBatch(identity,reservation.id);}catch{/* Durable reservation retains quota/keys until next authorized cleanup; never fake release. */}
    throw error;
  }
}
export async function reviewMedia(identity:AdminIdentity,id:string,note:string,expectedRevision:number,requestKey:string,request?:Request) {
  if(!uuid.test(requestKey)||typeof note!=='string'||note.trim().length<10||note.length>2000)throw new MediaError("Ghi rõ kết quả kiểm tra bên ngoài (10–2000 ký tự).");
  const digest=await sha256(new TextEncoder().encode(JSON.stringify({id,note:note.trim(),expectedRevision})));
  return withAdminTransaction(identity,async client=>{
    const revision=await lockProperty(client,identity);
    const prior=await client.query('SELECT request_sha256,result_revision,result_entity_id FROM leasing.command_receipts WHERE property_id=$1 AND actor_user_id=$2 AND idempotency_key=$3',[identity.propertyId,identity.id,requestKey]);
    if(prior.rows.length){if(prior.rows[0].request_sha256!==digest)throw new MediaError("Khóa idempotency đã được dùng.",409);return {revision:Number(prior.rows[0].result_revision),entityId:prior.rows[0].result_entity_id as string};}
    if(revision!==expectedRevision)throw new WorkspaceError("Dữ liệu đã thay đổi. Tải lại trước khi duyệt.",409);
    const row=await ownedMedia(client,identity,id);
    if(row.state!=='quarantine'||row.content_type!=='application/pdf')throw new MediaError("Chỉ duyệt tài liệu PDF đang cách ly.");
    await client.query('UPDATE leasing.document_versions SET manual_reviewed_by=$2,manual_reviewed_at=now(),manual_review_note=$3,sealed_at=now() WHERE id=$1',[id,identity.id,note.trim()]);
    await client.query("UPDATE leasing.media_object_state SET state='ready' WHERE document_version_id=$1",[id]);
    await client.query('UPDATE leasing.properties SET workspace_revision=workspace_revision+1 WHERE id=$1',[identity.propertyId]);
    await client.query("INSERT INTO leasing.audit_events(property_id,actor_user_id,action_code,entity_type,entity_id,metadata) VALUES($1,$2,'media.manual-review','document_version',$3,$4)",[identity.propertyId,identity.id,id,JSON.stringify({note:note.trim(),reviewMethod:'external-manual',virusScanPerformed:false,sha256:row.sha256})]);
    await client.query("INSERT INTO leasing.command_receipts(property_id,actor_user_id,idempotency_key,request_sha256,command_code,result_entity_id,result_revision) VALUES($1,$2,$3,$4,'media.manual-review',$5,$6)",[identity.propertyId,identity.id,requestKey,digest,id,revision+1]);
    return {revision:revision+1,entityId:id};
  });
}
export async function viewMedia(identity:AdminIdentity,id:string,request:Request) {
  const row=await withAdminTransaction(identity,client=>ownedMedia(client,identity,id));
  const reviewDownload=new URL(request.url).searchParams.get('review')==='1';
  if(row.state!=='ready'&&!(reviewDownload&&row.state==='quarantine'))throw new MediaError("Tệp đang cách ly. Cần kiểm tra bên ngoài và duyệt trước khi xem.",403);
  if(reviewDownload&&row.content_type!=='application/pdf')throw new MediaError("Tệp không thuộc quy trình duyệt.");
  let range;
  try{range=byteRange(request.headers.get('range'),Number(row.byte_size));}catch(error){if(error instanceof MediaError&&error.status===416)return new Response(null,{status:416,headers:{'content-range':`bytes */${row.byte_size}`,'cache-control':'private, no-store'}});throw error;}
  const headers=mediaHeaders(row.content_type,row.title,Number(row.byte_size),range);
  if(reviewDownload)headers.set('content-disposition',headers.get('content-disposition')!.replace(/^inline/,'attachment'));
  if(request.method==='HEAD')return new Response(null,{status:range?206:200,headers});
  const object=await getObject(row,range);
  return new Response(object.body,{status:range?206:200,headers});
}
