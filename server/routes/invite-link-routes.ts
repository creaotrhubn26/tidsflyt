/**
 * server/routes/invite-link-routes.ts
 *
 * Shared invite-links per vendor. Vendor_admin lager en URL med en gitt rolle,
 * og hvem som helst med lenken (eventuelt begrenset til et e-postdomene)
 * kan registrere seg selv inn i vendoren.
 *
 * Public endpoint:
 *   GET  /api/invite/:token              — preview (vendor name, role, domain hint)
 *   POST /api/invite/:token/accept       — body: { email, firstName?, lastName? }
 *
 * Vendor-admin endpoints:
 *   GET    /api/company/invite-links     — list active/inactive
 *   POST   /api/company/invite-links     — create
 *   PATCH  /api/company/invite-links/:id — toggle active or update note
 *   DELETE /api/company/invite-links/:id — revoke
 */

import type { Express, Request, Response } from "express";
import { db } from "../db";
import { vendorInviteLinks, vendors, users, saker } from "@shared/schema";
import { and, eq, desc, inArray } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { randomBytes } from "crypto";
import { emailService } from "../lib/email-service";
import { buildEmailLoginUrl } from "../custom-auth";

const ALLOWED_ROLES = ["miljoarbeider", "tiltaksleder", "teamleder", "vendor_admin"];

function authedUser(req: Request) {
  return (req as any).authUser ?? (req as any).user ?? null;
}
function isVendorAdmin(req: Request): boolean {
  const r = String(authedUser(req)?.role || "").toLowerCase();
  return r === "vendor_admin" || r === "hovedadmin" || r === "admin" || r === "super_admin";
}
function userVendorId(req: Request): number | null {
  const u = authedUser(req);
  const v = u?.vendorId ?? u?.vendor_id;
  return v ? Number(v) : null;
}

function genToken(): string {
  // 24 byte = 32 base64-tegn, urlsafe
  return randomBytes(24).toString("base64url");
}

