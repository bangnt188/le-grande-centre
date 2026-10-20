import { FLOORS } from "../admin/space-model";
import type { Floor } from "../admin/space-model";
import type { PublicWebsite } from "./contracts";
import { parseFloorPlan, parsePlanGeometry } from "../leasing/plan-model";

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid public website projection.");
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string" || value.length > 10_000) throw new Error("Invalid public website text.");
  return value;
}
function floor(value: unknown): Floor {
  const number = FLOORS.find(number => number === value);
  if (number === undefined) throw new Error("Invalid public website floor.");
  return number;
}

/** Copy only the public contract; never embed extra API fields in prerendered pages. */
export function parsePublicWebsite(value: unknown): PublicWebsite {
  const data = object(value), website = object(data.website);
  if (!Array.isArray(data.floors) || data.floors.length > 6 || !Array.isArray(data.units) || data.units.length > 5000) {
    throw new Error("Invalid public website catalog.");
  }
  if (data.tenants !== undefined && (!Array.isArray(data.tenants) || data.tenants.length > 500)) throw new Error("Invalid public tenant catalog.");
  const logoUrl = data.logoUrl === null ? null : text(data.logoUrl);
  if (logoUrl !== null && new URL(logoUrl).protocol !== "https:") throw new Error("Invalid public logo URL.");
  const tenants = (data.tenants ?? []).map(value => {
    const row = object(value), name = text(row.name), tenantLogoUrl = text(row.logoUrl);
    if (!name || !tenantLogoUrl || new URL(tenantLogoUrl).protocol !== "https:") throw new Error("Invalid public tenant logo.");
    return { id: text(row.id), name, logoUrl: tenantLogoUrl };
  });
  const floors = data.floors.map(value => {
    const row = object(value), number = floor(row.number);
    const plan = object(row.plan);
    if (!Array.isArray(plan.slots) || plan.slots.some(value => {
      const slot = object(value);
      return slot.status !== undefined && slot.status !== "Còn trống" && slot.status !== "Liên hệ" && slot.status !== "Đã thuê";
    })) throw new Error("Invalid public floor plan status.");
    return {
      number,
      publicTitle: text(row.publicTitle),
      publicDescription: text(row.publicDescription),
      plan: parseFloorPlan(plan, number),
    };
  });
  const plans = new Map(floors.map(item => [item.number, item.plan]));
  return {
    website: {
      logoMediaId: text(website.logoMediaId), email: text(website.email), hotline: text(website.hotline),
      secondaryPhone: text(website.secondaryPhone), managementPhone: text(website.managementPhone),
      address: text(website.address), zaloUrl: text(website.zaloUrl),
    },
    logoUrl,
    tenants,
    floors,
    units: data.units.map(value => {
      const row = object(value);
      if (typeof row.area !== "number" || !Number.isFinite(row.area) || row.area < 0 || (row.status !== "Còn trống" && row.status !== "Liên hệ" && row.status !== "Đã thuê")) throw new Error("Invalid public unit.");
      const floorNumber = floor(row.floor), plan = plans.get(floorNumber);
      if (!plan) throw new Error("Public slot has no floor plan.");
      if (!Array.isArray(row.types) || row.types.length > 20 || !row.types.every(item => typeof item === "string" && item.length <= 120)) throw new Error("Invalid public unit types.");
      let dimensions: { width: number; depth: number } | null = null;
      if (row.dimensions !== null) {
        const measured = object(row.dimensions);
        const width = measured.width, depth = measured.depth;
        if (typeof width !== "number" || !Number.isFinite(width) || width <= 0 || typeof depth !== "number" || !Number.isFinite(depth) || depth <= 0) throw new Error("Invalid public unit dimensions.");
        dimensions = { width, depth };
      }
      return { id: text(row.id), code: text(row.code), floor: floorNumber, area: row.area, status: row.status, geometry: parsePlanGeometry(row.geometry, plan.canvasWidth, plan.canvasHeight), types: row.types as string[], orientation: text(row.orientation), dimensions, note: text(row.note) };
    }),
  };
}
