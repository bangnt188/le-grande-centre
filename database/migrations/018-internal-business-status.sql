BEGIN;
SELECT set_config('app.actor_id','system:internal-business-status',true);

ALTER TABLE leasing.slots ADD COLUMN business_status text NOT NULL DEFAULT 'Còn trống';

UPDATE leasing.slots s
SET business_status = CASE
  WHEN EXISTS (
    SELECT 1
    FROM leasing.slot_allocations a
    JOIN leasing.leases l ON l.id = a.lease_id AND l.property_id = a.property_id
    WHERE a.property_id = s.property_id AND a.slot_id = s.id
      AND a.released_at IS NULL AND l.status = 'executed'
      AND l.occupancy_period @> CURRENT_DATE
  ) THEN 'Đã ký'
  WHEN s.operational_status IN ('Trống', 'Còn trống') THEN 'Còn trống'
  WHEN s.operational_status = 'Liên hệ' THEN 'Có Lead'
  ELSE 'Đã thuê'
END;

ALTER TABLE leasing.slots ADD CONSTRAINT slots_business_status_check
  CHECK (business_status IN ('Còn trống', 'Có Lead', 'Đang thương lượng', 'Giữ chỗ', 'Đã ký', 'Đã thuê'));

COMMIT;
