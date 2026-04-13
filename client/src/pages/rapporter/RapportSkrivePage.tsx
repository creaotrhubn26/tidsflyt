/**
 * client/src/pages/rapporter/RapportSkrivePage.tsx
 *
 * Add to client/src/App.tsx routes:
 *   import RapportSkrivePage from "@/pages/rapporter/RapportSkrivePage";
 *   <Route path="/rapporter/ny"  component={RapportSkrivePage} />
 *   <Route path="/rapporter/:id" component={RapportSkrivePage} />
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useGdprChecker, ANONYMOUS_SUGGESTIONS } from "@/hooks/useGdprChecker";

// shadcn/ui
import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label }    from "@/components/ui/label";
import { Badge }    from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Progress }  from "@/components/ui/progress";
import { Checkbox }  from "@/components/ui/checkbox";
import { useToast }  from "@/hooks/use-toast";

// Icons
import {
  Save, Send, ChevronDown, Plus, Trash2, Copy,
  AlertTriangle, CheckCircle, Clock, FileText,
  Briefcase, Target, Activity, Pen,
} from "lucide-react";

// ── TYPES ─────────────────────────────────────────────────────────────────────

interface Sak {
  id: string;
  saksnummer: string;
  klientRef?: string;
  oppdragsgiver?: string;
  tiltakstype?: string;
  status: string;
}

interface Goal {
  id?: string;       // uuid from server (undefined = not yet saved)
  tempId: number;    // local identifier
  beskrivelse: string;
  status: "aktiv" | "pågår" | "fullført" | "avbrutt";
  fremdrift: number;
  kommentar?: string;
}

interface Activity {
  id?: string;
  tempId: number;
  dato: string;
  fraKl: string;
  tilKl: string;
  type: string;
  beskrivelse: string;
  sted?: string;
  klientRef?: string;
  noterIntern?: string;
  malId?: string;
}

// ── GOAL TEMPLATES ───────────────────────────────────────────────────────────

const GOAL_TEMPLATES = [
  { cat: "Hverdagsmestring", icon: "🏠", title: "Daglige rutiner",    text: "Styrke daglige rutiner og strukturering av hverdagen gjennom ukentlig oppfølging" },
  { cat: "Hverdagsmestring", icon: "🍳", title: "ADL-ferdigheter",    text: "Øke selvstendighet i ADL-ferdigheter — matlaging, innkjøp og enkel økonomiforståelse" },
  { cat: "Sosialt",          icon: "👥", title: "Sosial integrering", text: "Sosial integrering gjennom deltakelse i fritidsaktiviteter og nettverksbygging" },
  { cat: "Sosialt",          icon: "🤝", title: "Nettverksbygging",   text: "Bygge og vedlikeholde et stabilt sosialt nettverk med jevnaldrende" },
  { cat: "Skole / Arbeid",   icon: "📚", title: "Skoleoppfølging",    text: "Regelmessig skoleoppfølging med fokus på oppmøte, lekser og trivsel" },
  { cat: "Skole / Arbeid",   icon: "💼", title: "Arbeid / praksis",   text: "Etablere og opprettholde stabil deltakelse i arbeids- eller praksisplass" },
  { cat: "Psykisk helse",    icon: "🧠", title: "Mestringsstrategier",text: "Utvikle og bruke mestringsstrategier ved utfordrende situasjoner og stress" },
  { cat: "Psykisk helse",    icon: "🏥", title: "Hjelpetjenester",    text: "Regelmessig oppfølging av relevante hjelpetjenester (lege, BUP, NAV)" },
  { cat: "Aktivitet",        icon: "🏃", title: "Fysisk aktivitet",   text: "Øke fysisk aktivitetsnivå gjennom regelmessig deltakelse i organiserte aktiviteter" },
  { cat: "Selvstendighet",   icon: "🌱", title: "Økt selvstendighet", text: "Øke grad av selvstendighet i hverdagen — ta egne valg og løse praktiske problemer" },
];

// ── GDPR FIELD COMPONENT ──────────────────────────────────────────────────────

function GdprField({ id, label, required, placeholder, multiline, value, onChange }: {
  id: string; label: string; required?: boolean; placeholder?: string;
  multiline?: boolean; value: string; onChange: (v: string) => void;
}) {
  const { hits, isClean, check, replaceFirst } = useGdprChecker();
  const checked = value.trim().length > 0;

  const handleChange = (v: string) => { onChange(v); check(v); };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Label htmlFor={id} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label} {required && <span className="text-destructive">*</span>}
        </Label>
        <span className="text-[10px] text-amber-500 font-medium">🔒 GDPR-sjekk</span>
        {checked && isClean && <CheckCircle className="h-3 w-3 text-emerald-500" />}
      </div>
      {multiline ? (
        <Textarea
          id={id}
          value={value}
          placeholder={placeholder}
          onChange={(e) => handleChange(e.target.value)}
          className={hits.length ? "border-amber-400 ring-1 ring-amber-400/30" : isClean && checked ? "border-emerald-400" : ""}
          rows={4}
        />
      ) : (
        <Input
          id={id}
          value={value}
          placeholder={placeholder}
          onChange={(e) => handleChange(e.target.value)}
          className={hits.length ? "border-amber-400 ring-1 ring-amber-400/30" : isClean && checked ? "border-emerald-400" : ""}
        />
      )}
      {hits.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm">
          <div className="flex items-start gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-800 dark:text-amber-300 mb-1">Mulige personopplysninger:</p>
              <div className="flex flex-wrap gap-1 mb-2">
                {hits.map((h, i) => (
                  <span key={i} className="inline-flex items-center gap-1 bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 text-xs font-medium px-2 py-0.5 rounded">
                    «{h.word}» <span className="opacity-60">({h.type})</span>
                  </span>
                ))}
              </div>
              <p className="text-xs text-amber-700 dark:text-amber-400 mb-2 font-medium">Erstatt med anonyme betegnelser:</p>
              <div className="flex flex-wrap gap-1">
                {ANONYMOUS_SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => { const updated = replaceFirst(value, s); onChange(updated); check(updated); }}
                    className="text-xs bg-white dark:bg-amber-900/20 border border-amber-300 rounded-full px-2.5 py-0.5 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors cursor-pointer"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── MAIN PAGE ─────────────────────────────────────────────────────────────────

export default function RapportSkrivePage() {
  const [, navigate] = useLocation();
  const params = useParams<{ id?: string }>();
  const { toast } = useToast();
  const qc = useQueryClient();

  const rapportId = params.id;

  // ── Form state
  const [sakId,          setSakId]          = useState("");
  const [konsulent,      setKonsulent]      = useState("");
  const [tiltak,         setTiltak]         = useState("miljøarbeider");
  const [bedrift,        setBedrift]        = useState("");
  const [oppdragsgiver,  setOppdragsgiver]  = useState("");
  const [klientRef,      setKlientRef]      = useState("");
  const [tiltaksleder,   setTiltaksleder]   = useState("");
  const [periodeFrom,    setPeriodeFrom]    = useState(new Date().toISOString().substring(0,7) + "-01");
  const [periodeTo,      setPeriodeTo]      = useState("");
  const [innledning,     setInnledning]     = useState("");
  const [avslutning,     setAvslutning]     = useState("");
  const [goals,          setGoals]          = useState<Goal[]>([]);
  const [activities,     setActivities]     = useState<Activity[]>([]);

  // ── Dialog state
  const [goalDialog,       setGoalDialog]       = useState(false);
  const [goalTplDialog,    setGoalTplDialog]     = useState(false);
  const [actDialog,        setActDialog]         = useState(false);
  const [prevDialog,       setPrevDialog]        = useState(false);
  const [selectedGoalTpls, setSelectedGoalTpls]  = useState<Set<number>>(new Set());

  // ── New goal form
  const [newGoalText,    setNewGoalText]    = useState("");
  const [newGoalStatus,  setNewGoalStatus]  = useState<Goal["status"]>("aktiv");
  const [newGoalProg,    setNewGoalProg]    = useState(0);
  const [newGoalComment, setNewGoalComment] = useState("");

  // ── New activity form
  const [actDato,   setActDato]   = useState(new Date().toISOString().split("T")[0]);
  const [actFra,    setActFra]    = useState("09:00");
  const [actTil,    setActTil]    = useState("11:00");
  const [actType,   setActType]   = useState("aktivitet");
  const [actSted,   setActSted]   = useState("");
  const [actBesk,   setActBesk]   = useState("");
  const [actKlient, setActKlient] = useState("");
  const [actNoter,  setActNoter]  = useState("");
  const [actMalId,  setActMalId]  = useState("");

  // ── Auto-save
  const dirtyRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // ── DATA FETCHING ─────────────────────────────────────────────────────────

  // Henter kun tildelte saker for innlogget bruker
  const { data: saker = [] } = useQuery<Sak[]>({
    queryKey: ["/api/saker"],
    queryFn: () => apiRequest("/api/saker"),
  });

  // Last eksisterende rapport
  const { data: existingRapport } = useQuery({
    queryKey: ["/api/rapporter", rapportId],
    queryFn: () => rapportId ? apiRequest(`/api/rapporter/${rapportId}`) : null,
    enabled: !!rapportId,
  });

  // Forrige rapporter for kopiering
  const { data: prevRapporter = [] } = useQuery({
    queryKey: ["/api/rapporter"],
    queryFn: () => apiRequest("/api/rapporter"),
  });

  // Hent mål og aktiviteter for eksisterende rapport
  const { data: existingMaal = [] } = useQuery({
    queryKey: ["/api/rapporter", rapportId, "maal"],
    queryFn: () => apiRequest(`/api/rapporter/${rapportId}/maal`),
    enabled: !!rapportId,
  });
  const { data: existingAkt = [] } = useQuery({
    queryKey: ["/api/rapporter", rapportId, "aktiviteter"],
    queryFn: () => apiRequest(`/api/rapporter/${rapportId}/aktiviteter`),
    enabled: !!rapportId,
  });

  // ── MUTATIONS ─────────────────────────────────────────────────────────────

  const createRapport = useMutation({
    mutationFn: (data: object) => apiRequest("/api/rapporter", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: (data: any) => navigate(`/rapporter/${data.id}`),
  });

  const updateRapport = useMutation({
    mutationFn: (data: object) => apiRequest(`/api/rapporter/${rapportId}`, { method: "PATCH", body: JSON.stringify(data) }),
  });

  const sendTilGodkjenning = useMutation({
    mutationFn: () => apiRequest(`/api/rapporter/${rapportId}/send`, { method: "POST", body: "{}" }),
    onSuccess: () => {
      toast({ title: "Rapport sendt til godkjenning", description: "Tiltaksleder varsles nå." });
      qc.invalidateQueries({ queryKey: ["/api/rapporter"] });
    },
  });

  const createMaal = useMutation({
    mutationFn: (data: object) => apiRequest(`/api/rapporter/${rapportId}/maal`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/rapporter", rapportId, "maal"] }),
  });

  const createAktivitet = useMutation({
    mutationFn: (data: object) => apiRequest(`/api/rapporter/${rapportId}/aktiviteter`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/rapporter", rapportId, "aktiviteter"] }),
  });

  const deleteAktivitet = useMutation({
    mutationFn: (aktId: string) => apiRequest(`/api/rapporter/${rapportId}/aktiviteter/${aktId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/rapporter", rapportId, "aktiviteter"] }),
  });

  const deleteMaal = useMutation({
    mutationFn: (maalId: string) => apiRequest(`/api/rapporter/${rapportId}/maal/${maalId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/rapporter", rapportId, "maal"] }),
  });

  // ── POPULATE FROM SAK ──────────────────────────────────────────────────────

  const handleSakSelected = useCallback((id: string) => {
    setSakId(id);
    const sak = saker.find((s) => s.id === id);
    if (!sak) return;
    if (sak.klientRef)     setKlientRef(sak.klientRef);
    if (sak.oppdragsgiver) setOppdragsgiver(sak.oppdragsgiver);
    if (sak.tiltakstype)   setTiltak(sak.tiltakstype.toLowerCase());
    markDirty();
  }, [saker]);

  // ── POPULATE FROM EXISTING RAPPORT ────────────────────────────────────────

  useEffect(() => {
    if (!existingRapport) return;
    const r: any = existingRapport;
    setSakId(r.sakId ?? "");
    setKonsulent(r.konsulent ?? ""); setTiltak(r.tiltak ?? "miljøarbeider");
    setBedrift(r.bedrift ?? ""); setOppdragsgiver(r.oppdragsgiver ?? "");
    setKlientRef(r.klientRef ?? ""); setTiltaksleder(r.tiltaksleder ?? "");
    setPeriodeFrom(r.periodeFrom ?? ""); setPeriodeTo(r.periodeTo ?? "");
    setInnledning(r.innledning ?? ""); setAvslutning(r.avslutning ?? "");
  }, [existingRapport]);

  useEffect(() => {
    if (!existingMaal) return;
    setGoals((existingMaal as any[]).map((m) => ({ ...m, tempId: m.id })));
  }, [existingMaal]);

  useEffect(() => {
    if (!existingAkt) return;
    setActivities((existingAkt as any[]).map((a) => ({ ...a, tempId: a.id })));
  }, [existingAkt]);

  // ── AUTO-SAVE ─────────────────────────────────────────────────────────────

  const markDirty = () => {
    dirtyRef.current = true;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(performSave, 3000);
  };

  const performSave = useCallback(async () => {
    if (!dirtyRef.current) return;
    const body = { sakId, konsulent, tiltak, bedrift, oppdragsgiver, klientRef, periodeFrom, periodeTo, innledning, avslutning };
    if (rapportId) { await updateRapport.mutateAsync(body); }
    else           { await createRapport.mutateAsync(body); }
    dirtyRef.current = false;
  }, [sakId, konsulent, tiltak, bedrift, oppdragsgiver, klientRef, periodeFrom, periodeTo, innledning, avslutning, rapportId]);

  // ── GOAL ACTIONS ──────────────────────────────────────────────────────────

  const handleSaveGoal = async () => {
    if (!newGoalText.trim()) { toast({ title: "Beskrivelse er påkrevd", variant: "destructive" }); return; }
    const goalData = { beskrivelse: newGoalText, status: newGoalStatus, fremdrift: newGoalProg, kommentar: newGoalComment };
    if (rapportId) {
      await createMaal.mutateAsync(goalData);
    } else {
      setGoals(prev => [...prev, { ...goalData, tempId: Date.now() }]);
    }
    setGoalDialog(false); setNewGoalText(""); setNewGoalProg(0); setNewGoalComment("");
    toast({ title: "Mål lagret" });
  };

  const handleApplyGoalTemplates = async () => {
    const tpls = GOAL_TEMPLATES.filter((_, i) => selectedGoalTpls.has(i));
    for (const tpl of tpls) {
      const goalData = { beskrivelse: tpl.text, status: "aktiv" as const, fremdrift: 0 };
      if (rapportId) { await createMaal.mutateAsync(goalData); }
      else           { setGoals(prev => [...prev, { ...goalData, tempId: Date.now() + Math.random() }]); }
    }
    setGoalTplDialog(false); setSelectedGoalTpls(new Set());
    toast({ title: `${tpls.length} mål lagt til` });
  };

  // ── ACTIVITY ACTIONS ──────────────────────────────────────────────────────

  const calcDur = (fra: string, til: string) => {
    if (!fra || !til) return null;
    const [fh, fm] = fra.split(":").map(Number);
    const [th, tm] = til.split(":").map(Number);
    return Math.max(0, (th * 60 + tm) - (fh * 60 + fm));
  };

  const handleSaveActivity = async () => {
    if (!actDato || !actBesk.trim()) { toast({ title: "Dato og beskrivelse er påkrevd", variant: "destructive" }); return; }
    const aktData = { dato: actDato, fraKl: actFra, tilKl: actTil, varighet: calcDur(actFra, actTil), type: actType, beskrivelse: actBesk, sted: actSted, klientRef: actKlient, noterIntern: actNoter, malId: actMalId || undefined };
    if (rapportId) { await createAktivitet.mutateAsync(aktData); }
    else           { setActivities(prev => [...prev, { ...aktData, tempId: Date.now() }]); }
    setActDialog(false);
    setActBesk(""); setActSted(""); setActKlient(""); setActNoter(""); setActMalId("");
    toast({ title: "Aktivitet lagret" });
  };

  // ── COPY FROM PREVIOUS ────────────────────────────────────────────────────

  const handleCopyPrev = (prevId: string) => {
    const prev = (prevRapporter as any[]).find((r: any) => r.id === prevId);
    if (!prev) return;
    setKonsulent(prev.konsulent ?? konsulent);
    setBedrift(prev.bedrift ?? bedrift);
    setOppdragsgiver(prev.oppdragsgiver ?? oppdragsgiver);
    setTiltaksleder(prev.tiltaksleder ?? tiltaksleder);
    setPrevDialog(false); markDirty();
    toast({ title: "Kopiert fra forrige rapport" });
  };

  // ── STATS ─────────────────────────────────────────────────────────────────

  const allActivities = rapportId
    ? (existingAkt as Activity[])
    : activities;

  const stats = allActivities.reduce((acc, a: any) => {
    const mins = a.varighet ?? calcDur(a.fraKl ?? "", a.tilKl ?? "") ?? 0;
    acc.mins += mins;
    acc.days.add(a.dato);
    if (a.type === "klientmøte") acc.meet++;
    else acc.acts++;
    return acc;
  }, { mins: 0, days: new Set<string>(), meet: 0, acts: 0 });

  const totalHours = (stats.mins / 60).toFixed(1);

  const allGoals = rapportId ? (existingMaal as Goal[]) : goals;
  const hasGdprWarnings = typeof document !== "undefined" && document.querySelectorAll(".border-amber-400").length > 0;

  // ── RENDER ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background">
      {/* PAGE HEADER */}
      <div className="border-b bg-card sticky top-0 z-40 px-6 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold">
              {rapportId ? "Rediger rapport" : "Ny rapport"}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {updateRapport.isPending ? "Lagrer…" : "Alle endringer lagres automatisk"}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPrevDialog(true)}>
              <Copy className="h-3.5 w-3.5 mr-1.5" />
              Forrige rapport
            </Button>
            <Button variant="outline" size="sm" onClick={performSave} disabled={updateRapport.isPending}>
              <Save className="h-3.5 w-3.5 mr-1.5" />
              Lagre
            </Button>
            <Button
              size="sm"
              onClick={() => sendTilGodkjenning.mutate()}
              disabled={!rapportId || hasGdprWarnings || sendTilGodkjenning.isPending}
            >
              <Send className="h-3.5 w-3.5 mr-1.5" />
              Send til godkjenning
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6">
        {/* GDPR BANNER */}
        <div className="mb-5 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3.5">
          <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <span className="font-semibold text-amber-800 dark:text-amber-300">GDPR — </span>
            <span className="text-amber-700 dark:text-amber-400">Ingen navn, fødselsdatoer eller adresser. Bruk «ungdommen», «brukeren», «jenta», «gutten» osv.</span>
          </div>
        </div>

        <div className="grid grid-cols-[1fr_280px] gap-6">

          {/* ── MAIN COLUMN ────────────────────────────────── */}
          <div className="space-y-5">

            {/* 1. SAK-VELGER + PROSJEKTINFO */}
            <Card>
              <CardHeader className="py-3 px-4 border-b">
                <div className="flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-primary" />
                  <span className="font-semibold text-sm">Prosjektinformasjon</span>
                  <Badge variant="secondary" className="ml-auto text-xs">Pre-fylt fra sak</Badge>
                </div>
              </CardHeader>
              <CardContent className="p-4 space-y-4">

                {/* SAK-DROPDOWN — kun tildelte saker */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Sak <span className="text-destructive">*</span>
                  </Label>
                  <Select value={sakId} onValueChange={handleSakSelected}>
                    <SelectTrigger>
                      <SelectValue placeholder="Velg tildelt sak…" />
                    </SelectTrigger>
                    <SelectContent>
                      {saker.length === 0 ? (
                        <div className="py-3 px-4 text-sm text-muted-foreground text-center">
                          Ingen tildelte saker.<br />
                          <span className="text-xs">Kontakt tiltaksleder for å bli tildelt en sak.</span>
                        </div>
                      ) : (
                        saker.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-semibold text-primary">{s.saksnummer}</span>
                              {s.klientRef && <span className="text-muted-foreground">·</span>}
                              {s.klientRef && <span className="text-xs text-muted-foreground">{s.klientRef}</span>}
                              {s.oppdragsgiver && <span className="text-xs text-muted-foreground">({s.oppdragsgiver})</span>}
                            </div>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  {sakId && (
                    <div className="text-xs text-emerald-600 flex items-center gap-1">
                      <CheckCircle className="h-3 w-3" /> Feltene er pre-fylt fra saken
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Konsulent</Label>
                    <Input value={konsulent} onChange={(e) => { setKonsulent(e.target.value); markDirty(); }} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tiltak / Rolle</Label>
                    <Select value={tiltak} onValueChange={(v) => { setTiltak(v); markDirty(); }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["miljøarbeider","sosialarbeider","aktivitør","miljøterapeut","tiltaksleder"].map((v) => (
                          <SelectItem key={v} value={v} className="capitalize">{v.charAt(0).toUpperCase() + v.slice(1)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bedrift</Label>
                    <Input value={bedrift} onChange={(e) => { setBedrift(e.target.value); markDirty(); }} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Oppdragsgiver</Label>
                    <Input value={oppdragsgiver} onChange={(e) => { setOppdragsgiver(e.target.value); markDirty(); }} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Klient-ID (anonymt)</Label>
                    <Input value={klientRef} onChange={(e) => { setKlientRef(e.target.value); markDirty(); }} placeholder="BV-2025-041" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tiltaksleder</Label>
                    <Input value={tiltaksleder} onChange={(e) => { setTiltaksleder(e.target.value); markDirty(); }} />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Periode</Label>
                    <div className="flex gap-2 items-center">
                      <Input type="date" value={periodeFrom} onChange={(e) => { setPeriodeFrom(e.target.value); markDirty(); }} className="flex-1" />
                      <span className="text-muted-foreground">–</span>
                      <Input type="date" value={periodeTo} onChange={(e) => { setPeriodeTo(e.target.value); markDirty(); }} className="flex-1" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 2. INNLEDNING */}
            <Card>
              <CardHeader className="py-3 px-4 border-b">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  <span className="font-semibold text-sm">Innledning</span>
                  <span className="text-xs text-muted-foreground ml-auto">Valgfritt</span>
                </div>
              </CardHeader>
              <CardContent className="p-4">
                <GdprField
                  id="innledning" label="Innledning" multiline
                  placeholder={"Oppsummering av måneden, kontekst og generelle observasjoner…\nHusk: ingen personopplysninger."}
                  value={innledning}
                  onChange={(v) => { setInnledning(v); markDirty(); }}
                />
              </CardContent>
            </Card>

            {/* 3. MÅL OG TILTAK */}
            <Card>
              <CardHeader className="py-3 px-4 border-b">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary" />
                  <span className="font-semibold text-sm">Mål og tiltak</span>
                  <Badge variant="secondary" className="ml-2 text-xs">{allGoals.length} mål</Badge>
                  <div className="ml-auto flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setGoalTplDialog(true)}>Bruk mal</Button>
                    <Button size="sm" onClick={() => setGoalDialog(true)}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Legg til mål
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4">
                {allGoals.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    <Target className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    Ingen mål ennå — klikk «Legg til mål» eller velg fra mal
                  </div>
                ) : (
                  <div className="space-y-3">
                    {allGoals.map((g: any, i) => (
                      <div key={g.id ?? g.tempId} className="flex gap-3 items-start py-2 border-b last:border-0">
                        <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center flex-shrink-0 mt-1">
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm mb-2">{g.beskrivelse}</p>
                          <div className="flex items-center gap-3">
                            <Progress value={g.fremdrift ?? 0} className="flex-1 h-2" />
                            <span className="text-xs font-bold text-primary min-w-8">{g.fremdrift ?? 0}%</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-2">
                          <Badge variant={g.status === "fullført" ? "default" : g.status === "pågår" ? "secondary" : "outline"} className="text-xs">
                            {g.status}
                          </Badge>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                            onClick={() => g.id ? deleteMaal.mutate(g.id) : setGoals(prev => prev.filter(x => x.tempId !== g.tempId))}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 4. AKTIVITETSLOGG */}
            <Card>
              <CardHeader className="py-3 px-4 border-b">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" />
                  <span className="font-semibold text-sm">Aktivitetslogg</span>
                  <Badge variant="secondary" className="ml-2 text-xs">{allActivities.length} oppføringer</Badge>
                  <Button size="sm" className="ml-auto" onClick={() => setActDialog(true)}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Legg til aktivitet
                  </Button>
                </div>
              </CardHeader>

              {allActivities.length === 0 ? (
                <CardContent className="p-8 text-center text-muted-foreground text-sm">
                  <Activity className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  Ingen aktiviteter ennå
                </CardContent>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/50 border-b">
                          {["Dato","Type","Tid","Varighet","Beskrivelse","Sted","Klient",""].map(h => (
                            <th key={h} className="text-left px-3 py-2 font-semibold text-muted-foreground text-[11px] uppercase tracking-wide whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {allActivities.map((a: any) => {
                          const dur = a.varighet ? `${Math.floor(a.varighet / 60)}t${a.varighet % 60 ? ` ${a.varighet % 60}m` : ""}` : "—";
                          return (
                            <tr key={a.id ?? a.tempId} className="border-b last:border-0 hover:bg-muted/30">
                              <td className="px-3 py-2 font-mono whitespace-nowrap">{a.dato?.substring(5).replace("-", ".")}</td>
                              <td className="px-3 py-2"><Badge variant="secondary" className="text-[10px]">{a.type}</Badge></td>
                              <td className="px-3 py-2 font-mono whitespace-nowrap">{a.fraKl}–{a.tilKl}</td>
                              <td className="px-3 py-2 font-semibold text-primary">{dur}</td>
                              <td className="px-3 py-2 max-w-[200px] truncate">{a.beskrivelse}</td>
                              <td className="px-3 py-2 text-muted-foreground">{a.sted || "—"}</td>
                              <td className="px-3 py-2 text-muted-foreground">{a.klientRef || a.klient_ref || "—"}</td>
                              <td className="px-3 py-2">
                                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                                  onClick={() => a.id ? deleteAktivitet.mutate(a.id) : setActivities(prev => prev.filter(x => x.tempId !== a.tempId))}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-4 gap-3 p-4 border-t bg-muted/20">
                    {[
                      { label: "Timer", value: totalHours + "t" },
                      { label: "Arbeidsdager", value: stats.days.size },
                      { label: "Aktiviteter", value: stats.acts },
                      { label: "Klientmøter", value: stats.meet },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-primary/10 rounded-lg p-3 text-center">
                        <div className="text-xl font-bold text-primary">{value}</div>
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground mt-0.5">{label}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </Card>

            {/* 5. FREMDRIFT */}
            <Card>
              <CardHeader className="py-3 px-4 border-b">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary" />
                  <span className="font-semibold text-sm">Fremdrift mot mål</span>
                </div>
              </CardHeader>
              <CardContent className="p-4">
                {allGoals.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Legg til mål for å registrere fremdrift</p>
                ) : (
                  <div className="space-y-3">
                    {allGoals.map((g: any, i) => (
                      <div key={g.id ?? g.tempId} className="flex items-center gap-3">
                        <span className="text-sm text-muted-foreground w-36 truncate flex-shrink-0">
                          Mål {i + 1} – {g.beskrivelse.substring(0, 18)}…
                        </span>
                        <Progress value={g.fremdrift ?? 0} className="flex-1 h-2.5" />
                        <span className="text-sm font-bold text-primary w-10 text-right">{g.fremdrift ?? 0}%</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 6. AVSLUTNING */}
            <Card>
              <CardHeader className="py-3 px-4 border-b">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  <span className="font-semibold text-sm">Oppsummering og veien videre</span>
                  <span className="text-xs text-muted-foreground ml-auto">Valgfritt</span>
                </div>
              </CardHeader>
              <CardContent className="p-4">
                <GdprField
                  id="avslutning" label="Avslutning" multiline
                  placeholder="Oppsummer måneden — hva gikk bra, hva kan forbedres, planlagte aktiviteter neste måned…"
                  value={avslutning}
                  onChange={(v) => { setAvslutning(v); markDirty(); }}
                />
              </CardContent>
            </Card>

          </div>{/* /main col */}

          {/* ── SIDEBAR ────────────────────────────────────── */}
          <div className="space-y-4 sticky top-[72px]">

            {/* Status */}
            <Card>
              <CardHeader className="py-2.5 px-4 border-b">
                <span className="font-semibold text-sm flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-primary" /> Status</span>
              </CardHeader>
              <CardContent className="p-3 space-y-2 text-sm">
                {[
                  { label: "Status",      value: <Badge variant="outline" className="text-xs">Utkast</Badge> },
                  { label: "Sak",         value: sakId ? saker.find(s=>s.id===sakId)?.saksnummer : <span className="text-muted-foreground text-xs">Ikke valgt</span> },
                  { label: "Aktiviteter", value: <span className="font-semibold">{allActivities.length}</span> },
                  { label: "Mål",         value: <span className="font-semibold">{allGoals.length}</span> },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between items-center">
                    <span className="text-muted-foreground text-xs">{label}</span>
                    {value}
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* GDPR */}
            <Card>
              <CardHeader className="py-2.5 px-4 border-b">
                <span className="font-semibold text-sm">GDPR-sjekkliste</span>
              </CardHeader>
              <CardContent className="p-3 space-y-2">
                {[
                  "Ingen navn på klienter",
                  "Ingen fødselsdatoer eller adresser",
                  "Brukt anonyme betegnelser",
                  "Alle aktiviteter dokumentert",
                  "Rapport signert",
                ].map((item) => (
                  <label key={item} className="flex items-start gap-2 cursor-pointer">
                    <Checkbox className="mt-0.5" />
                    <span className="text-xs text-muted-foreground leading-relaxed">{item}</span>
                  </label>
                ))}
              </CardContent>
            </Card>

            {/* Send */}
            <Card className="p-4">
              <p className="text-sm font-semibold mb-1.5">Klar til innsending?</p>
              <p className="text-xs text-muted-foreground mb-3">
                Sendes til tiltaksleder {tiltaksleder || "…"} for godkjenning.
              </p>
              <Button
                className="w-full"
                disabled={!rapportId || hasGdprWarnings || sendTilGodkjenning.isPending}
                onClick={() => sendTilGodkjenning.mutate()}
              >
                <Send className="h-3.5 w-3.5 mr-2" />
                Send til godkjenning
              </Button>
              {!rapportId && (
                <p className="text-xs text-muted-foreground mt-2 text-center">Lagre rapporten først</p>
              )}
            </Card>

          </div>{/* /sidebar */}
        </div>
      </div>

      {/* ── DIALOGS ──────────────────────────────────── */}

      {/* LEGG TIL MÅL */}
      <Dialog open={goalDialog} onOpenChange={setGoalDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Legg til mål</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <GdprField id="new-goal-text" label="Mål-beskrivelse" required multiline
              placeholder={"Beskriv målet — f.eks. «Styrke daglige rutiner»\nIngen personopplysninger."}
              value={newGoalText} onChange={setNewGoalText} />
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</Label>
                <Select value={newGoalStatus} onValueChange={(v: any) => setNewGoalStatus(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["aktiv","pågår","fullført","avbrutt"].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fremdrift: {newGoalProg}%</Label>
                <input type="range" min="0" max="100" value={newGoalProg} onChange={(e) => setNewGoalProg(+e.target.value)}
                  className="w-full accent-primary" />
              </div>
            </div>
            <GdprField id="new-goal-comment" label="Kommentar (valgfritt)"
              placeholder="Utfyllende notat…" value={newGoalComment} onChange={setNewGoalComment} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGoalDialog(false)}>Avbryt</Button>
            <Button onClick={handleSaveGoal} disabled={createMaal.isPending}>Lagre mål</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MÅL-MALER */}
      <Dialog open={goalTplDialog} onOpenChange={setGoalTplDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Mål-maler</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto space-y-4 py-2 pr-1">
            {["Hverdagsmestring","Sosialt","Skole / Arbeid","Psykisk helse","Aktivitet","Selvstendighet"].map((cat) => {
              const catGoals = GOAL_TEMPLATES.map((t, i) => ({ ...t, index: i })).filter(t => t.cat === cat);
              if (!catGoals.length) return null;
              return (
                <div key={cat}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">{cat}</p>
                  <div className="space-y-2">
                    {catGoals.map(({ icon, title, text, index }) => (
                      <label key={index} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${selectedGoalTpls.has(index) ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}>
                        <Checkbox checked={selectedGoalTpls.has(index)} onCheckedChange={(checked) => {
                          setSelectedGoalTpls(prev => { const s = new Set(prev); checked ? s.add(index) : s.delete(index); return s; });
                        }} className="mt-0.5" />
                        <div>
                          <p className="text-sm font-medium">{icon} {title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{text}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGoalTplDialog(false)}>Avbryt</Button>
            <Button onClick={handleApplyGoalTemplates} disabled={selectedGoalTpls.size === 0}>
              Legg til {selectedGoalTpls.size > 0 ? selectedGoalTpls.size : ""} valgte mål
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* LEGG TIL AKTIVITET */}
      <Dialog open={actDialog} onOpenChange={setActDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Legg til aktivitet</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-3 gap-3">
              {[["Dato *","date",actDato,setActDato],["Fra kl.","time",actFra,setActFra],["Til kl.","time",actTil,setActTil]].map(([label,type,val,setter]: any) => (
                <div key={label} className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</Label>
                  <Input type={type} value={val} onChange={(e) => setter(e.target.value)} />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Type</Label>
                <Select value={actType} onValueChange={setActType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["aktivitet","klientmøte","nettverksmøte","ansvarsgruppemøte","veiledning","dokumentasjon","kurs"].map(v => (
                      <SelectItem key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sted</Label>
                <Input value={actSted} onChange={(e) => setActSted(e.target.value)} placeholder="Hjemme, kontor, ute…" />
              </div>
            </div>
            <GdprField id="act-besk" label="Beskrivelse" required multiline
              placeholder={"Hva ble gjort? Ingen personopplysninger.\nBruk «ungdommen», «brukeren» osv."}
              value={actBesk} onChange={setActBesk} />
            <div className="grid grid-cols-2 gap-3">
              <GdprField id="act-klient" label="Klient-ref (anonym)"
                placeholder="ungdommen, bruker A…" value={actKlient} onChange={setActKlient} />
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Knyttet til mål</Label>
                <Select value={actMalId} onValueChange={setActMalId}>
                  <SelectTrigger><SelectValue placeholder="— ingen —" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">— ingen —</SelectItem>
                    {allGoals.map((g: any, i) => (
                      <SelectItem key={g.id ?? g.tempId} value={String(g.id ?? g.tempId)}>
                        Mål {i + 1}: {g.beskrivelse.substring(0, 30)}…
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Interne notater <span className="text-muted-foreground/60 font-normal normal-case">(vises ikke i PDF)</span>
              </Label>
              <Textarea value={actNoter} onChange={(e) => setActNoter(e.target.value)} placeholder="Interne noter…" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActDialog(false)}>Avbryt</Button>
            <Button onClick={handleSaveActivity} disabled={createAktivitet.isPending}>Lagre aktivitet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* KOPIER FRA FORRIGE RAPPORT */}
      <Dialog open={prevDialog} onOpenChange={setPrevDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Kopier fra forrige rapport</DialogTitle></DialogHeader>
          <div className="space-y-2 py-2 max-h-[50vh] overflow-y-auto">
            {(prevRapporter as any[]).filter((r: any) => r.status === "godkjent" && r.id !== rapportId).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Ingen godkjente rapporter å kopiere fra</p>
            ) : (
              (prevRapporter as any[]).filter((r: any) => r.status === "godkjent" && r.id !== rapportId).map((r: any) => (
                <button key={r.id} onClick={() => handleCopyPrev(r.id)}
                  className="w-full text-left p-3 rounded-lg border hover:border-primary hover:bg-primary/5 transition-colors">
                  <div className="font-medium text-sm">{r.periodeFrom ? new Date(r.periodeFrom).toLocaleDateString("nb-NO", { month: "long", year: "numeric" }) : "Ukjent periode"}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{r.oppdragsgiver} · Godkjent ✓</div>
                </button>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPrevDialog(false)}>Lukk</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
