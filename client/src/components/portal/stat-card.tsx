import { Card, CardContent } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Minus, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMemo } from "react";
import type { ReactNode } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";

/* ═══════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════ */

interface TrendData {
  /** Percentage change (e.g. 12.3) */
  value: number;
  /** Positive=good – drives colour (green vs red) */
  isPositive: boolean;
  /** Absolute value from the previous period – used to compute Δ */
  previousValue?: number;
}

type StatVariant = "primary" | "success" | "warning" | "danger" | "info" | "neutral";
type TrendDirection = "goodUp" | "goodDown";

interface StatCardProps {
  /** Stable ID for tests – falls back to title slug */
  statId?: string;
  title: string;
  /** Pre-formatted display value OR a raw number */
  value: string | number;
  icon: ReactNode;
  trend?: TrendData;
  /** Semantic direction: "goodUp" = increase is green, "goodDown" = decrease is green */
  trendDirection?: TrendDirection;
  /** Colour variant controlling icon capsule tint */
  variant?: StatVariant;
  /** @deprecated — use `variant` instead. Kept for backwards compat */
  colorClass?: string;
  /** Unit appended to numeric value (e.g. "t", "kr", "%") */
  unit?: string;
  /** Period label, e.g. "Siste 7 dager", "Uke 7", "Denne måneden" */
  periodLabel?: string;
  /** Tooltip explaining what the KPI means */
  description?: string;
  /** Subtitle line shown under main value (tiny muted text) */
  subtitle?: string;
  /** If set, the card renders as a clickable element */
  onClick?: () => void;
  /** Text displayed when trend data doesn't exist yet */
  noTrendLabel?: string;
  /** Show skeleton loader inside the card */
  loading?: boolean;
  /** If true or string, show an empty-data state instead of 0 */
  emptyLabel?: string | boolean;
  /** Sparkline data points (12–30 numeric values), rendered as a subtle line chart */
  sparkline?: number[];
}

/* ═══════════════════════════════════════════════════
   Variant → icon capsule styles + sparkline stroke
   ═══════════════════════════════════════════════════ */

interface VariantStyle {
  capsule: string;
  /** Sparkline stroke colour (light mode) */
  spark: string;
  /** Sparkline stroke colour (dark mode) */
  sparkDark: string;
}

const VARIANT_STYLES: Record<StatVariant, VariantStyle> = {
  primary: {
    capsule:
      "bg-[#1F6B73]/10 dark:bg-[#51C2D0]/10 text-[#1F6B73] dark:text-[#51C2D0] border-[#1F6B73]/15 dark:border-[#51C2D0]/15",
    spark: "#1F6B73",
    sparkDark: "#51C2D0",
  },
  success: {
    capsule:
      "bg-emerald-500/10 dark:bg-emerald-400/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/15 dark:border-emerald-400/15",
    spark: "#059669",
    sparkDark: "#34d399",
  },
  warning: {
    capsule:
      "bg-amber-500/10 dark:bg-amber-400/10 text-amber-600 dark:text-amber-400 border-amber-500/15 dark:border-amber-400/15",
    spark: "#d97706",
    sparkDark: "#fbbf24",
  },
  danger: {
    capsule:
      "bg-red-500/10 dark:bg-red-400/10 text-red-600 dark:text-red-400 border-red-500/15 dark:border-red-400/15",
    spark: "#dc2626",
    sparkDark: "#f87171",
  },
  info: {
    capsule:
      "bg-sky-500/10 dark:bg-sky-400/10 text-sky-600 dark:text-sky-400 border-sky-500/15 dark:border-sky-400/15",
    spark: "#0284c7",
    sparkDark: "#38bdf8",
  },
  neutral: {
    capsule:
      "bg-[#5d6d72]/10 dark:bg-muted text-[#5d6d72] dark:text-muted-foreground border-[#5d6d72]/10 dark:border-border",
    spark: "#5d6d72",
    sparkDark: "#94a3b8",
  },
};

/* ═══════════════════════════════════════════════════
   Value formatting
   ═══════════════════════════════════════════════════ */

/**
 * Format a raw number with Norwegian thousands-separator and optional unit.
 * String values pass through unchanged.
 */
function formatValue(value: string | number, unit?: string): string {
  if (typeof value === "string") return value;
  const formatted = Number.isInteger(value)
    ? value.toLocaleString("nb-NO")
    : value.toLocaleString("nb-NO", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      });
  return unit ? `${formatted}${unit}` : formatted;
}

