-- Migration 030: Feedback acknowledgment + helpers
-- When a rapport is returnert, miljøarbeider confirms they've read the feedback
-- before resubmitting. Used to show tiltaksleder that the worker has actually
-- seen and addressed the comments (vs. silently resubmitting the same content).

ALTER TABLE rapporter
  ADD COLUMN IF NOT EXISTS feedback_acknowledged_at  TIMESTAMP,
  ADD COLUMN IF NOT EXISTS feedback_acknowledged_text TEXT;

CREATE INDEX IF NOT EXISTS idx_rapporter_status_tiltaksleder
  ON rapporter(tiltaksleder_id, status);
