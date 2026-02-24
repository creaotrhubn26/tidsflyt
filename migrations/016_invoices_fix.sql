-- Migration 016: Add extra columns to invoices + create invoice_line_items
-- The invoices table already exists with UUID id; add columns the app code expects

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS client_name TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS client_email TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS client_address TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_date TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS period_start TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS period_end TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax_rate TEXT DEFAULT '25';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax_amount TEXT DEFAULT '0';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS total_amount TEXT DEFAULT '0';

CREATE TABLE IF NOT EXISTS invoice_line_items (
  id SERIAL PRIMARY KEY,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity TEXT DEFAULT '0',
  unit_price TEXT DEFAULT '0',
  amount TEXT DEFAULT '0',
  display_order INTEGER DEFAULT 0
);
