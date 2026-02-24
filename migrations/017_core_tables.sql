-- Migration 017: Create core application tables
-- log_row, user_settings, project_info, timer_sessions, quick_templates, vendors, api_keys, api_usage_log, admin_users

-- Core time-tracking table
CREATE TABLE IF NOT EXISTS log_row (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER,
  vendor_id INTEGER,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  break_hours NUMERIC(4,2) DEFAULT 0,
  activity TEXT,
  title TEXT,
  project TEXT,
  place TEXT,
  notes TEXT,
  expense_coverage NUMERIC(10,2) DEFAULT 0,
  user_id TEXT DEFAULT 'default',
  is_stamped_in BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_log_row_user_id ON log_row(user_id);
CREATE INDEX IF NOT EXISTS idx_log_row_date ON log_row(date);

-- User settings
CREATE TABLE IF NOT EXISTS user_settings (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE DEFAULT 'default',
  paid_break BOOLEAN DEFAULT FALSE,
  tax_pct NUMERIC(4,2) DEFAULT 35.00,
  hourly_rate NUMERIC(10,2) DEFAULT 0,
  timesheet_sender TEXT,
  timesheet_recipient TEXT,
  timesheet_format TEXT DEFAULT 'xlsx',
  smtp_app_password TEXT,
  webhook_active BOOLEAN DEFAULT FALSE,
  webhook_url TEXT,
  sheet_url TEXT,
  month_nav TEXT,
  invoice_reminder_active BOOLEAN DEFAULT FALSE,
  theme_mode TEXT DEFAULT 'dark',
  view_mode TEXT DEFAULT 'month',
  language TEXT DEFAULT 'no',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Project info
CREATE TABLE IF NOT EXISTS project_info (
  id SERIAL PRIMARY KEY,
  vendor_id INTEGER,
  konsulent TEXT,
  bedrift TEXT,
  oppdragsgiver TEXT,
  tiltak TEXT,
  periode TEXT,
  klient_id TEXT,
  user_id TEXT DEFAULT 'default',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_info_user_id ON project_info(user_id);

-- Timer sessions (pause/resume)
CREATE TABLE IF NOT EXISTS timer_sessions (
  user_id TEXT PRIMARY KEY,
  elapsed_seconds INTEGER NOT NULL DEFAULT 0,
  paused_seconds INTEGER NOT NULL DEFAULT 0,
  is_running BOOLEAN NOT NULL DEFAULT TRUE,
  pause_started_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Quick templates
CREATE TABLE IF NOT EXISTS quick_templates (
  id SERIAL PRIMARY KEY,
  user_id TEXT DEFAULT 'default',
  label TEXT NOT NULL,
  activity TEXT DEFAULT 'Work',
  title TEXT,
  project TEXT,
  place TEXT,
  is_favorite BOOLEAN DEFAULT FALSE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quick_templates_user_id ON quick_templates(user_id);

-- Vendors
CREATE TABLE IF NOT EXISTS vendors (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  email TEXT,
  phone TEXT,
  address TEXT,
  logo_url TEXT,
  status TEXT DEFAULT 'active',
  settings JSONB DEFAULT '{}',
  max_users INTEGER DEFAULT 50,
  subscription_plan TEXT DEFAULT 'standard',
  api_access_enabled BOOLEAN DEFAULT FALSE,
  api_subscription_start TIMESTAMP,
  api_subscription_end TIMESTAMP,
  api_monthly_price NUMERIC(10,2) DEFAULT 99.00,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- API Keys
CREATE TABLE IF NOT EXISTS api_keys (
  id SERIAL PRIMARY KEY,
  vendor_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  permissions TEXT[] DEFAULT '{}',
  rate_limit INTEGER DEFAULT 60,
  is_active BOOLEAN DEFAULT TRUE,
  last_used_at TIMESTAMP,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  revoked_at TIMESTAMP
);

-- API Usage Log
CREATE TABLE IF NOT EXISTS api_usage_log (
  id SERIAL PRIMARY KEY,
  api_key_id INTEGER NOT NULL,
  vendor_id INTEGER NOT NULL,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER,
  response_time_ms INTEGER,
  request_id TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Companies (if not exists)
CREATE TABLE IF NOT EXISTS companies (
  id SERIAL PRIMARY KEY,
  vendor_id INTEGER,
  name TEXT NOT NULL,
  logo_base64 TEXT,
  display_order INTEGER DEFAULT 0,
  enforce_hourly_rate BOOLEAN DEFAULT FALSE,
  enforced_hourly_rate NUMERIC(10,2),
  enforce_timesheet_recipient BOOLEAN DEFAULT FALSE,
  enforced_timesheet_to TEXT,
  enforced_timesheet_cc TEXT,
  enforced_timesheet_bcc TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Company users (if not exists)
CREATE TABLE IF NOT EXISTS company_users (
  id SERIAL PRIMARY KEY,
  vendor_id INTEGER,
  company_id INTEGER NOT NULL,
  user_email TEXT NOT NULL,
  google_email TEXT,
  role TEXT DEFAULT 'member',
  approved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
