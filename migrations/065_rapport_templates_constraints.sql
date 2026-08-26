-- Migration 065: make rapport-template identity match the two real scopes.
--
-- A compound UNIQUE(vendor_id, slug) does not de-duplicate system templates:
-- PostgreSQL treats each NULL vendor_id as distinct. The system seed runs at
-- every application start, so its conflict target must instead be the slug
-- partial index where vendor_id IS NULL.

BEGIN;

-- Record duplicate -> canonical mappings before deleting anything. Keep the
-- oldest row deterministically, then repoint known references so an existing
-- institution/report does not silently lose its chosen template.
CREATE TEMP TABLE tidum_rapport_template_dedup_map ON COMMIT DROP AS
SELECT id AS duplicate_id, keep_id
FROM (
  SELECT
    id,
    FIRST_VALUE(id) OVER (
      PARTITION BY slug
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS keep_id,
    ROW_NUMBER() OVER (
      PARTITION BY slug
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS row_number
  FROM tidum_rapport_templates
  WHERE vendor_id IS NULL
) ranked
WHERE row_number > 1;

DO $$
BEGIN
  IF to_regclass('public.tidum_vendor_institutions') IS NOT NULL THEN
    UPDATE tidum_vendor_institutions AS institution
    SET default_rapport_template_id = mapping.keep_id
    FROM tidum_rapport_template_dedup_map AS mapping
    WHERE institution.default_rapport_template_id = mapping.duplicate_id;
  END IF;

  IF to_regclass('public.tidum_rapporter') IS NOT NULL THEN
    UPDATE tidum_rapporter AS rapport
    SET rapport_template_id = mapping.keep_id
    FROM tidum_rapport_template_dedup_map AS mapping
    WHERE rapport.rapport_template_id = mapping.duplicate_id;
  END IF;
END $$;

DELETE FROM tidum_rapport_templates AS template
USING tidum_rapport_template_dedup_map AS mapping
WHERE template.id = mapping.duplicate_id;

CREATE UNIQUE INDEX IF NOT EXISTS tidum_rapport_templates_system_slug_unique
  ON tidum_rapport_templates (slug)
  WHERE vendor_id IS NULL;

COMMIT;

-- A fresh drizzle-created database also needs tenant-local slug uniqueness.
-- Existing installations created by migration 028 may already enforce this
-- through a differently named table constraint; this named partial index is
-- harmless alongside it. Do not block the system-template repair if legacy
-- tenant duplicates are present: warn and leave those rows for manual review.
DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS tidum_rapport_templates_vendor_slug_unique
    ON tidum_rapport_templates (vendor_id, slug)
    WHERE vendor_id IS NOT NULL;
EXCEPTION
  WHEN unique_violation THEN
    RAISE WARNING 'Tenant rapport-template duplicates remain; vendor slug index was not created';
END $$;
