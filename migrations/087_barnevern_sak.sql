-- migrations/087_barnevern_sak.sql
-- Krav 2: autoritativ kommunal barnevernssak med faseflyt og append-only
-- fasehistorikk. Egen tabell — IKKE gjenbruk av tidum_saker (utfører-side,
-- NOT NULL vendor_id). En sak opprettes fra beslutningen «send til
-- undersøkelse» på en bekymringsmelding, og eier faseflyten videre.

BEGIN;

SELECT set_config('tidum.rls_mode', 'system', true),
       set_config('tidum.kommune_id', '', true),
       set_config('tidum.rls_system_operation', 'migration_087', true);

DO $$ BEGIN
  CREATE TYPE tidum_barnevern_sak_fase AS ENUM (
    'undersokelse', 'tiltak', 'avsluttet', 'henlagt'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Delt sekvens, samme begrunnelse som meldingsnummer i 064.
CREATE SEQUENCE IF NOT EXISTS tidum_barnevern_saksnummer_seq;

CREATE TABLE IF NOT EXISTS tidum_barnevern_saker (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kommune_id                INTEGER NOT NULL REFERENCES tidum_kommuner(id),
  saksnummer                TEXT NOT NULL UNIQUE,
  melding_id                UUID UNIQUE,
  barn_fodselsnummer        TEXT,
  barn_navn                 TEXT,
  fase                      tidum_barnevern_sak_fase NOT NULL DEFAULT 'undersokelse',
  tildelt_saksbehandler_id  VARCHAR REFERENCES users(id),
  undersokelsesfrist        TIMESTAMPTZ,
  avsluttet_dato            TIMESTAMPTZ,
  avsluttet_av_user_id      VARCHAR REFERENCES users(id),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tidum_barnevern_saker_id_kommune_unique UNIQUE (id, kommune_id),
  CONSTRAINT tidum_barnevern_saker_melding_fk
    FOREIGN KEY (melding_id, kommune_id)
    REFERENCES tidum_barnevern_meldinger (id, kommune_id),
  CONSTRAINT tidum_barnevern_saker_avslutning_check CHECK (
    (fase IN ('avsluttet', 'henlagt')) =
    (avsluttet_dato IS NOT NULL AND avsluttet_av_user_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS tidum_barnevern_saker_kommune_idx
  ON tidum_barnevern_saker (kommune_id, fase);

-- Append-only fasehistorikk: hvem besluttet hvilken overgang, når og hvorfor.
CREATE TABLE IF NOT EXISTS tidum_barnevern_sak_fase_historikk (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sak_id            UUID NOT NULL,
  kommune_id        INTEGER NOT NULL,
  fra_fase          TEXT,
  til_fase          TEXT NOT NULL,
  begrunnelse       TEXT,
  endret_av_user_id VARCHAR NOT NULL REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tidum_barnevern_sak_fase_historikk_sak_fk
    FOREIGN KEY (sak_id, kommune_id)
    REFERENCES tidum_barnevern_saker (id, kommune_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS tidum_barnevern_sak_fase_historikk_sak_idx
  ON tidum_barnevern_sak_fase_historikk (kommune_id, sak_id, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE tidum_barnevern_saker TO pg_database_owner;
-- Historikken er append-only: ingen UPDATE/DELETE, heller ikke for app-rollen.
GRANT SELECT, INSERT ON TABLE tidum_barnevern_sak_fase_historikk TO pg_database_owner;
GRANT USAGE, SELECT, UPDATE ON SEQUENCE tidum_barnevern_saksnummer_seq TO pg_database_owner;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'tidum_barnevern_saker',
    'tidum_barnevern_sak_fase_historikk'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS tidum_kommune_isolation ON %I', table_name);
    EXECUTE format(
      'CREATE POLICY tidum_kommune_isolation ON %I FOR ALL USING (tidum_rls_kommune_allowed(kommune_id)) WITH CHECK (tidum_rls_kommune_allowed(kommune_id))',
      table_name
    );
  END LOOP;
END $$;

COMMIT;
