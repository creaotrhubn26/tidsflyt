-- migrations/104_barnevern_dokumentmaler.sql
-- Krav 6-rest: kommune-egne dokumentmaler i databasen. Kodefaste maler
-- (DOKUMENTMALER i barnevern-dokument-routes.ts) er standardsettet;
-- kommunens egne maler kommer i tillegg og kan overstyre en kodefast mal
-- ved samme mal_id. Malinnholdet snapshotes fortsatt inn i dokumentet ved
-- opprettelse, så malendringer aldri endrer utstedte dokumenter.

BEGIN;

SELECT set_config('tidum.rls_mode', 'system', true),
       set_config('tidum.kommune_id', '', true),
       set_config('tidum.rls_system_operation', 'migration_104', true);

CREATE TABLE IF NOT EXISTS tidum_barnevern_dokumentmaler (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kommune_id    INTEGER NOT NULL,
  mal_id        TEXT NOT NULL,
  dokumenttype  TEXT NOT NULL CHECK (dokumenttype IN ('vedtak', 'brev')),
  tittel        TEXT NOT NULL,
  hjemmel       TEXT,
  innhold       TEXT NOT NULL,
  aktiv         BOOLEAN NOT NULL DEFAULT TRUE,
  opprettet_av  VARCHAR NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tidum_bv_dokumentmaler_kommune_mal_unique UNIQUE (kommune_id, mal_id),
  CONSTRAINT tidum_bv_dokumentmaler_malid_format CHECK (mal_id ~ '^[a-z0-9_]{2,64}$')
);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE tidum_barnevern_dokumentmaler TO pg_database_owner;

ALTER TABLE tidum_barnevern_dokumentmaler ENABLE ROW LEVEL SECURITY;
ALTER TABLE tidum_barnevern_dokumentmaler FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tidum_kommune_isolation ON tidum_barnevern_dokumentmaler;
CREATE POLICY tidum_kommune_isolation ON tidum_barnevern_dokumentmaler
  FOR ALL
  USING (tidum_rls_kommune_allowed(kommune_id))
  WITH CHECK (tidum_rls_kommune_allowed(kommune_id));

COMMIT;
