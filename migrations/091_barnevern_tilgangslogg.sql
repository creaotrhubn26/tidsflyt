-- migrations/091_barnevern_tilgangslogg.sql
-- Krav 15: søkbar, append-only logg over lesing og nedlasting av
-- barnevernsobjekter. Skrives i SAMME transaksjon som lesingen —
-- feiler loggen, feiler lesingen (fail-closed bevislogging).

BEGIN;

SELECT set_config('tidum.rls_mode', 'system', true),
       set_config('tidum.kommune_id', '', true),
       set_config('tidum.rls_system_operation', 'migration_091', true);

CREATE TABLE IF NOT EXISTS tidum_barnevern_tilgangslogg (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kommune_id   INTEGER NOT NULL,
  -- Bevisst ingen FK til users: loggen er bevis og skal overleve at
  -- brukerkontoen slettes; id-sporet beholdes som tekstverdi.
  user_id      VARCHAR NOT NULL,
  handling     TEXT NOT NULL CHECK (handling IN ('lest', 'nedlastet')),
  objekt_type  TEXT NOT NULL,
  objekt_id    UUID NOT NULL,
  detaljer     JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tidum_barnevern_tilgangslogg_objekt_idx
  ON tidum_barnevern_tilgangslogg (kommune_id, objekt_type, objekt_id, created_at);
CREATE INDEX IF NOT EXISTS tidum_barnevern_tilgangslogg_user_idx
  ON tidum_barnevern_tilgangslogg (kommune_id, user_id, created_at);

-- Append-only: kun SELECT og INSERT.
GRANT SELECT, INSERT ON TABLE tidum_barnevern_tilgangslogg TO pg_database_owner;

ALTER TABLE tidum_barnevern_tilgangslogg ENABLE ROW LEVEL SECURITY;
ALTER TABLE tidum_barnevern_tilgangslogg FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tidum_kommune_isolation ON tidum_barnevern_tilgangslogg;
CREATE POLICY tidum_kommune_isolation ON tidum_barnevern_tilgangslogg
  FOR ALL
  USING (tidum_rls_kommune_allowed(kommune_id))
  WITH CHECK (tidum_rls_kommune_allowed(kommune_id));

COMMIT;
