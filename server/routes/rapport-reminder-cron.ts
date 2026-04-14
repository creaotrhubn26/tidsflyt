/**
 * server/routes/rapport-reminder-cron.ts
 *
 * Institution-aware rapport reminders. At month-end, for each active
 * institution with saker assigned to miljøarbeidere, check who hasn't
 * started this month's rapport and send a reminder email.
 */

import type { Express, Request, Response } from 'express';
import cron from 'node-cron';
import { db } from '../db';
import { and, eq, between, inArray } from 'drizzle-orm';
import {
  vendorInstitutions, saker, rapporter, users,
} from '@shared/schema';
import { emailService } from '../lib/email-service';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { requireAuth, ADMIN_ROLES } from '../middleware/auth';

function isAdminRole(req: Request): boolean {
  const role = String(((req as any).authUser ?? (req as any).user)?.role || '')
    .toLowerCase().replace(/[\s-]/g, '_');
  return ADMIN_ROLES.includes(role);
}

/**
 * Run the reminder pass once. Returns counts of users reminded per institution.
 * This is idempotent-safe for a single day — if called twice on the same day,
 * the same emails will be sent again (simple implementation for now).
 */
export async function runRapportReminders(): Promise<Array<{ institutionId: string; instName: string; remindersSent: number }>> {
  const results: Array<{ institutionId: string; instName: string; remindersSent: number }> = [];
  const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(new Date()), 'yyyy-MM-dd');
  const monthLabel = new Date().toLocaleDateString('nb-NO', { month: 'long', year: 'numeric' });

  // Get all active institutions
  const institutions = await db.select().from(vendorInstitutions).where(eq(vendorInstitutions.active, true));

  for (const inst of institutions) {
    try {
      // Find saker for this institution
      const sakerForInst = await db.select().from(saker).where(eq(saker.institutionId, inst.id));
      if (sakerForInst.length === 0) continue;

      const sakIds = sakerForInst.map(s => s.id);

      // Gather assigned user IDs from tildelteUserId arrays
      const assignedUserIds = new Set<string>();
      for (const s of sakerForInst) {
        const ids = Array.isArray(s.tildelteUserId) ? s.tildelteUserId : [];
        for (const id of ids) assignedUserIds.add(String(id));
      }
      if (assignedUserIds.size === 0) continue;

      // Find users who already have a rapport this month for these saker
      const existingRapporter = await db
        .select({ userId: rapporter.userId })
        .from(rapporter)
        .where(and(
          inArray(rapporter.sakId, sakIds),
          between(rapporter.periodeFrom, monthStart, monthEnd),
        ));
      const usersWithRapport = new Set(existingRapporter.map(r => String(r.userId)));

      // The ones who still need a reminder
      const needReminder = [...assignedUserIds].filter(id => !usersWithRapport.has(id));
      if (needReminder.length === 0) continue;

      // Fetch their user records for email addresses
      const userRows = await db.select().from(users).where(inArray(users.id, needReminder));

      let remindersSent = 0;
      for (const u of userRows) {
        if (!u.email) continue;
        try {
          await emailService.sendEmail({
            to: u.email,
            subject: `Påminnelse: rapport for ${inst.name} — ${monthLabel}`,
            html: `
              <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
                <h2 style="color:#1a6b73;margin:0 0 16px;">Månedsrapport venter</h2>
                <p style="line-height:1.6;color:#333;">
                  Hei ${u.firstName || "der"},
                </p>
                <p style="line-height:1.6;color:#333;">
                  Du har ikke startet ${monthLabel.toLowerCase()}s rapport for <strong>${inst.name}</strong> ennå.
                  Månedsslutt nærmer seg — husk å dokumentere aktivitetene dine.
                </p>
                <p style="margin:24px 0;">
                  <a href="https://tidum.no/rapporter/ny" style="display:inline-block;padding:12px 24px;background:#1a6b73;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">
                    Start rapport
                  </a>
                </p>
                <hr style="border:none;border-top:1px solid #eee;margin:24px 0;"/>
                <p style="color:#999;font-size:11px;">Påminnelse sendt automatisk via Tidum</p>
              </div>
            `,
            text: `Hei ${u.firstName || "der"},\n\nDu har ikke startet ${monthLabel.toLowerCase()}s rapport for ${inst.name} ennå. Logg inn på Tidum og start rapporten: https://tidum.no/rapporter/ny\n\n— Tidum`,
          } as any);
          remindersSent++;
        } catch (err) {
          console.error(`Failed to send reminder to ${u.email}:`, err);
        }
      }

      if (remindersSent > 0) {
        results.push({ institutionId: inst.id, instName: inst.name, remindersSent });
      }
    } catch (err) {
      console.error(`Error processing reminders for institution ${inst.id}:`, err);
    }
  }

  return results;
}

let cronStarted = false;
export function setupRapportReminderCron() {
  if (cronStarted) return;
  // Run on the 25th, 28th and last-day of each month at 09:00
  // (covers months of varying length, users get 2-3 reminders)
  cron.schedule('0 9 25,28 * *', async () => {
    console.log('📬 Running rapport reminder cron…');
    const results = await runRapportReminders();
    console.log(`Reminders sent:`, results);
  });
  cronStarted = true;
  console.log('✅ Rapport reminder cron scheduled (25th & 28th at 09:00)');
}

/** Register a manual-trigger endpoint for admins to test + force a run. */
export function registerRapportReminderRoutes(app: Express) {
  app.post('/api/rapport-reminders/run', requireAuth, async (req: Request, res: Response) => {
    try {
      if (!isAdminRole(req)) return res.status(403).json({ error: 'Kun admin+ kan kjøre påminnelser manuelt' });
      const results = await runRapportReminders();
      res.json({ ok: true, results });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}
