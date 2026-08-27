-- Database-level tenant and object isolation, phase 2: secure dialog.
--
-- Staff transactions are scoped to one municipality. Portal-party
-- transactions are scoped to the authenticated user and can only traverse
-- their own active access/participant chain. Named system operations are
-- reserved for queues, retention, quarantine cleanup and key rotation.

BEGIN;

SELECT set_config('tidum.rls_mode', 'system', true),
       set_config('tidum.kommune_id', '', true),
       set_config('tidum.rls_system_operation', 'migration_084', true),
       set_config('tidum.rls_actor_user_id', '', true);

-- The managed Neon development owner cannot create roles. Keep the same
-- explicit, NOLOGIN/NOBYPASSRLS compatibility role used by phase 1 and grant
-- only the objects needed while a secure-dialog transaction has SET ROLE.
GRANT USAGE ON SCHEMA public TO pg_database_owner;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  tidum_secure_parties,
  tidum_secure_case_access,
  tidum_secure_conversations,
  tidum_secure_conversation_participants,
  tidum_secure_messages,
  tidum_secure_message_attachments,
  tidum_secure_message_receipts,
  tidum_secure_dialog_audit_events,
  tidum_secure_notification_outbox,
  tidum_secure_dialog_retention_policies,
  tidum_secure_dialog_legal_holds,
  tidum_secure_attachment_quarantine
TO pg_database_owner;

-- Adjacent objects used inside the same atomic request/maintenance flows.
GRANT SELECT ON TABLE tidum_eid_identities, tidum_vendor_integrations TO pg_database_owner;
GRANT INSERT (id, username, password, email, first_name, last_name, role,
              vendor_id, kommune_id, expected_ssn_hash)
  ON TABLE users TO pg_database_owner;
GRANT SELECT, INSERT, UPDATE ON TABLE archive_entries TO pg_database_owner;
GRANT SELECT, UPDATE ON TABLE archive_configs TO pg_database_owner;
GRANT UPDATE (fiks_private_key_encrypted, updated_at)
  ON TABLE tidum_kommuner TO pg_database_owner;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'tidum_secure_parties',
    'tidum_secure_case_access',
    'tidum_secure_conversations',
    'tidum_secure_conversation_participants',
    'tidum_secure_messages',
    'tidum_secure_message_attachments',
    'tidum_secure_message_receipts',
    'tidum_secure_dialog_audit_events',
    'tidum_secure_notification_outbox',
    'tidum_secure_dialog_retention_policies',
    'tidum_secure_dialog_legal_holds',
    'tidum_secure_attachment_quarantine'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS tidum_secure_staff_system_all ON %I', table_name);
    EXECUTE format(
      'CREATE POLICY tidum_secure_staff_system_all ON %I FOR ALL USING (tidum_rls_kommune_allowed(kommune_id)) WITH CHECK (tidum_rls_kommune_allowed(kommune_id))',
      table_name
    );
  END LOOP;
END $$;

-- Portal users may resolve only their own party identity. The dependent
-- policies below deliberately form a one-way graph:
-- party -> access -> participant -> conversation -> message -> child rows.
-- It therefore avoids recursive RLS policies while still proving active
-- object-level participation at the database boundary.
DROP POLICY IF EXISTS tidum_secure_party_self_select ON tidum_secure_parties;
CREATE POLICY tidum_secure_party_self_select
  ON tidum_secure_parties FOR SELECT
  USING (
    current_setting('tidum.rls_mode', true) = 'secure_party'
    AND current_setting('tidum.rls_actor_user_id', true) <> ''
    AND portal_user_id::text = current_setting('tidum.rls_actor_user_id', true)
    AND status = 'active'
  );

DROP POLICY IF EXISTS tidum_secure_party_access_select ON tidum_secure_case_access;
CREATE POLICY tidum_secure_party_access_select
  ON tidum_secure_case_access FOR SELECT
  USING (
    current_setting('tidum.rls_mode', true) = 'secure_party'
    AND revoked_at IS NULL
    AND valid_from <= NOW()
    AND (valid_until IS NULL OR valid_until > NOW())
    AND EXISTS (
      SELECT 1
        FROM tidum_secure_parties party
       WHERE party.id = tidum_secure_case_access.party_id
         AND party.kommune_id = tidum_secure_case_access.kommune_id
         AND party.status = 'active'
    )
  );

