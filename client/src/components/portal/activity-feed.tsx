import { memo, useMemo, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatDistanceToNow, isToday, isYesterday, format } from "date-fns";
import { nb } from "date-fns/locale";
import {
  Clock,
  UserPlus,
  FileText,
  CheckCircle,
  AlertCircle,
  ChevronRight,
  AlertTriangle,
  Bell,
  Filter,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

/* ═══════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════ */

interface Activity {
  id: string;
  type: "stamp" | "user_added" | "report_submitted" | "approval" | "alert";
  user?: string;
  message: string;
  timestamp: string;
  /** If true, rendered in the pinned "Viktig" section at top */
  pinned?: boolean;
  /** Optional entity tags – shown as small badges */
  tags?: string[];
  /** Optional status pill (e.g. "Godkjent", "Til behandling", "Avvist") */
  status?: string;
}

type FeedVariant = "full" | "compact";
type FeedDensity = "compact" | "comfortable";
type TypeFilter = "all" | Activity["type"];

interface ActivityFeedProps {
  activities: Activity[];
  loading?: boolean;
  title?: string;
  /** "compact" shows max items + "Vis alle", "full" uses scroll area */
  variant?: FeedVariant;
  /** Visual density – "compact" tighter rows, "comfortable" default */
  density?: FeedDensity;
  /** Max items shown in compact variant (default: 6) */
  compactLimit?: number;
  /** Callback when a row is clicked */
  onActivityClick?: (activity: Activity) => void;
  /** Row-level action menu items */
  onAction?: (activity: Activity, action: string) => void;
  /** Callback for "Vis alle" in compact variant */
  onShowAll?: () => void;
}

/* ═══════════════════════════════════════════════════
   localStorage read-state
   ═══════════════════════════════════════════════════ */

const READ_KEY = "tidum-af-read";

function getReadIds(): Set<string> {
  try {
    const raw = localStorage.getItem(READ_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function persistReadIds(ids: Set<string>) {
  try {
    const arr = Array.from(ids).slice(-500);
    localStorage.setItem(READ_KEY, JSON.stringify(arr));
  } catch {
    /* silently fail */
  }
}

/* ═══════════════════════════════════════════════════
   CSS-variable-driven colour tokens
   ═══════════════════════════════════════════════════ */

const activityIcons: Record<Activity["type"], typeof Clock> = {
  stamp: Clock,
  user_added: UserPlus,
  report_submitted: FileText,
  approval: CheckCircle,
  alert: AlertTriangle,
};

/** Capsule colours + left-border accent tone */
const activityStyles: Record<
  Activity["type"],
  { capsule: string; border: string }
> = {
  stamp: {
    capsule:
      "bg-[var(--af-stamp-bg,theme(colors.primary/0.1))] text-[var(--af-stamp-fg,theme(colors.primary))] ring-1 ring-[var(--af-stamp-ring,theme(colors.primary/0.1))]",
    border: "border-l-[var(--af-stamp-fg,theme(colors.primary))]",
  },
  user_added: {
    capsule:
      "bg-sky-500/10 text-sky-600 dark:text-sky-400 ring-1 ring-sky-500/10",
    border: "border-l-sky-500",
  },
  report_submitted: {
    capsule:
      "bg-[var(--af-info-bg,theme(colors.info/0.1))] text-[var(--af-info-fg,theme(colors.info))] ring-1 ring-[var(--af-info-ring,theme(colors.info/0.1))]",
    border: "border-l-[var(--af-info-fg,theme(colors.info))]",
  },
  approval: {
    capsule:
      "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/10",
    border: "border-l-emerald-500",
  },
  alert: {
    capsule:
      "bg-amber-500/15 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/20",
    border: "border-l-amber-500",
  },
};

/** Status pill colour map */
function statusPillClass(status: string): string {
  const lower = status.toLowerCase();
  if (lower.includes("godkjent") || lower.includes("approved"))
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400";
  if (lower.includes("avvist") || lower.includes("rejected"))
    return "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400";
  return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400";
}

/* ═══════════════════════════════════════════════════
   Date grouping
   ═══════════════════════════════════════════════════ */

type DateGroup = "i-dag" | "i-gar" | "denne-uken" | "tidligere";

function getDateGroup(timestamp: string): DateGroup {
  const d = new Date(timestamp);
  if (isToday(d)) return "i-dag";
  if (isYesterday(d)) return "i-gar";
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  if (d >= weekAgo) return "denne-uken";
  return "tidligere";
}

const groupLabels: Record<DateGroup, string> = {
  "i-dag": "I dag",
  "i-gar": "I går",
  "denne-uken": "Denne uken",
  tidligere: "Tidligere",
};

const GROUP_ORDER: DateGroup[] = ["i-dag", "i-gar", "denne-uken", "tidligere"];

/* ═══════════════════════════════════════════════════
   Filter config
   ═══════════════════════════════════════════════════ */

const FILTER_OPTIONS: { key: TypeFilter; label: string }[] = [
  { key: "all", label: "Alle" },
  { key: "stamp", label: "Timer" },
  { key: "report_submitted", label: "Rapporter" },
  { key: "approval", label: "Godkjenning" },
  { key: "alert", label: "Varsler" },
];

/* ═══════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════ */

function ActivityFeedComponent({
  activities,
  loading,
  title = "Aktivitet",
  variant = "full",
  density = "comfortable",
  compactLimit = 6,
  onActivityClick,
  onAction,
  onShowAll,
}: ActivityFeedProps) {
  const reduceMotion = useReducedMotion();
  const scrollRef = useRef<HTMLDivElement>(null);

  // ── Filter ──
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

  // ── Read / unread ──
  const [readIds, setReadIds] = useState<Set<string>>(getReadIds);

  const markRead = useCallback((id: string) => {
    setReadIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      persistReadIds(next);
      return next;
    });
  }, []);

  const markAllRead = useCallback(() => {
    setReadIds((prev) => {
      const next = new Set(prev);
      for (const a of activities) next.add(a.id);
      persistReadIds(next);
      return next;
    });
  }, [activities]);

  // ── Hover action menu ──
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);

  // ── Derived data ──
  const filteredActivities = useMemo(() => {
    if (typeFilter === "all") return activities;
    return activities.filter((a) => a.type === typeFilter);
  }, [activities, typeFilter]);

  const unreadCount = useMemo(
    () => activities.filter((a) => !readIds.has(a.id)).length,
    [activities, readIds],
  );

  const todayCount = useMemo(
    () => activities.filter((a) => isToday(new Date(a.timestamp))).length,
    [activities],
  );

  const pinnedItems = useMemo(
    () => filteredActivities.filter((a) => a.pinned),
    [filteredActivities],
  );
  const regularItems = useMemo(
    () => filteredActivities.filter((a) => !a.pinned),
    [filteredActivities],
  );

  const grouped = useMemo(() => {
    const map = new Map<DateGroup, Activity[]>();
    for (const g of GROUP_ORDER) map.set(g, []);
    for (const a of regularItems) {
      map.get(getDateGroup(a.timestamp))!.push(a);
    }
    return map;
  }, [regularItems]);

  const compactItems = useMemo(() => {
    if (variant !== "compact") return null;
    return [...pinnedItems, ...regularItems].slice(0, compactLimit);
  }, [variant, pinnedItems, regularItems, compactLimit]);

  const hasMore = variant === "compact" && filteredActivities.length > compactLimit;

  // ── Density helpers ──
  const isCompactDensity = density === "compact";
  const iconSize = isCompactDensity ? "h-3.5 w-3.5" : "h-4 w-4";
  const iconPad = isCompactDensity ? "p-1.5" : "p-2";
  const rowPy = isCompactDensity ? "py-2" : "py-2.5";

  /* ── Render row ── */

  const renderRow = useCallback(
    (activity: Activity, isUnread: boolean, animate: boolean = true) => {
      const Icon = activityIcons[activity.type] || Clock;
      const style = activityStyles[activity.type] ?? activityStyles.stamp;
      const ts = new Date(activity.timestamp);
      const exactTime = format(ts, "d. MMM yyyy 'kl.' HH:mm", { locale: nb });
      const relTime = formatDistanceToNow(ts, { addSuffix: true, locale: nb });
      const clickable = !!onActivityClick;
      const hasActions = !!onAction;
      const showMenu = actionMenuId === activity.id;

      const inner = (
        <button
          key={activity.id}
          type="button"
          role="article"
          tabIndex={0}
          onClick={() => {
            markRead(activity.id);
            onActivityClick?.(activity);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              markRead(activity.id);
              onActivityClick?.(activity);
            }
          }}
          onMouseEnter={() => hasActions && setActionMenuId(activity.id)}
          onMouseLeave={() => hasActions && setActionMenuId(null)}
          className={cn(
            "group relative flex w-full items-start gap-3 rounded-xl border text-left transition-all",
            "px-3",
            rowPy,
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F6B73] focus-visible:ring-offset-1 dark:focus-visible:ring-[#51C2D0]",
            clickable
              ? "cursor-pointer hover:border-[#dbe6e2] dark:hover:border-border hover:bg-white/80 dark:hover:bg-muted"
              : "cursor-default",
            isUnread
              ? cn(
                  "border-l-[3px] border-t-transparent border-r-transparent border-b-transparent bg-[#f6fbfa] dark:bg-[#0f1f25]",
                  style.border,
                )
              : "border-transparent",
          )}
          data-testid={`activity-item-${activity.id}`}
        >
          {/* Icon capsule */}
          <div className={cn("shrink-0 rounded-full", iconPad, style.capsule)}>
            <Icon className={iconSize} />
          </div>

          {/* Content – 2-line layout */}
          <div className="min-w-0 flex-1">
            {/* Line 1: user + action + timestamp on right */}
            <div className="flex items-baseline justify-between gap-2">
              <p className="truncate text-sm font-medium leading-snug text-[#24383e] dark:text-foreground">
                {activity.user && (
                  <span className="font-semibold">{activity.user}</span>
                )}
              </p>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="shrink-0 whitespace-nowrap text-[11px] text-[#5d6d72] dark:text-muted-foreground">
                    {relTime}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="left" className="text-xs">
                  {exactTime}
                </TooltipContent>
              </Tooltip>
            </div>

            {/* Line 2: message + tags + status */}
            <p className="mt-0.5 text-[13px] leading-snug text-[#4a5c62] dark:text-muted-foreground">
              {activity.message}
            </p>

            {/* Tags + status pills */}
            {((activity.tags && activity.tags.length > 0) || activity.status) && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1">
                {activity.tags?.map((tag) => (
                  <Badge
                    key={tag}
                    variant="outline"
                    className="text-[9px] px-1.5 py-0 h-[18px] border-[#dbe6e2] dark:border-border text-[#5d6d72] dark:text-muted-foreground font-medium"
                  >
                    {tag}
                  </Badge>
                ))}
                {activity.status && (
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[9px] px-1.5 py-0 h-[18px] font-semibold",
                      statusPillClass(activity.status),
                    )}
                  >
                    {activity.status}
                  </Badge>
                )}
              </div>
            )}
          </div>

          {/* Right side: unread dot + actions + chevron */}
          <div className="flex shrink-0 items-center gap-1 self-center">
            {isUnread && (
              <span className="h-2 w-2 rounded-full bg-[#1F6B73] dark:bg-[#51C2D0]" />
            )}
            {/* Quick action button (hover only) */}
            {hasActions && showMenu && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    role="button"
                    tabIndex={-1}
                    onClick={(e) => {
                      e.stopPropagation();
                      onAction?.(activity, "menu");
                    }}
                    className="rounded-md p-0.5 text-[#5d6d72] hover:bg-[#dbe6e2] dark:hover:bg-border transition-colors"
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="left" className="text-xs">
                  Handlinger
                </TooltipContent>
              </Tooltip>
            )}
            {clickable && (
              <ChevronRight className="h-4 w-4 text-[#5d6d72]/0 transition-colors group-hover:text-[#5d6d72] dark:group-hover:text-muted-foreground" />
            )}
          </div>
        </button>
      );

      if (!animate || reduceMotion) return inner;

      return (
        <motion.div
          key={activity.id}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
        >
          {inner}
        </motion.div>
      );
    },
    [
      onActivityClick,
      onAction,
      markRead,
      actionMenuId,
      iconSize,
      iconPad,
      rowPy,
      reduceMotion,
    ],
  );

  /* ── Loading skeleton ── */
  if (loading) {
    return (
      <Card
        className="rounded-2xl border-[#d8e4e0] dark:border-border bg-[linear-gradient(180deg,#ffffff,#f7fbf9)] dark:bg-card shadow-[0_12px_30px_rgba(20,58,65,0.07)] dark:shadow-none"
        data-testid="activity-feed-skeleton"
        aria-busy="true"
      >
        {title && (
          <CardHeader className="pb-3">
            <CardTitle className="text-2xl font-semibold tracking-tight text-[#153c46] dark:text-foreground">
              {title}
            </CardTitle>
          </CardHeader>
        )}
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
                <Skeleton className="h-3 w-16 self-start mt-0.5" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  /* ── Empty state with ghost preview row ── */
  const emptyState = (
    <div className="flex flex-col items-center py-10 text-center text-[#5f6f74] dark:text-muted-foreground">
      <Bell className="h-9 w-9 mb-3 opacity-20" />
      <p className="text-sm font-medium">Ingen aktivitet ennå</p>
      <p className="mt-1 max-w-[280px] text-xs opacity-70 leading-relaxed">
        Aktivitet vises når det registreres timer, legges til brukere eller sendes inn rapporter.
      </p>
      {/* Ghost preview row */}
      <div className="mt-5 w-full max-w-[320px] opacity-30 pointer-events-none" aria-hidden="true">
        <div className="flex items-start gap-3 rounded-xl border border-dashed border-[#dbe6e2] dark:border-border px-3 py-2.5">
          <div className="shrink-0 rounded-full bg-muted p-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0 text-left">
            <div className="flex justify-between">
              <span className="text-sm font-medium text-muted-foreground">Bruker</span>
              <span className="text-[11px] text-muted-foreground">nettopp</span>
            </div>
            <p className="mt-0.5 text-[13px] text-muted-foreground">registrerte 2.5 timer</p>
          </div>
        </div>
      </div>
    </div>
  );

  /* ── Sticky section header ── */
  const SectionHeader = ({ label }: { label: string }) => (
    <div className="sticky top-0 z-10 flex items-center gap-2 px-1 pb-1 pt-3 first:pt-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(247,251,249,0.95))] dark:bg-[linear-gradient(180deg,rgba(15,25,30,0.95),rgba(19,35,42,0.95))] backdrop-blur-sm">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-[#5d6d72]/70 dark:text-muted-foreground/70">
        {label}
      </span>
      <span className="h-px flex-1 bg-[#dbe6e2] dark:bg-border" />
    </div>
  );

  /* ── Pinned section ── */
  const pinnedSection =
    pinnedItems.length > 0 ? (
      <div className="mb-2">
        <div className="sticky top-0 z-10 flex items-center gap-2 px-1 pb-1 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(247,251,249,0.95))] dark:bg-[linear-gradient(180deg,rgba(15,25,30,0.95),rgba(19,35,42,0.95))] backdrop-blur-sm">
          <AlertCircle className="h-3 w-3 text-amber-500" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
            Viktig
          </span>
          <span className="h-px flex-1 bg-amber-200/60 dark:bg-amber-800/40" />
        </div>
        <div className="space-y-1">
          <AnimatePresence initial={false}>
            {pinnedItems.map((a) => renderRow(a, !readIds.has(a.id)))}
          </AnimatePresence>
        </div>
      </div>
    ) : null;

  /* ── Filter bar (renders inside both variants when title is present) ── */
  const filterBar = (
    <div className="flex flex-wrap items-center gap-2 mb-3">
      <div className="flex items-center gap-0.5 rounded-lg border border-[#dbe6e2] dark:border-border bg-white/60 dark:bg-[#0f191e]/60 p-0.5">
        <Filter className="h-3 w-3 ml-1.5 text-[#5d6d72]/60 dark:text-muted-foreground/60" />
        {FILTER_OPTIONS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTypeFilter(key)}
            className={cn(
              "rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors",
              typeFilter === key
                ? "bg-[#1F6B73] dark:bg-[#51C2D0] text-white dark:text-[#0e1a1f] shadow-sm"
                : "text-[#5d6d72] dark:text-muted-foreground hover:text-[#24383e] dark:hover:text-foreground hover:bg-[#f0f5f3] dark:hover:bg-[#1a2e36]",
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );

  /* ── Header block (shared between variants) ── */
  const headerBlock = title ? (
    <CardHeader className="pb-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CardTitle className="text-2xl font-semibold tracking-tight text-[#153c46] dark:text-foreground">
            {title}
          </CardTitle>
          {todayCount > 0 && (
            <Badge
              variant="outline"
              className="text-[10px] border-[#dbe6e2] dark:border-border text-[#5d6d72] dark:text-muted-foreground"
            >
              {todayCount} i dag
            </Badge>
          )}
          {unreadCount > 0 && (
            <Badge className="text-[10px] bg-[#1F6B73] dark:bg-[#51C2D0] text-white dark:text-[#0e1a1f]">
              {unreadCount} nye
            </Badge>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={markAllRead}
            className="text-[11px] font-medium text-[#1F6B73] dark:text-[#51C2D0] hover:underline"
          >
            Merk alle som lest
          </button>
        )}
      </div>
    </CardHeader>
  ) : null;

  /* ═══════════════════════════════════════════════════
     Compact variant
     ═══════════════════════════════════════════════════ */
  if (variant === "compact") {
    return (
      <Card
        className="rounded-2xl border-[#d8e4e0] dark:border-border bg-[linear-gradient(180deg,#ffffff,#f7fbf9)] dark:bg-card shadow-[0_12px_30px_rgba(20,58,65,0.07)] dark:shadow-none"
        data-testid="activity-feed"
        role="feed"
        aria-busy={false}
      >
        {headerBlock}
        <CardContent className={title ? "" : "pt-0"}>
          {filteredActivities.length === 0 ? (
            emptyState
          ) : (
            <>
              {filterBar}
              <div className="space-y-1">
                <AnimatePresence initial={false}>
                  {compactItems!.map((a) => renderRow(a, !readIds.has(a.id)))}
                </AnimatePresence>
              </div>
              {hasMore && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-2 w-full text-xs text-[#1F6B73] dark:text-[#51C2D0] hover:bg-[#1F6B73]/5"
                  onClick={onShowAll}
                >
                  Vis alle ({filteredActivities.length})
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  /* ═══════════════════════════════════════════════════
     Full variant (grouped, scrollable, sticky headers)
     ═══════════════════════════════════════════════════ */
  return (
    <Card
      className="rounded-2xl border-[#d8e4e0] dark:border-border bg-[linear-gradient(180deg,#ffffff,#f7fbf9)] dark:bg-card shadow-[0_12px_30px_rgba(20,58,65,0.07)] dark:shadow-none"
      data-testid="activity-feed"
      role="feed"
      aria-busy={false}
    >
      {headerBlock}
      <CardContent className={title ? "p-0" : "p-0 pt-0"}>
        <div className="px-6 pt-1">{filterBar}</div>
        <ScrollArea className="h-[420px]" ref={scrollRef}>
          <div className="px-6 pb-6">
            {filteredActivities.length === 0 ? (
              emptyState
            ) : (
              <>
                {pinnedSection}
                {GROUP_ORDER.map((group) => {
                  const items = grouped.get(group);
                  if (!items || items.length === 0) return null;
                  return (
                    <div key={group}>
                      <SectionHeader label={groupLabels[group]} />
                      <div className="space-y-1">
                        <AnimatePresence initial={false}>
                          {items.map((a) =>
                            renderRow(a, !readIds.has(a.id)),
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

export const ActivityFeed = memo(ActivityFeedComponent);
