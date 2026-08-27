import type { Express, Request, Response } from 'express';
import { pool } from '../db';
import { emailService } from '../lib/email-service';
import { ExportService } from '../lib/export-service';
import { logRow, users } from '@shared/schema';
import { db } from '../db';
import { eq, and, between } from 'drizzle-orm';
import { format } from 'date-fns';
import { nb } from 'date-fns/locale';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { requireAuth } from '../middleware/auth';
import {
  boundedText,
  canSendReportFor,
  emailActor,
  escapeEmailHtml,
  normalizeEmailRecipients,
  validateReportPeriod,
} from '../lib/email-composer-security';
import {
  assertUserComposedSmtpAllowed,
  loadEmailChannelPolicy,
  recordEmailPolicyBlock,
} from '../lib/email-channel-policy';
import {
  isSecureChannelRequiredError,
  SECURE_CHANNEL_REQUIRED_CODE,
} from '../lib/outbound-email-policy';

interface AuthRequest extends Request {
  user?: any;
  admin?: any;
}

// ── Temp directory for manual-download files ───────────────────────────
const FORWARD_DIR = path.join(process.cwd(), 'tmp', 'forwards');
fs.mkdirSync(FORWARD_DIR, { recursive: true });

function cleanupOldFiles() {
  try {
    const files = fs.readdirSync(FORWARD_DIR);
    const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24 hours
    for (const file of files) {
      const fp = path.join(FORWARD_DIR, file);
      const stat = fs.statSync(fp);
      if (stat.mtimeMs < cutoff) fs.unlinkSync(fp);
    }
  } catch { /* ignore */ }
}

// ── Shared helpers ─────────────────────────────────────────────────────

async function getTiltakslederEmail(userId: string): Promise<string | null> {
  try {
    const [sender] = await db
      .select({ vendorId: users.vendorId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!sender?.vendorId) return null;

    const [leader] = await db
      .select({ email: users.email })
      .from(users)
      .where(and(eq(users.vendorId, sender.vendorId), eq(users.role, 'tiltaksleder')))
      .limit(1);
    return leader?.email || null;
  } catch { return null; }
}

const reportTypeLabels: Record<string, string> = {
  timesheet: 'Timeregistrering',
  'case-report': 'Saksrapport',
  overtime: 'Overtidsrapport',
};

function normalizeForwardRequest(body: any) {
  const recipientEmail = normalizeEmailRecipients(body?.recipientEmail, true)!;
  if (recipientEmail.includes(',')) throw new Error('INVALID_INPUT');
  const reportType = boundedText(body?.reportType, 50, true)!;
  if (!Object.prototype.hasOwnProperty.call(reportTypeLabels, reportType)) throw new Error('INVALID_INPUT');
  const periodStart = boundedText(body?.periodStart, 10, true)!;
  const periodEnd = boundedText(body?.periodEnd, 10, true)!;
  if (!validateReportPeriod(periodStart, periodEnd)) throw new Error('INVALID_INPUT');
  return {
    recipientEmail,
    recipientName: boundedText(body?.recipientName, 300) ?? undefined,
    institutionName: boundedText(body?.institutionName, 300) ?? undefined,
    reportType,
    periodStart,
    periodEnd,
    message: boundedText(body?.message, 10_000) ?? undefined,
    requestedUserId: boundedText(body?.userId, 500),
  };
}

async function resolveTargetUserId(
  actor: NonNullable<ReturnType<typeof emailActor>>,
  currentRole: string,
  requestedUserId: string | null,
): Promise<string | null> {
  const targetUserId = requestedUserId || actor.id;
  if (!canSendReportFor({ ...actor, role: currentRole }, targetUserId)) return null;
  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, targetUserId), eq(users.vendorId, actor.vendorId)))
    .limit(1);
  return target?.id ?? null;
}

