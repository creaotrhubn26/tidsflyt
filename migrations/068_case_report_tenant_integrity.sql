-- Enforce the tenant ownership assumptions used by the case-report routes.
-- Refuse to guess when a legacy report cannot be mapped unambiguously.

CREATE TABLE IF NOT EXISTS tidum_case_reports (
  id                  SERIAL PRIMARY KEY,
  vendor_id           INTEGER NOT NULL,
  user_id             TEXT NOT NULL,
  user_cases_id       INTEGER,
  case_id             TEXT NOT NULL,
  month               TEXT NOT NULL,
  background          TEXT,
  actions             TEXT,
  progress            TEXT,
  challenges          TEXT,
  factors             TEXT,
  assessment          TEXT,
  recommendations     TEXT,
  notes               TEXT,
  status              TEXT NOT NULL DEFAULT 'draft',
  rejection_reason    TEXT,
  rejected_by         TEXT,
  rejected_at         TIMESTAMP,
  approved_by         TEXT,
  approved_at         TIMESTAMP,
  created_at          TIMESTAMP DEFAULT NOW(),
  updated_at          TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tidum_report_comments (
  id          SERIAL PRIMARY KEY,
  report_id   INTEGER NOT NULL REFERENCES tidum_case_reports(id) ON DELETE CASCADE,
  author_id   TEXT NOT NULL,
  author_name TEXT,
  author_role TEXT DEFAULT 'user',
  content     TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT false,
  parent_id   INTEGER,
  read_at     TIMESTAMP,
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tidum_report_generated (
  id             SERIAL PRIMARY KEY,
  case_report_id INTEGER NOT NULL REFERENCES tidum_case_reports(id) ON DELETE CASCADE,
  template_id    INTEGER NOT NULL,
  generated_by  TEXT,
  pdf_url        TEXT,
  metadata       JSONB,
  created_at     TIMESTAMP DEFAULT NOW()
);

ALTER TABLE tidum_case_reports
  ADD COLUMN IF NOT EXISTS vendor_id INTEGER;

UPDATE tidum_case_reports cr
SET vendor_id = u.vendor_id
FROM users u
WHERE cr.vendor_id IS NULL
  AND u.id::text = cr.user_id::text
  AND u.vendor_id IS NOT NULL;

WITH unique_memberships AS (
  SELECT LOWER(user_email) AS email, MIN(vendor_id) AS vendor_id
  FROM tidum_company_users
  WHERE vendor_id IS NOT NULL
  GROUP BY LOWER(user_email)
  HAVING COUNT(DISTINCT vendor_id) = 1
)
UPDATE tidum_case_reports cr
SET vendor_id = membership.vendor_id
FROM unique_memberships membership
WHERE cr.vendor_id IS NULL
  AND LOWER(cr.user_id) = membership.email;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM tidum_case_reports WHERE vendor_id IS NULL) THEN
    RAISE EXCEPTION 'tidum_case_reports contains rows without an unambiguous vendor; refusing tenant-integrity migration';
  END IF;
END $$;

ALTER TABLE tidum_case_reports
  ALTER COLUMN vendor_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS tidum_case_reports_owner_idx
  ON tidum_case_reports (vendor_id, user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS tidum_case_reports_review_idx
  ON tidum_case_reports (vendor_id, status, created_at DESC);

DO $$
BEGIN
  IF to_regclass('public.tidum_report_comments') IS NOT NULL
     AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tidum_report_comments_report_id_fkey'
      AND conrelid = to_regclass('public.tidum_report_comments')
  ) THEN
    ALTER TABLE tidum_report_comments
      ADD CONSTRAINT tidum_report_comments_report_id_fkey
      FOREIGN KEY (report_id) REFERENCES tidum_case_reports(id)
      ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.tidum_report_comments') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'tidum_report_comments_report_id_fkey'
         AND conrelid = to_regclass('public.tidum_report_comments')
         AND NOT convalidated
     ) THEN
    ALTER TABLE tidum_report_comments
      VALIDATE CONSTRAINT tidum_report_comments_report_id_fkey;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.tidum_report_generated') IS NOT NULL
     AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tidum_report_generated_case_report_id_fkey'
      AND conrelid = to_regclass('public.tidum_report_generated')
  ) THEN
    ALTER TABLE tidum_report_generated
      ADD CONSTRAINT tidum_report_generated_case_report_id_fkey
      FOREIGN KEY (case_report_id) REFERENCES tidum_case_reports(id)
      ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.tidum_report_generated') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'tidum_report_generated_case_report_id_fkey'
         AND conrelid = to_regclass('public.tidum_report_generated')
         AND NOT convalidated
     ) THEN
    ALTER TABLE tidum_report_generated
      VALIDATE CONSTRAINT tidum_report_generated_case_report_id_fkey;
  END IF;
END $$;
