/**
 * client/src/pages/rapporter/RapportSkrivePage.tsx
 *
 * Add to client/src/App.tsx routes:
 *   import RapportSkrivePage from "@/pages/rapporter/RapportSkrivePage";
 *   <Route path="/rapporter/ny"  component={RapportSkrivePage} />
 *   <Route path="/rapporter/:id" component={RapportSkrivePage} />
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useGdprChecker, ANONYMOUS_SUGGESTIONS } from "@/hooks/useGdprChecker";
import { useAktivitetForslag } from "@/hooks/use-aktivitet-forslag";
import { PortalLayout } from "@/components/portal/portal-layout";
import { useAuth } from "@/hooks/use-auth";
import { useUserSettings } from "@/hooks/use-user-settings";
import { useGoalCategories } from "@/hooks/use-goal-categories";
import { useRapportTemplates, type RapportTemplate, type RapportTemplateSection } from "@/hooks/use-rapport-templates";
import { useInstitutions } from "@/hooks/use-institutions";
import { SectionChecklist, type ChecklistValue } from "@/components/rapport/section-checklist";
import { SectionObservations, type ObservationEntry } from "@/components/rapport/section-observations";

// shadcn/ui
import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label }    from "@/components/ui/label";
import { Badge }    from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Progress }  from "@/components/ui/progress";
import { Checkbox }  from "@/components/ui/checkbox";
import { useToast }  from "@/hooks/use-toast";
import { AvvikDialog } from "@/components/avvik-dialog";
import { cn } from "@/lib/utils";

// Icons
import {
  Save, Send, ChevronDown, Plus, Trash2, Copy,
  AlertTriangle, CheckCircle, Clock, FileText,
  Briefcase, Target, Activity, Pen, MessageSquare,
  XCircle, RotateCcw, Sparkles, Star, Loader2, BookmarkPlus,
  CalendarDays, List,
  Home, Users, GraduationCap, Brain, Sprout,
  UtensilsCrossed, Handshake, HeartPulse,
  Flag, CalendarClock, Tag, X,
  type LucideIcon,
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

// ── AVVIK LABELS ─────────────────────────────────────────────────────────────

const AVVIK_SEVERITY_STYLE: Record<string, { label: string; cls: string }> = {
  lav:     { label: "Lav",     cls: "bg-emerald-50 text-emerald-900 border-emerald-200" },
  middels: { label: "Middels", cls: "bg-amber-50 text-amber-900 border-amber-200" },
  hoy:     { label: "Høy",     cls: "bg-orange-50 text-orange-900 border-orange-200" },
  kritisk: { label: "Kritisk", cls: "bg-red-50 text-red-900 border-red-200" },
};

const AVVIK_CATEGORY_LABEL: Record<string, string> = {
  vold_trusler:   "Vold/trusler",
  egen_skade:     "Egen skade",
  andre_skade:    "Andres skade",
  rutinebrudd:    "Rutinebrudd",
  klientrelatert: "Klient",
  arbeidsmiljo:   "Arbeidsmiljø",
  annet:          "Annet",
};

const AVVIK_STATUS_META: Record<string, { label: string; variant: "secondary" | "default" | "outline" }> = {
  rapportert:       { label: "Rapportert",       variant: "secondary" },
  under_behandling: { label: "Under behandling", variant: "outline"   },
  lukket:           { label: "Lukket",           variant: "default"   },
};

// ── GOAL TEMPLATES ───────────────────────────────────────────────────────────

const GOAL_TEMPLATES: { cat: string; icon: LucideIcon; title: string; text: string }[] = [
  { cat: "Hverdagsmestring", icon: Home,              title: "Daglige rutiner",    text: "Styrke daglige rutiner og strukturering av hverdagen gjennom ukentlig oppfølging" },
  { cat: "Hverdagsmestring", icon: UtensilsCrossed,   title: "ADL-ferdigheter",    text: "Øke selvstendighet i ADL-ferdigheter — matlaging, innkjøp og enkel økonomiforståelse" },
  { cat: "Sosialt",          icon: Users,             title: "Sosial integrering", text: "Sosial integrering gjennom deltakelse i fritidsaktiviteter og nettverksbygging" },
  { cat: "Sosialt",          icon: Handshake,         title: "Nettverksbygging",   text: "Bygge og vedlikeholde et stabilt sosialt nettverk med jevnaldrende" },
  { cat: "Skole / Arbeid",   icon: GraduationCap,     title: "Skoleoppfølging",    text: "Regelmessig skoleoppfølging med fokus på oppmøte, lekser og trivsel" },
  { cat: "Skole / Arbeid",   icon: Briefcase,         title: "Arbeid / praksis",   text: "Etablere og opprettholde stabil deltakelse i arbeids- eller praksisplass" },
  { cat: "Psykisk helse",    icon: Brain,             title: "Mestringsstrategier",text: "Utvikle og bruke mestringsstrategier ved utfordrende situasjoner og stress" },
  { cat: "Psykisk helse",    icon: HeartPulse,        title: "Hjelpetjenester",    text: "Regelmessig oppfølging av relevante hjelpetjenester (lege, BUP, NAV)" },
  { cat: "Aktivitet",        icon: Activity,          title: "Fysisk aktivitet",   text: "Øke fysisk aktivitetsnivå gjennom regelmessig deltakelse i organiserte aktiviteter" },
  { cat: "Selvstendighet",   icon: Sprout,            title: "Økt selvstendighet", text: "Øke grad av selvstendighet i hverdagen — ta egne valg og løse praktiske problemer" },
];

const BUILT_IN_GOAL_CATEGORIES: { cat: string; icon: LucideIcon }[] = [
  { cat: "Hverdagsmestring", icon: Home },
  { cat: "Sosialt",          icon: Users },
  { cat: "Skole / Arbeid",   icon: GraduationCap },
  { cat: "Psykisk helse",    icon: Brain },
  { cat: "Aktivitet",        icon: Activity },
  { cat: "Selvstendighet",   icon: Sprout },
];

// ── GDPR FIELD COMPONENT ──────────────────────────────────────────────────────

function GdprField({ id, label, required, placeholder, multiline, value, onChange, onHitsChange, autoReplace, onEnableAutoReplace }: {
  id: string; label: string; required?: boolean; placeholder?: string;
  multiline?: boolean; value: string; onChange: (v: string) => void;
  onHitsChange?: (fieldId: string, count: number) => void;
  autoReplace?: boolean;
  onEnableAutoReplace?: () => void;
}) {
  const { hits, isClean, check, replaceFirst, autoReplaceAll } = useGdprChecker();
  const checked = value.trim().length > 0;
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);

  // Show the "enable auto-replace?" nudge when: auto-replace is off,
  // name-type hits are detected, user hasn't dismissed the suggestion,
  // and an onEnableAutoReplace callback is provided.
  const nameHits = hits.filter(h => ["navn", "fullt navn", "mulig navn"].includes(h.type));
  const showAutoSuggestion = !autoReplace && !suggestionDismissed && nameHits.length > 0 && !!onEnableAutoReplace;

  useEffect(() => { onHitsChange?.(id, hits.length); }, [hits.length, id]);
  useEffect(() => { if (value) check(value); }, []);

  const handleChange = (v: string) => {
    if (autoReplace) {
      const cleaned = autoReplaceAll(v);
      if (cleaned !== v) {
        onChange(cleaned);
        check(cleaned);
        return;
      }
    }
    onChange(v);
    check(v);
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Label htmlFor={id} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label} {required && <span className="text-destructive">*</span>}
        </Label>
        <span className="text-[10px] text-amber-500 font-medium">🔒 GDPR-sjekk</span>
        {autoReplace && <span className="text-[10px] text-emerald-600 font-medium">auto-erstatt</span>}
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
              {/* Nudge to enable auto-replace */}
              {showAutoSuggestion && (
                <div className="rounded-md border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800 p-2.5 mb-2">
                  <p className="text-xs text-emerald-800 dark:text-emerald-300 font-medium mb-1.5">
                    Vil du at navn erstattes automatisk mens du skriver?
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => { onEnableAutoReplace!(); const updated = autoReplaceAll(value); onChange(updated); }}
                      className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md px-2.5 py-1 transition-colors flex items-center gap-1"
                    >
                      <Sparkles className="h-3 w-3" /> Ja, skru på
                    </button>
                    <button
                      type="button"
                      onClick={() => setSuggestionDismissed(true)}
                      className="text-xs text-emerald-700 dark:text-emerald-400 hover:underline"
                    >
                      Nei takk
                    </button>
                  </div>
                </div>
              )}
              {/* Auto-replace all button */}
              <button
                type="button"
                onClick={() => { const updated = autoReplaceAll(value); onChange(updated); }}
                className="text-xs font-semibold text-amber-800 dark:text-amber-200 bg-amber-200 dark:bg-amber-800/60 rounded-md px-2.5 py-1 hover:bg-amber-300 dark:hover:bg-amber-700/60 transition-colors mb-2 flex items-center gap-1"
              >
                <Sparkles className="h-3 w-3" /> Erstatt alle automatisk
              </button>
              <p className="text-xs text-amber-700 dark:text-amber-400 mb-2 font-medium">Eller velg manuelt:</p>
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

