-- migrations/095_barnevern_forebyggende.sql
-- Krav 18: dokumentasjon av forebyggende arbeid. Ikke barn-bundet —
-- egne prosjekter/programmer med samarbeidsparter og append-only
-- aktivitetslogg som grunnlag for aggregering og rapportering.

BEGIN;

SELECT set_config('tidum.rls_mode', 'system', true),
       set_config('tidum.kommune_id', '', true),
       set_config('tidum.rls_system_operation', 'migration_095', true);

CREATE TABLE IF NOT EXISTS tidum_barnevern_forebyggende (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kommune_id         INTEGER NOT NULL,
  tittel             TEXT NOT NULL,
  beskrivelse        TEXT,
  kategori           TEXT NOT NULL CHECK (kategori IN ('program', 'prosjekt', 'samarbeid', 'kampanje', 'annet')),
  -- [{navn, type}] — skole, helsestasjon, politi, frivillig, annet.
  samarbeidsparter   JSONB NOT NULL DEFAULT '[]',
  ansvarlig_user_id  VARCHAR NOT NULL REFERENCES users(id),
  start_dato         DATE,
  slutt_dato         DATE,
  status             TEXT NOT NULL DEFAULT 'planlagt' CHECK (status IN ('planlagt', 'pagar', 'avsluttet')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tidum_barnevern_forebyggende_id_kommune_unique UNIQUE (id, kommune_id)
);

CREATE INDEX IF NOT EXISTS tidum_barnevern_forebyggende_kommune_idx
  ON tidum_barnevern_forebyggende (kommune_id, status, kategori);

-- Append-only aktivitetslogg med deltakertall for aggregering.
CREATE TABLE IF NOT EXISTS tidum_barnevern_forebyggende_aktiviteter (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  forebyggende_id    UUID NOT NULL,
  kommune_id         INTEGER NOT NULL,
  dato               DATE NOT NULL,
  beskrivelse        TEXT NOT NULL,
  antall_deltakere   INTEGER CHECK (antall_deltakere >= 0),
  notat              TEXT,
  registrert_av      VARCHAR NOT NULL REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tidum_barnevern_forebyggende_aktiviteter_fk
    FOREIGN KEY (forebyggende_id, kommune_id)
    REFERENCES tidum_barnevern_forebyggende (id, kommune_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS tidum_barnevern_forebyggende_aktiviteter_idx
  ON tidum_barnevern_forebyggende_aktiviteter (kommune_id, forebyggende_id, dato);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE tidum_barnevern_forebyggende TO pg_database_owner;
GRANT SELECT, INSERT ON TABLE tidum_barnevern_forebyggende_aktiviteter TO pg_database_owner;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'tidum_barnevern_forebyggende',
    'tidum_barnevern_forebyggende_aktiviteter'
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
