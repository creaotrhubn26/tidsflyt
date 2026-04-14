-- Migration 023: Move client-side state to database for cross-device persistence
-- Covers: form drafts, custom goal categories, dashboard prefs, onboarding flag

-- Custom goal categories per user (replaces localStorage "custom-goal-cats")
CREATE TABLE IF NOT EXISTS user_goal_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL,
  navn TEXT NOT NULL,
  ikon TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (user_id, navn)
);
CREATE INDEX IF NOT EXISTS idx_user_goal_categories_user ON user_goal_categories(user_id);

-- Form drafts per user (replaces localStorage drafts in use-draft.ts)
CREATE TABLE IF NOT EXISTS user_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL,
  storage_key TEXT NOT NULL,
  payload JSONB NOT NULL,
  editing_id INTEGER,
  saved_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP,
  UNIQUE (user_id, storage_key)
);
CREATE INDEX IF NOT EXISTS idx_user_drafts_user ON user_drafts(user_id);
CREATE INDEX IF NOT EXISTS idx_user_drafts_expires ON user_drafts(expires_at) WHERE expires_at IS NOT NULL;

-- Extend user_settings with onboarding flag and dashboard prefs
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS dashboard_prefs JSONB DEFAULT '{}'::jsonb;
