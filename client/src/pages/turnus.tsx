/**
 * Tidum Turnus — KI-turnusplanlegger.
 * Guided flow (Oppsett → Planlegging → Regler), generation with explainable AI,
 * and a colour-coded override grid with live AML consequence-preview + save.
 * Wired to client/src/lib/turnus-api.ts.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
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
import type { GenerertVakt } from "@/lib/turnus-api";

const UKEDAGER = ["", "man", "tir", "ons", "tor", "fre", "lør", "søn"];
const MND = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"];

// ── date helpers (norsk) ─────────────────────────────────────────────────────
const d0 = (dato: string) => new Date(dato + "T00:00:00");
const isoDow = (dato: string) => d0(dato).getDay() || 7; // Sun=0 → 7
const erHelg = (dato: string) => isoDow(dato) >= 6;
const kortDato = (dato: string) => { const d = d0(dato); return `${d.getDate()}. ${MND[d.getMonth()]}`; };
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
  if (mins <= 0) mins += 24 * 60; // overnatt
  return mins / 60;
}

// Shift-code colour role (day = amber, evening = sky, night = violet, other = slate).
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
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold">T</span>
          <h1 className="text-2xl font-semibold tracking-tight">Tidum Turnus</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          KI-basert turnusplanlegging — sett opp bemanning, generer en lovlig turnus, og se hvorfor.
        </p>
      </header>

      <Tabs value={tab} onValueChange={setTab}>
        {/* Stepper-styled navigation */}
        <TabsList className="h-auto w-full justify-start gap-1 bg-transparent p-0">
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
  const [vkKode, setVkKode] = useState("");
  const [vkStart, setVkStart] = useState("08:00");
  const [vkSlutt, setVkSlutt] = useState("16:00");

  const invalidate = (k: string) => qc.invalidateQueries({ queryKey: [k] });
  const mAvd = useMutation({ mutationFn: api.opprettAvdeling, onError, onSuccess: () => { invalidate("turnus-avd"); setAvdNavn(""); } });
  const mAns = useMutation({ mutationFn: api.opprettAnsatt, onError, onSuccess: () => { invalidate("turnus-ansatte"); setAnsNavn(""); } });
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
          <select className="w-full rounded-md border bg-background px-2 py-1.5 text-sm" value={ansAvd} onChange={(e) => setAnsAvd(Number(e.target.value) || "")}>
            <option value="">Primær avdeling…</option>
            {(avdelinger.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.navn}</option>)}
          </select>
          <Button className="w-full" disabled={!ansNavn.trim()} onClick={() => mAns.mutate({ navn: ansNavn.trim(), primarAvdelingId: ansAvd || undefined })} data-testid="btn-ans">Legg til ansatt</Button>
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
        <Card>
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

        <Card>
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
                <Button className="w-full" disabled={!ready || mGenerer.isPending} onClick={() => mGenerer.mutate()} data-testid="btn-generer">
                  {mGenerer.isPending ? "Genererer turnus…" : "Generer turnus"}
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
                              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (p.vekt / 10) * 100)}%` }} />
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

// ── OVERSTYRING (A5) ─────────────────────────────────────────────────────────

type Brudd = { ansattId: number; severity: "error" | "warning"; code?: string; message?: string };

function OverstyrGrid({ generId }: { generId: number }) {
  const onError = useToastError();
  const { toast } = useToast();
  const qc = useQueryClient();
  const vakter = useQuery({ queryKey: ["turnus-gen-vakter", generId], queryFn: () => api.listGenereringVakter(generId) });

  // edits: vaktId → overstyrt ansattId. history/redo stacks for undo/redo.
  const [edits, setEdits] = useState<Record<number, number>>({});
  const [fortid, setFortid] = useState<Record<number, number>[]>([]);
  const [fremtid, setFremtid] = useState<Record<number, number>[]>([]);
  const [dragId, setDragId] = useState<number | null>(null);
  const [brudd, setBrudd] = useState<Brudd[]>([]);

  useEffect(() => { setEdits({}); setFortid([]); setFremtid([]); }, [generId]);

  const commit = (neste: Record<number, number>) => {
    setFortid((f) => [...f, edits]); setFremtid([]); setEdits(neste);
  };
  const angre = () => { if (!fortid.length) return; const prev = fortid[fortid.length - 1]; setFortid((f) => f.slice(0, -1)); setFremtid((r) => [edits, ...r]); setEdits(prev); };
  const gjenta = () => { if (!fremtid.length) return; const nxt = fremtid[0]; setFremtid((r) => r.slice(1)); setFortid((f) => [...f, edits]); setEdits(nxt); };

  const rows = vakter.data ?? [];
  const eff = useMemo(
    () => rows.map((v) => ({ ...v, ansattId: edits[v.id] ?? v.ansattId })),
    [rows, edits],
  );

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
  // week groupings for the header (colspans)
  const ukeGrupper = useMemo(() => {
    const out: { uke: number; dager: string[] }[] = [];
    for (const d of datoer) {
      const u = isoUke(d);
      const siste = out[out.length - 1];
      if (siste && siste.uke === u) siste.dager.push(d); else out.push({ uke: u, dager: [d] });
    }
    return out;
  }, [datoer]);
  const dekningPerDag = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of eff) if (v.ansattId != null) m.set(v.dato, (m.get(v.dato) ?? 0) + 1);
    return m;
  }, [eff]);
  const sumPerAnsatt = useMemo(() => {
    const m = new Map<number, { vakter: number; timer: number }>();
    for (const v of eff) {
      if (v.ansattId == null) continue;
      const cur = m.get(v.ansattId) ?? { vakter: 0, timer: 0 };
      cur.vakter++; cur.timer += timer(v.startTid, v.sluttTid);
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
    onSuccess: (r) => setBrudd(r.brudd as Brudd[]),
  });
  useEffect(() => { if (eff.length) konsekvens.mutate(eff); /* eslint-disable-next-line */ }, [eff]);

  const lagre = useMutation({
    mutationFn: () => api.lagreVaktEndringer(generId, Object.entries(edits).map(([vaktId, ansattId]) => ({ vaktId: Number(vaktId), ansattId }))),
    onError,
    onSuccess: (r) => {
      toast({ title: "Turnus lagret", description: `${r.oppdatert} vakter oppdatert.` });
      setEdits({}); setFortid([]); setFremtid([]);
      qc.invalidateQueries({ queryKey: ["turnus-gen-vakter", generId] });
    },
  });

  const bruddFor = (ansattId: number) => brudd.filter((x) => x.ansattId === ansattId);

  const flytt = (vaktId: number, targetAnsatt: number, dato: string) => {
    const eier = edits[vaktId] ?? rows.find((r) => r.id === vaktId)?.ansattId;
    if (eier === targetAnsatt) return;
    if (cell.has(`${targetAnsatt}|${dato}`)) { toast({ title: "Cellen er opptatt", description: "Ansatt har allerede en vakt denne dagen." }); return; }
    commit({ ...edits, [vaktId]: targetAnsatt });
  };
  const drop = (targetAnsatt: number, dato: string) => {
    if (dragId == null) return;
    const v = rows.find((r) => r.id === dragId);
    if (v && v.dato === dato) flytt(dragId, targetAnsatt, dato);
    setDragId(null);
  };

  const dirty = Object.keys(edits).length > 0;

  if (vakter.isLoading) {
    return <Card data-testid="overstyring"><CardHeader><CardTitle className="text-base">Overstyring</CardTitle></CardHeader>
      <CardContent><Skeleton className="h-40 w-full" /></CardContent></Card>;
  }

  return (
    <Card data-testid="overstyring">
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
        <div>
          <CardTitle className="text-base">Resultat — dra vakter mellom ansatte for å overstyre</CardTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">Hver endring viser lovlighetskonsekvensen med én gang. Klikk en vakt for å flytte uten å dra.</p>
        </div>
        <div className="flex items-center gap-2">
          {konsekvens.isPending && <span className="text-xs text-muted-foreground">Sjekker…</span>}
          <Button size="sm" variant="ghost" disabled={!fortid.length} onClick={angre} title="Angre">↶ Angre</Button>
          <Button size="sm" variant="ghost" disabled={!fremtid.length} onClick={gjenta} title="Gjenta">↷ Gjenta</Button>
          <Button size="sm" variant="outline" disabled={!dirty} onClick={() => { commit({}); }} data-testid="btn-tilbakestill">Tilbakestill</Button>
          <Button size="sm" disabled={!dirty || lagre.isPending} onClick={() => lagre.mutate()} data-testid="btn-lagre">{lagre.isPending ? "Lagrer…" : "Lagre turnus"}</Button>
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 && <TomHint>Ingen genererte vakter å vise.</TomHint>}
        {rows.length > 0 && (
          <>
            {/* legend */}
            <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {["D", "A", "N"].map((k) => <span key={k} className="flex items-center gap-1"><span className={`inline-flex min-w-5 justify-center rounded px-1 font-bold ring-1 ${vaktkodeStil(k)}`}>{k}</span></span>)}
              <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm bg-amber-100 ring-1 ring-amber-300 dark:bg-amber-400/15" /> helg</span>
            </div>
            <div className="overflow-x-auto">
              <table className="border-separate border-spacing-0 text-sm">
                <thead>
                  <tr>
                    <th rowSpan={2} className="sticky left-0 z-10 bg-card px-2 py-1 text-left align-bottom font-medium">Ansatt</th>
                    {ukeGrupper.map((g) => (
                      <th key={g.uke} colSpan={g.dager.length} className="border-b px-1 pb-1 text-center text-xs font-semibold text-muted-foreground">Uke {g.uke}</th>
                    ))}
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
                  {ansatte.map((a) => {
                    const b = bruddFor(a.id);
                    const nErr = b.filter((x) => x.severity === "error").length;
                    const nWarn = b.filter((x) => x.severity === "warning").length;
                    const sum = sumPerAnsatt.get(a.id) ?? { vakter: 0, timer: 0 };
                    return (
                      <tr key={a.id} data-testid={`overstyr-rad-${a.id}`} className="hover:bg-muted/20">
                        <td className="sticky left-0 z-10 whitespace-nowrap bg-card px-2 py-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium">{a.navn}</span>
                            <StatusBadge ansattId={a.id} nErr={nErr} nWarn={nWarn} brudd={b} />
                          </div>
                        </td>
                        {datoer.map((d) => {
                          const v = cell.get(`${a.id}|${d}`);
                          const droppbar = dragId != null && !v;
                          return (
                            <td key={d} data-testid={`celle-${a.id}-${d}`}
                              className={`border-b border-r px-1 py-1 text-center ${erHelg(d) ? "bg-amber-50/50 dark:bg-amber-400/5" : ""} ${droppbar ? "outline-dashed outline-1 outline-primary/40" : ""}`}
                              onDragOver={(e) => { if (droppbar) e.preventDefault(); }}
                              onDrop={() => drop(a.id, d)}>
                              {v && <VaktChip vakt={v} ansatte={ansatte} onDragStart={() => setDragId(v.id)} onDragEnd={() => setDragId(null)} onReassign={(til) => flytt(v.id, til, d)} />}
                            </td>
                          );
                        })}
                        <td className="whitespace-nowrap px-2 text-right text-xs tabular-nums text-muted-foreground">
                          {sum.vakter}v · {sum.timer.toFixed(0)}t
                        </td>
                      </tr>
                    );
                  })}
                  {/* coverage footer */}
                  <tr>
                    <td className="sticky left-0 z-10 bg-card px-2 py-1 text-xs font-medium text-muted-foreground">Dekket</td>
                    {datoer.map((d) => (
                      <td key={d} className={`border-t px-1 py-1 text-center text-xs tabular-nums text-muted-foreground ${erHelg(d) ? "bg-amber-50/50 dark:bg-amber-400/5" : ""}`}>{dekningPerDag.get(d) ?? 0}</td>
                    ))}
                    <td className="border-t" />
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ ansattId, nErr, nWarn, brudd }: { ansattId: number; nErr: number; nWarn: number; brudd: Brudd[] }) {
  if (nErr === 0 && nWarn === 0) {
    return <Badge variant="outline" className="border-emerald-500 text-emerald-600">OK</Badge>;
  }
  const testId = nErr > 0 ? `brudd-error-${ansattId}` : undefined;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button data-testid={testId}>
          {nErr > 0
            ? <Badge variant="destructive" className="cursor-pointer">{nErr} brudd</Badge>
            : <Badge className="cursor-pointer bg-amber-500 hover:bg-amber-500">{nWarn} advarsel</Badge>}
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

function VaktChip({ vakt, ansatte, onDragStart, onDragEnd, onReassign }: {
  vakt: GenerertVakt; ansatte: { id: number; navn: string }[];
  onDragStart: () => void; onDragEnd: () => void; onReassign: (til: number) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span draggable onDragStart={onDragStart} onDragEnd={onDragEnd}
          className={`inline-flex min-w-7 cursor-grab justify-center rounded px-2 py-0.5 text-xs font-bold ring-1 active:cursor-grabbing ${vaktkodeStil(vakt.kode)}`}
          data-testid={`vakt-${vakt.id}`}>
          {vakt.kode}
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

  const mRegel = useMutation({
    mutationFn: api.opprettRegel, onError,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["turnus-regler"] }),
  });
  const mSlett = useMutation({
    mutationFn: api.slettRegel, onError,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["turnus-regler"] }),
  });

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
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={haard} onChange={(e) => setHaard(e.target.checked)} /> Hard
          </label>
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
