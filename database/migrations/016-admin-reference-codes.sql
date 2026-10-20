BEGIN;
SELECT set_config('app.actor_id','system:migration',true);

-- Human-facing lookup codes are separate from UUID primary keys and are never
-- authorization credentials. Sequence gaps after rollback are expected.
CREATE SEQUENCE leasing.leasing_request_reference_code_seq AS bigint START WITH 1;
CREATE SEQUENCE leasing.reservation_reference_code_seq AS bigint START WITH 1;
CREATE SEQUENCE leasing.lease_reference_code_seq AS bigint START WITH 1;

ALTER TABLE leasing.leasing_requests ADD COLUMN reference_code text;
ALTER TABLE leasing.reservations ADD COLUMN reference_code text;
ALTER TABLE leasing.leases ADD COLUMN reference_code text;

WITH numbered AS (
  SELECT id, row_number() OVER (ORDER BY submitted_at, id) AS number
  FROM leasing.leasing_requests
)
UPDATE leasing.leasing_requests AS requests
SET reference_code = 'LGC-YC-' || to_char(numbered.number, 'FM00000')
FROM numbered
WHERE requests.id = numbered.id;

WITH numbered AS (
  SELECT id, row_number() OVER (ORDER BY held_at, id) AS number
  FROM leasing.reservations
)
UPDATE leasing.reservations AS reservations
SET reference_code = 'LGC-GC-' || to_char(numbered.number, 'FM00000')
FROM numbered
WHERE reservations.id = numbered.id;

WITH numbered AS (
  SELECT id, row_number() OVER (ORDER BY id) AS number
  FROM leasing.leases
)
UPDATE leasing.leases AS leases
SET reference_code = 'LGC-HD-' || to_char(numbered.number, 'FM00000')
FROM numbered
WHERE leases.id = numbered.id;

SELECT setval('leasing.leasing_request_reference_code_seq', COALESCE(MAX(substring(reference_code FROM 8)::bigint), 1), COUNT(*) > 0) FROM leasing.leasing_requests;
SELECT setval('leasing.reservation_reference_code_seq', COALESCE(MAX(substring(reference_code FROM 8)::bigint), 1), COUNT(*) > 0) FROM leasing.reservations;
SELECT setval('leasing.lease_reference_code_seq', COALESCE(MAX(substring(reference_code FROM 8)::bigint), 1), COUNT(*) > 0) FROM leasing.leases;

-- Backfilling existing holds/leases queues their deferred completeness checks.
-- Validate them before ALTER TABLE; do not disable the integrity triggers.
SET CONSTRAINTS ALL IMMEDIATE;

ALTER TABLE leasing.leasing_requests
  ALTER COLUMN reference_code SET DEFAULT ('LGC-YC-' || to_char(nextval('leasing.leasing_request_reference_code_seq'), 'FM00000')),
  ALTER COLUMN reference_code SET NOT NULL;
ALTER TABLE leasing.reservations
  ALTER COLUMN reference_code SET DEFAULT ('LGC-GC-' || to_char(nextval('leasing.reservation_reference_code_seq'), 'FM00000')),
  ALTER COLUMN reference_code SET NOT NULL;
ALTER TABLE leasing.leases
  ALTER COLUMN reference_code SET DEFAULT ('LGC-HD-' || to_char(nextval('leasing.lease_reference_code_seq'), 'FM00000')),
  ALTER COLUMN reference_code SET NOT NULL;

ALTER SEQUENCE leasing.leasing_request_reference_code_seq OWNED BY leasing.leasing_requests.reference_code;
ALTER SEQUENCE leasing.reservation_reference_code_seq OWNED BY leasing.reservations.reference_code;
ALTER SEQUENCE leasing.lease_reference_code_seq OWNED BY leasing.leases.reference_code;
GRANT USAGE, SELECT ON SEQUENCE leasing.leasing_request_reference_code_seq TO leasing_runtime;
GRANT USAGE, SELECT ON SEQUENCE leasing.reservation_reference_code_seq TO leasing_runtime;
GRANT USAGE, SELECT ON SEQUENCE leasing.lease_reference_code_seq TO leasing_runtime;
CREATE UNIQUE INDEX leasing_requests_reference_code_unique ON leasing.leasing_requests (reference_code);
CREATE UNIQUE INDEX reservations_reference_code_unique ON leasing.reservations (reference_code);
CREATE UNIQUE INDEX leases_reference_code_unique ON leasing.leases (reference_code);

-- A previous fallback copied the primary UUID into the optional contract number.
-- Keep real entered numbers; clear only values exactly equal to their record UUID.
ALTER TABLE leasing.leases ALTER COLUMN reference_number DROP NOT NULL;
UPDATE leasing.leases SET reference_number = NULL WHERE reference_number = id::text;

COMMENT ON COLUMN leasing.leasing_requests.reference_code IS 'Admin-facing lookup code; not an authorization credential.';
COMMENT ON COLUMN leasing.reservations.reference_code IS 'Admin-facing lookup code; not an authorization credential.';
COMMENT ON COLUMN leasing.leases.reference_code IS 'Admin-facing lookup code; not an authorization credential.';
COMMIT;
