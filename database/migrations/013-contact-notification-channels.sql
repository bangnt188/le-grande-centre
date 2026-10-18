BEGIN;
SELECT set_config('app.actor_id','system:migration',true);
ALTER TABLE leasing.contact_notification_outbox ADD COLUMN channel text NOT NULL DEFAULT 'zalo' CHECK(channel IN ('zalo','gmail'));
ALTER TABLE leasing.contact_notification_outbox ADD COLUMN subject text;
ALTER TABLE leasing.contact_notification_outbox DROP CONSTRAINT contact_notification_outbox_pkey;
ALTER TABLE leasing.contact_notification_outbox ADD PRIMARY KEY(intake_id,channel);
ALTER TABLE leasing.contact_notification_outbox DROP COLUMN request_key;
ALTER TABLE leasing.contact_notification_outbox ADD COLUMN request_key text GENERATED ALWAYS AS ('contact:' || intake_id::text || ':' || channel) STORED UNIQUE;
ALTER TABLE leasing.contact_notification_outbox ADD CHECK ((channel='zalo' AND subject IS NULL) OR (channel='gmail' AND subject IS NOT NULL AND length(subject) BETWEEN 1 AND 200 AND subject !~ '[[:cntrl:]]'));
-- Preserve existing Zalo jobs; do not generate email blasts for historical contacts.
COMMIT;
