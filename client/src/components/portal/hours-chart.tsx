import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LabelList } from "recharts";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

interface HoursChartProps {
  data: Array<{
    day: string;
    hours: number;
  }>;
  title?: string;
}

export function HoursChart({ data, title = "Timefordeling" }: HoursChartProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const totalHours = data.reduce((sum, entry) => sum + entry.hours, 0);
  const peakDay = data.reduce(
    (max, entry) => (entry.hours > max.hours ? entry : max),
    data[0] ?? { day: "-", hours: 0 },
  );
  const hasData = data.length > 0;
  
  const chartColors = {
    barStart: isDark ? "#63CEC2" : "#4E9A6F",
    barEnd: isDark ? "#329C9B" : "#1F6B73",
    barStroke: isDark ? "#8EE2D8" : "#1A5B62",
    grid: isDark ? "rgba(164, 193, 202, 0.42)" : "#C3D4CE",
    textStrong: isDark ? "#F3FCFA" : "#27434B",
    textMuted: isDark ? "#C4D7D4" : "#4E666D",
    title: isDark ? "#F6FCFB" : "#153C46",
    panelBg: isDark ? "rgba(14, 25, 31, 0.92)" : "rgba(255, 255, 255, 0.82)",
    panelBorder: isDark ? "#3E5862" : "#D1DFDA",
    cursor: isDark ? "rgba(99, 206, 194, 0.18)" : "rgba(31, 107, 115, 0.10)",
    emptyBg: isDark ? "rgba(14, 25, 31, 0.78)" : "rgba(255, 255, 255, 0.70)",
    emptyBorder: isDark ? "#3E5862" : "#C7D8D2",
    tooltip: {
      bg: resolvedTheme === "dark" ? "hsl(222 47% 11%)" : "hsl(0 0% 100%)",
      border: resolvedTheme === "dark" ? "#48646F" : "#C6D7D1",
      text: resolvedTheme === "dark" ? "#EEF9F6" : "#1E3840",
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
      data-testid="hours-chart"
    >
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle className="text-2xl font-semibold tracking-tight" style={{ color: chartColors.title }}>
              {title}
            </CardTitle>
            <p className="mt-1 text-sm" style={{ color: chartColors.textMuted }}>
              Timer fordelt per ukedag i valgt periode
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:min-w-[240px]">
            <div className="rounded-lg border px-3 py-2" style={{ backgroundColor: chartColors.panelBg, borderColor: chartColors.panelBorder }}>
              <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: chartColors.textMuted }}>
                Totalt
              </p>
              <p className="text-base font-semibold" style={{ color: chartColors.textStrong }}>
                {totalHours.toFixed(1)}t
              </p>
            </div>
            <div className="rounded-lg border px-3 py-2" style={{ backgroundColor: chartColors.panelBg, borderColor: chartColors.panelBorder }}>
              <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: chartColors.textMuted }}>
                Høyest
              </p>
              <p className="text-base font-semibold" style={{ color: chartColors.textStrong }}>
                {peakDay.day} ({peakDay.hours.toFixed(1)}t)
              </p>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <div
            className="h-[300px] flex items-center justify-center rounded-xl border border-dashed"
            style={{ borderColor: chartColors.emptyBorder, backgroundColor: chartColors.emptyBg }}
          >
            <p className="text-sm font-medium" style={{ color: chartColors.textMuted }}>
              Ingen timedata tilgjengelig
            </p>
          </div>
        ) : (
          <div className="rounded-xl border p-3 sm:p-4" style={{ backgroundColor: chartColors.panelBg, borderColor: chartColors.panelBorder }}>
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
                  tick={{ fill: chartColors.textStrong, fontSize: 13, fontWeight: 600 }}
                />
                <YAxis
                  width={42}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: chartColors.textMuted, fontSize: 12, fontWeight: 500 }}
                  tickFormatter={(value) => `${value}t`}
                  domain={[0, (max: number) => Math.max(8, Math.ceil(max + 1))]}
                />
                <Tooltip
                  cursor={{ fill: chartColors.cursor }}
                  contentStyle={{
                    backgroundColor: chartColors.tooltip.bg,
                    border: `1px solid ${chartColors.tooltip.border}`,
                    borderRadius: "10px",
                    boxShadow: "0 8px 24px rgba(15, 34, 41, 0.18)",
                  }}
                  labelStyle={{ fontWeight: 700, color: chartColors.tooltip.text }}
                  itemStyle={{ color: chartColors.tooltip.text, fontWeight: 600 }}
                  formatter={(value: number) => [`${value.toFixed(1)} timer`, "Timer"]}
                />
                <Bar
                  dataKey="hours"
                  fill="url(#hours-bar-gradient)"
                  stroke={chartColors.barStroke}
                  strokeWidth={1}
                  radius={[10, 10, 4, 4]}
                  maxBarSize={52}
                >
                  <LabelList
                    dataKey="hours"
                    position="top"
                    fill={chartColors.textStrong}
                    fontSize={12}
                    fontWeight={700}
                    formatter={(value: number) => (value > 0 ? `${value.toFixed(0)}t` : "")}
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