export function registerInviteLinkRoutes(app: Express) {

  // ── PUBLIC: preview ──────────────────────────────────────────────────────

  app.get("/api/invite/:token", async (req: Request, res: Response) => {
    try {
      const [link] = await db
        .select()
        .from(vendorInviteLinks)
        .where(and(eq(vendorInviteLinks.token, req.params.token), eq(vendorInviteLinks.active, true)))
        .limit(1);

      if (!link) return res.status(404).json({ error: "Lenken finnes ikke eller er deaktivert" });
      if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
        return res.status(410).json({ error: "Lenken er utløpt" });
      }
      if (link.maxUses && (link.usedCount ?? 0) >= link.maxUses) {
        return res.status(410).json({ error: "Lenken er brukt opp" });
      }

      const [vendor] = await db.select().from(vendors).where(eq(vendors.id, link.vendorId)).limit(1);

      res.json({
        ok: true,
        vendorName: vendor?.name ?? "Ukjent bedrift",
        vendorLogo: vendor?.logoUrl ?? null,
        role: link.role,
        domainRestriction: link.domain ?? null,
        usesRemaining: link.maxUses ? Math.max(0, link.maxUses - (link.usedCount ?? 0)) : null,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── PUBLIC: accept ───────────────────────────────────────────────────────

  app.post("/api/invite/:token/accept", async (req: Request, res: Response) => {
    try {
      const { email, firstName, lastName } = req.body ?? {};
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) {
        return res.status(400).json({ error: "Gyldig e-post er påkrevd" });
      }

      const [link] = await db
        .select()
        .from(vendorInviteLinks)
        .where(and(eq(vendorInviteLinks.token, req.params.token), eq(vendorInviteLinks.active, true)))
        .limit(1);
      if (!link) return res.status(404).json({ error: "Lenken finnes ikke" });
      if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
        return res.status(410).json({ error: "Lenken er utløpt" });
      }
      if (link.maxUses && (link.usedCount ?? 0) >= link.maxUses) {
        return res.status(410).json({ error: "Lenken er brukt opp" });
      }
      if (link.domain) {
        const dom = String(email).split("@")[1]?.toLowerCase();
        if (dom !== link.domain.toLowerCase()) {
          return res.status(403).json({ error: `Lenken er begrenset til @${link.domain}` });
        }
      }

      // Sjekk om bruker finnes — hvis ja, oppdater vendorId/role; ellers opprett
      const lowerEmail = String(email).toLowerCase();
      const [existing] = await db.select().from(users).where(eq(users.email, lowerEmail)).limit(1);

      let userIdForAssignment: string | null = null;
      if (existing) {
        if (existing.vendorId && Number(existing.vendorId) !== link.vendorId) {
          return res.status(409).json({ error: "E-posten er allerede tilknyttet en annen bedrift" });
        }
        await db.update(users).set({
          vendorId: link.vendorId,
          role: link.role,
          firstName: firstName || existing.firstName,
          lastName: lastName || existing.lastName,
          updatedAt: new Date(),
        }).where(eq(users.id, existing.id));
        userIdForAssignment = String(existing.id);
      } else {
        const [created] = await db.insert(users).values({
          email: lowerEmail,
          firstName: firstName || null,
          lastName: lastName || null,
          role: link.role,
          vendorId: link.vendorId,
        }).returning();
        userIdForAssignment = String(created.id);
      }

      // Pre-tildel saker hvis konfigurert på lenken
      const preassignSakIds = Array.isArray(link.sakIds) ? (link.sakIds as string[]) : [];
      if (preassignSakIds.length > 0 && userIdForAssignment) {
        try {
          const targetSaker = await db.select().from(saker).where(inArray(saker.id, preassignSakIds));
          for (const sak of targetSaker) {
            if (Number(sak.vendorId) !== link.vendorId) continue; // safety
            const current = Array.isArray(sak.tildelteUserId) ? (sak.tildelteUserId as any[]).map(String) : [];
            if (!current.includes(userIdForAssignment)) {
              const next = [...current, userIdForAssignment];
              // Lagre som number[] for konsistens med annen kode
              const asNumbers = next.map(id => {
                const n = Number(id);
                return Number.isFinite(n) ? n : id;
              });
              await db.update(saker)
                .set({ tildelteUserId: asNumbers as any, updatedAt: new Date() })
                .where(eq(saker.id, sak.id));
            }
          }
        } catch (sakErr) {
          console.error("Pre-assign saker failed:", sakErr);
        }
      }

      // Bump used_count
      await db.update(vendorInviteLinks)
        .set({ usedCount: (link.usedCount ?? 0) + 1 })
        .where(eq(vendorInviteLinks.id, link.id));

      // Send magic-link via emailService (best-effort)
      try {
        const loginUrl = buildEmailLoginUrl(lowerEmail);
        const fullName = [firstName, lastName].filter(Boolean).join(" ") || lowerEmail;
        await emailService.sendEmailLoginLink(lowerEmail, fullName, loginUrl);
      } catch (mailErr) {
        console.error("Magic-link send failed in invite accept:", mailErr);
      }

      res.json({
        ok: true,
        message: "Velkommen! Sjekk e-posten din for innlogging.",
        email: lowerEmail,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── ADMIN: list ──────────────────────────────────────────────────────────

  app.get("/api/company/invite-links", requireAuth, async (req: Request, res: Response) => {
    try {
      if (!isVendorAdmin(req)) return res.status(403).json({ error: "Krever vendor_admin" });
      const vendorId = userVendorId(req);
      if (!vendorId) return res.status(400).json({ error: "Mangler vendor_id" });

      const rows = await db.select()
        .from(vendorInviteLinks)
        .where(eq(vendorInviteLinks.vendorId, vendorId))
        .orderBy(desc(vendorInviteLinks.createdAt));

      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── ADMIN: create ────────────────────────────────────────────────────────

  app.post("/api/company/invite-links", requireAuth, async (req: Request, res: Response) => {
    try {
      if (!isVendorAdmin(req)) return res.status(403).json({ error: "Krever vendor_admin" });
      const vendorId = userVendorId(req);
      if (!vendorId) return res.status(400).json({ error: "Mangler vendor_id" });

      const { role = "miljoarbeider", domain = null, expiresInDays = null, maxUses = null, note = null, sakIds = [] } = req.body ?? {};
      if (!ALLOWED_ROLES.includes(role)) return res.status(400).json({ error: "Ugyldig rolle" });
      const cleanSakIds = Array.isArray(sakIds) ? sakIds.filter(s => typeof s === "string") : [];

      let expiresAt: Date | null = null;
      if (expiresInDays && Number(expiresInDays) > 0) {
        expiresAt = new Date(Date.now() + Number(expiresInDays) * 24 * 60 * 60 * 1000);
      }

      const cleanDomain = domain ? String(domain).trim().replace(/^@/, "").toLowerCase() : null;

      const [row] = await db.insert(vendorInviteLinks).values({
        vendorId,
        token: genToken(),
        role,
        domain: cleanDomain,
        expiresAt,
        maxUses: maxUses ? Number(maxUses) : null,
        note: note || null,
        sakIds: cleanSakIds,
        createdBy: String(authedUser(req)?.id ?? ""),
      }).returning();

      res.status(201).json(row);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── ADMIN: update (toggle active / change note) ──────────────────────────

  app.patch("/api/company/invite-links/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      if (!isVendorAdmin(req)) return res.status(403).json({ error: "Krever vendor_admin" });
      const vendorId = userVendorId(req);
      if (!vendorId) return res.status(400).json({ error: "Mangler vendor_id" });

      const [existing] = await db.select().from(vendorInviteLinks).where(eq(vendorInviteLinks.id, req.params.id)).limit(1);
      if (!existing || existing.vendorId !== vendorId) return res.status(404).json({ error: "Ikke funnet" });

      const updates: any = {};
      if (typeof req.body?.active === "boolean") updates.active = req.body.active;
      if (typeof req.body?.note === "string") updates.note = req.body.note;

      if (Object.keys(updates).length === 0) return res.json(existing);

      const [row] = await db.update(vendorInviteLinks)
        .set(updates)
        .where(eq(vendorInviteLinks.id, req.params.id))
        .returning();
      res.json(row);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── ADMIN: delete ────────────────────────────────────────────────────────

  app.delete("/api/company/invite-links/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      if (!isVendorAdmin(req)) return res.status(403).json({ error: "Krever vendor_admin" });
      const vendorId = userVendorId(req);
      if (!vendorId) return res.status(400).json({ error: "Mangler vendor_id" });

      const [existing] = await db.select().from(vendorInviteLinks).where(eq(vendorInviteLinks.id, req.params.id)).limit(1);
      if (!existing || existing.vendorId !== vendorId) return res.status(404).json({ error: "Ikke funnet" });

      await db.delete(vendorInviteLinks).where(eq(vendorInviteLinks.id, req.params.id));
      res.status(204).send();
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}
