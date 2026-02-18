import { Card, CardContent } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TrendingUp, TrendingDown, Minus, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

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

type StatVariant = "primary" | "success" | "warning" | "info" | "neutral";

interface StatCardProps {
  /** Stable ID for tests – falls back to title slug */
  statId?: string;
  title: string;
  /** Pre-formatted display value OR a raw number */
  value: string | number;
  icon: ReactNode;
  trend?: TrendData;
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
}

/* ═══════════════════════════════════════════════════
   Variant → icon capsule styles
   ═══════════════════════════════════════════════════ */

const VARIANT_STYLES: Record<StatVariant, string> = {
  primary:
    "bg-[#1F6B73]/10 dark:bg-[#51C2D0]/10 text-[#1F6B73] dark:text-[#51C2D0] border-[#1F6B73]/15 dark:border-[#51C2D0]/15",
  success:
    "bg-emerald-500/10 dark:bg-emerald-400/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/15 dark:border-emerald-400/15",
  warning:
    "bg-amber-500/10 dark:bg-amber-400/10 text-amber-600 dark:text-amber-400 border-amber-500/15 dark:border-amber-400/15",
  info: "bg-sky-500/10 dark:bg-sky-400/10 text-sky-600 dark:text-sky-400 border-sky-500/15 dark:border-sky-400/15",
  neutral:
    "bg-[#5d6d72]/10 dark:bg-muted text-[#5d6d72] dark:text-muted-foreground border-[#5d6d72]/10 dark:border-border",
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
  // Thousands-separated with space (nb-NO convention)
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
): string | null {
  if (previousValue === undefined) return null;
  const current =
    typeof currentValue === "number"
      ? currentValue
      : parseFloat(currentValue.replace(/[^\d.,-]/g, "").replace(",", "."));
  if (isNaN(current)) return null;
  if (previousValue === 0) return "ny";
  const delta = current - previousValue;
  const sign = delta >= 0 ? "+" : "";
  // Format with same precision as value
  const abs = Math.abs(delta);
  const formatted =
    abs >= 100
      ? Math.round(abs).toLocaleString("nb-NO")
      : abs.toFixed(1).replace(".", ",");
  return `${sign}${delta < 0 ? "-" : ""}${formatted}`;
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
  variant = "primary",
  colorClass,
  unit,
  periodLabel,
  description,
  subtitle,
  onClick,
  noTrendLabel,
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
  const capsuleStyle = colorClass
    ? cn(
        "border bg-[#e7f3ee] dark:bg-muted border-[#d5e5df] dark:border-border",
        colorClass,
      )
    : cn("border", VARIANT_STYLES[variant]);

  /* ── Trend rendering ── */
  const trendPill = (() => {
    if (!trend) {
      // No trend data at all
      if (noTrendLabel) {
        return (
          <span className="mt-2 inline-flex items-center gap-1 rounded-full border border-[#dbe6e2] dark:border-border bg-[#f7fbf9] dark:bg-muted px-2 py-0.5 text-[11px] font-medium text-[#5d6d72] dark:text-muted-foreground">
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
      : trend.isPositive
        ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400"
        : "border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400";

    const TrendIcon = isZero
      ? Minus
      : trend.isPositive
        ? TrendingUp
        : TrendingDown;

    const pctLabel = `${trend.value > 0 ? "+" : ""}${trend.value.toFixed(1)}%`;
    const delta = computeDelta(value, trend.previousValue);
    const periodText = periodLabel ?? "vs forrige periode";

    return (
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {/* Pill */}
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-none",
            pillColor,
          )}
        >
          <TrendIcon className="h-3 w-3" />
          {pctLabel}
        </span>
        {/* Absolute delta */}
        {delta && (
          <span className="text-[11px] font-medium text-[#5d6d72] dark:text-muted-foreground">
            ({delta}
            {unit ? unit : ""})
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
        <div className="min-w-0 flex-1">
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

          {/* Value — responsive typography */}
          <p className="mt-2 text-2xl font-semibold tracking-tight text-[#153c46] dark:text-foreground md:text-3xl">
            {formatValue(value, unit)}
          </p>

          {/* Optional subtitle */}
          {subtitle && (
            <p className="mt-0.5 text-[11px] text-[#5d6d72]/70 dark:text-muted-foreground/60">
              {subtitle}
            </p>
          )}

          {/* Trend pill */}
          {trendPill}
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
          ? (e) => {
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
