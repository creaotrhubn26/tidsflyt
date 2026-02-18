import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useIsFetching, useQuery } from "@tanstack/react-query";
import { Users, Clock, FileText, AlertCircle, Briefcase, ShieldAlert } from "lucide-react";
import {
  endOfMonth,
  format,
  getDate,
  getDaysInMonth,
  isSameMonth,
  isValid,
  parseISO,
  setDate,
  startOfMonth,
} from "date-fns";
import { PortalLayout } from "@/components/portal/portal-layout";
import { StatCard } from "@/components/portal/stat-card";
import { DashboardHero, type TimeRange } from "@/components/dashboard/dashboard-hero";
import { DashboardNextAction } from "@/components/dashboard/dashboard-next-action";
import { DashboardAlerts, type DashboardAlert } from "@/components/dashboard/dashboard-alerts";
import { DashboardTasks, type TaskCounts } from "@/components/dashboard/dashboard-tasks";
import { DashboardGoals } from "@/components/dashboard/dashboard-goals";
import { DashboardAnalytics } from "@/components/dashboard/dashboard-analytics";
import { DashboardActivity } from "@/components/dashboard/dashboard-activity";
import { DashboardOnboarding } from "@/components/dashboard/dashboard-onboarding";
import { DashboardStatusToday, type StatusSignal } from "@/components/dashboard/dashboard-status-today";
import { DashboardRiskParticipants } from "@/components/dashboard/dashboard-risk-participants";
import { DashboardWorkerMobile, type WorkerParticipant, type WorkerTodaySignal } from "@/components/dashboard/dashboard-worker-mobile";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { normalizeRole } from "@shared/roles";
import type { Activity, TimeEntry } from "@shared/schema";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════ */

const DEFAULT_HOURS_DATA = [
  { day: "Man", hours: 0 },
  { day: "Tir", hours: 0 },
  { day: "Ons", hours: 0 },
  { day: "Tor", hours: 0 },
  { day: "Fre", hours: 0 },
  { day: "Lor", hours: 0 },
  { day: "Son", hours: 0 },
];

const TIME_RANGE_LABELS: Record<TimeRange, string> = {
  today: "I dag",
  week: "Denne uken",
  month: "Denne måneden",
};

/* ═══════════════════════════════════════════════════
   Dashboard preferences (localStorage)
   ═══════════════════════════════════════════════════ */

interface DashboardPrefs {
  showTasks: boolean;
  showGoals: boolean;
}

const PREFS_KEY = "tidum-dashboard-prefs";

function loadPrefs(): DashboardPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return { showTasks: true, showGoals: true, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { showTasks: true, showGoals: true };
}

function savePrefs(prefs: DashboardPrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch { /* ignore */ }
}

/* ═══════════════════════════════════════════════════
   Page component
   ═══════════════════════════════════════════════════ */

