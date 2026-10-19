BEGIN;
SELECT set_config('app.actor_id','system:architectural-reference-update',true);

CREATE TEMP TABLE lgc_architectural_slot_reference (
  floor_number smallint NOT NULL,
  code text NOT NULL,
  area_m2 numeric(14,4) NOT NULL,
  width_m numeric(12,3) NOT NULL,
  x_px integer NOT NULL,
  PRIMARY KEY (floor_number, code)
) ON COMMIT DROP;

INSERT INTO lgc_architectural_slot_reference VALUES
  (1,'A.1',179,10,0),
  (1,'A.2',147,8,100),
  (1,'A.3',147,8,180),
  (1,'A.4',147,8,260),
  (1,'A.5',147,8,340),
  (1,'A.6',131,8,500),
  (1,'A.7',147,8,580),
  (1,'A.8',147,8,660),
  (1,'A.9',147,8,740),
  (1,'A.10',147,8,820),
  (1,'A.11',179,10,900),
  (2,'B.1',193,10,0),
  (2,'B.2',158,8,100),
  (2,'B.3',158,8,180),
  (2,'B.4',158,8,260),
  (2,'B.5',164,8,340),
  (2,'B.6',164,8,500),
  (2,'B.7',158,8,580),
  (2,'B.8',158,8,660),
  (2,'B.9',158,8,740),
  (2,'B.10',158,8,820),
  (2,'B.11',193,10,900);

DO $migration$
DECLARE
  v_property_id uuid;
  floor_ref record;
  slot_ref record;
  current_slot record;
  current_space record;
  v_plan_version_id uuid;
  v_slot_version_id uuid;
  v_space_version_id uuid;
  source_page integer;
  source_sheet text;
  v_source_description text;
