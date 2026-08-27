import type { Express, NextFunction, Request, Response } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { leaveBalances, leaveRequests, leaveTypes } from "@shared/schema";
import { emailService } from "../lib/email-service";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { requireAuth } from "../middleware/auth";
import {
  canManageLeave,
  resolveLeaveActor,
  resolveLeaveTargetUser,
  type LeaveActor,
} from "../lib/leave-authorization";

type LeaveRequest = Request & { leaveActor?: LeaveActor };

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const ALLOWED_STATUSES = new Set(["pending", "approved", "rejected", "cancelled"]);

function parsePositiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseYear(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 2000 && parsed <= 2100 ? parsed : null;
}

function parseDays(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 366
    ? Math.round(parsed * 100) / 100
    : null;
}

function isValidDateOnly(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_ONLY.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function boundedText(value: unknown, maxLength: number): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || value.length > maxLength) return null;
  return value.trim();
}

async function requireLeaveActor(req: LeaveRequest, res: Response, next: NextFunction) {
  try {
    const resolved = await resolveLeaveActor(req);
    if (!resolved) {
      return res.status(403).json({ error: "Fraværstilgang krever aktiv leverandørtilknytning" });
    }
    req.leaveActor = resolved;
    next();
  } catch (error) {
    console.error("[leave] actor resolution failed", error);
    res.status(503).json({ error: "Kunne ikke kontrollere tilgang" });
  }
}

function actor(req: LeaveRequest): LeaveActor {
  return req.leaveActor!;
}

async function updateBalanceForStatusTransition(
  tx: any,
  request: typeof leaveRequests.$inferSelect,
  nextStatus: string,
) {
  const year = new Date(`${request.startDate}T00:00:00.000Z`).getUTCFullYear();
  const days = Number(request.days ?? 0);
  const whereBalance = and(
    eq(leaveBalances.vendorId, request.vendorId),
    eq(leaveBalances.userId, request.userId),
    eq(leaveBalances.leaveTypeId, request.leaveTypeId),
    eq(leaveBalances.year, year),
  );

  if (nextStatus === "approved" && request.status === "pending") {
    await tx.update(leaveBalances).set({
      pendingDays: sql`GREATEST(0, pending_days::numeric - ${days})::text`,
      usedDays: sql`(used_days::numeric + ${days})::text`,
      remainingDays: sql`GREATEST(0, total_days::numeric - (used_days::numeric + ${days}) - GREATEST(0, pending_days::numeric - ${days}))::text`,
    }).where(whereBalance);
  } else if ((nextStatus === "rejected" || nextStatus === "cancelled") && request.status === "pending") {
    await tx.update(leaveBalances).set({
      pendingDays: sql`GREATEST(0, pending_days::numeric - ${days})::text`,
      remainingDays: sql`GREATEST(0, total_days::numeric - used_days::numeric - GREATEST(0, pending_days::numeric - ${days}))::text`,
    }).where(whereBalance);
  } else if ((nextStatus === "rejected" || nextStatus === "cancelled") && request.status === "approved") {
    await tx.update(leaveBalances).set({
      usedDays: sql`GREATEST(0, used_days::numeric - ${days})::text`,
      remainingDays: sql`GREATEST(0, total_days::numeric - GREATEST(0, used_days::numeric - ${days}) - pending_days::numeric)::text`,
    }).where(whereBalance);
  }
}

