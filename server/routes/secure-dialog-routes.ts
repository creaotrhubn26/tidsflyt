import type { Express, NextFunction, Request, Response } from "express";
import type { PoolClient } from "pg";
import multer from "multer";
import { createHash } from "crypto";
import { z } from "zod";
import { pool } from "../db";
import { requireAuth } from "../middleware/auth";
import { apiRateLimit } from "../rate-limit";
import { isKommuneRole, normalizeRole } from "../../shared/roles";
import { provisionSecurePartyIdentity } from "../lib/secure-party-provisioning";
import { openSecureDialogContent, sealSecureDialogContent } from "../lib/secure-dialog-content";
import {
  attachmentExtension,
  hasValidAttachmentSignature,
  safeAttachmentName,
} from "../lib/email-composer-security";
import {
  deleteSecureDialogAttachment,
  downloadSecureDialogAttachment,
  generateSecureDialogAttachmentKey,
  uploadSecureDialogAttachment,
} from "../lib/secure-dialog-storage";
import { emailService } from "../lib/email-service";

type SecureActor = {
  userId: string;
  role: string;
  staffKommuneId: number | null;
  strongEid: boolean;
};

type ConversationAccess = {
  id: string;
  kommuneId: number;
  meldingId: string;
  subject: string;
  status: string;
  actorKind: "staff" | "party";
  partyId: string | null;
};

class SecureDialogRouteError extends Error {
  constructor(
    readonly status: number,
    readonly clientMessage: string,
    readonly code = "SECURE_DIALOG_ERROR",
  ) {
    super(code);
  }
}

const uuidSchema = z.string().uuid();
const notificationEmailSchema = z.string().trim().email().max(320);
const partyCreateSchema = z.object({
  displayName: z.string().trim().min(1).max(200),
  personnummer: z.string().transform((value) => value.replace(/\s+/g, "")).pipe(z.string().regex(/^\d{11}$/)),
  notificationEmail: notificationEmailSchema.optional().nullable(),
}).strict();
const accessCreateSchema = z.object({
  partyId: uuidSchema,
  partyRole: z.enum(["forelder", "barn", "verge", "fullmektig"]),
  validUntil: z.string().datetime({ offset: true }).optional().nullable(),
}).strict();
const conversationCreateSchema = z.object({
  meldingId: uuidSchema,
  subject: z.string().trim().min(1).max(200),
  participantPartyIds: z.array(uuidSchema).min(1).max(20),
}).strict();
const messageBodySchema = z.object({
  content: z.string().trim().min(1).max(100_000),
}).strict();

const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => callback(null, attachmentExtension(file.mimetype) !== null),
});

function receiveAttachment(req: Request, res: Response, next: NextFunction): void {
  attachmentUpload.single("file")(req, res, (error: unknown) => {
    if (error) {
      res.status(400).json({ error: "Vedlegget kunne ikke lastes opp" });
      return;
    }
    next();
  });
}

function routeError(res: Response, operation: string, error: unknown): Response {
  if (error instanceof SecureDialogRouteError) {
    return res.status(error.status).json({ error: error.clientMessage, code: error.code });
  }
  if (error instanceof z.ZodError) {
    return res.status(400).json({ error: "Ugyldige data", code: "INVALID_INPUT" });
  }
  if (error instanceof Error && error.message === "INVALID_SSN") {
    return res.status(400).json({ error: "Ugyldig fødselsnummerformat", code: "INVALID_INPUT" });
  }
  if (error instanceof Error && error.message === "SECURE_DIALOG_ENCRYPTION_NOT_CONFIGURED") {
    return res.status(503).json({ error: "Sikker lagring er ikke konfigurert", code: "SECURE_STORAGE_UNAVAILABLE" });
  }
  console.error(`[secure-dialog] ${operation} failed`, error);
  return res.status(500).json({ error: "Operasjonen kunne ikke fullføres" });
}

