-- Single PostgreSQL B2B baseline with audit columns and trigger.
-- Review docs/b2b-leasing-design.md and database/README.md before implementation.
-- No real property, customer, floor plan or slot inventory is seeded.
BEGIN;

-- Generic audit trigger for every leasing table, declared below.
CREATE SCHEMA row_audit;
REVOKE ALL ON SCHEMA row_audit FROM PUBLIC;
CREATE FUNCTION row_audit.stamp() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE
  actor text := current_setting('app.actor_id', true);
  stamp_time timestamptz := statement_timestamp();
BEGIN
  IF actor IS NULL OR actor !~ '[^[:space:]]' OR length(actor) > 255 THEN
    RAISE EXCEPTION 'app.actor_id must be set to a trusted internal identity';
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := stamp_time;
    NEW.created_by := actor;
  ELSE
    NEW.created_at := OLD.created_at;
    NEW.created_by := OLD.created_by;
  END IF;
  NEW.updated_at := stamp_time;
  NEW.updated_by := actor;
  IF NEW.deleted_at IS NULL THEN
    NEW.deleted_by := NULL;
  ELSIF TG_OP = 'INSERT' OR OLD.deleted_at IS NULL THEN
    NEW.deleted_at := stamp_time;
    NEW.deleted_by := actor;
  ELSE
    NEW.deleted_at := OLD.deleted_at;
    NEW.deleted_by := OLD.deleted_by;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION row_audit.stamp() FROM PUBLIC;

