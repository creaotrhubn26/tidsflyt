import type { Express, Request, Response } from 'express';
import { db } from '../db';
import { recurringEntries, logRow } from '@shared/schema';
import { eq, and, lte, or, isNull } from 'drizzle-orm';
import { addDays, addWeeks, addMonths, format, isBefore, isAfter } from 'date-fns';
import cron from 'node-cron';

export function registerRecurringRoutes(app: Express) {
  /**
   * Get recurring entries for a user
   * GET /api/recurring?userId=default
   */
  app.get('/api/recurring', async (req: Request, res: Response) => {
    try {
      const { userId = 'default' } = req.query;

      const entries = await db
        .select()
        .from(recurringEntries)
        .where(eq(recurringEntries.userId, userId as string))
        .orderBy(recurringEntries.createdAt);

      res.json(entries);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Create a recurring entry
   * POST /api/recurring
   */
  app.post('/api/recurring', async (req: Request, res: Response) => {
    try {
      const {
        userId,
        title,
        description,
        activity,
        project,
        place,
        hours,
        recurrenceType,
        recurrenceDays,
        recurrenceDayOfMonth,
        startDate,
        endDate,
      } = req.body;

      if (!userId || !title || !hours || !recurrenceType || !startDate) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      if (!['daily', 'weekly', 'monthly'].includes(recurrenceType)) {
        return res.status(400).json({ error: 'Invalid recurrence type' });
      }

      const [entry] = await db
        .insert(recurringEntries)
        .values({
          userId,
          title,
          description,
          activity,
          project,
          place,
          hours: hours.toString(),
          recurrenceType,
          recurrenceDays: recurrenceDays ? JSON.stringify(recurrenceDays) : null,
          recurrenceDayOfMonth,
          startDate,
          endDate,
          isActive: true,
        })
        .returning();

      res.json(entry);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Update a recurring entry
   * PATCH /api/recurring/:id
   */
  app.patch('/api/recurring/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      const [updated] = await db
        .update(recurringEntries)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(recurringEntries.id, parseInt(id)))
        .returning();

      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Delete a recurring entry
   * DELETE /api/recurring/:id
   */
  app.delete('/api/recurring/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      await db.delete(recurringEntries).where(eq(recurringEntries.id, parseInt(id)));

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Generate time entries from recurring entries (manual trigger)
   * POST /api/recurring/generate
   */
  app.post('/api/recurring/generate', async (req: Request, res: Response) => {
    try {
      const generatedCount = await generateRecurringEntries();
      res.json({ success: true, generated: generatedCount });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
}

/**
 * Generate time entries from active recurring entries
 * This should be called daily by a cron job
 */
export async function generateRecurringEntries(): Promise<number> {
  try {
    const today = format(new Date(), 'yyyy-MM-dd');
    let generatedCount = 0;

    // Get active recurring entries that should run today
    const entries = await db
      .select()
      .from(recurringEntries)
      .where(
        and(
          eq(recurringEntries.isActive, true),
          lte(recurringEntries.startDate, today),
          or(isNull(recurringEntries.endDate), lte(recurringEntries.endDate, today))
        )
      );

    for (const entry of entries) {
      const shouldGenerate = shouldGenerateToday(entry, today);

      if (shouldGenerate) {
        // Check if entry already exists for today
        const existing = await db
          .select()
          .from(logRow)
          .where(
            and(
              eq(logRow.userId, entry.userId),
              eq(logRow.date, today),
              eq(logRow.title, entry.title)
            )
          )
          .limit(1);

        if (existing.length === 0) {
          // Calculate time slots
          const hours = parseFloat(entry.hours);
          const startTime = '09:00'; // Default start time
          const startMinutes = 9 * 60;
          const endMinutes = startMinutes + hours * 60;
          const endHour = Math.floor(endMinutes / 60);
          const endMin = endMinutes % 60;
          const endTime = `${endHour.toString().padStart(2, '0')}:${endMin.toString().padStart(2, '0')}`;

          // Create time entry
          await db.insert(logRow).values({
            userId: entry.userId,
            date: today,
            startTime,
            endTime,
            breakHours: '0',
            activity: entry.activity || 'Work',
            title: entry.title,
            project: entry.project || null,
            place: entry.place || null,
            notes: `Auto-generated from recurring entry: ${entry.description || ''}`,
          });

          generatedCount++;
        }

        // Update last generated date
        await db
          .update(recurringEntries)
          .set({ lastGeneratedDate: today })
          .where(eq(recurringEntries.id, entry.id));
      }
    }

    console.log(`✅ Generated ${generatedCount} recurring time entries`);
    return generatedCount;
  } catch (error) {
    console.error('Failed to generate recurring entries:', error);
    return 0;
  }
}

/**
 * Check if a recurring entry should generate today
 */
function shouldGenerateToday(entry: any, today: string): boolean {
  const todayDate = new Date(today);
  const dayOfWeek = todayDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
  const dayOfMonth = todayDate.getDate();

  // Check if already generated today
  if (entry.lastGeneratedDate === today) {
    return false;
  }

  switch (entry.recurrenceType) {
    case 'daily':
      return true;

    case 'weekly':
      if (!entry.recurrenceDays) return false;
      const days = JSON.parse(entry.recurrenceDays);
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      return days.includes(dayNames[dayOfWeek]);

    case 'monthly':
      return entry.recurrenceDayOfMonth === dayOfMonth;

    default:
      return false;
  }
}

/**
 * Setup cron job to generate recurring entries daily at midnight
 */
export function setupRecurringEntriesCron() {
  // Run every day at 00:05 (5 minutes after midnight)
  cron.schedule('5 0 * * *', async () => {
    console.log('⏰ Running recurring entries cron job...');
    await generateRecurringEntries();
  });

  console.log('✅ Recurring entries cron job scheduled');
}
