import { isAdminSettings, type AdminCommand, type AdminMediaPage, type AdminMediaDetail, type AdminMutationReceipt, type AdminRepository, type AdminScreenName, type AdminScreenQuery, type AdminScreenResponse, type AdminUploadReceipt } from "../../shared/admin/contracts";
import { parseFloorPlan } from "../../shared/leasing/plan-model";
import type { AdminCollectionDetail, AdminCollectionItems, AdminCollectionName, AdminCollectionPage } from "../../shared/admin/collection-contracts";
import { isFloorConfigurations, isSlotStatus } from "../../shared/admin/space-model";
import { isStorageUsage } from "../../shared/admin/storage-policy";
import { adminRequest, AdminSessionError } from "./session";
import { screenCache } from "./memory-cache";

function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function integer(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) >= 0; }
function strings(value: unknown): value is string[] { return Array.isArray(value) && value.every(item => typeof item === "string"); }
function fields(value: Record<string, unknown>, keys: string[]): boolean { return keys.every(key => typeof value[key] === "string"); }
function floor(value: unknown): boolean { return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 6; }
function invalid(): never { throw new AdminSessionError("Dữ liệu quản trị trả về không hợp lệ.", 502, "INVALID_RESPONSE"); }
function entity(kind: string, value: unknown): boolean {
  if (!record(value) || typeof value.id !== "string" || !value.id) return false;
  switch (kind) {
    case "media": return fields(value, ["name", "size", "scope"]) && ["Ảnh", "Tài liệu", "Video", "Model 3D", "Tài nguyên"].includes(String(value.kind)) && typeof value.hasUploadedFile === "boolean" && (value.sizeBytes === undefined || integer(value.sizeBytes)) && ["url", "thumbnailUrl", "reviewUrl"].every(key => value[key] === undefined || typeof value[key] === "string");
    case "companies": return integer(value.version) && fields(value, ["name", "initials", "industry", "brand", "contact", "email", "phone", "owner", "note"]);
    case "leads": return integer(value.version) && floor(value.floor) && fields(value, ["referenceCode", "name", "initials", "interest", "source", "time", "note"]) && ["Mới", "Đang tư vấn", "Đã xử lý"].includes(String(value.status));
    case "appointments": return integer(value.version) && fields(value, ["companyId", "purpose", "startsAt", "location"]) && ["requested", "confirmed", "completed", "cancelled", "no_show"].includes(String(value.status)) && integer(value.durationMinutes) && value.durationMinutes > 0;
    case "slots": return floor(value.floor) && fields(value, ["code", "tenant"]) && integer(value.order) && typeof value.area === "number" && Number.isFinite(value.area) && value.area > 0 && typeof value.width === "number" && Number.isFinite(value.width) && value.width >= 0 && ["west", "east", null].includes(value.side as "west" | "east" | null) && isSlotStatus(value.status);
    case "groups": return floor(value.floor) && fields(value, ["name"]) && strings(value.slotIds) && isSlotStatus(value.status);
    case "requests":
    case "reservations":
    case "leases": {
      if (!floor(value.floor) || !fields(value, ["companyId", "start", "end"]) || !strings(value.slotIds) || typeof value.area !== "number" || !Number.isFinite(value.area) || value.area <= 0) return false;
      if (kind === "requests") return fields(value, ["note", "received"]) && ["submitted", "reviewing", "approved", "rejected"].includes(String(value.status));
      if (kind === "reservations") return fields(value, ["requestId", "expiresAt", "note"]) && ["active", "cancelled", "converted"].includes(String(value.status));
      return value.status === "executed" && typeof value.rentNote === "string";
    }
    default: return false;
  }
}
function pagination(value: Record<string, unknown>): boolean {
  return integer(value.page) && value.page > 0 && integer(value.pageSize) && value.pageSize > 0 && value.pageSize <= 100 && integer(value.totalItems) && integer(value.totalPages);
}
export function parseCollectionPage<C extends AdminCollectionName>(collection: C, value: unknown): AdminCollectionPage<AdminCollectionItems[C]> {
  if (!record(value) || !integer(value.revision) || !pagination(value) || !Array.isArray(value.items) || !value.items.every(item => entity(collection, item))) invalid();
  return value as AdminCollectionPage<AdminCollectionItems[C]>;
}
export function parseCollectionDetail<C extends AdminCollectionName>(collection: C, value: unknown): AdminCollectionDetail<AdminCollectionItems[C]> {
  if (!record(value) || !integer(value.revision) || !entity(collection, value.item)) invalid();
  return value as AdminCollectionDetail<AdminCollectionItems[C]>;
}
export function parseMediaPage(value: unknown): AdminMediaPage {
  if (!record(value) || !integer(value.revision) || !pagination(value) || !Array.isArray(value.items) || value.items.length > Number(value.pageSize) || !value.items.every(item => entity("media", item)) || (value.storage !== null && !isStorageUsage(value.storage))) invalid();
  return value as AdminMediaPage;
}
export function parseMediaDetail(value: unknown): AdminMediaDetail {
  if (!record(value) || !integer(value.revision) || !entity("media", value.item)) invalid();
  return value as AdminMediaDetail;
}
const SCREEN_FIELDS: Record<AdminScreenName, readonly string[]> = {
  floors: ["floors", "slots"], spaces: ["floors", "slots", "groups"], slot: ["slots", "groups", "companies", "requests", "reservations", "leases"],
  tenants: ["slots", "companies", "leases"], requests: ["requests", "reservations", "companies", "slots", "groups"], leases: ["leases", "companies", "slots"], settings: [], defaults: [],
};
export function parseScreenResponse<S extends AdminScreenName>(screen: S, value: unknown): AdminScreenResponse<S> {
  if (!record(value) || !integer(value.revision)) invalid();
  if (!Array.isArray(value.floorPlans) || value.floorPlans.length > 6) invalid();
  let floorPlans: ReturnType<typeof parseFloorPlan>[] = [];
  try {
    floorPlans = value.floorPlans.map(plan => parseFloorPlan(plan));
  } catch {
    invalid();
  }
  if (new Set(floorPlans.map(plan => plan.floor)).size !== floorPlans.length) invalid();
  for (const key of SCREEN_FIELDS[screen]) {
    if (key === "floors") { if (!isFloorConfigurations(value.floors)) invalid(); }
    else if (!Array.isArray(value[key]) || !(value[key] as unknown[]).every(item => entity(key, item))) invalid();
  }
  if (["tenants", "requests", "leases"].includes(screen) && !pagination(value)) invalid();
  if (screen === "settings" && !isAdminSettings(value.settings)) invalid();
  if (screen === "defaults" && (!record(value.defaults) || !integer(value.defaults.defaultHoldHours) || value.defaults.defaultHoldHours < 1 || !integer(value.defaults.appointmentMinutes) || value.defaults.appointmentMinutes < 15 || typeof value.defaults.appointmentLocation !== "string")) invalid();
  return { ...value, floorPlans } as unknown as AdminScreenResponse<S>;
}
export function parseMutationReceipt(value: unknown): AdminMutationReceipt {
  if (!record(value) || !integer(value.revision) || typeof value.entityId !== "string" || !value.entityId) invalid();
  return { revision: value.revision, entityId: value.entityId };
}
function parseUploadReceipt(value: unknown): AdminUploadReceipt {
  if (!record(value) || !integer(value.revision) || !strings(value.mediaIds) || !value.mediaIds.every(id => id.length > 0)) invalid();
  return { revision: value.revision, mediaIds: value.mediaIds };
}

