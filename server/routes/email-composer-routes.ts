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

      // Seed a starter library on first read so new vendors see useful defaults.
      await ensureSeedTemplates();

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
        attachments: attachmentList,
        draftId, // when sending from a saved draft, delete it on success
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
          // Escape the user's plain-text body so it becomes safe HTML for {{melding}}.
          // Line breaks → <br/> so paragraphs survive.
          const escapeHtml = (s: string) =>
            s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
             .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
          const bodyText = (templateVars?.melding ?? body ?? '').trim();
          const meldingHtml = bodyText ? escapeHtml(bodyText).replace(/\n/g, '<br/>') : '';

          const vars: Record<string, string> = {
            avsender: senderName,
            mottaker: recipientName || '',
            ...(templateVars || {}),
            melding: meldingHtml,
          };
          const textVars: Record<string, string> = { ...vars, melding: bodyText };
          finalSubject = replaceVariables(tpl.subject, vars);
          finalHtml = replaceVariables(tpl.htmlContent, vars);
          finalText = tpl.textContent ? replaceVariables(tpl.textContent, textVars) : finalHtml.replace(/<[^>]+>/g, '');
        }
      }

      // Resolve user-provided attachments (uploaded files via /api/cms/upload).
      const userAttachments = await resolveAttachments(attachmentList);

      // Optional: attach Excel report
      let attachments: Array<{ filename: string; content: Buffer; contentType: string }> | undefined =
        userAttachments.length > 0 ? [...userAttachments] : undefined;
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

          // Append the report to whatever the user already attached.
          const reportAttachment = {
            filename: `${reportLabel.toLowerCase().replace(/\s/g, '_')}_${periodStart}_${periodEnd}.xlsx`,
            content: buffer,
            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          };
          attachments = attachments ? [...attachments, reportAttachment] : [reportAttachment];
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

      // Clean up the saved draft if this send originated from one.
      if (sent && draftId) {
        try {
          await ensureDraftsTable();
          await pool.query(
            `DELETE FROM email_drafts WHERE id = $1 AND user_id = $2`,
            [draftId, senderId],
          );
        } catch (e) {
          console.warn('Could not delete draft after send:', e);
        }
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
    res.json({ smtp: emailService.getIsConfigured(), ai: !!process.env.OPENAI_API_KEY });
  });

  // ════════════════════════════════════════════════════════════════════
  //  DRAFTS + SCHEDULED SEND
  // ════════════════════════════════════════════════════════════════════

  let draftsTableReady = false;
  async function ensureDraftsTable() {
    if (draftsTableReady) return;
    await pool.query(`
      CREATE TABLE IF NOT EXISTS email_drafts (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        to_email TEXT,
        cc_email TEXT,
        bcc_email TEXT,
        subject TEXT,
        body TEXT,
        template_id INTEGER,
        recipient_name TEXT,
        institution_name TEXT,
        attachments JSONB DEFAULT '[]'::jsonb,
        send_at TIMESTAMPTZ,
        sent_at TIMESTAMPTZ,
        status TEXT DEFAULT 'draft',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_email_drafts_user ON email_drafts (user_id, status, updated_at DESC);');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_email_drafts_send_at ON email_drafts (status, send_at);');
    draftsTableReady = true;
  }

  /** Lazy-promote any scheduled drafts whose time has passed.
   *  Called on every drafts/sent read so we don't need a separate worker. */
  async function autoSendScheduled() {
    try {
      await ensureDraftsTable();
      const due = await pool.query(
        `SELECT * FROM email_drafts
          WHERE status = 'scheduled' AND send_at IS NOT NULL AND send_at <= NOW()
          ORDER BY send_at ASC LIMIT 20`,
      );
      for (const d of due.rows) {
        try {
          // Look up sender info — drafts only store user_id; pull email + name.
          const [sender] = await db
            .select({
              email: users.email,
              firstName: users.firstName,
              lastName: users.lastName,
              vendorId: users.vendorId,
            })
            .from(users)
            .where(eq(users.id, d.user_id))
            .limit(1);
          const senderEmail = sender?.email ?? undefined;
          const senderName = [sender?.firstName, sender?.lastName].filter(Boolean).join(' ') || senderEmail || 'Ukjent';
          const tiltakslederEmail = await getTiltakslederEmail(d.user_id);
          const replyTo = resolveReplyTo(undefined, tiltakslederEmail, senderEmail);

          // Resolve attachments by URL — best effort.
          const attachments = await resolveAttachments(d.attachments);

          const sent = await emailService.sendEmail({
            to: d.to_email,
            cc: d.cc_email || undefined,
            bcc: d.bcc_email || undefined,
            replyTo,
            subject: d.subject || '(uten emne)',
            html: d.body || '',
            text: (d.body || '').replace(/<[^>]+>/g, ''),
            attachments: attachments.length > 0 ? attachments : undefined,
          });

          await pool.query(
            `UPDATE email_drafts SET status = $1, sent_at = NOW(), updated_at = NOW() WHERE id = $2`,
            [sent ? 'sent' : 'failed', d.id],
          );

          await db.insert(emailSendHistory).values({
            templateId: d.template_id || null,
            sentBy: d.user_id,
            recipientEmail: d.to_email,
            recipientName: d.recipient_name || null,
            ccEmail: d.cc_email || null,
            bccEmail: d.bcc_email || null,
            subject: d.subject || '(uten emne)',
            body: d.body || '',
            attachments: attachments.map((a) => ({ filename: a.filename })),
            status: sent ? 'sent' : 'failed',
            sentAt: sent ? new Date() : null,
            errorMessage: sent ? null : 'Scheduled SMTP send failed',
            metadata: { scheduled: true, scheduledAt: d.send_at, replyTo, fromName: senderName },
          });
        } catch (e: any) {
          console.warn('Auto-send draft', d.id, 'failed:', e.message);
          await pool.query(
            `UPDATE email_drafts SET status = 'failed', updated_at = NOW() WHERE id = $1`,
            [d.id],
          );
        }
      }
    } catch (e) {
      console.warn('autoSendScheduled failed:', e);
    }
  }

  // Trigger auto-send on a small interval so scheduled emails fire even
  // when no one's hitting the drafts/sent endpoints.
  setInterval(() => { void autoSendScheduled(); }, 60_000).unref?.();

  app.get('/api/email/drafts', requireAuth, async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const user = authReq.user || authReq.admin;
      if (!user) return res.status(401).json({ error: 'Ikke autentisert' });
      await autoSendScheduled();
      const userId = String(user.id || user.email);
      const result = await pool.query(
        `SELECT * FROM email_drafts
          WHERE user_id = $1 AND status IN ('draft', 'scheduled')
          ORDER BY updated_at DESC LIMIT 100`,
        [userId],
      );
      res.json(result.rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/email/drafts', requireAuth, async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const user = authReq.user || authReq.admin;
      if (!user) return res.status(401).json({ error: 'Ikke autentisert' });
      await ensureDraftsTable();
      const userId = String(user.id || user.email);
      const {
        id, toEmail, ccEmail, bccEmail, subject, body, templateId,
        recipientName, institutionName, attachments, sendAt,
      } = req.body || {};
      const status = sendAt ? 'scheduled' : 'draft';
      const attachmentsJson = JSON.stringify(Array.isArray(attachments) ? attachments : []);
      if (id) {
        const existing = await pool.query(
          `SELECT user_id FROM email_drafts WHERE id = $1`,
          [id],
        );
        if (existing.rows.length === 0 || existing.rows[0].user_id !== userId) {
          return res.status(404).json({ error: 'Utkast ikke funnet' });
        }
        const updated = await pool.query(
          `UPDATE email_drafts SET
              to_email = $1, cc_email = $2, bcc_email = $3, subject = $4, body = $5,
              template_id = $6, recipient_name = $7, institution_name = $8,
              attachments = $9::jsonb, send_at = $10, status = $11, updated_at = NOW()
            WHERE id = $12 RETURNING *`,
          [toEmail || null, ccEmail || null, bccEmail || null, subject || null, body || null,
           templateId || null, recipientName || null, institutionName || null,
           attachmentsJson, sendAt || null, status, id],
        );
        return res.json(updated.rows[0]);
      }
      const inserted = await pool.query(
        `INSERT INTO email_drafts
            (user_id, to_email, cc_email, bcc_email, subject, body,
             template_id, recipient_name, institution_name, attachments, send_at, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12)
         RETURNING *`,
        [userId, toEmail || null, ccEmail || null, bccEmail || null, subject || null, body || null,
         templateId || null, recipientName || null, institutionName || null,
         attachmentsJson, sendAt || null, status],
      );
      res.json(inserted.rows[0]);
    } catch (error: any) {
      console.error('Email draft save error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/email/drafts/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const user = authReq.user || authReq.admin;
      if (!user) return res.status(401).json({ error: 'Ikke autentisert' });
      await ensureDraftsTable();
      const userId = String(user.id || user.email);
      await pool.query(
        `DELETE FROM email_drafts WHERE id = $1 AND user_id = $2`,
        [req.params.id, userId],
      );
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ════════════════════════════════════════════════════════════════════
  //  AI-ASSISTED DRAFT
  // ════════════════════════════════════════════════════════════════════

  app.post('/api/email/ai-draft', requireAuth, async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const user = authReq.user || authReq.admin;
      if (!user) return res.status(401).json({ error: 'Ikke autentisert' });
      if (!process.env.OPENAI_API_KEY) {
        return res.status(503).json({ error: 'AI-tjeneste er ikke konfigurert (OPENAI_API_KEY mangler)' });
      }
      const { recipient, sak, tema, tone } = req.body || {};
      const senderName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || 'Ukjent';

      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const sys = `Du skriver profesjonell e-post på norsk for Tidum, et arbeidstidssystem for barnevern, omsorg og miljøarbeid. Hold tonen ${tone || 'profesjonell og vennlig'}. Returner JSON med to felt: "subject" (kort, klart, < 80 tegn) og "body" (HTML med <p>, <ul>, <strong>, <a> der relevant — INGEN <html>/<body>-tagger). Avslutt body med en kort hilsen som inkluderer ${senderName}.`;
      const userPrompt = [
        `Mottaker: ${recipient || 'ukjent'}`,
        sak ? `Sak / kontekst: ${sak}` : null,
        `Tema: ${tema || 'generell oppfølging'}`,
      ].filter(Boolean).join('\n');

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.5,
      });
      const raw = completion.choices[0]?.message?.content || '{}';
      let parsed: any = {};
      try { parsed = JSON.parse(raw); } catch {}
      res.json({
        subject: typeof parsed.subject === 'string' ? parsed.subject : '',
        body: typeof parsed.body === 'string' ? parsed.body : '',
      });
    } catch (error: any) {
      console.error('AI draft error:', error);
      res.status(500).json({ error: error.message || 'AI-utkast feilet' });
    }
  });
}

// ════════════════════════════════════════════════════════════════════
//  SEED TEMPLATES — bootstrap a starter library so new vendors see
//  useful defaults out of the box. Idempotent: skipped if any
//  template already exists.
// ════════════════════════════════════════════════════════════════════
let seedChecked = false;
async function ensureSeedTemplates() {
  if (seedChecked) return;
  seedChecked = true;
  try {
    const existing = await db.select({ id: emailTemplates.id }).from(emailTemplates).limit(1);
    if (existing.length > 0) return;

    const wrap = (body: string) =>
      `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1e293b;line-height:1.5;max-width:560px;">${body}<p style="margin-top:24px;color:#64748b;font-size:12px;">— {{avsender}}</p></div>`;

    const STARTER: Array<{ name: string; slug: string; subject: string; htmlContent: string; category: string; variables: string[] }> = [
      {
        name: 'Timeliste — månedlig forsendelse',
        slug: 'timeliste-monthly',
        subject: 'Timeliste {{periode}} — {{avsender}}',
        category: 'timesheet',
        variables: ['periode', 'avsender', 'mottaker'],
        htmlContent: wrap(
          `<p>Hei {{mottaker}},</p>
           <p>Vedlagt finner dere min godkjente timeliste for perioden <strong>{{periode}}</strong>.</p>
           <p>{{melding}}</p>
           <p>Si fra om dere trenger spesifikasjon eller ytterligere dokumentasjon.</p>`,
        ),
      },
      {
        name: 'Faktura — purring',
        slug: 'faktura-purring',
        subject: 'Påminnelse: Faktura {{fakturanr}} forfalt',
        category: 'general',
        variables: ['fakturanr', 'forfallsdato', 'beløp', 'avsender', 'mottaker'],
        htmlContent: wrap(
          `<p>Hei {{mottaker}},</p>
           <p>Vi viser til faktura nummer <strong>{{fakturanr}}</strong> med forfall <strong>{{forfallsdato}}</strong> ({{beløp}}). Vi kan ikke se at beløpet er kommet inn på konto.</p>
           <p>{{melding}}</p>
           <p>Vennligst gi tilbakemelding hvis det foreligger en uoverensstemmelse, eller bekreft når innbetaling er forventet.</p>`,
        ),
      },
      {
        name: 'Returnert rapport — oppfølging',
        slug: 'rapport-returnert-oppfolging',
        subject: 'Oppfølging: Rapport for {{klient}} returnert',
        category: 'case-report',
        variables: ['klient', 'avsender', 'mottaker'],
        htmlContent: wrap(
          `<p>Hei {{mottaker}},</p>
           <p>Rapporten for <strong>{{klient}}</strong> er returnert med kommentarer som må adresseres.</p>
           <p>{{melding}}</p>
           <p>Logg inn i Tidum for å se kommentarene per seksjon og sende inn på nytt.</p>`,
        ),
      },
      {
        name: 'Ferieanmodning — bekreftelse',
        slug: 'ferie-bekreftelse',
        subject: 'Ferie godkjent: {{startdato}}–{{sluttdato}}',
        category: 'general',
        variables: ['startdato', 'sluttdato', 'avsender', 'mottaker'],
        htmlContent: wrap(
          `<p>Hei {{mottaker}},</p>
           <p>Din ferie i perioden <strong>{{startdato}}–{{sluttdato}}</strong> er godkjent.</p>
           <p>{{melding}}</p>
           <p>God tur!</p>`,
        ),
      },
      {
        name: 'Velkommen til Tidum',
        slug: 'velkommen',
        subject: 'Velkommen til Tidum, {{mottaker}}',
        category: 'general',
        variables: ['avsender', 'mottaker'],
        htmlContent: wrap(
          `<p>Hei {{mottaker}},</p>
           <p>Velkommen til Tidum! Du har fått tilgang og kan nå logge inn for å registrere timer og dokumentere arbeidet ditt.</p>
           <p>{{melding}}</p>
           <p>Trenger du hjelp underveis, finner du en guide på <a href="https://tidum.no/guide">tidum.no/guide</a>.</p>`,
        ),
      },
      {
        name: 'Møteforespørsel',
        slug: 'mote-forespørsel',
        subject: 'Forslag til møte: {{tema}}',
        category: 'general',
        variables: ['tema', 'forslag1', 'forslag2', 'avsender', 'mottaker'],
        htmlContent: wrap(
          `<p>Hei {{mottaker}},</p>
           <p>Jeg vil gjerne ta et kort møte om <strong>{{tema}}</strong>.</p>
           <p>{{melding}}</p>
           <p>Forslag til tidspunkt:</p>
           <ul><li>{{forslag1}}</li><li>{{forslag2}}</li></ul>
           <p>Si fra hvilket tidspunkt som passer best, eller foreslå et alternativ.</p>`,
        ),
      },
      {
        name: 'Avvik — bekreftelse mottatt',
        slug: 'avvik-bekreftelse',
        subject: 'Avvik mottatt — {{kategori}}',
        category: 'general',
        variables: ['kategori', 'avsender', 'mottaker'],
        htmlContent: wrap(
          `<p>Hei {{mottaker}},</p>
           <p>Vi bekrefter at avviksmelding i kategori <strong>{{kategori}}</strong> er mottatt og under behandling.</p>
           <p>{{melding}}</p>
           <p>Du vil bli kontaktet for oppfølging.</p>`,
        ),
      },
      {
        name: 'Overtidssøknad',
        slug: 'overtid-soknad',
        subject: 'Søknad om overtid — {{periode}}',
        category: 'overtime',
        variables: ['periode', 'antallTimer', 'avsender', 'mottaker'],
        htmlContent: wrap(
          `<p>Hei {{mottaker}},</p>
           <p>Jeg søker herved om overtid i perioden <strong>{{periode}}</strong> ({{antallTimer}} timer).</p>
           <p>{{melding}}</p>
           <p>Vedlegg viser detaljert oppstilling.</p>`,
        ),
      },
    ];

    for (const tpl of STARTER) {
      try {
        await db.insert(emailTemplates).values({
          name: tpl.name,
          slug: tpl.slug,
          subject: tpl.subject,
          htmlContent: tpl.htmlContent,
          textContent: tpl.htmlContent.replace(/<[^>]+>/g, ''),
          variables: tpl.variables as any,
          category: tpl.category,
          isActive: true,
          isPublic: true,
        } as any);
      } catch (e) {
        // ignore individual failures
      }
    }
    console.log('[email] Seeded', STARTER.length, 'starter templates');
  } catch (e) {
    console.warn('[email] ensureSeedTemplates failed:', e);
  }
}

