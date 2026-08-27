ALTER TABLE tidum_dashboard_tasks ADD COLUMN IF NOT EXISTS assigned_by_user_id TEXT;
ALTER TABLE tidum_dashboard_tasks ADD COLUMN IF NOT EXISTS due_at TIMESTAMP;
ALTER TABLE tidum_dashboard_tasks ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_dashboard_tasks_escalation
  ON tidum_dashboard_tasks (due_at)
  WHERE done = false AND escalated_at IS NULL AND assigned_by_user_id IS NOT NULL;
