import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { PortalLayout } from "@/components/portal/portal-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, CheckCircle2, Clock, Shield, ShieldCheck, User } from "lucide-react";
import { AvvikDialog } from "@/components/avvik-dialog";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { nb } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface Avvik {
  id: string;
  vendorId: number;
  userId: string;
  rapportId: string | null;
  sakId: string | null;
  dateOccurred: string;
  timeOccurred: string | null;
  location: string | null;
  severity: "lav" | "middels" | "hoy" | "kritisk";
  category: string;
  description: string;
  immediateAction: string | null;
  followUpNeeded: boolean;
  witnesses: Array<{ name: string; role?: string }>;
  personsInvolved: Array<{ name: string; role?: string }>;
  gdprAutoReplaced: boolean;
  status: "rapportert" | "under_behandling" | "lukket";
  tiltakslederKommentar: string | null;
  createdAt: string;
}

interface AvvikWithReporter {
  avvik: Avvik;
  reporter: { firstName: string | null; lastName: string | null; email: string | null } | null;
}

const SEVERITY_STYLES = {
  lav: { bg: "bg-emerald-100 text-emerald-900", label: "Lav" },
  middels: { bg: "bg-amber-100 text-amber-900", label: "Middels" },
  hoy: { bg: "bg-orange-100 text-orange-900", label: "Høy" },
  kritisk: { bg: "bg-red-100 text-red-900", label: "Kritisk" },
};

const CATEGORY_LABELS: Record<string, string> = {
  vold_trusler: "Vold/trusler",
  egen_skade: "Egen skade",
  andre_skade: "Andre skadet",
  rutinebrudd: "Rutinebrudd",
  klientrelatert: "Klient-relatert",
  arbeidsmiljo: "Arbeidsmiljø",
  annet: "Annet",
};

const STATUS_STYLES = {
  rapportert: { label: "Rapportert", color: "bg-blue-100 text-blue-900" },
  under_behandling: { label: "Under behandling", color: "bg-amber-100 text-amber-900" },
  lukket: { label: "Lukket", color: "bg-emerald-100 text-emerald-900" },
};

export default function AvvikPage() {
  const { user } = useAuth();
  const role = String(user?.role ?? "").toLowerCase();
  const isLeader = ["tiltaksleder", "teamleder", "vendor_admin", "hovedadmin", "admin", "super_admin"].includes(role);

  return (
    <PortalLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <AlertTriangle className="h-6 w-6 text-amber-600" />
              {isLeader ? "Avvik i organisasjonen" : "Mine avvik"}
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {isLeader
                ? "Avvik rapportert av ansatte. Følg opp, kommenter og lukk saker."
                : "Hendelser du har rapportert. Se status og svar fra tiltaksleder."}
            </p>
          </div>
          <AvvikDialog />
        </div>

        {isLeader ? <LeaderView /> : <WorkerView />}
      </div>
    </PortalLayout>
  );
}

function WorkerView() {
  const { data = [] } = useQuery<Avvik[]>({
    queryKey: ["/api/avvik/mine"],
  });

  if (data.length === 0) {
    return <EmptyState text="Du har ikke rapportert noen avvik ennå." />;
  }

  return (
    <div className="space-y-3">
      {data.map((a) => (
        <AvvikCard key={a.id} avvik={a} />
      ))}
    </div>
  );
}