// ── INLINE FEEDBACK COMPONENT ─────────────────────────────────────────────────

function InlineFeedback({ comments, seksjon, onReply }: {
  comments: any[];
  seksjon: string;
  onReply: (data: { seksjon: string; tekst: string }) => void;
}) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState("");

  if (comments.length === 0) return null;

  const seksjonLabel = seksjon === "goals" ? "mål" : seksjon === "activities" ? "aktiviteter" : "generelt";

  return (
    <div className="mt-3 space-y-2" role="region" aria-label={`Tilbakemelding på ${seksjonLabel}`}>
      {comments.map((c: any) => (
        <div key={c.id} className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 px-3.5 py-2.5">
          <div className="flex items-start gap-2">
            <MessageSquare className="h-3.5 w-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold text-amber-800 dark:text-amber-300">Tiltaksleder</span>
                <span className="text-[10px] text-amber-600/60">{c.createdAt ? new Date(c.createdAt).toLocaleDateString("nb-NO") : ""}</span>
              </div>
              <p className="text-sm text-amber-900 dark:text-amber-200 whitespace-pre-line">{c.tekst}</p>
            </div>
          </div>
        </div>
      ))}

      {/* Reply */}
      {replyOpen ? (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
          <Textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Svar på tilbakemeldingen…"
            rows={2}
            className="text-sm"
            autoFocus
          />
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => { setReplyOpen(false); setReplyText(""); }}>Avbryt</Button>
            <Button size="sm" disabled={!replyText.trim()} onClick={() => {
              onReply({ seksjon, tekst: replyText.trim() });
              setReplyText("");
              setReplyOpen(false);
            }}>Send svar</Button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setReplyOpen(true)}
          className="text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-1"
        >
          <MessageSquare className="h-3 w-3" /> Svar på tilbakemelding
        </button>
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
  const { user: authUser } = useAuth();

  const rapportId = params.id;
  const authUserName = [authUser?.firstName, authUser?.lastName].filter(Boolean).join(" ");

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

  // ── Template-driven dynamic section values (stored in rapporter.dynamiskeFelter jsonb)
  // Shape: { [sectionKey]: string | ChecklistValue | ObservationEntry[] }
  const [rapportTemplateId, setRapportTemplateId] = useState<string>("");
  const [dynamicValues, setDynamicValues] = useState<Record<string, any>>({});

  // ── Activity view mode
  const [actView, setActView] = useState<"list" | "week">("list");

  // ── Dialog state
  const [goalDialog,       setGoalDialog]       = useState(false);
  const [goalTplDialog,    setGoalTplDialog]     = useState(false);
  const [actDialog,        setActDialog]         = useState(false);
  const [prevDialog,       setPrevDialog]        = useState(false);
  const [selectedGoalTpls, setSelectedGoalTpls]  = useState<Set<number>>(new Set());

  // ── GDPR auto-replace toggle (persisted in user_settings)
  const { settings: userSettings, update: updateUserSettings } = useUserSettings();
  const gdprAutoReplace = userSettings.gdprAutoReplace;
  const toggleGdprAutoReplace = () => {
    updateUserSettings({ gdprAutoReplace: !gdprAutoReplace });
  };

  // ── New goal form
  const [newGoalText,    setNewGoalText]    = useState("");
  const [newGoalStatus,  setNewGoalStatus]  = useState<Goal["status"]>("aktiv");
  const [newGoalProg,    setNewGoalProg]    = useState(0);
  const [newGoalComment, setNewGoalComment] = useState("");
  const [newGoalCat,     setNewGoalCat]     = useState("Hverdagsmestring");
  const [newGoalPriority, setNewGoalPriority] = useState<"lav" | "middels" | "høy">("middels");
  const [newGoalType,    setNewGoalType]    = useState<"langsiktig" | "kortsiktig" | "delmål">("kortsiktig");
  const [newGoalFrist,   setNewGoalFrist]   = useState("");
  const [newGoalIndikator, setNewGoalIndikator] = useState("");

  // Custom goal categories (persisted server-side, synced across devices)
  const { categories: customGoalCatsRaw, addCategory, removeCategory } = useGoalCategories();
  const customGoalCats = customGoalCatsRaw.map(c => c.navn);
  const [showAddCatInput, setShowAddCatInput] = useState(false);
  const [newCatName, setNewCatName] = useState("");

  const addCustomCat = async () => {
    const trimmed = newCatName.trim();
    if (!trimmed) return;
    if (BUILT_IN_GOAL_CATEGORIES.some(c => c.cat === trimmed) || customGoalCats.includes(trimmed)) {
      toast({ title: "Kategorien finnes allerede", variant: "destructive" });
      return;
    }
    try {
      await addCategory(trimmed);
      setNewGoalCat(trimmed);
      setNewCatName("");
      setShowAddCatInput(false);
    } catch (e) {
      toast({ title: "Kunne ikke lagre kategori", description: String(e), variant: "destructive" });
    }
  };
  const removeCustomCat = (cat: string) => {
    const found = customGoalCatsRaw.find(c => c.navn === cat);
    if (!found) return;
    removeCategory(found.id);
    if (newGoalCat === cat) setNewGoalCat("Hverdagsmestring");
  };

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
  const [malDialog, setMalDialog] = useState(false);

  // ── ML autocomplete
  const aktivitetForslag = useAktivitetForslag();

  // ── GDPR hit tracking (state-based, not DOM query)
  const [gdprHitsByField, setGdprHitsByField] = useState<Record<string, number>>({});
  const handleGdprHitsChange = useCallback((fieldId: string, count: number) => {
    setGdprHitsByField(prev => prev[fieldId] === count ? prev : { ...prev, [fieldId]: count });
  }, []);
  const hasGdprWarnings = useMemo(() => Object.values(gdprHitsByField).some(c => c > 0), [gdprHitsByField]);
  const gdprHitCount = useMemo(() => Object.values(gdprHitsByField).reduce((a, b) => a + b, 0), [gdprHitsByField]);

  // ── Auto-save
  const dirtyRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // ── Unsaved-changes warning
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) { e.preventDefault(); }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // ── DATA FETCHING ─────────────────────────────────────────────────────────

  // Hent vendor org-info for auto-utfylling
  const { data: vendorInfo } = useQuery<{
    name: string; orgNumber?: string; institutionType?: string;
    email?: string; phone?: string; address?: string;
  } | null>({
    queryKey: ["/api/vendor/org-info"],
    queryFn: () => apiRequest("/api/vendor/org-info"),
  });

  // Auto-fyll bedrift fra vendor ved ny rapport
  useEffect(() => {
    if (!rapportId && vendorInfo && !bedrift) {
      setBedrift(vendorInfo.name);
    }
  }, [vendorInfo, rapportId]);

  // Henter kun tildelte saker for innlogget bruker
  // Template + institutions (for smart picker + auto-selection from sak's institution)
  const { templates } = useRapportTemplates();
  const { institutions } = useInstitutions();

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

  // Hent aktivitetsmaler
  const { data: aktivitetMaler = [] } = useQuery<any[]>({
    queryKey: ["/api/rapporter/aktivitet-maler"],
    queryFn: () => apiRequest("/api/rapporter/aktivitet-maler"),
  });

  // Hent kommentarer fra tiltaksleder
  const { data: kommentarer = [] } = useQuery<any[]>({
    queryKey: ["/api/rapporter", rapportId, "kommentarer"],
    queryFn: () => apiRequest(`/api/rapporter/${rapportId}/kommentarer`),
    enabled: !!rapportId,
  });

  // Hent avvik meldt av innlogget bruker — filtreres til gjeldende rapport
  const { data: mineAvvik = [] } = useQuery<any[]>({
    queryKey: ["/api/avvik/mine"],
    queryFn: () => apiRequest("/api/avvik/mine"),
    enabled: !!rapportId,
  });
  const rapportAvvikList = useMemo(
    () => (mineAvvik as any[]).filter((a) => a.rapportId === rapportId),
    [mineAvvik, rapportId],
  );
  const hasCriticalAvvik = useMemo(
    () => rapportAvvikList.some((a) => a.severity === "hoy" || a.severity === "kritisk"),
    [rapportAvvikList],
  );

  // Hent godkjente fravær for innlogget bruker — brukes til overlap-varsel
  const { data: leaveRequests = [] } = useQuery<any[]>({
    queryKey: ["/api/leave/requests", "me", "approved"],
    queryFn: () => apiRequest(`/api/leave/requests?userId=${authUser?.id}&status=approved`),
    enabled: !!authUser?.id,
  });
  const overlappingLeave = useMemo(() => {
    if (!periodeFrom || !periodeTo) return [];
    return (leaveRequests as any[]).filter((l: any) => {
      if (!l.startDate || !l.endDate) return false;
      // overlap: startDate <= periodeTo && endDate >= periodeFrom
      return l.startDate <= periodeTo && l.endDate >= periodeFrom;
    });
  }, [leaveRequests, periodeFrom, periodeTo]);

  // Rapport status
  const rapportStatus = (existingRapport as any)?.status ?? "utkast";
  const reviewKommentar = (existingRapport as any)?.reviewKommentar;
  const isReturnert = rapportStatus === "returnert";
  const isTilGodkjenning = rapportStatus === "til_godkjenning";
  const isGodkjent = rapportStatus === "godkjent";
  const feedbackAcknowledgedAt = (existingRapport as any)?.feedbackAcknowledgedAt;
  const isFeedbackAcknowledged = !!feedbackAcknowledgedAt;
  const needsAcknowledgment = isReturnert && !isFeedbackAcknowledged;

  // Filter comments by section
  const goalComments = (kommentarer as any[]).filter((k: any) => k.seksjon === "goals");
  const activityComments = (kommentarer as any[]).filter((k: any) => k.seksjon === "activities");
  const generalComments = (kommentarer as any[]).filter((k: any) => !k.seksjon);

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
    onError: (err: any) => {
      // Backend returnerer 409 med code "feedback_not_acknowledged" eller 403 "sak_unassigned"
      const msg = err?.message || err?.error || "Kunne ikke sende inn";
      toast({ title: "Innsending blokkert", description: msg, variant: "destructive" });
    },
  });

  // Miljøarbeider bekrefter at tilbakemelding er lest
  const acknowledgeFeedback = useMutation({
    mutationFn: (tekst: string | undefined) => apiRequest(`/api/rapporter/${rapportId}/acknowledge-feedback`, {
      method: "POST", body: JSON.stringify({ tekst }),
    }),
    onSuccess: () => {
      toast({ title: "Tilbakemelding bekreftet", description: "Du kan nå sende inn rapporten på nytt." });
      qc.invalidateQueries({ queryKey: ["/api/rapporter", rapportId] });
      qc.invalidateQueries({ queryKey: ["/api/rapporter"] });
    },
  });

  // Hent aktiviteter fra timeføring
  const importTimeEntries = useMutation({
    mutationFn: (overwrite: boolean) => apiRequest(`/api/rapporter/${rapportId}/import-time-entries`, {
      method: "POST", body: JSON.stringify({ overwrite }),
    }),
    onSuccess: (res: any) => {
      toast({
        title: `Hentet ${res?.imported ?? 0} aktiviteter fra timeføring`,
        description: res?.skipped > 0 ? `${res.skipped} hoppet over (duplikater)` : undefined,
      });
      qc.invalidateQueries({ queryKey: ["/api/rapporter", rapportId, "aktiviteter"] });
    },
    onError: () => toast({ title: "Kunne ikke hente timeføringer", variant: "destructive" }),
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

  // Aktivitetsmaler CRUD
  const saveMal = useMutation({
    mutationFn: (data: any) => apiRequest("/api/rapporter/aktivitet-maler", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/rapporter/aktivitet-maler"] });
      toast({ title: "Mal lagret" });
    },
  });

  const deleteMal = useMutation({
    mutationFn: (malId: string) => apiRequest(`/api/rapporter/aktivitet-maler/${malId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/rapporter/aktivitet-maler"] }),
  });

  const brukMal = useMutation({
    mutationFn: (malId: string) => apiRequest(`/api/rapporter/aktivitet-maler/${malId}/bruk`, { method: "POST", body: "{}" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/rapporter/aktivitet-maler"] }),
  });

  const handleUseMal = (mal: any) => {
    setActType(mal.type ?? "aktivitet");
    setActBesk(mal.beskrivelse);
    setActSted(mal.sted ?? "");
    setActKlient(mal.klientRef ?? "");
    brukMal.mutate(mal.id);
    setMalDialog(false);
  };

  // Mark comments as read when viewing a returned rapport
  const markAsRead = useMutation({
    mutationFn: () => apiRequest(`/api/rapporter/${rapportId}/kommentarer/les`, { method: "POST", body: "{}" }),
  });
  useEffect(() => {
    if (rapportId && isReturnert && kommentarer.length > 0) {
      markAsRead.mutate();
    }
  }, [rapportId, isReturnert, kommentarer.length]);

  // Reply to a comment
  const replyToComment = useMutation({
    mutationFn: (data: { seksjon?: string; tekst: string }) =>
      apiRequest(`/api/rapporter/${rapportId}/kommentarer`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/rapporter", rapportId, "kommentarer"] });
      toast({ title: "Svar sendt" });
    },
  });

  // ── POPULATE FROM SAK ──────────────────────────────────────────────────────

  const handleSakSelected = useCallback((id: string) => {
    setSakId(id);
    const sak = saker.find((s) => s.id === id) as any;
    if (!sak) return;
    if (sak.klientRef)        setKlientRef(sak.klientRef);
    if (sak.oppdragsgiver)    setOppdragsgiver(sak.oppdragsgiver);
    if (sak.tiltakstype)      setTiltak(sak.tiltakstype.toLowerCase());
    if (sak.tiltakslederName) setTiltaksleder(sak.tiltakslederName);
    if (sak.institutionName)  setBedrift(sak.institutionName);
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
    setRapportTemplateId(r.rapportTemplateId ?? "");
    if (r.dynamiskeFelter && typeof r.dynamiskeFelter === "object") {
      setDynamicValues(r.dynamiskeFelter);
    }
  }, [existingRapport]);

  // Auto-select template from sak's institution's default (new rapport only)
  useEffect(() => {
    if (rapportTemplateId || existingRapport) return;
    if (!sakId) return;
    const sak = saker.find(s => s.id === sakId) as any;
    if (!sak?.institutionId) return;
    const inst = institutions.find(i => i.id === sak.institutionId);
    if (inst?.defaultRapportTemplateId) {
      setRapportTemplateId(inst.defaultRapportTemplateId);
    } else {
      // Fallback: pick template matching institution type
      const match = templates.find(t => t.suggestedInstitutionType === inst?.institutionType);
      if (match) setRapportTemplateId(match.id);
    }
  }, [sakId, saker, institutions, templates, rapportTemplateId, existingRapport]);

  // Resolve the currently active template object
  const activeTemplate: RapportTemplate | undefined = useMemo(
    () => templates.find(t => t.id === rapportTemplateId),
    [templates, rapportTemplateId],
  );

  // Auto-fill konsulent from logged-in user
  useEffect(() => {
    if (!konsulent && authUserName && !existingRapport) {
      setKonsulent(authUserName);
    }
  }, [authUserName, existingRapport]);

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
    const body: any = {
      sakId, konsulent, tiltak, bedrift, oppdragsgiver, klientRef,
      periodeFrom, periodeTo, innledning, avslutning,
      rapportTemplateId: rapportTemplateId || null,
      dynamiskeFelter: dynamicValues,
    };
    if (rapportId) { await updateRapport.mutateAsync(body); }
    else           { await createRapport.mutateAsync(body); }
    dirtyRef.current = false;
  }, [sakId, konsulent, tiltak, bedrift, oppdragsgiver, klientRef, periodeFrom, periodeTo, innledning, avslutning, rapportTemplateId, dynamicValues, rapportId]);

  // ── GOAL ACTIONS ──────────────────────────────────────────────────────────

  const handleSaveGoal = async () => {
    if (!newGoalText.trim()) { toast({ title: "Beskrivelse er påkrevd", variant: "destructive" }); return; }
    // Encode extra metadata into the comment field since the schema is flat.
    const metaParts: string[] = [];
    metaParts.push(`Kategori: ${newGoalCat}`);
    metaParts.push(`Type: ${newGoalType}`);
    metaParts.push(`Prioritet: ${newGoalPriority}`);
    if (newGoalFrist) metaParts.push(`Frist: ${newGoalFrist}`);
    if (newGoalIndikator.trim()) metaParts.push(`Indikator: ${newGoalIndikator.trim()}`);
    if (newGoalComment.trim()) metaParts.push(`\nKommentar: ${newGoalComment.trim()}`);
    const kommentar = metaParts.join(" · ");
    const goalData = { beskrivelse: newGoalText, status: newGoalStatus, fremdrift: newGoalProg, kommentar };
    if (rapportId) {
      await createMaal.mutateAsync(goalData);
    } else {
      setGoals(prev => [...prev, { ...goalData, tempId: Date.now() }]);
    }
    setGoalDialog(false);
    setNewGoalText(""); setNewGoalProg(0); setNewGoalComment("");
    setNewGoalCat("Hverdagsmestring"); setNewGoalPriority("middels");
    setNewGoalType("kortsiktig"); setNewGoalFrist(""); setNewGoalIndikator("");
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

  // Week grouping for activity log
  const weekGroups = useMemo(() => {
    if (!allActivities.length) return [];

    // ISO week number helper
    const getISOWeek = (dateStr: string) => {
      const d = new Date(dateStr + "T00:00:00");
      d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
      const yearStart = new Date(d.getFullYear(), 0, 4);
      return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + yearStart.getDay() + 1) / 7);
    };

    const getWeekStart = (dateStr: string) => {
      const d = new Date(dateStr + "T00:00:00");
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
      return new Date(d.setDate(diff));
    };

    const groups = new Map<string, { weekNum: number; weekStart: Date; weekEnd: Date; activities: any[]; mins: number; days: Set<string>; meet: number }>();

    for (const a of allActivities as any[]) {
      if (!a.dato) continue;
      const wn = getISOWeek(a.dato);
      const ws = getWeekStart(a.dato);
      const we = new Date(ws);
      we.setDate(we.getDate() + 6);
      const key = `${ws.getFullYear()}-W${wn}`;

      if (!groups.has(key)) {
        groups.set(key, { weekNum: wn, weekStart: ws, weekEnd: we, activities: [], mins: 0, days: new Set(), meet: 0 });
      }
      const g = groups.get(key)!;
      g.activities.push(a);
      g.mins += a.varighet ?? calcDur(a.fraKl ?? "", a.tilKl ?? "") ?? 0;
      g.days.add(a.dato);
      if (a.type === "klientmøte") g.meet++;
    }

    return Array.from(groups.values()).sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime());
  }, [allActivities]);

  const allGoals = rapportId ? (existingMaal as Goal[]) : goals;

  // ── RENDER ────────────────────────────────────────────────────────────────

  return (
    <PortalLayout>
      {/* PAGE HEADER */}
      <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="text-2xl font-semibold">
            {rapportId ? "Rediger rapport" : "Ny rapport"}
          </h1>
          <p className="text-muted-foreground mt-1">
            {updateRapport.isPending ? "Lagrer…" : "Alle endringer lagres automatisk"}
          </p>
        </div>
        <div className="flex items-center gap-2">
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
            disabled={!rapportId || hasGdprWarnings || sendTilGodkjenning.isPending || needsAcknowledgment}
            title={needsAcknowledgment ? "Bekreft tilbakemeldingen først" : undefined}
          >
            <Send className="h-3.5 w-3.5 mr-1.5" />
            Send til godkjenning
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        {/* GDPR BANNER */}
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/10 px-4 py-2.5 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>
            <span className="font-semibold">GDPR</span> — Ingen navn, fødselsdatoer eller adresser. Bruk «ungdommen», «brukeren», «jenta», «gutten» osv.
          </span>
        </div>

        {/* FRAVÆR-OVERLAPP — godkjent fravær overlapper rapport-perioden */}
        {overlappingLeave.length > 0 && !isGodkjent && (
          <div className="flex items-start gap-2 rounded-lg border border-orange-500/40 bg-orange-50/50 dark:bg-orange-950/10 px-4 py-2.5 text-sm text-orange-800 dark:text-orange-300">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold">Du har godkjent fravær i denne perioden</p>
              <ul className="mt-1 text-xs space-y-0.5">
                {overlappingLeave.map((l: any) => (
                  <li key={l.id}>
                    <span className="font-medium">{l.leaveTypeName ?? "Fravær"}</span>:{" "}
                    {l.startDate} → {l.endDate} ({l.days} dager)
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs opacity-80">
                Sjekk at aktivitetene under ikke faller på fraværsdagene.
              </p>
            </div>
          </div>
        )}

        {/* STATUS BANNER */}
        {isReturnert && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm">
            <XCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
            <div className="flex-1 space-y-2">
              <span className="font-semibold text-destructive">Returnert fra tiltaksleder</span>
              {reviewKommentar && <p className="text-muted-foreground whitespace-pre-line">{reviewKommentar}</p>}
              {isFeedbackAcknowledged ? (
                <div className="flex items-start gap-1.5 text-xs text-emerald-700 dark:text-emerald-400 pt-1">
                  <CheckCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                  <span>
                    Du har bekreftet tilbakemeldingen{" "}
                    {feedbackAcknowledgedAt
                      ? new Date(feedbackAcknowledgedAt).toLocaleString("nb-NO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
                      : ""}. Du kan nå gjøre endringer og sende inn på nytt.
                  </span>
                </div>
              ) : (
                <AcknowledgeFeedbackForm
                  onConfirm={(tekst) => acknowledgeFeedback.mutate(tekst || undefined)}
                  isPending={acknowledgeFeedback.isPending}
                />
              )}
            </div>
          </div>
        )}
        {isTilGodkjenning && (
          <div className="flex items-start gap-2 rounded-lg border border-blue-500/30 bg-blue-50/50 dark:bg-blue-950/10 px-4 py-2.5 text-sm text-blue-700 dark:text-blue-400">
            <Clock className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">Sendt til godkjenning</span>
              <p className="opacity-70 text-xs mt-1">Venter på tilbakemelding fra tiltaksleder.</p>
            </div>
          </div>
        )}
        {isGodkjent && (
          <div className="flex items-start gap-2 rounded-lg border border-green-500/30 bg-green-50/50 dark:bg-green-950/10 px-4 py-2.5 text-sm text-green-700 dark:text-green-400">
            <CheckCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">Godkjent</span>
              <p className="opacity-70 text-xs mt-1">Rapporten er godkjent av tiltaksleder.</p>
            </div>
          </div>
        )}

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">

          {/* ── MAIN COLUMN ────────────────────────────────── */}
          <div className="space-y-4">

            {/* 1. SAK-VELGER + PROSJEKTINFO */}
            <Card className="border-border/70 bg-background/70 shadow-sm">
              <CardHeader className="space-y-3 pb-3">
                <div className="flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-primary" />
                  <span className="text-base font-semibold">Prosjektinformasjon</span>
                  {sakId && <Badge variant="outline" className="ml-auto text-[11px] border-green-500/30 text-green-700 dark:text-green-400">Pre-fylt fra sak</Badge>}
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-4">

                {/* SAK-DROPDOWN */}
                <div className="space-y-2">
                  <Label>Sak <span className="text-destructive">*</span></Label>
                  <Select value={sakId} onValueChange={handleSakSelected}>
                    <SelectTrigger className="h-10">
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
                </div>

                <Separator />

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Konsulent</Label>
                    <Input
                      value={konsulent}
                      disabled
                      className="bg-muted/40 text-muted-foreground cursor-not-allowed"
                    />
                    <p className="text-[11px] text-muted-foreground/70">Fylles automatisk fra din profil</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Tiltak / Rolle</Label>
                    <Select value={tiltak} onValueChange={(v) => { setTiltak(v); markDirty(); }}>
                      <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["miljøarbeider","sosialarbeider","aktivitør","miljøterapeut","tiltaksleder"].map((v) => (
                          <SelectItem key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5">
                      Bedrift
                      {sakId && <span className="text-[10px] font-normal text-muted-foreground">(fra sak)</span>}
                    </Label>
                    <Input
                      value={bedrift}
                      readOnly={!!sakId}
                      disabled={!!sakId}
                      onChange={(e) => { setBedrift(e.target.value); markDirty(); }}
                      className={sakId ? "bg-muted/40 cursor-not-allowed" : undefined}
                      title={sakId ? "Hentes automatisk fra tildelt sak" : undefined}
                    />
                    {vendorInfo?.orgNumber && (
                      <p className="text-[11px] text-muted-foreground/70">Org.nr: {vendorInfo.orgNumber}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5">
                      Oppdragsgiver
                      {sakId && <span className="text-[10px] font-normal text-muted-foreground">(fra sak)</span>}
                    </Label>
                    <Input
                      value={oppdragsgiver}
                      readOnly={!!sakId}
                      disabled={!!sakId}
                      onChange={(e) => { setOppdragsgiver(e.target.value); markDirty(); }}
                      className={sakId ? "bg-muted/40 cursor-not-allowed" : undefined}
                      title={sakId ? "Hentes automatisk fra tildelt sak" : undefined}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Klient-ID (anonymt)</Label>
                    <Input value={klientRef} onChange={(e) => { setKlientRef(e.target.value); markDirty(); }} placeholder="BV-2025-041" />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5">
                      Tiltaksleder
                      {sakId && <span className="text-[10px] font-normal text-muted-foreground">(fra sak)</span>}
                    </Label>
                    <Input
                      value={tiltaksleder}
                      readOnly={!!sakId}
                      disabled={!!sakId}
                      onChange={(e) => { setTiltaksleder(e.target.value); markDirty(); }}
                      className={sakId ? "bg-muted/40 cursor-not-allowed" : undefined}
                      title={sakId ? "Hentes automatisk fra tildelt sak" : undefined}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Periode</Label>
                  <div className="flex gap-3 items-center">
                    <Input type="date" value={periodeFrom} onChange={(e) => { setPeriodeFrom(e.target.value); markDirty(); }} className="flex-1" />
                    <span className="text-muted-foreground text-sm">–</span>
                    <Input type="date" value={periodeTo} onChange={(e) => { setPeriodeTo(e.target.value); markDirty(); }} className="flex-1" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* RAPPORT-MAL */}
            <Card className="border-primary/25 bg-gradient-to-br from-primary/5 to-transparent shadow-sm">
              <CardHeader className="space-y-3 pb-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  <span className="font-semibold text-sm">Rapport-mal</span>
                  {activeTemplate?.isSystem && (
                    <Badge variant="outline" className="text-[10px] ml-2">System</Badge>
                  )}
                  {activeTemplate && (
                    <Badge variant="secondary" className="text-[10px] ml-auto">
                      {activeTemplate.sections.length} seksjoner
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                <Select
                  value={rapportTemplateId || "__default__"}
                  onValueChange={(v) => {
                    setRapportTemplateId(v === "__default__" ? "" : v);
                    markDirty();
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Velg mal…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__default__">— generell struktur —</SelectItem>
                    {templates.map(t => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                        {t.isSystem ? " (system)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {activeTemplate?.description && (
                  <p className="text-xs text-muted-foreground">{activeTemplate.description}</p>
                )}
              </CardContent>
            </Card>

            {/* 2. INNLEDNING */}
            <Card className="border-border/70 bg-background/70 shadow-sm">
              <CardHeader className="space-y-3 pb-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  <span className="font-semibold text-sm">Innledning</span>
                  <span className="text-xs text-muted-foreground ml-auto">Valgfritt</span>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <GdprField
                  id="innledning" label="Innledning" multiline
                  placeholder={"Oppsummering av måneden, kontekst og generelle observasjoner…\nHusk: ingen personopplysninger."}
                  value={innledning}
                  onChange={(v) => { setInnledning(v); markDirty(); }}
                  onHitsChange={handleGdprHitsChange}
                  autoReplace={gdprAutoReplace}
                  onEnableAutoReplace={toggleGdprAutoReplace}
                />
              </CardContent>
            </Card>

            {/* 3. MÅL OG TILTAK */}
            <Card className="border-border/70 bg-background/70 shadow-sm">
              <CardHeader className="space-y-3 pb-3">
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
              <CardContent className="pt-0">
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
                            aria-label={`Slett mål ${i + 1}`}
                            onClick={() => g.id ? deleteMaal.mutate(g.id) : setGoals(prev => prev.filter(x => x.tempId !== g.tempId))}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <InlineFeedback comments={goalComments} seksjon="goals" onReply={(d) => replyToComment.mutate(d)} />
              </CardContent>
            </Card>

            {/* 4. AKTIVITETSLOGG */}
            <Card className="border-border/70 bg-background/70 shadow-sm">
              <CardHeader className="space-y-3 pb-3">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" />
                  <span className="font-semibold text-sm">Aktivitetslogg</span>
                  <Badge variant="secondary" className="ml-2 text-xs">{allActivities.length} oppføringer</Badge>
                  <div className="ml-auto flex items-center gap-2">
                    {/* View toggle */}
                    <div className="flex rounded-md border overflow-hidden">
                      <button
                        onClick={() => setActView("list")}
                        className={`px-2 py-1 text-xs flex items-center gap-1 transition-colors ${actView === "list" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                        aria-label="Listevisning"
                      >
                        <List className="h-3 w-3" /> Liste
                      </button>
                      <button
                        onClick={() => setActView("week")}
                        className={`px-2 py-1 text-xs flex items-center gap-1 transition-colors ${actView === "week" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                        aria-label="Ukevisning"
                      >
                        <CalendarDays className="h-3 w-3" /> Uke
                      </button>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!rapportId || importTimeEntries.isPending}
                      onClick={() => {
                        if (window.confirm("Hent alle timeføringer fra denne perioden og legg dem til som aktiviteter? (Duplikater hoppes over.)")) {
                          importTimeEntries.mutate(false);
                        }
                      }}
                      title="Hent aktiviteter fra timeføring for denne perioden"
                    >
                      <Clock className="h-3.5 w-3.5 mr-1" />
                      {importTimeEntries.isPending ? "Henter…" : "Hent fra timeføring"}
                    </Button>
                    <Button size="sm" onClick={() => setActDialog(true)}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Legg til aktivitet
                    </Button>
                  </div>
                </div>
              </CardHeader>

              {allActivities.length === 0 ? (
                <CardContent className="p-8 text-center text-muted-foreground text-sm">
                  <Activity className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  Ingen aktiviteter ennå
                </CardContent>
              ) : actView === "list" ? (
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
                                  aria-label={`Slett aktivitet ${a.beskrivelse?.substring(0, 20)}`}
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
                  <div className="px-4 pb-4">
                    <InlineFeedback comments={activityComments} seksjon="activities" onReply={(d) => replyToComment.mutate(d)} />
                  </div>
                </>
              ) : (
                /* ── WEEK VIEW ────────────────────────────── */
                <>
                  <div className="divide-y">
                    {weekGroups.map((wg) => {
                      const fmtDate = (d: Date) => d.toLocaleDateString("nb-NO", { day: "numeric", month: "short" });
                      const weekHours = (wg.mins / 60).toFixed(1);
                      return (
                        <div key={`W${wg.weekNum}`}>
                          {/* Week header */}
                          <div className="flex items-center justify-between px-4 py-2.5 bg-muted/40">
                            <div className="flex items-center gap-2">
                              <CalendarDays className="h-3.5 w-3.5 text-primary" />
                              <span className="text-xs font-bold text-foreground">Uke {wg.weekNum}</span>
                              <span className="text-[11px] text-muted-foreground">
                                {fmtDate(wg.weekStart)} – {fmtDate(wg.weekEnd)}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-[11px]">
                              <span className="font-semibold text-primary">{weekHours}t</span>
                              <span className="text-muted-foreground">{wg.days.size} dager</span>
                              <span className="text-muted-foreground">{wg.activities.length} akt.</span>
                              {wg.meet > 0 && <span className="text-muted-foreground">{wg.meet} møter</span>}
                            </div>
                          </div>
                          {/* Week activities */}
                          <table className="w-full text-xs">
                            <tbody>
                              {wg.activities.map((a: any) => {
                                const dur = a.varighet ? `${Math.floor(a.varighet / 60)}t${a.varighet % 60 ? ` ${a.varighet % 60}m` : ""}` : "—";
                                return (
                                  <tr key={a.id ?? a.tempId} className="border-b last:border-0 hover:bg-muted/30">
                                    <td className="px-3 py-2 font-mono whitespace-nowrap w-[70px]">{a.dato?.substring(5).replace("-", ".")}</td>
                                    <td className="px-3 py-2 w-[100px]"><Badge variant="secondary" className="text-[10px]">{a.type}</Badge></td>
                                    <td className="px-3 py-2 font-mono whitespace-nowrap w-[90px]">{a.fraKl}–{a.tilKl}</td>
                                    <td className="px-3 py-2 font-semibold text-primary w-[50px]">{dur}</td>
                                    <td className="px-3 py-2 max-w-[200px] truncate">{a.beskrivelse}</td>
                                    <td className="px-3 py-2 text-muted-foreground w-[80px]">{a.sted || "—"}</td>
                                    <td className="px-3 py-2 w-[30px]">
                                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                                        aria-label={`Slett aktivitet ${a.beskrivelse?.substring(0, 20)}`}
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
                      );
                    })}
                  </div>

                  {/* Total stats */}
                  <div className="grid grid-cols-4 gap-3 p-4 border-t bg-muted/20">
                    {[
                      { label: "Timer totalt", value: totalHours + "t" },
                      { label: "Arbeidsdager", value: stats.days.size },
                      { label: "Uker", value: weekGroups.length },
                      { label: "Klientmøter", value: stats.meet },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-primary/10 rounded-lg p-3 text-center">
                        <div className="text-xl font-bold text-primary">{value}</div>
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground mt-0.5">{label}</div>
                      </div>
                    ))}
                  </div>
                  <div className="px-4 pb-4">
                    <InlineFeedback comments={activityComments} seksjon="activities" onReply={(d) => replyToComment.mutate(d)} />
                  </div>
                </>
              )}
            </Card>

            {/* 5. FREMDRIFT */}
            <Card className="border-border/70 bg-background/70 shadow-sm">
              <CardHeader className="space-y-3 pb-3">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary" />
                  <span className="font-semibold text-sm">Fremdrift mot mål</span>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
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

            {/* TEMPLATE-DRIVEN SECTIONS */}
            {/* Render any section from the active template that isn't already
                handled as a hardcoded section above (innledning, maal,
                aktiviteter, avslutning). Supports rich_text, checklist and
                structured_observations. */}
            {activeTemplate?.sections
              .filter(s => !["innledning", "maal", "aktiviteter", "avslutning"].includes(s.key))
              .map((section: RapportTemplateSection) => (
                <Card key={section.key} className="border-border/70 bg-background/70 shadow-sm">
                  <CardHeader className="space-y-3 pb-3">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary" />
                      <span className="font-semibold text-sm">{section.title}</span>
                      {section.required && (
                        <Badge variant="destructive" className="text-[9px]">Påkrevd</Badge>
                      )}
                      <span className="text-xs text-muted-foreground ml-auto">
                        {section.type === "checklist" ? "Sjekkliste"
                         : section.type === "structured_observations" ? "Observasjoner"
                         : section.type === "summary" ? "Oppsummering"
                         : "Fritekst"}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {section.type === "checklist" && (
                      <SectionChecklist
                        items={section.items ?? []}
                        value={(dynamicValues[section.key] as ChecklistValue) ?? {}}
                        onChange={(v) => {
                          setDynamicValues(prev => ({ ...prev, [section.key]: v }));
                          markDirty();
                        }}
                        helpText={section.helpText}
                      />
                    )}
                    {section.type === "structured_observations" && (
                      <SectionObservations
                        value={(dynamicValues[section.key] as ObservationEntry[]) ?? []}
                        onChange={(v) => {
                          setDynamicValues(prev => ({ ...prev, [section.key]: v }));
                          markDirty();
                        }}
                        helpText={section.helpText}
                      />
                    )}
                    {(section.type === "rich_text" || section.type === "summary") && (
                      <GdprField
                        id={`dyn-${section.key}`}
                        label={section.title}
                        required={section.required}
                        multiline
                        placeholder={section.placeholder}
                        value={(dynamicValues[section.key] as string) ?? ""}
                        onChange={(v) => {
                          setDynamicValues(prev => ({ ...prev, [section.key]: v }));
                          markDirty();
                        }}
                        onHitsChange={handleGdprHitsChange}
                        autoReplace={gdprAutoReplace}
                        onEnableAutoReplace={toggleGdprAutoReplace}
                      />
                    )}
                    {section.helpText && section.type !== "checklist" && section.type !== "structured_observations" && (
                      <p className="text-[11px] text-muted-foreground mt-2">{section.helpText}</p>
                    )}
                  </CardContent>
                </Card>
              ))}

            {/* 6. AVSLUTNING */}
            <Card className="border-border/70 bg-background/70 shadow-sm">
              <CardHeader className="space-y-3 pb-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  <span className="font-semibold text-sm">Oppsummering og veien videre</span>
                  <span className="text-xs text-muted-foreground ml-auto">Valgfritt</span>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <GdprField
                  id="avslutning" label="Avslutning" multiline
                  placeholder="Oppsummer måneden — hva gikk bra, hva kan forbedres, planlagte aktiviteter neste måned…"
                  value={avslutning}
                  onChange={(v) => { setAvslutning(v); markDirty(); }}
                  onHitsChange={handleGdprHitsChange}
                  autoReplace={gdprAutoReplace}
                  onEnableAutoReplace={toggleGdprAutoReplace}
                />
                <InlineFeedback comments={generalComments} seksjon="" onReply={(d) => replyToComment.mutate({ ...d, seksjon: undefined })} />
              </CardContent>
            </Card>

            {/* ── AVVIK I PERIODEN ───────────────────────────────────── */}
            <Card className={cn(
              "shadow-sm",
              hasCriticalAvvik
                ? "border-amber-300 bg-amber-50/40"
                : "border-border/70 bg-background/70",
            )}>
              <CardHeader className="space-y-3 pb-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className={cn(
                    "h-4 w-4",
                    hasCriticalAvvik ? "text-amber-700" : "text-primary",
                  )} />
                  <span className="font-semibold text-sm">Avvik i perioden</span>
                  {rapportAvvikList.length > 0 && (
                    <Badge variant="secondary" className="ml-2 text-xs">
                      {rapportAvvikList.length} meldt
                    </Badge>
                  )}
                  <div className="ml-auto">
                    <AvvikDialog
                      rapportId={rapportId || undefined}
                      sakId={sakId || undefined}
                      defaultDate={periodeTo || periodeFrom || undefined}
                      trigger={
                        <Button
                          size="sm"
                          variant={rapportAvvikList.length > 0 ? "outline" : "default"}
                          className="gap-1.5"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          {rapportAvvikList.length > 0 ? "Meld nytt" : "Meld avvik"}
                        </Button>
                      }
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {rapportAvvikList.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground text-sm">
                    <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="max-w-md mx-auto">
                      Hendelser, skader, trusler eller rutinebrudd — registrer dem her.
                      Går direkte til tiltaksleder med GDPR-maskering.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {rapportAvvikList.map((a: any) => {
                      const sev  = AVVIK_SEVERITY_STYLE[a.severity] ?? AVVIK_SEVERITY_STYLE.middels;
                      const stat = AVVIK_STATUS_META[a.status]      ?? AVVIK_STATUS_META.rapportert;
                      return (
                        <div key={a.id} className="flex gap-3 items-start py-2 border-b last:border-0">
                          <Badge variant="outline" className={cn("text-[10px] px-2 shrink-0 mt-0.5", sev.cls)}>
                            {sev.label}
                          </Badge>
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <CalendarDays className="h-3 w-3" />
                                {a.dateOccurred}
                              </span>
                              <span className="opacity-40">•</span>
                              <span>{AVVIK_CATEGORY_LABEL[a.category] ?? a.category}</span>
                              <Badge variant={stat.variant} className="text-[10px]">
                                {stat.label}
                              </Badge>
                            </div>
                            <p className="text-sm mt-0.5 line-clamp-2">{a.description}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

          </div>{/* /main col */}

          {/* ── SIDEBAR ────────────────────────────────────── */}
          <div className="order-first space-y-4 lg:order-last lg:sticky lg:top-6">

            {/* Status */}
            <Card className="border-border/70 bg-background/80 shadow-sm">
              <CardHeader className="pb-3">
                <span className="text-base font-semibold flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-primary" /> Status</span>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {[
                  { label: "Status",      value: (
                    <Badge
                      variant={isGodkjent ? "default" : isReturnert ? "destructive" : isTilGodkjenning ? "secondary" : "outline"}
                      className="text-[11px]"
                    >
                      {isGodkjent ? "Godkjent" : isReturnert ? "Returnert" : isTilGodkjenning ? "Til godkjenning" : "Utkast"}
                    </Badge>
                  ) },
                  { label: "Sak",         value: sakId ? saker.find(s=>s.id===sakId)?.saksnummer : <span className="text-muted-foreground text-xs">Ikke valgt</span> },
                  { label: "Aktiviteter", value: <span className="font-medium">{allActivities.length}</span> },
                  { label: "Mål",         value: <span className="font-medium">{allGoals.length}</span> },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between items-center">
                    <span className="text-muted-foreground text-xs">{label}</span>
                    {value}
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* TIMELINE / AUDIT LOG */}
            {rapportId && <RapportAuditTimeline rapportId={rapportId} />}

            {/* GDPR */}
            <Card className="border-border/70 bg-background/80 shadow-sm">
              <CardHeader className="pb-3">
                <span className="text-base font-semibold">GDPR-sjekkliste</span>
              </CardHeader>
              <CardContent className="space-y-2">
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
                <Separator className="my-2" />
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={gdprAutoReplace} onCheckedChange={toggleGdprAutoReplace} />
                  <span className="text-xs text-muted-foreground leading-relaxed">
                    Auto-erstatt personopplysninger
                  </span>
                </label>
                {gdprAutoReplace && (
                  <p className="text-[10px] text-emerald-600 ml-6">Navn erstattes automatisk med anonyme betegnelser mens du skriver.</p>
                )}
              </CardContent>
            </Card>

            {/* Send */}
            <Card className="border-primary/25 bg-gradient-to-br from-primary/5 to-transparent shadow-sm p-4">
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
              {hasGdprWarnings && (
                <p className="text-xs text-destructive mt-2 text-center font-medium">
                  {gdprHitCount} personopplysning{gdprHitCount > 1 ? "er" : ""} må fjernes før innsending
                </p>
              )}
            </Card>

          </div>{/* /sidebar */}
        </div>
      </div>

      {/* ── DIALOGS ──────────────────────────────────── */}

      {/* LEGG TIL MÅL */}
      <Dialog open={goalDialog} onOpenChange={setGoalDialog}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Legg til mål</DialogTitle>
            <DialogDescription>
              Definer et konkret, målbart mål for ungdommen. Bruk GDPR-trygge formuleringer.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Kategori — hurtigvalg */}
            <div className="space-y-2">
              <Label>Kategori</Label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {BUILT_IN_GOAL_CATEGORIES.map(({ cat, icon: Icon }) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setNewGoalCat(cat)}
                    className={`flex items-center gap-2 rounded-lg border p-2.5 text-sm transition-colors ${
                      newGoalCat === cat ? "border-primary bg-primary/5 text-foreground" : "hover:bg-muted/50 text-muted-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    <span className="flex-1 text-left font-medium">{cat}</span>
                  </button>
                ))}
                {customGoalCats.map((cat) => (
                  <div
                    key={cat}
                    className={`flex items-center gap-2 rounded-lg border p-2.5 text-sm transition-colors group ${
                      newGoalCat === cat ? "border-primary bg-primary/5 text-foreground" : "hover:bg-muted/50 text-muted-foreground"
                    }`}
                  >
                    <button type="button" onClick={() => setNewGoalCat(cat)} className="flex items-center gap-2 flex-1 min-w-0">
                      <Tag className="h-4 w-4 flex-shrink-0" />
                      <span className="flex-1 text-left font-medium truncate">{cat}</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeCustomCat(cat); }}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity flex-shrink-0"
                      aria-label={`Slett kategori ${cat}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}

                {/* Add custom category */}
                {showAddCatInput ? (
                  <div className="col-span-2 md:col-span-3 flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 p-2">
                    <Input
                      value={newCatName}
                      onChange={(e) => setNewCatName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomCat(); } if (e.key === "Escape") { setShowAddCatInput(false); setNewCatName(""); } }}
                      placeholder="Navn på ny kategori…"
                      className="h-8 text-sm flex-1"
                      autoFocus
                    />
                    <Button size="sm" onClick={addCustomCat} disabled={!newCatName.trim()}>Legg til</Button>
                    <Button size="sm" variant="ghost" onClick={() => { setShowAddCatInput(false); setNewCatName(""); }}>Avbryt</Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowAddCatInput(true)}
                    className="flex items-center gap-2 rounded-lg border border-dashed p-2.5 text-sm text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors"
                  >
                    <Plus className="h-4 w-4 flex-shrink-0" />
                    <span className="flex-1 text-left font-medium">Ny kategori</span>
                  </button>
                )}
              </div>
            </div>

            {/* Beskrivelse */}
            <GdprField
              id="new-goal-text" label="Mål-beskrivelse" required multiline
              placeholder={"Beskriv målet — f.eks. «Styrke daglige rutiner gjennom ukentlig oppfølging»\nIngen personopplysninger."}
              value={newGoalText} onChange={setNewGoalText} onHitsChange={handleGdprHitsChange}
              autoReplace={gdprAutoReplace} onEnableAutoReplace={toggleGdprAutoReplace}
            />

            {/* Type og prioritet */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Måltype</Label>
                <Select value={newGoalType} onValueChange={(v: any) => setNewGoalType(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="langsiktig">
                      <span className="flex items-center gap-2"><CalendarDays className="h-3.5 w-3.5" /> Langsiktig mål (6+ mnd)</span>
                    </SelectItem>
                    <SelectItem value="kortsiktig">
                      <span className="flex items-center gap-2"><CalendarClock className="h-3.5 w-3.5" /> Kortsiktig mål (1-3 mnd)</span>
                    </SelectItem>
                    <SelectItem value="delmål">
                      <span className="flex items-center gap-2"><Target className="h-3.5 w-3.5" /> Delmål (uker)</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Prioritet</Label>
                <Select value={newGoalPriority} onValueChange={(v: any) => setNewGoalPriority(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="høy">
                      <span className="flex items-center gap-2"><Flag className="h-3.5 w-3.5 text-red-500" /> Høy</span>
                    </SelectItem>
                    <SelectItem value="middels">
                      <span className="flex items-center gap-2"><Flag className="h-3.5 w-3.5 text-amber-500" /> Middels</span>
                    </SelectItem>
                    <SelectItem value="lav">
                      <span className="flex items-center gap-2"><Flag className="h-3.5 w-3.5 text-emerald-500" /> Lav</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Status og fremdrift */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={newGoalStatus} onValueChange={(v: any) => setNewGoalStatus(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aktiv">Aktiv</SelectItem>
                    <SelectItem value="pågår">Pågår</SelectItem>
                    <SelectItem value="fullført">Fullført</SelectItem>
                    <SelectItem value="avbrutt">Avbrutt</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Fremdrift: <span className="text-primary font-semibold">{newGoalProg}%</span></Label>
                <input
                  type="range" min="0" max="100" value={newGoalProg}
                  onChange={(e) => setNewGoalProg(+e.target.value)}
                  className="w-full accent-primary"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>0</span><span>25</span><span>50</span><span>75</span><span>100</span>
                </div>
              </div>
            </div>

            {/* Frist */}
            <div className="space-y-2">
              <Label>Ønsket frist (valgfri)</Label>
              <Input
                type="date" value={newGoalFrist}
                onChange={(e) => setNewGoalFrist(e.target.value)}
                className="md:max-w-xs"
              />
            </div>

            {/* Måloppnåelse / indikator */}
            <GdprField
              id="new-goal-indikator" label="Indikator for måloppnåelse (valgfri)" multiline
              placeholder="Hvordan vet vi at målet er nådd? F.eks. «står opp kl 08 minst 4 dager i uka»"
              value={newGoalIndikator} onChange={setNewGoalIndikator} onHitsChange={handleGdprHitsChange}
              autoReplace={gdprAutoReplace} onEnableAutoReplace={toggleGdprAutoReplace}
            />

            {/* Kommentar */}
            <GdprField
              id="new-goal-comment" label="Utfyllende notat (valgfri)"
              placeholder="Bakgrunn, tilnærming, samarbeidspartnere…"
              value={newGoalComment} onChange={setNewGoalComment} onHitsChange={handleGdprHitsChange}
              autoReplace={gdprAutoReplace} onEnableAutoReplace={toggleGdprAutoReplace}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setGoalDialog(false)}>Avbryt</Button>
            <Button onClick={handleSaveGoal} disabled={createMaal.isPending}>Lagre mål</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MÅL-MALER */}
      <Dialog open={goalTplDialog} onOpenChange={setGoalTplDialog}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Mål-maler</DialogTitle>
            <DialogDescription>Velg ferdiglagede mål fra ulike kategorier og legg dem til samtidig.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto space-y-4 py-2 pr-1">
            {["Hverdagsmestring","Sosialt","Skole / Arbeid","Psykisk helse","Aktivitet","Selvstendighet"].map((cat) => {
              const catGoals = GOAL_TEMPLATES.map((t, i) => ({ ...t, index: i })).filter(t => t.cat === cat);
              if (!catGoals.length) return null;
              return (
                <div key={cat}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">{cat}</p>
                  <div className="space-y-2">
                    {catGoals.map(({ icon: Icon, title, text, index }) => (
                      <label key={index} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${selectedGoalTpls.has(index) ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}>
                        <Checkbox checked={selectedGoalTpls.has(index)} onCheckedChange={(checked) => {
                          setSelectedGoalTpls(prev => { const s = new Set(prev); checked ? s.add(index) : s.delete(index); return s; });
                        }} className="mt-0.5" />
                        <div className="flex items-start gap-2 flex-1">
                          <Icon className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm font-medium">{title}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{text}</p>
                          </div>
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
      <Dialog open={actDialog} onOpenChange={(open) => { setActDialog(open); if (!open) aktivitetForslag.nullstill(); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Legg til aktivitet</DialogTitle>
            <DialogDescription>Registrer en aktivitet. Bruk AI-forslag eller lagrede maler for å spare tid.</DialogDescription>
            {(aktivitetMaler as any[]).length > 0 && (
              <button onClick={() => setMalDialog(true)} className="text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-1 mt-1">
                <Star className="h-3 w-3" /> Bruk lagret mal ({(aktivitetMaler as any[]).length})
              </button>
            )}
          </DialogHeader>
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

            {/* Beskrivelse med ML-forslag */}
            <div className="relative">
              <GdprField id="act-besk" label="Beskrivelse" required multiline
                placeholder={"Hva ble gjort? Ingen personopplysninger.\nBruk «ungdommen», «brukeren» osv."}
                value={actBesk}
                onChange={(v) => {
                  setActBesk(v);
                  aktivitetForslag.hent(v, actType, actSted);
                }}
                onHitsChange={handleGdprHitsChange} autoReplace={gdprAutoReplace} onEnableAutoReplace={toggleGdprAutoReplace} />

              {/* Autocomplete dropdown */}
              {(aktivitetForslag.forslag.length > 0 || aktivitetForslag.loading) && actBesk.length >= 2 && (
                <div className="absolute left-0 right-0 z-50 mt-1 rounded-lg border bg-popover shadow-lg overflow-hidden">
                  {aktivitetForslag.loading && aktivitetForslag.forslag.length === 0 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
                      <Loader2 className="h-3 w-3 animate-spin" /> Henter forslag…
                    </div>
                  )}
                  {aktivitetForslag.forslag.map((f, i) => (
                    <button
                      key={i}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-start gap-2 border-b last:border-0"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setActBesk(f.tekst);
                        if (f.type) setActType(f.type);
                        if (f.sted) setActSted(f.sted);
                        aktivitetForslag.nullstill();
                      }}
                    >
                      {f.kilde === "ai" ? (
                        <Sparkles className="h-3.5 w-3.5 text-violet-500 flex-shrink-0 mt-0.5" />
                      ) : (
                        <Clock className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                      )}
                      <span className="flex-1">{f.tekst}</span>
                      {f.kilde === "ai" && <Badge variant="secondary" className="text-[9px] ml-1 flex-shrink-0">AI</Badge>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <GdprField id="act-klient" label="Klient-ref (anonym)"
                placeholder="ungdommen, bruker A…" value={actKlient} onChange={setActKlient} onHitsChange={handleGdprHitsChange} autoReplace={gdprAutoReplace} onEnableAutoReplace={toggleGdprAutoReplace} />
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Knyttet til mål</Label>
                <Select value={actMalId || "__none__"} onValueChange={(v) => setActMalId(v === "__none__" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="— ingen —" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— ingen —</SelectItem>
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
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="mr-auto text-xs"
              onClick={() => {
                if (!actBesk.trim()) { toast({ title: "Fyll inn beskrivelse først", variant: "destructive" }); return; }
                saveMal.mutate({ navn: actBesk.substring(0, 40), type: actType, beskrivelse: actBesk, sted: actSted, klientRef: actKlient });
              }}
            >
              <BookmarkPlus className="h-3.5 w-3.5 mr-1" /> Lagre som mal
            </Button>
            <Button variant="outline" onClick={() => setActDialog(false)}>Avbryt</Button>
            <Button onClick={handleSaveActivity} disabled={createAktivitet.isPending}>Lagre aktivitet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AKTIVITETSMALER DIALOG */}
      <Dialog open={malDialog} onOpenChange={setMalDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mine aktivitetsmaler</DialogTitle>
            <DialogDescription>Klikk en mal for å fylle ut aktiviteten raskt.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2 max-h-[50vh] overflow-y-auto">
            {(aktivitetMaler as any[]).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Ingen lagrede maler ennå. Lagre en aktivitet som mal for å se den her.</p>
            ) : (
              (aktivitetMaler as any[]).map((mal: any) => (
                <div
                  key={mal.id}
                  className="flex items-start gap-3 rounded-lg border p-3 hover:bg-accent/50 cursor-pointer transition-colors group"
                  onClick={() => handleUseMal(mal)}
                >
                  <Star className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{mal.beskrivelse}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary" className="text-[10px]">{mal.type}</Badge>
                      {mal.sted && <span className="text-[10px] text-muted-foreground">{mal.sted}</span>}
                      <span className="text-[10px] text-muted-foreground ml-auto">Brukt {mal.brukAntall}x</span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                    onClick={(e) => { e.stopPropagation(); deleteMal.mutate(mal.id); }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* KOPIER FRA FORRIGE RAPPORT */}
      <Dialog open={prevDialog} onOpenChange={setPrevDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Kopier fra forrige rapport</DialogTitle>
            <DialogDescription>Gjenbruk prosjektinfo fra en tidligere godkjent rapport.</DialogDescription>
          </DialogHeader>
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

    </PortalLayout>
  );
}

// ─── Audit timeline (sidebar component) ────────────────────────────────────

interface AuditEvent {
  id: string;
  rapportId: string;
  userId: number | null;
  userName: string | null;
  userRole: string | null;
  eventType: string;
  eventLabel: string | null;
  details: any;
  createdAt: string;
}

const EVENT_META: Record<string, { color: string; label: string; icon: typeof Clock }> = {
  created:        { color: "text-muted-foreground", label: "Opprettet",         icon: Plus },
  submitted:      { color: "text-blue-600",         label: "Sendt til godkjenning", icon: Send },
  approved:       { color: "text-emerald-600",      label: "Godkjent",          icon: CheckCircle },
  returned:       { color: "text-amber-600",        label: "Returnert",         icon: RotateCcw },
  cancelled:      { color: "text-muted-foreground", label: "Avbrutt",           icon: XCircle },
  comment:        { color: "text-muted-foreground", label: "Kommentar",         icon: MessageSquare },
  auto_forwarded: { color: "text-emerald-600",      label: "Videresendt",       icon: Send },
};

function RapportAuditTimeline({ rapportId }: { rapportId: string }) {
  const { data: events = [] } = useQuery<AuditEvent[]>({
    queryKey: [`/api/rapporter/${rapportId}/audit`],
    queryFn: () => apiRequest(`/api/rapporter/${rapportId}/audit`),
    enabled: !!rapportId,
    staleTime: 30_000,
  });

  if (events.length === 0) return null;

  return (
    <Card className="border-border/70 bg-background/80 shadow-sm">
      <CardHeader className="pb-3">
        <span className="text-base font-semibold flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 text-primary" />
          Historikk
          <Badge variant="outline" className="ml-auto text-[10px]">{events.length}</Badge>
        </span>
      </CardHeader>
      <CardContent className="space-y-0 max-h-72 overflow-y-auto pr-1">
        {events.map((e, i) => {
          const meta = EVENT_META[e.eventType] ?? { color: "text-muted-foreground", label: e.eventType, icon: Clock };
          const Icon = meta.icon;
          const date = new Date(e.createdAt);
          const dateLabel = date.toLocaleDateString("nb-NO", { day: "numeric", month: "short" });
          const timeLabel = date.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
          return (
            <div key={e.id} className="flex gap-3 relative pb-3">
              {/* Vertical line */}
              {i < events.length - 1 && (
                <div className="absolute left-[10px] top-7 bottom-0 w-px bg-border" />
              )}
              <div className={`relative flex-shrink-0 h-5 w-5 rounded-full bg-background border flex items-center justify-center ${meta.color}`}>
                <Icon className="h-2.5 w-2.5" />
              </div>
              <div className="flex-1 min-w-0 -mt-0.5">
                <p className="text-xs font-medium leading-tight">
                  {e.eventLabel ?? meta.label}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                  {e.userName ?? "Ukjent"} {e.userRole && <span className="opacity-60">· {e.userRole}</span>}
                </p>
                <p className="text-[10px] text-muted-foreground/70">
                  {dateLabel} kl. {timeLabel}
                </p>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ── FEEDBACK-ACKNOWLEDGMENT FORM ──────────────────────────────────────────────
// Miljøarbeider bekrefter at returnert-feedback er lest før resubmit tillates.

function AcknowledgeFeedbackForm({ onConfirm, isPending }: {
  onConfirm: (tekst: string) => void;
  isPending: boolean;
}) {
  const [tekst, setTekst] = useState("");
  const [checked, setChecked] = useState(false);
  return (
    <div className="rounded-md border bg-card/60 p-3 space-y-2 mt-2">
      <label className="flex items-start gap-2 text-xs cursor-pointer">
        <input
          type="checkbox"
          className="mt-0.5 h-3.5 w-3.5 accent-primary"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
        />
        <span>Jeg har lest og forstått tilbakemeldingen fra tiltaksleder.</span>
      </label>
      <textarea
        value={tekst}
        onChange={(e) => setTekst(e.target.value)}
        placeholder="Valgfritt svar til tiltaksleder (hva du har endret) …"
        rows={2}
        className="w-full text-xs rounded-md border bg-background px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
      />
      <div className="flex justify-end">
        <button
          type="button"
          disabled={!checked || isPending}
          onClick={() => onConfirm(tekst.trim())}
          className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground disabled:opacity-50"
        >
          {isPending ? "Bekrefter…" : "Bekreft og lås opp innsending"}
        </button>
      </div>
    </div>
  );
}
