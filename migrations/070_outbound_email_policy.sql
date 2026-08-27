-- SMTP is not an approved channel for sensitive child-welfare information.
-- Keep an audit trail of server-side policy blocks without retaining message
-- bodies, subjects or recipient addresses in the policy log.

ALTER TABLE tidum_vendors
  ADD COLUMN IF NOT EXISTS sensitive_smtp_blocked BOOLEAN NOT NULL DEFAULT FALSE;

-- Once a tenant has handled barnevern through an institution, keep the block
-- sticky. Renaming/deactivating the institution must not silently reopen SMTP.
UPDATE tidum_vendors vendor
   SET sensitive_smtp_blocked = TRUE
 WHERE vendor.sensitive_smtp_blocked = FALSE
   AND EXISTS (
     SELECT 1
       FROM tidum_vendor_institutions institution
      WHERE institution.vendor_id = vendor.id
        AND LOWER(COALESCE(institution.institution_type, '')) = 'barnevern'
   );

CREATE OR REPLACE FUNCTION tidum_mark_sensitive_smtp_blocked()
RETURNS TRIGGER AS $$
BEGIN
  IF LOWER(COALESCE(NEW.institution_type, '')) = 'barnevern' THEN
    UPDATE tidum_vendors
       SET sensitive_smtp_blocked = TRUE,
           updated_at = NOW()
     WHERE id = NEW.vendor_id
       AND sensitive_smtp_blocked = FALSE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tidum_vendor_institution_sensitive_smtp_trigger
  ON tidum_vendor_institutions;
CREATE TRIGGER tidum_vendor_institution_sensitive_smtp_trigger
AFTER INSERT OR UPDATE OF institution_type, vendor_id
ON tidum_vendor_institutions
FOR EACH ROW
EXECUTE FUNCTION tidum_mark_sensitive_smtp_blocked();

CREATE TABLE IF NOT EXISTS tidum_outbound_email_policy_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id TEXT,
  vendor_id     INTEGER,
  kommune_id    INTEGER,
  route         TEXT NOT NULL,
  purpose       TEXT NOT NULL,
  reason_code   TEXT NOT NULL,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tidum_outbound_email_policy_scope_check CHECK (
    vendor_id IS NOT NULL OR kommune_id IS NOT NULL OR actor_user_id IS NULL
  )
);

CREATE INDEX IF NOT EXISTS tidum_outbound_email_policy_events_vendor_idx
  ON tidum_outbound_email_policy_events (vendor_id, created_at DESC)
  WHERE vendor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS tidum_outbound_email_policy_events_kommune_idx
  ON tidum_outbound_email_policy_events (kommune_id, created_at DESC)
  WHERE kommune_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS tidum_outbound_email_policy_events_reason_idx
  ON tidum_outbound_email_policy_events (reason_code, created_at DESC);
