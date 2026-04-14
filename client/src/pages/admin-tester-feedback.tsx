import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PortalLayout } from "@/components/portal/portal-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Bug, Lightbulb, Heart, Sparkles, Flag, Clock, CheckCircle2,
  XCircle, Eye, MessageSquarePlus, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";

interface FeedbackItem {
  id: string;
  userId: string;
  email: string | null;
  fullName: string | null;
  category: "bug" | "idea" | "praise" | "other";
  severity: "low" | "medium" | "high" | "critical" | null;
  pagePath: string | null;
  pageTitle: string | null;
  userAgent: string | null;
  viewportWidth: number | null;
  viewportHeight: number | null;
  message: string;
  stepsToReproduce: string | null;
  screenshotDataUrl: string | null;
  extraContext: any;
  status: "new" | "in_review" | "planned" | "resolved" | "wontfix";
  adminNotes: string | null;
  adminReply: string | null;
  repliedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

const CATEGORY_META = {
  bug:    { icon: Bug,       color: "text-red-500",    label: "Bug" },
  idea:   { icon: Lightbulb, color: "text-amber-500",  label: "Forslag" },
  praise: { icon: Heart,     color: "text-pink-500",   label: "Ros" },
  other:  { icon: Sparkles,  color: "text-blue-500",   label: "Annet" },
} as const;

const STATUS_META: Record<string, { label: string; color: string }> = {
  new:       { label: "Ny",           color: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  in_review: { label: "Under vurdering", color: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  planned:   { label: "Planlagt",     color: "bg-purple-500/10 text-purple-600 border-purple-500/20" },
  resolved:  { label: "Løst",         color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  wontfix:   { label: "Lukket",       color: "bg-muted text-muted-foreground" },
};

const SEVERITY_META: Record<string, { label: string; dot: string }> = {
  low:      { label: "Lav",      dot: "bg-muted-foreground" },
  medium:   { label: "Middels",  dot: "bg-amber-500" },
  high:     { label: "Høy",      dot: "bg-orange-500" },
  critical: { label: "Kritisk",  dot: "bg-red-500" },
};

export default function AdminTesterFeedbackPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [selected, setSelected] = useState<FeedbackItem | null>(null);

  const { data: items = [], isLoading } = useQuery<FeedbackItem[]>({
    queryKey: ["/api/tester-feedback", statusFilter, categoryFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (categoryFilter !== "all") params.set("category", categoryFilter);
      const res = await fetch(`/api/tester-feedback?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: stats = [] } = useQuery<Array<{ status: string; category: string; count: number }>>({
    queryKey: ["/api/tester-feedback-stats"],
  });

  const counts = useMemo(() => {
    const byStatus: Record<string, number> = {};
    const byCat: Record<string, number> = {};
    for (const row of stats) {
      byStatus[row.status] = (byStatus[row.status] ?? 0) + row.count;
      byCat[row.category] = (byCat[row.category] ?? 0) + row.count;
    }
    return { byStatus, byCat, total: stats.reduce((s, r) => s + r.count, 0) };
  }, [stats]);

  const update = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await fetch(`/api/tester-feedback/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Oppdatering feilet");
      return res.json();
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["/api/tester-feedback"] });
      qc.invalidateQueries({ queryKey: ["/api/tester-feedback-stats"] });
      setSelected(row);
      toast({ title: "Oppdatert" });
    },
  });

  return (
    <PortalLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Tester-tilbakemeldinger</h1>
            <p className="text-muted-foreground mt-1">
              {counts.total} tilbakemeldinger fra prototype-testere
            </p>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="Nye" value={counts.byStatus.new ?? 0} color="text-blue-600" onClick={() => setStatusFilter("new")} />
          <StatCard label="Under vurdering" value={counts.byStatus.in_review ?? 0} color="text-amber-600" onClick={() => setStatusFilter("in_review")} />
          <StatCard label="Planlagt" value={counts.byStatus.planned ?? 0} color="text-purple-600" onClick={() => setStatusFilter("planned")} />
          <StatCard label="Løst" value={counts.byStatus.resolved ?? 0} color="text-emerald-600" onClick={() => setStatusFilter("resolved")} />
          <StatCard label="Bugs totalt" value={counts.byCat.bug ?? 0} color="text-red-600" onClick={() => setCategoryFilter("bug")} />
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4 flex flex-col md:flex-row gap-3 md:items-center">
            <div>
              <Label className="text-xs">Status</Label>
              <Tabs value={statusFilter} onValueChange={setStatusFilter}>
                <TabsList>
                  <TabsTrigger value="all">Alle</TabsTrigger>
                  <TabsTrigger value="new">Ny</TabsTrigger>
                  <TabsTrigger value="in_review">Vurdering</TabsTrigger>
                  <TabsTrigger value="planned">Planlagt</TabsTrigger>
                  <TabsTrigger value="resolved">Løst</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div>
              <Label className="text-xs">Kategori</Label>
              <Tabs value={categoryFilter} onValueChange={setCategoryFilter}>
                <TabsList>
                  <TabsTrigger value="all">Alle</TabsTrigger>
                  <TabsTrigger value="bug">Bug</TabsTrigger>
                  <TabsTrigger value="idea">Forslag</TabsTrigger>
                  <TabsTrigger value="praise">Ros</TabsTrigger>
                  <TabsTrigger value="other">Annet</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardContent>
        </Card>

        {/* List */}
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Laster…</div>
        ) : items.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">Ingen tilbakemeldinger ennå.</CardContent></Card>
        ) : (
          <div className="grid gap-3">
            {items.map((item) => {
              const catMeta = CATEGORY_META[item.category];
              const Icon = catMeta.icon;
              const sev = item.severity ? SEVERITY_META[item.severity] : null;
              return (
                <Card key={item.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setSelected(item)}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className={cn("rounded-full p-2 bg-muted/50", catMeta.color)}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-[10px]">{catMeta.label}</Badge>
                          <Badge className={cn("text-[10px] border", STATUS_META[item.status].color)}>
                            {STATUS_META[item.status].label}
                          </Badge>
                          {sev && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                              <span className={cn("h-2 w-2 rounded-full", sev.dot)} />
                              {sev.label}
                            </span>
                          )}
                          <span className="text-[11px] text-muted-foreground ml-auto">
                            {format(new Date(item.createdAt), "dd.MM HH:mm", { locale: nb })}
                          </span>
                        </div>
                        <p className="text-sm leading-relaxed line-clamp-2">{item.message}</p>
                        <div className="flex flex-wrap items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                          <span>{item.fullName || item.email || "Ukjent tester"}</span>
                          {item.pagePath && <span className="font-mono">{item.pagePath}</span>}
                          {item.viewportWidth && <span>{item.viewportWidth}×{item.viewportHeight}</span>}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Detail dialog */}
        <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            {selected && <FeedbackDetail item={selected} onUpdate={(data) => update.mutate({ id: selected.id, data })} updating={update.isPending} />}
          </DialogContent>
        </Dialog>
      </div>
    </PortalLayout>
  );
}

function StatCard({ label, value, color, onClick }: { label: string; value: number; color?: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="text-left">
      <Card className="hover:shadow-md transition-shadow">
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className={cn("text-2xl font-bold", color)}>{value}</p>
        </CardContent>
      </Card>
    </button>
  );
}

function FeedbackDetail({ item, onUpdate, updating }: { item: FeedbackItem; onUpdate: (data: any) => void; updating: boolean }) {
  const [status, setStatus] = useState(item.status);
  const [reply, setReply] = useState(item.adminReply ?? "");
  const [notes, setNotes] = useState(item.adminNotes ?? "");
  const catMeta = CATEGORY_META[item.category];
  const Icon = catMeta.icon;

  const fullData = useQuery<FeedbackItem>({
    queryKey: [`/api/tester-feedback/${item.id}`],
  });

  const screenshot = fullData.data?.screenshotDataUrl;

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Icon className={cn("h-5 w-5", catMeta.color)} />
          {catMeta.label} — {item.fullName || item.email || "Ukjent"}
        </DialogTitle>
        <DialogDescription>
          Innsendt {format(new Date(item.createdAt), "d. MMM yyyy 'kl.' HH:mm", { locale: nb })}
          {item.pagePath && <> — fra <span className="font-mono">{item.pagePath}</span></>}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="rounded-lg border bg-muted/30 p-3">
          <p className="text-sm whitespace-pre-wrap">{item.message}</p>
        </div>

        {item.stepsToReproduce && (
          <div className="space-y-1">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Steg for å reprodusere</Label>
            <p className="text-sm whitespace-pre-wrap bg-muted/20 rounded-lg p-3">{item.stepsToReproduce}</p>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          {item.severity && <ContextCell label="Alvorlighet" value={SEVERITY_META[item.severity]?.label ?? item.severity} />}
          {item.pagePath && <ContextCell label="Side" value={item.pagePath} mono />}
          {item.viewportWidth && <ContextCell label="Skjerm" value={`${item.viewportWidth}×${item.viewportHeight}`} />}
          {item.userAgent && <ContextCell label="Nettleser" value={item.userAgent.slice(0, 40) + "…"} mono />}
        </div>

        {screenshot && (
          <div className="space-y-1">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1">
              <Eye className="h-3 w-3" /> Skjermbilde
            </Label>
            <img src={screenshot} alt="skjermbilde" className="rounded-lg border max-w-full" />
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-4 pt-2 border-t">
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="new">Ny</SelectItem>
                <SelectItem value="in_review">Under vurdering</SelectItem>
                <SelectItem value="planned">Planlagt</SelectItem>
                <SelectItem value="resolved">Løst</SelectItem>
                <SelectItem value="wontfix">Lukket</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Interne notater</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Kun synlig for admin…" rows={2} />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Svar til testeren (valgfri)</Label>
          <Textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Takk for tilbakemeldingen — vi har fikset dette." rows={3} />
          {item.repliedAt && (
            <p className="text-[11px] text-muted-foreground">
              Sist besvart {format(new Date(item.repliedAt), "d. MMM yyyy HH:mm", { locale: nb })}
            </p>
          )}
        </div>
      </div>

      <DialogFooter>
        <Button
          onClick={() => onUpdate({ status, adminNotes: notes, adminReply: reply || undefined })}
          disabled={updating}
        >
          {updating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
          Lagre endringer
        </Button>
      </DialogFooter>
    </>
  );
}

function ContextCell({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md bg-muted/40 px-2 py-1.5">
      <p className="text-[10px] text-muted-foreground uppercase">{label}</p>
      <p className={cn("text-xs mt-0.5", mono && "font-mono")}>{value}</p>
    </div>
  );
}
