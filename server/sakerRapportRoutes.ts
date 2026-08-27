/**
 * server/sakerRapportRoutes.ts
 * 
 * Legg til i server/routes.ts:
 *   import { sakerRouter, rapportRouter } from "./sakerRapportRoutes";
 *   app.use("/api/saker",     sakerRouter);
 *   app.use("/api/rapporter", rapportRouter);
 */

import { Router } from "express";
import { db } from "./db";
import { eq, and, desc, inArray, sql, ilike, between, gte, lte, or } from "drizzle-orm";
import {
  saker, rapporter, rapportMaal, rapportAktiviteter,
  rapportKommentarer, rapportAuditLog,
  vendorTemplates, aktivitetMaler,
  vendorInstitutions, rapportTemplates,
  insertSakSchema, insertRapportSchema,
  insertMaalSchema, insertAktivitetSchema,
  logRow,
  sakJournal, sakJournalAttachments, insertSakJournalSchema,
} from "../shared/schema";
import { generateRapportPDF } from "./rapportGenerator";
import { emailService } from "./lib/email-service";
import { recordEmailPolicyBlock } from "./lib/email-channel-policy";
import { queueRapportArchiving, queueJournalEntryArchiving } from "./lib/archive/archive-service";
import { uploadJournalAttachment, downloadJournalAttachment, generateAttachmentKey } from "./lib/journal-attachment-storage";
import { users } from "../shared/schema";
import OpenAI from "openai";
import multer from "multer";

// ── HELPERS ───────────────────────────────────────────────────────────────────

function currentUser(req: any): any | null {
  return req.authUser ?? req.user ?? null;
}

function normalizeRole(role: unknown): string {
  return String(role ?? "").trim().toLowerCase().replace(/[\s-]/g, "_");
}

type SakRapportActor = {
  id: string;
  role: string;
  vendorId: number | null;
  isSuperAdmin: boolean;
};

function actorFromRequest(req: any): SakRapportActor | null {
  const identity = currentUser(req);
  const id = String(identity?.id ?? "").trim();
  if (!id) return null;
  const role = normalizeRole(identity?.role);
  const parsedVendorId = Number(identity?.vendorId);
  return {
    id,
    role,
    vendorId: Number.isInteger(parsedVendorId) && parsedVendorId > 0 ? parsedVendorId : null,
    isSuperAdmin: role === "super_admin",
  };
}

function requireAuth(req: any, res: any, next: any) {
  if (!actorFromRequest(req)) return res.status(401).json({ error: "Ikke innlogget" });
  next();
}

function requireRole(...roles: string[]) {
  const accepted = new Set(roles.map(normalizeRole));
  return (req: any, res: any, next: any) => {
    if (!accepted.has(actorFromRequest(req)?.role ?? ""))
      return res.status(403).json({ error: "Ikke tilgang" });
    next();
  };
}

function getUserVendorId(req: any): number | null {
  return actorFromRequest(req)?.vendorId ?? null;
}

const journalAttachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

function normalizedAssignees(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => String(item).trim()).filter(Boolean)));
}

function actorSharesVendor(actor: SakRapportActor, vendorId: number): boolean {
  return actor.vendorId != null && actor.vendorId === vendorId;
}

function actorCanReadSak(actor: SakRapportActor, sak: typeof saker.$inferSelect): boolean {
  if (actor.isSuperAdmin) return true;
  if (!actorSharesVendor(actor, sak.vendorId)) return false;
  return sak.tiltakslederId === actor.id || normalizedAssignees(sak.tildelteUserId).includes(actor.id);
}

function actorCanManageSak(actor: SakRapportActor, sak: typeof saker.$inferSelect): boolean {
  if (actor.isSuperAdmin) return true;
  if (!actorSharesVendor(actor, sak.vendorId)) return false;
  return ["vendor_admin", "tiltaksleder"].includes(actor.role) && sak.tiltakslederId === actor.id;
}

async function loadSak(sakId: string): Promise<typeof saker.$inferSelect | null> {
  const [sak] = await db.select().from(saker).where(eq(saker.id, sakId)).limit(1);
  return sak ?? null;
}

async function validateAssignees(vendorId: number, rawIds: unknown): Promise<string[] | null> {
  if (!Array.isArray(rawIds)) return null;
  const ids = normalizedAssignees(rawIds);
  if (ids.length !== rawIds.length || ids.length > 100) return null;
  if (ids.length === 0) return [];
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.vendorId, vendorId), inArray(users.id, ids)));
  return rows.length === ids.length ? ids : null;
}

async function institutionBelongsToVendor(institutionId: unknown, vendorId: number): Promise<boolean> {
  if (institutionId == null || institutionId === "") return true;
  const [row] = await db
    .select({ id: vendorInstitutions.id })
    .from(vendorInstitutions)
    .where(and(
      eq(vendorInstitutions.id, String(institutionId)),
      eq(vendorInstitutions.vendorId, vendorId),
    ))
    .limit(1);
  return row != null;
}

type RapportAccess = {
  actor: SakRapportActor;
  rapport: typeof rapporter.$inferSelect;
  sak: typeof saker.$inferSelect | null;
  canRead: boolean;
  canEdit: boolean;
  canReview: boolean;
};

async function resolveRapportAccess(req: any, rapportId: string): Promise<RapportAccess | null> {
  const actor = actorFromRequest(req);
  if (!actor) return null;
  const [rapport] = await db.select().from(rapporter).where(eq(rapporter.id, rapportId)).limit(1);
  if (!rapport) return null;
  const sak = rapport.sakId ? await loadSak(rapport.sakId) : null;
  if (actor.isSuperAdmin) return { actor, rapport, sak, canRead: true, canEdit: true, canReview: true };

  const isOwner = rapport.userId === actor.id;
  const isReviewer = rapport.tiltakslederId === actor.id;
  if (!rapport.sakId) {
    return {
      actor,
      rapport,
      sak: null,
      canRead: isOwner || isReviewer,
      canEdit: isOwner,
      canReview: isReviewer && ["vendor_admin", "tiltaksleder"].includes(actor.role),
    };
  }
  if (!sak || !actorSharesVendor(actor, sak.vendorId)) {
    return { actor, rapport, sak, canRead: false, canEdit: false, canReview: false };
  }
  const stillAssigned = normalizedAssignees(sak.tildelteUserId).includes(actor.id);
  return {
    actor,
    rapport,
    sak,
    canRead: (isOwner && stillAssigned) || isReviewer,
    canEdit: isOwner && stillAssigned,
    canReview: isReviewer && ["vendor_admin", "tiltaksleder"].includes(actor.role),
  };
}

async function vendorTemplateBelongsToVendor(templateId: unknown, vendorId: number): Promise<boolean> {
  if (templateId == null || templateId === "") return true;
  const [template] = await db
    .select({ id: vendorTemplates.id })
    .from(vendorTemplates)
    .where(and(eq(vendorTemplates.id, String(templateId)), eq(vendorTemplates.vendorId, vendorId)))
    .limit(1);
  return template != null;
}

async function rapportTemplateAvailableToVendor(templateId: unknown, vendorId: number): Promise<boolean> {
  if (templateId == null || templateId === "") return true;
  const [template] = await db
    .select({ id: rapportTemplates.id })
    .from(rapportTemplates)
    .where(and(
      eq(rapportTemplates.id, String(templateId)),
      eq(rapportTemplates.isActive, true),
      or(eq(rapportTemplates.vendorId, vendorId), sql`${rapportTemplates.vendorId} IS NULL`),
    ))
    .limit(1);
  return template != null;
}

async function validateRapportTemplates(
  actor: SakRapportActor,
  vendorId: number | null,
  templateId: unknown,
  rapportTemplateId: unknown,
): Promise<boolean> {
  if (actor.isSuperAdmin) return true;
  if (!vendorId) return templateId == null && rapportTemplateId == null;
  return (await vendorTemplateBelongsToVendor(templateId, vendorId))
    && (await rapportTemplateAvailableToVendor(rapportTemplateId, vendorId));
}

/** Samme sak-/tenanttilgang som rapporter: tildelt forfatter, sakens tiltaksleder eller super_admin. */
async function canAccessSakJournal(req: any, sakId: string): Promise<{ allowed: boolean; sak?: any }> {
  const actor = actorFromRequest(req);
  if (!actor) return { allowed: false };
  const sak = await loadSak(sakId);
  if (!sak) return { allowed: false };
  return actorCanReadSak(actor, sak) ? { allowed: true, sak } : { allowed: false };
}

/**
 * Append an event to the rapport audit log. Best-effort — never throws so
 * lifecycle endpoints don't break if logging fails.
 */