// ════════════════════════════════════════════════════════════════════
//  ATTACHMENTS — fetch URLs into Buffers (used by /send and scheduled)
// ════════════════════════════════════════════════════════════════════
async function resolveAttachments(rawList: any): Promise<Array<{ filename: string; content: Buffer; contentType: string }>> {
  const list = Array.isArray(rawList) ? rawList : [];
  const out: Array<{ filename: string; content: Buffer; contentType: string }> = [];
  for (const a of list.slice(0, 10)) {
    const url = typeof a?.url === 'string' ? a.url : null;
    if (!url) continue;
    try {
      // Resolve relative /uploads/* paths against the public origin.
      const fullUrl = url.startsWith('http') ? url : `${process.env.APP_BASE_URL || 'http://localhost:5000'}${url}`;
      const r = await fetch(fullUrl);
      if (!r.ok) continue;
      const ct = r.headers.get('content-type') || 'application/octet-stream';
      const ab = await r.arrayBuffer();
      if (ab.byteLength > 25 * 1024 * 1024) continue; // 25 MB cap per attachment
      out.push({
        filename: typeof a.filename === 'string' ? a.filename : url.split('/').pop() || 'attachment',
        content: Buffer.from(ab),
        contentType: ct,
      });
    } catch {}
  }
  return out;
}
