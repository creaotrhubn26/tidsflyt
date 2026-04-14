import type { Express, Request, Response } from 'express';
import { db } from '../db';
import { leaveTypes, leaveRequests, leaveBalances } from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { emailService } from '../lib/email-service';
import { format } from 'date-fns';
import { nb } from 'date-fns/locale';
import { requireAuth, requireAdminRole } from '../middleware/auth';

export function registerLeaveRoutes(app: Express) {
  /**
   * Get all leave types
   * GET /api/leave/types
   */
  app.get('/api/leave/types', requireAuth, async (req: Request, res: Response) => {
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
  app.get('/api/leave/balance', requireAuth, async (req: Request, res: Response) => {
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
  app.post('/api/leave/balance/initialize', requireAdminRole, async (req: Request, res: Response) => {
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
  app.get('/api/leave/requests', requireAuth, async (req: Request, res: Response) => {
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
  app.post('/api/leave/requests', requireAuth, async (req: Request, res: Response) => {
    try {
      const authed = (req as any).authUser ?? (req as any).user;
      const authedId = authed?.id ? String(authed.id) : null;
      const { userId: bodyUserId, leaveTypeId, startDate, endDate, days, reason } = req.body;
      // Users can only create requests for themselves
      const userId = authedId ?? bodyUserId;
      if (!userId) return res.status(401).json({ error: 'Authentication required' });

      if (!leaveTypeId || !startDate || !endDate || !days) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      if (new Date(endDate) < new Date(startDate)) {
        return res.status(400).json({ error: 'Sluttdato kan ikke være før startdato' });
      }

      const year = new Date(startDate).getFullYear();

      // Atomic: insert request + bump pendingDays in a transaction
      const request = await db.transaction(async (tx) => {
        const [row] = await tx
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

        await tx
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

        return row;
      });

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
  app.patch('/api/leave/requests/:id', requireAdminRole, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const authed = (req as any).authUser ?? (req as any).user;
      const reviewerId = authed?.id ? String(authed.id) : req.body.reviewedBy;
      const { status, reviewComment } = req.body;

      if (!status || !['approved', 'rejected', 'cancelled'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }

      const updated = await db.transaction(async (tx) => {
        const [request] = await tx
          .select()
          .from(leaveRequests)
          .where(eq(leaveRequests.id, parseInt(id)))
          .limit(1);

        if (!request) throw new Error('NOT_FOUND');

        // Idempotency guard — don't apply the balance delta twice
        if (request.status === status) return request;

        const [row] = await tx
          .update(leaveRequests)
          .set({ status, reviewedBy: reviewerId, reviewedAt: new Date(), reviewComment })
          .where(eq(leaveRequests.id, parseInt(id)))
          .returning();

        const year = new Date(request.startDate as string).getFullYear();
        const days = parseFloat(request.days || '0');
        const whereBalance = and(
          eq(leaveBalances.userId, request.userId!),
          eq(leaveBalances.leaveTypeId, request.leaveTypeId as number),
          eq(leaveBalances.year, year),
        );

        if (status === 'approved' && request.status === 'pending') {
          // Move from pending to used
          await tx.update(leaveBalances).set({
            pendingDays: sql`pending_days - ${days}`,
            usedDays: sql`used_days + ${days}`,
            remainingDays: sql`total_days - (used_days + ${days}) - (pending_days - ${days})`,
          }).where(whereBalance);
        } else if ((status === 'rejected' || status === 'cancelled') && request.status === 'pending') {
          // Remove from pending
          await tx.update(leaveBalances).set({
            pendingDays: sql`pending_days - ${days}`,
            remainingDays: sql`total_days - used_days - (pending_days - ${days})`,
          }).where(whereBalance);
        } else if ((status === 'rejected' || status === 'cancelled') && request.status === 'approved') {
          // Reverse a previously-applied approval
          await tx.update(leaveBalances).set({
            usedDays: sql`used_days - ${days}`,
            remainingDays: sql`total_days - (used_days - ${days}) - pending_days`,
          }).where(whereBalance);
        }

        return row;
      });

      res.json(updated);
    } catch (error: any) {
      if (error?.message === 'NOT_FOUND') {
        return res.status(404).json({ error: 'Leave request not found' });
      }
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Cancel (withdraw) own pending leave request
   * POST /api/leave/requests/:id/cancel
   * Users may cancel their own requests while they are still "pending".
   */
  app.post('/api/leave/requests/:id/cancel', requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const authed = (req as any).authUser ?? (req as any).user;
      const authedId = authed?.id ? String(authed.id) : null;

      const updated = await db.transaction(async (tx) => {
        const [request] = await tx
          .select()
          .from(leaveRequests)
          .where(eq(leaveRequests.id, parseInt(id)))
          .limit(1);

        if (!request) throw new Error('NOT_FOUND');
        if (request.userId !== authedId) throw new Error('FORBIDDEN');
        if (request.status !== 'pending') throw new Error('NOT_PENDING');

        const [row] = await tx
          .update(leaveRequests)
          .set({ status: 'cancelled', reviewedAt: new Date() })
          .where(eq(leaveRequests.id, parseInt(id)))
          .returning();

        const year = new Date(request.startDate as string).getFullYear();
        const days = parseFloat(request.days || '0');
        await tx.update(leaveBalances).set({
          pendingDays: sql`pending_days - ${days}`,
          remainingDays: sql`total_days - used_days - (pending_days - ${days})`,
        }).where(and(
          eq(leaveBalances.userId, request.userId!),
          eq(leaveBalances.leaveTypeId, request.leaveTypeId as number),
          eq(leaveBalances.year, year),
        ));

        return row;
      });

      res.json(updated);
    } catch (error: any) {
      if (error?.message === 'NOT_FOUND') return res.status(404).json({ error: 'Søknaden finnes ikke' });
      if (error?.message === 'FORBIDDEN') return res.status(403).json({ error: 'Du kan bare avbryte egne søknader' });
      if (error?.message === 'NOT_PENDING') return res.status(409).json({ error: 'Bare ventende søknader kan avbrytes' });
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Edit own pending leave request (dates / reason only)
   * PUT /api/leave/requests/:id
   */
  app.put('/api/leave/requests/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const authed = (req as any).authUser ?? (req as any).user;
      const authedId = authed?.id ? String(authed.id) : null;
      const { startDate, endDate, days, reason } = req.body;

      if (!startDate || !endDate || !days) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      if (new Date(endDate) < new Date(startDate)) {
        return res.status(400).json({ error: 'Sluttdato kan ikke være før startdato' });
      }

      const updated = await db.transaction(async (tx) => {
        const [request] = await tx
          .select()
          .from(leaveRequests)
          .where(eq(leaveRequests.id, parseInt(id)))
          .limit(1);

        if (!request) throw new Error('NOT_FOUND');
        if (request.userId !== authedId) throw new Error('FORBIDDEN');
        if (request.status !== 'pending') throw new Error('NOT_PENDING');

        const oldDays = parseFloat(request.days || '0');
        const newDays = parseFloat(days);
        const delta = newDays - oldDays;

        const [row] = await tx
          .update(leaveRequests)
          .set({ startDate, endDate, days: newDays.toString(), reason })
          .where(eq(leaveRequests.id, parseInt(id)))
          .returning();

        if (delta !== 0) {
          const year = new Date(request.startDate as string).getFullYear();
          await tx.update(leaveBalances).set({
            pendingDays: sql`pending_days + ${delta}`,
            remainingDays: sql`total_days - used_days - (pending_days + ${delta})`,
          }).where(and(
            eq(leaveBalances.userId, request.userId!),
            eq(leaveBalances.leaveTypeId, request.leaveTypeId as number),
            eq(leaveBalances.year, year),
          ));
        }

        return row;
      });

      res.json(updated);
    } catch (error: any) {
      if (error?.message === 'NOT_FOUND') return res.status(404).json({ error: 'Søknaden finnes ikke' });
      if (error?.message === 'FORBIDDEN') return res.status(403).json({ error: 'Du kan bare redigere egne søknader' });
      if (error?.message === 'NOT_PENDING') return res.status(409).json({ error: 'Bare ventende søknader kan redigeres' });
      res.status(500).json({ error: error.message });
    }
  });
}
