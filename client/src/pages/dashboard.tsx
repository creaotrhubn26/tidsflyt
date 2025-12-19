import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users, Clock, FileText, Calendar, CalendarDays, CalendarRange, AlertCircle } from "lucide-react";
import { PortalLayout } from "@/components/portal/portal-layout";
import { StatCard } from "@/components/portal/stat-card";
import { ActivityFeed } from "@/components/portal/activity-feed";
import { HoursChart } from "@/components/portal/hours-chart";
import { CalendarHeatmap } from "@/components/portal/calendar-heatmap";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { Activity } from "@shared/schema";

type TimeRange = "today" | "week" | "month";

export default function DashboardPage() {
  const [timeRange, setTimeRange] = useState<TimeRange>("week");
  
  const { data: stats, isLoading: statsLoading } = useQuery<{
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
    staleTime: 0,
  });

  const { data: activities = [], isLoading: activitiesLoading } = useQuery<(Activity & { userName: string })[]>({
    queryKey: ["/api/activities", { limit: "10" }],
  });

  const { data: chartData, isLoading: chartLoading } = useQuery<{
    hoursPerDay: { day: string; hours: number }[];
    heatmapData: { date: string; hours: number }[];
  }>({
    queryKey: ["/api/chart-data"],
  });

  const activityItems = activities.map(a => {
    const actionTypeMap: Record<string, "stamp" | "approval" | "report_submitted" | "user_added"> = {
      time_approved: "approval",
      time_logged: "stamp",
      user_invited: "user_added",
      case_completed: "report_submitted",
    };
    
    return {
      id: a.id,
      type: actionTypeMap[a.action] || "stamp",
      user: a.userName || "Ukjent bruker",
      message: a.description,
      timestamp: a.timestamp,
    };
  });

  const hoursData = chartData?.hoursPerDay || [
    { day: "Man", hours: 0 },
    { day: "Tir", hours: 0 },
    { day: "Ons", hours: 0 },
    { day: "Tor", hours: 0 },
    { day: "Fre", hours: 0 },
    { day: "Lor", hours: 0 },
    { day: "Son", hours: 0 },
  ];

  const heatmapData = chartData?.heatmapData || [];

  const timeRangeButtons: { value: TimeRange; label: string; icon: typeof Calendar }[] = [
    { value: "today", label: "I dag", icon: Calendar },
    { value: "week", label: "Denne uken", icon: CalendarDays },
    { value: "month", label: "Denne maneden", icon: CalendarRange },
  ];

  return (
    <PortalLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold" data-testid="dashboard-title">Dashboard</h1>
            <p className="text-muted-foreground mt-1">Oversikt over selskapets aktivitet</p>
          </div>
          
          <div className="flex gap-1 p-1 bg-muted rounded-lg" data-testid="time-range-selector">
            {timeRangeButtons.map((btn) => {
              const Icon = btn.icon;
              return (
                <Button
                  key={btn.value}
                  variant={timeRange === btn.value ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setTimeRange(btn.value)}
                  className={cn(
                    "gap-1.5",
                    timeRange !== btn.value && "text-muted-foreground"
                  )}
                  data-testid={`time-range-${btn.value}`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{btn.label}</span>
                </Button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-4 md:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {statsLoading ? (
            <>
              {[1, 2, 3, 4].map(i => (
                <Card key={i}>
                  <CardContent className="p-6">
                    <Skeleton className="h-4 w-24 mb-4" />
                    <Skeleton className="h-8 w-16 mb-2" />
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

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Timer per dag</CardTitle>
              </CardHeader>
              <CardContent>
                {chartLoading ? (
                  <Skeleton className="h-64 w-full" />
                ) : (
                  <HoursChart data={hoursData} />
                )}
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Aktivitetsoversikt</CardTitle>
              </CardHeader>
              <CardContent>
                {chartLoading ? (
                  <Skeleton className="h-32 w-full" />
                ) : (
                  <CalendarHeatmap data={heatmapData} />
                )}
              </CardContent>
            </Card>
          </div>
          
          <div>
            <Card className="h-fit">
              <CardHeader>
                <CardTitle>Siste aktivitet</CardTitle>
              </CardHeader>
              <CardContent>
                {activitiesLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="flex gap-3">
                        <Skeleton className="h-8 w-8 rounded-full" />
                        <div className="flex-1">
                          <Skeleton className="h-4 w-full mb-2" />
                          <Skeleton className="h-3 w-16" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <ActivityFeed activities={activityItems} />
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </PortalLayout>
  );
}
