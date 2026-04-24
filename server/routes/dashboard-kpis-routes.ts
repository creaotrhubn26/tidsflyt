/**
 * server/routes/dashboard-kpis-routes.ts
 *
 * Mode-specific dashboard KPIs computed from real data (no synthetic formulas).
 * Replaces the client-side arithmetic previously in DashboardGoals for
 * tiltaksleder and miljøarbeider roles.
 */

import type { Express, Request, Response } from 'express';
import { db } from '../db';
import {
  rapporter, saker, rapportAktiviteter, logRow, userSettings,
} from '@shared/schema';
import { and, eq, gte, lte, desc, sql, inArray } from 'drizzle-orm';
import { format, startOfMonth, endOfMonth, subDays } from 'date-fns';
import { requireAuth } from '../middleware/auth';

export type DashboardKpiColor = 'blue' | 'green' | 'purple';
export type DashboardKpiIcon = 'clock' | 'check' | 'briefcase' | 'target';

export interface DashboardKpi {
  id: string;
  title: string;
  current: number;
  target: number;
  unit: string;
  icon: DashboardKpiIcon;
  color: DashboardKpiColor;
  tooltip: string;
  extraLabel: string | null;
  insufficient: boolean;
  lowerIsBetter?: boolean;
}

function authedUserId(req: Request): string | null {
  const u = (req as any).authUser ?? (req as any).user;
  return u?.id ? String(u.id) : null;
}

