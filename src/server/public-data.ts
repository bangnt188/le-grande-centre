import "server-only";
import { neon } from "@neondatabase/serverless";
import type { PublicWebsite } from "../shared/public/contracts";
import { WorkspaceError } from "./database";

const PUBLIC_PROJECTION_SQL = `
  WITH property AS (
    SELECT id FROM leasing.properties WHERE code = 'le-grande-centre'
  )
  SELECT
    jsonb_build_object(
      'logoMediaId', coalesce(w.logo_media_id::text, ''),
      'email', w.email,
      'hotline', w.hotline,
      'secondaryPhone', w.secondary_phone,
      'managementPhone', w.management_phone,
      'address', w.address,
      'zaloUrl', w.zalo_url
    ) AS website,
    (
      SELECT dv.public_url
      FROM leasing.document_versions dv
      JOIN leasing.documents d ON d.id = dv.document_id AND d.property_id = p.id
      JOIN leasing.media_object_state os ON os.document_version_id = dv.id AND os.property_id = p.id
      WHERE dv.id = w.logo_media_id AND dv.property_id = p.id
        AND dv.storage_provider = 'neon' AND dv.scan_state = 'clean'
        AND dv.content_type LIKE 'image/%' AND dv.deleted_at IS NULL
        AND os.state = 'ready' AND d.classification = 'public_media'
    ) AS "logoUrl",
    coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'number', f.floor_number,
        'publicTitle', f.public_title,
        'publicDescription', f.public_description,
        'plan', jsonb_build_object(
          'floor', f.floor_number,
          'versionId', pv.id,
          'coordinateSystem', pv.coordinate_system,
          'canvasWidth', pv.canvas_width::float8,
          'canvasHeight', pv.canvas_height::float8,
          'sourceDocument', CASE WHEN pv.coordinate_system LIKE 'architectural%' THEN NULL ELSE pv.source_document END,
          'sourcePage', CASE WHEN pv.coordinate_system LIKE 'architectural%' THEN NULL ELSE pv.source_page END,
          'sourceSheet', NULL,
          'orientation', pv.orientation_facts,
          'features', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
              'code', pf.feature_code,
              'kind', pf.feature_kind,
              'label', pf.label,
              'geometry', pf.geometry
            ) ORDER BY pf.display_order, pf.feature_code)
            FROM leasing.plan_features pf
            WHERE pf.plan_version_id = pv.id AND pf.property_id = p.id AND pf.floor_id = f.id
          ), '[]'::jsonb),
          'slots', '[]'::jsonb
        )
      ) ORDER BY f.floor_number)
      FROM leasing.floors f
      JOIN LATERAL (
        SELECT * FROM leasing.plan_versions
        WHERE property_id = p.id AND floor_id = f.id AND public_state IN ('reference','published')
        ORDER BY version_number DESC LIMIT 1
      ) pv ON true
      WHERE f.property_id = p.id
    ), '[]'::jsonb) AS floors,
    coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', s.id,
        'code', s.code,
        'floor', f.floor_number,
        'area', m.area_m2::float8,
        'geometry', v.geometry,
        'types', to_jsonb(v.public_types),
        'orientation', coalesce(v.orientation_description, ''),
        'dimensions', CASE WHEN jsonb_typeof(v.technical_spec->'dimensions')='object' THEN v.technical_spec->'dimensions' ELSE NULL END,
        'note', v.public_note,
        'status', CASE
          WHEN l.id IS NOT NULL THEN 'Đã thuê'
          WHEN s.operational_status IN ('Đang thuê','Đã thuê') THEN 'Đã thuê'
          WHEN s.operational_status IN ('Trống','Còn trống') THEN 'Còn trống'
          ELSE 'Liên hệ'
        END
      ) ORDER BY f.floor_number, s.display_order)
      FROM leasing.slots s
      JOIN leasing.floors f ON f.id = s.floor_id AND f.property_id = p.id
      JOIN LATERAL (
        SELECT id FROM leasing.plan_versions
        WHERE property_id = p.id AND floor_id = f.id AND public_state IN ('reference','published')
        ORDER BY version_number DESC LIMIT 1
      ) pv ON true
      JOIN LATERAL (
        SELECT id, plan_version_id, geometry, public_types, orientation_description, technical_spec, public_note
        FROM leasing.slot_versions
        WHERE slot_id = s.id AND property_id = p.id AND plan_version_id = pv.id
        ORDER BY version_number DESC LIMIT 1
      ) v ON true
      JOIN leasing.slot_measurements m
        ON m.slot_version_id = v.id AND m.area_kind = 'commercial_reference'
      LEFT JOIN leasing.slot_allocations a
        ON a.slot_id = s.id AND a.property_id = p.id
        AND a.lease_id IS NOT NULL AND a.released_at IS NULL
      LEFT JOIN leasing.leases l
        ON l.id = a.lease_id AND l.property_id = p.id AND l.status = 'executed'
      WHERE s.property_id = p.id AND s.retired_at IS NULL
    ), '[]'::jsonb) AS units
  FROM property p
  JOIN leasing.website_settings w ON w.property_id = p.id
`;

export async function readPublicWebsiteData(): Promise<PublicWebsite> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const sql = neon(connectionString, { fetchOptions: { cache: "no-store" } });

  // Keep the lock in its own statement: READ COMMITTED takes the projection's
  // snapshot after any pending property writer has committed and released it.
  const [, , propertyRows, projectionRows] = await sql.transaction([
    sql`SET LOCAL ROLE leasing_runtime`,
    sql`SELECT set_config('app.actor_id', 'public:read', true)`,
    sql`SELECT id FROM leasing.properties WHERE code = 'le-grande-centre' FOR SHARE`,
    sql.query(PUBLIC_PROJECTION_SQL),
  ], { isolationLevel: "ReadCommitted" });

  if (!propertyRows.length) throw new WorkspaceError("Website has not been initialized", 503);
  const projection = projectionRows[0] as PublicWebsite | undefined;
  if (!projection) throw new WorkspaceError("Property is not initialized", 503);
  return projection;
}
