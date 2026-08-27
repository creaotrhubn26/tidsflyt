-- GDPR-sletting er irreversibel og må ha et pålitelig kontrollbevis før
-- behandlingen starter. Tabellen lagrer bare en enveis pseudonymreferanse til
-- målet, aktørreferanse og den dokumenterte instruksen.

CREATE TABLE IF NOT EXISTS tidum_gdpr_erasure_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_pseudonym VARCHAR(64) NOT NULL,
  actor_reference VARCHAR(255) NOT NULL,
  reason TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'started',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'tidum_gdpr_erasure_audit_reason_check'
  ) THEN
    ALTER TABLE tidum_gdpr_erasure_audit
      ADD CONSTRAINT tidum_gdpr_erasure_audit_reason_check
      CHECK (char_length(btrim(reason)) BETWEEN 10 AND 2000) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'tidum_gdpr_erasure_audit_status_check'
  ) THEN
    ALTER TABLE tidum_gdpr_erasure_audit
      ADD CONSTRAINT tidum_gdpr_erasure_audit_status_check
      CHECK (status IN ('started', 'completed', 'completed_with_errors')) NOT VALID;
  END IF;
END $$;

ALTER TABLE tidum_gdpr_erasure_audit
  VALIDATE CONSTRAINT tidum_gdpr_erasure_audit_reason_check;
ALTER TABLE tidum_gdpr_erasure_audit
  VALIDATE CONSTRAINT tidum_gdpr_erasure_audit_status_check;

CREATE INDEX IF NOT EXISTS tidum_gdpr_erasure_audit_created_idx
  ON tidum_gdpr_erasure_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS tidum_gdpr_erasure_audit_target_idx
  ON tidum_gdpr_erasure_audit (target_pseudonym, created_at DESC);
