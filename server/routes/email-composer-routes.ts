import type { Express, NextFunction, Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { db, pool } from '../db';
import { emailService } from '../lib/email-service';
import { ExportService } from '../lib/export-service';
import { emailTemplates, emailSendHistory, logRow, users } from '@shared/schema';
import { eq, and, between, desc, isNull, or } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth';
import {
  EMAIL_LEADER_ROLES,
  attachmentExtension,
  boundedText,
  canSendReportFor,
  emailActor,
  emailHtmlToText,
  escapeEmailHtml,
  hasValidAttachmentSignature,
  normalizeEmailRecipients,
  normalizeSubject,
  normalizeTemplateVariables,
  safeAttachmentName,
  sanitizeEmailHtml,
  validateReportPeriod,
  type EmailActor,
} from '../lib/email-composer-security';
import {
  assertUserComposedSmtpAllowed,
  loadEmailChannelPolicy,
  recordEmailPolicyBlock,
  type EmailChannelPolicy,
} from '../lib/email-channel-policy';
import {
  isSecureChannelRequiredError,
  SECURE_CHANNEL_REQUIRED_CODE,
} from '../lib/outbound-email-policy';

const EMAIL_UPLOAD_DIR = path.join(process.cwd(), 'private-uploads', 'email');
const REPORT_TYPES = new Set(['timesheet', 'case-report', 'overtime']);

const privateAttachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    callback(null, attachmentExtension(file.mimetype) !== null);
  },
});

function receivePrivateAttachment(req: Request, res: Response, next: NextFunction) {
  privateAttachmentUpload.single('file')(req, res, (error: unknown) => {
    if (error) return res.status(400).json({ error: 'Ugyldig eller for stort vedlegg' });
    next();
  });
}

function requireEmailActor(req: Request, res: Response): EmailActor | null {
  const actor = emailActor(req);
  if (!actor) {
    res.status(403).json({ error: 'Brukeren mangler gyldig tenant-tilknytning' });
    return null;
  }
  res.setHeader('Cache-Control', 'no-store');
  return actor;
}

function requireEmailActorMiddleware(req: Request, res: Response, next: NextFunction) {
  const actor = requireEmailActor(req, res);
  if (!actor) return;
  (req as any).emailActor = actor;
  next();
}

function accessibleTemplateWhere(actor: EmailActor, id?: number) {
  const scope = or(
    and(eq(emailTemplates.isPublic, true), isNull(emailTemplates.vendorId), isNull(emailTemplates.userId)),
    and(eq(emailTemplates.isPublic, false), eq(emailTemplates.vendorId, actor.vendorId), eq(emailTemplates.userId, actor.id)),
  );
  return id == null ? scope : and(eq(emailTemplates.id, id), scope);
}

function ownedTemplateWhere(actor: EmailActor, id: number) {
  return and(
    eq(emailTemplates.id, id),
    eq(emailTemplates.isPublic, false),
    eq(emailTemplates.vendorId, actor.vendorId),
    eq(emailTemplates.userId, actor.id),
  );
}

function emailRouteError(res: Response, operation: string, error: unknown) {
  console.error(`Email composer ${operation} error:`, error);
  if (isSecureChannelRequiredError(error)) {
    return res.status(422).json({
      error: 'Denne informasjonen kan ikke sendes på e-post. Bruk Sikker sending.',
      code: SECURE_CHANNEL_REQUIRED_CODE,
    });
  }
  const code = error instanceof Error ? error.message : '';
  if (code === 'INVALID_INPUT' || code === 'INVALID_EMAIL') {
    return res.status(400).json({ error: 'Ugyldige e-postdata' });
  }
  if (code === 'ATTACHMENT_NOT_FOUND') {
    return res.status(404).json({ error: 'Vedlegg ikke funnet' });
  }
  return res.status(500).json({ error: 'E-postoperasjonen kunne ikke fullføres' });
}

async function requireUserComposedSmtpPolicy(
  res: Response,
  actor: EmailActor,
  input: { category?: unknown; reportType?: unknown },
  route: string,
): Promise<EmailChannelPolicy | null> {
  let policy: EmailChannelPolicy | null = null;
  try {
    policy = await loadEmailChannelPolicy(actor);
    assertUserComposedSmtpAllowed(policy, input);
    return policy;
  } catch (error) {
    if (!isSecureChannelRequiredError(error)) throw error;
    await recordEmailPolicyBlock({
      actorUserId: policy?.actorUserId ?? actor.id,
      vendorId: policy?.vendorId ?? actor.vendorId,
      kommuneId: policy?.kommuneId ?? null,
      route,
      purpose: 'user_composed',
      reasonCode: error.reasonCode,
      metadata: {
        category: typeof input.category === 'string' ? input.category : null,
        reportType: typeof input.reportType === 'string' ? input.reportType : null,
      },
    });
    emailRouteError(res, 'policy block', error);
    return null;
  }
}

async function requireEmailAttachmentPolicyMiddleware(req: Request, res: Response, next: NextFunction) {
  const actor = (req as any).emailActor as EmailActor | undefined;
  if (!actor) return res.status(403).json({ error: 'Brukeren mangler gyldig tenant-tilknytning' });
  try {
    const policy = await requireUserComposedSmtpPolicy(res, actor, {}, '/api/email/attachments');
    if (!policy) return;
    (req as any).emailChannelPolicy = policy;
    next();
  } catch (error) {
    emailRouteError(res, 'attachment policy', error);
  }
}

let emailTablesReady = false;
async function requireEmailTables() {
  if (emailTablesReady) return;
  const result = await pool.query(
    `SELECT
       to_regclass('public.tidum_email_composer_templates') AS templates,
       to_regclass('public.tidum_email_composer_history') AS history,
       to_regclass('public.tidum_email_drafts') AS drafts,
       to_regclass('public.tidum_email_attachments') AS attachments`,
  );
  if (Object.values(result.rows[0] ?? {}).some((value) => value == null)) {
    throw new Error('EMAIL_SCHEMA_MISSING');
  }
  emailTablesReady = true;
}

