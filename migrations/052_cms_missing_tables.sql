-- Migration 052: Create CMS tables that were referenced by server routes
-- but never defined in any migration or in the Drizzle schema.
--
-- Found via QA: the Media Library, SEO, Skjemaer (Forms), Navigasjon and
-- Portal tabs in the CMS admin tool (/cms-legacy) 100% crashed with
-- "relation ... does not exist" for every user, on every environment,
-- since nothing anywhere ever created these tables. Columns below are
-- inferred directly from the INSERT/UPDATE/SELECT statements in
-- server/smartTimingRoutes.ts and the matching TypeScript interfaces in
-- client/src/pages/cms.tsx.

CREATE TABLE IF NOT EXISTS cms_media_folders (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id INTEGER REFERENCES cms_media_folders(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cms_media (
  id SERIAL PRIMARY KEY,
  filename TEXT NOT NULL,
  original_name TEXT,
  mime_type TEXT,
  file_size INTEGER,
  url TEXT NOT NULL,
  alt_text TEXT,
  title TEXT,
  description TEXT,
  folder_id INTEGER REFERENCES cms_media_folders(id) ON DELETE SET NULL,
  tags TEXT[],
  width INTEGER,
  height INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Per-page-type SEO overrides (distinct from seo_pages, which is a
-- per-URL-path SEO list, and from seo_global_settings, a single sitewide
-- settings row — both of those tables already exist and work).
--
-- page_id defaults to 0 (a real serial id can never be 0) instead of being
-- nullable: the PUT handler does `ON CONFLICT (page_type, page_id) DO
-- UPDATE` with no WHERE clause on the conflict target, which Postgres can
-- only resolve against a plain (non-partial) unique constraint. A nullable
-- page_id would need a partial index for the NULL case (the exact bug
-- fixed in migration 051 for rapport_templates), but raw SQL ON CONFLICT
-- without a matching WHERE can't target a partial index at all — so the
-- sentinel default avoids reintroducing that failure mode entirely.
CREATE TABLE IF NOT EXISTS cms_seo_settings (
  id SERIAL PRIMARY KEY,
  page_type TEXT NOT NULL,
  page_id INTEGER NOT NULL DEFAULT 0,
  meta_title TEXT,
  meta_description TEXT,
  og_title TEXT,
  og_description TEXT,
  og_image TEXT,
  twitter_card TEXT,
  canonical_url TEXT,
  robots TEXT,
  schema_type TEXT,
  schema_data JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  ALTER TABLE cms_seo_settings ADD CONSTRAINT cms_seo_settings_type_id_unique UNIQUE (page_type, page_id);
EXCEPTION
  WHEN duplicate_object OR duplicate_table THEN
    NULL; -- constraint (or its backing index) already exists — no-op
END $$;

CREATE TABLE IF NOT EXISTS cms_forms (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  fields JSONB NOT NULL DEFAULT '[]',
  submit_button_text TEXT,
  success_message TEXT,
  notification_email TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cms_form_submissions (
  id SERIAL PRIMARY KEY,
  form_id INTEGER NOT NULL REFERENCES cms_forms(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}',
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cms_navigation (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  location TEXT NOT NULL UNIQUE,
  items JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- vendor_id IS NULL means "global default settings" (a single such row).
-- The PUT handler does `ON CONFLICT (vendor_id) DO UPDATE` — a plain
-- UNIQUE(vendor_id) wouldn't catch conflicts among multiple NULL rows
-- (every NULL is distinct in Postgres), which would let a second global
-- settings row get inserted on every save instead of updating the first.
-- `NULLS NOT DISTINCT` (Postgres 15+) treats all NULLs as equal for this
-- constraint, so ON CONFLICT (vendor_id) correctly matches the existing
-- global row too.
CREATE TABLE IF NOT EXISTS portal_settings (
  id SERIAL PRIMARY KEY,
  vendor_id INTEGER,
  logo_url TEXT,
  logo_text TEXT,
  primary_color TEXT,
  accent_color TEXT,
  sidebar_bg TEXT,
  header_bg TEXT,
  content_bg TEXT,
  footer_bg TEXT,
  custom_css TEXT,
  nav_items JSONB NOT NULL DEFAULT '[]',
  footer_text TEXT,
  show_branding BOOLEAN NOT NULL DEFAULT TRUE,
  tokens JSONB NOT NULL DEFAULT '{}',
  layout JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE NULLS NOT DISTINCT (vendor_id)
);
