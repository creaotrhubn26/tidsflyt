-- Migration 015: Create feature tables (invoices, leave, overtime, recurring)

-- ========== INVOICES ==========

CREATE TABLE IF NOT EXISTS invoices (
  id SERIAL PRIMARY KEY,
  invoice_number TEXT NOT NULL,
  user_id TEXT NOT NULL DEFAULT 'default',
  client_name TEXT NOT NULL,
  client_email TEXT,
  client_address TEXT,
  invoice_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  period_start TEXT,
  period_end TEXT,
  subtotal TEXT DEFAULT '0',
  tax_rate TEXT DEFAULT '25',
  tax_amount TEXT DEFAULT '0',
  total_amount TEXT DEFAULT '0',
  currency TEXT DEFAULT 'NOK',
  status TEXT DEFAULT 'draft',
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoice_line_items (
  id SERIAL PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity TEXT DEFAULT '0',
  unit_price TEXT DEFAULT '0',
  amount TEXT DEFAULT '0',
  display_order INTEGER DEFAULT 0
);

-- ========== LEAVE MANAGEMENT ==========

CREATE TABLE IF NOT EXISTS leave_types (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT,
  color TEXT,
  icon TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  display_order INTEGER DEFAULT 0,
  max_days_per_year INTEGER
);

-- Seed default leave types
INSERT INTO leave_types (name, slug, color, icon, display_order) VALUES
  ('Ferie', 'vacation', '#3b82f6', 'Palmtree', 1),
  ('Sykefravær', 'sick', '#ef4444', 'Thermometer', 2),
  ('Permisjon', 'leave', '#f59e0b', 'Baby', 3),
  ('Avspasering', 'comp-time', '#10b981', 'Clock', 4)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS leave_requests (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'default',
  leave_type_id INTEGER NOT NULL REFERENCES leave_types(id),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  days TEXT DEFAULT '0',
  reason TEXT,
  status TEXT DEFAULT 'pending',
  reviewed_by TEXT,
  reviewed_at TIMESTAMP,
  review_comment TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS leave_balances (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'default',
  leave_type_id INTEGER NOT NULL REFERENCES leave_types(id),
  year INTEGER NOT NULL,
  total_days TEXT DEFAULT '0',
  used_days TEXT DEFAULT '0',
  pending_days TEXT DEFAULT '0',
  remaining_days TEXT DEFAULT '0'
);

-- ========== OVERTIME ==========

CREATE TABLE IF NOT EXISTS overtime_settings (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  standard_hours_per_day TEXT DEFAULT '7.5',
  standard_hours_per_week TEXT DEFAULT '37.5',
  overtime_rate_multiplier TEXT DEFAULT '1.5',
  double_time_threshold TEXT,
  track_overtime BOOLEAN DEFAULT TRUE,
  require_approval BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS overtime_entries (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'default',
  date TEXT NOT NULL,
  regular_hours TEXT DEFAULT '0',
  overtime_hours TEXT DEFAULT '0',
  double_time_hours TEXT DEFAULT '0',
  status TEXT DEFAULT 'pending',
  approved_by TEXT,
  approved_at TIMESTAMP
);

-- ========== RECURRING ENTRIES ==========

CREATE TABLE IF NOT EXISTS recurring_entries (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'default',
  title TEXT NOT NULL,
  description TEXT,
  activity TEXT,
  project TEXT,
  place TEXT,
  hours TEXT DEFAULT '0',
  recurrence_type TEXT NOT NULL,
  recurrence_days TEXT,
  recurrence_day_of_month INTEGER,
  start_date TEXT NOT NULL,
  end_date TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  last_generated_date TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_leave_requests_user_id ON leave_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_overtime_entries_user_id ON overtime_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_recurring_entries_user_id ON recurring_entries(user_id);
