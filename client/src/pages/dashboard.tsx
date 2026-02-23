import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useIsFetching, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Users, Clock, FileText, AlertCircle, Briefcase, ShieldAlert, Paintbrush, Sun, Moon, Monitor, LayoutGrid, AlignJustify, ListChecks, Target } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useTheme } from "@/components/theme-provider";
import {
  endOfMonth,
  format,
  getDate,
  getDaysInMonth,
  isSameMonth,
  isValid,
  parseISO,
  setDate,
  startOfMonth,
} from "date-fns";
import { PortalLayout } from "@/components/portal/portal-layout";
import { StatCard } from "@/components/portal/stat-card";
import { DashboardHero, type TimeRange } from "@/components/dashboard/dashboard-hero";
import { DashboardNextAction } from "@/components/dashboard/dashboard-next-action";
import { DashboardAlerts, type DashboardAlert } from "@/components/dashboard/dashboard-alerts";
import { DashboardTasks, type TaskCounts } from "@/components/dashboard/dashboard-tasks";
import { DashboardGoals } from "@/components/dashboard/dashboard-goals";
import { DashboardActivity } from "@/components/dashboard/dashboard-activity";
import { DashboardStatusToday, type StatusSignal } from "@/components/dashboard/dashboard-status-today";
import { DashboardRiskParticipants } from "@/components/dashboard/dashboard-risk-participants";
import { DashboardWorkerMobile, type WorkerParticipant, type WorkerTodaySignal } from "@/components/dashboard/dashboard-worker-mobile";
import { DashboardWeekStrip } from "@/components/dashboard/dashboard-week-strip";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useSuggestionSettings } from "@/hooks/use-suggestion-settings";
import { useSuggestionVisibility } from "@/hooks/use-suggestion-visibility";
import { normalizeRole } from "@shared/roles";
import type { Activity, TimeEntry } from "@shared/schema";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { isSuggestionSurfaceEnabled } from "@/lib/suggestion-settings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/* ═══════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════ */

const DEFAULT_HOURS_DATA = [
  { day: "Man", hours: 0 },
  { day: "Tir", hours: 0 },
  { day: "Ons", hours: 0 },
  { day: "Tor", hours: 0 },
  { day: "Fre", hours: 0 },
  { day: "Lor", hours: 0 },
  { day: "Son", hours: 0 },
];

const TIME_RANGE_LABELS: Record<TimeRange, string> = {
  today: "I dag",
  week: "Denne uken",
  month: "Denne måneden",
};

const DASHBOARD_PROJECT_LABELS: Record<string, string> = {
  general: "Generelt arbeid",
  development: "Utvikling",
  meeting: "Møte",
  support: "Kundesupport",
  admin: "Administrasjon",
};

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

interface CaseReportSuggestionsResponse {
  month: string;
  analyzedReports: number;
  suggestion: {
    caseId: SuggestionValue<string | null>;
    template: SuggestionValue<string | null>;
    copyPreviousMonth: SuggestionValue<boolean>;
    fields: Record<
      "background" | "actions" | "progress" | "challenges" | "factors" | "assessment" | "recommendations" | "notes",
      SuggestionValue<string | null>
    >;
  };
  previousMonthReport: null | {
    id: number;
    caseId: string;
    month: string;
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

type SuggestionFeedbackType =
  | "project"
  | "description"
  | "hours"
  | "bulk_copy_prev_month"
  | "apply_all"
  | "manual_prefill";

/* ═══════════════════════════════════════════════════
   Dashboard preferences (localStorage)
   ═══════════════════════════════════════════════════ */

interface DashboardPrefs {
  showTasks: boolean;
  showGoals: boolean;
  showInsights: boolean;
  compactMode: boolean;
  cardStyle: 'default' | 'flat' | 'glass';
}

const PREFS_KEY = "tidum-dashboard-prefs";

function loadPrefs(): DashboardPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      return {
        showTasks: true,
        showGoals: true,
        showInsights: true,
        compactMode: false,
        cardStyle: 'default' as const,
        ...JSON.parse(raw),
      };
    }
  } catch { /* ignore */ }
  return { showTasks: true, showGoals: true, showInsights: true, compactMode: false, cardStyle: 'default' as const };
}

function savePrefs(prefs: DashboardPrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch { /* ignore */ }
}

/* ═══════════════════════════════════════════════════
   Page component
   ═══════════════════════════════════════════════════ */

