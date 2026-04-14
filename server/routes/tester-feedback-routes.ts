/**
 * server/routes/tester-feedback-routes.ts
 *
 * Feedback from prototype testers. Testers submit via a contextual modal on
 * any page; super admins review/reply in an admin panel.
 */

import type { Express, Request, Response } from 'express';
import { db } from '../db';
import { testerFeedback } from '@shared/schema';
import { eq, desc, and, sql } from 'drizzle-orm';
import { requireAuth, ADMIN_ROLES } from '../middleware/auth';

function currentUser(req: Request): { id: string; email?: string; role?: string } | null {
  const u = (req as any).authUser ?? (req as any).user;
  return u?.id ? { id: String(u.id), email: u.email, role: u.role } : null;
}

function isAdminRole(req: Request): boolean {
  const role = String(((req as any).authUser ?? (req as any).user)?.role || '')
    .toLowerCase().replace(/[\s-]/g, '_');
  return ADMIN_ROLES.includes(role) || role === 'super_admin';
}

export function registerTesterFeedbackRoutes(app: Express) {
  /** POST /api/tester-feedback — anyone authenticated can submit */
  app.post('/api/tester-feedback', requireAuth, async (req: Request, res: Response) => {
    try {
      const user = currentUser(req)!;
      const {
        message, category, severity,
        pagePath, pageTitle, userAgent,
        viewportWidth, viewportHeight,
        stepsToReproduce, screenshotDataUrl, extraContext,
        fullName, email,
      } = req.body;

      if (!message || !String(message).trim()) {
        return res.status(400).json({ error: 'message er påkrevd' });
      }
      const allowedCats = ['bug', 'idea', 'praise', 'other'];
      const allowedSev = ['low', 'medium', 'high', 'critical'];

      // Guard against huge screenshots — accept up to ~3 MB of data URL
      let sanitizedScreenshot: string | null = null;
      if (typeof screenshotDataUrl === 'string' && screenshotDataUrl.startsWith('data:image/')) {
        sanitizedScreenshot = screenshotDataUrl.length <= 3 * 1024 * 1024 ? screenshotDataUrl : null;
      }

      const [row] = await db
        .insert(testerFeedback)
        .values({
          userId: user.id,
          email: email ?? user.email ?? null,
          fullName: fullName ?? null,
          message: String(message).trim(),
          category: allowedCats.includes(category) ? category : 'other',
          severity: allowedSev.includes(severity) ? severity : 'medium',
          pagePath: pagePath ? String(pagePath).slice(0, 300) : null,
          pageTitle: pageTitle ? String(pageTitle).slice(0, 300) : null,
          userAgent: userAgent ? String(userAgent).slice(0, 400) : null,
          viewportWidth: Number.isFinite(viewportWidth) ? viewportWidth : null,
          viewportHeight: Number.isFinite(viewportHeight) ? viewportHeight : null,
          stepsToReproduce: stepsToReproduce ? String(stepsToReproduce).slice(0, 4000) : null,
          screenshotDataUrl: sanitizedScreenshot,
          extraContext: (extraContext && typeof extraContext === 'object') ? extraContext : {},
          status: 'new',
        })
        .returning();

      res.status(201).json({ id: row.id, status: row.status });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /** GET /api/tester-feedback — own feedback (or all, if super_admin) */
  app.get('/api/tester-feedback', requireAuth, async (req: Request, res: Response) => {
    try {
      const user = currentUser(req)!;
      const status = req.query.status as string | undefined;
      const category = req.query.category as string | undefined;

      const conditions = [] as any[];
      // Non-admins only see their own feedback
      if (!isAdminRole(req)) {
        conditions.push(eq(testerFeedback.userId, user.id));
      }
      if (status) conditions.push(eq(testerFeedback.status, status));
      if (category) conditions.push(eq(testerFeedback.category, category));

      const rows = await db
        .select()
        .from(testerFeedback)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(testerFeedback.createdAt))
        .limit(500);

      // Don't ship huge screenshot dataURLs in list view — truncate
      const light = rows.map(r => ({
        ...r,
        screenshotDataUrl: r.screenshotDataUrl ? `[${r.screenshotDataUrl.length} bytes]` : null,
      }));
      res.json(light);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /** GET /api/tester-feedback/:id — full record incl. screenshot */
  app.get('/api/tester-feedback/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      const user = currentUser(req)!;
      const [row] = await db.select().from(testerFeedback).where(eq(testerFeedback.id, req.params.id)).limit(1);
      if (!row) return res.status(404).json({ error: 'Ikke funnet' });
      if (!isAdminRole(req) && row.userId !== user.id) {
        return res.status(403).json({ error: 'Ingen tilgang' });
      }
      res.json(row);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /** PATCH /api/tester-feedback/:id — admin updates status/notes/reply */
  app.patch('/api/tester-feedback/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      if (!isAdminRole(req)) return res.status(403).json({ error: 'Kun admin' });
      const { status, severity, adminNotes, adminReply } = req.body;

      const patch: any = { updatedAt: new Date() };
      if (status && ['new','in_review','planned','resolved','wontfix'].includes(status)) {
        patch.status = status;
        if (status === 'resolved') patch.resolvedAt = new Date();
      }
      if (severity && ['low','medium','high','critical'].includes(severity)) {
        patch.severity = severity;
      }
      if (adminNotes !== undefined) patch.adminNotes = adminNotes;
      if (adminReply !== undefined) {
        patch.adminReply = adminReply;
        patch.repliedAt = new Date();
      }

      const [row] = await db
        .update(testerFeedback)
        .set(patch)
        .where(eq(testerFeedback.id, req.params.id))
        .returning();
      if (!row) return res.status(404).json({ error: 'Ikke funnet' });
      res.json(row);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /** GET /api/tester-feedback-stats — counts by status/category (admin) */
  app.get('/api/tester-feedback-stats', requireAuth, async (req: Request, res: Response) => {
    try {
      if (!isAdminRole(req)) return res.status(403).json({ error: 'Kun admin' });
      const rows = await db
        .select({
          status: testerFeedback.status,
          category: testerFeedback.category,
          count: sql<number>`count(*)::int`,
        })
        .from(testerFeedback)
        .groupBy(testerFeedback.status, testerFeedback.category);
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}
