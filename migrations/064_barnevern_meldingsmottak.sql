-- migrations/064_barnevern_meldingsmottak.sql
-- Delprosjekt 2: meldingsmottak (bekymringsmelding). Ny, dedikert
-- tabell — IKKE gjenbruk av tidum_saker (den er utfører-side/
-- tiltaksbedrift-bundet, NOT NULL vendor_id/tiltaksleder_id).
-- Se docs/superpowers/specs/2026-08-23-barnevern-meldingsmottak-design.md.

DO $$ BEGIN
  CREATE TYPE tidum_barnevern_melding_status AS ENUM (
    'mottatt', 'under_avklaring', 'henlagt', 'sendt_til_undersokelse'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE tidum_barnevern_melding_kilde AS ENUM ('manuell', 'fiks_io');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Én delt sekvens (ikke per-kommune) — antall aktive kommuner er lite nok
-- denne runden at dynamisk CREATE SEQUENCE ved runtime ville vært
-- overingeniørkunst. meldingsnummer bygges som BVM-<kommunenummer>-<n>.
CREATE SEQUENCE IF NOT EXISTS tidum_barnevern_meldingsnummer_seq;

CREATE TABLE IF NOT EXISTS tidum_barnevern_meldinger (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kommune_id                INTEGER NOT NULL REFERENCES tidum_kommuner(id),
  meldingsnummer            TEXT NOT NULL UNIQUE,
  kilde                     tidum_barnevern_melding_kilde NOT NULL DEFAULT 'manuell',
  mottatt_dato              TIMESTAMPTZ NOT NULL,
  melder_kategori           TEXT NOT NULL,
  melder_navn               TEXT,
  melder_kontakt            TEXT,
  barn_fodselsnummer        TEXT,
  barn_navn                 TEXT,
  beskrivelse               TEXT NOT NULL,
  status                    tidum_barnevern_melding_status NOT NULL DEFAULT 'mottatt',
  tildelt_saksbehandler_id  VARCHAR REFERENCES users(id),
  avklaringsfrist           TIMESTAMPTZ NOT NULL,
  avklart_dato              TIMESTAMPTZ,
  avklart_av_user_id        VARCHAR REFERENCES users(id),
  henleggelse_begrunnelse   TEXT,
  fiks_melding_id           TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tidum_barnevern_meldinger_kommune_idx
  ON tidum_barnevern_meldinger (kommune_id, status);

CREATE TABLE IF NOT EXISTS tidum_barnevern_melding_vedlegg (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  melding_id     UUID NOT NULL REFERENCES tidum_barnevern_meldinger(id) ON DELETE CASCADE,
  filename       TEXT NOT NULL,
  original_name  TEXT NOT NULL,
  mime_type      TEXT NOT NULL,
  size_bytes     INTEGER NOT NULL,
  uploaded_by    VARCHAR NOT NULL REFERENCES users(id),
  uploaded_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
  CREATE TYPE tidum_frist_status AS ENUM ('aktiv', 'oppfylt', 'brutt', 'kansellert');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS tidum_frister (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type       TEXT NOT NULL,
  entity_id         TEXT NOT NULL,
  kommune_id        INTEGER REFERENCES tidum_kommuner(id),
  vendor_id         INTEGER REFERENCES tidum_vendors(id),
  frist_type        TEXT NOT NULL,
  due_at            TIMESTAMPTZ NOT NULL,
  status            tidum_frist_status NOT NULL DEFAULT 'aktiv',
  varslet_offsets   INTEGER[] NOT NULL DEFAULT '{}',
  notify_user_id    VARCHAR REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (entity_type, entity_id, frist_type)
);

CREATE INDEX IF NOT EXISTS tidum_frister_active_idx ON tidum_frister (status, due_at);

CREATE TABLE IF NOT EXISTS tidum_fiks_raw_intake_log (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kommune_id             INTEGER NOT NULL REFERENCES tidum_kommuner(id),
  raw_payload_encrypted  TEXT NOT NULL,
  received_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at           TIMESTAMPTZ,
  processing_error       TEXT
);

ALTER TABLE tidum_kommuner ADD COLUMN IF NOT EXISTS fiks_konto_id TEXT;
ALTER TABLE tidum_kommuner ADD COLUMN IF NOT EXISTS fiks_private_key_encrypted TEXT;
ALTER TABLE tidum_kommuner ADD COLUMN IF NOT EXISTS fiks_certificate_pem TEXT;
ALTER TABLE tidum_kommuner ADD COLUMN IF NOT EXISTS fiks_enabled BOOLEAN NOT NULL DEFAULT FALSE;
