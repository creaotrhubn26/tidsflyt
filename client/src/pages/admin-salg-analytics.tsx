import { useState, useMemo } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { PortalLayout } from "@/components/portal/portal-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft, Download, TrendingUp, Users, DollarSign, BarChart3,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart, Line,
  BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";

interface Summary {
  leadCount: number;
  pipelineArrKr: number;
  weightedArrKr: number;
  avgDealSizeKr: number;
  activeCustomers: number;
  currentArrKr: number;
  currentMrrKr: number;
  newMrrInRangeKr: number;
}

interface ByTier {
  tierLabel: string;
  tierSlug: string;
  leadCount: number;
  pipelineArrKr: number;
  weightedArrKr: number;
  wonCount: number;
}

interface BySource {
  source: string;
  leadCount: number;
  wonCount: number;
  conversionPct: number;
  pipelineArrKr: number;
  weightedArrKr: number;
}

interface ByInstitution {
  institutionType: string;
  leadCount: number;
  wonCount: number;
  pipelineArrKr: number;
  weightedArrKr: number;
}

interface ByAssignee {
  assigneeLabel: string;
  assigneeEmail: string;
  leadCount: number;
  wonCount: number;
  pipelineArrKr: number;
  weightedArrKr: number;
}

interface FunnelStage {
  stageSlug: string;
  stageLabel: string;
  sortOrder: number;
  probabilityPct: number;
  isWon: boolean;
  leadCount: number;
  pipelineArrKr: number;
  sharePct: number;
}

interface MrrPoint {
  month: string;
  newMrrKr: number;
  churnedMrrKr: number;
  netMrrKr: number;
  cumulativeMrrKr: number;
  cumulativeArrKr: number;
  newCustomers: number;
  churnedCustomers: number;
}

interface TopCustomer {
  customerEmail: string;
  customerCompany: string | null;
  currentMrrKr: number;
  currentArrKr: number;
  signupAt: string | null;
  lastEventAt: string | null;
  eventCount: number;
  isChurned: boolean;
}

const COLORS = ["#1F6B73", "#66B8AA", "#FFB347", "#9B6DCC", "#E57373", "#4FB39A", "#7DA3A8", "#A8C5C9"];

function fmtKr(n: number): string {
  return new Intl.NumberFormat("no-NO").format(Math.round(n));
}

function fmtMonth(s: string): string {
  return new Date(s).toLocaleDateString("no-NO", { month: "short", year: "numeric" });
}

