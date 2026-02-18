import { BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { HoursChart } from "@/components/portal/hours-chart";
import { CalendarHeatmap } from "@/components/portal/calendar-heatmap";
import type { TimeEntry } from "@shared/schema";

interface CalendarActivity {
  id: string;
  user: string;
  message: string;
  timestamp: string;
  type: string;
}

interface DashboardAnalyticsProps {
  mode?: "default" | "tiltaksleder";
  /* Hours chart */
  hoursData: { day: string; hours: number }[];
  chartLoading: boolean;
  hoursTimeLabel?: string;
  /* Calendar heatmap */
  heatmapData: { date: string; hours: number }[];
  monthEntries: TimeEntry[];
  calendarActivities: CalendarActivity[];
  showHeatmapSkeleton: boolean;
  isHeatmapRefreshing: boolean;
  selectedCalendarDate: string;
  onDateSelect: (date: string) => void;
  currentMonth: Date;
  onMonthChange: (month: Date) => void;
  monthDirection: number;
}

export function DashboardAnalytics({
  mode = "default",
  hoursData,
  chartLoading,
  hoursTimeLabel,
  heatmapData,
  monthEntries,
  calendarActivities,
  showHeatmapSkeleton,
  isHeatmapRefreshing,
  selectedCalendarDate,
  onDateSelect,
  currentMonth,
  onMonthChange,
  monthDirection,
}: DashboardAnalyticsProps) {
  const isTiltaksleder = mode === "tiltaksleder";

  return (
    <div className="space-y-6">
      {/* Analytics section header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-[#1F6B73]" />
          <div>
            <h2 className="text-lg font-semibold text-[#153c46] dark:text-foreground">
              Analyse
            </h2>
            <p className="text-xs text-[#5f7075] dark:text-muted-foreground">
              {isTiltaksleder ? "Oppfølging og aktivitet i perioden" : "Timer og aktivitet i perioden"}
            </p>
          </div>
        </div>
        {hoursTimeLabel && (
          <Badge
            variant="outline"
            className="text-[10px] font-medium text-muted-foreground"
          >
            {hoursTimeLabel}
          </Badge>
        )}
      </div>

      {/* Hours Chart */}
      {chartLoading ? (
        <Card className="rounded-2xl border-[#d8e4e0] dark:border-border bg-white/95 dark:bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg text-[#153c46] dark:text-foreground">
              {isTiltaksleder ? "Oppfølgingstid per dag" : "Timer per dag"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      ) : (
        <HoursChart data={hoursData} title={isTiltaksleder ? "Oppfølgingstid per dag" : "Timer per dag"} />
      )}

      {/* Calendar Heatmap */}
      {showHeatmapSkeleton ? (
        <Card className="rounded-2xl border-[#d8e4e0] dark:border-border bg-white/95 dark:bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg text-[#153c46] dark:text-foreground">
              {isTiltaksleder ? "Oppfølgingsmønster" : "Aktivitetsoversikt"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      ) : (
        <CalendarHeatmap
          data={heatmapData}
          entries={monthEntries}
          activities={calendarActivities}
          isRefreshing={isHeatmapRefreshing}
          selectedDate={selectedCalendarDate}
          onDateSelect={onDateSelect}
          currentMonth={currentMonth}
          onMonthChange={onMonthChange}
          monthDirection={monthDirection}
          title={isTiltaksleder ? "Oppfølgingsmønster" : "Aktivitetsoversikt"}
        />
      )}
    </div>
  );
}
