-- Migration 018: Ensure forward_log table has status column for dual-mode forwarding
-- Statuses: 'sent' (SMTP delivered), 'failed', 'prepared' (manual download), 'confirmed' (user confirmed manual send)

CREATE TABLE IF NOT EXISTS forward_log (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  institution_name TEXT,
  report_type TEXT NOT NULL DEFAULT 'timesheet',
  period_start TEXT,
  period_end TEXT,
  status TEXT NOT NULL DEFAULT 'prepared',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add status column if the table already existed without it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'forward_log' AND column_name = 'status'
  ) THEN
    ALTER TABLE forward_log ADD COLUMN status TEXT NOT NULL DEFAULT 'prepared';
  END IF;
END $$;
