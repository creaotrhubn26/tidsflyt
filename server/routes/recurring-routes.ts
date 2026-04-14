import type { Express, Request, Response } from 'express';
import { db } from '../db';
import { recurringEntries, logRow } from '@shared/schema';
import { eq, and, lte, gte, or, isNull } from 'drizzle-orm';
import { format } from 'date-fns';
import cron from 'node-cron';
import { requireAuth, ADMIN_ROLES } from '../middleware/auth';

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

function currentUserId(req: Request): string | null {
  const u = (req as any).authUser ?? (req as any).user;
  return u?.id ? String(u.id) : null;
}

function isAdmin(req: Request): boolean {
  const role = String(((req as any).authUser ?? (req as any).user)?.role || '')
    .toLowerCase().replace(/[\s-]/g, '_');
  return ADMIN_ROLES.includes(role);
}

/** Convert "HH:MM" + decimal hours -> "HH:MM" end-time, clamped to 23:59 */
function endTimeFromStart(startTime: string, hours: number): string {
  const [h, m] = startTime.split(':').map(Number);
  const startMinutes = h * 60 + m;
  const endTotal = Math.min(startMinutes + Math.round(hours * 60), 23 * 60 + 59);
  const eh = Math.floor(endTotal / 60);
  const em = endTotal % 60;
  return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
}

// ───────────────────────────────────────────────────────────────────────────
// Routes
// ───────────────────────────────────────────────────────────────────────────

