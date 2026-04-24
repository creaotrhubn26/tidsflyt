/**
 * server/routes/timesheet-reminder-cron.ts
 *
 * Daily cron that reminds miljøarbeidere to submit the previous month's
 * timeliste before the vendor's configured deadline. Tiltaksleder (or
 * admin) sets the deadline day-of-month via vendors.settings.
 *
 * Schedule:
 *   - 3 days before deadline → soft reminder to submitter
 *   - 1 day before deadline  → reminder
 *   - On deadline day        → final reminder
 *   - 1 day after deadline   → overdue — also CC tiltaksleder
 *
 * Each notification is keyed by {user, month, stage} in metadata so repeat
 * runs the same day remain idempotent-ish (best-effort — we do not dedupe
 * across days).
 */

import type { Express, Request, Response } from 'express';
import cron from 'node-cron';
import { db, pool } from '../db';
import { and, eq, inArray } from 'drizzle-orm';
import { vendors, users } from '@shared/schema';
import { requireAuth, ADMIN_ROLES } from '../middleware/auth';
import { createNotification } from './notification-routes';

const DEFAULT_DEADLINE_DAY = 5;

function isAdminRole(req: Request): boolean {
  const role = String(((req as any).authUser ?? (req as any).user)?.role || '')
    .toLowerCase().replace(/[\s-]/g, '_');
  return ADMIN_ROLES.includes(role);
}

function pad2(n: number): string { return String(n).padStart(2, '0'); }