DROP POLICY IF EXISTS tidum_secure_party_participant_select ON tidum_secure_conversation_participants;
CREATE POLICY tidum_secure_party_participant_select
  ON tidum_secure_conversation_participants FOR SELECT
  USING (
    current_setting('tidum.rls_mode', true) = 'secure_party'
    AND revoked_at IS NULL
    AND EXISTS (
      SELECT 1
        FROM tidum_secure_case_access access
       WHERE access.id = tidum_secure_conversation_participants.party_access_id
         AND access.kommune_id = tidum_secure_conversation_participants.kommune_id
         AND access.revoked_at IS NULL
         AND access.valid_from <= NOW()
         AND (access.valid_until IS NULL OR access.valid_until > NOW())
    )
  );

DROP POLICY IF EXISTS tidum_secure_party_conversation_select ON tidum_secure_conversations;
CREATE POLICY tidum_secure_party_conversation_select
  ON tidum_secure_conversations FOR SELECT
  USING (
    current_setting('tidum.rls_mode', true) = 'secure_party'
    AND EXISTS (
      SELECT 1
        FROM tidum_secure_conversation_participants participant
       WHERE participant.conversation_id = tidum_secure_conversations.id
         AND participant.kommune_id = tidum_secure_conversations.kommune_id
    )
  );

DROP POLICY IF EXISTS tidum_secure_party_message_select ON tidum_secure_messages;
CREATE POLICY tidum_secure_party_message_select
  ON tidum_secure_messages FOR SELECT
  USING (
    current_setting('tidum.rls_mode', true) = 'secure_party'
    AND (status = 'sent' OR sender_user_id::text = current_setting('tidum.rls_actor_user_id', true))
    AND EXISTS (
      SELECT 1
        FROM tidum_secure_conversations conversation
       WHERE conversation.id = tidum_secure_messages.conversation_id
         AND conversation.kommune_id = tidum_secure_messages.kommune_id
    )
  );

DROP POLICY IF EXISTS tidum_secure_party_message_insert ON tidum_secure_messages;
CREATE POLICY tidum_secure_party_message_insert
  ON tidum_secure_messages FOR INSERT
  WITH CHECK (
    current_setting('tidum.rls_mode', true) = 'secure_party'
    AND sender_kind = 'party'
    AND sender_user_id::text = current_setting('tidum.rls_actor_user_id', true)
    AND status = 'draft'
    AND EXISTS (
      SELECT 1
        FROM tidum_secure_parties party
       WHERE party.id = tidum_secure_messages.sender_party_id
         AND party.kommune_id = tidum_secure_messages.kommune_id
         AND party.status = 'active'
    )
    AND EXISTS (
      SELECT 1
        FROM tidum_secure_conversations conversation
       WHERE conversation.id = tidum_secure_messages.conversation_id
         AND conversation.kommune_id = tidum_secure_messages.kommune_id
         AND conversation.status = 'open'
         AND conversation.retention_state = 'active'
    )
  );

DROP POLICY IF EXISTS tidum_secure_party_message_update ON tidum_secure_messages;
CREATE POLICY tidum_secure_party_message_update
  ON tidum_secure_messages FOR UPDATE
  USING (
    current_setting('tidum.rls_mode', true) = 'secure_party'
    AND sender_user_id::text = current_setting('tidum.rls_actor_user_id', true)
    AND sender_kind = 'party'
    AND status = 'draft'
  )
  WITH CHECK (
    current_setting('tidum.rls_mode', true) = 'secure_party'
    AND sender_user_id::text = current_setting('tidum.rls_actor_user_id', true)
    AND sender_kind = 'party'
    AND status IN ('draft', 'sent')
    AND EXISTS (
      SELECT 1
        FROM tidum_secure_conversations conversation
       WHERE conversation.id = tidum_secure_messages.conversation_id
         AND conversation.kommune_id = tidum_secure_messages.kommune_id
         AND conversation.status = 'open'
         AND conversation.retention_state = 'active'
    )
  );

DROP POLICY IF EXISTS tidum_secure_party_attachment_select ON tidum_secure_message_attachments;
CREATE POLICY tidum_secure_party_attachment_select
  ON tidum_secure_message_attachments FOR SELECT
  USING (
    current_setting('tidum.rls_mode', true) = 'secure_party'
    AND EXISTS (
      SELECT 1
        FROM tidum_secure_messages message
       WHERE message.id = tidum_secure_message_attachments.message_id
         AND message.kommune_id = tidum_secure_message_attachments.kommune_id
    )
  );