export function registerRecurringRoutes(app: Express) {
  /** GET /api/recurring — list entries owned by authed user (admins may pass userId=X) */
  app.get('/api/recurring', requireAuth, async (req: Request, res: Response) => {
    try {
      const authedId = currentUserId(req)!;
      const requested = (req.query.userId as string | undefined)?.trim();
      const userId = requested && isAdmin(req) ? requested : authedId;

      const entries = await db
        .select()
        .from(recurringEntries)
        .where(eq(recurringEntries.userId, userId))
        .orderBy(recurringEntries.createdAt);

      res.json(entries);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /** POST /api/recurring — create a recurring entry (always scoped to authed user) */
  app.post('/api/recurring', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = currentUserId(req)!;
      const {
        title, description, activity, project, place,
        hours, startTime,
        recurrenceType, recurrenceDays,
        // Accept both field names for backwards compat with older clients
        recurrenceDayOfMonth, recurrenceDay,
        startDate, endDate,
      } = req.body;

      if (!title || !hours || !recurrenceType || !startDate) {
        return res.status(400).json({ error: 'Missing required fields (title, hours, recurrenceType, startDate)' });
      }
      if (!['daily', 'weekly', 'monthly'].includes(recurrenceType)) {
        return res.status(400).json({ error: 'Invalid recurrence type' });
      }

      const hoursNum = parseFloat(String(hours));
      if (!Number.isFinite(hoursNum) || hoursNum <= 0 || hoursNum > 24) {
        return res.status(400).json({ error: 'hours må være et gyldig tall mellom 0 og 24' });
      }

      const dayOfMonth = recurrenceDayOfMonth ?? recurrenceDay ?? null;
      if (recurrenceType === 'monthly') {
        const d = Number(dayOfMonth);
        if (!Number.isInteger(d) || d < 1 || d > 31) {
          return res.status(400).json({ error: 'recurrenceDayOfMonth må være 1–31 for månedlige oppgaver' });
        }
      }

      const [entry] = await db
        .insert(recurringEntries)
        .values({
          userId,
          title,
          description: description ?? null,
          activity: activity ?? null,
          project: project ?? null,
          place: place ?? null,
          hours: hoursNum.toString(),
          startTime: (typeof startTime === 'string' && /^\d{2}:\d{2}$/.test(startTime)) ? startTime : '09:00',
          recurrenceType,
          recurrenceDays: Array.isArray(recurrenceDays) ? JSON.stringify(recurrenceDays) : (recurrenceDays ?? null),
          recurrenceDayOfMonth: dayOfMonth,
          startDate,
          endDate: endDate ?? null,
          isActive: true,
        })
        .returning();

      res.json(entry);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /** PATCH /api/recurring/:id — owner-only edit (admins can edit anything) */
  app.patch('/api/recurring/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      const authedId = currentUserId(req)!;
      const id = parseInt(req.params.id);

      const [existing] = await db
        .select()
        .from(recurringEntries)
        .where(eq(recurringEntries.id, id))
        .limit(1);

      if (!existing) return res.status(404).json({ error: 'Ikke funnet' });
      if (existing.userId !== authedId && !isAdmin(req)) {
        return res.status(403).json({ error: 'Du kan bare endre egne faste oppgaver' });
      }

      const updates: any = { ...req.body, updatedAt: new Date() };

      // Normalise field aliases coming from older clients
      if (updates.recurrenceDay !== undefined && updates.recurrenceDayOfMonth === undefined) {
        updates.recurrenceDayOfMonth = updates.recurrenceDay;
        delete updates.recurrenceDay;
      }
      if (Array.isArray(updates.recurrenceDays)) {
        updates.recurrenceDays = JSON.stringify(updates.recurrenceDays);
      }
      // Don't allow privilege escalation by moving ownership
      delete updates.userId;
      delete updates.id;

      if (updates.hours !== undefined) {
        const h = parseFloat(String(updates.hours));
        if (!Number.isFinite(h) || h <= 0 || h > 24) {
          return res.status(400).json({ error: 'hours må være et gyldig tall mellom 0 og 24' });
        }
        updates.hours = h.toString();
      }

      const [updated] = await db
        .update(recurringEntries)
        .set(updates)
        .where(eq(recurringEntries.id, id))
        .returning();

      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /** DELETE /api/recurring/:id — owner-only (admins can delete anything) */
  app.delete('/api/recurring/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      const authedId = currentUserId(req)!;
      const id = parseInt(req.params.id);

      const [existing] = await db
        .select()
        .from(recurringEntries)
        .where(eq(recurringEntries.id, id))
        .limit(1);

      if (!existing) return res.status(404).json({ error: 'Ikke funnet' });
      if (existing.userId !== authedId && !isAdmin(req)) {
        return res.status(403).json({ error: 'Du kan bare slette egne faste oppgaver' });
      }

      await db.delete(recurringEntries).where(eq(recurringEntries.id, id));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /** POST /api/recurring/generate — manually trigger generation for today */
  app.post('/api/recurring/generate', requireAuth, async (req: Request, res: Response) => {
    try {
      // Admins generate for everyone; others only for themselves
      const forUserId = isAdmin(req) ? null : currentUserId(req);
      const generated = await generateRecurringEntries(forUserId);
      res.json({ success: true, generated });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /** GET /api/recurring/:id/preview — next 5 scheduled dates */
  app.get('/api/recurring/:id/preview', requireAuth, async (req: Request, res: Response) => {
    try {
      const authedId = currentUserId(req)!;
      const id = parseInt(req.params.id);
      const [entry] = await db
        .select()
        .from(recurringEntries)
        .where(eq(recurringEntries.id, id))
        .limit(1);
      if (!entry) return res.status(404).json({ error: 'Ikke funnet' });
      if (entry.userId !== authedId && !isAdmin(req)) {
        return res.status(403).json({ error: 'Ingen tilgang' });
      }
      res.json({ upcoming: nextScheduledDates(entry, 5) });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
}

// ───────────────────────────────────────────────────────────────────────────
// Generation
// ───────────────────────────────────────────────────────────────────────────

/**
 * Generate time entries from active recurring entries for today.
 * If userIdFilter is provided, only that user's entries are considered.
 */
export async function generateRecurringEntries(userIdFilter?: string | null): Promise<number> {
  try {
    const today = format(new Date(), 'yyyy-MM-dd');
    let generatedCount = 0;

    const conditions = [
      eq(recurringEntries.isActive, true),
      lte(recurringEntries.startDate, today),
      // Only generate while we're still WITHIN the active window:
      //   endDate is null (open-ended) OR endDate >= today
      or(isNull(recurringEntries.endDate), gte(recurringEntries.endDate, today)),
    ];
    if (userIdFilter) conditions.push(eq(recurringEntries.userId, userIdFilter));

    const entries = await db
      .select()
      .from(recurringEntries)
      .where(and(...conditions));

    for (const entry of entries) {
      if (!shouldGenerateToday(entry, today)) continue;

      // Skip if a log row with same (userId, date, title) already exists (dedupe)
      const existing = await db
        .select()
        .from(logRow)
        .where(
          and(
            eq(logRow.userId, entry.userId!),
            eq(logRow.date, today),
            eq(logRow.title, entry.title),
          ),
        )
        .limit(1);

      if (existing.length === 0) {
        const hours = parseFloat(entry.hours || '0');
        if (!(hours > 0)) continue; // skip malformed
        const startTime = entry.startTime || '09:00';
        const endTime = endTimeFromStart(startTime, hours);

        await db.insert(logRow).values({
          userId: entry.userId,
          date: today,
          startTime,
          endTime,
          breakHours: '0',
          activity: entry.activity || 'Arbeid',
          title: entry.title,
          project: entry.project || null,
          place: entry.place || null,
          notes: `Auto-generert fra fast oppgave${entry.description ? `: ${entry.description}` : ''}`,
        });

        generatedCount++;
      }

      await db
        .update(recurringEntries)
        .set({ lastGeneratedDate: today, updatedAt: new Date() })
        .where(eq(recurringEntries.id, entry.id));
    }

    console.log(`✅ Generated ${generatedCount} recurring time entries${userIdFilter ? ` for user ${userIdFilter}` : ''}`);
    return generatedCount;
  } catch (error) {
    console.error('Failed to generate recurring entries:', error);
    return 0;
  }
}

/** Return true if this recurring entry should fire on `today` (yyyy-MM-dd). */
function shouldGenerateToday(entry: any, today: string): boolean {
  if (entry.lastGeneratedDate === today) return false;
  const d = new Date(today + 'T00:00:00');
  const dayOfWeek = d.getDay(); // 0 = Sun … 6 = Sat
  const dayOfMonth = d.getDate();
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  switch (entry.recurrenceType) {
    case 'daily':
      return true;
    case 'weekly':
      if (!entry.recurrenceDays) return false;
      try {
        const days = JSON.parse(entry.recurrenceDays);
        return Array.isArray(days) && days.includes(dayNames[dayOfWeek]);
      } catch {
        return false;
      }
    case 'monthly': {
      const target = Number(entry.recurrenceDayOfMonth);
      if (!Number.isInteger(target) || target < 1 || target > 31) return false;
      if (target <= 28) return target === dayOfMonth;
      // Clamp target > last-of-month to the actual last day of the month
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      const effective = Math.min(target, lastDay);
      return effective === dayOfMonth;
    }
    default:
      return false;
  }
}

/** Predict next N scheduled dates from today (inclusive), respecting endDate. */
function nextScheduledDates(entry: any, count: number): string[] {
  const out: string[] = [];
  const today = new Date(format(new Date(), 'yyyy-MM-dd') + 'T00:00:00');
  const endDate = entry.endDate ? new Date(entry.endDate + 'T00:00:00') : null;

  const cursor = new Date(today);
  let safety = 400; // 400 days worth of lookahead max
  while (out.length < count && safety-- > 0) {
    if (endDate && cursor > endDate) break;
    const iso = format(cursor, 'yyyy-MM-dd');
    if (shouldGenerateToday({ ...entry, lastGeneratedDate: null }, iso)) {
      out.push(iso);
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

// ───────────────────────────────────────────────────────────────────────────
// Cron
// ───────────────────────────────────────────────────────────────────────────

/** Set up the daily cron job at 00:05 local time. Safe to call many times (no-op if already set). */
let cronStarted = false;
export function setupRecurringEntriesCron() {
  if (cronStarted) return;
  cron.schedule('5 0 * * *', async () => {
    console.log('⏰ Running recurring entries cron job…');
    await generateRecurringEntries();
  });
  cronStarted = true;
  console.log('✅ Recurring entries cron job scheduled (daily 00:05)');
}