/** ISO YYYY-MM for the calendar month immediately before `today`. */
function previousMonth(today: Date): string {
  const d = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

/** Returns the Date of the deadline for submitting `prevMonth` within `today`'s month. */
function deadlineDate(today: Date, dayOfMonth: number): Date {
  const day = Math.max(1, Math.min(28, Math.floor(dayOfMonth)));
  return new Date(today.getFullYear(), today.getMonth(), day);
}

type Stage = 'soft' | 'reminder' | 'final' | 'overdue';

function stageForToday(today: Date, deadline: Date): Stage | null {
  const msInDay = 1000 * 60 * 60 * 24;
  const diff = Math.round((today.getTime() - deadline.getTime()) / msInDay);
  if (diff === -3) return 'soft';
  if (diff === -1) return 'reminder';
  if (diff === 0) return 'final';
  if (diff === 1) return 'overdue';
  return null;
}

function stageCopy(stage: Stage, month: string, deadline: Date) {
  const dlStr = deadline.toLocaleDateString('nb-NO', { day: '2-digit', month: 'long' });
  switch (stage) {
    case 'soft':
      return {
        title: 'Timeliste snart klar for innsending',
        message: `Husk å sende inn timelisten for ${month}. Frist: ${dlStr}.`,
      };
    case 'reminder':
      return {
        title: 'Timeliste-frist i morgen',
        message: `Timelisten for ${month} må sendes inn innen ${dlStr}.`,
      };
    case 'final':
      return {
        title: 'Timeliste-frist i dag',
        message: `Siste dag for å sende inn timelisten for ${month} er i dag (${dlStr}).`,
      };
    case 'overdue':
      return {
        title: 'Timeliste overskredet frist',
        message: `Timelisten for ${month} er ikke innsendt. Frist var ${dlStr}.`,
      };
  }
}

export interface ReminderResult {
  userId: string;
  month: string;
  stage: Stage;
  submissionStatus: string | null;
  notified: boolean;
  notifiedTiltaksleder?: boolean;
}

export async function runTimesheetReminders(now: Date = new Date()): Promise<ReminderResult[]> {
  const results: ReminderResult[] = [];
  const vendorRows = await db.select().from(vendors).where(eq(vendors.status, 'active'));
  const month = previousMonth(now);

  for (const vendor of vendorRows) {
    const settings = (vendor.settings ?? {}) as Record<string, any>;
    const deadlineDay = Number(settings.timesheetDeadlineDayOfMonth ?? DEFAULT_DEADLINE_DAY);
    const deadline = deadlineDate(now, deadlineDay);
    const stage = stageForToday(now, deadline);
    if (!stage) continue;

    // Find miljøarbeidere for this vendor
    const workers = await db
      .select({ id: users.id, email: users.email, firstName: users.firstName })
      .from(users)
      .where(and(
        eq(users.vendorId, vendor.id),
        eq(users.role, 'miljoarbeider'),
      ));
    if (workers.length === 0) continue;
    const workerIds = workers.map(w => w.id);

    // Look up each worker's submission status for this month
    const subs = await pool.query(
      `SELECT user_id, status FROM timesheet_submissions
       WHERE vendor_id = $1 AND month = $2 AND user_id = ANY($3::text[])`,
      [vendor.id, month, workerIds],
    ).catch(() => ({ rows: [] as Array<{ user_id: string; status: string }> }));
    const statusById = new Map<string, string>(subs.rows.map(r => [r.user_id, r.status]));

    const copy = stageCopy(stage, month, deadline);

    // Tiltaksleder fallback list (used only on 'overdue' stage)
    let tiltakslederIds: string[] = [];
    if (stage === 'overdue') {
      const tl = await db
        .select({ id: users.id })
        .from(users)
        .where(and(
          eq(users.vendorId, vendor.id),
          eq(users.role, 'tiltaksleder'),
        ));
      tiltakslederIds = tl.map(u => u.id);
    }

    for (const w of workers) {
      const st = statusById.get(w.id) ?? null;
      // Skip users who have already submitted or been approved
      if (st === 'submitted' || st === 'approved') {
        results.push({ userId: w.id, month, stage, submissionStatus: st, notified: false });
        continue;
      }
      try {
        await createNotification({
          userId: w.id,
          type: `timesheet_${stage}`,
          title: copy.title,
          message: copy.message,
          link: '/timesheets',
          metadata: { month, stage, vendorId: vendor.id, deadline: deadline.toISOString() },
        });
      } catch (err) {
        console.error('timesheet reminder createNotification failed:', err);
      }

      let notifiedTiltaksleder = false;
      if (stage === 'overdue' && tiltakslederIds.length > 0) {
        const who = [w.firstName, w.email].filter(Boolean).join(' / ') || w.id;
        for (const tlId of tiltakslederIds) {
          try {
            await createNotification({
              userId: tlId,
              type: 'timesheet_overdue_leder',
              title: 'Timeliste ikke innsendt',
              message: `${who} har ikke sendt inn timelisten for ${month}.`,
              link: '/timesheets',
              metadata: { month, subjectUserId: w.id, vendorId: vendor.id },
            });
            notifiedTiltaksleder = true;
          } catch (err) {
            console.error('overdue tiltaksleder createNotification failed:', err);
          }
        }
      }

      results.push({
        userId: w.id,
        month,
        stage,
        submissionStatus: st,
        notified: true,
        notifiedTiltaksleder,
      });
    }
  }

  return results;
}

let cronStarted = false;
export function setupTimesheetReminderCron() {
  if (cronStarted) return;
  // Daily at 08:00 local time
  cron.schedule('0 8 * * *', async () => {
    console.log('⏰ Running timesheet reminder cron…');
    const results = await runTimesheetReminders();
    const sent = results.filter(r => r.notified).length;
    console.log(`Timesheet reminders sent: ${sent} (candidates: ${results.length})`);
  });
  cronStarted = true;
  console.log('✅ Timesheet reminder cron scheduled (daily 08:00)');
}

export function registerTimesheetReminderRoutes(app: Express) {
  // Admin/tiltaksleder: set the deadline day for this vendor
  app.patch('/api/vendor/timesheet-deadline', requireAuth, async (req: Request, res: Response) => {
    try {
      const u = (req as any).authUser ?? (req as any).user;
      if (!isAdminRole(req) && String(u?.role || '').toLowerCase() !== 'tiltaksleder') {
        return res.status(403).json({ error: 'Krever tiltaksleder eller admin' });
      }
      const vendorId = Number(u?.vendorId ?? u?.vendor_id);
      if (!Number.isFinite(vendorId)) return res.status(400).json({ error: 'Mangler vendor_id' });

      const day = Number(req.body?.day);
      if (!Number.isInteger(day) || day < 1 || day > 28) {
        return res.status(400).json({ error: 'day må være et heltall 1-28' });
      }

      const [vendor] = await db.select().from(vendors).where(eq(vendors.id, vendorId)).limit(1);
      if (!vendor) return res.status(404).json({ error: 'Vendor ikke funnet' });

      const nextSettings = { ...(vendor.settings as Record<string, any> ?? {}), timesheetDeadlineDayOfMonth: day };
      await db.update(vendors).set({ settings: nextSettings, updatedAt: new Date() }).where(eq(vendors.id, vendorId));
      res.json({ ok: true, timesheetDeadlineDayOfMonth: day });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Admin: run reminder pass on demand (for testing)
  app.post('/api/timesheet-reminders/run', requireAuth, async (req: Request, res: Response) => {
    try {
      if (!isAdminRole(req)) return res.status(403).json({ error: 'Kun admin+ kan kjøre manuelt' });
      const now = req.body?.now ? new Date(req.body.now) : new Date();
      const results = await runTimesheetReminders(now);
      res.json({
        ok: true,
        summary: {
          month: previousMonth(now),
          total: results.length,
          notified: results.filter(r => r.notified).length,
          skippedSubmitted: results.filter(r => r.submissionStatus === 'submitted' || r.submissionStatus === 'approved').length,
        },
        results,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}
