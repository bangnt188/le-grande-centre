import type { FloorConfiguration } from "../admin/space-model";
import type { WebsiteSettings } from "../admin/website-settings";
import type { FloorPlan, PlanGeometry } from "../leasing/plan-model";
export type PublicUnitStatus = "Còn trống" | "Liên hệ" | "Đã thuê";
export type PublicWebsite = {
  website: WebsiteSettings;
  logoUrl: string | null;
  tenants: { id: string; name: string; logoUrl: string }[];
  floors: (Pick<FloorConfiguration, "number" | "publicTitle" | "publicDescription"> & { plan: FloorPlan })[];
  units: { id: string; code: string; floor: number; area: number; status: PublicUnitStatus; geometry: PlanGeometry; types: string[]; orientation: string; dimensions: { width: number; depth: number } | null; note: string }[];
};
export type ContactSubmission = { intent: "consultation" | "visit" | "callback"; name: string; company: string; phone: string; email: string; business: string; area: string; timing: string; space: string; note: string; consent: boolean; unitId?: string; visitDate?: string; visitTime?: string; scope?: string };
