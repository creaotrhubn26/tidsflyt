-- Migration 020: In-app notifications system
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,           -- target user
  type TEXT NOT NULL,              -- access_request, timesheet_submitted, timesheet_approved, timesheet_rejected, report_submitted, report_approved, report_rejected, report_revision, invite_received, forward_sent, general
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  link TEXT,                       -- URL to navigate to
  is_read BOOLEAN DEFAULT FALSE,
  metadata JSONB DEFAULT '{}',    -- extra context (caseId, reportId, timesheetId, etc.)
  created_by TEXT,                 -- who triggered this notification
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