async function logRapportEvent(
  rapportId: string,
  req: any,
  eventType: string,
  eventLabel?: string,
  details: Record<string, any> = {},
): Promise<void> {
  try {
    const identity = currentUser(req);
    const userName = identity?.firstName || identity?.lastName
      ? [identity.firstName, identity.lastName].filter(Boolean).join(" ")
      : (identity?.name ?? identity?.email ?? null);
    await db.insert(rapportAuditLog).values({
      rapportId,
      userId: actorFromRequest(req)?.id ?? null,
      userName: userName ?? null,
      userRole: actorFromRequest(req)?.role ?? null,
      eventType,
      eventLabel: eventLabel ?? null,
      details,
    });
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
}

// ── SAKER ROUTER ──────────────────────────────────────────────────────────────

export const sakerRouter = Router();

/**
 * GET /api/saker
 * - Miljøarbeider (user):       Ser kun saker tildelt til dem
 * - Tiltaksleder (vendor_admin): Ser alle saker de har opprettet
 * - Super admin:                Ser alle saker
 */
async function enrichSaker(rows: any[]) {
  if (!rows.length) return rows;

  const institutionIds = Array.from(
    new Set(rows.map((r) => r.institutionId).filter(Boolean)),
  );
  const tiltakslederIds = Array.from(
    new Set(rows.map((r) => r.tiltakslederId).filter((v) => v != null)),
  );

  const [instRows, lederRows] = await Promise.all([
    institutionIds.length
      ? db
          .select({ id: vendorInstitutions.id, name: vendorInstitutions.name, vendorId: vendorInstitutions.vendorId })
          .from(vendorInstitutions)
          .where(inArray(vendorInstitutions.id, institutionIds as string[]))
      : Promise.resolve([] as { id: string; name: string; vendorId: number }[]),
    tiltakslederIds.length
      ? db
          .select({
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
            email: users.email,
            vendorId: users.vendorId,
          })
          .from(users)
          .where(inArray(users.id, tiltakslederIds as any))
      : Promise.resolve([] as any[]),
  ]);

  const instName = new Map(instRows.map((i) => [i.id, { name: i.name, vendorId: i.vendorId }]));
  const lederName = new Map(
    lederRows.map((u) => [
      String(u.id),
      {
        name: [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email || "",
        email: u.email ?? null,
        vendorId: u.vendorId,
      },
    ]),
  );

  return rows.map((r) => {
    const institution = r.institutionId ? instName.get(r.institutionId) : null;
    const leader = r.tiltakslederId != null ? lederName.get(String(r.tiltakslederId)) : null;
    return {
      ...r,
      institutionName: institution && institution.vendorId === r.vendorId ? institution.name : null,
      tiltakslederName: leader && leader.vendorId === r.vendorId ? leader.name : null,
      tiltakslederEmail: leader && leader.vendorId === r.vendorId ? leader.email : null,
    };
  });
}

// Roller uten særskilt eierskap til en sak — ser kun saker de faktisk er
// tildelt (tildelte_user_id), samme som den opprinnelige "user"-grenen.
const SAK_STAFF_ROLES = new Set(["user", "member", "miljoarbeider", "case_manager", "teamleder", "prototype_tester"]);
// Roller som kan eie/lede saker — ser saker der de er satt som tiltaksleder_id.
const SAK_OWNER_ROLES = new Set(["vendor_admin", "tiltaksleder"]);

sakerRouter.get("/", requireAuth, async (req: any, res) => {
  try {
    const actor = actorFromRequest(req)!;

    if (actor.isSuperAdmin) {
      const rows = await db.select().from(saker).orderBy(desc(saker.createdAt));
      return res.json(await enrichSaker(rows));
    }
    if (!actor.vendorId) return res.json([]);

    if (SAK_OWNER_ROLES.has(actor.role)) {
      const rows = await db
        .select()
        .from(saker)
        .where(and(
          eq(saker.vendorId, actor.vendorId),
          eq(saker.tiltakslederId, actor.id),
        ))
        .orderBy(desc(saker.createdAt));
      return res.json(await enrichSaker(rows));
    }

    if (SAK_STAFF_ROLES.has(actor.role)) {
      // Saker der aktørens tekst-ID er i tildelte_user_id-arrayet.
      const rows = await db
        .select()
        .from(saker)
        .where(
          and(
            eq(saker.vendorId, actor.vendorId),
            sql`${saker.tildelteUserId} @> ${JSON.stringify([actor.id])}::jsonb`
          )
        )
        .orderBy(desc(saker.createdAt));
      return res.json(await enrichSaker(rows));
    }

    // Ukjent/uhåndtert rolle: fail-closed, ikke fall gjennom til
    // "se alt" slik super_admin-grenen implisitt gjorde tidligere.
    return res.json([]);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/**
 * POST /api/saker
 * Kun tiltaksleder og super_admin
 */
sakerRouter.post(
  "/",
  requireAuth,
  requireRole("vendor_admin", "tiltaksleder", "super_admin"),
  async (req: any, res) => {
    try {
      const actor = actorFromRequest(req)!;
      const requestedVendorId = Number(req.body?.vendorId);
      const vendorId = actor.isSuperAdmin
        ? (Number.isInteger(requestedVendorId) && requestedVendorId > 0 ? requestedVendorId : null)
        : actor.vendorId;
      const tiltakslederId = actor.isSuperAdmin
        ? String(req.body?.tiltakslederId ?? "").trim()
        : actor.id;
      if (!vendorId || !tiltakslederId) {
        return res.status(400).json({ error: "Saken krever entydig vendor og tiltaksleder" });
      }
      if (actor.isSuperAdmin && !(await validateAssignees(vendorId, [tiltakslederId]))) {
        return res.status(400).json({ error: "Tiltakslederen tilhører ikke valgt vendor" });
      }
      if (!(await institutionBelongsToVendor(req.body?.institutionId, vendorId))) {
        return res.status(400).json({ error: "Institusjonen tilhører ikke valgt vendor" });
      }
      const assigned = req.body?.tildelteUserId === undefined
        ? []
        : await validateAssignees(vendorId, req.body.tildelteUserId);
      if (!assigned) return res.status(400).json({ error: "En eller flere tildelte brukere tilhører ikke valgt vendor" });
      const data = insertSakSchema.parse({
        saksnummer: req.body?.saksnummer,
        tittel: req.body?.tittel,
        klientRef: req.body?.klientRef,
        oppdragsgiver: req.body?.oppdragsgiver,
        institutionId: req.body?.institutionId || null,
        tiltakstype: req.body?.tiltakstype,
        status: req.body?.status,
        startDato: req.body?.startDato,
        sluttDato: req.body?.sluttDato,
        beskrivelse: req.body?.beskrivelse,
        ekstraFelter: req.body?.ekstraFelter,
        tildelteUserId: assigned,
        vendorId,
        tiltakslederId,
      });
      const [sak] = await db.insert(saker).values(data).returning();
      res.json(sak);
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  }
);

/**
 * PATCH /api/saker/:id
 * Oppdater saksmetadata. Tildeling går alltid gjennom /:id/tildel.
 */
sakerRouter.patch(
  "/:id",
  requireAuth,
  requireRole("vendor_admin", "tiltaksleder", "super_admin"),
  async (req: any, res) => {
    try {
      const actor = actorFromRequest(req)!;
      const existing = await loadSak(req.params.id);
      if (!existing || !actorCanManageSak(actor, existing)) {
        return res.status(404).json({ error: "Ikke funnet" });
      }
      if (!(await institutionBelongsToVendor(req.body?.institutionId, existing.vendorId))) {
        return res.status(400).json({ error: "Institusjonen tilhører ikke sakens vendor" });
      }
      const allowedFields = [
        "saksnummer", "tittel", "klientRef", "oppdragsgiver", "institutionId",
        "tiltakstype", "status", "startDato", "sluttDato", "beskrivelse", "ekstraFelter",
      ];
      const candidate = Object.fromEntries(
        allowedFields.filter((field) => Object.prototype.hasOwnProperty.call(req.body ?? {}, field))
          .map((field) => [field, req.body[field]]),
      );
      const parsed = insertSakSchema.partial().parse(candidate);
      if (Object.keys(parsed).length === 0) return res.status(400).json({ error: "Ingen gyldige felter å oppdatere" });
      const [sak] = await db
        .update(saker)
        .set({ ...parsed, updatedAt: new Date() })
        .where(and(eq(saker.id, req.params.id), eq(saker.vendorId, existing.vendorId)))
        .returning();
      if (!sak) return res.status(404).json({ error: "Ikke funnet" });
      res.json(sak);
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  }
);

/**
 * POST /api/saker/:id/tildel
 * Tildel sak til en eller flere brukere
 */
sakerRouter.post(
  "/:id/tildel",
  requireAuth,
  requireRole("vendor_admin", "tiltaksleder", "super_admin"),
  async (req: any, res) => {
    try {
      const actor = actorFromRequest(req)!;
      const existing = await loadSak(req.params.id);
      if (!existing || !actorCanManageSak(actor, existing)) {
        return res.status(404).json({ error: "Ikke funnet" });
      }
      const userIds = await validateAssignees(existing.vendorId, req.body?.userIds);
      if (!userIds) return res.status(400).json({ error: "Alle tildelte brukere må tilhøre sakens vendor" });
      const [updated] = await db
        .update(saker)
        .set({ tildelteUserId: userIds, updatedAt: new Date() })
        .where(and(eq(saker.id, req.params.id), eq(saker.vendorId, existing.vendorId)))
        .returning();
      if (!updated) return res.status(404).json({ error: "Ikke funnet" });
      res.json(updated);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  }
);

/**
 * POST /api/saker/:id/journal
 * Opprett en ny, uforanderlig journaloppføring på saken.
 */
sakerRouter.post("/:id/journal", requireAuth, async (req: any, res) => {
  try {
    const { allowed, sak } = await canAccessSakJournal(req, req.params.id);
    if (!sak || !allowed) return res.status(404).json({ error: "Sak ikke funnet" });

    if (req.body.correctsEntryId) {
      const [original] = await db.select().from(sakJournal).where(eq(sakJournal.id, req.body.correctsEntryId)).limit(1);
      if (!original || original.sakId !== sak.id) {
        return res.status(400).json({ error: "correctsEntryId peker ikke på en gyldig oppføring på denne saken" });
      }
    }

    const data = insertSakJournalSchema.parse({
      sakId: sak.id,
      userId: actorFromRequest(req)!.id,
      content: req.body.content,
      correctsEntryId: req.body.correctsEntryId ?? null,
    });
    const [entry] = await db.insert(sakJournal).values(data).returning();

    queueJournalEntryArchiving(entry.id).catch((err) =>
      console.error(`[journal] arkivering feilet for ${entry.id}:`, err?.message ?? err),
    );

    res.status(201).json(entry);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/**
 * GET /api/saker/:id/journal
 * List alle journaloppføringer på saken, kronologisk.
 */
sakerRouter.get("/:id/journal", requireAuth, async (req: any, res) => {
  try {
    const { allowed, sak } = await canAccessSakJournal(req, req.params.id);
    if (!sak || !allowed) return res.status(404).json({ error: "Sak ikke funnet" });

    const entries = await db
      .select()
      .from(sakJournal)
      .where(eq(sakJournal.sakId, sak.id))
      .orderBy(sakJournal.createdAt);
    res.json(entries);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/**
 * GET /api/saker/:id/journal/:entryId/attachments
 * List alle vedlegg på én journaloppføring.
 */
sakerRouter.get("/:id/journal/:entryId/attachments", requireAuth, async (req: any, res) => {
  try {
    const { allowed, sak } = await canAccessSakJournal(req, req.params.id);
    if (!sak || !allowed) return res.status(404).json({ error: "Sak ikke funnet" });

    const [entry] = await db.select().from(sakJournal).where(eq(sakJournal.id, req.params.entryId)).limit(1);
    if (!entry || entry.sakId !== sak.id) return res.status(404).json({ error: "Journaloppføring ikke funnet" });

    const attachments = await db
      .select()
      .from(sakJournalAttachments)
      .where(eq(sakJournalAttachments.journalEntryId, entry.id));
    res.json(attachments);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/**
 * POST /api/saker/:id/journal/:entryId/attachments
 * Last opp ett vedlegg til en eksisterende journaloppføring.
 */
sakerRouter.post(
  "/:id/journal/:entryId/attachments",
  requireAuth,
  journalAttachmentUpload.single("file"),
  async (req: any, res) => {
    try {
      const { allowed, sak } = await canAccessSakJournal(req, req.params.id);
      if (!sak || !allowed) return res.status(404).json({ error: "Sak ikke funnet" });
      if (!req.file) return res.status(400).json({ error: 'Ingen fil mottatt (feltnavn må være "file")' });

      const [entry] = await db.select().from(sakJournal).where(eq(sakJournal.id, req.params.entryId)).limit(1);
      if (!entry || entry.sakId !== sak.id) return res.status(404).json({ error: "Journaloppføring ikke funnet" });

      const key = generateAttachmentKey(entry.id, req.file.originalname);
      await uploadJournalAttachment(key, req.file.buffer, req.file.mimetype);

      const [attachment] = await db
        .insert(sakJournalAttachments)
        .values({
          journalEntryId: entry.id,
          filename: key,
          originalName: req.file.originalname,
          mimeType: req.file.mimetype,
          sizeBytes: req.file.size,
          uploadedBy: actorFromRequest(req)!.id,
        })
        .returning();

      res.status(201).json(attachment);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  },
);

/**
 * GET /api/saker/:id/journal/:entryId/attachments/:attachmentId
 * Last ned ett vedlegg — proxy fra S3, samme tilgangssjekk som journalen selv.
 */
sakerRouter.get(
  "/:id/journal/:entryId/attachments/:attachmentId",
  requireAuth,
  async (req: any, res) => {
    try {
      const { allowed, sak } = await canAccessSakJournal(req, req.params.id);
      if (!sak || !allowed) return res.status(404).json({ error: "Sak ikke funnet" });

      const [entry] = await db.select().from(sakJournal).where(eq(sakJournal.id, req.params.entryId)).limit(1);
      if (!entry || entry.sakId !== sak.id) return res.status(404).json({ error: "Journaloppføring ikke funnet" });

      const [attachment] = await db
        .select()
        .from(sakJournalAttachments)
        .where(eq(sakJournalAttachments.id, req.params.attachmentId))
        .limit(1);
      if (!attachment || attachment.journalEntryId !== entry.id) {
        return res.status(404).json({ error: "Vedlegg ikke funnet" });
      }

      const bytes = await downloadJournalAttachment(attachment.filename);
      const safeFilename = attachment.originalName.replace(/[^a-zA-Z0-9åæøÅÆØ._-]+/g, "_");
      res.setHeader("Content-Type", attachment.mimeType);
      res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}"`);
      res.send(bytes);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  },
);

/**
 * DELETE /api/saker/:id
 */
sakerRouter.delete(
  "/:id",
  requireAuth,
  requireRole("vendor_admin", "tiltaksleder", "super_admin"),
  async (req: any, res) => {
    try {
      const actor = actorFromRequest(req)!;
      const existing = await loadSak(req.params.id);
      if (!existing || !actorCanManageSak(actor, existing)) {
        return res.status(404).json({ error: "Ikke funnet" });
      }
      const [deleted] = await db
        .delete(saker)
        .where(and(eq(saker.id, req.params.id), eq(saker.vendorId, existing.vendorId)))
        .returning({ id: saker.id });
      if (!deleted) return res.status(404).json({ error: "Ikke funnet" });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  }
);

// ── RAPPORTER ROUTER ──────────────────────────────────────────────────────────

export const rapportRouter = Router();

/**
 * GET /api/rapporter
 * Basert på rolle
 */
rapportRouter.get("/", requireAuth, async (req: any, res) => {
  try {
    const actor = actorFromRequest(req)!;
    if (actor.isSuperAdmin) {
      const rows = await db.select().from(rapporter).orderBy(desc(rapporter.createdAt));
      return res.json(rows);
    }
    const candidates = await db
      .select()
      .from(rapporter)
      .where(or(eq(rapporter.userId, actor.id), eq(rapporter.tiltakslederId, actor.id)))
      .orderBy(desc(rapporter.createdAt));
    const allowed: typeof candidates = [];
    for (const candidate of candidates) {
      const access = await resolveRapportAccess(req, candidate.id);
      if (access?.canRead) allowed.push(candidate);
    }
    return res.json(allowed);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── VENDOR TEMPLATES (must be before /:id param routes) ──────────────────────

rapportRouter.get("/templates/mine", requireAuth, async (req: any, res) => {
  try {
    const vendorId = getUserVendorId(req);
    if (!vendorId) return res.json([]);
    const rows = await db
      .select()
      .from(vendorTemplates)
      .where(eq(vendorTemplates.vendorId, vendorId))
      .orderBy(desc(vendorTemplates.updatedAt));
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

rapportRouter.post(
  "/templates",
  requireAuth,
  requireRole("vendor_admin", "super_admin"),
  async (req: any, res) => {
    try {
      const vendorId = getUserVendorId(req);
      if (!vendorId) return res.status(403).json({ error: "Bruker mangler vendortilknytning" });
      const editableFields = ["navn", "status", "branding", "feltKonfig", "seksjoner", "tekster", "gdprEnabled"];
      const input = Object.fromEntries(
        editableFields.filter((field) => Object.prototype.hasOwnProperty.call(req.body ?? {}, field))
          .map((field) => [field, req.body[field]]),
      );
      const [t] = await db
        .insert(vendorTemplates)
        .values({ ...input, vendorId })
        .returning();
      res.json(t);
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  }
);

rapportRouter.patch(
  "/templates/:id",
  requireAuth,
  requireRole("vendor_admin", "super_admin"),
  async (req: any, res) => {
    try {
      const actor = actorFromRequest(req)!;
      const vendorId = actor.vendorId;
      if (!actor.isSuperAdmin && !vendorId) return res.status(403).json({ error: "Bruker mangler vendortilknytning" });
      const where = actor.isSuperAdmin
        ? eq(vendorTemplates.id, req.params.id)
        : and(eq(vendorTemplates.id, req.params.id), eq(vendorTemplates.vendorId, vendorId!));
      const editableFields = ["navn", "status", "branding", "feltKonfig", "seksjoner", "tekster", "gdprEnabled"];
      const input = Object.fromEntries(
        editableFields.filter((field) => Object.prototype.hasOwnProperty.call(req.body ?? {}, field))
          .map((field) => [field, req.body[field]]),
      );
      if (Object.keys(input).length === 0) {
        return res.status(400).json({ error: "Ingen gyldige felter å oppdatere" });
      }
      const [t] = await db
        .update(vendorTemplates)
        .set({ ...input, updatedAt: new Date() })
        .where(where)
        .returning();
      if (!t) return res.status(404).json({ error: "Ikke funnet" });
      res.json(t);
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  }
);

// ── AKTIVITET-MALER (templates) ──────────────────────────────────────────────
// Must be registered BEFORE /:id to avoid Express matching "aktivitet-maler" as :id

rapportRouter.get("/aktivitet-maler", requireAuth, async (req: any, res) => {
  try {
    const actor = actorFromRequest(req)!;
    const rows = await db
      .select()
      .from(aktivitetMaler)
      .where(eq(aktivitetMaler.userId, actor.id))
      .orderBy(desc(aktivitetMaler.brukAntall));
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

rapportRouter.post("/aktivitet-maler", requireAuth, async (req: any, res) => {
  try {
    const actor = actorFromRequest(req)!;
    const { navn, type, beskrivelse, sted, klientRef, varighetMin } = req.body;
    if (!navn?.trim() || !beskrivelse?.trim()) return res.status(400).json({ error: "Navn og beskrivelse er påkrevd" });
    const [row] = await db
      .insert(aktivitetMaler)
      .values({ userId: actor.id, navn, type, beskrivelse, sted, klientRef, varighetMin })
      .returning();
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

rapportRouter.delete("/aktivitet-maler/:malId", requireAuth, async (req: any, res) => {
  try {
    const actor = actorFromRequest(req)!;
    await db.delete(aktivitetMaler).where(and(eq(aktivitetMaler.id, req.params.malId), eq(aktivitetMaler.userId, actor.id)));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

rapportRouter.post("/aktivitet-maler/:malId/bruk", requireAuth, async (req: any, res) => {
  try {
    const actor = actorFromRequest(req)!;
    await db
      .update(aktivitetMaler)
      .set({ brukAntall: sql`${aktivitetMaler.brukAntall} + 1`, sistBrukt: new Date() })
      .where(and(eq(aktivitetMaler.id, req.params.malId), eq(aktivitetMaler.userId, actor.id)));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── ML AKTIVITETSFORSLAG ────────────────────────────────────────────────────

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

rapportRouter.post("/aktivitet-forslag", requireAuth, async (req: any, res) => {
  try {
    const actor = actorFromRequest(req)!;
    const { tekst, type, sted } = req.body;
    if (!tekst || tekst.length < 2) return res.json({ forslag: [] });

    // Hent brukerens siste 50 unike aktivitetsbeskrivelser
    const historikk = await db
      .selectDistinctOn([rapportAktiviteter.beskrivelse], {
        beskrivelse: rapportAktiviteter.beskrivelse,
        type: rapportAktiviteter.type,
        sted: rapportAktiviteter.sted,
      })
      .from(rapportAktiviteter)
      .innerJoin(rapporter, eq(rapporter.id, rapportAktiviteter.rapportId))
      .where(eq(rapporter.userId, actor.id))
      .orderBy(rapportAktiviteter.beskrivelse, desc(rapportAktiviteter.createdAt))
      .limit(50);

    // Enkel prefix-match fra historikk (alltid tilgjengelig, uansett AI)
    const prefixMatches = historikk
      .filter((h) => h.beskrivelse.toLowerCase().startsWith(tekst.toLowerCase()))
      .slice(0, 5)
      .map((h) => ({ tekst: h.beskrivelse, type: h.type, sted: h.sted, kilde: "historikk" as const }));

    // Fuzzy/semantic forslag via OpenAI hvis tilgjengelig
    let aiForslag: { tekst: string; type?: string; sted?: string; kilde: "ai" }[] = [];
    if (openai && tekst.length >= 4) {
      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          temperature: 0.3,
          max_tokens: 300,
          messages: [
            {
              role: "system",
              content: `Du er en assistent for miljøarbeidere i barnevernet som skriver månedsrapporter.
Basert på brukerens skrivemønster og kontekst, foreslå fullstendige aktivitetsbeskrivelser.
VIKTIG: Aldri inkluder navn, fødselsdatoer eller personopplysninger. Bruk "ungdommen", "brukeren" osv.
Svar som JSON-array med maks 3 objekter: [{"tekst":"...","type":"aktivitet|klientmøte|...","sted":"..."}]
Bare JSON, ingen annen tekst.`,
            },
            {
              role: "user",
              content: `Brukerens tidligere aktiviteter:\n${historikk.map((h) => `- ${h.beskrivelse}`).join("\n")}

Brukeren skriver nå: "${tekst}"${type ? `\nType: ${type}` : ""}${sted ? `\nSted: ${sted}` : ""}

Foreslå 3 fullstendige aktivitetsbeskrivelser som passer til det brukeren skriver:`,
            },
          ],
        });

        const raw = completion.choices[0]?.message?.content?.trim();
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            aiForslag = parsed.slice(0, 3).map((f: any) => ({
              tekst: String(f.tekst ?? ""),
              type: f.type,
              sted: f.sted,
              kilde: "ai" as const,
            }));
          }
        }
      } catch {
        // AI-forslag er best-effort, feil ignoreres
      }
    }

    // Dedupliser: prefix-match først, deretter AI
    const sett = new Set(prefixMatches.map((f) => f.tekst.toLowerCase()));
    const forslag = [
      ...prefixMatches,
      ...aiForslag.filter((f) => !sett.has(f.tekst.toLowerCase())),
    ].slice(0, 6);

    res.json({ forslag });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// Register static bulk paths before /:id/* so Express cannot interpret
// "bulk" as a report UUID parameter.
rapportRouter.post(
  "/bulk/godkjenn",
  requireAuth,
  requireRole("vendor_admin", "tiltaksleder", "super_admin"),
  bulkGodkjennHandler,
);
rapportRouter.post(
  "/bulk/returner",
  requireAuth,
  requireRole("vendor_admin", "tiltaksleder", "super_admin"),
  bulkReturnerHandler,
);

/**
 * GET /api/rapporter/:id
 */
rapportRouter.get("/:id", requireAuth, async (req: any, res) => {
  try {
    const access = await resolveRapportAccess(req, req.params.id);
    if (!access?.canRead) return res.status(404).json({ error: "Ikke funnet" });
    res.json(access.rapport);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/**
 * POST /api/rapporter
 * Opprett ny rapport (kobles til sak via sakId)
 */
rapportRouter.post("/", requireAuth, async (req: any, res) => {
  try {
    const actor = actorFromRequest(req)!;
    const sakId = req.body.sakId;
    let tiltakslederId: string | null = null;
    let rapportVendorId = actor.vendorId;
    if (sakId) {
      const sak = await loadSak(String(sakId));
      if (!sak || !actorCanReadSak(actor, sak)) return res.status(404).json({ error: "Sak ikke funnet" });
      tiltakslederId = sak.tiltakslederId;
      rapportVendorId = sak.vendorId;
    } else if (req.body?.tiltakslederId != null) {
      const requestedReviewer = String(req.body.tiltakslederId).trim();
      if (!actor.vendorId || !(await validateAssignees(actor.vendorId, [requestedReviewer]))) {
        return res.status(400).json({ error: "Tiltakslederen tilhører ikke brukerens vendor" });
      }
      tiltakslederId = requestedReviewer;
    }

    if (!(await validateRapportTemplates(actor, rapportVendorId, req.body?.templateId, req.body?.rapportTemplateId))) {
      return res.status(404).json({ error: "Rapportmal ikke funnet" });
    }

    const editableFields = [
      "sakId", "templateId", "rapportTemplateId", "konsulent", "tiltak", "bedrift",
      "oppdragsgiver", "klientRef", "periodeFrom", "periodeTo", "innledning",
      "avslutning", "dynamiskeFelter", "signaturer",
    ];
    const input = Object.fromEntries(
      editableFields.filter((field) => Object.prototype.hasOwnProperty.call(req.body ?? {}, field))
        .map((field) => [field, req.body[field]]),
    );
    const data = insertRapportSchema.parse({
      ...input,
      sakId: sakId || null,
      userId: actor.id,
      tiltakslederId,
    });
    const [rapport] = await db.insert(rapporter).values(data).returning();
    await logRapportEvent(rapport.id, req, "created", "Rapport opprettet", { sakId: rapport.sakId });
    res.json(rapport);
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

/**
 * PATCH /api/rapporter/:id — auto-save
 */
rapportRouter.patch("/:id", requireAuth, async (req: any, res) => {
  try {
    const access = await resolveRapportAccess(req, req.params.id);
    if (!access?.canEdit) return res.status(404).json({ error: "Ikke funnet" });

    // Whitelist updatable fields — prevent clients from overwriting userId,
    // status, timestamps, review state, etc.
    const ALLOWED = [
      'sakId', 'konsulent', 'tiltak', 'bedrift', 'oppdragsgiver', 'klientRef',
      'periodeFrom', 'periodeTo', 'innledning', 'avslutning',
      'rapportTemplateId', 'dynamiskeFelter', 'templateId', 'signaturer',
    ];
    const candidate: Record<string, unknown> = {};
    for (const k of ALLOWED) {
      if (Object.prototype.hasOwnProperty.call(req.body ?? {}, k)) candidate[k] = req.body[k];
    }
    if (Object.keys(candidate).length === 0) return res.status(400).json({ error: "Ingen gyldige felter å oppdatere" });
    const updates: Record<string, unknown> = {
      ...insertRapportSchema.partial().parse(candidate),
      updatedAt: new Date(),
    };
    if (Object.prototype.hasOwnProperty.call(updates, "sakId")) {
      if (updates.sakId) {
        const targetSak = await loadSak(String(updates.sakId));
        if (!targetSak || !actorCanReadSak(access.actor, targetSak)) {
          return res.status(404).json({ error: "Sak ikke funnet" });
        }
        updates.sakId = targetSak.id;
        updates.tiltakslederId = targetSak.tiltakslederId;
      } else {
        updates.sakId = null;
        updates.tiltakslederId = null;
      }
    }

    const targetVendorId = updates.sakId
      ? (await loadSak(String(updates.sakId)))?.vendorId ?? null
      : access.sak?.vendorId ?? access.actor.vendorId;
    const templateId = Object.prototype.hasOwnProperty.call(updates, "templateId")
      ? updates.templateId
      : access.rapport.templateId;
    const rapportTemplateId = Object.prototype.hasOwnProperty.call(updates, "rapportTemplateId")
      ? updates.rapportTemplateId
      : access.rapport.rapportTemplateId;
    if (!(await validateRapportTemplates(access.actor, targetVendorId, templateId, rapportTemplateId))) {
      return res.status(404).json({ error: "Rapportmal ikke funnet" });
    }

    const [updated] = await db
      .update(rapporter)
      .set(updates)
      .where(and(eq(rapporter.id, req.params.id), eq(rapporter.userId, access.actor.id)))
      .returning();
    if (!updated) return res.status(404).json({ error: "Ikke funnet" });
    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

/**
 * POST /api/rapporter/:id/send
 * Send til godkjenning
 *
 * Guards:
 *   1. If rapporten tilhører en sak, må bruker fortsatt være tildelt den.
 *      (Tiltaksleder kan ha fjernet vedkommende mellom utkast og innsending.)
 *   2. Hvis rapporten er returnert må miljøarbeider ha bekreftet tilbakemeldingen
 *      (feedbackAcknowledgedAt satt) før den kan sendes på nytt.
 */
rapportRouter.post("/:id/send", requireAuth, async (req: any, res) => {
  try {
    const actor = actorFromRequest(req)!;
    const access = await resolveRapportAccess(req, req.params.id);
    if (!access?.canRead || access.rapport.userId !== actor.id) {
      return res.status(404).json({ error: "Ikke funnet" });
    }
    // Fetch current rapport to run checks before update
    const [current] = await db
      .select()
      .from(rapporter)
      .where(and(eq(rapporter.id, req.params.id), eq(rapporter.userId, actor.id)))
      .limit(1);
    if (!current) return res.status(404).json({ error: "Ikke funnet" });

    // Guard 1: still assigned to sak?
    if (current.sakId) {
      const [sak] = await db.select().from(saker).where(eq(saker.id, current.sakId)).limit(1);
      const tildelt = normalizedAssignees(sak?.tildelteUserId);
      if (!sak || !actorSharesVendor(actor, sak.vendorId) || !tildelt.includes(actor.id)) {
        return res.status(403).json({
          error: "Du er ikke lenger tildelt denne saken. Kontakt tiltaksleder.",
          code: "sak_unassigned",
        });
      }
    }

    // Guard 2: returnert rapport krever acknowledgment
    if (current.status === "returnert" && !current.feedbackAcknowledgedAt) {
      return res.status(409).json({
        error: "Du må først bekrefte at du har lest tilbakemeldingen.",
        code: "feedback_not_acknowledged",
      });
    }

    const [updated] = await db
      .update(rapporter)
      .set({ status: "til_godkjenning", innsendt: new Date(), updatedAt: new Date() })
      .where(and(eq(rapporter.id, req.params.id), eq(rapporter.userId, actor.id)))
      .returning();
    if (!updated) return res.status(404).json({ error: "Ikke funnet" });

    await logRapportEvent(updated.id, req, "submitted", "Sendt til godkjenning");

    // Send email to tiltaksleder
    if (updated.tiltakslederId) {
      try {
        const [leder] = await db.select().from(users).where(eq(users.id, String(updated.tiltakslederId))).limit(1);
        if (leder?.email) {
          const periode = updated.periodeFrom
            ? new Date(updated.periodeFrom).toLocaleDateString("nb-NO", { month: "long", year: "numeric" })
            : "ukjent periode";
          await emailService.sendRapportSubmittedEmail({
            to: leder.email,
            tiltakslederName: [leder.firstName, leder.lastName].filter(Boolean).join(" ") || "Tiltaksleder",
            konsulentName: updated.konsulent ?? currentUser(req)?.name ?? "Konsulent",
            periode,
            rapportId: updated.id,
          });
        }
      } catch (emailErr) {
        console.error("Failed to send rapport submitted email:", emailErr);
      }
    }

    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/**
 * POST /api/rapporter/:id/godkjenn
 */
rapportRouter.post(
  "/:id/godkjenn",
  requireAuth,
  requireRole("vendor_admin", "tiltaksleder", "super_admin"),
  async (req: any, res) => {
    try {
      const access = await resolveRapportAccess(req, req.params.id);
      if (!access?.canReview) return res.status(404).json({ error: "Ikke funnet" });
      const actor = access.actor;
      const { signatureDataUri, kommentar } = req.body;
      const kommentarText = kommentar == null ? null : String(kommentar).trim().slice(0, 5000);
      if (signatureDataUri != null && (
        typeof signatureDataUri !== "string"
        || !signatureDataUri.startsWith("data:image/")
        || signatureDataUri.length > 2_000_000
      )) {
        return res.status(400).json({ error: "Ugyldig signaturdata" });
      }
      const [updated] = await db
        .update(rapporter)
        .set({
          status: "godkjent",
          godkjent: new Date(),
          reviewedAt: new Date(),
          reviewedBy: actor.id,
          updatedAt: new Date(),
        })
        .where(actor.isSuperAdmin
          ? and(eq(rapporter.id, req.params.id), eq(rapporter.status, "til_godkjenning"))
          : and(
              eq(rapporter.id, req.params.id),
              eq(rapporter.status, "til_godkjenning"),
              eq(rapporter.tiltakslederId, actor.id),
            ))
        .returning();
      if (!updated) return res.status(404).json({ error: "Ikke funnet" });

      await logRapportEvent(updated.id, req, "approved", "Godkjent", { kommentar: kommentarText });

      if (kommentarText) {
        await db.insert(rapportKommentarer).values({
          rapportId: req.params.id,
          fromUserId: actor.id,
          tekst: kommentarText,
        });
      }

      if (signatureDataUri) {
        const current = (updated.signaturer as any[]) ?? [];
        await db.update(rapporter).set({
          signaturer: [...current, {
            slot: 2, name: currentUser(req)?.name ?? "Tiltaksleder",
            role: "Tiltaksleder", date: new Date().toISOString(),
            dataUri: signatureDataUri,
          }],
        }).where(eq(rapporter.id, req.params.id));
      }

      // Notify miljøarbeider
      try {
        const [worker] = await db.select().from(users).where(eq(users.id, String(updated.userId))).limit(1);
        if (worker?.email) {
          const periode = updated.periodeFrom
            ? new Date(updated.periodeFrom).toLocaleDateString("nb-NO", { month: "long", year: "numeric" })
            : "ukjent periode";
          await emailService.sendRapportApprovedEmail({
            to: worker.email,
            konsulentName: updated.konsulent ?? [worker.firstName, worker.lastName].filter(Boolean).join(" ") ?? "Konsulent",
            periode,
            tiltakslederName: currentUser(req)?.name ?? "Tiltaksleder",
            kommentar: kommentarText ?? undefined,
          });
        }
      } catch (emailErr) {
        console.error("Failed to send rapport approved email:", emailErr);
      }

      // Auto-forward PDF to institution oppdragsgiver if configured
      try {
        await maybeForwardRapportToInstitution(updated.id);
      } catch (forwardErr) {
        console.error("Failed to auto-forward rapport:", forwardErr);
      }

      // Noark 5-arkivering hvis vendoren har arkivintegrasjon (best-effort;
      // outbox + cron håndterer feil og retry).
      queueRapportArchiving(updated.id, "approved", actor.id).catch((archiveErr) =>
        console.error("Failed to queue rapport archiving:", archiveErr),
      );

      res.json(updated);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  }
);

/**
 * If the rapport's sak is linked to an institution with autoForwardRapport = true,
 * generate the PDF and email it to the institution's forwardEmail.
 * Best-effort: errors are logged, never bubble up to break the approve flow.
 */
async function maybeForwardRapportToInstitution(rapportId: string): Promise<void> {
  const [rapport] = await db.select().from(rapporter).where(eq(rapporter.id, rapportId)).limit(1);
  if (!rapport?.sakId) return;

  const [sak] = await db.select().from(saker).where(eq(saker.id, rapport.sakId)).limit(1);
  if (!sak?.institutionId) return;

  const [institution] = await db
    .select()
    .from(vendorInstitutions)
    .where(and(
      eq(vendorInstitutions.id, sak.institutionId),
      eq(vendorInstitutions.vendorId, sak.vendorId),
    ))
    .limit(1);
  if (!institution?.autoForwardRapport || !institution.forwardEmail) return;

  // Approved reports are sensitive case documents. Keep the legacy setting
  // visible, but fail closed until portal/SvarUt dispatch replaces SMTP.
  await recordEmailPolicyBlock({
    actorUserId: null,
    vendorId: sak.vendorId,
    kommuneId: null,
    route: 'rapport-auto-forward',
    purpose: 'sensitive_case_content',
    reasonCode: 'SENSITIVE_CASE_CONTENT',
    metadata: { institutionId: institution.id, rapportId },
  });
  await db.insert(rapportAuditLog).values({
    rapportId,
    userId: null,
    userName: "Tidum (system)",
    userRole: "system",
    eventType: "auto_forward_blocked",
    eventLabel: "Automatisk SMTP-videresending blokkert — sikker kanal kreves",
    details: { institutionId: institution.id, channel: "secure_required" },
  }).catch((error) => console.error("Failed to log blocked auto-forward:", error));
  console.warn(`[email-policy] blocked automatic report forwarding for rapport ${rapportId}`);
}

/**
 * POST /api/rapporter/:id/returner
 */
rapportRouter.post(
  "/:id/returner",
  requireAuth,
  requireRole("vendor_admin", "tiltaksleder", "super_admin"),
  async (req: any, res) => {
    try {
      const access = await resolveRapportAccess(req, req.params.id);
      if (!access?.canReview) return res.status(404).json({ error: "Ikke funnet" });
      const actor = access.actor;
      const { kommentar, seksjonsKommentarer } = req.body;
      const kommentarText = kommentar == null ? null : String(kommentar).trim().slice(0, 5000);
      if (seksjonsKommentarer != null && !Array.isArray(seksjonsKommentarer)) {
        return res.status(400).json({ error: "seksjonsKommentarer må være en liste" });
      }
      const sectionComments = (seksjonsKommentarer ?? []).slice(0, 50).map((item: any) => ({
        seksjon: String(item?.seksjon ?? "").trim().slice(0, 200),
        tekst: String(item?.tekst ?? "").trim().slice(0, 5000),
      })).filter((item: { tekst: string }) => item.tekst.length > 0);
      const [updated] = await db
        .update(rapporter)
        .set({
          status: "returnert",
          reviewedAt: new Date(),
          reviewedBy: actor.id,
          reviewKommentar: kommentarText,
          updatedAt: new Date(),
        })
        .where(actor.isSuperAdmin
          ? and(eq(rapporter.id, req.params.id), eq(rapporter.status, "til_godkjenning"))
          : and(
              eq(rapporter.id, req.params.id),
              eq(rapporter.status, "til_godkjenning"),
              eq(rapporter.tiltakslederId, actor.id),
            ))
        .returning();

      if (!updated) return res.status(404).json({ error: "Ikke funnet" });
      await logRapportEvent(updated.id, req, "returned", "Returnert", { kommentar: kommentarText });

      if (sectionComments.length) {
        for (const k of sectionComments) {
          await db.insert(rapportKommentarer).values({
            rapportId: req.params.id,
            fromUserId: actor.id,
            seksjon: k.seksjon,
            tekst: k.tekst,
          });
        }
      }
      // Notify miljøarbeider
      try {
        const [worker] = await db.select().from(users).where(eq(users.id, String(updated.userId))).limit(1);
        if (worker?.email) {
          const periode = updated.periodeFrom
            ? new Date(updated.periodeFrom).toLocaleDateString("nb-NO", { month: "long", year: "numeric" })
            : "ukjent periode";
          await emailService.sendRapportReturnedEmail({
            to: worker.email,
            konsulentName: updated.konsulent ?? [worker.firstName, worker.lastName].filter(Boolean).join(" ") ?? "Konsulent",
            periode,
            tiltakslederName: currentUser(req)?.name ?? "Tiltaksleder",
            kommentar: kommentarText ?? undefined,
            rapportId: req.params.id,
          });
        }
      } catch (emailErr) {
        console.error("Failed to send rapport returned email:", emailErr);
      }

      res.json(updated);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  }
);

/**
 * POST /api/rapporter/bulk/godkjenn
 * Body: { ids: string[], kommentar?: string }
 *
 * Approve many rapporter in one call. Auto-forward is still attempted
 * per-rapport. Returns { approved, failed: [{id,error}] }.
 */
async function bulkGodkjennHandler(req: any, res: any) {
    const actor = actorFromRequest(req)!;
    const { ids, kommentar } = req.body ?? {};
    const kommentarText = kommentar == null ? null : String(kommentar).trim().slice(0, 5000);
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "ids array påkrevd" });
    }
    if (ids.length > 100) {
      return res.status(400).json({ error: "Maks 100 rapporter per bulk-operasjon" });
    }

    const approved: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    for (const id of ids) {
      const rapportId = String(id);
      try {
        const access = await resolveRapportAccess(req, rapportId);
        if (!access?.canReview) {
          failed.push({ id: String(id), error: "Ikke funnet eller ikke tilgang" });
          continue;
        }
        const [updated] = await db
          .update(rapporter)
          .set({
            status: "godkjent",
            godkjent: new Date(),
            reviewedAt: new Date(),
            reviewedBy: actor.id,
            updatedAt: new Date(),
          })
          .where(actor.isSuperAdmin
            ? and(eq(rapporter.id, rapportId), eq(rapporter.status, "til_godkjenning"))
            : and(
                eq(rapporter.id, rapportId),
                eq(rapporter.status, "til_godkjenning"),
                eq(rapporter.tiltakslederId, actor.id),
              ))
          .returning();
        if (!updated) {
          failed.push({ id: rapportId, error: "Ikke til godkjenning" });
          continue;
        }
        await logRapportEvent(updated.id, req, "approved", "Godkjent (bulk)", { kommentar: kommentarText, bulk: true });
        if (kommentarText) {
          await db.insert(rapportKommentarer).values({
            rapportId, fromUserId: actor.id, tekst: kommentarText,
          });
        }
        try { await maybeForwardRapportToInstitution(updated.id); } catch (e) { console.error("bulk auto-forward failed:", e); }
        queueRapportArchiving(updated.id, "approved", actor.id).catch((e) =>
          console.error("bulk archive queue failed:", e),
        );
        approved.push(rapportId);
      } catch (e: any) {
        failed.push({ id: rapportId, error: e?.message ?? String(e) });
      }
    }

  res.json({ approved: approved.length, approvedIds: approved, failed });
}

/**
 * POST /api/rapporter/bulk/returner
 * Body: { ids: string[], kommentar: string }
 *
 * Return many rapporter with the same feedback message.
 */
async function bulkReturnerHandler(req: any, res: any) {
    const actor = actorFromRequest(req)!;
    const { ids, kommentar } = req.body ?? {};
    const kommentarText = String(kommentar ?? "").trim().slice(0, 5000);
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "ids array påkrevd" });
    }
    if (!kommentarText) {
      return res.status(400).json({ error: "Kommentar er påkrevd for retur" });
    }
    if (ids.length > 100) {
      return res.status(400).json({ error: "Maks 100 rapporter per bulk-operasjon" });
    }

    const returned: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    for (const id of ids) {
      const rapportId = String(id);
      try {
        const access = await resolveRapportAccess(req, rapportId);
        if (!access?.canReview) {
          failed.push({ id: String(id), error: "Ikke funnet eller ikke tilgang" });
          continue;
        }
        const [updated] = await db
          .update(rapporter)
          .set({
            status: "returnert",
            reviewedAt: new Date(),
            reviewedBy: actor.id,
            reviewKommentar: kommentarText,
            feedbackAcknowledgedAt: null,
            feedbackAcknowledgedText: null,
            updatedAt: new Date(),
          })
          .where(actor.isSuperAdmin
            ? and(eq(rapporter.id, rapportId), eq(rapporter.status, "til_godkjenning"))
            : and(
                eq(rapporter.id, rapportId),
                eq(rapporter.status, "til_godkjenning"),
                eq(rapporter.tiltakslederId, actor.id),
              ))
          .returning();
        if (!updated) {
          failed.push({ id: rapportId, error: "Ikke til godkjenning" });
          continue;
        }
        await logRapportEvent(updated.id, req, "returned", "Returnert (bulk)", { kommentar: kommentarText, bulk: true });
        returned.push(rapportId);
      } catch (e: any) {
        failed.push({ id: rapportId, error: e?.message ?? String(e) });
      }
    }

  res.json({ returned: returned.length, returnedIds: returned, failed });
}

/**
 * POST /api/rapporter/:id/acknowledge-feedback
 * Body: { tekst?: string }
 *
 * Miljøarbeider bekrefter å ha lest tilbakemeldingen på en returnert rapport.
 * Tiltaksleder ser "acknowledged" indikator når rapporten sendes inn igjen.
 */
rapportRouter.post("/:id/acknowledge-feedback", requireAuth, async (req: any, res) => {
  try {
    const actor = actorFromRequest(req)!;
    const access = await resolveRapportAccess(req, req.params.id);
    if (!access?.canEdit || access.rapport.userId !== actor.id) {
      return res.status(404).json({ error: "Ikke funnet" });
    }
    const { tekst } = req.body ?? {};
    const [current] = await db
      .select()
      .from(rapporter)
      .where(and(eq(rapporter.id, req.params.id), eq(rapporter.userId, actor.id)))
      .limit(1);
    if (!current) return res.status(404).json({ error: "Ikke funnet" });
    if (current.status !== "returnert") {
      return res.status(409).json({ error: "Rapporten er ikke returnert" });
    }

    const [updated] = await db
      .update(rapporter)
      .set({
        feedbackAcknowledgedAt: new Date(),
        feedbackAcknowledgedText: tekst ? String(tekst).slice(0, 2000) : null,
        updatedAt: new Date(),
      })
      .where(and(eq(rapporter.id, req.params.id), eq(rapporter.userId, actor.id)))
      .returning();

    await logRapportEvent(
      req.params.id, req,
      "feedback_acknowledged",
      tekst ? "Bekreftet tilbakemelding med svar" : "Bekreftet tilbakemelding",
      { svar: tekst ?? null },
    );

    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── MÅL ───────────────────────────────────────────────────────────────────────

rapportRouter.get("/:id/maal", requireAuth, async (req, res) => {
  try {
    const access = await resolveRapportAccess(req, req.params.id);
    if (!access?.canRead) return res.status(404).json({ error: "Ikke funnet" });
    const rows = await db
      .select()
      .from(rapportMaal)
      .where(eq(rapportMaal.rapportId, req.params.id))
      .orderBy(rapportMaal.nummer);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

rapportRouter.post("/:id/maal", requireAuth, async (req: any, res) => {
  try {
    const access = await resolveRapportAccess(req, req.params.id);
    if (!access?.canEdit) return res.status(404).json({ error: "Ikke funnet" });
    const existing = await db
      .select()
      .from(rapportMaal)
      .where(eq(rapportMaal.rapportId, req.params.id));
    const editableFields = ["beskrivelse", "status", "fremdrift", "kommentar", "sortOrder"];
    const input = Object.fromEntries(
      editableFields.filter((field) => Object.prototype.hasOwnProperty.call(req.body ?? {}, field))
        .map((field) => [field, req.body[field]]),
    );
    const data = insertMaalSchema.parse({
      ...input,
      rapportId: req.params.id,
      nummer: existing.length + 1,
    });
    const [m] = await db.insert(rapportMaal).values(data).returning();
    res.json(m);
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

rapportRouter.patch("/:rapportId/maal/:maalId", requireAuth, async (req: any, res) => {
  try {
    const access = await resolveRapportAccess(req, req.params.rapportId);
    if (!access?.canEdit) return res.status(404).json({ error: "Ikke funnet" });
    const editableFields = ["beskrivelse", "status", "fremdrift", "kommentar", "sortOrder"];
    const input = Object.fromEntries(
      editableFields.filter((field) => Object.prototype.hasOwnProperty.call(req.body ?? {}, field))
        .map((field) => [field, req.body[field]]),
    );
    if (Object.keys(input).length === 0) {
      return res.status(400).json({ error: "Ingen gyldige felter å oppdatere" });
    }
    const updates = insertMaalSchema.partial().parse(input);
    const [m] = await db
      .update(rapportMaal)
      .set(updates)
      .where(and(
        eq(rapportMaal.id, req.params.maalId),
        eq(rapportMaal.rapportId, req.params.rapportId),
      ))
      .returning();
    if (!m) return res.status(404).json({ error: "Ikke funnet" });
    res.json(m);
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

rapportRouter.delete("/:rapportId/maal/:maalId", requireAuth, async (req: any, res) => {
  try {
    const access = await resolveRapportAccess(req, req.params.rapportId);
    if (!access?.canEdit) return res.status(404).json({ error: "Ikke funnet" });
    const [deleted] = await db
      .delete(rapportMaal)
      .where(and(
        eq(rapportMaal.id, req.params.maalId),
        eq(rapportMaal.rapportId, req.params.rapportId),
      ))
      .returning({ id: rapportMaal.id });
    if (!deleted) return res.status(404).json({ error: "Ikke funnet" });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── AKTIVITETER ───────────────────────────────────────────────────────────────

rapportRouter.get("/:id/aktiviteter", requireAuth, async (req, res) => {
  try {
    const access = await resolveRapportAccess(req, req.params.id);
    if (!access?.canRead) return res.status(404).json({ error: "Ikke funnet" });
    const rows = await db
      .select()
      .from(rapportAktiviteter)
      .where(eq(rapportAktiviteter.rapportId, req.params.id))
      .orderBy(rapportAktiviteter.dato, rapportAktiviteter.fraKl);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

rapportRouter.post("/:id/aktiviteter", requireAuth, async (req: any, res) => {
  try {
    const access = await resolveRapportAccess(req, req.params.id);
    if (!access?.canEdit) return res.status(404).json({ error: "Ikke funnet" });
    const editableFields = [
      "malId", "dato", "fraKl", "tilKl", "varighet", "type",
      "beskrivelse", "sted", "klientRef", "noterIntern",
    ];
    const input = Object.fromEntries(
      editableFields.filter((field) => Object.prototype.hasOwnProperty.call(req.body ?? {}, field))
        .map((field) => [field, req.body[field]]),
    );
    if (input.malId) {
      const [goal] = await db
        .select({ id: rapportMaal.id })
        .from(rapportMaal)
        .where(and(
          eq(rapportMaal.id, String(input.malId)),
          eq(rapportMaal.rapportId, req.params.id),
        ))
        .limit(1);
      if (!goal) return res.status(404).json({ error: "Mål ikke funnet" });
    }
    const data = insertAktivitetSchema.parse({
      ...input,
      rapportId: req.params.id,
    });
    const [a] = await db.insert(rapportAktiviteter).values(data).returning();
    await recalcStats(req.params.id);
    res.json(a);
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

rapportRouter.delete(
  "/:rapportId/aktiviteter/:aktId",
  requireAuth,
  async (req: any, res) => {
    try {
      const access = await resolveRapportAccess(req, req.params.rapportId);
      if (!access?.canEdit) return res.status(404).json({ error: "Ikke funnet" });
      const [deleted] = await db
        .delete(rapportAktiviteter)
        .where(and(
          eq(rapportAktiviteter.id, req.params.aktId),
          eq(rapportAktiviteter.rapportId, req.params.rapportId),
        ))
        .returning({ id: rapportAktiviteter.id });
      if (!deleted) return res.status(404).json({ error: "Ikke funnet" });
      await recalcStats(req.params.rapportId);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  }
);

/**
 * POST /api/rapporter/:id/import-time-entries
 * Body: { dryRun?: boolean, overwrite?: boolean }
 *
 * Hent tidum_log_row-oppføringer som faller innenfor rapportens periode for innlogget
 * bruker og opprett tidum_rapport_aktiviteter fra dem. Duplikater (samme dato+startTid)
 * hoppes over med mindre overwrite=true. Returnerer antall importert + preview.
 */
rapportRouter.post("/:id/import-time-entries", requireAuth, async (req: any, res) => {
  try {
    const actor = actorFromRequest(req)!;
    const access = await resolveRapportAccess(req, req.params.id);
    if (!access?.canEdit || access.rapport.userId !== actor.id) {
      return res.status(404).json({ error: "Ikke funnet" });
    }
    const { dryRun = false, overwrite = false } = req.body ?? {};
    const [rap] = await db
      .select()
      .from(rapporter)
      .where(and(eq(rapporter.id, req.params.id), eq(rapporter.userId, actor.id)))
      .limit(1);
    if (!rap) return res.status(404).json({ error: "Ikke funnet" });
    if (!rap.periodeFrom || !rap.periodeTo) {
      return res.status(400).json({ error: "Rapport mangler periode" });
    }

    // Begge bruker-ID-kolonnene er TEXT og støtter UUID/varchar-identiteter.
    const entries = await db
      .select()
      .from(logRow)
      .where(and(
        eq(logRow.userId, actor.id),
        gte(logRow.date, rap.periodeFrom),
        lte(logRow.date, rap.periodeTo),
      ))
      .orderBy(logRow.date, logRow.startTime);

    if (entries.length === 0) {
      return res.json({ found: 0, imported: 0, skipped: 0, entries: [] });
    }

    // Hent eksisterende aktiviteter for duplikat-sjekk (dato+fraKl)
    const existing = await db
      .select()
      .from(rapportAktiviteter)
      .where(eq(rapportAktiviteter.rapportId, req.params.id));
    const dupKey = (d: string, fra: string | null) => `${d}__${fra ?? ""}`;
    const existingKeys = new Set(
      existing.map(a => dupKey(String(a.dato), a.fraKl)),
    );

    const toInsert: any[] = [];
    const skipped: any[] = [];
    for (const e of entries) {
      const key = dupKey(String(e.date), e.startTime);
      if (existingKeys.has(key) && !overwrite) {
        skipped.push({ date: e.date, startTime: e.startTime, reason: "duplicate" });
        continue;
      }
      // minutes fra start/end
      const parseHHMM = (t: string | null): number => {
        if (!t) return 0;
        const [h, m] = t.split(":").map(Number);
        return (h || 0) * 60 + (m || 0);
      };
      const start = parseHHMM(e.startTime);
      const end = parseHHMM(e.endTime);
      const breakMins = Math.round(Number(e.breakHours ?? 0) * 60);
      const varighet = Math.max(0, end - start - breakMins);

      toInsert.push({
        rapportId: req.params.id,
        dato: e.date,
        fraKl: e.startTime ?? null,
        tilKl: e.endTime ?? null,
        varighet,
        type: "aktivitet" as const,
        beskrivelse: e.activity || e.title || e.project || "Timeført aktivitet",
        sted: e.place ?? null,
        noterIntern: e.notes ?? null,
      });
    }

    if (dryRun) {
      return res.json({
        found: entries.length, imported: 0, skipped: skipped.length,
        preview: toInsert,
      });
    }

    if (overwrite) {
      // Slett eksisterende aktiviteter som matcher (dato,fraKl) før ny innsetting
      for (const row of toInsert) {
        await db.delete(rapportAktiviteter).where(and(
          eq(rapportAktiviteter.rapportId, req.params.id),
          eq(rapportAktiviteter.dato, row.dato),
          row.fraKl ? eq(rapportAktiviteter.fraKl, row.fraKl) : sql`${rapportAktiviteter.fraKl} IS NULL`,
        ));
      }
    }

    if (toInsert.length > 0) {
      await db.insert(rapportAktiviteter).values(toInsert);
    }
    await recalcStats(req.params.id);
    await logRapportEvent(req.params.id, req, "time_entries_imported", `Hentet ${toInsert.length} timeføringer`, {
      imported: toInsert.length, skipped: skipped.length, overwrite,
    });

    res.json({
      found: entries.length,
      imported: toInsert.length,
      skipped: skipped.length,
      skippedDetails: skipped,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── KOMMENTARER ───────────────────────────────────────────────────────────────

/**
 * GET /api/rapporter/:id/audit
 * Returns the audit-log timeline for a rapport. Caller must own/review/admin.
 */
rapportRouter.get("/:id/audit", requireAuth, async (req: any, res) => {
  try {
    const access = await resolveRapportAccess(req, req.params.id);
    if (!access?.canRead) return res.status(404).json({ error: "Ikke funnet" });
    const events = await db
      .select()
      .from(rapportAuditLog)
      .where(eq(rapportAuditLog.rapportId, req.params.id))
      .orderBy(desc(rapportAuditLog.createdAt));
    res.json(events);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

rapportRouter.get("/:id/kommentarer", requireAuth, async (req: any, res) => {
  try {
    const access = await resolveRapportAccess(req, req.params.id);
    if (!access?.canRead) return res.status(404).json({ error: "Ikke funnet" });
    const rows = await db
      .select()
      .from(rapportKommentarer)
      .where(eq(rapportKommentarer.rapportId, req.params.id))
      .orderBy(rapportKommentarer.createdAt);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

rapportRouter.post("/:id/kommentarer", requireAuth, async (req: any, res) => {
  try {
    const access = await resolveRapportAccess(req, req.params.id);
    if (!access?.canRead) return res.status(404).json({ error: "Ikke funnet" });
    const tekst = String(req.body?.tekst ?? "").trim();
    const seksjon = req.body?.seksjon == null ? null : String(req.body.seksjon).trim().slice(0, 200);
    if (!tekst) return res.status(400).json({ error: "Kommentar er påkrevd" });
    if (tekst.length > 5000) return res.status(400).json({ error: "Kommentar er for lang" });
    const [k] = await db
      .insert(rapportKommentarer)
      .values({ rapportId: req.params.id, fromUserId: access.actor.id, seksjon, tekst })
      .returning();
    res.json(k);
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

/**
 * POST /api/rapporter/:id/kommentarer/les
 * Mark all unread comments as read by current user
 */
rapportRouter.post("/:id/kommentarer/les", requireAuth, async (req: any, res) => {
  try {
    const access = await resolveRapportAccess(req, req.params.id);
    if (!access?.canRead) return res.status(404).json({ error: "Ikke funnet" });
    const rows = await db
      .select()
      .from(rapportKommentarer)
      .where(eq(rapportKommentarer.rapportId, req.params.id));

    const userId = access.actor.id;
    let updated = 0;
    for (const row of rows) {
      const lestAv = normalizedAssignees(row.lestAv);
      if (!lestAv.includes(userId)) {
        await db
          .update(rapportKommentarer)
          .set({ lestAv: [...lestAv, userId] })
          .where(eq(rapportKommentarer.id, row.id));
        updated++;
      }
    }
    res.json({ updated });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── PDF ────────────────────────────────────────────────────────────────────────

rapportRouter.get("/:id/pdf", requireAuth, async (req: any, res) => {
  try {
    const access = await resolveRapportAccess(req, req.params.id);
    if (!access?.canRead) return res.status(404).json({ error: "Ikke funnet" });
    const r = access.rapport;

    const [aktiviteter, maal] = await Promise.all([
      db.select().from(rapportAktiviteter).where(eq(rapportAktiviteter.rapportId, req.params.id)).orderBy(rapportAktiviteter.dato),
      db.select().from(rapportMaal).where(eq(rapportMaal.rapportId, req.params.id)).orderBy(rapportMaal.nummer),
    ]);

    const templateVendorId = access.sak?.vendorId ?? access.actor.vendorId;
    const template = r.templateId && (access.actor.isSuperAdmin || templateVendorId)
      ? (await db.select().from(vendorTemplates).where(access.actor.isSuperAdmin
          ? eq(vendorTemplates.id, r.templateId)
          : and(eq(vendorTemplates.id, r.templateId), eq(vendorTemplates.vendorId, templateVendorId!))).limit(1))[0]
      : undefined;

    const rapportTemplate = r.rapportTemplateId && (access.actor.isSuperAdmin || templateVendorId)
      ? (await db.select().from(rapportTemplates).where(access.actor.isSuperAdmin
          ? eq(rapportTemplates.id, r.rapportTemplateId)
          : and(
              eq(rapportTemplates.id, r.rapportTemplateId),
              or(eq(rapportTemplates.vendorId, templateVendorId!), sql`${rapportTemplates.vendorId} IS NULL`),
            )).limit(1))[0]
      : null;

    const pdfBuffer = await generateRapportPDF(template, { rapport: r, aktiviteter, maal, rapportTemplate: rapportTemplate as any });
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="tidum-rapport-${r.periodeFrom ?? "ukjent"}.pdf"`,
      "Content-Length": pdfBuffer.length,
    });
    res.send(pdfBuffer);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── HELPER ────────────────────────────────────────────────────────────────────

async function recalcStats(rapportId: string) {
  const rows = await db
    .select()
    .from(rapportAktiviteter)
    .where(eq(rapportAktiviteter.rapportId, rapportId));

  let totalMins = 0;
  const days = new Set<string>();
  let meetings = 0;

  for (const a of rows) {
    if (a.varighet) {
      totalMins += a.varighet;
    } else if (a.fraKl && a.tilKl) {
      const [fh, fm] = a.fraKl.split(":").map(Number);
      const [th, tm] = a.tilKl.split(":").map(Number);
      const m = th * 60 + tm - (fh * 60 + fm);
      if (m > 0) totalMins += m;
    }
    if (a.dato) days.add(a.dato);
    if (a.type === "klientmøte") meetings++;
  }

  await db
    .update(rapporter)
    .set({
      totalMinutter: totalMins,
      antallDager: days.size,
      antallAktiviteter: rows.length,
      antallMoeter: meetings,
      updatedAt: new Date(),
    })
    .where(eq(rapporter.id, rapportId));
}
