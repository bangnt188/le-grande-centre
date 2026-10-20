import type { AdminBusinessAction, AdminListState, AdminLocation, AdminRecordTarget, AdminView, CompanyTab } from "./admin-workspace-navigation";
import type { Floor } from "@/shared/admin/space-model";

export const ADMIN_VIEWS: readonly AdminView[] = ["floors", "spaces", "customers", "leads", "requests", "leases", "appointments", "media", "settings"];
const RECORD_KINDS: readonly AdminRecordTarget["kind"][] = ["customers", "requests", "leases", "slot", "leads", "appointments", "media"];
const COMPANY_TABS: readonly CompanyTab[] = ["overview", "requests", "spaces", "contracts"];
export const initialAdminLocation: AdminLocation = { view: "floors", floor: 2, selectedIds: [] };
const identifier = (value: string | null) => value && /^[a-zA-Z0-9._-]{1,128}$/.test(value) ? value : undefined;
const positive = (value: string | null, fallback = 1, max = 100000) => value && /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= max ? Number(value) : fallback;
const floorNumber = (value: string | null): Floor => positive(value, 2, 6) as Floor;
const ids = (value: string | null) => [...new Set((value ?? "").split(",").filter(value => identifier(value)))].slice(0, 100);
export const listScope = (view: AdminView) => view === "customers" ? "companies" : view;
const statuses = new Set(["Đang thuê", "Đang giữ chỗ", "Đang tư vấn", "Chưa thuê", "Mới", "Đã xử lý", "submitted", "reviewing", "approved", "rejected", "requested", "confirmed", "completed", "cancelled", "no_show", "active", "converted", "expired", "Còn trống", "Có Lead", "Đang thương lượng", "Giữ chỗ", "Đã ký", "Đã thuê", "Liên hệ"]);
export function validMediaScope(value: string | null): string | undefined {
  return value && (value === "Toàn dự án" || /^Tầng [1-6]$/.test(value) || /^(slot|group):[a-zA-Z0-9._-]{1,128}$/.test(value)) ? value : undefined;
}

/** Only structural state is serializable; free-text searches and drafts stay in memory. */
export function parseAdminLocation(url: URL): { location: AdminLocation; list: AdminListState } {
  const params = url.searchParams;
  const legacySlot = identifier(new URLSearchParams(url.hash.slice(1)).get("slot"));
  const view = ADMIN_VIEWS.includes(params.get("view") as AdminView) ? params.get("view") as AdminView : legacySlot ? "spaces" : "floors";
  const location: AdminLocation = { view, floor: floorNumber(params.get("floor")), selectedIds: ids(params.get("selected")) };
  const scope = validMediaScope(params.get("scope"));
  if (scope) location.scope = scope;
  const kind = params.get("detail") as AdminRecordTarget["kind"];
  const id = identifier(params.get("id"));
  if (RECORD_KINDS.includes(kind) && id) {
    location.detail = { kind, id };
    if (kind === "slot") location.detail.floor = floorNumber(params.get("detailFloor") ?? params.get("floor"));
    if (kind === "customers") {
      location.detail.tab = COMPANY_TABS.includes(params.get("tab") as CompanyTab) ? params.get("tab") as CompanyTab : "overview";
      location.detail.page = positive(params.get("relatedPage"));
    }
  } else if (legacySlot) location.detail = { kind: "slot", id: legacySlot };
  const actionKind = params.get("action");
  const editId = identifier(params.get("editId"));
  const companyId = identifier(params.get("companyId"));
  if (actionKind === "company" || actionKind === "lead") location.action = { kind: actionKind, ...(editId ? { id: editId } : {}) };
  if (actionKind === "appointment") location.action = { kind: actionKind, ...(editId ? { id: editId } : {}), ...(companyId ? { companyId } : {}) };
  if (actionKind === "request") location.action = { kind: "request", ...(editId ? { id: editId } : {}), ...(companyId ? { companyId } : {}), ...(params.has("actionFloor") ? { floor: floorNumber(params.get("actionFloor")) } : {}), ...(params.has("actionSlots") ? { slotIds: ids(params.get("actionSlots")) } : {}) };
  const requestId = identifier(params.get("requestId"));
  if ((actionKind === "approve" || actionKind === "reject") && requestId) location.action = { kind: actionKind, requestId };
  const reservationId = identifier(params.get("holdId"));
  if ((actionKind === "lease" || actionKind === "cancel-hold") && reservationId) location.action = { kind: actionKind, reservationId };
  const leadId = identifier(params.get("leadId"));
  if (actionKind === "qualify-lead" && leadId) location.action = { kind: actionKind, leadId, mode: params.get("mode") === "new" ? "new" : "existing" };
  const list: AdminListState = { page: positive(params.get("page")), pageSize: positive(params.get("size"), view === "media" ? 24 : 20, 100) };
  const status = params.get("status");
  if (status && statuses.has(status)) list.status = status;
  if (view === "leases" && companyId) list.companyId = companyId;
  if (view === "media") {
    const mediaKind = params.get("kind");
    if (mediaKind && ["Ảnh", "Tài liệu", "Video", "Model 3D", "Tài nguyên"].includes(mediaKind)) list.kind = mediaKind;
    const source = params.get("source");
    if (source && ["all", "uploaded", "project"].includes(source)) list.source = source;
    if (scope) list.scope = scope;
  }
  return { location, list };
}

export function adminLocationUrl(pathname: string, location: AdminLocation, lists: Record<string, AdminListState>): string {
  const params = new URLSearchParams({ view: location.view });
  if (location.view === "spaces") params.set("floor", String(location.floor));
  if (location.selectedIds.length) params.set("selected", location.selectedIds.join(","));
  if (location.scope) params.set("scope", location.scope);
  const detail = location.detail;
  if (detail) {
    params.set("detail", detail.kind); params.set("id", detail.id);
    if (detail.floor) params.set("detailFloor", String(detail.floor));
    if (detail.tab) params.set("tab", detail.tab);
    if (detail.page && detail.page !== 1) params.set("relatedPage", String(detail.page));
  }
  const list = lists[listScope(location.view)] ?? {};
  if (Number(list.page) > 1) params.set("page", String(list.page));
  if (list.pageSize) params.set("size", String(list.pageSize));
  if (typeof list.status === "string" && statuses.has(list.status)) params.set("status", list.status);
  if (location.view === "leases" && typeof list.companyId === "string" && identifier(list.companyId)) params.set("companyId", list.companyId);
  if (location.view === "media") {
    if (list.kind) params.set("kind", String(list.kind));
    if (list.source) params.set("source", String(list.source));
    if (typeof list.scope === "string" && validMediaScope(list.scope)) params.set("scope", list.scope);
  }
  const action: AdminBusinessAction | undefined = location.action;
  if (action) {
    params.set("action", action.kind);
    if ("id" in action && action.id) params.set("editId", action.id);
    if ("companyId" in action && action.companyId) params.set("companyId", action.companyId);
    if ("floor" in action && action.floor) params.set("actionFloor", String(action.floor));
    if ("slotIds" in action && action.slotIds?.length) params.set("actionSlots", action.slotIds.join(","));
    if ("requestId" in action) params.set("requestId", action.requestId);
    if ("reservationId" in action) params.set("holdId", action.reservationId);
    if ("leadId" in action) { params.set("leadId", action.leadId); params.set("mode", action.mode); }
  }
  return `${pathname}?${params}`;
}