async function buildTiltakslederKpis(userIdNum: number): Promise<DashboardKpi[]> {
  const today = new Date();
  const monthStart = format(startOfMonth(today), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(today), 'yyyy-MM-dd');
  const thirtyDaysAgo = subDays(today, 30);

  // All aktive saker under this tiltaksleder
  const lederSaker = await db
    .select({ id: saker.id })
    .from(saker)
    .where(and(
      eq(saker.tiltakslederId, userIdNum as any),
      eq(saker.status, 'aktiv'),
    ));
  const totalAktiveSaker = lederSaker.length;
  const sakerIds = lederSaker.map(s => s.id);

  // Saker with activity in the last 30 days (latest rapport per sak is recent enough).
  let sakerWithRecentActivity = 0;
  const activitySet = new Set<string>();
  const gapDaysPerSak: number[] = [];
  if (sakerIds.length > 0) {
    // Latest rapport.updatedAt per sak
    const latestPerSak = await db
      .select({
        sakId: rapporter.sakId,
        latest: sql<string>`max(${rapporter.updatedAt})`,
      })
      .from(rapporter)
      .where(inArray(rapporter.sakId, sakerIds))
      .groupBy(rapporter.sakId);
    for (const row of latestPerSak) {
      if (row.sakId && row.latest && new Date(row.latest) >= thirtyDaysAgo) {
        activitySet.add(String(row.sakId));
      }
    }
    sakerWithRecentActivity = activitySet.size;

    // Average days between rapport activities per sak — join rapportAktiviteter → rapporter filtered by sakId
    // We collect all activity dates per sakId, sort, and compute average gap.
    const acts = await db
      .select({
        sakId: rapporter.sakId,
        dato: rapportAktiviteter.dato,
      })
      .from(rapportAktiviteter)
      .innerJoin(rapporter, eq(rapportAktiviteter.rapportId, rapporter.id))
      .where(and(
        inArray(rapporter.sakId, sakerIds),
        gte(rapportAktiviteter.dato, format(subDays(today, 90), 'yyyy-MM-dd')),
      ))
      .orderBy(rapportAktiviteter.dato);

    const datesBySak = new Map<string, Date[]>();
    for (const row of acts) {
      if (!row.sakId || !row.dato) continue;
      const key = String(row.sakId);
      const arr = datesBySak.get(key) ?? [];
      arr.push(new Date(row.dato));
      datesBySak.set(key, arr);
    }
    datesBySak.forEach((dates) => {
      if (dates.length < 2) return;
      dates.sort((a, b) => a.getTime() - b.getTime());
      let totalGap = 0;
      for (let i = 1; i < dates.length; i++) {
        totalGap += (dates[i].getTime() - dates[i - 1].getTime()) / (1000 * 60 * 60 * 24);
      }
      gapDaysPerSak.push(totalGap / (dates.length - 1));
    });
  }

  const followupRate = totalAktiveSaker > 0
    ? Math.round((sakerWithRecentActivity / totalAktiveSaker) * 100)
    : 0;

  // Rapporter levert innen frist — innsendt on or before (periodeTo + 7 days).
  // Scope: rapporter from this tiltaksleder with status in (til_godkjenning, godkjent, returnert) and periodeTo in the current month window.
  const deliveredRows = await db
    .select({
      innsendt: rapporter.innsendt,
      periodeTo: rapporter.periodeTo,
    })
    .from(rapporter)
    .where(and(
      eq(rapporter.tiltakslederId, userIdNum as any),
      inArray(rapporter.status, ['til_godkjenning', 'godkjent', 'returnert'] as any),
      gte(rapporter.periodeTo, monthStart),
      lte(rapporter.periodeTo, monthEnd),
    ));

  let onTime = 0;
  let offTime = 0;
  for (const r of deliveredRows) {
    if (!r.innsendt || !r.periodeTo) continue;
    const due = new Date(r.periodeTo);
    due.setDate(due.getDate() + 7);
    if (new Date(r.innsendt) <= due) onTime++;
    else offTime++;
  }
  const totalDelivered = onTime + offTime;
  const onTimeRate = totalDelivered > 0 ? Math.round((onTime / totalDelivered) * 100) : 0;
  const onTimeInsufficient = totalDelivered === 0;

  // Saker med rapport i denne måneden
  let sakerWithReportThisMonth = 0;
  if (sakerIds.length > 0) {
    const distinct = await db
      .selectDistinct({ sakId: rapporter.sakId })
      .from(rapporter)
      .where(and(
        inArray(rapporter.sakId, sakerIds),
        gte(rapporter.periodeTo, monthStart),
        lte(rapporter.periodeTo, monthEnd),
      ));
    sakerWithReportThisMonth = distinct.filter(r => !!r.sakId).length;
  }
  const reportCoverageRate = totalAktiveSaker > 0
    ? Math.round((sakerWithReportThisMonth / totalAktiveSaker) * 100)
    : 0;

  // Snitt dager mellom oppfølging på tvers av saker
  const avgGapDays = gapDaysPerSak.length > 0
    ? Math.round((gapDaysPerSak.reduce((a, b) => a + b, 0) / gapDaysPerSak.length) * 10) / 10
    : 0;
  const avgGapInsufficient = gapDaysPerSak.length === 0;

  return [
    {
      id: 'followup-coverage',
      title: 'Jevn oppfølging',
      current: followupRate,
      target: 90,
      unit: '%',
      icon: 'clock',
      color: 'blue',
      tooltip: 'Andel aktive saker med rapportaktivitet siste 30 dager.',
      extraLabel: totalAktiveSaker > 0
        ? `${sakerWithRecentActivity} av ${totalAktiveSaker} saker`
        : null,
      insufficient: totalAktiveSaker === 0,
    },
    {
      id: 'reports-on-time',
      title: 'Rapporter innen frist',
      current: onTimeRate,
      target: 95,
      unit: '%',
      icon: 'check',
      color: 'green',
      tooltip: 'Innsendt senest 7 dager etter periodens slutt denne måneden.',
      extraLabel: offTime > 0 ? `${offTime} for sent` : null,
      insufficient: onTimeInsufficient,
    },
    {
      id: 'case-report-coverage',
      title: 'Klientsaker med rapport',
      current: reportCoverageRate,
      target: 100,
      unit: '%',
      icon: 'briefcase',
      color: 'purple',
      tooltip: 'Aktive saker med minst én rapport for inneværende måned.',
      extraLabel: totalAktiveSaker > 0
        ? `${sakerWithReportThisMonth} av ${totalAktiveSaker} saker`
        : null,
      insufficient: totalAktiveSaker === 0,
    },
    {
      id: 'followup-gap',
      title: 'Snitt dager mellom oppfølging',
      current: avgGapDays,
      target: 7,
      unit: 'd',
      icon: 'target',
      color: 'blue',
      tooltip: 'Snittintervall mellom aktiviteter per sak siste 90 dager. Lavere er bedre.',
      extraLabel: null,
      insufficient: avgGapInsufficient,
      lowerIsBetter: true,
    },
  ];
}