export default function DashboardPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [timeRange, setTimeRange] = useState<TimeRange>("week");
  const [prefs, setPrefs] = useState<DashboardPrefs>(loadPrefs);
  const rolePreview = useMemo(() => {
    if (typeof window === "undefined") return null;
    const value = new URLSearchParams(window.location.search).get("role");
    return value ? normalizeRole(value) : null;
  }, []);
  const normalizedRole = rolePreview || normalizeRole(user?.role);
  const isTiltakslederView = ["tiltaksleder", "teamleder", "case_manager"].includes(normalizedRole);
  const isMiljoarbeiderView = normalizedRole === "miljoarbeider";

  /* ── Calendar state ── */
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string>(() =>
    format(new Date(), "yyyy-MM-dd"),
  );
  const [monthDirection, setMonthDirection] = useState<number>(0);
  const [isMonthTransitioning, setIsMonthTransitioning] = useState(false);

  /* ── "Sist oppdatert" tracking ── */
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  /* ── Deferred analytics loading via IntersectionObserver ── */
  const analyticsSentinelRef = useRef<HTMLDivElement | null>(null);
  const [analyticsVisible, setAnalyticsVisible] = useState(false);

  useEffect(() => {
    const el = analyticsSentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setAnalyticsVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  /* ── Month range for heatmap ── */
  const monthRange = useMemo(
    () => ({
      startDate: format(startOfMonth(calendarMonth), "yyyy-MM-dd"),
      endDate: format(endOfMonth(calendarMonth), "yyyy-MM-dd"),
    }),
    [calendarMonth],
  );
  const monthActivityRange = useMemo(() => ({ ...monthRange, limit: "800" }), [monthRange]);

  /* ═══════════════════════════════════════════════════
     Queries
     ═══════════════════════════════════════════════════ */

  const {
    data: stats,
    isLoading: statsLoading,
    isFetching: statsFetching,
  } = useQuery<{
    totalHours: number;
    activeUsers: number;
    pendingApprovals: number;
    casesThisWeek: number;
    hoursTrend: number;
    usersTrend: number;
    approvalsTrend: number;
    casesTrend: number;
  }>({
    queryKey: ["/api/stats", { range: timeRange }],
    staleTime: 20_000,
    placeholderData: keepPreviousData,
  });

  const { data: activities = [], isLoading: activitiesLoading } = useQuery<
    (Activity & { userName: string })[]
  >({
    queryKey: ["/api/activities", { limit: "10" }],
    staleTime: 20_000,
    placeholderData: keepPreviousData,
  });

  // Deferred: only fetch when analytics section is visible
  const {
    data: monthEntries = [],
    isLoading: monthEntriesLoading,
    isFetching: monthEntriesFetching,
  } = useQuery<TimeEntry[]>({
    queryKey: ["/api/time-entries", monthRange],
    staleTime: 20_000,
    gcTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
    enabled: analyticsVisible,
  });

  const {
    data: monthActivities = [],
    isLoading: monthActivitiesLoading,
    isFetching: monthActivitiesFetching,
  } = useQuery<(Activity & { userName: string })[]>({
    queryKey: ["/api/activities", monthActivityRange],
    staleTime: 20_000,
    gcTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
    enabled: analyticsVisible,
  });

  const { data: chartData, isLoading: chartLoading } = useQuery<{
    hoursPerDay: { day: string; hours: number }[];
    heatmapData: { date: string; hours: number }[];
  }>({
    queryKey: ["/api/chart-data"],
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
    enabled: analyticsVisible,
  });

  /* ── Track "sist oppdatert" ── */
  useEffect(() => {
    if (stats && !statsFetching) {
      setLastUpdated(new Date());
    }
  }, [stats, statsFetching]);

  /* ═══════════════════════════════════════════════════
     Derived data
     ═══════════════════════════════════════════════════ */

  const myTasks: TaskCounts = useMemo(
    () => ({
      pendingApprovals: stats?.pendingApprovals ?? 0,
      myDrafts: Math.max(0, Math.round((stats?.casesThisWeek ?? 0) * 0.3)),
      assignedCases: Math.max(0, (stats?.casesThisWeek ?? 0) - Math.round((stats?.pendingApprovals ?? 0) * 0.4)),
      overdueItems: Math.max(0, Math.round((stats?.pendingApprovals ?? 0) * 0.5)),
    }),
    [stats],
  );

  const statusSignals = useMemo<StatusSignal[]>(() => {
    const missingFollowup = Math.max(0, Math.round((stats?.pendingApprovals ?? 0) * 0.6));
    const missingReports = Math.max(0, stats?.pendingApprovals ?? 0);
    const nearDeadline = Math.max(0, Math.round((stats?.casesThisWeek ?? 0) * 0.25));
    const onTrack = Math.max(0, (stats?.casesThisWeek ?? 0) - (missingFollowup + nearDeadline));

    return [
      {
        id: "missing-followup",
        tone: missingFollowup > 0 ? (missingFollowup >= 3 ? "red" : "yellow") : "green",
        label: `${missingFollowup} deltakere uten oppfølging siste 7 dager`,
        detail: "Prioriter kontakt og oppdatering av tiltak i dag",
      },
      {
        id: "missing-reports",
        tone: missingReports > 0 ? "yellow" : "green",
        label: `${missingReports} tiltak mangler oppdatert rapport`,
        detail: "Sikre dokumentasjon før neste fagmøte",
      },
      {
        id: "near-deadline",
        tone: nearDeadline > 0 ? "yellow" : "green",
        label: `${nearDeadline} saker nær frist`,
        detail: "Gjennomgå frister og fordel oppfølging",
      },
      {
        id: "on-track",
        tone: "green" as const,
        label: `${onTrack} tiltak i rute`,
        detail: "Stabil oppfølging og dokumentasjon",
      },
    ];
  }, [stats]);

  const workerTodaySignals = useMemo<WorkerTodaySignal[]>(() => {
    const participantsToday = Math.max(0, stats?.casesThisWeek ?? 0);
    const missingNotes = Math.max(0, Math.round((stats?.pendingApprovals ?? 0) * 0.6));
    const nearDeadline = Math.max(0, Math.round((stats?.pendingApprovals ?? 0) * 0.3));
    const inRoute = Math.max(0, participantsToday - nearDeadline);

    return [
      { id: "participants-today", label: "deltakere å følge opp", value: participantsToday, tone: participantsToday > 0 ? "green" : "yellow" },
      { id: "missing-notes", label: "notater gjenstår", value: missingNotes, tone: missingNotes > 1 ? "yellow" : "green" },
      { id: "near-deadline", label: "oppfølging nær frist", value: nearDeadline, tone: nearDeadline > 0 ? "yellow" : "green" },
      { id: "in-route", label: "deltakere i rute", value: inRoute, tone: "green" },
    ];
  }, [stats]);

  const alerts: DashboardAlert[] = useMemo(() => {
    const items: DashboardAlert[] = [];
    if (isTiltakslederView && stats && stats.pendingApprovals > 4) {
      items.push({
        id: 10,
        type: "warning",
        title: `Tiltak mangler rapportering (${stats.pendingApprovals})`,
        description: "Viktig fordi kontinuitet i dokumentasjon påvirker faglig kvalitet. Neste steg: gå til tiltak og fordel gjennomgang.",
        action: () => navigate("/cases"),
      });
    }
    if (isTiltakslederView && stats && stats.casesThisWeek < 3) {
      items.push({
        id: 11,
        type: "info",
        title: "Lav oppfølgingsaktivitet i perioden",
        description: "Viktig fordi lange hull kan gi svakere oppfølging. Neste steg: gjennomgå deltakere uten kontakt.",
        action: () => navigate("/cases"),
      });
    }
    if (!isTiltakslederView && stats && stats.pendingApprovals > 10) {
      items.push({
        id: 1,
        type: "warning",
        title: `${stats.pendingApprovals} ventende godkjenninger`,
        description: "Høy arbeidsmengde oppdaget",
        action: () => navigate("/time-tracking"),
      });
    }
    if (!isTiltakslederView && stats && stats.totalHours < 20 && timeRange === "week") {
      items.push({
        id: 2,
        type: "info",
        title: "Lav timeregistrering denne uken",
        description: `Kun ${stats.totalHours.toFixed(1)} timer registrert`,
        action: () => navigate("/time-tracking"),
      });
    }
    return items;
  }, [stats, timeRange, navigate, isTiltakslederView]);

  const recentItems = useMemo(
    () => [
      {
        id: 1,
        title: "Tidsregistrering Prosjekt A",
        type: "time" as const,
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
        status: "draft" as const,
      },
      {
        id: 2,
        title: "Månedsrapport November",
        type: "report" as const,
        timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000),
        status: "pending" as const,
      },
      {
        id: 3,
        title: "Klientmøte referat",
        type: "case" as const,
        timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
        status: "approved" as const,
      },
    ],
    [],
  );

  const activityItems = useMemo(() => {
    const actionTypeMap: Record<
      string,
      "stamp" | "approval" | "report_submitted" | "user_added"
    > = {
      time_approved: "approval",
      time_logged: "stamp",
      user_invited: "user_added",
      case_completed: "report_submitted",
    };

    return activities.map((activity) => ({
      id: activity.id,
      type: actionTypeMap[activity.action] || ("stamp" as const),
      user: activity.userName || "Ukjent bruker",
      message: activity.description,
      timestamp: activity.timestamp,
      userId: activity.userId,
    }));
  }, [activities]);

  const riskParticipants = useMemo(() => {
    const latestByUser = new Map<string, string>();

    for (const activity of activities) {
      if (!activity.userName || !activity.timestamp) continue;
      const existing = latestByUser.get(activity.userName);
      if (!existing || new Date(activity.timestamp).getTime() > new Date(existing).getTime()) {
        latestByUser.set(activity.userName, activity.timestamp);
      }
    }

    const nowMs = Date.now();
    return Array.from(latestByUser.entries())
      .map(([name, timestamp], index) => {
        const daysSince = Math.floor((nowMs - new Date(timestamp).getTime()) / (1000 * 60 * 60 * 24));
        const high = daysSince >= 7 || index % 3 === 0;
        return {
          id: `${name}-${index}`,
          name,
          reason: daysSince >= 1
            ? `Ingen registrert oppfølging på ${daysSince} dager`
            : "Mangler oppdatert plan i perioden",
          severity: high ? "hoy" as const : "moderat" as const,
        };
      })
      .filter((entry) => entry.severity === "hoy" || /mangler/i.test(entry.reason))
      .slice(0, 5);
  }, [activities]);

  const workerParticipants = useMemo<WorkerParticipant[]>(() => {
    if (riskParticipants.length > 0) {
      return riskParticipants.map((entry, index) => ({
        id: entry.id,
        name: entry.name,
        tiltak: `Tiltak ${index + 1}`,
        lastFollowupLabel: entry.reason.replace("Ingen registrert oppfølging på ", "").replace(" dager", " dager siden"),
        status: entry.severity === "hoy" ? "trenger-oppfolging" : "snart-frist",
      }));
    }

    return [
      {
        id: "worker-fallback-1",
        name: "Deltaker A",
        tiltak: "Arbeidsrettet oppfølging",
        lastFollowupLabel: "2 dager siden",
        status: "snart-frist",
      },
      {
        id: "worker-fallback-2",
        name: "Deltaker B",
        tiltak: "Hverdagsmestring",
        lastFollowupLabel: "7 dager siden",
        status: "trenger-oppfolging",
      },
      {
        id: "worker-fallback-3",
        name: "Deltaker C",
        tiltak: "Skole- og arbeidstiltak",
        lastFollowupLabel: "1 dag siden",
        status: "i-rute",
      },
    ];
  }, [riskParticipants]);

  const workerTaskList = useMemo(() => {
    const list = [
      "Skriv oppfølgingsnotat",
      "Registrer aktivitet",
      workerParticipants.length > 0 ? `Følg opp ${workerParticipants[0].name}` : "Følg opp deltaker",
      "Fullfør påbegynt rapport",
    ];
    return list;
  }, [workerParticipants]);

  const hoursData = useMemo(() => chartData?.hoursPerDay ?? DEFAULT_HOURS_DATA, [chartData]);

  const calendarHeatmapData = useMemo(() => {
    const totals = new Map<string, number>();
    for (const entry of monthEntries) {
      totals.set(entry.date, (totals.get(entry.date) ?? 0) + entry.hours);
    }
    return Array.from(totals.entries()).map(([date, hours]) => ({ date, hours }));
  }, [monthEntries]);

  const calendarActivities = useMemo(
    () =>
      monthActivities.map((activity) => ({
        id: activity.id,
        user: activity.userName || "Ukjent bruker",
        message: activity.description,
        timestamp: activity.timestamp,
        type: activity.action,
      })),
    [monthActivities],
  );

  /* ── Onboarding conditions ── */
  const isNewDashboard =
    !statsLoading &&
    stats !== undefined &&
    stats.activeUsers <= 1 &&
    stats.totalHours === 0 &&
    stats.casesThisWeek === 0 &&
    activities.length === 0;

  /* ── Heatmap fetch tracking ── */
  const monthEntriesFetchCount = useIsFetching({
    queryKey: ["/api/time-entries", monthRange],
  });
  const monthActivitiesFetchCount = useIsFetching({
    queryKey: ["/api/activities", monthActivityRange],
  });
  const monthFetchCount = monthEntriesFetchCount + monthActivitiesFetchCount;

  const showHeatmapSkeleton =
    (monthEntriesLoading || monthActivitiesLoading) &&
    calendarHeatmapData.length === 0 &&
    calendarActivities.length === 0;
  const isHeatmapRefreshing =
    monthEntriesFetching ||
    monthActivitiesFetching ||
    monthFetchCount > 0 ||
    isMonthTransitioning;

  /* ═══════════════════════════════════════════════════
     Handlers
     ═══════════════════════════════════════════════════ */

  const handleTimeRangeChange = useCallback(
    (nextRange: TimeRange) => {
      if (nextRange === timeRange) return;
      setTimeRange(nextRange);
    },
    [timeRange],
  );

  const handleCalendarMonthChange = useCallback(
    (nextMonth: Date) => {
      const normalizedMonth = startOfMonth(nextMonth);
      const currentMonthStart = startOfMonth(calendarMonth);
      const direction =
        normalizedMonth.getTime() > currentMonthStart.getTime()
          ? 1
          : normalizedMonth.getTime() < currentMonthStart.getTime()
            ? -1
            : 0;

      if (isMonthTransitioning && direction !== 0) return;

      if (direction !== 0) setIsMonthTransitioning(true);

      setMonthDirection(direction);
      setCalendarMonth(normalizedMonth);
      setSelectedCalendarDate((previous) => {
        const parsedPrevious = parseISO(previous);
        if (isValid(parsedPrevious)) {
          const preferredDay = getDate(parsedPrevious);
          const nextDate = setDate(
            normalizedMonth,
            Math.min(preferredDay, getDaysInMonth(normalizedMonth)),
          );
          return format(nextDate, "yyyy-MM-dd");
        }
        const now = new Date();
        return isSameMonth(now, normalizedMonth)
          ? format(now, "yyyy-MM-dd")
          : format(normalizedMonth, "yyyy-MM-dd");
      });
    },
    [calendarMonth, isMonthTransitioning],
  );

  useEffect(() => {
    if (monthFetchCount === 0 && !monthEntriesFetching && !monthActivitiesFetching) {
      setIsMonthTransitioning(false);
    }
  }, [monthFetchCount, monthEntriesFetching, monthActivitiesFetching]);

  /* ═══════════════════════════════════════════════════
     Render
     ═══════════════════════════════════════════════════ */

  return (
    <PortalLayout>
      <div className="space-y-6">
        {/* ─────────── HERO (header + stat cards + alerts) ─────────── */}
        <section className="relative overflow-hidden rounded-[26px] border border-[#d4dfdb] dark:border-border bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(247,251,249,0.95))] dark:bg-card p-5 shadow-[0_20px_44px_rgba(22,43,49,0.08)] dark:shadow-none md:p-6">
          <div className="pointer-events-none absolute -left-20 top-8 h-48 w-80 rounded-[999px] bg-[rgba(78,154,111,0.13)] blur-3xl" />
          <div className="pointer-events-none absolute right-0 top-0 h-48 w-72 rounded-bl-[160px] bg-[rgba(31,107,115,0.08)]" />
          <div className="relative space-y-6">
            <DashboardHero
              mode={isTiltakslederView ? "tiltaksleder" : isMiljoarbeiderView ? "miljoarbeider" : "default"}
              title={isTiltakslederView ? "Oppfølgingsoversikt" : isMiljoarbeiderView ? "Min arbeidsdag" : "Dashboard"}
              subtitle={isTiltakslederView ? "Status på tiltak, deltakere og dokumentasjon" : isMiljoarbeiderView ? "Oversikt over dine deltakere og oppfølging i dag" : undefined}
              timeRange={timeRange}
              onTimeRangeChange={handleTimeRangeChange}
              statsFetching={statsFetching}
              statsLoading={statsLoading}
              pendingApprovals={stats?.pendingApprovals ?? 0}
              lastUpdated={lastUpdated}
              navigate={navigate}
            />

            {isTiltakslederView && <DashboardStatusToday signals={statusSignals} />}

            {/* Alerts – max 2 visible, severity pills */}
            <DashboardAlerts alerts={alerts} />

            {/* "Neste beste handling" – contextual single CTA */}
            {!statsLoading && stats && (
              <DashboardNextAction
                mode={isTiltakslederView ? "tiltaksleder" : isMiljoarbeiderView ? "miljoarbeider" : "default"}
                pendingApprovals={myTasks.pendingApprovals}
                overdueItems={myTasks.overdueItems}
                myDrafts={myTasks.myDrafts}
                totalHours={stats.totalHours}
                navigate={navigate}
              />
            )}

            {/* Stat cards */}
            <div className="grid grid-cols-1 gap-4 md:gap-5 sm:grid-cols-2 xl:grid-cols-4">
              {statsLoading ? (
                <>
                  {[1, 2, 3, 4].map((i) => (
                    <StatCard
                      key={i}
                      statId={`skeleton-${i}`}
                      title=""
                      value=""
                      icon={null}
                      loading
                    />
                  ))}
                </>
              ) : stats ? (
                <>
                  {isTiltakslederView ? (
                    <>
                      <StatCard
                        statId="active-tiltak"
                        title="Aktive tiltak"
                        value={stats.casesThisWeek}
                        icon={<Briefcase className="h-5 w-5" />}
                        trend={{ value: stats.casesTrend, isPositive: stats.casesTrend >= 0 }}
                        trendDirection="goodUp"
                        variant="primary"
                        periodLabel={TIME_RANGE_LABELS[timeRange]}
                        description="Tiltak med aktivitet i perioden"
                        noTrendLabel="Samler data…"
                        emptyLabel="Ingen aktive tiltak"
                        onClick={() => navigate("/cases")}
                      />
                      <StatCard
                        statId="tiltak-risk"
                        title="Tiltak i risiko"
                        value={Math.max(0, Math.round(stats.pendingApprovals * 0.6))}
                        icon={<ShieldAlert className="h-5 w-5" />}
                        trend={{ value: stats.approvalsTrend, isPositive: stats.approvalsTrend <= 0 }}
                        trendDirection="goodDown"
                        variant="warning"
                        periodLabel={TIME_RANGE_LABELS[timeRange]}
                        description="Tiltak med manglende oppfølging eller rapport"
                        noTrendLabel="Ingen historikk ennå"
                        emptyLabel="Ingen tiltak i risiko"
                        onClick={() => navigate("/cases")}
                      />
                      <StatCard
                        statId="reports-missing"
                        title="Rapporter mangler/venter"
                        value={stats.pendingApprovals}
                        icon={<FileText className="h-5 w-5" />}
                        trend={{ value: stats.approvalsTrend, isPositive: stats.approvalsTrend <= 0 }}
                        trendDirection="goodDown"
                        variant="info"
                        periodLabel={TIME_RANGE_LABELS[timeRange]}
                        description="Rapporter som må oppdateres eller gjennomgås"
                        noTrendLabel="Samler data…"
                        emptyLabel="Ingen rapporter som mangler"
                        onClick={() => navigate("/cases")}
                      />
                      <StatCard
                        statId="participants-without-followup"
                        title="Deltakere uten oppfølging"
                        value={Math.max(0, Math.round(stats.pendingApprovals * 0.6))}
                        icon={<Users className="h-5 w-5" />}
                        trend={{ value: stats.usersTrend, isPositive: stats.usersTrend <= 0 }}
                        trendDirection="goodDown"
                        variant="danger"
                        periodLabel="Siste 7 dager"
                        description="Deltakere med svakt oppfølgingsmønster i perioden"
                        noTrendLabel="Ingen historikk ennå"
                        emptyLabel="Alle deltakere fulgt opp"
                        onClick={() => navigate("/cases")}
                      />
                    </>
                  ) : isMiljoarbeiderView ? (
                    <>
                      <StatCard
                        statId="worker-participants"
                        title="Deltakere i dag"
                        value={workerTodaySignals[0]?.value ?? 0}
                        icon={<Users className="h-5 w-5" />}
                        trend={{ value: stats.usersTrend, isPositive: stats.usersTrend >= 0 }}
                        trendDirection="goodUp"
                        variant="primary"
                        periodLabel={TIME_RANGE_LABELS[timeRange]}
                        description="Deltakere du følger opp i perioden"
                        noTrendLabel="Samler data…"
                        emptyLabel="Ingen deltakere i dag"
                        onClick={() => navigate("/cases")}
                      />
                      <StatCard
                        statId="worker-missing-notes"
                        title="Notater gjenstår"
                        value={workerTodaySignals[1]?.value ?? 0}
                        icon={<FileText className="h-5 w-5" />}
                        trend={{ value: stats.approvalsTrend, isPositive: stats.approvalsTrend <= 0 }}
                        trendDirection="goodDown"
                        variant="warning"
                        periodLabel={TIME_RANGE_LABELS[timeRange]}
                        description="Oppfølging som ikke er dokumentert ennå"
                        noTrendLabel="Ingen historikk ennå"
                        emptyLabel="Alt er dokumentert"
                        onClick={() => navigate("/case-reports")}
                      />
                      <StatCard
                        statId="worker-near-deadline"
                        title="Nær frist"
                        value={workerTodaySignals[2]?.value ?? 0}
                        icon={<AlertCircle className="h-5 w-5" />}
                        trend={{ value: stats.approvalsTrend, isPositive: stats.approvalsTrend <= 0 }}
                        trendDirection="goodDown"
                        variant="info"
                        periodLabel={TIME_RANGE_LABELS[timeRange]}
                        description="Oppfølging som bør gjøres snart"
                        noTrendLabel="Ingen historikk ennå"
                        emptyLabel="Ingen frister nå"
                        onClick={() => navigate("/cases")}
                      />
                      <StatCard
                        statId="worker-on-track"
                        title="I rute"
                        value={workerTodaySignals[3]?.value ?? 0}
                        icon={<Briefcase className="h-5 w-5" />}
                        trend={{ value: stats.casesTrend, isPositive: stats.casesTrend >= 0 }}
                        trendDirection="goodUp"
                        variant="success"
                        periodLabel={TIME_RANGE_LABELS[timeRange]}
                        description="Deltakere med oppfølging som planlagt"
                        noTrendLabel="Ingen historikk ennå"
                        emptyLabel="Ingen i rute ennå"
                        onClick={() => navigate("/cases")}
                      />
                    </>
                  ) : (
                    <>
                      <StatCard
                        statId="active-users"
                        title="Aktive brukere"
                        value={stats.activeUsers}
                        icon={<Users className="h-5 w-5" />}
                        trend={{ value: stats.usersTrend, isPositive: stats.usersTrend >= 0 }}
                        trendDirection="goodUp"
                        variant="primary"
                        periodLabel="Siste 7 dager"
                        description="Antall brukere som har vært aktive i perioden"
                        noTrendLabel="Samler data\u2026"
                        emptyLabel="Ingen brukere ennå"
                        onClick={() => navigate("/users")}
                      />
                      <StatCard
                        statId="pending-approvals"
                        title="Ventende godkjenninger"
                        value={stats.pendingApprovals}
                        icon={<AlertCircle className="h-5 w-5" />}
                        trend={{
                          value: stats.approvalsTrend,
                          isPositive: stats.approvalsTrend <= 0,
                        }}
                        trendDirection="goodDown"
                        variant="warning"
                        periodLabel="Siste 7 dager"
                        description="Timelister som venter på godkjenning"
                        noTrendLabel="Ingen historikk ennå"
                        emptyLabel="Ingen ventende"
                        onClick={() => navigate("/time-tracking")}
                      />
                      <StatCard
                        statId="total-hours"
                        title="Registrerte timer"
                        value={stats.totalHours}
                        unit="t"
                        icon={<Clock className="h-5 w-5" />}
                        trend={{ value: stats.hoursTrend, isPositive: stats.hoursTrend >= 0 }}
                        trendDirection="goodUp"
                        variant="success"
                        periodLabel={TIME_RANGE_LABELS[timeRange]}
                        description="Totalt registrerte timer i perioden"
                        noTrendLabel="Samler data\u2026"
                        emptyLabel="Ingen timer registrert"
                        onClick={() => navigate("/time-tracking")}
                      />
                      <StatCard
                        statId="cases-week"
                        title="Saker denne uken"
                        value={stats.casesThisWeek}
                        icon={<FileText className="h-5 w-5" />}
                        trend={{ value: stats.casesTrend, isPositive: stats.casesTrend >= 0 }}
                        trendDirection="goodUp"
                        variant="info"
                        periodLabel={TIME_RANGE_LABELS[timeRange]}
                        description="Antall saker opprettet denne uken"
                        noTrendLabel="Ingen historikk ennå"
                        emptyLabel="Ingen saker denne uken"
                        onClick={() => navigate("/cases")}
                      />
                    </>
                  )}
                </>
              ) : null}
            </div>
          </div>
        </section>

        {/* ─────────── ONBOARDING (empty dashboard for new customers) ─────────── */}
        {isNewDashboard && (
          <DashboardOnboarding
            hasUsers={(stats?.activeUsers ?? 0) > 1}
            hasCases={(stats?.casesThisWeek ?? 0) > 0}
            hasHours={(stats?.totalHours ?? 0) > 0}
            hasReports={false}
            navigate={navigate}
          />
        )}

        {isMiljoarbeiderView && (
          <DashboardWorkerMobile
            userId={user?.id || "default"}
            userName={user?.firstName || "Maria"}
            todaySignals={workerTodaySignals}
            participants={workerParticipants}
            navigate={navigate}
          />
        )}

        {/* ─────────── TASKS + GOALS (collapsible, below hero) ─────────── */}
        <section className={cn("grid gap-6 md:grid-cols-2", isMiljoarbeiderView && "hidden md:grid")}>
          {prefs.showTasks && (
            <DashboardTasks tasks={myTasks} navigate={navigate} mode={isTiltakslederView ? "tiltaksleder" : "default"} />
          )}
          {prefs.showGoals && <DashboardGoals stats={stats} mode={isTiltakslederView ? "tiltaksleder" : "default"} />}
        </section>

        {isTiltakslederView && (
          <DashboardRiskParticipants participants={riskParticipants} navigate={navigate} />
        )}

        {/* ─────────── Intersection sentinel for deferred analytics queries ─────────── */}
        <div ref={analyticsSentinelRef} className="h-0 w-0" aria-hidden />

        {/* ─────────── ANALYTICS + ACTIVITY (two-column) ─────────── */}
        <section className={cn("grid gap-6 xl:grid-cols-[1.75fr,1fr]", isMiljoarbeiderView && "hidden md:grid")}>
          <DashboardAnalytics
            mode={isTiltakslederView ? "tiltaksleder" : "default"}
            hoursData={hoursData}
            chartLoading={chartLoading && analyticsVisible}
            hoursTimeLabel={TIME_RANGE_LABELS[timeRange]}
            heatmapData={calendarHeatmapData}
            monthEntries={monthEntries}
            calendarActivities={calendarActivities}
            showHeatmapSkeleton={showHeatmapSkeleton}
            isHeatmapRefreshing={isHeatmapRefreshing}
            selectedCalendarDate={selectedCalendarDate}
            onDateSelect={setSelectedCalendarDate}
            currentMonth={calendarMonth}
            onMonthChange={handleCalendarMonthChange}
            monthDirection={monthDirection}
          />

          {/* Merged activity module: "Mine siste" + "Teamets aktivitet" */}
          <DashboardActivity
            mode={isTiltakslederView ? "tiltaksleder" : "default"}
            recentItems={recentItems}
            activityItems={activityItems}
            activitiesLoading={activitiesLoading}
            currentUserId={user?.id}
            navigate={navigate}
          />
        </section>
      </div>
    </PortalLayout>
  );
}