// ── Helper: resolve tiltaksleder email for Reply-To ────────────────────

async function getTiltakslederEmail(vendorId: number): Promise<string | null> {
  try {
    // Find a tiltaksleder in the same vendor
    const [leader] = await db
      .select({ email: users.email })
      .from(users)
      .where(and(eq(users.vendorId, vendorId), eq(users.role, 'tiltaksleder')))
      .limit(1);

    return leader?.email || null;
  } catch {
    return null;
  }
}

function resolveReplyTo(category: string | undefined, tiltakslederEmail: string | null, senderEmail: string | undefined): string | undefined {
  // Reports go to tiltaksleder, general/other go to support
  const candidates = ['timesheet', 'case-report', 'overtime'].includes(category || '')
    ? [tiltakslederEmail, process.env.SMTP_REPLY_TO, senderEmail]
    : [process.env.SMTP_REPLY_TO, senderEmail];
  for (const candidate of candidates) {
    try {
      const normalized = normalizeEmailRecipients(candidate);
      if (normalized && !normalized.includes(',')) return normalized;
    } catch {
      // Skip invalid database/environment values rather than letting them reach
      // an SMTP header.
    }
  }
  return undefined;
}

// ── Template variable replacement ──────────────────────────────────────

function replaceVariables(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || '');
}

// ── Routes ─────────────────────────────────────────────────────────────