CREATE PROCEDURE row_audit.apply(schema_name text, table_names text[], baseline_actor text)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE table_name text;
BEGIN
  IF schema_name IS NULL OR schema_name !~ '[^[:space:]]' OR table_names IS NULL
     OR cardinality(table_names) = 0 OR baseline_actor IS NULL
     OR baseline_actor !~ '[^[:space:]]' OR length(baseline_actor) > 255 THEN
    RAISE EXCEPTION 'Explicit schema, tables, and baseline actor are required';
  END IF;
  FOREACH table_name IN ARRAY table_names LOOP
    IF to_regclass(format('%I.%I', schema_name, table_name)) IS NULL THEN
      RAISE EXCEPTION 'Baseline audit table %.% does not exist', schema_name, table_name;
    END IF;
  END LOOP;
  FOREACH table_name IN ARRAY table_names LOOP
    EXECUTE format('ALTER TABLE %I.%I
      ADD COLUMN IF NOT EXISTS created_at timestamptz,
      ADD COLUMN IF NOT EXISTS created_by text,
      ADD COLUMN IF NOT EXISTS updated_at timestamptz,
      ADD COLUMN IF NOT EXISTS updated_by text,
      ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
      ADD COLUMN IF NOT EXISTS deleted_by text', schema_name, table_name);
    EXECUTE format('UPDATE %I.%I SET
      created_at = coalesce(created_at, updated_at, statement_timestamp()),
      created_by = coalesce(created_by, $1),
      updated_at = coalesce(updated_at, created_at, statement_timestamp()),
      updated_by = coalesce(updated_by, $1),
      deleted_by = CASE WHEN deleted_at IS NULL THEN NULL ELSE coalesce(deleted_by, $1) END', schema_name, table_name) USING baseline_actor;
    EXECUTE format('ALTER TABLE %I.%I
      ALTER COLUMN created_at SET NOT NULL,
      ALTER COLUMN created_by SET NOT NULL,
      ALTER COLUMN updated_at SET NOT NULL,
      ALTER COLUMN updated_by SET NOT NULL,
      ADD CONSTRAINT %I CHECK ((deleted_at IS NULL) = (deleted_by IS NULL))', schema_name, table_name, table_name || '_audit_deleted_pair');
    EXECUTE format('CREATE TRIGGER row_audit_stamp BEFORE INSERT OR UPDATE ON %I.%I
      FOR EACH ROW EXECUTE FUNCTION row_audit.stamp()', schema_name, table_name);
  END LOOP;
END;
$$;
REVOKE ALL ON PROCEDURE row_audit.apply(text, text[], text) FROM PUBLIC;

CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE SCHEMA leasing;
REVOKE ALL ON SCHEMA leasing FROM PUBLIC;

CREATE TABLE leasing.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name text NOT NULL CHECK (length(legal_name) BETWEEN 1 AND 250),
  registration_number text,
  registration_country char(2) CHECK (registration_country ~ '^[A-Z]{2}$'),
  registered_address text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (registration_country, registration_number)
);
CREATE TABLE leasing.brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES leasing.organizations,
  name text NOT NULL,
  UNIQUE (id, organization_id)
);
CREATE TABLE leasing.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES leasing.organizations,
  display_name text NOT NULL,
  email text, phone text, job_title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id)
);
CREATE TABLE leasing.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_issuer text NOT NULL,
  auth_subject text NOT NULL,
  disabled_at timestamptz,
  UNIQUE (auth_issuer, auth_subject)
);
CREATE TABLE leasing.organization_memberships (
  organization_id uuid NOT NULL REFERENCES leasing.organizations,
  user_id uuid NOT NULL REFERENCES leasing.users,
  role_code text NOT NULL CHECK (role_code IN ('representative','viewer')),
  verified_by uuid REFERENCES leasing.users,
  verified_at timestamptz,
  revoked_at timestamptz,
  PRIMARY KEY (organization_id, user_id),
  CHECK ((verified_by IS NULL) = (verified_at IS NULL))
);
CREATE TABLE leasing.properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  owner_organization_id uuid NOT NULL REFERENCES leasing.organizations,
  timezone text NOT NULL DEFAULT 'Asia/Ho_Chi_Minh'
);
CREATE TABLE leasing.property_customers (
  property_id uuid NOT NULL REFERENCES leasing.properties,
  organization_id uuid NOT NULL REFERENCES leasing.organizations,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (property_id, organization_id)
);
CREATE TABLE leasing.staff_assignments (
  property_id uuid NOT NULL REFERENCES leasing.properties,
  user_id uuid NOT NULL REFERENCES leasing.users,
  role_code text NOT NULL CHECK (role_code IN ('leasing','legal','finance','operations','administrator')),
  revoked_at timestamptz,
  PRIMARY KEY (property_id, user_id, role_code)
);
CREATE TABLE leasing.floors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES leasing.properties,
  floor_number smallint NOT NULL CHECK (floor_number BETWEEN 1 AND 6),
  name text NOT NULL,
  UNIQUE (property_id, floor_number), UNIQUE (id, property_id)
);
CREATE TABLE leasing.plan_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL,
  floor_id uuid NOT NULL,
  version_number integer NOT NULL CHECK (version_number > 0),
  coordinate_system text NOT NULL DEFAULT 'floor-local-metres',
  public_state text NOT NULL DEFAULT 'internal',
  canvas_width numeric(12,3) NOT NULL DEFAULT 1000,
  canvas_height numeric(12,3) NOT NULL DEFAULT 250,
  source_document text,
  source_page integer,
  source_sheet text,
  orientation_facts jsonb,
  north_rotation_deg numeric(6,3) CHECK (north_rotation_deg >= 0 AND north_rotation_deg < 360),
  published_at timestamptz,
  approved_by uuid REFERENCES leasing.users,
  CONSTRAINT plan_versions_public_state CHECK (public_state IN ('internal','reference','published')),
  CONSTRAINT plan_versions_canvas_positive CHECK (canvas_width > 0 AND canvas_height > 0),
  CONSTRAINT plan_versions_source_page_positive CHECK (source_page IS NULL OR source_page > 0),
  CONSTRAINT plan_versions_orientation_object CHECK (orientation_facts IS NULL OR jsonb_typeof(orientation_facts) = 'object'),
  CONSTRAINT plan_versions_published_public_state CHECK (public_state <> 'published' OR published_at IS NOT NULL),
  UNIQUE (floor_id, version_number), UNIQUE (id, property_id, floor_id),
  FOREIGN KEY (floor_id, property_id) REFERENCES leasing.floors(id, property_id),
  CHECK ((published_at IS NULL) = (approved_by IS NULL))
);
CREATE TABLE leasing.plan_features (
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
CREATE TABLE leasing.slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL,
  floor_id uuid NOT NULL,
  code text NOT NULL,
  display_order integer NOT NULL CHECK (display_order > 0),
  core_zone text, -- side of lobby, NEVER an inferred compass direction
  retired_at timestamptz,
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  UNIQUE (floor_id, code), UNIQUE (id, property_id), UNIQUE (id, property_id, floor_id),
  FOREIGN KEY (floor_id, property_id) REFERENCES leasing.floors(id, property_id)
);
CREATE TABLE leasing.slot_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL,
  floor_id uuid NOT NULL,
  slot_id uuid NOT NULL,
  plan_version_id uuid NOT NULL,
  version_number integer NOT NULL CHECK (version_number > 0),
  geometry jsonb NOT NULL CHECK (jsonb_typeof(geometry) = 'object'),
  public_types text[] NOT NULL DEFAULT '{}',
  orientation_description text,
  public_note text NOT NULL DEFAULT '',
  depth_m numeric(12,3) CHECK (depth_m > 0),
  clear_height_m numeric(12,3) CHECK (clear_height_m > 0),
  technical_spec jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(technical_spec) = 'object'),
  approved_by uuid REFERENCES leasing.users,
  published_at timestamptz,
  UNIQUE (slot_id, version_number), UNIQUE (id, slot_id, property_id, floor_id),
  FOREIGN KEY (slot_id, property_id, floor_id) REFERENCES leasing.slots(id, property_id, floor_id),
  FOREIGN KEY (plan_version_id, property_id, floor_id) REFERENCES leasing.plan_versions(id, property_id, floor_id),
  CHECK ((published_at IS NULL) = (approved_by IS NULL))
);
CREATE TABLE leasing.slot_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_version_id uuid NOT NULL REFERENCES leasing.slot_versions,
  area_kind text NOT NULL CHECK (area_kind IN ('drawing','surveyed','commercial_reference')),
  area_m2 numeric(14,4) NOT NULL CHECK (area_m2 > 0),
  standard_code text, standard_edition text, method_code text,
  source_description text NOT NULL,
  verification_state text NOT NULL CHECK (verification_state IN ('provisional','verified')),
  measured_at date,
  verified_by uuid REFERENCES leasing.users,
  CHECK (verification_state <> 'verified' OR (verified_by IS NOT NULL AND measured_at IS NOT NULL)),
  UNIQUE (slot_version_id, area_kind)
);
CREATE TABLE leasing.slot_frontages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_version_id uuid NOT NULL REFERENCES leasing.slot_versions,
  frontage_kind text NOT NULL CHECK (frontage_kind IN ('external','corridor','entrance')),
  width_m numeric(12,3) CHECK (width_m > 0),
  azimuth_deg numeric(6,3) CHECK (azimuth_deg >= 0 AND azimuth_deg < 360),
  source_description text NOT NULL
);
CREATE TABLE leasing.slot_connections (
  property_id uuid NOT NULL,
  floor_id uuid NOT NULL,
  slot_a_id uuid NOT NULL,
  slot_b_id uuid NOT NULL,
  approval_state text NOT NULL CHECK (approval_state IN ('proposed','approved','blocked')),
  technical_conditions text NOT NULL DEFAULT '',
  approved_by uuid REFERENCES leasing.users,
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  PRIMARY KEY (slot_a_id, slot_b_id),
  CHECK (slot_a_id < slot_b_id),
  CHECK (approval_state <> 'approved' OR approved_by IS NOT NULL),
  FOREIGN KEY (slot_a_id, property_id, floor_id) REFERENCES leasing.slots(id, property_id, floor_id),
  FOREIGN KEY (slot_b_id, property_id, floor_id) REFERENCES leasing.slots(id, property_id, floor_id)
);
CREATE TABLE leasing.spaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL,
  floor_id uuid NOT NULL,
  code text NOT NULL,
  display_name text NOT NULL,
  retired_at timestamptz,
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  UNIQUE (property_id, code), UNIQUE (id, property_id, floor_id),
  FOREIGN KEY (floor_id, property_id) REFERENCES leasing.floors(id, property_id)
);
CREATE TABLE leasing.space_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL,
  floor_id uuid NOT NULL,
  space_id uuid NOT NULL,
  version_number integer NOT NULL CHECK (version_number > 0),
  area_m2 numeric(14,4) NOT NULL CHECK (area_m2 > 0),
  area_basis text NOT NULL,
  measurement_state text NOT NULL CHECK (measurement_state IN ('provisional','verified')),
  geometry jsonb NOT NULL CHECK (jsonb_typeof(geometry) = 'object'),
  frontage_snapshot jsonb NOT NULL CHECK (jsonb_typeof(frontage_snapshot) = 'array'),
  merge_conditions_snapshot text NOT NULL DEFAULT '',
  approved_by uuid REFERENCES leasing.users,
  published_at timestamptz,
  UNIQUE (space_id, version_number), UNIQUE (id, property_id), UNIQUE (id, property_id, floor_id),
  FOREIGN KEY (space_id, property_id, floor_id) REFERENCES leasing.spaces(id, property_id, floor_id),
  CHECK ((published_at IS NULL) = (approved_by IS NULL))
);
CREATE TABLE leasing.space_members (
  space_version_id uuid NOT NULL,
  property_id uuid NOT NULL,
  floor_id uuid NOT NULL,
  slot_id uuid NOT NULL,
  slot_version_id uuid NOT NULL,
  PRIMARY KEY (space_version_id, slot_id),
  FOREIGN KEY (space_version_id, property_id, floor_id) REFERENCES leasing.space_versions(id, property_id, floor_id),
  FOREIGN KEY (slot_version_id, slot_id, property_id, floor_id) REFERENCES leasing.slot_versions(id, slot_id, property_id, floor_id)
);
-- Overlapping candidate spaces are allowed. Exclusivity lives on slot_allocations.
CREATE TABLE leasing.workflow_statuses (
  domain text NOT NULL,
  code text NOT NULL,
  label text NOT NULL CHECK (length(label) BETWEEN 1 AND 60),
  display_order integer NOT NULL,
  PRIMARY KEY (domain, code)
);
INSERT INTO leasing.workflow_statuses VALUES
 ('request','submitted','Đã gửi',10), ('request','under_review','Đang xét duyệt',20),
 ('request','approved','Đã duyệt',30), ('request','rejected','Từ chối',40), ('request','withdrawn','Đã rút',50),
 ('reservation','active','Đang giữ chỗ',10), ('reservation','expired','Hết hạn',20),
 ('reservation','cancelled','Đã hủy',30), ('reservation','converted','Đã chuyển hợp đồng',40),
 ('lease','draft','Dự thảo',10), ('lease','executed','Đã ký',20), ('lease','closed','Đã kết thúc và giải phóng',30),
 ('appointment','requested','Đã yêu cầu',10), ('appointment','confirmed','Đã xác nhận',20),
 ('appointment','completed','Hoàn tất',30), ('appointment','cancelled','Đã hủy',40), ('appointment','no_show','Không tham dự',50);