async function withTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const value = await callback(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function resolveSecureActor(req: Request): Promise<SecureActor> {
  const identity = (req as any).authUser ?? (req as any).user;
  const userId = String(identity?.id ?? "").trim();
  if (!userId) throw new SecureDialogRouteError(401, "Ikke autentisert", "NOT_AUTHENTICATED");
  const provider = String(identity?.provider ?? "").trim().toLowerCase();
  const strongProvider = provider === "bankid" || provider === "buypass";
  const { rows: [row] } = await pool.query(
    `SELECT
       u.id::text AS user_id,
       LOWER(COALESCE(u.role, '')) AS role,
       u.kommune_id,
       EXISTS (
         SELECT 1 FROM tidum_eid_identities eid
          WHERE eid.user_id = u.id AND LOWER(eid.provider) = $2
       ) AS current_eid_linked
     FROM users u
     WHERE u.id::text = $1
     LIMIT 1`,
    [userId, provider],
  );
  if (!row) throw new SecureDialogRouteError(403, "Ikke tilgang", "ACTOR_NOT_FOUND");
  return {
    userId: String(row.user_id),
    role: normalizeRole(row.role),
    staffKommuneId: isKommuneRole(row.role) && row.kommune_id != null ? Number(row.kommune_id) : null,
    strongEid: strongProvider && row.current_eid_linked === true,
  };
}

function requireStaff(actor: SecureActor): number {
  if (actor.staffKommuneId == null) {
    throw new SecureDialogRouteError(403, "Kun barnevernstjenesten kan utføre denne handlingen", "STAFF_REQUIRED");
  }
  return actor.staffKommuneId;
}

const SAFE_AUDIT_METADATA = new Set([
  "alreadyEidLinked",
  "participantCount",
  "partyRole",
  "receiptCount",
  "notificationQueued",
  "mimeType",
  "sizeBytes",
  "status",
]);

async function appendAudit(
  client: Pick<PoolClient, "query">,
  input: {
    kommuneId: number;
    actorUserId: string | null;
    actorKind: "staff" | "party" | "system";
    action: string;
    partyId?: string | null;
    conversationId?: string | null;
    messageId?: string | null;
    attachmentId?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const metadata = Object.fromEntries(Object.entries(input.metadata ?? {}).filter(([key, value]) => (
    SAFE_AUDIT_METADATA.has(key)
    && (value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean")
  )));
  await client.query(
    `INSERT INTO tidum_secure_dialog_audit_events
       (kommune_id, actor_user_id, actor_kind, party_id, conversation_id, message_id, attachment_id, action, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
    [
      input.kommuneId,
      input.actorUserId,
      input.actorKind,
      input.partyId ?? null,
      input.conversationId ?? null,
      input.messageId ?? null,
      input.attachmentId ?? null,
      input.action,
      JSON.stringify(metadata),
    ],
  );
}

async function loadConversationAccess(
  client: Pick<PoolClient, "query">,
  conversationId: string,
  actor: SecureActor,
): Promise<ConversationAccess | null> {
  const { rows: [conversation] } = await client.query(
    `SELECT id, kommune_id, barnevern_melding_id, subject, status
       FROM tidum_secure_conversations
      WHERE id = $1`,
    [conversationId],
  );
  if (!conversation) return null;

  if (actor.staffKommuneId === Number(conversation.kommune_id)) {
    return {
      id: String(conversation.id),
      kommuneId: Number(conversation.kommune_id),
      meldingId: String(conversation.barnevern_melding_id),
      subject: openSecureDialogContent(String(conversation.subject)),
      status: String(conversation.status),
      actorKind: "staff",
      partyId: null,
    };
  }

  if (!actor.strongEid) return null;
  const { rows: [membership] } = await client.query(
    `SELECT party.id AS party_id
       FROM tidum_secure_conversation_participants participant
       JOIN tidum_secure_case_access access ON access.id = participant.party_access_id
                                           AND access.kommune_id = participant.kommune_id
       JOIN tidum_secure_parties party ON party.id = access.party_id
                                      AND party.kommune_id = access.kommune_id
      WHERE participant.conversation_id = $1
        AND party.portal_user_id = $2
        AND party.status = 'active'
        AND participant.revoked_at IS NULL
        AND access.revoked_at IS NULL
        AND access.valid_from <= NOW()
        AND (access.valid_until IS NULL OR access.valid_until > NOW())
      LIMIT 1`,
    [conversationId, actor.userId],
  );
  if (!membership) return null;
  return {
    id: String(conversation.id),
    kommuneId: Number(conversation.kommune_id),
    meldingId: String(conversation.barnevern_melding_id),
    subject: openSecureDialogContent(String(conversation.subject)),
    status: String(conversation.status),
    actorKind: "party",
    partyId: String(membership.party_id),
  };
}

async function loadOwnedDraft(
  client: Pick<PoolClient, "query">,
  messageId: string,
  actor: SecureActor,
): Promise<{ id: string; conversationId: string; kommuneId: number; access: ConversationAccess } | null> {
  const { rows: [message] } = await client.query(
    `SELECT id, conversation_id, kommune_id, sender_user_id, status
       FROM tidum_secure_messages
      WHERE id = $1`,
    [messageId],
  );
  if (!message || message.status !== "draft" || String(message.sender_user_id) !== actor.userId) return null;
  const access = await loadConversationAccess(client, String(message.conversation_id), actor);
  if (!access || access.kommuneId !== Number(message.kommune_id)) return null;
  return {
    id: String(message.id),
    conversationId: String(message.conversation_id),
    kommuneId: Number(message.kommune_id),
    access,
  };
}

async function requireOwnedDraftMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    uuidSchema.parse(req.params.messageId);
    const actor = await resolveSecureActor(req);
    const draft = await loadOwnedDraft(pool as unknown as Pick<PoolClient, "query">, req.params.messageId, actor);
    if (!draft) throw new SecureDialogRouteError(404, "Utkast ikke funnet", "DRAFT_NOT_FOUND");
    (req as any).secureDialogActor = actor;
    next();
  } catch (error) {
    routeError(res, "draft authorization", error);
  }
}

export async function processSecureNotificationOutbox(messageId?: string, limit = 20): Promise<number> {
  let processed = 0;
  await pool.query(
    `UPDATE tidum_secure_notification_outbox
        SET status = 'failed', next_attempt_at = NOW(), updated_at = NOW(), last_error = 'stale_claim'
      WHERE status = 'sending' AND updated_at < NOW() - INTERVAL '10 minutes'`,
  );

  for (let index = 0; index < limit; index += 1) {
    const claimed = await withTransaction(async (client) => {
      const { rows: [row] } = await client.query(
        `SELECT outbox.id, outbox.kommune_id, outbox.message_id, outbox.party_id,
                outbox.attempts, party.notification_email, message.conversation_id
           FROM tidum_secure_notification_outbox outbox
           JOIN tidum_secure_parties party ON party.id = outbox.party_id
           JOIN tidum_secure_messages message ON message.id = outbox.message_id
          WHERE outbox.status IN ('pending', 'failed')
            AND outbox.next_attempt_at <= NOW()
            AND ($1::uuid IS NULL OR outbox.message_id = $1)
            AND party.status = 'active'
            AND party.notification_email IS NOT NULL
          ORDER BY outbox.created_at
          FOR UPDATE OF outbox SKIP LOCKED
          LIMIT 1`,
        [messageId ?? null],
      );
      if (!row) return null;
      await client.query(
        `UPDATE tidum_secure_notification_outbox
            SET status = 'sending', attempts = attempts + 1, updated_at = NOW(), last_error = NULL
          WHERE id = $1`,
        [row.id],
      );
      return row;
    });
    if (!claimed) break;

    let sent = false;
    try {
      sent = await emailService.sendSecurePortalNotification(String(claimed.notification_email));
    } catch (error) {
      console.error("[secure-dialog] neutral notification failed", error instanceof Error ? error.message : "unknown");
    }
    await withTransaction(async (client) => {
      if (sent) {
        await client.query(
          `UPDATE tidum_secure_notification_outbox
              SET status = 'sent', sent_at = NOW(), updated_at = NOW(), last_error = NULL
            WHERE id = $1`,
          [claimed.id],
        );
      } else {
        await client.query(
          `UPDATE tidum_secure_notification_outbox
              SET status = 'failed',
                  next_attempt_at = NOW() + (INTERVAL '5 minutes' * LEAST(attempts, 12)),
                  updated_at = NOW(), last_error = 'delivery_failed'
            WHERE id = $1`,
          [claimed.id],
        );
      }
      await appendAudit(client, {
        kommuneId: Number(claimed.kommune_id),
        actorUserId: null,
        actorKind: "system",
        action: sent ? "notification_sent" : "notification_failed",
        partyId: String(claimed.party_id),
        conversationId: String(claimed.conversation_id),
        messageId: String(claimed.message_id),
      });
    });
    processed += 1;
  }
  return processed;
}

export function registerSecureDialogRoutes(app: Express): void {
  const common = [requireAuth, apiRateLimit] as const;

  app.get("/api/secure-dialog/parties", ...common, async (req: Request, res: Response) => {
    try {
      const actor = await resolveSecureActor(req);
      const kommuneId = requireStaff(actor);
      const meldingId = req.query.meldingId == null ? null : uuidSchema.parse(req.query.meldingId);
      const result = await withTransaction(async (client) => {
        if (meldingId) {
          const scopedCase = await client.query(
            `SELECT id FROM tidum_barnevern_meldinger WHERE id = $1 AND kommune_id = $2`,
            [meldingId, kommuneId],
          );
          if (!scopedCase.rowCount) {
            throw new SecureDialogRouteError(404, "Melding ikke funnet", "CASE_NOT_FOUND");
          }
        }

        const { rows } = await client.query(
          `SELECT party.id, party.display_name, party.notification_email, party.status, party.created_at,
                  EXISTS (
                    SELECT 1 FROM tidum_eid_identities eid WHERE eid.user_id = party.portal_user_id
                  ) AS eid_linked,
                  access.id AS access_id, access.party_role, access.valid_from, access.valid_until
             FROM tidum_secure_parties party
             LEFT JOIN LATERAL (
               SELECT id, party_role, valid_from, valid_until
                 FROM tidum_secure_case_access
                WHERE party_id = party.id
                  AND ($2::uuid IS NOT NULL AND barnevern_melding_id = $2)
                  AND revoked_at IS NULL AND valid_from <= NOW()
                  AND (valid_until IS NULL OR valid_until > NOW())
                ORDER BY created_at DESC
                LIMIT 1
             ) access ON TRUE
            WHERE party.kommune_id = $1 AND party.status = 'active'
            ORDER BY party.display_name, party.created_at`,
          [kommuneId, meldingId],
        );
        for (const party of rows) {
          await appendAudit(client, {
            kommuneId,
            actorUserId: actor.userId,
            actorKind: "staff",
            action: "party_listed",
            partyId: String(party.id),
            metadata: { status: String(party.status) },
          });
        }
        return rows.map((party) => ({
          id: party.id,
          displayName: party.display_name,
          notificationEmail: party.notification_email,
          status: party.status,
          eidLinked: party.eid_linked === true,
          createdAt: party.created_at,
          access: party.access_id ? {
            id: party.access_id,
            partyRole: party.party_role,
            validFrom: party.valid_from,
            validUntil: party.valid_until,
          } : null,
        }));
      });
      res.json(result);
    } catch (error) {
      routeError(res, "party list", error);
    }
  });

  app.post("/api/secure-dialog/parties", ...common, async (req: Request, res: Response) => {
    try {
      const actor = await resolveSecureActor(req);
      const kommuneId = requireStaff(actor);
      const input = partyCreateSchema.parse(req.body);
      const result = await withTransaction(async (client) => {
        const identity = await provisionSecurePartyIdentity(client, input);
        const existing = await client.query(
          `SELECT id FROM tidum_secure_parties WHERE kommune_id = $1 AND portal_user_id = $2`,
          [kommuneId, identity.portalUserId],
        );
        if (existing.rowCount) {
          throw new SecureDialogRouteError(409, "Parten er allerede registrert i kommunen", "PARTY_EXISTS");
        }
        const { rows: [party] } = await client.query(
          `INSERT INTO tidum_secure_parties
             (kommune_id, portal_user_id, display_name, notification_email, created_by)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, display_name, notification_email, status, created_at`,
          [
            kommuneId,
            identity.portalUserId,
            input.displayName,
            input.notificationEmail?.toLowerCase() ?? null,
            actor.userId,
          ],
        );
        await appendAudit(client, {
          kommuneId,
          actorUserId: actor.userId,
          actorKind: "staff",
          action: "party_created",
          partyId: String(party.id),
          metadata: { alreadyEidLinked: identity.alreadyEidLinked },
        });
        return {
          id: party.id,
          displayName: party.display_name,
          notificationEmail: party.notification_email,
          status: party.status,
          eidLinked: identity.alreadyEidLinked,
          createdAt: party.created_at,
        };
      });
      res.status(201).json(result);
    } catch (error) {
      routeError(res, "party create", error);
    }
  });

  app.post("/api/secure-dialog/cases/:meldingId/access", ...common, async (req: Request, res: Response) => {
    try {
      const meldingId = uuidSchema.parse(req.params.meldingId);
      const actor = await resolveSecureActor(req);
      const kommuneId = requireStaff(actor);
      const input = accessCreateSchema.parse(req.body);
      const validUntil = input.validUntil ? new Date(input.validUntil) : null;
      if (validUntil && validUntil.getTime() <= Date.now()) {
        throw new SecureDialogRouteError(400, "Gyldighetsperioden må ligge frem i tid", "INVALID_VALIDITY");
      }
      const result = await withTransaction(async (client) => {
        const caseResult = await client.query(
          `SELECT id FROM tidum_barnevern_meldinger WHERE id = $1 AND kommune_id = $2`,
          [meldingId, kommuneId],
        );
        const partyResult = await client.query(
          `SELECT id FROM tidum_secure_parties WHERE id = $1 AND kommune_id = $2 AND status = 'active'`,
          [input.partyId, kommuneId],
        );
        if (!caseResult.rowCount || !partyResult.rowCount) {
          throw new SecureDialogRouteError(404, "Sak eller part ikke funnet", "SCOPE_NOT_FOUND");
        }
        await client.query(
          `UPDATE tidum_secure_case_access
              SET revoked_at = NOW(), revoked_by = $1, updated_at = NOW()
            WHERE party_id = $2 AND barnevern_melding_id = $3
              AND revoked_at IS NULL AND valid_until IS NOT NULL AND valid_until <= NOW()`,
          [actor.userId, input.partyId, meldingId],
        );
        const active = await client.query(
          `SELECT id FROM tidum_secure_case_access
            WHERE party_id = $1 AND barnevern_melding_id = $2 AND revoked_at IS NULL`,
          [input.partyId, meldingId],
        );
        if (active.rowCount) throw new SecureDialogRouteError(409, "Parten har allerede aktiv tilgang", "ACCESS_EXISTS");
        const { rows: [access] } = await client.query(
          `INSERT INTO tidum_secure_case_access
             (kommune_id, party_id, barnevern_melding_id, party_role, valid_until, created_by)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, party_id, barnevern_melding_id, party_role, valid_from, valid_until`,
          [kommuneId, input.partyId, meldingId, input.partyRole, validUntil, actor.userId],
        );
        await appendAudit(client, {
          kommuneId,
          actorUserId: actor.userId,
          actorKind: "staff",
          action: "access_granted",
          partyId: input.partyId,
          metadata: { partyRole: input.partyRole },
        });
        return access;
      });
      res.status(201).json(result);
    } catch (error) {
      routeError(res, "access grant", error);
    }
  });

  app.post("/api/secure-dialog/access/:accessId/revoke", ...common, async (req: Request, res: Response) => {
    try {
      const accessId = uuidSchema.parse(req.params.accessId);
      const actor = await resolveSecureActor(req);
      const kommuneId = requireStaff(actor);
      const result = await withTransaction(async (client) => {
        const { rows: [access] } = await client.query(
          `UPDATE tidum_secure_case_access
              SET revoked_at = NOW(), revoked_by = $1, updated_at = NOW()
            WHERE id = $2 AND kommune_id = $3 AND revoked_at IS NULL
            RETURNING id, party_id`,
          [actor.userId, accessId, kommuneId],
        );
        if (!access) throw new SecureDialogRouteError(404, "Aktiv tilgang ikke funnet", "ACCESS_NOT_FOUND");
        await client.query(
          `UPDATE tidum_secure_conversation_participants
              SET revoked_at = NOW(), revoked_by = $1, updated_at = NOW()
            WHERE party_access_id = $2 AND kommune_id = $3 AND revoked_at IS NULL`,
          [actor.userId, accessId, kommuneId],
        );
        const affectedConversations = await client.query(
          `SELECT DISTINCT conversation_id
             FROM tidum_secure_conversation_participants
            WHERE party_access_id = $1 AND kommune_id = $2`,
          [accessId, kommuneId],
        );
        if (affectedConversations.rowCount) {
          for (const participant of affectedConversations.rows) {
            await appendAudit(client, {
              kommuneId,
              actorUserId: actor.userId,
              actorKind: "staff",
              action: "access_revoked",
              partyId: String(access.party_id),
              conversationId: String(participant.conversation_id),
            });
          }
        } else {
          await appendAudit(client, {
            kommuneId,
            actorUserId: actor.userId,
            actorKind: "staff",
            action: "access_revoked",
            partyId: String(access.party_id),
          });
        }
        return { id: access.id, revoked: true };
      });
      res.json(result);
    } catch (error) {
      routeError(res, "access revoke", error);
    }
  });

  app.post("/api/secure-dialog/conversations", ...common, async (req: Request, res: Response) => {
    try {
      const actor = await resolveSecureActor(req);
      const kommuneId = requireStaff(actor);
      const input = conversationCreateSchema.parse(req.body);
      const partyIds = [...new Set(input.participantPartyIds)];
      if (partyIds.length !== input.participantPartyIds.length) {
        throw new SecureDialogRouteError(400, "Samme part kan ikke legges til flere ganger", "DUPLICATE_PARTICIPANT");
      }
      const result = await withTransaction(async (client) => {
        const caseResult = await client.query(
          `SELECT id FROM tidum_barnevern_meldinger WHERE id = $1 AND kommune_id = $2`,
          [input.meldingId, kommuneId],
        );
        if (!caseResult.rowCount) throw new SecureDialogRouteError(404, "Sak ikke funnet", "CASE_NOT_FOUND");
        const accesses = await client.query(
          `SELECT id, party_id
             FROM tidum_secure_case_access
            WHERE kommune_id = $1 AND barnevern_melding_id = $2
              AND party_id = ANY($3::uuid[])
              AND revoked_at IS NULL AND valid_from <= NOW()
              AND (valid_until IS NULL OR valid_until > NOW())`,
          [kommuneId, input.meldingId, partyIds],
        );
        if (accesses.rowCount !== partyIds.length) {
          throw new SecureDialogRouteError(403, "Alle deltakere må ha aktiv tilgang til saken", "PARTICIPANT_ACCESS_REQUIRED");
        }
        const { rows: [conversation] } = await client.query(
          `INSERT INTO tidum_secure_conversations
             (kommune_id, barnevern_melding_id, subject, created_by)
           VALUES ($1, $2, $3, $4)
           RETURNING id, kommune_id, barnevern_melding_id, subject, status, created_at`,
          [kommuneId, input.meldingId, sealSecureDialogContent(input.subject), actor.userId],
        );
        for (const access of accesses.rows) {
          await client.query(
            `INSERT INTO tidum_secure_conversation_participants
               (kommune_id, conversation_id, party_access_id, granted_by)
             VALUES ($1, $2, $3, $4)`,
            [kommuneId, conversation.id, access.id, actor.userId],
          );
        }
        await appendAudit(client, {
          kommuneId,
          actorUserId: actor.userId,
          actorKind: "staff",
          action: "conversation_created",
          conversationId: String(conversation.id),
          metadata: { participantCount: partyIds.length },
        });
        return { ...conversation, subject: input.subject };
      });
      res.status(201).json(result);
    } catch (error) {
      routeError(res, "conversation create", error);
    }
  });

  app.get("/api/secure-dialog/conversations", ...common, async (req: Request, res: Response) => {
    try {
      const actor = await resolveSecureActor(req);
      const meldingId = req.query.meldingId == null ? null : uuidSchema.parse(req.query.meldingId);
      if (actor.staffKommuneId == null && !actor.strongEid) {
        throw new SecureDialogRouteError(403, "BankID eller Buypass kreves", "STRONG_EID_REQUIRED");
      }
      const result = await withTransaction(async (client) => {
        const { rows } = await client.query(
          `SELECT DISTINCT c.id, c.kommune_id, c.barnevern_melding_id, c.subject, c.status, c.created_at, c.updated_at
             FROM tidum_secure_conversations c
            WHERE (
              ($1::integer IS NOT NULL AND c.kommune_id = $1)
               OR ($2::boolean = TRUE AND EXISTS (
                 SELECT 1
                   FROM tidum_secure_conversation_participants participant
                   JOIN tidum_secure_case_access access ON access.id = participant.party_access_id
                   JOIN tidum_secure_parties party ON party.id = access.party_id
                  WHERE participant.conversation_id = c.id
                    AND party.portal_user_id = $3
                    AND party.status = 'active'
                    AND participant.revoked_at IS NULL
                    AND access.revoked_at IS NULL
                    AND access.valid_from <= NOW()
                    AND (access.valid_until IS NULL OR access.valid_until > NOW())
               ))
            )
              AND ($4::uuid IS NULL OR c.barnevern_melding_id = $4)
            ORDER BY c.updated_at DESC`,
          [actor.staffKommuneId, actor.strongEid, actor.userId, meldingId],
        );
        for (const conversation of rows) {
          const actorKind = actor.staffKommuneId === Number(conversation.kommune_id) ? "staff" : "party";
          await appendAudit(client, {
            kommuneId: Number(conversation.kommune_id),
            actorUserId: actor.userId,
            actorKind,
            action: "conversation_listed",
            conversationId: String(conversation.id),
          });
        }
        return rows.map((conversation) => ({
          ...conversation,
          subject: openSecureDialogContent(String(conversation.subject)),
        }));
      });
      res.json(result);
    } catch (error) {
      routeError(res, "conversation list", error);
    }
  });

  app.get("/api/secure-dialog/conversations/:conversationId", ...common, async (req: Request, res: Response) => {
    try {
      const conversationId = uuidSchema.parse(req.params.conversationId);
      const actor = await resolveSecureActor(req);
      const result = await withTransaction(async (client) => {
        const access = await loadConversationAccess(client, conversationId, actor);
        if (!access) throw new SecureDialogRouteError(404, "Samtale ikke funnet", "CONVERSATION_NOT_FOUND");
        const participants = await client.query(
          `SELECT party.id, party.display_name, access.party_role
             FROM tidum_secure_conversation_participants participant
             JOIN tidum_secure_case_access access ON access.id = participant.party_access_id
             JOIN tidum_secure_parties party ON party.id = access.party_id
            WHERE participant.conversation_id = $1 AND participant.revoked_at IS NULL
              AND access.revoked_at IS NULL AND party.status = 'active'
            ORDER BY party.display_name`,
          [conversationId],
        );
        const messages = await client.query(
          `SELECT message.id, message.sender_user_id, message.sender_party_id, message.sender_kind,
                  message.body_encrypted, message.status, message.sent_at, message.created_at,
                  COALESCE(json_agg(json_build_object(
                    'id', attachment.id,
                    'originalName', attachment.original_name,
                    'mimeType', attachment.mime_type,
                    'sizeBytes', attachment.size_bytes
                  ) ORDER BY attachment.created_at) FILTER (WHERE attachment.id IS NOT NULL), '[]') AS attachments
             FROM tidum_secure_messages message
             LEFT JOIN tidum_secure_message_attachments attachment ON attachment.message_id = message.id
            WHERE message.conversation_id = $1
              AND (message.status = 'sent' OR message.sender_user_id = $2)
            GROUP BY message.id
            ORDER BY message.created_at`,
          [conversationId, actor.userId],
        );
        const visibleMessages = messages.rows.map((message) => ({
          id: message.id,
          senderUserId: message.sender_user_id,
          senderPartyId: message.sender_party_id,
          senderKind: message.sender_kind,
          content: openSecureDialogContent(String(message.body_encrypted)),
          status: message.status,
          sentAt: message.sent_at,
          createdAt: message.created_at,
          attachments: message.attachments,
        }));
        const receiptResult = await client.query(
          `INSERT INTO tidum_secure_message_receipts
             (kommune_id, message_id, reader_user_id, reader_party_id)
           SELECT message.kommune_id, message.id, $2::varchar, $3::uuid
             FROM tidum_secure_messages message
            WHERE message.conversation_id = $1 AND message.status = 'sent'
              AND message.sender_user_id <> $2::varchar
           ON CONFLICT (message_id, reader_user_id) DO NOTHING
           RETURNING message_id`,
          [conversationId, actor.userId, access.partyId],
        );
        for (const receipt of receiptResult.rows) {
          await appendAudit(client, {
            kommuneId: access.kommuneId,
            actorUserId: actor.userId,
            actorKind: access.actorKind,
            action: "message_read",
            partyId: access.partyId,
            conversationId,
            messageId: String(receipt.message_id),
          });
        }
        await appendAudit(client, {
          kommuneId: access.kommuneId,
          actorUserId: actor.userId,
          actorKind: access.actorKind,
          action: "conversation_opened",
          partyId: access.partyId,
          conversationId,
          metadata: { receiptCount: receiptResult.rowCount ?? 0 },
        });
        return {
          id: access.id,
          meldingId: access.meldingId,
          subject: access.subject,
          status: access.status,
          participants: participants.rows.map((party) => ({
            id: party.id,
            displayName: party.display_name,
            partyRole: party.party_role,
          })),
          messages: visibleMessages,
        };
      });
      res.json(result);
    } catch (error) {
      routeError(res, "conversation read", error);
    }
  });

  app.post("/api/secure-dialog/conversations/:conversationId/drafts", ...common, async (req: Request, res: Response) => {
    try {
      const conversationId = uuidSchema.parse(req.params.conversationId);
      const input = messageBodySchema.parse(req.body);
      const actor = await resolveSecureActor(req);
      const result = await withTransaction(async (client) => {
        const access = await loadConversationAccess(client, conversationId, actor);
        if (!access) throw new SecureDialogRouteError(404, "Samtale ikke funnet", "CONVERSATION_NOT_FOUND");
        if (access.status !== "open") throw new SecureDialogRouteError(409, "Samtalen er lukket", "CONVERSATION_CLOSED");
        const { rows: [message] } = await client.query(
          `INSERT INTO tidum_secure_messages
             (kommune_id, conversation_id, sender_user_id, sender_party_id, sender_kind, body_encrypted)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, status, created_at`,
          [
            access.kommuneId,
            conversationId,
            actor.userId,
            access.partyId,
            access.actorKind,
            sealSecureDialogContent(input.content),
          ],
        );
        await appendAudit(client, {
          kommuneId: access.kommuneId,
          actorUserId: actor.userId,
          actorKind: access.actorKind,
          action: "draft_created",
          partyId: access.partyId,
          conversationId,
          messageId: String(message.id),
        });
        return message;
      });
      res.status(201).json(result);
    } catch (error) {
      routeError(res, "draft create", error);
    }
  });

  app.patch("/api/secure-dialog/messages/:messageId/draft", ...common, async (req: Request, res: Response) => {
    try {
      const messageId = uuidSchema.parse(req.params.messageId);
      const input = messageBodySchema.parse(req.body);
      const actor = await resolveSecureActor(req);
      const result = await withTransaction(async (client) => {
        const draft = await loadOwnedDraft(client, messageId, actor);
        if (!draft) throw new SecureDialogRouteError(404, "Utkast ikke funnet", "DRAFT_NOT_FOUND");
        const { rows: [updated] } = await client.query(
          `UPDATE tidum_secure_messages
              SET body_encrypted = $1, updated_at = NOW()
            WHERE id = $2 AND sender_user_id = $3 AND status = 'draft'
            RETURNING id, status, updated_at`,
          [sealSecureDialogContent(input.content), messageId, actor.userId],
        );
        await appendAudit(client, {
          kommuneId: draft.kommuneId,
          actorUserId: actor.userId,
          actorKind: draft.access.actorKind,
          action: "draft_updated",
          partyId: draft.access.partyId,
          conversationId: draft.conversationId,
          messageId,
        });
        return updated;
      });
      res.json(result);
    } catch (error) {
      routeError(res, "draft update", error);
    }
  });

  app.post(
    "/api/secure-dialog/messages/:messageId/attachments",
    requireAuth,
    apiRateLimit,
    requireOwnedDraftMiddleware,
    receiveAttachment,
    async (req: Request, res: Response) => {
      let storageKey: string | null = null;
      try {
        const actor = (req as any).secureDialogActor as SecureActor;
        if (!req.file || !hasValidAttachmentSignature(req.file.buffer, req.file.mimetype)) {
          throw new SecureDialogRouteError(400, "Filinnholdet samsvarer ikke med filtypen", "INVALID_ATTACHMENT");
        }
        const safeName = safeAttachmentName(req.file.originalname);
        const checksum = createHash("sha256").update(req.file.buffer).digest("hex");
        storageKey = generateSecureDialogAttachmentKey(req.params.messageId, safeName);
        await uploadSecureDialogAttachment(storageKey, req.file.buffer, req.file.mimetype, checksum);
        const result = await withTransaction(async (client) => {
          const draft = await loadOwnedDraft(client, req.params.messageId, actor);
          if (!draft) throw new SecureDialogRouteError(404, "Utkast ikke funnet", "DRAFT_NOT_FOUND");
          const { rows: [attachment] } = await client.query(
            `INSERT INTO tidum_secure_message_attachments
               (kommune_id, message_id, storage_key, original_name, mime_type, size_bytes, checksum_sha256, uploaded_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING id, original_name, mime_type, size_bytes, created_at`,
            [
              draft.kommuneId,
              draft.id,
              storageKey,
              safeName,
              req.file!.mimetype,
              req.file!.size,
              checksum,
              actor.userId,
            ],
          );
          await appendAudit(client, {
            kommuneId: draft.kommuneId,
            actorUserId: actor.userId,
            actorKind: draft.access.actorKind,
            action: "attachment_uploaded",
            partyId: draft.access.partyId,
            conversationId: draft.conversationId,
            messageId: draft.id,
            attachmentId: String(attachment.id),
            metadata: { mimeType: req.file!.mimetype, sizeBytes: req.file!.size },
          });
          return {
            id: attachment.id,
            originalName: attachment.original_name,
            mimeType: attachment.mime_type,
            sizeBytes: attachment.size_bytes,
            createdAt: attachment.created_at,
          };
        });
        res.status(201).json(result);
      } catch (error) {
        if (storageKey) await deleteSecureDialogAttachment(storageKey).catch(() => undefined);
        routeError(res, "attachment upload", error);
      }
    },
  );

  app.post("/api/secure-dialog/messages/:messageId/send", ...common, async (req: Request, res: Response) => {
    try {
      const messageId = uuidSchema.parse(req.params.messageId);
      const actor = await resolveSecureActor(req);
      const result = await withTransaction(async (client) => {
        const draft = await loadOwnedDraft(client, messageId, actor);
        if (!draft) throw new SecureDialogRouteError(404, "Utkast ikke funnet", "DRAFT_NOT_FOUND");
        if (draft.access.status !== "open") {
          throw new SecureDialogRouteError(409, "Samtalen er lukket", "CONVERSATION_CLOSED");
        }
        const { rows: [sent] } = await client.query(
          `UPDATE tidum_secure_messages
              SET status = 'sent', sent_at = NOW(), updated_at = NOW()
            WHERE id = $1 AND sender_user_id = $2 AND status = 'draft'
            RETURNING id, status, sent_at`,
          [messageId, actor.userId],
        );
        if (!sent) throw new SecureDialogRouteError(409, "Meldingen er allerede sendt", "MESSAGE_ALREADY_SENT");
        const queued = await client.query(
          `INSERT INTO tidum_secure_notification_outbox (kommune_id, message_id, party_id)
           SELECT $1, $2, party.id
             FROM tidum_secure_conversation_participants participant
             JOIN tidum_secure_case_access access ON access.id = participant.party_access_id
             JOIN tidum_secure_parties party ON party.id = access.party_id
            WHERE participant.conversation_id = $3
              AND participant.revoked_at IS NULL AND access.revoked_at IS NULL
              AND access.valid_from <= NOW() AND (access.valid_until IS NULL OR access.valid_until > NOW())
              AND party.status = 'active' AND party.notification_email IS NOT NULL
              AND party.portal_user_id <> $4
           ON CONFLICT (message_id, party_id) DO NOTHING`,
          [draft.kommuneId, messageId, draft.conversationId, actor.userId],
        );
        await appendAudit(client, {
          kommuneId: draft.kommuneId,
          actorUserId: actor.userId,
          actorKind: draft.access.actorKind,
          action: "message_sent",
          partyId: draft.access.partyId,
          conversationId: draft.conversationId,
          messageId,
          metadata: { notificationQueued: queued.rowCount ?? 0 },
        });
        return sent;
      });
      await processSecureNotificationOutbox(messageId).catch((error) => {
        console.error("[secure-dialog] notification outbox processing failed", error);
      });
      res.json(result);
    } catch (error) {
      routeError(res, "message send", error);
    }
  });

  app.get(
    "/api/secure-dialog/conversations/:conversationId/attachments/:attachmentId",
    ...common,
    async (req: Request, res: Response) => {
      try {
        const conversationId = uuidSchema.parse(req.params.conversationId);
        const attachmentId = uuidSchema.parse(req.params.attachmentId);
        const actor = await resolveSecureActor(req);
        const attachment = await withTransaction(async (client) => {
          const access = await loadConversationAccess(client, conversationId, actor);
          if (!access) throw new SecureDialogRouteError(404, "Vedlegg ikke funnet", "ATTACHMENT_NOT_FOUND");
          const { rows: [row] } = await client.query(
            `SELECT attachment.id, attachment.storage_key, attachment.original_name,
                    attachment.mime_type, attachment.size_bytes, attachment.checksum_sha256,
                    message.id AS message_id, message.status, message.sender_user_id
               FROM tidum_secure_message_attachments attachment
               JOIN tidum_secure_messages message ON message.id = attachment.message_id
              WHERE attachment.id = $1 AND message.conversation_id = $2
                AND (message.status = 'sent' OR message.sender_user_id = $3)`,
            [attachmentId, conversationId, actor.userId],
          );
          if (!row) throw new SecureDialogRouteError(404, "Vedlegg ikke funnet", "ATTACHMENT_NOT_FOUND");
          return { ...row, access };
        });
        const bytes = await downloadSecureDialogAttachment(String(attachment.storage_key));
        const checksum = createHash("sha256").update(bytes).digest("hex");
        if (checksum !== attachment.checksum_sha256) {
          throw new Error("ATTACHMENT_CHECKSUM_MISMATCH");
        }
        await withTransaction(async (client) => {
          await appendAudit(client, {
            kommuneId: attachment.access.kommuneId,
            actorUserId: actor.userId,
            actorKind: attachment.access.actorKind,
            action: "attachment_downloaded",
            partyId: attachment.access.partyId,
            conversationId,
            messageId: String(attachment.message_id),
            attachmentId,
          });
        });
        res.setHeader("Content-Type", attachment.mime_type);
        res.setHeader("Content-Disposition", `attachment; filename="${safeAttachmentName(attachment.original_name)}"`);
        res.send(bytes);
      } catch (error) {
        routeError(res, "attachment download", error);
      }
    },
  );

  app.post("/api/secure-dialog/conversations/:conversationId/close", ...common, async (req: Request, res: Response) => {
    try {
      const conversationId = uuidSchema.parse(req.params.conversationId);
      const actor = await resolveSecureActor(req);
      const kommuneId = requireStaff(actor);
      const result = await withTransaction(async (client) => {
        const { rows: [conversation] } = await client.query(
          `UPDATE tidum_secure_conversations
              SET status = 'closed', closed_by = $1, closed_at = NOW(), updated_at = NOW()
            WHERE id = $2 AND kommune_id = $3 AND status = 'open'
            RETURNING id, status, closed_at`,
          [actor.userId, conversationId, kommuneId],
        );
        if (!conversation) throw new SecureDialogRouteError(404, "Åpen samtale ikke funnet", "CONVERSATION_NOT_FOUND");
        await appendAudit(client, {
          kommuneId,
          actorUserId: actor.userId,
          actorKind: "staff",
          action: "conversation_closed",
          conversationId,
        });
        return conversation;
      });
      res.json(result);
    } catch (error) {
      routeError(res, "conversation close", error);
    }
  });

  app.get("/api/secure-dialog/conversations/:conversationId/audit", ...common, async (req: Request, res: Response) => {
    try {
      const conversationId = uuidSchema.parse(req.params.conversationId);
      const actor = await resolveSecureActor(req);
      const kommuneId = requireStaff(actor);
      const result = await withTransaction(async (client) => {
        const conversation = await client.query(
          `SELECT id FROM tidum_secure_conversations WHERE id = $1 AND kommune_id = $2`,
          [conversationId, kommuneId],
        );
        if (!conversation.rowCount) throw new SecureDialogRouteError(404, "Samtale ikke funnet", "CONVERSATION_NOT_FOUND");
        await appendAudit(client, {
          kommuneId,
          actorUserId: actor.userId,
          actorKind: "staff",
          action: "audit_viewed",
          conversationId,
        });
        const { rows } = await client.query(
          `SELECT id, actor_user_id, actor_kind, party_id, conversation_id, message_id,
                  attachment_id, action, metadata, created_at
             FROM tidum_secure_dialog_audit_events
            WHERE conversation_id = $1 AND kommune_id = $2
            ORDER BY created_at`,
          [conversationId, kommuneId],
        );
        return rows;
      });
      res.json(result);
    } catch (error) {
      routeError(res, "audit read", error);
    }
  });
}
