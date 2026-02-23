import type { Express, Request, Response } from 'express';
import { pool } from '../db';
import { emailService } from '../lib/email-service';
import { ExportService } from '../lib/export-service';
import { logRow } from '@shared/schema';
import { db } from '../db';
import { eq, and, between } from 'drizzle-orm';
import { format } from 'date-fns';
import { nb } from 'date-fns/locale';

interface AuthRequest extends Request {
  user?: any;
  admin?: any;
}

export function registerForwardRoutes(app: Express) {
  /**
   * Forward report/timesheet to institution via email
   * POST /api/forward/send
   */
  app.post('/api/forward/send', async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const user = authReq.user || authReq.admin;
      if (!user) {
        return res.status(401).json({ error: 'Ikke autentisert' });
      }

      const {
        recipientEmail,
        recipientName,
        institutionName,
        reportType, // 'timesheet' | 'case-report' | 'overtime'
        periodStart,
        periodEnd,
        message,
        userId,
      } = req.body;

      if (!recipientEmail || !reportType || !periodStart || !periodEnd) {
        return res.status(400).json({
          error: 'Mottakerens e-post, rapporttype og periode er påkrevd',
        });
      }

      const targetUserId = userId || user.id || user.email || 'default';

      // Generate report data
      const entries = await db
        .select()
        .from(logRow)
        .where(
          and(
            eq(logRow.userId, targetUserId),
            between(logRow.date, periodStart, periodEnd)
          )
        )
        .orderBy(logRow.date);

      // Build export data
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
          startTime,
          endTime,
          breakHours,
          activity: entry.activity || '',
          title: entry.title || '',
          project: entry.project || '',
          place: entry.place || '',
          notes: entry.notes || '',
          hours,
        };
      });

      const totalHours = exportData.reduce((sum, e) => sum + e.hours, 0);
      const totalDays = new Set(exportData.map((e) => e.date)).size;
      const senderName = user.name || user.email || 'Ukjent';

      const reportTypeLabels: Record<string, string> = {
        timesheet: 'Timeregistrering',
        'case-report': 'Saksrapport',
        overtime: 'Overtidsrapport',
      };
      const reportLabel = reportTypeLabels[reportType] || 'Rapport';

      // Generate Excel attachment
      let attachment: { filename: string; content: Buffer; contentType: string } | undefined;
      try {
        const buffer = await ExportService.generateExcel(exportData, {
          startDate: periodStart,
          endDate: periodEnd,
          title: reportLabel,
          includeNotes: true,
        });
        attachment = {
          filename: `${reportLabel.toLowerCase().replace(/\s/g, '_')}_${periodStart}_${periodEnd}.xlsx`,
          content: buffer,
          contentType:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        };
      } catch {
        // Excel generation might fail if exceljs not installed — continue without attachment
        console.warn('Could not generate Excel attachment, sending email without it');
      }

      // Build email
      const periodLabel = `${format(new Date(periodStart), 'dd.MM.yyyy', { locale: nb })} – ${format(
        new Date(periodEnd),
        'dd.MM.yyyy',
        { locale: nb }
      )}`;

      const emailSent = await emailService.sendEmail({
        to: recipientEmail,
        subject: `${reportLabel} – ${senderName} – ${periodLabel}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #0066cc; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
              <h2 style="margin: 0; font-size: 18px;">📋 ${reportLabel}</h2>
            </div>
            <div style="padding: 20px; background: #f9f9f9; border-radius: 0 0 8px 8px;">
              ${recipientName ? `<p>Til: <strong>${recipientName}</strong></p>` : ''}
              ${institutionName ? `<p>Institusjon: <strong>${institutionName}</strong></p>` : ''}
              <p>Fra: <strong>${senderName}</strong></p>
              <p>Periode: <strong>${periodLabel}</strong></p>

              <div style="background: white; padding: 15px; border-radius: 4px; margin: 15px 0; border-left: 4px solid #0066cc;">
                <strong>Oppsummering:</strong><br>
                Antall registreringer: ${exportData.length}<br>
                Totalt timer: ${totalHours.toFixed(1)}<br>
                Antall dager: ${totalDays}
              </div>

              ${message ? `<div style="background: white; padding: 15px; border-radius: 4px; margin: 15px 0;">
                <strong>Melding:</strong><br>
                ${message.replace(/\n/g, '<br>')}
              </div>` : ''}

              ${attachment ? '<p>📎 Se vedlagt Excel-fil for detaljert oversikt.</p>' : ''}

              <p style="color: #666; font-size: 12px; margin-top: 20px;">
                Sendt via Tidum – Smart Timing · ${format(new Date(), 'dd.MM.yyyy HH:mm', { locale: nb })}
              </p>
            </div>
          </div>
        `,
        text: `${reportLabel} fra ${senderName}\nPeriode: ${periodLabel}\nTimer: ${totalHours.toFixed(1)}\nDager: ${totalDays}${
          message ? `\n\nMelding: ${message}` : ''
        }`,
        attachments: attachment ? [attachment] : undefined,
      });

      // Log the forwarding action
      try {
        await pool.query(
          `INSERT INTO forward_log (user_id, recipient_email, institution_name, report_type, period_start, period_end, status, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
          [
            targetUserId,
            recipientEmail,
            institutionName || null,
            reportType,
            periodStart,
            periodEnd,
            emailSent ? 'sent' : 'failed',
          ]
        );
      } catch {
        // forward_log table might not exist yet — non-critical
      }

      if (emailSent) {
        res.json({
          success: true,
          message: `Rapporten ble sendt til ${recipientEmail}`,
          summary: { totalHours: totalHours.toFixed(1), totalDays, entries: exportData.length },
        });
      } else {
        res.status(503).json({
          error: 'E-posttjenesten er ikke konfigurert. Rapporten kan ikke sendes.',
          hint: 'Konfigurer SMTP-innstillinger i .env-filen',
        });
      }
    } catch (error: any) {
      console.error('Forward error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Get forwarding history
   * GET /api/forward/history
   */
  app.get('/api/forward/history', async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const user = authReq.user || authReq.admin;
      if (!user) {
        return res.status(401).json({ error: 'Ikke autentisert' });
      }

      const userId = user.id || user.email || 'default';

      try {
        const result = await pool.query(
          `SELECT * FROM forward_log WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
          [userId]
        );
        res.json(result.rows);
      } catch {
        // Table might not exist yet
        res.json([]);
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
}
