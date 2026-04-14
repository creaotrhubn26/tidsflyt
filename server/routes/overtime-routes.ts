import type { Express, Request, Response } from 'express';
import { db } from '../db';
import { overtimeSettings, overtimeEntries, logRow } from '@shared/schema';
import { eq, and, between, desc } from 'drizzle-orm';
import { format, parseISO, eachDayOfInterval } from 'date-fns';
import { requireAuth, requireAdminRole, ADMIN_ROLES } from '../middleware/auth';

function currentUserId(req: Request): string | null {
  const u = (req as any).authUser ?? (req as any).user;
  return u?.id ? String(u.id) : null;
}

function isAdminRole(req: Request): boolean {
  const role = String(((req as any).authUser ?? (req as any).user)?.role || '')
    .toLowerCase().replace(/[\s-]/g, '_');
  return ADMIN_ROLES.includes(role);
}

export function registerOvertimeRoutes(app: Express) {
  /**
   * Get overtime settings for a user
   * GET /api/overtime/settings?userId=default
   */
  app.get('/api/overtime/settings', requireAuth, async (req: Request, res: Response) => {
    try {
      const authedId = currentUserId(req)!;
      const requested = (req.query.userId as string | undefined)?.trim();
      // Non-admins can only read their own
      const userId = requested && isAdminRole(req) ? requested : authedId;

      const [settings] = await db
        .select()
        .from(overtimeSettings)
        .where(eq(overtimeSettings.userId, userId))
        .limit(1);

      // Return defaults if not found — trackOvertime defaults to true so
      // overtime works out of the box until a tiltaksleder disables it.
      if (!settings) {
        return res.json({
          userId,
          standardHoursPerDay: '7.5',
          standardHoursPerWeek: '37.5',
          overtimeRateMultiplier: '1.5',
          doubleTimeThreshold: null,
          trackOvertime: true,
          requireApproval: false,
        });
      }

      res.json(settings);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Update overtime settings for a user (admin only)
   * PUT /api/overtime/settings
   */
  app.put('/api/overtime/settings', requireAdminRole, async (req: Request, res: Response) => {
    try {
      const { userId, ...settings } = req.body;

      if (!userId) {
        return res.status(400).json({ error: 'userId is required' });
      }

      const [updated] = await db
        .insert(overtimeSettings)
        .values({ userId, ...settings })
        .onConflictDoUpdate({
          target: overtimeSettings.userId,
          set: { ...settings, updatedAt: new Date() },
        })
        .returning();

      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Calculate overtime for a date range
   * POST /api/overtime/calculate
   */
  app.post('/api/overtime/calculate', requireAuth, async (req: Request, res: Response) => {
    try {
      const authedId = currentUserId(req)!;
      const { userId: bodyUserId, startDate, endDate } = req.body;
      // Non-admins can only calculate for themselves
      const userId = bodyUserId && isAdminRole(req) ? bodyUserId : authedId;

      if (!startDate || !endDate) {
        return res.status(400).json({ error: 'startDate and endDate are required' });
      }

      // Get user's overtime settings
      const [settings] = await db
        .select()
        .from(overtimeSettings)
        .where(eq(overtimeSettings.userId, userId))
        .limit(1);

      // Honour per-user disable switch: a tiltaksleder can turn overtime
      // registration off for a specific user via track_overtime = false.
      if (settings && settings.trackOvertime === false) {
        return res.status(403).json({
          error: 'Overtidsberegning er deaktivert for denne brukeren',
          code: 'OVERTIME_DISABLED',
        });
      }

      const standardHoursPerDay = parseFloat(settings?.standardHoursPerDay || '7.5');
      const doubleTimeThreshold = settings?.doubleTimeThreshold
        ? parseFloat(settings.doubleTimeThreshold)
        : null;

      // Get time entries for the period
      const entries = await db
        .select()
        .from(logRow)
        .where(
          and(
            eq(logRow.userId, userId),
            between(logRow.date, startDate, endDate)
          )
        )
        .orderBy(logRow.date);

      // Group by date and calculate hours
      const dailyHours: Record<string, number> = {};

      entries.forEach((entry) => {
        const dateKey = entry.date?.toString() || '';
        if (!dailyHours[dateKey]) {
          dailyHours[dateKey] = 0;
        }

        // Calculate hours from start/end time
        if (entry.startTime && entry.endTime) {
          const [startH, startM] = entry.startTime.split(':').map(Number);
          const [endH, endM] = entry.endTime.split(':').map(Number);
          const startMinutes = startH * 60 + startM;
          const endMinutes = endH * 60 + endM;
          const breakHours = parseFloat(entry.breakHours || '0');
          const hours = (endMinutes - startMinutes) / 60 - breakHours;
          dailyHours[dateKey] += hours;
        }
      });

      // Calculate overtime for each day
      const overtimeData = [];

      for (const [date, hours] of Object.entries(dailyHours)) {
        let regularHours = hours;
        let overtimeHours = 0;
        let doubleTimeHours = 0;

        if (hours > standardHoursPerDay) {
          regularHours = standardHoursPerDay;
          const extraHours = hours - standardHoursPerDay;

          if (doubleTimeThreshold && hours > doubleTimeThreshold) {
            overtimeHours = doubleTimeThreshold - standardHoursPerDay;
            doubleTimeHours = hours - doubleTimeThreshold;
          } else {
            overtimeHours = extraHours;
          }
        }

        // Only store if there's overtime
        if (overtimeHours > 0 || doubleTimeHours > 0) {
          overtimeData.push({
            userId,
            date,
            regularHours: regularHours.toFixed(2),
            overtimeHours: overtimeHours.toFixed(2),
            doubleTimeHours: doubleTimeHours.toFixed(2),
            status: 'pending',
          });
        }
      }

      // Save overtime entries
      if (overtimeData.length > 0) {
        await db.insert(overtimeEntries).values(overtimeData).onConflictDoNothing();
      }

      res.json({
        success: true,
        calculated: overtimeData.length,
        data: overtimeData,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Get overtime entries for a user
   * GET /api/overtime/entries?userId=default&startDate=2024-01-01&endDate=2024-01-31
   */
  app.get('/api/overtime/entries', requireAuth, async (req: Request, res: Response) => {
    try {
      const authedId = currentUserId(req)!;
      const { userId: requested, startDate, endDate, status } = req.query;
      // Non-admins can only read their own entries
      const userId = requested && isAdminRole(req) ? (requested as string) : authedId;

      const conditions = [eq(overtimeEntries.userId, userId)];
      if (startDate && endDate) {
        conditions.push(between(overtimeEntries.date, startDate as string, endDate as string));
      }
      if (status) {
        conditions.push(eq(overtimeEntries.status, status as string));
      }

      const entries = await db
        .select()
        .from(overtimeEntries)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(overtimeEntries.date));

      // Calculate totals
      const totals = entries.reduce(
        (acc, entry) => ({
          regularHours: acc.regularHours + parseFloat(entry.regularHours || '0'),
          overtimeHours: acc.overtimeHours + parseFloat(entry.overtimeHours || '0'),
          doubleTimeHours: acc.doubleTimeHours + parseFloat(entry.doubleTimeHours || '0'),
        }),
        { regularHours: 0, overtimeHours: 0, doubleTimeHours: 0 }
      );

      res.json({ entries, totals });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Approve/reject overtime entry (admin only)
   * PATCH /api/overtime/entries/:id
   */
  app.patch('/api/overtime/entries/:id', requireAdminRole, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { status, notes } = req.body;
      const approverId = currentUserId(req) ?? 'admin';

      if (!status || !['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }

      const [updated] = await db
        .update(overtimeEntries)
        .set({
          status,
          approvedBy: approverId,
          approvedAt: new Date(),
          ...(notes ? { notes } : {}),
        })
        .where(eq(overtimeEntries.id, parseInt(id)))
        .returning();

      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Get overtime summary for a user
   * GET /api/overtime/summary?userId=default&year=2024
   */
  app.get('/api/overtime/summary', requireAuth, async (req: Request, res: Response) => {
    try {
      const authedId = currentUserId(req)!;
      const requested = req.query.userId as string | undefined;
      const userId = requested && isAdminRole(req) ? requested : authedId;
      const year = req.query.year ?? new Date().getFullYear();
      // Optional month filter: "2026-04" returns just that month's data
      const monthFilter = (req.query.month as string | undefined)?.trim();

      const startDate = monthFilter ? `${monthFilter}-01` : `${year}-01-01`;
      const endDate = monthFilter
        ? format(new Date(Number(monthFilter.slice(0, 4)), Number(monthFilter.slice(5, 7)), 0), 'yyyy-MM-dd')
        : `${year}-12-31`;

      // Fetch user's overtime settings for rate multipliers
      const [settings] = await db
        .select()
        .from(overtimeSettings)
        .where(eq(overtimeSettings.userId, userId))
        .limit(1);
      const rate150 = parseFloat(settings?.overtimeRateMultiplier || '1.5');
      const rate200 = 2.0; // double time multiplier (fixed)

      const entries = await db
        .select()
        .from(overtimeEntries)
        .where(
          and(
            eq(overtimeEntries.userId, userId),
            between(overtimeEntries.date, startDate, endDate)
          )
        );

      // Aggregate into both monthly buckets and a "requested period" total
      const monthlyData = entries.reduce((acc: any, entry) => {
        const month = entry.date?.toString().substring(0, 7) || '';
        if (!acc[month]) {
          acc[month] = {
            month,
            regularHours: 0,
            overtimeHours: 0,
            doubleTimeHours: 0,
            compensation150: 0,  // overtime hours × rate150
            compensation200: 0,  // double-time hours × rate200
            totalCompensation: 0,
            entriesCount: 0,
          };
        }
        const overtime = parseFloat(entry.overtimeHours || '0');
        const doubleTime = parseFloat(entry.doubleTimeHours || '0');
        const comp150 = overtime * rate150;
        const comp200 = doubleTime * rate200;
        acc[month].regularHours += parseFloat(entry.regularHours || '0');
        acc[month].overtimeHours += overtime;
        acc[month].doubleTimeHours += doubleTime;
        acc[month].compensation150 += comp150;
        acc[month].compensation200 += comp200;
        acc[month].totalCompensation += comp150 + comp200;
        acc[month].entriesCount += 1;
        return acc;
      }, {} as Record<string, any>);

      // Round everything to 1 decimal for display
      const summary = Object.values(monthlyData).map((m: any) => ({
        ...m,
        regularHours: +m.regularHours.toFixed(1),
        overtimeHours: +m.overtimeHours.toFixed(1),
        doubleTimeHours: +m.doubleTimeHours.toFixed(1),
        compensation150: +m.compensation150.toFixed(1),
        compensation200: +m.compensation200.toFixed(1),
        totalCompensation: +m.totalCompensation.toFixed(1),
      }));

      // If month filter was used, also return a single aggregate for the UI.
      // Default behaviour (year mode) just returns the monthly array.
      if (monthFilter) {
        const total = summary[0] ?? {
          month: monthFilter,
          regularHours: 0, overtimeHours: 0, doubleTimeHours: 0,
          compensation150: 0, compensation200: 0, totalCompensation: 0, entriesCount: 0,
        };
        return res.json({
          period: monthFilter,
          totalRegularHours: total.regularHours,
          totalOvertimeHours: total.overtimeHours,
          total150Hours: total.overtimeHours,
          total200Hours: total.doubleTimeHours,
          compensation150: total.compensation150,
          compensation200: total.compensation200,
          totalCompensation: total.totalCompensation,
          entriesCount: total.entriesCount,
          rate150,
          rate200,
        });
      }

      res.json(summary);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
}
