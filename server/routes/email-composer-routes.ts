import type { Express, Request, Response } from 'express';
import { db, pool } from '../db';
import { emailService } from '../lib/email-service';
import { ExportService } from '../lib/export-service';
import { emailTemplates, emailSendHistory, logRow, users } from '@shared/schema';
import { eq, and, between, desc } from 'drizzle-orm';
import { format } from 'date-fns';
import { nb } from 'date-fns/locale';
import { requireAuth } from '../middleware/auth';

interface AuthRequest extends Request {
  user?: any;
  admin?: any;
}

// ── Helper: resolve tiltaksleder email for Reply-To ────────────────────

async function getTiltakslederEmail(userId: string): Promise<string | null> {
  try {
    // Fetch the sender's vendorId
    const [sender] = await db
      .select({ vendorId: users.vendorId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!sender?.vendorId) return null;

    // Find a tiltaksleder in the same vendor
    const [leader] = await db
      .select({ email: users.email })
      .from(users)
      .where(and(eq(users.vendorId, sender.vendorId), eq(users.role, 'tiltaksleder')))
      .limit(1);

    return leader?.email || null;
  } catch {
    return null;
  }
}

function resolveReplyTo(category: string | undefined, tiltakslederEmail: string | null, senderEmail: string | undefined): string | undefined {
  // Reports go to tiltaksleder, general/other go to support
  if (['timesheet', 'case-report', 'overtime'].includes(category || '')) {
    return tiltakslederEmail || process.env.SMTP_REPLY_TO || senderEmail;
  }
  return process.env.SMTP_REPLY_TO || senderEmail;
}

// ── Template variable replacement ──────────────────────────────────────

function replaceVariables(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || '');
}

// ── Routes ─────────────────────────────────────────────────────────────