export function createHttpRepository(baseUrl = "/api/admin"): AdminRepository {
  const relative = baseUrl === "/api/admin";
  const base = new URL(baseUrl, "https://invalid.local");
  if ((!relative && base.hostname === "invalid.local") || (base.protocol !== "https:" && !(base.protocol === "http:" && ["localhost", "127.0.0.1"].includes(base.hostname))) || base.username || base.password || base.search || base.hash) {
    throw new Error("Admin API URL phải là /api/admin hoặc HTTPS tuyệt đối không chứa credentials/query/hash.");
  }
  const root = relative ? "/api/admin" : base.href.replace(/\/$/, "");
  async function mutate(path: string, expectedRevision: number, body: object, idempotencyKey = crypto.randomUUID()): Promise<AdminMutationReceipt> {
    if (!integer(expectedRevision)) throw new Error("Chưa tải phiên bản dữ liệu. Tải lại trước khi lưu.");
    const response = await adminRequest(`${root}${path}`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey }, body: JSON.stringify(body) }, { userAction: true });
    const receipt = parseMutationReceipt(await response.json());
    screenCache.markAllStale();
    return receipt;
  }
  return {
    async read<S extends AdminScreenName>(screen: S, query?: AdminScreenQuery, signal?: AbortSignal): Promise<AdminScreenResponse<S>> {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query ?? {})) if (value !== undefined && value !== "") params.set(key, String(value));
      const suffix = params.size ? `?${params}` : "";
      const response = await adminRequest(`${root}/screens/${screen}/${suffix}`, {}, { signal });
      return parseScreenResponse(screen, await response.json());
    },
    execute(command: AdminCommand, expectedRevision: number, key?: string) {
      return mutate("/commands/", expectedRevision, { command, expectedRevision }, key);
    },
    async upload(files: File[], scope: string, expectedRevision: number, idempotencyKey = crypto.randomUUID()): Promise<AdminUploadReceipt> {
      if (!integer(expectedRevision)) throw new Error("Chưa tải phiên bản thư viện. Tải lại trước khi lưu.");
      const body = new FormData();
      files.forEach(file => body.append("files", file));
      body.set("scope", scope); body.set("expectedRevision", String(expectedRevision));
      const response = await adminRequest(`${root}/media/`, { method: "POST", headers: { "Idempotency-Key": idempotencyKey }, body }, { userAction: true });
      const receipt = parseUploadReceipt(await response.json());
      screenCache.markAllStale();
      return receipt;
    },
    reviewMedia(id, note, expectedRevision, key) { return mutate(`/media/${encodeURIComponent(id)}/review/`, expectedRevision, { confirmedExternalReview: true, note, expectedRevision }, key); },
    reconcileStorage(expectedRevision, key) { return mutate("/media/reconcile/", expectedRevision, { expectedRevision }, key); },
  };
}
