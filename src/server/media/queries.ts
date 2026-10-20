import "server-only";
import type { AdminMediaDetail, AdminMediaPage, AdminMediaQuery, MediaItem } from "../../shared/admin/contracts";
import { withAdminTransaction, WorkspaceError, type AdminIdentity, type PoolClient } from "../database";
import { decodeMediaRows, readStorageUsage, type MediaSnapshotRow } from "./repository";
import { projectMedia } from "./project-catalog";

const kinds: MediaItem["kind"][] = ["Ảnh", "Tài liệu", "Video", "Model 3D", "Tài nguyên"];
export function parseMediaQuery(params: URLSearchParams): AdminMediaQuery {
  for (const key of params.keys()) if (!["page", "pageSize", "query", "kind", "source", "scope"].includes(key) || params.getAll(key).length !== 1) throw new WorkspaceError("Unexpected media query");
  const result: AdminMediaQuery = { page: 1, pageSize: 24, source: "all" };
  for (const key of ["page", "pageSize"] as const) if (params.has(key)) {
    const raw = params.get(key)!, value = Number(raw);
    if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(value) || value > (key === "pageSize" ? 100 : Number.MAX_SAFE_INTEGER)) throw new WorkspaceError("Invalid media pagination");
    result[key] = value;
  }
  if (!Number.isSafeInteger((result.page! - 1) * result.pageSize!)) throw new WorkspaceError("Invalid media pagination");
  if (params.has("source")) {
    const source = params.get("source")!;
    if (!["all", "uploaded", "project"].includes(source)) throw new WorkspaceError("Invalid media source");
    result.source = source as AdminMediaQuery["source"];
  }
  if (params.has("kind")) {
    if (!kinds.includes(params.get("kind") as MediaItem["kind"])) throw new WorkspaceError("Invalid media kind");
    result.kind = params.get("kind") as MediaItem["kind"];
  }
  for (const key of ["query", "scope"] as const) if (params.has(key)) {
    const value = params.get(key)!.trim();
    if (value.length > (key === "query" ? 200 : 100) || /[\u0000-\u001f\u007f]/.test(value)) throw new WorkspaceError("Invalid media filter");
    if (key === "scope" && value && !["Toàn dự án", "Chưa xác nhận tầng"].includes(value) && !/^Tầng [1-6]$/.test(value) && !/^(slot|group):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new WorkspaceError("Invalid media scope");
    if (value) result[key] = value;
  }
  return result;
}
const mediaFrom = `FROM leasing.document_versions v JOIN leasing.documents d ON d.id=v.document_id AND d.property_id=v.property_id JOIN leasing.media_object_state s ON s.document_version_id=v.id AND s.property_id=v.property_id`;
const mediaColumns = `v.id,d.title,v.content_type,d.media_scope,v.byte_size::text,s.state,v.public_url,v.manual_reviewed_at,
 CASE WHEN EXISTS(SELECT 1 FROM leasing.website_settings w WHERE w.property_id=v.property_id AND w.logo_media_id=v.id) THEN 'Chọn và lưu logo khác trước khi xóa logo hiện tại.'
 WHEN EXISTS(SELECT 1 FROM leasing.property_customers pc WHERE pc.property_id=v.property_id AND pc.logo_media_id=v.id AND pc.deleted_at IS NULL) THEN 'Gỡ hoặc thay logo doanh nghiệp trước khi xóa hay đổi liên kết tệp.'
 WHEN EXISTS(SELECT 1 FROM leasing.lease_documents ld WHERE ld.property_id=v.property_id AND ld.document_version_id=v.id)
 OR EXISTS(SELECT 1 FROM leasing.plan_documents pd WHERE pd.property_id=v.property_id AND pd.document_version_id=v.id)
 OR EXISTS(SELECT 1 FROM leasing.document_retention dr WHERE dr.property_id=v.property_id AND dr.document_version_id=v.id AND (dr.legal_hold OR dr.retention_until>now()))
 THEN 'Tệp đang được lưu trong hồ sơ hoặc chính sách lưu giữ.' ELSE NULL END AS protected_reason`;
