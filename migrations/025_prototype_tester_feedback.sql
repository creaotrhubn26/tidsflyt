-- Migration 025: Prototype tester role + contextual feedback
-- Adds feedback table where testers can report bugs/ideas/praise tied to a specific page & context.

-- Tester feedback items
CREATE TABLE IF NOT EXISTS tester_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL,
  email TEXT,
  full_name TEXT,
  category TEXT NOT NULL DEFAULT 'bug',   -- 'bug' | 'idea' | 'praise' | 'other'
  severity TEXT DEFAULT 'medium',         -- 'low' | 'medium' | 'high' | 'critical'
  page_path TEXT,                         -- /rapporter/ny, /overtime, etc.
  page_title TEXT,                        -- what was the page heading at time of feedback
  user_agent TEXT,
  viewport_width INTEGER,
  viewport_height INTEGER,
  message TEXT NOT NULL,
  steps_to_reproduce TEXT,
  screenshot_data_url TEXT,               -- optional base64 screenshot or dataURL
  extra_context JSONB DEFAULT '{}'::jsonb, -- app state snapshot (role, active tab, etc.)
  status TEXT NOT NULL DEFAULT 'new',     -- 'new' | 'in_review' | 'planned' | 'resolved' | 'wontfix'
  admin_notes TEXT,
  admin_reply TEXT,
  replied_at TIMESTAMP,
  resolved_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tester_feedback_user ON tester_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_tester_feedback_status ON tester_feedback(status);
CREATE INDEX IF NOT EXISTS idx_tester_feedback_created ON tester_feedback(created_at DESC);