function LeaderView() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");

  const queryKey = useMemo(() => {
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (severityFilter !== "all") params.set("severity", severityFilter);
    const qs = params.toString();
    return ["/api/avvik" + (qs ? `?${qs}` : "")];
  }, [statusFilter, severityFilter]);

  const { data = [] } = useQuery<AvvikWithReporter[]>({ queryKey });

  const { data: stats } = useQuery<{ byStatusSeverity: Array<{ severity: string; status: string; count: number }>; thisMonth: number }>({
    queryKey: ["/api/avvik/stats"],
  });

  const openCount = stats?.byStatusSeverity.filter((s) => s.status !== "lukket").reduce((a, s) => a + s.count, 0) ?? 0;
  const criticalOpenCount = stats?.byStatusSeverity.filter((s) => s.status !== "lukket" && s.severity === "kritisk").reduce((a, s) => a + s.count, 0) ?? 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <StatCard label="Åpne avvik" value={openCount} icon={Clock} tone={openCount > 0 ? "amber" : "default"} />
        <StatCard label="Kritiske (åpne)" value={criticalOpenCount} icon={AlertTriangle} tone={criticalOpenCount > 0 ? "red" : "default"} />
        <StatCard label="Denne måneden" value={stats?.thisMonth ?? 0} icon={ShieldCheck} />
        <StatCard label="GDPR-maskerte" value={data.filter((d) => d.avvik.gdprAutoReplaced).length} icon={Shield} />
      </div>

      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle statuser</SelectItem>
            <SelectItem value="rapportert">Rapportert</SelectItem>
            <SelectItem value="under_behandling">Under behandling</SelectItem>
            <SelectItem value="lukket">Lukket</SelectItem>
          </SelectContent>
        </Select>
        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Alvorlighet" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle nivåer</SelectItem>
            <SelectItem value="kritisk">Kritisk</SelectItem>
            <SelectItem value="hoy">Høy</SelectItem>
            <SelectItem value="middels">Middels</SelectItem>
            <SelectItem value="lav">Lav</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {data.length === 0 ? (
        <EmptyState text="Ingen avvik matcher filteret." />
      ) : (
        <div className="space-y-3">
          {data.map((d) => (
            <AvvikCard key={d.avvik.id} avvik={d.avvik} reporter={d.reporter} isLeader />
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon: Icon, tone = "default" }: { label: string; value: number; icon: React.ElementType; tone?: "default" | "amber" | "red" }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "rounded-lg p-2",
              tone === "red" ? "bg-red-100 text-red-700" : tone === "amber" ? "bg-amber-100 text-amber-700" : "bg-primary/10 text-primary",
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">{label}</p>
            <p className="text-xl font-bold leading-none mt-0.5">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center text-muted-foreground py-16">
        <CheckCircle2 className="h-10 w-10 mb-2 opacity-40" />
        <p className="text-sm">{text}</p>
      </CardContent>
    </Card>
  );
}

function AvvikCard({
  avvik,
  reporter,
  isLeader = false,
}: {
  avvik: Avvik;
  reporter?: AvvikWithReporter["reporter"];
  isLeader?: boolean;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState(avvik.tiltakslederKommentar ?? "");
  const [status, setStatus] = useState(avvik.status);

  const update = useMutation({
    mutationFn: async (body: { status?: string; tiltakslederKommentar?: string }) => {
      const res = await fetch(`/api/avvik/${avvik.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/avvik"] });
      queryClient.invalidateQueries({ queryKey: ["/api/avvik/mine"] });
      queryClient.invalidateQueries({ queryKey: ["/api/avvik/stats"] });
      toast({ title: "Oppdatert" });
    },
    onError: (e: any) => toast({ title: "Feil", description: e.message, variant: "destructive" }),
  });

  const sev = SEVERITY_STYLES[avvik.severity] ?? SEVERITY_STYLES.middels;
  const st = STATUS_STYLES[avvik.status] ?? STATUS_STYLES.rapportert;
  const reporterName = reporter
    ? [reporter.firstName, reporter.lastName].filter(Boolean).join(" ") || reporter.email || "Ukjent"
    : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={sev.bg + " border-0"}>{sev.label}</Badge>
              <Badge variant="secondary" className="text-[10px]">
                {CATEGORY_LABELS[avvik.category] ?? avvik.category}
              </Badge>
              <Badge className={st.color + " border-0 text-[10px]"}>{st.label}</Badge>
              {avvik.gdprAutoReplaced && (
                <Badge variant="outline" className="text-[10px] gap-1 border-emerald-300 text-emerald-800">
                  <Shield className="h-2.5 w-2.5" /> GDPR-maskert
                </Badge>
              )}
              {avvik.followUpNeeded && (
                <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-800">
                  Krever oppfølging
                </Badge>
              )}
            </div>
            <CardTitle className="text-sm mt-2 leading-snug">
              {format(parseISO(avvik.dateOccurred), "d. MMM yyyy", { locale: nb })}
              {avvik.timeOccurred && ` kl. ${avvik.timeOccurred.slice(0, 5)}`}
              {avvik.location && <span className="text-muted-foreground"> — {avvik.location}</span>}
            </CardTitle>
            {reporterName && (
              <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                <User className="h-3 w-3" /> {reporterName}
              </p>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={() => setOpen(!open)}>
            {open ? "Skjul" : "Åpne"}
          </Button>
        </div>
      </CardHeader>
      {open && (
        <CardContent className="space-y-3 text-sm">
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase mb-1">Beskrivelse</p>
            <p className="whitespace-pre-wrap">{avvik.description}</p>
          </div>
          {avvik.immediateAction && (
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase mb-1">Umiddelbar handling</p>
              <p className="whitespace-pre-wrap">{avvik.immediateAction}</p>
            </div>
          )}
          {avvik.personsInvolved.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase mb-1">Involverte</p>
              <div className="flex flex-wrap gap-1">
                {avvik.personsInvolved.map((p, i) => (
                  <Badge key={i} variant="secondary" className="text-[10px]">
                    {p.name}{p.role ? ` (${p.role})` : ""}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {avvik.witnesses.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase mb-1">Vitner</p>
              <div className="flex flex-wrap gap-1">
                {avvik.witnesses.map((w, i) => (
                  <Badge key={i} variant="secondary" className="text-[10px]">
                    {w.name}{w.role ? ` (${w.role})` : ""}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {avvik.tiltakslederKommentar && !isLeader && (
            <div className="rounded-md border bg-blue-50 p-3">
              <p className="text-[11px] font-semibold text-blue-900 mb-1">Fra tiltaksleder:</p>
              <p className="text-sm text-blue-900/90 whitespace-pre-wrap">{avvik.tiltakslederKommentar}</p>
            </div>
          )}

          {isLeader && (
            <div className="pt-2 border-t space-y-2">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase">Oppfølging</p>
              <Textarea
                placeholder="Kommentar til rapportør (synlig for dem)..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
              />
              <div className="flex gap-2">
                <Select value={status} onValueChange={(v) => setStatus(v as any)}>
                  <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rapportert">Rapportert</SelectItem>
                    <SelectItem value="under_behandling">Under behandling</SelectItem>
                    <SelectItem value="lukket">Lukket</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  onClick={() =>
                    update.mutate({
                      status,
                      tiltakslederKommentar: comment,
                    })
                  }
                  disabled={update.isPending}
                  className="ml-auto"
                >
                  Lagre
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
