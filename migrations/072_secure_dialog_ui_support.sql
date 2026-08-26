-- UI-støtte for sikker dialog.
--
-- Partslisten er et sensitivt oppslag og må derfor ha en egen, presis
-- audit-handling. Migrasjonen er idempotent fordi startup-runneren kjører alle
-- registrerte SQL-filer ved hver oppstart.

CREATE INDEX IF NOT EXISTS tidum_secure_parties_kommune_status_idx
  ON tidum_secure_parties (kommune_id, status, display_name);

DO $$
DECLARE
  action_constraint TEXT;
BEGIN
  SELECT pg_get_constraintdef(oid)
    INTO action_constraint
    FROM pg_constraint
   WHERE conrelid = 'tidum_secure_dialog_audit_events'::regclass
     AND conname = 'tidum_secure_dialog_audit_events_action_check';

  IF action_constraint IS NULL OR action_constraint NOT LIKE '%party_listed%' THEN
    ALTER TABLE tidum_secure_dialog_audit_events
      DROP CONSTRAINT IF EXISTS tidum_secure_dialog_audit_events_action_check;
    ALTER TABLE tidum_secure_dialog_audit_events
      ADD CONSTRAINT tidum_secure_dialog_audit_events_action_check CHECK (action IN (
        'party_created', 'party_listed', 'access_granted', 'access_revoked',
        'conversation_created', 'conversation_listed', 'conversation_opened', 'conversation_closed',
        'draft_created', 'draft_updated', 'attachment_uploaded', 'attachment_downloaded',
        'message_sent', 'message_read', 'audit_viewed', 'notification_sent', 'notification_failed'
      ));
  END IF;
END $$;
