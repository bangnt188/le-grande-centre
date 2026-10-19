import type { B2BCommand, B2BData } from "./b2b-model";
import type { Floor, FloorConfiguration, Slot, SlotStatus, SpaceGroup } from "./space-model";
import type { StorageUsage } from "./storage-policy";
import type { FloorPlan } from "../leasing/plan-model";
import { isWebsiteSettings, type WebsiteSettings } from "./website-settings";

export const LEAD_STATUSES = ["Mới", "Đang tư vấn", "Đã xử lý"] as const;
export type Lead = {
  id: string; referenceCode: string; version: number; name: string; initials: string; interest: string; floor: Floor;
  source: string; time: string; status: (typeof LEAD_STATUSES)[number]; note: string;
  companyId?: string; email?: string; phone?: string;
  contactDetails?: { intent: "consultation" | "visit" | "callback"; company: string; business: string; area: string; timing: string; space: string; scope?: string; visitDate?: string; visitTime?: string };
};
export type LeadInput = Omit<Lead, "id" | "referenceCode" | "version" | "initials" | "time" | "contactDetails">;
export type AdminSettings = { propertyName: string; contactEmail: string; contactPhone: string; defaultHoldHours: number; appointmentMinutes: number; appointmentLocation: string; website: WebsiteSettings };
export function isAdminSettings(value: unknown): value is AdminSettings {
  if (!value || typeof value !== "object") return false;
  const settings = value as Record<string, unknown>;
  const bounded = (key: string, max: number, required = false) => typeof settings[key] === "string" && String(settings[key]).trim() === settings[key] && String(settings[key]).length <= max && (!required || String(settings[key]).length > 0);
  return bounded("propertyName", 120, true) && bounded("contactEmail", 254) && bounded("contactPhone", 32) && bounded("appointmentLocation", 160, true)
    && (!settings.contactEmail || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(settings.contactEmail)))
    && (!settings.contactPhone || /^[+\d().\s-]{6,32}$/.test(String(settings.contactPhone)))
    && Number.isInteger(settings.defaultHoldHours) && Number(settings.defaultHoldHours) >= 1 && Number(settings.defaultHoldHours) <= 720
    && Number.isInteger(settings.appointmentMinutes) && Number(settings.appointmentMinutes) >= 15 && Number(settings.appointmentMinutes) <= 240 && isWebsiteSettings(settings.website);
}
export type AdminSession = { actorId: string; propertyId: string; role: "administrator" | "editor"; expiresAt: number };
export type AdminMutationReceipt = { revision: number; entityId: string };
export type AdminUploadReceipt = { revision: number; mediaIds: string[] };
export type AdminScreenName = "floors" | "spaces" | "slot" | "tenants" | "requests" | "leases" | "settings" | "defaults";
export type AdminScreenQuery = { floor?: Floor; id?: string; page?: number; pageSize?: number; query?: string; companyId?: string; status?: string };
export type AdminScreenData = {
  floors: { floors: FloorConfiguration[]; slots: Slot[] };
  spaces: { floors: FloorConfiguration[]; slots: Slot[]; groups: SpaceGroup[] };
  slot: { slots: Slot[]; groups: SpaceGroup[]; companies: B2BData["companies"]; requests: B2BData["requests"]; reservations: B2BData["reservations"]; leases: B2BData["leases"] };
  tenants: { slots: Slot[]; companies: B2BData["companies"]; leases: B2BData["leases"]; page: number; pageSize: number; totalItems: number; totalPages: number };
  requests: { requests: B2BData["requests"]; reservations: B2BData["reservations"]; companies: B2BData["companies"]; slots: Slot[]; groups: SpaceGroup[]; page: number; pageSize: number; totalItems: number; totalPages: number };
  leases: { leases: B2BData["leases"]; companies: B2BData["companies"]; slots: Slot[]; page: number; pageSize: number; totalItems: number; totalPages: number };
  settings: { settings: AdminSettings };
  defaults: { defaults: Pick<AdminSettings, "defaultHoldHours" | "appointmentMinutes" | "appointmentLocation"> };
};
export type AdminScreenResponse<S extends AdminScreenName = AdminScreenName> = { revision: number; floorPlans: FloorPlan[] } & AdminScreenData[S];
export type AdminMediaQuery = { page?: number; pageSize?: number; query?: string; kind?: MediaItem["kind"]; source?: "all" | "uploaded" | "project"; scope?: string };
export type AdminMediaPage = { items: MediaItem[]; page: number; pageSize: number; totalItems: number; totalPages: number; revision: number; storage: StorageUsage | null };
export type AdminMediaDetail = { item: MediaItem; revision: number };
export type MediaItem = {
  id: string; name: string; kind: "Ảnh" | "Tài liệu" | "Video" | "Model 3D" | "Tài nguyên"; scope: string;
  size: string; url?: string; reference?: boolean; sizeBytes?: number; mimeType?: string; hasUploadedFile: boolean;
  projectAsset?: boolean; sourcePath?: string; thumbnailUrl?: string; canDelete?: boolean; protectedReason?: string;
  uploadState?: "ready" | "quarantine"; reviewUrl?: string; reviewedAt?: string;
};
export type AdminCommand = B2BCommand
  | { type: "update-floor"; floor: Floor; purpose: string; publicTitle: string; publicDescription: string }
  | { type: "update-website-settings"; values: WebsiteSettings }
  | { type: "update-settings"; values: AdminSettings }
  | { type: "merge"; floor: Floor; slotIds: string[]; name: string }
  | { type: "split"; groupId: string }
  | { type: "update-slot"; slotId: string; status: SlotStatus; tenant: string; area?: number }
  | { type: "update-group"; groupId: string; name: string; status: SlotStatus }
  | { type: "save-lead"; leadId?: string; values: LeadInput }
  | { type: "delete-lead"; leadId: string }
  | { type: "link-media"; mediaId: string; scope: string }
  | { type: "rename-media"; mediaId: string; name: string }
  | { type: "delete-media"; mediaId: string };

// Signed identity is held only in HttpOnly cookies; screen data is private memory.
export interface AdminRepository {
  read<S extends AdminScreenName>(screen: S, query?: AdminScreenQuery, signal?: AbortSignal): Promise<AdminScreenResponse<S>>;
  execute(command: AdminCommand, expectedRevision: number, idempotencyKey?: string): Promise<AdminMutationReceipt>;
  upload(files: File[], scope: string, expectedRevision: number, idempotencyKey?: string): Promise<AdminUploadReceipt>;
  reviewMedia(id: string, note: string, expectedRevision: number, idempotencyKey?: string): Promise<AdminMutationReceipt>;
  reconcileStorage(expectedRevision: number, idempotencyKey?: string): Promise<AdminMutationReceipt>;
}
