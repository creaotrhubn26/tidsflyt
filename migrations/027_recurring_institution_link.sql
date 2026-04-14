-- Migration 027: Tag recurring tasks with institution
-- Lets a fast oppgave be scoped to a specific institution. Keeps existing
-- recurring tasks working (column nullable).

ALTER TABLE recurring_entries
  ADD COLUMN IF NOT EXISTS institution_id UUID
  REFERENCES vendor_institutions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_recurring_entries_institution
  ON recurring_entries(institution_id);