type PageRow = MediaSnapshotRow & { protected_reason: string | null };
function decodePageRows(rows: PageRow[]): MediaItem[] {
  return decodeMediaRows(rows).map((item, index) => ({ ...item, canDelete: !rows[index]!.protected_reason, protectedReason: rows[index]!.protected_reason ?? undefined }));
}
/** Uploads precede catalog entries; compute each source's exact portion without reading unbounded uploads. */
export function mediaSourceWindow(uploadedCount: number, offset: number, pageSize: number) {
  const uploadLimit = Math.min(pageSize, Math.max(0, uploadedCount - offset));
  return { uploadOffset: Math.min(offset, uploadedCount), uploadLimit, projectOffset: Math.max(0, offset - uploadedCount), projectLimit: pageSize - uploadLimit };
}
async function revisionFor(client: PoolClient, identity: AdminIdentity) {
  const property = (await client.query("SELECT workspace_revision FROM leasing.properties WHERE id=$1 FOR SHARE", [identity.propertyId])).rows[0];
  if (!property) throw new WorkspaceError("Property not found", 404);
  return Number(property.workspace_revision);
}
export async function readMediaPage(identity: AdminIdentity, input: AdminMediaQuery = {}): Promise<AdminMediaPage> {
  const query = parseMediaQuery(new URLSearchParams(Object.entries(input).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)])));
  return withAdminTransaction(identity, async client => {
    const revision = await revisionFor(client, identity), page = query.page!, pageSize = query.pageSize!;
    const projects = query.source === "uploaded" ? [] : projectMedia().filter(item => (!query.kind || item.kind === query.kind) && (!query.scope || item.scope === query.scope) && (!query.query || [item.name, item.sourcePath ?? ""].some(value => value.toLocaleLowerCase("vi").includes(query.query!.toLocaleLowerCase("vi")))));
    const values: unknown[] = [identity.propertyId], where = ["v.property_id=$1", "s.state IN ('ready','quarantine')"];
    const bind = (value: unknown) => { values.push(value); return "$" + values.length; };
    if (query.query) where.push(`(d.title ILIKE ${bind("%" + query.query.replace(/[\\%_]/g, "\\$&") + "%")})`);
    if (query.scope) where.push(`d.media_scope=${bind(query.scope)}`);
    if (query.kind) where.push(`(CASE WHEN v.content_type LIKE 'image/%' THEN 'Ảnh' WHEN v.content_type LIKE 'video/%' THEN 'Video' ELSE 'Tài liệu' END)=${bind(query.kind)}`);
    const predicate = " WHERE " + where.join(" AND ");
    const uploadedCount = query.source === "project" ? 0 : Number((await client.query(`SELECT count(*) AS count ${mediaFrom}${predicate}`, values)).rows[0].count);
    const totalItems = uploadedCount + projects.length;
    const window = mediaSourceWindow(uploadedCount, (page - 1) * pageSize, pageSize);
    let uploads: MediaItem[] = [];
    if (window.uploadLimit) {
      const limit = bind(window.uploadLimit), offset = bind(window.uploadOffset);
      uploads = decodePageRows((await client.query<PageRow>(`SELECT ${mediaColumns} ${mediaFrom}${predicate} ORDER BY v.uploaded_at DESC,v.id DESC LIMIT ${limit} OFFSET ${offset}`, values)).rows);
    }
    return { items: [...uploads, ...projects.slice(window.projectOffset, window.projectOffset + window.projectLimit)], page, pageSize, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / pageSize)), revision, storage: await readStorageUsage(client, identity.propertyId) };
  });
}
export async function readMediaDetail(identity: AdminIdentity, id: string): Promise<AdminMediaDetail> {
  return withAdminTransaction(identity, async client => {
    const revision = await revisionFor(client, identity);
    if (id.startsWith("project:")) {
      const item = projectMedia().find(item => item.id === id);
      if (!item) throw new WorkspaceError("Media not found", 404);
      return { item, revision };
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new WorkspaceError("Invalid media ID");
    const items = decodePageRows((await client.query<PageRow>(`SELECT ${mediaColumns} ${mediaFrom} WHERE v.property_id=$1 AND v.id=$2 AND s.state IN ('ready','quarantine')`, [identity.propertyId, id])).rows);
    if (!items[0]) throw new WorkspaceError("Media not found", 404);
    return { item: items[0], revision };
  });
}
