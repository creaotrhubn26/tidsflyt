/**
 * server/routes/archive-routes.ts
 *
 * Noark 5-arkivintegrasjon (Documaster). Endepunkter:
 *
 *   GET    /api/integrations/arkiv/status        — vendorens config (uten secret)
 *   POST   /api/integrations/arkiv/connect       — verifiser + lagre config
 *   DELETE /api/integrations/arkiv/disconnect    — fjern config
 *   GET    /api/integrations/arkiv/entries       — arkivlogg for vendoren
 *   POST   /api/integrations/arkiv/entries/:id/retry — manuell retry
 *   POST   /api/rapporter/:id/arkiver            — manuell arkivering av rapport
 *
 * Cron: hvert 5. minutt prosesseres forfalte outbox-rader (backoff ved feil).
 */

import type { Express, Request, Response } from "express";
import cron from "node-cron";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { archiveConfigs, archiveEntries, rapporter, saker } from "@shared/schema";
import { requireAuth } from "../middleware/auth";
import { sealSecret } from "../lib/secret-box";
import { createArchiveProvider } from "../lib/archive/documaster-client";
import {
  getArchiveConfig,
  processDueArchiveEntries,
  queueRapportArchiving,
  retryArchiveEntry,
} from "../lib/archive/archive-service";

// Config-endring krever admin på vendoren; innsyn/manuell arkivering kan
// også tiltaksleder/teamleder (de eier godkjenningsflyten).
const CONFIG_ROLES = ["vendor_admin", "hovedadmin", "admin", "super_admin"];
const OPERATE_ROLES = [...CONFIG_ROLES, "tiltaksleder", "teamleder", "case_manager"];

function currentUser(req: Request) {
  return (req as any).authUser ?? (req as any).user ?? null;
}
function userVendorId(req: Request): number | null {
  const u = currentUser(req);
  const v = u?.vendorId ?? u?.vendor_id;
  return v ? Number(v) : null;
}
function hasRole(req: Request, roles: string[]): boolean {
  const role = String(currentUser(req)?.role || "").toLowerCase().replace(/[\s-]/g, "_");
  return roles.includes(role);
}

function publicView(row: typeof archiveConfigs.$inferSelect) {
  const { clientSecret, ...rest } = row;
  return { ...rest, connected: true };
}

