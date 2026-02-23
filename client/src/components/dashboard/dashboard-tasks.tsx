import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  AlertTriangle,
  Briefcase,
  Check,
  CheckCircle,
  ChevronDown,
  Clock,
  ExternalLink,
  FileText,
  Link2,
  BellOff,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export interface TaskCounts {
  pendingApprovals: number;
  overdueItems: number;
  myDrafts: number;
  assignedCases: number;
}

interface DashboardTasksProps {
  tasks: TaskCounts;
  navigate: (path: string) => void;
  mode?: "default" | "tiltaksleder" | "miljoarbeider";
}

interface UserTask {
  id: number;
  userId: string;
  title: string;
  done: boolean;
  linkedUrl: string | null;
  linkedLabel: string | null;
  snoozedUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

const LINK_PRESETS = [
  { label: "Tiltak", url: "/cases" },
  { label: "Timeregistrering", url: "/time-tracking" },
  { label: "Rapporter", url: "/reports" },
  { label: "Brukere", url: "/users" },
];

const KEYWORD_LINKS: { keywords: string[]; preset: (typeof LINK_PRESETS)[number] }[] = [
  { keywords: ["tiltak", "sak", "saker", "godkjenning", "forfalt", "behandl"], preset: { label: "Tiltak", url: "/cases" } },
  { keywords: ["timer", "time", "registrer", "klokke", "timeregistrering"], preset: { label: "Timeregistrering", url: "/time-tracking" } },
  { keywords: ["rapport", "rapporter", "utkast", "frist"], preset: { label: "Rapporter", url: "/reports" } },
  { keywords: ["bruker", "brukere", "ansatt", "kontakt"], preset: { label: "Brukere", url: "/users" } },
];

const STALE_DAYS = 3;
const isStale = (task: UserTask, staleDays: number) =>
  Date.now() - new Date(task.createdAt).getTime() > staleDays * 86_400_000;
const taskAgeDays = (task: UserTask) =>
  Math.floor((Date.now() - new Date(task.createdAt).getTime()) / 86_400_000);

/* ── Learned prefs type (mirrors server TaskPrefsData) ── */
interface TaskPrefsData {
  keywordLinks: Record<string, Record<string, number>>;
  linkUsage: Record<string, number>;
  totalCreated: number;
  totalCompleted: number;
  recentCompletionMs: number[];
}

/* ── Derive learned link suggestion from prefs + draft tokens ── */
function learnedSuggestion(
  draft: string,
  prefs: TaskPrefsData | undefined,
): { url: string; label: string; confidence: number } | null {
  if (!prefs || Object.keys(prefs.keywordLinks).length === 0) return null;
  const tokens = draft.toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/).filter(Boolean);
  const urlScores: Record<string, number> = {};
  for (const token of tokens) {
    const links = prefs.keywordLinks[token];
    if (!links) continue;
    for (const [url, count] of Object.entries(links)) {
      urlScores[url] = (urlScores[url] ?? 0) + count;
    }
  }
  const best = Object.entries(urlScores).sort((a, b) => b[1] - a[1])[0];
  if (!best || best[1] < 2) return null; // need at least 2 data points
  const preset = LINK_PRESETS.find((p) => p.url === best[0]);
  if (!preset) return null;
  return { url: best[0], label: preset.label, confidence: best[1] };
}

/* ── Derive adaptive stale threshold from avg completion time ── */
function adaptiveStaleDays(prefs: TaskPrefsData | undefined): number {
  const recentCompletionMs = Array.isArray(prefs?.recentCompletionMs) ? prefs.recentCompletionMs : [];
  if (recentCompletionMs.length < 3) return STALE_DAYS;
  const avg = recentCompletionMs.reduce((a, b) => a + b, 0) / recentCompletionMs.length;
  const avgDays = avg / 86_400_000;
  // stale threshold = 80% of personal avg completion time, clamped 1–7 days
  return Math.min(7, Math.max(1, Math.round(avgDays * 0.8)));
}

/* ════════════════════════════════════════════════════════
   PRIORITY MODEL
   Score = age_signal + keyword_signal + link_signal + context_signal
   Range: 0–100+  (uncapped so urgent tasks always surface)
   ════════════════════════════════════════════════════════ */

const URGENCY_KEYWORDS: { pattern: RegExp; weight: number }[] = [
  { pattern: /hast|kritisk|asap|snarest|idag|i\s?dag|d\.d\./i, weight: 40 },
  { pattern: /forfalt|frist|deadline|overdue/i, weight: 30 },
  { pattern: /godkjenn|behandl|oppfølg|følg\s?opp/i, weight: 20 },
  { pattern: /sjekk|oppdater|send|svar/i, weight: 10 },
];

