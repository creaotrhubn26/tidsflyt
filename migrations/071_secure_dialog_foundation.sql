-- Sikker dialog for kommunal barnevernstjeneste.
--
-- Første saksavgrensning er tidum_barnevern_meldinger. Partsidentitet peker
-- til en eID-koblet users-rad; e-postadresse er kun varslingsadresse og gir
-- aldri tilgang. Meldingsinnhold lagres applikasjonskryptert i body_encrypted.

INSERT INTO tidum_roles (name, scope, is_system_default, rank, can_manage_others)
VALUES ('innbygger', 'global', TRUE, 5, FALSE)
ON CONFLICT (scope, COALESCE(vendor_id, -1), name)
DO UPDATE SET rank = EXCLUDED.rank, can_manage_others = EXCLUDED.can_manage_others;

-- Gir sammensatte FK-er en tenantbærende unik nøkkel.
CREATE UNIQUE INDEX IF NOT EXISTS tidum_barnevern_meldinger_id_kommune_uidx
  ON tidum_barnevern_meldinger (id, kommune_id);

CREATE TABLE IF NOT EXISTS tidum_secure_parties (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kommune_id          INTEGER NOT NULL REFERENCES tidum_kommuner(id),
  portal_user_id      VARCHAR NOT NULL REFERENCES users(id),
  display_name        TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 200),
  notification_email  TEXT,
  status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_by          VARCHAR NOT NULL REFERENCES users(id),
  revoked_by          VARCHAR REFERENCES users(id),
  revoked_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tidum_secure_parties_revocation_check CHECK (
    (status = 'active' AND revoked_at IS NULL AND revoked_by IS NULL)
    OR (status = 'revoked' AND revoked_at IS NOT NULL AND revoked_by IS NOT NULL)
  ),
  CONSTRAINT tidum_secure_parties_id_kommune_unique UNIQUE (id, kommune_id),
  CONSTRAINT tidum_secure_parties_kommune_user_unique UNIQUE (kommune_id, portal_user_id)
);

CREATE INDEX IF NOT EXISTS tidum_secure_parties_user_idx
  ON tidum_secure_parties (portal_user_id, status);