CREATE TABLE leasing.leasing_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  contact_id uuid,
  brand_id uuid,
  industry_code text,
  requested_period daterange,
  requested_area_min_m2 numeric(14,4) CHECK (requested_area_min_m2 > 0),
  requested_area_max_m2 numeric(14,4) CHECK (requested_area_max_m2 > 0),
  budget_amount numeric(18,2) CHECK (budget_amount >= 0),
  currency char(3) CHECK (currency ~ '^[A-Z]{3}$'),
  budget_basis text,
  customer_note text NOT NULL DEFAULT '',
  internal_note text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','under_review','approved','rejected','withdrawn')),
  status_domain text GENERATED ALWAYS AS ('request') STORED,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  decision_by uuid REFERENCES leasing.users,
  decision_at timestamptz,
  decision_reason text,
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  UNIQUE (id, property_id), UNIQUE (id, property_id, organization_id),
  FOREIGN KEY (property_id, organization_id) REFERENCES leasing.property_customers,
  FOREIGN KEY (contact_id, organization_id) REFERENCES leasing.contacts(id, organization_id),
  FOREIGN KEY (brand_id, organization_id) REFERENCES leasing.brands(id, organization_id),
  FOREIGN KEY (status_domain, status) REFERENCES leasing.workflow_statuses,
  CHECK (requested_area_max_m2 >= requested_area_min_m2),
  CHECK ((budget_amount IS NULL) = (currency IS NULL)),
  CHECK (requested_period IS NULL OR (NOT isempty(requested_period) AND NOT lower_inf(requested_period) AND NOT upper_inf(requested_period))),
  CHECK ((decision_at IS NULL) = (decision_by IS NULL)),
  CHECK (status NOT IN ('approved','rejected') OR decision_at IS NOT NULL)
);
CREATE TABLE leasing.request_spaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL,
  request_id uuid NOT NULL,
  space_version_id uuid NOT NULL,
  acknowledged_at timestamptz,
  UNIQUE (request_id, space_version_id), UNIQUE (id, property_id, request_id),
  FOREIGN KEY (request_id, property_id) REFERENCES leasing.leasing_requests(id, property_id),
  FOREIGN KEY (space_version_id, property_id) REFERENCES leasing.space_versions(id, property_id)
);
CREATE TABLE leasing.reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  request_id uuid NOT NULL,
  request_space_id uuid NOT NULL,
  occupancy_period daterange NOT NULL CHECK (NOT isempty(occupancy_period) AND NOT lower_inf(occupancy_period) AND NOT upper_inf(occupancy_period)),
  held_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  approved_by uuid NOT NULL REFERENCES leasing.users,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','cancelled','converted')),
  status_domain text GENERATED ALWAYS AS ('reservation') STORED,
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  UNIQUE (id, property_id), UNIQUE (id, property_id, organization_id),
  FOREIGN KEY (request_id, property_id, organization_id) REFERENCES leasing.leasing_requests(id, property_id, organization_id),
  FOREIGN KEY (request_space_id, property_id, request_id) REFERENCES leasing.request_spaces(id, property_id, request_id),
  FOREIGN KEY (status_domain, status) REFERENCES leasing.workflow_statuses,
  CHECK (expires_at > held_at)
);
CREATE UNIQUE INDEX one_active_hold_per_request ON leasing.reservations(request_id) WHERE status = 'active';
CREATE TABLE leasing.reservation_extensions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES leasing.reservations,
  previous_expires_at timestamptz NOT NULL,
  new_expires_at timestamptz NOT NULL,
  approved_by uuid NOT NULL REFERENCES leasing.users,
  reason text NOT NULL CHECK (length(reason) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (new_expires_at > previous_expires_at)
);
CREATE TABLE leasing.leases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  reservation_id uuid,
  space_version_id uuid NOT NULL,
  reference_number text NOT NULL,
  occupancy_period daterange NOT NULL CHECK (NOT isempty(occupancy_period) AND NOT lower_inf(occupancy_period) AND NOT upper_inf(occupancy_period)),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','executed','closed')),
  status_domain text GENERATED ALWAYS AS ('lease') STORED,
  actual_handover_at timestamptz,
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  UNIQUE (property_id, reference_number), UNIQUE (id, property_id),
  FOREIGN KEY (property_id, organization_id) REFERENCES leasing.property_customers,
  FOREIGN KEY (reservation_id, property_id, organization_id) REFERENCES leasing.reservations(id, property_id, organization_id),
  FOREIGN KEY (space_version_id, property_id) REFERENCES leasing.space_versions(id, property_id),
  FOREIGN KEY (status_domain, status) REFERENCES leasing.workflow_statuses,
  CHECK (status <> 'closed' OR actual_handover_at IS NOT NULL)
);
CREATE UNIQUE INDEX one_lease_per_hold ON leasing.leases(reservation_id) WHERE reservation_id IS NOT NULL;
CREATE TABLE leasing.lease_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lease_id uuid NOT NULL,
  property_id uuid NOT NULL,
  version_number integer NOT NULL CHECK (version_number > 0),
  document_kind text NOT NULL CHECK (document_kind IN ('original','amendment')),
  contractual_period daterange NOT NULL CHECK (NOT isempty(contractual_period) AND NOT lower_inf(contractual_period) AND NOT upper_inf(contractual_period)),
  party_snapshot jsonb NOT NULL CHECK (jsonb_typeof(party_snapshot) = 'array'),
  space_snapshot jsonb NOT NULL CHECK (jsonb_typeof(space_snapshot) = 'object'),
  chargeable_area_m2 numeric(14,4) NOT NULL CHECK (chargeable_area_m2 > 0),
  chargeable_area_basis text NOT NULL,
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  rent_amount numeric(18,2) NOT NULL CHECK (rent_amount >= 0),
  rent_basis text NOT NULL,
  deposit_amount numeric(18,2) CHECK (deposit_amount >= 0),
  service_charge_amount numeric(18,2) CHECK (service_charge_amount >= 0),
  service_charge_basis text,
  tax_terms text NOT NULL,
  renewal_notice_due_on date,
  termination_notice_due_on date,
  notice_terms text NOT NULL DEFAULT '',
  signed_at timestamptz,
  executed_by uuid REFERENCES leasing.users,
  UNIQUE (lease_id, version_number), UNIQUE (id, property_id),
  FOREIGN KEY (lease_id, property_id) REFERENCES leasing.leases(id, property_id),
  CHECK ((signed_at IS NULL) = (executed_by IS NULL)),
  CHECK ((service_charge_amount IS NULL) = (service_charge_basis IS NULL))
);
CREATE TABLE leasing.slot_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL,
  slot_id uuid NOT NULL,
  reservation_id uuid,
  lease_id uuid,
  occupancy_period daterange NOT NULL CHECK (NOT isempty(occupancy_period) AND NOT lower_inf(occupancy_period) AND NOT upper_inf(occupancy_period)),
  released_at timestamptz,
  FOREIGN KEY (slot_id, property_id) REFERENCES leasing.slots(id, property_id),
  FOREIGN KEY (reservation_id, property_id) REFERENCES leasing.reservations(id, property_id),
  FOREIGN KEY (lease_id, property_id) REFERENCES leasing.leases(id, property_id),
  CHECK (num_nonnulls(reservation_id, lease_id) = 1),
  EXCLUDE USING gist (slot_id WITH =, occupancy_period WITH &&) WHERE (released_at IS NULL)
);
CREATE UNIQUE INDEX hold_slot_once ON leasing.slot_allocations(reservation_id, slot_id) WHERE released_at IS NULL AND reservation_id IS NOT NULL;
CREATE UNIQUE INDEX lease_slot_once ON leasing.slot_allocations(lease_id, slot_id) WHERE released_at IS NULL AND lease_id IS NOT NULL;
CREATE TABLE leasing.appointment_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES leasing.properties,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('staff','room')),
  staff_user_id uuid REFERENCES leasing.users,
  UNIQUE (id, property_id),
  CHECK ((kind = 'staff') = (staff_user_id IS NOT NULL))
);
CREATE TABLE leasing.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  request_id uuid,
  purpose text NOT NULL,
  scheduled_period tstzrange NOT NULL CHECK (NOT isempty(scheduled_period) AND NOT lower_inf(scheduled_period) AND NOT upper_inf(scheduled_period) AND lower_inc(scheduled_period) AND NOT upper_inc(scheduled_period)),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','confirmed','completed','cancelled','no_show')),
  status_domain text GENERATED ALWAYS AS ('appointment') STORED,
  meeting_location text,
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  UNIQUE (id, property_id), UNIQUE (id, organization_id),
  FOREIGN KEY (property_id, organization_id) REFERENCES leasing.property_customers,
  FOREIGN KEY (request_id, property_id, organization_id) REFERENCES leasing.leasing_requests(id, property_id, organization_id),
  FOREIGN KEY (status_domain, status) REFERENCES leasing.workflow_statuses
);
CREATE TABLE leasing.appointment_participants (
  appointment_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  contact_id uuid NOT NULL,
  PRIMARY KEY (appointment_id, contact_id),
  FOREIGN KEY (appointment_id, organization_id) REFERENCES leasing.appointments(id, organization_id),
  FOREIGN KEY (contact_id, organization_id) REFERENCES leasing.contacts(id, organization_id)
);
CREATE TABLE leasing.resource_bookings (
  appointment_id uuid NOT NULL,
  resource_id uuid NOT NULL,
  property_id uuid NOT NULL,
  scheduled_period tstzrange NOT NULL CHECK (NOT isempty(scheduled_period) AND NOT lower_inf(scheduled_period) AND NOT upper_inf(scheduled_period) AND lower_inc(scheduled_period) AND NOT upper_inc(scheduled_period)),
  released_at timestamptz,
  PRIMARY KEY (appointment_id, resource_id),
  FOREIGN KEY (appointment_id, property_id) REFERENCES leasing.appointments(id, property_id),
  FOREIGN KEY (resource_id, property_id) REFERENCES leasing.appointment_resources(id, property_id),
  EXCLUDE USING gist (resource_id WITH =, scheduled_period WITH &&) WHERE (released_at IS NULL)
);
CREATE TABLE leasing.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES leasing.properties,
  organization_id uuid,
  classification text NOT NULL CHECK (classification IN ('public_media','business_private','contract_private')),
  title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, property_id),
  FOREIGN KEY (property_id, organization_id) REFERENCES leasing.property_customers
);
CREATE TABLE leasing.document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL,
  document_id uuid NOT NULL,
  version_number integer NOT NULL CHECK (version_number > 0),
  storage_provider text NOT NULL DEFAULT 'r2',
  bucket_name text NOT NULL,
  object_key text NOT NULL,
  content_type text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size > 0),
  sha256 char(64) NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  scan_state text NOT NULL DEFAULT 'pending' CHECK (scan_state IN ('pending','clean','rejected')),
  original_filename text NOT NULL,
  uploaded_by uuid NOT NULL REFERENCES leasing.users,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  sealed_at timestamptz,
  UNIQUE (document_id, version_number), UNIQUE (id, property_id),
  UNIQUE (storage_provider, bucket_name, object_key),
  FOREIGN KEY (document_id, property_id) REFERENCES leasing.documents(id, property_id),
  CHECK (sealed_at IS NULL OR scan_state = 'clean')
);
-- Retention is mutable/audited separately from sealed bytes metadata.
CREATE TABLE leasing.document_retention (
  document_version_id uuid PRIMARY KEY,
  property_id uuid NOT NULL,
  retention_until timestamptz,
  legal_hold boolean NOT NULL DEFAULT false,
  policy_reference text NOT NULL,
  policy_updated_by uuid NOT NULL REFERENCES leasing.users,
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (document_version_id, property_id) REFERENCES leasing.document_versions(id, property_id)
);
CREATE TABLE leasing.document_access_grants (
  document_id uuid NOT NULL,
  property_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES leasing.users,
  granted_by uuid NOT NULL REFERENCES leasing.users,
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  PRIMARY KEY (document_id, user_id),
  FOREIGN KEY (document_id, property_id) REFERENCES leasing.documents(id, property_id),
  CHECK (expires_at IS NULL OR expires_at > granted_at)
);
CREATE TABLE leasing.lease_documents (
  lease_version_id uuid NOT NULL,
  document_version_id uuid NOT NULL,
  property_id uuid NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('signed_original','attachment')),
  PRIMARY KEY (lease_version_id, document_version_id),
  FOREIGN KEY (lease_version_id, property_id) REFERENCES leasing.lease_versions(id, property_id),
  FOREIGN KEY (document_version_id, property_id) REFERENCES leasing.document_versions(id, property_id)
);
CREATE TABLE leasing.plan_documents (
  plan_version_id uuid NOT NULL,
  document_version_id uuid NOT NULL,
  property_id uuid NOT NULL,
  floor_id uuid NOT NULL,
  PRIMARY KEY (plan_version_id, document_version_id),
  FOREIGN KEY (plan_version_id, property_id, floor_id) REFERENCES leasing.plan_versions(id, property_id, floor_id),
  FOREIGN KEY (document_version_id, property_id) REFERENCES leasing.document_versions(id, property_id)
);
CREATE TABLE leasing.space_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL,
  space_version_id uuid NOT NULL,
  public_state text NOT NULL CHECK (public_state IN ('accepting_requests','coming_soon','unavailable')),
  availability_precision text NOT NULL CHECK (availability_precision IN ('unknown','date','month','quarter')),
  available_from date,
  public_note text NOT NULL DEFAULT '' CHECK (length(public_note) <= 500),
  approved_by uuid NOT NULL REFERENCES leasing.users,
  approved_at timestamptz NOT NULL,
  review_due_at timestamptz NOT NULL,
  withdrawn_at timestamptz,
  FOREIGN KEY (space_version_id, property_id) REFERENCES leasing.space_versions(id, property_id),
  CHECK ((availability_precision = 'unknown') = (available_from IS NULL)),
  CHECK (review_due_at > approved_at)
);
CREATE UNIQUE INDEX one_live_publication_per_space_version ON leasing.space_publications(space_version_id) WHERE withdrawn_at IS NULL;
CREATE TABLE leasing.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES leasing.properties,
  actor_user_id uuid REFERENCES leasing.users,
  system_actor text,
  action_code text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(actor_user_id, system_actor) = 1)
);
CREATE TABLE leasing.command_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES leasing.properties,
  actor_user_id uuid NOT NULL REFERENCES leasing.users,
  idempotency_key text NOT NULL,
  request_sha256 char(64) NOT NULL CHECK (request_sha256 ~ '^[a-f0-9]{64}$'),
  command_code text NOT NULL,
  result_entity_id uuid NOT NULL,
  result_revision bigint NOT NULL CHECK (result_revision >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, actor_user_id, idempotency_key)
);
CREATE TABLE leasing.outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES leasing.properties,
  topic text NOT NULL,
  entity_id uuid NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(payload) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0)
);
CREATE INDEX requests_customer ON leasing.leasing_requests(property_id, organization_id, submitted_at DESC);
CREATE INDEX reservations_expiry ON leasing.reservations(expires_at) WHERE status = 'active';
CREATE INDEX allocations_hold ON leasing.slot_allocations(reservation_id) WHERE released_at IS NULL;
CREATE INDEX allocations_lease ON leasing.slot_allocations(lease_id) WHERE released_at IS NULL;
CREATE INDEX documents_customer ON leasing.documents(property_id, organization_id);
CREATE INDEX appointments_time ON leasing.appointments(property_id, lower(scheduled_period));
CREATE INDEX outbox_pending ON leasing.outbox_events(created_at) WHERE published_at IS NULL;

