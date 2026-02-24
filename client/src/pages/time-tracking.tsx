import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Play, Plus, Clock, Trash2, Edit2, Save, X, CalendarDays, UserX, BarChart3, Lightbulb, Calendar as CalendarIcon, Sparkles, CheckCircle2, ChevronDown, ChevronRight, User, MapPin, MessageSquare, Circle } from "lucide-react";
import { PortalLayout } from "@/components/portal/portal-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { format, startOfISOWeek, endOfISOWeek, eachDayOfInterval, isSameDay, subDays } from "date-fns";
import { nb } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useSuggestionSettings } from "@/hooks/use-suggestion-settings";
import { useSuggestionVisibility } from "@/hooks/use-suggestion-visibility";
import { BulkTimeEntryModal } from "@/components/bulk-time-entry-modal";
import { useLocation } from "wouter";
import { isSuggestionSurfaceEnabled } from "@/lib/suggestion-settings";
import { normalizeRole } from "@shared/roles";

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

interface CompanyUserAssignedCase {
  id: number;
  case_id: string | null;
  case_title: string | null;
  status: string | null;
}

interface AssignedCaseOption {
  id: string;
  name: string;
}

type WorkTypeEntryMode = "timer_or_manual" | "manual_only";

interface WorkTypeOption {
  id: string;
  name: string;
  color: string;
  entryMode: WorkTypeEntryMode;
}

interface WorkTypeSettingsResponse {
  role: string;
  timeTrackingEnabled: boolean;
  workTypes: WorkTypeOption[];
}

