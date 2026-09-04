-- migrations/106_turnus_org_members.sql
-- Maps platform users to a Tidum Turnus organisasjon (tenant membership).
BEGIN;
SELECT set_config('tidum.rls_mode','system',true),
       set_config('tidum.turnus_org_id','',true),
       set_config('tidum.rls_system_operation','migration_106',true);

CREATE TABLE IF NOT EXISTS tidum_turnus_org_members (
  id         SERIAL PRIMARY KEY,
  org_id     INTEGER NOT NULL REFERENCES tidum_turnus_organisasjoner(id),
  user_id    VARCHAR NOT NULL,
  rolle      TEXT NOT NULL DEFAULT 'planlegger',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, user_id)
);
CREATE INDEX IF NOT EXISTS tidum_turnus_org_members_user_idx
  ON tidum_turnus_org_members (user_id);

ALTER TABLE tidum_turnus_org_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE tidum_turnus_org_members FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY tidum_turnus_org_members_isolation ON tidum_turnus_org_members
    USING (tidum_rls_turnus_org_allowed(org_id)) WITH CHECK (tidum_rls_turnus_org_allowed(org_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE tidum_turnus_org_members TO pg_database_owner;
GRANT USAGE, SELECT ON SEQUENCE tidum_turnus_org_members_id_seq TO pg_database_owner;
COMMIT;
