-- Migration 050: Add missing UNIQUE(vendor_id, slug) on rapport_templates
--
-- Migration 028 defined this table with `UNIQUE (vendor_id, slug)`, but that
-- migration isn't part of the automatic startup migration list (only 036+
-- run on every boot) and the Drizzle schema (used by `db:push` for fresh
-- environments) never declared the constraint either. Result: on any
-- database where rapport_templates was created via `db:push` rather than
-- migration 028 directly, `seedSystemRapportTemplates`'s
-- `ON CONFLICT (vendor_id, slug) DO UPDATE` fails for every system template
-- with "no unique or exclusion constraint matching the ON CONFLICT
-- specification" — leaving Rapport-maler / the report-writing template
-- picker permanently empty on that environment.
DO $$
BEGIN
  ALTER TABLE rapport_templates ADD CONSTRAINT rapport_templates_vendor_id_slug_unique UNIQUE (vendor_id, slug);
EXCEPTION
  WHEN duplicate_object THEN
    NULL; -- constraint already exists (e.g. created by migration 028) — no-op
END $$;