/** Compute absolute Δ between current value and previousValue */
function computeDelta(
  currentValue: string | number,
  previousValue: number | undefined,
  unit?: string,
): string | null {
  if (previousValue === undefined) return null;
  const current =
    typeof currentValue === "number"
      ? currentValue
      : parseFloat(currentValue.replace(/[^\d.,-]/g, "").replace(",", "."));
  if (isNaN(current)) return null;
  if (previousValue === 0) return "ny";
  const delta = current - previousValue;
  const abs = Math.abs(delta);
  const formatted =
    abs >= 100
      ? Math.round(abs).toLocaleString("nb-NO")
      : abs.toFixed(1).replace(".", ",");
  const sign = delta >= 0 ? "+" : "\u2212";
  return `${sign}${formatted}${unit ?? ""}`;
}

/* ═══════════════════════════════════════════════════
   Sparkline sub-component
   ═══════════════════════════════════════════════════ */

function Sparkline({
  data,
  stroke,
}: {
  data: number[];
  stroke: string;
}) {
  const chartData = useMemo(() => data.map((v) => ({ v })), [data]);
  return (
    <div className="h-8 w-[72px] shrink-0 opacity-60">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 2, right: 1, bottom: 2, left: 1 }}>
          <Line
            type="monotone"
            dataKey="v"
            stroke={stroke}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════ */

