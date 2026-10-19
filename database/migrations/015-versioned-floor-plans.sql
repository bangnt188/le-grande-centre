BEGIN;
SELECT set_config('app.actor_id','system:migration',true);

ALTER TABLE leasing.plan_versions
  ADD COLUMN IF NOT EXISTS public_state text NOT NULL DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS canvas_width numeric(12,3) NOT NULL DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS canvas_height numeric(12,3) NOT NULL DEFAULT 250,
  ADD COLUMN IF NOT EXISTS source_document text,
  ADD COLUMN IF NOT EXISTS source_page integer,
  ADD COLUMN IF NOT EXISTS source_sheet text,
  ADD COLUMN IF NOT EXISTS orientation_facts jsonb;
ALTER TABLE leasing.slot_versions
  ADD COLUMN IF NOT EXISTS public_types text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS orientation_description text,
  ADD COLUMN IF NOT EXISTS public_note text NOT NULL DEFAULT '';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='leasing.plan_versions'::regclass AND conname='plan_versions_canvas_positive') THEN
    ALTER TABLE leasing.plan_versions ADD CONSTRAINT plan_versions_canvas_positive CHECK(canvas_width > 0 AND canvas_height > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='leasing.plan_versions'::regclass AND conname='plan_versions_public_state') THEN
    ALTER TABLE leasing.plan_versions ADD CONSTRAINT plan_versions_public_state CHECK(public_state IN ('internal','reference','published'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='leasing.plan_versions'::regclass AND conname='plan_versions_source_page_positive') THEN
    ALTER TABLE leasing.plan_versions ADD CONSTRAINT plan_versions_source_page_positive CHECK(source_page IS NULL OR source_page > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='leasing.plan_versions'::regclass AND conname='plan_versions_published_public_state') THEN
    ALTER TABLE leasing.plan_versions ADD CONSTRAINT plan_versions_published_public_state CHECK(public_state <> 'published' OR published_at IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='leasing.plan_versions'::regclass AND conname='plan_versions_orientation_object') THEN
    ALTER TABLE leasing.plan_versions ADD CONSTRAINT plan_versions_orientation_object CHECK(orientation_facts IS NULL OR jsonb_typeof(orientation_facts)='object');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS leasing.plan_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL,
  floor_id uuid NOT NULL,
  plan_version_id uuid NOT NULL,
  feature_code text NOT NULL CHECK (length(feature_code) BETWEEN 1 AND 80),
  feature_kind text NOT NULL CHECK (feature_kind IN ('shared_area','corridor','lobby','void','amenity','circulation')),
  label text NOT NULL CHECK (length(label) BETWEEN 1 AND 200),
  geometry jsonb NOT NULL CHECK (jsonb_typeof(geometry) = 'object'),
  display_order integer NOT NULL CHECK (display_order > 0),
  source_note text NOT NULL DEFAULT '',
  UNIQUE (plan_version_id, feature_code),
  FOREIGN KEY (plan_version_id, property_id, floor_id) REFERENCES leasing.plan_versions(id, property_id, floor_id)
);
CREATE INDEX IF NOT EXISTS plan_features_floor_order ON leasing.plan_features(property_id, floor_id, plan_version_id, display_order);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='leasing.plan_features'::regclass AND tgname='row_audit_stamp' AND NOT tgisinternal) THEN
    CALL row_audit.apply('leasing', ARRAY['plan_features'], 'system:floor-plan-baseline');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='leasing.plan_features'::regclass AND tgname='immutable_plan_feature' AND NOT tgisinternal) THEN
    CREATE TRIGGER immutable_plan_feature BEFORE INSERT OR UPDATE OR DELETE ON leasing.plan_features
      FOR EACH ROW EXECUTE FUNCTION leasing.reject_frozen_child_change('plan_versions','plan_version_id','published_at');
  END IF;
END $$;

ALTER TABLE leasing.plan_features ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON leasing.plan_features FROM PUBLIC;
REVOKE INSERT,UPDATE,DELETE ON leasing.plan_features FROM leasing_runtime;
GRANT SELECT ON leasing.plan_features TO leasing_runtime;
REVOKE INSERT,UPDATE,DELETE ON leasing.plan_versions FROM leasing_runtime;
GRANT SELECT ON leasing.plan_versions TO leasing_runtime;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='leasing' AND tablename='plan_features' AND policyname='trusted_server_transaction') THEN
    CREATE POLICY trusted_server_transaction ON leasing.plan_features TO leasing_runtime
      USING (coalesce(current_setting('app.actor_id',true),'')<>'')
      WITH CHECK (coalesce(current_setting('app.actor_id',true),'')<>'');
  END IF;
END $$;

COMMIT;