CREATE TABLE IF NOT EXISTS tidum_secure_case_access (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kommune_id                INTEGER NOT NULL REFERENCES tidum_kommuner(id),
  party_id                  UUID NOT NULL,
  barnevern_melding_id      UUID NOT NULL,
  party_role                TEXT NOT NULL CHECK (party_role IN ('forelder', 'barn', 'verge', 'fullmektig')),
  valid_from                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until               TIMESTAMPTZ,
  created_by                VARCHAR NOT NULL REFERENCES users(id),
  revoked_by                VARCHAR REFERENCES users(id),
  revoked_at                TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tidum_secure_case_access_validity_check CHECK (valid_until IS NULL OR valid_until > valid_from),
  CONSTRAINT tidum_secure_case_access_revoke_check CHECK (
    (revoked_at IS NULL AND revoked_by IS NULL) OR (revoked_at IS NOT NULL AND revoked_by IS NOT NULL)
  ),
  CONSTRAINT tidum_secure_case_access_id_kommune_unique UNIQUE (id, kommune_id),
  CONSTRAINT tidum_secure_case_access_party_fk
    FOREIGN KEY (party_id, kommune_id)
    REFERENCES tidum_secure_parties (id, kommune_id),
  CONSTRAINT tidum_secure_case_access_melding_fk
    FOREIGN KEY (barnevern_melding_id, kommune_id)
    REFERENCES tidum_barnevern_meldinger (id, kommune_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS tidum_secure_case_access_active_uidx
  ON tidum_secure_case_access (party_id, barnevern_melding_id)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS tidum_secure_case_access_case_idx
  ON tidum_secure_case_access (kommune_id, barnevern_melding_id, valid_from);

CREATE TABLE IF NOT EXISTS tidum_secure_conversations (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kommune_id                INTEGER NOT NULL REFERENCES tidum_kommuner(id),
  barnevern_melding_id      UUID NOT NULL,
  subject                   TEXT NOT NULL,
  status                    TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_by                VARCHAR NOT NULL REFERENCES users(id),
  closed_by                 VARCHAR REFERENCES users(id),
  closed_at                 TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tidum_secure_conversations_close_check CHECK (
    (status = 'open' AND closed_at IS NULL AND closed_by IS NULL)
    OR (status = 'closed' AND closed_at IS NOT NULL AND closed_by IS NOT NULL)
  ),
  CONSTRAINT tidum_secure_conversations_id_kommune_unique UNIQUE (id, kommune_id),
  CONSTRAINT tidum_secure_conversations_melding_fk
    FOREIGN KEY (barnevern_melding_id, kommune_id)
    REFERENCES tidum_barnevern_meldinger (id, kommune_id)
);

CREATE INDEX IF NOT EXISTS tidum_secure_conversations_case_idx
  ON tidum_secure_conversations (kommune_id, barnevern_melding_id, created_at DESC);

-- Emnet lagres i samme AES-GCM-konvolutt som meldingsinnholdet. 2048 tegn
-- gir rom for base64url-overhead også når 200 Unicode-tegn opptar fire byte.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'tidum_secure_conversations'::regclass
       AND conname = 'tidum_secure_conversations_subject_check'
  ) THEN
    ALTER TABLE tidum_secure_conversations
      DROP CONSTRAINT tidum_secure_conversations_subject_check;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'tidum_secure_conversations'::regclass
       AND conname = 'tidum_secure_conversations_subject_length_check'
  ) THEN
    ALTER TABLE tidum_secure_conversations
      ADD CONSTRAINT tidum_secure_conversations_subject_length_check
      CHECK (char_length(subject) BETWEEN 1 AND 2048);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS tidum_secure_conversation_participants (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kommune_id        INTEGER NOT NULL REFERENCES tidum_kommuner(id),
  conversation_id   UUID NOT NULL,
  party_access_id   UUID NOT NULL,
  granted_by        VARCHAR NOT NULL REFERENCES users(id),
  revoked_by        VARCHAR REFERENCES users(id),
  revoked_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tidum_secure_participants_revoke_check CHECK (
    (revoked_at IS NULL AND revoked_by IS NULL) OR (revoked_at IS NOT NULL AND revoked_by IS NOT NULL)
  ),
  CONSTRAINT tidum_secure_participants_conversation_fk
    FOREIGN KEY (conversation_id, kommune_id)
    REFERENCES tidum_secure_conversations (id, kommune_id),
  CONSTRAINT tidum_secure_participants_access_fk
    FOREIGN KEY (party_access_id, kommune_id)
    REFERENCES tidum_secure_case_access (id, kommune_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS tidum_secure_participants_active_uidx
  ON tidum_secure_conversation_participants (conversation_id, party_access_id)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS tidum_secure_participants_access_idx
  ON tidum_secure_conversation_participants (party_access_id, revoked_at);

CREATE TABLE IF NOT EXISTS tidum_secure_messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kommune_id        INTEGER NOT NULL REFERENCES tidum_kommuner(id),
  conversation_id   UUID NOT NULL,
  sender_user_id    VARCHAR NOT NULL REFERENCES users(id),
  sender_party_id   UUID,
  sender_kind       TEXT NOT NULL CHECK (sender_kind IN ('staff', 'party')),
  body_encrypted    TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent')),
  sent_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tidum_secure_messages_sent_check CHECK (
    (status = 'draft' AND sent_at IS NULL) OR (status = 'sent' AND sent_at IS NOT NULL)
  ),
  CONSTRAINT tidum_secure_messages_sender_check CHECK (
    (sender_kind = 'staff' AND sender_party_id IS NULL)
    OR (sender_kind = 'party' AND sender_party_id IS NOT NULL)
  ),
  CONSTRAINT tidum_secure_messages_id_kommune_unique UNIQUE (id, kommune_id),
  CONSTRAINT tidum_secure_messages_conversation_fk
    FOREIGN KEY (conversation_id, kommune_id)
    REFERENCES tidum_secure_conversations (id, kommune_id),
  CONSTRAINT tidum_secure_messages_party_fk
    FOREIGN KEY (sender_party_id, kommune_id)
    REFERENCES tidum_secure_parties (id, kommune_id)
);

CREATE INDEX IF NOT EXISTS tidum_secure_messages_conversation_idx
  ON tidum_secure_messages (conversation_id, created_at);

CREATE TABLE IF NOT EXISTS tidum_secure_message_attachments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kommune_id          INTEGER NOT NULL REFERENCES tidum_kommuner(id),
  message_id          UUID NOT NULL,
  storage_key         TEXT NOT NULL UNIQUE,
  original_name       TEXT NOT NULL CHECK (char_length(original_name) BETWEEN 1 AND 200),
  mime_type           TEXT NOT NULL,
  size_bytes          INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  checksum_sha256     TEXT NOT NULL CHECK (checksum_sha256 ~ '^[a-f0-9]{64}$'),
  uploaded_by         VARCHAR NOT NULL REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tidum_secure_attachments_message_fk
    FOREIGN KEY (message_id, kommune_id)
    REFERENCES tidum_secure_messages (id, kommune_id)
);

CREATE INDEX IF NOT EXISTS tidum_secure_attachments_message_idx
  ON tidum_secure_message_attachments (message_id, created_at);

