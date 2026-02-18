import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { 
  FileText, 
  Plus, 
  Edit, 
  Send, 
  AlertTriangle,
  Info,
  MessageCircle,
  BarChart3,
  Download,
  ShieldAlert,
  Save,
  CheckCircle2,
  Wand2,
} from "lucide-react";
import { PortalLayout } from "@/components/portal/portal-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RotateCcw, Trash2 } from "lucide-react";
import { AdvancedCaseReportBuilder } from "@/components/cms/advanced-case-report-builder";
import { CaseAnalyticsDashboard } from "@/components/cms/case-analytics-dashboard";
import { CaseReportExport } from "@/components/cms/case-report-export";
import { useToast } from "@/hooks/use-toast";
import { usePiiDetection } from "@/hooks/use-pii-detection";
import { useDraft } from "@/hooks/use-draft";
import { getPiiTypeLabel, getPiiSeverity, ANONYMOUS_ALTERNATIVES, type PiiWarning } from "@/lib/pii-detector";
import { PiiSummaryBanner, PiiSummaryDrawer, type PiiIssue } from "@/components/pii-summary-drawer";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { REPORT_TEMPLATES } from "@/lib/report-templates";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import type { CaseReport, ReportStatus } from "@shared/schema";

type CaseReportResponse = {
  reports: CaseReport[];
};

const statusColors: Record<ReportStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  submitted: "bg-warning/10 text-warning border-warning/20",
  needs_revision: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  approved: "bg-success/10 text-success border-success/20",
  rejected: "bg-destructive/10 text-destructive border-destructive/20",
};

const statusLabels: Record<ReportStatus, string> = {
  draft: "Utkast",
  submitted: "Sendt inn",
  needs_revision: "Trenger revisjon",
  approved: "Godkjent",
  rejected: "Avslått",
};



type ReportComment = {
  id: number;
  report_id: number;
  author_id: string;
  author_name: string | null;
  author_role: string;
  content: string;
  is_internal: boolean;
  parent_id: number | null;
  read_at: string | null;
  created_at: string;
  updated_at: string;
};

const emptyFormData = {
  case_id: "",
  month: format(new Date(), "yyyy-MM"), // default to current month
  background: "",
  actions: "",
  progress: "",
  challenges: "",
  factors: "",
  assessment: "",
  recommendations: "",
  notes: "",
};

/** Check whether form data has meaningful content worth persisting */
function formHasContent(data: typeof emptyFormData): boolean {
  return (
    Object.entries(data).some(
      ([key, val]) =>
        key !== 'case_id' && key !== 'month' && val && val.replace(/<[^>]*>/g, '').trim().length > 0,
    ) ||
    !!data.case_id ||
    !!data.month
  );
}

