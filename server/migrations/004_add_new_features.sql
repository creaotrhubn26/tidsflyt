-- Leave/Vacation Management Tables
CREATE TABLE IF NOT EXISTS leave_types (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  requires_approval BOOLEAN DEFAULT true,
  is_paid BOOLEAN DEFAULT true,
  max_days_per_year INTEGER,
  color TEXT DEFAULT '#0066cc',
  icon TEXT DEFAULT 'Calendar',
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS leave_balances (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  leave_type_id INTEGER REFERENCES leave_types(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  total_days NUMERIC(5, 2) DEFAULT 0,
  used_days NUMERIC(5, 2) DEFAULT 0,
  pending_days NUMERIC(5, 2) DEFAULT 0,
  remaining_days NUMERIC(5, 2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, leave_type_id, year)
);

CREATE TABLE IF NOT EXISTS leave_requests (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  leave_type_id INTEGER REFERENCES leave_types(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days NUMERIC(5, 2) NOT NULL,
  reason TEXT,
  status TEXT DEFAULT 'pending', -- pending, approved, rejected, cancelled
  reviewed_by TEXT,
  reviewed_at TIMESTAMP,
  review_comment TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Recurring Time Entries
CREATE TABLE IF NOT EXISTS recurring_entries (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  activity TEXT,
  project TEXT,
  place TEXT,
  hours NUMERIC(5, 2) NOT NULL,
  recurrence_type TEXT NOT NULL, -- daily, weekly, monthly
  recurrence_days TEXT, -- JSON array for weekly (e.g., ["monday", "wednesday"])
  recurrence_day_of_month INTEGER, -- for monthly (1-31)
  start_date DATE NOT NULL,
  end_date DATE,
  is_active BOOLEAN DEFAULT true,
  last_generated_date DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Overtime Tracking
CREATE TABLE IF NOT EXISTS overtime_settings (
  id SERIAL PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL,
  standard_hours_per_day NUMERIC(4, 2) DEFAULT 7.5,
  standard_hours_per_week NUMERIC(5, 2) DEFAULT 37.5,
  overtime_rate_multiplier NUMERIC(4, 2) DEFAULT 1.5,
  double_time_threshold NUMERIC(5, 2), -- hours per day before double-time kicks in
  track_overtime BOOLEAN DEFAULT true,
  require_approval BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS overtime_entries (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  date DATE NOT NULL,
  regular_hours NUMERIC(5, 2) DEFAULT 0,
  overtime_hours NUMERIC(5, 2) DEFAULT 0,
  double_time_hours NUMERIC(5, 2) DEFAULT 0,
  status TEXT DEFAULT 'pending', -- pending, approved, rejected
  approved_by TEXT,
  approved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Invoice/Billing
CREATE TABLE IF NOT EXISTS invoices (
  id SERIAL PRIMARY KEY,
  invoice_number TEXT UNIQUE NOT NULL,
  user_id TEXT NOT NULL,
  client_name TEXT,
  client_email TEXT,
  client_address TEXT,
  invoice_date DATE NOT NULL,
  due_date DATE NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  subtotal NUMERIC(10, 2) DEFAULT 0,
  tax_rate NUMERIC(5, 2) DEFAULT 0,
  tax_amount NUMERIC(10, 2) DEFAULT 0,
  total_amount NUMERIC(10, 2) DEFAULT 0,
  currency TEXT DEFAULT 'NOK',
  status TEXT DEFAULT 'draft', -- draft, sent, paid, overdue, cancelled
  payment_date DATE,
  payment_method TEXT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoice_line_items (
  id SERIAL PRIMARY KEY,
  invoice_id INTEGER REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC(10, 2) NOT NULL,
  unit_price NUMERIC(10, 2) NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  time_entry_id UUID REFERENCES log_row(id) ON DELETE SET NULL,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Notification Queue
CREATE TABLE IF NOT EXISTS notification_queue (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL, -- email, in_app, push
  category TEXT, -- reminder, approval, leave, invoice
  subject TEXT,
  message TEXT NOT NULL,
  data JSONB,
  status TEXT DEFAULT 'pending', -- pending, sent, failed
  scheduled_for TIMESTAMP DEFAULT NOW(),
  sent_at TIMESTAMP,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Insert default leave types
INSERT INTO leave_types (name, slug, requires_approval, is_paid, max_days_per_year, color, icon, display_order) VALUES
  ('Ferie', 'vacation', true, true, 25, '#22c55e', 'Palmtree', 1),
  ('Sykefravær', 'sick_leave', false, true, NULL, '#ef4444', 'Thermometer', 2),
  ('Omsorgspermisjon', 'care_leave', true, true, 10, '#f59e0b', 'Heart', 3),
  ('Permisjon uten lønn', 'unpaid_leave', true, false, NULL, '#6b7280', 'Ban', 4),
  ('Foreldrepermisjon', 'parental_leave', true, true, NULL, '#8b5cf6', 'Baby', 5)
ON CONFLICT (slug) DO NOTHING;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_leave_requests_user_id ON leave_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_leave_balances_user_id ON leave_balances(user_id);
CREATE INDEX IF NOT EXISTS idx_recurring_entries_user_id ON recurring_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_recurring_entries_active ON recurring_entries(is_active);
CREATE INDEX IF NOT EXISTS idx_overtime_entries_user_date ON overtime_entries(user_id, date);
CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_notification_queue_status ON notification_queue(status, scheduled_for);