-- Add audit fields before the frozen/append-only business guards.
CALL row_audit.apply('leasing', ARRAY['organizations', 'brands', 'contacts', 'users', 'organization_memberships', 'properties', 'property_customers', 'staff_assignments', 'floors', 'plan_versions', 'slots', 'slot_versions', 'slot_measurements', 'slot_frontages', 'slot_connections', 'spaces', 'space_versions', 'space_members', 'workflow_statuses', 'leasing_requests', 'request_spaces', 'reservations', 'reservation_extensions', 'leases', 'lease_versions', 'slot_allocations', 'appointment_resources', 'appointments', 'appointment_participants', 'resource_bookings', 'documents', 'document_versions', 'document_retention', 'document_access_grants', 'lease_documents', 'plan_documents', 'space_publications', 'audit_events', 'command_receipts', 'outbox_events'], 'system:baseline-v2');

-- Freeze published/signed/sealed records. Changes create a new version.
CREATE FUNCTION leasing.reject_frozen_version_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF to_jsonb(OLD)->>TG_ARGV[0] IS NOT NULL THEN
    RAISE EXCEPTION 'Frozen % record requires a new version', TG_TABLE_NAME;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER immutable_plan BEFORE UPDATE OR DELETE ON leasing.plan_versions FOR EACH ROW EXECUTE FUNCTION leasing.reject_frozen_version_change('published_at');