export function registerEmailComposerRoutes(app: Express) {

  // ─ Get all active templates ───────────────────────────────────────────
  app.get('/api/email/templates', requireAuth, async (req: Request, res: Response) => {
    const actor = requireEmailActor(req, res);
    if (!actor) return;
    try {
      await requireEmailTables();
      // Seed a starter library on first read so new vendors see useful defaults.
      await ensureSeedTemplates();

      const templates = await db
        .select()
        .from(emailTemplates)
        .where(and(eq(emailTemplates.isActive, true), accessibleTemplateWhere(actor)))
        .orderBy(emailTemplates.category, emailTemplates.name);

      res.json(templates);
    } catch (error) {
      return emailRouteError(res, 'template list', error);
    }
  });

  // ─ Get single template ────────────────────────────────────────────────
  app.get('/api/email/templates/:id', requireAuth, async (req: Request, res: Response) => {
    const actor = requireEmailActor(req, res);
    if (!actor) return;
    try {
      await requireEmailTables();
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Ugyldig mal-ID' });
      const [template] = await db
        .select()
        .from(emailTemplates)
        .where(and(eq(emailTemplates.isActive, true), accessibleTemplateWhere(actor, id)))
        .limit(1);

      if (!template) return res.status(404).json({ error: 'Mal ikke funnet' });
      res.json(template);
    } catch (error) {
      return emailRouteError(res, 'template read', error);
    }
  });

  // ─ Create new template ────────────────────────────────────────────────
  app.post('/api/email/templates', requireAuth, async (req: Request, res: Response) => {
    const actor = requireEmailActor(req, res);
    if (!actor) return;
    try {
      await requireEmailTables();
      const name = boundedText(req.body?.name, 200, true)!;
      const subject = normalizeSubject(req.body?.subject, true)!;
      const htmlContent = sanitizeEmailHtml(req.body?.htmlContent);
      if (!htmlContent) return res.status(400).json({ error: 'Innhold er påkrevd' });
      const textContent = boundedText(req.body?.textContent, 100_000) ?? emailHtmlToText(htmlContent);
      const variables = Object.keys(normalizeTemplateVariables(
        Array.isArray(req.body?.variables)
          ? Object.fromEntries(req.body.variables.slice(0, 30).map((key: unknown) => [String(key), '']))
          : req.body?.variables,
      ));
      const category = boundedText(req.body?.category, 100) ?? 'general';

      const slug = name
        .toLowerCase()
        .replace(/[æ]/g, 'ae').replace(/[ø]/g, 'o').replace(/[å]/g, 'a')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
        + '-' + randomBytes(6).toString('hex');

      const [created] = await db
        .insert(emailTemplates)
        .values({
          vendorId: actor.vendorId,
          userId: actor.id,
          name,
          slug,
          subject,
          htmlContent,
          textContent,
          variables,
          category,
          isActive: true,
          isPublic: false,
        })
        .returning();

      res.status(201).json(created);
    } catch (error) {
      return emailRouteError(res, 'template create', error);
    }
  });

  // ─ Update template ───────────────────────────────────────────────────
  app.put('/api/email/templates/:id', requireAuth, async (req: Request, res: Response) => {
    const actor = requireEmailActor(req, res);
    if (!actor) return;
    try {
      await requireEmailTables();
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Ugyldig mal-ID' });
      if (req.body?.vendorId !== undefined || req.body?.vendor_id !== undefined || req.body?.userId !== undefined || req.body?.isPublic !== undefined) {
        return res.status(403).json({ error: 'Maleierskap kan ikke endres' });
      }
      const updates: Partial<typeof emailTemplates.$inferInsert> = { updatedAt: new Date() };
      if (req.body?.name !== undefined) updates.name = boundedText(req.body.name, 200, true)!;
      if (req.body?.subject !== undefined) updates.subject = normalizeSubject(req.body.subject, true)!;
      if (req.body?.htmlContent !== undefined) {
        const html = sanitizeEmailHtml(req.body.htmlContent);
        if (!html) return res.status(400).json({ error: 'Innhold kan ikke være tomt' });
        updates.htmlContent = html;
      }
      if (req.body?.textContent !== undefined) updates.textContent = boundedText(req.body.textContent, 100_000);
      if (req.body?.variables !== undefined) {
        updates.variables = Object.keys(normalizeTemplateVariables(
          Array.isArray(req.body.variables)
            ? Object.fromEntries(req.body.variables.slice(0, 30).map((key: unknown) => [String(key), '']))
            : req.body.variables,
        ));
      }
      if (req.body?.category !== undefined) updates.category = boundedText(req.body.category, 100, true)!;
      if (req.body?.isActive !== undefined) {
        if (typeof req.body.isActive !== 'boolean') throw new Error('INVALID_INPUT');
        updates.isActive = req.body.isActive;
      }
      if (Object.keys(updates).length === 1) return res.status(400).json({ error: 'Ingen tillatte felt å oppdatere' });

      const [updated] = await db
        .update(emailTemplates)
        .set(updates)
        .where(ownedTemplateWhere(actor, id))
        .returning();

      if (!updated) return res.status(404).json({ error: 'Mal ikke funnet' });
      res.json(updated);
    } catch (error) {
      return emailRouteError(res, 'template update', error);
    }
  });

  // ─ Delete template ───────────────────────────────────────────────────
  app.delete('/api/email/templates/:id', requireAuth, async (req: Request, res: Response) => {
    const actor = requireEmailActor(req, res);
    if (!actor) return;
    try {
      await requireEmailTables();
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Ugyldig mal-ID' });
      const [deleted] = await db
        .update(emailTemplates)
        .set({ isActive: false, updatedAt: new Date() })
        .where(ownedTemplateWhere(actor, id))
        .returning({ id: emailTemplates.id });

      if (!deleted) return res.status(404).json({ error: 'Mal ikke funnet' });
      res.json({ success: true });
    } catch (error) {
      return emailRouteError(res, 'template delete', error);
    }
  });

  app.post(
    '/api/email/attachments',
    requireAuth,
    requireEmailActorMiddleware,
    requireEmailAttachmentPolicyMiddleware,
    receivePrivateAttachment,
    async (req: Request, res: Response) => {
      const actor = (req as any).emailActor as EmailActor;
      try {
        await requireEmailTables();
        if (!req.file || !hasValidAttachmentSignature(req.file.buffer, req.file.mimetype)) {
          return res.status(400).json({ error: 'Ugyldig eller ikke tillatt vedlegg' });
        }
        const quota = await pool.query(
          `SELECT COUNT(*)::integer AS uploads, COALESCE(SUM(size_bytes), 0)::bigint AS bytes
             FROM tidum_email_attachments
            WHERE vendor_id = $1 AND user_id = $2 AND created_at >= NOW() - INTERVAL '24 hours'`,
          [actor.vendorId, actor.id],
        );
        if (Number(quota.rows[0]?.uploads) >= 50 || Number(quota.rows[0]?.bytes) + req.file.size > 100 * 1024 * 1024) {
          return res.status(429).json({ error: 'Opplastingsgrensen for siste døgn er nådd' });
        }
        const extension = attachmentExtension(req.file.mimetype);
        if (!extension) return res.status(400).json({ error: 'Ugyldig vedleggstype' });
        await fs.promises.mkdir(EMAIL_UPLOAD_DIR, { recursive: true, mode: 0o700 });
        const storedName = `${randomBytes(24).toString('hex')}${extension}`;
        const targetPath = path.join(EMAIL_UPLOAD_DIR, storedName);
        await fs.promises.writeFile(targetPath, req.file.buffer, { mode: 0o600, flag: 'wx' });
        try {
          const result = await pool.query(
            `INSERT INTO tidum_email_attachments
               (vendor_id, user_id, stored_name, original_name, mime_type, size_bytes)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, original_name, mime_type, size_bytes, created_at`,
            [actor.vendorId, actor.id, storedName, safeAttachmentName(req.file.originalname), req.file.mimetype, req.file.size],
          );
          return res.status(201).json({
            id: result.rows[0].id,
            filename: result.rows[0].original_name,
            mimeType: result.rows[0].mime_type,
            size: result.rows[0].size_bytes,
            createdAt: result.rows[0].created_at,
          });
        } catch (error) {
          await fs.promises.unlink(targetPath).catch(() => undefined);
          throw error;
        }
      } catch (error) {
        return emailRouteError(res, 'attachment upload', error);
      }
    },
  );

  // ─ Send email (composer) ─────────────────────────────────────────────
  app.post('/api/email/send', requireAuth, async (req: Request, res: Response) => {
    const actor = requireEmailActor(req, res);
    if (!actor) return;
    try {
      await requireEmailTables();
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
      } = req.body ?? {};

      const normalizedTo = normalizeEmailRecipients(toEmail, true)!;
      const normalizedCc = normalizeEmailRecipients(ccEmail);
      const normalizedBcc = normalizeEmailRecipients(bccEmail);
      const requestedSubject = normalizeSubject(subject, true)!;
      const requestedBody = sanitizeEmailHtml(body);
      const normalizedCategory = boundedText(category, 100) ?? 'general';
      const normalizedRecipientName = boundedText(recipientName, 300);
      const normalizedInstitutionName = boundedText(institutionName, 300);
      let normalizedDraftId: number | null = null;
      if (draftId != null && draftId !== '') {
        normalizedDraftId = Number(draftId);
        if (!Number.isInteger(normalizedDraftId) || normalizedDraftId <= 0) throw new Error('INVALID_INPUT');
      }
      const senderName = [actor.firstName, actor.lastName].filter(Boolean).join(' ') || actor.name || actor.email || 'Ukjent';

      // Resolve dynamic Reply-To
      const tiltakslederEmail = await getTiltakslederEmail(actor.vendorId);
      const replyTo = resolveReplyTo(normalizedCategory, tiltakslederEmail, actor.email);

      // If using a template, load and interpolate
      let finalSubject = requestedSubject;
      let finalHtml = requestedBody;
      let finalText = emailHtmlToText(requestedBody);
      let resolvedTemplateId: number | null = null;
      let effectiveCategory = normalizedCategory;

      if (templateId != null && templateId !== '') {
        const parsedTemplateId = Number(templateId);
        if (!Number.isInteger(parsedTemplateId) || parsedTemplateId <= 0) throw new Error('INVALID_INPUT');
        const [tpl] = await db
          .select()
          .from(emailTemplates)
          .where(and(eq(emailTemplates.isActive, true), accessibleTemplateWhere(actor, parsedTemplateId)))
          .limit(1);

        if (!tpl) return res.status(404).json({ error: 'Mal ikke funnet' });
        resolvedTemplateId = parsedTemplateId;
        effectiveCategory = tpl.category || normalizedCategory;
        const suppliedVars = normalizeTemplateVariables(templateVars);
        const bodyText = String(suppliedVars.melding ?? emailHtmlToText(requestedBody)).trim();
        const plainVars: Record<string, string> = {
          ...suppliedVars,
          avsender: senderName,
          mottaker: normalizedRecipientName ?? suppliedVars.mottaker ?? '',
          melding: bodyText,
        };
        const htmlVars = Object.fromEntries(
          Object.entries(plainVars).map(([key, value]) => [key, escapeEmailHtml(value).replace(/\n/g, '<br/>')]),
        );
        finalSubject = normalizeSubject(replaceVariables(tpl.subject, plainVars), true)!;
        finalHtml = sanitizeEmailHtml(replaceVariables(tpl.htmlContent, htmlVars));
        finalText = tpl.textContent
          ? replaceVariables(tpl.textContent, plainVars).slice(0, 100_000)
          : emailHtmlToText(finalHtml);
      }

      const channelPolicy = await requireUserComposedSmtpPolicy(
        res,
        actor,
        { category: effectiveCategory, reportType: attachReport === true ? reportType : null },
        '/api/email/send',
      );
      if (!channelPolicy) return;

      // Only private attachment IDs owned by this actor are accepted. URLs are
      // deliberately rejected to prevent SSRF and cross-user object access.
      const resolvedAttachments = await resolvePrivateAttachments(attachmentList, actor);

      // Optional: attach Excel report
      let attachments: Array<{ filename: string; content: Buffer; contentType: string }> | undefined =
        resolvedAttachments.files.length > 0 ? [...resolvedAttachments.files] : undefined;
      let resolvedTargetUserId: string | null = null;
      if (attachReport === true) {
        if (!REPORT_TYPES.has(String(reportType)) || !validateReportPeriod(periodStart, periodEnd)) {
          return res.status(400).json({ error: 'Ugyldig rapporttype eller periode' });
        }
        resolvedTargetUserId = boundedText(targetUserId, 500) ?? actor.id;
        if (!canSendReportFor(actor, resolvedTargetUserId)) {
          return res.status(403).json({ error: 'Kan ikke sende rapport for en annen bruker' });
        }
        const entries = await db
          .select()
          .from(logRow)
          .where(and(
            eq(logRow.vendorId, actor.vendorId),
            eq(logRow.userId, resolvedTargetUserId),
            between(logRow.date, periodStart, periodEnd),
          ))
          .orderBy(logRow.date);

        const exportData = entries.map((entry) => {
          const start = entry.startTime || '';
          const end = entry.endTime || '';
          const parsedBreak = Number(entry.breakHours || 0);
          const breakHours = Number.isFinite(parsedBreak) ? parsedBreak : 0;
          let hours = 0;
          if (start && end) {
            const [startHour, startMinute] = start.split(':').map(Number);
            const [endHour, endMinute] = end.split(':').map(Number);
            let minutes = endHour * 60 + endMinute - (startHour * 60 + startMinute);
            if (minutes < 0) minutes += 24 * 60;
            hours = Math.max(0, minutes / 60 - breakHours);
          }
          return {
            id: entry.id,
            date: entry.date?.toString() || '',
            startTime: start,
            endTime: end,
            breakHours,
            activity: entry.activity || '',
            title: entry.title || '',
            project: entry.project || '',
            place: entry.place || '',
            notes: entry.notes || '',
            hours,
          };
        });

        const reportLabels: Record<string, string> = { timesheet: 'Timeliste', 'case-report': 'Saksrapport', overtime: 'Overtidsrapport' };
        const reportLabel = reportLabels[String(reportType)];
        const buffer = await ExportService.generateExcel(exportData, {
          startDate: periodStart,
          endDate: periodEnd,
          title: reportLabel,
          includeNotes: true,
        });
        const reportAttachment = {
          filename: `${reportLabel.toLowerCase().replace(/\s/g, '_')}_${periodStart}_${periodEnd}.xlsx`,
          content: buffer,
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        };
        attachments = attachments ? [...attachments, reportAttachment] : [reportAttachment];
      }

      // Create the audit row before the external side effect. A history
      // outage must prevent an unlogged email, not silently continue.
      const [history] = await db.insert(emailSendHistory).values({
        vendorId: actor.vendorId,
        templateId: resolvedTemplateId,
        sentBy: actor.id,
        recipientEmail: normalizedTo,
        recipientName: normalizedRecipientName,
        ccEmail: normalizedCc,
        bccEmail: normalizedBcc,
        subject: finalSubject,
        body: finalHtml,
        attachments: attachments ? attachments.map((attachment) => ({ filename: attachment.filename })) : [],
        status: 'pending',
        metadata: {
          category: normalizedCategory,
          reportType: attachReport === true ? reportType : null,
          replyTo,
          institutionName: normalizedInstitutionName,
          targetUserId: resolvedTargetUserId,
        },
      }).returning({ id: emailSendHistory.id });

      let sent = false;
      try {
        sent = await emailService.sendEmail({
          purpose: "user_composed",
          to: normalizedTo,
          cc: normalizedCc || undefined,
          bcc: normalizedBcc || undefined,
          replyTo,
          subject: finalSubject,
          html: finalHtml,
          text: finalText,
          attachments,
        });
      } catch (sendError) {
        await db.update(emailSendHistory).set({
          status: 'failed',
          errorMessage: 'SMTP send failed',
        }).where(and(
          eq(emailSendHistory.id, history.id),
          eq(emailSendHistory.vendorId, actor.vendorId),
          eq(emailSendHistory.sentBy, actor.id),
        ));
        throw sendError;
      }

      await db.update(emailSendHistory).set({
        status: sent ? 'sent' : 'failed',
        sentAt: sent ? new Date() : null,
        errorMessage: sent ? null : 'SMTP send failed',
      }).where(and(
        eq(emailSendHistory.id, history.id),
        eq(emailSendHistory.vendorId, actor.vendorId),
        eq(emailSendHistory.sentBy, actor.id),
      ));

      // Clean up the saved draft if this send originated from one.
      if (sent && normalizedDraftId) {
        await pool.query(
          `DELETE FROM tidum_email_drafts WHERE id = $1 AND vendor_id = $2 AND user_id = $3`,
          [normalizedDraftId, actor.vendorId, actor.id],
        );
      }

      if (sent) {
        if (resolvedAttachments.ids.length > 0) {
          await pool.query(
            `UPDATE tidum_email_attachments SET used_at = NOW()
             WHERE id = ANY($1::uuid[]) AND vendor_id = $2 AND user_id = $3`,
            [resolvedAttachments.ids, actor.vendorId, actor.id],
          );
        }
        return res.json({ success: true, message: `E-post sendt til ${normalizedTo}` });
      } else {
        return res.status(503).json({ error: 'E-posttjenesten er ikke konfigurert', code: 'SMTP_NOT_CONFIGURED' });
      }
    } catch (error) {
      return emailRouteError(res, 'send', error);
    }
  });

  // ─ Sent history ──────────────────────────────────────────────────────
  app.get('/api/email/sent', requireAuth, async (req: Request, res: Response) => {
    const actor = requireEmailActor(req, res);
    if (!actor) return;
    try {
      await requireEmailTables();
      const requestedLimit = Number.parseInt(String(req.query.limit ?? '50'), 10);
      const limit = Math.min(200, Math.max(1, Number.isFinite(requestedLimit) ? requestedLimit : 50));

      const history = await db
        .select()
        .from(emailSendHistory)
        .where(and(eq(emailSendHistory.vendorId, actor.vendorId), eq(emailSendHistory.sentBy, actor.id)))
        .orderBy(desc(emailSendHistory.createdAt))
        .limit(limit);

      res.json(history);
    } catch (error) {
      return emailRouteError(res, 'history list', error);
    }
  });

  // ─ Team members (for tiltaksleder to pick a user) ────────────────────
  app.get('/api/email/team-members', requireAuth, async (req: Request, res: Response) => {
    const actor = requireEmailActor(req, res);
    if (!actor) return;
    try {
      if (!EMAIL_LEADER_ROLES.has(actor.role)) return res.status(403).json({ error: 'Krever lederrolle' });

      const members = await db
        .select({ id: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName, role: users.role })
        .from(users)
        .where(eq(users.vendorId, actor.vendorId));

      res.json(members);
    } catch (error) {
      return emailRouteError(res, 'team list', error);
    }
  });

  // ─ Email status (SMTP availability) ──────────────────────────────────
  app.get('/api/email/status', requireAuth, async (req: Request, res: Response) => {
    const actor = requireEmailActor(req, res);
    if (!actor) return;
    try {
      const policy = await loadEmailChannelPolicy(actor);
      const secureChannelRequired = policy.kommuneId != null
        || policy.role === 'barnevernsleder'
        || policy.role === 'kommune_saksbehandler'
        || policy.barnevernContext;
      res.json({
        smtp: emailService.getIsConfigured() && !secureChannelRequired,
        ai: !secureChannelRequired && process.env.ALLOW_AI_EMAIL_DRAFTS === 'true' && !!process.env.OPENAI_API_KEY,
        secureChannelRequired,
      });
    } catch (error) {
      return emailRouteError(res, 'status', error);
    }
  });

  // ════════════════════════════════════════════════════════════════════
  //  DRAFTS + SCHEDULED SEND
  // ════════════════════════════════════════════════════════════════════

  /** Atomically claim scheduled drafts so parallel app instances cannot send
   *  the same message. A claimed row is never automatically reclaimed: an
   *  ambiguous crash after SMTP must require manual review, not risk a
   *  duplicate external email. */
  async function autoSendScheduled() {
    try {
      await requireEmailTables();
      const due = await pool.query(
        `WITH claimed AS (
           SELECT id FROM tidum_email_drafts
           WHERE status = 'scheduled' AND send_at IS NOT NULL AND send_at <= NOW()
           ORDER BY send_at ASC
           FOR UPDATE SKIP LOCKED
           LIMIT 20
         )
         UPDATE tidum_email_drafts draft
         SET status = 'sending', updated_at = NOW()
         FROM claimed
         WHERE draft.id = claimed.id AND draft.status = 'scheduled'
         RETURNING draft.*`,
      );
      for (const d of due.rows) {
        let historyId: number | null = null;
        let smtpAttempted = false;
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
            .where(and(eq(users.id, d.user_id), eq(users.vendorId, d.vendor_id)))
            .limit(1);
          if (!sender) throw new Error('SCHEDULED_SENDER_NOT_FOUND');
          const senderEmail = sender?.email ?? undefined;
          const senderName = [sender?.firstName, sender?.lastName].filter(Boolean).join(' ') || senderEmail || 'Ukjent';
          const tiltakslederEmail = await getTiltakslederEmail(d.vendor_id);
          const replyTo = resolveReplyTo(undefined, tiltakslederEmail, senderEmail);

          const draftActor: EmailActor = { id: d.user_id, vendorId: d.vendor_id, role: 'scheduled' };
          const policy = await loadEmailChannelPolicy(draftActor);
          const [scheduledTemplate] = d.template_id
            ? await db
                .select({ category: emailTemplates.category })
                .from(emailTemplates)
                .where(accessibleTemplateWhere(draftActor, Number(d.template_id)))
                .limit(1)
            : [];
          try {
            assertUserComposedSmtpAllowed(policy, { category: scheduledTemplate?.category });
          } catch (error) {
            if (isSecureChannelRequiredError(error)) {
              await recordEmailPolicyBlock({
                actorUserId: policy.actorUserId,
                vendorId: policy.vendorId,
                kommuneId: policy.kommuneId,
                route: 'email-scheduler',
                purpose: 'user_composed',
                reasonCode: error.reasonCode,
                metadata: {
                  category: scheduledTemplate?.category ?? null,
                  hasAttachments: Array.isArray(d.attachments) && d.attachments.length > 0,
                },
              });
            }
            throw error;
          }
          const resolvedAttachments = await resolvePrivateAttachments(d.attachments, draftActor);
          const normalizedTo = normalizeEmailRecipients(d.to_email, true)!;
          const normalizedCc = normalizeEmailRecipients(d.cc_email);
          const normalizedBcc = normalizeEmailRecipients(d.bcc_email);
          const normalizedSubject = normalizeSubject(d.subject, true)!;
          const normalizedBody = sanitizeEmailHtml(d.body);

          const [history] = await db.insert(emailSendHistory).values({
            vendorId: d.vendor_id,
            templateId: d.template_id || null,
            sentBy: d.user_id,
            recipientEmail: normalizedTo,
            recipientName: d.recipient_name || null,
            ccEmail: normalizedCc,
            bccEmail: normalizedBcc,
            subject: normalizedSubject,
            body: normalizedBody,
            attachments: resolvedAttachments.files.map((attachment) => ({ filename: attachment.filename })),
            status: 'pending',
            metadata: { scheduled: true, scheduledAt: d.send_at, replyTo, fromName: senderName, draftId: d.id },
          }).returning({ id: emailSendHistory.id });
          historyId = history.id;

          smtpAttempted = true;
          const sent = await emailService.sendEmail({
            purpose: "user_composed",
            to: normalizedTo,
            cc: normalizedCc || undefined,
            bcc: normalizedBcc || undefined,
            replyTo,
            subject: normalizedSubject,
            html: normalizedBody,
            text: emailHtmlToText(normalizedBody),
            attachments: resolvedAttachments.files.length > 0 ? resolvedAttachments.files : undefined,
            throwOnError: true,
          });

          await pool.query(
            `UPDATE tidum_email_drafts
             SET status = $1, sent_at = CASE WHEN $1 = 'sent' THEN NOW() ELSE NULL END, updated_at = NOW()
             WHERE id = $2 AND vendor_id = $3 AND user_id = $4 AND status = 'sending'`,
            [sent ? 'sent' : 'failed', d.id, d.vendor_id, d.user_id],
          );

          await db.update(emailSendHistory).set({
            status: sent ? 'sent' : 'failed',
            sentAt: sent ? new Date() : null,
            errorMessage: sent ? null : 'Scheduled SMTP send failed',
          }).where(and(
            eq(emailSendHistory.id, history.id),
            eq(emailSendHistory.vendorId, d.vendor_id),
            eq(emailSendHistory.sentBy, d.user_id),
          ));

          if (sent && resolvedAttachments.ids.length > 0) {
            await pool.query(
              `UPDATE tidum_email_attachments SET used_at = NOW()
               WHERE id = ANY($1::uuid[]) AND vendor_id = $2 AND user_id = $3`,
              [resolvedAttachments.ids, d.vendor_id, d.user_id],
            );
          }
        } catch (error) {
          if (smtpAttempted) {
            // SMTP failure is ambiguous: the remote server may have accepted
            // the message before the connection failed. Leave both records in
            // their reviewable states rather than automatically retrying and
            // risking a duplicate external email.
            console.warn('Auto-send draft', d.id, 'has ambiguous SMTP result; left in sending state');
          } else {
            console.warn('Auto-send draft', d.id, 'failed before SMTP');
            await pool.query(
              `UPDATE tidum_email_drafts SET status = 'failed', updated_at = NOW()
               WHERE id = $1 AND vendor_id = $2 AND user_id = $3 AND status = 'sending'`,
              [d.id, d.vendor_id, d.user_id],
            );
            if (historyId) {
              await db.update(emailSendHistory).set({
                status: 'failed',
                errorMessage: 'Scheduled send failed before SMTP',
              }).where(and(
                eq(emailSendHistory.id, historyId),
                eq(emailSendHistory.vendorId, d.vendor_id),
                eq(emailSendHistory.sentBy, d.user_id),
              ));
            }
          }
        }
      }
    } catch (e) {
      console.warn('autoSendScheduled failed:', e);
    }
  }

  // Trigger auto-send on a small interval so scheduled emails fire even
  // when no one's hitting the drafts/sent endpoints.
  if (process.env.NODE_ENV !== 'test') {
    setInterval(() => { void autoSendScheduled(); }, 60_000).unref?.();
  }

  app.get('/api/email/drafts', requireAuth, async (req: Request, res: Response) => {
    const actor = requireEmailActor(req, res);
    if (!actor) return;
    try {
      await requireEmailTables();
      await autoSendScheduled();
      const result = await pool.query(
        `SELECT * FROM tidum_email_drafts
          WHERE vendor_id = $1 AND user_id = $2 AND status IN ('draft', 'scheduled')
          ORDER BY updated_at DESC LIMIT 100`,
        [actor.vendorId, actor.id],
      );
      res.json(result.rows);
    } catch (error) {
      return emailRouteError(res, 'draft list', error);
    }
  });

  app.post('/api/email/drafts', requireAuth, async (req: Request, res: Response) => {
    const actor = requireEmailActor(req, res);
    if (!actor) return;
    try {
      await requireEmailTables();
      const {
        id, toEmail, ccEmail, bccEmail, subject, body, templateId,
        recipientName, institutionName, attachments, sendAt,
      } = req.body || {};

      const normalizedTo = normalizeEmailRecipients(toEmail, sendAt != null && sendAt !== '');
      const normalizedCc = normalizeEmailRecipients(ccEmail);
      const normalizedBcc = normalizeEmailRecipients(bccEmail);
      const normalizedSubject = normalizeSubject(subject, sendAt != null && sendAt !== '');
      const normalizedBody = sanitizeEmailHtml(body);
      const normalizedRecipientName = boundedText(recipientName, 300);
      const normalizedInstitutionName = boundedText(institutionName, 300);
      let normalizedSendAt: string | null = null;
      if (sendAt != null && sendAt !== '') {
        if (typeof sendAt !== 'string') throw new Error('INVALID_INPUT');
        const parsedSendAt = new Date(sendAt);
        const maxSendAt = Date.now() + 366 * 24 * 60 * 60 * 1000;
        if (Number.isNaN(parsedSendAt.getTime()) || parsedSendAt.getTime() <= Date.now() || parsedSendAt.getTime() > maxSendAt) {
          throw new Error('INVALID_INPUT');
        }
        normalizedSendAt = parsedSendAt.toISOString();
      }
      const status = normalizedSendAt ? 'scheduled' : 'draft';
      let normalizedDraftId: number | null = null;
      if (id != null && id !== '') {
        normalizedDraftId = Number(id);
        if (!Number.isInteger(normalizedDraftId) || normalizedDraftId <= 0) throw new Error('INVALID_INPUT');
      }

      let normalizedTemplateId: number | null = null;
      let templateCategory: string | null = null;
      if (templateId != null && templateId !== '') {
        normalizedTemplateId = Number(templateId);
        if (!Number.isInteger(normalizedTemplateId) || normalizedTemplateId <= 0) throw new Error('INVALID_INPUT');
        const [template] = await db.select({ id: emailTemplates.id, category: emailTemplates.category })
          .from(emailTemplates)
          .where(and(eq(emailTemplates.isActive, true), accessibleTemplateWhere(actor, normalizedTemplateId)))
          .limit(1);
        if (!template) return res.status(404).json({ error: 'Mal ikke funnet' });
        templateCategory = template.category;
      }

      const channelPolicy = await requireUserComposedSmtpPolicy(
        res,
        actor,
        { category: templateCategory },
        '/api/email/drafts',
      );
      if (!channelPolicy) return;

      const resolvedAttachments = await resolvePrivateAttachments(attachments, actor);
      const attachmentsJson = JSON.stringify(resolvedAttachments.ids.map((attachmentId) => ({ id: attachmentId })));
      if (normalizedDraftId) {
        const updated = await pool.query(
          `UPDATE tidum_email_drafts SET
              to_email = $1, cc_email = $2, bcc_email = $3, subject = $4, body = $5,
              template_id = $6, recipient_name = $7, institution_name = $8,
              attachments = $9::jsonb, send_at = $10, status = $11, updated_at = NOW()
            WHERE id = $12 AND vendor_id = $13 AND user_id = $14
              AND status IN ('draft', 'scheduled', 'failed')
            RETURNING *`,
          [normalizedTo, normalizedCc, normalizedBcc, normalizedSubject, normalizedBody,
           normalizedTemplateId, normalizedRecipientName, normalizedInstitutionName,
           attachmentsJson, normalizedSendAt, status, normalizedDraftId, actor.vendorId, actor.id],
        );
        if (updated.rows.length === 0) return res.status(404).json({ error: 'Utkast ikke funnet' });
        return res.json(updated.rows[0]);
      }
      const inserted = await pool.query(
        `INSERT INTO tidum_email_drafts
            (vendor_id, user_id, to_email, cc_email, bcc_email, subject, body,
             template_id, recipient_name, institution_name, attachments, send_at, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13)
         RETURNING *`,
        [actor.vendorId, actor.id, normalizedTo, normalizedCc, normalizedBcc, normalizedSubject, normalizedBody,
         normalizedTemplateId, normalizedRecipientName, normalizedInstitutionName,
         attachmentsJson, normalizedSendAt, status],
      );
      return res.json(inserted.rows[0]);
    } catch (error) {
      return emailRouteError(res, 'draft save', error);
    }
  });

  app.delete('/api/email/drafts/:id', requireAuth, async (req: Request, res: Response) => {
      const actor = requireEmailActor(req, res);
      if (!actor) return;
      try {
        await requireEmailTables();
        const draftId = Number(req.params.id);
        if (!Number.isInteger(draftId) || draftId <= 0) throw new Error('INVALID_INPUT');
        const deleted = await pool.query(
        `DELETE FROM tidum_email_drafts
         WHERE id = $1 AND vendor_id = $2 AND user_id = $3
           AND status IN ('draft', 'scheduled', 'failed')
         RETURNING id`,
        [draftId, actor.vendorId, actor.id],
      );
      if (deleted.rows.length === 0) return res.status(404).json({ error: 'Utkast ikke funnet' });
      return res.json({ ok: true });
    } catch (error) {
      return emailRouteError(res, 'draft delete', error);
    }
  });

  // ════════════════════════════════════════════════════════════════════
  //  AI-ASSISTED DRAFT
  // ════════════════════════════════════════════════════════════════════

  app.post('/api/email/ai-draft', requireAuth, async (req: Request, res: Response) => {
    const actor = requireEmailActor(req, res);
    if (!actor) return;
    try {
      const channelPolicy = await requireUserComposedSmtpPolicy(
        res,
        actor,
        { category: 'ai-draft' },
        '/api/email/ai-draft',
      );
      if (!channelPolicy) return;
      if (process.env.ALLOW_AI_EMAIL_DRAFTS !== 'true' || !process.env.OPENAI_API_KEY) {
        return res.status(503).json({ error: 'AI-utkast er ikke aktivert for denne installasjonen' });
      }
      const recipient = boundedText(req.body?.recipient, 300) ?? 'ukjent';
      const sak = boundedText(req.body?.sak, 2_000);
      const tema = boundedText(req.body?.tema, 2_000) ?? 'generell oppfølging';
      const requestedTone = boundedText(req.body?.tone, 50) ?? 'profesjonell';
      const allowedTones = new Set(['profesjonell', 'vennlig', 'kortfattet', 'formell']);
      const tone = allowedTones.has(requestedTone.toLowerCase()) ? requestedTone.toLowerCase() : 'profesjonell';
      const senderName = [actor.firstName, actor.lastName].filter(Boolean).join(' ') || actor.email || 'Ukjent';

      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const sys = `Du skriver profesjonell e-post på norsk for Tidum, et arbeidstidssystem for barnevern, omsorg og miljøarbeid. Hold tonen ${tone}. Returner JSON med to felt: "subject" (kort, klart, < 80 tegn) og "body" (HTML med <p>, <ul>, <strong>, <a> der relevant — INGEN <html>/<body>-tagger). Avslutt body med en kort hilsen som inkluderer ${senderName}.`;
      const userPrompt = [
        `Mottaker: ${recipient}`,
        sak ? `Sak / kontekst: ${sak}` : null,
        `Tema: ${tema}`,
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
        subject: typeof parsed.subject === 'string' ? normalizeSubject(parsed.subject, false) ?? '' : '',
        body: typeof parsed.body === 'string' ? sanitizeEmailHtml(parsed.body) : '',
      });
    } catch (error) {
      return emailRouteError(res, 'AI draft', error);
    }
  });
}

