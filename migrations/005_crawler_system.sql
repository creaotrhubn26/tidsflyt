-- =============================================
-- Tidum SEO Crawler System
-- Full website audit: broken links, redirects,
-- meta analysis, duplicate detection, structured
-- data validation, accessibility, and more.
-- =============================================

-- Crawl jobs (each crawl run)
CREATE TABLE IF NOT EXISTS crawler_jobs (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Untitled Crawl',
  target_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, running, paused, completed, failed, cancelled
  crawl_type TEXT NOT NULL DEFAULT 'full', -- full, links_only, sitemap, url_list
  
  -- Configuration
  max_pages INTEGER NOT NULL DEFAULT 500,
  max_depth INTEGER NOT NULL DEFAULT 10,
  crawl_delay_ms INTEGER NOT NULL DEFAULT 200,
  respect_robots_txt BOOLEAN NOT NULL DEFAULT true,
  follow_external_links BOOLEAN NOT NULL DEFAULT false,
  follow_subdomains BOOLEAN NOT NULL DEFAULT false,
  include_images BOOLEAN NOT NULL DEFAULT true,
  include_css BOOLEAN NOT NULL DEFAULT false,
  include_js BOOLEAN NOT NULL DEFAULT false,
  check_canonical BOOLEAN NOT NULL DEFAULT true,
  check_hreflang BOOLEAN NOT NULL DEFAULT true,
  extract_structured_data BOOLEAN NOT NULL DEFAULT true,
  check_accessibility BOOLEAN NOT NULL DEFAULT false,
  custom_user_agent TEXT,
  custom_robots_txt TEXT,
  url_list TEXT[], -- for url_list crawl type
  include_patterns TEXT[], -- regex patterns to include
  exclude_patterns TEXT[], -- regex patterns to exclude
  custom_extraction JSONB, -- [{name, selector, type:'css'|'xpath'|'regex', attribute?}]
  
  -- Progress & Stats
  pages_crawled INTEGER NOT NULL DEFAULT 0,
  pages_total INTEGER NOT NULL DEFAULT 0,
  errors_count INTEGER NOT NULL DEFAULT 0,
  warnings_count INTEGER NOT NULL DEFAULT 0,
  
  -- Timing
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  duration_ms INTEGER,
  
  -- Schedule
  schedule_id INTEGER,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Crawl results (per-URL data)
CREATE TABLE IF NOT EXISTS crawler_results (
  id SERIAL PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES crawler_jobs(id) ON DELETE CASCADE,
  
  -- URL info
  url TEXT NOT NULL,
  url_hash TEXT NOT NULL, -- MD5 for dedup
  parent_url TEXT, -- URL that linked to this
  depth INTEGER NOT NULL DEFAULT 0,
  
  -- Response
  status_code INTEGER,
  content_type TEXT,
  response_time_ms INTEGER,
  content_size INTEGER, -- bytes
  content_hash TEXT, -- MD5 of body for duplicate detection
  
  -- Redirect
  redirect_url TEXT,
  redirect_chain TEXT[], -- full chain
  redirect_type TEXT, -- 301, 302, 307, 308, meta, js
  
  -- Page data
  title TEXT,
  title_length INTEGER,
  meta_description TEXT,
  meta_description_length INTEGER,
  meta_keywords TEXT,
  canonical_url TEXT,
  canonical_is_self BOOLEAN,
  
  -- Headings
  h1 TEXT[],
  h1_count INTEGER DEFAULT 0,
  h2 TEXT[],
  h2_count INTEGER DEFAULT 0,
  
  -- Robots
  robots_meta TEXT, -- index,follow / noindex,nofollow etc
  robots_txt_allowed BOOLEAN DEFAULT true,
  x_robots_tag TEXT,
  
  -- Links
  internal_links_count INTEGER DEFAULT 0,
  external_links_count INTEGER DEFAULT 0,
  broken_links TEXT[], -- URLs that returned 4xx/5xx
  
  -- Images
  images_count INTEGER DEFAULT 0,
  images_without_alt INTEGER DEFAULT 0,
  images_alt_text JSONB, -- [{src, alt, missing}]
  
  -- Hreflang
  hreflang JSONB, -- [{lang, url}]
  hreflang_errors TEXT[],
  
  -- Structured data
  structured_data JSONB, -- parsed JSON-LD, Microdata
  structured_data_errors TEXT[],
  
  -- Open Graph & Twitter
  og_tags JSONB,
  twitter_tags JSONB,
  
  -- Performance
  word_count INTEGER,
  text_ratio REAL, -- text to HTML ratio
  
  -- Custom extraction
  custom_data JSONB,
  
  -- Accessibility
  accessibility_issues JSONB,
  
  -- Issues found
  issues JSONB, -- [{type, severity, message}]
  
  -- Indexability
  indexable BOOLEAN DEFAULT true,
  indexability_reason TEXT,
  
  crawled_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for crawler_results
CREATE INDEX IF NOT EXISTS idx_crawler_results_job_id ON crawler_results(job_id);
CREATE INDEX IF NOT EXISTS idx_crawler_results_url_hash ON crawler_results(url_hash);
CREATE INDEX IF NOT EXISTS idx_crawler_results_status_code ON crawler_results(job_id, status_code);
CREATE INDEX IF NOT EXISTS idx_crawler_results_content_hash ON crawler_results(job_id, content_hash);
CREATE INDEX IF NOT EXISTS idx_crawler_results_issues ON crawler_results USING GIN(issues);

-- Crawl schedules
CREATE TABLE IF NOT EXISTS crawler_schedules (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  target_url TEXT NOT NULL,
  cron_expression TEXT NOT NULL DEFAULT '0 3 * * 1', -- every Monday 3am
  is_active BOOLEAN NOT NULL DEFAULT true,
  
  -- Config (same as job)
  max_pages INTEGER NOT NULL DEFAULT 500,
  max_depth INTEGER NOT NULL DEFAULT 10,
  crawl_delay_ms INTEGER NOT NULL DEFAULT 200,
  respect_robots_txt BOOLEAN NOT NULL DEFAULT true,
  follow_external_links BOOLEAN NOT NULL DEFAULT false,
  
  last_run_at TIMESTAMP,
  next_run_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
