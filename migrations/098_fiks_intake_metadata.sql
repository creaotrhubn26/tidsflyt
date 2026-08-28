-- migrations/098_fiks_intake_metadata.sql
-- Krav 1: ekte FIKS IO-mottak. Råloggen får konvoluttmetadata fra AMQP-
-- leveringen: FIKS-meldings-id (idempotensnøkkel — samme melding levert
-- på nytt etter nack/reconnect skal ikke gi duplikat), meldingstype og
-- avsenderkonto. Payloaden lagres KRYPTERT som mottatt (CMS for kontoens
-- nøkkel) og forsegles i tillegg med secret-box.

BEGIN;

SELECT set_config('tidum.rls_mode', 'system', true),
       set_config('tidum.kommune_id', '', true),
       set_config('tidum.rls_system_operation', 'migration_098', true);

ALTER TABLE tidum_fiks_raw_intake_log
  ADD COLUMN IF NOT EXISTS fiks_melding_id TEXT,
  ADD COLUMN IF NOT EXISTS melding_type TEXT,
  ADD COLUMN IF NOT EXISTS avsender_konto_id TEXT,
  ADD COLUMN IF NOT EXISTS svar_pa_melding_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS tidum_fiks_raw_intake_melding_uidx
  ON tidum_fiks_raw_intake_log (fiks_melding_id)
  WHERE fiks_melding_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS tidum_fiks_raw_intake_ubehandlet_idx
  ON tidum_fiks_raw_intake_log (kommune_id, received_at)
  WHERE processed_at IS NULL;

COMMIT;