async function buildMiljoarbeiderKpis(userIdStr: string, userIdNum: number): Promise<DashboardKpi[]> {
  const today = new Date();
  const monthStart = format(startOfMonth(today), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(today), 'yyyy-MM-dd');
  // Hard last-resort fallback when no sak has a budget AND the user has no personal target.
  const HARDCODED_MONTHLY_FALLBACK = 150;

  // Per-user fallback from user_settings.dashboardPrefs.monthlyHoursTarget.
  // Used when no sak in the portfolio has a monthly budget set.
  const [settingsRow] = await db
    .select({ dashboardPrefs: userSettings.dashboardPrefs })
    .from(userSettings)
    .where(eq(userSettings.userId, userIdStr))
    .limit(1);
  const userPrefs = (settingsRow?.dashboardPrefs ?? {}) as Record<string, any>;
  const userMonthlyTarget = Number(userPrefs.monthlyHoursTarget);
  const hasUserMonthlyTarget = Number.isFinite(userMonthlyTarget) && userMonthlyTarget > 0;

  // Mine timer denne måneden — sum log_row for this user.
  // log_row.user_id is text, so filter by the string user id; rapporter/saker use the integer id.
  const monthEntries = await db
    .select()
    .from(logRow)
    .where(and(
      eq(logRow.userId, userIdStr),
      gte(logRow.date, monthStart),
      lte(logRow.date, monthEnd),
    ));
  let monthlyMinutes = 0;
  for (const lr of monthEntries) {
    if (!lr.startTime || !lr.endTime) continue;
    const start = new Date(`2000-01-01T${lr.startTime}`);
    const end = new Date(`2000-01-01T${lr.endTime}`);
    const breakHrs = parseFloat(lr.breakHours?.toString() || '0');
    const hours = Math.max(0, (end.getTime() - start.getTime()) / (1000 * 60 * 60) - breakHrs);
    monthlyMinutes += Math.round(hours * 60);
  }
  const monthlyHours = Math.round((monthlyMinutes / 60) * 10) / 10;

  // Mine rapporter
  const myRapporter = await db
    .select({ status: rapporter.status })
    .from(rapporter)
    .where(eq(rapporter.userId, userIdNum as any));
  const draftCount = myRapporter.filter(r => r.status === 'utkast').length;
  const deliveredCount = myRapporter.filter(r => r.status === 'til_godkjenning' || r.status === 'godkjent').length;
  const returnedCount = myRapporter.filter(r => r.status === 'returnert').length;
  const totalMyRapporter = myRapporter.length;
  const deliveredRate = totalMyRapporter > 0
    ? Math.round((deliveredCount / totalMyRapporter) * 100)
    : 0;

  // Aktive saker tildelt meg — saker.tildelteUserId is a jsonb array of user ids.
  // Also read ekstraFelter so we can roll up the monthly hours budget set by the tiltaksleder.
  const allAktiveSaker = await db
    .select({ id: saker.id, tildelte: saker.tildelteUserId, ekstra: saker.ekstraFelter })
    .from(saker)
    .where(eq(saker.status, 'aktiv'));
  const mySaker = allAktiveSaker.filter((s) => {
    const arr = Array.isArray(s.tildelte) ? s.tildelte : [];
    return arr.some((v: any) => String(v) === String(userIdNum));
  });
  const myAktiveSaker = mySaker.length;

  // Roll up per-sak monthly hour budget (set by tiltaksleder on saker.ekstra_felter.hoursBudget.monthly).
  // If no sak has a budget, fall back to a generic default so the KPI still renders.
  let totalMonthlyBudget = 0;
  let sakerWithBudget = 0;
  for (const s of mySaker) {
    const extra = (s.ekstra ?? {}) as Record<string, any>;
    const monthly = Number(extra?.hoursBudget?.monthly);
    if (Number.isFinite(monthly) && monthly > 0) {
      totalMonthlyBudget += monthly;
      sakerWithBudget += 1;
    }
  }
  // Layered priority: sak-sum → per-user pref → hardcoded fallback.
  const usingSakSum = totalMonthlyBudget > 0;
  const monthlyTarget = usingSakSum
    ? totalMonthlyBudget
    : hasUserMonthlyTarget
    ? userMonthlyTarget
    : HARDCODED_MONTHLY_FALLBACK;
  const monthlyExtraLabel = usingSakSum
    ? `Sum av ${sakerWithBudget} sak${sakerWithBudget === 1 ? '' : 'er'}`
    : hasUserMonthlyTarget
    ? 'Per-bruker mål (ingen saksbudsjett satt)'
    : (myAktiveSaker > 0
        ? `Ingen timebudsjett satt på saker — bruker ${HARDCODED_MONTHLY_FALLBACK} t som fallback`
        : null);

  return [
    {
      id: 'monthly-hours',
      title: 'Mine timer denne måneden',
      current: monthlyHours,
      target: monthlyTarget,
      unit: 'timer',
      icon: 'clock',
      color: 'blue',
      tooltip: 'Timer denne måneden vs. sum av timebudsjett tiltakslederen har satt på saker tildelt meg.',
      extraLabel: monthlyExtraLabel,
      insufficient: false,
    },
    {
      id: 'rapporter-delivered',
      title: 'Rapporter levert',
      current: deliveredRate,
      target: 100,
      unit: '%',
      icon: 'check',
      color: 'green',
      tooltip: 'Andel av mine rapporter som er innsendt eller godkjent.',
      extraLabel: draftCount > 0
        ? `${draftCount} utkast gjenstår`
        : returnedCount > 0
        ? `${returnedCount} returnert`
        : null,
      insufficient: totalMyRapporter === 0,
    },
    {
      id: 'my-active-saker',
      title: 'Aktive saker tildelt meg',
      current: myAktiveSaker,
      target: Math.max(myAktiveSaker, 1),
      unit: 'saker',
      icon: 'briefcase',
      color: 'purple',
      tooltip: 'Antall aktive klientsaker der jeg er tildelt som miljøarbeider.',
      extraLabel: null,
      insufficient: false,
    },
    {
      id: 'drafts-pending',
      title: 'Utkast i arbeid',
      current: draftCount,
      target: 0,
      unit: '',
      icon: 'target',
      color: 'blue',
      tooltip: 'Rapporter jeg har begynt på, men ikke sendt inn. Lavere er bedre.',
      extraLabel: null,
      insufficient: false,
      lowerIsBetter: true,
    },
  ];
}

export function registerDashboardKpisRoutes(app: Express) {
  /** GET /api/dashboard/kpis?mode=tiltaksleder|miljoarbeider — real KPIs per role. */
  app.get('/api/dashboard/kpis', requireAuth, async (req: Request, res: Response) => {
    try {
      const userIdStr = authedUserId(req);
      if (!userIdStr) return res.status(401).json({ error: 'Ikke innlogget' });
      const userIdNum = Number(userIdStr);
      if (!Number.isFinite(userIdNum)) {
        return res.json({ mode: 'default', kpis: [] });
      }

      const mode = typeof req.query.mode === 'string' ? req.query.mode : 'default';

      let kpis: DashboardKpi[] = [];
      if (mode === 'tiltaksleder') {
        kpis = await buildTiltakslederKpis(userIdNum);
      } else if (mode === 'miljoarbeider') {
        kpis = await buildMiljoarbeiderKpis(userIdStr, userIdNum);
      }

      res.setHeader('Cache-Control', 'private, max-age=30');
      res.json({ mode, kpis });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}
