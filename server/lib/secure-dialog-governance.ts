import type { PoolClient } from "pg";
import { pool } from "../db";
import { deleteSecureDialogAttachment } from "./secure-dialog-storage";
import {
  rewrapSecureDialogContent,
  secureDialogContentNeedsRotation,
} from "./secure-dialog-content";
import { getActiveSecretKeyId, rewrapSecret, sealedSecretKeyId } from "./secret-box";

async function transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function processSecureDialogRetention(limit = 20, kommuneId?: number): Promise<{
  processed: number;
  purged: number;
  failed: number;
}> {
  const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 100));
  let processed = 0;
  let purged = 0;
  let failed = 0;

  for (let index = 0; index < safeLimit; index += 1) {
    const claimed = await transaction(async (client) => {
      const { rows: [row] } = await client.query(
        `WITH candidate AS (
           SELECT conversation.id, conversation.kommune_id, conversation.retention_state AS previous_state
             FROM tidum_secure_conversations conversation
             LEFT JOIN tidum_secure_dialog_retention_policies policy
               ON policy.kommune_id = conversation.kommune_id
            WHERE conversation.status = 'closed'
              AND ($1::integer IS NULL OR conversation.kommune_id = $1)
              AND conversation.retention_state IN ('active', 'purging')
              AND NOT EXISTS (
                SELECT 1 FROM tidum_secure_dialog_legal_holds hold
                 WHERE hold.conversation_id = conversation.id AND hold.kommune_id = conversation.kommune_id
                   AND hold.released_at IS NULL
              )
              AND EXISTS (
                SELECT 1 FROM archive_entries entry
                 WHERE entry.entity_type = 'secure_dialog'
                   AND entry.entity_id = conversation.id::text
                   AND entry.kommune_id = conversation.kommune_id
                   AND entry.status = 'archived'
              )
              AND (
                (
                  conversation.retention_state = 'active'
                  AND policy.enabled = TRUE
                  AND policy.retention_days IS NOT NULL
                  AND conversation.retention_due_at <= NOW()
                )
                OR (
                  conversation.retention_state = 'purging'
                  AND conversation.retention_next_attempt_at <= NOW()
                )
              )
            ORDER BY conversation.retention_due_at NULLS FIRST, conversation.closed_at
            FOR UPDATE OF conversation SKIP LOCKED
            LIMIT 1
         )
         UPDATE tidum_secure_conversations conversation
            SET retention_state = 'purging',
                retention_attempts = retention_attempts + 1,
                retention_next_attempt_at = NOW() + INTERVAL '15 minutes',
                retention_last_error = NULL,
                updated_at = NOW()
           FROM candidate
          WHERE conversation.id = candidate.id
         RETURNING conversation.id, conversation.kommune_id,
                   conversation.retention_attempts, candidate.previous_state`,
        [kommuneId ?? null],
      );
      if (row && row.previous_state === "active") {
        await client.query(
          `INSERT INTO tidum_secure_dialog_audit_events
             (kommune_id, actor_user_id, actor_kind, conversation_id, action, metadata)
           VALUES ($1, NULL, 'system', $2, 'retention_purge_started', '{}'::jsonb)`,
          [row.kommune_id, row.id],
        );
      }
      return row ?? null;
    });
    if (!claimed) break;
    processed += 1;

    try {
      const storageRows = await pool.query(
        `SELECT storage_key
           FROM tidum_secure_message_attachments attachment
          WHERE attachment.kommune_id = $1
            AND attachment.message_id IN (
              SELECT id FROM tidum_secure_messages WHERE conversation_id = $2 AND kommune_id = $1
            )
         UNION
         SELECT storage_key
           FROM tidum_secure_attachment_quarantine
          WHERE kommune_id = $1 AND conversation_id = $2 AND status <> 'deleted'`,
        [claimed.kommune_id, claimed.id],
      );
      for (const row of storageRows.rows) {
        await deleteSecureDialogAttachment(String(row.storage_key));
      }

      await transaction(async (client) => {
        const guard = await client.query(
          `SELECT 1
             FROM tidum_secure_conversations conversation
            WHERE conversation.id = $1 AND conversation.kommune_id = $2
              AND conversation.retention_state = 'purging'
              AND NOT EXISTS (
                SELECT 1 FROM tidum_secure_dialog_legal_holds hold
                 WHERE hold.conversation_id = conversation.id AND hold.released_at IS NULL
              )
              AND EXISTS (
                SELECT 1 FROM archive_entries entry
                 WHERE entry.entity_type = 'secure_dialog'
                   AND entry.entity_id = conversation.id::text
                   AND entry.kommune_id = conversation.kommune_id
                   AND entry.status = 'archived'
              )
            FOR UPDATE`,
          [claimed.id, claimed.kommune_id],
        );
        if (!guard.rowCount) throw new Error("RETENTION_GUARD_FAILED");

        await client.query(
          `DELETE FROM tidum_secure_notification_outbox
            WHERE kommune_id = $1 AND message_id IN (
              SELECT id FROM tidum_secure_messages WHERE conversation_id = $2 AND kommune_id = $1
            )`,
          [claimed.kommune_id, claimed.id],
        );
        await client.query(
          `DELETE FROM tidum_secure_message_receipts
            WHERE kommune_id = $1 AND message_id IN (
              SELECT id FROM tidum_secure_messages WHERE conversation_id = $2 AND kommune_id = $1
            )`,
          [claimed.kommune_id, claimed.id],
        );
        await client.query(
          `DELETE FROM tidum_secure_attachment_quarantine WHERE kommune_id = $1 AND conversation_id = $2`,
          [claimed.kommune_id, claimed.id],
        );
        await client.query(
          `DELETE FROM tidum_secure_message_attachments
            WHERE kommune_id = $1 AND message_id IN (
              SELECT id FROM tidum_secure_messages WHERE conversation_id = $2 AND kommune_id = $1
            )`,
          [claimed.kommune_id, claimed.id],
        );
        await client.query(
          `DELETE FROM tidum_secure_messages WHERE kommune_id = $1 AND conversation_id = $2`,
          [claimed.kommune_id, claimed.id],
        );
        await client.query(
          `DELETE FROM tidum_secure_conversation_participants WHERE kommune_id = $1 AND conversation_id = $2`,
          [claimed.kommune_id, claimed.id],
        );
        await client.query(
          `UPDATE tidum_secure_conversations
              SET subject = NULL, retention_state = 'purged', purged_at = NOW(),
                  retention_due_at = NULL, retention_next_attempt_at = NULL,
                  retention_last_error = NULL, updated_at = NOW()
            WHERE id = $1 AND kommune_id = $2 AND retention_state = 'purging'`,
          [claimed.id, claimed.kommune_id],
        );
        await client.query(
          `INSERT INTO tidum_secure_dialog_audit_events
             (kommune_id, actor_user_id, actor_kind, conversation_id, action, metadata)
           VALUES ($1, NULL, 'system', $2, 'retention_purged', '{}'::jsonb)`,
          [claimed.kommune_id, claimed.id],
        );
      });
      purged += 1;
    } catch {
      failed += 1;
      await transaction(async (client) => {
        await client.query(
          `UPDATE tidum_secure_conversations
              SET retention_last_error = 'retention_purge_failed',
                  retention_next_attempt_at = NOW() + (INTERVAL '15 minutes' * LEAST(retention_attempts, 96)),
                  updated_at = NOW()
            WHERE id = $1 AND kommune_id = $2 AND retention_state = 'purging'`,
          [claimed.id, claimed.kommune_id],
        );
        await client.query(
          `INSERT INTO tidum_secure_dialog_audit_events
             (kommune_id, actor_user_id, actor_kind, conversation_id, action, metadata)
           VALUES ($1, NULL, 'system', $2, 'retention_purge_failed', '{}'::jsonb)`,
          [claimed.kommune_id, claimed.id],
        );
      }).catch(() => undefined);
    }
  }
  return { processed, purged, failed };
}

