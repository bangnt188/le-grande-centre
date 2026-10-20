import "server-only";
import { cache } from "react";
import { readPublicWebsite } from "./public";

export const readPublicLeasing = cache(async () => {
  const publicData = await readPublicWebsite();
  const units = publicData.units.map(({ geometry, dimensions, note, ...record }) => ({
    id: record.code,
    floorId: record.floor,
    area: record.area,
    availability: record.status === "Đã thuê" ? "leased" as const : record.status === "Liên hệ" ? "contact" as const : "available" as const,
    orientation: record.orientation,
    types: record.types,
    ...(dimensions ? { dimensions } : {}),
    ...(note ? { note } : {}),
    plan: geometry,
  }));
  const floors = publicData.floors.map(record => {
    return { id: record.number, label: record.publicTitle, description: record.publicDescription, plan: record.plan };
  });
  return { units, floors, tenants: publicData.tenants };
});