export function registerLeaveRoutes(app: Express) {
  app.get("/api/leave/types", requireAuth, async (_req: Request, res: Response) => {
    try {
      const types = await db
        .select()
        .from(leaveTypes)
        .where(eq(leaveTypes.isActive, true))
        .orderBy(leaveTypes.displayOrder);
      res.json(types);
    } catch (error) {
      console.error("[leave] list types failed", error);
      res.status(500).json({ error: "Kunne ikke hente fraværstyper" });
    }
  });

  app.get("/api/leave/balance", requireAuth, requireLeaveActor, async (req: LeaveRequest, res: Response) => {
    try {
      const selectedYear = parseYear(req.query.year ?? new Date().getFullYear());
      if (!selectedYear) return res.status(400).json({ error: "Ugyldig år" });
      const targetUserId = await resolveLeaveTargetUser(actor(req), req.query.userId);
      if (!targetUserId) return res.status(404).json({ error: "Bruker ikke funnet" });

      const balances = await db
        .select({
          id: leaveBalances.id,
          vendorId: leaveBalances.vendorId,
          userId: leaveBalances.userId,
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
        .where(and(
          eq(leaveBalances.vendorId, actor(req).vendorId),
          eq(leaveBalances.userId, targetUserId),
          eq(leaveBalances.year, selectedYear),
        ));

      res.setHeader("Cache-Control", "no-store");
      res.json(balances);
    } catch (error) {
      console.error("[leave] get balance failed", error);
      res.status(500).json({ error: "Kunne ikke hente fraværsbalanse" });
    }
  });

  app.post("/api/leave/balance/initialize", requireAuth, requireLeaveActor, async (req: LeaveRequest, res: Response) => {
    try {
      if (!canManageLeave(actor(req))) {
        return res.status(403).json({ error: "Krever lederrolle i virksomheten" });
      }
      const targetUserId = await resolveLeaveTargetUser(actor(req), req.body?.userId);
      const selectedYear = parseYear(req.body?.year ?? new Date().getFullYear());
      if (!targetUserId) return res.status(404).json({ error: "Bruker ikke funnet" });
      if (!selectedYear) return res.status(400).json({ error: "Ugyldig år" });

      const types = await db.select().from(leaveTypes).where(eq(leaveTypes.isActive, true));
      if (types.length > 0) {
        await db.insert(leaveBalances).values(types.map((type) => {
          const totalDays = type.maxDaysPerYear || 25;
          return {
            vendorId: actor(req).vendorId,
            userId: targetUserId,
            leaveTypeId: type.id,
            year: selectedYear,
            totalDays: String(totalDays),
            usedDays: "0",
            pendingDays: "0",
            remainingDays: String(totalDays),
          };
        })).onConflictDoNothing();
      }
      res.json({ success: true, message: "Fraværsbalanser initialisert" });
    } catch (error) {
      console.error("[leave] initialize balance failed", error);
      res.status(500).json({ error: "Kunne ikke initialisere fraværsbalanse" });
    }
  });

  app.get("/api/leave/requests", requireAuth, requireLeaveActor, async (req: LeaveRequest, res: Response) => {
    try {
      const requestedUserId = typeof req.query.userId === "string" ? req.query.userId.trim() : "";
      const manager = canManageLeave(actor(req));
      const targetUserId = requestedUserId
        ? await resolveLeaveTargetUser(actor(req), requestedUserId)
        : manager ? null : actor(req).id;
      if (requestedUserId && !targetUserId) {
        return res.status(404).json({ error: "Bruker ikke funnet" });
      }

      const requestedStatus = typeof req.query.status === "string" ? req.query.status.trim() : "";
      if (requestedStatus && !ALLOWED_STATUSES.has(requestedStatus)) {
        return res.status(400).json({ error: "Ugyldig status" });
      }

      const conditions = [eq(leaveRequests.vendorId, actor(req).vendorId)];
      if (targetUserId) conditions.push(eq(leaveRequests.userId, targetUserId));
      if (requestedStatus) conditions.push(eq(leaveRequests.status, requestedStatus));

      const requests = await db
        .select({
          id: leaveRequests.id,
          vendorId: leaveRequests.vendorId,
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
        .leftJoin(leaveTypes, eq(leaveRequests.leaveTypeId, leaveTypes.id))
        .where(and(...conditions))
        .orderBy(desc(leaveRequests.createdAt));

      res.setHeader("Cache-Control", "no-store");
      res.json(requests);
    } catch (error) {
      console.error("[leave] list requests failed", error);
      res.status(500).json({ error: "Kunne ikke hente fraværssøknader" });
    }
  });

  app.post("/api/leave/requests", requireAuth, requireLeaveActor, async (req: LeaveRequest, res: Response) => {
    try {
      if (req.body?.userId != null && String(req.body.userId) !== actor(req).id) {
        return res.status(403).json({ error: "Du kan bare opprette egne fraværssøknader" });
      }
      const leaveTypeId = parsePositiveInteger(req.body?.leaveTypeId);
      const days = parseDays(req.body?.days);
      const startDate = req.body?.startDate;
      const endDate = req.body?.endDate;
      const reason = boundedText(req.body?.reason, 4_000);
      if (!leaveTypeId || !days || !isValidDateOnly(startDate) || !isValidDateOnly(endDate) || endDate < startDate) {
        return res.status(400).json({ error: "Ugyldige fraværsdata" });
      }
      if (req.body?.reason != null && reason === null) {
        return res.status(400).json({ error: "Begrunnelse er for lang eller ugyldig" });
      }

      const [leaveType] = await db
        .select()
        .from(leaveTypes)
        .where(and(eq(leaveTypes.id, leaveTypeId), eq(leaveTypes.isActive, true)))
        .limit(1);
      if (!leaveType) return res.status(400).json({ error: "Ugyldig fraværstype" });

      const created = await db.transaction(async (tx) => {
        const [row] = await tx.insert(leaveRequests).values({
          vendorId: actor(req).vendorId,
          userId: actor(req).id,
          leaveTypeId,
          startDate,
          endDate,
          days: String(days),
          reason,
          status: "pending",
        }).returning();

        const year = new Date(`${startDate}T00:00:00.000Z`).getUTCFullYear();
        await tx.update(leaveBalances).set({
          pendingDays: sql`(pending_days::numeric + ${days})::text`,
          remainingDays: sql`GREATEST(0, total_days::numeric - used_days::numeric - (pending_days::numeric + ${days}))::text`,
        }).where(and(
          eq(leaveBalances.vendorId, actor(req).vendorId),
          eq(leaveBalances.userId, actor(req).id),
          eq(leaveBalances.leaveTypeId, leaveTypeId),
          eq(leaveBalances.year, year),
        ));
        return row;
      });

      if (process.env.MANAGER_EMAIL) {
        await emailService.sendLeaveRequestNotification(
          process.env.MANAGER_EMAIL,
          "Ansatt",
          leaveType.name,
          format(new Date(`${startDate}T00:00:00`), "dd.MM.yyyy", { locale: nb }),
          format(new Date(`${endDate}T00:00:00`), "dd.MM.yyyy", { locale: nb }),
          days,
        );
      }
      res.status(201).json(created);
    } catch (error) {
      console.error("[leave] create request failed", error);
      res.status(500).json({ error: "Kunne ikke opprette fraværssøknad" });
    }
  });

  app.patch("/api/leave/requests/:id", requireAuth, requireLeaveActor, async (req: LeaveRequest, res: Response) => {
    try {
      if (!canManageLeave(actor(req))) {
        return res.status(403).json({ error: "Krever lederrolle i virksomheten" });
      }
      const id = parsePositiveInteger(req.params.id);
      const nextStatus = String(req.body?.status ?? "");
      const reviewComment = boundedText(req.body?.reviewComment, 2_000);
      if (!id || !["approved", "rejected", "cancelled"].includes(nextStatus)) {
        return res.status(400).json({ error: "Ugyldig status eller id" });
      }
      if (req.body?.reviewComment != null && reviewComment === null) {
        return res.status(400).json({ error: "Kommentar er for lang eller ugyldig" });
      }

      const updated = await db.transaction(async (tx) => {
        const [current] = await tx.select().from(leaveRequests).where(and(
          eq(leaveRequests.id, id),
          eq(leaveRequests.vendorId, actor(req).vendorId),
        )).limit(1);
        if (!current) throw new Error("NOT_FOUND");
        if (current.status === nextStatus) return current;
        if (!["pending", "approved"].includes(String(current.status))) throw new Error("INVALID_TRANSITION");

        await updateBalanceForStatusTransition(tx, current, nextStatus);
        const [row] = await tx.update(leaveRequests).set({
          status: nextStatus,
          reviewedBy: actor(req).id,
          reviewedAt: new Date(),
          reviewComment,
        }).where(and(
          eq(leaveRequests.id, id),
          eq(leaveRequests.vendorId, actor(req).vendorId),
        )).returning();
        return row;
      });
      res.json(updated);
    } catch (error: any) {
      if (error?.message === "NOT_FOUND") return res.status(404).json({ error: "Søknaden finnes ikke" });
      if (error?.message === "INVALID_TRANSITION") return res.status(409).json({ error: "Ugyldig statusovergang" });
      console.error("[leave] review request failed", error);
      res.status(500).json({ error: "Kunne ikke behandle fraværssøknaden" });
    }
  });

  app.post("/api/leave/requests/:id/cancel", requireAuth, requireLeaveActor, async (req: LeaveRequest, res: Response) => {
    try {
      const id = parsePositiveInteger(req.params.id);
      if (!id) return res.status(400).json({ error: "Ugyldig id" });
      const updated = await db.transaction(async (tx) => {
        const [current] = await tx.select().from(leaveRequests).where(and(
          eq(leaveRequests.id, id),
          eq(leaveRequests.vendorId, actor(req).vendorId),
          eq(leaveRequests.userId, actor(req).id),
        )).limit(1);
        if (!current) throw new Error("NOT_FOUND");
        if (current.status !== "pending") throw new Error("NOT_PENDING");
        await updateBalanceForStatusTransition(tx, current, "cancelled");
        const [row] = await tx.update(leaveRequests).set({
          status: "cancelled",
          reviewedAt: new Date(),
        }).where(and(
          eq(leaveRequests.id, id),
          eq(leaveRequests.vendorId, actor(req).vendorId),
          eq(leaveRequests.userId, actor(req).id),
        )).returning();
        return row;
      });
      res.json(updated);
    } catch (error: any) {
      if (error?.message === "NOT_FOUND") return res.status(404).json({ error: "Søknaden finnes ikke" });
      if (error?.message === "NOT_PENDING") return res.status(409).json({ error: "Bare ventende søknader kan avbrytes" });
      console.error("[leave] cancel request failed", error);
      res.status(500).json({ error: "Kunne ikke avbryte fraværssøknaden" });
    }
  });

  app.put("/api/leave/requests/:id", requireAuth, requireLeaveActor, async (req: LeaveRequest, res: Response) => {
    try {
      const id = parsePositiveInteger(req.params.id);
      const days = parseDays(req.body?.days);
      const startDate = req.body?.startDate;
      const endDate = req.body?.endDate;
      const reason = boundedText(req.body?.reason, 4_000);
      if (!id || !days || !isValidDateOnly(startDate) || !isValidDateOnly(endDate) || endDate < startDate) {
        return res.status(400).json({ error: "Ugyldige fraværsdata" });
      }
      if (req.body?.reason != null && reason === null) {
        return res.status(400).json({ error: "Begrunnelse er for lang eller ugyldig" });
      }

      const updated = await db.transaction(async (tx) => {
        const [current] = await tx.select().from(leaveRequests).where(and(
          eq(leaveRequests.id, id),
          eq(leaveRequests.vendorId, actor(req).vendorId),
          eq(leaveRequests.userId, actor(req).id),
        )).limit(1);
        if (!current) throw new Error("NOT_FOUND");
        if (current.status !== "pending") throw new Error("NOT_PENDING");

        const oldDays = Number(current.days ?? 0);
        const oldYear = new Date(`${current.startDate}T00:00:00.000Z`).getUTCFullYear();
        const newYear = new Date(`${startDate}T00:00:00.000Z`).getUTCFullYear();
        if (oldYear === newYear) {
          const delta = days - oldDays;
          if (delta !== 0) {
            await tx.update(leaveBalances).set({
              pendingDays: sql`GREATEST(0, pending_days::numeric + ${delta})::text`,
              remainingDays: sql`GREATEST(0, total_days::numeric - used_days::numeric - GREATEST(0, pending_days::numeric + ${delta}))::text`,
            }).where(and(
              eq(leaveBalances.vendorId, actor(req).vendorId),
              eq(leaveBalances.userId, actor(req).id),
              eq(leaveBalances.leaveTypeId, current.leaveTypeId),
              eq(leaveBalances.year, oldYear),
            ));
          }
        } else {
          await tx.update(leaveBalances).set({
            pendingDays: sql`GREATEST(0, pending_days::numeric - ${oldDays})::text`,
            remainingDays: sql`GREATEST(0, total_days::numeric - used_days::numeric - GREATEST(0, pending_days::numeric - ${oldDays}))::text`,
          }).where(and(
            eq(leaveBalances.vendorId, actor(req).vendorId),
            eq(leaveBalances.userId, actor(req).id),
            eq(leaveBalances.leaveTypeId, current.leaveTypeId),
            eq(leaveBalances.year, oldYear),
          ));
          await tx.update(leaveBalances).set({
            pendingDays: sql`(pending_days::numeric + ${days})::text`,
            remainingDays: sql`GREATEST(0, total_days::numeric - used_days::numeric - (pending_days::numeric + ${days}))::text`,
          }).where(and(
            eq(leaveBalances.vendorId, actor(req).vendorId),
            eq(leaveBalances.userId, actor(req).id),
            eq(leaveBalances.leaveTypeId, current.leaveTypeId),
            eq(leaveBalances.year, newYear),
          ));
        }

        const [row] = await tx.update(leaveRequests).set({
          startDate,
          endDate,
          days: String(days),
          reason,
        }).where(and(
          eq(leaveRequests.id, id),
          eq(leaveRequests.vendorId, actor(req).vendorId),
          eq(leaveRequests.userId, actor(req).id),
        )).returning();
        return row;
      });
      res.json(updated);
    } catch (error: any) {
      if (error?.message === "NOT_FOUND") return res.status(404).json({ error: "Søknaden finnes ikke" });
      if (error?.message === "NOT_PENDING") return res.status(409).json({ error: "Bare ventende søknader kan redigeres" });
      console.error("[leave] edit request failed", error);
      res.status(500).json({ error: "Kunne ikke oppdatere fraværssøknaden" });
    }
  });
}
