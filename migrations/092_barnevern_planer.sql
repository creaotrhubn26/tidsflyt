-- migrations/092_barnevern_planer.sql
-- Krav 5: autoritativt, versjonert planobjekt på den kommunale
-- barnevernssaken. Ny versjon = ny rad (forrige settes 'erstattet');
-- innholdet i en godkjent versjon endres aldri. Tiltak ligger som egne
-- rader med ansvar, frist og status for rapportering.

BEGIN;

SELECT set_config('tidum.rls_mode', 'system', true),
       set_config('tidum.kommune_id', '', true),
       set_config('tidum.rls_system_operation', 'migration_092', true);

CREATE TABLE IF NOT EXISTS tidum_barnevern_planer (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kommune_id         INTEGER NOT NULL,
  sak_id             UUID NOT NULL,
  plantype           TEXT NOT NULL DEFAULT 'tiltaksplan' CHECK (plantype IN ('tiltaksplan', 'omsorgsplan')),
  versjon            INTEGER NOT NULL DEFAULT 1,
  status             TEXT NOT NULL DEFAULT 'utkast' CHECK (status IN ('utkast', 'godkjent', 'erstattet', 'avsluttet')),
  formaal            TEXT,
  -- [{navn, rolle}] — forelder, barn, saksbehandler, annet.
  deltakere          JSONB NOT NULL DEFAULT '[]',
  evalueringsfrist   TIMESTAMPTZ,
  godkjent_av        VARCHAR REFERENCES users(id),
  godkjent_dato      TIMESTAMPTZ,
  opprettet_av       VARCHAR NOT NULL REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tidum_barnevern_planer_id_kommune_unique UNIQUE (id, kommune_id),
  CONSTRAINT tidum_barnevern_planer_sak_fk
    FOREIGN KEY (sak_id, kommune_id)
    REFERENCES tidum_barnevern_saker (id, kommune_id)
    ON DELETE CASCADE,
  CONSTRAINT tidum_barnevern_planer_versjon_unique UNIQUE (sak_id, plantype, versjon),
  CONSTRAINT tidum_barnevern_planer_godkjent_check CHECK (
    (status IN ('godkjent', 'erstattet', 'avsluttet') AND godkjent_av IS NOT NULL AND godkjent_dato IS NOT NULL)
    OR status = 'utkast'
  )
);

CREATE INDEX IF NOT EXISTS tidum_barnevern_planer_sak_idx
  ON tidum_barnevern_planer (kommune_id, sak_id, plantype, versjon);

CREATE TABLE IF NOT EXISTS tidum_barnevern_plan_tiltak (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id       UUID NOT NULL,
  kommune_id    INTEGER NOT NULL,
  beskrivelse   TEXT NOT NULL,
  ansvarlig     TEXT NOT NULL,
  frist         DATE,
  status        TEXT NOT NULL DEFAULT 'planlagt' CHECK (status IN ('planlagt', 'pagar', 'fullfort', 'avbrutt')),
  statusnotat   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tidum_barnevern_plan_tiltak_plan_fk
    FOREIGN KEY (plan_id, kommune_id)
    REFERENCES tidum_barnevern_planer (id, kommune_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS tidum_barnevern_plan_tiltak_plan_idx
  ON tidum_barnevern_plan_tiltak (kommune_id, plan_id);

GRANT SELECT, INSERT, UPDATE ON TABLE
  tidum_barnevern_planer,
  tidum_barnevern_plan_tiltak
TO pg_database_owner;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'tidum_barnevern_planer',
    'tidum_barnevern_plan_tiltak'
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