DROP POLICY IF EXISTS tidum_secure_party_attachment_insert ON tidum_secure_message_attachments;
CREATE POLICY tidum_secure_party_attachment_insert
  ON tidum_secure_message_attachments FOR INSERT
  WITH CHECK (
    current_setting('tidum.rls_mode', true) = 'secure_party'
    AND uploaded_by::text = current_setting('tidum.rls_actor_user_id', true)
    AND EXISTS (
      SELECT 1
        FROM tidum_secure_messages message
       WHERE message.id = tidum_secure_message_attachments.message_id
         AND message.kommune_id = tidum_secure_message_attachments.kommune_id
         AND message.sender_user_id::text = current_setting('tidum.rls_actor_user_id', true)
         AND message.status = 'draft'
    )
  );

DROP POLICY IF EXISTS tidum_secure_party_receipt_select ON tidum_secure_message_receipts;
CREATE POLICY tidum_secure_party_receipt_select
  ON tidum_secure_message_receipts FOR SELECT
  USING (
    current_setting('tidum.rls_mode', true) = 'secure_party'
    AND reader_user_id::text = current_setting('tidum.rls_actor_user_id', true)
    AND EXISTS (
      SELECT 1
        FROM tidum_secure_messages message
       WHERE message.id = tidum_secure_message_receipts.message_id
         AND message.kommune_id = tidum_secure_message_receipts.kommune_id
         AND message.status = 'sent'
    )
  );

DROP POLICY IF EXISTS tidum_secure_party_receipt_insert ON tidum_secure_message_receipts;
CREATE POLICY tidum_secure_party_receipt_insert
  ON tidum_secure_message_receipts FOR INSERT
  WITH CHECK (
    current_setting('tidum.rls_mode', true) = 'secure_party'
    AND reader_user_id::text = current_setting('tidum.rls_actor_user_id', true)
    AND reader_party_id IS NOT NULL
    AND EXISTS (
      SELECT 1
        FROM tidum_secure_parties party
       WHERE party.id = tidum_secure_message_receipts.reader_party_id
         AND party.kommune_id = tidum_secure_message_receipts.kommune_id
    )
    AND EXISTS (
      SELECT 1
        FROM tidum_secure_messages message
       WHERE message.id = tidum_secure_message_receipts.message_id
         AND message.kommune_id = tidum_secure_message_receipts.kommune_id
         AND message.status = 'sent'
    )
  );

DROP POLICY IF EXISTS tidum_secure_party_audit_insert ON tidum_secure_dialog_audit_events;
CREATE POLICY tidum_secure_party_audit_insert
  ON tidum_secure_dialog_audit_events FOR INSERT
  WITH CHECK (
    current_setting('tidum.rls_mode', true) = 'secure_party'
    AND actor_kind = 'party'
    AND actor_user_id::text = current_setting('tidum.rls_actor_user_id', true)
    AND conversation_id IS NOT NULL
    AND EXISTS (
      SELECT 1
        FROM tidum_secure_conversations conversation
       WHERE conversation.id = tidum_secure_dialog_audit_events.conversation_id
         AND conversation.kommune_id = tidum_secure_dialog_audit_events.kommune_id
    )
  );

DROP POLICY IF EXISTS tidum_secure_party_quarantine_insert ON tidum_secure_attachment_quarantine;
CREATE POLICY tidum_secure_party_quarantine_insert
  ON tidum_secure_attachment_quarantine FOR INSERT
  WITH CHECK (
    current_setting('tidum.rls_mode', true) = 'secure_party'
    AND uploaded_by::text = current_setting('tidum.rls_actor_user_id', true)
    AND EXISTS (
      SELECT 1
        FROM tidum_secure_messages message
       WHERE message.id = tidum_secure_attachment_quarantine.message_id
         AND message.conversation_id = tidum_secure_attachment_quarantine.conversation_id
         AND message.kommune_id = tidum_secure_attachment_quarantine.kommune_id
         AND message.sender_user_id::text = current_setting('tidum.rls_actor_user_id', true)
         AND message.status = 'draft'
    )
  );

COMMIT;
