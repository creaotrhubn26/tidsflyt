-- Live timer session persistence for pause/resume syncing
CREATE TABLE IF NOT EXISTS timer_sessions (
  user_id TEXT PRIMARY KEY,
  elapsed_seconds INTEGER NOT NULL DEFAULT 0,
  paused_seconds INTEGER NOT NULL DEFAULT 0,
  is_running BOOLEAN NOT NULL DEFAULT true,
  pause_started_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_timer_sessions_updated_at ON timer_sessions(updated_at);
