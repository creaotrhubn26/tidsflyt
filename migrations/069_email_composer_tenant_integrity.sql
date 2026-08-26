-- Tenant-safe storage for the authenticated email composer.
--
-- public.email_templates belongs to CreatorHub and has an incompatible
-- photographer/template schema. Keep it untouched. The composer gets its own
-- Tidum-prefixed template/history tables and explicit tenant ownership.

CREATE TABLE IF NOT EXISTS tidum_email_composer_templates (
  id           SERIAL PRIMARY KEY,
  vendor_id    INTEGER,
  user_id      TEXT,
  name         TEXT NOT NULL,
  slug         TEXT NOT NULL,
  subject      TEXT NOT NULL,
  body         TEXT,
  html_content TEXT NOT NULL DEFAULT '',
  text_content TEXT,
  variables    JSONB NOT NULL DEFAULT '[]'::jsonb,
  category     TEXT NOT NULL DEFAULT 'general',
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  is_public    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT tidum_email_composer_templates_scope_check CHECK (
    (is_public = TRUE AND vendor_id IS NULL AND user_id IS NULL)
    OR
    (is_public = FALSE AND vendor_id IS NOT NULL AND user_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS tidum_email_composer_templates_system_slug_unique
  ON tidum_email_composer_templates (slug)
  WHERE is_public = TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS tidum_email_composer_templates_owner_slug_unique
  ON tidum_email_composer_templates (vendor_id, user_id, slug)
  WHERE is_public = FALSE;

CREATE INDEX IF NOT EXISTS tidum_email_composer_templates_scope_idx
  ON tidum_email_composer_templates (vendor_id, user_id, is_active, category);

CREATE TABLE IF NOT EXISTS tidum_email_composer_history (
  id              SERIAL PRIMARY KEY,
  vendor_id       INTEGER NOT NULL,
  template_id     INTEGER,
  sent_by         TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  recipient_name  TEXT,
  cc_email        TEXT,
  bcc_email       TEXT,
  subject         TEXT NOT NULL,
  body            TEXT,
  attachments     JSONB NOT NULL DEFAULT '[]'::jsonb,
  status          TEXT NOT NULL DEFAULT 'pending',
  sent_at         TIMESTAMPTZ,
  error_message   TEXT,
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tidum_email_composer_history_status_check
    CHECK (status IN ('pending', 'sent', 'failed'))
);

CREATE INDEX IF NOT EXISTS tidum_email_composer_history_owner_idx
  ON tidum_email_composer_history (vendor_id, sent_by, created_at DESC);

CREATE TABLE IF NOT EXISTS tidum_email_drafts (
  id               SERIAL PRIMARY KEY,
  vendor_id        INTEGER NOT NULL,
  user_id          TEXT NOT NULL,
  to_email         TEXT,
  cc_email         TEXT,
  bcc_email        TEXT,
  subject          TEXT,
  body             TEXT,
  template_id      INTEGER,
  recipient_name   TEXT,
  institution_name TEXT,
  attachments      JSONB NOT NULL DEFAULT '[]'::jsonb,
  send_at           TIMESTAMPTZ,
  sent_at           TIMESTAMPTZ,
  status            TEXT NOT NULL DEFAULT 'draft',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE tidum_email_drafts
  ADD COLUMN IF NOT EXISTS vendor_id INTEGER;

UPDATE tidum_email_drafts d
SET vendor_id = u.vendor_id
FROM users u
WHERE d.vendor_id IS NULL
  AND u.id::text = d.user_id::text
  AND u.vendor_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM tidum_email_drafts WHERE vendor_id IS NULL) THEN
    RAISE EXCEPTION 'tidum_email_drafts contains rows without tenant ownership; refusing migration';
  END IF;
END $$;

UPDATE tidum_email_drafts
SET attachments = COALESCE(attachments, '[]'::jsonb),
    status = COALESCE(status, 'draft'),
    created_at = COALESCE(created_at, NOW()),
    updated_at = COALESCE(updated_at, NOW());

ALTER TABLE tidum_email_drafts
  ALTER COLUMN vendor_id SET NOT NULL,
  ALTER COLUMN attachments SET DEFAULT '[]'::jsonb,
  ALTER COLUMN attachments SET NOT NULL,
  ALTER COLUMN status SET DEFAULT 'draft',
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT NOW(),
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'tidum_email_drafts'::regclass
      AND conname = 'tidum_email_drafts_status_check'
  ) THEN
    ALTER TABLE tidum_email_drafts
      ADD CONSTRAINT tidum_email_drafts_status_check
      CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'failed')) NOT VALID;
  END IF;
END $$;

ALTER TABLE tidum_email_drafts
  VALIDATE CONSTRAINT tidum_email_drafts_status_check;

DROP INDEX IF EXISTS idx_email_drafts_user;
CREATE INDEX IF NOT EXISTS tidum_email_drafts_owner_idx
  ON tidum_email_drafts (vendor_id, user_id, status, updated_at DESC);

DROP INDEX IF EXISTS idx_email_drafts_send_at;
CREATE INDEX IF NOT EXISTS tidum_email_drafts_due_idx
  ON tidum_email_drafts (status, send_at)
  WHERE status IN ('scheduled', 'sending');

CREATE TABLE IF NOT EXISTS tidum_email_attachments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id     INTEGER NOT NULL,
  user_id       TEXT NOT NULL,
  stored_name   TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  mime_type     TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL,
  used_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tidum_email_attachments_size_check
    CHECK (size_bytes > 0 AND size_bytes <= 10485760)
);

CREATE INDEX IF NOT EXISTS tidum_email_attachments_owner_idx
  ON tidum_email_attachments (vendor_id, user_id, created_at DESC);
