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
          <BarChart3 className="h-5 w-5 text-primary" />
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Analyse
            </h2>
            <p className="text-xs text-muted-foreground">
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

      {/* Chart + Heatmap side-by-side on xl */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Hours Chart */}
        {chartLoading ? (
          <Card className="rounded-2xl border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg text-foreground">
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
          <Card className="rounded-2xl border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg text-foreground">
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
    </div>
  );
}
