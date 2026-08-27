-- Arkivering, oppbevaring, juridisk sperring og nøkkelrotasjon for sikker dialog.
--
-- Arkivtabellene fra migrasjon 052 var bare leverandør-bundet. Sikker dialog
-- eies av en kommune, så de samme outbox-/kvitteringstabellene utvides med en
-- gjensidig utelukkende kommune-tenant. Ingen oppbevaringsperiode aktiveres av
-- migrasjonen: lokal sletting krever en eksplisitt, kommune-eid policy og en
-- vellykket arkivkvittering.

ALTER TABLE archive_configs
  ALTER COLUMN vendor_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS kommune_id INTEGER REFERENCES tidum_kommuner(id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_index
     WHERE indexrelid = to_regclass('archive_configs_kommune_uidx')
       AND indpred IS NOT NULL
  ) THEN
    DROP INDEX archive_configs_kommune_uidx;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS archive_configs_kommune_uidx
  ON archive_configs (kommune_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'archive_configs'::regclass
       AND conname = 'archive_configs_exactly_one_tenant_check'
  ) THEN
    ALTER TABLE archive_configs
      ADD CONSTRAINT archive_configs_exactly_one_tenant_check
      CHECK ((vendor_id IS NOT NULL)::integer + (kommune_id IS NOT NULL)::integer = 1);
  END IF;
END $$;

ALTER TABLE archive_case_links
  ALTER COLUMN vendor_id DROP NOT NULL,
  ALTER COLUMN sak_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS kommune_id INTEGER REFERENCES tidum_kommuner(id),
  ADD COLUMN IF NOT EXISTS barnevern_melding_id UUID;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_index
     WHERE indexrelid = to_regclass('archive_case_links_barnevern_melding_uidx')
       AND indpred IS NOT NULL
  ) THEN
    DROP INDEX archive_case_links_barnevern_melding_uidx;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS archive_case_links_barnevern_melding_uidx
  ON archive_case_links (barnevern_melding_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'archive_case_links'::regclass
       AND conname = 'archive_case_links_barnevern_melding_fk'
  ) THEN
    ALTER TABLE archive_case_links
      ADD CONSTRAINT archive_case_links_barnevern_melding_fk
      FOREIGN KEY (barnevern_melding_id, kommune_id)
      REFERENCES tidum_barnevern_meldinger (id, kommune_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'archive_case_links'::regclass
       AND conname = 'archive_case_links_owner_shape_check'
  ) THEN
    ALTER TABLE archive_case_links
      ADD CONSTRAINT archive_case_links_owner_shape_check CHECK (
        (vendor_id IS NOT NULL AND kommune_id IS NULL AND sak_id IS NOT NULL AND barnevern_melding_id IS NULL)
        OR
        (vendor_id IS NULL AND kommune_id IS NOT NULL AND sak_id IS NULL AND barnevern_melding_id IS NOT NULL)
      );
  END IF;
END $$;

ALTER TABLE archive_entries
  ALTER COLUMN vendor_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS kommune_id INTEGER REFERENCES tidum_kommuner(id),
  ADD COLUMN IF NOT EXISTS barnevern_melding_id UUID,
  ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS processing_token UUID,
  ADD COLUMN IF NOT EXISTS archive_manifest JSONB,
  ADD COLUMN IF NOT EXISTS archive_evidence JSONB;

