-- Migration 013: Add timesheet_submissions table and institution_type column

-- Add institution_type to access_requests
ALTER TABLE access_requests ADD COLUMN IF NOT EXISTS institution_type TEXT;

-- Timesheet submissions for monthly timeliste workflow
CREATE TABLE IF NOT EXISTS timesheet_submissions (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  vendor_id INTEGER,
  month TEXT NOT NULL,
  total_hours NUMERIC(10,2) DEFAULT 0,
  entry_count INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  submitted_at TIMESTAMP,
  approved_by TEXT,
  approved_at TIMESTAMP,
  rejected_by TEXT,
  rejected_at TIMESTAMP,
  rejection_reason TEXT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, month)
);

-- Index for efficient querying
CREATE INDEX IF NOT EXISTS idx_timesheet_submissions_user_month ON timesheet_submissions(user_id, month);
CREATE INDEX IF NOT EXISTS idx_timesheet_submissions_status ON timesheet_submissions(status);
CREATE INDEX IF NOT EXISTS idx_timesheet_submissions_vendor ON timesheet_submissions(vendor_id);
