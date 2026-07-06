-- Migration 051: De-duplicate system rapport_templates and add a partial
-- UNIQUE index scoped to vendor_id IS NULL.
--
-- Migration 050 added `UNIQUE (vendor_id, slug)`, but in standard Postgres
-- every NULL is distinct from every other NULL for uniqueness purposes.
-- System templates are always inserted with vendor_id = NULL
-- (seedSystemRapportTemplates(), which runs on every server boot), so that
-- constraint can never catch a duplicate system template — Postgres never
-- reports a conflict, `ON CONFLICT (vendor_id, slug) DO UPDATE` never
-- matches, and a fresh duplicate row is inserted for every one of the 9
-- system templates on every restart, silently corrupting the
-- Rapport-maler / report-writing template picker.
--
-- Fix: de-dupe existing system rows (keep the oldest per slug) and add a
-- partial unique index on `slug` scoped to `vendor_id IS NULL`, which does
-- correctly catch duplicates since it has no per-row NULL to compare.

-- 1. De-duplicate: keep one row per slug among vendor_id IS NULL rows
--    (oldest created_at, falling back to id for a stable tiebreak on ties).
DELETE FROM rapport_templates
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY slug ORDER BY created_at ASC, id ASC
    ) AS rn
    FROM rapport_templates
    WHERE vendor_id IS NULL
  ) ranked
  WHERE rn > 1
);

-- 2. Add the partial unique index (idempotent).
DO $$
BEGIN
  CREATE UNIQUE INDEX rapport_templates_system_slug_unique
    ON rapport_templates (slug)
    WHERE vendor_id IS NULL;
EXCEPTION
  WHEN duplicate_table THEN
    NULL; -- index already exists — no-op
END $$;