async function buildReportData(vendorId: number, targetUserId: string, periodStart: string, periodEnd: string) {
  const entries = await db
    .select()
    .from(logRow)
    .where(and(
      eq(logRow.vendorId, vendorId),
      eq(logRow.userId, targetUserId),
      between(logRow.date, periodStart, periodEnd),
    ))
    .orderBy(logRow.date);

  const exportData = entries.map((entry) => {
    const startTime = entry.startTime || '';
    const endTime = entry.endTime || '';
    const breakHours = parseFloat(entry.breakHours || '0');
    let hours = 0;
    if (startTime && endTime) {
      const [startH, startM] = startTime.split(':').map(Number);
      const [endH, endM] = endTime.split(':').map(Number);
      hours = (endH * 60 + endM - startH * 60 - startM) / 60 - breakHours;
    }
    return {
      id: entry.id,
      date: entry.date?.toString() || '',
      startTime, endTime, breakHours,
      activity: entry.activity || '',
      title: entry.title || '',
      project: entry.project || '',
      place: entry.place || '',
      notes: entry.notes || '',
      hours,
    };
  });

  const totalHours = exportData.reduce((s, e) => s + e.hours, 0);
  const totalDays = new Set(exportData.map((e) => e.date)).size;
  return { exportData, totalHours, totalDays };
}

