import { useMemo } from "react";
import { format, startOfISOWeek, addDays, isToday, isFuture, getISOWeek } from "date-fns";
import { nb } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface DayData {
  day: string; // "Man", "Tir", "Ons", "Tor", "Fre", "Lor", "Son"
  hours: number;
}

interface DashboardWeekStripProps {
  hoursData: DayData[];
  loading?: boolean;
  weeklyTarget?: number; // default 37.5
}

const DAY_LABELS = ["Man", "Tir", "Ons", "Tor", "Fre", "Lor", "Son"] as const;
const DAY_SHORT_NOB = ["Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"] as const;

export function DashboardWeekStrip({
  hoursData,
  loading,
  weeklyTarget = 37.5,
}: DashboardWeekStripProps) {
  const weekDays = useMemo(() => {
    const weekStart = startOfISOWeek(new Date());
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(weekStart, i);
      const label = DAY_LABELS[i];
      const dayData = hoursData.find((d) => d.day === label);
      const today = isToday(date);
      const future = isFuture(date) && !today;
      return {
        date,
        displayLabel: DAY_SHORT_NOB[i],
        hours: dayData?.hours ?? 0,
        isToday: today,
        isFuture: future,
        dayNum: format(date, "d"),
      };
    });
  }, [hoursData]);

  const maxHours = Math.max(...weekDays.map((d) => d.hours), 1);
  const totalHours = weekDays.reduce((sum, d) => sum + d.hours, 0);
  const progressPct = Math.min(100, Math.round((totalHours / weeklyTarget) * 100));
  const weekNumber = getISOWeek(new Date());

  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3.5">
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Uke {weekNumber}
          </span>
          <span className="text-xs text-muted-foreground/60">·</span>
          <span className="text-xs text-muted-foreground">
            {totalHours.toFixed(1)}t registrert
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Mini progress bar */}
          <div className="hidden sm:flex items-center gap-1.5">
            <div className="h-1.5 w-24 rounded-full bg-muted overflow-hidden">
              {/* eslint-disable-next-line react/forbid-dom-props */}
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-700",
                  progressPct >= 100
                    ? "bg-emerald-500"
                    : progressPct >= 60
                      ? "bg-primary"
                      : progressPct >= 30
                        ? "bg-amber-500"
                        : "bg-muted-foreground/40",
                )}
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span
              className={cn(
                "text-[10px] font-semibold tabular-nums",
                progressPct >= 100 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
              )}
            >
              {progressPct}%
            </span>
          </div>
          <span className="text-[10px] text-muted-foreground/50">
            /{weeklyTarget}t mål
          </span>
        </div>
      </div>

      {/* Day columns */}
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {weekDays.map((day) => (
          <div
            key={day.dayNum + day.displayLabel}
            className={cn(
              "flex flex-col items-center gap-1 rounded-lg px-1 py-2 transition-colors",
              day.isToday
                ? "bg-primary/10 ring-1 ring-inset ring-primary/25"
                : "bg-muted/30 hover:bg-muted/50",
            )}
          >
            {/* Day abbreviation */}
            <span
              className={cn(
                "text-[9px] sm:text-[10px] font-semibold uppercase leading-none",
                day.isToday ? "text-primary" : "text-muted-foreground/70",
              )}
            >
              {day.displayLabel}
            </span>

            {/* Date number */}
            <span
              className={cn(
                "text-xs sm:text-sm font-bold leading-none",
                day.isToday
                  ? "text-primary"
                  : day.isFuture
                    ? "text-muted-foreground/40"
                    : "text-foreground",
              )}
            >
              {day.dayNum}
            </span>

            {/* Mini bar chart column */}
            <div className="w-full flex flex-col justify-end h-8">
              {loading ? (
                <Skeleton className="h-2 w-full rounded-full" />
              ) : (
                // eslint-disable-next-line react/forbid-dom-props
                <div
                  className={cn(
                    "w-full rounded-t-sm mt-auto transition-all duration-500",
                    day.isToday
                      ? "bg-primary"
                      : day.isFuture
                        ? "bg-transparent"
                        : day.hours >= 7
                          ? "bg-emerald-500/70 dark:bg-emerald-400/60"
                          : "bg-primary/35",
                  )}
                  style={{
                    height: day.isFuture
                      ? "0px"
                      : day.hours > 0
                        ? `${Math.max(6, Math.round((day.hours / maxHours) * 32))}px`
                        : "3px",
                  }}
                />
              )}
            </div>

            {/* Hours label */}
            {loading ? (
              <Skeleton className="h-2.5 w-5 rounded" />
            ) : (
              <span
                className={cn(
                  "text-[9px] leading-none tabular-nums",
                  day.isToday
                    ? "font-semibold text-primary"
                    : day.isFuture
                      ? "text-muted-foreground/25"
                      : day.hours > 0
                        ? "text-muted-foreground"
                        : "text-muted-foreground/40",
                )}
              >
                {day.isFuture ? "–" : day.hours > 0 ? `${day.hours}t` : "0t"}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