export async function processSecureDialogKeyRotation(limit = 100, kommuneId?: number): Promise<{
  conversations: number;
  messages: number;
  archiveConfigs: number;
  municipalityKeys: number;
  rawIntakePayloads: number;
  activeKeyId: string;
}> {
  const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 500));
  const activeKeyId = getActiveSecretKeyId();
  return transaction(async (client) => {
    const conversations = await client.query(
      `SELECT id, kommune_id, subject
         FROM tidum_secure_conversations
        WHERE subject IS NOT NULL
          AND subject NOT LIKE $1
          AND ($3::integer IS NULL OR kommune_id = $3)
        ORDER BY created_at
        FOR UPDATE SKIP LOCKED
        LIMIT $2`,
      [`sdc:v1:${activeKeyId}:%`, safeLimit, kommuneId ?? null],
    );
    const rotatedConversationIds = new Set<string>();
    for (const row of conversations.rows) {
      const stored = String(row.subject);
      if (!secureDialogContentNeedsRotation(stored)) continue;
      await client.query(
        `UPDATE tidum_secure_conversations SET subject = $1 WHERE id = $2 AND kommune_id = $3`,
        [rewrapSecureDialogContent(stored), row.id, row.kommune_id],
      );
      rotatedConversationIds.add(String(row.id));
    }

    const messages = await client.query(
      `SELECT id, kommune_id, conversation_id, body_encrypted
         FROM tidum_secure_messages
        WHERE body_encrypted NOT LIKE $1
          AND ($3::integer IS NULL OR kommune_id = $3)
        ORDER BY created_at
        FOR UPDATE SKIP LOCKED
        LIMIT $2`,
      [`sdc:v1:${activeKeyId}:%`, safeLimit, kommuneId ?? null],
    );
    let rotatedMessages = 0;
    for (const row of messages.rows) {
      const stored = String(row.body_encrypted);
      if (!secureDialogContentNeedsRotation(stored)) continue;
      await client.query(
        `UPDATE tidum_secure_messages SET body_encrypted = $1 WHERE id = $2 AND kommune_id = $3`,
        [rewrapSecureDialogContent(stored), row.id, row.kommune_id],
      );
      rotatedConversationIds.add(String(row.conversation_id));
      rotatedMessages += 1;
    }

    for (const conversationId of rotatedConversationIds) {
      await client.query(
        `INSERT INTO tidum_secure_dialog_audit_events
           (kommune_id, actor_user_id, actor_kind, conversation_id, action, metadata)
         SELECT kommune_id, NULL, 'system', id, 'encryption_key_rotated',
                jsonb_build_object('keyId', $2::text)
           FROM tidum_secure_conversations WHERE id = $1`,
        [conversationId, activeKeyId],
      );
    }

    const rotateGenericColumn = async (
      selectSql: string,
      updateSql: string,
    ): Promise<number> => {
      const rows = await client.query(selectSql, [
        `enc:v2:${activeKeyId}:%`,
        safeLimit,
        kommuneId ?? null,
      ]);
      let count = 0;
      for (const row of rows.rows) {
        const stored = String(row.secret_value);
        if (sealedSecretKeyId(stored) === activeKeyId) continue;
        await client.query(updateSql, [rewrapSecret(stored), row.id]);
        count += 1;
      }
      return count;
    };
    const archiveConfigCount = await rotateGenericColumn(
      `SELECT id, client_secret AS secret_value
         FROM archive_configs
        WHERE client_secret NOT LIKE $1
          AND ($3::integer IS NULL OR kommune_id = $3)
        ORDER BY created_at
        FOR UPDATE SKIP LOCKED
        LIMIT $2`,
      `UPDATE archive_configs SET client_secret = $1, updated_at = NOW() WHERE id = $2`,
    );
    const municipalityKeyCount = await rotateGenericColumn(
      `SELECT id, fiks_private_key_encrypted AS secret_value
         FROM tidum_kommuner
        WHERE fiks_private_key_encrypted IS NOT NULL
          AND fiks_private_key_encrypted NOT LIKE $1
          AND ($3::integer IS NULL OR id = $3)
        ORDER BY id
        FOR UPDATE SKIP LOCKED
        LIMIT $2`,
      `UPDATE tidum_kommuner SET fiks_private_key_encrypted = $1, updated_at = NOW() WHERE id = $2`,
    );
    const rawIntakeCount = await rotateGenericColumn(
      `SELECT id, raw_payload_encrypted AS secret_value
         FROM tidum_fiks_raw_intake_log
        WHERE raw_payload_encrypted NOT LIKE $1
          AND ($3::integer IS NULL OR kommune_id = $3)
        ORDER BY received_at
        FOR UPDATE SKIP LOCKED
        LIMIT $2`,
      `UPDATE tidum_fiks_raw_intake_log SET raw_payload_encrypted = $1 WHERE id = $2`,
    );
    return {
      conversations: conversations.rows.length,
      messages: rotatedMessages,
      archiveConfigs: archiveConfigCount,
      municipalityKeys: municipalityKeyCount,
      rawIntakePayloads: rawIntakeCount,
      activeKeyId,
    };
  });
}
