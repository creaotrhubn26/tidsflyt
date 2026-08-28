-- migrations/097_barnevernsregister_innsendinger.sql
-- Krav 10/28: daglig automatisk innrapportering til Barnevernsregisteret
-- (Bufdir) etter samme modell som Flyt/Modulus — datasettet snapshotes og
-- kvalitetssikres FØR innsending, sendes via konfigurerbar transport med
-- backoff, og kvitteringen lagres for avstemming. Én rad per kommune per
-- rapportdato; et allerede sendt datasett overskrives aldri.

BEGIN;

SELECT set_config('tidum.rls_mode', 'system', true),
       set_config('tidum.kommune_id', '', true),
       set_config('tidum.rls_system_operation', 'migration_097', true);

CREATE TABLE IF NOT EXISTS tidum_barnevernsregister_innsendinger (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kommune_id     INTEGER NOT NULL,
  rapportdato    DATE NOT NULL,
  datasett       JSONB NOT NULL,
  innholds_hash  TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'koet' CHECK (status IN ('koet', 'sender', 'sendt', 'feilet', 'avvist')),
  valideringsfeil JSONB,
  forsok         INTEGER NOT NULL DEFAULT 0,
  neste_forsok   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  kvittering     JSONB,
  feil           TEXT,
  sendt_dato     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tidum_bvr_innsendinger_kommune_dato_unique UNIQUE (kommune_id, rapportdato),
  CONSTRAINT tidum_bvr_innsendinger_sendt_check CHECK (
    (status = 'sendt') = (sendt_dato IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS tidum_bvr_innsendinger_status_idx
  ON tidum_barnevernsregister_innsendinger (status, neste_forsok);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE tidum_barnevernsregister_innsendinger TO pg_database_owner;

ALTER TABLE tidum_barnevernsregister_innsendinger ENABLE ROW LEVEL SECURITY;
ALTER TABLE tidum_barnevernsregister_innsendinger FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tidum_kommune_isolation ON tidum_barnevernsregister_innsendinger;
CREATE POLICY tidum_kommune_isolation ON tidum_barnevernsregister_innsendinger
  FOR ALL
  USING (tidum_rls_kommune_allowed(kommune_id))
  WITH CHECK (tidum_rls_kommune_allowed(kommune_id));

COMMIT;
