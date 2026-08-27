/**
 * server/routes/leave-rollover-cron.ts
 *
 * Year-end vacation rollover. On Jan 1 (or on-demand admin trigger),
 * for each user's prior-year leave_balance, seed a new row for the
 * current year and carry over remaining days up to a per-leave-type cap.
 *
 * Defaults follow the Norwegian Ferieloven:
 *   - "ferie"       → up to 12 days may be carried over (Ferieloven §7, 2.ledd)
 *   - "avspasering" → full carryover (typical for comp-time)
 *   - others        → no carryover (sickness/permission balances reset)
 */

import type { Express, Request, Response } from 'express';
import cron from 'node-cron';
import { db } from '../db';
import { and, eq } from 'drizzle-orm';
import { leaveBalances, leaveTypes } from '@shared/schema';
import { requireAuth } from '../middleware/auth';
import { canManageLeave, resolveLeaveActor } from '../lib/leave-authorization';

interface RolloverCap {
  /** max days carried over into the new year; undefined = unlimited */
  maxCarryover?: number;
  /** if false, skip rollover entirely for this leave type */
  allow: boolean;
}

function capForSlug(slug: string | null | undefined): RolloverCap {
  switch ((slug ?? '').toLowerCase()) {
    case 'ferie':
      return { allow: true, maxCarryover: 12 };
    case 'avspasering':
      return { allow: true };
    default:
      return { allow: false };
  }
}

export interface RolloverResult {
  userId: string;
  leaveTypeSlug: string;
  fromYear: number;
  toYear: number;
  carriedOverDays: number;
  capped: boolean;
  skipped?: 'already_exists' | 'no_carryover_allowed' | 'no_remaining';
}

/**
 * Run a rollover pass for the given target year. `fromYear` defaults to
 * targetYear-1. Idempotent: skips users who already have a balance for targetYear.
 */
export async function runLeaveRollover(
  targetYear: number = new Date().getFullYear(),
  fromYear: number = targetYear - 1,
  vendorId?: number,
): Promise<RolloverResult[]> {
  const results: RolloverResult[] = [];

  const types = await db.select().from(leaveTypes);
  const typeById = new Map(types.map(t => [t.id, t]));

  const priorRows = await db
    .select()
    .from(leaveBalances)
    .where(vendorId == null
      ? eq(leaveBalances.year, fromYear)
      : and(
          eq(leaveBalances.year, fromYear),
          eq(leaveBalances.vendorId, vendorId),
        ));

  for (const prior of priorRows) {
    const t = typeById.get(prior.leaveTypeId);
    const slug = t?.slug ?? '';
    const cap = capForSlug(slug);

    if (!cap.allow) {
      results.push({
        userId: prior.userId,
        leaveTypeSlug: slug,
        fromYear,
        toYear: targetYear,
        carriedOverDays: 0,
        capped: false,
        skipped: 'no_carryover_allowed',
      });
      continue;
    }

    const remaining = Number(prior.remainingDays ?? 0);
    if (!Number.isFinite(remaining) || remaining <= 0) {
      results.push({
        userId: prior.userId,
        leaveTypeSlug: slug,
        fromYear,
        toYear: targetYear,
        carriedOverDays: 0,
        capped: false,
        skipped: 'no_remaining',
      });
      continue;
    }

    // Idempotency: skip if the user already has a row for targetYear + leaveType.
    const [existing] = await db
      .select({ id: leaveBalances.id })
      .from(leaveBalances)
      .where(and(
        eq(leaveBalances.vendorId, prior.vendorId),
        eq(leaveBalances.userId, prior.userId),
        eq(leaveBalances.leaveTypeId, prior.leaveTypeId),
        eq(leaveBalances.year, targetYear),
      ))
      .limit(1);
    if (existing) {
      results.push({
        userId: prior.userId,
        leaveTypeSlug: slug,
        fromYear,
        toYear: targetYear,
        carriedOverDays: 0,
        capped: false,
        skipped: 'already_exists',
      });
      continue;
    }

    const carryover = cap.maxCarryover != null
      ? Math.min(remaining, cap.maxCarryover)
      : remaining;
    const capped = cap.maxCarryover != null && remaining > cap.maxCarryover;

    // Annual quota for this leave type, if set on the type definition.
    const annualQuota = Number(t?.maxDaysPerYear ?? 0);
    const totalDays = annualQuota > 0 ? annualQuota + carryover : carryover;

    await db.insert(leaveBalances).values({
      vendorId: prior.vendorId,
      userId: prior.userId,
      leaveTypeId: prior.leaveTypeId,
      year: targetYear,
      totalDays: String(totalDays),
      usedDays: '0',
      pendingDays: '0',
      remainingDays: String(totalDays),
    });

    results.push({
      userId: prior.userId,
      leaveTypeSlug: slug,
      fromYear,
      toYear: targetYear,
      carriedOverDays: carryover,
      capped,
    });
  }

  return results;
}

let cronStarted = false;
export function setupLeaveRolloverCron() {
  if (cronStarted) return;
  // Run Jan 1 at 01:00 local time
  cron.schedule('0 1 1 1 *', async () => {
    const thisYear = new Date().getFullYear();
    console.log(`🗓  Running leave rollover cron for year ${thisYear}…`);
    const results = await runLeaveRollover(thisYear);
    const carried = results.filter(r => r.carriedOverDays > 0).length;
    console.log(`Leave rollover completed: ${carried} balances created with carryover (${results.length} candidates processed)`);
  });
  cronStarted = true;
  console.log('✅ Leave rollover cron scheduled (Jan 1, 01:00)');
}

/** Admin endpoint to run rollover on demand (e.g. for past years / replay). */
export function registerLeaveRolloverRoutes(app: Express) {
  app.post('/api/leave/rollover/run', requireAuth, async (req: Request, res: Response) => {
    try {
      const actor = await resolveLeaveActor(req);
      if (!actor || !canManageLeave(actor)) {
        return res.status(403).json({ error: 'Krever lederrolle i virksomheten' });
      }
      const targetYear = Number(req.body?.targetYear ?? new Date().getFullYear());
      const fromYear = Number(req.body?.fromYear ?? targetYear - 1);
      if (
        !Number.isInteger(targetYear)
        || !Number.isInteger(fromYear)
        || targetYear < 2000
        || targetYear > 2100
        || fromYear < 2000
        || fromYear > 2100
      ) {
        return res.status(400).json({ error: 'targetYear og fromYear må være gyldige år' });
      }
      const results = await runLeaveRollover(targetYear, fromYear, actor.vendorId);
      const summary = {
        targetYear,
        fromYear,
        rowsProcessed: results.length,
        carriedOver: results.filter(r => r.carriedOverDays > 0).length,
        skipped: results.filter(r => r.skipped).length,
      };
      res.json({ ok: true, summary, results });
    } catch (error) {
      console.error('[leave-rollover] manual run failed', error);
      res.status(500).json({ error: 'Kunne ikke kjøre fraværsoverføring' });
    }
  });
}