BEGIN
  SELECT id INTO v_property_id
  FROM leasing.properties
  WHERE code='le-grande-centre'
  FOR UPDATE;

  -- A fresh database receives the same source data from the approved seed after migrations.
  IF NOT FOUND THEN RETURN; END IF;

  IF (SELECT count(*) FROM lgc_architectural_slot_reference) <> 22 THEN
    RAISE EXCEPTION 'Architectural slot reference must contain exactly 22 rows';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM lgc_architectural_slot_reference r
    LEFT JOIN leasing.floors f
      ON f.property_id=v_property_id AND f.floor_number=r.floor_number
    LEFT JOIN leasing.slots s
      ON s.floor_id=f.id AND s.property_id=v_property_id AND s.code=r.code
    LEFT JOIN LATERAL (
      SELECT v.* FROM leasing.slot_versions v
      WHERE v.slot_id=s.id AND v.property_id=v_property_id AND v.floor_id=f.id
      ORDER BY v.version_number DESC LIMIT 1
    ) v ON true
    LEFT JOIN leasing.spaces sp
      ON sp.property_id=v_property_id AND sp.floor_id=f.id AND sp.code=r.code
    LEFT JOIN LATERAL (
      SELECT sv.* FROM leasing.space_versions sv
      WHERE sv.space_id=sp.id AND sv.property_id=v_property_id AND sv.floor_id=f.id
      ORDER BY sv.version_number DESC LIMIT 1
    ) sv ON true
    WHERE f.id IS NULL OR s.id IS NULL OR s.retired_at IS NOT NULL
      OR v.id IS NULL OR sp.id IS NULL OR sp.retired_at IS NOT NULL OR sv.id IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM leasing.slot_measurements m
        WHERE m.slot_version_id=v.id AND m.area_kind='commercial_reference'
      )
      OR NOT EXISTS (
        SELECT 1 FROM leasing.slot_frontages sf
        WHERE sf.slot_version_id=v.id AND sf.frontage_kind='external'
          AND sf.width_m=r.width_m
      )
      OR (SELECT count(*) FROM leasing.space_members sm WHERE sm.space_version_id=sv.id) <> 1
      OR NOT EXISTS (
        SELECT 1 FROM leasing.space_members sm
        WHERE sm.space_version_id=sv.id AND sm.slot_id=s.id
      )
  ) THEN
    RAISE EXCEPTION 'Floor 1/2 inventory differs from the expected 22-slot catalog; review before applying';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM lgc_architectural_slot_reference r
    JOIN leasing.floors f ON f.property_id=v_property_id AND f.floor_number=r.floor_number
    JOIN leasing.slots s ON s.floor_id=f.id AND s.code=r.code
    JOIN LATERAL (
      SELECT v.* FROM leasing.slot_versions v
      WHERE v.slot_id=s.id ORDER BY v.version_number DESC LIMIT 1
    ) v ON true
    WHERE v.published_at IS NOT NULL OR v.geometry IS NOT NULL OR v.depth_m IS NOT NULL
      OR EXISTS (
        SELECT 1 FROM leasing.slot_measurements m
        WHERE m.slot_version_id=v.id AND m.verification_state='verified'
      )
  ) OR EXISTS (
    SELECT 1
    FROM lgc_architectural_slot_reference r
    JOIN leasing.floors f ON f.property_id=v_property_id AND f.floor_number=r.floor_number
    JOIN leasing.spaces sp ON sp.property_id=v_property_id AND sp.floor_id=f.id AND sp.code=r.code
    JOIN LATERAL (
      SELECT sv.* FROM leasing.space_versions sv
      WHERE sv.space_id=sp.id ORDER BY sv.version_number DESC LIMIT 1
    ) sv ON true
    WHERE sv.published_at IS NOT NULL OR sv.geometry IS NOT NULL
      OR sv.measurement_state='verified' OR sv.inventory_basis='validated_plan'
  ) THEN
    RAISE EXCEPTION 'A floor 1/2 slot has surveyed, verified, published, or validated-plan data; manual source review is required';
  END IF;

  FOR floor_ref IN
    SELECT f.id, f.floor_number
    FROM leasing.floors f
    WHERE f.property_id=v_property_id AND f.floor_number IN (1,2)
    ORDER BY f.floor_number
  LOOP
    INSERT INTO leasing.plan_versions(property_id,floor_id,version_number,coordinate_system)
    SELECT v_property_id,floor_ref.id,coalesce(max(version_number),0)+1,
      'architectural-drawing-reference-not-surveyed'
    FROM leasing.plan_versions
    WHERE floor_id=floor_ref.id
    RETURNING id INTO v_plan_version_id;

    source_page := CASE floor_ref.floor_number WHEN 1 THEN 2 ELSE 3 END;
    source_sheet := CASE floor_ref.floor_number WHEN 1 THEN 'KT 13A-01' ELSE 'KT 13A-02' END;
    v_source_description := 'Architectural drawing 13-KIEN-TRUC-MB-MD-MC-2026.10.16.pdf PDF page '
      || source_page || ' (' || source_sheet || '); commercial reference, not survey';

    FOR slot_ref IN
      SELECT * FROM lgc_architectural_slot_reference
      WHERE floor_number=floor_ref.floor_number
      ORDER BY x_px
    LOOP
      SELECT s.id AS slot_id, v.id AS version_id, v.version_number, v.geometry,
        v.clear_height_m, v.technical_spec
      INTO current_slot
      FROM leasing.slots s
      JOIN LATERAL (
        SELECT * FROM leasing.slot_versions
        WHERE slot_id=s.id ORDER BY version_number DESC LIMIT 1
      ) v ON true
      WHERE s.property_id=v_property_id AND s.floor_id=floor_ref.id AND s.code=slot_ref.code;

      INSERT INTO leasing.slot_versions(
        property_id,floor_id,slot_id,plan_version_id,version_number,geometry,depth_m,clear_height_m,technical_spec
      ) VALUES (
        v_property_id,floor_ref.id,current_slot.slot_id,v_plan_version_id,current_slot.version_number+1,
        jsonb_build_object('x',slot_ref.x_px,'y',20,'width',slot_ref.width_m*10,'height',190),19,current_slot.clear_height_m,
        (current_slot.technical_spec - 'brochureDiagram' - 'referenceDiagram' - 'sourcePage' - 'dimensions' - 'coordinateMeaning')
          || jsonb_build_object(
            'dimensions',jsonb_build_object('width',slot_ref.width_m,'depth',19),
            'referenceSource',jsonb_build_object(
              'document','13-KIEN-TRUC-MB-MD-MC-2026.10.16.pdf',
              'pdfPage',source_page,
              'sheet',source_sheet,
              'basis','architectural reference; not surveyed'
            ),
            'coordinateMeaning','diagram-only-not-surveyed'
          )
      ) RETURNING id INTO v_slot_version_id;

      INSERT INTO leasing.slot_measurements(
        slot_version_id,area_kind,area_m2,standard_code,standard_edition,method_code,
        source_description,verification_state,measured_at,verified_by
      )
      SELECT v_slot_version_id,m.area_kind,
        CASE WHEN m.area_kind='commercial_reference' THEN slot_ref.area_m2 ELSE m.area_m2 END,
        CASE WHEN m.area_kind='commercial_reference' THEN NULL ELSE m.standard_code END,
        CASE WHEN m.area_kind='commercial_reference' THEN NULL ELSE m.standard_edition END,
        CASE WHEN m.area_kind='commercial_reference' THEN 'architectural_document_reference' ELSE m.method_code END,
        CASE WHEN m.area_kind='commercial_reference' THEN v_source_description ELSE m.source_description END,
        CASE WHEN m.area_kind='commercial_reference' THEN 'provisional' ELSE m.verification_state END,
        CASE WHEN m.area_kind='commercial_reference' THEN NULL ELSE m.measured_at END,
        CASE WHEN m.area_kind='commercial_reference' THEN NULL ELSE m.verified_by END
      FROM leasing.slot_measurements m
      WHERE m.slot_version_id=current_slot.version_id;

      INSERT INTO leasing.slot_frontages(slot_version_id,frontage_kind,width_m,azimuth_deg,source_description)
      SELECT v_slot_version_id,sf.frontage_kind,sf.width_m,sf.azimuth_deg,
        CASE WHEN sf.frontage_kind='external'
          THEN 'Architectural drawing reference; no inferred azimuth'
          ELSE sf.source_description END
      FROM leasing.slot_frontages sf
      WHERE sf.slot_version_id=current_slot.version_id;

      SELECT sp.id AS space_id, sv.id AS version_id, sv.version_number, sv.area_basis,
        sv.measurement_state, sv.geometry, sv.frontage_snapshot,
        sv.merge_conditions_snapshot, sv.inventory_basis
      INTO current_space
      FROM leasing.spaces sp
      JOIN LATERAL (
        SELECT * FROM leasing.space_versions
        WHERE space_id=sp.id ORDER BY version_number DESC LIMIT 1
      ) sv ON true
      WHERE sp.property_id=v_property_id AND sp.floor_id=floor_ref.id AND sp.code=slot_ref.code;

      INSERT INTO leasing.space_versions(
        property_id,floor_id,space_id,version_number,area_m2,area_basis,measurement_state,
        geometry,frontage_snapshot,merge_conditions_snapshot,inventory_basis
      ) VALUES (
        v_property_id,floor_ref.id,current_space.space_id,current_space.version_number+1,
        slot_ref.area_m2,
        'Architectural drawing reference ' || source_sheet || '; not surveyed',
        'provisional',current_space.geometry,current_space.frontage_snapshot,
        current_space.merge_conditions_snapshot,current_space.inventory_basis
      ) RETURNING id INTO v_space_version_id;

      INSERT INTO leasing.space_members(space_version_id,property_id,floor_id,slot_id,slot_version_id)
      VALUES(v_space_version_id,v_property_id,floor_ref.id,current_slot.slot_id,v_slot_version_id);
    END LOOP;
  END LOOP;
END;
$migration$;

COMMIT;
