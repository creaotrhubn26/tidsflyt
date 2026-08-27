-- migrations/096_sms_utboks.sql
-- Krav 9: leverandørnøytral SMS-utboks. Meldinger køes tenant-bundet og
-- prosesseres asynkront mot kommunens konfigurerte gateway-adapter med
-- backoff — samme outbox-mønster som arkivet. Reservasjonsstatus (KRR)
-- bæres per melding; selve KRR-oppslaget er ekstern restanse og
-- markeres 'ikke_sjekket' inntil integrasjonen finnes.

BEGIN;

SELECT set_config('tidum.rls_mode', 'system', true),
       set_config('tidum.kommune_id', '', true),
       set_config('tidum.rls_system_operation', 'migration_096', true);

CREATE TABLE IF NOT EXISTS tidum_sms_utboks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kommune_id          INTEGER NOT NULL,
  mottaker_telefon    TEXT NOT NULL,
  melding             TEXT NOT NULL,
  formaal             TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'koet' CHECK (status IN ('koet', 'sendt', 'feilet', 'blokkert')),
  reservasjon_status  TEXT NOT NULL DEFAULT 'ikke_sjekket' CHECK (reservasjon_status IN ('ikke_sjekket', 'tillatt', 'reservert')),
  forsok              INTEGER NOT NULL DEFAULT 0,
  neste_forsok        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  gateway_melding_id  TEXT,
  feil                TEXT,
  sendt_dato          TIMESTAMPTZ,
  opprettet_av        VARCHAR NOT NULL REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tidum_sms_utboks_sendt_check CHECK (
    (status = 'sendt') = (sendt_dato IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS tidum_sms_utboks_status_idx
  ON tidum_sms_utboks (status, neste_forsok);
CREATE INDEX IF NOT EXISTS tidum_sms_utboks_kommune_idx
  ON tidum_sms_utboks (kommune_id, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE tidum_sms_utboks TO pg_database_owner;

ALTER TABLE tidum_sms_utboks ENABLE ROW LEVEL SECURITY;
ALTER TABLE tidum_sms_utboks FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tidum_kommune_isolation ON tidum_sms_utboks;
CREATE POLICY tidum_kommune_isolation ON tidum_sms_utboks
  FOR ALL
  USING (tidum_rls_kommune_allowed(kommune_id))
  WITH CHECK (tidum_rls_kommune_allowed(kommune_id));

COMMIT;