// ════════════════════════════════════════════════════════════════════
//  SEED TEMPLATES — bootstrap a starter library so new vendors see
//  useful defaults out of the box. Idempotent per system slug.
// ════════════════════════════════════════════════════════════════════
let seedChecked = false;
async function ensureSeedTemplates() {
  if (seedChecked) return;
  seedChecked = true;
  try {
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
          vendorId: null,
          userId: null,
          name: tpl.name,
          slug: tpl.slug,
          subject: tpl.subject,
          htmlContent: tpl.htmlContent,
          textContent: tpl.htmlContent.replace(/<[^>]+>/g, ''),
          variables: tpl.variables as any,
          category: tpl.category,
          isActive: true,
          isPublic: true,
        }).onConflictDoNothing();
      } catch (e) {
        // ignore individual failures
      }
    }
    console.log('[email] Ensured', STARTER.length, 'starter templates');
  } catch (e) {
    console.warn('[email] ensureSeedTemplates failed:', e);
  }
}

// ════════════════════════════════════════════════════════════════════
//  ATTACHMENTS — resolve only private, actor-owned objects. External URLs are
//  never fetched here; accepting them would turn this endpoint into an SSRF
//  primitive and make attachment ownership impossible to enforce.
// ════════════════════════════════════════════════════════════════════
type ResolvedPrivateAttachments = {
  ids: string[];
  files: Array<{ filename: string; content: Buffer; contentType: string }>;
};

