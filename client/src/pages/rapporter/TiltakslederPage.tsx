/**
 * client/src/pages/rapporter/TiltakslederPage.tsx
 *
 * Route:  <Route path="/rapporter/godkjenning" component={TiltakslederPage} />
 *
 * Tiltaksleder ser alle innsendte rapporter for sine saker,
 * kan kommentere per seksjon, godkjenne eller returnere.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button }     from "@/components/ui/button";
import { Badge }      from "@/components/ui/badge";
import { Textarea }   from "@/components/ui/textarea";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Progress }   from "@/components/ui/progress";
import { Checkbox }   from "@/components/ui/checkbox";
import { Label }      from "@/components/ui/label";
import { useToast as useToastHook } from "@/hooks/use-toast";
import {
  CheckCircle, XCircle, MessageSquare, Clock,
  FileText, User, Calendar, Activity, Target,
  ChevronRight, Download, CheckCheck, ReplyAll, History,
} from "lucide-react";
import { RapportAuditDialog } from "@/components/rapport/rapport-audit-dialog";

interface Rapport {
  id: string;
  status: string;
  konsulent?: string;
  tiltak?: string;
  oppdragsgiver?: string;
  klientRef?: string;
  periodeFrom?: string;
  periodeTo?: string;
  totalMinutter?: number;
  antallDager?: number;
  antallAktiviteter?: number;
  antallMoeter?: number;
  innsendt?: string;
  reviewKommentar?: string;
  feedbackAcknowledgedAt?: string | null;
  feedbackAcknowledgedText?: string | null;
}

interface SeksjonKommentar {
  seksjon: string;
  tekst: string;
}

const STATUS_CONFIG: Record<string, { label: string; variant: "default"|"secondary"|"destructive"|"outline" }> = {
  utkast:           { label: "Utkast",       variant: "outline" },
  til_godkjenning:  { label: "Venter",        variant: "secondary" },
  returnert:        { label: "Returnert",     variant: "destructive" },
  godkjent:         { label: "Godkjent",      variant: "default" },
  arkivert:         { label: "Arkivert",      variant: "outline" },
};

export default function TiltakslederPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [selectedRapport, setSelectedRapport] = useState<Rapport | null>(null);
  const [auditTarget, setAuditTarget] = useState<Rapport | null>(null);
  const [reviewOpen, setReviewOpen]       = useState(false);
  const [overordnetMsg, setOverordnetMsg] = useState("");
  const [seksjonKommentarer, setSeksjonKommentarer] = useState<SeksjonKommentar[]>([]);
  const [activeCommentSek, setActiveCommentSek] = useState<string | null>(null);
  const [returnReasons, setReturnReasons]  = useState<Set<string>>(new Set());
  const [returnMode, setReturnMode]        = useState(false);

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode]       = useState<null | "approve" | "return">(null);
  const [bulkMessage, setBulkMessage] = useState("");

  // ── DATA ──────────────────────────────────────────────────────────────────

  const { data: rapporter = [], isLoading } = useQuery<Rapport[]>({
    queryKey: ["/api/rapporter"],
    queryFn: () => apiRequest("/api/rapporter"),
  });

  // Mål og aktiviteter for valgt rapport
  const { data: maal = [] } = useQuery({
    queryKey: ["/api/rapporter", selectedRapport?.id, "maal"],
    queryFn: () => apiRequest(`/api/rapporter/${selectedRapport!.id}/maal`),
    enabled: !!selectedRapport,
  });
  const { data: aktiviteter = [] } = useQuery({
    queryKey: ["/api/rapporter", selectedRapport?.id, "aktiviteter"],
    queryFn: () => apiRequest(`/api/rapporter/${selectedRapport!.id}/aktiviteter`),
    enabled: !!selectedRapport,
  });
  const { data: kommentarer = [] } = useQuery({
    queryKey: ["/api/rapporter", selectedRapport?.id, "kommentarer"],
    queryFn: () => apiRequest(`/api/rapporter/${selectedRapport!.id}/kommentarer`),
    enabled: !!selectedRapport,
  });

  // ── MUTATIONS ─────────────────────────────────────────────────────────────

  const godkjenn = useMutation({
    mutationFn: (rapportId: string) => apiRequest(`/api/rapporter/${rapportId}/godkjenn`, {
      method: "POST",
      body: JSON.stringify({ kommentar: overordnetMsg || undefined }),
    }),
    onSuccess: () => {
      toast({ title: "Rapport godkjent ✅" });
      qc.invalidateQueries({ queryKey: ["/api/rapporter"] });
      setReviewOpen(false);
    },
    onError: () => toast({ title: "Feil", variant: "destructive" }),
  });

  const returner = useMutation({
    mutationFn: (rapportId: string) => apiRequest(`/api/rapporter/${rapportId}/returner`, {
      method: "POST",
      body: JSON.stringify({
        kommentar: [
          ...Array.from(returnReasons).map(r => `• ${r}`),
          overordnetMsg,
        ].filter(Boolean).join("\n"),
        seksjonsKommentarer: seksjonKommentarer,
      }),
    }),
    onSuccess: () => {
      toast({ title: "Rapport returnert med tilbakemelding ↩️" });
      qc.invalidateQueries({ queryKey: ["/api/rapporter"] });
      setReviewOpen(false);
    },
    onError: () => toast({ title: "Feil", variant: "destructive" }),
  });

  const addKommentar = useMutation({
    mutationFn: ({ rapportId, seksjon, tekst }: { rapportId: string; seksjon: string; tekst: string }) =>
      apiRequest(`/api/rapporter/${rapportId}/kommentarer`, {
        method: "POST",
        body: JSON.stringify({ seksjon, tekst }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/rapporter", selectedRapport?.id, "kommentarer"] }),
  });

  // ── BULK MUTATIONS ────────────────────────────────────────────────────────

  const bulkGodkjenn = useMutation({
    mutationFn: (ids: string[]) => apiRequest(`/api/rapporter/bulk/godkjenn`, {
      method: "POST",
      body: JSON.stringify({ ids, kommentar: bulkMessage || undefined }),
    }),
    onSuccess: (res: any) => {
      toast({ title: `${res?.approved ?? 0} rapporter godkjent` });
      qc.invalidateQueries({ queryKey: ["/api/rapporter"] });
      setSelectedIds(new Set());
      setBulkMode(null);
      setBulkMessage("");
    },
    onError: () => toast({ title: "Bulk-godkjenning feilet", variant: "destructive" }),
  });

  const bulkReturner = useMutation({
    mutationFn: (ids: string[]) => apiRequest(`/api/rapporter/bulk/returner`, {
      method: "POST",
      body: JSON.stringify({ ids, kommentar: bulkMessage }),
    }),
    onSuccess: (res: any) => {
      toast({ title: `${res?.returned ?? 0} rapporter returnert` });
      qc.invalidateQueries({ queryKey: ["/api/rapporter"] });
      setSelectedIds(new Set());
      setBulkMode(null);
      setBulkMessage("");
    },
    onError: () => toast({ title: "Bulk-retur feilet", variant: "destructive" }),
  });

  // ── HELPERS ───────────────────────────────────────────────────────────────

  const pending = (rapporter as Rapport[]).filter(r => r.status === "til_godkjenning");
  const others  = (rapporter as Rapport[]).filter(r => r.status !== "til_godkjenning");

  const formatPeriode = (r: Rapport) => {
    if (!r.periodeFrom) return "Ukjent periode";
    return new Date(r.periodeFrom).toLocaleDateString("nb-NO", { month: "long", year: "numeric" });
  };

  const formatHours = (mins?: number) => {
    if (!mins) return "0t";
    const h = Math.floor(mins / 60), m = mins % 60;
    return m ? `${h}t ${m}m` : `${h}t`;
  };

  const openReview = (r: Rapport) => {
    setSelectedRapport(r);
    setOverordnetMsg("");
    setSeksjonKommentarer([]);
    setActiveCommentSek(null);
    setReturnReasons(new Set());
    setReturnMode(false);
    setReviewOpen(true);
  };

  const addSeksjonKommentar = (seksjon: string, tekst: string) => {
    if (!tekst.trim()) return;
    setSeksjonKommentarer(prev => {
      const existing = prev.find(k => k.seksjon === seksjon);
      if (existing) return prev.map(k => k.seksjon === seksjon ? { ...k, tekst } : k);
      return [...prev, { seksjon, tekst }];
    });
    setActiveCommentSek(null);
  };

  const seksjonHasComment = (seksjon: string) => seksjonKommentarer.some(k => k.seksjon === seksjon);

  const RETURN_REASONS = [
    "Manglende aktivitetsdokumentasjon",
    "GDPR-brudd (personopplysninger)",
    "Feil periode eller datoer",
    "Mål ikke oppdatert",
    "Utilstrekkelig beskrivelse",
    "Annet (se kommentar)",
  ];

  // ── RENDER ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background">
      {/* HEADER */}
      <div className="border-b bg-card px-6 py-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-xl font-semibold">Godkjenning av rapporter</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {pending.length > 0 ? `${pending.length} rapport${pending.length > 1 ? "er" : ""} venter på behandling` : "Ingen rapporter venter"}
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">

        {/* STATS */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Venter godkjenning", value: pending.length, color: "text-amber-600" },
            { label: "Godkjent denne måneden", value: others.filter(r => r.status === "godkjent").length, color: "text-primary" },
            { label: "Returnert", value: others.filter(r => r.status === "returnert").length, color: "text-destructive" },
          ].map(({ label, value, color }) => (
            <Card key={label} className="p-4 text-center">
              <div className={`text-2xl font-bold ${color}`}>{value}</div>
              <div className="text-xs text-muted-foreground mt-1">{label}</div>
            </Card>
          ))}
        </div>

        {/* VENTENDE RAPPORTER */}
        {pending.length > 0 && (
          <Card>
            <CardHeader className="py-3 px-4 border-b">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-500" />
                <span className="font-semibold text-sm">Venter godkjenning</span>
                <div className="flex items-center gap-2 ml-auto">
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <Checkbox
                      checked={selectedIds.size > 0 && selectedIds.size === pending.length}
                      onCheckedChange={(c) => {
                        if (c) setSelectedIds(new Set(pending.map(p => p.id)));
                        else setSelectedIds(new Set());
                      }}
                    />
                    <span>Velg alle</span>
                  </label>
                  {selectedIds.size > 0 && (
                    <>
                      <Badge variant="secondary" className="text-xs">{selectedIds.size} valgt</Badge>
                      <Button size="sm" variant="outline" className="h-7 text-xs"
                        onClick={() => setBulkMode("return")}>
                        <ReplyAll className="h-3 w-3 mr-1" /> Returner valgte
                      </Button>
                      <Button size="sm" className="h-7 text-xs"
                        onClick={() => setBulkMode("approve")}>
                        <CheckCheck className="h-3 w-3 mr-1" /> Godkjenn valgte
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardHeader>
            <div className="divide-y">
              {pending.map((r) => (
                <div key={r.id} className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        className="mt-1"
                        checked={selectedIds.has(r.id)}
                        onCheckedChange={(c) => setSelectedIds(prev => {
                          const s = new Set(prev);
                          if (c) s.add(r.id); else s.delete(r.id);
                          return s;
                        })}
                      />
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold">{r.konsulent ?? "Ukjent"}</span>
                          <Badge variant="secondary" className="text-xs">Venter</Badge>
                          {r.tiltak && <Badge variant="outline" className="text-xs capitalize">{r.tiltak}</Badge>}
                          {r.feedbackAcknowledgedAt && (
                            <Badge variant="default" className="text-[10px] bg-emerald-600 hover:bg-emerald-600">
                              <CheckCheck className="h-2.5 w-2.5 mr-1" /> Feedback bekreftet
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {formatPeriode(r)} · Innsendt {r.innsendt ? new Date(r.innsendt).toLocaleDateString("nb-NO") : "—"}
                        </p>
                        {r.feedbackAcknowledgedText && (
                          <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1 italic">
                            Miljøarbeiders svar: "{r.feedbackAcknowledgedText}"
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <Button variant="outline" size="sm" onClick={() => openReview(r)}>
                        <FileText className="h-3.5 w-3.5 mr-1.5" /> Se rapport
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAuditTarget(r)}
                        data-testid={`button-rapport-history-${r.id}`}
                      >
                        <History className="h-3.5 w-3.5 mr-1.5" /> Vis historikk
                      </Button>
                      <Button variant="outline" size="sm"
                        className="text-destructive border-destructive/30 hover:bg-destructive/5"
                        onClick={() => { openReview(r); setReturnMode(true); }}>
                        Returner
                      </Button>
                      <Button size="sm" onClick={() => { if (window.confirm("Godkjenn rapport?")) godkjenn.mutate(r.id); }}>
                        <CheckCircle className="h-3.5 w-3.5 mr-1.5" /> Godkjenn
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-3">
                    {[
                      { label: "Timer",       value: formatHours(r.totalMinutter) },
                      { label: "Dager",        value: r.antallDager ?? 0 },
                      { label: "Aktiviteter",  value: r.antallAktiviteter ?? 0 },
                      { label: "Klientmøter",  value: r.antallMoeter ?? 0 },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-primary/8 rounded-lg p-2.5 text-center">
                        <div className="font-bold text-primary text-sm">{value}</div>
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* BULK-ACTION DIALOG */}
        <Dialog open={!!bulkMode} onOpenChange={(o) => { if (!o) { setBulkMode(null); setBulkMessage(""); } }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {bulkMode === "approve"
                  ? `Godkjenn ${selectedIds.size} rapporter`
                  : `Returner ${selectedIds.size} rapporter`}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {bulkMode === "approve"
                  ? "Alle valgte rapporter blir godkjent. Auto-videresending til institusjon skjer per rapport. Valgfri kommentar sendes med."
                  : "Alle valgte rapporter returneres med samme kommentar. Miljøarbeiderne må bekrefte tilbakemeldingen før de kan sende inn igjen."}
              </p>
              <Textarea
                placeholder={bulkMode === "approve" ? "Valgfri kommentar (samme for alle)" : "Kommentar (påkrevd) — forklar hva som må rettes"}
                value={bulkMessage}
                onChange={(e) => setBulkMessage(e.target.value)}
                rows={4}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setBulkMode(null); setBulkMessage(""); }}>
                Avbryt
              </Button>
              <Button
                disabled={
                  (bulkMode === "approve" ? bulkGodkjenn.isPending : bulkReturner.isPending)
                  || (bulkMode === "return" && !bulkMessage.trim())
                }
                variant={bulkMode === "return" ? "destructive" : "default"}
                onClick={() => {
                  const ids = Array.from(selectedIds);
                  if (bulkMode === "approve") bulkGodkjenn.mutate(ids);
                  else bulkReturner.mutate(ids);
                }}
              >
                {bulkMode === "approve" ? "Godkjenn alle" : "Returner alle"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* HISTORIKK */}
        {others.length > 0 && (
          <Card>
            <CardHeader className="py-3 px-4 border-b">
              <span className="font-semibold text-sm">Historikk</span>
            </CardHeader>
            <div className="divide-y">
              {others.slice(0, 10).map((r) => (
                <div key={r.id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                      <User className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{r.konsulent ?? "Ukjent"}</p>
                      <p className="text-xs text-muted-foreground">{formatPeriode(r)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={STATUS_CONFIG[r.status]?.variant ?? "outline"} className="text-xs">
                      {STATUS_CONFIG[r.status]?.label ?? r.status}
                    </Badge>
                    <Button variant="ghost" size="sm" className="h-7 text-xs"
                      aria-label={`Last ned PDF for ${r.konsulent ?? "rapport"}`}
                      onClick={() => window.open(`/api/rapporter/${r.id}/pdf`, "_blank")}>
                      <Download className="h-3 w-3 mr-1" /> PDF
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

      </div>

      {/* ── REVIEW MODAL ─────────────────────────────── */}
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b bg-card flex-shrink-0">
            <div className="flex items-center gap-3">
              <span className="font-semibold">{selectedRapport?.konsulent}</span>
              <Badge variant="secondary" className="text-xs">
                {selectedRapport ? formatPeriode(selectedRapport) : ""}
              </Badge>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => window.open(`/api/rapporter/${selectedRapport?.id}/pdf`, "_blank")}>
                <Download className="h-3.5 w-3.5 mr-1.5" /> Last ned PDF
              </Button>
              <Button variant="outline" size="sm"
                className="text-destructive border-destructive/30"
                onClick={() => returner.mutate(selectedRapport!.id)}
                disabled={returner.isPending}>
                Returner
              </Button>
              <Button size="sm"
                onClick={() => godkjenn.mutate(selectedRapport!.id)}
                disabled={godkjenn.isPending}>
                <CheckCircle className="h-3.5 w-3.5 mr-1.5" /> Godkjenn
              </Button>
            </div>
          </div>

          {/* Content: rapport left, comments right */}
          <div className="flex flex-1 overflow-hidden">

            {/* Rapport */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-muted/20">

              {/* Mål */}
              <Card>
                <CardHeader className="py-2.5 px-4 border-b">
                  <div className="flex items-center gap-2">
                    <Target className="h-3.5 w-3.5 text-primary" />
                    <span className="font-semibold text-sm flex-1">Mål og tiltak</span>
                    <Button variant="ghost" size="sm" className="h-6 text-xs text-primary"
                      onClick={() => setActiveCommentSek(activeCommentSek === "goals" ? null : "goals")}>
                      <MessageSquare className="h-3 w-3 mr-1" />
                      {seksjonHasComment("goals") ? "Rediger kommentar" : "Kommentar"}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-4">
                  {(maal as any[]).length === 0 ? (
                    <p className="text-sm text-muted-foreground">Ingen mål registrert</p>
                  ) : (
                    <div className="space-y-2">
                      {(maal as any[]).map((m: any, i) => (
                        <div key={m.id} className="flex items-start gap-2">
                          <div className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i+1}</div>
                          <div className="flex-1">
                            <p className="text-sm">{m.beskrivelse}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <Progress value={m.fremdrift ?? 0} className="h-1.5 flex-1" />
                              <span className="text-xs font-semibold text-primary">{m.fremdrift ?? 0}%</span>
                              <Badge variant="outline" className="text-[10px]">{m.status}</Badge>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {activeCommentSek === "goals" && (
                    <SeksjonCommentForm
                      existing={seksjonKommentarer.find(k => k.seksjon === "goals")?.tekst ?? ""}
                      onSave={(t) => addSeksjonKommentar("goals", t)}
                      onCancel={() => setActiveCommentSek(null)}
                    />
                  )}
                  {seksjonHasComment("goals") && activeCommentSek !== "goals" && (
                    <div className="mt-3 bg-primary/8 rounded-lg px-3 py-2 text-xs text-primary border border-primary/20">
                      <strong>Din kommentar:</strong> {seksjonKommentarer.find(k=>k.seksjon==="goals")?.tekst}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Aktiviteter */}
              <Card>
                <CardHeader className="py-2.5 px-4 border-b">
                  <div className="flex items-center gap-2">
                    <Activity className="h-3.5 w-3.5 text-primary" />
                    <span className="font-semibold text-sm flex-1">Aktivitetslogg</span>
                    <Badge variant="secondary" className="text-xs">{(aktiviteter as any[]).length} oppf.</Badge>
                    <Button variant="ghost" size="sm" className="h-6 text-xs text-primary"
                      onClick={() => setActiveCommentSek(activeCommentSek === "activities" ? null : "activities")}>
                      <MessageSquare className="h-3 w-3 mr-1" />
                      {seksjonHasComment("activities") ? "Rediger" : "Kommentar"}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50">
                        <tr>{["Dato","Type","Tid","Beskrivelse","Klient"].map(h=><th key={h} className="text-left px-3 py-2 text-[10px] uppercase tracking-wide text-muted-foreground">{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {(aktiviteter as any[]).map((a: any) => (
                          <tr key={a.id} className="border-t hover:bg-muted/20">
                            <td className="px-3 py-2 font-mono">{a.dato?.substring(5).replace("-",".")}</td>
                            <td className="px-3 py-2"><Badge variant="secondary" className="text-[10px]">{a.type}</Badge></td>
                            <td className="px-3 py-2 font-mono">{a.fraKl}–{a.tilKl}</td>
                            <td className="px-3 py-2 max-w-[200px] truncate">{a.beskrivelse}</td>
                            <td className="px-3 py-2 text-muted-foreground">{a.klientRef || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {activeCommentSek === "activities" && (
                    <div className="p-4">
                      <SeksjonCommentForm
                        existing={seksjonKommentarer.find(k=>k.seksjon==="activities")?.tekst ?? ""}
                        onSave={(t) => addSeksjonKommentar("activities", t)}
                        onCancel={() => setActiveCommentSek(null)}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>

            </div>

            {/* Right panel: tilbakemelding */}
            <div className="w-72 flex-shrink-0 border-l bg-card flex flex-col overflow-y-auto">
              <div className="p-4 border-b">
                <p className="font-semibold text-sm">Tilbakemelding</p>
                <p className="text-xs text-muted-foreground mt-0.5">Synlig for miljøarbeider etter innsending</p>
              </div>

              {/* Seksjonskommentarer oppsummering */}
              <div className="p-4 border-b">
                {seksjonKommentarer.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-2">Ingen seksjonskommentarer ennå</p>
                ) : (
                  <div className="space-y-2">
                    {seksjonKommentarer.map(k => (
                      <div key={k.seksjon} className="bg-primary/8 rounded-lg px-3 py-2 border border-primary/15">
                        <p className="text-[10px] font-semibold text-primary uppercase tracking-wide mb-1">
                          {k.seksjon === "goals" ? "Mål" : k.seksjon === "activities" ? "Aktiviteter" : k.seksjon}
                        </p>
                        <p className="text-xs">{k.tekst}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Return reasons */}
              <div className="p-4 border-b">
                <p className="text-xs font-semibold mb-2">Returneringsårsaker</p>
                <div className="space-y-2">
                  {RETURN_REASONS.map(r => (
                    <label key={r} className="flex items-start gap-2 cursor-pointer text-xs">
                      <Checkbox
                        checked={returnReasons.has(r)}
                        onCheckedChange={(c) => setReturnReasons(prev => { const s = new Set(prev); c ? s.add(r) : s.delete(r); return s; })}
                        className="mt-0.5"
                      />
                      <span>{r}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Overordnet melding */}
              <div className="p-4 flex-1">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Overordnet svar</Label>
                <Textarea
                  value={overordnetMsg}
                  onChange={(e) => setOverordnetMsg(e.target.value)}
                  placeholder="Generell tilbakemelding til miljøarbeideren…"
                  rows={4}
                  className="mt-1 text-sm"
                />
              </div>

              {/* Actions */}
              <div className="p-4 border-t space-y-2">
                <Button className="w-full" onClick={() => godkjenn.mutate(selectedRapport!.id)} disabled={godkjenn.isPending}>
                  <CheckCircle className="h-3.5 w-3.5 mr-1.5" /> Godkjenn og signer
                </Button>
                <Button variant="outline" className="w-full text-destructive border-destructive/30 hover:bg-destructive/5"
                  onClick={() => returner.mutate(selectedRapport!.id)} disabled={returner.isPending}>
                  <XCircle className="h-3.5 w-3.5 mr-1.5" /> Returner med tilbakemelding
                </Button>
              </div>
            </div>

          </div>
        </DialogContent>
      </Dialog>

      {/* Historikk-dialog — åpnes fra «Vis historikk»-knappen per rapport */}
      {auditTarget && (
        <RapportAuditDialog
          open={!!auditTarget}
          onClose={() => setAuditTarget(null)}
          rapportId={auditTarget.id}
          rapportTitle={auditTarget.konsulent || auditTarget.id}
        />
      )}
    </div>
  );
}

// ── SEKSJONSKOMMENTAR FORM ────────────────────────────────────────────────────

function SeksjonCommentForm({ existing, onSave, onCancel }: {
  existing: string; onSave: (t: string) => void; onCancel: () => void;
}) {
  const [tekst, setTekst] = useState(existing);
  return (
    <div className="mt-3 p-3 rounded-lg border bg-card space-y-2">
      <Textarea value={tekst} onChange={(e) => setTekst(e.target.value)} placeholder="Skriv kommentar…" rows={3} className="text-sm" />
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={onCancel}>Avbryt</Button>
        <Button size="sm" onClick={() => onSave(tekst)}>Lagre kommentar</Button>
      </div>
    </div>
  );
}