CREATE TRIGGER immutable_slot_version BEFORE UPDATE OR DELETE ON leasing.slot_versions FOR EACH ROW EXECUTE FUNCTION leasing.reject_frozen_version_change('published_at');
CREATE TRIGGER immutable_space_version BEFORE UPDATE OR DELETE ON leasing.space_versions FOR EACH ROW EXECUTE FUNCTION leasing.reject_frozen_version_change('published_at');
CREATE TRIGGER immutable_signed_terms BEFORE UPDATE OR DELETE ON leasing.lease_versions FOR EACH ROW EXECUTE FUNCTION leasing.reject_frozen_version_change('signed_at');
CREATE TRIGGER immutable_document_version BEFORE UPDATE OR DELETE ON leasing.document_versions FOR EACH ROW EXECUTE FUNCTION leasing.reject_frozen_version_change('sealed_at');

-- Child data cannot alter a published/signed snapshot indirectly.
CREATE FUNCTION leasing.reject_frozen_child_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  old_data jsonb := CASE WHEN TG_OP = 'INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
  new_data jsonb := CASE WHEN TG_OP = 'DELETE' THEN '{}'::jsonb ELSE to_jsonb(NEW) END;
  parent_id uuid; frozen boolean;
BEGIN
  FOREACH parent_id IN ARRAY ARRAY[(old_data->>TG_ARGV[1])::uuid, (new_data->>TG_ARGV[1])::uuid] LOOP
    IF parent_id IS NULL THEN CONTINUE; END IF;
    EXECUTE format('SELECT %I IS NOT NULL FROM leasing.%I WHERE id = $1 FOR SHARE', TG_ARGV[2], TG_ARGV[0]) INTO frozen USING parent_id;
    IF frozen THEN RAISE EXCEPTION 'Child of frozen % cannot change', TG_ARGV[0]; END IF;
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER immutable_plan_feature BEFORE INSERT OR UPDATE OR DELETE ON leasing.plan_features FOR EACH ROW EXECUTE FUNCTION leasing.reject_frozen_child_change('plan_versions','plan_version_id','published_at');
CREATE TRIGGER immutable_members BEFORE INSERT OR UPDATE OR DELETE ON leasing.space_members FOR EACH ROW EXECUTE FUNCTION leasing.reject_frozen_child_change('space_versions','space_version_id','published_at');
CREATE TRIGGER immutable_measurements BEFORE INSERT OR UPDATE OR DELETE ON leasing.slot_measurements FOR EACH ROW EXECUTE FUNCTION leasing.reject_frozen_child_change('slot_versions','slot_version_id','published_at');
CREATE TRIGGER immutable_frontages BEFORE INSERT OR UPDATE OR DELETE ON leasing.slot_frontages FOR EACH ROW EXECUTE FUNCTION leasing.reject_frozen_child_change('slot_versions','slot_version_id','published_at');
CREATE TRIGGER immutable_lease_links BEFORE INSERT OR UPDATE OR DELETE ON leasing.lease_documents FOR EACH ROW EXECUTE FUNCTION leasing.reject_frozen_child_change('lease_versions','lease_version_id','signed_at');
CREATE TRIGGER immutable_plan_links BEFORE INSERT OR UPDATE OR DELETE ON leasing.plan_documents FOR EACH ROW EXECUTE FUNCTION leasing.reject_frozen_child_change('plan_versions','plan_version_id','published_at');

