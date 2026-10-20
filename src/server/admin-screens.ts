import "server-only";
import type { AdminScreenName, AdminScreenQuery, AdminScreenResponse, AdminScreenData } from "../shared/admin/contracts";
import type { Company, Lease, LeasingRequest, Reservation } from "../shared/admin/b2b-model";
import type { Floor, Slot, SpaceGroup } from "../shared/admin/space-model";
import { withAdminTransaction, WorkspaceError, type AdminIdentity, type PoolClient } from "./database";
import { createAdminCrudServices } from "./admin-crud";
import { floorsSql, slotsSql, groupsSql, requestsSql, reservationsSql, leasesSql, readSettings } from "./workspace";
import { parseCollectionId } from "./admin-collections";
import { requireAdministrator } from "./admin-session";
import { parseFloorPlan } from "../shared/leasing/plan-model";

export function parseScreenName(value: string): AdminScreenName {
  if (!["floors", "spaces", "slot", "tenants", "requests", "leases", "settings", "defaults"].includes(value)) throw new WorkspaceError("Unknown screen", 404);
  return value as AdminScreenName;
}
export function parseScreenQuery(screen: AdminScreenName, params: URLSearchParams): AdminScreenQuery {
  const allowed: Record<AdminScreenName, string[]> = { floors: [], settings: [], defaults: [], spaces: ["floor"], slot: ["id"], tenants: ["floor", "id", "page", "pageSize", "query", "companyId", "status"], requests: ["floor", "id", "page", "pageSize", "query", "companyId", "status"], leases: ["floor", "id", "reservationId", "page", "pageSize", "query", "companyId", "status"] };
  for (const key of params.keys()) if (!allowed[screen].includes(key) || params.getAll(key).length !== 1) throw new WorkspaceError("Unexpected query parameters");
  const result: AdminScreenQuery = {};
  for (const key of ["id", "companyId", "reservationId"] as const) if (params.has(key)) result[key] = parseCollectionId(params.get(key)!);
  for (const key of ["page", "pageSize", "floor"] as const) if (params.has(key)) {
    const raw = params.get(key)!, value = Number(raw), maximum = key === "pageSize" ? 100 : key === "floor" ? 6 : Number.MAX_SAFE_INTEGER;
    if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(value) || value > maximum) throw new WorkspaceError("Invalid pagination or floor");
    if (key === "floor") result.floor = value as Floor; else result[key] = value;
  }
  if (!Number.isSafeInteger(((result.page ?? 1) - 1) * (result.pageSize ?? 20))) throw new WorkspaceError("Invalid pagination");
  if (params.has("query")) {
    const query = params.get("query")!.trim();
    if (query.length > 200 || /[\u0000-\u001f\u007f]/.test(query)) throw new WorkspaceError("Invalid search");
    if (query) result.query = query;
  }
  if (params.has("status")) {
    const status = params.get("status")!;
    if (!(screen === "requests" ? ["submitted", "reviewing", "approved", "rejected", "active", "expired", "cancelled", "converted"] : ["executed"]).includes(status)) throw new WorkspaceError("Invalid status");
    result.status = status;
  }
  if (screen === "slot" && !result.id) throw new WorkspaceError("Slot ID is required");
  return result;
}
async function relatedCompanies(client: PoolClient, identity: AdminIdentity, ids: string[]): Promise<Company[]> {
  const unique = [...new Set(ids)];
  if (!unique.length) return [];
  const companies: Company[] = [];
  for (let offset = 0; offset < unique.length; offset += 100) {
    const batch = unique.slice(offset, offset + 100);
    const crud = createAdminCrudServices(identity, client, undefined, { query: { ids: batch } });
    companies.push(...(await crud.companies.list(crud.request, { pageSize: batch.length })).items);
  }
  return companies;
}
function projectGroups(rows: Omit<SpaceGroup, "status">[], slots: Slot[]): SpaceGroup[] {
  return rows.map(group => ({ ...group, status: slots.find(slot => group.slotIds.includes(slot.id))?.status ?? "Còn trống" }));
}
async function readFloorPlans(client: PoolClient, propertyId: string, includeInternalStatus: boolean) {
  const rows = (await client.query<{floor:number;plan:unknown}>(`
    SELECT f.floor_number AS floor, jsonb_build_object(
      'floor', f.floor_number,
      'versionId', pv.id,
      'coordinateSystem', pv.coordinate_system,
      'canvasWidth', pv.canvas_width::float8,
      'canvasHeight', pv.canvas_height::float8,
      'sourceDocument', pv.source_document,
      'sourcePage', pv.source_page,
      'sourceSheet', pv.source_sheet,
      'orientation', pv.orientation_facts,
      'features', coalesce((
        SELECT jsonb_agg(jsonb_build_object('code',pf.feature_code,'kind',pf.feature_kind,'label',pf.label,'geometry',pf.geometry) ORDER BY pf.display_order,pf.feature_code)
        FROM leasing.plan_features pf
        WHERE pf.plan_version_id=pv.id AND pf.property_id=p.id AND pf.floor_id=f.id
      ), '[]'::jsonb),
      'slots', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'id',s.id,
          'code',s.code,
          'area',m.area_m2::float8,
          'status',${includeInternalStatus ? "s.business_status" : "CASE WHEN s.business_status='Còn trống' THEN 'Còn trống' WHEN s.business_status='Đã thuê' OR (s.business_status='Đã ký' AND l.id IS NOT NULL) THEN 'Đã thuê' ELSE 'Liên hệ' END"},
          'geometry',v.geometry,
          'dimensions',CASE WHEN jsonb_typeof(v.technical_spec->'dimensions')='object' THEN v.technical_spec->'dimensions' ELSE NULL END
        ) ORDER BY s.display_order)
        FROM leasing.slots s
        JOIN LATERAL(SELECT id,geometry,technical_spec FROM leasing.slot_versions WHERE slot_id=s.id AND plan_version_id=pv.id ORDER BY version_number DESC LIMIT 1)v ON true
        JOIN leasing.slot_measurements m ON m.slot_version_id=v.id AND m.area_kind='commercial_reference'
        LEFT JOIN leasing.slot_allocations a ON a.slot_id=s.id AND a.property_id=p.id AND a.lease_id IS NOT NULL AND a.released_at IS NULL
        LEFT JOIN leasing.leases l ON l.id=a.lease_id AND l.property_id=p.id AND l.status='executed' AND l.occupancy_period @> CURRENT_DATE
        WHERE s.property_id=p.id AND s.floor_id=f.id AND s.retired_at IS NULL
      ), '[]'::jsonb)
    ) AS plan
    FROM leasing.properties p
    JOIN leasing.floors f ON f.property_id=p.id
    JOIN LATERAL(SELECT * FROM leasing.plan_versions WHERE property_id=p.id AND floor_id=f.id ORDER BY version_number DESC LIMIT 1)pv ON true
    WHERE p.id=$1 ORDER BY f.floor_number
  `,[propertyId])).rows;
  return rows.map(row => parseFloorPlan(row.plan, row.floor as 1|2|3|4|5|6));
}
export async function readAdminScreen<S extends AdminScreenName>(identity: AdminIdentity, screen: S, query: AdminScreenQuery = {}): Promise<AdminScreenResponse<S>> {
  // Server callers follow exactly the same finite validation as the HTTP boundary.
  const validated = parseScreenQuery(screen, new URLSearchParams(Object.entries(query).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)])));
  if (screen === "settings") requireAdministrator(identity);
  return withAdminTransaction(identity, async client => {
    const property = (await client.query("SELECT workspace_revision FROM leasing.properties WHERE id=$1 FOR SHARE", [identity.propertyId])).rows[0];
    if (!property) throw new WorkspaceError("Property not found", 404);
    const revision = Number(property.workspace_revision), p = identity.propertyId;
    const includeInternalStatus = identity.role !== "editor";
    const floorPlans = await readFloorPlans(client,p,includeInternalStatus);
    let data: AdminScreenData[AdminScreenName];
    if (screen === "settings") data = { settings: (await readSettings(client, p)).settings };
    else if (screen === "defaults") data = { defaults: (await client.query(`SELECT default_hold_hours AS "defaultHoldHours",appointment_minutes AS "appointmentMinutes",appointment_location AS "appointmentLocation" FROM leasing.properties WHERE id=$1`, [p])).rows[0] };
    else if (screen === "floors") {
      const floors = (await client.query(floorsSql, [p])).rows;
      // Floor summaries do not query customer, lease, request, settings or media tables.
      const slots = (await client.query<Slot>(`SELECT s.id,f.floor_number AS floor,s.code,s.display_order AS "order",s.core_zone AS side,m.area_m2::float8 AS area,coalesce(fr.width_m,0)::float8 AS width,
       ${includeInternalStatus ? "s.business_status" : "CASE WHEN s.business_status='Còn trống' THEN 'Còn trống' WHEN s.business_status='Đã thuê' OR (s.business_status='Đã ký' AND EXISTS(SELECT 1 FROM leasing.slot_allocations a JOIN leasing.leases l ON l.id=a.lease_id AND l.property_id=a.property_id WHERE a.property_id=s.property_id AND a.slot_id=s.id AND a.released_at IS NULL AND l.status='executed' AND l.occupancy_period @> CURRENT_DATE)) THEN 'Đã thuê' ELSE 'Liên hệ' END"} AS status,s.tenant_label AS tenant
       FROM leasing.slots s JOIN leasing.floors f ON f.id=s.floor_id JOIN LATERAL(SELECT id FROM leasing.slot_versions WHERE slot_id=s.id ORDER BY version_number DESC LIMIT 1)v ON true JOIN leasing.slot_measurements m ON m.slot_version_id=v.id AND m.area_kind='commercial_reference'
       LEFT JOIN LATERAL(SELECT width_m FROM leasing.slot_frontages WHERE slot_version_id=v.id AND frontage_kind='external' LIMIT 1)fr ON true WHERE s.property_id=$1 AND s.retired_at IS NULL ORDER BY f.floor_number,s.display_order`, [p])).rows;
      data = { floors, slots };
    } else if (screen === "spaces") {
      const floor = validated.floor ?? 1;
      const floors = (await client.query(floorsSql, [p])).rows;
      const slots = (await client.query<Slot>(`SELECT * FROM (${slotsSql(includeInternalStatus)}) scoped WHERE floor=$2 ORDER BY "order",id`, [p, floor])).rows;
      const groups = projectGroups((await client.query<Omit<SpaceGroup, "status">>(`SELECT * FROM (${groupsSql}) scoped WHERE floor=$2 ORDER BY id`, [p, floor])).rows, slots);
      data = { floors, slots, groups };
    } else if (screen === "slot") {
      const slots = (await client.query<Slot>(`SELECT * FROM (${slotsSql(includeInternalStatus)}) scoped WHERE id=$2 OR id IN (SELECT m.slot_id FROM leasing.spaces g JOIN LATERAL(SELECT id FROM leasing.space_versions WHERE space_id=g.id ORDER BY version_number DESC LIMIT 1) v ON true JOIN leasing.space_members m ON m.space_version_id=v.id WHERE g.property_id=$1 AND g.id=$2 AND g.is_admin_group AND g.retired_at IS NULL) ORDER BY "order",id`, [p, validated.id])).rows;
      if (!slots.length) throw new WorkspaceError("Slot not found", 404);
      const ids = slots.map(slot => slot.id);
      const groups = projectGroups((await client.query<Omit<SpaceGroup, "status">>(`SELECT * FROM (${groupsSql}) scoped WHERE "slotIds" && $2::uuid[] ORDER BY id`, [p, ids])).rows, slots);
      const requests = (await client.query<LeasingRequest>(`SELECT * FROM (${requestsSql}) scoped WHERE "slotIds" && $2::uuid[] ORDER BY received DESC,id DESC LIMIT 100`, [p, ids])).rows;
      const reservations = (await client.query<Reservation>(`SELECT * FROM (${reservationsSql}) scoped WHERE "slotIds" && $2::uuid[] ORDER BY "expiresAt" DESC,id DESC LIMIT 100`, [p, ids])).rows;
      const leases = (await client.query<Lease>(`SELECT * FROM (${leasesSql}) scoped WHERE "slotIds" && $2::uuid[] ORDER BY "recordedAt" DESC,id DESC LIMIT 100`, [p, ids])).rows;
      const companies = await relatedCompanies(client, identity, [...requests, ...reservations, ...leases].map(item => item.companyId));
      data = { slots, groups, requests, reservations, leases, companies };
    } else if (screen === "tenants") {
      const page = validated.page ?? 1, pageSize = validated.pageSize ?? 20, values: unknown[] = [p], conditions = ["(active_lease.id IS NOT NULL OR inventory.status IN ('Đã ký','Đã thuê'))"];
      const bind = (value: unknown) => { values.push(value); return "$" + values.length; };
      if (validated.floor) conditions.push(`inventory.floor=${bind(validated.floor)}`);
      if (validated.companyId) conditions.push(`active_lease.organization_id=${bind(validated.companyId)}::uuid`);
      if (validated.id) { const id = bind(validated.id); conditions.push(`(inventory.id=${id}::uuid OR active_lease.id=${id}::uuid)`); }
      if (validated.query) { const pattern = bind("%" + validated.query.replace(/[\\%_]/g, "\\$&") + "%"); conditions.push(`(inventory.tenant ILIKE ${pattern} OR inventory.code ILIKE ${pattern})`); }
      const occupied = `SELECT inventory.*,active_lease.id AS lease_id,active_lease.organization_id AS company_id,coalesce(active_lease.organization_id::text,'manual:'||inventory.id::text) AS tenant_key
       FROM (${slotsSql(includeInternalStatus)}) inventory LEFT JOIN LATERAL(SELECT l.id,l.organization_id FROM leasing.slot_allocations a JOIN leasing.leases l ON l.id=a.lease_id AND l.property_id=a.property_id WHERE a.property_id=$1 AND a.slot_id=inventory.id AND a.released_at IS NULL AND l.status='executed' AND l.occupancy_period @> CURRENT_DATE ORDER BY l.id LIMIT 1)active_lease ON true WHERE ${conditions.join(" AND ")}`;
      const totalItems = Number((await client.query(`SELECT count(DISTINCT tenant_key) AS count FROM (${occupied}) occupied`, values)).rows[0].count);
      const limit = bind(pageSize), offset = bind((page - 1) * pageSize);
      const rows = (await client.query<Slot & { lease_id: string | null; company_id: string | null; tenant_key: string }>(`WITH occupied AS (${occupied}),selected AS (SELECT tenant_key FROM occupied GROUP BY tenant_key ORDER BY min(tenant),tenant_key LIMIT ${limit} OFFSET ${offset}) SELECT occupied.* FROM occupied JOIN selected USING(tenant_key) ORDER BY tenant_key,floor,"order",id`, values)).rows;
      const leaseIds = [...new Set(rows.flatMap(row => row.lease_id ? [row.lease_id] : []))];
      const leases = (await client.query<Lease>(`SELECT * FROM (${leasesSql}) scoped WHERE id=ANY($2::uuid[]) ORDER BY "recordedAt" DESC,id DESC`, [p, leaseIds])).rows;
      const companies = await relatedCompanies(client, identity, rows.flatMap(row => row.company_id ? [row.company_id] : []));
      data = { slots: rows.map(({ lease_id: _, company_id: __, tenant_key: ___, ...slot }) => slot), leases, companies, page, pageSize, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / pageSize)) };
    } else {
      const page = validated.page ?? 1, pageSize = validated.pageSize ?? 20, values: unknown[] = [p], conditions: string[] = [];
      const bind = (value: unknown) => { values.push(value); return "$" + values.length; };
      if (validated.floor) conditions.push(`floor=${bind(validated.floor)}`);
      if (validated.companyId) conditions.push(`"companyId"=${bind(validated.companyId)}::uuid`);
      if (validated.reservationId) conditions.push(`"reservationId"=${bind(validated.reservationId)}::uuid`);
      if (validated.id) conditions.push(`(id=${bind(validated.id)}::uuid${screen === "requests" ? ` OR id IN (SELECT request_id FROM leasing.reservations WHERE property_id=$1 AND id=${bind(validated.id)}::uuid)` : ""})`);
      if (validated.status) {
        if (screen === "requests" && ["active", "expired", "cancelled", "converted"].includes(validated.status)) conditions.push(`EXISTS(SELECT 1 FROM leasing.reservations r WHERE r.property_id=$1 AND r.request_id=scoped.id AND r.status=${bind(validated.status)})`);
        else conditions.push(`status=${bind(validated.status)}`);
      }
      if (validated.query) {
        const pattern = bind("%" + validated.query.replace(/[\\%_]/g, "\\$&") + "%");
        conditions.push(`(scoped."referenceCode" ILIKE ${pattern} OR EXISTS(SELECT 1 FROM leasing.organizations o JOIN leasing.property_customers pc ON pc.organization_id=o.id WHERE pc.property_id=$1 AND pc.organization_id=scoped."companyId" AND pc.deleted_at IS NULL AND o.legal_name ILIKE ${pattern}) OR ${screen === "requests" ? "note" : '"rentNote"'} ILIKE ${pattern}${screen === "requests" ? "" : ` OR "referenceNumber" ILIKE ${pattern}`})`);
      }
      const base = screen === "requests" ? requestsSql : leasesSql, where = conditions.length ? " WHERE " + conditions.join(" AND ") : "";
      const totalItems = Number((await client.query(`SELECT count(*) AS count FROM (${base}) scoped${where}`, values)).rows[0].count);
      const limit = bind(pageSize), offset = bind((page - 1) * pageSize);
      const rows = (await client.query(`SELECT * FROM (${base}) scoped${where} ORDER BY ${screen === "requests" ? "received" : '"recordedAt"'} DESC,id DESC LIMIT ${limit} OFFSET ${offset}`, values)).rows;
      const metadata = { page, pageSize, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / pageSize)) };
      const companies = await relatedCompanies(client, identity, rows.map(row => row.companyId));
      const slotIds = [...new Set(rows.flatMap(row => row.slotIds as string[]))];
      const slots = (await client.query<Slot>(`SELECT * FROM (${slotsSql}) scoped WHERE id=ANY($2::uuid[]) ORDER BY floor,"order",id`, [p, slotIds])).rows;
      if (screen === "requests") {
        const reservations = (await client.query<Reservation>(`SELECT * FROM (${reservationsSql}) scoped WHERE "requestId"=ANY($2::uuid[]) ORDER BY "expiresAt" DESC,id DESC`, [p, rows.map(row => row.id)])).rows;
        const groups = projectGroups((await client.query<Omit<SpaceGroup, "status">>(`SELECT * FROM (${groupsSql}) scoped WHERE "slotIds" && $2::uuid[] ORDER BY id`, [p, slotIds])).rows, slots);
        data = { requests: rows as LeasingRequest[], reservations, companies, slots, groups, ...metadata };
      } else data = { leases: rows as Lease[], companies, slots, ...metadata };
    }
    return { revision, floorPlans, ...data } as unknown as AdminScreenResponse<S>;
  });
}