export default function TimeTrackingPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isRunning, setIsRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [selectedWorkType, setSelectedWorkType] = useState<string>("");
  const [taskDescription, setTaskDescription] = useState("");
  const [showManualDialog, setShowManualDialog] = useState(false);
  const [manualHours, setManualHours] = useState("");
  const [manualDescription, setManualDescription] = useState("");
  const [manualProject, setManualProject] = useState("");
  const [manualWorkType, setManualWorkType] = useState<string>("");
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
  const normalizedRole = normalizeRole(user?.role);
  const currentUserId = user?.id ?? "default";
  const today = format(new Date(), "yyyy-MM-dd");
  const thirtyDaysAgo = format(subDays(new Date(), 29), "yyyy-MM-dd");
  const workflowSuggestionsEnabled = isSuggestionSurfaceEnabled(suggestionSettings, "workflow");

  useEffect(() => {
    clockIntervalRef.current = setInterval(() => {
      setCurrentTime(new Date());
    }, 200);

    return () => {
      if (clockIntervalRef.current) {
        clearInterval(clockIntervalRef.current);
      }
    };
  }, []);

  const { data: todayEntries = [], isLoading } = useQuery<TimeEntry[]>({
    queryKey: ["/api/time-entries", { startDate: today, endDate: today }],
  });

  const { data: last30DaysEntries = [], isLoading: isLoadingLast30Days } = useQuery<TimeEntry[]>({
    queryKey: ["/api/time-entries", { startDate: thirtyDaysAgo, endDate: today }],
  });

  const { data: workTypeSettingsData } = useQuery<WorkTypeSettingsResponse>({
    queryKey: ["/api/time-tracking/work-types"],
  });

  const workTypeOptions = useMemo(
    () => (Array.isArray(workTypeSettingsData?.workTypes) ? workTypeSettingsData.workTypes : []),
    [workTypeSettingsData],
  );

  const isTimeTrackingEnabledForRole = useMemo(() => {
    if (typeof workTypeSettingsData?.timeTrackingEnabled === "boolean") {
      return workTypeSettingsData.timeTrackingEnabled;
    }
    return normalizedRole !== "tiltaksleder";
  }, [normalizedRole, workTypeSettingsData]);

  const { data: assignedCasesData = [], isLoading: isLoadingAssignedCases } = useQuery<CompanyUserAssignedCase[]>({
    queryKey: ["/api/company/me/assigned-cases", { company_id: "1" }],
    enabled: Boolean(user?.email),
  });

  const safeTodayEntries = useMemo(
    () => (Array.isArray(todayEntries) ? todayEntries : []),
    [todayEntries],
  );
  const safeLast30DaysEntries = useMemo(
    () => (Array.isArray(last30DaysEntries) ? last30DaysEntries : []),
    [last30DaysEntries],
  );
  const safeAssignedCasesData = useMemo(
    () => (Array.isArray(assignedCasesData) ? assignedCasesData : []),
    [assignedCasesData],
  );

  const assignedCaseOptions = useMemo<AssignedCaseOption[]>(() => {
    const options = safeAssignedCasesData
      .filter((assignedCase) => {
        const normalizedStatus = (assignedCase.status || "active").toLowerCase();
        return normalizedStatus !== "inactive";
      })
      .map((assignedCase) => {
        const caseId = (assignedCase.case_id || "").trim();
        const caseTitle = (assignedCase.case_title || "").trim();
        if (!caseId && !caseTitle) return null;

        return {
          id: caseId || `case-${assignedCase.id}`,
          name: caseTitle || caseId,
        };
      })
      .filter((option): option is AssignedCaseOption => Boolean(option));

    return options.filter(
      (option, index, array) => array.findIndex((candidate) => candidate.id === option.id) === index,
    );
  }, [safeAssignedCasesData]);

  const workTypeById = useMemo(
    () => new Map(workTypeOptions.map((workType) => [workType.id, workType])),
    [workTypeOptions],
  );

  useEffect(() => {
    if (workTypeOptions.length === 0) {
      if (selectedWorkType) setSelectedWorkType("");
      if (manualWorkType) setManualWorkType("");
      return;
    }

    if (!selectedWorkType || !workTypeById.has(selectedWorkType)) {
      setSelectedWorkType(workTypeOptions[0].id);
    }

    if (!manualWorkType || !workTypeById.has(manualWorkType)) {
      setManualWorkType(workTypeOptions[0].id);
    }
  }, [manualWorkType, selectedWorkType, workTypeById, workTypeOptions]);

  const resolveCaseLabel = useCallback((caseNumber?: string | null) => {
    if (!caseNumber) return "Uten sak";
    if (caseNumber === "client_sick") return "Klient syk";

    const assignedCase = assignedCaseOptions.find((option) => option.id === caseNumber);
    if (assignedCase) return assignedCase.name;

    const workType = workTypeById.get(caseNumber);
    if (workType) return workType.name;

    return caseNumber;
  }, [assignedCaseOptions, workTypeById]);

  const hasAssignedCase = useCallback((value?: string | null) => {
    if (!value) return false;
    return assignedCaseOptions.some((option) => option.id === value);
  }, [assignedCaseOptions]);

  const selectedWorkTypeName = useMemo(
    () => workTypeById.get(selectedWorkType)?.name || "Arbeid",
    [selectedWorkType, workTypeById],
  );

  const manualWorkTypeName = useMemo(
    () => workTypeById.get(manualWorkType)?.name || "Arbeid",
    [manualWorkType, workTypeById],
  );

  const selectedWorkTypeOption = useMemo(
    () => (selectedWorkType ? workTypeById.get(selectedWorkType) : undefined),
    [selectedWorkType, workTypeById],
  );

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
    if (!selectedProject) return;
    if (hasAssignedCase(selectedProject)) return;
    setSelectedProject("");
  }, [hasAssignedCase, selectedProject]);

  useEffect(() => {
    if (!manualProject) return;
    if (hasAssignedCase(manualProject)) return;
    setManualProject("");
  }, [hasAssignedCase, manualProject]);

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
    if (prefillProject && isLoadingAssignedCases) return;

    prefillAppliedRef.current = true;

    let hasAppliedPrefill = false;

    if (prefillProject && hasAssignedCase(prefillProject)) {
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
  }, [hasAssignedCase, isLoadingAssignedCases, sendSuggestionFeedback, setLocation]);

  const applyProjectSuggestion = () => {
    const suggestedProject = smartSuggestions?.suggestion?.project?.value;
    if (!suggestedProject) return;
    if (!hasAssignedCase(suggestedProject)) {
      toast({
        title: "Forslag hoppet over",
        description: "Foreslått case er ikke blant dine tildelte caser.",
        variant: "destructive",
      });
      return;
    }

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
      if (hasAssignedCase(suggestedProject)) {
        setSelectedProject(suggestedProject);
        sendSuggestionFeedback("project", "accepted", suggestedProject, suggestedProject);
      } else if (assignedCaseOptions.length > 0) {
        sendSuggestionFeedback("project", "rejected", suggestedProject, null, { reason: "not_assigned_case" });
      }
    }
    if (suggestedDescription) {
      setTaskDescription(suggestedDescription);
      sendSuggestionFeedback("description", "accepted", suggestedDescription, suggestedDescription);
    }

    sendSuggestionFeedback("apply_all", "accepted", null, "timer_fields_prefilled", {
      appliedProject: suggestedProject,
      appliedDescription: suggestedDescription,
    });

    toast({ title: "Forslag brukt", description: "Case og beskrivelse er forhåndsutfylt." });
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
    setManualDescription(suggestedDescription || manualWorkTypeName);
    setManualProject(suggestedProject && hasAssignedCase(suggestedProject) ? suggestedProject : "");
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
      toast({
        title: "Velg case",
        description: assignedCaseOptions.length === 0
          ? "Du har ingen tildelte caser ennå. Be tiltaksleder tildele en sak."
          : "Du må velge en tildelt sak før du starter timeren.",
        variant: "destructive",
      });
      return;
    }

    if (workTypeOptions.length > 0 && !selectedWorkType) {
      toast({
        title: "Velg type arbeid",
        description: "Velg arbeidstype før du starter timeren.",
        variant: "destructive",
      });
      return;
    }

    if (selectedWorkTypeOption?.entryMode === "manual_only") {
      setManualProject(selectedProject);
      setManualWorkType(selectedWorkType);
      setManualDescription(taskDescription.trim() || selectedWorkTypeName);
      setShowManualDialog(true);
      toast({
        title: "Bruk manuell føring",
        description: `${selectedWorkTypeName} registreres manuelt med timer i stedet for stempling.`,
      });
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
    const description = taskDescription.trim() || selectedWorkTypeName;

    createMutation.mutate({
      description,
      hours,
      caseNumber: selectedProject || null,
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

    if (assignedCaseOptions.length > 0 && !manualProject) {
      toast({ title: "Velg case", description: "Velg en tildelt sak for manuell føring.", variant: "destructive" });
      return;
    }

    if (workTypeOptions.length > 0 && !manualWorkType) {
      toast({ title: "Velg type arbeid", description: "Velg arbeidstype for manuell føring.", variant: "destructive" });
      return;
    }

    const normalizedDescription = manualDescription.trim() || manualWorkTypeName;

    createMutation.mutate({
      description: normalizedDescription,
      hours,
      caseNumber: manualProject || null,
    });

    setShowManualDialog(false);
    setManualHours("");
    setManualDescription("");
    setManualProject("");
    setManualWorkType(workTypeOptions[0]?.id || "");
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

  const totalToday = safeTodayEntries.reduce((sum, e) => {
    // Don't count "client_sick" entries in the total
    if (e.caseNumber === "client_sick") return sum;
    return sum + e.hours;
  }, 0);

  const totalLast30Days = useMemo(() => {
    return safeLast30DaysEntries.reduce((sum, e) => {
      if (e.caseNumber === "client_sick") return sum;
      return sum + e.hours;
    }, 0);
  }, [safeLast30DaysEntries]);

  const averageLast30Days = useMemo(() => totalLast30Days / 30, [totalLast30Days]);

  const last30DailySeries = useMemo(() => {
    const startDate = subDays(new Date(), 29);
    const endDate = new Date();
    const dayRange = eachDayOfInterval({ start: startDate, end: endDate });
    const hoursByDay = new Map<string, number>();

    safeLast30DaysEntries.forEach((entry) => {
      if (entry.caseNumber === "client_sick") return;
      const dayKey = (entry.date || entry.createdAt || "").slice(0, 10);
      if (!dayKey) return;
      hoursByDay.set(dayKey, (hoursByDay.get(dayKey) || 0) + entry.hours);
    });

    return dayRange.map((day) => {
      const dayKey = format(day, "yyyy-MM-dd");
      const hours = hoursByDay.get(dayKey) || 0;
      return {
        dayKey,
        label: format(day, "d"),
        hours,
        percentage: Math.min((hours / 8) * 100, 100),
      };
    });
  }, [safeLast30DaysEntries]);

  const activeDaysLast30 = useMemo(
    () => last30DailySeries.filter((day) => day.hours > 0).length,
    [last30DailySeries],
  );

  const calendarActivityRate = useMemo(() => (activeDaysLast30 / 30) * 100, [activeDaysLast30]);

  // View modes
  const [viewMode, setViewMode] = useState<"today" | "calendar" | "analytics">("today");
  const [calendarViewMode, setCalendarViewMode] = useState<"week" | "month">("month");
  const [dateFilter, setDateFilter] = useState<{ from?: Date; to?: Date }>({});
  const [projectFilter, setProjectFilter] = useState<string>("");
  const [showWeeklySummaryDialog, setShowWeeklySummaryDialog] = useState(false);
  
  // Weekly data computation
  const weeklyData = useMemo(() => {
    const startOfWeek = startOfISOWeek(new Date());
    const endOfWeek = endOfISOWeek(new Date());
    const weekDays = eachDayOfInterval({ start: startOfWeek, end: endOfWeek });
    
    return weekDays.map(day => {
      const dayEntries = safeTodayEntries.filter(e => {
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
  }, [safeTodayEntries]);

  // Weekly totals
  const weeklyTotal = useMemo(() => weeklyData.reduce((sum, d) => sum + d.hours, 0), [weeklyData]);
  const weeklyAverage = useMemo(() => weeklyTotal / 5, [weeklyTotal]); // 5 work days
  const currentWeekLabel = format(new Date(), "w");

  const weeklySummaryDetails = (
    <>
      <div className="grid grid-cols-5 gap-2">
        {weeklyData.map((day) => (
          <div
            key={day.date.toISOString()}
            className="text-center p-3 rounded-lg bg-white/60 dark:bg-card/60 hover:bg-white dark:hover:bg-card transition-colors cursor-pointer group"
            onClick={() => {
              setSelectedDay(day);
              setShowWeeklySummaryDialog(false);
            }}
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
    </>
  );
  
  // Project breakdown
  const projectBreakdown = useMemo(() => {
    const breakdown: Record<string, number> = {};
    safeTodayEntries.forEach(e => {
      if (e.caseNumber !== "client_sick") {
        const caseLabel = resolveCaseLabel(e.caseNumber);
        breakdown[caseLabel] = (breakdown[caseLabel] || 0) + e.hours;
      }
    });

    const totalForBreakdown = Object.values(breakdown).reduce((sum, value) => sum + value, 0);
    return Object.entries(breakdown)
      .map(([name, hours]) => ({
        name,
        hours,
        percentage: totalForBreakdown > 0 ? (hours / totalForBreakdown) * 100 : 0,
      }))
      .sort((a, b) => b.hours - a.hours);
  }, [resolveCaseLabel, safeTodayEntries]);

  const projectFilterOptions = useMemo(() => {
    const uniqueCaseIds = new Set<string>();
    assignedCaseOptions.forEach((option) => uniqueCaseIds.add(option.id));
    safeTodayEntries.forEach((entry) => {
      if (entry.caseNumber && entry.caseNumber !== "client_sick") {
        uniqueCaseIds.add(entry.caseNumber);
      }
    });

    return Array.from(uniqueCaseIds)
      .map((id) => ({
        id,
        name: resolveCaseLabel(id),
        color: workTypeById.get(id)?.color || "bg-primary/60",
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "nb"));
  }, [assignedCaseOptions, resolveCaseLabel, safeTodayEntries, workTypeById]);

  // Filtered entries based on active filters
  const filteredEntries = useMemo(() => {
    let entries = safeTodayEntries;
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
  }, [safeTodayEntries, projectFilter, dateFilter]);

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
    return resolveCaseLabel(suggestionProjectId);
  }, [projectSuggestion, resolveCaseLabel]);

  const formatHoursCompact = useCallback((hours: number) => {
    if (Number.isInteger(hours)) return String(hours);
    return hours.toFixed(1);
  }, []);

  const formatHoursWithMinutes = useCallback((hours: number) => {
    const totalMinutes = Math.round(Math.max(hours, 0) * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${h} t ${m.toString().padStart(2, "0")} min`;
  }, []);

  const workerLabel = useMemo(() => {
    const firstName = user?.firstName?.trim() || "";
    const lastName = user?.lastName?.trim() || "";
    const fullName = `${firstName} ${lastName}`.trim();
    if (fullName) return fullName;
    if (user?.email) return user.email.split("@")[0];
    return "Maria L.";
  }, [user?.email, user?.firstName, user?.lastName]);

  const greetingName = useMemo(() => {
    const [firstName] = workerLabel.split(" ");
    return firstName || "Maria";
  }, [workerLabel]);
  const selectedClientLabel = selectedProject ? resolveCaseLabel(selectedProject) : "Velg case i feltet over";
  const sessionHours = elapsedSeconds > 0 ? elapsedSeconds / 3600 : totalToday;
  const sessionDurationLabel = formatHoursWithMinutes(sessionHours);

  const previousWeekTotal = useMemo(() => {
    const previousWeekAnchor = subDays(new Date(), 7);
    const previousWeekStart = startOfISOWeek(previousWeekAnchor);
    const previousWeekEnd = endOfISOWeek(previousWeekAnchor);

    return safeLast30DaysEntries.reduce((sum, entry) => {
      if (entry.caseNumber === "client_sick") return sum;

      const sourceDate = entry.date || entry.createdAt;
      if (!sourceDate) return sum;

      const entryDate = new Date(sourceDate);
      if (Number.isNaN(entryDate.getTime())) return sum;
      if (entryDate < previousWeekStart || entryDate > previousWeekEnd) return sum;

      return sum + entry.hours;
    }, 0);
  }, [safeLast30DaysEntries]);

  const followUpHistoryRows = useMemo(() => {
    const groupedEntries = new Map<string, TimeEntry[]>();

    safeLast30DaysEntries.forEach((entry) => {
      if (entry.caseNumber === "client_sick") return;
      const dayKey = (entry.date || entry.createdAt || "").slice(0, 10);
      if (!dayKey) return;

      const rows = groupedEntries.get(dayKey) || [];
      rows.push(entry);
      groupedEntries.set(dayKey, rows);
    });

    return Array.from(groupedEntries.entries())
      .map(([dayKey, entries]) => {
        const sortedEntries = entries
          .slice()
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

        const firstEntry = sortedEntries[0];
        const lastEntry = sortedEntries[sortedEntries.length - 1];
        const startTime = firstEntry ? format(new Date(firstEntry.createdAt), "HH:mm", { locale: nb }) : "--:--";
        const endTime = lastEntry ? format(new Date(lastEntry.createdAt), "HH:mm", { locale: nb }) : "--:--";
        const totalHours = entries.reduce((sum, item) => sum + item.hours, 0);
        const dayLabelRaw = format(new Date(`${dayKey}T00:00:00`), "EEEE", { locale: nb });
        const dayLabel = dayLabelRaw.charAt(0).toUpperCase() + dayLabelRaw.slice(1);

        return {
          dayKey,
          dayLabel,
          timeRange: `${startTime} - ${endTime}`,
          completed: totalHours >= 7.5,
          totalHours,
        };
      })
      .sort((a, b) => b.dayKey.localeCompare(a.dayKey))
      .slice(0, 4);
  }, [safeLast30DaysEntries]);

  const analogHourRotation = useMemo(
    () =>
      (
        (currentTime.getHours() % 12)
        + (
          currentTime.getMinutes()
          + currentTime.getSeconds() / 60
          + currentTime.getMilliseconds() / 60000
        ) / 60
      ) * 30,
    [currentTime],
  );

  const analogMinuteRotation = useMemo(
    () => (
      currentTime.getMinutes()
      + currentTime.getSeconds() / 60
      + currentTime.getMilliseconds() / 60000
    ) * 6,
    [currentTime],
  );

  const analogSecondRotation = useMemo(
    () => (currentTime.getSeconds() + currentTime.getMilliseconds() / 1000) * 6,
    [currentTime],
  );

  if (!isTimeTrackingEnabledForRole) {
    return (
      <PortalLayout>
        <div className="space-y-6 max-w-2xl">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Timeføring</h1>
            <p className="text-muted-foreground mt-1">Denne siden brukes av miljøarbeidere.</p>
          </div>

          <Card>
            <CardContent className="p-6 space-y-3">
              <p className="font-medium">Tiltaksleder registrerer ikke timer direkte i denne modulen.</p>
              <p className="text-sm text-muted-foreground">
                Miljøarbeidere sender timer til deg for godkjenning i rapportflyten.
              </p>
              <Button variant="outline" onClick={() => setLocation("/dashboard")}>
                Gå til Dashboard
              </Button>
            </CardContent>
          </Card>
        </div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold" data-testid="time-tracking-title">Timeføring</h1>
          <p className="text-muted-foreground mt-1">Registrer og administrer arbeidstid</p>
        </div>

        {/* Weekly Summary Overview */}
        <div className="md:hidden">
          <Button
            type="button"
            variant="outline"
            className="h-auto w-full justify-between rounded-xl border-slate-200/70 bg-white/90 px-4 py-3 text-left"
            onClick={() => setShowWeeklySummaryDialog(true)}
            data-testid="weekly-summary-trigger"
          >
            <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
              <CalendarIcon className="h-4 w-4 text-slate-600" />
              Uke {currentWeekLabel} - {weeklyTotal.toFixed(1)}t / 40t
            </span>
            <ChevronRight className="h-4 w-4 text-slate-500" />
          </Button>
        </div>

        <Card className="hidden md:block bg-gradient-to-br from-slate-50 to-slate-100/50 border-slate-200/60 dark:from-slate-900/40 dark:to-slate-800/20 dark:border-slate-700/40">
          <CardContent className="p-6">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-slate-600 dark:text-slate-400" />
              Uke {currentWeekLabel} - {weeklyTotal.toFixed(1)}t / 40t
            </h3>
            {weeklySummaryDetails}
          </CardContent>
        </Card>

        {/* View Mode Tabs */}
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)} className="w-full">
          <TabsList className="hidden w-full grid-cols-3 md:grid">
            <TabsTrigger value="today">I dag</TabsTrigger>
            <TabsTrigger value="calendar">Kalender</TabsTrigger>
            <TabsTrigger value="analytics">Statistikk</TabsTrigger>
          </TabsList>

          {/* TODAY VIEW */}
          <TabsContent value="today" className="space-y-6 mt-6">
            <Card className="overflow-hidden border-[#d8e5e1] bg-[#f5faf8] shadow-sm dark:border-slate-700/60 dark:bg-slate-900/60" data-testid="timer-card">
              <CardContent className="p-0">
                <div className="bg-[linear-gradient(180deg,#f7fbf9_0%,#eef5f2_100%)] px-5 py-5 dark:bg-[linear-gradient(180deg,rgba(28,42,50,0.95)_0%,rgba(20,30,36,0.96)_100%)] md:px-8">
                  <h2 className="text-3xl font-semibold tracking-tight text-[#22353a] dark:text-slate-100 md:text-4xl">Hei, {greetingName}!</h2>
                  <p className="mt-1 text-sm text-[#5f7277] dark:text-slate-300 md:text-base" data-testid="current-date">
                    {format(currentTime, "EEEE d. MMMM yyyy", { locale: nb })}
                  </p>
                </div>

                <div className="space-y-4 bg-[radial-gradient(circle_at_86%_17%,rgba(154,186,190,0.22),transparent_40%),radial-gradient(circle_at_95%_90%,rgba(166,203,194,0.24),transparent_34%),#f8fcfb] px-4 pb-5 pt-4 dark:bg-[radial-gradient(circle_at_86%_17%,rgba(56,91,102,0.35),transparent_40%),radial-gradient(circle_at_95%_90%,rgba(43,83,76,0.32),transparent_34%),#0f1720] md:px-8 md:pb-7">
                  <div className="flex items-center gap-2 text-base font-medium text-[#2f7b68] dark:text-emerald-300 md:text-lg">
                    <CheckCircle2 className="h-6 w-6" />
                    <span>{isRunning ? "Registreringen pågår" : elapsedSeconds > 0 ? "Registrering pauset" : "Klar for registrering"}</span>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-[1.7fr_1fr]">
                    <div className="rounded-2xl border border-[#d8e5e1] bg-white/95 p-4 shadow-[0_1px_2px_rgba(24,44,52,0.08)] dark:border-slate-700/60 dark:bg-slate-900/75">
                      <div className="grid gap-4 md:grid-cols-[180px_1fr] md:items-start">
                        <div className="mx-auto w-full max-w-[180px]">
                          <svg viewBox="0 0 160 160" className="h-auto w-full" role="img" aria-label="Analog klokke">
                            <circle cx="80" cy="80" r="72" className="fill-[#f8fcfb] stroke-[#d6e1de] dark:fill-slate-800 dark:stroke-slate-600" strokeWidth="10" />
                            <circle cx="80" cy="80" r="53" fill="none" className="stroke-[#e5efeb] dark:stroke-slate-600/80" strokeWidth="1.5" />
                            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((index) => {
                              const angle = ((index * 30) - 90) * (Math.PI / 180);
                              const majorTick = index % 3 === 0;
                              const outerRadius = 63;
                              const innerRadius = majorTick ? 52 : 56;
                              const x1 = 80 + Math.cos(angle) * innerRadius;
                              const y1 = 80 + Math.sin(angle) * innerRadius;
                              const x2 = 80 + Math.cos(angle) * outerRadius;
                              const y2 = 80 + Math.sin(angle) * outerRadius;
                              return (
                                <line
                                  key={index}
                                  x1={x1}
                                  y1={y1}
                                  x2={x2}
                                  y2={y2}
                                  className={cn(majorTick ? "stroke-[#7b949b] dark:stroke-slate-300" : "stroke-[#a5bbc0] dark:stroke-slate-500")}
                                  strokeWidth={majorTick ? 2.2 : 1.4}
                                  strokeLinecap="round"
                                />
                              );
                            })}
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((hour) => {
                              const angle = ((hour * 30) - 90) * (Math.PI / 180);
                              const labelRadius = 43;
                              const x = 80 + Math.cos(angle) * labelRadius;
                              const y = 80 + Math.sin(angle) * labelRadius;
                              return (
                                <text
                                  key={`clock-label-${hour}`}
                                  x={x}
                                  y={y}
                                  className="fill-[#7a9298] dark:fill-slate-300"
                                  fontSize="9"
                                  fontWeight="500"
                                  textAnchor="middle"
                                  dominantBaseline="central"
                                >
                                  {hour}
                                </text>
                              );
                            })}
                            <line
                              x1="80"
                              y1="80"
                              x2="80"
                              y2="48"
                              className="stroke-[#4f7380] dark:stroke-cyan-200"
                              strokeWidth="5"
                              strokeLinecap="round"
                              transform={`rotate(${analogHourRotation} 80 80)`}
                            />
                            <line
                              x1="80"
                              y1="80"
                              x2="80"
                              y2="34"
                              className="stroke-[#6b8a95] dark:stroke-cyan-300"
                              strokeWidth="3.4"
                              strokeLinecap="round"
                              transform={`rotate(${analogMinuteRotation} 80 80)`}
                            />
                            <line
                              x1="80"
                              y1="82"
                              x2="80"
                              y2="24"
                              className="stroke-[#d56b6b] dark:stroke-rose-300"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              transform={`rotate(${analogSecondRotation} 80 80)`}
                            />
                            <circle cx="80" cy="80" r="5.2" className="fill-[#557b86] dark:fill-cyan-100" />
                          </svg>
                        </div>

                        <div className="space-y-3">
                          <p className="text-3xl font-medium tracking-tight text-[#1f3338] dark:text-slate-100 md:text-5xl" data-testid="timer-display">
                            {sessionDurationLabel}
                          </p>

                          <div className="flex items-center justify-between rounded-xl border border-[#d8e5e1] bg-[#f8fbfa] px-4 py-3 text-[#30454a] dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
                            <span className="font-medium">Pause / avbrudd</span>
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-muted-foreground">00:30 min</span>
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            </div>
                          </div>

                          <div className="grid gap-2 sm:grid-cols-2">
                            <Select value={selectedProject} onValueChange={setSelectedProject} disabled={assignedCaseOptions.length === 0}>
                              <SelectTrigger className="h-11 border-[#d8e5e1] bg-white text-[#30454a] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" data-testid="project-select">
                                <SelectValue placeholder="Velg case" />
                              </SelectTrigger>
                              <SelectContent>
                                {assignedCaseOptions.map((assignedCase) => (
                                  <SelectItem key={assignedCase.id} value={assignedCase.id}>
                                    {assignedCase.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>

                            <Select value={selectedWorkType} onValueChange={setSelectedWorkType} disabled={workTypeOptions.length === 0}>
                              <SelectTrigger className="h-11 border-[#d8e5e1] bg-white text-[#30454a] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" data-testid="work-type-select">
                                <SelectValue placeholder={workTypeOptions.length === 0 ? "Ingen arbeidstyper" : "Type arbeid"} />
                              </SelectTrigger>
                              <SelectContent>
                                {workTypeOptions.map((workType) => (
                                  <SelectItem key={workType.id} value={workType.id}>
                                    <div className="flex items-center gap-2">
                                      <div className={cn("w-2 h-2 rounded-full", workType.color)} />
                                      {workType.name}
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {assignedCaseOptions.length === 0 && (
                            <p className="text-xs text-amber-700 dark:text-amber-400">
                              Du har ingen tildelte caser ennå. Tiltaksleder må tildele caser før timerstart.
                            </p>
                          )}
                          {workTypeOptions.length === 0 && (
                            <p className="text-xs text-amber-700 dark:text-amber-400">
                              Ingen arbeidstyper er satt opp. Be admin konfigurere arbeidstyper i Innstillinger.
                            </p>
                          )}

                          <div className="grid gap-2 sm:grid-cols-2">
                            <Button
                              type="button"
                              className={cn(
                                "h-12 rounded-lg text-base font-semibold",
                                isRunning
                                  ? "bg-[#d3e6e1] text-[#365a63] hover:bg-[#c8ddd7] dark:bg-emerald-900/55 dark:text-emerald-100 dark:hover:bg-emerald-900/70"
                                  : "bg-[#b6d6cf] text-[#2e5056] hover:bg-[#a8cbc3] dark:bg-teal-900/55 dark:text-teal-100 dark:hover:bg-teal-900/70",
                              )}
                              onClick={() => {
                                if (isRunning) pauseTimer();
                                else startTimer();
                              }}
                              data-testid={isRunning ? "timer-pause" : "timer-start"}
                            >
                              {isRunning ? "Pause" : elapsedSeconds > 0 ? "Fortsett" : "Start nå"}
                            </Button>
                            <Button
                              type="button"
                              className="h-12 rounded-lg bg-[#3f8682] text-base font-semibold text-white hover:bg-[#357774] dark:bg-cyan-800 dark:hover:bg-cyan-700"
                              onClick={stopTimer}
                              disabled={createMutation.isPending || elapsedSeconds === 0}
                              data-testid="timer-stop"
                            >
                              Ferdig
                            </Button>
                          </div>

                          <div className="space-y-2 border-t border-[#e5efeb] pt-3 text-[#2e4449] dark:border-slate-700 dark:text-slate-200">
                            <div className="flex items-center gap-2 text-base">
                              <User className="h-4 w-4 text-[#85a2a7] dark:text-slate-400" />
                              <span>Miljøarbeider: {workerLabel}</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-[#4d6469] dark:text-slate-300">
                              <MapPin className="h-4 w-4 text-[#8ea8ad] dark:text-slate-400" />
                              <span>Klient: {selectedClientLabel}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-3">
                      <div className="rounded-2xl border border-[#d8e5e1] bg-white/90 p-4 dark:border-slate-700/60 dark:bg-slate-900/75">
                        <p className="text-2xl font-medium tracking-tight text-[#1f3338] dark:text-slate-100 md:text-3xl">Oppfølging i dag</p>
                        <p className="mt-2 text-3xl font-medium tracking-tight text-[#1f3338] dark:text-slate-100 md:text-4xl">08:00 - 16:00</p>
                        <p className="mt-1 text-sm text-[#53666b] dark:text-slate-300 md:text-base">Registrert i dag {formatHoursWithMinutes(totalToday)}</p>
                      </div>
                      <div className="rounded-2xl border border-[#d8e5e1] bg-white/90 p-4 dark:border-slate-700/60 dark:bg-slate-900/75">
                        <p className="text-2xl font-medium tracking-tight text-[#1f3338] dark:text-slate-100 md:text-3xl">Oppfølging sist uke</p>
                        <p className="mt-2 text-3xl font-medium tracking-tight text-[#1f3338] dark:text-slate-100 md:text-4xl">{formatHoursWithMinutes(previousWeekTotal)}</p>
                        <p className="mt-1 text-sm text-[#53666b] dark:text-slate-300 md:text-base">Total arbeidstid</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 xl:grid-cols-[1.7fr_1fr]">
                    <div className="rounded-2xl border border-[#d8e5e1] bg-white/90 p-4 dark:border-slate-700/60 dark:bg-slate-900/75">
                      <h3 className="mb-3 text-2xl font-semibold tracking-tight text-[#23363b] dark:text-slate-100 md:text-3xl">Oppfølgingshistorikk</h3>
                      <div className="space-y-1.5">
                        {followUpHistoryRows.length === 0 ? (
                          <p className="rounded-xl border border-dashed border-[#d8e5e1] bg-[#f8fbfa] px-4 py-6 text-sm text-muted-foreground dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
                            Ingen registreringer ennå.
                          </p>
                        ) : (
                          followUpHistoryRows.map((row) => (
                            <div key={row.dayKey} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[#e1ebe8] bg-white px-3 py-2.5 text-[#2e4348] dark:border-slate-700 dark:bg-slate-800/65 dark:text-slate-100">
                              <div className="mr-auto flex items-center gap-2">
                                {row.completed ? (
                                  <CheckCircle2 className="h-4 w-4 text-[#5f8f80] dark:text-emerald-300" />
                                ) : (
                                  <Circle className="h-4 w-4 text-[#8ba2a8] dark:text-slate-400" />
                                )}
                                <span className="font-medium">{row.dayLabel}</span>
                              </div>
                              <span className="font-mono text-sm">{row.timeRange}</span>
                              <span className={cn("text-sm", row.completed ? "text-[#4b7c6f] dark:text-emerald-300" : "text-[#5f6f74] dark:text-slate-400")}>
                                {row.completed ? "Ferdig dokument" : "Ferdiggjør"}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-[#d8e5e1] bg-white/90 p-4 dark:border-slate-700/60 dark:bg-slate-900/75">
                      <div className="flex items-start gap-3 text-[#2e4449] dark:text-slate-200">
                        <div className="rounded-xl border border-[#dce7e3] bg-[#f7fbf9] p-2 dark:border-slate-700 dark:bg-slate-800/60">
                          <MessageSquare className="h-5 w-5 text-[#7f9ba1] dark:text-slate-300" />
                        </div>
                        <div className="w-full space-y-2">
                          <p className="text-lg font-medium leading-snug md:text-xl">
                            Husk kort notat hvis noe viktig skjedde i dag
                          </p>
                          <Textarea
                            value={taskDescription}
                            onChange={(e) => setTaskDescription(e.target.value)}
                            placeholder="Skriv kort notat her..."
                            className="min-h-[96px] resize-y border-[#d8e5e1] bg-[#f9fcfb] text-sm dark:border-slate-700 dark:bg-slate-800/65 dark:text-slate-100 dark:placeholder:text-slate-400"
                            data-testid="task-input"
                          />
                          <p className="text-xs text-[#5d7176] dark:text-slate-400">
                            Notatet brukes som beskrivelse når du lagrer timer.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

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
                      <p className="text-xs text-muted-foreground">Case</p>
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
                    <SelectValue placeholder="Alle caser" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle caser</SelectItem>
                    {projectFilterOptions.map((projectOption) => (
                      <SelectItem key={projectOption.id} value={projectOption.id}>
                        <div className="flex items-center gap-2">
                          <div className={cn("w-2 h-2 rounded-full", projectOption.color)} />
                          {projectOption.name}
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
                      const workType = workTypeById.get(entry.caseNumber || "");
                      const caseLabel = resolveCaseLabel(entry.caseNumber);
                      const isEditing = editingEntry?.id === entry.id;
                      
                      return (
                        <Card key={entry.id} className="overflow-visible" data-testid={`time-entry-${entry.id}`}>
                          <CardContent className="p-4">
                            <div className="flex items-start gap-4">
                              <div className={cn("w-1 h-full min-h-[60px] rounded-full flex-shrink-0", workType?.color || "bg-primary/60")} />
                              
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
                                    <p className="text-sm text-muted-foreground">{caseLabel}</p>
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

          {/* ANALYTICS VIEW */}
          <TabsContent value="analytics" className="space-y-6 mt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Project Breakdown */}
              <Card className="bg-gradient-to-br from-emerald-50 to-teal-50/50 border-emerald-200/60 dark:from-emerald-950/40 dark:to-teal-950/20 dark:border-emerald-800/40">
                <CardContent className="p-6">
                  <h3 className="font-semibold mb-4 flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    Etter case
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
                        Du arbeider på {projectBreakdown.length} sak(er) i dag
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* CALENDAR VIEW */}
          <TabsContent value="calendar" className="space-y-6 mt-6">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Kalendervisning</h3>
                <p className="text-xs text-muted-foreground">Bytt mellom uke- og månedsvisning</p>
              </div>
              <div className="flex items-center gap-1 rounded-md border border-slate-200/70 dark:border-slate-700/70 bg-white/60 dark:bg-slate-900/40 p-1">
                <Button
                  type="button"
                  size="sm"
                  variant={calendarViewMode === "week" ? "default" : "ghost"}
                  className="h-8 px-3 text-xs"
                  onClick={() => setCalendarViewMode("week")}
                  data-testid="calendar-view-week"
                >
                  Uke
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={calendarViewMode === "month" ? "default" : "ghost"}
                  className="h-8 px-3 text-xs"
                  onClick={() => setCalendarViewMode("month")}
                  data-testid="calendar-view-month"
                >
                  Måned
                </Button>
              </div>
            </div>

            {calendarViewMode === "week" ? (
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
            ) : (
              <>
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
                <Card className="bg-gradient-to-br from-sky-50 via-cyan-50/80 to-emerald-50/60 dark:from-slate-900/70 dark:via-cyan-950/20 dark:to-emerald-950/10 border-sky-200/70 dark:border-cyan-900/40">
                  <CardContent className="p-6 space-y-5">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <h3 className="font-semibold flex items-center gap-2">
                          <CalendarDays className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                          Kalender (30 siste dager)
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          Gjennomsnittlig timer per dag de siste 30 dagene
                        </p>
                      </div>
                      {!isLoadingLast30Days && (
                        <Badge variant="secondary" className="bg-white/70 dark:bg-card/60">
                          {activeDaysLast30}/30 aktive dager
                        </Badge>
                      )}
                    </div>

                    {isLoadingLast30Days ? (
                      <div className="space-y-3">
                        <div className="h-16 rounded-lg bg-white/60 dark:bg-card/60 animate-pulse" />
                        <div className="h-24 rounded-lg bg-white/60 dark:bg-card/60 animate-pulse" />
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="rounded-lg border border-sky-200/60 dark:border-slate-700/60 bg-white/75 dark:bg-card/60 p-3">
                            <p className="text-xs text-muted-foreground">Snitt per dag</p>
                            <p className="text-2xl font-mono font-semibold text-foreground mt-1">{averageLast30Days.toFixed(1)}t</p>
                            <p className="text-xs text-muted-foreground mt-1" data-testid="calendar-last-30-metrics">
                              {averageLast30Days.toFixed(1)}t / dag - Totalt: {formatHoursCompact(totalLast30Days)}t
                            </p>
                          </div>
                          <div className="rounded-lg border border-cyan-200/60 dark:border-slate-700/60 bg-white/75 dark:bg-card/60 p-3">
                            <p className="text-xs text-muted-foreground">Total tid</p>
                            <p className="text-2xl font-mono font-semibold text-foreground mt-1">{formatHoursCompact(totalLast30Days)}t</p>
                            <p className="text-xs text-muted-foreground mt-1">Siste 30 dager</p>
                          </div>
                          <div className="rounded-lg border border-emerald-200/60 dark:border-slate-700/60 bg-white/75 dark:bg-card/60 p-3">
                            <p className="text-xs text-muted-foreground">Aktive dager</p>
                            <p className="text-2xl font-mono font-semibold text-foreground mt-1">{activeDaysLast30}</p>
                            <p className="text-xs text-muted-foreground mt-1">Dager med registrerte timer</p>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>Aktivitetsgrad</span>
                            <span>{calendarActivityRate.toFixed(0)}%</span>
                          </div>
                          <div className="h-2 bg-slate-200/70 dark:bg-slate-700/50 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-500 transition-all"
                              style={{ width: `${Math.min(calendarActivityRate, 100)}%` }}
                            />
                          </div>
                        </div>

                      </>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          <TabsList className="grid w-full grid-cols-3 md:hidden">
            <TabsTrigger value="today">I dag</TabsTrigger>
            <TabsTrigger value="calendar">Kalender</TabsTrigger>
            <TabsTrigger value="analytics">Statistikk</TabsTrigger>
          </TabsList>
        </Tabs>

      <Dialog open={showWeeklySummaryDialog} onOpenChange={setShowWeeklySummaryDialog}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-slate-600" />
              Uke {currentWeekLabel} - {weeklyTotal.toFixed(1)}t / 40t
            </DialogTitle>
            <DialogDescription>
              Trykk på en dag for å se registreringene.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {weeklySummaryDetails}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowWeeklySummaryDialog(false)}>
              Lukk
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              <Label htmlFor="manual-project">Case</Label>
              <Select value={manualProject} onValueChange={setManualProject} disabled={assignedCaseOptions.length === 0}>
                <SelectTrigger data-testid="manual-project-select">
                  <SelectValue placeholder={assignedCaseOptions.length === 0 ? "Ingen tildelte caser" : "Velg case"} />
                </SelectTrigger>
                <SelectContent>
                  {assignedCaseOptions.map((assignedCase) => (
                    <SelectItem key={assignedCase.id} value={assignedCase.id}>
                      {assignedCase.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="manual-work-type">Type arbeid</Label>
              <Select value={manualWorkType} onValueChange={setManualWorkType} disabled={workTypeOptions.length === 0}>
                <SelectTrigger data-testid="manual-work-type-select">
                  <SelectValue placeholder={workTypeOptions.length === 0 ? "Ingen arbeidstyper" : "Velg type arbeid"} />
                </SelectTrigger>
                <SelectContent>
                  {workTypeOptions.map((workType) => (
                    <SelectItem key={workType.id} value={workType.id}>
                      <div className="flex items-center gap-2">
                        <div className={cn("w-2 h-2 rounded-full", workType.color)} />
                        {workType.name}
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
                      return (
                        <div key={entry.id} className="flex items-center justify-between px-3 py-2.5 text-sm">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{entry.description || "Ingen beskrivelse"}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {resolveCaseLabel(entry.caseNumber)}
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
