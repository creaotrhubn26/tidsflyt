/**
 * server/routes/poweroffice-routes.ts
 *
 * PowerOffice Go integration endpoints. The ClientKey is per-tenant and
 * pasted by a vendor admin; Tidum then uses it server-to-server via the
 * client_credentials OAuth flow.
 *
 * Endpoints (all mounted under /api/integrations/poweroffice):
 *   GET    /status        — is this vendor connected? returns row without clientKey
 *   POST   /connect       — { clientKey, label? } — verify + persist
 *   DELETE /disconnect    — remove stored clientKey for this vendor
 *   POST   /push-timer    — { month: 'YYYY-MM', userId? } — push time entries (stub)
 */

import type { Express, Request, Response } from 'express';
import { db } from '../db';
import { vendorIntegrations, users } from '@shared/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { requireSuperAdmin, requireVendorAuth } from '../custom-auth';
import {
  isPowerOfficeConfigured,
  verifyClientKey,
  PowerOfficeAuthError,
} from '../lib/poweroffice';
import { pushTimesheetToPowerOffice } from '../lib/poweroffice-push';
import {
  listMappings,
  upsertMapping,
  deleteMapping,
} from '../lib/poweroffice-mappings';
import {
  getPowerOfficeVisibility,
  setPowerOfficeVisibility,
} from '../lib/poweroffice-visibility';

const PROVIDER = 'poweroffice';
const MAPPABLE_ROLES = ['miljoarbeider', 'tiltaksleder', 'teamleder'];

function currentUser(req: Request) {
  return (req as any).authUser ?? (req as any).user ?? null;
}
function userVendorId(req: Request): number | null {
  const u = currentUser(req);
  const v = u?.vendorId ?? u?.vendor_id;
  return v ? Number(v) : null;
}
/**
 * Guard that short-circuits any vendor-scoped PO endpoint when the Tidum
 * super_admin has hidden the integration for this vendor.
 */
async function assertVendorVisibility(req: Request, res: Response, vendorId: number): Promise<boolean> {
  const visibility = await getPowerOfficeVisibility(vendorId);
  if (visibility.hidden) {
    res.status(403).json({
      error: 'PowerOffice-integrasjonen er midlertidig deaktivert for denne vendoren.',
      hidden: true,
    });
    return false;
  }
  return true;
}

async function isMappableVendorUser(userId: string, vendorId: number): Promise<boolean> {
  if (!userId || userId.length > 255) return false;
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(
      eq(users.id, userId),
      eq(users.vendorId, vendorId),
      inArray(users.role, MAPPABLE_ROLES),
    ))
    .limit(1);
  return !!row;
}

function publicView(row: typeof vendorIntegrations.$inferSelect) {
  const { clientKey, ...rest } = row;
  return { ...rest, connected: true };
}

