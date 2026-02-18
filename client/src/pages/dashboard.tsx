import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useIsFetching, useQuery } from "@tanstack/react-query";
import { 
  Users, 
  Clock, 
  FileText, 
  Calendar, 
  CalendarDays, 
  CalendarRange, 
  AlertCircle,
  Plus,
  CheckCircle,
  Target,
  Bell,
  Briefcase,
  History,
  ExternalLink,
  AlertTriangle,
  Info,
  ChevronRight,
} from "lucide-react";
import { endOfMonth, format, getDate, getDaysInMonth, isSameMonth, isValid, parseISO, setDate, startOfMonth } from "date-fns";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { PortalLayout } from "@/components/portal/portal-layout";
import { StatCard } from "@/components/portal/stat-card";
import { ActivityFeed } from "@/components/portal/activity-feed";
import { HoursChart } from "@/components/portal/hours-chart";
import { CalendarHeatmap } from "@/components/portal/calendar-heatmap";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
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
  const [, navigate] = useLocation();
  const [timeRange, setTimeRange] = useState<TimeRange>("week");

  const [calendarMonth, setCalendarMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string>(() => format(new Date(), "yyyy-MM-dd"));
  const [monthDirection, setMonthDirection] = useState<number>(0);
  const [isMonthTransitioning, setIsMonthTransitioning] = useState(false);
  const [activityFilter, setActivityFilter] = useState<"all" | "mine" | "team">("all");

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

  // Derive task counts from real data where available
  const myTasks = useMemo(() => ({
    pendingApprovals: stats?.pendingApprovals || 0,
    myDrafts: 0,
    assignedCases: 0,
    overdueItems: 0,
  }), [stats]);

  const alerts = useMemo(() => {
    const items = [];
    if (stats && stats.pendingApprovals > 10) {
      items.push({
        id: 1,
        type: "warning" as const,
        title: `${stats.pendingApprovals} ventende godkjenninger`,
        description: "Høy arbeidsmengde oppdaget",
        action: () => navigate("/time-tracking"),
      });
    }
    if (stats && stats.totalHours < 20 && timeRange === "week") {
      items.push({
        id: 2,
        type: "info" as const,
        title: "Lav timeregistrering denne uken",
        description: `Kun ${stats.totalHours.toFixed(1)} timer registrert`,
        action: () => navigate("/time-tracking"),
      });
    }
    return items;
  }, [stats, timeRange, navigate]);

  const goals = useMemo(() => [
    {
      id: 1,
      title: "Månedlige timer",
      current: stats?.totalHours || 0,
      target: 160,
      unit: "timer",
      icon: Clock,
      color: "blue",
    },
    {
      id: 2,
      title: "Godkjenningsrate",
      current: stats?.pendingApprovals ? 100 - (stats.pendingApprovals / (stats.totalHours / 8) * 100) : 95,
      target: 100,
      unit: "%",
      icon: CheckCircle,
      color: "green",
    },
    {
      id: 3,
      title: "Aktive saker",
      current: stats?.casesThisWeek || 0,
      target: 15,
      unit: "saker",
      icon: Briefcase,
      color: "purple",
    },
  ], [stats]);

  const recentItems = useMemo(() => [
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
  ], []);

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
    if (nextRange === timeRange) return;
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

    if (isMonthTransitioning && direction !== 0) {
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
    if (monthFetchCount === 0 && !monthEntriesFetching && !monthActivitiesFetching) {
      setIsMonthTransitioning(false);
    }
  }, [monthFetchCount, monthEntriesFetching, monthActivitiesFetching]);

  const showHeatmapSkeleton = (monthEntriesLoading || monthActivitiesLoading)
    && calendarHeatmapData.length === 0
    && calendarActivities.length === 0;
  const isHeatmapRefreshing = monthEntriesFetching || monthActivitiesFetching || monthFetchCount > 0 || isMonthTransitioning;

  return (
    <PortalLayout>
      <div className="space-y-6">
        <section className="relative overflow-hidden rounded-[26px] border border-[#d4dfdb] dark:border-border bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(247,251,249,0.95))] dark:bg-card p-5 shadow-[0_20px_44px_rgba(22,43,49,0.08)] dark:shadow-none md:p-6">
          <div className="pointer-events-none absolute -left-20 top-8 h-48 w-80 rounded-[999px] bg-[rgba(78,154,111,0.13)] blur-3xl" />
          <div className="pointer-events-none absolute right-0 top-0 h-48 w-72 rounded-bl-[160px] bg-[rgba(31,107,115,0.08)]" />
          <div className="relative space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-[#153c46] dark:text-foreground md:text-4xl" data-testid="dashboard-title">
                  Dashboard
                </h1>
                <p className="mt-1 text-[#4e646b] dark:text-muted-foreground">Oversikt over selskapets aktivitet</p>
              </div>

              <div className="flex flex-wrap gap-2">
                {/* Quick Actions */}
                <Button 
                  onClick={() => navigate("/time-tracking")}
                  className="gap-2 bg-gradient-to-r from-[#1F6B73] to-[#195c63] hover:from-[#195c63] hover:to-[#14494f] shadow-lg"
                >
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">Ny tidsregistrering</span>
                </Button>
                {stats && stats.pendingApprovals > 0 && (
                  <Button 
                    onClick={() => navigate("/time-tracking")}
                    variant="outline"
                    className="gap-2 border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-950/50"
                  >
                    <CheckCircle className="h-4 w-4" />
                    Godkjenn ({stats.pendingApprovals})
                  </Button>
                )}
                <Button 
                  onClick={() => navigate("/cases")}
                  variant="outline"
                  className="gap-2"
                >
                  <FileText className="h-4 w-4" />
                  <span className="hidden sm:inline">Rapporter</span>
                </Button>
              </div>
            </div>

            {/* Time Range Selector */}
            <div className="flex justify-end">
              <div
                className="relative inline-flex w-fit gap-1 rounded-xl border border-[#d8e4e0] dark:border-border bg-[#edf3f1] dark:bg-muted p-1"
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
                      className={cn(
                        "relative z-10 inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg border border-transparent px-3.5 text-xs font-medium transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F6B73] focus-visible:ring-offset-2 focus-visible:ring-offset-[#edf3f1] motion-reduce:transition-none",
                        selected
                          ? "text-white"
                          : "text-[#4e646b] dark:text-muted-foreground hover:text-[#153c46] dark:hover:text-foreground",
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
                  className="inline-flex items-center gap-2 rounded-full border border-[#cde0d9] dark:border-border bg-white/85 dark:bg-muted px-3 py-1 text-xs font-medium text-[#2f555e] dark:text-muted-foreground"
                >
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#1F6B73]" />
                  Oppdaterer tall for valgt periode
                </motion.div>
              ) : null}
            </AnimatePresence>

            {/* Alerts Section */}
            {alerts.length > 0 && (
              <div className="grid gap-3 md:grid-cols-2">
                {alerts.map((alert) => (
                  <Card 
                    key={alert.id}
                    className={cn(
                      "border-l-4 cursor-pointer transition-all hover:shadow-lg",
                      alert.type === "warning" && "border-l-orange-500 bg-orange-50/50 dark:bg-orange-950/30",
                      alert.type === "info" && "border-l-blue-500 bg-blue-50/50 dark:bg-blue-950/30"
                    )}
                    onClick={alert.action}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className={cn(
                          "p-2 rounded-lg",
                          alert.type === "warning" && "bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400",
                          alert.type === "info" && "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                        )}>
                          {alert.type === "warning" ? <AlertTriangle className="h-5 w-5" /> : <Info className="h-5 w-5" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-sm mb-1">{alert.title}</h4>
                          <p className="text-xs text-muted-foreground">{alert.description}</p>
                        </div>
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 md:gap-5 sm:grid-cols-2 xl:grid-cols-4">
              {statsLoading ? (
                <>
                  {[1, 2, 3, 4].map(i => (
                    <Card key={i} className="rounded-2xl border-[#d8e4e0] dark:border-border bg-white/90 dark:bg-card">
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
                  <div onClick={() => navigate("/users")} className="cursor-pointer transition-transform hover:scale-105">
                    <StatCard
                      title="Aktive brukere"
                      value={stats.activeUsers}
                      icon={<Users className="h-5 w-5" />}
                      trend={{ value: stats.usersTrend, isPositive: stats.usersTrend >= 0 }}
                      data-testid="stat-active-users"
                    />
                  </div>
                  <div onClick={() => navigate("/time-tracking")} className="cursor-pointer transition-transform hover:scale-105">
                    <StatCard
                      title="Ventende godkjenninger"
                      value={stats.pendingApprovals}
                      icon={<AlertCircle className="h-5 w-5" />}
                      trend={{ value: stats.approvalsTrend, isPositive: stats.approvalsTrend <= 0 }}
                      data-testid="stat-pending-approvals"
                    />
                  </div>
                  <div onClick={() => navigate("/time-tracking")} className="cursor-pointer transition-transform hover:scale-105">
                    <StatCard
                      title="Registrerte timer"
                      value={`${stats.totalHours.toFixed(1)}t`}
                      icon={<Clock className="h-5 w-5" />}
                      trend={{ value: stats.hoursTrend, isPositive: stats.hoursTrend >= 0 }}
                      data-testid="stat-total-hours"
                    />
                  </div>
                  <div onClick={() => navigate("/cases")} className="cursor-pointer transition-transform hover:scale-105">
                    <StatCard
                      title="Saker denne uken"
                      value={stats.casesThisWeek}
                      icon={<FileText className="h-5 w-5" />}
                      trend={{ value: stats.casesTrend, isPositive: stats.casesTrend >= 0 }}
                      data-testid="stat-cases"
                    />
                  </div>
                </>
              ) : null}
            </div>

            {/* My Tasks Widget */}
            <Card className="bg-gradient-to-br from-white to-slate-50/50 dark:from-card dark:to-card border-slate-200/60 dark:border-border shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <CheckCircle className="h-5 w-5 text-[#1F6B73]" />
                  Mine oppgaver
                </CardTitle>
                <CardDescription>Ting som krever din oppmerksomhet</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Button
                    variant="outline"
                    className="h-auto flex-col items-start gap-2 p-4 hover:bg-accent hover:shadow-md transition-all"
                    onClick={() => navigate("/time-tracking")}
                  >
                    <div className="flex w-full items-center justify-between">
                      <span className="text-2xl font-bold text-[#1F6B73]">{myTasks.pendingApprovals}</span>
                      <AlertCircle className="h-5 w-5 text-orange-500" />
                    </div>
                    <div className="text-left">
                      <div className="font-medium text-sm">Godkjenninger</div>
                      <div className="text-xs text-muted-foreground">Venter på deg</div>
                    </div>
                  </Button>

                  <Button
                    variant="outline"
                    className="h-auto flex-col items-start gap-2 p-4 hover:bg-accent hover:shadow-md transition-all"
                    onClick={() => navigate("/cases")}
                  >
                    <div className="flex w-full items-center justify-between">
                      <span className="text-2xl font-bold text-[#1F6B73]">{myTasks.myDrafts}</span>
                      <FileText className="h-5 w-5 text-slate-500" />
                    </div>
                    <div className="text-left">
                      <div className="font-medium text-sm">Utkast</div>
                      <div className="text-xs text-muted-foreground">Uferdige rapporter</div>
                    </div>
                  </Button>

                  <Button
                    variant="outline"
                    className="h-auto flex-col items-start gap-2 p-4 hover:bg-accent hover:shadow-md transition-all"
                    onClick={() => navigate("/cases")}
                  >
                    <div className="flex w-full items-center justify-between">
                      <span className="text-2xl font-bold text-[#1F6B73]">{myTasks.assignedCases}</span>
                      <Briefcase className="h-5 w-5 text-blue-500" />
                    </div>
                    <div className="text-left">
                      <div className="font-medium text-sm">Tildelte saker</div>
                      <div className="text-xs text-muted-foreground">Aktive</div>
                    </div>
                  </Button>

                  <Button
                    variant="outline"
                    className="h-auto flex-col items-start gap-2 p-4 hover:bg-accent hover:shadow-md transition-all border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/30"
                    onClick={() => navigate("/time-tracking")}
                  >
                    <div className="flex w-full items-center justify-between">
                      <span className="text-2xl font-bold text-red-600">{myTasks.overdueItems}</span>
                      <AlertTriangle className="h-5 w-5 text-red-500" />
                    </div>
                    <div className="text-left">
                      <div className="font-medium text-sm">Forfalt</div>
                      <div className="text-xs text-muted-foreground">Krever handling</div>
                    </div>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Goals Tracking */}
            <Card className="bg-gradient-to-br from-white to-slate-50/50 dark:from-card dark:to-card border-slate-200/60 dark:border-border shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Target className="h-5 w-5 text-[#1F6B73]" />
                  Mål og fremdrift
                </CardTitle>
                <CardDescription>Spor fremdrift mot månedlige mål</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {goals.map((goal) => {
                    const Icon = goal.icon;
                    const percentage = Math.min((goal.current / goal.target) * 100, 100);
                    const colorClasses = {
                      blue: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40",
                      green: "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/40",
                      purple: "text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40",
                    };
                    
                    return (
                      <div key={goal.id} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className={cn("p-1.5 rounded-lg", colorClasses[goal.color as keyof typeof colorClasses])}>
                              <Icon className="h-4 w-4" />
                            </div>
                            <span className="text-sm font-medium">{goal.title}</span>
                          </div>
                          <span className="text-sm text-muted-foreground">
                            {goal.current.toFixed(goal.unit === "%" ? 0 : 1)} / {goal.target} {goal.unit}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Progress value={percentage} className="flex-1 h-2" />
                          <span className="text-xs font-medium text-muted-foreground w-12 text-right">
                            {percentage.toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.75fr,1fr]">
          <div className="space-y-6">
            {chartLoading ? (
              <Card className="rounded-2xl border-[#d8e4e0] dark:border-border bg-white/95 dark:bg-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-2xl text-[#153c46] dark:text-foreground">Timer per dag</CardTitle>
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-64 w-full" />
                </CardContent>
              </Card>
            ) : (
              <HoursChart data={hoursData} title="Timer per dag" />
            )}

            {showHeatmapSkeleton ? (
              <Card className="rounded-2xl border-[#d8e4e0] dark:border-border bg-white/95 dark:bg-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-2xl text-[#153c46] dark:text-foreground">Aktivitetsoversikt</CardTitle>
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

          <div className="space-y-6">
            {/* Recent Items */}
            <Card className="rounded-2xl border-[#d8e4e0] dark:border-border bg-white/95 dark:bg-card">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <History className="h-5 w-5 text-[#1F6B73]" />
                    Nylig aktivitet
                  </CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => navigate("/time-tracking")}>
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {recentItems.map((item) => {
                    const statusColors = {
                      draft: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300",
                      pending: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400",
                      approved: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400",
                    };
                    const icons = {
                      time: Clock,
                      report: FileText,
                      case: Briefcase,
                    };
                    const ItemIcon = icons[item.type];
                    
                    return (
                      <Button
                        key={item.id}
                        variant="ghost"
                        className="w-full justify-start h-auto p-3 hover:bg-accent"
                        onClick={() => {
                          if (item.type === "time") navigate("/time-tracking");
                          else navigate("/cases");
                        }}
                      >
                        <div className="flex items-start gap-3 w-full">
                          <div className="p-2 rounded-lg bg-slate-50 dark:bg-muted">
                            <ItemIcon className="h-4 w-4 text-slate-600 dark:text-muted-foreground" />
                          </div>
                          <div className="flex-1 text-left min-w-0">
                            <div className="text-sm font-medium truncate">{item.title}</div>
                            <div className="text-xs text-muted-foreground">
                              {format(item.timestamp, "HH:mm · dd MMM")}
                            </div>
                          </div>
                          <Badge variant="outline" className={cn("text-xs", statusColors[item.status])}>
                            {item.status === "draft" ? "Utkast" : item.status === "pending" ? "Venter" : "Godkjent"}
                          </Badge>
                        </div>
                      </Button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Activity Feed with Tabs */}
            {activitiesLoading ? (
              <Card className="rounded-2xl border-[#d8e4e0] dark:border-border bg-white/95 dark:bg-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-2xl text-[#153c46] dark:text-foreground">Siste aktivitet</CardTitle>
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
              <Card className="rounded-2xl border-[#d8e4e0] dark:border-border bg-white/95 dark:bg-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Bell className="h-5 w-5 text-[#1F6B73]" />
                    Aktivitetsfeed
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Tabs value={activityFilter} onValueChange={(v) => setActivityFilter(v as any)} className="w-full">
                    <TabsList className="grid w-full grid-cols-3 mb-4">
                      <TabsTrigger value="all">Alle</TabsTrigger>
                      <TabsTrigger value="mine">Mine</TabsTrigger>
                      <TabsTrigger value="team">Team</TabsTrigger>
                    </TabsList>
                    <TabsContent value="all" className="mt-0">
                      <ActivityFeed activities={activityItems} title="" />
                    </TabsContent>
                    <TabsContent value="mine" className="mt-0">
                      <ActivityFeed 
                        activities={activityItems.filter(a => a.user.includes("deg") || a.user.includes("Du"))} 
                        title="" 
                      />
                    </TabsContent>
                    <TabsContent value="team" className="mt-0">
                      <ActivityFeed 
                        activities={activityItems.filter(a => !a.user.includes("deg") && !a.user.includes("Du"))} 
                        title="" 
                      />
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            )}
          </div>
        </section>
      </div>
    </PortalLayout>
  );
}
