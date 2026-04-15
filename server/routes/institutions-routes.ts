/**
 * server/routes/institutions-routes.ts
 *
 * Vendor institutions: external organisations a vendor works with
 * (barnevern, NAV, kommune, private, etc.). Shared across all users in
 * the vendor; vendor_admin+ can manage; everyone can read.
 */

import type { Express, Request, Response } from 'express';
import { db } from '../db';
import { vendorInstitutions, saker, rapporter, rapportAktiviteter } from '@shared/schema';
import { eq, and, asc, sql, inArray, between } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth';
import { format, startOfMonth, endOfMonth } from 'date-fns';

const ADMIN_ROLES = ['vendor_admin', 'tiltaksleder', 'teamleder', 'hovedadmin', 'admin', 'super_admin'];

function currentUser(req: Request) {
  const u = (req as any).authUser ?? (req as any).user;
  return u || null;
}
function isAdminRole(req: Request): boolean {
  const role = String(currentUser(req)?.role || '').toLowerCase().replace(/[\s-]/g, '_');
  return ADMIN_ROLES.includes(role);
}
function userVendorId(req: Request): number | null {
  const u = currentUser(req);
  const vId = u?.vendorId ?? u?.vendor_id;
  return vId ? Number(vId) : null;
}

const VALID_TYPES = ['barnevern', 'nav', 'kommune', 'privat', 'helsevesen', 'annet'];

