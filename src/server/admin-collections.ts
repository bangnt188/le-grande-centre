import "server-only";
import type { AdminCollectionName, AdminCollectionQuery, AdminCollectionItems, AdminCollectionPage, AdminCollectionDetail } from "../shared/admin/collection-contracts";
import { BackendError } from "@shared/backend";
import { withAdminTransaction, WorkspaceError, type AdminIdentity } from "./database";
import { createAdminCrudServices, readCompanySummary } from "./admin-crud";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const statuses: Record<AdminCollectionName, readonly string[]> = { companies: ["Đang thuê", "Đang giữ chỗ", "Đang tư vấn", "Chưa thuê"], leads: ["Mới", "Đang tư vấn", "Đã xử lý"], appointments: ["requested", "confirmed", "completed", "cancelled", "no_show"] };
export function parseCollectionName(value: string): AdminCollectionName {
  if (value !== "companies" && value !== "leads" && value !== "appointments") throw new WorkspaceError("Unknown collection", 404);
  return value;
}
export function parseCollectionId(value: string): string {
  if (!uuid.test(value)) throw new WorkspaceError("Invalid record ID");
  return value;
}
export function parseCollectionQuery(collection: AdminCollectionName, params: URLSearchParams): AdminCollectionQuery {
  const allowed = ["page", "pageSize", "query", "status", "ids", "companyId", "includeSummary"];
  for (const key of params.keys()) if (!allowed.includes(key) || params.getAll(key).length !== 1) throw new WorkspaceError("Unexpected query parameters");
  const integer = (key: string, fallback: number, max: number) => {
    const raw = params.get(key);
    if (raw !== null && !/^[1-9]\d*$/.test(raw)) throw new WorkspaceError("Invalid pagination");
    const value = raw === null ? fallback : Number(raw);
    if (!Number.isSafeInteger(value) || value < 1 || value > max) throw new WorkspaceError("Invalid pagination");
    return value;
  };
  const result: AdminCollectionQuery = { page: integer("page", 1, Number.MAX_SAFE_INTEGER), pageSize: integer("pageSize", 20, 100) };
  if (!Number.isSafeInteger((result.page! - 1) * result.pageSize!)) throw new WorkspaceError("Invalid pagination");
  if (params.has("query")) {
    const query = params.get("query")!.trim();
    if (query.length > 200 || /[\u0000-\u001f\u007f]/.test(query)) throw new WorkspaceError("Invalid search");
    if (query) result.query = query;
  }
  if (params.has("status")) {
    const status = params.get("status")!;
    if (!statuses[collection].includes(status)) throw new WorkspaceError("Invalid status");
    result.status = status;
  }
  if (params.has("includeSummary")) {
    if (collection !== "companies" || params.get("includeSummary") !== "true") throw new WorkspaceError("Invalid summary option");
    result.includeSummary = true;
  }
  if (params.has("companyId")) {
    if (collection === "companies") throw new WorkspaceError("Invalid company filter");
    result.companyId = parseCollectionId(params.get("companyId")!);
  }
  if (params.has("ids")) {
    const ids = params.get("ids")!.split(",");
    if (ids.length > 100 || new Set(ids).size !== ids.length) throw new WorkspaceError("Invalid record IDs");
    result.ids = ids.map(parseCollectionId);
    if (!params.has("pageSize")) result.pageSize = ids.length;
  }
  return result;
}
function collectionError(error: unknown): never {
  if (error instanceof BackendError) throw new WorkspaceError(error.message, error.status);
  throw error;
}
export async function readAdminCollection<C extends AdminCollectionName>(identity: AdminIdentity, collection: C, query: AdminCollectionQuery, request?: Request): Promise<AdminCollectionPage<AdminCollectionItems[C]>> {
  return withAdminTransaction(identity, async client => {
    const revision = (await client.query("SELECT workspace_revision FROM leasing.properties WHERE id=$1 FOR SHARE", [identity.propertyId])).rows[0];
    if (!revision) throw new WorkspaceError("Property not found", 404);
    const crud = createAdminCrudServices(identity, client, request, { query });
    const result = await crud[collection].list(crud.request, query);
    const summary = collection === "companies" && query.includeSummary ? await readCompanySummary(client, identity.propertyId) : undefined;
    return { ...result, ...(summary ? { summary } : {}), revision: Number(revision.workspace_revision) } as AdminCollectionPage<AdminCollectionItems[C]>;
  }).catch(collectionError);
}
export async function readAdminCollectionItem<C extends AdminCollectionName>(identity: AdminIdentity, collection: C, id: string, request?: Request): Promise<AdminCollectionDetail<AdminCollectionItems[C]>> {
  parseCollectionId(id);
  return withAdminTransaction(identity, async client => {
    const revision = (await client.query("SELECT workspace_revision FROM leasing.properties WHERE id=$1 FOR SHARE", [identity.propertyId])).rows[0];
    if (!revision) throw new WorkspaceError("Property not found", 404);
    const crud = createAdminCrudServices(identity, client, request);
    const item = await crud[collection].get(crud.request, id);
    return { item, revision: Number(revision.workspace_revision) } as AdminCollectionDetail<AdminCollectionItems[C]>;
  }).catch(collectionError);
}
