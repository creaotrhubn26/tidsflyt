-- migrations/109_turnus_paaminnelser.sql
-- Per-org reminder settings + a per-shift "reminded at" marker so a cron can
-- notify employees a configurable lead time before each shift starts. Idempotent.

CREATE TABLE IF NOT EXISTS tidum_turnus_varsel_innstillinger (
  org_id INTEGER PRIMARY KEY REFERENCES tidum_turnus_organisasjoner(id),
  paaminnelse_min INTEGER NOT NULL DEFAULT 60,   -- minutes before shift start
  epost BOOLEAN NOT NULL DEFAULT false,
  app BOOLEAN NOT NULL DEFAULT true,
  sms BOOLEAN NOT NULL DEFAULT false,             -- paid; opt-in
  aktiv BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE tidum_turnus_varsel_innstillinger ENABLE ROW LEVEL SECURITY;
ALTER TABLE tidum_turnus_varsel_innstillinger FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY tidum_turnus_varsel_innstillinger_isolation ON tidum_turnus_varsel_innstillinger
    USING (tidum_rls_turnus_org_allowed(org_id))
    WITH CHECK (tidum_rls_turnus_org_allowed(org_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE tidum_turnus_varsel_innstillinger TO pg_database_owner;

-- Marks a shift as already reminded (NULL = not yet), so the cron never
-- double-sends. Indexed for the due-shift scan.
ALTER TABLE tidum_turnus_kalendervakter ADD COLUMN IF NOT EXISTS paaminnet_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS tidum_turnus_kalendervakter_paaminnelse_idx
  ON tidum_turnus_kalendervakter (status, paaminnet_at, dato);
