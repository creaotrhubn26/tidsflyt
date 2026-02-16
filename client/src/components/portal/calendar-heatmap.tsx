import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, parseISO, isValid, isSameMonth, isToday, getISOWeek } from "date-fns";
import { nb } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme-provider";
import { AlertCircle, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Clock3, FolderKanban, Workflow } from "lucide-react";
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
      return "bg-[#E8F5EE] text-[#1E6D55] border-[#C4E4D3]";
    case "pending":
      return "bg-[#FDF4E7] text-[#9D6A18] border-[#F3D8A6]";
    case "rejected":
      return "bg-[#FCE9E8] text-[#A2463F] border-[#F1C2BF]";
    default:
      return "bg-[#EEF4F2] text-[#50656C] border-[#D4E1DD]";
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
}: CalendarHeatmapProps) {
  const { resolvedTheme } = useTheme();
  const reduceMotion = useReducedMotion();
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

  const palette = resolvedTheme === "dark"
    ? ["#1E2C35", "#265865", "#2D7180", "#36889A", "#3EA3B5", "#51C2D0"]
    : ["#E8EFED", "#CFE3DC", "#AACDBF", "#7BB79F", "#4E9A6F", "#1F6B73"];

  const getIntensityColor = (hours: number) => {
    if (hours <= 0) return palette[0];
    if (hours < 2) return palette[1];
    if (hours < 4) return palette[2];
    if (hours < 6) return palette[3];
    if (hours < 8) return palette[4];
    return palette[5];
  };

  const weekDayLabelColor = resolvedTheme === "dark" ? "#AFC5C1" : "#607479";

  const getDayTextColor = (hours: number) => {
    if (resolvedTheme === "dark") {
      if (hours <= 0) return "#C8DAD7";
      if (hours < 4) return "#E3F0EE";
      return "#F8FDFC";
    }
    return hours >= 4 ? "#ffffff" : "#22444d";
  };

  return (
    <Card
      className="rounded-2xl border-[#d8e4e0] bg-[linear-gradient(180deg,#ffffff,#f7fbf9)] shadow-[0_12px_30px_rgba(20,58,65,0.07)]"
      data-testid="calendar-heatmap"
    >
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle className="text-2xl font-semibold tracking-tight text-[#153c46]">
              {title}
            </CardTitle>
            <p className="mt-1 text-sm text-[#53686f]">
              Klikk på en dag for å se registreringer og hendelser
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-9 w-9 rounded-lg border-[#cadad4] bg-white text-[#335159] hover:bg-[#f0f5f3]"
              onClick={() => onMonthChange(addMonths(monthStart, -1))}
              data-testid="heatmap-month-prev"
              disabled={isRefreshing}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-[142px] rounded-lg border border-[#d2dfdb] bg-[#eef4f2] px-3 py-1.5 text-center text-sm font-semibold text-[#1f414a]">
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
              className="h-9 w-9 rounded-lg border-[#cadad4] bg-white text-[#335159] hover:bg-[#f0f5f3]"
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
              className="rounded-lg border-[#cadad4] bg-white text-[#335159] hover:bg-[#f0f5f3]"
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
                  className="hidden rounded-full border border-[#cde0d9] bg-[#f5faf8] px-2.5 py-1 text-[11px] font-medium text-[#2f555e] md:inline-flex md:items-center md:gap-1.5"
                >
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#1F6B73]" />
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
            <div key={day} className="py-1 text-center text-xs font-semibold" style={{ color: weekDayLabelColor }}>
              {day}
            </div>
          ))}
        </div>

        <motion.div
          key={monthKey}
          className="grid grid-cols-7 gap-1.5 transform-gpu"
          initial={reduceMotion ? { opacity: 1, x: 0 } : { opacity: 0, x: monthDirection >= 0 ? 14 : -14 }}
          animate={{ opacity: 1, x: 0 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.18, ease: "easeOut" }}
        >
          {Array.from({ length: startDayOffset }).map((_, i) => (
            <div key={`empty-${monthKey}-${i}`} className="aspect-square" />
          ))}
          {monthDays.map((day) => {
            const dateStr = format(day, "yyyy-MM-dd");
            const dayHours = heatmapHoursByDate.get(dateStr) ?? 0;
            const isSelected = effectiveSelectedDate === dateStr;
            const isCurrentDay = isToday(day);
            const markers = markersByDate.get(dateStr) ?? [];
            const hasHoliday = markers.some((marker) => marker.kind === "holiday");
            const hasVacation = markers.some((marker) => marker.kind === "vacation");

            return (
              <Tooltip key={dateStr}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => onDateSelect(dateStr)}
                    className={cn(
                      "relative aspect-square rounded-md border text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F6B73] focus-visible:ring-offset-1",
                      isSelected
                        ? "border-[#104c53] ring-2 ring-[#1F6B73]/30"
                        : "border-[rgba(11,33,39,0.08)] hover:border-[#8bb5a5]",
                    )}
                    style={{ backgroundColor: getIntensityColor(dayHours), color: getDayTextColor(dayHours) }}
                    data-testid={`heatmap-day-${dateStr}`}
                    aria-pressed={isSelected}
                  >
                    {format(day, "d")}
                    {hasHoliday ? (
                      <span className="absolute left-1 top-1 h-1.5 w-1.5 rounded-full bg-[#E55B4C]" />
                    ) : null}
                    {hasVacation ? (
                      <span className="absolute left-1 top-3.5 h-1.5 w-1.5 rounded-full bg-[#E3A93A]" />
                    ) : null}
                    {isCurrentDay && (
                      <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-[#F3F7F6]" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="font-medium">{format(day, "d. MMMM", { locale: nb })}</p>
                  <p className="text-muted-foreground">{dayHours.toFixed(1)} timer</p>
                  {markers.map((marker) => (
                    <p
                      key={`${dateStr}-${marker.label}`}
                      className={cn(
                        "text-xs",
                        marker.kind === "holiday" ? "text-[#B93B2D]" : "text-[#99660E]",
                      )}
                    >
                      {marker.label}
                    </p>
                  ))}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </motion.div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <span className="text-xs text-[#6a7a7f]">Mindre</span>
          <div className="flex gap-1">
            {palette.map((color) => (
              <div key={color} className="h-3 w-3 rounded-sm border border-[rgba(11,33,39,0.07)]" style={{ backgroundColor: color }} />
            ))}
          </div>
          <span className="text-xs text-[#6a7a7f]">Mer</span>
        </div>

        <div className="mt-5 rounded-xl border border-[#d3dfdb] bg-white/85 p-4">
          <AnimatePresence initial={false} mode="wait">
            <motion.div
              key={effectiveSelectedDate}
              initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
              animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -8 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.14, ease: "easeOut" }}
              className="transform-gpu"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-[#1F6B73]" />
                  <h4 className="text-base font-semibold capitalize text-[#1b3d46]">{selectedDateLabel}</h4>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  {selectedMarkers.map((marker) => (
                    <Badge
                      key={`${effectiveSelectedDate}-${marker.label}`}
                      className={cn(
                        "border",
                        marker.kind === "holiday"
                          ? "border-[#f2c4bf] bg-[#fdeceb] text-[#ab4036]"
                          : "border-[#f2ddb4] bg-[#fdf5e8] text-[#9e6a18]",
                      )}
                    >
                      {marker.label}
                    </Badge>
                  ))}
                  <Badge className="border border-[#cbe0d8] bg-[#edf7f3] text-[#1f6b73]">
                    {selectedHours.toFixed(1)} timer totalt
                  </Badge>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
                <div className="rounded-lg border border-[#d7e3df] bg-[#f4f8f7] px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-[#5e7479]">Registreringer</p>
                  <p className="mt-0.5 text-sm font-semibold text-[#1f414a]">{selectedEntries.length}</p>
                </div>
                <div className="rounded-lg border border-[#d7e3df] bg-[#f4f8f7] px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-[#5e7479]">Godkjent</p>
                  <p className="mt-0.5 text-sm font-semibold text-[#1f414a]">{approvedCount}</p>
                </div>
                <div className="rounded-lg border border-[#d7e3df] bg-[#f4f8f7] px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-[#5e7479]">Venter</p>
                  <p className="mt-0.5 text-sm font-semibold text-[#1f414a]">{pendingCount}</p>
                </div>
                <div className="rounded-lg border border-[#d7e3df] bg-[#f4f8f7] px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-[#5e7479]">Saker</p>
                  <p className="mt-0.5 text-sm font-semibold text-[#1f414a]">{uniqueCases.length}</p>
                </div>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="rounded-lg border border-[#d9e4e1] bg-white p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <ClipboardList className="h-4 w-4 text-[#1F6B73]" />
                    <h5 className="text-sm font-semibold text-[#21414a]">Dagens registreringer</h5>
                  </div>
                  {selectedEntries.length === 0 ? (
                    <p className="text-sm text-[#5f7277]">Ingen registreringer denne dagen.</p>
                  ) : (
                    <div className="space-y-2">
                      {selectedEntries.slice(0, 6).map((entry) => (
                        <div key={entry.id} className="rounded-md border border-[#e1e9e6] bg-[#fafcfb] p-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-[#213d45]">{entry.description}</p>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                {entry.caseNumber ? (
                                  <Badge variant="outline" className="border-[#d2dfdb] bg-white text-[#48626a]">
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
                              <p className="text-sm font-semibold text-[#13434d]">{entry.hours.toFixed(1)}t</p>
                              <p className="text-xs text-[#5f7277]">{format(new Date(entry.createdAt), "HH:mm", { locale: nb })}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-[#d9e4e1] bg-white p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <Workflow className="h-4 w-4 text-[#1F6B73]" />
                    <h5 className="text-sm font-semibold text-[#21414a]">Hendelser</h5>
                  </div>
                  {selectedActivities.length === 0 ? (
                    <p className="text-sm text-[#5f7277]">Ingen hendelser denne dagen.</p>
                  ) : (
                    <div className="space-y-2">
                      {selectedActivities.slice(0, 6).map((activity) => (
                        <div key={activity.id} className="rounded-md border border-[#e1e9e6] bg-[#fafcfb] p-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm text-[#213d45]">{activity.message}</p>
                              <p className="mt-0.5 truncate text-xs text-[#5f7277]">{activity.user ?? "Ukjent bruker"}</p>
                            </div>
                            <div className="inline-flex items-center gap-1 text-xs text-[#4f666d]">
                              <Clock3 className="h-3 w-3" />
                              {format(new Date(activity.timestamp), "HH:mm", { locale: nb })}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </CardContent>
    </Card>
  );
}
