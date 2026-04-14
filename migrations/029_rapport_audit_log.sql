-- Migration 029: Rapport audit log
-- Append-only log of significant events on a rapport. Used for compliance,
-- timeline view in the editor, and "who changed what" investigations.

CREATE TABLE IF NOT EXISTS rapport_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rapport_id UUID NOT NULL REFERENCES rapporter(id) ON DELETE CASCADE,
  user_id INTEGER,
  user_name TEXT,
  user_role TEXT,

  -- Event classification
  event_type TEXT NOT NULL,    -- 'created' | 'submitted' | 'approved' | 'returned' | 'cancelled' | 'comment' | 'auto_forwarded'
  event_label TEXT,            -- short human-readable summary
  details JSONB DEFAULT '{}'::jsonb,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rapport_audit_log_rapport ON rapport_audit_log(rapport_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rapport_audit_log_event ON rapport_audit_log(event_type);
