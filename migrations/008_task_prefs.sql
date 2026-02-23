-- User task learning preferences
CREATE TABLE IF NOT EXISTS user_task_prefs (
  user_id TEXT PRIMARY KEY,
  prefs    JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
