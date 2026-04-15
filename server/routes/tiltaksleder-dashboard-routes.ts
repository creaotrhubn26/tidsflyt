/**
 * server/routes/tiltaksleder-dashboard-routes.ts
 *
 * Tiltaksleder-specific dashboard data: pending approvals, returned rapporter,
 * saker needing follow-up, team workload + availability snapshot.
 */

import type { Express, Request, Response } from 'express';
import { db } from '../db';
import {
  rapporter, saker, leaveRequests, leaveTypes, users,
  vendorInstitutions, vendors, rapportTemplates,
} from '@shared/schema';
import { and, eq, inArray, lte, gte, between, desc, sql, count } from 'drizzle-orm';
import { format, startOfMonth, endOfMonth, addDays, startOfWeek, endOfWeek } from 'date-fns';
import { requireAuth } from '../middleware/auth';

function authedUserId(req: Request): string | null {
  const u = (req as any).authUser ?? (req as any).user;
  return u?.id ? String(u.id) : null;
}

export function registerTiltakslederDashboardRoutes(app: Express) {
  /** GET /api/tiltaksleder/dashboard — aggregate snapshot for the role */
  app.get('/api/tiltaksleder/dashboard', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = authedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Ikke innlogget' });

      const today = format(new Date(), 'yyyy-MM-dd');
      const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');
      const monthEnd = format(endOfMonth(new Date()), 'yyyy-MM-dd');
      const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
      const weekEnd = format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
      const fortnightEnd = format(addDays(new Date(), 14), 'yyyy-MM-dd');

      // 1. Pending approvals — rapporter awaiting review for this leder
      const pendingApprovals = await db
        .select({
          id: rapporter.id,
          status: rapporter.status,
          konsulent: rapporter.konsulent,
          periodeFrom: rapporter.periodeFrom,
          innsendt: rapporter.innsendt,
          sakId: rapporter.sakId,
          oppdragsgiver: rapporter.oppdragsgiver,
        })
        .from(rapporter)
        .where(and(
          eq(rapporter.tiltakslederId, Number(userId) as any),
          eq(rapporter.status, 'til_godkjenning'),
        ))
        .orderBy(rapporter.innsendt);

      // 2. Returned rapporter (need user attention) — for visibility, all under this leder
      const returnedRapporter = await db
        .select({
          id: rapporter.id,
          konsulent: rapporter.konsulent,
          periodeFrom: rapporter.periodeFrom,
          updatedAt: rapporter.updatedAt,
          reviewKommentar: rapporter.reviewKommentar,
        })
        .from(rapporter)
        .where(and(
          eq(rapporter.tiltakslederId, Number(userId) as any),
          eq(rapporter.status, 'returnert'),
        ))
        .limit(20);

      // 3. Saker assigned to this leder with no recent rapport (potential blind spots)
      const lederSaker = await db
        .select()
        .from(saker)
        .where(and(
          eq(saker.tiltakslederId, Number(userId) as any),
          eq(saker.status, 'aktiv'),
        ));

      // For each, find the most recent rapport
      const sakerWithoutRecent: Array<{ id: string; saksnummer: string; tittel: string; lastRapport: string | null; daysSince: number }> = [];
      for (const sak of lederSaker) {
        const [last] = await db
          .select({ updatedAt: rapporter.updatedAt })
          .from(rapporter)
          .where(eq(rapporter.sakId, sak.id))
          .orderBy(desc(rapporter.updatedAt))
          .limit(1);
        const lastDate = last?.updatedAt ? new Date(last.updatedAt) : null;
        const daysSince = lastDate ? Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24)) : 999;
        if (daysSince >= 30) {
          sakerWithoutRecent.push({
            id: sak.id,
            saksnummer: sak.saksnummer,
            tittel: sak.tittel,
            lastRapport: lastDate ? lastDate.toISOString() : null,
            daysSince,
          });
        }
      }
      sakerWithoutRecent.sort((a, b) => b.daysSince - a.daysSince);

      // 4. Team workload + availability — all users assigned to this leder's saker
      const assignedUserIds = new Set<string>();
      for (const sak of lederSaker) {
        const ids = Array.isArray(sak.tildelteUserId) ? sak.tildelteUserId : [];
        for (const id of ids) assignedUserIds.add(String(id));
      }

      const teamMembers = assignedUserIds.size > 0
        ? await db.select().from(users).where(inArray(users.id, [...assignedUserIds]))
        : [];

      // Hours per user this month — sum from approved rapport activities
      const teamHours = await db
        .select({
          userId: rapporter.userId,
          totalMins: sql<number>`coalesce(sum(${rapporter.totalMinutter}), 0)::int`,
          rapportCount: sql<number>`count(*)::int`,
        })
        .from(rapporter)
        .where(and(
          inArray(rapporter.userId, [...assignedUserIds].map(id => Number(id))),
          between(rapporter.periodeFrom, monthStart, monthEnd),
        ))
        .groupBy(rapporter.userId);
      const hoursById = new Map(teamHours.map(h => [String(h.userId), { totalMins: h.totalMins, count: h.rapportCount }]));

      // 5. Approved leave for team in upcoming 2 weeks (availability)
      const upcomingLeave = assignedUserIds.size > 0 ? await db
        .select({
          id: leaveRequests.id,
          userId: leaveRequests.userId,
          startDate: leaveRequests.startDate,
          endDate: leaveRequests.endDate,
          days: leaveRequests.days,
          leaveTypeName: leaveTypes.name,
          leaveTypeColor: leaveTypes.color,
        })
        .from(leaveRequests)
        .leftJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
        .where(and(
          eq(leaveRequests.status, 'approved'),
          inArray(leaveRequests.userId, [...assignedUserIds]),
          gte(leaveRequests.endDate, today),
          lte(leaveRequests.startDate, fortnightEnd),
        ))
        .orderBy(leaveRequests.startDate)
        : [];
      const leaveByUser = new Map<string, typeof upcomingLeave>();
      for (const l of upcomingLeave) {
        const arr = leaveByUser.get(String(l.userId)) ?? [];
        arr.push(l);
        leaveByUser.set(String(l.userId), arr);
      }

      const team = teamMembers.map((m) => {
        const id = String(m.id);
        const stats = hoursById.get(id) ?? { totalMins: 0, count: 0 };
        const leaves = leaveByUser.get(id) ?? [];
        // Is on leave today?
        const onLeaveToday = leaves.some(l =>
          l.startDate && l.endDate && l.startDate <= today && l.endDate >= today
        );
        const nextLeave = leaves[0] ?? null;
        return {
          id: m.id,
          email: m.email,
          firstName: m.firstName,
          lastName: m.lastName,
          role: m.role,
          monthHours: Math.round((stats.totalMins ?? 0) / 60 * 10) / 10,
          rapportCount: stats.count,
          onLeaveToday,
          nextLeave: nextLeave ? {
            startDate: nextLeave.startDate,
            endDate: nextLeave.endDate,
            type: nextLeave.leaveTypeName,
          } : null,
        };
      });

      res.json({
        period: { monthStart, monthEnd, weekStart, weekEnd, today },
        pendingApprovals,
        returnedRapporter,
        sakerWithoutRecent: sakerWithoutRecent.slice(0, 10),
        team,
        upcomingLeave,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /**
   * GET /api/vendor/summary
   * For vendor_admin: brukere, rapporter denne måneden, institusjoner,
   * aktive saker, onboarding-status (har logo/institusjon/mal/tiltaksleder).
   */
  app.get('/api/vendor/summary', requireAuth, async (req: Request, res: Response) => {
    try {
      const u = (req as any).authUser ?? (req as any).user;
      const vendorId = u?.vendorId ?? u?.vendor_id;
      if (!vendorId) return res.status(400).json({ error: 'Bruker mangler vendor_id' });

      const today = format(new Date(), 'yyyy-MM-dd');
      const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');
      const monthEnd = format(endOfMonth(new Date()), 'yyyy-MM-dd');

      const [vendor] = await db.select().from(vendors).where(eq(vendors.id, Number(vendorId))).limit(1);

      // Brukere i vendor
      const vendorUsers = await db
        .select({ id: users.id, role: users.role })
        .from(users)
        .where(eq(users.vendorId, Number(vendorId) as any));
      const userCount = vendorUsers.length;
      const tiltakslederCount = vendorUsers.filter(u => u.role === 'tiltaksleder').length;

      // Rapporter denne måneden (alle brukere i vendor). Bruk rå SQL-join
      // for å unngå type-mismatch mellom users.id (varchar) og rapporter.user_id (integer).
      const rapporterThisMonth = await db.execute(sql`
        SELECT
          count(*)::int AS count,
          count(*) FILTER (WHERE status = 'godkjent')::int AS approved
        FROM rapporter r
        JOIN users u ON u.id::text = r.user_id::text
        WHERE u.vendor_id = ${Number(vendorId)}
          AND r.periode_from BETWEEN ${monthStart} AND ${monthEnd}
      `);
      const rThisMonthRow = (rapporterThisMonth as any).rows?.[0] ?? { count: 0, approved: 0 };

      // Institusjoner
      const instRows = await db
        .select({ id: vendorInstitutions.id, autoForward: vendorInstitutions.autoForwardRapport })
        .from(vendorInstitutions)
        .where(eq(vendorInstitutions.vendorId, Number(vendorId)));

      // Aktive saker
      const aktiveSaker = await db
        .select({ id: saker.id })
        .from(saker)
        .where(and(eq(saker.vendorId, Number(vendorId) as any), eq(saker.status, 'aktiv')));

      // Maler (vendor-scoped eller system)
      const maler = await db
        .select({ id: rapportTemplates.id, isSystem: rapportTemplates.isSystem })
        .from(rapportTemplates)
        .where(sql`${rapportTemplates.vendorId} = ${Number(vendorId)} OR ${rapportTemplates.isSystem} = true`);

      const vendorOwnedMaler = maler.filter(m => !m.isSystem).length;

      // Har minst én invitasjonslenke vært aktiv?
      const inviteLinkCount = await db.execute(sql`
        SELECT count(*)::int AS c FROM vendor_invite_links WHERE vendor_id = ${Number(vendorId)}
      `);
      const hasInviteLink = Number((inviteLinkCount as any).rows?.[0]?.c ?? 0) > 0;

      // Har miljøarbeidere registrert seg?
      const miljoarbeiderCount = vendorUsers.filter(u => u.role === 'miljoarbeider').length;

      // Onboarding-checklist
      const checklist = {
        hasLogo:           !!vendor?.logoUrl,
        hasInstitution:    instRows.length > 0,
        hasOwnTemplate:    vendorOwnedMaler > 0,
        hasTiltaksleder:   tiltakslederCount > 0,
        hasInviteLink:     hasInviteLink,
        hasMiljoarbeider:  miljoarbeiderCount > 0,
      };
      const completed = Object.values(checklist).filter(Boolean).length;
      const total = Object.keys(checklist).length;

      res.json({
        vendor: vendor ? {
          id: vendor.id, name: vendor.name, slug: vendor.slug,
          logoUrl: vendor.logoUrl, maxUsers: vendor.maxUsers,
          subscriptionPlan: vendor.subscriptionPlan,
        } : null,
        users: {
          count: userCount,
          tiltakslederCount,
          maxUsers: vendor?.maxUsers ?? 50,
          utilizationPct: vendor?.maxUsers ? Math.round((userCount / vendor.maxUsers) * 100) : 0,
        },
        rapporter: {
          thisMonth: rThisMonthRow.count ?? 0,
          approvedThisMonth: rThisMonthRow.approved ?? 0,
        },
        institutions: {
          count: instRows.length,
          autoForwardCount: instRows.filter(i => i.autoForward).length,
        },
        saker: { aktiveCount: aktiveSaker.length },
        templates: {
          systemCount: maler.filter(m => m.isSystem).length,
          ownCount: vendorOwnedMaler,
        },
        onboarding: { checklist, completed, total, isDone: completed === total },
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}
