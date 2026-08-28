-- migrations/100_drift_alarmer.sql
-- Krav 3/25: driftsalarm når asynkrone køer ender i terminal feil
-- (arkiv 'failed', SMS 'feilet', Barnevernsregisteret 'feilet'/'avvist').
-- Én rad per feilet kø-oppføring (dedup via UNIQUE) — cronen oppdager nye
-- rader, sender samle-epost til DRIFT_ALARM_EPOST og merker dem varslet.
-- Uten konfigurert mottaker blir radene stående uvarslet (logges høylytt)
-- og fanges opp av første utsendelse etter at mottaker er satt.

BEGIN;

SELECT set_config('tidum.rls_mode', 'system', true),
       set_config('tidum.kommune_id', '', true),
       set_config('tidum.rls_system_operation', 'migration_100', true);

CREATE TABLE IF NOT EXISTS tidum_drift_alarmer (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kilde       TEXT NOT NULL CHECK (kilde IN ('arkiv', 'sms', 'barnevernsregister')),
  entity_id   TEXT NOT NULL,
  kommune_id  INTEGER,
  feil        TEXT,
  varslet     BOOLEAN NOT NULL DEFAULT FALSE,
  varslet_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tidum_drift_alarmer_kilde_entity_unique UNIQUE (kilde, entity_id)
);

CREATE INDEX IF NOT EXISTS tidum_drift_alarmer_uvarslet_idx
  ON tidum_drift_alarmer (created_at) WHERE varslet = FALSE;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE tidum_drift_alarmer TO pg_database_owner;

ALTER TABLE tidum_drift_alarmer ENABLE ROW LEVEL SECURITY;
ALTER TABLE tidum_drift_alarmer FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tidum_kommune_isolation ON tidum_drift_alarmer;
CREATE POLICY tidum_kommune_isolation ON tidum_drift_alarmer
  FOR ALL
  USING (tidum_rls_kommune_allowed(kommune_id))
  WITH CHECK (tidum_rls_kommune_allowed(kommune_id));

COMMIT;
