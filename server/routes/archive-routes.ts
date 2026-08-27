/**
 * server/routes/archive-routes.ts
 *
 * Noark 5-arkivintegrasjon (Documaster eller Elements). Endepunkter:
 *
 *   GET    /api/integrations/arkiv/status        — tenantens config (uten secret)
 *   POST   /api/integrations/arkiv/connect       — verifiser + lagre config
 *   DELETE /api/integrations/arkiv/disconnect    — fjern config
 *   GET    /api/integrations/arkiv/entries       — tenantens arkivlogg
 *   POST   /api/integrations/arkiv/entries/:id/retry — manuell retry
 *   POST   /api/rapporter/:id/arkiver            — manuell arkivering av rapport
 *
 * Cron: hvert 5. minutt prosesseres forfalte outbox-rader (backoff ved feil).
 */

import type { Express, Request, Response } from "express";
import cron from "node-cron";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { archiveCaseLinks, archiveConfigs, archiveEntries, rapporter, saker, users } from "@shared/schema";
import { requireAuth } from "../middleware/auth";
import { openSecret, sealSecret } from "../lib/secret-box";
import {
  archiveProviderCapabilities,
  createArchiveProvider,
  defaultContractProfile,
  normalizeArchiveProvider,
} from "../lib/archive/archive-provider";
import { validateArchiveBaseUrl, validateArchiveEndpointUrl } from "../lib/archive/archive-url-policy";
import {
  getArchiveConfigForTenant,
  processDueArchiveEntries,
  queueRapportArchiving,
  retryArchiveEntry,
  withArchiveTenantDb,
  type ArchiveTenant,
} from "../lib/archive/archive-service";

// Config-endring krever vendor-admin eller kommunens barnevernsleder;
// innsyn/manuell arkivering kan også operative roller i samme tenant.
const CONFIG_ROLES = ["vendor_admin", "hovedadmin", "admin", "super_admin", "barnevernsleder"];
const OPERATE_ROLES = [...CONFIG_ROLES, "tiltaksleder", "teamleder", "case_manager", "kommune_saksbehandler"];

function currentUser(req: Request) {
  return (req as any).authUser ?? (req as any).user ?? null;
}
type ArchiveActor = { id: string; role: string; tenant: ArchiveTenant | null };
async function resolveArchiveActor(req: Request): Promise<ArchiveActor | null> {
  const id = String(currentUser(req)?.id ?? "").trim();
  if (!id) return null;
  const [row] = await db
    .select({ id: users.id, role: users.role, vendorId: users.vendorId, kommuneId: users.kommuneId })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!row) return null;
  const vendorId = row.vendorId == null ? null : Number(row.vendorId);
  const kommuneId = row.kommuneId == null ? null : Number(row.kommuneId);
  if ((vendorId == null) === (kommuneId == null)) return null;
  return {
    id: String(row.id),
    role: String(row.role || "").toLowerCase().replace(/[\s-]/g, "_"),
    tenant: kommuneId != null ? { kommuneId } : { vendorId: vendorId! },
  };
}
function tenantCondition(tenant: ArchiveTenant) {
  return tenant.kommuneId != null
    ? eq(archiveEntries.kommuneId, tenant.kommuneId)
    : eq(archiveEntries.vendorId, tenant.vendorId);
}
function configTenantCondition(tenant: ArchiveTenant) {
  return tenant.kommuneId != null
    ? eq(archiveConfigs.kommuneId, tenant.kommuneId)
    : eq(archiveConfigs.vendorId, tenant.vendorId);
}
function caseLinkTenantCondition(tenant: ArchiveTenant) {
  return tenant.kommuneId != null
    ? eq(archiveCaseLinks.kommuneId, tenant.kommuneId)
    : eq(archiveCaseLinks.vendorId, tenant.vendorId);
}
function hasRole(actor: ArchiveActor | null, roles: string[]): boolean {
  return actor != null && roles.includes(actor.role);
}

