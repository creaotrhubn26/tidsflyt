import { useState, useMemo } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PortalLayout } from "@/components/portal/portal-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, FileText, Filter, Mail, Phone, Building2, CreditCard, Copy, FileDown } from "lucide-react";

interface Lead {
  id: number;
  full_name: string;
  email: string;
  company: string | null;
  phone: string | null;
  org_number: string | null;
  institution_type: string | null;
  message: string | null;
  user_count_estimate: number | null;
  tier_snapshot_id: number | null;
  tier_label: string | null;
  tier_slug: string | null;
  tier_price_ore: number | null;
  tier_onboarding_ore: number | null;
  pipeline_stage_id: number | null;
  stage_label: string | null;
  stage_slug: string | null;
  stage_probability_pct: number | null;
  stage_is_won: boolean | null;
  assigned_to_email: string | null;
  assigned_to_label: string | null;
  internal_notes: string | null;
  expected_close_date: string | null;
  status: string;
  created_at: string;
  // Lead-source attribution
  source: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  referrer: string | null;
  landing_path: string | null;
}

interface Stage {
  id: number;
  slug: string;
  label: string;
  probabilityPct: number;
  sortOrder: number;
}

function arrEstimateKr(lead: Lead): number {
  if (!lead.tier_price_ore || !lead.user_count_estimate) return 0;
  return Math.round((lead.tier_price_ore * lead.user_count_estimate * 12) / 100);
}

function fmtKr(n: number): string {
  return new Intl.NumberFormat("no-NO").format(Math.round(n));
}

