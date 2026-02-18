import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LabelList, ReferenceLine } from "recharts";
import { BarChart3, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";
import { useMemo, useCallback } from "react";

/* ── Weekend day names (Norwegian abbreviations) ── */
const WEEKEND_DAYS = new Set(["Lør", "Lor", "Søn", "Son", "Lørdag", "Søndag"]);

interface HoursChartProps {
  data: Array<{
    day: string;
    hours: number;
  }>;
  title?: string;
  /** Daily goal in hours (e.g. 7.5) – shown as a reference line */
  goalHours?: number;
  /** Callback when user clicks "add entry" CTA in empty state */
  onAddEntry?: () => void;
}

export function HoursChart({
  data,
  title = "Timefordeling",
  goalHours,
  onAddEntry,
}: HoursChartProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  // ── Derived stats ──
  const totalHours = useMemo(() => data.reduce((sum, e) => sum + e.hours, 0), [data]);
  const daysWithData = useMemo(() => data.filter((e) => e.hours > 0).length, [data]);
  const avgHours = daysWithData > 0 ? totalHours / daysWithData : 0;
  const peakDay = useMemo(
    () =>
      data.reduce(
        (max, entry) => (entry.hours > max.hours ? entry : max),
        data[0] ?? { day: "-", hours: 0 },
      ),
    [data],
  );

  // "has data" = at least one entry with hours > 0 (all-zero is still "empty")
  const hasData = useMemo(() => data.length > 0 && data.some((e) => e.hours > 0), [data]);

  // ── Smart label formatter: 1-decimal for <2h, 0-decimal otherwise ──
  const formatBarLabel = useCallback((value: number) => {
    if (value <= 0) return "";
    return value < 2 ? `${value.toFixed(1)}t` : `${Math.round(value)}t`;
  }, []);

  // ── Smart Y-axis domain: 4t for low, 8t for mid, dynamic for high ──
  const yDomain = useMemo<[number, (max: number) => number]>(() => {
    return [0, (max: number) => {
      if (max < 4) return 4;
      if (max < 8) return 8;
      return Math.ceil(max + 1);
    }];
  }, []);

  // ── Custom tooltip content ──
  const renderTooltip = useCallback(
    (props: { active?: boolean; payload?: Array<{ payload: { day: string; hours: number } }>; label?: string }) => {
      if (!props.active || !props.payload?.length) return null;
      const entry = props.payload[0].payload;
      const pct = totalHours > 0 ? ((entry.hours / totalHours) * 100).toFixed(0) : "0";
      const isWeekend = WEEKEND_DAYS.has(entry.day);

      return (
        <div
          className="rounded-[10px] border px-3 py-2 shadow-[0_8px_24px_rgba(15,34,41,0.18)]"
          style={{
            backgroundColor: chartColors.tooltip.bg,
            borderColor: chartColors.tooltip.border,
          }}
        >
          <p className="text-sm font-bold" style={{ color: chartColors.tooltip.text }}>
            {entry.day}{isWeekend ? " (helg)" : ""}
          </p>
          <div className="mt-1 space-y-0.5 text-[12px]" style={{ color: chartColors.textMuted }}>
            {entry.hours > 0 ? (
              <>
                <p>Totalt: <span className="font-semibold" style={{ color: chartColors.tooltip.text }}>{entry.hours.toFixed(1)}t</span></p>
                <p>Andel: <span className="font-semibold" style={{ color: chartColors.tooltip.text }}>{pct}%</span></p>
                {goalHours != null && goalHours > 0 && (
                  <p>
                    {entry.hours >= goalHours ? "✓ Mål nådd" : `Avvik: ${(entry.hours - goalHours).toFixed(1)}t`}
                  </p>
                )}
              </>
            ) : (
              <p className="italic">Ingen timer registrert</p>
            )}
          </div>
        </div>
      );
    },
    [totalHours, goalHours],
  );

  // ── Custom X-axis tick: muted for weekends ──
  const renderXTick = useCallback(
    (props: { x: number; y: number; payload: { value: string } }) => {
      const { x, y, payload } = props;
      const isWeekend = WEEKEND_DAYS.has(payload.value);
      return (
        <text
          x={x}
          y={y + 14}
          textAnchor="middle"
          fill={isWeekend ? chartColors.textMuted : chartColors.textStrong}
          fontSize={13}
          fontWeight={isWeekend ? 500 : 600}
          opacity={isWeekend ? 0.65 : 1}
        >
          {payload.value}
        </text>
      );
    },
    [],
  );

  const chartColors = {
    barStart: isDark ? "#63CEC2" : "#4E9A6F",
    barEnd: isDark ? "#329C9B" : "#1F6B73",
    barStroke: isDark ? "rgba(142, 226, 216, 0.5)" : "transparent",
    grid: isDark ? "rgba(164, 193, 202, 0.42)" : "#C3D4CE",
    textStrong: isDark ? "#F3FCFA" : "#27434B",
    textMuted: isDark ? "#C4D7D4" : "#4E666D",
    title: isDark ? "#F6FCFB" : "#153C46",
    panelBg: isDark ? "rgba(14, 25, 31, 0.92)" : "rgba(255, 255, 255, 0.82)",
    panelBorder: isDark ? "#3E5862" : "#D1DFDA",
    cursor: isDark ? "rgba(99, 206, 194, 0.18)" : "rgba(31, 107, 115, 0.10)",
    emptyBg: isDark ? "rgba(14, 25, 31, 0.78)" : "rgba(255, 255, 255, 0.70)",
    emptyBorder: isDark ? "#3E5862" : "#C7D8D2",
    refLine: isDark ? "rgba(99, 206, 194, 0.55)" : "rgba(31, 107, 115, 0.45)",
    tooltip: {
      bg: isDark ? "hsl(222 47% 11%)" : "hsl(0 0% 100%)",
      border: isDark ? "#48646F" : "#C6D7D1",
      text: isDark ? "#EEF9F6" : "#1E3840",
    },
  };

  return (
    <Card
      className={cn(
        "rounded-2xl shadow-[0_12px_30px_rgba(20,58,65,0.07)]",
        isDark
          ? "border-[#344b54] bg-[linear-gradient(180deg,#0f191e,#13232a)]"
          : "border-[#d8e4e0] bg-[linear-gradient(180deg,#ffffff,#f7fbf9)]",
      )}
      style={{
        '--hc-title': chartColors.title,
        '--hc-text-muted': chartColors.textMuted,
        '--hc-text-strong': chartColors.textStrong,
        '--hc-panel-bg': chartColors.panelBg,
        '--hc-panel-border': chartColors.panelBorder,
        '--hc-empty-bg': chartColors.emptyBg,
        '--hc-empty-border': chartColors.emptyBorder,
      } as React.CSSProperties}
      data-testid="hours-chart"
    >
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle className="text-2xl font-semibold tracking-tight text-[var(--hc-title)]">
              {title}
            </CardTitle>
            <p className="mt-1 text-[13px] text-[var(--hc-text-muted)]">
              Fordelt per ukedag
            </p>
          </div>
          {/* Stats chips – 3 columns on md+, 2 on mobile */}
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 sm:min-w-[240px] md:min-w-[360px]">
            <div className="rounded-lg border px-3 py-2 bg-[var(--hc-panel-bg)] border-[var(--hc-panel-border)]">
              <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--hc-text-muted)]">
                Totalt
              </p>
              <p className="text-base font-semibold text-[var(--hc-text-strong)]">
                {totalHours.toFixed(1)}t
              </p>
            </div>
            <div className="rounded-lg border px-3 py-2 bg-[var(--hc-panel-bg)] border-[var(--hc-panel-border)]">
              <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--hc-text-muted)]">
                Høyest
              </p>
              <p className="text-base font-semibold text-[var(--hc-text-strong)]">
                {peakDay.hours.toFixed(1)}t
              </p>
              <p className="text-[10px] text-[var(--hc-text-muted)] leading-tight">{peakDay.day}</p>
            </div>
            <div className="rounded-lg border px-3 py-2 bg-[var(--hc-panel-bg)] border-[var(--hc-panel-border)]">
              <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--hc-text-muted)]">
                Snitt
              </p>
              <p className="text-base font-semibold text-[var(--hc-text-strong)]">
                {avgHours.toFixed(1)}t
              </p>
              <p className="text-[10px] text-[var(--hc-text-muted)] leading-tight">per dag</p>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <div
            className="h-[300px] flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--hc-empty-border)] bg-[var(--hc-empty-bg)] gap-3"
          >
            <BarChart3 className="h-10 w-10 text-[var(--hc-text-muted)] opacity-30" />
            <div className="text-center">
              <p className="text-sm font-medium text-[var(--hc-text-muted)]">
                Ingen timedata tilgjengelig
              </p>
              <p className="mt-0.5 text-xs text-[var(--hc-text-muted)] opacity-70">
                Registrer timer for å se fordeling per ukedag.
              </p>
            </div>
            {onAddEntry && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-1 rounded-lg border-[var(--hc-panel-border)] text-[var(--hc-text-muted)] hover:text-[var(--hc-text-strong)]"
                onClick={onAddEntry}
              >
                <Plus className="h-4 w-4 mr-1" />
                Legg til registrering
              </Button>
            )}
          </div>
        ) : (
          <div
            className="rounded-xl border p-3 sm:p-4 bg-[var(--hc-panel-bg)] border-[var(--hc-panel-border)]"
            role="img"
            aria-label={`Stolpediagram: ${title}. Totalt ${totalHours.toFixed(1)} timer, høyest ${peakDay.day} med ${peakDay.hours.toFixed(1)} timer, snitt ${avgHours.toFixed(1)} timer per dag.`}
          >
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data} margin={{ top: 22, right: 16, left: 4, bottom: 4 }} barCategoryGap="24%">
                <defs>
                  <linearGradient id="hours-bar-gradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chartColors.barStart} />
                    <stop offset="100%" stopColor={chartColors.barEnd} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 4"
                  stroke={chartColors.grid}
                  vertical={false}
                />
                <XAxis
                  dataKey="day"
                  axisLine={false}
                  tickLine={false}
                  tick={renderXTick as any}
                />
                <YAxis
                  width={42}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: chartColors.textMuted, fontSize: 12, fontWeight: 500 }}
                  tickFormatter={(value) => `${value}t`}
                  domain={yDomain}
                />
                {/* Goal reference line */}
                {goalHours != null && goalHours > 0 && (
                  <ReferenceLine
                    y={goalHours}
                    stroke={chartColors.refLine}
                    strokeDasharray="6 4"
                    strokeWidth={1.5}
                    label={{
                      value: `Mål ${goalHours}t`,
                      position: "right",
                      fill: chartColors.textMuted,
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  />
                )}
                <Tooltip
                  cursor={{ fill: chartColors.cursor }}
                  content={renderTooltip as any}
                />
                <Bar
                  dataKey="hours"
                  fill="url(#hours-bar-gradient)"
                  stroke={chartColors.barStroke}
                  strokeWidth={isDark ? 0.5 : 0}
                  radius={[10, 10, 4, 4]}
                  maxBarSize={52}
                >
                  <LabelList
                    dataKey="hours"
                    position="top"
                    fill={chartColors.textStrong}
                    fontSize={12}
                    fontWeight={700}
                    formatter={formatBarLabel}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
