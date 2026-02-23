-- Forward log table for tracking report forwarding to institutions
CREATE TABLE IF NOT EXISTS forward_log (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  institution_name TEXT,
  report_type TEXT NOT NULL DEFAULT 'timesheet',
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_forward_log_user_id ON forward_log(user_id);
CREATE INDEX IF NOT EXISTS idx_forward_log_created_at ON forward_log(created_at);