export default function DashboardPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { settings: suggestionSettings } = useSuggestionSettings();
  const queryClient = useQueryClient();
  const [timeRange, setTimeRange] = useState<TimeRange>("week");
  const [prefs, setPrefs] = useState<DashboardPrefs>(loadPrefs);
  const { theme, setTheme } = useTheme();
  const [isDashboardSuggestionDismissed, setIsDashboardSuggestionDismissed] = useState(false);
  const [isDashboardCaseSuggestionDismissed, setIsDashboardCaseSuggestionDismissed] = useState(false);
  const today = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);
  const currentYearMonth = useMemo(() => format(new Date(), "yyyy-MM"), []);
  const rolePreview = useMemo(() => {
    if (typeof window === "undefined") return null;
    const value = new URLSearchParams(window.location.search).get("role");
    return value ? normalizeRole(value) : null;
  }, []);
  const normalizedRole = rolePreview || normalizeRole(user?.role);
  const isTiltakslederView = ["tiltaksleder", "teamleder", "case_manager"].includes(normalizedRole);
  const isMiljoarbeiderView = normalizedRole === "miljoarbeider";
  const dashboardSuggestionsEnabled = isSuggestionSurfaceEnabled(suggestionSettings, "dashboard");

  const updatePrefs = useCallback((nextPrefs: DashboardPrefs) => {
    setPrefs(nextPrefs);
    savePrefs(nextPrefs);
  }, []);

  /* ── Calendar state ── */
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string>(() =>
    format(new Date(), "yyyy-MM-dd"),
  );
  const [monthDirection, setMonthDirection] = useState<number>(0);
  const [isMonthTransitioning, setIsMonthTransitioning] = useState(false);

  /* ── "Sist oppdatert" tracking ── */
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  /* ── Deferred analytics loading via IntersectionObserver ── */
  const analyticsSentinelRef = useRef<HTMLDivElement | null>(null);
  const [analyticsVisible, setAnalyticsVisible] = useState(false);

  useEffect(() => {
    const el = analyticsSentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setAnalyticsVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  /* ── Month range for heatmap ── */
  const monthRange = useMemo(
    () => ({
      startDate: format(startOfMonth(calendarMonth), "yyyy-MM-dd"),
      endDate: format(endOfMonth(calendarMonth), "yyyy-MM-dd"),
    }),
    [calendarMonth],
  );
  const monthActivityRange = useMemo(() => ({ ...monthRange, limit: "800" }), [monthRange]);

  /* ═══════════════════════════════════════════════════
     Queries
     ═══════════════════════════════════════════════════ */

  const {
    data: stats,
    isLoading: statsLoading,
    isFetching: statsFetching,
  } = useQuery<{
    totalHours: number;
    activeUsers: number;
    pendingApprovals: number;
    casesThisWeek: number;
    hoursTrend: number;
    usersTrend: number;
    approvalsTrend: number;
    casesTrend: number;
  }>({
    queryKey: ["/api/stats", { range: timeRange }],
    staleTime: 20_000,
    placeholderData: keepPreviousData,
  });

  const { data: activities = [], isLoading: activitiesLoading } = useQuery<
    (Activity & { userName: string })[]
  >({
    queryKey: ["/api/activities", { limit: "10" }],
    staleTime: 20_000,
    placeholderData: keepPreviousData,
  });

  // Deferred: only fetch when analytics section is visible
  const {
    data: monthEntries = [],
    isLoading: monthEntriesLoading,
    isFetching: monthEntriesFetching,
  } = useQuery<TimeEntry[]>({
    queryKey: ["/api/time-entries", monthRange],
    staleTime: 20_000,
    gcTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
    enabled: analyticsVisible,
  });

  const {
    data: monthActivities = [],
    isLoading: monthActivitiesLoading,
    isFetching: monthActivitiesFetching,
  } = useQuery<(Activity & { userName: string })[]>({
    queryKey: ["/api/activities", monthActivityRange],
    staleTime: 20_000,
    gcTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
    enabled: analyticsVisible,
  });

  const { data: chartData, isLoading: chartLoading } = useQuery<{
    hoursPerDay: { day: string; hours: number }[];
    heatmapData: { date: string; hours: number }[];
  }>({
    queryKey: ["/api/chart-data"],
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
    // Eagerly load — lightweight (7 numbers), powers the week strip near the top
  });

  const { data: rawTimeSuggestions } = useQuery<TimeEntrySuggestionsResponse | Record<string, unknown>>({
    queryKey: ["/api/time-entries/suggestions", { date: today }],
    staleTime: 45_000,
    enabled: !isTiltakslederView && dashboardSuggestionsEnabled,
  });

  const { data: rawCaseReportSuggestions } = useQuery<CaseReportSuggestionsResponse | Record<string, unknown>>({
    queryKey: ["/api/case-reports/suggestions", { month: currentYearMonth }],
    staleTime: 45_000,
    enabled: !isTiltakslederView && dashboardSuggestionsEnabled,
  });

  const suggestionFeedbackMutation = useMutation({
    mutationFn: async (payload: {
      suggestionType: SuggestionFeedbackType;
      outcome: "accepted" | "rejected";
      suggestedValue?: string | null;
      chosenValue?: string | null;
      date: string;
      metadata?: Record<string, unknown>;
    }) => {
      return apiRequest("POST", "/api/time-entries/suggestions/feedback", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries/suggestions"] });
    },
  });

  const caseSuggestionFeedbackMutation = useMutation({
    mutationFn: async (payload: {
      suggestionType: string;
      outcome: "accepted" | "rejected";
      month?: string | null;
      caseId?: string | null;
      suggestedValue?: string | null;
      chosenValue?: string | null;
      metadata?: Record<string, unknown>;
    }) => {
      return apiRequest("POST", "/api/case-reports/suggestions/feedback", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/case-reports/suggestions"] });
    },
  });

  /* ── Track "sist oppdatert" ── */
  useEffect(() => {
    if (stats && !statsFetching) {
      setLastUpdated(new Date());
    }
  }, [stats, statsFetching]);

  /* ═══════════════════════════════════════════════════
     Derived data
     ═══════════════════════════════════════════════════ */

  const smartSuggestions = useMemo<TimeEntrySuggestionsResponse | null>(() => {
    if (!rawTimeSuggestions || typeof rawTimeSuggestions !== "object") {
      return null;
    }

    if (!("suggestion" in rawTimeSuggestions) || typeof rawTimeSuggestions.suggestion !== "object") {
      return null;
    }

    return rawTimeSuggestions as TimeEntrySuggestionsResponse;
  }, [rawTimeSuggestions]);

  const caseReportSuggestions = useMemo<CaseReportSuggestionsResponse | null>(() => {
    if (!rawCaseReportSuggestions || typeof rawCaseReportSuggestions !== "object") {
      return null;
    }
    if (!("suggestion" in rawCaseReportSuggestions) || typeof rawCaseReportSuggestions.suggestion !== "object") {
      return null;
    }
    return rawCaseReportSuggestions as CaseReportSuggestionsResponse;
  }, [rawCaseReportSuggestions]);

  const suggestionResetKey = useMemo(() => {
    if (!smartSuggestions) return "none";
    return [
      smartSuggestions.date,
      smartSuggestions.suggestion.project?.value || "",
      smartSuggestions.suggestion.description?.value || "",
      smartSuggestions.suggestion.hours?.value != null ? String(smartSuggestions.suggestion.hours.value) : "",
      smartSuggestions.suggestion.bulkCopyPrevMonth?.value ? "1" : "0",
    ].join("|");
  }, [smartSuggestions]);

  const caseSuggestionResetKey = useMemo(() => {
    if (!caseReportSuggestions) return "none";
    return [
      caseReportSuggestions.month,
      caseReportSuggestions.suggestion.caseId?.value || "",
      caseReportSuggestions.suggestion.copyPreviousMonth?.value ? "1" : "0",
    ].join("|");
  }, [caseReportSuggestions]);

  const dashboardSuggestionAction = useMemo<{
    kind: "prefill" | "bulk_copy";
    label: string;
    description: string;
    path: string;
    reason?: string | null;
    confidence?: number | null;
    projectId?: string | null;
    projectLabel?: string | null;
    suggestedDescription?: string | null;
    suggestedHours?: number | null;
  } | null>(() => {
    if (isDashboardSuggestionDismissed || !smartSuggestions) {
      return null;
    }

    const projectId = smartSuggestions.suggestion.project?.value ?? null;
    const suggestedDescription = smartSuggestions.suggestion.description?.value?.trim() || null;
    const suggestedHours = smartSuggestions.suggestion.hours?.value ?? null;
    const reasonCandidates = [
      projectId ? smartSuggestions.suggestion.project?.reason : null,
      suggestedDescription ? smartSuggestions.suggestion.description?.reason : null,
      suggestedHours != null ? smartSuggestions.suggestion.hours?.reason : null,
    ].filter((value): value is string => Boolean(value && value.trim()));
    const confidenceCandidates = [
      projectId ? smartSuggestions.suggestion.project?.confidence : null,
      suggestedDescription ? smartSuggestions.suggestion.description?.confidence : null,
      suggestedHours != null ? smartSuggestions.suggestion.hours?.confidence : null,
    ].filter((value): value is number => typeof value === "number");
    const combinedConfidence = confidenceCandidates.length
      ? Math.max(...confidenceCandidates)
      : null;

    const hasPrefillSuggestion = Boolean(projectId || suggestedDescription || suggestedHours != null);
    if (hasPrefillSuggestion) {
      const params = new URLSearchParams();
      if (projectId) params.set("prefillProject", projectId);
      if (suggestedDescription) params.set("prefillDescription", suggestedDescription);
      if (suggestedHours != null) params.set("prefillHours", String(suggestedHours));

      const path = params.toString() ? `/time-tracking?${params.toString()}` : "/time-tracking";
      const projectLabel = projectId ? DASHBOARD_PROJECT_LABELS[projectId] || projectId : null;

      return {
        kind: "prefill",
        label: projectLabel
          ? `Start med forslag for ${projectLabel}`
          : "Start med personlige forslag",
        description: suggestedDescription || "Prosjekt og timer er klare for i dag.",
        reason: reasonCandidates[0] || "Basert på tidligere føringer.",
        confidence: combinedConfidence,
        path,
        projectId,
        projectLabel,
        suggestedDescription,
        suggestedHours,
      };
    }

    if (smartSuggestions.suggestion.bulkCopyPrevMonth?.value) {
      return {
        kind: "bulk_copy",
        label: "Kopier forrige måned",
        description: smartSuggestions.suggestion.bulkCopyPrevMonth.reason,
        reason: smartSuggestions.suggestion.bulkCopyPrevMonth.reason,
        confidence: smartSuggestions.suggestion.bulkCopyPrevMonth.confidence,
        path: "/time-tracking?openBulk=1",
      };
    }

    return null;
  }, [isDashboardSuggestionDismissed, smartSuggestions]);

  const dashboardCaseSuggestionAction = useMemo<{
    label: string;
    description: string;
    reason: string;
    confidence: number | null;
    path: string;
    caseId: string | null;
    prefillMode: "copy_previous_month" | "empty_fields";
    sourceMonth: string | null;
  } | null>(() => {
    if (isDashboardCaseSuggestionDismissed || !caseReportSuggestions) {
      return null;
    }

    const suggestedCaseId = caseReportSuggestions.suggestion.caseId?.value?.trim() || null;
    const hasCopyPreviousMonth = Boolean(
      caseReportSuggestions.suggestion.copyPreviousMonth?.value && caseReportSuggestions.previousMonthReport,
    );
    const hasFieldSuggestion = Object.values(caseReportSuggestions.suggestion.fields || {}).some(
      (field) => typeof field?.value === "string" && field.value.trim().length > 0,
    );

    if (!suggestedCaseId && !hasCopyPreviousMonth && !hasFieldSuggestion) {
      return null;
    }

    const params = new URLSearchParams();
    params.set("create", "1");
    params.set("useSuggestions", "1");
    params.set("source", "dashboard");
    if (suggestedCaseId) params.set("prefillCaseId", suggestedCaseId);
    if (hasCopyPreviousMonth) {
      params.set("prefillMode", "copy_previous_month");
    } else {
      params.set("prefillMode", "empty_fields");
    }
    const path = `/case-reports?${params.toString()}`;

    const caseConfidence = caseReportSuggestions.suggestion.caseId?.confidence ?? null;
    const copyConfidence = caseReportSuggestions.suggestion.copyPreviousMonth?.confidence ?? null;

    return {
      label: hasCopyPreviousMonth
        ? "Fortsett fra forrige måned"
        : suggestedCaseId
          ? `Start rapport for ${suggestedCaseId}`
          : "Start med personlige forslag",
      description: hasCopyPreviousMonth
        ? caseReportSuggestions.suggestion.copyPreviousMonth.reason
        : caseReportSuggestions.suggestion.caseId.reason || "Bruk forslag fra tidligere rapporter.",
      reason: hasCopyPreviousMonth
        ? caseReportSuggestions.suggestion.copyPreviousMonth.reason
        : caseReportSuggestions.suggestion.caseId.reason || "Bruk forslag fra tidligere rapporter.",
      confidence: hasCopyPreviousMonth ? copyConfidence : caseConfidence,
      path,
      caseId: suggestedCaseId,
      prefillMode: hasCopyPreviousMonth ? "copy_previous_month" : "empty_fields",
      sourceMonth: caseReportSuggestions.previousMonthReport?.month ?? null,
    };
  }, [caseReportSuggestions, isDashboardCaseSuggestionDismissed]);

  const dashboardTimeSuggestionVisibility = useSuggestionVisibility({
    surface: "dashboard_time",
    enabled: !isTiltakslederView && dashboardSuggestionsEnabled && !!dashboardSuggestionAction,
    frequency: suggestionSettings.frequency,
    scopeKey: suggestionResetKey,
  });

  const dashboardCaseSuggestionVisibility = useSuggestionVisibility({
    surface: "dashboard_case",
    enabled: !isTiltakslederView && dashboardSuggestionsEnabled && !!dashboardCaseSuggestionAction,
    frequency: suggestionSettings.frequency,
    scopeKey: caseSuggestionResetKey,
  });

  const visibleDashboardSuggestionAction = dashboardTimeSuggestionVisibility.isVisible
    ? dashboardSuggestionAction
    : null;

  const visibleDashboardCaseSuggestionAction = dashboardCaseSuggestionVisibility.isVisible
    ? dashboardCaseSuggestionAction
    : null;

  const sendSuggestionFeedback = useCallback((
    suggestionType: SuggestionFeedbackType,
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

  const handleUseDashboardSuggestion = useCallback((placement: "next_action") => {
    if (!visibleDashboardSuggestionAction) return;

    if (visibleDashboardSuggestionAction.kind === "prefill") {
      if (visibleDashboardSuggestionAction.projectId) {
        sendSuggestionFeedback("project", "accepted", visibleDashboardSuggestionAction.projectId, visibleDashboardSuggestionAction.projectId, {
          source: "dashboard",
          placement,
        });
      }
      if (visibleDashboardSuggestionAction.suggestedDescription) {
        sendSuggestionFeedback("description", "accepted", visibleDashboardSuggestionAction.suggestedDescription, visibleDashboardSuggestionAction.suggestedDescription, {
          source: "dashboard",
          placement,
        });
      }
      if (visibleDashboardSuggestionAction.suggestedHours != null) {
        const hoursValue = String(visibleDashboardSuggestionAction.suggestedHours);
        sendSuggestionFeedback("hours", "accepted", hoursValue, hoursValue, {
          source: "dashboard",
          placement,
        });
      }
      sendSuggestionFeedback("apply_all", "accepted", null, "dashboard_prefill", {
        source: "dashboard",
        placement,
        project: visibleDashboardSuggestionAction.projectId || null,
        description: visibleDashboardSuggestionAction.suggestedDescription || null,
        hours: visibleDashboardSuggestionAction.suggestedHours ?? null,
      });
      return;
    }

    sendSuggestionFeedback("bulk_copy_prev_month", "accepted", "open_bulk_modal", "open_bulk_modal", {
      source: "dashboard",
      placement,
    });
  }, [sendSuggestionFeedback, visibleDashboardSuggestionAction]);

  const handleDismissDashboardSuggestion = useCallback((placement: "next_action") => {
    if (!visibleDashboardSuggestionAction) return;

    if (visibleDashboardSuggestionAction.kind === "prefill") {
      sendSuggestionFeedback("apply_all", "rejected", null, null, {
        source: "dashboard",
        placement,
      });
    } else {
      sendSuggestionFeedback("bulk_copy_prev_month", "rejected", "open_bulk_modal", null, {
        source: "dashboard",
        placement,
      });
    }

    dashboardTimeSuggestionVisibility.dismiss();
    setIsDashboardSuggestionDismissed(true);
  }, [dashboardTimeSuggestionVisibility, sendSuggestionFeedback, visibleDashboardSuggestionAction]);

  const handleUseDashboardCaseSuggestion = useCallback(() => {
    if (!visibleDashboardCaseSuggestionAction) return;
    caseSuggestionFeedbackMutation.mutate({
      suggestionType: "apply_all",
      outcome: "accepted",
      month: currentYearMonth,
      caseId: visibleDashboardCaseSuggestionAction.caseId,
      suggestedValue: visibleDashboardCaseSuggestionAction.prefillMode,
      chosenValue: visibleDashboardCaseSuggestionAction.prefillMode,
      metadata: {
        source: "dashboard",
        sourceMonth: visibleDashboardCaseSuggestionAction.sourceMonth,
      },
    });
    navigate(visibleDashboardCaseSuggestionAction.path);
  }, [caseSuggestionFeedbackMutation, currentYearMonth, navigate, visibleDashboardCaseSuggestionAction]);

  const handleDismissDashboardCaseSuggestion = useCallback(() => {
    if (!visibleDashboardCaseSuggestionAction) return;
    caseSuggestionFeedbackMutation.mutate({
      suggestionType: "apply_all",
      outcome: "rejected",
      month: currentYearMonth,
      caseId: visibleDashboardCaseSuggestionAction.caseId,
      suggestedValue: visibleDashboardCaseSuggestionAction.prefillMode,
      chosenValue: null,
      metadata: {
        source: "dashboard",
        sourceMonth: visibleDashboardCaseSuggestionAction.sourceMonth,
      },
    });
    dashboardCaseSuggestionVisibility.dismiss();
    setIsDashboardCaseSuggestionDismissed(true);
  }, [
    caseSuggestionFeedbackMutation,
    currentYearMonth,
    dashboardCaseSuggestionVisibility,
    visibleDashboardCaseSuggestionAction,
  ]);

  useEffect(() => {
    setIsDashboardSuggestionDismissed(false);
  }, [suggestionResetKey]);

  useEffect(() => {
    setIsDashboardCaseSuggestionDismissed(false);
  }, [caseSuggestionResetKey]);

  const myTasks: TaskCounts = useMemo(
    () => ({
      pendingApprovals: stats?.pendingApprovals ?? 0,
      myDrafts: Math.max(0, Math.round((stats?.casesThisWeek ?? 0) * 0.3)),
      assignedCases: Math.max(0, (stats?.casesThisWeek ?? 0) - Math.round((stats?.pendingApprovals ?? 0) * 0.4)),
      overdueItems: Math.max(0, Math.round((stats?.pendingApprovals ?? 0) * 0.5)),
    }),
    [stats],
  );

  const statusSignals = useMemo<StatusSignal[]>(() => {
    const missingFollowup = Math.max(0, Math.round((stats?.pendingApprovals ?? 0) * 0.6));
    const missingReports = Math.max(0, stats?.pendingApprovals ?? 0);
    const nearDeadline = Math.max(0, Math.round((stats?.casesThisWeek ?? 0) * 0.25));
    const onTrack = Math.max(0, (stats?.casesThisWeek ?? 0) - (missingFollowup + nearDeadline));

    return [
      {
        id: "missing-followup",
        tone: missingFollowup > 0 ? (missingFollowup >= 3 ? "red" : "yellow") : "green",
        label: `${missingFollowup} klientsaker uten oppfølging siste 7 dager`,
        detail: "Prioriter kontakt og oppdatering av tiltak i dag",
      },
      {
        id: "missing-reports",
        tone: missingReports > 0 ? "yellow" : "green",
        label: `${missingReports} tiltak mangler oppdatert rapport`,
        detail: "Sikre dokumentasjon før neste fagmøte",
      },
      {
        id: "near-deadline",
        tone: nearDeadline > 0 ? "yellow" : "green",
        label: `${nearDeadline} saker nær frist`,
        detail: "Gjennomgå frister og fordel oppfølging",
      },
      {
        id: "on-track",
        tone: "green" as const,
        label: `${onTrack} tiltak i rute`,
        detail: "Stabil oppfølging og dokumentasjon",
      },
    ];
  }, [stats]);

  const workerTodaySignals = useMemo<WorkerTodaySignal[]>(() => {
    const participantsToday = Math.max(0, stats?.casesThisWeek ?? 0);
    const missingNotes = Math.max(0, Math.round((stats?.pendingApprovals ?? 0) * 0.6));
    const nearDeadline = Math.max(0, Math.round((stats?.pendingApprovals ?? 0) * 0.3));
    const inRoute = Math.max(0, participantsToday - nearDeadline);

    return [
      { id: "participants-today", label: "klientsaker å følge opp", value: participantsToday, tone: participantsToday > 0 ? "green" : "yellow" },
      { id: "missing-notes", label: "notater gjenstår", value: missingNotes, tone: missingNotes > 1 ? "yellow" : "green" },
      { id: "near-deadline", label: "oppfølging nær frist", value: nearDeadline, tone: nearDeadline > 0 ? "yellow" : "green" },
      { id: "in-route", label: "klientsaker i rute", value: inRoute, tone: "green" },
    ];
  }, [stats]);

  const alerts: DashboardAlert[] = useMemo(() => {
    const items: DashboardAlert[] = [];
    if (isTiltakslederView && stats && stats.pendingApprovals > 4) {
      items.push({
        id: 10,
        type: "warning",
        title: `Tiltak mangler rapportering (${stats.pendingApprovals})`,
        description: "Viktig fordi kontinuitet i dokumentasjon påvirker faglig kvalitet. Neste steg: gå til tiltak og fordel gjennomgang.",
        action: () => navigate("/cases"),
      });
    }
    if (isTiltakslederView && stats && stats.casesThisWeek < 3) {
      items.push({
        id: 11,
        type: "info",
        title: "Lav oppfølgingsaktivitet i perioden",
        description: "Viktig fordi lange hull kan gi svakere oppfølging. Neste steg: gjennomgå klientsaker uten kontakt.",
        action: () => navigate("/cases"),
      });
    }
    if (!isTiltakslederView && stats && stats.pendingApprovals > 10) {
      items.push({
        id: 1,
        type: "warning",
        title: `${stats.pendingApprovals} ventende godkjenninger`,
        description: "Høy arbeidsmengde oppdaget",
        action: () => navigate("/time-tracking"),
      });
    }
    return items;
  }, [stats, timeRange, navigate, isTiltakslederView]);

  const recentItems = useMemo(
    () => [
      {
        id: 1,
        title: "Tidsregistrering Prosjekt A",
        type: "time" as const,
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
        status: "draft" as const,
      },
      {
        id: 2,
        title: "Månedsrapport November",
        type: "report" as const,
        timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000),
        status: "pending" as const,
      },
      {
        id: 3,
        title: "Klientmøte referat",
        type: "case" as const,
        timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
        status: "approved" as const,
      },
    ],
    [],
  );

  const activityItems = useMemo(() => {
    const actionTypeMap: Record<
      string,
      "stamp" | "approval" | "report_submitted" | "user_added"
    > = {
      time_approved: "approval",
      time_logged: "stamp",
      user_invited: "user_added",
      case_completed: "report_submitted",
    };

    return activities.map((activity) => ({
      id: activity.id,
      type: actionTypeMap[activity.action] || ("stamp" as const),
      user: activity.userName || "Ukjent bruker",
      message: activity.description,
      timestamp: activity.timestamp,
      userId: activity.userId,
    }));
  }, [activities]);

  const riskParticipants = useMemo(() => {
    const latestByUser = new Map<string, string>();

    for (const activity of activities) {
      if (!activity.userName || !activity.timestamp) continue;
      const existing = latestByUser.get(activity.userName);
      if (!existing || new Date(activity.timestamp).getTime() > new Date(existing).getTime()) {
        latestByUser.set(activity.userName, activity.timestamp);
      }
    }

    const nowMs = Date.now();
    return Array.from(latestByUser.entries())
      .map(([name, timestamp], index) => {
        const daysSince = Math.floor((nowMs - new Date(timestamp).getTime()) / (1000 * 60 * 60 * 24));
        const high = daysSince >= 7 || index % 3 === 0;
        return {
          id: `${name}-${index}`,
          name,
          reason: daysSince >= 1
            ? `Ingen registrert oppfølging på ${daysSince} dager`
            : "Mangler oppdatert plan i perioden",
          severity: high ? "hoy" as const : "moderat" as const,
        };
      })
      .filter((entry) => entry.severity === "hoy" || /mangler/i.test(entry.reason))
      .slice(0, 5);
  }, [activities]);

  const workerParticipants = useMemo<WorkerParticipant[]>(() => {
    if (riskParticipants.length > 0) {
      return riskParticipants.map((entry, index) => ({
        id: entry.id,
        name: entry.name,
        tiltak: `Tiltak ${index + 1}`,
        lastFollowupLabel: entry.reason.replace("Ingen registrert oppfølging på ", "").replace(" dager", " dager siden"),
        status: entry.severity === "hoy" ? "trenger-oppfolging" : "snart-frist",
      }));
    }

    return [
      {
        id: "worker-fallback-1",
        name: "Sak A",
        tiltak: "Arbeidsrettet oppfølging",
        lastFollowupLabel: "2 dager siden",
        status: "snart-frist",
      },
      {
        id: "worker-fallback-2",
        name: "Sak B",
        tiltak: "Hverdagsmestring",
        lastFollowupLabel: "7 dager siden",
        status: "trenger-oppfolging",
      },
      {
        id: "worker-fallback-3",
        name: "Sak C",
        tiltak: "Skole- og arbeidstiltak",
        lastFollowupLabel: "1 dag siden",
        status: "i-rute",
      },
    ];
  }, [riskParticipants]);

  const workerTaskList = useMemo(() => {
    const list = [
      "Skriv oppfølgingsnotat",
      "Registrer aktivitet",
      workerParticipants.length > 0 ? `Følg opp ${workerParticipants[0].name}` : "Følg opp sak",
      "Fullfør påbegynt rapport",
    ];
    return list;
  }, [workerParticipants]);

  const hoursData = useMemo(() => chartData?.hoursPerDay ?? DEFAULT_HOURS_DATA, [chartData]);

  const calendarHeatmapData = useMemo(() => {
    const totals = new Map<string, number>();
    for (const entry of monthEntries) {
      totals.set(entry.date, (totals.get(entry.date) ?? 0) + entry.hours);
    }
    return Array.from(totals.entries()).map(([date, hours]) => ({ date, hours }));
  }, [monthEntries]);

  const calendarActivities = useMemo(
    () =>
      monthActivities.map((activity) => ({
        id: activity.id,
        user: activity.userName || "Ukjent bruker",
        message: activity.description,
        timestamp: activity.timestamp,
        type: activity.action,
      })),
    [monthActivities],
  );

  /* ── Heatmap fetch tracking ── */
  const monthEntriesFetchCount = useIsFetching({
    queryKey: ["/api/time-entries", monthRange],
  });
  const monthActivitiesFetchCount = useIsFetching({
    queryKey: ["/api/activities", monthActivityRange],
  });
  const monthFetchCount = monthEntriesFetchCount + monthActivitiesFetchCount;

  const showHeatmapSkeleton =
    (monthEntriesLoading || monthActivitiesLoading) &&
    calendarHeatmapData.length === 0 &&
    calendarActivities.length === 0;
  const isHeatmapRefreshing =
    monthEntriesFetching ||
    monthActivitiesFetching ||
    monthFetchCount > 0 ||
    isMonthTransitioning;

  /* ═══════════════════════════════════════════════════
     Handlers
     ═══════════════════════════════════════════════════ */

  const handleTimeRangeChange = useCallback(
    (nextRange: TimeRange) => {
      if (nextRange === timeRange) return;
      setTimeRange(nextRange);
    },
    [timeRange],
  );

  const handleCalendarMonthChange = useCallback(
    (nextMonth: Date) => {
      const normalizedMonth = startOfMonth(nextMonth);
      const currentMonthStart = startOfMonth(calendarMonth);
      const direction =
        normalizedMonth.getTime() > currentMonthStart.getTime()
          ? 1
          : normalizedMonth.getTime() < currentMonthStart.getTime()
            ? -1
            : 0;

      if (isMonthTransitioning && direction !== 0) return;

      if (direction !== 0) setIsMonthTransitioning(true);

      setMonthDirection(direction);
      setCalendarMonth(normalizedMonth);
      setSelectedCalendarDate((previous) => {
        const parsedPrevious = parseISO(previous);
        if (isValid(parsedPrevious)) {
          const preferredDay = getDate(parsedPrevious);
          const nextDate = setDate(
            normalizedMonth,
            Math.min(preferredDay, getDaysInMonth(normalizedMonth)),
          );
          return format(nextDate, "yyyy-MM-dd");
        }
        const now = new Date();
        return isSameMonth(now, normalizedMonth)
          ? format(now, "yyyy-MM-dd")
          : format(normalizedMonth, "yyyy-MM-dd");
      });
    },
    [calendarMonth, isMonthTransitioning],
  );

  useEffect(() => {
    if (monthFetchCount === 0 && !monthEntriesFetching && !monthActivitiesFetching) {
      setIsMonthTransitioning(false);
    }
  }, [monthFetchCount, monthEntriesFetching, monthActivitiesFetching]);

  /* ═══════════════════════════════════════════════════
     Render
     ═══════════════════════════════════════════════════ */

  return (
    <PortalLayout>
      <div className={cn("space-y-6", prefs.compactMode && "space-y-4")} data-dash-card={prefs.cardStyle}>
        {/* ─────────── SLIM HEADER STRIP ─────────── */}
        <header className="flex flex-wrap items-center gap-2 pb-3 border-b border-border">
          <DashboardHero
            slim
            mode={isTiltakslederView ? "tiltaksleder" : isMiljoarbeiderView ? "miljoarbeider" : "default"}
            title={isTiltakslederView ? "Oppfølgingsoversikt" : isMiljoarbeiderView ? "Min arbeidsdag" : "Dashboard"}
            subtitle={isTiltakslederView ? "Status på tiltak, klientsaker og dokumentasjon" : isMiljoarbeiderView ? "Oversikt over dine klientsaker og oppfølging i dag" : undefined}
            timeRange={timeRange}
            onTimeRangeChange={handleTimeRangeChange}
            statsFetching={statsFetching}
            statsLoading={statsLoading}
            pendingApprovals={stats?.pendingApprovals ?? 0}
            lastUpdated={lastUpdated}
            userName={user?.firstName || undefined}
            navigate={navigate}
          />

          {/* ── Hours this week — non-interactive info pill ── */}
          {!isTiltakslederView && !isMiljoarbeiderView && !statsLoading && stats && timeRange === "week" && (
            <span className={cn(
              "hidden sm:inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium select-none",
              stats.totalHours < 20
                ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400"
                : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400"
            )}>
              <Clock className="h-3 w-3" />
              {stats.totalHours.toFixed(1)}t denne uken
            </span>
          )}

          {/* ── View toggle icon buttons ── */}
          <div className="flex items-center gap-0.5">
            <Button
              size="icon"
              variant={prefs.compactMode ? "secondary" : "ghost"}
              className="h-7 w-7"
              onClick={() => updatePrefs({ ...prefs, compactMode: !prefs.compactMode })}
              aria-pressed={prefs.compactMode}
              title="Kompakt visning"
            >
              <AlignJustify className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant={prefs.showTasks ? "secondary" : "ghost"}
              className="h-7 w-7"
              onClick={() => updatePrefs({ ...prefs, showTasks: !prefs.showTasks })}
              aria-pressed={prefs.showTasks}
              title="Vis oppgaver"
            >
              <ListChecks className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant={prefs.showGoals ? "secondary" : "ghost"}
              className="h-7 w-7"
              onClick={() => updatePrefs({ ...prefs, showGoals: !prefs.showGoals })}
              aria-pressed={prefs.showGoals}
              title="Vis mål"
            >
              <Target className="h-3.5 w-3.5" />
            </Button>
            {/* ── Appearance panel ── */}
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline" className="ml-1 h-7 text-xs px-2.5 gap-1.5">
                  <Paintbrush className="h-3 w-3" />
                  Utseende
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-60 p-3 space-y-4">
                {/* Theme */}
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Tema</p>
                  <div className="grid grid-cols-3 gap-1">
                    {([
                      { value: 'light', label: 'Lys', Icon: Sun },
                      { value: 'dark', label: 'Mørk', Icon: Moon },
                      { value: 'system', label: 'System', Icon: Monitor },
                    ] as const).map(({ value, label, Icon }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setTheme(value)}
                        className={cn(
                          "flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-[11px] font-medium transition-colors",
                          theme === value
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:bg-accent"
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Card style */}
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Kortstil</p>
                  <div className="grid grid-cols-3 gap-1">
                    {([
                      { value: 'default', label: 'Standard', Icon: LayoutGrid },
                      { value: 'flat', label: 'Flat', Icon: LayoutGrid },
                      { value: 'glass', label: 'Glass', Icon: LayoutGrid },
                    ] as const).map(({ value, label, Icon }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => updatePrefs({ ...prefs, cardStyle: value })}
                        className={cn(
                          "flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-[11px] font-medium transition-colors",
                          prefs.cardStyle === value
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:bg-accent"
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </header>

        {/* ─────────── STAT CARDS ─────────── */}
        <div className="grid grid-cols-1 gap-4 md:gap-5 sm:grid-cols-2 xl:grid-cols-4">
              {statsLoading ? (
                <>
                  {[1, 2, 3, 4].map((i) => (
                    <StatCard
                      key={i}
                      statId={`skeleton-${i}`}
                      title=""
                      value=""
                      icon={null}
                      loading
                    />
                  ))}
                </>
              ) : stats ? (
                <>
                  {isTiltakslederView ? (
                    <>
                      <StatCard
                        statId="active-tiltak"
                        title="Aktive tiltak"
                        value={stats.casesThisWeek}
                        icon={<Briefcase className="h-5 w-5" />}
                        trend={{ value: stats.casesTrend, isPositive: stats.casesTrend >= 0 }}
                        trendDirection="goodUp"
                        variant="primary"
                        periodLabel={TIME_RANGE_LABELS[timeRange]}
                        description="Tiltak med aktivitet i perioden"
                        noTrendLabel="Samler data…"
                        emptyLabel="Ingen aktive tiltak"
                        onClick={() => navigate("/cases")}
                      />
                      <StatCard
                        statId="tiltak-risk"
                        title="Tiltak i risiko"
                        value={Math.max(0, Math.round(stats.pendingApprovals * 0.6))}
                        icon={<ShieldAlert className="h-5 w-5" />}
                        trend={{ value: stats.approvalsTrend, isPositive: stats.approvalsTrend <= 0 }}
                        trendDirection="goodDown"
                        variant="warning"
                        periodLabel={TIME_RANGE_LABELS[timeRange]}
                        description="Tiltak med manglende oppfølging eller rapport"
                        noTrendLabel="Ingen historikk ennå"
                        emptyLabel="Ingen tiltak i risiko"
                        onClick={() => navigate("/cases")}
                      />
                      <StatCard
                        statId="reports-missing"
                        title="Rapporter mangler/venter"
                        value={stats.pendingApprovals}
                        icon={<FileText className="h-5 w-5" />}
                        trend={{ value: stats.approvalsTrend, isPositive: stats.approvalsTrend <= 0 }}
                        trendDirection="goodDown"
                        variant="info"
                        periodLabel={TIME_RANGE_LABELS[timeRange]}
                        description="Rapporter som må oppdateres eller gjennomgås"
                        noTrendLabel="Samler data…"
                        emptyLabel="Ingen rapporter som mangler"
                        onClick={() => navigate("/cases")}
                      />
                      <StatCard
                        statId="participants-without-followup"
                        title="Klientsaker uten oppfølging"
                        value={Math.max(0, Math.round(stats.pendingApprovals * 0.6))}
                        icon={<Users className="h-5 w-5" />}
                        trend={{ value: stats.usersTrend, isPositive: stats.usersTrend <= 0 }}
                        trendDirection="goodDown"
                        variant="danger"
                        periodLabel="Siste 7 dager"
                        description="Klientsaker med svakt oppfølgingsmønster i perioden"
                        noTrendLabel="Ingen historikk ennå"
                        emptyLabel="Alle klientsaker fulgt opp"
                        onClick={() => navigate("/cases")}
                      />
                    </>
                  ) : (
                    <>
                      <StatCard
                        statId="worker-participants"
                        title="Klientsaker i dag"
                        value={workerTodaySignals[0]?.value ?? 0}
                        icon={<Users className="h-5 w-5" />}
                        trend={{ value: stats.usersTrend, isPositive: stats.usersTrend >= 0 }}
                        trendDirection="goodUp"
                        variant="primary"
                        periodLabel={TIME_RANGE_LABELS[timeRange]}
                        description="Klientsaker du følger opp i perioden"
                        noTrendLabel="Samler data…"
                        emptyLabel="Ingen klientsaker i dag"
                        onClick={() => navigate("/case-reports")}
                      />
                      <StatCard
                        statId="worker-missing-notes"
                        title="Notater gjenstår"
                        value={workerTodaySignals[1]?.value ?? 0}
                        icon={<FileText className="h-5 w-5" />}
                        trend={{ value: stats.approvalsTrend, isPositive: stats.approvalsTrend <= 0 }}
                        trendDirection="goodDown"
                        variant="warning"
                        periodLabel={TIME_RANGE_LABELS[timeRange]}
                        description="Oppfølging som ikke er dokumentert ennå"
                        noTrendLabel="Ingen historikk ennå"
                        emptyLabel="Alt er dokumentert"
                        onClick={() => navigate("/case-reports")}
                      />
                      <StatCard
                        statId="worker-near-deadline"
                        title="Nær frist"
                        value={workerTodaySignals[2]?.value ?? 0}
                        icon={<AlertCircle className="h-5 w-5" />}
                        trend={{ value: stats.approvalsTrend, isPositive: stats.approvalsTrend <= 0 }}
                        trendDirection="goodDown"
                        variant="info"
                        periodLabel={TIME_RANGE_LABELS[timeRange]}
                        description="Oppfølging som bør gjøres snart"
                        noTrendLabel="Ingen historikk ennå"
                        emptyLabel="Ingen frister nå"
                        onClick={() => navigate("/case-reports")}
                      />
                      <StatCard
                        statId="worker-on-track"
                        title="I rute"
                        value={workerTodaySignals[3]?.value ?? 0}
                        icon={<Briefcase className="h-5 w-5" />}
                        trend={{ value: stats.casesTrend, isPositive: stats.casesTrend >= 0 }}
                        trendDirection="goodUp"
                        variant="success"
                        periodLabel={TIME_RANGE_LABELS[timeRange]}
                        description="Klientsaker med oppfølging som planlagt"
                        noTrendLabel="Ingen historikk ennå"
                        emptyLabel="Ingen i rute ennå"
                        onClick={() => navigate("/case-reports")}
                      />
                    </>
                  )}
                </>
              ) : null}
        </div>

        {/* ─────────── WEEK STRIP ─────────── */}
        {!isTiltakslederView && !isMiljoarbeiderView && (
          <DashboardWeekStrip
            hoursData={hoursData}
            loading={chartLoading}
          />
        )}

        {!isTiltakslederView && visibleDashboardCaseSuggestionAction && (
          <Card
            className="border-primary/25 bg-gradient-to-br from-primary/5 to-transparent"
            data-testid="dashboard-case-report-suggestion"
          >
            <CardContent className="p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary/80">Saksrapport</p>
                <p className="text-sm font-medium">{visibleDashboardCaseSuggestionAction.label}</p>
                <p className="text-xs text-muted-foreground">{visibleDashboardCaseSuggestionAction.reason}</p>
                {visibleDashboardCaseSuggestionAction.confidence != null && (
                  <p className="text-[11px] text-muted-foreground">
                    Sikkerhet: {Math.round(visibleDashboardCaseSuggestionAction.confidence * 100)}%
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={handleUseDashboardCaseSuggestion}
                  data-testid="dashboard-case-report-suggestion-apply"
                >
                  Bruk forslag
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleDismissDashboardCaseSuggestion}
                  data-testid="dashboard-case-report-suggestion-dismiss"
                >
                  Ikke nå
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ─────────── ALERTS + CTA STRIP ─────────── */}
        <div className={cn("space-y-3", prefs.compactMode && "space-y-2")}>
          {isTiltakslederView && <DashboardStatusToday signals={statusSignals} />}
          <DashboardAlerts alerts={prefs.compactMode ? alerts.slice(0, 1) : alerts} />
          {!statsLoading && stats && (
            <DashboardNextAction
              mode={isTiltakslederView ? "tiltaksleder" : isMiljoarbeiderView ? "miljoarbeider" : "default"}
              pendingApprovals={myTasks.pendingApprovals}
              overdueItems={myTasks.overdueItems}
              myDrafts={myTasks.myDrafts}
              totalHours={stats.totalHours}
              navigate={navigate}
              smartSuggestion={visibleDashboardSuggestionAction ? {
                label: visibleDashboardSuggestionAction.label,
                description: visibleDashboardSuggestionAction.description,
                path: visibleDashboardSuggestionAction.path,
              } : null}
              onUseSmartSuggestion={() => handleUseDashboardSuggestion("next_action")}
              onDismissSmartSuggestion={() => handleDismissDashboardSuggestion("next_action")}
            />
          )}
        </div>

        {isMiljoarbeiderView && (
          <DashboardWorkerMobile
            userId={user?.id || "default"}
            userName={user?.firstName || "Maria"}
            todaySignals={workerTodaySignals}
            participants={workerParticipants}
            navigate={navigate}
          />
        )}

        {isMiljoarbeiderView && prefs.showTasks && workerTaskList.length > 0 && (
          <Card className="rounded-2xl border-border bg-card shadow-sm md:hidden">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4 text-primary" />
                Dagens gjøremål
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ul className="space-y-2">
                {workerTaskList.map((task, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />
                    {task}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* ─────────── TASKS + GOALS | ACTIVITY ─────────── */}
        <section className={cn("grid gap-6", (prefs.showTasks || prefs.showGoals) && "xl:grid-cols-2", prefs.compactMode && "gap-4", isMiljoarbeiderView && "hidden md:grid")}>
          {(prefs.showTasks || prefs.showGoals) && (
            <div className={cn("space-y-6", prefs.compactMode && "space-y-4")}>
              {prefs.showTasks && (
                <DashboardTasks
                  tasks={myTasks}
                  navigate={navigate}
                  mode={isTiltakslederView ? "tiltaksleder" : isMiljoarbeiderView ? "miljoarbeider" : "default"}
                />
              )}
              {prefs.showGoals && <DashboardGoals stats={stats} mode={isTiltakslederView ? "tiltaksleder" : "default"} />}
            </div>
          )}
          <DashboardActivity
            mode={isTiltakslederView ? "tiltaksleder" : isMiljoarbeiderView ? "miljoarbeider" : "default"}
            recentItems={recentItems}
            activityItems={activityItems}
            activitiesLoading={activitiesLoading}
            currentUserId={user?.id}
            navigate={navigate}
          />
        </section>

        {isTiltakslederView && (
          <DashboardRiskParticipants participants={riskParticipants} navigate={navigate} />
        )}

      </div>
    </PortalLayout>
  );
}