/** Inline PII warning wrapper for individual form fields */
function PiiFieldWrapper({ 
  fieldName, 
  label, 
  fieldResults, 
  children 
}: { 
  fieldName: string; 
  label: string; 
  fieldResults: Record<string, import('@/lib/pii-detector').PiiScanResult>; 
  children: React.ReactNode;
}) {
  const result = fieldResults[fieldName];
  const hasWarnings = result?.hasPii;
  const highConfCount = result?.warnings.filter(w => w.confidence === 'high').length || 0;

  // Ring color based on highest confidence
  const ringClass = hasWarnings
    ? result.maxConfidence === 'high'
      ? "ring-2 ring-destructive/60 rounded-md"
      : "ring-2 ring-amber-500/50 rounded-md"
    : "";

  return (
    <div className="space-y-2">
      <Label htmlFor={fieldName} className={hasWarnings ? (highConfCount > 0 ? "text-destructive" : "text-amber-600 dark:text-amber-400") : ""}>
        {label}
        {hasWarnings && (
          <span className={`ml-2 text-xs font-normal ${highConfCount > 0 ? 'text-destructive' : 'text-amber-600 dark:text-amber-400'}`}>
            ({result.warnings.length} {result.warnings.length === 1 ? 'advarsel' : 'advarsler'}
            {highConfCount > 0 && ` — ${highConfCount} høy sikkerhet`})
          </span>
        )}
      </Label>
      <div className={ringClass}>
        {children}
      </div>
      {hasWarnings && (
        <div className="space-y-1">
          {result.warnings
            .sort((a, b) => {
              const order = { high: 0, medium: 1, low: 2 };
              return order[a.confidence] - order[b.confidence];
            })
            .map((w, i) => {
              const isHigh = w.confidence === 'high';
              const bgClass = isHigh
                ? 'bg-destructive/5 text-destructive'
                : 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300';
              const iconColor = isHigh ? 'text-destructive' : 'text-amber-500';
              
              return (
                <div key={i} className={`flex items-start gap-2 text-xs rounded px-2 py-1.5 ${bgClass}`}>
                  <AlertTriangle className={`h-3 w-3 mt-0.5 flex-shrink-0 ${iconColor}`} />
                  <div className="flex-1">
                    <span className="font-medium">{w.message}</span>
                    <span className={`ml-1.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                      isHigh ? 'bg-destructive/10 text-destructive' : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                    }`}>
                      {w.confidence === 'high' ? 'Kritisk' : w.confidence === 'medium' ? 'Gjennomgå' : 'Til info'}
                    </span>
                    <br />
                    <span className="text-muted-foreground">{w.suggestion}</span>
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

// ─── Section progress indicator ──────────────────────────────────────────────

const FORM_SECTIONS = [
  { key: "background", label: "Bakgrunn", required: true },
  { key: "actions", label: "Tiltak", required: true },
  { key: "progress", label: "Fremgang", required: false },
  { key: "challenges", label: "Utfordringer", required: false },
  { key: "factors", label: "Faktorer", required: false },
  { key: "assessment", label: "Vurdering", required: true },
  { key: "recommendations", label: "Anbefalinger", required: false },
] as const;

const REQUIRED_SECTIONS = FORM_SECTIONS.filter((s) => s.required).map((s) => s.key);

function sectionHasContent(html: string): boolean {
  if (!html) return false;
  return html.replace(/<[^>]*>/g, "").trim().length > 0;
}

/** Check whether all required sections are filled */
function isReadyToSubmit(formData: typeof emptyFormData): boolean {
  return REQUIRED_SECTIONS.every((key) =>
    sectionHasContent((formData as any)[key]),
  );
}

function SectionProgress({ formData }: { formData: typeof emptyFormData }) {
  const filled = FORM_SECTIONS.filter((s) =>
    sectionHasContent((formData as any)[s.key]),
  ).length;
  const pct = Math.round((filled / FORM_SECTIONS.length) * 100);

  return (
    <div className="space-y-2">
      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              pct === 100 ? "bg-green-500" : pct >= 50 ? "bg-primary" : "bg-amber-500"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
          {filled}/{FORM_SECTIONS.length} seksjoner
        </span>
      </div>

      {/* Section chips */}
      <div className="flex items-center gap-1 overflow-x-auto py-1">
        {FORM_SECTIONS.map((s) => {
          const done = sectionHasContent((formData as any)[s.key]);
          return (
            <span
              key={s.key}
              className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                done
                  ? "bg-primary/10 text-primary"
                  : s.required
                    ? "bg-destructive/5 text-destructive/70 border border-dashed border-destructive/20"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${
                  done ? "bg-primary" : s.required ? "bg-destructive/40" : "bg-muted-foreground/40"
                }`}
              />
              {s.label}
              {s.required && !done && <span className="text-[9px]">*</span>}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export default function CaseReportsPage() {
  const [location] = useLocation();
  const isCasesRoute = location === "/cases";
  const { toast } = useToast();
  const [editingReport, setEditingReport] = useState<CaseReport | null>(null);
  const [formData, setFormData] = useState(emptyFormData);
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false);
  const [selectedFeedbackReport, setSelectedFeedbackReport] = useState<CaseReport | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [reportsToExport, setReportsToExport] = useState<CaseReport[]>([]);
  const [activeTab, setActiveTab] = useState<string>("reports");
  const [analyticsTimeRange, setAnalyticsTimeRange] = useState<"7d" | "30d" | "90d" | "12m" | "all">("30d");
  const [statusFilter, setStatusFilter] = useState<ReportStatus | null>(null);
  const [piiDismissed, setPiiDismissed] = useState(false);
  const [piiDismissReason, setPiiDismissReason] = useState<string | null>(null);
  const [piiDismissDialogOpen, setPiiDismissDialogOpen] = useState(false);
  const [piiDrawerOpen, setPiiDrawerOpen] = useState(false);
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const [submitConfirmReportId, setSubmitConfirmReportId] = useState<number | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const currentUserId = "default"; // TODO: Get from auth context

  // PII Detection — scan on blur / save, not every keystroke
  const { fieldResults, totalWarnings, hasPii, scanFields, scanFieldsNow, isPending: piiScanning } = usePiiDetection({ debounceMs: 1500 });

  // --- Draft persistence (extracted hook) ---
  const {
    draftDialogOpen,
    pendingDraft,
    restoreDraft: restoreDraftRaw,
    discardDraft,
    clearDraft,
  } = useDraft<typeof emptyFormData>({
    storageKey: "tidum_case_report_draft",
    formData,
    isFormOpen: showForm,
    editingId: editingReport?.id ?? null,
    hasContent: formHasContent,
  });

  // Build the fields map once and reuse it
  const piiFieldsMap = useCallback((data: typeof formData) => ({
    background: data.background,
    actions: data.actions,
    progress: data.progress,
    challenges: data.challenges,
    factors: data.factors,
    assessment: data.assessment,
    recommendations: data.recommendations,
    notes: data.notes,
  }), []);

  // Debounced scan (used during typing — long debounce)
  const triggerPiiScan = useCallback((data: typeof formData) => {
    scanFields(piiFieldsMap(data));
  }, [scanFields, piiFieldsMap]);

  // Immediate scan (used on blur / save)
  const triggerPiiScanNow = useCallback((data?: typeof formData) => {
    scanFieldsNow(piiFieldsMap(data ?? formData));
  }, [scanFieldsNow, piiFieldsMap, formData]);

  const restoreDraft = useCallback(() => {
    const draft = restoreDraftRaw();
    if (!draft) return;
    setFormData(draft.formData);
    setShowForm(true);
    triggerPiiScan(draft.formData);
    toast({ title: "Utkast gjenopprettet", description: "Du kan fortsette der du slapp." });
  }, [restoreDraftRaw, triggerPiiScan, toast]);

  // Wrapper to update form data (PII scan deferred to blur)
  const updateField = useCallback((field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  // Blur handler — triggers immediate PII scan
  const handleFieldBlur = useCallback(() => {
    triggerPiiScanNow();
  }, [triggerPiiScanNow]);

  // ── One-click PII anonymization ──────────────────────────────────────────
  const handlePiiReplace = useCallback(
    (field: string, match: string, replacement: string) => {
      setFormData((prev) => {
        const current = (prev as any)[field] as string;
        if (!current) return prev;
        // Replace in both plain text and HTML (the match may sit inside tags)
        const escaped = match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const updated = current.replace(new RegExp(escaped, 'gi'), replacement);
        const next = { ...prev, [field]: updated };
        triggerPiiScan(next);
        return next;
      });
    },
    [triggerPiiScan],
  );

  const handlePiiReplaceAll = useCallback(
    (issues: PiiIssue[]) => {
      setFormData((prev) => {
        let next = { ...prev };
        for (const issue of issues) {
          const current = (next as any)[issue.field] as string;
          if (!current) continue;
          const escaped = issue.warning.match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          (next as any)[issue.field] = current.replace(
            new RegExp(escaped, 'gi'),
            issue.warning.suggestion,
          );
        }
        triggerPiiScan(next);
        return next;
      });
      toast({ title: "Erstattet", description: `${issues.length} personopplysninger ble anonymisert.` });
    },
    [triggerPiiScan, toast],
  );

  const { data: reportsData, isLoading } = useQuery<CaseReportResponse>({
    queryKey: ["/api/case-reports"],
  });

  const reports = reportsData?.reports || [];

  // Duplicate detection: warn if a report already exists for this case_id + month
  const duplicateReport = useMemo(() => {
    if (editingReport || !formData.case_id || !formData.month) return null;
    return reports.find(
      (r) => r.caseId === formData.case_id && r.month === formData.month,
    ) ?? null;
  }, [reports, formData.case_id, formData.month, editingReport]);

  // Fetch comments for selected report
  const { data: comments, refetch: refetchComments } = useQuery<ReportComment[]>({
    queryKey: ["/api/case-reports", selectedFeedbackReport?.id, "comments"],
    queryFn: async () => {
      if (!selectedFeedbackReport?.id) return [];
      const res = await apiRequest("GET", `/api/case-reports/${selectedFeedbackReport.id}/comments`);
      return res.json();
    },
    enabled: !!selectedFeedbackReport?.id && feedbackDialogOpen,
  });

  // Add comment mutation with optimistic update
  const addCommentMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!selectedFeedbackReport) throw new Error("No report selected");
      return apiRequest("POST", `/api/case-reports/${selectedFeedbackReport.id}/comments`, {
        author_id: currentUserId,
        author_name: "Bruker",
        author_role: "user",
        content,
      });
    },
    onMutate: async (content: string) => {
      // Optimistic: append a temporary comment immediately
      const queryKey = ["/api/case-reports", selectedFeedbackReport?.id, "comments"];
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<ReportComment[]>(queryKey);
      const optimistic: ReportComment = {
        id: -Date.now(), // temp negative id
        report_id: selectedFeedbackReport?.id ?? 0,
        author_id: currentUserId,
        author_name: "Bruker",
        author_role: "user",
        content,
        is_internal: false,
        parent_id: null,
        read_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      queryClient.setQueryData<ReportComment[]>(queryKey, (old) => [...(old ?? []), optimistic]);
      setNewComment("");
      return { previous };
    },
    onError: (_error: any, _content: string, context: any) => {
      // Rollback on error
      if (context?.previous) {
        const queryKey = ["/api/case-reports", selectedFeedbackReport?.id, "comments"];
        queryClient.setQueryData(queryKey, context.previous);
      }
      toast({ title: "Feil", description: "Kunne ikke sende kommentar.", variant: "destructive" });
    },
    onSettled: () => {
      refetchComments();
      queryClient.invalidateQueries({ queryKey: ["/api/case-reports"] });
    },
    onSuccess: () => {
      toast({ title: "Sendt", description: "Kommentaren din er sendt." });
    },
  });

  // Mark comments as read when dialog opens
  useEffect(() => {
    if (feedbackDialogOpen && selectedFeedbackReport?.id) {
      apiRequest("POST", `/api/case-reports/${selectedFeedbackReport.id}/comments/mark-read`, {
        reader_id: currentUserId,
      }).catch(() => {
        // Silently ignore — non-critical
      });
    }
  }, [feedbackDialogOpen, selectedFeedbackReport?.id]);

  const saveMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      if (editingReport) {
        return apiRequest("PUT", `/api/case-reports/${editingReport.id}`, data);
      } else {
        return apiRequest("POST", "/api/case-reports", { ...data, user_id: "default" });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/case-reports"] });
      setEditingReport(null);
      setFormData(emptyFormData);
      setShowForm(false);
      clearDraft();
      toast({ 
        title: editingReport ? "Oppdatert" : "Lagret", 
        description: editingReport ? "Rapporten er oppdatert." : "Utkast er lagret." 
      });
    },
    onError: (error: any) => {
      toast({ 
        title: "Feil", 
        description: error?.message || "Kunne ikke lagre rapporten.", 
        variant: "destructive" 
      });
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (reportId: number) => {
      return apiRequest("POST", `/api/case-reports/${reportId}/submit`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/case-reports"] });
      clearDraft();
      toast({ title: "Sendt inn", description: "Rapporten er sendt inn for godkjenning." });
    },
    onError: (error: any) => {
      toast({ 
        title: "Feil", 
        description: error?.message || "Kunne ikke sende inn rapporten.", 
        variant: "destructive" 
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (reportId: number) => {
      return apiRequest("DELETE", `/api/case-reports/${reportId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/case-reports"] });
      toast({ title: "Slettet", description: "Rapporten er slettet." });
    },
  });

  const startEdit = (report: CaseReport) => {
    setEditingReport(report);
    setFormData({
      case_id: report.caseId,
      month: report.month,
      background: report.background || "",
      actions: report.actions || "",
      progress: report.progress || "",
      challenges: report.challenges || "",
      factors: report.factors || "",
      assessment: report.assessment || "",
      recommendations: report.recommendations || "",
      notes: report.notes || "",
    });
    setShowForm(true);
    toast({ title: "Redigerer", description: "Utkast åpnet for redigering." });
  };

  const handleSubmit = (reportId: number) => {
    if (hasPii && !piiDismissed) {
      toast({ 
        title: "Kan ikke sende inn", 
        description: "Rapporten inneholder mulige personopplysninger. Fjern disse før innsending.", 
        variant: "destructive" 
      });
      return;
    }
    if (!isReadyToSubmit(formData)) {
      toast({
        title: "Ufullstendig rapport",
        description: "Du må fylle ut Bakgrunn, Tiltak og Vurdering før innsending.",
        variant: "destructive",
      });
      return;
    }
    setSubmitConfirmOpen(true);
    setSubmitConfirmReportId(reportId);
  };

  const openFeedbackDialog = (report: CaseReport) => {
    setSelectedFeedbackReport(report);
    setFeedbackDialogOpen(true);
  };

  const handleViewReport = (report: CaseReport) => {
    openFeedbackDialog(report);
  };

  const handleExportReports = (reports: CaseReport[], _format: string) => {
    setReportsToExport(reports);
    setExportDialogOpen(true);
  };

  const handleBulkStatusChange = async (reportIds: number[], newStatus: string) => {
    try {
      // In a real app, implement bulk update API
      toast({ 
        title: "Oppdaterer", 
        description: `Oppdaterer status for ${reportIds.length} rapporter...` 
      });
      
      // For now, just show success
      setTimeout(() => {
        toast({ 
          title: "Oppdatert", 
          description: `${reportIds.length} rapporter oppdatert til ${newStatus}` 
        });
      }, 1000);
    } catch (error) {
      toast({ 
        title: "Feil", 
        description: "Kunne ikke oppdatere rapporter", 
        variant: "destructive" 
      });
    }
  };

  const formatDateTime = (dateStr: string | Date | null) => {
    if (!dateStr) return "";
    return format(new Date(dateStr), "d. MMMM yyyy 'kl.' HH:mm", { locale: nb });
  };

  const handleSave = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!formData.case_id || !formData.month) {
      toast({ title: "Feil", description: "Saksnummer og måned er påkrevd.", variant: "destructive" });
      return;
    }
    // Run immediate PII scan before save
    triggerPiiScanNow();
    if (hasPii && !piiDismissed) {
      setPiiDismissDialogOpen(true);
      return;
    }
    saveMutation.mutate(formData);
  };

  const cancelEdit = () => {
    setEditingReport(null);
    setFormData(emptyFormData);
    setShowForm(false);
    clearDraft();
  };

  return (
    <PortalLayout>
      {/* Restore draft dialog */}
      <Dialog open={draftDialogOpen} onOpenChange={(open) => { if (!open) discardDraft(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-primary" />
              Uferdig utkast funnet
            </DialogTitle>
            <DialogDescription>
              {pendingDraft && (
                <>
                  Du har et ulagret utkast fra{" "}
                  <span className="font-medium text-foreground">
                    {format(new Date(pendingDraft.savedAt), "d. MMMM yyyy 'kl.' HH:mm", { locale: nb })}
                  </span>.
                  {pendingDraft.formData.case_id && (
                    <> Sak: <span className="font-medium text-foreground">{pendingDraft.formData.case_id}</span>.</>
                  )}
                  {" "}Vil du fortsette der du slapp?
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button variant="outline" onClick={discardDraft} className="gap-2">
              <Trash2 className="h-4 w-4" />
              Forkast
            </Button>
            <Button onClick={restoreDraft} className="gap-2">
              <RotateCcw className="h-4 w-4" />
              Fortsett
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold" data-testid="text-page-title">
              {isCasesRoute ? "Saker" : "Mine saksrapporter"}
            </h1>
            <p className="text-muted-foreground">
              {isCasesRoute
                ? "Oversikt over saker og tilhørende rapportering"
                : "Skriv og administrer månedlige saksrapporter med avanserte verktøy"}
            </p>
          </div>
          {!showForm && (
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                onClick={() => handleExportReports(reports, "pdf")}
                disabled={reports.length === 0}
              >
                <Download className="h-4 w-4 mr-2" />
                Eksporter
              </Button>
              <Button onClick={() => setShowForm(true)} data-testid="button-new-report">
                <Plus className="h-4 w-4 mr-2" />
                Ny rapport
              </Button>
            </div>
          )}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="reports" className="gap-2">
              <FileText className="h-4 w-4" />
              Rapporter
            </TabsTrigger>
            <TabsTrigger value="analytics" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Analyse
            </TabsTrigger>
          </TabsList>

          <TabsContent value="reports" className="space-y-6">
            {showForm ? (
          <Card>
            <CardHeader>
              <CardTitle>{editingReport ? "Rediger rapport" : "Ny saksrapport"}</CardTitle>
              <CardDescription>
                {editingReport ? "Oppdater rapporten og lagre endringene." : "Fyll ut felene og lagre som utkast."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSave} className="space-y-4">
                {/* Compact GDPR reminder */}
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/10 px-4 py-2.5 text-sm text-amber-700 dark:text-amber-400">
                  <ShieldAlert className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>
                    Unngå personnavn, fødselsdato, adresser og andre personopplysninger.
                    Bruk «brukeren», «ungdom», «gutten/jenta» i stedet.
                  </span>
                </div>

                {/* PII Summary Banner — click opens the drawer */}
                {!piiDismissed && (
                  <PiiSummaryBanner
                    totalWarnings={totalWarnings}
                    highCount={Object.values(fieldResults).flatMap(r => r.warnings).filter(w => w.confidence === 'high').length}
                    onClick={() => setPiiDrawerOpen(true)}
                    isPending={piiScanning}
                  />
                )}

                {/* PII Summary Drawer (side panel) */}
                <PiiSummaryDrawer
                  open={piiDrawerOpen}
                  onOpenChange={setPiiDrawerOpen}
                  fieldResults={fieldResults}
                  onReplace={handlePiiReplace}
                  onReplaceAll={handlePiiReplaceAll}
                />

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="case_id">Saksnummer *</Label>
                    <Input
                      id="case_id"
                      value={formData.case_id}
                      onChange={(e) => setFormData({ ...formData, case_id: e.target.value })}
                      placeholder="F.eks. SAK-2024-001"
                      disabled={!!editingReport}
                      data-testid="input-case-id"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="month">Måned *</Label>
                    <Input
                      id="month"
                      type="month"
                      value={formData.month}
                      onChange={(e) => setFormData({ ...formData, month: e.target.value })}
                      disabled={!!editingReport}
                      data-testid="input-month"
                    />
                  </div>
                </div>

                {/* Duplicate report warning */}
                {duplicateReport && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Duplikat oppdaget</AlertTitle>
                    <AlertDescription>
                      Det finnes allerede en rapport for sak <strong>{duplicateReport.caseId}</strong> i{" "}
                      <strong>{duplicateReport.month}</strong> (status: {statusLabels[duplicateReport.status as ReportStatus] ?? duplicateReport.status}).
                      Vil du heller redigere den eksisterende rapporten?
                      <Button
                        variant="ghost"
                        className="px-1 h-auto text-primary underline"
                        onClick={() => startEdit(duplicateReport)}
                      >
                        Åpne eksisterende rapport
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}

                {/* Section progress indicator */}
                <SectionProgress formData={formData} />

                {/* Template selector */}
                {!editingReport && (
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground whitespace-nowrap">Mal:</Label>
                    <Select
                      onValueChange={(templateId) => {
                        const template = REPORT_TEMPLATES.find((t) => t.id === templateId);
                        if (!template) return;
                        setFormData((prev) => {
                          const next = { ...prev };
                          for (const [key, value] of Object.entries(template.content)) {
                            if (value && !sectionHasContent((next as any)[key])) {
                              (next as any)[key] = value;
                            }
                          }
                          return next;
                        });
                        toast({
                          title: "Mal brukt",
                          description: `«${template.label}» ble satt inn i tomme seksjoner.`,
                        });
                      }}
                    >
                      <SelectTrigger className="w-[240px] h-8 text-xs">
                        <Wand2 className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                        <SelectValue placeholder="Velg en rapportmal..." />
                      </SelectTrigger>
                      <SelectContent>
                        {REPORT_TEMPLATES.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            <div>
                              <span className="font-medium">{t.label}</span>
                              <span className="ml-2 text-xs text-muted-foreground">{t.description}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <PiiFieldWrapper fieldName="background" label="Bakgrunn for tiltaket" fieldResults={fieldResults}>
                  <RichTextEditor
                    value={formData.background}
                    onChange={(value) => updateField('background', value)}
                    onBlur={handleFieldBlur}
                    placeholder="Beskriv bakgrunnen for tiltaket... (ikke bruk personnavn)"
                    minHeight="120px"
                    testId="editor-background"
                  />
                </PiiFieldWrapper>

                <PiiFieldWrapper fieldName="actions" label="Arbeid og tiltak som er gjennomført" fieldResults={fieldResults}>
                  <RichTextEditor
                    value={formData.actions}
                    onChange={(value) => updateField('actions', value)}
                    onBlur={handleFieldBlur}
                    placeholder="Beskriv arbeidet som er gjennomført... (bruk «brukeren», «ungdom» osv.)"
                    minHeight="150px"
                    testId="editor-actions"
                  />
                </PiiFieldWrapper>

                <PiiFieldWrapper fieldName="progress" label="Fremgang og utvikling" fieldResults={fieldResults}>
                  <RichTextEditor
                    value={formData.progress}
                    onChange={(value) => updateField('progress', value)}
                    onBlur={handleFieldBlur}
                    placeholder="Beskriv fremgangen... (ikke bruk personnavn)"
                    minHeight="120px"
                    testId="editor-progress"
                  />
                </PiiFieldWrapper>

                <PiiFieldWrapper fieldName="challenges" label="Utfordringer" fieldResults={fieldResults}>
                  <RichTextEditor
                    value={formData.challenges}
                    onChange={(value) => updateField('challenges', value)}
                    onBlur={handleFieldBlur}
                    placeholder="Beskriv eventuelle utfordringer... (bruk «gutten», «jenta» osv.)"
                    minHeight="120px"
                    testId="editor-challenges"
                  />
                </PiiFieldWrapper>

                <PiiFieldWrapper fieldName="factors" label="Faktorer som påvirker" fieldResults={fieldResults}>
                  <RichTextEditor
                    value={formData.factors}
                    onChange={(value) => updateField('factors', value)}
                    onBlur={handleFieldBlur}
                    placeholder="Beskriv faktorer som påvirker... (ikke bruk personnavn)"
                    minHeight="100px"
                    testId="editor-factors"
                  />
                </PiiFieldWrapper>

                <PiiFieldWrapper fieldName="assessment" label="Vurdering" fieldResults={fieldResults}>
                  <RichTextEditor
                    value={formData.assessment}
                    onChange={(value) => updateField('assessment', value)}
                    onBlur={handleFieldBlur}
                    placeholder="Din vurdering... (bruk «brukeren», «klienten» osv.)"
                    minHeight="120px"
                    testId="editor-assessment"
                  />
                </PiiFieldWrapper>

                <PiiFieldWrapper fieldName="recommendations" label="Anbefalinger" fieldResults={fieldResults}>
                  <RichTextEditor
                    value={formData.recommendations}
                    onChange={(value) => updateField('recommendations', value)}
                    onBlur={handleFieldBlur}
                    placeholder="Dine anbefalinger... (ikke bruk personnavn)"
                    minHeight="120px"
                    testId="editor-recommendations"
                  />
                </PiiFieldWrapper>

                <PiiFieldWrapper fieldName="notes" label="Notater (valgfritt)" fieldResults={fieldResults}>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => updateField('notes', e.target.value)}
                    onBlur={handleFieldBlur}
                    placeholder="Eventulle notater... (ikke inkluder personnavn eller personopplysninger)"
                    rows={2}
                    data-testid="input-notes"
                  />
                </PiiFieldWrapper>

                {/* Spacer so sticky bar doesn't overlap content */}
                <div className="h-20" />
              </form>

              {/* Sticky action bar */}
              <div className="sticky bottom-0 z-10 -mx-6 -mb-6 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 px-6 py-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <Button
                    type="button"
                    onClick={handleSave}
                    disabled={saveMutation.isPending || (hasPii && !piiDismissed)}
                    data-testid="button-save-report"
                    className="gap-2"
                  >
                    <Save className="h-4 w-4" />
                    {saveMutation.isPending ? "Lagrer..." : (editingReport ? "Oppdater" : "Lagre utkast")}
                  </Button>
                  {editingReport && (
                    <Button
                      type="button"
                      variant="secondary"
                      className="gap-2"
                      disabled={submitMutation.isPending || (hasPii && !piiDismissed)}
                      onClick={() => handleSubmit(editingReport.id)}
                    >
                      <Send className="h-4 w-4" />
                      {submitMutation.isPending ? "Sender..." : "Send inn"}
                    </Button>
                  )}
                  <Button type="button" variant="outline" onClick={cancelEdit} data-testid="button-cancel">
                    Avbryt
                  </Button>

                  {/* PII status chip — accessible live region */}
                  <div className="ml-auto flex items-center gap-2" aria-live="polite" aria-atomic="true">
                    {piiScanning && (
                      <span className="text-xs text-muted-foreground animate-pulse" role="status">Skanner…</span>
                    )}
                    {hasPii && !piiDismissed ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive gap-1.5 h-8"
                        onClick={() => setPiiDrawerOpen(true)}
                      >
                        <ShieldAlert className="h-4 w-4" />
                        {totalWarnings} PII
                      </Button>
                    ) : !piiScanning && totalWarnings === 0 && formHasContent(formData) ? (
                      <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Ingen PII
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
            ) : (
              <>
                {isLoading ? (
                  <div className="grid md:grid-cols-2 gap-4">
                    {[1, 2, 3, 4].map((i) => (
                      <Card key={i}>
                        <CardContent className="p-6">
                          <Skeleton className="h-6 w-32 mb-2" />
                          <Skeleton className="h-4 w-24 mb-4" />
                          <Skeleton className="h-8 w-full" />
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <AdvancedCaseReportBuilder
                    reports={reports}
                    onViewReport={handleViewReport}
                    onEditReport={startEdit}
                    onExportReports={handleExportReports}
                    onBulkStatusChange={handleBulkStatusChange}
                    externalStatusFilter={statusFilter}
                    onCreateNew={() => setShowForm(true)}
                  />
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="analytics" className="space-y-6">
            {isLoading ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {[1, 2, 3, 4].map((i) => (
                  <Card key={i}>
                    <CardContent className="p-6">
                      <Skeleton className="h-4 w-20 mb-2" />
                      <Skeleton className="h-8 w-16 mb-1" />
                      <Skeleton className="h-3 w-32" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <CaseAnalyticsDashboard 
                reports={reports} 
                timeRange={analyticsTimeRange}
                onTimeRangeChange={setAnalyticsTimeRange}
                onFilterByStatus={(status) => {
                  setStatusFilter(status as ReportStatus);
                  setActiveTab("reports");
                  toast({
                    title: "Filter anvendt",
                    description: `Viser rapporter med status: ${status}`,
                  });
                }}
              />
            )}
          </TabsContent>
        </Tabs>

        {/* Export Dialog */}
        <CaseReportExport
          reports={reportsToExport.length > 0 ? reportsToExport : reports}
          open={exportDialogOpen}
          onOpenChange={setExportDialogOpen}
        />

        <Dialog open={feedbackDialogOpen} onOpenChange={setFeedbackDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Tilbakemelding på rapport</DialogTitle>
              <DialogDescription>
                {selectedFeedbackReport?.caseId} - {selectedFeedbackReport?.month}
              </DialogDescription>
            </DialogHeader>

            {selectedFeedbackReport && (
              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                {/* Status badge */}
                <div className="flex items-center gap-2">
                  <Badge className={statusColors[selectedFeedbackReport.status as ReportStatus] ?? ""}>
                    {statusLabels[selectedFeedbackReport.status as ReportStatus] ?? selectedFeedbackReport.status}
                  </Badge>
                  {selectedFeedbackReport.approvedAt && (
                    <span className="text-sm text-muted-foreground">
                      Godkjent {formatDateTime(selectedFeedbackReport.approvedAt)}
                    </span>
                  )}
                </div>

                {/* Rejection info if rejected */}
                {(selectedFeedbackReport.status === "rejected" || selectedFeedbackReport.rejectionReason) && (
                  <>
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Rapporten er avslått</AlertTitle>
                      <AlertDescription>
                        Din rapport har blitt gjennomgått og krever endringer før den kan godkjennes.
                      </AlertDescription>
                    </Alert>

                    <div className="bg-destructive/5 border border-destructive/20 rounded-md p-4">
                      <h4 className="font-medium text-destructive mb-2">Årsak til avslag</h4>
                      <p className="whitespace-pre-wrap">{selectedFeedbackReport.rejectionReason}</p>
                    </div>

                    <div className="text-sm text-muted-foreground">
                      <p><strong>Avslått av:</strong> {selectedFeedbackReport.rejectedBy || "Administrator"}</p>
                      <p><strong>Dato:</strong> {formatDateTime(selectedFeedbackReport.rejectedAt)}</p>
                    </div>
                  </>
                )}

                {/* Comments section */}
                <div className="border-t pt-4">
                  <h4 className="font-medium mb-3 flex items-center gap-2">
                    <MessageCircle className="h-4 w-4" />
                    Tilbakemeldinger og diskusjon
                  </h4>
                  
                  {comments && comments.length > 0 ? (
                    <div className="space-y-3 mb-4">
                      {comments.map((comment) => (
                        <div 
                          key={comment.id} 
                          className={`p-3 rounded-md ${
                            comment.author_role === "admin" 
                              ? "bg-primary/5 border-l-2 border-primary" 
                              : "bg-muted"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-sm font-medium">
                              {comment.author_name || comment.author_id}
                              {comment.author_role === "admin" && (
                                <Badge variant="outline" className="ml-2 text-xs">Admin</Badge>
                              )}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {formatDateTime(comment.created_at)}
                            </span>
                          </div>
                          <p className="text-sm whitespace-pre-wrap">{comment.content}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground mb-4">Ingen kommentarer ennå.</p>
                  )}

                  {/* Add comment form */}
                  <div className="space-y-2">
                    <Textarea
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Skriv en kommentar eller still et spørsmål..."
                      rows={2}
                      data-testid="input-new-comment"
                    />
                    <Button 
                      size="sm" 
                      onClick={() => addCommentMutation.mutate(newComment)}
                      disabled={!newComment.trim() || addCommentMutation.isPending}
                      data-testid="button-send-comment"
                    >
                      <Send className="h-4 w-4 mr-1" />
                      {addCommentMutation.isPending ? "Sender..." : "Send kommentar"}
                    </Button>
                  </div>
                </div>

                {/* Next steps for rejected/needs_revision */}
                {(selectedFeedbackReport.status === "rejected" || selectedFeedbackReport.status === "needs_revision") && (
                  <div className="border-t pt-4">
                    <h4 className="font-medium mb-3">Neste steg</h4>
                    <ol className="space-y-2 text-sm">
                      <li className="flex gap-3 items-start">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium">1</span>
                        <span>Les tilbakemeldingen nøye og noter hvilke deler som må endres</span>
                      </li>
                      <li className="flex gap-3 items-start">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium">2</span>
                        <span>Klikk "Rediger" på rapporten for å gjøre endringer</span>
                      </li>
                      <li className="flex gap-3 items-start">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium">3</span>
                        <span>Send inn rapporten på nytt når endringene er gjort</span>
                      </li>
                    </ol>
                  </div>
                )}

                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>Trenger du hjelp?</AlertTitle>
                  <AlertDescription>
                    Bruk kommentarfeltet over for å stille spørsmål til administrator, eller ta kontakt med din kontaktperson.
                  </AlertDescription>
                </Alert>
              </div>
            )}

            <DialogFooter className="gap-2">
              {selectedFeedbackReport?.status === "draft" && (
                <Button
                  variant="destructive"
                  onClick={() => setDeleteConfirmOpen(true)}
                  disabled={deleteMutation.isPending}
                  data-testid="button-delete-report"
                >
                  {deleteMutation.isPending ? "Sletter..." : "Slett"}
                </Button>
              )}
              <Button variant="outline" onClick={() => setFeedbackDialogOpen(false)} data-testid="button-close-dialog">
                Lukk
              </Button>
              {(selectedFeedbackReport?.status === "draft" || selectedFeedbackReport?.status === "needs_revision") && (
                <Button
                  onClick={() => {
                    if (selectedFeedbackReport) handleSubmit(selectedFeedbackReport.id);
                  }}
                  disabled={submitMutation.isPending}
                  data-testid="button-submit-report"
                >
                  <Send className="h-4 w-4 mr-2" />
                  {submitMutation.isPending ? "Sender..." : "Send inn"}
                </Button>
              )}
              <Button 
                onClick={() => {
                  setFeedbackDialogOpen(false);
                  if (selectedFeedbackReport) startEdit(selectedFeedbackReport);
                }}
                data-testid="button-edit-now"
              >
                <Edit className="h-4 w-4 mr-2" />
                Rediger nå
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Submit confirmation dialog */}
        <Dialog open={submitConfirmOpen} onOpenChange={setSubmitConfirmOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Send className="h-5 w-5 text-primary" />
                Send inn for godkjenning
              </DialogTitle>
              <DialogDescription>
                Rapporten sendes til administrator for gjennomgang. Du kan ikke redigere den mens den er under behandling.
              </DialogDescription>
            </DialogHeader>

            {/* Report summary */}
            <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
              <p><strong>Sak:</strong> {formData.case_id || selectedFeedbackReport?.caseId}</p>
              <p><strong>Måned:</strong> {formData.month || selectedFeedbackReport?.month}</p>
              <p className="flex items-center gap-1.5">
                <strong>PII-status:</strong>
                {hasPii ? (
                  <span className="text-destructive flex items-center gap-1">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    {totalWarnings} advarsler
                  </span>
                ) : (
                  <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Ingen personopplysninger oppdaget
                  </span>
                )}
              </p>
            </div>

            <DialogFooter className="flex gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setSubmitConfirmOpen(false)}>
                Avbryt
              </Button>
              <Button
                onClick={() => {
                  if (submitConfirmReportId) submitMutation.mutate(submitConfirmReportId);
                  setSubmitConfirmOpen(false);
                }}
                disabled={submitMutation.isPending}
                className="gap-2"
              >
                <Send className="h-4 w-4" />
                {submitMutation.isPending ? "Sender..." : "Bekreft innsending"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete confirmation dialog */}
        <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                Slett rapport
              </DialogTitle>
              <DialogDescription>
                Er du sikker på at du vil slette denne rapporten? Handlingen kan ikke angres.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
                Avbryt
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  if (selectedFeedbackReport) {
                    deleteMutation.mutate(selectedFeedbackReport.id);
                    setDeleteConfirmOpen(false);
                    setFeedbackDialogOpen(false);
                  }
                }}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? "Sletter..." : "Ja, slett"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* PII dismiss with reason dialog */}
        <Dialog open={piiDismissDialogOpen} onOpenChange={setPiiDismissDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-amber-500" />
                Personopplysninger oppdaget
              </DialogTitle>
              <DialogDescription>
                Det ble funnet {totalWarnings} mulige personopplysninger. Velg en grunn for å fortsette uten å fjerne dem.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <Label>Grunn for å overse advarslene</Label>
              <Select value={piiDismissReason ?? ""} onValueChange={(v) => setPiiDismissReason(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Velg en grunn..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="no_pii">Ingen reell personopplysning (falsk positiv)</SelectItem>
                  <SelectItem value="legally_required">Påkrevd av juridiske grunner</SelectItem>
                  <SelectItem value="internal_report">Intern rapport — unntak gjelder</SelectItem>
                  <SelectItem value="already_anonymized">Allerede anonymisert tilstrekkelig</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <DialogFooter className="flex gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setPiiDismissDialogOpen(false)}>
                Gå tilbake og rett opp
              </Button>
              <Button
                disabled={!piiDismissReason}
                onClick={() => {
                  setPiiDismissed(true);
                  setPiiDismissDialogOpen(false);
                  // Save immediately after dismissal
                  saveMutation.mutate(formData);
                  toast({
                    title: "PII-advarsler oversett",
                    description: `Grunn: ${piiDismissReason === 'no_pii' ? 'Falsk positiv' : piiDismissReason === 'legally_required' ? 'Juridisk påkrevd' : piiDismissReason === 'internal_report' ? 'Intern rapport' : 'Allerede anonymisert'}`,
                  });
                }}
              >
                Bekreft og lagre
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PortalLayout>
  );
}
