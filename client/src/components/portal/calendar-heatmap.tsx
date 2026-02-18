import { useMemo, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, addDays, parseISO, isValid, isSameMonth, isToday, getISOWeek } from "date-fns";
import { nb } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { AlertCircle, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Clock3, ExternalLink, FolderKanban, Plus, Workflow } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

type HeatmapData = {
  date: string;
  hours: number;
};

type HeatmapEntry = {
  id: string;
  date: string;
  description: string;
  hours: number;
  status: string;
  caseNumber?: string | null;
  createdAt: string;
};

type HeatmapActivity = {
  id: string;
  user?: string;
  message: string;
  timestamp: string;
  type?: string;
};

type CalendarMarker = {
  label: string;
  kind: "holiday" | "vacation";
};

interface CalendarHeatmapProps {
  data: HeatmapData[];
  entries?: HeatmapEntry[];
  activities?: HeatmapActivity[];
  isRefreshing?: boolean;
  monthDirection?: number;
  selectedDate: string;
  onDateSelect: (date: string) => void;
  currentMonth: Date;
  onMonthChange: (month: Date) => void;
  title?: string;
  /** Optional: navigate to time-tracking page for a given date */
  onAddEntry?: (date: string) => void;
}

const weekDays = ["Man", "Tir", "Ons", "Tor", "Fre", "Lor", "Son"];