const LINK_URGENCY: Record<string, number> = {
  "/cases": 15,
  "/reports": 10,
  "/time-tracking": 5,
  "/users": 5,
};

/** Log-curve age score: 0 → 0, 1d → 18, 3d → 28, 7d → 38, 14d → 46 */
const ageSignal = (task: UserTask) =>
  Math.min(50, Math.log2(taskAgeDays(task) + 1) * 18);

function priorityScore(task: UserTask, ctx: { overdueItems: number; pendingApprovals: number }): number {
  let score = ageSignal(task);

  // Keyword urgency — take the highest matching weight only
  let kwScore = 0;
  for (const { pattern, weight } of URGENCY_KEYWORDS) {
    if (pattern.test(task.title)) { kwScore = Math.max(kwScore, weight); }
  }
  score += kwScore;

  // Link-section base urgency
  if (task.linkedUrl) score += LINK_URGENCY[task.linkedUrl] ?? 0;

  // Context signals from live dashboard counts
  if (task.linkedUrl === "/cases" && ctx.overdueItems > 0) {
    score += Math.min(20, ctx.overdueItems * 4); // up to +20
  }
  if (task.linkedUrl === "/cases" && ctx.pendingApprovals > 0) {
    score += Math.min(10, ctx.pendingApprovals * 2); // up to +10
  }

  return Math.round(score);
}

type Priority = "high" | "medium" | "low";
function priorityLevel(score: number): Priority {
  if (score >= 55) return "high";
  if (score >= 30) return "medium";
  return "low";
}

const PRIORITY_STYLES: Record<Priority, { dot: string; label: string; ring: string; text: string }> = {
  high: { dot: "bg-red-500", label: "Høy", ring: "ring-1 ring-red-400/60", text: "text-red-500" },
  medium: { dot: "bg-amber-400", label: "Medium", ring: "ring-1 ring-amber-400/50", text: "text-amber-500" },
  low: { dot: "bg-muted-foreground/30", label: "", ring: "", text: "" },
};

/* ────────────────────────────────────────────
   JACCARD TOKEN SIMILARITY (duplicate guard)
   ──────────────────────────────────────────── */
function tokenize(s: string): Set<string> {
  return new Set(s.toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/).filter(Boolean));
}
function jaccardSim(a: string, b: string): number {
  const sa = tokenize(a);
  const sb = tokenize(b);
  let inter = 0;
  sa.forEach((t) => { if (sb.has(t)) inter++; });
  const allTokens = new Set(Array.from(sa).concat(Array.from(sb)));
  const union = allTokens.size;
  return union === 0 ? 0 : inter / union;
}

/* ── ETA estimate from personal completion history (median) ── */
function etaLabel(prefs: TaskPrefsData | undefined): string | null {
  const recentCompletionMs = Array.isArray(prefs?.recentCompletionMs) ? prefs.recentCompletionMs : [];
  if (recentCompletionMs.length < 3) return null;
  const sorted = [...recentCompletionMs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  const days = median / 86_400_000;
  if (days < 0.5) return "< 1d";
  return `~${Math.max(1, Math.round(days))}d`;
}

/* ── Snooze time helper (8am on target day) ── */
function snoozeUntil(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(8, 0, 0, 0);
  return d.toISOString();
}

async function apiRequest(method: string, url: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: "include",
  });
  if (!res.ok && res.status !== 204) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || res.statusText);
  }
  if (res.status === 204) return null;
  return res.json();
}