function buildEmailContent(p: {
  recipientName?: string; institutionName?: string; senderName: string;
  reportLabel: string; periodLabel: string; totalHours: number;
  totalDays: number; entriesCount: number; message?: string; hasAttachment: boolean;
}) {
  const recipientName = p.recipientName ? escapeEmailHtml(p.recipientName) : '';
  const institutionName = p.institutionName ? escapeEmailHtml(p.institutionName) : '';
  const senderName = escapeEmailHtml(p.senderName);
  const reportLabel = escapeEmailHtml(p.reportLabel);
  const periodLabel = escapeEmailHtml(p.periodLabel);
  const message = p.message ? escapeEmailHtml(p.message).replace(/\n/g, '<br>') : '';
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#0066cc;color:#fff;padding:20px;border-radius:8px 8px 0 0">
        <h2 style="margin:0;font-size:18px">📋 ${reportLabel}</h2>
      </div>
      <div style="padding:20px;background:#f9f9f9;border-radius:0 0 8px 8px">
        ${recipientName ? `<p>Til: <strong>${recipientName}</strong></p>` : ''}
        ${institutionName ? `<p>Institusjon: <strong>${institutionName}</strong></p>` : ''}
        <p>Fra: <strong>${senderName}</strong></p>
        <p>Periode: <strong>${periodLabel}</strong></p>
        <div style="background:#fff;padding:15px;border-radius:4px;margin:15px 0;border-left:4px solid #0066cc">
          <strong>Oppsummering:</strong><br>
          Antall registreringer: ${p.entriesCount}<br>
          Totalt timer: ${p.totalHours.toFixed(1)}<br>
          Antall dager: ${p.totalDays}
        </div>
        ${message ? `<div style="background:#fff;padding:15px;border-radius:4px;margin:15px 0"><strong>Melding:</strong><br>${message}</div>` : ''}
        ${p.hasAttachment ? '<p>📎 Se vedlagt Excel-fil for detaljert oversikt.</p>' : ''}
        <p style="color:#666;font-size:12px;margin-top:20px">Sendt via Tidum – Smart Timing · ${format(new Date(), 'dd.MM.yyyy HH:mm', { locale: nb })}</p>
      </div>
    </div>`;

  const text = `${p.reportLabel} fra ${p.senderName}\nPeriode: ${p.periodLabel}\nTimer: ${p.totalHours.toFixed(1)}\nDager: ${p.totalDays}${p.message ? `\n\nMelding: ${p.message}` : ''}`;

  return { html, text };
}

async function logForward(userId: string, recipientEmail: string, institution: string | null, reportType: string, periodStart: string, periodEnd: string, status: string) {
  try {
    await pool.query(
      `INSERT INTO tidum_forward_log (user_id, recipient_email, institution_name, report_type, period_start, period_end, status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())`,
      [userId, recipientEmail, institution, reportType, periodStart, periodEnd, status],
    );
  } catch { /* tidum_forward_log may not exist yet – non-critical */ }
}

// ── Routes ─────────────────────────────────────────────────────────────

export function registerForwardRoutes(app: Express) {

  // ─ Email-status (tells frontend whether SMTP direct-send is available) ─
  app.get('/api/forward/email-status', requireAuth, async (req: Request, res: Response) => {
    const actor = emailActor(req);
    if (!actor) return res.status(403).json({ error: 'Brukeren mangler gyldig tenant-tilknytning' });
    try {
      const policy = await loadEmailChannelPolicy(actor);
      let secureChannelRequired = false;
      try {
        assertUserComposedSmtpAllowed(policy);
      } catch (error) {
        if (!isSecureChannelRequiredError(error)) throw error;
        secureChannelRequired = true;
      }
      res.json({
        smtp: emailService.getIsConfigured() && !secureChannelRequired,
        manual: !secureChannelRequired,
        secureChannelRequired,
      });
    } catch {
      res.status(500).json({ error: 'Kunne ikke kontrollere e-postpolicy' });
    }
  });

  // ─ SMTP send (direct delivery with Excel attachment) ──────────────────
  app.post('/api/forward/send', requireAuth, async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const user = authReq.user || authReq.admin;
      if (!user) return res.status(401).json({ error: 'Ikke autentisert' });

      const {
        recipientEmail,
        recipientName,
        institutionName,
        reportType,
        periodStart,
        periodEnd,
        message,
        requestedUserId,
      } = normalizeForwardRequest(req.body);

      const actor = emailActor(req);
      if (!actor) return res.status(403).json({ error: 'Brukeren mangler gyldig tenant-tilknytning' });
      const policy = await loadEmailChannelPolicy(actor);
      try {
        assertUserComposedSmtpAllowed(policy, { reportType });
      } catch (error) {
        if (!isSecureChannelRequiredError(error)) throw error;
        await recordEmailPolicyBlock({
          actorUserId: policy.actorUserId,
          vendorId: policy.vendorId,
          kommuneId: policy.kommuneId,
          route: '/api/forward/send',
          purpose: 'report_export',
          reasonCode: error.reasonCode,
          metadata: { reportType, hasAttachment: true },
        });
        return res.status(422).json({
          error: 'Rapporten kan ikke sendes på e-post. Bruk Sikker sending.',
          code: SECURE_CHANNEL_REQUIRED_CODE,
        });
      }

      const targetUserId = await resolveTargetUserId(actor, policy.role, requestedUserId);
      if (!targetUserId) return res.status(403).json({ error: 'Kan ikke eksportere rapport for valgt bruker' });
      const senderName = user.name || user.email || 'Ukjent';
      const reportLabel = reportTypeLabels[reportType] || 'Rapport';

      const { exportData, totalHours, totalDays } = await buildReportData(policy.vendorId, targetUserId, periodStart, periodEnd);

      // Generate Excel attachment
      let attachment: { filename: string; content: Buffer; contentType: string } | undefined;
      try {
        const buffer = await ExportService.generateExcel(exportData, { startDate: periodStart, endDate: periodEnd, title: reportLabel, includeNotes: true });
        attachment = { filename: `${reportLabel.toLowerCase().replace(/\s/g, '_')}_${periodStart}_${periodEnd}.xlsx`, content: buffer, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
      } catch { console.warn('Could not generate Excel, sending without attachment'); }

      const periodLabel = `${format(new Date(periodStart), 'dd.MM.yyyy', { locale: nb })} – ${format(new Date(periodEnd), 'dd.MM.yyyy', { locale: nb })}`;
      const { html, text } = buildEmailContent({ recipientName, institutionName, senderName, reportLabel, periodLabel, totalHours, totalDays, entriesCount: exportData.length, message, hasAttachment: !!attachment });

      // Dynamic Reply-To: reports → tiltaksleder, fallback → support
      const tiltakslederEmail = await getTiltakslederEmail(targetUserId);
      const replyTo = tiltakslederEmail || process.env.SMTP_REPLY_TO || user.email;

      const sent = await emailService.sendEmail({
        purpose: "user_composed",
        to: recipientEmail,
        replyTo,
        subject: `${reportLabel} – ${senderName} – ${periodLabel}`,
        html, text,
        attachments: attachment ? [attachment] : undefined,
      });

      await logForward(targetUserId, recipientEmail, institutionName || null, reportType, periodStart, periodEnd, sent ? 'sent' : 'failed');

      if (sent) {
        res.json({ success: true, message: `Rapporten ble sendt til ${recipientEmail}`, summary: { totalHours: totalHours.toFixed(1), totalDays, entries: exportData.length } });
      } else {
        res.status(503).json({ error: 'E-posttjenesten er ikke konfigurert. Bruk manuell nedlasting.', code: 'SMTP_NOT_CONFIGURED' });
      }
    } catch (error: any) {
      console.error('Forward send error:', error);
      if (isSecureChannelRequiredError(error)) {
        return res.status(422).json({
          error: 'Rapporten kan ikke sendes på e-post. Bruk Sikker sending.',
          code: SECURE_CHANNEL_REQUIRED_CODE,
        });
      }
      if (error instanceof Error && (error.message === 'INVALID_INPUT' || error.message === 'INVALID_EMAIL')) {
        return res.status(400).json({ error: 'Ugyldige rapportdata' });
      }
      res.status(500).json({ error: 'Kunne ikke sende rapporten' });
    }
  });

  // ─ Prepare (manual download mode – no SMTP needed) ────────────────────
  app.post('/api/forward/prepare', requireAuth, async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const user = authReq.user || authReq.admin;
      if (!user) return res.status(401).json({ error: 'Ikke autentisert' });

      const {
        recipientEmail,
        recipientName,
        institutionName,
        reportType,
        periodStart,
        periodEnd,
        message,
        requestedUserId,
      } = normalizeForwardRequest(req.body);

      const actor = emailActor(req);
      if (!actor) return res.status(403).json({ error: 'Brukeren mangler gyldig tenant-tilknytning' });
      const policy = await loadEmailChannelPolicy(actor);
      try {
        assertUserComposedSmtpAllowed(policy, { reportType });
      } catch (error) {
        if (!isSecureChannelRequiredError(error)) throw error;
        await recordEmailPolicyBlock({
          actorUserId: policy.actorUserId,
          vendorId: policy.vendorId,
          kommuneId: policy.kommuneId,
          route: '/api/forward/prepare',
          purpose: 'manual_report_email',
          reasonCode: error.reasonCode,
          metadata: { reportType, hasAttachment: true },
        });
        return res.status(422).json({
          error: 'Rapporten kan ikke deles på e-post. Bruk Sikker sending.',
          code: SECURE_CHANNEL_REQUIRED_CODE,
        });
      }

      cleanupOldFiles();

      const targetUserId = await resolveTargetUserId(actor, policy.role, requestedUserId);
      if (!targetUserId) return res.status(403).json({ error: 'Kan ikke eksportere rapport for valgt bruker' });
      const senderName = user.name || user.email || 'Ukjent';
      const reportLabel = reportTypeLabels[reportType] || 'Rapport';

      const { exportData, totalHours, totalDays } = await buildReportData(policy.vendorId, targetUserId, periodStart, periodEnd);

      // Generate Excel & save to disk
      const buffer = await ExportService.generateExcel(exportData, { startDate: periodStart, endDate: periodEnd, title: reportLabel, includeNotes: true });
      const token = crypto.randomBytes(16).toString('hex');
      const actorHash = crypto.createHash('sha256').update(actor.id).digest('hex').slice(0, 16);
      const fileName = `${reportLabel.toLowerCase().replace(/\s/g, '_')}_${periodStart}_${periodEnd}_${actorHash}_${token}.xlsx`;
      fs.writeFileSync(path.join(FORWARD_DIR, fileName), buffer);

      // Build mailto: link
      const periodLabel = `${format(new Date(periodStart), 'dd.MM.yyyy', { locale: nb })} – ${format(new Date(periodEnd), 'dd.MM.yyyy', { locale: nb })}`;
      const subject = encodeURIComponent(`${reportLabel} – ${senderName} – ${periodLabel}`);
      const body = encodeURIComponent(
        `Hei${recipientName ? ` ${recipientName}` : ''},\n\n${message || 'Vedlagt finner du timelisten for den aktuelle perioden.'}\n\nPeriode: ${periodLabel}\nAntall oppføringer: ${exportData.length}\nTotalt timer: ${totalHours.toFixed(1)}\n\nVennlig hilsen\n${senderName}`
      );
      const mailtoLink = `mailto:${recipientEmail}?subject=${subject}&body=${body}`;

      await logForward(targetUserId, recipientEmail, institutionName || null, reportType || 'timesheet', periodStart, periodEnd, 'prepared');

      res.json({
        success: true,
        downloadUrl: `/api/forward/download/${token}`,
        fileName: fileName.replace(`_${actorHash}_${token}`, ''),
        mailtoLink,
        entriesCount: exportData.length,
        totalHours: totalHours.toFixed(1),
        totalDays,
      });
    } catch (error: any) {
      console.error('Forward prepare error:', error);
      if (error instanceof Error && (error.message === 'INVALID_INPUT' || error.message === 'INVALID_EMAIL')) {
        return res.status(400).json({ error: 'Ugyldige rapportdata' });
      }
      res.status(500).json({ error: 'Kunne ikke forberede rapporten' });
    }
  });

  // ─ Download prepared file (authenticated owner + token, 24 h expiry) ──
  app.get('/api/forward/download/:token', requireAuth, (req: Request, res: Response) => {
    const { token } = req.params;
    try {
      if (!/^[a-f0-9]{32}$/.test(token)) return res.status(404).json({ error: 'Fil ikke funnet eller utløpt' });
      const actor = emailActor(req);
      if (!actor) return res.status(403).json({ error: 'Ikke tilgang' });
      const actorHash = crypto.createHash('sha256').update(actor.id).digest('hex').slice(0, 16);
      const files = fs.readdirSync(FORWARD_DIR);
      const match = files.find((file) => file.endsWith(`_${actorHash}_${token}.xlsx`));
      if (!match) return res.status(404).json({ error: 'Fil ikke funnet eller utløpt' });

      const filePath = path.join(FORWARD_DIR, match);
      const cleanName = match.replace(/_[a-f0-9]{16}_[a-f0-9]{32}/, '');
      res.download(filePath, cleanName);
    } catch {
      res.status(404).json({ error: 'Fil ikke funnet' });
    }
  });

  // ─ Confirm manual send ────────────────────────────────────────────────
  app.post('/api/forward/confirm', requireAuth, async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const user = authReq.user || authReq.admin;
      if (!user) return res.status(401).json({ error: 'Ikke autentisert' });

      const userId = user.id || user.email || 'default';
      try {
        await pool.query(
          `UPDATE tidum_forward_log SET status = 'confirmed' WHERE user_id = $1 AND status = 'prepared' AND created_at = (SELECT MAX(created_at) FROM tidum_forward_log WHERE user_id = $1 AND status = 'prepared')`,
          [userId],
        );
      } catch { /* non-critical */ }

      res.json({ success: true });
    } catch (error) {
      console.error('Forward confirm error:', error);
      res.status(500).json({ error: 'Kunne ikke bekrefte videresendingen' });
    }
  });

  // ─ Forwarding history ─────────────────────────────────────────────────
  app.get('/api/forward/history', requireAuth, async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const user = authReq.user || authReq.admin;
      if (!user) return res.status(401).json({ error: 'Ikke autentisert' });

      const userId = user.id || user.email || 'default';
      try {
        const result = await pool.query('SELECT * FROM tidum_forward_log WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50', [userId]);
        res.json(result.rows);
      } catch { res.json([]); }
    } catch (error) {
      console.error('Forward history error:', error);
      res.status(500).json({ error: 'Kunne ikke hente historikken' });
    }
  });
}
