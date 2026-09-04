-- migrations/107_turnus_genereringer.sql
-- Persistence for CP-SAT generation runs + their deviations (Tidum Turnus A1c).
-- Both FORCE RLS on org_id, same pattern as migration 105. See spec §5.2.

BEGIN;
SELECT set_config('tidum.rls_mode', 'system', true),
       set_config('tidum.turnus_org_id', '', true),
       set_config('tidum.rls_system_operation', 'migration_107', true);

DO $$ BEGIN
  CREATE TYPE tidum_turnus_generering_status AS ENUM
    ('ko','kjorer','fullfort','infeasible','feilet');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS tidum_turnus_genereringer (
  id             SERIAL PRIMARY KEY,
  org_id         INTEGER NOT NULL REFERENCES tidum_turnus_organisasjoner(id),
  plan_id        INTEGER NOT NULL REFERENCES tidum_turnus_planer(id) ON DELETE CASCADE,
  status         tidum_turnus_generering_status NOT NULL DEFAULT 'ko',
  utlost_av      VARCHAR,  -- turnus user ids are not FK'd to users (mirror org_members.user_id)
  solver_versjon TEXT,
  solve_tid_ms   INTEGER,
  objektiv_json  JSONB NOT NULL DEFAULT '{}'::jsonb,
  startet        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fullfort       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS tidum_turnus_genereringer_plan_idx
  ON tidum_turnus_genereringer (org_id, plan_id, startet DESC);

CREATE TABLE IF NOT EXISTS tidum_turnus_genereringsavvik (
  id             SERIAL PRIMARY KEY,
  org_id         INTEGER NOT NULL REFERENCES tidum_turnus_organisasjoner(id),
  generering_id  INTEGER NOT NULL REFERENCES tidum_turnus_genereringer(id) ON DELETE CASCADE,
  type           TEXT NOT NULL,
  alvor          TEXT NOT NULL DEFAULT 'info',
  referanse      TEXT,
  forklaring     TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS tidum_turnus_genereringsavvik_gen_idx
  ON tidum_turnus_genereringsavvik (org_id, generering_id);

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['tidum_turnus_genereringer','tidum_turnus_genereringsavvik'])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    BEGIN
      EXECUTE format('CREATE POLICY %I ON %I USING (tidum_rls_turnus_org_allowed(org_id)) WITH CHECK (tidum_rls_turnus_org_allowed(org_id))', t || '_isolation', t);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I TO pg_database_owner', t);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %I TO pg_database_owner', t || '_id_seq');
  END LOOP;
END $$;

COMMIT;
