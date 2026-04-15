/**
 * server/routes/avvik-routes.ts
 *
 * Avvik / HMS-rapportering.
 *
 * Miljøarbeidere:
 *   POST   /api/avvik           — rapporter nytt avvik
 *   GET    /api/avvik/mine      — mine innsendte avvik
 *
 * Tiltaksleder / vendor_admin:
 *   GET    /api/avvik           — alle avvik i egen vendor (filter: status, severity)
 *   GET    /api/avvik/:id       — detaljvisning
 *   PATCH  /api/avvik/:id       — oppdater (status, kommentar, lukk)
 *   GET    /api/avvik/stats     — aggregert: åpne per severity, gjennomsnittlig responstid
 */

import type { Express, Request, Response } from "express";
import { db } from "../db";
import {
  rapportAvvik,
  users,
  saker,
  vendors,
  notifications,
} from "@shared/schema";
import { and, eq, desc, inArray, sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { emailService } from "../lib/email-service";
import { randomUUID } from "crypto";

const ALLOWED_SEVERITIES = new Set(["lav", "middels", "hoy", "kritisk"]);
const ALLOWED_CATEGORIES = new Set([
  "vold_trusler",
  "egen_skade",
  "andre_skade",
  "rutinebrudd",
  "klientrelatert",
  "arbeidsmiljo",
  "annet",
]);
const ALLOWED_STATUSES = new Set(["rapportert", "under_behandling", "lukket"]);

function authedUser(req: Request) {
  return (req as any).authUser ?? (req as any).user ?? null;
}
function userVendorId(req: Request): number | null {
  const u = authedUser(req);
  const v = u?.vendorId ?? u?.vendor_id;
  return v ? Number(v) : null;
}
function isLeader(req: Request): boolean {
  const r = String(authedUser(req)?.role ?? "").toLowerCase();
  return (
    r === "tiltaksleder" ||
    r === "teamleder" ||
    r === "vendor_admin" ||
    r === "hovedadmin" ||
    r === "admin" ||
    r === "super_admin"
  );
}

/**
 * Naiv GDPR-auto-replace: erstatter fornavn/etternavn i teksten med initialer
 * pluss rolle-markør. Kundene kan skru på per-vendor. Vi holder logikken enkel
 * for første versjon — mer sofistikert NER kan legges til senere.
 */
function gdprRedact(text: string, names: string[]): { text: string; changed: boolean } {
  if (!text || !names.length) return { text, changed: false };
  let out = text;
  let changed = false;
  for (const raw of names) {
    const full = raw.trim();
    if (!full) continue;
    const parts = full.split(/\s+/);
    const initials = parts.map((p) => p[0].toUpperCase()).join(".") + ".";
    // Whole-name first (longer match)
    const reFull = new RegExp(`\\b${full.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\b`, "gi");
    if (reFull.test(out)) {
      out = out.replace(reFull, initials);
      changed = true;
    }
    // First name alone
    if (parts[0] && parts[0].length > 2) {
      const reFirst = new RegExp(`\\b${parts[0]}\\b`, "gi");
      if (reFirst.test(out)) {
        out = out.replace(reFirst, initials);
        changed = true;
      }
    }
  }
  return { text: out, changed };
}

export function registerAvvikRoutes(app: Express) {
  // ── POST /api/avvik — rapporter nytt ───────────────────────────────────────
  app.post("/api/avvik", requireAuth, async (req: Request, res: Response) => {
    try {
      const u = authedUser(req);
      const vendorId = userVendorId(req);
      if (!vendorId) return res.status(400).json({ error: "Mangler vendor_id" });

      const {
        rapportId = null,
        sakId = null,
        institutionId = null,
        dateOccurred,
        timeOccurred = null,
        location = null,
        severity,
        category,
        description,
        immediateAction = null,
        followUpNeeded = false,
        witnesses = [],
        personsInvolved = [],
        attachments = [],
        applyGdprAutoReplace = false,
      } = req.body ?? {};

      if (!dateOccurred) return res.status(400).json({ error: "dateOccurred kreves" });
      if (!ALLOWED_SEVERITIES.has(String(severity))) {
        return res.status(400).json({ error: "Ugyldig severity. Tillatt: lav|middels|hoy|kritisk" });
      }
      if (!ALLOWED_CATEGORIES.has(String(category))) {
        return res.status(400).json({ error: "Ugyldig category" });
      }
      if (!description || String(description).trim().length < 10) {
        return res.status(400).json({ error: "Beskrivelse må være minst 10 tegn" });
      }

      // GDPR auto-replace: hvis brukeren har krysset av, maskerer vi navnene
      // fra personsInvolved + witnesses i beskrivelsen
      let finalDescription = String(description);
      let originalDescription: string | null = null;
      let autoReplaced = false;

      if (applyGdprAutoReplace) {
        const names: string[] = [];
        for (const p of [...(personsInvolved || []), ...(witnesses || [])]) {
          if (typeof p === "object" && p.name) names.push(String(p.name));
          else if (typeof p === "string") names.push(p);
        }
        const redacted = gdprRedact(finalDescription, names);
        if (redacted.changed) {
          originalDescription = finalDescription;
          finalDescription = redacted.text;
          autoReplaced = true;
        }
      }

      const [row] = await db
        .insert(rapportAvvik)
        .values({
          vendorId,
          userId: String(u?.id ?? ""),
          rapportId: rapportId || null,
          sakId: sakId || null,
          institutionId: institutionId || null,
          dateOccurred,
          timeOccurred,
          location,
          severity: String(severity),
          category: String(category),
          description: finalDescription,
          originalDescription,
          gdprAutoReplaced: autoReplaced,
          immediateAction,
          followUpNeeded: !!followUpNeeded,
          witnesses,
          personsInvolved,
          attachments,
        } as any)
        .returning();

      // Varsle alle tiltaksledere i vendor
      try {
        const leaders = await db
          .select()
          .from(users)
          .where(and(eq(users.vendorId, vendorId), inArray(users.role, ["tiltaksleder", "vendor_admin"])));

        const rapportorName = [u?.firstName, u?.lastName].filter(Boolean).join(" ") || u?.email || "En miljøarbeider";
        const severityLabel = { lav: "Lav", middels: "Middels", hoy: "Høy", kritisk: "Kritisk" }[String(severity)] ?? String(severity);

        const notifPromises = leaders.map((leader) =>
          db.insert(notifications).values({
            id: randomUUID(),
            recipientType: "user",
            recipientId: String(leader.id),
            type: "avvik_registrert",
            title: `Nytt avvik (${severityLabel})`,
            body: `${rapportorName} har registrert et avvik ${dateOccurred}. Kategori: ${String(category).replace(/_/g, " ")}`,
            relatedEntityType: "avvik",
            relatedEntityId: String(row.id),
            actorType: "user",
            actorId: String(u?.id ?? ""),
            actorName: rapportorName,
          } as any),
        );
        await Promise.all(notifPromises);

        // Kritiske — send e-post til vendor-escalation-adresse hvis konfigurert
        if (severity === "kritisk") {
          const [v] = await db.select().from(vendors).where(eq(vendors.id, vendorId)).limit(1);
          const escalationEmail = (v as any)?.contactEmail ?? (leaders[0] as any)?.email;
          if (escalationEmail) {
            emailService
              .sendEmail?.({
                to: escalationEmail,
                subject: `[KRITISK] Avvik fra ${rapportorName} — ${dateOccurred}`,
                text: `Et kritisk avvik er registrert.\n\nDato: ${dateOccurred}\nKategori: ${category}\nSted: ${location ?? "ikke oppgitt"}\nBeskrivelse:\n${finalDescription}\n\nLogg inn på Tidum for oppfølging.`,
              })
              .catch((e: any) => console.error("Kritisk-avvik-varsling feilet:", e));
          }
        }

        await db.update(rapportAvvik).set({ notifiedAt: new Date() }).where(eq(rapportAvvik.id, row.id));
      } catch (notifErr) {
        console.error("Varsling til leder feilet:", notifErr);
      }

      res.status(201).json({
        ok: true,
        avvik: row,
        gdprAutoReplaced: autoReplaced,
      });
    } catch (e: any) {
      console.error("Avvik create failed:", e);
      res.status(500).json({ error: e.message });
    }
  });

  // ── GET /api/avvik/mine ────────────────────────────────────────────────────
  app.get("/api/avvik/mine", requireAuth, async (req: Request, res: Response) => {
    try {
      const u = authedUser(req);
      const vendorId = userVendorId(req);
      if (!vendorId) return res.status(400).json({ error: "Mangler vendor_id" });

      const rows = await db
        .select()
        .from(rapportAvvik)
        .where(and(eq(rapportAvvik.vendorId, vendorId), eq(rapportAvvik.userId, String(u?.id ?? ""))))
        .orderBy(desc(rapportAvvik.dateOccurred));

      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── GET /api/avvik — leder-list ────────────────────────────────────────────
  app.get("/api/avvik", requireAuth, async (req: Request, res: Response) => {
    try {
      if (!isLeader(req)) return res.status(403).json({ error: "Krever leder-rolle" });
      const vendorId = userVendorId(req);
      if (!vendorId) return res.status(400).json({ error: "Mangler vendor_id" });

      const whereExprs: any[] = [eq(rapportAvvik.vendorId, vendorId)];
      if (req.query.status && ALLOWED_STATUSES.has(String(req.query.status))) {
        whereExprs.push(eq(rapportAvvik.status, String(req.query.status)));
      }
      if (req.query.severity && ALLOWED_SEVERITIES.has(String(req.query.severity))) {
        whereExprs.push(eq(rapportAvvik.severity, String(req.query.severity)));
      }

      const rows = await db
        .select({
          avvik: rapportAvvik,
          reporter: { firstName: users.firstName, lastName: users.lastName, email: users.email },
        })
        .from(rapportAvvik)
        .leftJoin(users, eq(users.id, rapportAvvik.userId as any))
        .where(and(...whereExprs))
        .orderBy(desc(rapportAvvik.dateOccurred));

      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── GET /api/avvik/stats ───────────────────────────────────────────────────
  app.get("/api/avvik/stats", requireAuth, async (req: Request, res: Response) => {
    try {
      if (!isLeader(req)) return res.status(403).json({ error: "Krever leder-rolle" });
      const vendorId = userVendorId(req);
      if (!vendorId) return res.status(400).json({ error: "Mangler vendor_id" });

      const rows = await db
        .select({
          severity: rapportAvvik.severity,
          status: rapportAvvik.status,
          count: sql<number>`count(*)::int`,
        })
        .from(rapportAvvik)
        .where(eq(rapportAvvik.vendorId, vendorId))
        .groupBy(rapportAvvik.severity, rapportAvvik.status);

      // Total for this month
      const thisMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
      const monthRows = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(rapportAvvik)
        .where(
          and(
            eq(rapportAvvik.vendorId, vendorId),
            sql`to_char(date_occurred, 'YYYY-MM') = ${thisMonth}`,
          ),
        );

      res.json({
        byStatusSeverity: rows,
        thisMonth: Number(monthRows[0]?.c ?? 0),
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── GET /api/avvik/:id — detail ────────────────────────────────────────────
  app.get("/api/avvik/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const u = authedUser(req);
      const vendorId = userVendorId(req);
      if (!vendorId) return res.status(400).json({ error: "Mangler vendor_id" });

      const [row] = await db
        .select()
        .from(rapportAvvik)
        .where(and(eq(rapportAvvik.id, req.params.id), eq(rapportAvvik.vendorId, vendorId)))
        .limit(1);

      if (!row) return res.status(404).json({ error: "Ikke funnet" });

      // Miljøarbeider kan bare se egne
      if (!isLeader(req) && String(row.userId) !== String(u?.id)) {
        return res.status(403).json({ error: "Ingen tilgang" });
      }

      res.json(row);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── PATCH /api/avvik/:id — leder oppfølging ────────────────────────────────
  app.patch("/api/avvik/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      if (!isLeader(req)) return res.status(403).json({ error: "Krever leder-rolle" });
      const u = authedUser(req);
      const vendorId = userVendorId(req);
      if (!vendorId) return res.status(400).json({ error: "Mangler vendor_id" });

      const [existing] = await db
        .select()
        .from(rapportAvvik)
        .where(and(eq(rapportAvvik.id, req.params.id), eq(rapportAvvik.vendorId, vendorId)))
        .limit(1);
      if (!existing) return res.status(404).json({ error: "Ikke funnet" });

      const updates: any = { updatedAt: new Date() };
      if (typeof req.body?.status === "string" && ALLOWED_STATUSES.has(req.body.status)) {
        updates.status = req.body.status;
        if (req.body.status === "lukket") {
          updates.tiltakslederLukketAt = new Date();
          updates.tiltakslederLukketAv = String(u?.id ?? "");
        }
      }
      if (typeof req.body?.tiltakslederKommentar === "string") {
        updates.tiltakslederKommentar = req.body.tiltakslederKommentar;
      }

      const [row] = await db
        .update(rapportAvvik)
        .set(updates)
        .where(eq(rapportAvvik.id, req.params.id))
        .returning();

      res.json(row);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}
