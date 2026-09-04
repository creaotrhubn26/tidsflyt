/**
 * Tidum Turnus — KI-turnusplanlegger (A4).
 * Setup → generer → forklaring, wired to client/src/lib/turnus-api.ts.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import * as api from "@/lib/turnus-api";

const UKEDAGER = ["", "Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"];

export default function TurnusPage() {
  const [tab, setTab] = useState("planlegging");
  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6" data-testid="turnus-page">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Tidum Turnus</h1>
        <p className="text-sm text-muted-foreground">
          KI-basert turnusplanlegging — sett opp bemanning, generer en lovlig turnus, og se hvorfor.
        </p>
      </header>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="oppsett" data-testid="tab-oppsett">Oppsett</TabsTrigger>
          <TabsTrigger value="planlegging" data-testid="tab-planlegging">Planlegging</TabsTrigger>
          <TabsTrigger value="regler" data-testid="tab-regler">Regler &amp; ønsker</TabsTrigger>
        </TabsList>
        <TabsContent value="oppsett" className="mt-4"><OppsettFane /></TabsContent>
        <TabsContent value="planlegging" className="mt-4"><PlanleggingFane /></TabsContent>
        <TabsContent value="regler" className="mt-4"><ReglerFane /></TabsContent>
      </Tabs>
    </div>
  );
}

function useToastError() {
  const { toast } = useToast();
  return (e: unknown) => toast({ title: "Feil", description: e instanceof Error ? e.message : "Ukjent feil", variant: "destructive" });
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
          <ul className="text-sm space-y-1">{(avdelinger.data ?? []).map((a) => <li key={a.id} className="rounded bg-muted/40 px-2 py-1">{a.navn}</li>)}</ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Ansatte</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="Navn" value={ansNavn} onChange={(e) => setAnsNavn(e.target.value)} data-testid="inp-ans-navn" />
          <select className="w-full rounded border bg-background px-2 py-1 text-sm" value={ansAvd} onChange={(e) => setAnsAvd(Number(e.target.value) || "")}>
            <option value="">Primær avdeling…</option>
            {(avdelinger.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.navn}</option>)}
          </select>
          <Button disabled={!ansNavn.trim()} onClick={() => mAns.mutate({ navn: ansNavn.trim(), primarAvdelingId: ansAvd || undefined })} data-testid="btn-ans">Legg til</Button>
          <ul className="text-sm space-y-1">{(ansatte.data ?? []).map((a) => <li key={a.id} className="rounded bg-muted/40 px-2 py-1">{a.navn}</li>)}</ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Vaktkoder</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input placeholder="Kode (D/A/N)" value={vkKode} onChange={(e) => setVkKode(e.target.value)} className="w-24" data-testid="inp-vk-kode" />
            <Input type="time" value={vkStart} onChange={(e) => setVkStart(e.target.value)} />
            <Input type="time" value={vkSlutt} onChange={(e) => setVkSlutt(e.target.value)} />
          </div>
          <Button disabled={!vkKode.trim()} onClick={() => mVk.mutate({ kode: vkKode.trim(), startTid: vkStart, sluttTid: vkSlutt })} data-testid="btn-vk">Legg til</Button>
          <ul className="text-sm space-y-1">{(vaktkoder.data ?? []).map((v) => <li key={v.id} className="rounded bg-muted/40 px-2 py-1">{v.kode} · {String(v.start_tid).slice(0, 5)}–{String(v.slutt_tid).slice(0, 5)}</li>)}</ul>
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
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle className="text-base">Turnusplaner</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Input placeholder="Plannavn" value={pNavn} onChange={(e) => setPNavn(e.target.value)} data-testid="inp-plan-navn" />
            <div className="flex gap-2">
              <select className="flex-1 rounded border bg-background px-2 py-1 text-sm" value={pAvd} onChange={(e) => setPAvd(Number(e.target.value) || "")}>
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
          <ul className="space-y-1">
            {(planer.data ?? []).map((p) => (
              <li key={p.id}>
                <button
                  className={`w-full rounded px-2 py-1.5 text-left text-sm ${valgtPlan === p.id ? "bg-primary/10 ring-1 ring-primary" : "bg-muted/40 hover:bg-muted"}`}
                  onClick={() => { setValgtPlan(p.id); setGenerId(null); }}
                  data-testid={`plan-${p.id}`}>
                  {p.navn} <span className="text-muted-foreground">· {p.rotasjon_uker} uker</span>
                </button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Generering</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {valgtPlan == null && <p className="text-sm text-muted-foreground">Velg en plan til venstre.</p>}
          {valgtPlan != null && (
            <>
              <div className="flex items-center gap-2" data-testid="readiness">
                {ready
                  ? <Badge className="bg-emerald-600 hover:bg-emerald-600">Klar til generering</Badge>
                  : <Badge variant="destructive">Mangler oppsett</Badge>}
                {!ready && (readiness.data?.mangler ?? []).map((m: string) => <Badge key={m} variant="outline">{m}</Badge>)}
              </div>
              <Button disabled={!ready || mGenerer.isPending} onClick={() => mGenerer.mutate()} data-testid="btn-generer">
                {mGenerer.isPending ? "Genererer…" : "Generer turnus"}
              </Button>

              {forklaring.data && (
                <div className="rounded-lg border bg-muted/30 p-3 space-y-2" data-testid="xai">
                  <div className="text-sm font-medium">Forklaring</div>
                  <p className="text-sm">{forklaring.data.narrasjon}</p>
                  {forklaring.data.strukturert.prioriteringer.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {forklaring.data.strukturert.prioriteringer.map((p) => (
                        <Badge key={p.dimensjon} variant="secondary">{p.etikett}: {p.vekt}</Badge>
                      ))}
                    </div>
                  )}
                  {forklaring.data.strukturert.uoppfylte.length > 0 && (
                    <ul className="text-xs text-muted-foreground list-disc pl-4">
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
        <div className="flex flex-wrap gap-2">
          <select className="rounded border bg-background px-2 py-1 text-sm" value={regeltype} onChange={(e) => setRegeltype(e.target.value)} data-testid="sel-regeltype">
            <option value="aml_daglig_hvile_11t">AML: 11t døgnhvile</option>
            <option value="aml_max_uketimer">AML: maks uketimer</option>
            <option value="helgefrekvens">Helgefrekvens</option>
            <option value="kompetansekrav">Kompetansekrav</option>
          </select>
          <label className="flex items-center gap-1 text-sm">
            <input type="checkbox" checked={haard} onChange={(e) => setHaard(e.target.checked)} /> Hard
          </label>
          <Button onClick={() => mRegel.mutate({ regeltype, haard })} data-testid="btn-regel">Legg til regel</Button>
        </div>
        <ul className="space-y-1 text-sm">
          {(regler.data ?? []).map((r) => (
            <li key={r.id} className="flex items-center justify-between rounded bg-muted/40 px-2 py-1">
              <span>{r.regeltype} {r.haard ? <Badge variant="outline" className="ml-1">hard</Badge> : <Badge variant="secondary" className="ml-1">myk</Badge>}</span>
              <Button size="sm" variant="ghost" onClick={() => mSlett.mutate(String(r.id))}>Fjern</Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
