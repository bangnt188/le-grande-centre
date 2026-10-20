BEGIN;
SELECT set_config('app.actor_id','system:migration',true);

-- A logo belongs to a company's relationship with this property, not to all
-- properties that may share the same organization record.
ALTER TABLE leasing.property_customers ADD COLUMN logo_media_id uuid;
ALTER TABLE leasing.property_customers ADD CONSTRAINT property_customer_logo_media_fk
  FOREIGN KEY (logo_media_id,property_id) REFERENCES leasing.document_versions(id,property_id);
CREATE INDEX property_customer_logo_media_idx ON leasing.property_customers(property_id,logo_media_id)
  WHERE logo_media_id IS NOT NULL AND deleted_at IS NULL;

COMMIT;
