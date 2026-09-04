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

BEGIN;

SELECT set_config('tidum.rls_mode', 'system', true),
       set_config('tidum.turnus_org_id', '', true),
       set_config('tidum.rls_system_operation', 'migration_105b', true);

-- Enums
DO $$ BEGIN CREATE TYPE tidum_turnus_plan_status AS ENUM
  ('utkast','generert','godkjent','aktiv'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE tidum_turnus_vakt_kilde AS ENUM
  ('rotasjon','manuell','vikar'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE tidum_turnus_regel_kilde AS ENUM
  ('lov','lokal_avtale','saeravtale','dispensasjon'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE tidum_turnus_onske_prioritet AS ENUM
  ('maa','bor','kan'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE tidum_turnus_onske_status AS ENUM
  ('registrert','vurdert','innfridd','avslaatt'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Struktur
CREATE TABLE IF NOT EXISTS tidum_turnus_avdelinger (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES tidum_turnus_organisasjoner(id),
  navn TEXT NOT NULL,
  parent_id INTEGER REFERENCES tidum_turnus_avdelinger(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ressurser
CREATE TABLE IF NOT EXISTS tidum_turnus_ansatte (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES tidum_turnus_organisasjoner(id),
  primar_avdeling_id INTEGER REFERENCES tidum_turnus_avdelinger(id),
  navn TEXT NOT NULL,
  stillingsprosent NUMERIC(5,2) NOT NULL DEFAULT 100,
  user_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS tidum_turnus_kompetanser (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES tidum_turnus_organisasjoner(id),
  navn TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS tidum_turnus_ansatt_kompetanser (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES tidum_turnus_organisasjoner(id),
  ansatt_id INTEGER NOT NULL REFERENCES tidum_turnus_ansatte(id) ON DELETE CASCADE,
  kompetanse_id INTEGER NOT NULL REFERENCES tidum_turnus_kompetanser(id) ON DELETE CASCADE,
  UNIQUE (ansatt_id, kompetanse_id)
);
CREATE TABLE IF NOT EXISTS tidum_turnus_vaktkoder (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES tidum_turnus_organisasjoner(id),
  kode TEXT NOT NULL,
  navn TEXT,
  start_tid TIME,
  slutt_tid TIME,
  varighet_timer NUMERIC(4,2),
  type TEXT,
  teller_som_arbeid BOOLEAN NOT NULL DEFAULT TRUE,
  farge TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, kode)
);

-- Turnus (rotasjon)
CREATE TABLE IF NOT EXISTS tidum_turnus_planer (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES tidum_turnus_organisasjoner(id),
  avdeling_id INTEGER NOT NULL REFERENCES tidum_turnus_avdelinger(id),
  navn TEXT NOT NULL,
  rotasjon_uker INTEGER NOT NULL DEFAULT 6,
  start_dato DATE,
  status tidum_turnus_plan_status NOT NULL DEFAULT 'utkast',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS tidum_turnus_vaktlinjer (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES tidum_turnus_organisasjoner(id),
  plan_id INTEGER NOT NULL REFERENCES tidum_turnus_planer(id) ON DELETE CASCADE,
  linjenr INTEGER NOT NULL,
  stillingsprosent NUMERIC(5,2) NOT NULL DEFAULT 100,
  tildelt_ansatt_id INTEGER REFERENCES tidum_turnus_ansatte(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (plan_id, linjenr)
);
CREATE TABLE IF NOT EXISTS tidum_turnus_linje_vakter (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES tidum_turnus_organisasjoner(id),
  vaktlinje_id INTEGER NOT NULL REFERENCES tidum_turnus_vaktlinjer(id) ON DELETE CASCADE,
  uke INTEGER NOT NULL,
  ukedag INTEGER NOT NULL CHECK (ukedag BETWEEN 1 AND 7),
  vaktkode_id INTEGER REFERENCES tidum_turnus_vaktkoder(id),
  UNIQUE (vaktlinje_id, uke, ukedag)
);

-- Kalender (hybrid)
CREATE TABLE IF NOT EXISTS tidum_turnus_kalendervakter (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES tidum_turnus_organisasjoner(id),
  avdeling_id INTEGER NOT NULL REFERENCES tidum_turnus_avdelinger(id),
  dato DATE NOT NULL,
  vaktkode_id INTEGER NOT NULL REFERENCES tidum_turnus_vaktkoder(id),
  ansatt_id INTEGER REFERENCES tidum_turnus_ansatte(id),
  kilde tidum_turnus_vakt_kilde NOT NULL DEFAULT 'rotasjon',
  erstatter_linje_id INTEGER REFERENCES tidum_turnus_vaktlinjer(id),
  generering_id INTEGER,
  status TEXT NOT NULL DEFAULT 'foreslaatt',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS tidum_turnus_kalendervakter_org_dato_idx
  ON tidum_turnus_kalendervakter (org_id, dato);

-- Behov
CREATE TABLE IF NOT EXISTS tidum_turnus_bemanningsbehov (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES tidum_turnus_organisasjoner(id),
  avdeling_id INTEGER NOT NULL REFERENCES tidum_turnus_avdelinger(id),
  ukedag INTEGER CHECK (ukedag BETWEEN 1 AND 7),
  dato DATE,
  vaktkode_id INTEGER NOT NULL REFERENCES tidum_turnus_vaktkoder(id),
  antall_krevd INTEGER NOT NULL DEFAULT 1,
  kompetanse_krav_id INTEGER REFERENCES tidum_turnus_kompetanser(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Regler + ønsker + prioritering
CREATE TABLE IF NOT EXISTS tidum_turnus_regler (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES tidum_turnus_organisasjoner(id),
  avdeling_id INTEGER REFERENCES tidum_turnus_avdelinger(id),
  ansatt_id INTEGER REFERENCES tidum_turnus_ansatte(id),
  regeltype TEXT NOT NULL,
  parametre JSONB NOT NULL DEFAULT '{}'::jsonb,
  haard BOOLEAN NOT NULL DEFAULT TRUE,
  vekt INTEGER NOT NULL DEFAULT 0,
  kilde tidum_turnus_regel_kilde NOT NULL DEFAULT 'lov',
  gyldig_fra DATE,
  gyldig_til DATE,
  aktiv BOOLEAN NOT NULL DEFAULT TRUE,
  opprettet_av VARCHAR REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS tidum_turnus_onsker (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES tidum_turnus_organisasjoner(id),
  ansatt_id INTEGER NOT NULL REFERENCES tidum_turnus_ansatte(id) ON DELETE CASCADE,
  plan_id INTEGER REFERENCES tidum_turnus_planer(id),
  type TEXT NOT NULL,
  dato DATE,
  ukedag INTEGER CHECK (ukedag BETWEEN 1 AND 7),
  periode_fra DATE,
  periode_til DATE,
  vaktkode_id INTEGER REFERENCES tidum_turnus_vaktkoder(id),
  prioritet tidum_turnus_onske_prioritet NOT NULL DEFAULT 'bor',
  begrunnelse TEXT,
  status tidum_turnus_onske_status NOT NULL DEFAULT 'registrert',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS tidum_turnus_prioriteringsprofil (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES tidum_turnus_organisasjoner(id),
  plan_id INTEGER REFERENCES tidum_turnus_planer(id),
  vekt_onsker INTEGER NOT NULL DEFAULT 5,
  vekt_helgefrekvens INTEGER NOT NULL DEFAULT 5,
  vekt_rettferdighet INTEGER NOT NULL DEFAULT 5,
  vekt_kontinuitet INTEGER NOT NULL DEFAULT 5,
  vekt_kostnad INTEGER NOT NULL DEFAULT 5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable + FORCE RLS + org-policy + grants for every turnus child table.
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'tidum_turnus_avdelinger','tidum_turnus_ansatte','tidum_turnus_kompetanser',
    'tidum_turnus_ansatt_kompetanser','tidum_turnus_vaktkoder','tidum_turnus_planer',
    'tidum_turnus_vaktlinjer','tidum_turnus_linje_vakter','tidum_turnus_kalendervakter',
    'tidum_turnus_bemanningsbehov','tidum_turnus_regler','tidum_turnus_onsker',
    'tidum_turnus_prioriteringsprofil'
  ])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (tidum_rls_turnus_org_allowed(org_id)) WITH CHECK (tidum_rls_turnus_org_allowed(org_id))',
      t || '_isolation', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I TO pg_database_owner', t);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %I TO pg_database_owner', t || '_id_seq');
  END LOOP;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;