async function resolvePrivateAttachments(rawList: unknown, actor: EmailActor): Promise<ResolvedPrivateAttachments> {
  if (rawList == null) return { ids: [], files: [] };
  if (!Array.isArray(rawList) || rawList.length > 10) throw new Error('INVALID_INPUT');

  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const ids = rawList.map((attachment) => {
    if (!attachment || typeof attachment !== 'object' || Array.isArray(attachment)) throw new Error('INVALID_INPUT');
    const id = (attachment as Record<string, unknown>).id;
    if (typeof id !== 'string' || !uuidPattern.test(id)) throw new Error('INVALID_INPUT');
    return id.toLowerCase();
  });
  if (new Set(ids).size !== ids.length) throw new Error('INVALID_INPUT');
  if (ids.length === 0) return { ids: [], files: [] };

  const result = await pool.query(
    `SELECT id::text, stored_name, original_name, mime_type, size_bytes
       FROM tidum_email_attachments
      WHERE id = ANY($1::uuid[]) AND vendor_id = $2 AND user_id = $3`,
    [ids, actor.vendorId, actor.id],
  );
  if (result.rows.length !== ids.length) throw new Error('ATTACHMENT_NOT_FOUND');

  const metadataById = new Map(result.rows.map((row) => [String(row.id).toLowerCase(), row]));
  const files: ResolvedPrivateAttachments['files'] = [];
  let totalBytes = 0;
  const allowedStoredName = /^[0-9a-f]{48}\.(pdf|jpg|png|webp|gif|txt|csv|docx|xlsx)$/;
  const root = path.resolve(EMAIL_UPLOAD_DIR);

  for (const id of ids) {
    const metadata = metadataById.get(id);
    if (!metadata) throw new Error('ATTACHMENT_NOT_FOUND');
    const storedName = String(metadata.stored_name);
    const size = Number(metadata.size_bytes);
    const mimeType = String(metadata.mime_type);
    if (!allowedStoredName.test(storedName) || storedName !== path.basename(storedName)) {
      throw new Error('ATTACHMENT_NOT_FOUND');
    }
    const filePath = path.resolve(root, storedName);
    if (!filePath.startsWith(`${root}${path.sep}`)) throw new Error('ATTACHMENT_NOT_FOUND');

    let stat: fs.Stats;
    let content: Buffer;
    try {
      stat = await fs.promises.lstat(filePath);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('ATTACHMENT_NOT_FOUND');
      content = await fs.promises.readFile(filePath);
    } catch {
      throw new Error('ATTACHMENT_NOT_FOUND');
    }
    if (!Number.isInteger(size) || content.length !== size || !hasValidAttachmentSignature(content, mimeType)) {
      throw new Error('ATTACHMENT_NOT_FOUND');
    }
    totalBytes += content.length;
    if (totalBytes > 25 * 1024 * 1024) throw new Error('INVALID_INPUT');
    files.push({
      filename: safeAttachmentName(metadata.original_name),
      content,
      contentType: mimeType,
    });
  }

  return { ids, files };
}
