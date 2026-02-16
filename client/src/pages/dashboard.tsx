import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useIsFetching, useQuery } from "@tanstack/react-query";
import { Users, Clock, FileText, Calendar, CalendarDays, CalendarRange, AlertCircle } from "lucide-react";
import { endOfMonth, format, getDate, getDaysInMonth, isSameMonth, isValid, parseISO, setDate, startOfMonth } from "date-fns";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { PortalLayout } from "@/components/portal/portal-layout";
import { StatCard } from "@/components/portal/stat-card";
import { ActivityFeed } from "@/components/portal/activity-feed";
import { HoursChart } from "@/components/portal/hours-chart";
import { CalendarHeatmap } from "@/components/portal/calendar-heatmap";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { Activity, TimeEntry } from "@shared/schema";

type TimeRange = "today" | "week" | "month";

const DEFAULT_HOURS_DATA = [
  { day: "Man", hours: 0 },
  { day: "Tir", hours: 0 },
  { day: "Ons", hours: 0 },
  { day: "Tor", hours: 0 },
  { day: "Fre", hours: 0 },
  { day: "Lor", hours: 0 },
  { day: "Son", hours: 0 },
];

export default function DashboardPage() {
  const reduceMotion = useReducedMotion();
  const [timeRange, setTimeRange] = useState<TimeRange>("week");
  const [isRangeTransitioning, setIsRangeTransitioning] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string>(() => format(new Date(), "yyyy-MM-dd"));
  const [monthDirection, setMonthDirection] = useState<number>(0);
  const [isMonthTransitioning, setIsMonthTransitioning] = useState(false);

  const monthRange = useMemo(
    () => ({
      startDate: format(startOfMonth(calendarMonth), "yyyy-MM-dd"),
      endDate: format(endOfMonth(calendarMonth), "yyyy-MM-dd"),
    }),
    [calendarMonth],
  );
  const monthActivityRange = useMemo(
    () => ({ ...monthRange, limit: "800" }),
    [monthRange],
  );
  
  const { data: stats, isLoading: statsLoading, isFetching: statsFetching } = useQuery<{
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

  const { data: activities = [], isLoading: activitiesLoading } = useQuery<(Activity & { userName: string })[]>({
    queryKey: ["/api/activities", { limit: "10" }],
    staleTime: 20_000,
    placeholderData: keepPreviousData,
  });

  const { data: monthEntries = [], isLoading: monthEntriesLoading, isFetching: monthEntriesFetching } = useQuery<TimeEntry[]>({
    queryKey: ["/api/time-entries", monthRange],
    staleTime: 20_000,
    gcTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });

  const { data: monthActivities = [], isLoading: monthActivitiesLoading, isFetching: monthActivitiesFetching } = useQuery<(Activity & { userName: string })[]>({
    queryKey: ["/api/activities", monthActivityRange],
    staleTime: 20_000,
    gcTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });

  const { data: chartData, isLoading: chartLoading } = useQuery<{
    hoursPerDay: { day: string; hours: number }[];
    heatmapData: { date: string; hours: number }[];
  }>({
    queryKey: ["/api/chart-data"],
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });

  const activityItems = useMemo(() => {
    const actionTypeMap: Record<string, "stamp" | "approval" | "report_submitted" | "user_added"> = {
      time_approved: "approval",
      time_logged: "stamp",
      user_invited: "user_added",
      case_completed: "report_submitted",
    };

    return activities.map((activity) => ({
      id: activity.id,
      type: actionTypeMap[activity.action] || "stamp",
      user: activity.userName || "Ukjent bruker",
      message: activity.description,
      timestamp: activity.timestamp,
    }));
  }, [activities]);

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

  const timeRangeButtons: { value: TimeRange; label: string; icon: typeof Calendar }[] = [
    { value: "today", label: "I dag", icon: Calendar },
    { value: "week", label: "Denne uken", icon: CalendarDays },
    { value: "month", label: "Denne måneden", icon: CalendarRange },
  ];

  const monthEntriesFetchCount = useIsFetching({ queryKey: ["/api/time-entries", monthRange] });
  const monthActivitiesFetchCount = useIsFetching({ queryKey: ["/api/activities", monthActivityRange] });
  const monthFetchCount = monthEntriesFetchCount + monthActivitiesFetchCount;

  const handleTimeRangeChange = (nextRange: TimeRange) => {
    if (nextRange === timeRange || isRangeTransitioning) return;
    setIsRangeTransitioning(true);
    setTimeRange(nextRange);
  };

  const handleCalendarMonthChange = (nextMonth: Date) => {
    const normalizedMonth = startOfMonth(nextMonth);
    const currentMonthStart = startOfMonth(calendarMonth);
    const direction = normalizedMonth.getTime() > currentMonthStart.getTime()
      ? 1
      : normalizedMonth.getTime() < currentMonthStart.getTime()
        ? -1
        : 0;

    if ((isMonthTransitioning || monthFetchCount > 0) && direction !== 0) {
      return;
    }

    if (direction !== 0) {
      setIsMonthTransitioning(true);
    }

    setMonthDirection(direction);
    setCalendarMonth(normalizedMonth);
    setSelectedCalendarDate((previous) => {
      const parsedPrevious = parseISO(previous);
      if (isValid(parsedPrevious)) {
        const preferredDay = getDate(parsedPrevious);
        const nextDate = setDate(normalizedMonth, Math.min(preferredDay, getDaysInMonth(normalizedMonth)));
        return format(nextDate, "yyyy-MM-dd");
      }
      const now = new Date();
      return isSameMonth(now, normalizedMonth)
        ? format(now, "yyyy-MM-dd")
        : format(normalizedMonth, "yyyy-MM-dd");
    });
  };

  useEffect(() => {
    if (!monthEntriesFetching && !monthActivitiesFetching) {
      setIsMonthTransitioning(false);
    }
  }, [monthEntriesFetching, monthActivitiesFetching]);

  useEffect(() => {
    if (monthFetchCount === 0) {
      setIsMonthTransitioning(false);
    }
  }, [monthFetchCount]);

  useEffect(() => {
    if (!statsFetching) {
      const timeout = window.setTimeout(() => {
        setIsRangeTransitioning(false);
      }, reduceMotion ? 0 : 120);
      return () => window.clearTimeout(timeout);
    }
  }, [statsFetching, reduceMotion]);

  const showHeatmapSkeleton = (monthEntriesLoading || monthActivitiesLoading)
    && calendarHeatmapData.length === 0
    && calendarActivities.length === 0;
  const isHeatmapRefreshing = monthEntriesFetching || monthActivitiesFetching || monthFetchCount > 0 || isMonthTransitioning;

  return (
    <PortalLayout>
      <div className="space-y-6">
        <section className="relative overflow-hidden rounded-[26px] border border-[#d4dfdb] bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(247,251,249,0.95))] p-5 shadow-[0_20px_44px_rgba(22,43,49,0.08)] md:p-6">
          <div className="pointer-events-none absolute -left-20 top-8 h-48 w-80 rounded-[999px] bg-[rgba(78,154,111,0.13)] blur-3xl" />
          <div className="pointer-events-none absolute right-0 top-0 h-48 w-72 rounded-bl-[160px] bg-[rgba(31,107,115,0.08)]" />
          <div className="relative space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-[#153c46] md:text-4xl" data-testid="dashboard-title">
                  Dashboard
                </h1>
                <p className="mt-1 text-[#4e646b]">Oversikt over selskapets aktivitet</p>
              </div>

              <div
                className="relative inline-flex w-fit gap-1 rounded-xl border border-[#d8e4e0] bg-[#edf3f1] p-1"
                data-testid="time-range-selector"
              >
                {timeRangeButtons.map((btn) => {
                  const Icon = btn.icon;
                  const selected = timeRange === btn.value;
                  return (
                    <button
                      type="button"
                      key={btn.value}
                      onClick={() => handleTimeRangeChange(btn.value)}
                      disabled={isRangeTransitioning && !selected}
                      className={cn(
                        "relative z-10 inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg border border-transparent px-3.5 text-xs font-medium transition-[color,transform] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F6B73] focus-visible:ring-offset-2 focus-visible:ring-offset-[#edf3f1] motion-reduce:transition-none",
                        selected
                          ? "text-white -translate-y-[1px]"
                          : "text-[#4e646b] hover:text-[#153c46]",
                        isRangeTransitioning && !selected && "cursor-not-allowed opacity-70",
                      )}
                      data-testid={`time-range-${btn.value}`}
                    >
                      {selected ? (
                        <motion.span
                          layoutId="dashboard-time-range-active-pill"
                          className="absolute inset-0 transform-gpu rounded-lg border border-[#195c63] bg-[#1F6B73] shadow-[0_8px_18px_rgba(21,92,99,0.26)]"
                          transition={
                            reduceMotion
                              ? { duration: 0 }
                              : { type: "spring", stiffness: 260, damping: 30, mass: 0.75 }
                          }
                        />
                      ) : null}
                      <Icon className="h-4 w-4" />
                      <span className="relative hidden sm:inline">{btn.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <AnimatePresence initial={false} mode="wait">
              {statsFetching && !statsLoading ? (
                <motion.div
                  key={`stats-fetching-${timeRange}`}
                  initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -4 }}
                  animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                  exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -4 }}
                  transition={reduceMotion ? { duration: 0 } : { duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                  className="inline-flex items-center gap-2 rounded-full border border-[#cde0d9] bg-white/85 px-3 py-1 text-xs font-medium text-[#2f555e]"
                >
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#1F6B73]" />
                  Oppdaterer tall for valgt periode
                </motion.div>
              ) : null}
            </AnimatePresence>

            <div className="grid grid-cols-1 gap-4 md:gap-5 sm:grid-cols-2 xl:grid-cols-4">
              {statsLoading ? (
                <>
                  {[1, 2, 3, 4].map(i => (
                    <Card key={i} className="rounded-2xl border-[#d8e4e0] bg-white/90">
                      <CardContent className="p-6">
                        <Skeleton className="mb-4 h-4 w-24" />
                        <Skeleton className="mb-2 h-8 w-16" />
                        <Skeleton className="h-3 w-20" />
                      </CardContent>
                    </Card>
                  ))}
                </>
              ) : stats ? (
                <>
                  <StatCard
                    title="Aktive brukere"
                    value={stats.activeUsers}
                    icon={<Users className="h-5 w-5" />}
                    trend={{ value: stats.usersTrend, isPositive: stats.usersTrend >= 0 }}
                    data-testid="stat-active-users"
                  />
                  <StatCard
                    title="Ventende godkjenninger"
                    value={stats.pendingApprovals}
                    icon={<AlertCircle className="h-5 w-5" />}
                    trend={{ value: stats.approvalsTrend, isPositive: stats.approvalsTrend <= 0 }}
                    data-testid="stat-pending-approvals"
                  />
                  <StatCard
                    title="Registrerte timer"
                    value={`${stats.totalHours.toFixed(1)}t`}
                    icon={<Clock className="h-5 w-5" />}
                    trend={{ value: stats.hoursTrend, isPositive: stats.hoursTrend >= 0 }}
                    data-testid="stat-total-hours"
                  />
                  <StatCard
                    title="Saker denne uken"
                    value={stats.casesThisWeek}
                    icon={<FileText className="h-5 w-5" />}
                    trend={{ value: stats.casesTrend, isPositive: stats.casesTrend >= 0 }}
                    data-testid="stat-cases"
                  />
                </>
              ) : null}
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.75fr,1fr]">
          <div className="space-y-6">
            {chartLoading ? (
              <Card className="rounded-2xl border-[#d8e4e0] bg-white/95">
                <CardHeader className="pb-2">
                  <CardTitle className="text-2xl text-[#153c46]">Timer per dag</CardTitle>
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-64 w-full" />
                </CardContent>
              </Card>
            ) : (
              <HoursChart data={hoursData} title="Timer per dag" />
            )}

            {showHeatmapSkeleton ? (
              <Card className="rounded-2xl border-[#d8e4e0] bg-white/95">
                <CardHeader className="pb-2">
                  <CardTitle className="text-2xl text-[#153c46]">Aktivitetsoversikt</CardTitle>
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-32 w-full" />
                </CardContent>
              </Card>
            ) : (
              <CalendarHeatmap
                data={calendarHeatmapData}
                entries={monthEntries}
                activities={calendarActivities}
                isRefreshing={isHeatmapRefreshing}
                selectedDate={selectedCalendarDate}
                onDateSelect={setSelectedCalendarDate}
                currentMonth={calendarMonth}
                onMonthChange={handleCalendarMonthChange}
                monthDirection={monthDirection}
                title="Aktivitetsoversikt"
              />
            )}
          </div>

          <div>
            {activitiesLoading ? (
              <Card className="rounded-2xl border-[#d8e4e0] bg-white/95">
                <CardHeader className="pb-2">
                  <CardTitle className="text-2xl text-[#153c46]">Siste aktivitet</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="flex gap-3">
                        <Skeleton className="h-8 w-8 rounded-full" />
                        <div className="flex-1">
                          <Skeleton className="mb-2 h-4 w-full" />
                          <Skeleton className="h-3 w-16" />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <ActivityFeed activities={activityItems} title="Siste aktivitet" />
            )}
          </div>
        </section>
      </div>
    </PortalLayout>
  );
}
