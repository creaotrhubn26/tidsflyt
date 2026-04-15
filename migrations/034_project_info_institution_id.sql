-- Migration 034: Link project_info (saker/avtaler) to vendor_institutions
-- Tighter coupling than navn-matching. Optional — existing rows keep working.

ALTER TABLE project_info
  ADD COLUMN IF NOT EXISTS institution_id UUID;

CREATE INDEX IF NOT EXISTS idx_project_info_institution ON project_info(institution_id) WHERE institution_id IS NOT NULL;

-- Opportunistisk backfill: sak som har oppdragsgiver som matcher en eksisterende
-- institusjon i samme vendor, kobles automatisk. Case-insensitive.
UPDATE project_info p
SET institution_id = i.id
FROM vendor_institutions i
WHERE p.institution_id IS NULL
  AND p.oppdragsgiver IS NOT NULL
  AND p.vendor_id IS NOT NULL
  AND i.vendor_id = p.vendor_id
  AND LOWER(TRIM(p.oppdragsgiver)) = LOWER(TRIM(i.name));
