/**
 * StuckStatsPage — visualisations for the stuck-detection telemetry.
 * Shows time-series, per-variant CTR comparison, action funnel, and a
 * top-pages table. Read from /api/cms/stuck-stats with selectable range.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Bar, BarChart, Cell, Line, LineChart, Pie, PieChart,
  CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { BarChart3, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatsRow { reason: string; variantId: string | null; action: string; count: number }
interface DailyRow { day: string; reason: string; action: string; count: number }
interface PathRow { path: string; shown: number }
interface StatsResponse { days: number; rows: StatsRow[]; daily: DailyRow[]; topPaths: PathRow[] }

const REASONS = ["all", "idle", "nav", "dialog"] as const;
const REASON_LABEL: Record<string, string> = {
  all: "Alle",
  idle: "Inaktiv",
  nav: "Navigering",
  dialog: "Dialog",
};
const ACTION_COLOR: Record<string, string> = {
  shown:     "#94a3b8",   // slate-400
  tour:      "#10b981",   // emerald-500
  guide:     "#3b82f6",   // blue-500
  dismissed: "#f97316",   // orange-500
};
const ACTION_LABEL: Record<string, string> = {
  shown: "Vist",
  tour: "Startet omvisning",
  guide: "Åpnet guide",
  dismissed: "Avvist",
};

export function StuckStatsPage() {
  const [days, setDays] = useState(30);
  const [reasonFilter, setReasonFilter] = useState<typeof REASONS[number]>("all");

  const { data, isLoading, refetch, isFetching } = useQuery<StatsResponse>({
    queryKey: ["/api/cms/stuck-stats/full", days],
    queryFn: async () => {
      const res = await fetch(`/api/cms/stuck-stats?days=${days}`, { credentials: "include" });
      if (!res.ok) throw new Error("Kunne ikke hente statistikk");
      return res.json();
    },
    staleTime: 60_000,
  });

  const filteredRows = useMemo(
    () => (data?.rows ?? []).filter((r) => reasonFilter === "all" || r.reason === reasonFilter),
    [data?.rows, reasonFilter],
  );

  const totals = useMemo(() => {
    const sum = (action: string) =>
      filteredRows.filter((r) => r.action === action).reduce((s, r) => s + r.count, 0);
    const shown = sum("shown");
    const tour = sum("tour");
    const guide = sum("guide");
    const dismissed = sum("dismissed");
    const ctr = shown > 0 ? Math.round(((tour + guide) / shown) * 100) : 0;
    return { shown, tour, guide, dismissed, ctr };
  }, [filteredRows]);

  const variantBars = useMemo(() => {
    // Per (reason, variantId) compute shown + actions and CTR
    const map = new Map<string, { reason: string; variantId: string; shown: number; tour: number; guide: number; dismissed: number }>();
    for (const r of filteredRows) {
      const key = `${r.reason}::${r.variantId ?? "control"}`;
      const cur = map.get(key) ?? { reason: r.reason, variantId: r.variantId ?? "control", shown: 0, tour: 0, guide: 0, dismissed: 0 };
      (cur as any)[r.action] = ((cur as any)[r.action] ?? 0) + r.count;
      map.set(key, cur);
    }
    return Array.from(map.values()).map((v) => ({
      label: `${REASON_LABEL[v.reason] ?? v.reason} · ${v.variantId}`,
      reason: v.reason,
      variantId: v.variantId,
      shown: v.shown,
      tour: v.tour,
      guide: v.guide,
      dismissed: v.dismissed,
      ctr: v.shown > 0 ? Math.round(((v.tour + v.guide) / v.shown) * 100) : 0,
    })).sort((a, b) => b.shown - a.shown);
  }, [filteredRows]);

  const timeSeries = useMemo(() => {
    // Pivot daily rows into per-day series with action counts.
    const filtered = (data?.daily ?? []).filter((r) => reasonFilter === "all" || r.reason === reasonFilter);
    const byDay = new Map<string, { day: string; shown: number; tour: number; guide: number; dismissed: number }>();
    for (const r of filtered) {
      const dayKey = new Date(r.day).toISOString().slice(0, 10);
      const cur = byDay.get(dayKey) ?? { day: dayKey, shown: 0, tour: 0, guide: 0, dismissed: 0 };
      (cur as any)[r.action] = ((cur as any)[r.action] ?? 0) + r.count;
      byDay.set(dayKey, cur);
    }
    return Array.from(byDay.values()).sort((a, b) => a.day.localeCompare(b.day));
  }, [data?.daily, reasonFilter]);

  const funnelSlices = useMemo(() => {
    return [
      { name: "Startet omvisning", value: totals.tour,      color: ACTION_COLOR.tour },
      { name: "Åpnet guide",       value: totals.guide,     color: ACTION_COLOR.guide },
      { name: "Avvist",            value: totals.dismissed, color: ACTION_COLOR.dismissed },
      { name: "Ingen handling",    value: Math.max(0, totals.shown - totals.tour - totals.guide - totals.dismissed), color: "#e2e8f0" },
    ].filter((s) => s.value > 0);
  }, [totals]);

  return (
    <div className="space-y-4">
      {/* Header / controls */}
      <div className="flex items-center justify-between gap-3 sticky top-0 bg-background/95 backdrop-blur z-10 py-3 border-b">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-sm">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold leading-tight">Sitter‑fast‑statistikk</h2>
            <p className="text-xs text-muted-foreground">
              Visninger, handlinger og A/B‑variantytelse
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-md border bg-background">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium",
                  days === d ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {d}d
              </button>
            ))}
          </div>
          <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {/* Reason filter chips */}
      <div className="flex flex-wrap gap-2">
        {REASONS.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setReasonFilter(r)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              reasonFilter === r
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground hover:border-primary/40",
            )}
          >
            {REASON_LABEL[r]}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />Laster…
        </div>
      ) : totals.shown === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <BarChart3 className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Ingen sitter‑fast‑visninger registrert i denne perioden ennå.</p>
            <p className="text-xs mt-2">Data dukker opp etter hvert som brukere møter prompten.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPI tiles */}
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
            <KPI label="Vist" value={totals.shown} color="text-slate-600" />
            <KPI label="Startet omvisning" value={totals.tour} color="text-emerald-600" />
            <KPI label="Åpnet guide" value={totals.guide} color="text-blue-600" />
            <KPI label="Avvist" value={totals.dismissed} color="text-orange-600" />
            <KPI label="CTR" value={`${totals.ctr}%`} color={cn(totals.ctr >= 30 ? "text-emerald-600" : totals.ctr >= 15 ? "text-amber-600" : "text-slate-600")} hint="Tur + guide / vist" />
          </div>

          {/* Time series + funnel */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Daglige visninger og handlinger</CardTitle>
                <CardDescription>Per dag, siste {days} dager</CardDescription>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={timeSeries} margin={{ top: 4, right: 8, left: -8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="day" tick={{ fontSize: 10, fill: "currentColor" }} />
                    <YAxis tick={{ fontSize: 10, fill: "currentColor" }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
                      labelStyle={{ color: "hsl(var(--foreground))" }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {(["shown", "tour", "guide", "dismissed"] as const).map((action) => (
                      <Line
                        key={action}
                        type="monotone"
                        dataKey={action}
                        name={ACTION_LABEL[action]}
                        stroke={ACTION_COLOR[action]}
                        strokeWidth={2}
                        dot={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Handlingsfordeling</CardTitle>
                <CardDescription>Hva brukerne gjør når prompten dukker opp</CardDescription>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={funnelSlices}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={45}
                      outerRadius={80}
                      paddingAngle={2}
                    >
                      {funnelSlices.map((s) => (
                        <Cell key={s.name} fill={s.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Variant comparison */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Variant‑sammenligning (CTR)</CardTitle>
              <CardDescription>
                CTR = (omvisning + guide) / visninger. «control» = top‑level tittel/body.
              </CardDescription>
            </CardHeader>
            <CardContent className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={variantBars} layout="vertical" margin={{ top: 4, right: 16, left: 100, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 10, fill: "currentColor" }} />
                  <YAxis dataKey="label" type="category" tick={{ fontSize: 10, fill: "currentColor" }} width={180} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
                    formatter={(value: any, _: any, p: any) => {
                      const v = p?.payload;
                      return [
                        `CTR ${v.ctr}% · ${v.shown} vist · ${v.tour} omvisning · ${v.guide} guide · ${v.dismissed} avvist`,
                        "",
                      ];
                    }}
                  />
                  <Bar dataKey="ctr" radius={[0, 4, 4, 0]}>
                    {variantBars.map((v, i) => (
                      <Cell
                        key={i}
                        fill={v.ctr >= 30 ? "#10b981" : v.ctr >= 15 ? "#f59e0b" : "#94a3b8"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Top paths */}
          {(data?.topPaths?.length ?? 0) > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Toppsider — hvor brukere sitter fast</CardTitle>
                <CardDescription>De {data!.topPaths.length} sidene med flest visninger</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5">
                  {data!.topPaths.map((p) => {
                    const max = data!.topPaths[0].shown;
                    const pct = Math.round((p.shown / max) * 100);
                    return (
                      <div key={p.path} className="flex items-center gap-3 text-xs">
                        <code className="font-mono text-muted-foreground w-48 truncate shrink-0">{p.path}</code>
                        <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="font-semibold w-12 text-right tabular-nums">{p.shown}</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function KPI({ label, value, color, hint }: { label: string; value: number | string; color?: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={cn("text-2xl font-bold mt-1 tabular-nums", color)}>{value}</p>
        {hint && <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>}
      </CardContent>
    </Card>
  );
}
