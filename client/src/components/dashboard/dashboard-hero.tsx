import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  FileText,
  CheckCircle,
  Calendar,
  CalendarDays,
  CalendarRange,
  ChevronDown,
  Briefcase,
} from "lucide-react";
import { format, getISOWeek, startOfISOWeek, endOfISOWeek } from "date-fns";
import { nb } from "date-fns/locale";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type TimeRange = "today" | "week" | "month";

function getGreeting(hour: number): string {
  if (hour >= 5 && hour < 12) return "God morgen";
  if (hour >= 12 && hour < 17) return "God ettermiddag";
  if (hour >= 17 && hour < 22) return "God kveld";
  return "God natt";
}

function getRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "nettopp";
  if (diffMin < 60) return `${diffMin} min siden`;
  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr}t siden`;
}

interface DashboardHeroProps {
  slim?: boolean;
  mode?: "default" | "tiltaksleder" | "miljoarbeider";
  title?: string;
  subtitle?: string;
  userName?: string;
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
  statsFetching: boolean;
  statsLoading: boolean;
  pendingApprovals: number;
  lastUpdated: Date | null;
  navigate: (path: string) => void;
}

const TIME_RANGE_BUTTONS: { value: TimeRange; label: string; icon: typeof Calendar }[] = [
  { value: "today", label: "I dag", icon: Calendar },
  { value: "week", label: "Denne uken", icon: CalendarDays },
  { value: "month", label: "Denne måneden", icon: CalendarRange },
];

function getPeriodLabel(range: TimeRange): string {
  const now = new Date();
  switch (range) {
    case "today":
      return `I dag (${format(now, "d. MMM", { locale: nb })})`;
    case "week": {
      const start = startOfISOWeek(now);
      const end = endOfISOWeek(now);
      return `Denne uken (${format(start, "d", { locale: nb })}\u2013${format(end, "d MMM", { locale: nb })})`;
    }
    case "month":
      return `Denne måneden (${format(now, "MMMM yyyy", { locale: nb })})`;
  }
}

export function DashboardHero({
  slim,
  mode = "default",
  title = "Dashboard",
  subtitle,
  userName,
  timeRange,
  onTimeRangeChange,
  statsFetching,
  statsLoading,
  pendingApprovals,
  lastUpdated,
  navigate,
}: DashboardHeroProps) {
  const reduceMotion = useReducedMotion();
  const periodLabel = useMemo(() => getPeriodLabel(timeRange), [timeRange]);
  const isTiltaksleder = mode === "tiltaksleder";
  const isMiljoarbeider = mode === "miljoarbeider";
  const createFollowUpPath = "/case-reports?create=1";
  const primaryActionPath = isTiltaksleder
    ? "/cases"
    : isMiljoarbeider
      ? createFollowUpPath
      : "/time-tracking";
  const reportActionPath = isTiltaksleder
    ? "/cases"
    : isMiljoarbeider
      ? createFollowUpPath
      : "/reports";
  const overviewActionPath = isTiltaksleder
    ? "/cases"
    : isMiljoarbeider
      ? "/case-reports"
      : "/cases";
  const reportsShortcutPath = isTiltaksleder
    ? "/cases"
    : isMiljoarbeider
      ? "/case-reports"
      : "/reports";

  /* ── Live relative-time state ── */
  const [relativeTime, setRelativeTime] = useState<string | null>(null);
  useEffect(() => {
    if (!lastUpdated) { setRelativeTime(null); return; }
    setRelativeTime(getRelativeTime(lastUpdated));
    const id = setInterval(() => setRelativeTime(getRelativeTime(lastUpdated)), 30_000);
    return () => clearInterval(id);
  }, [lastUpdated]);

  /* ── Greeting ── */
  const greeting = useMemo(() => getGreeting(new Date().getHours()), []);
  const weekNumber = useMemo(() => getISOWeek(new Date()), []);

  /* ── Slim / one-line header mode ── */
  if (slim) {
    return (
      <div className="flex flex-1 flex-wrap items-center gap-3 min-w-0">
        <div className="min-w-0">
          {/* Greeting line */}
          <p className="text-sm font-semibold leading-tight text-foreground truncate">
            {userName ? (
              <>
                <span className="text-muted-foreground font-normal">{greeting},</span>&nbsp;{userName}
                <span className="hidden sm:inline text-muted-foreground font-normal text-xs ml-2">· Uke {weekNumber}</span>
              </>
            ) : (
              title
            )}
          </p>
          {/* Period + live last-updated */}
          <p className="text-xs text-muted-foreground truncate flex items-center gap-1.5">
            {subtitle ? `${subtitle} · ` : ""}{periodLabel}
            {!statsFetching && relativeTime && (
              <>
                <span className="text-muted-foreground/40">—</span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                  {relativeTime}
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
          <AnimatePresence initial={false} mode="wait">
            {statsFetching && !statsLoading && (
              <motion.span
                key="fetching-slim"
                initial={reduceMotion ? {} : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={reduceMotion ? { duration: 0 } : { duration: 0.2 }}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
              >
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                <span className="hidden sm:inline">Oppdaterer…</span>
              </motion.span>
            )}
          </AnimatePresence>
          <div
            className="relative inline-flex w-fit gap-1 rounded-xl border border-border bg-muted p-1"
            data-testid="time-range-selector"
          >
            {TIME_RANGE_BUTTONS.map((btn) => {
              const Icon = btn.icon;
              const selected = timeRange === btn.value;
              return (
                <button
                  type="button"
                  key={btn.value}
                  onClick={() => onTimeRangeChange(btn.value)}
                  className={cn(
                    "relative z-10 inline-flex min-h-7 items-center justify-center gap-1.5 rounded-lg border border-transparent px-3 text-xs font-medium transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none",
                    selected ? "text-white" : "text-muted-foreground hover:text-foreground",
                  )}
                  data-testid={`time-range-${btn.value}`}
                >
                  {selected && (
                    <motion.span
                      layoutId="dashboard-time-range-active-pill"
                      className="absolute inset-0 transform-gpu rounded-lg border border-primary bg-primary shadow-[0_8px_18px_rgba(21,92,99,0.26)]"
                      transition={
                        reduceMotion
                          ? { duration: 0 }
                          : { type: "spring", stiffness: 260, damping: 30, mass: 0.75 }
                      }
                    />
                  )}
                  <Icon className="h-3.5 w-3.5" />
                  <span className="relative hidden sm:inline">{btn.label}</span>
                </button>
              );
            })}
          </div>
          <Button
            size="sm"
            onClick={() => navigate(primaryActionPath)}
            className="gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">
              {isTiltaksleder ? "Tiltak" : isMiljoarbeider ? "Oppfølging" : "Ny"}
            </span>
          </Button>
          {pendingApprovals > 0 && (
            <Button
              onClick={() => navigate("/time-tracking")}
              variant="outline"
              size="sm"
              className="gap-1.5"
            >
              <CheckCircle className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Godkjenn</span>
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-500 px-1.5 text-[10px] font-bold text-white">
                {pendingApprovals}
              </span>
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Title + period label + quick actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          {userName && (
            <p className="text-sm text-muted-foreground mb-0.5">
              {greeting}, <span className="font-medium text-foreground">{userName}</span>
              <span className="ml-2 text-muted-foreground/60">· Uke {weekNumber}</span>
            </p>
          )}
          <h1
            className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl"
            data-testid="dashboard-title"
          >
            {title}
          </h1>
          <p className="mt-1 text-muted-foreground">
            {subtitle ? `${subtitle} · ` : ""}
            {periodLabel}
          </p>
          {/* Live "last updated" indicator */}
          {!statsFetching && relativeTime && (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground/70">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
              Oppdatert {relativeTime}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Split "Ny" button */}
          <div className="flex">
            <Button
              onClick={() => navigate(primaryActionPath)}
              className="gap-2 rounded-r-none bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">{isTiltaksleder ? "Gå til tiltak" : isMiljoarbeider ? "Ny oppfølging" : "Ny tidsregistrering"}</span>
              <span className="sm:hidden">{isTiltaksleder ? "Tiltak" : isMiljoarbeider ? "Oppfølging" : "Ny"}</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button aria-label="Flere handlinger" title="Flere handlinger" className="rounded-l-none border-l border-primary-foreground/20 bg-primary text-primary-foreground hover:bg-primary/90 px-2 shadow-lg">
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => navigate("/time-tracking")}>
                  <Plus className="mr-2 h-4 w-4" />
                  {isTiltaksleder || isMiljoarbeider ? "Registrer oppfølging" : "Ny tidsregistrering"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate(reportActionPath)}>
                  <FileText className="mr-2 h-4 w-4" />
                  {isTiltaksleder || isMiljoarbeider ? "Ny tiltaksrapport" : "Ny rapport"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate(overviewActionPath)}>
                  <Briefcase className="mr-2 h-4 w-4" />
                  {isTiltaksleder || isMiljoarbeider ? "Åpne tiltak" : "Ny sak"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* "Godkjenn" badge-button */}
          {pendingApprovals > 0 && (
            <Button
              onClick={() => navigate("/time-tracking")}
              variant="outline"
              size="sm"
              className="gap-1.5 border-border text-muted-foreground hover:bg-accent"
            >
              <CheckCircle className="h-4 w-4" />
              Godkjenn
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-500 px-1.5 text-[10px] font-bold text-white">
                {pendingApprovals}
              </span>
            </Button>
          )}

          {/* "Rapporter" ghost */}
          <Button
            onClick={() => navigate(reportsShortcutPath)}
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground"
          >
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">{isTiltaksleder || isMiljoarbeider ? "Tiltaksrapporter" : "Rapporter"}</span>
          </Button>
        </div>
      </div>

      {/* Time range selector + fetching pill */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <AnimatePresence initial={false} mode="wait">
          {statsFetching && !statsLoading ? (
            <motion.div
              key={`stats-fetching-${timeRange}`}
              initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -4 }}
              animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -4 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-background/85 px-3 py-1 text-xs font-medium text-muted-foreground"
            >
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              Oppdaterer tall&hellip;
            </motion.div>
          ) : (
            <div />
          )}
        </AnimatePresence>

        <div
          className="relative inline-flex w-fit gap-1 rounded-xl border border-border bg-muted p-1"
          data-testid="time-range-selector"
        >
          {TIME_RANGE_BUTTONS.map((btn) => {
            const Icon = btn.icon;
            const selected = timeRange === btn.value;
            return (
              <button
                type="button"
                key={btn.value}
                onClick={() => onTimeRangeChange(btn.value)}
                className={cn(
                  "relative z-10 inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg border border-transparent px-3.5 text-xs font-medium transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none",
                  selected
                    ? "text-white"
                    : "text-muted-foreground hover:text-foreground",
                )}
                data-testid={`time-range-${btn.value}`}
              >
                {selected ? (
                  <motion.span
                    layoutId="dashboard-time-range-active-pill"
                    className="absolute inset-0 transform-gpu rounded-lg border border-primary bg-primary shadow-[0_8px_18px_rgba(21,92,99,0.26)]"
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
    </>
  );
}