CREATE INDEX IF NOT EXISTS archive_entries_kommune_idx
  ON archive_entries (kommune_id, created_at DESC)
  WHERE kommune_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'archive_entries'::regclass
       AND conname = 'archive_entries_barnevern_melding_fk'
  ) THEN
    ALTER TABLE archive_entries
      ADD CONSTRAINT archive_entries_barnevern_melding_fk
      FOREIGN KEY (barnevern_melding_id, kommune_id)
      REFERENCES tidum_barnevern_meldinger (id, kommune_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'archive_entries'::regclass
       AND conname = 'archive_entries_exactly_one_tenant_check'
  ) THEN
    ALTER TABLE archive_entries
      ADD CONSTRAINT archive_entries_exactly_one_tenant_check
      CHECK ((vendor_id IS NOT NULL)::integer + (kommune_id IS NOT NULL)::integer = 1);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'archive_entries'::regclass
       AND conname = 'archive_entries_secure_dialog_shape_check'
  ) THEN
    ALTER TABLE archive_entries
      ADD CONSTRAINT archive_entries_secure_dialog_shape_check CHECK (
        entity_type <> 'secure_dialog'
        OR (kommune_id IS NOT NULL AND vendor_id IS NULL AND barnevern_melding_id IS NOT NULL AND sak_id IS NULL)
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'archive_entries'::regclass
       AND conname = 'archive_entries_status_check'
  ) THEN
    ALTER TABLE archive_entries
      ADD CONSTRAINT archive_entries_status_check
      CHECK (status IN ('pending', 'processing', 'archived', 'failed', 'skipped'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS tidum_secure_dialog_retention_policies (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kommune_id          INTEGER NOT NULL UNIQUE REFERENCES tidum_kommuner(id),
  enabled             BOOLEAN NOT NULL DEFAULT FALSE,
  retention_days      INTEGER CHECK (retention_days BETWEEN 1 AND 36500),
  policy_reference    TEXT CHECK (policy_reference IS NULL OR char_length(policy_reference) <= 500),
  updated_by          VARCHAR NOT NULL REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tidum_secure_retention_enabled_days_check
    CHECK (enabled = FALSE OR retention_days IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS tidum_secure_dialog_legal_holds (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kommune_id          INTEGER NOT NULL REFERENCES tidum_kommuner(id),
  conversation_id     UUID NOT NULL,
  reason              TEXT NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 1000),
  applied_by          VARCHAR NOT NULL REFERENCES users(id),
  applied_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_by         VARCHAR REFERENCES users(id),
  released_at         TIMESTAMPTZ,
  CONSTRAINT tidum_secure_legal_hold_conversation_fk
    FOREIGN KEY (conversation_id, kommune_id)
    REFERENCES tidum_secure_conversations (id, kommune_id),
  CONSTRAINT tidum_secure_legal_hold_release_check CHECK (
    (released_at IS NULL AND released_by IS NULL)
    OR (released_at IS NOT NULL AND released_by IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS tidum_secure_legal_hold_active_uidx
  ON tidum_secure_dialog_legal_holds (conversation_id)
  WHERE released_at IS NULL;
CREATE INDEX IF NOT EXISTS tidum_secure_legal_hold_kommune_idx
  ON tidum_secure_dialog_legal_holds (kommune_id, applied_at DESC);

ALTER TABLE tidum_secure_conversations
  ALTER COLUMN subject DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS retention_state TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS retention_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS retention_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retention_next_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS retention_last_error TEXT,
  ADD COLUMN IF NOT EXISTS purged_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'tidum_secure_conversations'::regclass
       AND conname = 'tidum_secure_conversations_retention_state_check'
  ) THEN
    ALTER TABLE tidum_secure_conversations
      ADD CONSTRAINT tidum_secure_conversations_retention_state_check
      CHECK (retention_state IN ('active', 'purging', 'purged'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'tidum_secure_conversations'::regclass
       AND conname = 'tidum_secure_conversations_purged_check'
  ) THEN
    ALTER TABLE tidum_secure_conversations
      ADD CONSTRAINT tidum_secure_conversations_purged_check CHECK (
        (retention_state <> 'purged' AND purged_at IS NULL)
        OR (retention_state = 'purged' AND purged_at IS NOT NULL AND subject IS NULL)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS tidum_secure_conversations_retention_due_idx
  ON tidum_secure_conversations (retention_next_attempt_at, retention_due_at)
  WHERE status = 'closed' AND retention_state IN ('active', 'purging');

-- Sendte meldinger kan slettes av retensjonsjobben bare når samtalen allerede
-- er markert for sletting og har en vellykket arkivkvittering. Nøkkelrotasjon
-- kan oppgradere legacy-kryptering én gang, eller pakke om datanøkkelen i en
-- sdc:v1-konvolutt; selve innholdschifferet (del 5–7) må være byte-identisk.
CREATE OR REPLACE FUNCTION tidum_secure_message_immutable_guard()
RETURNS TRIGGER AS $$
DECLARE
  parent_retention_state TEXT;
  has_archive BOOLEAN;
  same_envelope_payload BOOLEAN;
  legacy_upgrade BOOLEAN;
BEGIN
  IF OLD.status <> 'sent' THEN
    IF TG_OP = 'UPDATE' AND NEW.status = 'sent' AND (
      NEW.kommune_id IS DISTINCT FROM OLD.kommune_id
      OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
      OR NEW.sender_user_id IS DISTINCT FROM OLD.sender_user_id
      OR NEW.sender_party_id IS DISTINCT FROM OLD.sender_party_id
      OR NEW.sender_kind IS DISTINCT FROM OLD.sender_kind
      OR NEW.body_encrypted IS DISTINCT FROM OLD.body_encrypted
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
    ) THEN
      RAISE EXCEPTION 'only status and sent timestamp may change when sending';
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP = 'DELETE' THEN
    SELECT retention_state INTO parent_retention_state
      FROM tidum_secure_conversations WHERE id = OLD.conversation_id;
    SELECT EXISTS (
      SELECT 1 FROM archive_entries
       WHERE entity_type = 'secure_dialog'
         AND entity_id = OLD.conversation_id::text
         AND kommune_id = OLD.kommune_id
         AND status = 'archived'
    ) INTO has_archive;
    IF parent_retention_state = 'purging' AND has_archive THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'sent secure messages are immutable';
  END IF;

  legacy_upgrade :=
    (OLD.body_encrypted LIKE 'enc:v1:%' OR OLD.body_encrypted LIKE 'enc:v2:%')
    AND NEW.body_encrypted LIKE 'sdc:v1:%'
    AND array_length(string_to_array(NEW.body_encrypted, ':'), 1) = 7;
  same_envelope_payload :=
    OLD.body_encrypted LIKE 'sdc:v1:%'
    AND NEW.body_encrypted LIKE 'sdc:v1:%'
    AND array_length(string_to_array(OLD.body_encrypted, ':'), 1) = 7
    AND array_length(string_to_array(NEW.body_encrypted, ':'), 1) = 7
    AND split_part(OLD.body_encrypted, ':', 5) = split_part(NEW.body_encrypted, ':', 5)
    AND split_part(OLD.body_encrypted, ':', 6) = split_part(NEW.body_encrypted, ':', 6)
    AND split_part(OLD.body_encrypted, ':', 7) = split_part(NEW.body_encrypted, ':', 7);

  IF (legacy_upgrade OR same_envelope_payload)
     AND NEW.kommune_id IS NOT DISTINCT FROM OLD.kommune_id
     AND NEW.conversation_id IS NOT DISTINCT FROM OLD.conversation_id
     AND NEW.sender_user_id IS NOT DISTINCT FROM OLD.sender_user_id
     AND NEW.sender_party_id IS NOT DISTINCT FROM OLD.sender_party_id
     AND NEW.sender_kind IS NOT DISTINCT FROM OLD.sender_kind
     AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.sent_at IS NOT DISTINCT FROM OLD.sent_at
     AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'sent secure messages are immutable';
END;
$$ LANGUAGE plpgsql;

-- Vedlegg på sendte meldinger følger samme arkiv-før-sletting-vakt.
CREATE OR REPLACE FUNCTION tidum_secure_attachment_draft_guard()
RETURNS TRIGGER AS $$
DECLARE
  parent_message_id UUID;
  parent_status TEXT;
  parent_conversation_id UUID;
  parent_kommune_id INTEGER;
  parent_retention_state TEXT;
  has_archive BOOLEAN;
BEGIN
  parent_message_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.message_id ELSE NEW.message_id END;
  SELECT message.status, message.conversation_id, message.kommune_id, conversation.retention_state
    INTO parent_status, parent_conversation_id, parent_kommune_id, parent_retention_state
    FROM tidum_secure_messages message
    JOIN tidum_secure_conversations conversation ON conversation.id = message.conversation_id
   WHERE message.id = parent_message_id;
  IF parent_status = 'draft' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_OP = 'DELETE' AND parent_status = 'sent' AND parent_retention_state = 'purging' THEN
    SELECT EXISTS (
      SELECT 1 FROM archive_entries
       WHERE entity_type = 'secure_dialog'
         AND entity_id = parent_conversation_id::text
         AND kommune_id = parent_kommune_id
         AND status = 'archived'
    ) INTO has_archive;
    IF has_archive THEN RETURN OLD; END IF;
  END IF;
  RAISE EXCEPTION 'attachments on sent secure messages are immutable';
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  action_constraint TEXT;
BEGIN
  SELECT pg_get_constraintdef(oid)
    INTO action_constraint
    FROM pg_constraint
   WHERE conrelid = 'tidum_secure_dialog_audit_events'::regclass
     AND conname = 'tidum_secure_dialog_audit_events_action_check';

  IF action_constraint IS NULL OR action_constraint NOT LIKE '%archive_queued%'
     OR action_constraint NOT LIKE '%retention_policy_updated%'
     OR action_constraint NOT LIKE '%encryption_key_rotated%' THEN
    ALTER TABLE tidum_secure_dialog_audit_events
      DROP CONSTRAINT IF EXISTS tidum_secure_dialog_audit_events_action_check;
    ALTER TABLE tidum_secure_dialog_audit_events
      ADD CONSTRAINT tidum_secure_dialog_audit_events_action_check CHECK (action IN (
        'party_created', 'party_listed', 'access_granted', 'access_revoked',
        'conversation_created', 'conversation_listed', 'conversation_opened', 'conversation_closed',
        'draft_created', 'draft_updated', 'attachment_scanned', 'attachment_uploaded',
        'attachment_quarantined', 'attachment_scan_failed', 'attachment_quarantine_deleted',
        'attachment_downloaded', 'message_sent', 'message_read', 'audit_viewed',
        'notification_sent', 'notification_failed',
        'archive_queued', 'archive_completed', 'archive_failed',
        'retention_policy_updated', 'legal_hold_applied', 'legal_hold_released',
        'retention_purge_started', 'retention_purged', 'retention_purge_failed',
        'encryption_key_rotated'
      ));
  END IF;
END $$;
