-- migrations/105_turnus_core.sql
-- Tidum Turnus vertical — tenant-isolated core schema.
-- Own RLS context key (tidum.turnus_org_id); barnevern's kommune path is untouched.
-- See docs/superpowers/specs/2026-09-04-tidum-turnus-vertikal-design.md.

BEGIN;

SELECT set_config('tidum.rls_mode', 'system', true),
       set_config('tidum.turnus_org_id', '', true),
       set_config('tidum.rls_system_operation', 'migration_105', true);

CREATE OR REPLACE FUNCTION tidum_rls_turnus_org_allowed(target_org_id INTEGER)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN current_setting('tidum.rls_mode', true) = 'system'
      AND current_setting('tidum.rls_system_operation', true) ~ '^[a-z][a-z0-9_-]{2,63}$'
      THEN TRUE
    WHEN current_setting('tidum.rls_mode', true) = 'turnus'
      AND current_setting('tidum.turnus_org_id', true) ~ '^[1-9][0-9]*$'
      THEN target_org_id = current_setting('tidum.turnus_org_id', true)::INTEGER
    ELSE FALSE
  END
$$;

CREATE TABLE IF NOT EXISTS tidum_turnus_organisasjoner (
  id          SERIAL PRIMARY KEY,
  navn        TEXT NOT NULL,
  kommune_id  INTEGER REFERENCES tidum_kommuner(id),
  orgnr       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE tidum_turnus_organisasjoner ENABLE ROW LEVEL SECURITY;
ALTER TABLE tidum_turnus_organisasjoner FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY tidum_turnus_organisasjoner_isolation ON tidum_turnus_organisasjoner
    USING (tidum_rls_turnus_org_allowed(id))
    WITH CHECK (tidum_rls_turnus_org_allowed(id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

GRANT USAGE ON SCHEMA public TO pg_database_owner;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE tidum_turnus_organisasjoner TO pg_database_owner;
GRANT USAGE, SELECT ON SEQUENCE tidum_turnus_organisasjoner_id_seq TO pg_database_owner;

COMMIT;
