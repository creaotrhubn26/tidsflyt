-- Migration 060: notifications.user_id is a legacy column from before the
-- recipient_type/recipient_id redesign (migration 020's original schema).
-- Nothing in the current codebase (shared/schema.ts, server/routes/notification-routes.ts)
-- reads or writes user_id, but it is still NOT NULL with no default, so every
-- createNotification() insert throws internally and is silently swallowed —
-- no notification ever gets written. Drop the NOT NULL constraint so inserts
-- succeed; the column itself is left in place (no data loss) since dropping
-- it outright is not needed to fix the bug and is easy to do in a later pass
-- once confirmed nothing else references it.
-- Frisk-DB-guard: på en database bygget fra dagens skjema finnes ikke
-- legacy-kolonnen — da er det ingenting å fikse.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'notifications' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE notifications ALTER COLUMN user_id DROP NOT NULL;
  END IF;
END $$;