export function registerPowerOfficeRoutes(app: Express) {
  /** GET /api/integrations/poweroffice/status */
  app.get('/api/integrations/poweroffice/status', requireVendorAuth, async (req: Request, res: Response) => {
    try {
      const vendorId = userVendorId(req);
      if (!vendorId) return res.status(403).json({ error: 'Bruker mangler vendor_id' });

      const visibility = await getPowerOfficeVisibility(vendorId);
      if (visibility.hidden) {
        return res.json({ connected: false, serverConfigured: false, hidden: true });
      }

      const [row] = await db
        .select()
        .from(vendorIntegrations)
        .where(and(eq(vendorIntegrations.vendorId, vendorId), eq(vendorIntegrations.provider, PROVIDER)))
        .limit(1);

      if (!row) {
        return res.json({
          connected: false,
          serverConfigured: isPowerOfficeConfigured(),
          hidden: visibility.hidden,
        });
      }
      return res.json({
        ...publicView(row),
        serverConfigured: isPowerOfficeConfigured(),
        hidden: visibility.hidden,
      });
    } catch (error) {
      console.error('[poweroffice] status failed', error);
      res.status(500).json({ error: 'Kunne ikke hente PowerOffice-status' });
    }
  });

  /**
   * PATCH /api/admin/vendors/:vendorId/poweroffice/visibility
   *
   * Tidum super_admin toggles PO-integrasjonens synlighet per vendor.
   * Body: { hidden: boolean, reason?: string }
   */
  app.patch('/api/admin/vendors/:vendorId/poweroffice/visibility', requireSuperAdmin, async (req: Request, res: Response) => {
    try {
      const vendorId = Number(req.params.vendorId);
      if (!Number.isInteger(vendorId) || vendorId <= 0) {
        return res.status(400).json({ error: 'Ugyldig vendor-id' });
      }
      const hidden = !!req.body?.hidden;
      const reason = typeof req.body?.reason === 'string' ? req.body.reason.slice(0, 500) : null;
      const actorEmail = currentUser(req)?.email ?? null;
      const state = await setPowerOfficeVisibility({ vendorId, hidden, actorEmail, reason });
      res.json({ vendorId, ...state });
    } catch (error) {
      console.error('[poweroffice] visibility update failed', error);
      res.status(500).json({ error: 'Kunne ikke oppdatere PowerOffice-synlighet' });
    }
  });

  /** POST /api/integrations/poweroffice/connect */
  app.post('/api/integrations/poweroffice/connect', requireVendorAuth, async (req: Request, res: Response) => {
    try {
      if (!isPowerOfficeConfigured()) {
        return res.status(503).json({ error: 'PowerOffice-integrasjon ikke konfigurert på serveren' });
      }

      const vendorId = userVendorId(req);
      if (!vendorId) return res.status(400).json({ error: 'Bruker mangler vendor_id' });
      if (!(await assertVendorVisibility(req, res, vendorId))) return;

      const clientKey = String(req.body?.clientKey || '').trim();
      const label = req.body?.label ? String(req.body.label).trim() : null;
      if (!clientKey || clientKey.length > 4096) return res.status(400).json({ error: 'Ugyldig clientKey' });
      if (label && label.length > 200) return res.status(400).json({ error: 'Label er for lang' });

      // Fail fast if the key doesn't actually work.
      const ok = await verifyClientKey(clientKey);
      if (!ok) return res.status(400).json({ error: 'ClientKey avvist av PowerOffice' });

      const now = new Date();
      const createdBy = currentUser(req)?.email || null;

      const [existing] = await db
        .select()
        .from(vendorIntegrations)
        .where(and(eq(vendorIntegrations.vendorId, vendorId), eq(vendorIntegrations.provider, PROVIDER)))
        .limit(1);

      let row;
      if (existing) {
        [row] = await db
          .update(vendorIntegrations)
          .set({
            clientKey,
            label,
            status: 'active',
            lastVerifiedAt: now,
            lastError: null,
            updatedAt: now,
          })
          .where(eq(vendorIntegrations.id, existing.id))
          .returning();
      } else {
        [row] = await db
          .insert(vendorIntegrations)
          .values({
            vendorId,
            provider: PROVIDER,
            clientKey,
            label,
            status: 'active',
            lastVerifiedAt: now,
            createdBy,
          })
          .returning();
      }

      res.json(publicView(row));
    } catch (error) {
      if (error instanceof PowerOfficeAuthError) {
        return res.status(502).json({ error: 'PowerOffice avviste autentiseringen' });
      }
      console.error('[poweroffice] connect failed', error);
      res.status(500).json({ error: 'Kunne ikke koble til PowerOffice' });
    }
  });

  /** DELETE /api/integrations/poweroffice/disconnect */
  app.delete('/api/integrations/poweroffice/disconnect', requireVendorAuth, async (req: Request, res: Response) => {
    try {
      const vendorId = userVendorId(req);
      if (!vendorId) return res.status(400).json({ error: 'Bruker mangler vendor_id' });
      if (!(await assertVendorVisibility(req, res, vendorId))) return;

      await db
        .delete(vendorIntegrations)
        .where(and(eq(vendorIntegrations.vendorId, vendorId), eq(vendorIntegrations.provider, PROVIDER)));

      res.json({ ok: true });
    } catch (error) {
      console.error('[poweroffice] disconnect failed', error);
      res.status(500).json({ error: 'Kunne ikke koble fra PowerOffice' });
    }
  });

  /**
   * POST /api/integrations/poweroffice/push-timer
   *
   * Body: { month: "YYYY-MM", userId?: string }
   * Pusher godkjente timelister for måneden til PowerOffice Go som
   * HourRegistrations. Returnerer telling + feildetaljer per entry.
   */
  app.post('/api/integrations/poweroffice/push-timer', requireVendorAuth, async (req: Request, res: Response) => {
    try {
      const vendorId = userVendorId(req);
      if (!vendorId) return res.status(400).json({ error: 'Bruker mangler vendor_id' });
      if (!(await assertVendorVisibility(req, res, vendorId))) return;

      const month = String(req.body?.month || '').trim();
      if (!/^\d{4}-\d{2}$/.test(month)) {
        return res.status(400).json({ error: 'month må være YYYY-MM' });
      }
      const userIdFilter = req.body?.userId ? String(req.body.userId) : undefined;
      if (userIdFilter && !(await isMappableVendorUser(userIdFilter, vendorId))) {
        return res.status(404).json({ error: 'Bruker ikke funnet' });
      }

      const result = await pushTimesheetToPowerOffice({ vendorId, month, userIdFilter });
      const httpStatus = result.failed > 0 && result.pushed === 0 ? 502 : 200;
      res.status(httpStatus).json(result);
    } catch (error) {
      console.error('[poweroffice] timesheet push failed', error);
      res.status(500).json({ error: 'Kunne ikke pushe timeliste til PowerOffice' });
    }
  });

  // ── Employee mapping CRUD ──────────────────────────────────────────────

  /** GET /api/integrations/poweroffice/mappings */
  app.get('/api/integrations/poweroffice/mappings', requireVendorAuth, async (req: Request, res: Response) => {
    try {
      const vendorId = userVendorId(req);
      if (!vendorId) return res.status(400).json({ error: 'Mangler vendor_id' });
      if (!(await assertVendorVisibility(req, res, vendorId))) return;
      const rows = await listMappings(vendorId);
      res.json(rows);
    } catch (error) {
      console.error('[poweroffice] mapping list failed', error);
      res.status(500).json({ error: 'Kunne ikke hente PowerOffice-mappinger' });
    }
  });

  /** POST /api/integrations/poweroffice/mappings — upsert { tidumUserId, poEmployeeId, employeeName? } */
  app.post('/api/integrations/poweroffice/mappings', requireVendorAuth, async (req: Request, res: Response) => {
    try {
      const vendorId = userVendorId(req);
      if (!vendorId) return res.status(400).json({ error: 'Mangler vendor_id' });
      if (!(await assertVendorVisibility(req, res, vendorId))) return;
      const tidumUserId = String(req.body?.tidumUserId || '').trim();
      const poEmployeeId = String(req.body?.poEmployeeId || '').trim();
      if (!tidumUserId || !poEmployeeId) {
        return res.status(400).json({ error: 'tidumUserId og poEmployeeId er påkrevd' });
      }
      if (poEmployeeId.length > 255) return res.status(400).json({ error: 'Ugyldig poEmployeeId' });
      if (!(await isMappableVendorUser(tidumUserId, vendorId))) {
        return res.status(404).json({ error: 'Bruker ikke funnet' });
      }
      const employeeName = req.body?.employeeName == null ? null : String(req.body.employeeName).trim();
      if (employeeName && employeeName.length > 255) {
        return res.status(400).json({ error: 'Ansattnavn er for langt' });
      }
      const row = await upsertMapping({
        vendorId,
        tidumUserId,
        poEmployeeId,
        employeeName,
      });
      res.json(row);
    } catch (error) {
      console.error('[poweroffice] mapping upsert failed', error);
      res.status(500).json({ error: 'Kunne ikke lagre PowerOffice-mapping' });
    }
  });

  /** DELETE /api/integrations/poweroffice/mappings/:tidumUserId */
  app.delete('/api/integrations/poweroffice/mappings/:tidumUserId', requireVendorAuth, async (req: Request, res: Response) => {
    try {
      const vendorId = userVendorId(req);
      if (!vendorId) return res.status(400).json({ error: 'Mangler vendor_id' });
      if (!(await assertVendorVisibility(req, res, vendorId))) return;
      const ok = await deleteMapping(vendorId, req.params.tidumUserId);
      if (!ok) return res.status(404).json({ error: 'Ikke funnet' });
      res.status(204).send();
    } catch (error) {
      console.error('[poweroffice] mapping delete failed', error);
      res.status(500).json({ error: 'Kunne ikke slette PowerOffice-mapping' });
    }
  });

  /**
   * GET /api/integrations/poweroffice/vendor-users
   *
   * Returnerer brukerne i denne vendor som er aktuelle for time-push
   * (miljoarbeider + tiltaksleder), sammen med eventuell eksisterende
   * PO-mapping. Brukes til å fylle mapping-tabellen i UI-en.
   */
  app.get('/api/integrations/poweroffice/vendor-users', requireVendorAuth, async (req: Request, res: Response) => {
    try {
      const vendorId = userVendorId(req);
      if (!vendorId) return res.status(400).json({ error: 'Mangler vendor_id' });
      if (!(await assertVendorVisibility(req, res, vendorId))) return;

      const rows = await db
        .select({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          role: users.role,
        })
        .from(users)
        .where(and(
          eq(users.vendorId, vendorId as any),
          inArray(users.role, MAPPABLE_ROLES),
        ));

      const mappings = await listMappings(vendorId);
      const mapByUserId = new Map(mappings.map(m => [m.tidumUserId, m]));

      const enriched = rows.map(u => {
        const m = mapByUserId.get(String(u.id));
        return {
          id: u.id,
          email: u.email,
          firstName: u.firstName,
          lastName: u.lastName,
          role: u.role,
          poEmployeeId: m?.poEmployeeId ?? null,
          mappingUpdatedAt: m?.updatedAt ?? null,
        };
      });

      enriched.sort((a, b) => {
        // Unmapped first, then alphabetical
        const am = a.poEmployeeId ? 1 : 0;
        const bm = b.poEmployeeId ? 1 : 0;
        if (am !== bm) return am - bm;
        const an = `${a.lastName ?? ''} ${a.firstName ?? ''} ${a.email ?? ''}`.trim();
        const bn = `${b.lastName ?? ''} ${b.firstName ?? ''} ${b.email ?? ''}`.trim();
        return an.localeCompare(bn, 'nb-NO');
      });

      res.json(enriched);
    } catch (error) {
      console.error('[poweroffice] vendor user list failed', error);
      res.status(500).json({ error: 'Kunne ikke hente virksomhetens brukere' });
    }
  });

  /**
   * POST /api/integrations/poweroffice/test
   * Re-verifiserer tenantens ClientKey ved å exchange for et nytt token.
   * Oppdaterer lastVerifiedAt + clearer lastError hvis ok.
   */
  app.post('/api/integrations/poweroffice/test', requireVendorAuth, async (req: Request, res: Response) => {
    try {
      const vendorId = userVendorId(req);
      if (!vendorId) return res.status(400).json({ error: 'Mangler vendor_id' });
      if (!(await assertVendorVisibility(req, res, vendorId))) return;

      const [row] = await db
        .select()
        .from(vendorIntegrations)
        .where(and(eq(vendorIntegrations.vendorId, vendorId), eq(vendorIntegrations.provider, PROVIDER)))
        .limit(1);
      if (!row) return res.status(409).json({ error: 'Ikke tilkoblet PowerOffice' });

      const ok = await verifyClientKey(row.clientKey);
      const now = new Date();
      if (ok) {
        await db
          .update(vendorIntegrations)
          .set({ lastVerifiedAt: now, lastError: null, status: 'active', updatedAt: now })
          .where(eq(vendorIntegrations.id, row.id));
        return res.json({ ok: true, verifiedAt: now.toISOString() });
      } else {
        await db
          .update(vendorIntegrations)
          .set({ status: 'invalid', lastError: 'Tilkobling feilet ved test', updatedAt: now })
          .where(eq(vendorIntegrations.id, row.id));
        return res.status(502).json({ ok: false, error: 'PowerOffice avviste ClientKey' });
      }
    } catch (error) {
      console.error('[poweroffice] connection test failed', error);
      res.status(500).json({ error: 'Kunne ikke teste PowerOffice-tilkoblingen' });
    }
  });
}
