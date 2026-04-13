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
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import {
  saker, rapporter, rapportMaal, rapportAktiviteter,
  rapportKommentarer, vendorTemplates,
  insertSakSchema, insertRapportSchema,
  insertMaalSchema, insertAktivitetSchema,
} from "../shared/schema";
import { generateRapportPDF } from "./rapportGenerator";
import { emailService } from "./lib/email-service";
import { users } from "../shared/schema";

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

// ── SAKER ROUTER ──────────────────────────────────────────────────────────────

export const sakerRouter = Router();

/**
 * GET /api/saker
 * - Miljøarbeider (user):       Ser kun saker tildelt til dem
 * - Tiltaksleder (vendor_admin): Ser alle saker de har opprettet
 * - Super admin:                Ser alle saker
 */
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
      return res.json(rows);
    }

    if (role === "vendor_admin") {
      const rows = await db
        .select()
        .from(saker)
        .where(eq(saker.tiltakslederId, userId))
        .orderBy(desc(saker.createdAt));
      return res.json(rows);
    }

    // super_admin
    const rows = await db.select().from(saker).orderBy(desc(saker.createdAt));
    return res.json(rows);
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

    const [updated] = await db
      .update(rapporter)
      .set({ ...req.body, updatedAt: new Date() })
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
 */
rapportRouter.post("/:id/send", requireAuth, async (req: any, res) => {
  try {
    const [updated] = await db
      .update(rapporter)
      .set({ status: "til_godkjenning", innsendt: new Date(), updatedAt: new Date() })
      .where(and(eq(rapporter.id, req.params.id), eq(rapporter.userId, req.user.id)))
      .returning();
    if (!updated) return res.status(404).json({ error: "Ikke funnet" });

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

      res.json(updated);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  }
);

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

// ── KOMMENTARER ───────────────────────────────────────────────────────────────

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

    const pdfBuffer = await generateRapportPDF(template, { rapport: r, aktiviteter, maal });
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
