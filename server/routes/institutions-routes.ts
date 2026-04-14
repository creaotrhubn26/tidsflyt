/**
 * server/routes/institutions-routes.ts
 *
 * Vendor institutions: external organisations a vendor works with
 * (barnevern, NAV, kommune, private, etc.). Shared across all users in
 * the vendor; vendor_admin+ can manage; everyone can read.
 */

import type { Express, Request, Response } from 'express';
import { db } from '../db';
import { vendorInstitutions } from '@shared/schema';
import { eq, and, asc } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth';

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
}
