-- Tidum-owned invoice storage.
--
-- The pre-existing public.invoices table belongs to CreatorHub and has a
-- different, incompatible schema. Earlier Tidum migrations added a few
-- columns to that foreign table, but the invoice routes still could not
-- create a valid row because CreatorHub-specific NOT NULL columns remained.
-- Keep that table untouched and give Tidum an explicitly namespaced model.

CREATE TABLE IF NOT EXISTS tidum_invoices (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id      INTEGER NOT NULL,
  user_id        VARCHAR NOT NULL,
  invoice_number TEXT NOT NULL,
  client_name    TEXT NOT NULL,
  client_org_number TEXT,
  client_email   TEXT,
  client_address TEXT,
  invoice_date   DATE NOT NULL,
  due_date       DATE NOT NULL,
  period_start   DATE NOT NULL,
  period_end     DATE NOT NULL,
  subtotal       NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_rate       NUMERIC(5,2) NOT NULL DEFAULT 25,
  tax_amount     NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount   NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency       VARCHAR(3) NOT NULL DEFAULT 'NOK',
  status         VARCHAR(20) NOT NULL DEFAULT 'draft',
  notes          TEXT,
  created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT tidum_invoices_status_check
    CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled')),
  CONSTRAINT tidum_invoices_period_check
    CHECK (period_start <= period_end),
  CONSTRAINT tidum_invoices_tax_rate_check
    CHECK (tax_rate >= 0 AND tax_rate <= 100),
  CONSTRAINT tidum_invoices_amounts_check
    CHECK (subtotal >= 0 AND tax_amount >= 0 AND total_amount >= 0),
  CONSTRAINT tidum_invoices_vendor_number_unique
    UNIQUE (vendor_id, invoice_number)
);

CREATE INDEX IF NOT EXISTS tidum_invoices_owner_idx
  ON tidum_invoices (vendor_id, user_id, invoice_date DESC);

CREATE INDEX IF NOT EXISTS tidum_invoices_status_idx
  ON tidum_invoices (vendor_id, user_id, status);

-- public.tidum_invoice_line_items already points at CreatorHub's incompatible
-- invoices table in existing environments. Preserve it and create a clean,
-- unambiguous child table for the Tidum-owned invoice model.
CREATE TABLE IF NOT EXISTS tidum_invoice_items (
  id            SERIAL PRIMARY KEY,
  invoice_id    UUID NOT NULL
                  REFERENCES tidum_invoices(id) ON DELETE CASCADE,
  description   TEXT NOT NULL,
  quantity      NUMERIC(12,2) NOT NULL DEFAULT 0,
  unit_price    NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount        NUMERIC(12,2) NOT NULL DEFAULT 0,
  display_order INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT tidum_invoice_items_amounts_check
    CHECK (quantity >= 0 AND unit_price >= 0 AND amount >= 0)
);

CREATE INDEX IF NOT EXISTS tidum_invoice_items_invoice_idx
  ON tidum_invoice_items (invoice_id, display_order);
