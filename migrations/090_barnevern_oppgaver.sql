-- migrations/090_barnevern_oppgaver.sql
-- Krav 3: oppgaver med eier, frist, varsel og eskalering på
-- barnevernsobjektene (melding og sak). Varsling/eskalering går via
-- fristmotoren (tidum_frister, entity_type 'barnevern_oppgave').

BEGIN;

SELECT set_config('tidum.rls_mode', 'system', true),
       set_config('tidum.kommune_id', '', true),
       set_config('tidum.rls_system_operation', 'migration_090', true);

CREATE TABLE IF NOT EXISTS tidum_barnevern_oppgaver (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kommune_id         INTEGER NOT NULL REFERENCES tidum_kommuner(id),
  entity_type        TEXT NOT NULL CHECK (entity_type IN ('melding', 'sak')),
  entity_id          UUID NOT NULL,
  tittel             TEXT NOT NULL,
  beskrivelse        TEXT,
  tildelt_user_id    VARCHAR NOT NULL REFERENCES users(id),
  opprettet_av       VARCHAR NOT NULL REFERENCES users(id),
  frist              TIMESTAMPTZ,
  status             TEXT NOT NULL DEFAULT 'apen' CHECK (status IN ('apen', 'fullfort', 'kansellert')),
  fullfort_dato      TIMESTAMPTZ,
  fullfort_av        VARCHAR REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tidum_barnevern_oppgaver_fullfort_check CHECK (
    (status = 'fullfort') = (fullfort_dato IS NOT NULL AND fullfort_av IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS tidum_barnevern_oppgaver_entity_idx
  ON tidum_barnevern_oppgaver (kommune_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS tidum_barnevern_oppgaver_tildelt_idx
  ON tidum_barnevern_oppgaver (kommune_id, tildelt_user_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE tidum_barnevern_oppgaver TO pg_database_owner;

ALTER TABLE tidum_barnevern_oppgaver ENABLE ROW LEVEL SECURITY;
ALTER TABLE tidum_barnevern_oppgaver FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tidum_kommune_isolation ON tidum_barnevern_oppgaver;
CREATE POLICY tidum_kommune_isolation ON tidum_barnevern_oppgaver
  FOR ALL
  USING (tidum_rls_kommune_allowed(kommune_id))
  WITH CHECK (tidum_rls_kommune_allowed(kommune_id));

COMMIT;