export default function AdminSalgAnalytics() {
  const today = new Date().toISOString().slice(0, 10);
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const [from, setFrom] = useState(ninetyDaysAgo.toISOString().slice(0, 10));
  const [to, setTo] = useState(today);

  const range = useMemo(() => `?from=${from}&to=${to}`, [from, to]);

  const summary = useQuery<Summary>({ queryKey: [`/api/admin/analytics/summary${range}`] });
  const byTier = useQuery<ByTier[]>({ queryKey: [`/api/admin/analytics/by-tier${range}`] });
  const bySource = useQuery<BySource[]>({ queryKey: [`/api/admin/analytics/by-source${range}`] });
  const byInstitution = useQuery<ByInstitution[]>({ queryKey: [`/api/admin/analytics/by-institution${range}`] });
  const byAssignee = useQuery<ByAssignee[]>({ queryKey: [`/api/admin/analytics/by-assignee${range}`] });
  const funnel = useQuery<FunnelStage[]>({ queryKey: [`/api/admin/analytics/funnel${range}`] });
  const mrrTimeline = useQuery<MrrPoint[]>({ queryKey: ["/api/admin/analytics/mrr-timeline?months=12"] });
  const topCustomers = useQuery<TopCustomer[]>({ queryKey: ["/api/admin/analytics/top-customers"] });

  const exportUrl = `/api/admin/analytics/export.csv${range}`;

  return (
    <PortalLayout>
      <div className="container mx-auto px-4 py-8">
        <Link href="/admin/salg">
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />Tilbake
          </Button>
        </Link>

        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Inntekts-analytics</h1>
            <p className="mt-2 text-muted-foreground">
              Hvor inntektene kommer fra: per tier, kilde, segment, selger og over tid.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label className="text-xs">Fra</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40" />
            </div>
            <div>
              <Label className="text-xs">Til</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-40" />
            </div>
            <a href={exportUrl} download>
              <Button variant="outline" size="sm">
                <Download className="mr-2 h-4 w-4" />CSV-eksport
              </Button>
            </a>
          </div>
        </div>

        {/* KPI ROW */}
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard icon={DollarSign} label="Aktiv ARR" value={summary.data ? `${fmtKr(summary.data.currentArrKr)} kr` : "—"}
            sub={summary.data ? `${fmtKr(summary.data.currentMrrKr)} kr MRR` : ""} accent="text-primary" />
          <KpiCard icon={TrendingUp} label="Vektet pipeline" value={summary.data ? `${fmtKr(summary.data.weightedArrKr)} kr` : "—"}
            sub={summary.data ? `${fmtKr(summary.data.pipelineArrKr)} kr uvektet` : ""} />
          <KpiCard icon={Users} label="Aktive kunder" value={summary.data?.activeCustomers ?? "—"}
            sub={summary.data ? `${summary.data.leadCount} leads i periode` : ""} />
          <KpiCard icon={BarChart3} label="Snitt deal-størrelse" value={summary.data ? `${fmtKr(summary.data.avgDealSizeKr)} kr` : "—"}
            sub="ARR per kunde" />
        </div>

        {/* MRR timeline */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>MRR-utvikling siste 12 måneder</CardTitle>
            <CardDescription>Kumulativ MRR fra revenue_events. Viser tydelig hvor mye nytt og hvor mye churn.</CardDescription>
          </CardHeader>
          <CardContent>
            {mrrTimeline.data && mrrTimeline.data.length > 0 ? (
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={mrrTimeline.data.map((p) => ({ ...p, monthLabel: fmtMonth(p.month) }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e7e5" />
                  <XAxis dataKey="monthLabel" stroke="#5B686B" />
                  <YAxis stroke="#5B686B" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: any) => `${fmtKr(Number(v))} kr`} />
                  <Legend />
                  <Line type="monotone" dataKey="cumulativeMrrKr" name="Total MRR" stroke="#1F6B73" strokeWidth={2.5} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="newMrrKr" name="Ny MRR" stroke="#66B8AA" strokeWidth={1.5} />
                  <Line type="monotone" dataKey="churnedMrrKr" name="Churned MRR" stroke="#E57373" strokeWidth={1.5} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                Ingen revenue events ennå. Når et lead settes til "Vunnet", logges en rad i revenue_events.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tier + source breakdown side-by-side */}
        <div className="mb-6 grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>ARR per tier</CardTitle>
              <CardDescription>Hvilket pris-bånd som leverer mest pipeline.</CardDescription>
            </CardHeader>
            <CardContent>
              {byTier.data && byTier.data.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={byTier.data.filter((t) => t.weightedArrKr > 0)}
                      dataKey="weightedArrKr"
                      nameKey="tierLabel"
                      cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} ${((percent as number) * 100).toFixed(0)}%`}
                    >
                      {byTier.data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: any) => `${fmtKr(Number(v))} kr`} />
                  </PieChart>
                </ResponsiveContainer>
              ) : <EmptyChart />}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Lead-kilder</CardTitle>
              <CardDescription>UTM-source / referrer / direct. Hvor leadene kommer fra.</CardDescription>
            </CardHeader>
            <CardContent>
              {bySource.data && bySource.data.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={bySource.data} layout="vertical" margin={{ left: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e7e5" />
                    <XAxis type="number" stroke="#5B686B" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <YAxis dataKey="source" type="category" stroke="#5B686B" width={80} />
                    <Tooltip formatter={(v: any) => `${fmtKr(Number(v))} kr`} />
                    <Bar dataKey="weightedArrKr" name="Vektet ARR" fill="#1F6B73" />
                  </BarChart>
                </ResponsiveContainer>
              ) : <EmptyChart />}
            </CardContent>
          </Card>
        </div>

        {/* Funnel */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Pipeline-funnel</CardTitle>
            <CardDescription>Antall leads + vektet ARR per stage. Konverteringen synker oppover stagene.</CardDescription>
          </CardHeader>
          <CardContent>
            {funnel.data && funnel.data.length > 0 ? (
              <div className="space-y-2">
                {funnel.data.map((s) => {
                  const max = Math.max(...funnel.data!.map((x) => x.leadCount));
                  const pct = max > 0 ? (s.leadCount / max) * 100 : 0;
                  return (
                    <div key={s.stageSlug} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span>
                          <strong>{s.stageLabel}</strong>
                          <span className="ml-2 text-muted-foreground">({s.probabilityPct}%)</span>
                          {s.isWon && <Badge className="ml-2">Won</Badge>}
                        </span>
                        <span className="tabular-nums">
                          {s.leadCount} leads · {fmtKr(s.pipelineArrKr)} kr
                        </span>
                      </div>
                      <div className="h-6 overflow-hidden rounded bg-muted/30">
                        <div className="h-full rounded bg-primary/70 transition-all"
                          style={{ width: `${Math.max(pct, 1)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : <EmptyChart />}
          </CardContent>
        </Card>

        {/* By institution + by assignee */}
        <div className="mb-6 grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>ARR per institusjons-type</CardTitle>
            </CardHeader>
            <CardContent>
              {byInstitution.data && byInstitution.data.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Leads</TableHead>
                      <TableHead className="text-right">Won</TableHead>
                      <TableHead className="text-right">Vektet ARR</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byInstitution.data.map((r) => (
                      <TableRow key={r.institutionType}>
                        <TableCell className="capitalize">{r.institutionType}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.leadCount}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.wonCount}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtKr(r.weightedArrKr)} kr</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : <EmptyChart />}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Selger-leaderboard</CardTitle>
              <CardDescription>Tildelt-til-rolle (SDR/AE/Founder).</CardDescription>
            </CardHeader>
            <CardContent>
              {byAssignee.data && byAssignee.data.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Assignee</TableHead>
                      <TableHead className="text-right">Leads</TableHead>
                      <TableHead className="text-right">Won</TableHead>
                      <TableHead className="text-right">Vektet ARR</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byAssignee.data.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <div className="font-medium">{r.assigneeLabel}</div>
                          <div className="text-xs text-muted-foreground">{r.assigneeEmail}</div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{r.leadCount}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.wonCount}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtKr(r.weightedArrKr)} kr</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : <EmptyChart />}
            </CardContent>
          </Card>
        </div>

        {/* Top customers */}
        <Card>
          <CardHeader>
            <CardTitle>Top kunder etter ARR</CardTitle>
            <CardDescription>Fra revenue_events. Inkluderer churn-status.</CardDescription>
          </CardHeader>
          <CardContent>
            {topCustomers.data && topCustomers.data.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kunde</TableHead>
                    <TableHead className="text-right">ARR</TableHead>
                    <TableHead className="text-right">MRR</TableHead>
                    <TableHead>Signup</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topCustomers.data.map((c) => (
                    <TableRow key={c.customerEmail}>
                      <TableCell>
                        <div className="font-medium">{c.customerCompany || c.customerEmail}</div>
                        <div className="text-xs text-muted-foreground">{c.customerEmail}</div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{fmtKr(c.currentArrKr)} kr</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtKr(c.currentMrrKr)} kr</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {c.signupAt ? new Date(c.signupAt).toLocaleDateString("no-NO") : "—"}
                      </TableCell>
                      <TableCell className="text-center">
                        {c.isChurned ? <Badge variant="destructive">Churned</Badge> : <Badge>Aktiv</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : <EmptyChart />}
          </CardContent>
        </Card>
      </div>
    </PortalLayout>
  );
}

function KpiCard({ icon: Icon, label, value, sub, accent }: {
  icon: any; label: string; value: string | number; sub: string; accent?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-2 text-xs uppercase tracking-wider">
          <Icon className="h-3.5 w-3.5" />{label}
        </CardDescription>
        <CardTitle className={`text-2xl tabular-nums ${accent ?? ""}`}>{value}</CardTitle>
      </CardHeader>
      {sub && <CardContent className="pt-0 text-xs text-muted-foreground">{sub}</CardContent>}
    </Card>
  );
}

function EmptyChart() {
  return <div className="py-12 text-center text-muted-foreground">Ingen data i valgt periode</div>;
}