export function registerEmailComposerRoutes(app: Express) {

  // ─ Get all active templates ───────────────────────────────────────────
  app.get('/api/email/templates', requireAuth, async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const user = authReq.user || authReq.admin;
      if (!user) return res.status(401).json({ error: 'Ikke autentisert' });

      const templates = await db
        .select()
        .from(emailTemplates)
        .where(eq(emailTemplates.isActive, true))
        .orderBy(emailTemplates.category, emailTemplates.name);

      res.json(templates);
    } catch (error: any) {
      console.error('Email templates fetch error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ─ Get single template ────────────────────────────────────────────────
  app.get('/api/email/templates/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const user = authReq.user || authReq.admin;
      if (!user) return res.status(401).json({ error: 'Ikke autentisert' });

      const id = parseInt(req.params.id);
      const [template] = await db
        .select()
        .from(emailTemplates)
        .where(eq(emailTemplates.id, id))
        .limit(1);

      if (!template) return res.status(404).json({ error: 'Mal ikke funnet' });
      res.json(template);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ─ Create new template ────────────────────────────────────────────────
  app.post('/api/email/templates', requireAuth, async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const user = authReq.user || authReq.admin;
      if (!user) return res.status(401).json({ error: 'Ikke autentisert' });

      const { name, subject, htmlContent, textContent, variables, category } = req.body;
      if (!name || !subject || !htmlContent) {
        return res.status(400).json({ error: 'Navn, emne og innhold er påkrevd' });
      }

      const slug = name
        .toLowerCase()
        .replace(/[æ]/g, 'ae').replace(/[ø]/g, 'o').replace(/[å]/g, 'a')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
        + '-' + Date.now().toString(36);

      const [created] = await db
        .insert(emailTemplates)
        .values({ name, slug, subject, htmlContent, textContent, variables: variables || [], category: category || 'general' })
        .returning();

      res.status(201).json(created);
    } catch (error: any) {
      console.error('Email template create error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ─ Update template ───────────────────────────────────────────────────
  app.put('/api/email/templates/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const user = authReq.user || authReq.admin;
      if (!user) return res.status(401).json({ error: 'Ikke autentisert' });

      const id = parseInt(req.params.id);
      const { name, subject, htmlContent, textContent, variables, category, isActive } = req.body;

      const [updated] = await db
        .update(emailTemplates)
        .set({ name, subject, htmlContent, textContent, variables, category, isActive, updatedAt: new Date() })
        .where(eq(emailTemplates.id, id))
        .returning();

      if (!updated) return res.status(404).json({ error: 'Mal ikke funnet' });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ─ Delete template ───────────────────────────────────────────────────
  app.delete('/api/email/templates/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const user = authReq.user || authReq.admin;
      if (!user) return res.status(401).json({ error: 'Ikke autentisert' });

      const id = parseInt(req.params.id);
      const [deleted] = await db
        .delete(emailTemplates)
        .where(eq(emailTemplates.id, id))
        .returning();

      if (!deleted) return res.status(404).json({ error: 'Mal ikke funnet' });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ─ Send email (composer) ─────────────────────────────────────────────
  app.post('/api/email/send', requireAuth, async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const user = authReq.user || authReq.admin;
      if (!user) return res.status(401).json({ error: 'Ikke autentisert' });

      const {
        toEmail,
        ccEmail,
        bccEmail,
        subject,
        body,
        templateId,
        templateVars,
        category,
        attachReport,
        reportType,
        periodStart,
        periodEnd,
        targetUserId,
        institutionName,
        recipientName,
      } = req.body;

      if (!toEmail || !subject) {
        return res.status(400).json({ error: 'Mottaker og emne er påkrevd' });
      }

      const senderId = user.id || user.email || 'unknown';
      const senderEmail = user.email;
      const senderName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.name || user.email || 'Ukjent';

      // Resolve dynamic Reply-To
      const tiltakslederEmail = await getTiltakslederEmail(senderId);
      const replyTo = resolveReplyTo(category, tiltakslederEmail, senderEmail);

      // If using a template, load and interpolate
      let finalSubject = subject;
      let finalHtml = body;
      let finalText = body?.replace(/<[^>]+>/g, '') || '';

      if (templateId) {
        const [tpl] = await db
          .select()
          .from(emailTemplates)
          .where(eq(emailTemplates.id, templateId))
          .limit(1);

        if (tpl) {
          const vars: Record<string, string> = {
            avsender: senderName,
            ...(templateVars || {}),
          };
          finalSubject = replaceVariables(tpl.subject, vars);
          finalHtml = replaceVariables(tpl.htmlContent, vars);
          finalText = tpl.textContent ? replaceVariables(tpl.textContent, vars) : finalHtml.replace(/<[^>]+>/g, '');
        }
      }

      // Optional: attach Excel report
      let attachments: Array<{ filename: string; content: Buffer; contentType: string }> | undefined;
      if (attachReport && reportType && periodStart && periodEnd) {
        try {
          const uid = targetUserId || senderId;
          const entries = await db
            .select()
            .from(logRow)
            .where(and(eq(logRow.userId, uid), between(logRow.date, periodStart, periodEnd)))
            .orderBy(logRow.date);

          const exportData = entries.map((e) => {
            const start = e.startTime || '';
            const end = e.endTime || '';
            const brk = parseFloat(e.breakHours || '0');
            let hours = 0;
            if (start && end) {
              const [sH, sM] = start.split(':').map(Number);
              const [eH, eM] = end.split(':').map(Number);
              hours = (eH * 60 + eM - sH * 60 - sM) / 60 - brk;
            }
            return {
              id: e.id,
              date: e.date?.toString() || '',
              startTime: start,
              endTime: end,
              breakHours: brk,
              activity: e.activity || '',
              title: e.title || '',
              project: e.project || '',
              place: e.place || '',
              notes: e.notes || '',
              hours: Math.max(0, hours),
            };
          });

          const reportLabels: Record<string, string> = { timesheet: 'Timeliste', 'case-report': 'Saksrapport', overtime: 'Overtidsrapport' };
          const reportLabel = reportLabels[reportType as keyof typeof reportLabels] || 'Rapport';
          const buffer = await ExportService.generateExcel(exportData, {
            startDate: periodStart,
            endDate: periodEnd,
            title: reportLabel,
            includeNotes: true,
          });

          attachments = [{
            filename: `${reportLabel.toLowerCase().replace(/\s/g, '_')}_${periodStart}_${periodEnd}.xlsx`,
            content: buffer,
            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          }];
        } catch (err) {
          console.warn('Could not generate report attachment:', err);
        }
      }

      // Send via SMTP
      const sent = await emailService.sendEmail({
        to: toEmail,
        cc: ccEmail || undefined,
        bcc: bccEmail || undefined,
        replyTo,
        subject: finalSubject,
        html: finalHtml,
        text: finalText,
        attachments,
      });

      // Record in history
      try {
        await db.insert(emailSendHistory).values({
          templateId: templateId || null,
          sentBy: senderId,
          recipientEmail: toEmail,
          recipientName: recipientName || null,
          ccEmail: ccEmail || null,
          bccEmail: bccEmail || null,
          subject: finalSubject,
          body: finalHtml,
          attachments: attachments ? attachments.map(a => ({ filename: a.filename })) : [],
          status: sent ? 'sent' : 'failed',
          sentAt: sent ? new Date() : null,
          errorMessage: sent ? null : 'SMTP send failed',
          metadata: { category, reportType, replyTo, institutionName: institutionName || null, targetUserId: targetUserId || null },
        });
      } catch (err) {
        console.warn('Could not log email send history:', err);
      }

      if (sent) {
        res.json({ success: true, message: `E-post sendt til ${toEmail}` });
      } else {
        res.status(503).json({ error: 'E-posttjenesten er ikke konfigurert', code: 'SMTP_NOT_CONFIGURED' });
      }
    } catch (error: any) {
      console.error('Email composer send error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ─ Sent history ──────────────────────────────────────────────────────
  app.get('/api/email/sent', requireAuth, async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const user = authReq.user || authReq.admin;
      if (!user) return res.status(401).json({ error: 'Ikke autentisert' });

      const userId = user.id || user.email;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);

      const history = await db
        .select()
        .from(emailSendHistory)
        .where(eq(emailSendHistory.sentBy, userId))
        .orderBy(desc(emailSendHistory.createdAt))
        .limit(limit);

      res.json(history);
    } catch (error: any) {
      console.error('Email sent history error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ─ Team members (for tiltaksleder to pick a user) ────────────────────
  app.get('/api/email/team-members', requireAuth, async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const user = authReq.user || authReq.admin;
      if (!user) return res.status(401).json({ error: 'Ikke autentisert' });

      const vendorId = user.vendorId;
      if (!vendorId) {
        // No vendor — return just the user themselves
        return res.json([{ id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName }]);
      }

      const members = await db
        .select({ id: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName, role: users.role })
        .from(users)
        .where(eq(users.vendorId, vendorId));

      res.json(members);
    } catch (error: any) {
      console.error('Team members fetch error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ─ Email status (SMTP availability) ──────────────────────────────────
  app.get('/api/email/status', (_req: Request, res: Response) => {
    res.json({ smtp: emailService.getIsConfigured() });
  });
}
