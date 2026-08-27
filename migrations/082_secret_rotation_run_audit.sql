-- Append-only platform evidence for secret-key rotation runs. The rows contain
-- key identifiers and aggregate counts only; no ciphertext or plaintext secret
-- values are permitted in this table.

CREATE TABLE IF NOT EXISTS tidum_secret_rotation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rotation_source VARCHAR(32) NOT NULL,
  initiated_by VARCHAR,
  active_key_id VARCHAR(64) NOT NULL,
  status VARCHAR(16) NOT NULL,
  rotated_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  remaining_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_code VARCHAR(64),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tidum_secret_rotation_runs_source_check
    CHECK (rotation_source IN ('manual', 'scheduled')),
  CONSTRAINT tidum_secret_rotation_runs_status_check
    CHECK (status IN ('completed', 'failed')),
  CONSTRAINT tidum_secret_rotation_runs_active_key_check
    CHECK (active_key_id ~ '^[A-Za-z0-9._-]{1,64}$'),
  CONSTRAINT tidum_secret_rotation_runs_counts_check
    CHECK (
      jsonb_typeof(rotated_counts) = 'object'
      AND jsonb_typeof(remaining_counts) = 'object'
    ),
  CONSTRAINT tidum_secret_rotation_runs_manual_actor_check
    CHECK (rotation_source <> 'manual' OR initiated_by IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS tidum_secret_rotation_runs_completed_idx
  ON tidum_secret_rotation_runs (completed_at DESC);
CREATE INDEX IF NOT EXISTS tidum_secret_rotation_runs_active_key_idx
  ON tidum_secret_rotation_runs (active_key_id, completed_at DESC);

CREATE OR REPLACE FUNCTION tidum_secret_rotation_runs_immutable()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'tidum_secret_rotation_runs is append-only';
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'tidum_secret_rotation_runs_immutable_trigger'
       AND tgrelid = 'tidum_secret_rotation_runs'::regclass
  ) THEN
    CREATE TRIGGER tidum_secret_rotation_runs_immutable_trigger
      BEFORE UPDATE OR DELETE ON tidum_secret_rotation_runs
      FOR EACH ROW EXECUTE FUNCTION tidum_secret_rotation_runs_immutable();
  END IF;
END $$;
