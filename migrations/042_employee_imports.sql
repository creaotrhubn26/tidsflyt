-- Migration 042: Ansatt-importer (Planday/Visma/CSV → Tidum)
--
-- To-fase importflyt:
--   1) Upload + parse → 'staged'-rad i `imports`, én rad per ansatt i `import_rows`
--   2) Hovedadmin går gjennom preview, justerer roller, klikker bekreft → 'confirmed'
-- Rollback (DELETE) støttes innen 7 dager (sjekkes i applikasjon).
--
-- Idempotens: re-import av samme fil med samme `external_id`-er gir ingen duplikater,
-- fordi vi sjekker (vendor_id, user_email) i company_users før vi setter inn.
--
-- Audit: `summary_jsonb` lagrer alt vi vil kunne svare på i ettertid
--   (hvor mange ble importert, hvilke ble vendor_admin, hvem kjørte importen).

CREATE TABLE IF NOT EXISTS imports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id       INTEGER NOT NULL,
  source          TEXT NOT NULL CHECK (source IN ('planday','visma','quinyx','csv')),
  status          TEXT NOT NULL DEFAULT 'staged' CHECK (status IN ('staged','confirmed','rolled_back','failed')),
  file_name       TEXT,
  file_hash       TEXT,
  row_count       INTEGER DEFAULT 0,
  created_by      TEXT NOT NULL,
  created_at      TIMESTAMP DEFAULT now(),
  confirmed_at    TIMESTAMP,
  rolled_back_at  TIMESTAMP,
  summary_jsonb   JSONB
);

CREATE INDEX IF NOT EXISTS idx_imports_vendor_status ON imports(vendor_id, status);
CREATE INDEX IF NOT EXISTS idx_imports_created_at    ON imports(created_at DESC);

CREATE TABLE IF NOT EXISTS import_rows (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id        UUID NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
  row_index        INTEGER NOT NULL,
  external_id      TEXT,
  raw_jsonb        JSONB,
  parsed_jsonb     JSONB,
  status           TEXT NOT NULL DEFAULT 'valid' CHECK (status IN ('valid','error','imported','skipped','duplicate')),
  error_msg        TEXT,
  role_assigned    TEXT,
  target_user_id   INTEGER REFERENCES company_users(id) ON DELETE SET NULL,
  created_at       TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_import_rows_import_id ON import_rows(import_id);
CREATE INDEX IF NOT EXISTS idx_import_rows_status    ON import_rows(import_id, status);

-- Idempotens-vakt: én ekstern ID kan ikke importeres to ganger i samme import-batch
CREATE UNIQUE INDEX IF NOT EXISTS uniq_import_rows_external_id
  ON import_rows(import_id, external_id)
  WHERE external_id IS NOT NULL;
