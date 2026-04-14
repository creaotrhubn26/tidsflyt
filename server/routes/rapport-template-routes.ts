/**
 * server/routes/rapport-template-routes.ts
 *
 * Rapport templates define the structure of a saksrapport — sections,
 * required fields, placeholders. System templates ship with Tidum;
 * vendors can clone and customize.
 */

import type { Express, Request, Response } from 'express';
import { db } from '../db';
import { rapportTemplates } from '@shared/schema';
import { eq, and, or, isNull, asc } from 'drizzle-orm';
import { requireAuth, ADMIN_ROLES } from '../middleware/auth';

function currentUser(req: Request) {
  return (req as any).authUser ?? (req as any).user ?? null;
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

export function registerRapportTemplateRoutes(app: Express) {
  /** GET /api/rapport-templates — system templates + current vendor's customs */
  app.get('/api/rapport-templates', requireAuth, async (req: Request, res: Response) => {
    try {
      const vendorId = userVendorId(req);
      const rows = await db
        .select()
        .from(rapportTemplates)
        .where(and(
          eq(rapportTemplates.isActive, true),
          or(
            isNull(rapportTemplates.vendorId),
            vendorId ? eq(rapportTemplates.vendorId, vendorId) : undefined,
          ),
        ))
        .orderBy(asc(rapportTemplates.name));
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /** GET /api/rapport-templates/:id — full template incl. sections */
  app.get('/api/rapport-templates/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      const [row] = await db
        .select()
        .from(rapportTemplates)
        .where(eq(rapportTemplates.id, req.params.id))
        .limit(1);
      if (!row) return res.status(404).json({ error: 'Ikke funnet' });

      const vendorId = userVendorId(req);
      if (!row.isSystem && row.vendorId !== vendorId) {
        return res.status(403).json({ error: 'Ingen tilgang' });
      }
      res.json(row);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /** POST /api/rapport-templates — create (vendor_admin+) */
  app.post('/api/rapport-templates', requireAuth, async (req: Request, res: Response) => {
    try {
      if (!isAdminRole(req)) return res.status(403).json({ error: 'Kun admin+ kan opprette maler' });
      const vendorId = userVendorId(req);
      if (!vendorId) return res.status(400).json({ error: 'Bruker mangler vendor_id' });

      const { name, slug, description, suggestedInstitutionType, sections, branding } = req.body;
      if (!name?.trim() || !slug?.trim()) {
        return res.status(400).json({ error: 'Navn og slug er påkrevd' });
      }
      if (!Array.isArray(sections) || sections.length === 0) {
        return res.status(400).json({ error: 'En mal må ha minst én seksjon' });
      }

      try {
        const [row] = await db
          .insert(rapportTemplates)
          .values({
            vendorId,
            slug: slug.trim(),
            name: name.trim(),
            description: description ?? null,
            suggestedInstitutionType: suggestedInstitutionType ?? null,
            sections,
            branding: branding ?? {},
            isSystem: false,
            createdBy: String(currentUser(req)?.id || ''),
          })
          .returning();
        res.status(201).json(row);
      } catch (e: any) {
        if (String(e?.code) === '23505') {
          return res.status(409).json({ error: 'Mal med samme slug finnes allerede' });
        }
        throw e;
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /** POST /api/rapport-templates/:id/clone — duplicate a system template for customisation */
  app.post('/api/rapport-templates/:id/clone', requireAuth, async (req: Request, res: Response) => {
    try {
      if (!isAdminRole(req)) return res.status(403).json({ error: 'Kun admin+ kan klone maler' });
      const vendorId = userVendorId(req);
      if (!vendorId) return res.status(400).json({ error: 'Bruker mangler vendor_id' });

      const [source] = await db
        .select()
        .from(rapportTemplates)
        .where(eq(rapportTemplates.id, req.params.id))
        .limit(1);
      if (!source) return res.status(404).json({ error: 'Mal finnes ikke' });

      const newSlug = `${source.slug}-kopi-${Date.now()}`;
      const [clone] = await db
        .insert(rapportTemplates)
        .values({
          vendorId,
          slug: newSlug,
          name: `${source.name} (kopi)`,
          description: source.description,
          suggestedInstitutionType: source.suggestedInstitutionType,
          sections: source.sections,
          branding: source.branding,
          isSystem: false,
          createdBy: String(currentUser(req)?.id || ''),
        })
        .returning();
      res.status(201).json(clone);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /** PATCH /api/rapport-templates/:id — edit (vendor-owned only) */
  app.patch('/api/rapport-templates/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      if (!isAdminRole(req)) return res.status(403).json({ error: 'Kun admin+ kan endre maler' });
      const vendorId = userVendorId(req);
      const [existing] = await db.select().from(rapportTemplates).where(eq(rapportTemplates.id, req.params.id)).limit(1);
      if (!existing) return res.status(404).json({ error: 'Ikke funnet' });
      if (existing.isSystem) {
        return res.status(403).json({ error: 'System-maler kan ikke redigeres — klon først' });
      }
      if (existing.vendorId !== vendorId) {
        return res.status(403).json({ error: 'Ingen tilgang' });
      }

      const updates: any = { ...req.body, updatedAt: new Date() };
      delete updates.id;
      delete updates.vendorId;
      delete updates.isSystem;
      delete updates.createdBy;
      delete updates.createdAt;

      const [row] = await db
        .update(rapportTemplates)
        .set(updates)
        .where(eq(rapportTemplates.id, req.params.id))
        .returning();
      res.json(row);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /** DELETE /api/rapport-templates/:id — soft delete via isActive */
  app.delete('/api/rapport-templates/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      if (!isAdminRole(req)) return res.status(403).json({ error: 'Kun admin+ kan slette maler' });
      const vendorId = userVendorId(req);
      const [existing] = await db.select().from(rapportTemplates).where(eq(rapportTemplates.id, req.params.id)).limit(1);
      if (!existing) return res.status(404).json({ error: 'Ikke funnet' });
      if (existing.isSystem) {
        return res.status(403).json({ error: 'System-maler kan ikke slettes' });
      }
      if (existing.vendorId !== vendorId) {
        return res.status(403).json({ error: 'Ingen tilgang' });
      }
      await db.update(rapportTemplates)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(rapportTemplates.id, req.params.id));
      res.status(204).send();
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}
