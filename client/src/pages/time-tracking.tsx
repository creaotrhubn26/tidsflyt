import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Play, Pause, Square, Plus, Clock, Trash2, Edit2, Save, X, CalendarDays, UserX, BarChart3, Lightbulb, Calendar as CalendarIcon, Sparkles } from "lucide-react";
import { PortalLayout } from "@/components/portal/portal-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { format, startOfISOWeek, endOfISOWeek, eachDayOfInterval, isSameDay } from "date-fns";
import { nb } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useSuggestionSettings } from "@/hooks/use-suggestion-settings";
import { useSuggestionVisibility } from "@/hooks/use-suggestion-visibility";
import { BulkTimeEntryModal } from "@/components/bulk-time-entry-modal";
import { useLocation } from "wouter";
import { isSuggestionSurfaceEnabled } from "@/lib/suggestion-settings";

interface TimeEntry {
  id: string;
  userId: string;
  caseNumber: string | null;
  description: string;
  hours: number;
  date: string;
  status: string;
  createdAt: string;
}

interface SuggestionValue<T> {
  value: T;
  confidence: number;
  sampleSize: number;
  reason: string;
}

interface TimeEntrySuggestionsResponse {
  date: string;
  analyzedEntries: number;
  suggestion: {
    project: SuggestionValue<string | null>;
    description: SuggestionValue<string | null>;
    hours: SuggestionValue<number | null>;
    bulkCopyPrevMonth: SuggestionValue<boolean>;
  };
  personalization: {
    totalFeedback: number;
    acceptanceRate: number | null;
    feedbackByType: Record<string, { accepted: number; rejected: number }>;
  };
  policy?: {
    mode: string;
    confidenceThreshold: number;
    source: string;
  };
}

const projectOptions = [
  { id: "general", name: "Generelt arbeid", color: "bg-primary" },
  { id: "development", name: "Utvikling", color: "bg-success" },
  { id: "meeting", name: "Møte", color: "bg-warning" },
  { id: "support", name: "Kundesupport", color: "bg-info" },
  { id: "admin", name: "Administrasjon", color: "bg-muted" },
];