CREATE FUNCTION leasing.reject_history_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Append-only history % cannot be updated or deleted', TG_TABLE_NAME;
END;
$$;
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON leasing.audit_events FOR EACH ROW EXECUTE FUNCTION leasing.reject_history_change();
CREATE TRIGGER immutable_receipts BEFORE UPDATE OR DELETE ON leasing.command_receipts FOR EACH ROW EXECUTE FUNCTION leasing.reject_history_change();
CREATE TRIGGER immutable_extensions BEFORE UPDATE OR DELETE ON leasing.reservation_extensions FOR EACH ROW EXECUTE FUNCTION leasing.reject_history_change();

-- Deferred assertions reject partial holds/leases at transaction COMMIT.
-- They deliberately do not use now() in the overlap predicate: commands must
-- expire stale holds under the slot locks before acquiring new allocations.
CREATE FUNCTION leasing.assert_commitment_allocation(kind text, commitment_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  blocks_inventory boolean; version_id uuid; expected_period daterange;
  expected_slots uuid[]; actual_slots uuid[]; published boolean;
BEGIN
  IF commitment_id IS NULL THEN RETURN; END IF;
  IF kind = 'reservation' THEN
    SELECT r.status = 'active', rs.space_version_id, r.occupancy_period
      INTO blocks_inventory, version_id, expected_period
      FROM leasing.reservations r JOIN leasing.request_spaces rs ON rs.id = r.request_space_id
      WHERE r.id = commitment_id FOR SHARE OF r, rs;
    IF NOT FOUND THEN RETURN; END IF;
    IF blocks_inventory AND NOT EXISTS (
      SELECT 1 FROM leasing.reservations r
      JOIN leasing.leasing_requests q ON q.id = r.request_id
      JOIN leasing.request_spaces rs ON rs.id = r.request_space_id
      WHERE r.id = commitment_id AND q.status = 'approved' AND rs.acknowledged_at IS NOT NULL
    ) THEN RAISE EXCEPTION 'Active hold requires approved request and acknowledged version'; END IF;
  ELSIF kind = 'lease' THEN
    SELECT status = 'executed', space_version_id, occupancy_period
      INTO blocks_inventory, version_id, expected_period
      FROM leasing.leases WHERE id = commitment_id FOR SHARE;
    IF NOT FOUND THEN RETURN; END IF;
    IF blocks_inventory AND NOT EXISTS (
      SELECT 1 FROM leasing.lease_versions v
      JOIN leasing.lease_documents ld ON ld.lease_version_id = v.id AND ld.purpose = 'signed_original'
      JOIN leasing.document_versions dv ON dv.id = ld.document_version_id
      JOIN leasing.documents d ON d.id = dv.document_id
      JOIN leasing.leases l ON l.id = v.lease_id
      WHERE v.lease_id = commitment_id AND v.signed_at IS NOT NULL
        AND dv.scan_state = 'clean' AND dv.sealed_at IS NOT NULL AND dv.content_type = 'application/pdf'
        AND d.classification = 'contract_private' AND d.organization_id = l.organization_id
    ) THEN RAISE EXCEPTION 'Executed lease requires a clean sealed signed contract document'; END IF;
  ELSE RAISE EXCEPTION 'Unknown commitment kind'; END IF;

  SELECT array_agg(slot_id ORDER BY slot_id) INTO actual_slots
    FROM leasing.slot_allocations
    WHERE released_at IS NULL AND
      ((kind = 'reservation' AND reservation_id = commitment_id) OR (kind = 'lease' AND lease_id = commitment_id));
  IF NOT blocks_inventory THEN
    IF actual_slots IS NOT NULL THEN RAISE EXCEPTION 'Inactive commitment must release all allocations'; END IF;
    RETURN;
  END IF;
  SELECT published_at IS NOT NULL INTO published FROM leasing.space_versions WHERE id = version_id;
  IF NOT coalesce(published, false) THEN RAISE EXCEPTION 'Commitment requires a published space version'; END IF;
  SELECT array_agg(slot_id ORDER BY slot_id) INTO expected_slots FROM leasing.space_members WHERE space_version_id = version_id;
  IF expected_slots IS NULL OR expected_slots IS DISTINCT FROM actual_slots THEN
    RAISE EXCEPTION 'Commitment must allocate exactly all member slots';
  END IF;
  IF EXISTS (
    SELECT 1 FROM leasing.slot_allocations WHERE released_at IS NULL
      AND ((kind = 'reservation' AND reservation_id = commitment_id) OR (kind = 'lease' AND lease_id = commitment_id))
      AND occupancy_period IS DISTINCT FROM expected_period
  ) THEN RAISE EXCEPTION 'Allocation periods must match the commitment'; END IF;
END;
$$;
CREATE FUNCTION leasing.check_commitment_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  old_data jsonb := CASE WHEN TG_OP = 'INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
  new_data jsonb := CASE WHEN TG_OP = 'DELETE' THEN '{}'::jsonb ELSE to_jsonb(NEW) END;
  hold_ids uuid[]; lease_ids uuid[]; value uuid;
BEGIN
  IF TG_ARGV[0] = 'reservation' THEN
    hold_ids := ARRAY[(old_data->>'id')::uuid, (new_data->>'id')::uuid];
    lease_ids := ARRAY[]::uuid[];
  ELSIF TG_ARGV[0] = 'lease' THEN
    hold_ids := ARRAY[]::uuid[];
    lease_ids := ARRAY[(old_data->>'id')::uuid, (new_data->>'id')::uuid];
  ELSE
    hold_ids := ARRAY[(old_data->>'reservation_id')::uuid, (new_data->>'reservation_id')::uuid];
    lease_ids := ARRAY[(old_data->>'lease_id')::uuid, (new_data->>'lease_id')::uuid];
  END IF;
  FOREACH value IN ARRAY hold_ids LOOP PERFORM leasing.assert_commitment_allocation('reservation', value); END LOOP;
  FOREACH value IN ARRAY lease_ids LOOP PERFORM leasing.assert_commitment_allocation('lease', value); END LOOP;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER complete_hold AFTER INSERT OR UPDATE OR DELETE ON leasing.reservations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION leasing.check_commitment_change('reservation');
CREATE CONSTRAINT TRIGGER complete_lease AFTER INSERT OR UPDATE OR DELETE ON leasing.leases DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION leasing.check_commitment_change('lease');
CREATE CONSTRAINT TRIGGER complete_allocation AFTER INSERT OR UPDATE OR DELETE ON leasing.slot_allocations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION leasing.check_commitment_change('allocation');

CREATE FUNCTION leasing.reject_reserved_option_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM leasing.reservations WHERE request_space_id = OLD.id) THEN
    RAISE EXCEPTION 'Reserved request option is immutable; create a new option';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER immutable_reserved_option BEFORE UPDATE OR DELETE ON leasing.request_spaces FOR EACH ROW EXECUTE FUNCTION leasing.reject_reserved_option_change();

-- Fail closed for non-owner roles. Runtime roles + scoped policies are deliberately
-- not provisioned in a design draft. Owner/BYPASSRLS must NEVER be runtime access.
DO $$
DECLARE table_name text;
BEGIN
  FOR table_name IN SELECT tablename FROM pg_tables WHERE schemaname = 'leasing' LOOP
    EXECUTE format('ALTER TABLE leasing.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE leasing.%I FROM PUBLIC', table_name);
  END LOOP;
END;
$$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA leasing FROM PUBLIC;
-- Production gate: execute/review this draft on a disposable DB; implement
-- command transactions, workflow transitions, geometry validation, scoped RLS
-- and grants. Deferred assertions are draft code, not runtime-verified evidence.
COMMIT;
