import { useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { PortalLayout } from "@/components/portal/portal-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  ClipboardCheck, AlertCircle, Clock, Users, FolderKanban, FileText,
  CalendarDays, ArrowRight, TrendingUp, BedDouble,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { nb } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface DashboardData {
  period: { monthStart: string; monthEnd: string; weekStart: string; weekEnd: string; today: string };
  pendingApprovals: Array<{
    id: string; status: string; konsulent: string | null; periodeFrom: string | null;
    innsendt: string | null; sakId: string | null; oppdragsgiver: string | null;
  }>;
  returnedRapporter: Array<{
    id: string; konsulent: string | null; periodeFrom: string | null;
    updatedAt: string | null; reviewKommentar: string | null;
  }>;
  sakerWithoutRecent: Array<{
    id: string; saksnummer: string; tittel: string;
    lastRapport: string | null; daysSince: number;
  }>;
  team: Array<{
    id: string; email: string | null; firstName: string | null; lastName: string | null;
    role: string | null; monthHours: number; rapportCount: number;
    onLeaveToday: boolean;
    nextLeave: { startDate: string | null; endDate: string | null; type: string | null } | null;
  }>;
  upcomingLeave: Array<{
    id: number; userId: string; startDate: string | null; endDate: string | null;
    days: string | number; leaveTypeName: string | null; leaveTypeColor: string | null;
  }>;
}

export default function TiltakslederDashboardPage() {
  const [, navigate] = useLocation();
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["/api/tiltaksleder/dashboard"],
    staleTime: 30_000,
  });

  const stats = useMemo(() => {
    if (!data) return null;
    const teamCount = data.team.length;
    const onLeaveNow = data.team.filter(t => t.onLeaveToday).length;
    const totalMonthHours = data.team.reduce((s, t) => s + (t.monthHours ?? 0), 0);
    const avgPerWorker = teamCount > 0 ? Math.round((totalMonthHours / teamCount) * 10) / 10 : 0;
    return { teamCount, onLeaveNow, totalMonthHours: Math.round(totalMonthHours * 10) / 10, avgPerWorker };
  }, [data]);

  return (
    <PortalLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <ClipboardCheck className="h-7 w-7 text-primary" />
            Tiltaksleder-oversikt
          </h1>
          <p className="text-muted-foreground mt-1">
            Hva trenger din oppmerksomhet i dag? Hvem er tilgjengelig denne uken?
          </p>
        </div>

        {isLoading || !data ? (
          <div className="text-center py-12 text-muted-foreground">Laster oversikt…</div>
        ) : (
          <>
            {/* Top stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard
                label="Venter på godkjenning"
                value={data.pendingApprovals.length}
                icon={Clock}
                tone={data.pendingApprovals.length > 0 ? "amber" : "default"}
                onClick={() => navigate("/rapporter/godkjenning")}
              />
              <KpiCard
                label="Returnerte rapporter"
                value={data.returnedRapporter.length}
                icon={AlertCircle}
                tone={data.returnedRapporter.length > 0 ? "red" : "default"}
                onClick={() => navigate("/rapporter")}
              />
              <KpiCard
                label="Saker uten ny rapport (30+ dager)"
                value={data.sakerWithoutRecent.length}
                icon={FolderKanban}
                tone={data.sakerWithoutRecent.length > 0 ? "amber" : "default"}
                onClick={() => navigate("/cases")}
              />
              <KpiCard
                label={`Team (${stats?.onLeaveNow ?? 0} på fravær i dag)`}
                value={stats?.teamCount ?? 0}
                icon={Users}
                tone="default"
                hint={`${stats?.totalMonthHours ?? 0}t totalt denne måneden`}
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              {/* Pending approvals queue */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Clock className="h-4 w-4 text-amber-500" />
                      Venter på godkjenning
                    </CardTitle>
                    <Badge variant="secondary" className="text-[10px]">{data.pendingApprovals.length}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {data.pendingApprovals.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Ingen rapporter venter</p>
                  ) : (
                    <div className="space-y-2">
                      {data.pendingApprovals.slice(0, 5).map((r) => (
                        <button
                          key={r.id}
                          className="w-full text-left rounded-lg border p-3 hover:bg-accent/50 transition-colors"
                          onClick={() => navigate(`/rapporter/${r.id}`)}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium truncate">{r.konsulent ?? "Ukjent"}</p>
                              <p className="text-xs text-muted-foreground">
                                {r.oppdragsgiver ? `${r.oppdragsgiver} · ` : ""}
                                {r.periodeFrom ? format(new Date(r.periodeFrom), "MMMM yyyy", { locale: nb }) : "—"}
                              </p>
                              {r.innsendt && (
                                <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                                  Sendt {formatDistanceToNow(new Date(r.innsendt), { locale: nb, addSuffix: true })}
                                </p>
                              )}
                            </div>
                            <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          </div>
                        </button>
                      ))}
                      {data.pendingApprovals.length > 5 && (
                        <Button variant="ghost" className="w-full text-xs" size="sm" onClick={() => navigate("/rapporter/godkjenning")}>
                          Se alle {data.pendingApprovals.length}
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Returned rapporter */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-red-500" />
                      Returnerte rapporter
                    </CardTitle>
                    <Badge variant="secondary" className="text-[10px]">{data.returnedRapporter.length}</Badge>
                  </div>
                  <CardDescription className="text-xs">Returnerte til miljøarbeideren — oppfølging trengs</CardDescription>
                </CardHeader>
                <CardContent>
                  {data.returnedRapporter.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Ingen returnerte rapporter</p>
                  ) : (
                    <div className="space-y-2">
                      {data.returnedRapporter.slice(0, 5).map((r) => (
                        <button
                          key={r.id}
                          className="w-full text-left rounded-lg border p-3 hover:bg-accent/50 transition-colors"
                          onClick={() => navigate(`/rapporter/${r.id}`)}
                        >
                          <p className="text-sm font-medium truncate">{r.konsulent ?? "Ukjent"}</p>
                          {r.reviewKommentar && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2 italic">
                              "{r.reviewKommentar}"
                            </p>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Saker without recent activity */}
            {data.sakerWithoutRecent.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FolderKanban className="h-4 w-4 text-amber-500" />
                    Saker uten ny rapport på 30+ dager
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Mulig blindsone — sjekk om saken er aktiv eller skal arkiveres
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-2 md:grid-cols-2">
                    {data.sakerWithoutRecent.slice(0, 8).map((s) => (
                      <button
                        key={s.id}
                        className="text-left rounded-lg border p-3 hover:bg-accent/50 transition-colors"
                        onClick={() => navigate("/cases")}
                      >
                        <div className="flex items-start gap-2">
                          <span className="font-mono text-xs font-semibold text-primary mt-0.5">{s.saksnummer}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm truncate">{s.tittel}</p>
                            <p className="text-xs text-amber-600 mt-0.5">
                              {s.daysSince === 999 ? "Ingen rapport ennå" : `${s.daysSince} dager siden`}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Team grid */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />
                    Team — {data.team.length} miljøarbeidere
                  </CardTitle>
                  <Badge variant="outline" className="text-[10px]">
                    Snitt {stats?.avgPerWorker ?? 0}t denne mnd
                  </Badge>
                </div>
                <CardDescription className="text-xs">
                  Arbeidsbelastning og fravær for de som er tildelt dine saker
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.team.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    Ingen tildelte miljøarbeidere ennå. Tildel folk fra Saker-siden.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {data.team.map((m) => {
                      const displayName = [m.firstName, m.lastName].filter(Boolean).join(" ") || m.email || "Ukjent";
                      const initials = (m.firstName?.[0] ?? "") + (m.lastName?.[0] ?? "");
                      return (
                        <div key={m.id} className={cn(
                          "flex items-center gap-3 rounded-lg border p-3",
                          m.onLeaveToday && "bg-amber-50/40 dark:bg-amber-950/20 border-amber-300/50",
                        )}>
                          <Avatar className="h-9 w-9">
                            <AvatarFallback className="text-xs bg-primary/10 text-primary">
                              {initials.toUpperCase() || "?"}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-sm truncate">{displayName}</p>
                              {m.onLeaveToday && (
                                <Badge variant="outline" className="text-[9px] border-amber-500/40 text-amber-600">
                                  <BedDouble className="h-2.5 w-2.5 mr-0.5" /> På fravær
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" /> {m.monthHours}t
                              </span>
                              <span className="flex items-center gap-1">
                                <FileText className="h-3 w-3" /> {m.rapportCount} rapport{m.rapportCount === 1 ? "" : "er"}
                              </span>
                              {m.nextLeave && !m.onLeaveToday && m.nextLeave.startDate && (
                                <span className="flex items-center gap-1 text-amber-600">
                                  <CalendarDays className="h-3 w-3" /> {m.nextLeave.type ?? "Fravær"}{" "}
                                  {format(new Date(m.nextLeave.startDate), "d. MMM", { locale: nb })}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Upcoming leave */}
            {data.upcomingLeave.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-primary" />
                    Fravær neste 14 dager
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {data.upcomingLeave.map((l) => {
                      const teamMember = data.team.find(t => t.id === l.userId);
                      const displayName = teamMember
                        ? [teamMember.firstName, teamMember.lastName].filter(Boolean).join(" ") || teamMember.email
                        : l.userId;
                      return (
                        <div key={l.id} className="flex items-center gap-3 rounded-md border bg-muted/30 px-3 py-2">
                          <CalendarDays className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                          <span className="text-sm font-medium flex-1">{displayName}</span>
                          <Badge variant="outline" className="text-[10px]">{l.leaveTypeName}</Badge>
                          <span className="text-xs text-muted-foreground font-mono">
                            {l.startDate && format(new Date(l.startDate), "d. MMM", { locale: nb })}
                            {" – "}
                            {l.endDate && format(new Date(l.endDate), "d. MMM", { locale: nb })}
                          </span>
                          <span className="text-xs text-muted-foreground">{l.days}d</span>
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
    </PortalLayout>
  );
}

function KpiCard({ label, value, icon: Icon, tone, onClick, hint }: {
  label: string;
  value: number;
  icon: typeof Clock;
  tone: "default" | "amber" | "red";
  onClick?: () => void;
  hint?: string;
}) {
  const colorMap = {
    default: "text-foreground",
    amber: "text-amber-600",
    red: "text-red-600",
  };
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "text-left rounded-lg border bg-card p-4 transition-shadow",
        onClick && "hover:shadow-md cursor-pointer",
      )}
    >
      <div className="flex items-start justify-between mb-2">
        <Icon className={cn("h-4 w-4", colorMap[tone])} />
        {onClick && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
      </div>
      <p className={cn("text-2xl font-bold", colorMap[tone])}>{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5 leading-tight">{label}</p>
      {hint && <p className="text-[10px] text-muted-foreground/70 mt-1">{hint}</p>}
    </button>
  );
}