export default function AdminLeads() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [stageFilter, setStageFilter] = useState<string>("");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("");
  const [selected, setSelected] = useState<Lead | null>(null);
  const [contractHtml, setContractHtml] = useState<string | null>(null);

  const { data: leads, isLoading } = useQuery<Lead[]>({
    queryKey: ["/api/admin/leads", { stage: stageFilter, assignee: assigneeFilter }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (stageFilter) params.set("stage", stageFilter);
      if (assigneeFilter) params.set("assignee", assigneeFilter);
      const res = await fetch(`/api/admin/leads?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Kunne ikke hente leads");
      return res.json();
    },
  });

  const { data: stages } = useQuery<Stage[]>({
    queryKey: ["/api/admin/sales/pipeline"],
  });

  const totalUnweightedArr = useMemo(
    () => (leads ?? []).reduce((sum, l) => sum + arrEstimateKr(l), 0),
    [leads],
  );
  const totalWeightedArr = useMemo(
    () => (leads ?? []).reduce(
      (sum, l) => sum + (arrEstimateKr(l) * (l.stage_probability_pct ?? 0)) / 100,
      0,
    ),
    [leads],
  );

  const assignees = useMemo(() => {
    const set = new Set<string>();
    (leads ?? []).forEach((l) => l.assigned_to_email && set.add(l.assigned_to_email));
    return Array.from(set).sort();
  }, [leads]);

  const updateLead = useMutation({
    mutationFn: async (input: { id: number; patch: Record<string, unknown> }) => {
      const res = await fetch(`/api/admin/leads/${input.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(input.patch),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Lagring feilet");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/leads"] });
      toast({ title: "Oppdatert" });
    },
    onError: (err: any) => toast({ title: "Feil", description: err.message, variant: "destructive" }),
  });

  const generateContract = useMutation({
    mutationFn: async (leadId: number) => {
      const res = await fetch(`/api/admin/leads/${leadId}/generate-contract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Kontrakt-generering feilet");
      return res.json();
    },
    onSuccess: (data) => setContractHtml(data.rendered),
    onError: (err: any) => toast({ title: "Feil", description: err.message, variant: "destructive" }),
  });

  const checkoutLink = useMutation({
    mutationFn: async ({ leadId, priceMode }: { leadId: number; priceMode: "monthly" | "annual" }) => {
      const res = await fetch(`/api/admin/leads/${leadId}/checkout-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ priceMode }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Checkout-link feilet");
      return res.json() as Promise<{ url: string; sessionId: string; expiresAt: string }>;
    },
    onSuccess: (data) => {
      navigator.clipboard.writeText(data.url).catch(() => {});
      toast({
        title: "Checkout-link kopiert",
        description: "Lim den inn i e-post til kunden. Gyldig 24 timer.",
      });
    },
    onError: (err: any) => toast({ title: "Feil", description: err.message, variant: "destructive" }),
  });

  return (
    <PortalLayout>
      <div className="container mx-auto px-4 py-8">
        <Link href="/admin/salg">
          <Button variant="ghost" size="sm" className="mb-4"><ArrowLeft className="mr-2 h-4 w-4" />Tilbake</Button>
        </Link>

        <h1 className="text-3xl font-bold tracking-tight">Leads</h1>
        <p className="mt-2 text-muted-foreground">
          Innkommende leads med pipeline-håndtering. Stage-endringer påvirker ARR-prognose i sanntid.
        </p>

        {/* KPI cards */}
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <Card><CardHeader className="pb-2"><CardDescription>Aktive leads</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{leads?.length ?? 0}</CardTitle>
          </CardHeader></Card>
          <Card><CardHeader className="pb-2"><CardDescription>Pipeline (uvektet)</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{fmtKr(totalUnweightedArr)} kr</CardTitle>
          </CardHeader></Card>
          <Card><CardHeader className="pb-2"><CardDescription>Vektet ARR</CardDescription>
            <CardTitle className="text-3xl tabular-nums text-primary">{fmtKr(totalWeightedArr)} kr</CardTitle>
          </CardHeader></Card>
        </div>

        {/* Filters */}
        <Card className="mt-6">
          <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base">
            <Filter className="h-4 w-4" />Filtrer</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <div className="min-w-[180px]">
                <Label className="text-xs">Stage</Label>
                <select className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
                  <option value="">Alle</option>
                  {stages?.map((s) => <option key={s.slug} value={s.slug}>{s.label}</option>)}
                </select>
              </div>
              <div className="min-w-[200px]">
                <Label className="text-xs">Assignee</Label>
                <select className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)}>
                  <option value="">Alle</option>
                  {assignees.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Leads table */}
        <Card className="mt-6">
          <CardContent className="pt-6">
            {isLoading ? <div className="text-muted-foreground">Laster…</div> : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kunde</TableHead>
                    <TableHead>Brukere</TableHead>
                    <TableHead>Tier</TableHead>
                    <TableHead className="text-right">ARR-estimat</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Assignee</TableHead>
                    <TableHead>Mottatt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leads?.map((l) => (
                    <TableRow key={l.id} className="cursor-pointer" onClick={() => setSelected(l)}>
                      <TableCell>
                        <div className="font-medium">{l.company || l.full_name}</div>
                        <div className="text-xs text-muted-foreground">{l.email}</div>
                      </TableCell>
                      <TableCell className="tabular-nums">{l.user_count_estimate ?? "—"}</TableCell>
                      <TableCell className="text-sm">{l.tier_label ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {arrEstimateKr(l) ? `${fmtKr(arrEstimateKr(l))} kr` : "—"}
                      </TableCell>
                      <TableCell>
                        {l.stage_label ? (
                          <Badge variant={l.stage_is_won ? "default" : "secondary"}>
                            {l.stage_label} ({l.stage_probability_pct}%)
                          </Badge>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{l.assigned_to_label ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(l.created_at).toLocaleDateString("no-NO")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Lead detail dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-h-[95vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selected?.company || selected?.full_name}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-5">
              <div className="grid gap-3 rounded border bg-muted/30 p-4 sm:grid-cols-2">
                <div className="flex items-start gap-2 text-sm">
                  <Mail className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div><div className="text-xs text-muted-foreground">E-post</div><div>{selected.email}</div></div>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <Phone className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div><div className="text-xs text-muted-foreground">Telefon</div><div>{selected.phone || "—"}</div></div>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <Building2 className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="text-xs text-muted-foreground">Org.nr / type</div>
                    <div>{selected.org_number || "—"} · {selected.institution_type || "—"}</div>
                  </div>
                </div>
                <div className="text-sm">
                  <div className="text-xs text-muted-foreground">Mottatt</div>
                  <div>{new Date(selected.created_at).toLocaleString("no-NO")}</div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 rounded border p-4">
                <div>
                  <div className="text-xs text-muted-foreground">Brukere (estimat)</div>
                  <div className="text-2xl font-semibold tabular-nums">{selected.user_count_estimate ?? "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Tier (snapshot)</div>
                  <div className="font-medium">{selected.tier_label ?? "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">ARR-estimat</div>
                  <div className="text-2xl font-semibold tabular-nums text-primary">
                    {arrEstimateKr(selected) ? `${fmtKr(arrEstimateKr(selected))} kr` : "—"}
                  </div>
                </div>
              </div>

              {selected.message && (
                <div className="rounded border bg-yellow-50 p-3 text-sm">
                  <div className="text-xs font-medium text-muted-foreground">Melding fra kunde</div>
                  <div className="mt-1 whitespace-pre-wrap">{selected.message}</div>
                </div>
              )}

              {(selected.source || selected.utm_source || selected.referrer) && (
                <div className="space-y-2 rounded border bg-muted/30 p-3 text-sm">
                  <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Kilde / attribusjon
                  </div>
                  <dl className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1 text-sm">
                    {selected.source && (<>
                      <dt className="text-muted-foreground">Source:</dt>
                      <dd className="font-mono text-xs">{selected.source}</dd>
                    </>)}
                    {selected.utm_source && (<>
                      <dt className="text-muted-foreground">UTM source:</dt>
                      <dd className="font-mono text-xs">{selected.utm_source}</dd>
                    </>)}
                    {selected.utm_medium && (<>
                      <dt className="text-muted-foreground">UTM medium:</dt>
                      <dd className="font-mono text-xs">{selected.utm_medium}</dd>
                    </>)}
                    {selected.utm_campaign && (<>
                      <dt className="text-muted-foreground">UTM campaign:</dt>
                      <dd className="font-mono text-xs">{selected.utm_campaign}</dd>
                    </>)}
                    {selected.utm_content && (<>
                      <dt className="text-muted-foreground">UTM content:</dt>
                      <dd className="font-mono text-xs">{selected.utm_content}</dd>
                    </>)}
                    {selected.utm_term && (<>
                      <dt className="text-muted-foreground">UTM term:</dt>
                      <dd className="font-mono text-xs">{selected.utm_term}</dd>
                    </>)}
                    {selected.referrer && (<>
                      <dt className="text-muted-foreground">Referrer:</dt>
                      <dd className="break-all font-mono text-xs">{selected.referrer}</dd>
                    </>)}
                    {selected.landing_path && (<>
                      <dt className="text-muted-foreground">Landing:</dt>
                      <dd className="font-mono text-xs">{selected.landing_path}</dd>
                    </>)}
                  </dl>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Pipeline-stage</Label>
                  <select className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={selected.pipeline_stage_id ?? ""}
                    onChange={(e) => {
                      const id = e.target.value ? Number(e.target.value) : null;
                      updateLead.mutate({ id: selected.id, patch: { pipelineStageId: id } });
                      setSelected({ ...selected, pipeline_stage_id: id });
                    }}>
                    <option value="">— Ingen —</option>
                    {stages?.map((s) => <option key={s.id} value={s.id}>{s.label} ({s.probabilityPct}%)</option>)}
                  </select>
                </div>
                <div>
                  <Label>Forventet close-dato</Label>
                  <Input type="date" value={selected.expected_close_date ?? ""}
                    onChange={(e) => {
                      updateLead.mutate({ id: selected.id, patch: { expectedCloseDate: e.target.value || null } });
                      setSelected({ ...selected, expected_close_date: e.target.value || null });
                    }} />
                </div>
                <div>
                  <Label>Assignee-rolle</Label>
                  <Input value={selected.assigned_to_label ?? ""}
                    onChange={(e) => setSelected({ ...selected, assigned_to_label: e.target.value })}
                    onBlur={() => updateLead.mutate({ id: selected.id, patch: { assignedToLabel: selected.assigned_to_label } })} />
                </div>
                <div>
                  <Label>Assignee-epost</Label>
                  <Input type="email" value={selected.assigned_to_email ?? ""}
                    onChange={(e) => setSelected({ ...selected, assigned_to_email: e.target.value })}
                    onBlur={() => updateLead.mutate({ id: selected.id, patch: { assignedToEmail: selected.assigned_to_email } })} />
                </div>
              </div>

              <div>
                <Label>Interne notater</Label>
                <Textarea value={selected.internal_notes ?? ""} rows={3}
                  onChange={(e) => setSelected({ ...selected, internal_notes: e.target.value })}
                  onBlur={() => updateLead.mutate({ id: selected.id, patch: { internalNotes: selected.internal_notes } })} />
              </div>
            </div>
          )}
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button variant="outline" onClick={() => selected && generateContract.mutate(selected.id)}
              disabled={generateContract.isPending}>
              <FileText className="mr-2 h-4 w-4" />
              {generateContract.isPending ? "Genererer…" : "Forhåndsvis kontrakt"}
            </Button>
            <a
              href={selected ? `/api/admin/leads/${selected.id}/contract.pdf` : "#"}
              download
              onClick={(e) => { if (!selected) e.preventDefault(); }}
            >
              <Button variant="outline">
                <FileDown className="mr-2 h-4 w-4" />Last ned PDF
              </Button>
            </a>
            <Button variant="outline"
              onClick={() => selected && checkoutLink.mutate({ leadId: selected.id, priceMode: "annual" })}
              disabled={checkoutLink.isPending}>
              <CreditCard className="mr-2 h-4 w-4" />
              {checkoutLink.isPending ? "Lager link…" : "Stripe checkout (årlig)"}
            </Button>
            <Button variant="outline"
              onClick={() => selected && checkoutLink.mutate({ leadId: selected.id, priceMode: "monthly" })}
              disabled={checkoutLink.isPending}>
              <CreditCard className="mr-2 h-4 w-4" />
              Stripe checkout (mnd)
            </Button>
            <Button onClick={() => setSelected(null)}>Lukk</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Generated contract dialog */}
      <Dialog open={!!contractHtml} onOpenChange={(o) => !o && setContractHtml(null)}>
        <DialogContent className="max-h-[95vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>Generert kontrakt</DialogTitle></DialogHeader>
          {contractHtml && (
            <pre className="whitespace-pre-wrap rounded border bg-white p-4 text-sm">{contractHtml}</pre>
          )}
          <DialogFooter>
            <Button variant="outline"
              onClick={() => contractHtml && navigator.clipboard.writeText(contractHtml).then(() => toast({ title: "Kopiert" }))}>
              Kopier til utklippstavlen
            </Button>
            <Button onClick={() => setContractHtml(null)}>Lukk</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PortalLayout>
  );
}