export default function TimeTrackingPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isRunning, setIsRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [taskDescription, setTaskDescription] = useState("");
  const [showManualDialog, setShowManualDialog] = useState(false);
  const [manualHours, setManualHours] = useState("");
  const [manualDescription, setManualDescription] = useState("");
  const [manualProject, setManualProject] = useState("");
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
  const [showBulkDialog, setShowBulkDialog] = useState(false);
  const [bulkGenerationMode, setBulkGenerationMode] = useState<"default" | "copy_previous_month">("default");
  const [showClientSickDialog, setShowClientSickDialog] = useState(false);
  const [clientSickNote, setClientSickNote] = useState("");
  const [selectedDay, setSelectedDay] = useState<{ date: Date; day: string; hours: number; entries: TimeEntry[]; percentage: number } | null>(null);
  
  const timerStartRef = useRef<Date | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const clockIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const prefillAppliedRef = useRef(false);
  
  const { user } = useAuth();
  const { settings: suggestionSettings, blockSuggestionAsync } = useSuggestionSettings();
  const currentUserId = user?.id ?? "default";
  const today = format(new Date(), "yyyy-MM-dd");
  const workflowSuggestionsEnabled = isSuggestionSurfaceEnabled(suggestionSettings, "workflow");

  useEffect(() => {
    clockIntervalRef.current = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => {
      if (clockIntervalRef.current) {
        clearInterval(clockIntervalRef.current);
      }
    };
  }, []);

  const { data: todayEntries = [], isLoading } = useQuery<TimeEntry[]>({
    queryKey: ["/api/time-entries", { startDate: today, endDate: today }],
  });

  const { data: rawSmartSuggestions } = useQuery<TimeEntrySuggestionsResponse | Record<string, unknown>>({
    queryKey: ["/api/time-entries/suggestions", { date: today }],
    staleTime: 45_000,
    enabled: workflowSuggestionsEnabled,
  });

  const smartSuggestions = useMemo<TimeEntrySuggestionsResponse | null>(() => {
    if (!rawSmartSuggestions || typeof rawSmartSuggestions !== "object") {
      return null;
    }
    if (!("suggestion" in rawSmartSuggestions) || typeof rawSmartSuggestions.suggestion !== "object") {
      return null;
    }
    return rawSmartSuggestions as TimeEntrySuggestionsResponse;
  }, [rawSmartSuggestions]);

  const suggestionFeedbackMutation = useMutation({
    mutationFn: async (data: {
      suggestionType: "project" | "description" | "hours" | "bulk_copy_prev_month" | "apply_all" | "manual_prefill";
      outcome: "accepted" | "rejected";
      suggestedValue?: string | null;
      chosenValue?: string | null;
      date?: string | null;
      metadata?: Record<string, unknown>;
    }) => {
      return apiRequest("POST", "/api/time-entries/suggestions/feedback", data);
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: { description: string; hours: number; caseNumber: string | null }) => {
      return apiRequest("POST", "/api/time-entries", {
        userId: currentUserId,
        caseNumber: data.caseNumber,
        description: data.description,
        hours: data.hours,
        date: today,
        status: "pending",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries/suggestions"] });
      toast({ title: "Registrert", description: "Timeregistrering lagret." });
    },
    onError: (error: any) => {
      toast({ title: "Feil", description: error?.message || "Kunne ikke lagre.", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; description?: string; hours?: number }) => {
      return apiRequest("PATCH", `/api/time-entries/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries/suggestions"] });
      setEditingEntry(null);
      toast({ title: "Oppdatert", description: "Endringene er lagret." });
    },
    onError: (error: any) => {
      toast({ title: "Feil", description: error?.message || "Kunne ikke oppdatere.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/time-entries/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries/suggestions"] });
      toast({ title: "Slettet", description: "Registreringen er fjernet." });
    },
    onError: (error: any) => {
      toast({ title: "Feil", description: error?.message || "Kunne ikke slette.", variant: "destructive" });
    },
  });

  useEffect(() => {
    if (isRunning) {
      timerStartRef.current = new Date(Date.now() - elapsedSeconds * 1000);
      intervalRef.current = setInterval(() => {
        if (timerStartRef.current) {
          const now = new Date();
          const diff = Math.floor((now.getTime() - timerStartRef.current.getTime()) / 1000);
          setElapsedSeconds(diff);
        }
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const formatDuration = (hours: number) => {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}t ${m}m`;
  };

  const feedbackLabel = (confidence: number) => `${Math.round(confidence * 100)}%`;

  const sendSuggestionFeedback = useCallback((
    suggestionType: "project" | "description" | "hours" | "bulk_copy_prev_month" | "apply_all" | "manual_prefill",
    outcome: "accepted" | "rejected",
    suggestedValue?: string | null,
    chosenValue?: string | null,
    metadata?: Record<string, unknown>,
  ) => {
    suggestionFeedbackMutation.mutate({
      suggestionType,
      outcome,
      suggestedValue,
      chosenValue,
      date: today,
      metadata,
    });
  }, [suggestionFeedbackMutation, today]);

  useEffect(() => {
    if (typeof window === "undefined" || prefillAppliedRef.current) return;

    const params = new URLSearchParams(window.location.search);
    const prefillProject = params.get("prefillProject");
    const prefillDescription = params.get("prefillDescription");
    const prefillHoursRaw = params.get("prefillHours");
    const openBulk = params.get("openBulk") === "1";
    const bulkMode = params.get("bulkMode") === "copy_previous_month"
      ? "copy_previous_month"
      : "default";

    const hasPrefillParams = Boolean(prefillProject || prefillDescription || prefillHoursRaw || openBulk);
    if (!hasPrefillParams) return;

    prefillAppliedRef.current = true;

    let hasAppliedPrefill = false;

    if (prefillProject && projectOptions.some((project) => project.id === prefillProject)) {
      setSelectedProject(prefillProject);
      sendSuggestionFeedback("project", "accepted", prefillProject, prefillProject, { source: "dashboard_prefill" });
      hasAppliedPrefill = true;
    }

    if (prefillDescription?.trim()) {
      const trimmedDescription = prefillDescription.trim();
      setTaskDescription(trimmedDescription);
      sendSuggestionFeedback("description", "accepted", trimmedDescription, trimmedDescription, { source: "dashboard_prefill" });
      hasAppliedPrefill = true;
    }

    if (prefillHoursRaw != null) {
      const prefillHours = Number(prefillHoursRaw);
      if (Number.isFinite(prefillHours) && prefillHours > 0) {
        setManualHours(String(prefillHours));
        sendSuggestionFeedback("hours", "accepted", String(prefillHours), String(prefillHours), { source: "dashboard_prefill" });
        hasAppliedPrefill = true;
      }
    }

    if (openBulk) {
      setBulkGenerationMode(bulkMode);
      setShowBulkDialog(true);
      sendSuggestionFeedback("bulk_copy_prev_month", "accepted", "open_bulk_modal", "open_bulk_modal", { source: "dashboard_prefill" });
      hasAppliedPrefill = true;
    }

    if (hasAppliedPrefill) {
      sendSuggestionFeedback("apply_all", "accepted", null, "dashboard_prefill", {
        prefillProject: prefillProject || null,
        prefillDescription: prefillDescription || null,
        prefillHours: prefillHoursRaw || null,
        openBulk,
        bulkMode,
      });
    }

    setLocation(window.location.pathname, { replace: true });
  }, [sendSuggestionFeedback, setLocation]);

  const applyProjectSuggestion = () => {
    const suggestedProject = smartSuggestions?.suggestion?.project?.value;
    if (!suggestedProject) return;
    setSelectedProject(suggestedProject);
    sendSuggestionFeedback("project", "accepted", suggestedProject, suggestedProject);
  };

  const applyDescriptionSuggestion = () => {
    const suggestedDescription = smartSuggestions?.suggestion?.description?.value;
    if (!suggestedDescription) return;
    setTaskDescription(suggestedDescription);
    sendSuggestionFeedback("description", "accepted", suggestedDescription, suggestedDescription);
  };

  const applyAllTimerSuggestions = () => {
    const suggestedProject = smartSuggestions?.suggestion?.project?.value || null;
    const suggestedDescription = smartSuggestions?.suggestion?.description?.value || null;
    if (!suggestedProject && !suggestedDescription) {
      toast({ title: "Ingen forslag", description: "Ingen timerforslag tilgjengelig ennå.", variant: "destructive" });
      return;
    }

    if (suggestedProject) {
      setSelectedProject(suggestedProject);
      sendSuggestionFeedback("project", "accepted", suggestedProject, suggestedProject);
    }
    if (suggestedDescription) {
      setTaskDescription(suggestedDescription);
      sendSuggestionFeedback("description", "accepted", suggestedDescription, suggestedDescription);
    }

    sendSuggestionFeedback("apply_all", "accepted", null, "timer_fields_prefilled", {
      appliedProject: suggestedProject,
      appliedDescription: suggestedDescription,
    });

    toast({ title: "Forslag brukt", description: "Prosjekt og beskrivelse er forhåndsutfylt." });
  };

  const applyManualPrefillSuggestion = () => {
    const suggestedProject = smartSuggestions?.suggestion?.project?.value || null;
    const suggestedDescription = smartSuggestions?.suggestion?.description?.value || null;
    const suggestedHours = smartSuggestions?.suggestion?.hours?.value;

    if (suggestedHours == null) {
      toast({ title: "Ingen timeforslag", description: "Ikke nok historikk for timer ennå.", variant: "destructive" });
      return;
    }

    setManualHours(String(suggestedHours));
    setManualDescription(suggestedDescription || "Arbeid");
    setManualProject(suggestedProject || "");
    setShowManualDialog(true);

    sendSuggestionFeedback("hours", "accepted", String(suggestedHours), String(suggestedHours));
    sendSuggestionFeedback("manual_prefill", "accepted", null, "manual_dialog_prefilled", {
      hours: suggestedHours,
      project: suggestedProject,
      description: suggestedDescription,
    });
  };

  const rejectSuggestion = (
    suggestionType: "project" | "description" | "hours" | "bulk_copy_prev_month",
    suggestedValue?: string | null,
  ) => {
    sendSuggestionFeedback(suggestionType, "rejected", suggestedValue || null, null);
    timeSuggestionVisibility.dismiss();
  };

  const neverSuggestAgain = async (
    category: "project" | "description",
    value?: string | null,
  ) => {
    const normalized = value?.trim();
    if (!normalized) return;

    try {
      await blockSuggestionAsync({ category, value: normalized });
      sendSuggestionFeedback(category, "rejected", normalized, null, { neverSuggestAgain: true });
      timeSuggestionVisibility.dismiss();
      toast({
        title: "Blokkert",
        description: "Forslaget blir ikke vist igjen før du fjerner blokkeringen i innstillinger.",
      });
    } catch (error: any) {
      toast({
        title: "Feil",
        description: error?.message || "Kunne ikke lagre blokkering.",
        variant: "destructive",
      });
    }
  };

  const startTimer = () => {
    if (!selectedProject) {
      toast({ title: "Velg prosjekt", description: "Du må velge et prosjekt før du starter timeren.", variant: "destructive" });
      return;
    }
    setIsRunning(true);
  };

  const pauseTimer = () => {
    setIsRunning(false);
  };

  const stopTimer = () => {
    if (elapsedSeconds < 60) {
      toast({ title: "For kort", description: "Timeren må kjøre i minst 1 minutt.", variant: "destructive" });
      return;
    }

    const hours = Math.round((elapsedSeconds / 3600) * 100) / 100;
    const project = projectOptions.find(p => p.id === selectedProject);
    const description = taskDescription || project?.name || "Arbeid";

    createMutation.mutate({
      description,
      hours,
      caseNumber: selectedProject,
    });

    setIsRunning(false);
    setElapsedSeconds(0);
    setTaskDescription("");
    timerStartRef.current = null;
  };

  const handleManualSave = () => {
    const hours = parseFloat(manualHours);
    if (isNaN(hours) || hours <= 0) {
      toast({ title: "Ugyldig tid", description: "Angi et gyldig antall timer.", variant: "destructive" });
      return;
    }
    if (!manualDescription.trim()) {
      toast({ title: "Mangler beskrivelse", description: "Legg til en beskrivelse.", variant: "destructive" });
      return;
    }

    createMutation.mutate({
      description: manualDescription,
      hours,
      caseNumber: manualProject || null,
    });

    setShowManualDialog(false);
    setManualHours("");
    setManualDescription("");
    setManualProject("");
  };

  const handleEditSave = () => {
    if (!editingEntry) return;
    
    updateMutation.mutate({
      id: editingEntry.id,
      description: editingEntry.description,
      hours: editingEntry.hours,
    });
  };

  const handleClientSickSave = () => {
    const note = clientSickNote.trim() || "Klient syk - ingen arbeid utført";
    
    // Create entry with 0 hours (comment only, not counted in totals)
    createMutation.mutate({
      description: `[Klient syk] ${note}`,
      hours: 0, // Zero hours - this is a comment, not billable time
      caseNumber: "client_sick",
    });

    setShowClientSickDialog(false);
    setClientSickNote("");
  };

  const totalToday = todayEntries.reduce((sum, e) => {
    // Don't count "client_sick" entries in the total
    if (e.caseNumber === "client_sick") return sum;
    return sum + e.hours;
  }, 0);

  // View modes
  const [viewMode, setViewMode] = useState<"today" | "weekly" | "calendar" | "analytics">("today");
  const [dateFilter, setDateFilter] = useState<{ from?: Date; to?: Date }>({});
  const [projectFilter, setProjectFilter] = useState<string>("");
  
  // Weekly data computation
  const weeklyData = useMemo(() => {
    const startOfWeek = startOfISOWeek(new Date());
    const endOfWeek = endOfISOWeek(new Date());
    const weekDays = eachDayOfInterval({ start: startOfWeek, end: endOfWeek });
    
    return weekDays.map(day => {
      const dayEntries = todayEntries.filter(e => {
        const entryDate = new Date(e.createdAt);
        return isSameDay(entryDate, day) && e.caseNumber !== "client_sick";
      });
      const hours = dayEntries.reduce((sum, e) => sum + e.hours, 0);
      return {
        date: day,
        day: format(day, "EEEE", { locale: nb }),
        hours,
        entries: dayEntries,
        percentage: Math.min((hours / 8) * 100, 100),
      };
    });
  }, [todayEntries]);

  // Weekly totals
  const weeklyTotal = useMemo(() => weeklyData.reduce((sum, d) => sum + d.hours, 0), [weeklyData]);
  const weeklyAverage = useMemo(() => weeklyTotal / 5, [weeklyTotal]); // 5 work days
  
  // Project breakdown
  const projectBreakdown = useMemo(() => {
    const breakdown: Record<string, number> = {};
    todayEntries.forEach(e => {
      if (e.caseNumber !== "client_sick") {
        const project = projectOptions.find(p => p.id === e.caseNumber)?.name || "Annet";
        breakdown[project] = (breakdown[project] || 0) + e.hours;
      }
    });
    return Object.entries(breakdown)
      .map(([name, hours]) => ({ name, hours, percentage: (hours / totalToday) * 100 }))
      .sort((a, b) => b.hours - a.hours);
  }, [todayEntries]);

  // Filtered entries based on active filters
  const filteredEntries = useMemo(() => {
    let entries = todayEntries;
    if (projectFilter && projectFilter !== "all") {
      entries = entries.filter(e => e.caseNumber === projectFilter);
    }
    if (dateFilter.from) {
      entries = entries.filter(e => new Date(e.createdAt) >= dateFilter.from!);
    }
    if (dateFilter.to) {
      entries = entries.filter(e => new Date(e.createdAt) <= dateFilter.to!);
    }
    return entries;
  }, [todayEntries, projectFilter, dateFilter]);

  const projectSuggestion = smartSuggestions?.suggestion?.project;
  const descriptionSuggestion = smartSuggestions?.suggestion?.description;
  const hoursSuggestion = smartSuggestions?.suggestion?.hours;
  const bulkCopySuggestion = smartSuggestions?.suggestion?.bulkCopyPrevMonth;
  const hasTimeSuggestionCard = Boolean(
    workflowSuggestionsEnabled &&
    smartSuggestions &&
    projectSuggestion &&
    descriptionSuggestion &&
    hoursSuggestion &&
    bulkCopySuggestion,
  );

  const timeSuggestionVisibility = useSuggestionVisibility({
    surface: "time_tracking",
    enabled: hasTimeSuggestionCard,
    frequency: suggestionSettings.frequency,
    scopeKey: smartSuggestions?.date || today,
  });

  const calendarSuggestionVisibility = useSuggestionVisibility({
    surface: "time_calendar",
    enabled: workflowSuggestionsEnabled && !!bulkCopySuggestion?.value,
    frequency: suggestionSettings.frequency,
    scopeKey: smartSuggestions?.date || today,
  });

  const suggestedProjectLabel = useMemo(() => {
    const suggestionProjectId = projectSuggestion?.value;
    if (!suggestionProjectId) return "Ingen forslag ennå";
    return projectOptions.find((project) => project.id === suggestionProjectId)?.name || suggestionProjectId;
  }, [projectSuggestion]);

  return (
    <PortalLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold" data-testid="time-tracking-title">Timeføring</h1>
          <p className="text-muted-foreground mt-1">Registrer og administrer arbeidstid</p>
        </div>

        {/* Weekly Summary Overview */}
        <Card className="bg-gradient-to-br from-slate-50 to-slate-100/50 border-slate-200/60 dark:from-slate-900/40 dark:to-slate-800/20 dark:border-slate-700/40">
          <CardContent className="p-6">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-slate-600 dark:text-slate-400" />
              Uke {format(new Date(), "w")} - {weeklyTotal.toFixed(1)}t / 40t
            </h3>
            <div className="grid grid-cols-5 gap-2">
              {weeklyData.map((day) => (
                <div
                  key={day.date.toISOString()}
                  className="text-center p-3 rounded-lg bg-white/60 dark:bg-card/60 hover:bg-white dark:hover:bg-card transition-colors cursor-pointer group"
                  onClick={() => setSelectedDay(day)}
                >
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{day.day.slice(0, 3)}</p>
                    <div className="h-1.5 bg-slate-200/60 dark:bg-slate-700/40 rounded-full mb-2 overflow-hidden">
                      <progress
                        value={day.percentage}
                        max={100}
                        aria-label={`${day.day} andel`}
                        className="h-full w-full bar-pct bar-pct-blue-cyan"
                      />
                  </div>
                  <p className="text-sm font-mono font-medium">{day.hours.toFixed(1)}t</p>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-slate-200/60 dark:border-border flex items-center justify-between text-sm">
              <div>
                <p className="text-slate-600 dark:text-muted-foreground">Gjennomsnitt per dag:</p>
                <p className="font-mono font-medium">{weeklyAverage.toFixed(2)} timer</p>
              </div>
              <Badge variant="outline" className={weeklyTotal >= 40 ? "bg-green-50 border-green-200 dark:bg-green-950/40 dark:border-green-800/50 dark:text-green-400" : "bg-orange-50 border-orange-200 dark:bg-orange-950/40 dark:border-orange-800/50 dark:text-orange-400"}>
                {weeklyTotal >= 40 ? "✓ Mål nådd" : `${(40 - weeklyTotal).toFixed(1)}t igjen`}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* View Mode Tabs */}
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="today">I dag</TabsTrigger>
            <TabsTrigger value="weekly">Uke</TabsTrigger>
            <TabsTrigger value="analytics">Statistikk</TabsTrigger>
            <TabsTrigger value="calendar">Kalender</TabsTrigger>
          </TabsList>

          {/* TODAY VIEW */}
          <TabsContent value="today" className="space-y-6 mt-6">
            {timeSuggestionVisibility.isVisible && smartSuggestions && projectSuggestion && descriptionSuggestion && hoursSuggestion && bulkCopySuggestion && (
              <Card className="border-primary/25 bg-gradient-to-br from-primary/5 to-transparent" data-testid="time-suggestions-card">
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <h3 className="font-semibold flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        Personlige forslag
                      </h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        Basert på {smartSuggestions.analyzedEntries} tidligere føringer.
                      </p>
                    </div>
                    {smartSuggestions.personalization.totalFeedback > 0 && (
                      <Badge variant="secondary">
                        Treffrate: {smartSuggestions.personalization.acceptanceRate != null ? `${Math.round(smartSuggestions.personalization.acceptanceRate * 100)}%` : "–"}
                      </Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="rounded-md border bg-background/70 p-3 space-y-2" data-testid="suggestion-project">
                      <p className="text-xs text-muted-foreground">Prosjekt</p>
                      <p className="font-medium">{suggestedProjectLabel}</p>
                      <p className="text-xs text-muted-foreground">{projectSuggestion.reason}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-muted-foreground">Sikkerhet: {feedbackLabel(projectSuggestion.confidence)}</span>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={!projectSuggestion.value}
                            onClick={applyProjectSuggestion}
                            data-testid="suggestion-project-apply"
                          >
                            Bruk
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => rejectSuggestion("project", projectSuggestion.value || null)}
                            data-testid="suggestion-project-reject"
                          >
                            Ikke nå
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              void neverSuggestAgain("project", projectSuggestion.value || null);
                            }}
                            disabled={!projectSuggestion.value}
                            data-testid="suggestion-project-never"
                          >
                            Aldri
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-md border bg-background/70 p-3 space-y-2" data-testid="suggestion-description">
                      <p className="text-xs text-muted-foreground">Beskrivelse</p>
                      <p className="font-medium line-clamp-2">{descriptionSuggestion.value || "Ingen forslag ennå"}</p>
                      <p className="text-xs text-muted-foreground">{descriptionSuggestion.reason}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-muted-foreground">Sikkerhet: {feedbackLabel(descriptionSuggestion.confidence)}</span>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={!descriptionSuggestion.value}
                            onClick={applyDescriptionSuggestion}
                            data-testid="suggestion-description-apply"
                          >
                            Bruk
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => rejectSuggestion("description", descriptionSuggestion.value || null)}
                            data-testid="suggestion-description-reject"
                          >
                            Ikke nå
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              void neverSuggestAgain("description", descriptionSuggestion.value || null);
                            }}
                            disabled={!descriptionSuggestion.value}
                            data-testid="suggestion-description-never"
                          >
                            Aldri
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-md border bg-background/70 p-3 space-y-2" data-testid="suggestion-hours">
                      <p className="text-xs text-muted-foreground">Timer</p>
                      <p className="font-medium">{hoursSuggestion.value != null ? `${hoursSuggestion.value} timer` : "Ingen forslag ennå"}</p>
                      <p className="text-xs text-muted-foreground">{hoursSuggestion.reason}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-muted-foreground">Sikkerhet: {feedbackLabel(hoursSuggestion.confidence)}</span>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={hoursSuggestion.value == null}
                            onClick={applyManualPrefillSuggestion}
                            data-testid="suggestion-hours-apply"
                          >
                            Manuell
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => rejectSuggestion("hours", hoursSuggestion.value != null ? String(hoursSuggestion.value) : null)}
                            data-testid="suggestion-hours-reject"
                          >
                            Ikke nå
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <Button size="sm" onClick={applyAllTimerSuggestions} data-testid="suggestion-apply-all">
                      Bruk forslag i timer
                    </Button>
                    {bulkCopySuggestion.value && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setBulkGenerationMode("copy_previous_month");
                          setShowBulkDialog(true);
                          sendSuggestionFeedback("bulk_copy_prev_month", "accepted", "open_bulk_modal", "open_bulk_modal");
                        }}
                        data-testid="suggestion-open-bulk-copy"
                      >
                        Kopier forrige måned
                      </Button>
                    )}
                    {!bulkCopySuggestion.value && (
                      <span className="text-xs text-muted-foreground">
                        Ingen føringer i forrige måned å kopiere fra.
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="overflow-visible" data-testid="timer-card">
          <CardContent className="p-6 md:p-8">
            <div className="flex flex-col items-center gap-6">
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-1" data-testid="current-date">
                  {format(currentTime, "EEEE d. MMMM yyyy", { locale: nb })}
                </p>
                <div 
                  className="text-5xl md:text-6xl font-mono font-bold tracking-tight text-foreground" 
                  data-testid="live-clock"
                >
                  {format(currentTime, "HH:mm:ss", { locale: nb })}
                </div>
              </div>

              {(isRunning || elapsedSeconds > 0) && (
                <div className="text-center">
                  <p className="text-xs text-muted-foreground mb-1">Arbeidstid</p>
                  <div 
                    className={cn(
                      "text-3xl md:text-4xl font-mono font-bold tracking-tight transition-colors",
                      isRunning && "text-success"
                    )} 
                    data-testid="timer-display"
                  >
                    {formatTime(elapsedSeconds)}
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-4 w-full max-w-xl">
                <Select value={selectedProject} onValueChange={setSelectedProject}>
                  <SelectTrigger className="flex-1" data-testid="project-select">
                    <SelectValue placeholder="Velg prosjekt" />
                  </SelectTrigger>
                  <SelectContent>
                    {projectOptions.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        <div className="flex items-center gap-2">
                          <div className={cn("w-2 h-2 rounded-full", project.color)} />
                          {project.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Input
                  placeholder="Hva jobber du med?"
                  value={taskDescription}
                  onChange={(e) => setTaskDescription(e.target.value)}
                  className="flex-1"
                  data-testid="task-input"
                />
              </div>

              <div className="flex gap-3">
                {!isRunning ? (
                  <Button
                    size="lg"
                    className="w-16 h-16 rounded-full bg-success hover:bg-success/90"
                    onClick={startTimer}
                    data-testid="timer-start"
                  >
                    <Play className="h-6 w-6 ml-1" />
                  </Button>
                ) : (
                  <>
                    <Button
                      size="lg"
                      className="w-16 h-16 rounded-full bg-warning hover:bg-warning/90"
                      onClick={pauseTimer}
                      data-testid="timer-pause"
                    >
                      <Pause className="h-6 w-6" />
                    </Button>
                    <Button
                      size="lg"
                      variant="destructive"
                      className="w-16 h-16 rounded-full"
                      onClick={stopTimer}
                      disabled={createMutation.isPending}
                      data-testid="timer-stop"
                    >
                      <Square className="h-5 w-5" />
                    </Button>
                  </>
                )}
              </div>

              {isRunning && (
                <Badge variant="outline" className="text-sm py-1 px-3">
                  <Clock className="h-3 w-3 mr-1" />
                  Timer kjører - {projectOptions.find(p => p.id === selectedProject)?.name || "Ingen prosjekt valgt"}
                </Badge>
              )}
            </div>
          </CardContent>
            </Card>

            <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold">Dagens registreringer</h2>
            <p className="text-sm text-muted-foreground">
              Totalt: <span className="font-mono font-medium text-foreground">{formatDuration(totalToday)}</span>
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => setShowClientSickDialog(true)} data-testid="add-client-sick">
              <UserX className="h-4 w-4 mr-2" />
              Klient syk
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setBulkGenerationMode("default");
                setShowBulkDialog(true);
              }}
              data-testid="add-bulk-entry"
            >
              <CalendarDays className="h-4 w-4 mr-2" />
              Fyll ut måned
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowManualDialog(true)} data-testid="add-manual-entry">
              <Plus className="h-4 w-4 mr-2" />
              Legg til manuelt
            </Button>
            </div>
              </div>

              {/* Filters */}
              <div className="flex items-center gap-3 flex-wrap">
                <Select value={projectFilter} onValueChange={setProjectFilter}>
                  <SelectTrigger className="w-[180px]" data-testid="project-filter">
                    <SelectValue placeholder="Alle prosjekt" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle prosjekt</SelectItem>
                    {projectOptions.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        <div className="flex items-center gap-2">
                          <div className={cn("w-2 h-2 rounded-full", p.color)} />
                          {p.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="date"
                  className="w-[160px]"
                  value={dateFilter.from ? format(dateFilter.from, "yyyy-MM-dd") : ""}
                  onChange={(e) => setDateFilter(prev => ({ ...prev, from: e.target.value ? new Date(e.target.value) : undefined }))}
                  placeholder="Fra dato"
                  data-testid="date-filter-from"
                />
                <Input
                  type="date"
                  className="w-[160px]"
                  value={dateFilter.to ? format(dateFilter.to, "yyyy-MM-dd") : ""}
                  onChange={(e) => setDateFilter(prev => ({ ...prev, to: e.target.value ? new Date(e.target.value) : undefined }))}
                  placeholder="Til dato"
                  data-testid="date-filter-to"
                />
                {((projectFilter && projectFilter !== "all") || dateFilter.from || dateFilter.to) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setProjectFilter(""); setDateFilter({}); }}
                    data-testid="clear-filters"
                  >
                    <X className="h-3 w-3 mr-1" />
                    Nullstill
                  </Button>
                )}
              </div>

              <div className="space-y-3">
                {isLoading ? (
                  <Card>
                    <CardContent className="p-6 text-center text-muted-foreground">
                      Laster registreringer...
                    </CardContent>
                  </Card>
                ) : filteredEntries.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 px-4">
                    {((projectFilter && projectFilter !== "all") || dateFilter.from || dateFilter.to) ? (
                      <>
                        <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-muted/60 border border-border mb-4">
                          <Clock className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <h3 className="text-base font-semibold mb-1">Ingen treff med valgte filtre</h3>
                        <p className="text-sm text-muted-foreground text-center max-w-xs">Prøv å endre eller nullstille filtrene.</p>
                      </>
                    ) : (
                      <>
                        <div className="relative mb-6">
                          <div className="absolute inset-0 rounded-full bg-primary/20 blur-2xl scale-150" />
                          <div className="relative flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-indigo-500/20 border border-primary/20 shadow-lg">
                            <Clock className="h-7 w-7 text-primary" />
                          </div>
                        </div>
                        <h3 className="text-xl font-semibold mb-2">Ingen registreringer i dag</h3>
                        <p className="text-sm text-muted-foreground text-center max-w-xs mb-6">Start timeren eller legg til en manuell registrering for å begynne å spore tid.</p>
                        <div className="flex flex-wrap justify-center gap-2">
                          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-xs font-medium text-primary">
                            <Play className="h-3.5 w-3.5" />
                            Start timer
                          </div>
                          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20 text-xs font-medium text-green-700 dark:text-green-400">
                            <CalendarDays className="h-3.5 w-3.5" />
                            Manuell registrering
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  filteredEntries
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                    .map((entry) => {
                      const project = projectOptions.find(p => p.id === entry.caseNumber);
                      const isEditing = editingEntry?.id === entry.id;
                      
                      return (
                        <Card key={entry.id} className="overflow-visible" data-testid={`time-entry-${entry.id}`}>
                          <CardContent className="p-4">
                            <div className="flex items-start gap-4">
                              <div className={cn("w-1 h-full min-h-[60px] rounded-full flex-shrink-0", project?.color || "bg-muted")} />
                              
                              <div className="flex-1 min-w-0">
                                {isEditing ? (
                                  <div className="space-y-2">
                                    <Input
                                      value={editingEntry.description}
                                      onChange={(e) => setEditingEntry({ ...editingEntry, description: e.target.value })}
                                      data-testid="edit-description"
                                    />
                                    <div className="flex gap-2 items-center">
                                      <Input
                                        type="number"
                                        step="0.25"
                                        value={editingEntry.hours}
                                        onChange={(e) => setEditingEntry({ ...editingEntry, hours: parseFloat(e.target.value) || 0 })}
                                        className="w-24"
                                        data-testid="edit-hours"
                                      />
                                      <span className="text-sm text-muted-foreground">timer</span>
                                    </div>
                                  </div>
                                ) : (
                                  <div>
                                    <p className="font-medium">{entry.description}</p>
                                    <p className="text-sm text-muted-foreground">{project?.name || "Annet"}</p>
                                  </div>
                                )}
                              </div>
                              
                              <div className="text-right flex-shrink-0">
                                {!isEditing && (
                                  <>
                                    <p className="font-mono font-medium">{formatDuration(entry.hours)}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {format(new Date(entry.createdAt), "HH:mm", { locale: nb })}
                                    </p>
                                  </>
                                )}
                              </div>

                              <div className="flex gap-1 flex-shrink-0">
                                {isEditing ? (
                                  <>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      onClick={handleEditSave}
                                      disabled={updateMutation.isPending}
                                      data-testid="save-edit"
                                    >
                                      <Save className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      onClick={() => setEditingEntry(null)}
                                      data-testid="cancel-edit"
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </>
                                ) : (
                                  <>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      onClick={() => setEditingEntry(entry)}
                                      data-testid={`edit-entry-${entry.id}`}
                                    >
                                      <Edit2 className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      onClick={() => deleteMutation.mutate(entry.id)}
                                      disabled={deleteMutation.isPending}
                                      data-testid={`delete-entry-${entry.id}`}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })
                )}
              </div>
            </TabsContent>

          {/* WEEKLY VIEW */}
          <TabsContent value="weekly" className="space-y-6 mt-6">
            <Card className="bg-gradient-to-br from-blue-50 to-cyan-50/50 border-blue-200/60 dark:from-blue-950/40 dark:to-cyan-950/20 dark:border-blue-800/40">
              <CardContent className="p-6">
                <h3 className="font-semibold mb-4">Ukeoversikt</h3>
                <div className="space-y-3">
                  {weeklyData.map((day) => (
                    <div key={day.date.toISOString()} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="font-medium">{format(day.date, "EEEE d. MMMM", { locale: nb })}</p>
                        <span className="text-sm font-mono font-medium">{day.hours.toFixed(1)}t</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-slate-200/60 dark:bg-slate-700/40 rounded-full overflow-hidden">
                          <progress
                            value={day.percentage}
                            max={100}
                            aria-label={`${day.day} andel`}
                            className="h-full w-full bar-pct bar-pct-purple-pink"
                          />
                        </div>
                        <span className="text-xs text-muted-foreground w-8 text-right">{day.percentage.toFixed(0)}%</span>
                      </div>
                      {day.entries.length > 0 && (
                        <div className="text-xs text-muted-foreground space-y-1 mt-2">
                          {day.entries.map((e) => (
                            <div key={e.id} className="flex justify-between">
                              <span>{e.description}</span>
                              <span className="font-mono">{formatDuration(e.hours)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ANALYTICS VIEW */}
          <TabsContent value="analytics" className="space-y-6 mt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Project Breakdown */}
              <Card className="bg-gradient-to-br from-emerald-50 to-teal-50/50 border-emerald-200/60 dark:from-emerald-950/40 dark:to-teal-950/20 dark:border-emerald-800/40">
                <CardContent className="p-6">
                  <h3 className="font-semibold mb-4 flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    Etter prosjekt
                  </h3>
                  <div className="space-y-3">
                    {projectBreakdown.length > 0 ? (
                      projectBreakdown.map((p) => (
                        <div key={p.name} className="space-y-1">
                          <div className="flex justify-between items-center text-sm">
                            <span className="font-medium">{p.name}</span>
                            <span className="font-mono">{p.hours.toFixed(1)}t</span>
                          </div>
                          <div className="h-2 bg-slate-200/60 dark:bg-slate-700/40 rounded-full overflow-hidden">
                            <progress
                              value={p.percentage}
                              max={100}
                              aria-label={`${p.name} andel`}
                              className="h-full w-full bar-pct bar-pct-emerald-teal"
                            />
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="flex flex-col items-center py-4 text-muted-foreground">
                        <BarChart3 className="h-8 w-8 mb-2 opacity-30" />
                        <p className="text-sm">Ingen data for dag</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Insights */}
              <Card className="bg-gradient-to-br from-amber-50 to-orange-50/50 border-amber-200/60 dark:from-amber-950/40 dark:to-orange-950/20 dark:border-amber-800/40">
                <CardContent className="p-6">
                  <h3 className="font-semibold mb-4 flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    Innsikter
                  </h3>
                  <div className="space-y-3 text-sm">
                    {totalToday >= 8 && (
                      <div className="p-2 bg-green-100/50 border border-green-200/60 rounded text-green-700 text-xs dark:bg-green-950/30 dark:border-green-900/40 dark:text-green-400">
                        ✓ Dagens målsetting nådd ({totalToday.toFixed(1)}t)
                      </div>
                    )}
                    {totalToday < 8 && (
                      <div className="p-2 bg-blue-100/50 border border-blue-200/60 rounded text-blue-700 text-xs dark:bg-blue-950/30 dark:border-blue-900/40 dark:text-blue-400">
                        Info: {(8 - totalToday).toFixed(1)}t igjen for å nå dagens målsetting
                      </div>
                    )}
                    {weeklyTotal >= 40 && (
                      <div className="p-2 bg-green-100/50 border border-green-200/60 rounded text-green-700 text-xs dark:bg-green-950/30 dark:border-green-900/40 dark:text-green-400">
                        ✓ Ukemålsetting allerede nådd ({weeklyTotal.toFixed(1)}t)
                      </div>
                    )}
                    {projectBreakdown.length > 1 && (
                      <div className="p-2 bg-slate-100/50 border border-slate-200/60 rounded text-slate-700 text-xs dark:bg-slate-800/40 dark:border-slate-700/40 dark:text-slate-400">
                        Du arbeider på {projectBreakdown.length} prosjekt(er) i dag
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* CALENDAR VIEW */}
          <TabsContent value="calendar" className="space-y-6 mt-6">
            {calendarSuggestionVisibility.isVisible && smartSuggestions?.suggestion.bulkCopyPrevMonth && (
              <Card className="border-primary/25 bg-gradient-to-br from-primary/5 to-transparent">
                <CardContent className="p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold">Månedsforslag</p>
                    <p className="text-xs text-muted-foreground">{smartSuggestions.suggestion.bulkCopyPrevMonth.reason}</p>
                    <p className="text-[11px] text-muted-foreground">
                      Sikkerhet: {Math.round(smartSuggestions.suggestion.bulkCopyPrevMonth.confidence * 100)}%
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setBulkGenerationMode("copy_previous_month");
                      setShowBulkDialog(true);
                      sendSuggestionFeedback("bulk_copy_prev_month", "accepted", "open_bulk_modal", "open_bulk_modal", {
                        source: "calendar_tab",
                      });
                    }}
                    data-testid="calendar-suggestion-open-bulk-copy"
                  >
                    Kopier og tilpass måned
                  </Button>
                </CardContent>
              </Card>
            )}
            <Card className="bg-gradient-to-br from-purple-50 to-pink-50/50 dark:from-purple-950/40 dark:to-pink-950/20 border-purple-200/60 dark:border-purple-800/40">
              <CardContent className="p-6">
                <h3 className="font-semibold mb-4">Kalender (30 siste dager)</h3>
                <div className="text-sm text-muted-foreground">
                  <p className="mb-3">Gjennomsnittlig timer per dag de siste 30 dagene:</p>
                  <div className="p-3 bg-white/60 dark:bg-card/60 rounded-lg font-mono text-foreground">
                    7.2t / dag - Totalt: 216t
                  </div>
                  <p className="text-xs mt-4">Kalendervisning kommer snart med avansert tidslinjegraf</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

      <BulkTimeEntryModal
        open={showBulkDialog}
        onOpenChange={setShowBulkDialog}
        userId={currentUserId}
        initialGenerationMode={bulkGenerationMode}
      />

      <Dialog open={showManualDialog} onOpenChange={setShowManualDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Legg til manuell registrering</DialogTitle>
            <DialogDescription>
              Registrer timer manuelt for dagens dato.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="manual-hours">Antall timer</Label>
              <Input
                id="manual-hours"
                type="number"
                step="0.25"
                min="0"
                value={manualHours}
                onChange={(e) => setManualHours(e.target.value)}
                placeholder="F.eks. 2.5"
                data-testid="manual-hours"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="manual-project">Prosjekt</Label>
              <Select value={manualProject} onValueChange={setManualProject}>
                <SelectTrigger data-testid="manual-project-select">
                  <SelectValue placeholder="Velg prosjekt (valgfritt)" />
                </SelectTrigger>
                <SelectContent>
                  {projectOptions.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      <div className="flex items-center gap-2">
                        <div className={cn("w-2 h-2 rounded-full", project.color)} />
                        {project.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="manual-description">Beskrivelse</Label>
              <Input
                id="manual-description"
                value={manualDescription}
                onChange={(e) => setManualDescription(e.target.value)}
                placeholder="Hva jobbet du med?"
                data-testid="manual-description"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowManualDialog(false)}>
              Avbryt
            </Button>
            <Button onClick={handleManualSave} disabled={createMutation.isPending} data-testid="save-manual-entry">
              {createMutation.isPending ? "Lagrer..." : "Lagre"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showClientSickDialog} onOpenChange={setShowClientSickDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserX className="h-5 w-5" />
              Klient syk
            </DialogTitle>
            <DialogDescription>
              Registrer at klienten var syk. Dette teller ikke som arbeidstid med mindre noe annet er avtalt.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="client-sick-note">Notat (valgfritt)</Label>
              <Input
                id="client-sick-note"
                value={clientSickNote}
                onChange={(e) => setClientSickNote(e.target.value)}
                placeholder="F.eks. Avlyst pga. sykdom"
                data-testid="client-sick-note"
              />
            </div>
            <div className="p-3 bg-muted/50 rounded-md text-sm text-muted-foreground">
              Denne registreringen vil vises i timelisten som en kommentar, men vil ikke telle i timeantallet.
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClientSickDialog(false)}>
              Avbryt
            </Button>
            <Button onClick={handleClientSickSave} disabled={createMutation.isPending} data-testid="save-client-sick">
              {createMutation.isPending ? "Lagrer..." : "Registrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>

      {/* Day Summary Dialog */}
      <Dialog open={!!selectedDay} onOpenChange={(open) => !open && setSelectedDay(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5 text-muted-foreground" />
              {selectedDay && format(selectedDay.date, "EEEE d. MMMM yyyy", { locale: nb })}
            </DialogTitle>
            <DialogDescription>
              {selectedDay && `${selectedDay.hours.toFixed(1)}t av 8t \u2013 ${selectedDay.percentage.toFixed(0)}% av dagsmålet`}
            </DialogDescription>
          </DialogHeader>

          {selectedDay && (
            <div className="space-y-4">
              {/* Progress bar */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Fremgang</span>
                  <span>{selectedDay.hours.toFixed(1)}t / 8t</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      selectedDay.percentage >= 100 ? "bg-green-500" : "bg-primary"
                    )}
                    style={{ width: `${Math.min(selectedDay.percentage, 100)}%` }}
                  />
                </div>
              </div>

              {/* Entry list */}
              <div className="space-y-2">
                <p className="text-sm font-medium">Registreringer ({selectedDay.entries.length})</p>
                {selectedDay.entries.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground text-sm">
                    <CalendarDays className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    Ingen timer registrert denne dagen
                  </div>
                ) : (
                  <div className="divide-y divide-border rounded-md border">
                    {selectedDay.entries.map((entry) => {
                      const project = projectOptions.find((p) => p.id === entry.caseNumber);
                      return (
                        <div key={entry.id} className="flex items-center justify-between px-3 py-2.5 text-sm">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{entry.description || "Ingen beskrivelse"}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {project?.name ?? entry.caseNumber ?? "Annet"}
                            </p>
                          </div>
                          <span className="font-mono text-sm ml-3 shrink-0">{formatDuration(entry.hours)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Total row */}
              {selectedDay.entries.length > 0 && (
                <div className="flex justify-between items-center pt-2 border-t text-sm font-semibold">
                  <span>Totalt</span>
                  <span className="font-mono">{formatDuration(selectedDay.hours)}</span>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedDay(null)}>Lukk</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PortalLayout>
  );
}
