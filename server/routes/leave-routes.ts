import type { Express, Request, Response } from 'express';
import { db } from '../db';
import { leaveTypes, leaveRequests, leaveBalances } from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { emailService } from '../lib/email-service';
import { format } from 'date-fns';
import { nb } from 'date-fns/locale';

export function registerLeaveRoutes(app: Express) {
  /**
   * Get all leave types
   * GET /api/leave/types
   */
  app.get('/api/leave/types', async (req: Request, res: Response) => {
    try {
      const types = await db
        .select()
        .from(leaveTypes)
        .where(eq(leaveTypes.isActive, true))
        .orderBy(leaveTypes.displayOrder);
      
      res.json(types);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Get leave balance for a user
   * GET /api/leave/balance?userId=default&year=2024
   */
  app.get('/api/leave/balance', async (req: Request, res: Response) => {
    try {
      const { userId = 'default', year = new Date().getFullYear() } = req.query;

      const balances = await db
        .select({
          id: leaveBalances.id,
          leaveTypeId: leaveBalances.leaveTypeId,
          year: leaveBalances.year,
          totalDays: leaveBalances.totalDays,
          usedDays: leaveBalances.usedDays,
          pendingDays: leaveBalances.pendingDays,
          remainingDays: leaveBalances.remainingDays,
          leaveTypeName: leaveTypes.name,
          leaveTypeSlug: leaveTypes.slug,
          leaveTypeColor: leaveTypes.color,
          leaveTypeIcon: leaveTypes.icon,
        })
        .from(leaveBalances)
        .leftJoin(leaveTypes, eq(leaveBalances.leaveTypeId, leaveTypes.id))
        .where(
          and(
            eq(leaveBalances.userId, userId as string),
            eq(leaveBalances.year, parseInt(year as string))
          )
        );

      res.json(balances);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Initialize leave balance for user (if not exists)
   * POST /api/leave/balance/initialize
   */
  app.post('/api/leave/balance/initialize', async (req: Request, res: Response) => {
    try {
      const { userId, year = new Date().getFullYear() } = req.body;

      if (!userId) {
        return res.status(400).json({ error: 'userId is required' });
      }

      // Get all leave types
      const types = await db.select().from(leaveTypes).where(eq(leaveTypes.isActive, true));

      // Create balance entries for each type
      for (const type of types) {
        const totalDays = type.maxDaysPerYear || 25; // Default 25 days

        await db
          .insert(leaveBalances)
          .values({
            userId,
            leaveTypeId: type.id,
            year: parseInt(year as string),
            totalDays: totalDays.toString(),
            usedDays: '0',
            pendingDays: '0',
            remainingDays: totalDays.toString(),
          })
          .onConflictDoNothing();
      }

      res.json({ success: true, message: 'Leave balances initialized' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Get leave requests for a user
   * GET /api/leave/requests?userId=default&status=pending
   */
  app.get('/api/leave/requests', async (req: Request, res: Response) => {
    try {
      const { userId, status } = req.query;

      let query = db
        .select({
          id: leaveRequests.id,
          userId: leaveRequests.userId,
          leaveTypeId: leaveRequests.leaveTypeId,
          startDate: leaveRequests.startDate,
          endDate: leaveRequests.endDate,
          days: leaveRequests.days,
          reason: leaveRequests.reason,
          status: leaveRequests.status,
          reviewedBy: leaveRequests.reviewedBy,
          reviewedAt: leaveRequests.reviewedAt,
          reviewComment: leaveRequests.reviewComment,
          createdAt: leaveRequests.createdAt,
          leaveTypeName: leaveTypes.name,
          leaveTypeSlug: leaveTypes.slug,
          leaveTypeColor: leaveTypes.color,
          leaveTypeIcon: leaveTypes.icon,
        })
        .from(leaveRequests)
        .leftJoin(leaveTypes, eq(leaveRequests.leaveTypeId, leaveTypes.id));

      const conditions = [];
      if (userId) {
        conditions.push(eq(leaveRequests.userId, userId as string));
      }
      if (status) {
        conditions.push(eq(leaveRequests.status, status as string));
      }

      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as any;
      }

      const requests = await query.orderBy(desc(leaveRequests.createdAt));

      res.json(requests);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Create a new leave request
   * POST /api/leave/requests
   */
  app.post('/api/leave/requests', async (req: Request, res: Response) => {
    try {
      const { userId, leaveTypeId, startDate, endDate, days, reason } = req.body;

      if (!userId || !leaveTypeId || !startDate || !endDate || !days) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Create leave request
      const [request] = await db
        .insert(leaveRequests)
        .values({
          userId,
          leaveTypeId,
          startDate,
          endDate,
          days: days.toString(),
          reason,
          status: 'pending',
        })
        .returning();

      // Update pending days in balance
      const year = new Date(startDate).getFullYear();
      await db
        .update(leaveBalances)
        .set({
          pendingDays: sql`pending_days + ${days}`,
          remainingDays: sql`total_days - used_days - (pending_days + ${days})`,
        })
        .where(
          and(
            eq(leaveBalances.userId, userId),
            eq(leaveBalances.leaveTypeId, parseInt(leaveTypeId as any)),
            eq(leaveBalances.year, year)
          )
        );

      // Send notification to manager (if configured)
      const leaveType = await db.select().from(leaveTypes).where(eq(leaveTypes.id, leaveTypeId)).limit(1);
      if (leaveType[0] && process.env.MANAGER_EMAIL) {
        await emailService.sendLeaveRequestNotification(
          process.env.MANAGER_EMAIL,
          'Ansatt', // TODO: Get from user table
          leaveType[0].name,
          format(new Date(startDate), 'dd.MM.yyyy', { locale: nb }),
          format(new Date(endDate), 'dd.MM.yyyy', { locale: nb }),
          parseFloat(days)
        );
      }

      res.json(request);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Update leave request status (approve/reject)
   * PATCH /api/leave/requests/:id
   */
  app.patch('/api/leave/requests/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { status, reviewedBy, reviewComment } = req.body;

      if (!status || !['approved', 'rejected', 'cancelled'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }

      // Get the request first
      const [request] = await db
        .select()
        .from(leaveRequests)
        .where(eq(leaveRequests.id, parseInt(id)))
        .limit(1);

      if (!request) {
        return res.status(404).json({ error: 'Leave request not found' });
      }

      // Update request
      const [updated] = await db
        .update(leaveRequests)
        .set({
          status,
          reviewedBy,
          reviewedAt: new Date(),
          reviewComment,
        })
        .where(eq(leaveRequests.id, parseInt(id)))
        .returning();

      // Update balance
      const year = new Date(request.startDate as any).getFullYear();
      const days = parseFloat(request.days);

      if (status === 'approved') {
        // Move from pending to used
        await db
          .update(leaveBalances)
          .set({
            pendingDays: sql`pending_days - ${days}`,
            usedDays: sql`used_days + ${days}`,
            remainingDays: sql`total_days - (used_days + ${days}) - (pending_days - ${days})`,
          })
          .where(
            and(
              eq(leaveBalances.userId, request.userId),
              eq(leaveBalances.leaveTypeId, request.leaveTypeId as number),
              eq(leaveBalances.year, year)
            )
          );
      } else if (status === 'rejected' || status === 'cancelled') {
        // Remove from pending
        await db
          .update(leaveBalances)
          .set({
            pendingDays: sql`pending_days - ${days}`,
            remainingDays: sql`total_days - used_days - (pending_days - ${days})`,
          })
          .where(
            and(
              eq(leaveBalances.userId, request.userId),
              eq(leaveBalances.leaveTypeId, request.leaveTypeId as number),
              eq(leaveBalances.year, year)
            )
          );
      }

      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
}