export function DashboardTasks({ tasks, navigate, mode = "default" }: DashboardTasksProps) {
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState("");
  const [draftLink, setDraftLink] = useState<{ url: string; label: string } | null>(null);
  const [suggestedLink, setSuggestedLink] = useState<{ url: string; label: string; isLearned?: boolean; confidence?: number } | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [doneOpen, setDoneOpen] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [justCompleted, setJustCompleted] = useState<{ id: number; title: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const qc = useQueryClient();
  const isTiltaksleder = mode === "tiltaksleder";
  const isMiljoarbeider = mode === "miljoarbeider";
  const resolveDashboardPath = (path: string) => {
    if (!isMiljoarbeider) return path;
    if (path === "/cases" || path === "/users" || path === "/invites") return "/case-reports";
    return path;
  };

  /* ── Real tasks from API ── */
  const { data: rawUserTasks } = useQuery<UserTask[] | Record<string, unknown>>({
    queryKey: ["/api/tasks"],
    staleTime: 30_000,
  });

  const userTasks = useMemo<UserTask[]>(
    () => (Array.isArray(rawUserTasks) ? rawUserTasks : []),
    [rawUserTasks],
  );

  /* ── Learned preferences ── */
  const { data: rawPrefs } = useQuery<TaskPrefsData | Record<string, unknown>>({
    queryKey: ["/api/task-prefs"],
    staleTime: 60_000,
  });

  const prefs = useMemo<TaskPrefsData | undefined>(() => {
    if (!rawPrefs || typeof rawPrefs !== "object") return undefined;

    const keywordLinksRaw = "keywordLinks" in rawPrefs ? rawPrefs.keywordLinks : undefined;
    const linkUsageRaw = "linkUsage" in rawPrefs ? rawPrefs.linkUsage : undefined;
    const recentCompletionRaw = "recentCompletionMs" in rawPrefs ? rawPrefs.recentCompletionMs : undefined;

    const keywordLinks = keywordLinksRaw && typeof keywordLinksRaw === "object"
      ? keywordLinksRaw as Record<string, Record<string, number>>
      : {};
    const linkUsage = linkUsageRaw && typeof linkUsageRaw === "object"
      ? linkUsageRaw as Record<string, number>
      : {};
    const recentCompletionMs = Array.isArray(recentCompletionRaw)
      ? recentCompletionRaw.filter((value): value is number => typeof value === "number" && Number.isFinite(value))
      : [];

    return {
      keywordLinks,
      linkUsage,
      totalCreated: typeof rawPrefs.totalCreated === "number" ? rawPrefs.totalCreated : 0,
      totalCompleted: typeof rawPrefs.totalCompleted === "number" ? rawPrefs.totalCompleted : 0,
      recentCompletionMs,
    };
  }, [rawPrefs]);

  const isPersonalized = prefs && (prefs.totalCreated ?? 0) >= 3;
  const staleDays = adaptiveStaleDays(prefs);

  /* ── Event logger (fire-and-forget) ── */
  const eventMut = useMutation({
    mutationFn: (event: object) => apiRequest("POST", "/api/task-prefs/event", event),
  });

  const createMut = useMutation({
    mutationFn: (data: { title: string; linkedUrl?: string | null; linkedLabel?: string | null }) =>
      apiRequest("POST", "/api/tasks", data),
    onSuccess: (_result, vars) => {
      qc.invalidateQueries({ queryKey: ["/api/tasks"] });
      // Log to learning system
      eventMut.mutate({ type: "task_created", title: vars.title, linkedUrl: vars.linkedUrl ?? null });
      qc.invalidateQueries({ queryKey: ["/api/task-prefs"] });
      setDraft("");
      setDraftLink(null);
      setSuggestedLink(null);
    },
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, done }: { id: number; done: boolean }) =>
      apiRequest("PATCH", `/api/tasks/${id}`, { done }),
    onMutate: async ({ id, done }) => {
      await qc.cancelQueries({ queryKey: ["/api/tasks"] });
      const prev = qc.getQueryData<UserTask[]>(["/api/tasks"]);
      qc.setQueryData<UserTask[]>(["/api/tasks"], (old = []) =>
        old.map((t) => (t.id === id ? { ...t, done } : t)),
      );
      return { prev };
    },
    onSuccess: (_result, vars) => {
      if (vars.done) {
        const task = userTasks.find((t) => t.id === vars.id);
        if (task) {
          eventMut.mutate({ type: "task_completed", createdAtMs: new Date(task.createdAt).getTime() });
          qc.invalidateQueries({ queryKey: ["/api/task-prefs"] });
          setJustCompleted({ id: vars.id, title: task.title });
          if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
          undoTimerRef.current = setTimeout(() => setJustCompleted(null), 3500);
        }
      }
    },
    onError: (_e: unknown, _v: unknown, ctx?: { prev?: UserTask[] }) => {
      if (ctx?.prev) qc.setQueryData(["/api/tasks"], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["/api/tasks"] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/tasks/${id}`),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ["/api/tasks"] });
      const prev = qc.getQueryData<UserTask[]>(["/api/tasks"]);
      qc.setQueryData<UserTask[]>(["/api/tasks"], (old = []) => old.filter((t) => t.id !== id));
      return { prev };
    },
    onError: (_e: unknown, _v: unknown, ctx?: { prev?: UserTask[] }) => {
      if (ctx?.prev) qc.setQueryData(["/api/tasks"], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["/api/tasks"] }),
  });

  const renameMut = useMutation({
    mutationFn: ({ id, title }: { id: number; title: string }) =>
      apiRequest("PATCH", `/api/tasks/${id}`, { title }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/tasks"] }),
  });

  const snoozeMut = useMutation({
    mutationFn: ({ id, until }: { id: number; until: string }) =>
      apiRequest("PATCH", `/api/tasks/${id}`, { snoozedUntil: until }),
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: ["/api/tasks"] });
      const prev = qc.getQueryData<UserTask[]>(["/api/tasks"]);
      qc.setQueryData<UserTask[]>(["/api/tasks"], (old = []) =>
        old.map((t) =>
          t.id === id ? { ...t, snoozedUntil: new Date(Date.now() + 86_400_000).toISOString() } : t,
        ),
      );
      return { prev };
    },
    onError: (_e: unknown, _v: unknown, ctx?: { prev?: UserTask[] }) => {
      if (ctx?.prev) qc.setQueryData(["/api/tasks"], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["/api/tasks"] }),
  });

  const handleCreate = () => {
    const title = draft.trim();
    if (!title) return;
    createMut.mutate({ title, linkedUrl: draftLink?.url ?? null, linkedLabel: draftLink?.label ?? null });
  };

  /* ── Status tiles config ── */
  const tiles = [
    {
      key: "overdue",
      count: tasks.overdueItems,
      label: isTiltaksleder ? "Tiltak uten aktivitet" : "Forfalt",
      sublabel: isTiltaksleder ? "Siste 7 dager" : "Krever handling",
      taskLabel: isTiltaksleder ? "Følg opp tiltak uten aktivitet" : "Behandle forfalt saker",
      icon: AlertTriangle,
      iconColor: "text-red-500",
      path: "/cases",
      highlight: tasks.overdueItems > 0,
      highlightClass: "border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/30",
      countColor: "text-red-600",
    },
    {
      key: "approvals",
      count: tasks.pendingApprovals,
      label: isTiltaksleder ? "Rapporter til gjennomgang" : "Godkjenninger",
      sublabel: isTiltaksleder ? "Må vurderes" : "Venter på deg",
      taskLabel: isTiltaksleder ? "Gjennomgå rapporter" : "Behandle godkjenninger",
      icon: AlertCircle,
      iconColor: "text-orange-500",
      path: "/cases",
      highlight: tasks.pendingApprovals > 0,
      highlightClass: "border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20",
      countColor: "text-primary",
    },
    {
      key: "drafts",
      count: tasks.myDrafts,
      label: isTiltaksleder ? "Tiltak nær rapportfrist" : "Utkast",
      sublabel: isTiltaksleder ? "Neste 72 timer" : "Uferdige rapporter",
      taskLabel: isTiltaksleder ? "Sjekk tiltak nær frist" : "Fullfør utkast i rapporter",
      icon: FileText,
      iconColor: "text-slate-500",
      path: "/cases",
      highlight: false,
      highlightClass: "",
      countColor: "text-primary",
    },
    {
      key: "assigned",
      count: tasks.assignedCases,
      label: isTiltaksleder ? "Deltakere uten kontakt" : "Tildelte saker",
      sublabel: isTiltaksleder ? "Krever oppfølging" : "Aktive",
      taskLabel: isTiltaksleder ? "Kontakt deltakere uten oppfølging" : "Følg opp tildelte saker",
      icon: Briefcase,
      iconColor: "text-blue-500",
      path: "/cases",
      highlight: false,
      highlightClass: "",
      countColor: "text-primary",
    },
  ];

  const visibleTiles = isTiltaksleder ? tiles.filter((t) => t.count > 0) : tiles;

  /* ── Model-ranked task list ── */
  const nowMs = Date.now();
  const pendingTasks = userTasks
    .filter((t) => !t.done && (!t.snoozedUntil || new Date(t.snoozedUntil).getTime() <= nowMs))
    .map((t) => ({ ...t, score: priorityScore(t, tasks) }))
    .sort((a, b) => b.score - a.score);
  const snoozedTasks = userTasks.filter(
    (t) => !t.done && t.snoozedUntil && new Date(t.snoozedUntil).getTime() > nowMs,
  );
  const doneTasks = userTasks.filter((t) => t.done);
  const topScore = pendingTasks[0]?.score ?? 0;
  const todayStr = new Date().toDateString();
  const todayCompleted = doneTasks.filter(
    (t) => new Date(t.updatedAt).toDateString() === todayStr,
  ).length;
  const etaEstimate = etaLabel(prefs);
  const proactiveSuggestions: { title: string; link: { url: string; label: string } }[] =
    inputFocused && !draft.trim() && !draftLink
      ? ([
          tasks.overdueItems > 0
            ? { title: `Behandle ${tasks.overdueItems} forfalt saker`, link: { url: "/cases", label: "Tiltak" } }
            : null,
          tasks.pendingApprovals > 0
            ? { title: `Gjør ${tasks.pendingApprovals} godkjenninger`, link: { url: "/cases", label: "Tiltak" } }
            : null,
          tasks.myDrafts > 0
            ? { title: `Fullfør ${tasks.myDrafts} rapportutkast`, link: { url: "/reports", label: "Rapporter" } }
            : null,
        ].filter((s): s is NonNullable<typeof s> => s !== null))
      : [];

  /* Jaccard-based duplicate guard (threshold: 0.5 token overlap) */
  const duplicateHint =
    draft.trim().length > 3
      ? userTasks.find(
          (t) => !t.done && jaccardSim(draft.trim(), t.title) >= 0.5,
        )
      : null;

  return (
    <Card className="rounded-2xl border-border bg-card shadow-sm">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader className="pb-3">
          <CollapsibleTrigger asChild>
            <button type="button" className="flex w-full items-center justify-between text-left">
              <CardTitle className="flex items-center gap-2 text-lg">
                <CheckCircle className="h-5 w-5 text-primary" />
                {isTiltaksleder ? "Tiltak som krever oppfølging" : "Mine oppgaver"}
                {pendingTasks.length > 0 && (
                  <span className="inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold h-4.5 min-w-[1.125rem] px-1">
                    {pendingTasks.length}
                  </span>
                )}
              </CardTitle>
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform duration-200",
                  open && "rotate-180",
                )}
              />
            </button>
          </CollapsibleTrigger>
          <CardDescription className="flex items-center gap-2">
            {isTiltaksleder ? "Prioritert etter alvorlighet" : "Rangert etter prioritetsmodell"}
            {!isTiltaksleder && topScore > 0 && (
              <span className="text-[10px] text-muted-foreground/60 font-mono">
                topp {topScore}p
              </span>
            )}
            {isPersonalized && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-primary/60">
                <Sparkles className="h-2.5 w-2.5" />
                Personalisert
              </span>
            )}
            {todayCompleted > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-500 dark:text-emerald-400 font-semibold ml-auto">
                <Check className="h-3 w-3" />
                {todayCompleted} i dag
              </span>
            )}
          </CardDescription>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="pt-0 space-y-5">

            {/* ── Status tiles ── */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {visibleTiles.map((tile) => {
                const Icon = tile.icon;
                return (
                  <Button
                    key={tile.key}
                    variant="outline"
                    className={cn(
                      "group relative h-auto flex-col items-start gap-2 p-4 transition-all hover:shadow-md hover:-translate-y-px active:translate-y-0",
                      tile.count === 0 && !isTiltaksleder && "opacity-40",
                      tile.highlight ? tile.highlightClass : "hover:bg-accent",
                    )}
                    onClick={() => navigate(resolveDashboardPath(tile.path))}
                  >
                    <div className="flex w-full items-center justify-between">
                      <span className={cn("text-2xl font-bold tabular-nums", tile.countColor)}>
                        {tile.count}
                      </span>
                      <div className="flex items-center gap-1">
                        {tile.count > 0 && (
                          <button
                            type="button"
                            title="Lag oppgave fra dette"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDraft(tile.taskLabel);
                              setDraftLink({ url: tile.path, label: tile.label });
                              setSuggestedLink(null);
                              setTimeout(() => {
                                inputRef.current?.focus();
                                inputRef.current?.select();
                              }, 30);
                            }}
                            className="hidden group-hover:flex h-5 w-5 items-center justify-center rounded-full bg-background border border-border hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors"
                            aria-label="Lag oppgave fra dette"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        )}
                        <Icon className={cn("h-5 w-5", tile.iconColor)} />
                      </div>
                    </div>
                    <div className="text-left">
                      <div className="font-medium text-sm">{tile.label}</div>
                      <div className="text-xs text-muted-foreground">{tile.sublabel}</div>
                    </div>
                  </Button>
                );
              })}
              {isTiltaksleder && visibleTiles.length === 0 && (
                <p className="col-span-full text-sm text-muted-foreground italic py-2">
                  Ingen akutte oppfølgingspunkter akkurat nå.
                </p>
              )}
            </div>

            {/* ── Divider ── */}
            <div className="border-t border-border/60" />

            {/* ── User task list ── */}
            <div className="space-y-0.5">
              {pendingTasks.map((task, idx) => {
                const level = priorityLevel(task.score);
                const pStyle = PRIORITY_STYLES[level];
                const isTop = idx === 0 && level !== "low" && pendingTasks.length > 1;
                return (
                <div
                  key={task.id}
                  className={cn(
                    "group flex items-center gap-2.5 rounded-lg px-1 py-1.5 hover:bg-accent/50 transition-colors",
                    isTop && pStyle.ring,
                  )}
                >
                  <button
                    type="button"
                    onClick={() => toggleMut.mutate({ id: task.id, done: true })}
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-muted-foreground/40 hover:border-primary hover:bg-primary/10 transition-colors"
                    aria-label="Merk som ferdig"
                  />
                  {editingId === task.id ? (
                    <input
                      autoFocus
                      type="text"
                      value={editTitle}
                      title="Rediger oppgavetittel"
                      aria-label="Rediger oppgavetittel"
                      onChange={(e) => setEditTitle(e.target.value)}
                      onBlur={() => {
                        const t = editTitle.trim();
                        if (t && t !== task.title) renameMut.mutate({ id: task.id, title: t });
                        setEditingId(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      className="flex-1 bg-transparent text-sm outline-none border-b border-primary/50 pb-px"
                    />
                  ) : (
                    <span
                      className="flex-1 text-sm leading-snug cursor-text select-none"
                      onDoubleClick={() => { setEditingId(task.id); setEditTitle(task.title); }}
                      title="Dobbeltklikk for å redigere"
                    >
                      {task.title}
                    </span>
                  )}
                  {/* Priority badge — shown on top task */}
                  {isTop && pStyle.label && editingId !== task.id && (
                    <span
                      className={cn(
                        "hidden group-hover:inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide shrink-0",
                        pStyle.text,
                      )}
                      title={`Prioritetsscore: ${task.score}`}
                    >
                      <span className={cn("inline-block h-1.5 w-1.5 rounded-full", pStyle.dot)} />
                      {pStyle.label}
                    </span>
                  )}
                  {/* Score dot on all non-low tasks */}
                  {!isTop && level !== "low" && editingId !== task.id && (
                    <span
                      className={cn("hidden group-hover:inline-block h-1.5 w-1.5 shrink-0 rounded-full", pStyle.dot)}
                      title={`Prioritet: ${pStyle.label} (${task.score})`}
                    />
                  )}
                  {/* ETA estimate from personal history */}
                  {etaEstimate && editingId !== task.id && (
                    <span
                      title={`Personlig median fullføringstid`}
                      className="hidden group-hover:inline text-[10px] font-mono text-muted-foreground/40 shrink-0"
                    >
                      {etaEstimate}
                    </span>
                  )}
                  {isStale(task, staleDays) && editingId !== task.id && (
                    <span
                      title={`${taskAgeDays(task)} dager gammel`}
                      className="shrink-0 text-amber-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Clock className="h-3 w-3" />
                    </span>
                  )}
                  {task.linkedUrl && editingId !== task.id && (
                    <button
                      type="button"
                      onClick={() => navigate(resolveDashboardPath(task.linkedUrl!))}
                      className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-[11px] text-primary hover:bg-primary/20 transition-colors shrink-0"
                    >
                      <ExternalLink className="h-3 w-3" />
                      {task.linkedLabel ?? "Åpne"}
                    </button>
                  )}
                  {/* Snooze popover */}
                  {editingId !== task.id && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="invisible group-hover:visible flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors"
                          aria-label="Utsett oppgave"
                        >
                          <BellOff className="h-3.5 w-3.5" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-40 p-2 space-y-1">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground px-1 pb-1">
                          Utsett til
                        </p>
                        <button
                          type="button"
                          onClick={() => snoozeMut.mutate({ id: task.id, until: snoozeUntil(1) })}
                          className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors text-left"
                        >
                          I morgen
                        </button>
                        <button
                          type="button"
                          onClick={() => snoozeMut.mutate({ id: task.id, until: snoozeUntil(3) })}
                          className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors text-left"
                        >
                          Om 3 dager
                        </button>
                        <button
                          type="button"
                          onClick={() => snoozeMut.mutate({ id: task.id, until: snoozeUntil(7) })}
                          className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors text-left"
                        >
                          Neste uke
                        </button>
                      </PopoverContent>
                    </Popover>
                  )}
                  <button
                    type="button"
                    onClick={() => deleteMut.mutate(task.id)}
                    className="invisible group-hover:visible flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-destructive transition-colors"
                    aria-label="Slett"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                );
              })}

              {snoozedTasks.length > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground/60 px-1 py-0.5 mt-0.5">
                  <BellOff className="h-3 w-3" />
                  {snoozedTasks.length} utsatt — vises igjen automatisk
                </div>
              )}

              {doneTasks.length > 0 && (
                <div className="mt-1">
                  <button
                    type="button"
                    onClick={() => setDoneOpen((o) => !o)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-1 py-1 rounded"
                  >
                    <ChevronDown
                      className={cn("h-3 w-3 transition-transform duration-150", doneOpen && "rotate-180")}
                    />
                    {doneTasks.length} fullført
                  </button>
                  {doneOpen && (
                    <div className="space-y-0.5 opacity-50 mt-0.5">
                      {doneTasks.map((task) => (
                        <div
                          key={task.id}
                          className="group flex items-center gap-2.5 rounded-lg px-1 py-1.5 hover:bg-accent/30 transition-colors"
                        >
                          <button
                            type="button"
                            onClick={() => toggleMut.mutate({ id: task.id, done: false })}
                            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-primary bg-primary text-white hover:bg-primary/80 transition-colors"
                            aria-label="Marker som ikke ferdig"
                          >
                            <Check className="h-3 w-3" />
                          </button>
                          <span className="flex-1 text-sm leading-snug line-through text-muted-foreground">
                            {task.title}
                          </span>
                          {task.linkedUrl && (
                            <button
                              type="button"
                              onClick={() => navigate(resolveDashboardPath(task.linkedUrl!))}
                              className="inline-flex items-center gap-1 rounded-full bg-muted border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent transition-colors shrink-0"
                            >
                              <ExternalLink className="h-3 w-3" />
                              {task.linkedLabel ?? "Åpne"}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => deleteMut.mutate(task.id)}
                            className="invisible group-hover:visible flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-destructive transition-colors"
                            aria-label="Slett"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {userTasks.length === 0 && (
                <button
                  type="button"
                  onClick={() => inputRef.current?.focus()}
                  className="w-full text-left text-xs text-muted-foreground italic px-1 py-2 rounded-lg hover:bg-accent/40 hover:text-foreground transition-colors"
                >
                  + Legg til det første gjøremålet
                </button>
              )}
            </div>

            {/* ── Undo bar ── */}
            {justCompleted && (
              <div className="flex items-center justify-between rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 px-3 py-1.5">
                <span className="text-sm text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5" />
                  Fullført
                </span>
                <button
                  type="button"
                  onClick={() => {
                    toggleMut.mutate({ id: justCompleted.id, done: false });
                    setJustCompleted(null);
                    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
                  }}
                  className="text-xs text-emerald-700 dark:text-emerald-400 hover:underline font-semibold"
                >
                  Angre
                </button>
              </div>
            )}

            {/* ── Inline create ── */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2.5 rounded-lg border border-dashed border-border/60 px-2 py-1.5 focus-within:border-primary/50 focus-within:bg-accent/20 transition-colors">
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/25" />
                <input
                  ref={inputRef}
                  type="text"
                  value={draft}
                  onFocus={() => setInputFocused(true)}
                  onBlur={() => setTimeout(() => setInputFocused(false), 150)}
                  onChange={(e) => {
                    const val = e.target.value;
                    setDraft(val);
                    if (!draftLink && val.length > 2) {
                      // 1. Try learned preference first
                      const learned = learnedSuggestion(val, prefs);
                      if (learned) {
                        setSuggestedLink({ url: learned.url, label: learned.label, isLearned: true, confidence: learned.confidence });
                        return;
                      }
                      // 2. Fall back to static keyword rules
                      const lower = val.toLowerCase();
                      const match = KEYWORD_LINKS.find(({ keywords }) =>
                        keywords.some((kw) => lower.includes(kw)),
                      );
                      setSuggestedLink(match ? { url: match.preset.url, label: match.preset.label, isLearned: false, confidence: 0 } : null);
                    } else {
                      setSuggestedLink(null);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                    if (e.key === "Escape") { setDraft(""); setDraftLink(null); setSuggestedLink(null); }
                  }}
                  placeholder="Legg til oppgave…"
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/40"
                  disabled={createMut.isPending}
                />
                {draftLink && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-xs text-primary shrink-0">
                    <Link2 className="h-3 w-3" />
                    {draftLink.label}
                    <button
                      type="button"
                      onClick={() => setDraftLink(null)}
                      className="ml-0.5 hover:text-destructive transition-colors"
                      aria-label="Fjern kobling"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        "flex h-6 w-6 items-center justify-center rounded transition-colors",
                        draftLink
                          ? "text-primary bg-primary/10"
                          : "text-muted-foreground hover:text-primary hover:bg-accent",
                      )}
                      title="Koble til side"
                    >
                      <Link2 className="h-3.5 w-3.5" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-56 p-2 space-y-1">
                    {/* Learned favorites section */}
                    {prefs && Object.keys(prefs.linkUsage).length > 0 && (() => {
                      const sorted = Object.entries(prefs.linkUsage)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 3)
                        .map(([url, count]) => ({ url, count, preset: LINK_PRESETS.find((p) => p.url === url) }))
                        .filter((x) => x.preset);
                      if (sorted.length === 0) return null;
                      return (
                        <>
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-primary/60 px-1 pb-0.5 flex items-center gap-1">
                            <Sparkles className="h-3 w-3" /> Dine vanligste
                          </p>
                          {sorted.map(({ url, count, preset }) => (
                            <button
                              key={url}
                              type="button"
                              onClick={() => setDraftLink({ url, label: preset!.label })}
                              className={cn(
                                "w-full flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors text-left",
                                draftLink?.url === url && "bg-primary/10 text-primary",
                              )}
                            >
                              <span className="flex items-center gap-2">
                                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                                {preset!.label}
                              </span>
                              <span className="text-[10px] text-muted-foreground/50 font-mono">{count}x</span>
                            </button>
                          ))}
                          <div className="border-t border-border/50 my-1" />
                        </>
                      );
                    })()}
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground px-1 pb-1">
                      Alle sider
                    </p>
                    {LINK_PRESETS.map((p) => (
                      <button
                        key={p.url}
                        type="button"
                        onClick={() => setDraftLink(draftLink?.url === p.url ? null : p)}
                        className={cn(
                          "w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors text-left",
                          draftLink?.url === p.url && "bg-primary/10 text-primary",
                        )}
                      >
                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                        {p.label}
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>
                {draft.trim() && (
                  <button
                    type="button"
                    onClick={handleCreate}
                    disabled={createMut.isPending}
                    className="flex h-6 w-6 items-center justify-center rounded bg-primary text-white hover:bg-primary/80 transition-colors disabled:opacity-50"
                    aria-label="Lagre oppgave"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {/* Proactive suggestions — shown when input focused + empty */}
              {proactiveSuggestions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-1">
                  {proactiveSuggestions.map((s) => (
                    <button
                      key={s.title}
                      type="button"
                      onClick={() => {
                        setDraft(s.title);
                        setDraftLink(s.link);
                        setSuggestedLink(null);
                        inputRef.current?.focus();
                      }}
                      className="inline-flex items-center gap-1 rounded-full border border-dashed border-primary/30 bg-primary/5 px-2.5 py-1 text-xs text-primary/70 hover:text-primary hover:bg-primary/10 hover:border-primary/50 transition-colors"
                    >
                      <Sparkles className="h-3 w-3" />
                      {s.title}
                    </button>
                  ))}
                </div>
              )}
              {/* Auto-link suggestion */}
              {suggestedLink && !draftLink && (
                <button
                  type="button"
                  onClick={() => { setDraftLink({ url: suggestedLink.url, label: suggestedLink.label }); setSuggestedLink(null); }}
                  className="flex items-center gap-1.5 text-xs text-primary/70 hover:text-primary px-2 transition-colors"
                >
                  {suggestedLink.isLearned ? (
                    <>
                      <Sparkles className="h-3 w-3" />
                      Du kobler vanligvis dette til {suggestedLink.label}
                      <span className="text-[10px] text-muted-foreground/50 font-mono">{suggestedLink.confidence}x</span>
                    </>
                  ) : (
                    <>
                      <Link2 className="h-3 w-3" />
                      Koble til {suggestedLink.label}?
                    </>
                  )}
                </button>
              )}
              {/* Duplicate warning */}
              {duplicateHint && (
                <p className="text-[11px] text-amber-500 dark:text-amber-400 px-2 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  Lignende oppgave finnes allerede: “{duplicateHint.title}”
                </p>
              )}
            </div>

          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
