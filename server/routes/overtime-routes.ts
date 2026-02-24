import type { Express, Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { overtimeSettings, overtimeEntries, logRow } from '@shared/schema';
import { eq, and, between, desc } from 'drizzle-orm';
import { format, parseISO, eachDayOfInterval } from 'date-fns';

const ADMIN_ROLES = ['tiltaksleder', 'teamleder', 'hovedadmin', 'admin', 'super_admin'];
const isDevMode = process.env.NODE_ENV !== 'production';

/** Middleware: only allow admin-level roles (tiltaksleder+) */
function requireAdminRole(req: Request, res: Response, next: NextFunction) {
  if (isDevMode) return next(); // dev auto-login is super_admin
  const user = (req as any).user;
  if (!user) return res.status(401).json({ error: 'Authentication required' });
  const role = (user.role || '').toLowerCase().replace(/[\s-]/g, '_');
  if (!ADMIN_ROLES.includes(role)) {
    return res.status(403).json({ error: 'Kun tiltaksleder eller admin kan utføre denne handlingen' });
  }
  next();
}

export function registerOvertimeRoutes(app: Express) {
  /**
   * Get overtime settings for a user
   * GET /api/overtime/settings?userId=default
   */
  app.get('/api/overtime/settings', async (req: Request, res: Response) => {
    try {
      const { userId = 'default' } = req.query;

      const [settings] = await db
        .select()
        .from(overtimeSettings)
        .where(eq(overtimeSettings.userId, userId as string))
        .limit(1);

      // Return defaults if not found
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
  app.post('/api/overtime/calculate', async (req: Request, res: Response) => {
    try {
      const { userId, startDate, endDate } = req.body;

      if (!userId || !startDate || !endDate) {
        return res.status(400).json({ error: 'userId, startDate, and endDate are required' });
      }

      // Get user's overtime settings
      const [settings] = await db
        .select()
        .from(overtimeSettings)
        .where(eq(overtimeSettings.userId, userId))
        .limit(1);

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
  app.get('/api/overtime/entries', async (req: Request, res: Response) => {
    try {
      const { userId, startDate, endDate, status } = req.query;

      const conditions = [];
      if (userId) {
        conditions.push(eq(overtimeEntries.userId, userId as string));
      }
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
      const { status, approvedBy } = req.body;

      if (!status || !['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }

      const [updated] = await db
        .update(overtimeEntries)
        .set({
          status,
          approvedBy,
          approvedAt: new Date(),
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
  app.get('/api/overtime/summary', async (req: Request, res: Response) => {
    try {
      const { userId = 'default', year = new Date().getFullYear() } = req.query;

      const startDate = `${year}-01-01`;
      const endDate = `${year}-12-31`;

      const entries = await db
        .select()
        .from(overtimeEntries)
        .where(
          and(
            eq(overtimeEntries.userId, userId as string),
            between(overtimeEntries.date, startDate, endDate)
          )
        );

      // Group by month
      const monthlyData = entries.reduce((acc: any, entry) => {
        const month = entry.date?.toString().substring(0, 7) || '';
        if (!acc[month]) {
          acc[month] = {
            month,
            regularHours: 0,
            overtimeHours: 0,
            doubleTimeHours: 0,
            totalOvertime: 0,
          };
        }

        const overtime = parseFloat(entry.overtimeHours || '0');
        const doubleTime = parseFloat(entry.doubleTimeHours || '0');

        acc[month].regularHours += parseFloat(entry.regularHours || '0');
        acc[month].overtimeHours += overtime;
        acc[month].doubleTimeHours += doubleTime;
        acc[month].totalOvertime += overtime + doubleTime;

        return acc;
      }, {});

      const summary = Object.values(monthlyData);

      res.json(summary);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
}