export function registerInstitutionsRoutes(app: Express) {
  /** GET /api/institutions — list active institutions for current vendor */
  app.get('/api/institutions', requireAuth, async (req: Request, res: Response) => {
    try {
      const vendorId = userVendorId(req);
      if (!vendorId) return res.json([]);
      const rows = await db
        .select()
        .from(vendorInstitutions)
        .where(eq(vendorInstitutions.vendorId, vendorId))
        .orderBy(asc(vendorInstitutions.name));
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /** POST /api/institutions — vendor_admin+ */
  app.post('/api/institutions', requireAuth, async (req: Request, res: Response) => {
    try {
      if (!isAdminRole(req)) return res.status(403).json({ error: 'Kun vendor admin+ kan opprette' });
      const vendorId = userVendorId(req);
      if (!vendorId) return res.status(400).json({ error: 'Bruker mangler vendor_id' });

      const {
        name, orgNumber, institutionType,
        contactPerson, contactEmail, contactPhone, address,
        autoForwardRapport, forwardEmail, overtimeApplicable,
        notes, brregVerified,
      } = req.body;

      if (!name?.trim()) return res.status(400).json({ error: 'Navn er påkrevd' });
      if (orgNumber && !/^\d{9}$/.test(String(orgNumber))) {
        return res.status(400).json({ error: 'Organisasjonsnummer må være 9 siffer' });
      }
      if (institutionType && !VALID_TYPES.includes(institutionType)) {
        return res.status(400).json({ error: 'Ugyldig institusjonstype' });
      }
      if (autoForwardRapport && !forwardEmail) {
        return res.status(400).json({ error: 'Auto-videresending krever en e-postadresse' });
      }

      try {
        const [row] = await db
          .insert(vendorInstitutions)
          .values({
            vendorId,
            name: name.trim(),
            orgNumber: orgNumber || null,
            institutionType: institutionType || null,
            contactPerson: contactPerson || null,
            contactEmail: contactEmail || null,
            contactPhone: contactPhone || null,
            address: address || null,
            autoForwardRapport: !!autoForwardRapport,
            forwardEmail: forwardEmail || null,
            overtimeApplicable: overtimeApplicable !== false,
            notes: notes || null,
            brregVerified: !!brregVerified,
            createdBy: String(currentUser(req)?.id || ''),
          })
          .returning();
        res.status(201).json(row);
      } catch (e: any) {
        if (String(e?.code) === '23505') {
          return res.status(409).json({ error: 'Institusjon med samme org-nr finnes allerede' });
        }
        throw e;
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /**
   * POST /api/institutions/bulk — CSV-drevet bulk-import
   * Body: { rows: Array<{ name: string, orgNumber?, institutionType?, contactEmail?, forwardEmail?, autoForwardRapport?: boolean, notes? }> }
   * Returnerer { created, skipped: [{row,reason}], failed: [{row,error}] }.
   */
  app.post('/api/institutions/bulk', requireAuth, async (req: Request, res: Response) => {
    try {
      if (!isAdminRole(req)) return res.status(403).json({ error: 'Kun vendor admin+ kan opprette' });
      const vendorId = userVendorId(req);
      if (!vendorId) return res.status(400).json({ error: 'Bruker mangler vendor_id' });

      const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
      if (rows.length === 0) return res.status(400).json({ error: 'Ingen rader mottatt' });
      if (rows.length > 200) return res.status(400).json({ error: 'Maks 200 rader per bulk-import' });

      let created = 0;
      const skipped: any[] = [];
      const failed: any[] = [];

      for (const raw of rows) {
        const name = String(raw?.name ?? '').trim();
        if (!name) { skipped.push({ row: raw, reason: 'Mangler navn' }); continue; }

        const orgNumber = raw.orgNumber ? String(raw.orgNumber).replace(/\s+/g, '') : null;
        if (orgNumber && !/^\d{9}$/.test(orgNumber)) {
          skipped.push({ row: raw, reason: 'Org-nr må være 9 siffer' }); continue;
        }
        const institutionType = raw.institutionType || null;
        if (institutionType && !VALID_TYPES.includes(institutionType)) {
          skipped.push({ row: raw, reason: 'Ugyldig type' }); continue;
        }
        const autoForward = !!raw.autoForwardRapport;
        if (autoForward && !raw.forwardEmail) {
          skipped.push({ row: raw, reason: 'Auto-forward krever forwardEmail' }); continue;
        }

        try {
          await db.insert(vendorInstitutions).values({
            vendorId,
            name,
            orgNumber,
            institutionType,
            contactPerson: raw.contactPerson || null,
            contactEmail: raw.contactEmail || null,
            contactPhone: raw.contactPhone || null,
            address: raw.address || null,
            autoForwardRapport: autoForward,
            forwardEmail: raw.forwardEmail || null,
            overtimeApplicable: raw.overtimeApplicable !== false,
            notes: raw.notes || null,
            brregVerified: !!raw.brregVerified,
            createdBy: String(currentUser(req)?.id || ''),
          });
          created++;
        } catch (e: any) {
          if (String(e?.code) === '23505') {
            skipped.push({ row: raw, reason: 'Duplikat (org-nr finnes)' });
          } else {
            failed.push({ row: raw, error: e?.message ?? String(e) });
          }
        }
      }

      res.json({ created, skipped, failed });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /** PATCH /api/institutions/:id — vendor_admin+ (own vendor only) */
  app.patch('/api/institutions/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      if (!isAdminRole(req)) return res.status(403).json({ error: 'Kun vendor admin+ kan endre' });
      const vendorId = userVendorId(req);
      if (!vendorId) return res.status(400).json({ error: 'Bruker mangler vendor_id' });

      const [existing] = await db
        .select()
        .from(vendorInstitutions)
        .where(eq(vendorInstitutions.id, req.params.id))
        .limit(1);
      if (!existing) return res.status(404).json({ error: 'Ikke funnet' });
      if (existing.vendorId !== vendorId) {
        return res.status(403).json({ error: 'Ingen tilgang' });
      }

      const updates: any = { ...req.body, updatedAt: new Date() };
      delete updates.id;
      delete updates.vendorId;
      delete updates.createdAt;
      delete updates.createdBy;

      if (updates.orgNumber && !/^\d{9}$/.test(String(updates.orgNumber))) {
        return res.status(400).json({ error: 'Organisasjonsnummer må være 9 siffer' });
      }
      if (updates.institutionType && !VALID_TYPES.includes(updates.institutionType)) {
        return res.status(400).json({ error: 'Ugyldig institusjonstype' });
      }
      if (updates.autoForwardRapport && !(updates.forwardEmail || existing.forwardEmail)) {
        return res.status(400).json({ error: 'Auto-videresending krever en e-postadresse' });
      }

      const [row] = await db
        .update(vendorInstitutions)
        .set(updates)
        .where(eq(vendorInstitutions.id, req.params.id))
        .returning();
      res.json(row);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /** DELETE /api/institutions/:id — vendor_admin+ (soft via active=false to preserve history) */
  app.delete('/api/institutions/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      if (!isAdminRole(req)) return res.status(403).json({ error: 'Kun vendor admin+ kan slette' });
      const vendorId = userVendorId(req);
      if (!vendorId) return res.status(400).json({ error: 'Bruker mangler vendor_id' });

      const [existing] = await db
        .select()
        .from(vendorInstitutions)
        .where(eq(vendorInstitutions.id, req.params.id))
        .limit(1);
      if (!existing || existing.vendorId !== vendorId) {
        return res.status(404).json({ error: 'Ikke funnet' });
      }

      // Hard delete by default; saker.institution_id will be set to NULL via FK
      await db.delete(vendorInstitutions).where(eq(vendorInstitutions.id, req.params.id));
      res.status(204).send();
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /**
   * GET /api/institutions/stats
   * Per-institution counts: active saker, rapporter sent this month,
   * approved hours total. Used on the /institusjoner page.
   */
  app.get('/api/institutions/stats', requireAuth, async (req: Request, res: Response) => {
    try {
      const vendorId = userVendorId(req);
      if (!vendorId) return res.json([]);

      const institutions = await db
        .select()
        .from(vendorInstitutions)
        .where(eq(vendorInstitutions.vendorId, vendorId));
      if (institutions.length === 0) return res.json([]);

      const instIds = institutions.map(i => i.id);
      const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');
      const monthEnd = format(endOfMonth(new Date()), 'yyyy-MM-dd');

      // 1. Active sak count per institution
      const sakRows = await db
        .select({
          institutionId: saker.institutionId,
          count: sql<number>`count(*)::int`,
        })
        .from(saker)
        .where(and(
          eq(saker.vendorId, vendorId),
          inArray(saker.institutionId, instIds),
        ))
        .groupBy(saker.institutionId);

      // 2. Rapporter (this month) per institution — joined via sak
      const rapportRows = await db
        .select({
          institutionId: saker.institutionId,
          status: rapporter.status,
          count: sql<number>`count(*)::int`,
        })
        .from(rapporter)
        .innerJoin(saker, eq(saker.id, rapporter.sakId))
        .where(and(
          eq(saker.vendorId, vendorId),
          inArray(saker.institutionId, instIds),
          between(rapporter.periodeFrom, monthStart, monthEnd),
        ))
        .groupBy(saker.institutionId, rapporter.status);

      // 3. Approved hours per institution (sum of activity minutes / 60)
      const hoursRows = await db
        .select({
          institutionId: saker.institutionId,
          mins: sql<number>`coalesce(sum(${rapportAktiviteter.varighet}), 0)::int`,
        })
        .from(rapportAktiviteter)
        .innerJoin(rapporter, eq(rapporter.id, rapportAktiviteter.rapportId))
        .innerJoin(saker, eq(saker.id, rapporter.sakId))
        .where(and(
          eq(saker.vendorId, vendorId),
          inArray(saker.institutionId, instIds),
          eq(rapporter.status, 'godkjent'),
        ))
        .groupBy(saker.institutionId);

      const sakMap = new Map(sakRows.map(r => [r.institutionId, r.count]));
      const hoursMap = new Map(hoursRows.map(r => [r.institutionId, Math.round((r.mins ?? 0) / 60 * 10) / 10]));

      // Aggregate rapporter by institution + status
      const rapportMap = new Map<string, Record<string, number>>();
      for (const row of rapportRows) {
        if (!row.institutionId) continue;
        const bucket = rapportMap.get(row.institutionId) ?? {};
        bucket[row.status ?? 'unknown'] = row.count;
        rapportMap.set(row.institutionId, bucket);
      }

      const stats = institutions.map(inst => {
        const r = rapportMap.get(inst.id) ?? {};
        const total = Object.values(r).reduce((s, n) => s + n, 0);
        return {
          institutionId: inst.id,
          activeSaker: sakMap.get(inst.id) ?? 0,
          rapporterThisMonth: {
            total,
            utkast: r.utkast ?? 0,
            til_godkjenning: r.til_godkjenning ?? 0,
            godkjent: r.godkjent ?? 0,
            returnert: r.returnert ?? 0,
          },
          approvedHoursTotal: hoursMap.get(inst.id) ?? 0,
        };
      });

      res.json(stats);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}
