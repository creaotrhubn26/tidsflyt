/**
 * Tidum Turnus — KI-turnusplanlegger.
 * Guided flow (Oppsett → Planlegging → Regler), explainable generation, and an
 * accessible, colour-coded override grid: keyboard + drag reassignment, live AML
 * consequence-preview, coverage-vs-demand, wishes, weight sliders, save/undo.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import * as api from "@/lib/turnus-api";
import type { GenerertVakt, GenereringKontekst } from "@/lib/turnus-api";

const UKEDAGER = ["", "man", "tir", "ons", "tor", "fre", "lør", "søn"];
const MND = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"];

// ── formatting helpers (norsk) ───────────────────────────────────────────────
const d0 = (dato: string) => new Date(dato + "T00:00:00");
const isoDow = (dato: string) => d0(dato).getDay() || 7; // Sun=0 → 7
const erHelg = (dato: string) => isoDow(dato) >= 6;
const kortDato = (dato: string) => { const d = d0(dato); return `${d.getDate()}. ${MND[d.getMonth()]}`; };
const nkomma = (n: number) => n.toFixed(1).replace(".", ",").replace(",0", "");
function isoUke(dato: string): number {
  const d = d0(dato); const day = d.getDay() || 7;
  d.setDate(d.getDate() + 4 - day);
  const ys = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - ys.getTime()) / 86400000 + 1) / 7);
}
function timer(start: string, slutt: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = slutt.split(":").map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60;
  return mins / 60;
}
function vaktkodeStil(kode: string): string {
  const k = (kode || "").trim().toUpperCase()[0];
  if (k === "D") return "bg-amber-100 text-amber-900 ring-amber-300 dark:bg-amber-400/15 dark:text-amber-200 dark:ring-amber-400/30";
  if (k === "A" || k === "K") return "bg-sky-100 text-sky-900 ring-sky-300 dark:bg-sky-400/15 dark:text-sky-200 dark:ring-sky-400/30";
  if (k === "N") return "bg-violet-200 text-violet-900 ring-violet-400 dark:bg-violet-400/20 dark:text-violet-200 dark:ring-violet-400/30";
  return "bg-slate-200 text-slate-800 ring-slate-300 dark:bg-slate-400/15 dark:text-slate-200 dark:ring-slate-400/30";
}
const BRUDD_LABEL: Record<string, string> = {
  max_daily_over_13h: "Over 13t på ett døgn", max_daily_over_9h: "Over 9t på ett døgn",
  insufficient_rest_11h: "Under 11t døgnhvile", weekly_over_48h: "Over 48t i uka",
  weekly_over_40h: "Over 40t i uka", weekly_rest_under_35h: "Under 35t ukehvile",
  missing_break_over_5_5h: "Mangler pause (>5,5t)", missing_break_over_8h: "Mangler pause (>8t)",
};

export default function TurnusPage() {
  const [tab, setTab] = useState("planlegging");
  const STEG = [
    { id: "oppsett", nr: 1, navn: "Oppsett" },
    { id: "planlegging", nr: 2, navn: "Planlegg" },
    { id: "regler", nr: 3, navn: "Regler & ønsker" },
  ];
  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6" data-testid="turnus-page">
      <header className="space-y-1 no-print">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold">T</span>
          <h1 className="text-2xl font-semibold tracking-tight">Tidum Turnus</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          KI-basert turnusplanlegging — sett opp bemanning, generer en lovlig turnus, og se hvorfor.
        </p>
      </header>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto w-full justify-start gap-1 bg-transparent p-0 no-print">
          {STEG.map((s, i) => (
            <TabsTrigger key={s.id} value={s.id} data-testid={`tab-${s.id}`}
              className="group gap-2 rounded-lg border border-transparent px-3 py-2 data-[state=active]:border-border data-[state=active]:bg-card data-[state=active]:shadow-sm">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground group-data-[state=active]:bg-primary group-data-[state=active]:text-primary-foreground">{s.nr}</span>
              <span className="text-sm font-medium">{s.navn}</span>
              {i < STEG.length - 1 && <span className="ml-1 hidden text-muted-foreground/50 sm:inline">›</span>}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="oppsett" className="mt-5"><OppsettFane /></TabsContent>
        <TabsContent value="planlegging" className="mt-5"><PlanleggingFane /></TabsContent>
        <TabsContent value="regler" className="mt-5"><ReglerFane /></TabsContent>
      </Tabs>
    </div>
  );
}

function useToastError() {
  const { toast } = useToast();
  return (e: unknown) => toast({ title: "Feil", description: e instanceof Error ? e.message : "Ukjent feil", variant: "destructive" });
}
function TomHint({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-dashed bg-muted/30 px-3 py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

// ── OPPSETT ──────────────────────────────────────────────────────────────────

function OppsettFane() {
  const qc = useQueryClient();
  const onError = useToastError();
  const avdelinger = useQuery({ queryKey: ["turnus-avd"], queryFn: api.listAvdelinger });
  const ansatte = useQuery({ queryKey: ["turnus-ansatte"], queryFn: api.listAnsatte });
  const vaktkoder = useQuery({ queryKey: ["turnus-vaktkoder"], queryFn: api.listVaktkoder });

  const [avdNavn, setAvdNavn] = useState("");
  const [ansNavn, setAnsNavn] = useState("");
  const [ansAvd, setAnsAvd] = useState<number | "">("");
  const [ansEpost, setAnsEpost] = useState("");
  const [ansTlf, setAnsTlf] = useState("");
  const [vkKode, setVkKode] = useState("");
  const [vkStart, setVkStart] = useState("08:00");
  const [vkSlutt, setVkSlutt] = useState("16:00");

  const invalidate = (k: string) => qc.invalidateQueries({ queryKey: [k] });
  const mAvd = useMutation({ mutationFn: api.opprettAvdeling, onError, onSuccess: () => { invalidate("turnus-avd"); setAvdNavn(""); } });
  const mAns = useMutation({ mutationFn: api.opprettAnsatt, onError, onSuccess: () => { invalidate("turnus-ansatte"); setAnsNavn(""); setAnsEpost(""); setAnsTlf(""); } });
  const mVk = useMutation({ mutationFn: api.opprettVaktkode, onError, onSuccess: () => { invalidate("turnus-vaktkoder"); setVkKode(""); } });

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader><CardTitle className="text-base">Avdelinger</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input placeholder="Navn" value={avdNavn} onChange={(e) => setAvdNavn(e.target.value)} data-testid="inp-avd-navn" />
            <Button disabled={!avdNavn.trim()} onClick={() => mAvd.mutate({ navn: avdNavn.trim() })} data-testid="btn-avd">Legg til</Button>
          </div>
          {(avdelinger.data ?? []).length === 0
            ? <TomHint>Ingen avdelinger ennå.</TomHint>
            : <ul className="space-y-1 text-sm">{(avdelinger.data ?? []).map((a) => <li key={a.id} className="rounded bg-muted/40 px-2 py-1.5">{a.navn}</li>)}</ul>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Ansatte</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="Navn" value={ansNavn} onChange={(e) => setAnsNavn(e.target.value)} data-testid="inp-ans-navn" />
          <div className="flex gap-2">
            <Input type="email" placeholder="E-post (varsel)" value={ansEpost} onChange={(e) => setAnsEpost(e.target.value)} data-testid="inp-ans-epost" />
            <Input type="tel" placeholder="Telefon (SMS)" value={ansTlf} onChange={(e) => setAnsTlf(e.target.value)} data-testid="inp-ans-tlf" />
          </div>
          <select className="w-full rounded-md border bg-background px-2 py-1.5 text-sm" value={ansAvd} onChange={(e) => setAnsAvd(Number(e.target.value) || "")}>
            <option value="">Primær avdeling…</option>
            {(avdelinger.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.navn}</option>)}
          </select>
          <Button className="w-full" disabled={!ansNavn.trim()} onClick={() => mAns.mutate({ navn: ansNavn.trim(), primarAvdelingId: ansAvd || undefined, userEmail: ansEpost.trim() || undefined, telefon: ansTlf.trim() || undefined })} data-testid="btn-ans">Legg til ansatt</Button>
          {(ansatte.data ?? []).length === 0
            ? <TomHint>Legg til ansatte som skal inn i turnusen.</TomHint>
            : <ul className="space-y-1 text-sm">{(ansatte.data ?? []).map((a) => <li key={a.id} className="rounded bg-muted/40 px-2 py-1.5">{a.navn}</li>)}</ul>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Vaktkoder</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input placeholder="Kode" value={vkKode} onChange={(e) => setVkKode(e.target.value)} className="w-20" data-testid="inp-vk-kode" />
            <Input type="time" value={vkStart} onChange={(e) => setVkStart(e.target.value)} />
            <Input type="time" value={vkSlutt} onChange={(e) => setVkSlutt(e.target.value)} />
          </div>
          <Button className="w-full" disabled={!vkKode.trim()} onClick={() => mVk.mutate({ kode: vkKode.trim(), startTid: vkStart, sluttTid: vkSlutt })} data-testid="btn-vk">Legg til vaktkode</Button>
          {(vaktkoder.data ?? []).length === 0
            ? <TomHint>F.eks. D 08–16, A 15–23, N 23–07.</TomHint>
            : <ul className="space-y-1 text-sm">{(vaktkoder.data ?? []).map((v) => (
                <li key={v.id} className="flex items-center gap-2 rounded bg-muted/40 px-2 py-1.5">
                  <span className={`inline-flex min-w-6 justify-center rounded px-1.5 text-xs font-bold ring-1 ${vaktkodeStil(v.kode)}`}>{v.kode}</span>
                  <span className="text-muted-foreground">{String(v.start_tid).slice(0, 5)}–{String(v.slutt_tid).slice(0, 5)}</span>
                </li>))}</ul>}
        </CardContent>
      </Card>
    </div>
  );
}

// ── PLANLEGGING ──────────────────────────────────────────────────────────────

function PlanleggingFane() {
  const qc = useQueryClient();
  const onError = useToastError();
  const { toast } = useToast();
  const planer = useQuery({ queryKey: ["turnus-planer"], queryFn: api.listPlaner });
  const avdelinger = useQuery({ queryKey: ["turnus-avd"], queryFn: api.listAvdelinger });

  const [valgtPlan, setValgtPlan] = useState<number | null>(null);
  const [pNavn, setPNavn] = useState("");
  const [pAvd, setPAvd] = useState<number | "">("");
  const [pUker, setPUker] = useState(6);
  const [pStart, setPStart] = useState("2026-01-05");
  const [generId, setGenerId] = useState<number | null>(null);

  const mPlan = useMutation({
    mutationFn: api.opprettPlan, onError,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["turnus-planer"] }); setPNavn(""); },
  });

  const readiness = useQuery({
    queryKey: ["turnus-readiness", valgtPlan],
    queryFn: () => api.getReadiness(valgtPlan!),
    enabled: valgtPlan != null,
  });

  const mGenerer = useMutation({
    mutationFn: () => api.genererTurnus(valgtPlan!), onError,
    onSuccess: (r) => {
      setGenerId(r.generId);
      toast({ title: r.status === "fullfort" ? "Turnus generert" : `Status: ${r.status}`, description: `${r.vakterSkrevet} vakter · ${r.solveTidMs} ms` });
    },
  });

  const forklaring = useQuery({
    queryKey: ["turnus-forklaring", generId],
    queryFn: () => api.getForklaring(generId!),
    enabled: generId != null,
  });

  const ready = readiness.data?.ready === true;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="no-print">
          <CardHeader><CardTitle className="text-base">Turnusplaner</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Input placeholder="Plannavn" value={pNavn} onChange={(e) => setPNavn(e.target.value)} data-testid="inp-plan-navn" />
              <div className="flex gap-2">
                <select className="flex-1 rounded-md border bg-background px-2 py-1.5 text-sm" value={pAvd} onChange={(e) => setPAvd(Number(e.target.value) || "")}>
                  <option value="">Avdeling…</option>
                  {(avdelinger.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.navn}</option>)}
                </select>
                <Input type="number" value={pUker} min={1} max={26} onChange={(e) => setPUker(Number(e.target.value))} className="w-20" title="Rotasjonsuker" />
                <Input type="date" value={pStart} onChange={(e) => setPStart(e.target.value)} />
              </div>
              <Button disabled={!pNavn.trim() || !pAvd} data-testid="btn-plan"
                onClick={() => mPlan.mutate({ navn: pNavn.trim(), avdelingId: Number(pAvd), rotasjonUker: pUker, startDato: pStart })}>
                Opprett plan
              </Button>
            </div>
            {(planer.data ?? []).length === 0
              ? <TomHint>Opprett en turnusplan for å komme i gang.</TomHint>
              : <ul className="space-y-1">
                  {(planer.data ?? []).map((p) => (
                    <li key={p.id}>
                      <button
                        className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition ${valgtPlan === p.id ? "bg-primary/10 ring-1 ring-primary" : "bg-muted/40 hover:bg-muted"}`}
                        onClick={() => { setValgtPlan(p.id); setGenerId(null); }}
                        data-testid={`plan-${p.id}`}>
                        <span className="font-medium">{p.navn}</span>
                        <span className="text-muted-foreground">{p.rotasjon_uker} uker</span>
                      </button>
                    </li>
                  ))}
                </ul>}
          </CardContent>
        </Card>

        <Card className="no-print">
          <CardHeader><CardTitle className="text-base">Generering</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {valgtPlan == null && <TomHint>Velg en plan til venstre.</TomHint>}
            {valgtPlan != null && (
              <>
                <div className="flex flex-wrap items-center gap-2" data-testid="readiness">
                  {ready
                    ? <Badge className="bg-emerald-600 hover:bg-emerald-600">✓ Klar til generering</Badge>
                    : <Badge variant="destructive">Mangler oppsett</Badge>}
                  {!ready && (readiness.data?.mangler ?? []).map((m: string) => <Badge key={m} variant="outline">{m}</Badge>)}
                </div>

                <VektPanel planId={valgtPlan} />

                <Button className="w-full" disabled={!ready || mGenerer.isPending} onClick={() => mGenerer.mutate()} data-testid="btn-generer">
                  {mGenerer.isPending ? "Genererer turnus…" : generId == null ? "Generer turnus" : "Regenerer med vekter"}
                </Button>

                {mGenerer.isPending && (
                  <div className="space-y-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-full" /><Skeleton className="h-16 w-full" /></div>
                )}

                {forklaring.data && !mGenerer.isPending && (
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-3" data-testid="xai">
                    {forklaring.data.strukturert.status === "fullfort" && (forklaring.data.strukturert.konflikter?.length ?? 0) === 0 && (
                      <div className="flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20">
                        <span className="text-base">✓</span> Alle harde krav (arbeidsmiljøloven) oppfylt
                      </div>
                    )}
                    <p className="text-sm">{forklaring.data.narrasjon}</p>
                    {forklaring.data.strukturert.prioriteringer.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-xs font-medium text-muted-foreground">Prioriteringer som styrte forslaget</div>
                        {forklaring.data.strukturert.prioriteringer.map((p) => (
                          <div key={p.dimensjon} className="flex items-center gap-2">
                            <span className="w-40 shrink-0 text-xs">{p.etikett}</span>
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, (p.vekt / 10) * 100)}%` }} />
                            </div>
                            <span className="w-5 text-right text-xs tabular-nums text-muted-foreground">{p.vekt}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {forklaring.data.strukturert.uoppfylte.length > 0 && (
                      <ul className="list-disc pl-4 text-xs text-muted-foreground">
                        {forklaring.data.strukturert.uoppfylte.map((u, i) => <li key={i}>{u.forklaring}</li>)}
                      </ul>
                    )}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {generId != null && <OverstyrGrid generId={generId} />}
    </div>
  );
}

// ── VEKT-SKYVERE (item 3) ────────────────────────────────────────────────────

const VEKTER: { key: keyof VektState; navn: string }[] = [
  { key: "vektOnsker", navn: "Ansattes ønsker" },
  { key: "vektRettferdighet", navn: "Rettferdig vaktfordeling" },
  { key: "vektHelgefrekvens", navn: "Rettferdig helgefordeling" },
  { key: "vektKontinuitet", navn: "Kontinuitet for brukere" },
  { key: "vektKostnad", navn: "Kostnadseffektivitet" },
];
type VektState = { vektOnsker: number; vektRettferdighet: number; vektHelgefrekvens: number; vektKontinuitet: number; vektKostnad: number };

function VektPanel({ planId }: { planId: number }) {
  const qc = useQueryClient();
  const onError = useToastError();
  const prioritering = useQuery({ queryKey: ["turnus-prioritering", planId], queryFn: api.getPrioritering });
  const [vekt, setVekt] = useState<VektState>({ vektOnsker: 5, vektRettferdighet: 5, vektHelgefrekvens: 5, vektKontinuitet: 5, vektKostnad: 5 });

  useEffect(() => {
    const p = prioritering.data;
    if (p) setVekt({
      vektOnsker: p.vekt_onsker ?? 5, vektRettferdighet: p.vekt_rettferdighet ?? 5,
      vektHelgefrekvens: p.vekt_helgefrekvens ?? 5, vektKontinuitet: p.vekt_kontinuitet ?? 5, vektKostnad: p.vekt_kostnad ?? 5,
    });
  }, [prioritering.data]);

  const lagre = useMutation({
    mutationFn: () => api.lagrePrioritering({ planId, ...vekt }), onError,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["turnus-prioritering", planId] }),
  });

  return (
    <details className="rounded-lg border bg-muted/20 px-3 py-2 text-sm">
      <summary className="cursor-pointer font-medium">Juster prioriteringer (KI-vekter)</summary>
      <div className="mt-3 space-y-2">
        {VEKTER.map((v) => (
          <label key={v.key} className="flex items-center gap-2">
            <span className="w-44 shrink-0 text-xs">{v.navn}</span>
            <input type="range" min={0} max={10} value={vekt[v.key]} className="flex-1 accent-[hsl(var(--primary))]"
              onChange={(e) => setVekt((s) => ({ ...s, [v.key]: Number(e.target.value) }))}
              onMouseUp={() => lagre.mutate()} onTouchEnd={() => lagre.mutate()}
              aria-label={v.navn} />
            <span className="w-5 text-right text-xs tabular-nums text-muted-foreground">{vekt[v.key]}</span>
          </label>
        ))}
        <p className="text-xs text-muted-foreground">Dra en vekt og trykk «Regenerer med vekter» for å se turnusen endre seg.</p>
      </div>
    </details>
  );
}

// ── OVERSTYRING ──────────────────────────────────────────────────────────────

type Brudd = { ansattId: number; severity: "error" | "warning"; code?: string; message?: string };

function OverstyrGrid({ generId }: { generId: number }) {
  const onError = useToastError();
  const { toast } = useToast();
  const qc = useQueryClient();
  const vakter = useQuery({ queryKey: ["turnus-gen-vakter", generId], queryFn: () => api.listGenereringVakter(generId) });
  const kontekst = useQuery({ queryKey: ["turnus-gen-kontekst", generId], queryFn: () => api.getGenereringKontekst(generId) });
  const ansatteFull = useQuery({ queryKey: ["turnus-ansatte"], queryFn: api.listAnsatte });

  const [edits, setEdits] = useState<Record<number, number>>({});
  const [fortid, setFortid] = useState<Record<number, number>[]>([]);
  const [fremtid, setFremtid] = useState<Record<number, number>[]>([]);
  const [dragId, setDragId] = useState<number | null>(null);
  const [plukket, setPlukket] = useState<number | null>(null); // keyboard pick-up
  const [brudd, setBrudd] = useState<Brudd[]>([]);
  const [visSammenlign, setVisSammenlign] = useState(false);
  const [melding, setMelding] = useState(""); // aria-live
  const [losLaster, setLosLaster] = useState<number | null>(null);
  const baseline = useRef<{ harde: number; myke: number } | null>(null);
  const cellRefs = useRef<Map<string, HTMLTableCellElement>>(new Map());

  useEffect(() => { setEdits({}); setFortid([]); setFremtid([]); setPlukket(null); baseline.current = null; }, [generId]);

  const commit = (neste: Record<number, number>) => { setFortid((f) => [...f, edits]); setFremtid([]); setEdits(neste); };
  const angre = () => { if (!fortid.length) return; const prev = fortid[fortid.length - 1]; setFortid((f) => f.slice(0, -1)); setFremtid((r) => [edits, ...r]); setEdits(prev); };
  const gjenta = () => { if (!fremtid.length) return; const nxt = fremtid[0]; setFremtid((r) => r.slice(1)); setFortid((f) => [...f, edits]); setEdits(nxt); };

  const rows = vakter.data ?? [];
  const eff = useMemo(() => rows.map((v) => ({ ...v, ansattId: edits[v.id] ?? v.ansattId })), [rows, edits]);
  const ansatte = useMemo(() => {
    const m = new Map<number, string>();
    for (const v of rows) if (v.ansattId != null) m.set(v.ansattId, v.ansattNavn ?? `#${v.ansattId}`);
    return [...m.entries()].map(([id, navn]) => ({ id, navn }));
  }, [rows]);
  const datoer = useMemo(() => [...new Set(rows.map((v) => v.dato))].sort(), [rows]);
  const cell = useMemo(() => {
    const m = new Map<string, GenerertVakt>();
    for (const v of eff) if (v.ansattId != null) m.set(`${v.ansattId}|${v.dato}`, v);
    return m;
  }, [eff]);
  const origCell = useMemo(() => {
    const m = new Map<string, GenerertVakt>();
    for (const v of rows) if (v.ansattId != null) m.set(`${v.ansattId}|${v.dato}`, v);
    return m;
  }, [rows]);
  const endretNokler = useMemo(() => {
    const s = new Set<string>();
    for (const a of ansatte) for (const d of datoer) {
      const key = `${a.id}|${d}`;
      if ((origCell.get(key)?.id ?? null) !== (cell.get(key)?.id ?? null)) s.add(key);
    }
    return s;
  }, [origCell, cell, ansatte, datoer]);
  const ukeGrupper = useMemo(() => {
    const out: { uke: number; dager: string[] }[] = [];
    for (const d of datoer) { const u = isoUke(d); const s = out[out.length - 1]; if (s && s.uke === u) s.dager.push(d); else out.push({ uke: u, dager: [d] }); }
    return out;
  }, [datoer]);
  const dekningPerDag = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of eff) if (v.ansattId != null) m.set(v.dato, (m.get(v.dato) ?? 0) + 1);
    return m;
  }, [eff]);
  const kravPerDag = useMemo(() => {
    const m = new Map<string, number>();
    for (const k of kontekst.data?.krav ?? []) m.set(k.dato, k.krevd);
    return m;
  }, [kontekst.data]);
  const onskeMap = useMemo(() => {
    const m = new Map<string, GenereringKontekst["onsker"][number]>();
    for (const o of kontekst.data?.onsker ?? []) m.set(`${o.ansattId}|${o.dato}`, o);
    return m;
  }, [kontekst.data]);
  const stillingsprosent = useMemo(() => {
    const m = new Map<number, number>();
    for (const a of ansatteFull.data ?? []) m.set(a.id, Number(a.stillingsprosent ?? 100));
    return m;
  }, [ansatteFull.data]);
  const sumPerAnsatt = useMemo(() => {
    const m = new Map<number, { vakter: number; timer: number; helger: number }>();
    for (const v of eff) {
      if (v.ansattId == null) continue;
      const cur = m.get(v.ansattId) ?? { vakter: 0, timer: 0, helger: 0 };
      cur.vakter++; cur.timer += timer(v.startTid, v.sluttTid); if (erHelg(v.dato)) cur.helger++;
      m.set(v.ansattId, cur);
    }
    return m;
  }, [eff]);

  const konsekvens = useMutation({
    mutationFn: (shifts: typeof eff) =>
      api.konsekvens(shifts.filter((v) => v.ansattId != null).map((v) => ({
        ansattId: v.ansattId as number, dato: v.dato, startTid: v.startTid, sluttTid: v.sluttTid,
      }))),
    onError,
    onSuccess: (r) => {
      const b = r.brudd as Brudd[];
      setBrudd(b);
      if (baseline.current == null && Object.keys(edits).length === 0) {
        baseline.current = { harde: b.filter((x) => x.severity === "error").length, myke: b.filter((x) => x.severity === "warning").length };
      }
    },
  });
  useEffect(() => { if (eff.length) konsekvens.mutate(eff); /* eslint-disable-next-line */ }, [eff]);

  const lagre = useMutation({
    mutationFn: () => api.lagreVaktEndringer(generId, Object.entries(edits).map(([vaktId, ansattId]) => ({ vaktId: Number(vaktId), ansattId }))),
    onError,
    onSuccess: (r) => {
      toast({ title: "Turnus lagret", description: `${r.oppdatert} vakter oppdatert.` });
      setEdits({}); setFortid([]); setFremtid([]); baseline.current = null;
      qc.invalidateQueries({ queryKey: ["turnus-gen-vakter", generId] });
    },
  });

  const [inklSms, setInklSms] = useState(false);
  const publiser = useMutation({
    mutationFn: (kanaler: string[]) => api.publiserTurnus(generId, kanaler), onError,
    onSuccess: (r) => toast({
      title: "Turnus publisert",
      description: `E-post ${r.varslet}/${r.mottakere} · app ${r.varsletApp}${r.varsletSms ? ` · SMS ${r.varsletSms}/${r.medTelefon}` : ""}${r.utenEpost ? ` · ${r.utenEpost} mangler e-post` : ""}.`,
    }),
  });

  const bruddFor = (ansattId: number) => brudd.filter((x) => x.ansattId === ansattId);
  const hardeNaa = brudd.filter((x) => x.severity === "error").length;
  const antallEndringer = Object.keys(edits).length;
  const deltaHarde = baseline.current ? hardeNaa - baseline.current.harde : 0;

  const flytt = (vaktId: number, targetAnsatt: number, dato: string) => {
    const eier = edits[vaktId] ?? rows.find((r) => r.id === vaktId)?.ansattId;
    if (eier === targetAnsatt) return;
    if (cell.has(`${targetAnsatt}|${dato}`)) { toast({ title: "Cellen er opptatt", description: "Ansatt har allerede en vakt denne dagen." }); return; }
    const v = rows.find((r) => r.id === vaktId);
    commit({ ...edits, [vaktId]: targetAnsatt });
    setMelding(`Flyttet ${v?.kode ?? "vakt"} til ${ansatte.find((a) => a.id === targetAnsatt)?.navn ?? ""}`);
  };
  const drop = (targetAnsatt: number, dato: string) => {
    if (dragId == null) return;
    const v = rows.find((r) => r.id === dragId);
    if (v && v.dato === dato) flytt(dragId, targetAnsatt, dato);
    setDragId(null);
  };

  // Suggest a legal swap: try moving each of the employee's shifts to an empty
  // cell of another employee that day; keep the first that removes the hard brudd.
  const foreslaaLosning = async (ansattId: number) => {
    setLosLaster(ansattId);
    try {
      const mine = eff.filter((v) => v.ansattId === ansattId);
      for (const v of mine) {
        for (const a of ansatte) {
          if (a.id === ansattId || cell.has(`${a.id}|${v.dato}`)) continue;
          const kand = eff.map((x) => x.id === v.id ? { ...x, ansattId: a.id } : x);
          const r = await api.konsekvens(kand.filter((x) => x.ansattId != null).map((x) => ({
            ansattId: x.ansattId as number, dato: x.dato, startTid: x.startTid, sluttTid: x.sluttTid,
          })));
          const hardeForBegge = (r.brudd as Brudd[]).filter((b) => b.severity === "error" && (b.ansattId === ansattId || b.ansattId === a.id)).length;
          if (hardeForBegge === 0) {
            flytt(v.id, a.id, v.dato);
            toast({ title: "Lovlig bytte funnet", description: `Flyttet ${v.kode} til ${a.navn}.` });
            return;
          }
        }
      }
      toast({ title: "Fant ingen enkelt lovlig bytte", description: "Prøv å justere bemanning eller vekter." });
    } finally { setLosLaster(null); }
  };

  // Keyboard grid navigation: roving focus + Enter to pick up / drop.
  const onCellKey = (e: React.KeyboardEvent, r: number, c: number, ansattId: number, dato: string) => {
    const move = (nr: number, nc: number) => { const el = cellRefs.current.get(`${nr}-${nc}`); if (el) { el.focus(); e.preventDefault(); } };
    if (e.key === "ArrowRight") return move(r, c + 1);
    if (e.key === "ArrowLeft") return move(r, c - 1);
    if (e.key === "ArrowDown") return move(r + 1, c);
    if (e.key === "ArrowUp") return move(r - 1, c);
    if (e.key === "Escape") { setPlukket(null); setMelding("Avbrutt."); return; }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const her = cell.get(`${ansattId}|${dato}`);
      if (plukket == null) {
        if (her) { setPlukket(her.id); setMelding(`Plukket opp ${her.kode}. Naviger med piltaster og trykk Enter for å slippe.`); }
      } else {
        const v = rows.find((x) => x.id === plukket);
        if (v && v.dato === dato) { flytt(plukket, ansattId, dato); setPlukket(null); }
        else setMelding("Kan bare slippe på samme dag i en ledig celle.");
      }
    }
  };

  const dirty = antallEndringer > 0;

  if (vakter.isLoading) {
    return <Card data-testid="overstyring"><CardHeader><CardTitle className="text-base">Overstyring</CardTitle></CardHeader>
      <CardContent><Skeleton className="h-40 w-full" /></CardContent></Card>;
  }

  return (
    <Card data-testid="overstyring">
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
        <div>
          <CardTitle className="text-base">Resultat — dra eller bruk piltaster for å overstyre</CardTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Hver endring viser lovlighetskonsekvensen med én gang.
            {antallEndringer > 0 && <> {" "}<span className="font-medium text-foreground">{antallEndringer} {antallEndringer === 1 ? "endring" : "endringer"}</span>{deltaHarde > 0 && <span className="text-destructive"> · +{deltaHarde} brudd</span>}{deltaHarde < 0 && <span className="text-emerald-600"> · {deltaHarde} brudd</span>}</>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 no-print">
          {konsekvens.isPending && <span className="text-xs text-muted-foreground">Sjekker…</span>}
          <Button size="sm" variant="ghost" onClick={() => setVisSammenlign((v) => !v)}>Sammenlign</Button>
          <Button size="sm" variant="ghost" onClick={() => window.open(`/api/turnus/genereringer/${generId}/pdf`, "_blank")}>Last ned PDF</Button>
          <Button size="sm" variant="ghost" onClick={() => window.print()}>Skriv ut</Button>
          <Button size="sm" variant="ghost" disabled={!fortid.length} onClick={angre} title="Angre">↶ Angre</Button>
          <Button size="sm" variant="ghost" disabled={!fremtid.length} onClick={gjenta} title="Gjenta">↷ Gjenta</Button>
          <Button size="sm" variant="outline" disabled={!dirty} onClick={() => commit({})} data-testid="btn-tilbakestill">Tilbakestill</Button>
          <Button size="sm" variant="outline" disabled={!dirty || lagre.isPending} onClick={() => lagre.mutate()} data-testid="btn-lagre">{lagre.isPending ? "Lagrer…" : "Lagre turnus"}</Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" disabled={publiser.isPending} data-testid="btn-publiser">{publiser.isPending ? "Publiserer…" : "Publiser & varsle"}</Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 text-sm">
              <p className="mb-2">Markerer turnusen som publisert og varsler ansatte via <strong>e-post</strong> (med PDF) og <strong>app-varsel</strong> for de med konto.</p>
              <label className="mb-2 flex items-center gap-2">
                <input type="checkbox" checked={inklSms} onChange={(e) => setInklSms(e.target.checked)} data-testid="chk-sms" />
                <span>Send også <strong>SMS</strong> <span className="text-muted-foreground">(koster per melding)</span></span>
              </label>
              <Button size="sm" className="w-full" onClick={() => publiser.mutate(["epost", "app", ...(inklSms ? ["sms"] : [])])} data-testid="btn-publiser-bekreft">Publiser & send varsel</Button>
            </PopoverContent>
          </Popover>
        </div>
      </CardHeader>
      <CardContent>
        {/* aria-live announcements for screen readers */}
        <div aria-live="polite" className="sr-only">{melding}</div>

        {rows.length === 0 && <TomHint>Ingen genererte vakter å vise.</TomHint>}

        {rows.length > 0 && visSammenlign && (
          <div className="mb-4 space-y-3">
            {baseline.current && (
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-md border bg-muted/20 p-2"><div className="text-xs text-muted-foreground">Generert (KI-forslag)</div><div>{baseline.current.harde} brudd · {baseline.current.myke} advarsler</div></div>
                <div className="rounded-md border bg-muted/20 p-2"><div className="text-xs text-muted-foreground">Etter dine endringer</div><div>{hardeNaa} brudd · {brudd.filter((x) => x.severity === "warning").length} advarsler</div></div>
              </div>
            )}
            <div className="grid gap-3 lg:grid-cols-2">
              <MiniGrid tittel="Generert (KI-forslag)" ansatte={ansatte} datoer={datoer} cellMap={origCell} endret={endretNokler} />
              <MiniGrid tittel={`Etter dine endringer${antallEndringer ? ` · ${antallEndringer}` : ""}`} ansatte={ansatte} datoer={datoer} cellMap={cell} endret={endretNokler} />
            </div>
          </div>
        )}

        {rows.length > 0 && (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {["D", "A", "N"].map((k) => <span key={k} className={`inline-flex min-w-5 justify-center rounded px-1 font-bold ring-1 ${vaktkodeStil(k)}`}>{k}</span>)}
              <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm bg-amber-100 ring-1 ring-amber-300 dark:bg-amber-400/15" /> helg</span>
              <span className="flex items-center gap-1">♥ ønsket</span>
            </div>

            {/* Desktop grid */}
            <div className="hidden overflow-x-auto md:block">
              <table className="border-separate border-spacing-0 text-sm" role="grid" aria-label="Turnusrutenett">
                <thead>
                  <tr>
                    <th rowSpan={2} className="sticky left-0 z-10 bg-card px-2 py-1 text-left align-bottom font-medium">Ansatt</th>
                    {ukeGrupper.map((g) => (<th key={g.uke} colSpan={g.dager.length} className="border-b px-1 pb-1 text-center text-xs font-semibold text-muted-foreground">Uke {g.uke}</th>))}
                    <th rowSpan={2} className="px-2 text-right align-bottom text-xs font-medium text-muted-foreground">Sum</th>
                  </tr>
                  <tr>
                    {datoer.map((d) => (
                      <th key={d} className={`px-1 py-1 text-center text-[11px] font-normal ${erHelg(d) ? "bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300" : "text-muted-foreground"}`}>
                        {UKEDAGER[isoDow(d)]}<br />{kortDato(d)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ansatte.map((a, ri) => {
                    const b = bruddFor(a.id);
                    const nErr = b.filter((x) => x.severity === "error").length;
                    const nWarn = b.filter((x) => x.severity === "warning").length;
                    const sum = sumPerAnsatt.get(a.id) ?? { vakter: 0, timer: 0, helger: 0 };
                    return (
                      <tr key={a.id} data-testid={`overstyr-rad-${a.id}`} className="hover:bg-muted/20">
                        <td className="sticky left-0 z-10 whitespace-nowrap bg-card px-2 py-1">
                          <div className="flex items-center gap-1.5">
                            <AnsattDetalj navn={a.navn} sum={sum} prosent={stillingsprosent.get(a.id) ?? 100} brudd={b} />
                            <StatusBadge ansattId={a.id} nErr={nErr} nWarn={nWarn} brudd={b} />
                            {nErr > 0 && <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs no-print" disabled={losLaster === a.id} onClick={() => foreslaaLosning(a.id)}>{losLaster === a.id ? "…" : "Løs"}</Button>}
                          </div>
                        </td>
                        {datoer.map((d, ci) => {
                          const v = cell.get(`${a.id}|${d}`);
                          const droppbar = dragId != null && !v;
                          const onske = onskeMap.get(`${a.id}|${d}`);
                          const overstyrt = v != null && edits[v.id] != null;
                          const erPlukket = v != null && plukket === v.id;
                          return (
                            <td key={d} data-testid={`celle-${a.id}-${d}`}
                              ref={(el) => { if (el) cellRefs.current.set(`${ri}-${ci}`, el); }}
                              tabIndex={ri === 0 && ci === 0 ? 0 : -1}
                              role="gridcell"
                              aria-label={`${a.navn}, ${UKEDAGER[isoDow(d)]} ${kortDato(d)}${v ? `, vakt ${v.kode}` : ", ledig"}`}
                              onKeyDown={(e) => onCellKey(e, ri, ci, a.id, d)}
                              className={`border-b border-r px-1 py-1 text-center outline-none focus:ring-2 focus:ring-primary ${erHelg(d) ? "bg-amber-50/50 dark:bg-amber-400/5" : ""} ${droppbar ? "outline-dashed outline-1 outline-primary/40" : ""} ${erPlukket ? "ring-2 ring-primary" : ""}`}
                              onDragOver={(e) => { if (droppbar) e.preventDefault(); }}
                              onDrop={() => drop(a.id, d)}>
                              {v && <VaktChip vakt={v} ansatte={ansatte} overstyrt={overstyrt} onske={onske?.type} onDragStart={() => setDragId(v.id)} onDragEnd={() => setDragId(null)} onReassign={(til) => flytt(v.id, til, d)} />}
                              {!v && onske && <span className="text-[10px] text-muted-foreground/60" title={`Ønske: ${onske.type}`}>♥</span>}
                            </td>
                          );
                        })}
                        <td className="whitespace-nowrap px-2 text-right text-xs tabular-nums text-muted-foreground">{sum.vakter}v · {nkomma(sum.timer)}t</td>
                      </tr>
                    );
                  })}
                  <tr>
                    <td className="sticky left-0 z-10 bg-card px-2 py-1 text-xs font-medium text-muted-foreground">Dekket / krevd</td>
                    {datoer.map((d) => {
                      const dek = dekningPerDag.get(d) ?? 0; const krav = kravPerDag.get(d);
                      const under = krav != null && dek < krav;
                      return (
                        <td key={d} className={`border-t px-1 py-1 text-center text-xs tabular-nums ${erHelg(d) ? "bg-amber-50/50 dark:bg-amber-400/5" : ""} ${under ? "font-semibold text-destructive" : "text-muted-foreground"}`}>
                          {dek}{krav != null ? `/${krav}` : ""}
                        </td>
                      );
                    })}
                    <td className="border-t" />
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Mobile: per-employee cards */}
            <div className="space-y-2 md:hidden">
              {ansatte.map((a) => {
                const b = bruddFor(a.id);
                const nErr = b.filter((x) => x.severity === "error").length;
                const nWarn = b.filter((x) => x.severity === "warning").length;
                const sum = sumPerAnsatt.get(a.id) ?? { vakter: 0, timer: 0, helger: 0 };
                const mine = eff.filter((v) => v.ansattId === a.id).sort((x, y) => x.dato.localeCompare(y.dato));
                return (
                  <div key={a.id} className="rounded-lg border p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="font-medium">{a.navn}</span>
                      <div className="flex items-center gap-1.5"><StatusBadge ansattId={a.id} nErr={nErr} nWarn={nWarn} brudd={b} /><span className="text-xs text-muted-foreground">{sum.vakter}v · {nkomma(sum.timer)}t</span></div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {mine.map((v) => (
                        <span key={v.id} className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ring-1 ${vaktkodeStil(v.kode)}`}>
                          <span className="text-[10px] opacity-70">{UKEDAGER[isoDow(v.dato)]} {kortDato(v.dato)}</span> {v.kode}
                        </span>
                      ))}
                      {mine.length === 0 && <span className="text-xs text-muted-foreground">Ingen vakter</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function MiniGrid({ tittel, ansatte, datoer, cellMap, endret }: {
  tittel: string; ansatte: { id: number; navn: string }[]; datoer: string[];
  cellMap: Map<string, GenerertVakt>; endret: Set<string>;
}) {
  return (
    <div className="rounded-md border p-2">
      <div className="mb-1.5 text-xs font-medium">{tittel}</div>
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-0 text-[10px]">
          <thead>
            <tr>
              <th className="px-1 text-left font-normal text-muted-foreground">Ansatt</th>
              {datoer.map((d) => <th key={d} className={`px-0.5 text-center font-normal ${erHelg(d) ? "text-amber-700" : "text-muted-foreground"}`}>{kortDato(d)}</th>)}
            </tr>
          </thead>
          <tbody>
            {ansatte.map((a) => (
              <tr key={a.id}>
                <td className="whitespace-nowrap px-1 font-medium">{a.navn}</td>
                {datoer.map((d) => {
                  const v = cellMap.get(`${a.id}|${d}`);
                  const diff = endret.has(`${a.id}|${d}`);
                  return (
                    <td key={d} className={`px-0.5 py-0.5 text-center ${erHelg(d) ? "bg-amber-50/50 dark:bg-amber-400/5" : ""} ${diff ? "ring-1 ring-amber-500" : ""}`}>
                      {v && <span className={`inline-flex min-w-4 justify-center rounded px-1 font-bold ring-1 ${vaktkodeStil(v.kode)}`}>{v.kode}</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusBadge({ ansattId, nErr, nWarn, brudd }: { ansattId: number; nErr: number; nWarn: number; brudd: Brudd[] }) {
  if (nErr === 0 && nWarn === 0) return <Badge variant="outline" className="border-emerald-500 text-emerald-600 transition-colors">OK</Badge>;
  const testId = nErr > 0 ? `brudd-error-${ansattId}` : undefined;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button data-testid={testId} aria-label={nErr > 0 ? `${nErr} lovbrudd, vis detaljer` : `${nWarn} advarsler, vis detaljer`}>
          {nErr > 0
            ? <Badge variant="destructive" className="cursor-pointer transition-colors">{nErr} brudd</Badge>
            : <Badge className="cursor-pointer bg-amber-500 transition-colors hover:bg-amber-500">{nWarn} advarsel</Badge>}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 text-sm">
        <div className="mb-1 font-medium">Lovlighet</div>
        <ul className="space-y-1">
          {brudd.map((x, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <span className={x.severity === "error" ? "text-destructive" : "text-amber-600"}>●</span>
              <span>{x.code ? (BRUDD_LABEL[x.code] ?? x.code) : x.message}</span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function AnsattDetalj({ navn, sum, prosent, brudd }: { navn: string; sum: { vakter: number; timer: number; helger: number }; prosent: number; brudd: Brudd[] }) {
  const maalTimer = (prosent / 100) * 37.5;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="font-medium underline-offset-2 hover:underline" aria-label={`Detaljer for ${navn}`}>{navn}</button>
      </PopoverTrigger>
      <PopoverContent className="w-64 text-sm">
        <div className="mb-2 font-medium">{navn}</div>
        <dl className="space-y-1 text-xs">
          <div className="flex justify-between"><dt className="text-muted-foreground">Stillingsprosent</dt><dd>{prosent} %</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">Timer (uke-snitt mål {nkomma(maalTimer)}t)</dt><dd>{nkomma(sum.timer)}t</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">Vakter</dt><dd>{sum.vakter}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">Helgevakter</dt><dd>{sum.helger}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">Lovbrudd / advarsler</dt><dd>{brudd.filter((b) => b.severity === "error").length} / {brudd.filter((b) => b.severity === "warning").length}</dd></div>
        </dl>
      </PopoverContent>
    </Popover>
  );
}

function VaktChip({ vakt, ansatte, overstyrt, onske, onDragStart, onDragEnd, onReassign }: {
  vakt: GenerertVakt; ansatte: { id: number; navn: string }[]; overstyrt: boolean; onske?: string;
  onDragStart: () => void; onDragEnd: () => void; onReassign: (til: number) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span draggable onDragStart={onDragStart} onDragEnd={onDragEnd}
          className={`relative inline-flex min-w-7 cursor-grab justify-center rounded px-2 py-0.5 text-xs font-bold ring-1 transition-transform active:cursor-grabbing active:scale-95 ${vaktkodeStil(vakt.kode)} ${overstyrt ? "ring-2 ring-primary" : ""}`}
          data-testid={`vakt-${vakt.id}`}>
          {vakt.kode}
          {onske && <span className="absolute -right-1 -top-1 text-[8px]" title={`Ønske: ${onske}`}>♥</span>}
        </span>
      </PopoverTrigger>
      <PopoverContent className="w-56 text-sm">
        <div className="mb-1.5 text-xs text-muted-foreground">Flytt {vakt.kode} ({vakt.startTid}–{vakt.sluttTid}) til:</div>
        <div className="grid gap-1">
          {ansatte.filter((a) => a.id !== vakt.ansattId).map((a) => (
            <button key={a.id} className="rounded px-2 py-1 text-left text-sm hover:bg-muted" onClick={() => { onReassign(a.id); setOpen(false); }}>{a.navn}</button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── REGLER & ØNSKER ──────────────────────────────────────────────────────────

function ReglerFane() {
  const qc = useQueryClient();
  const onError = useToastError();
  const regler = useQuery({ queryKey: ["turnus-regler"], queryFn: api.listRegler });
  const [regeltype, setRegeltype] = useState("aml_daglig_hvile_11t");
  const [haard, setHaard] = useState(true);

  const mRegel = useMutation({ mutationFn: api.opprettRegel, onError, onSuccess: () => qc.invalidateQueries({ queryKey: ["turnus-regler"] }) });
  const mSlett = useMutation({ mutationFn: api.slettRegel, onError, onSuccess: () => qc.invalidateQueries({ queryKey: ["turnus-regler"] }) });

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Regler</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <select className="rounded-md border bg-background px-2 py-1.5 text-sm" value={regeltype} onChange={(e) => setRegeltype(e.target.value)} data-testid="sel-regeltype">
            <option value="aml_daglig_hvile_11t">AML: 11t døgnhvile</option>
            <option value="aml_max_uketimer">AML: maks uketimer</option>
            <option value="helgefrekvens">Helgefrekvens</option>
            <option value="kompetansekrav">Kompetansekrav</option>
          </select>
          <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={haard} onChange={(e) => setHaard(e.target.checked)} /> Hard</label>
          <Button onClick={() => mRegel.mutate({ regeltype, haard })} data-testid="btn-regel">Legg til regel</Button>
        </div>
        {(regler.data ?? []).length === 0
          ? <TomHint>Ingen regler ennå — harde regler blokkerer, myke vektes.</TomHint>
          : <ul className="space-y-1 text-sm">
              {(regler.data ?? []).map((r) => (
                <li key={r.id} className="flex items-center justify-between rounded bg-muted/40 px-2 py-1.5">
                  <span>{r.regeltype} {r.haard ? <Badge variant="outline" className="ml-1">hard</Badge> : <Badge variant="secondary" className="ml-1">myk</Badge>}</span>
                  <Button size="sm" variant="ghost" onClick={() => mSlett.mutate(String(r.id))}>Fjern</Button>
                </li>
              ))}
            </ul>}
      </CardContent>
    </Card>
  );
}
