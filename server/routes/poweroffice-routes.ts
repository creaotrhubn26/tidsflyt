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
import { vendorIntegrations } from '@shared/schema';
import { and, eq } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth';
import {
  isPowerOfficeConfigured,
  verifyClientKey,
  PowerOfficeAuthError,
} from '../lib/poweroffice';

const ADMIN_ROLES = ['vendor_admin', 'tiltaksleder', 'teamleder', 'hovedadmin', 'admin', 'super_admin'];
const PROVIDER = 'poweroffice';

function currentUser(req: Request) {
  return (req as any).authUser ?? (req as any).user ?? null;
}
function userVendorId(req: Request): number | null {
  const u = currentUser(req);
  const v = u?.vendorId ?? u?.vendor_id;
  return v ? Number(v) : null;
}
function isAdmin(req: Request): boolean {
  const role = String(currentUser(req)?.role || '').toLowerCase().replace(/[\s-]/g, '_');
  return ADMIN_ROLES.includes(role);
}

function publicView(row: typeof vendorIntegrations.$inferSelect) {
  const { clientKey, ...rest } = row;
  return { ...rest, connected: true };
}

export function registerPowerOfficeRoutes(app: Express) {
  /** GET /api/integrations/poweroffice/status */
  app.get('/api/integrations/poweroffice/status', requireAuth, async (req: Request, res: Response) => {
    try {
      const vendorId = userVendorId(req);
      if (!vendorId) return res.json({ connected: false, serverConfigured: isPowerOfficeConfigured() });

      const [row] = await db
        .select()
        .from(vendorIntegrations)
        .where(and(eq(vendorIntegrations.vendorId, vendorId), eq(vendorIntegrations.provider, PROVIDER)))
        .limit(1);

      if (!row) return res.json({ connected: false, serverConfigured: isPowerOfficeConfigured() });
      return res.json({ ...publicView(row), serverConfigured: isPowerOfficeConfigured() });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /** POST /api/integrations/poweroffice/connect */
  app.post('/api/integrations/poweroffice/connect', requireAuth, async (req: Request, res: Response) => {
    try {
      if (!isAdmin(req)) return res.status(403).json({ error: 'Kun vendor admin+ kan koble til integrasjoner' });
      if (!isPowerOfficeConfigured()) {
        return res.status(503).json({ error: 'PowerOffice-integrasjon ikke konfigurert på serveren' });
      }

      const vendorId = userVendorId(req);
      if (!vendorId) return res.status(400).json({ error: 'Bruker mangler vendor_id' });

      const clientKey = String(req.body?.clientKey || '').trim();
      const label = req.body?.label ? String(req.body.label).trim() : null;
      if (!clientKey) return res.status(400).json({ error: 'clientKey er påkrevd' });

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
    } catch (e: any) {
      if (e instanceof PowerOfficeAuthError) {
        return res.status(502).json({ error: `PowerOffice auth: ${e.message}` });
      }
      res.status(500).json({ error: e.message });
    }
  });

  /** DELETE /api/integrations/poweroffice/disconnect */
  app.delete('/api/integrations/poweroffice/disconnect', requireAuth, async (req: Request, res: Response) => {
    try {
      if (!isAdmin(req)) return res.status(403).json({ error: 'Kun vendor admin+ kan koble fra' });
      const vendorId = userVendorId(req);
      if (!vendorId) return res.status(400).json({ error: 'Bruker mangler vendor_id' });

      await db
        .delete(vendorIntegrations)
        .where(and(eq(vendorIntegrations.vendorId, vendorId), eq(vendorIntegrations.provider, PROVIDER)));

      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /**
   * POST /api/integrations/poweroffice/push-timer
   * Stub. Returns 501 with a hint until the PowerOffice HourRegistrations
   * endpoint + mapping is implemented (Task #5, next iteration).
   */
  app.post('/api/integrations/poweroffice/push-timer', requireAuth, async (req: Request, res: Response) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Kun vendor admin+ kan pushe timer' });
    const vendorId = userVendorId(req);
    if (!vendorId) return res.status(400).json({ error: 'Bruker mangler vendor_id' });

    const [row] = await db
      .select()
      .from(vendorIntegrations)
      .where(and(eq(vendorIntegrations.vendorId, vendorId), eq(vendorIntegrations.provider, PROVIDER)))
      .limit(1);
    if (!row) return res.status(409).json({ error: 'Ikke tilkoblet PowerOffice' });

    res.status(501).json({
      error: 'push-timer ikke implementert ennå',
      hint: 'Neste iterasjon: map timesheet → HourRegistrations payload og POST til /HourRegistrations',
    });
  });
}
