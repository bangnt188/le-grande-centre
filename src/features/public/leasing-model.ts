import type { FloorPlan, PlanGeometry } from "@/shared/leasing/plan-model";

// Public presentation data only. This contract grants no inventory mutation rights.
export type LeasingFloor = Readonly<{ id: number; label: string; description: string; plan: FloorPlan }>;
export type LeasingAvailability = "available" | "contact" | "leased";
export type LeasingUnit = Readonly<{
  id: string; floorId: number; area: number; types: readonly string[];
  availability: LeasingAvailability; // Published occupancy from the server public projection.
  orientation: string; // Approximate exterior aspect, not a certified entrance direction.
  dimensions?: Readonly<{ width: number; depth: number }>;
  note?: string;
  plan: PlanGeometry;
}>;
export type AreaFilter = "" | "small" | "medium" | "large";
export type StatusFilter = "" | LeasingAvailability;

export const STATUS_CONFIG: Record<LeasingAvailability, { label: string; tone: "success" | "warning" | "error" }> = {
  available: { label: "Còn trống", tone: "success" },
  contact: { label: "Liên hệ", tone: "warning" },
  leased: { label: "Đã thuê", tone: "error" },
};

export const STATUS_OPTIONS: readonly { value: StatusFilter; label: string }[] = [
  { value: "", label: "Tất cả trạng thái" },
  { value: "available", label: "Còn trống" },
  { value: "contact", label: "Liên hệ" },
  { value: "leased", label: "Đã thuê" },
] as const;

// Brochure pairs keep their individual identities and availability.
export function getShophousePair(unit: LeasingUnit, inventory: readonly LeasingUnit[]): readonly [LeasingUnit, LeasingUnit] | null {
  if (unit.floorId !== 1 && unit.floorId !== 2) return null;
  const match = unit.id.match(/^[AB]\.(\d+)$/);
  if (!match) return null;
  const lower = inventory.find(item => item.floorId === 1 && item.id === `A.${match[1]}`);
  const upper = inventory.find(item => item.floorId === 2 && item.id === `B.${match[1]}`);
  return lower && upper ? [lower, upper] : null;
}

export function matchesArea(area: number, filter: AreaFilter) {
  switch (filter) {
    case "small": return area < 100;
    case "medium": return area >= 100 && area <= 150;
    case "large": return area > 150;
    default: return true;
  }
}

export function matchesStatus(availability: LeasingAvailability, filter: StatusFilter) {
  if (!filter) return true;
  return availability === filter;
}
