-- Dashboard tasks: per-user to-do items on the dashboard
CREATE TABLE IF NOT EXISTS dashboard_tasks (
  id          SERIAL PRIMARY KEY,
  user_id     TEXT NOT NULL,
  title       TEXT NOT NULL,
  done        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dashboard_tasks_user_id ON dashboard_tasks (user_id);