async function hasActiveArchiveEntries(tenant: ArchiveTenant): Promise<boolean> {
  return withArchiveTenantDb(tenant, async (scopedDb) => {
    const [activeEntry] = await scopedDb
      .select({ id: archiveEntries.id })
      .from(archiveEntries)
      .where(and(
        tenantCondition(tenant),
        inArray(archiveEntries.status, ["pending", "processing"]),
      ))
      .limit(1);
    return activeEntry != null;
  });
}

function publicView(row: typeof archiveConfigs.$inferSelect) {
  const { clientSecret, ...rest } = row;
  return { ...rest, connected: true, availableProviders: archiveProviderCapabilities() };
}

function disconnectedView() {
  return { connected: false, availableProviders: archiveProviderCapabilities() };
}

function archiveRouteError(res: Response, operation: string, error: unknown): Response {
  console.error(`[archive] ${operation} failed`, error instanceof Error ? error.message : "unknown");
  return res.status(500).json({ error: "Arkivoperasjonen kunne ikke fullføres" });
}

export function registerArchiveRoutes(app: Express) {
  /** GET /api/integrations/arkiv/status */
  app.get("/api/integrations/arkiv/status", requireAuth, async (req: Request, res: Response) => {
    try {
      const actor = await resolveArchiveActor(req);
      if (!hasRole(actor, OPERATE_ROLES)) return res.json({ connected: false, hidden: true });
      const tenant = actor?.tenant;
      if (!tenant) return res.json(disconnectedView());
      const cfg = await getArchiveConfigForTenant(tenant);
      if (!cfg) return res.json(disconnectedView());
      return res.json(publicView(cfg));
    } catch (error) {
      archiveRouteError(res, "status", error);
    }
  });

  /**
   * POST /api/integrations/arkiv/connect
   * Body: { provider?, contractProfile?, externalIdMetadataKey?, baseUrl,
   *         tokenUrl?, clientId, clientSecret, arkivdelId?, journalenhet?,
   *         klasseId?, skjermingshjemmel?, tilgangsrestriksjon?, autoArchive? }
   */
  app.post("/api/integrations/arkiv/connect", requireAuth, async (req: Request, res: Response) => {
    try {
      const actor = await resolveArchiveActor(req);
      if (!hasRole(actor, CONFIG_ROLES)) return res.status(403).json({ error: "Kun admin kan koble til arkiv" });
      const tenant = actor?.tenant;
      if (!tenant) return res.status(400).json({ error: "Bruker mangler entydig arkivtenant" });

      const {
        provider = "documaster",
        baseUrl,
        tokenUrl,
        clientId,
        clientSecret,
        arkivdelId,
        journalenhet,
        klasseId,
        skjermingshjemmel,
        tilgangsrestriksjon,
        autoArchive,
        contractProfile,
        externalIdMetadataKey,
      } = req.body ?? {};

      let normalizedProvider;
      try {
        normalizedProvider = normalizeArchiveProvider(provider);
      } catch {
        return res.status(400).json({ error: "Ukjent arkivprovider" });
      }
      const normalizedContractProfile = String(
        contractProfile || defaultContractProfile(normalizedProvider),
      ).trim();
      const normalizedExternalIdKey = normalizedProvider === "elements"
        ? String(externalIdMetadataKey ?? "").trim() || null
        : null;
      const existingConfig = await getArchiveConfigForTenant(tenant);

      if (!baseUrl || !clientId || !clientSecret) {
        return res.status(400).json({ error: "baseUrl, clientId og clientSecret er påkrevd" });
      }
      const normalizedBaseUrl = String(baseUrl).trim();
      const tokenUrlValue = String(tokenUrl ?? "").trim();
      const normalizedTokenUrl = tokenUrlValue || null;
      try {
        validateArchiveBaseUrl(normalizedBaseUrl);
      } catch {
        return res.status(400).json({ error: "baseUrl er ikke en godkjent HTTPS-adresse for arkiv" });
      }
      if (normalizedTokenUrl) {
        try {
          validateArchiveEndpointUrl(normalizedTokenUrl);
        } catch {
          return res.status(400).json({ error: "tokenUrl er ikke en godkjent HTTPS-adresse for arkiv-IDP" });
        }
      }

      const targetChanged = existingConfig != null && (
        existingConfig.provider !== normalizedProvider
        || existingConfig.contractProfile !== normalizedContractProfile
        || existingConfig.externalIdMetadataKey !== normalizedExternalIdKey
        || existingConfig.baseUrl !== normalizedBaseUrl
        || existingConfig.arkivdelId !== (arkivdelId ? String(arkivdelId) : null)
        || existingConfig.klasseId !== (klasseId ? String(klasseId) : null)
      );
      if (targetChanged) {
        if (await hasActiveArchiveEntries(tenant)) {
          return res.status(409).json({
            error: "Arkivmål kan ikke byttes mens arkiveringer venter eller behandles",
          });
        }
      }

      // Verifiser tilkoblingen før noe lagres.
      try {
        await createArchiveProvider(normalizedProvider, {
          baseUrl: normalizedBaseUrl,
          tokenUrl: normalizedTokenUrl,
          clientId: String(clientId),
          clientSecret: String(clientSecret),
          arkivdelId: arkivdelId ? String(arkivdelId) : undefined,
          klasseId: klasseId ? String(klasseId) : undefined,
          journalenhet: journalenhet ? String(journalenhet) : undefined,
          contractProfile: normalizedContractProfile,
          externalIdMetadataKey: normalizedExternalIdKey,
        }).verify();
      } catch (verifyErr: any) {
        return res.status(422).json({
          error: `Kunne ikke verifisere arkivtilkoblingen: ${verifyErr?.message ?? verifyErr}`,
        });
      }

      const values = {
        vendorId: tenant.vendorId ?? null,
        kommuneId: tenant.kommuneId ?? null,
        provider: normalizedProvider,
        contractProfile: normalizedContractProfile,
        externalIdMetadataKey: normalizedExternalIdKey,
        baseUrl: normalizedBaseUrl,
        tokenUrl: normalizedTokenUrl,
        clientId: String(clientId),
        clientSecret: sealSecret(String(clientSecret)),
        arkivdelId: arkivdelId ? String(arkivdelId) : null,
        journalenhet: journalenhet ? String(journalenhet) : null,
        klasseId: klasseId ? String(klasseId) : null,
        ...(skjermingshjemmel ? { skjermingshjemmel: String(skjermingshjemmel) } : {}),
        ...(tilgangsrestriksjon ? { tilgangsrestriksjon: String(tilgangsrestriksjon) } : {}),
        autoArchive: autoArchive !== false,
        status: "active" as const,
        lastVerifiedAt: new Date(),
        lastError: null,
        createdBy: actor!.id,
        updatedAt: new Date(),
      };

      const row = await withArchiveTenantDb(tenant, async (tx) => {
        if (targetChanged) {
          await tx.delete(archiveCaseLinks).where(caseLinkTenantCondition(tenant));
        }
        const [saved] = tenant.kommuneId != null
          ? await tx.insert(archiveConfigs).values(values)
            .onConflictDoUpdate({ target: archiveConfigs.kommuneId, set: values }).returning()
          : await tx.insert(archiveConfigs).values(values)
            .onConflictDoUpdate({ target: archiveConfigs.vendorId, set: values }).returning();
        return saved;
      });

      res.json(publicView(row));
    } catch (error) {
      archiveRouteError(res, "connect", error);
    }
  });

  /**
   * PATCH /api/integrations/arkiv/settings
   * Oppdater bare innstillinger som ikke endrer det verifiserte arkivmålet.
   * Body: { autoArchive?, skjermingshjemmel?, tilgangsrestriksjon? }
   */
  app.patch("/api/integrations/arkiv/settings", requireAuth, async (req: Request, res: Response) => {
    try {
      const actor = await resolveArchiveActor(req);
      if (!hasRole(actor, CONFIG_ROLES)) return res.status(403).json({ error: "Kun admin kan endre arkivinnstillinger" });
      const tenant = actor?.tenant;
      if (!tenant) return res.status(400).json({ error: "Bruker mangler entydig arkivtenant" });

      const body = req.body ?? {};
      const targetFields = [
        "provider", "contractProfile", "externalIdMetadataKey", "baseUrl", "tokenUrl",
        "clientId", "clientSecret", "arkivdelId", "journalenhet", "klasseId",
      ];
      if (targetFields.some((field) => Object.prototype.hasOwnProperty.call(body, field))) {
        return res.status(400).json({
          error: "Arkivmål og tilkoblingsdetaljer må endres gjennom verifisert tilkobling",
        });
      }
      const { autoArchive, skjermingshjemmel, tilgangsrestriksjon } = body;
      const set: Record<string, unknown> = { updatedAt: new Date() };
      if (typeof autoArchive === "boolean") set.autoArchive = autoArchive;
      if (skjermingshjemmel !== undefined) set.skjermingshjemmel = String(skjermingshjemmel);
      if (tilgangsrestriksjon !== undefined) set.tilgangsrestriksjon = String(tilgangsrestriksjon);
      if (Object.keys(set).length === 1) return res.status(400).json({ error: "Ingen felter å oppdatere" });

      const row = await withArchiveTenantDb(tenant, async (scopedDb) => {
        const [updated] = await scopedDb
          .update(archiveConfigs)
          .set(set)
          .where(configTenantCondition(tenant))
          .returning();
        return updated;
      });
      if (!row) return res.status(404).json({ error: "Ingen arkivkobling å oppdatere" });
      res.json(publicView(row));
    } catch (error) {
      archiveRouteError(res, "settings", error);
    }
  });

  /** POST /api/integrations/arkiv/test — verifiser lagret tilkobling. */
  app.post("/api/integrations/arkiv/test", requireAuth, async (req: Request, res: Response) => {
    try {
      const actor = await resolveArchiveActor(req);
      if (!hasRole(actor, OPERATE_ROLES)) return res.status(403).json({ error: "Ikke tilgang" });
      const tenant = actor?.tenant;
      if (!tenant) return res.status(400).json({ error: "Bruker mangler entydig arkivtenant" });
      const cfg = await getArchiveConfigForTenant(tenant);
      if (!cfg) return res.status(404).json({ error: "Ingen arkivkobling konfigurert" });

      try {
        validateArchiveBaseUrl(cfg.baseUrl);
        if (cfg.tokenUrl) validateArchiveEndpointUrl(cfg.tokenUrl);
        await createArchiveProvider(cfg.provider, {
          baseUrl: cfg.baseUrl,
          tokenUrl: cfg.tokenUrl,
          clientId: cfg.clientId,
          clientSecret: openSecret(cfg.clientSecret),
          arkivdelId: cfg.arkivdelId,
          klasseId: cfg.klasseId,
          journalenhet: cfg.journalenhet,
          contractProfile: cfg.contractProfile,
          externalIdMetadataKey: cfg.externalIdMetadataKey,
        }).verify();
        const row = await withArchiveTenantDb(tenant, async (scopedDb) => {
          const [updated] = await scopedDb
            .update(archiveConfigs)
            .set({ lastVerifiedAt: new Date(), lastError: null, status: "active", updatedAt: new Date() })
            .where(configTenantCondition(tenant))
            .returning();
          return updated;
        });
        res.json(publicView(row));
      } catch (verifyErr: any) {
        const message = String(verifyErr?.message ?? verifyErr);
        await withArchiveTenantDb(tenant, (scopedDb) => scopedDb
          .update(archiveConfigs)
          .set({ lastError: message.slice(0, 2000), updatedAt: new Date() })
          .where(configTenantCondition(tenant)));
        res.status(422).json({ error: `Tilkoblingstest feilet: ${message}` });
      }
    } catch (error) {
      archiveRouteError(res, "test", error);
    }
  });

  /** DELETE /api/integrations/arkiv/disconnect */
  app.delete("/api/integrations/arkiv/disconnect", requireAuth, async (req: Request, res: Response) => {
    try {
      const actor = await resolveArchiveActor(req);
      if (!hasRole(actor, CONFIG_ROLES)) return res.status(403).json({ error: "Kun admin kan koble fra arkiv" });
      const tenant = actor?.tenant;
      if (!tenant) return res.status(400).json({ error: "Bruker mangler entydig arkivtenant" });
      if (await hasActiveArchiveEntries(tenant)) {
        return res.status(409).json({
          error: "Arkivet kan ikke kobles fra mens arkiveringer venter eller behandles",
        });
      }
      await withArchiveTenantDb(tenant, async (tx) => {
        await tx.delete(archiveCaseLinks).where(caseLinkTenantCondition(tenant));
        await tx.delete(archiveConfigs).where(configTenantCondition(tenant));
      });
      res.json({ ok: true });
    } catch (error) {
      archiveRouteError(res, "disconnect", error);
    }
  });

  /** GET /api/integrations/arkiv/entries?status=pending|archived|failed */
  app.get("/api/integrations/arkiv/entries", requireAuth, async (req: Request, res: Response) => {
    try {
      const actor = await resolveArchiveActor(req);
      if (!hasRole(actor, OPERATE_ROLES)) return res.status(403).json({ error: "Ikke tilgang" });
      const tenant = actor?.tenant;
      if (!tenant) return res.status(400).json({ error: "Bruker mangler entydig arkivtenant" });

      const status = req.query.status ? String(req.query.status) : null;
      if (status && !["pending", "processing", "archived", "failed", "skipped"].includes(status)) {
        return res.status(400).json({ error: "Ugyldig arkivstatus" });
      }
      const conditions = status
        ? and(tenantCondition(tenant), eq(archiveEntries.status, status))
        : tenantCondition(tenant);

      const rows = await withArchiveTenantDb(tenant, (scopedDb) => scopedDb
        .select()
        .from(archiveEntries)
        .where(conditions)
        .orderBy(desc(archiveEntries.createdAt))
        .limit(200));
      res.json(rows);
    } catch (error) {
      archiveRouteError(res, "entries", error);
    }
  });

  /** POST /api/integrations/arkiv/entries/:id/retry */
  app.post("/api/integrations/arkiv/entries/:id/retry", requireAuth, async (req: Request, res: Response) => {
    try {
      const actor = await resolveArchiveActor(req);
      if (!hasRole(actor, OPERATE_ROLES)) return res.status(403).json({ error: "Ikke tilgang" });
      const tenant = actor?.tenant;
      if (!tenant) return res.status(400).json({ error: "Bruker mangler entydig arkivtenant" });
      const entry = await retryArchiveEntry(String(req.params.id), tenant);
      if (!entry) return res.status(404).json({ error: "Fant ingen rad å prøve på nytt" });
      res.json(entry);
    } catch (error) {
      archiveRouteError(res, "retry", error);
    }
  });

  /**
   * POST /api/rapporter/:id/arkiver — manuell arkivering av godkjent rapport.
   * Vendor-scopet via rapportens sak.
   */
  app.post("/api/rapporter/:id/arkiver", requireAuth, async (req: Request, res: Response) => {
    try {
      const actor = await resolveArchiveActor(req);
      if (!hasRole(actor, OPERATE_ROLES)) return res.status(403).json({ error: "Ikke tilgang" });
      const vendorId = actor?.tenant?.vendorId;
      if (!vendorId) return res.status(400).json({ error: "Denne arkivhandlingen krever en leverandørtenant" });

      const [rapport] = await db.select().from(rapporter).where(eq(rapporter.id, String(req.params.id))).limit(1);
      if (!rapport) return res.status(404).json({ error: "Rapport ikke funnet" });
      if (!["godkjent", "arkivert"].includes(String(rapport.status))) {
        return res.status(409).json({ error: "Kun godkjente rapporter kan arkiveres" });
      }
      if (!rapport.sakId) return res.status(409).json({ error: "Rapporten er ikke knyttet til en sak" });
      const [sak] = await db.select().from(saker).where(eq(saker.id, rapport.sakId)).limit(1);
      if (!sak || sak.vendorId !== vendorId) return res.status(404).json({ error: "Rapport ikke funnet" });

      const result = await queueRapportArchiving(rapport.id, "manual", actor!.id);
      if (!result.queued && result.reason !== "Allerede arkivert") {
        return res.status(422).json({ error: result.reason });
      }
      res.json(result);
    } catch (error) {
      archiveRouteError(res, "rapport archive", error);
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