CREATE TABLE IF NOT EXISTS tidum_secure_message_receipts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kommune_id        INTEGER NOT NULL REFERENCES tidum_kommuner(id),
  message_id        UUID NOT NULL,
  reader_user_id    VARCHAR NOT NULL REFERENCES users(id),
  reader_party_id   UUID,
  read_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tidum_secure_receipts_message_fk
    FOREIGN KEY (message_id, kommune_id)
    REFERENCES tidum_secure_messages (id, kommune_id),
  CONSTRAINT tidum_secure_receipts_party_fk
    FOREIGN KEY (reader_party_id, kommune_id)
    REFERENCES tidum_secure_parties (id, kommune_id),
  CONSTRAINT tidum_secure_receipts_message_reader_unique UNIQUE (message_id, reader_user_id)
);

CREATE TABLE IF NOT EXISTS tidum_secure_dialog_audit_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kommune_id        INTEGER NOT NULL REFERENCES tidum_kommuner(id),
  actor_user_id     VARCHAR,
  actor_kind        TEXT NOT NULL CHECK (actor_kind IN ('staff', 'party', 'system')),
  party_id          UUID,
  conversation_id   UUID,
  message_id        UUID,
  attachment_id     UUID,
  action            TEXT NOT NULL CHECK (action IN (
    'party_created', 'access_granted', 'access_revoked',
    'conversation_created', 'conversation_listed', 'conversation_opened', 'conversation_closed',
    'draft_created', 'draft_updated', 'attachment_uploaded', 'attachment_downloaded',
    'message_sent', 'message_read', 'audit_viewed', 'notification_sent', 'notification_failed'
  )),
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tidum_secure_audit_conversation_idx
  ON tidum_secure_dialog_audit_events (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS tidum_secure_audit_kommune_idx
  ON tidum_secure_dialog_audit_events (kommune_id, created_at DESC);

CREATE TABLE IF NOT EXISTS tidum_secure_notification_outbox (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kommune_id        INTEGER NOT NULL REFERENCES tidum_kommuner(id),
  message_id        UUID NOT NULL,
  party_id          UUID NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  attempts          INTEGER NOT NULL DEFAULT 0,
  next_attempt_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error        TEXT,
  sent_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tidum_secure_outbox_message_fk
    FOREIGN KEY (message_id, kommune_id)
    REFERENCES tidum_secure_messages (id, kommune_id),
  CONSTRAINT tidum_secure_outbox_party_fk
    FOREIGN KEY (party_id, kommune_id)
    REFERENCES tidum_secure_parties (id, kommune_id),
  CONSTRAINT tidum_secure_outbox_message_party_unique UNIQUE (message_id, party_id)
);

CREATE INDEX IF NOT EXISTS tidum_secure_outbox_pending_idx
  ON tidum_secure_notification_outbox (status, next_attempt_at)
  WHERE status IN ('pending', 'failed');

-- Sendte meldinger er uforanderlige, også ved direkte SQL.
CREATE OR REPLACE FUNCTION tidum_secure_message_immutable_guard()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'sent' THEN
    RAISE EXCEPTION 'sent secure messages are immutable';
  END IF;
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
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tidum_secure_message_immutable_trigger ON tidum_secure_messages;
CREATE TRIGGER tidum_secure_message_immutable_trigger
BEFORE UPDATE OR DELETE ON tidum_secure_messages
FOR EACH ROW EXECUTE FUNCTION tidum_secure_message_immutable_guard();

-- Vedlegg kan bare legges til, endres eller fjernes mens meldingen er utkast.
CREATE OR REPLACE FUNCTION tidum_secure_attachment_draft_guard()
RETURNS TRIGGER AS $$
DECLARE
  parent_message_id UUID;
  parent_status TEXT;
BEGIN
  parent_message_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.message_id ELSE NEW.message_id END;
  SELECT status INTO parent_status FROM tidum_secure_messages WHERE id = parent_message_id;
  IF parent_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'attachments on sent secure messages are immutable';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tidum_secure_attachment_draft_trigger ON tidum_secure_message_attachments;
CREATE TRIGGER tidum_secure_attachment_draft_trigger
BEFORE INSERT OR UPDATE OR DELETE ON tidum_secure_message_attachments
FOR EACH ROW EXECUTE FUNCTION tidum_secure_attachment_draft_guard();

-- Audit er append-only.
CREATE OR REPLACE FUNCTION tidum_secure_audit_immutable_guard()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'secure dialog audit events are immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tidum_secure_audit_immutable_trigger ON tidum_secure_dialog_audit_events;
CREATE TRIGGER tidum_secure_audit_immutable_trigger
BEFORE UPDATE OR DELETE ON tidum_secure_dialog_audit_events
FOR EACH ROW EXECUTE FUNCTION tidum_secure_audit_immutable_guard();
