-- CMS Extensions: SEO, scheduling, templates, versions, forms, analytics, i18n
-- Run against Neon DB

-- Add new columns to builder_pages
ALTER TABLE builder_pages ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMP;
ALTER TABLE builder_pages ADD COLUMN IF NOT EXISTS meta_title TEXT;
ALTER TABLE builder_pages ADD COLUMN IF NOT EXISTS meta_description TEXT;
ALTER TABLE builder_pages ADD COLUMN IF NOT EXISTS og_image TEXT;
ALTER TABLE builder_pages ADD COLUMN IF NOT EXISTS canonical_url TEXT;
ALTER TABLE builder_pages ADD COLUMN IF NOT EXISTS global_header JSONB;
ALTER TABLE builder_pages ADD COLUMN IF NOT EXISTS global_footer JSONB;
ALTER TABLE builder_pages ADD COLUMN IF NOT EXISTS custom_css TEXT;
ALTER TABLE builder_pages ADD COLUMN IF NOT EXISTS locale TEXT DEFAULT 'nb';
ALTER TABLE builder_pages ADD COLUMN IF NOT EXISTS translation_of INTEGER;

-- Section Templates
CREATE TABLE IF NOT EXISTS section_templates (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'custom',
  thumbnail TEXT,
  section_data JSONB NOT NULL,
  is_built_in BOOLEAN DEFAULT FALSE,
  created_by TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Page Versions (revision history)
CREATE TABLE IF NOT EXISTS page_versions (
  id SERIAL PRIMARY KEY,
  page_id INTEGER NOT NULL,
  version INTEGER NOT NULL,
  title TEXT NOT NULL,
  sections JSONB NOT NULL,
  theme_key TEXT,
  custom_css TEXT,
  changed_by TEXT,
  change_note TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_page_versions_page_id ON page_versions(page_id);

-- Form Submissions
CREATE TABLE IF NOT EXISTS form_submissions (
  id SERIAL PRIMARY KEY,
  page_id INTEGER,
  page_slug TEXT,
  form_name TEXT DEFAULT 'contact',
  data JSONB NOT NULL,
  status TEXT DEFAULT 'new' NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_form_submissions_page_id ON form_submissions(page_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_status ON form_submissions(status);

-- Page Analytics
CREATE TABLE IF NOT EXISTS page_analytics (
  id SERIAL PRIMARY KEY,
  page_id INTEGER NOT NULL,
  page_slug TEXT,
  viewed_at TIMESTAMP DEFAULT NOW(),
  duration INTEGER,
  referrer TEXT,
  user_agent TEXT,
  country TEXT,
  device TEXT
);

CREATE INDEX IF NOT EXISTS idx_page_analytics_page_id ON page_analytics(page_id);
CREATE INDEX IF NOT EXISTS idx_page_analytics_viewed_at ON page_analytics(viewed_at);