export function registerArchiveRoutes(app: Express) {
  /** GET /api/integrations/arkiv/status */
  app.get("/api/integrations/arkiv/status", requireAuth, async (req: Request, res: Response) => {
    try {
      if (!hasRole(req, OPERATE_ROLES)) return res.json({ connected: false, hidden: true });
      const vendorId = userVendorId(req);
      if (!vendorId) return res.json({ connected: false });
      const cfg = await getArchiveConfig(vendorId);
      if (!cfg) return res.json({ connected: false });
      return res.json(publicView(cfg));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /**
   * POST /api/integrations/arkiv/connect
   * Body: { provider?, baseUrl, clientId, clientSecret, arkivdelId?,
   *         journalenhet?, skjermingshjemmel?, tilgangsrestriksjon?, autoArchive? }
   */
  app.post("/api/integrations/arkiv/connect", requireAuth, async (req: Request, res: Response) => {
    try {
      if (!hasRole(req, CONFIG_ROLES)) return res.status(403).json({ error: "Kun admin kan koble til arkiv" });
      const vendorId = userVendorId(req);
      if (!vendorId) return res.status(400).json({ error: "Bruker mangler vendor" });

      const {
        provider = "documaster",
        baseUrl,
        clientId,
        clientSecret,
        arkivdelId,
        journalenhet,
        skjermingshjemmel,
        tilgangsrestriksjon,
        autoArchive,
      } = req.body ?? {};

      if (!baseUrl || !clientId || !clientSecret) {
        return res.status(400).json({ error: "baseUrl, clientId og clientSecret er påkrevd" });
      }
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(String(baseUrl));
      } catch {
        return res.status(400).json({ error: "baseUrl er ikke en gyldig URL" });
      }
      if (parsedUrl.protocol !== "https:") {
        return res.status(400).json({ error: "baseUrl må bruke https" });
      }

      // Verifiser tilkoblingen før noe lagres.
      try {
        await createArchiveProvider(String(provider), {
          baseUrl: String(baseUrl),
          clientId: String(clientId),
          clientSecret: String(clientSecret),
          arkivdelId: arkivdelId ? String(arkivdelId) : undefined,
        }).verify();
      } catch (verifyErr: any) {
        return res.status(422).json({
          error: `Kunne ikke verifisere arkivtilkoblingen: ${verifyErr?.message ?? verifyErr}`,
        });
      }

      const values = {
        vendorId,
        provider: String(provider),
        baseUrl: String(baseUrl),
        clientId: String(clientId),
        clientSecret: sealSecret(String(clientSecret)),
        arkivdelId: arkivdelId ? String(arkivdelId) : null,
        journalenhet: journalenhet ? String(journalenhet) : null,
        ...(skjermingshjemmel ? { skjermingshjemmel: String(skjermingshjemmel) } : {}),
        ...(tilgangsrestriksjon ? { tilgangsrestriksjon: String(tilgangsrestriksjon) } : {}),
        autoArchive: autoArchive !== false,
        status: "active" as const,
        lastVerifiedAt: new Date(),
        lastError: null,
        createdBy: String(currentUser(req)?.id ?? ""),
        updatedAt: new Date(),
      };

      const [row] = await db
        .insert(archiveConfigs)
        .values(values)
        .onConflictDoUpdate({ target: archiveConfigs.vendorId, set: values })
        .returning();

      res.json(publicView(row));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /** DELETE /api/integrations/arkiv/disconnect */
  app.delete("/api/integrations/arkiv/disconnect", requireAuth, async (req: Request, res: Response) => {
    try {
      if (!hasRole(req, CONFIG_ROLES)) return res.status(403).json({ error: "Kun admin kan koble fra arkiv" });
      const vendorId = userVendorId(req);
      if (!vendorId) return res.status(400).json({ error: "Bruker mangler vendor" });
      await db.delete(archiveConfigs).where(eq(archiveConfigs.vendorId, vendorId));
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /** GET /api/integrations/arkiv/entries?status=pending|archived|failed */
  app.get("/api/integrations/arkiv/entries", requireAuth, async (req: Request, res: Response) => {
    try {
      if (!hasRole(req, OPERATE_ROLES)) return res.status(403).json({ error: "Ikke tilgang" });
      const vendorId = userVendorId(req);
      if (!vendorId) return res.status(400).json({ error: "Bruker mangler vendor" });

      const status = req.query.status ? String(req.query.status) : null;
      const conditions = status
        ? and(eq(archiveEntries.vendorId, vendorId), eq(archiveEntries.status, status))
        : eq(archiveEntries.vendorId, vendorId);

      const rows = await db
        .select()
        .from(archiveEntries)
        .where(conditions)
        .orderBy(desc(archiveEntries.createdAt))
        .limit(200);
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /** POST /api/integrations/arkiv/entries/:id/retry */
  app.post("/api/integrations/arkiv/entries/:id/retry", requireAuth, async (req: Request, res: Response) => {
    try {
      if (!hasRole(req, OPERATE_ROLES)) return res.status(403).json({ error: "Ikke tilgang" });
      const vendorId = userVendorId(req);
      if (!vendorId) return res.status(400).json({ error: "Bruker mangler vendor" });
      const entry = await retryArchiveEntry(String(req.params.id), vendorId);
      if (!entry) return res.status(404).json({ error: "Fant ingen rad å prøve på nytt" });
      res.json(entry);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /**
   * POST /api/rapporter/:id/arkiver — manuell arkivering av godkjent rapport.
   * Vendor-scopet via rapportens sak.
   */
  app.post("/api/rapporter/:id/arkiver", requireAuth, async (req: Request, res: Response) => {
    try {
      if (!hasRole(req, OPERATE_ROLES)) return res.status(403).json({ error: "Ikke tilgang" });
      const vendorId = userVendorId(req);
      if (!vendorId) return res.status(400).json({ error: "Bruker mangler vendor" });

      const [rapport] = await db.select().from(rapporter).where(eq(rapporter.id, String(req.params.id))).limit(1);
      if (!rapport) return res.status(404).json({ error: "Rapport ikke funnet" });
      if (!["godkjent", "arkivert"].includes(String(rapport.status))) {
        return res.status(409).json({ error: "Kun godkjente rapporter kan arkiveres" });
      }
      if (!rapport.sakId) return res.status(409).json({ error: "Rapporten er ikke knyttet til en sak" });
      const [sak] = await db.select().from(saker).where(eq(saker.id, rapport.sakId)).limit(1);
      if (!sak || sak.vendorId !== vendorId) return res.status(404).json({ error: "Rapport ikke funnet" });

      const result = await queueRapportArchiving(rapport.id, "manual", String(currentUser(req)?.id ?? ""));
      if (!result.queued && result.reason !== "Allerede arkivert") {
        return res.status(422).json({ error: result.reason });
      }
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}

let cronStarted = false;
export function setupArchiveCron() {
  if (cronStarted) return;
  cron.schedule("*/5 * * * *", async () => {
    try {
      const { processed, archived } = await processDueArchiveEntries(10);
      if (processed > 0) console.log(`📁 Arkiv-cron: ${archived}/${processed} arkivert`);
    } catch (err) {
      console.error("[arkiv] cron feilet:", err);
    }
  });
  cronStarted = true;
  console.log("✅ Arkiv-cron aktiv (hvert 5. minutt)");
}
