-- 052_archive_integration.sql
-- Noark 5-arkivering via ekstern arkivkjerne (Documaster først).
-- Godkjente rapporter (senere: vedtak, dialog) arkiveres som journalposter
-- i en saksmappe per sak, med skjerming/gradering.
-- Idempotent — kjøres ved hver oppstart (run-startup-migrations).

-- Per-vendor arkivkonfigurasjon. client_secret lagres forseglet via
-- server/lib/secret-box.ts (AES-256-GCM, "enc:v1:"-prefiks) når
-- TIDUM_SECRET_KEY er satt.
CREATE TABLE IF NOT EXISTS archive_configs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id          integer NOT NULL UNIQUE,
  provider           text NOT NULL DEFAULT 'documaster',
  base_url           text NOT NULL,
  client_id          text NOT NULL,
  client_secret      text NOT NULL,
  -- Noark 5-struktur journalpostene skal inn i (hentes fra arkivkjernen)
  arkivdel_id        text,
  journalenhet       text,
  -- Automatisk arkivering ved godkjenning av rapport
  auto_archive       boolean NOT NULL DEFAULT true,
  -- Standard skjerming for journalposter (kan overstyres per oppføring)
  skjermingshjemmel  text DEFAULT 'Offl. § 13 jf. fvl. § 13',
  tilgangsrestriksjon text DEFAULT 'UO',
  status             text NOT NULL DEFAULT 'active', -- active | disabled | invalid
  last_verified_at   timestamptz,
  last_error         text,
  created_by         text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- Kobling sak -> saksmappe i arkivkjernen, slik at alle journalposter for
-- samme sak havner i samme mappe og mappen bare opprettes én gang.
CREATE TABLE IF NOT EXISTS archive_case_links (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id         integer NOT NULL,
  sak_id            uuid NOT NULL UNIQUE,
  ekstern_mappe_id  text NOT NULL,
  mappe_ident       text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Outbox + kvittering for arkivering. Én rad per (entity_type, entity_id).
-- pending-rader plukkes av archive-cron med eksponentiell backoff.
CREATE TABLE IF NOT EXISTS archive_entries (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id               integer NOT NULL,
  entity_type             text NOT NULL, -- rapport | vedtak | dialog
  entity_id               text NOT NULL,
  sak_id                  uuid,
  status                  text NOT NULL DEFAULT 'pending', -- pending | archived | failed | skipped
  trigger_kind            text, -- approved | manual | retry
  attempts                integer NOT NULL DEFAULT 0,
  next_attempt_at         timestamptz DEFAULT now(),
  ekstern_mappe_id        text,
  ekstern_journalpost_id  text,
  journalpost_ident       text,
  payload_hash            text,
  skjerming               jsonb,
  error                   text,
  archived_at             timestamptz,
  created_by              text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT archive_entries_entity_unique UNIQUE (entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS archive_entries_pending_idx
  ON archive_entries (status, next_attempt_at)
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS archive_entries_vendor_idx
  ON archive_entries (vendor_id, created_at DESC);
