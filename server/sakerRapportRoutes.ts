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
import { eq, and, desc, inArray, sql, ilike, between, gte, lte } from "drizzle-orm";
import {
  saker, rapporter, rapportMaal, rapportAktiviteter,
  rapportKommentarer, rapportAuditLog,
  vendorTemplates, aktivitetMaler,
  vendorInstitutions, rapportTemplates,
  insertSakSchema, insertRapportSchema,
  insertMaalSchema, insertAktivitetSchema,
  logRow,
} from "../shared/schema";
import { generateRapportPDF } from "./rapportGenerator";
import { emailService } from "./lib/email-service";
import { users } from "../shared/schema";
import OpenAI from "openai";

// ── HELPERS ───────────────────────────────────────────────────────────────────

function requireAuth(req: any, res: any, next: any) {
  if (!req.user) return res.status(401).json({ error: "Ikke innlogget" });
  next();
}

function requireRole(...roles: string[]) {
  return (req: any, res: any, next: any) => {
    if (!roles.includes(req.user?.role))
      return res.status(403).json({ error: "Ikke tilgang" });
    next();
  };
}

function getUserVendorId(req: any): number | null {
  return req.user?.vendorId ?? null;
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
    const userName = req.user?.firstName || req.user?.lastName
      ? [req.user.firstName, req.user.lastName].filter(Boolean).join(" ")
      : (req.user?.name ?? req.user?.email ?? null);
    await db.insert(rapportAuditLog).values({
      rapportId,
      userId: req.user?.id ? Number(req.user.id) : null,
      userName: userName ?? null,
      userRole: req.user?.role ?? null,
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
          .select({ id: vendorInstitutions.id, name: vendorInstitutions.name })
          .from(vendorInstitutions)
          .where(inArray(vendorInstitutions.id, institutionIds as string[]))
      : Promise.resolve([] as { id: string; name: string }[]),
    tiltakslederIds.length
      ? db
          .select({
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
            email: users.email,
          })
          .from(users)
          .where(inArray(users.id, tiltakslederIds as any))
      : Promise.resolve([] as any[]),
  ]);

  const instName = new Map(instRows.map((i) => [i.id, i.name]));
  const lederName = new Map(
    lederRows.map((u) => [
      String(u.id),
      [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email || "",
    ]),
  );
  const lederEmail = new Map(lederRows.map((u) => [String(u.id), u.email ?? null]));

  return rows.map((r) => ({
    ...r,
    institutionName: r.institutionId ? instName.get(r.institutionId) ?? null : null,
    tiltakslederName:
      r.tiltakslederId != null
        ? lederName.get(String(r.tiltakslederId)) ?? null
        : null,
    tiltakslederEmail:
      r.tiltakslederId != null
        ? lederEmail.get(String(r.tiltakslederId)) ?? null
        : null,
  }));
}

sakerRouter.get("/", requireAuth, async (req: any, res) => {
  try {
    const { id: userId, role, vendorId } = req.user;

    if (role === "user") {
      // Saker der userId er i tildelte_user_id-arrayet
      const rows = await db
        .select()
        .from(saker)
        .where(
          and(
            eq(saker.vendorId, vendorId),
            sql`${saker.tildelteUserId} @> ${JSON.stringify([userId])}::jsonb`
          )
        )
        .orderBy(desc(saker.createdAt));
      return res.json(await enrichSaker(rows));
    }

    if (role === "vendor_admin") {
      const rows = await db
        .select()
        .from(saker)
        .where(eq(saker.tiltakslederId, userId))
        .orderBy(desc(saker.createdAt));
      return res.json(await enrichSaker(rows));
    }

    // super_admin
    const rows = await db.select().from(saker).orderBy(desc(saker.createdAt));
    return res.json(await enrichSaker(rows));
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
  requireRole("vendor_admin", "super_admin"),
  async (req: any, res) => {
    try {
      const data = insertSakSchema.parse({
        ...req.body,
        vendorId: req.user.vendorId,
        tiltakslederId: req.user.id,
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
 * Oppdater sak — inkl. tildelteUserId
 */
sakerRouter.patch(
  "/:id",
  requireAuth,
  requireRole("vendor_admin", "super_admin"),
  async (req: any, res) => {
    try {
      const [sak] = await db
        .update(saker)
        .set({ ...req.body, updatedAt: new Date() })
        .where(eq(saker.id, req.params.id))
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
  requireRole("vendor_admin", "super_admin"),
  async (req: any, res) => {
    try {
      const { userIds } = req.body; // number[]
      if (!Array.isArray(userIds))
        return res.status(400).json({ error: "userIds must be array" });
      const [updated] = await db
        .update(saker)
        .set({ tildelteUserId: userIds, updatedAt: new Date() })
        .where(eq(saker.id, req.params.id))
        .returning();
      res.json(updated);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  }
);

/**
 * DELETE /api/saker/:id
 */
sakerRouter.delete(
  "/:id",
  requireAuth,
  requireRole("vendor_admin", "super_admin"),
  async (req, res) => {
    try {
      await db.delete(saker).where(eq(saker.id, req.params.id));
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
    const { id: userId, role } = req.user;
    if (role === "user") {
      const rows = await db
        .select()
        .from(rapporter)
        .where(eq(rapporter.userId, userId))
        .orderBy(desc(rapporter.createdAt));
      return res.json(rows);
    }
    if (role === "vendor_admin") {
      const rows = await db
        .select()
        .from(rapporter)
        .where(eq(rapporter.tiltakslederId, userId))
        .orderBy(desc(rapporter.createdAt));
      return res.json(rows);
    }
    const rows = await db
      .select()
      .from(rapporter)
      .orderBy(desc(rapporter.createdAt));
    return res.json(rows);
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
      const [t] = await db
        .insert(vendorTemplates)
        .values({ ...req.body, vendorId: req.user.vendorId })
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
  async (req, res) => {
    try {
      const [t] = await db
        .update(vendorTemplates)
        .set({ ...req.body, updatedAt: new Date() })
        .where(eq(vendorTemplates.id, req.params.id))
        .returning();
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
    const rows = await db
      .select()
      .from(aktivitetMaler)
      .where(eq(aktivitetMaler.userId, req.user.id))
      .orderBy(desc(aktivitetMaler.brukAntall));
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

rapportRouter.post("/aktivitet-maler", requireAuth, async (req: any, res) => {
  try {
    const { navn, type, beskrivelse, sted, klientRef, varighetMin } = req.body;
    if (!navn?.trim() || !beskrivelse?.trim()) return res.status(400).json({ error: "Navn og beskrivelse er påkrevd" });
    const [row] = await db
      .insert(aktivitetMaler)
      .values({ userId: req.user.id, navn, type, beskrivelse, sted, klientRef, varighetMin })
      .returning();
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

rapportRouter.delete("/aktivitet-maler/:malId", requireAuth, async (req: any, res) => {
  try {
    await db.delete(aktivitetMaler).where(and(eq(aktivitetMaler.id, req.params.malId), eq(aktivitetMaler.userId, req.user.id)));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

rapportRouter.post("/aktivitet-maler/:malId/bruk", requireAuth, async (req: any, res) => {
  try {
    await db
      .update(aktivitetMaler)
      .set({ brukAntall: sql`${aktivitetMaler.brukAntall} + 1`, sistBrukt: new Date() })
      .where(and(eq(aktivitetMaler.id, req.params.malId), eq(aktivitetMaler.userId, req.user.id)));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── ML AKTIVITETSFORSLAG ────────────────────────────────────────────────────

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

rapportRouter.post("/aktivitet-forslag", requireAuth, async (req: any, res) => {
  try {
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
      .where(eq(rapporter.userId, req.user.id))
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

/**
 * GET /api/rapporter/:id
 */
rapportRouter.get("/:id", requireAuth, async (req: any, res) => {
  try {
    const [r] = await db
      .select()
      .from(rapporter)
      .where(eq(rapporter.id, req.params.id))
      .limit(1);
    if (!r) return res.status(404).json({ error: "Ikke funnet" });
    if (r.userId !== req.user.id && r.tiltakslederId !== req.user.id && req.user.role !== "super_admin")
      return res.status(403).json({ error: "Ikke tilgang" });
    res.json(r);
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
    // Verifiser at brukeren har tilgang til saken
    const sakId = req.body.sakId;
    if (sakId) {
      const [sak] = await db.select().from(saker).where(eq(saker.id, sakId)).limit(1);
      if (!sak) return res.status(404).json({ error: "Sak ikke funnet" });
      const tildelt = (sak.tildelteUserId as number[]) ?? [];
      if (!tildelt.includes(req.user.id) && req.user.role === "user")
        return res.status(403).json({ error: "Du er ikke tildelt denne saken" });
    }

    const data = insertRapportSchema.parse({ ...req.body, userId: req.user.id });
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
    const [existing] = await db
      .select()
      .from(rapporter)
      .where(eq(rapporter.id, req.params.id))
      .limit(1);
    if (!existing) return res.status(404).json({ error: "Ikke funnet" });
    if (existing.userId !== req.user.id && req.user.role === "user")
      return res.status(403).json({ error: "Ikke tilgang" });

    // Whitelist updatable fields — prevent clients from overwriting userId,
    // status, timestamps, review state, etc.
    const ALLOWED = [
      'sakId', 'konsulent', 'tiltak', 'bedrift', 'oppdragsgiver', 'klientRef',
      'tiltaksleder', 'periodeFrom', 'periodeTo', 'innledning', 'avslutning',
      'rapportTemplateId', 'dynamiskeFelter', 'templateId', 'signaturer',
    ];
    const updates: any = { updatedAt: new Date() };
    for (const k of ALLOWED) {
      if (k in req.body) updates[k] = req.body[k];
    }

    const [updated] = await db
      .update(rapporter)
      .set(updates)
      .where(eq(rapporter.id, req.params.id))
      .returning();
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
    // Fetch current rapport to run checks before update
    const [current] = await db
      .select()
      .from(rapporter)
      .where(and(eq(rapporter.id, req.params.id), eq(rapporter.userId, req.user.id)))
      .limit(1);
    if (!current) return res.status(404).json({ error: "Ikke funnet" });

    // Guard 1: still assigned to sak?
    if (current.sakId) {
      const [sak] = await db.select().from(saker).where(eq(saker.id, current.sakId)).limit(1);
      const tildelt = Array.isArray(sak?.tildelteUserId) ? (sak!.tildelteUserId as any[]).map(Number) : [];
      if (sak && tildelt.length > 0 && !tildelt.includes(Number(req.user.id))) {
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
      .where(and(eq(rapporter.id, req.params.id), eq(rapporter.userId, req.user.id)))
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
            konsulentName: updated.konsulent ?? req.user.name ?? "Konsulent",
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
  requireRole("vendor_admin", "super_admin"),
  async (req: any, res) => {
    try {
      const { signatureDataUri, kommentar } = req.body;
      const [updated] = await db
        .update(rapporter)
        .set({
          status: "godkjent",
          godkjent: new Date(),
          reviewedAt: new Date(),
          reviewedBy: req.user.id,
          updatedAt: new Date(),
        })
        .where(eq(rapporter.id, req.params.id))
        .returning();
      if (!updated) return res.status(404).json({ error: "Ikke funnet" });

      await logRapportEvent(updated.id, req, "approved", "Godkjent", { kommentar: kommentar ?? null });

      if (kommentar) {
        await db.insert(rapportKommentarer).values({
          rapportId: req.params.id,
          fromUserId: req.user.id,
          tekst: kommentar,
        });
      }

      if (signatureDataUri) {
        const current = (updated.signaturer as any[]) ?? [];
        await db.update(rapporter).set({
          signaturer: [...current, {
            slot: 2, name: req.user.name ?? "Tiltaksleder",
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
            tiltakslederName: req.user.name ?? "Tiltaksleder",
            kommentar: kommentar ?? undefined,
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
    .where(eq(vendorInstitutions.id, sak.institutionId))
    .limit(1);
  if (!institution?.autoForwardRapport || !institution.forwardEmail) return;

  const [aktiviteter, maal] = await Promise.all([
    db.select().from(rapportAktiviteter).where(eq(rapportAktiviteter.rapportId, rapportId)).orderBy(rapportAktiviteter.dato),
    db.select().from(rapportMaal).where(eq(rapportMaal.rapportId, rapportId)).orderBy(rapportMaal.nummer),
  ]);

  const template = rapport.templateId
    ? (await db.select().from(vendorTemplates).where(eq(vendorTemplates.id, rapport.templateId)).limit(1))[0]
    : undefined;

  const rapportTemplate = rapport.rapportTemplateId
    ? (await db.select().from(rapportTemplates).where(eq(rapportTemplates.id, rapport.rapportTemplateId)).limit(1))[0]
    : null;

  const pdfBuffer = await generateRapportPDF(template, { rapport, aktiviteter, maal, rapportTemplate: rapportTemplate as any });
  const periode = rapport.periodeFrom
    ? new Date(rapport.periodeFrom).toLocaleDateString("nb-NO", { month: "long", year: "numeric" })
    : "ukjent periode";

  await emailService.sendEmail({
    to: institution.forwardEmail,
    subject: `Rapport ${institution.name} — ${periode}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <h2 style="color:#1a6b73;margin:0 0 16px;">Godkjent rapport</h2>
        <p style="line-height:1.6;color:#333;">
          Vedlagt rapporten for <strong>${institution.name}</strong> i perioden <strong>${periode}</strong>.
        </p>
        <p style="line-height:1.6;color:#666;font-size:14px;">
          Rapporten er godkjent av tiltaksleder og videresendes automatisk til dere som oppdragsgiver.
        </p>
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0;"/>
        <p style="color:#999;font-size:11px;">Sendt automatisk via Tidum</p>
      </div>
    `,
    text: `Vedlagt rapport for ${institution.name} (${periode}). Godkjent av tiltaksleder. Sendt automatisk fra Tidum.`,
    attachments: [{
      filename: `rapport-${institution.name.replace(/[^a-z0-9]+/gi, '_')}-${rapport.periodeFrom ?? "ukjent"}.pdf`,
      content: pdfBuffer,
      contentType: "application/pdf",
    }],
  } as any);
  console.log(`✉️  Auto-forwarded rapport ${rapportId} → ${institution.forwardEmail}`);

  // Log to audit trail (system event, no user)
  try {
    await db.insert(rapportAuditLog).values({
      rapportId,
      userId: null,
      userName: "Tidum (system)",
      userRole: "system",
      eventType: "auto_forwarded",
      eventLabel: `Videresendt til ${institution.forwardEmail}`,
      details: { institutionId: institution.id, institutionName: institution.name },
    });
  } catch (e) {
    console.error("Failed to log auto-forward:", e);
  }
}

/**
 * POST /api/rapporter/:id/returner
 */
rapportRouter.post(
  "/:id/returner",
  requireAuth,
  requireRole("vendor_admin", "super_admin"),
  async (req: any, res) => {
    try {
      const { kommentar, seksjonsKommentarer } = req.body;
      const [updated] = await db
        .update(rapporter)
        .set({
          status: "returnert",
          reviewedAt: new Date(),
          reviewedBy: req.user.id,
          reviewKommentar: kommentar,
          updatedAt: new Date(),
        })
        .where(eq(rapporter.id, req.params.id))
        .returning();

      if (updated) await logRapportEvent(updated.id, req, "returned", "Returnert", { kommentar: kommentar ?? null });

      if (seksjonsKommentarer?.length) {
        for (const k of seksjonsKommentarer) {
          await db.insert(rapportKommentarer).values({
            rapportId: req.params.id,
            fromUserId: req.user.id,
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
            tiltakslederName: req.user.name ?? "Tiltaksleder",
            kommentar: kommentar ?? undefined,
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
rapportRouter.post(
  "/bulk/godkjenn",
  requireAuth,
  requireRole("vendor_admin", "super_admin"),
  async (req: any, res) => {
    const { ids, kommentar } = req.body ?? {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "ids array påkrevd" });
    }
    if (ids.length > 100) {
      return res.status(400).json({ error: "Maks 100 rapporter per bulk-operasjon" });
    }

    const approved: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    for (const id of ids) {
      try {
        const [updated] = await db
          .update(rapporter)
          .set({
            status: "godkjent",
            godkjent: new Date(),
            reviewedAt: new Date(),
            reviewedBy: req.user.id,
            updatedAt: new Date(),
          })
          .where(and(eq(rapporter.id, id), eq(rapporter.status, "til_godkjenning")))
          .returning();
        if (!updated) {
          failed.push({ id, error: "Ikke til godkjenning" });
          continue;
        }
        await logRapportEvent(updated.id, req, "approved", "Godkjent (bulk)", { kommentar: kommentar ?? null, bulk: true });
        if (kommentar) {
          await db.insert(rapportKommentarer).values({
            rapportId: id, fromUserId: req.user.id, tekst: kommentar,
          });
        }
        try { await maybeForwardRapportToInstitution(updated.id); } catch (e) { console.error("bulk auto-forward failed:", e); }
        approved.push(id);
      } catch (e: any) {
        failed.push({ id, error: e?.message ?? String(e) });
      }
    }

    res.json({ approved: approved.length, approvedIds: approved, failed });
  }
);

/**
 * POST /api/rapporter/bulk/returner
 * Body: { ids: string[], kommentar: string }
 *
 * Return many rapporter with the same feedback message.
 */
rapportRouter.post(
  "/bulk/returner",
  requireAuth,
  requireRole("vendor_admin", "super_admin"),
  async (req: any, res) => {
    const { ids, kommentar } = req.body ?? {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "ids array påkrevd" });
    }
    if (!kommentar || !String(kommentar).trim()) {
      return res.status(400).json({ error: "Kommentar er påkrevd for retur" });
    }
    if (ids.length > 100) {
      return res.status(400).json({ error: "Maks 100 rapporter per bulk-operasjon" });
    }

    const returned: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    for (const id of ids) {
      try {
        const [updated] = await db
          .update(rapporter)
          .set({
            status: "returnert",
            reviewedAt: new Date(),
            reviewedBy: req.user.id,
            reviewKommentar: kommentar,
            feedbackAcknowledgedAt: null,
            feedbackAcknowledgedText: null,
            updatedAt: new Date(),
          })
          .where(and(eq(rapporter.id, id), eq(rapporter.status, "til_godkjenning")))
          .returning();
        if (!updated) {
          failed.push({ id, error: "Ikke til godkjenning" });
          continue;
        }
        await logRapportEvent(updated.id, req, "returned", "Returnert (bulk)", { kommentar, bulk: true });
        returned.push(id);
      } catch (e: any) {
        failed.push({ id, error: e?.message ?? String(e) });
      }
    }

    res.json({ returned: returned.length, returnedIds: returned, failed });
  }
);

/**
 * POST /api/rapporter/:id/acknowledge-feedback
 * Body: { tekst?: string }
 *
 * Miljøarbeider bekrefter å ha lest tilbakemeldingen på en returnert rapport.
 * Tiltaksleder ser "acknowledged" indikator når rapporten sendes inn igjen.
 */
rapportRouter.post("/:id/acknowledge-feedback", requireAuth, async (req: any, res) => {
  try {
    const { tekst } = req.body ?? {};
    const [current] = await db
      .select()
      .from(rapporter)
      .where(and(eq(rapporter.id, req.params.id), eq(rapporter.userId, req.user.id)))
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
      .where(eq(rapporter.id, req.params.id))
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
    const existing = await db
      .select()
      .from(rapportMaal)
      .where(eq(rapportMaal.rapportId, req.params.id));
    const data = insertMaalSchema.parse({
      ...req.body,
      rapportId: req.params.id,
      nummer: existing.length + 1,
    });
    const [m] = await db.insert(rapportMaal).values(data).returning();
    res.json(m);
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

rapportRouter.patch("/:rapportId/maal/:maalId", requireAuth, async (req, res) => {
  try {
    const [m] = await db
      .update(rapportMaal)
      .set(req.body)
      .where(eq(rapportMaal.id, req.params.maalId))
      .returning();
    res.json(m);
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

rapportRouter.delete("/:rapportId/maal/:maalId", requireAuth, async (req, res) => {
  try {
    await db.delete(rapportMaal).where(eq(rapportMaal.id, req.params.maalId));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── AKTIVITETER ───────────────────────────────────────────────────────────────

rapportRouter.get("/:id/aktiviteter", requireAuth, async (req, res) => {
  try {
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
    const data = insertAktivitetSchema.parse({
      ...req.body,
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
      await db
        .delete(rapportAktiviteter)
        .where(eq(rapportAktiviteter.id, req.params.aktId));
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
 * Hent log_row-oppføringer som faller innenfor rapportens periode for innlogget
 * bruker og opprett rapport_aktiviteter fra dem. Duplikater (samme dato+startTid)
 * hoppes over med mindre overwrite=true. Returnerer antall importert + preview.
 */
rapportRouter.post("/:id/import-time-entries", requireAuth, async (req: any, res) => {
  try {
    const { dryRun = false, overwrite = false } = req.body ?? {};
    const [rap] = await db
      .select()
      .from(rapporter)
      .where(and(eq(rapporter.id, req.params.id), eq(rapporter.userId, req.user.id)))
      .limit(1);
    if (!rap) return res.status(404).json({ error: "Ikke funnet" });
    if (!rap.periodeFrom || !rap.periodeTo) {
      return res.status(400).json({ error: "Rapport mangler periode" });
    }

    // log_row.userId er TEXT; rapporter.userId er INTEGER. Støtt begge-matching.
    const entries = await db
      .select()
      .from(logRow)
      .where(and(
        eq(logRow.userId, String(req.user.id)),
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
    const [r] = await db.select().from(rapporter).where(eq(rapporter.id, req.params.id)).limit(1);
    if (!r) return res.status(404).json({ error: "Ikke funnet" });
    if (r.userId !== req.user.id && r.tiltakslederId !== req.user.id && req.user.role !== "super_admin" && req.user.role !== "vendor_admin") {
      return res.status(403).json({ error: "Ikke tilgang" });
    }
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

rapportRouter.get("/:id/kommentarer", requireAuth, async (req, res) => {
  try {
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
    const [k] = await db
      .insert(rapportKommentarer)
      .values({ ...req.body, rapportId: req.params.id, fromUserId: req.user.id })
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
    const rows = await db
      .select()
      .from(rapportKommentarer)
      .where(eq(rapportKommentarer.rapportId, req.params.id));

    const userId = req.user.id;
    let updated = 0;
    for (const row of rows) {
      const lestAv = (row.lestAv as number[]) ?? [];
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
    const [r] = await db
      .select()
      .from(rapporter)
      .where(eq(rapporter.id, req.params.id))
      .limit(1);
    if (!r) return res.status(404).json({ error: "Ikke funnet" });
    if (r.userId !== req.user.id && r.tiltakslederId !== req.user.id && req.user.role !== "super_admin")
      return res.status(403).json({ error: "Ikke tilgang" });

    const [aktiviteter, maal] = await Promise.all([
      db.select().from(rapportAktiviteter).where(eq(rapportAktiviteter.rapportId, req.params.id)).orderBy(rapportAktiviteter.dato),
      db.select().from(rapportMaal).where(eq(rapportMaal.rapportId, req.params.id)).orderBy(rapportMaal.nummer),
    ]);

    const template = r.templateId
      ? (await db.select().from(vendorTemplates).where(eq(vendorTemplates.id, r.templateId)).limit(1))[0]
      : undefined;

    const rapportTemplate = r.rapportTemplateId
      ? (await db.select().from(rapportTemplates).where(eq(rapportTemplates.id, r.rapportTemplateId)).limit(1))[0]
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