function easterSunday(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addMarker(map: Map<string, CalendarMarker[]>, date: Date, marker: CalendarMarker) {
  const key = format(date, "yyyy-MM-dd");
  const markers = map.get(key) ?? [];
  markers.push(marker);
  map.set(key, markers);
}

function holidayMarkersForYear(year: number) {
  const map = new Map<string, CalendarMarker[]>();
  const holiday = (label: string) => ({ label, kind: "holiday" as const });

  addMarker(map, new Date(year, 0, 1), holiday("Nyttårsdag"));
  addMarker(map, new Date(year, 4, 1), holiday("Arbeidernes dag"));
  addMarker(map, new Date(year, 4, 17), holiday("Grunnlovsdag"));
  addMarker(map, new Date(year, 11, 25), holiday("1. juledag"));
  addMarker(map, new Date(year, 11, 26), holiday("2. juledag"));

  const easter = easterSunday(year);
  const relativeHolidays: Array<{ offset: number; label: string }> = [
    { offset: -3, label: "Skjærtorsdag" },
    { offset: -2, label: "Langfredag" },
    { offset: 0, label: "1. påskedag" },
    { offset: 1, label: "2. påskedag" },
    { offset: 39, label: "Kristi himmelfartsdag" },
    { offset: 49, label: "1. pinsedag" },
    { offset: 50, label: "2. pinsedag" },
  ];

  for (const item of relativeHolidays) {
    const date = new Date(easter);
    date.setDate(easter.getDate() + item.offset);
    addMarker(map, date, holiday(item.label));
  }

  return map;
}

function vacationMarkersForDate(date: Date): CalendarMarker[] {
  const markers: CalendarMarker[] = [];
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  const week = getISOWeek(date);
  const weekday = getDay(date);
  const isWeekday = weekday >= 1 && weekday <= 5;

  if (isWeekday && (week === 8 || week === 9)) {
    markers.push({ label: "Vinterferie", kind: "vacation" });
  }

  if (isWeekday && week === 40) {
    markers.push({ label: "Høstferie", kind: "vacation" });
  }

  const summerStart = new Date(year, 5, 20);
  const summerEnd = new Date(year, 7, 20, 23, 59, 59, 999);
  if (date >= summerStart && date <= summerEnd) {
    markers.push({ label: "Sommerferie", kind: "vacation" });
  }

  const christmasStart = new Date(year, 11, 24);
  const christmasEnd = new Date(year + 1, 0, 2, 23, 59, 59, 999);
  const januaryCarry = new Date(year, 0, 2, 23, 59, 59, 999);
  if ((date >= christmasStart && date <= christmasEnd) || (month === 0 && day <= 2 && date <= januaryCarry)) {
    markers.push({ label: "Juleferie", kind: "vacation" });
  }

  return markers;
}

function getStatusTone(status: string) {
  switch (status) {
    case "approved":
      return "bg-[#E8F5EE] text-[#1E6D55] border-[#C4E4D3] dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700";
    case "pending":
      return "bg-[#FDF4E7] text-[#9D6A18] border-[#F3D8A6] dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700";
    case "rejected":
      return "bg-[#FCE9E8] text-[#A2463F] border-[#F1C2BF] dark:bg-red-900/30 dark:text-red-300 dark:border-red-700";
    default:
      return "bg-[#EEF4F2] text-[#50656C] border-[#D4E1DD] dark:bg-muted dark:text-muted-foreground dark:border-border";
  }
}

function getStatusLabel(status: string) {
  switch (status) {
    case "approved":
      return "Godkjent";
    case "pending":
      return "Venter";
    case "rejected":
      return "Avvist";
    default:
      return "Utkast";
  }
}

export function CalendarHeatmap({
  data,
  entries = [],
  activities = [],
  isRefreshing = false,
  monthDirection = 0,
  selectedDate,
  onDateSelect,
  currentMonth,
  onMonthChange,
  title = "Aktivitetsoversikt",
  onAddEntry,
}: CalendarHeatmapProps) {
  const reduceMotion = useReducedMotion();
  const gridRef = useRef<HTMLDivElement>(null);
  const [showAllEntries, setShowAllEntries] = useState(false);
  const [showAllActivities, setShowAllActivities] = useState(false);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const monthKey = format(monthStart, "yyyy-MM");
  const startDayOffset = (getDay(monthStart) + 6) % 7;

  const effectiveSelectedDate = useMemo(() => {
    const parsed = parseISO(selectedDate);
    if (isValid(parsed) && isSameMonth(parsed, monthStart)) {
      return selectedDate;
    }
    const now = new Date();
    return isSameMonth(now, monthStart)
      ? format(now, "yyyy-MM-dd")
      : format(monthStart, "yyyy-MM-dd");
  }, [selectedDate, monthStart]);

  // Reset expand state when selected date changes
  useMemo(() => { setShowAllEntries(false); setShowAllActivities(false); }, [effectiveSelectedDate]);

  const heatmapHoursByDate = useMemo(
    () => new Map(data.map((item) => [item.date, item.hours])),
    [data],
  );

  const entriesByDate = useMemo(() => {
    const map = new Map<string, HeatmapEntry[]>();
    for (const entry of entries) {
      const bucket = map.get(entry.date) ?? [];
      bucket.push(entry);
      map.set(entry.date, bucket);
    }
    map.forEach((bucket) => {
      bucket.sort((a: HeatmapEntry, b: HeatmapEntry) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    });
    return map;
  }, [entries]);

  const activitiesByDate = useMemo(() => {
    const map = new Map<string, HeatmapActivity[]>();
    for (const activity of activities) {
      const parsed = new Date(activity.timestamp);
      if (Number.isNaN(parsed.getTime())) continue;
      const dateKey = format(parsed, "yyyy-MM-dd");
      const bucket = map.get(dateKey) ?? [];
      bucket.push(activity);
      map.set(dateKey, bucket);
    }
    map.forEach((bucket) => {
      bucket.sort((a: HeatmapActivity, b: HeatmapActivity) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    });
    return map;
  }, [activities]);

  const selectedEntries = entriesByDate.get(effectiveSelectedDate) ?? [];
  const selectedActivities = activitiesByDate.get(effectiveSelectedDate) ?? [];
  const selectedHours = heatmapHoursByDate.get(effectiveSelectedDate)
    ?? selectedEntries.reduce((sum, entry) => sum + entry.hours, 0);
  const approvedCount = selectedEntries.filter((entry) => entry.status === "approved").length;
  const pendingCount = selectedEntries.filter((entry) => entry.status === "pending").length;
  const draftCount = selectedEntries.filter((entry) => entry.status !== "approved" && entry.status !== "pending" && entry.status !== "rejected").length;
  const uniqueCases = Array.from(new Set(selectedEntries.map((entry) => entry.caseNumber).filter(Boolean)));

  const selectedDateObj = parseISO(effectiveSelectedDate);
  const selectedDateLabel = isValid(selectedDateObj)
    ? format(selectedDateObj, "EEEE d. MMMM yyyy", { locale: nb })
    : effectiveSelectedDate;

  const markersByDate = useMemo(() => {
    const map = new Map<string, CalendarMarker[]>();
    const holidays = holidayMarkersForYear(monthStart.getFullYear());
    for (const day of monthDays) {
      const dateKey = format(day, "yyyy-MM-dd");
      const markers = [
        ...(holidays.get(dateKey) ?? []),
        ...vacationMarkersForDate(day),
      ];
      if (markers.length > 0) {
        map.set(dateKey, markers);
      }
    }
    return map;
  }, [monthStart, monthDays]);

  const selectedMarkers = markersByDate.get(effectiveSelectedDate) ?? [];

  // Palette uses CSS design tokens – works in both light and dark mode
  const palette = [
    "var(--hm-palette-0)", "var(--hm-palette-1)", "var(--hm-palette-2)",
    "var(--hm-palette-3)", "var(--hm-palette-4)", "var(--hm-palette-5)",
  ];

  // Dynamic scale: compute max hours for the month, quantise into 5 buckets
  const monthMaxHours = useMemo(() => {
    let max = 0;
    for (const day of monthDays) {
      const h = heatmapHoursByDate.get(format(day, "yyyy-MM-dd")) ?? 0;
      if (h > max) max = h;
    }
    return Math.max(max, 1); // avoid /0
  }, [monthDays, heatmapHoursByDate]);

  // Whether the entire month has any data
  const monthHasData = useMemo(() => {
    for (const day of monthDays) {
      const k = format(day, "yyyy-MM-dd");
      if ((heatmapHoursByDate.get(k) ?? 0) > 0) return true;
      if ((entriesByDate.get(k) ?? []).length > 0) return true;
      if ((activitiesByDate.get(k) ?? []).length > 0) return true;
    }
    return false;
  }, [monthDays, heatmapHoursByDate, entriesByDate, activitiesByDate]);

  const legendTicks = useMemo(() => {
    const step = monthMaxHours / 5;
    return Array.from({ length: 6 }, (_, i) => {
      const val = Math.round(step * i * 10) / 10;
      return val % 1 === 0 ? `${val}t` : `${val.toFixed(1)}t`;
    });
  }, [monthMaxHours]);

  const getIntensityColor = (hours: number) => {
    if (hours <= 0) return palette[0];
    const ratio = hours / monthMaxHours;
    if (ratio < 0.2) return palette[1];
    if (ratio < 0.4) return palette[2];
    if (ratio < 0.6) return palette[3];
    if (ratio < 0.8) return palette[4];
    return palette[5];
  };

  const getIntensityIndex = (hours: number): number => {
    if (hours <= 0) return 0;
    const ratio = hours / monthMaxHours;
    if (ratio < 0.2) return 1;
    if (ratio < 0.4) return 2;
    if (ratio < 0.6) return 3;
    if (ratio < 0.8) return 4;
    return 5;
  };

  // Roving tabindex: arrow key navigation within the heatmap grid
  const handleGridKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      if (!target.hasAttribute("data-testid") || !target.getAttribute("data-testid")?.startsWith("heatmap-day-")) return;
      const dateStr = target.getAttribute("data-testid")!.replace("heatmap-day-", "");
      const current = parseISO(dateStr);
      if (!isValid(current)) return;

      let next: Date | null = null;
      switch (e.key) {
        case "ArrowRight": next = addDays(current, 1); break;
        case "ArrowLeft": next = addDays(current, -1); break;
        case "ArrowDown": next = addDays(current, 7); break;
        case "ArrowUp": next = addDays(current, -7); break;
        default: return;
      }
      e.preventDefault();
      if (next && isSameMonth(next, monthStart)) {
        const nextStr = format(next, "yyyy-MM-dd");
        onDateSelect(nextStr);
        // Focus the newly selected cell
        const nextEl = gridRef.current?.querySelector(`[data-testid="heatmap-day-${nextStr}"]`) as HTMLElement | null;
        nextEl?.focus();
      }
    },
    [monthStart, onDateSelect],
  );

  return (
    <Card
      className="rounded-2xl border-[var(--hm-border)] bg-[linear-gradient(180deg,var(--hm-surface),var(--hm-surface-secondary))] shadow-[var(--hm-shadow)]"
      data-testid="calendar-heatmap"
    >
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle className="text-2xl font-semibold tracking-tight text-[var(--hm-text)]">
              {title}
            </CardTitle>
            <p className="mt-1 text-sm text-[var(--hm-text-secondary)]">
              Klikk på en dag for å se registreringer og hendelser
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-9 w-9 rounded-lg border-[var(--hm-border)] bg-[var(--hm-surface)] text-[var(--hm-text)] hover:bg-[var(--hm-surface-panel)]"
              onClick={() => onMonthChange(addMonths(monthStart, -1))}
              data-testid="heatmap-month-prev"
              disabled={isRefreshing}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-[142px] rounded-lg border border-[var(--hm-border)] bg-[var(--hm-surface-panel)] px-3 py-1.5 text-center text-sm font-semibold text-[var(--hm-text)]">
              <motion.span
                key={monthKey}
                initial={reduceMotion ? { opacity: 1, x: 0 } : { opacity: 0, x: monthDirection >= 0 ? 8 : -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={reduceMotion ? { duration: 0 } : { duration: 0.16, ease: "easeOut" }}
                className="inline-block capitalize transform-gpu"
              >
                {format(monthStart, "MMMM yyyy", { locale: nb })}
              </motion.span>
            </div>
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-9 w-9 rounded-lg border-[var(--hm-border)] bg-[var(--hm-surface)] text-[var(--hm-text)] hover:bg-[var(--hm-surface-panel)]"
              onClick={() => onMonthChange(addMonths(monthStart, 1))}
              data-testid="heatmap-month-next"
              disabled={isRefreshing}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-lg border-[var(--hm-accent)]/30 bg-[var(--hm-accent)]/5 text-[var(--hm-accent)] font-semibold hover:bg-[var(--hm-accent)]/10 hover:border-[var(--hm-accent)]/50"
              onClick={() => {
                const now = new Date();
                onMonthChange(startOfMonth(now));
                onDateSelect(format(now, "yyyy-MM-dd"));
              }}
              data-testid="heatmap-today"
            >
              I dag
            </Button>
            <AnimatePresence initial={false} mode="wait">
              {isRefreshing ? (
                <motion.div
                  key={`refresh-${monthKey}`}
                  initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 3 }}
                  animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                  exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -3 }}
                  transition={reduceMotion ? { duration: 0 } : { duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                  className="hidden rounded-full border border-[var(--hm-border)] bg-[var(--hm-surface-panel)] px-2.5 py-1 text-[11px] font-medium text-[var(--hm-text-secondary)] md:inline-flex md:items-center md:gap-1.5"
                >
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--hm-accent)]" />
                  Oppdaterer
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-1.5 mb-2">
          {weekDays.map((day) => (
            <div key={day} className="py-1 text-center text-xs font-semibold text-[var(--hm-text-muted)]">
              {day}
            </div>
          ))}
        </div>

        <motion.div
          ref={gridRef}
          key={monthKey}
          className="grid grid-cols-7 gap-1.5 transform-gpu"
          role="grid"
          aria-label={`Kalender for ${format(monthStart, "MMMM yyyy", { locale: nb })}`}
          initial={reduceMotion ? { opacity: 1, x: 0 } : { opacity: 0, x: monthDirection >= 0 ? 14 : -14 }}
          animate={{ opacity: 1, x: 0 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.18, ease: "easeOut" }}
          onKeyDown={handleGridKeyDown}
        >
          {Array.from({ length: startDayOffset }).map((_, i) => (
            <div key={`empty-${monthKey}-${i}`} className="aspect-square opacity-30" />
          ))}
          {monthDays.map((day) => {
            const dateStr = format(day, "yyyy-MM-dd");
            const dayHours = heatmapHoursByDate.get(dateStr) ?? 0;
            const dayEntries = entriesByDate.get(dateStr) ?? [];
            const dayEntryCount = dayEntries.length;
            const dayCaseCount = new Set(dayEntries.map(e => e.caseNumber).filter(Boolean)).size;
            const isSelected = effectiveSelectedDate === dateStr;
            const isCurrentDay = isToday(day);
            const markers = markersByDate.get(dateStr) ?? [];
            const hasHoliday = markers.some((marker) => marker.kind === "holiday");
            const hasVacation = markers.some((marker) => marker.kind === "vacation");
            const intensity = getIntensityIndex(dayHours);

            // Build accessible aria-label
            const parts: string[] = [format(day, "EEEE d. MMMM", { locale: nb })];
            if (dayHours > 0) parts.push(`${dayHours.toFixed(1)} timer`);
            if (dayEntryCount > 0) parts.push(`${dayEntryCount} registrering${dayEntryCount !== 1 ? "er" : ""}`);
            markers.forEach(m => parts.push(m.label));
            const ariaLabel = parts.join(" – ");

            return (
              <Tooltip key={dateStr}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    role="gridcell"
                    onClick={() => onDateSelect(dateStr)}
                    className={cn(
                      "relative aspect-square rounded-md border text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hm-accent)] focus-visible:ring-offset-1",
                      isCurrentDay && !isSelected && "ring-2 ring-[var(--hm-accent)]/40 border-[var(--hm-accent)]/50",
                      isSelected
                        ? "border-[var(--hm-accent)] ring-2 ring-[var(--hm-accent)]/40 shadow-[inset_0_0_0_1.5px_var(--hm-accent-muted)]"
                        : !isCurrentDay && "border-[var(--hm-border-subtle)] hover:border-[var(--hm-accent)]/40",
                      // Text color: high intensity uses white, low uses normal text
                      intensity >= 4 ? "text-white" : "text-[var(--hm-text)]",
                    )}
                    style={{ backgroundColor: getIntensityColor(dayHours) }}
                    data-testid={`heatmap-day-${dateStr}`}
                    aria-label={ariaLabel}
                    aria-selected={isSelected}
                    tabIndex={isSelected ? 0 : -1}
                  >
                    {format(day, "d")}
                    {/* Holiday marker */}
                    {hasHoliday && (
                      <span className="absolute left-1 top-1 h-1.5 w-1.5 rounded-full bg-[var(--hm-marker-holiday)]" />
                    )}
                    {/* Vacation marker */}
                    {hasVacation && (
                      <span className="absolute left-1 top-3.5 h-1.5 w-1.5 rounded-full bg-[var(--hm-marker-vacation)]" />
                    )}
                    {/* Today indicator */}
                    {isCurrentDay && (
                      <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-[var(--hm-today-dot)]" />
                    )}
                    {/* Entry count badge */}
                    {dayEntryCount > 0 && (
                      <span className="absolute bottom-0.5 right-0.5 flex h-3 min-w-[12px] items-center justify-center rounded-full bg-[var(--hm-accent)]/80 text-[7px] font-bold leading-none text-white px-0.5">
                        {dayEntryCount}
                      </span>
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent className="space-y-0.5">
                  <p className="font-medium">{format(day, "d. MMMM", { locale: nb })}</p>
                  <p className="text-muted-foreground">{dayHours.toFixed(1)} timer</p>
                  {dayEntryCount > 0 && (
                    <p className="text-muted-foreground">{dayEntryCount} registrering{dayEntryCount !== 1 ? "er" : ""}</p>
                  )}
                  {dayCaseCount > 0 && (
                    <p className="text-muted-foreground">{dayCaseCount} sak{dayCaseCount !== 1 ? "er" : ""}</p>
                  )}
                  {markers.map((marker) => (
                    <p
                      key={`${dateStr}-${marker.label}`}
                      className={cn(
                        "text-xs",
                        marker.kind === "holiday" ? "text-[var(--hm-marker-holiday)]" : "text-[var(--hm-marker-vacation)]",
                      )}
                    >
                      {"● "}{marker.label}
                    </p>
                  ))}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </motion.div>

        {/* Empty month overlay */}
        {!monthHasData && (
          <div className="mt-3 flex flex-col items-center rounded-lg border border-dashed border-[var(--hm-border)] bg-[var(--hm-surface-panel)] py-8 px-4 text-center">
            <CalendarDays className="h-10 w-10 text-[var(--hm-accent)]/30 mb-3" />
            <p className="text-sm font-medium text-[var(--hm-text)] mb-1">Ingen data denne måneden</p>
            <p className="text-xs text-[var(--hm-text-muted)] mb-3">Start med å registrere timer eller opprett en sak.</p>
            <Button
              variant="outline"
              size="sm"
              className="rounded-lg border-[var(--hm-border)] text-[var(--hm-accent)]"
              onClick={() => onDateSelect(format(monthStart, "yyyy-MM-dd"))}
            >
              <Plus className="h-4 w-4 mr-1" />
              Registrer første time
            </Button>
          </div>
        )}

        {/* Legend */}
        <div className="mt-4 flex flex-col gap-2">
          {/* Color scale with tick labels */}
          <div className="flex items-end justify-end gap-0">
            <span className="text-[10px] text-[var(--hm-text-muted)] mr-1.5">Mindre</span>
            <div className="flex">
              {palette.map((color, i) => (
                <div key={`pal-${i}`} className="flex flex-col items-center">
                  <div className="h-3 w-5 border border-[var(--hm-border-subtle)]" style={{ backgroundColor: color, borderRadius: i === 0 ? '3px 0 0 3px' : i === palette.length - 1 ? '0 3px 3px 0' : 0 }} />
                  <span className="text-[8px] leading-tight mt-0.5 text-[var(--hm-text-muted)]">{legendTicks[i]}</span>
                </div>
              ))}
            </div>
            <span className="text-[10px] text-[var(--hm-text-muted)] ml-1.5">Mer</span>
          </div>
          {/* Marker key */}
          <div className="flex items-center justify-end gap-3 text-[10px] text-[var(--hm-text-muted)]">
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[var(--hm-marker-holiday)]" />Helligdag</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[var(--hm-marker-vacation)]" />Ferie</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[var(--hm-today-dot)]" />I dag</span>
            <span className="inline-flex items-center gap-1"><span className="flex h-3 min-w-[12px] items-center justify-center rounded-full bg-[var(--hm-accent)]/80 text-[7px] font-bold text-white px-0.5">2</span>Antall</span>
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-[var(--hm-border)] bg-[var(--hm-surface)]/85 p-4">
          <AnimatePresence initial={false} mode="wait">
            <motion.div
              key={effectiveSelectedDate}
              initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
              animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -8 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.14, ease: "easeOut" }}
              className="transform-gpu"
            >
              {/* Panel header: date label + quick actions */}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-[var(--hm-accent)]" />
                  <h4 className="text-base font-semibold capitalize text-[var(--hm-text)]">{selectedDateLabel}</h4>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {/* Quick actions */}
                  {onAddEntry && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 rounded-md border-[var(--hm-accent)]/30 bg-[var(--hm-accent)]/5 text-[var(--hm-accent)] text-xs hover:bg-[var(--hm-accent)]/10"
                      onClick={() => onAddEntry(effectiveSelectedDate)}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Legg til
                    </Button>
                  )}
                  {selectedEntries.length > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 rounded-md text-[var(--hm-text-secondary)] text-xs hover:text-[var(--hm-accent)]"
                      onClick={() => onAddEntry?.(effectiveSelectedDate)}
                    >
                      <ExternalLink className="h-3 w-3 mr-1" />
                      Se alle for dato
                    </Button>
                  )}
                </div>
              </div>

              {/* Marker badges + total hours */}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {selectedMarkers.map((marker) => (
                  <Badge
                    key={`${effectiveSelectedDate}-${marker.label}`}
                    className={cn(
                      "border",
                      marker.kind === "holiday"
                        ? "border-[#f2c4bf] bg-[#fdeceb] text-[#ab4036] dark:border-red-700 dark:bg-red-900/30 dark:text-red-300"
                        : "border-[#f2ddb4] bg-[#fdf5e8] text-[#9e6a18] dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
                    )}
                  >
                    {marker.label}
                  </Badge>
                ))}
                <Badge className="border border-[var(--hm-border)] bg-[var(--hm-surface-panel)] text-[var(--hm-accent)]">
                  {selectedHours.toFixed(1)} timer totalt
                </Badge>
              </div>

              {/* Skeleton shimmer while refreshing */}
              {isRefreshing ? (
                <div className="mt-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={`sk-stat-${i}`} className="h-14 rounded-lg" />
                    ))}
                  </div>
                  <div className="grid gap-4 lg:grid-cols-2 mt-4">
                    <Skeleton className="h-28 rounded-lg" />
                    <Skeleton className="h-28 rounded-lg" />
                  </div>
                </div>
              ) : (
                <>
                  {/* Stats grid */}
                  <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
                    <div className="rounded-lg border border-[var(--hm-border)] bg-[var(--hm-surface-panel)] px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-[var(--hm-text-muted)]">Registreringer</p>
                      <p className="mt-0.5 text-sm font-semibold text-[var(--hm-text)]">{selectedEntries.length}</p>
                    </div>
                    <div className="rounded-lg border border-[var(--hm-border)] bg-[var(--hm-surface-panel)] px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-[var(--hm-text-muted)]">Godkjent</p>
                      <p className="mt-0.5 text-sm font-semibold text-[var(--hm-text)]">{approvedCount}</p>
                    </div>
                    <div className="rounded-lg border border-[var(--hm-border)] bg-[var(--hm-surface-panel)] px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-[var(--hm-text-muted)]">Venter</p>
                      <p className="mt-0.5 text-sm font-semibold text-[var(--hm-text)]">{pendingCount}</p>
                    </div>
                    <div className="rounded-lg border border-[var(--hm-border)] bg-[var(--hm-surface-panel)] px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-[var(--hm-text-muted)]">Saker</p>
                      <p className="mt-0.5 text-sm font-semibold text-[var(--hm-text)]">{uniqueCases.length}</p>
                    </div>
                  </div>

                  {/* Status mini-summary chips */}
                  {selectedEntries.length > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {approvedCount > 0 && (
                        <Badge variant="outline" className="text-[10px] border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400">
                          <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
                          {approvedCount} godkjent
                        </Badge>
                      )}
                      {pendingCount > 0 && (
                        <Badge variant="outline" className="text-[10px] border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400">
                          <Clock3 className="h-2.5 w-2.5 mr-0.5" />
                          {pendingCount} venter
                        </Badge>
                      )}
                      {draftCount > 0 && (
                        <Badge variant="outline" className="text-[10px] border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900/20 dark:text-slate-400">
                          <AlertCircle className="h-2.5 w-2.5 mr-0.5" />
                          {draftCount} utkast
                        </Badge>
                      )}
                    </div>
                  )}

                  {/* Entries + activities panels */}
                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    {/* Entries panel */}
                    <div className="rounded-lg border border-[var(--hm-border)] bg-[var(--hm-surface)] p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <ClipboardList className="h-4 w-4 text-[var(--hm-accent)]" />
                        <h5 className="text-sm font-semibold text-[var(--hm-text)]">Dagens registreringer</h5>
                      </div>
                      {selectedEntries.length === 0 ? (
                        <div className="flex flex-col items-center py-4 text-[var(--hm-text-secondary)]">
                          <ClipboardList className="h-8 w-8 mb-2 opacity-30" />
                          <p className="text-sm">Ingen registreringer denne dagen.</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {(showAllEntries ? selectedEntries : selectedEntries.slice(0, 4)).map((entry) => (
                            <div key={entry.id} className="rounded-md border border-[var(--hm-border)] bg-[var(--hm-surface-secondary)] p-2.5">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium text-[var(--hm-text)]">{entry.description}</p>
                                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                    {entry.caseNumber ? (
                                      <Badge variant="outline" className="border-[var(--hm-border)] bg-[var(--hm-surface)] text-[var(--hm-text-secondary)]">
                                        <FolderKanban className="mr-1 h-3 w-3" />
                                        {entry.caseNumber}
                                      </Badge>
                                    ) : null}
                                    <Badge className={cn("border", getStatusTone(entry.status))}>
                                      {entry.status === "approved" ? (
                                        <CheckCircle2 className="mr-1 h-3 w-3" />
                                      ) : (
                                        <AlertCircle className="mr-1 h-3 w-3" />
                                      )}
                                      {getStatusLabel(entry.status)}
                                    </Badge>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <p className="text-sm font-semibold text-[var(--hm-text)]">{entry.hours.toFixed(1)}t</p>
                                  <p className="text-xs text-[var(--hm-text-secondary)]">{format(new Date(entry.createdAt), "HH:mm", { locale: nb })}</p>
                                </div>
                              </div>
                            </div>
                          ))}
                          {selectedEntries.length > 4 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="w-full text-xs text-[var(--hm-accent)] hover:text-[var(--hm-accent)] hover:bg-[var(--hm-accent)]/5"
                              onClick={() => setShowAllEntries((p) => !p)}
                            >
                              {showAllEntries ? "Vis færre" : `Vis alle (${selectedEntries.length})`}
                            </Button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Activities panel */}
                    <div className="rounded-lg border border-[var(--hm-border)] bg-[var(--hm-surface)] p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <Workflow className="h-4 w-4 text-[var(--hm-accent)]" />
                        <h5 className="text-sm font-semibold text-[var(--hm-text)]">Hendelser</h5>
                      </div>
                      {selectedActivities.length === 0 ? (
                        <div className="flex flex-col items-center py-4 text-[var(--hm-text-secondary)]">
                          <Workflow className="h-8 w-8 mb-2 opacity-30" />
                          <p className="text-sm">Ingen hendelser denne dagen.</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {(showAllActivities ? selectedActivities : selectedActivities.slice(0, 4)).map((activity) => (
                            <div key={activity.id} className="rounded-md border border-[var(--hm-border)] bg-[var(--hm-surface-secondary)] p-2.5">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-sm text-[var(--hm-text)]">{activity.message}</p>
                                  <p className="mt-0.5 truncate text-xs text-[var(--hm-text-secondary)]">{activity.user ?? "Ukjent bruker"}</p>
                                </div>
                                <div className="inline-flex items-center gap-1 text-xs text-[var(--hm-text-secondary)]">
                                  <Clock3 className="h-3 w-3" />
                                  {format(new Date(activity.timestamp), "HH:mm", { locale: nb })}
                                </div>
                              </div>
                            </div>
                          ))}
                          {selectedActivities.length > 4 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="w-full text-xs text-[var(--hm-accent)] hover:text-[var(--hm-accent)] hover:bg-[var(--hm-accent)]/5"
                              onClick={() => setShowAllActivities((p) => !p)}
                            >
                              {showAllActivities ? "Vis færre" : `Vis alle (${selectedActivities.length})`}
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </CardContent>
    </Card>
  );
}