export function StatCard({
  statId,
  title,
  value,
  icon,
  trend,
  trendDirection,
  variant = "primary",
  colorClass,
  unit,
  periodLabel,
  description,
  subtitle,
  onClick,
  noTrendLabel,
  loading,
  emptyLabel,
  sparkline,
}: StatCardProps) {
  const testId =
    statId ??
    `stat-card-${title
      .toLowerCase()
      .replace(/[æ]/g, "ae")
      .replace(/[ø]/g, "oe")
      .replace(/[å]/g, "aa")
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")}`;

  const clickable = !!onClick;
  const vs = VARIANT_STYLES[variant];
  const capsuleStyle = colorClass
    ? cn(
        "border bg-[#e7f3ee] dark:bg-muted border-[#d5e5df] dark:border-border",
        colorClass,
      )
    : cn("border", vs.capsule);

  // Detect dark mode for sparkline colour
  const isDark =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark");
  const sparkStroke = isDark ? vs.sparkDark : vs.spark;

  // Resolve trend isPositive via trendDirection if provided
  const resolvedIsPositive = useMemo(() => {
    if (!trend) return false;
    if (trendDirection === "goodDown") return trend.value <= 0;
    if (trendDirection === "goodUp") return trend.value >= 0;
    return trend.isPositive;
  }, [trend, trendDirection]);

  /* ── Empty check ── */
  const showEmpty =
    emptyLabel !== undefined &&
    emptyLabel !== false &&
    (value === 0 || value === "" || value === null || value === undefined);
  const emptyText =
    typeof emptyLabel === "string" ? emptyLabel : "Ingen data ennå";

  /* ── Loading skeleton ── */
  if (loading) {
    return (
      <Card
        className={cn(
          "overflow-visible rounded-2xl border-[#d8e4e0] dark:border-border",
          "bg-[linear-gradient(180deg,#ffffff,#f7fbf9)] dark:bg-card",
          "shadow-[0_12px_30px_rgba(20,58,65,0.07)] dark:shadow-none",
          "ring-1 ring-black/[0.04] dark:ring-white/[0.04]",
        )}
        data-testid={testId}
        aria-busy="true"
      >
        <CardContent className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1 min-h-[88px]">
              <Skeleton className="h-4 w-24 mb-3" />
              <Skeleton className="h-8 w-20 mb-2" />
              <Skeleton className="h-[22px] w-32 rounded-full" />
            </div>
            <Skeleton className="h-11 w-11 shrink-0 rounded-xl" />
          </div>
        </CardContent>
      </Card>
    );
  }

  /* ── Trend rendering ── */
  const trendPill = (() => {
    if (!trend) {
      if (noTrendLabel) {
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-[#dbe6e2] dark:border-border bg-[#f7fbf9] dark:bg-muted px-2 py-0.5 text-[11px] font-medium text-[#5d6d72] dark:text-muted-foreground tabular-nums">
            <Minus className="h-3 w-3 opacity-50" />
            {noTrendLabel}
          </span>
        );
      }
      return null;
    }

    const isZero = trend.value === 0;
    const pillColor = isZero
      ? "border-[#dbe6e2] dark:border-border bg-[#f7fbf9] dark:bg-muted text-[#5d6d72] dark:text-muted-foreground"
      : resolvedIsPositive
        ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400"
        : "border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400";

    const TrendIcon = isZero
      ? Minus
      : trend.value >= 0
        ? TrendingUp
        : TrendingDown;

    const pctLabel = `${trend.value > 0 ? "+" : ""}${trend.value.toFixed(1)}%`;
    const delta = computeDelta(value, trend.previousValue, unit);
    const periodText = periodLabel ?? "vs forrige periode";

    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {/* Pill */}
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-none tabular-nums",
            pillColor,
          )}
        >
          <TrendIcon className="h-3 w-3" />
          {pctLabel}
        </span>
        {/* Absolute delta */}
        {delta && (
          <span className="text-[11px] font-medium text-[#5d6d72] dark:text-muted-foreground tabular-nums">
            ({delta})
          </span>
        )}
        {/* Period label */}
        <span className="text-[11px] text-[#5d6d72]/70 dark:text-muted-foreground/60">
          {periodText}
        </span>
      </div>
    );
  })();

  /* ── Card content ── */
  const content = (
    <CardContent className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 min-h-[88px]">
          {/* Title + info tooltip */}
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-medium text-[#5f7075] dark:text-muted-foreground">
              {title}
            </p>
            {description && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 shrink-0 text-[#5d6d72]/40 dark:text-muted-foreground/40 hover:text-[#5d6d72] dark:hover:text-muted-foreground transition-colors cursor-help" />
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  className="max-w-[220px] text-xs leading-relaxed"
                >
                  {description}
                </TooltipContent>
              </Tooltip>
            )}
          </div>

          {/* Value — responsive, tabular nums */}
          {showEmpty ? (
            <p className="mt-2 text-sm font-medium text-[#5d6d72] dark:text-muted-foreground italic">
              {emptyText}
            </p>
          ) : (
            <div className="mt-2 flex items-end gap-3">
              <p className="text-2xl font-semibold tracking-tight text-[#153c46] dark:text-foreground md:text-3xl tabular-nums">
                {formatValue(value, unit)}
              </p>
              {/* Sparkline sits next to the value */}
              {sparkline && sparkline.length >= 4 && (
                <Sparkline data={sparkline} stroke={sparkStroke} />
              )}
            </div>
          )}

          {/* Optional subtitle */}
          {subtitle && (
            <p className="mt-0.5 text-[11px] text-[#5d6d72]/70 dark:text-muted-foreground/60">
              {subtitle}
            </p>
          )}

          {/* Trend pill — always reserves vertical space for stable layout */}
          <div className="mt-2 min-h-[22px]">{trendPill}</div>
        </div>

        {/* Icon capsule — variant-driven */}
        <div className={cn("shrink-0 rounded-xl p-3", capsuleStyle)}>{icon}</div>
      </div>
    </CardContent>
  );

  /* ── Card wrapper ── */
  return (
    <Card
      className={cn(
        "overflow-visible rounded-2xl border-[#d8e4e0] dark:border-border",
        "bg-[linear-gradient(180deg,#ffffff,#f7fbf9)] dark:bg-card",
        "shadow-[0_12px_30px_rgba(20,58,65,0.07)] dark:shadow-none",
        "ring-1 ring-black/[0.04] dark:ring-white/[0.04]",
        clickable && [
          "cursor-pointer transition-all duration-150",
          "hover:shadow-[0_16px_36px_rgba(20,58,65,0.11)] dark:hover:shadow-[0_4px_16px_rgba(0,0,0,0.3)]",
          "hover:border-[#c8dad5] dark:hover:border-[hsl(222,40%,22%)]",
          "hover:-translate-y-0.5",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F6B73] dark:focus-visible:ring-[#51C2D0] focus-visible:ring-offset-2",
          "active:translate-y-0 active:shadow-[0_12px_30px_rgba(20,58,65,0.07)]",
        ],
      )}
      tabIndex={clickable ? 0 : undefined}
      role={clickable ? "button" : undefined}
      onClick={onClick}
      onKeyDown={
        clickable
          ? (e: React.KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      data-testid={testId}
    >
      {content}
    </Card>
  );
}
