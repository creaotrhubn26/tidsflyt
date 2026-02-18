import { useState, useEffect, useCallback, useRef } from "react";
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
  Eye,
  XCircle,
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

import { RotateCcw, Trash2 } from "lucide-react";
import { AdvancedCaseReportBuilder } from "@/components/cms/advanced-case-report-builder";
import { CaseAnalyticsDashboard } from "@/components/cms/case-analytics-dashboard";
import { CaseReportExport } from "@/components/cms/case-report-export";
import { useToast } from "@/hooks/use-toast";
import { usePiiDetection } from "@/hooks/use-pii-detection";
import { getPiiTypeLabel, getPiiSeverity, ANONYMOUS_ALTERNATIVES, type PiiWarning } from "@/lib/pii-detector";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import type { CaseReport } from "@shared/schema";

type CaseReportResponse = {
  reports: CaseReport[];
};

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  pending: "bg-warning/10 text-warning border-warning/20",
  submitted: "bg-warning/10 text-warning border-warning/20",
  needs_revision: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  approved: "bg-success/10 text-success border-success/20",
  rejected: "bg-destructive/10 text-destructive border-destructive/20",
};

const statusLabels: Record<string, string> = {
  draft: "Utkast",
  pending: "Til behandling",
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
  month: "",
  background: "",
  actions: "",
  progress: "",
  challenges: "",
  factors: "",
  assessment: "",
  recommendations: "",
  notes: "",
};

const DRAFT_STORAGE_KEY = "tidum_case_report_draft";

interface SavedDraft {
  formData: typeof emptyFormData;
  editingReportId: number | null;
  savedAt: string;
}

function saveDraftToStorage(formData: typeof emptyFormData, editingReportId: number | null) {
  // Only save if form has meaningful content
  const hasContent = Object.entries(formData).some(
    ([key, val]) => key !== 'case_id' && key !== 'month' && val && val.replace(/<[^>]*>/g, '').trim().length > 0
  ) || formData.case_id || formData.month;
  if (!hasContent) return;
  try {
    const draft: SavedDraft = { formData, editingReportId, savedAt: new Date().toISOString() };
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch { /* quota exceeded — ignore */ }
}

function loadDraftFromStorage(): SavedDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as SavedDraft;
    // Expire drafts older than 7 days
    const age = Date.now() - new Date(draft.savedAt).getTime();
    if (age > 7 * 24 * 60 * 60 * 1000) {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      return null;
    }
    return draft;
  } catch {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    return null;
  }
}

function clearDraftFromStorage() {
  localStorage.removeItem(DRAFT_STORAGE_KEY);
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
                      {w.confidence === 'high' ? 'Høy' : w.confidence === 'medium' ? 'Middels' : 'Lav'}
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
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [piiDismissed, setPiiDismissed] = useState(false);
  const [draftDialogOpen, setDraftDialogOpen] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<SavedDraft | null>(null);
  const skipNextDraftSave = useRef(false);
  const currentUserId = "default"; // TODO: Get from auth context

  // PII Detection — real-time scanning of report fields
  const { fieldResults, totalWarnings, hasPii, scanFields, isPending: piiScanning } = usePiiDetection({ debounceMs: 600 });

  // --- Draft persistence: check for saved draft on mount ---
  useEffect(() => {
    const draft = loadDraftFromStorage();
    if (draft) {
      setPendingDraft(draft);
      setDraftDialogOpen(true);
    }
  }, []);

  // --- Draft persistence: auto-save form data ---
  useEffect(() => {
    if (!showForm) return;
    if (skipNextDraftSave.current) {
      skipNextDraftSave.current = false;
      return;
    }
    const timer = setTimeout(() => {
      saveDraftToStorage(formData, editingReport?.id ?? null);
    }, 1000);
    return () => clearTimeout(timer);
  }, [formData, showForm, editingReport]);

  // Re-scan fields whenever form data changes
  const triggerPiiScan = useCallback((data: typeof formData) => {
    scanFields({
      background: data.background,
      actions: data.actions,
      progress: data.progress,
      challenges: data.challenges,
      factors: data.factors,
      assessment: data.assessment,
      recommendations: data.recommendations,
      notes: data.notes,
    });
  }, [scanFields]);

  const restoreDraft = useCallback(() => {
    if (!pendingDraft) return;
    skipNextDraftSave.current = true;
    setFormData(pendingDraft.formData);
    setShowForm(true);
    triggerPiiScan(pendingDraft.formData);
    setDraftDialogOpen(false);
    toast({ title: "Utkast gjenopprettet", description: "Du kan fortsette der du slapp." });
    setPendingDraft(null);
  }, [pendingDraft, triggerPiiScan, toast]);

  const discardDraft = useCallback(() => {
    clearDraftFromStorage();
    setDraftDialogOpen(false);
    setPendingDraft(null);
  }, []);

  // Wrapper to update form data and trigger PII scan
  const updateField = useCallback((field: string, value: string) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value };
      triggerPiiScan(updated);
      return updated;
    });
  }, [triggerPiiScan]);

  const { data: reportsData, isLoading } = useQuery<CaseReportResponse>({
    queryKey: ["/api/case-reports"],
  });

  const reports = reportsData?.reports || [];

  // Fetch comments for selected report
  const { data: comments, refetch: refetchComments } = useQuery<ReportComment[]>({
    queryKey: ["/api/case-reports", selectedFeedbackReport?.id, "comments"],
    queryFn: async () => {
      if (!selectedFeedbackReport?.id) return [];
      const res = await fetch(`/api/case-reports/${selectedFeedbackReport.id}/comments`);
      return res.json();
    },
    enabled: !!selectedFeedbackReport?.id && feedbackDialogOpen,
  });

  // Add comment mutation
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
    onSuccess: () => {
      setNewComment("");
      refetchComments();
      queryClient.invalidateQueries({ queryKey: ["/api/case-reports"] });
      toast({ title: "Sendt", description: "Kommentaren din er sendt." });
    },
    onError: (error: any) => {
      toast({ title: "Feil", description: error?.message || "Kunne ikke sende kommentar.", variant: "destructive" });
    },
  });

  // Mark comments as read when dialog opens
  useEffect(() => {
    if (feedbackDialogOpen && selectedFeedbackReport?.id) {
      fetch(`/api/case-reports/${selectedFeedbackReport.id}/comments/mark-read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reader_id: currentUserId }),
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
      clearDraftFromStorage();
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
      clearDraftFromStorage();
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
        title: "⚠️ Kan ikke sende inn", 
        description: "Rapporten inneholder mulige personopplysninger. Fjern disse før innsending.", 
        variant: "destructive" 
      });
      return;
    }
    if (confirm("Send inn rapporten for godkjenning?")) {
      submitMutation.mutate(reportId);
    }
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

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.case_id || !formData.month) {
      toast({ title: "Feil", description: "Saksnummer og måned er påkrevd.", variant: "destructive" });
      return;
    }
    if (hasPii && !piiDismissed) {
      toast({ 
        title: "⚠️ Personopplysninger oppdaget", 
        description: `Det ble funnet ${totalWarnings} mulige personopplysninger. Vennligst fjern disse før du lagrer, eller bekreft at de er nødvendige.`, 
        variant: "destructive" 
      });
      return;
    }
    saveMutation.mutate(formData);
  };

  const cancelEdit = () => {
    setEditingReport(null);
    setFormData(emptyFormData);
    setShowForm(false);
    clearDraftFromStorage();
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
                {/* GDPR / PII Warning Banner */}
                <Alert className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/30">
                  <ShieldAlert className="h-4 w-4 text-amber-600" />
                  <AlertTitle className="text-amber-800 dark:text-amber-300">Personvern – GDPR</AlertTitle>
                  <AlertDescription className="text-amber-700 dark:text-amber-400">
                    <p className="mb-2">Rapporter skal <strong>ikke</strong> inneholde personidentifiserbar informasjon.</p>
                    <div className="grid sm:grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="font-medium text-destructive">❌ Ikke bruk:</p>
                        <ul className="list-disc list-inside space-y-0.5 ml-1">
                          <li>Navn på klienter/brukere</li>
                          <li>Fødselsdato eller eksakt alder</li>
                          <li>Adresser eller telefonnummer</li>
                          <li>E-post eller fødselsnummer</li>
                        </ul>
                      </div>
                      <div>
                        <p className="font-medium text-green-700 dark:text-green-400">✅ Bruk i stedet:</p>
                        <ul className="list-disc list-inside space-y-0.5 ml-1">
                          <li>«Gutten» / «Jenta»</li>
                          <li>«Brukeren» / «Deltakeren» / «Klienten»</li>
                          <li>«Ungdom» / «Ung person» / «Voksen»</li>
                          <li>Generelle beskrivelser</li>
                        </ul>
                      </div>
                    </div>
                  </AlertDescription>
                </Alert>

                {/* PII Detection Results Banner */}
                {hasPii && !piiDismissed && (() => {
                  const allWarnings = Object.values(fieldResults).flatMap(r => r.warnings);
                  const highCount = allWarnings.filter(w => w.confidence === 'high').length;
                  const mediumCount = allWarnings.filter(w => w.confidence === 'medium').length;
                  const isCritical = highCount > 0;
                  
                  return (
                    <Alert variant={isCritical ? "destructive" : undefined} className={isCritical ? "border-red-500" : "border-amber-500 bg-amber-50 dark:bg-amber-950/30"}>
                      <XCircle className={`h-4 w-4 ${isCritical ? '' : 'text-amber-600'}`} />
                      <AlertTitle className="flex items-center justify-between">
                        <span className={isCritical ? '' : 'text-amber-800 dark:text-amber-300'}>
                          {totalWarnings} mulige personopplysninger funnet
                          {highCount > 0 && <span className="ml-1 text-xs font-normal">({highCount} høy sikkerhet)</span>}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={() => setPiiDismissed(true)}
                        >
                          Ignorer advarsler
                        </Button>
                      </AlertTitle>
                      <AlertDescription className={isCritical ? '' : 'text-amber-700 dark:text-amber-400'}>
                        <p className="mb-2">Følgende felt inneholder mulige personopplysninger som bør fjernes:</p>
                        <div className="space-y-1">
                          {Object.entries(fieldResults).map(([field, result]) => {
                            if (!result.hasPii) return null;
                            const fieldLabels: Record<string, string> = {
                              background: 'Bakgrunn',
                              actions: 'Arbeid og tiltak',
                              progress: 'Fremgang',
                              challenges: 'Utfordringer',
                              factors: 'Faktorer',
                              assessment: 'Vurdering',
                              recommendations: 'Anbefalinger',
                              notes: 'Notater',
                            };
                            return (
                              <div key={field} className="text-sm">
                                <span className="font-medium">{fieldLabels[field] || field}:</span>{' '}
                                {result.warnings
                                  .sort((a, b) => {
                                    const order = { high: 0, medium: 1, low: 2 };
                                    return order[a.confidence] - order[b.confidence];
                                  })
                                  .map((w, i) => (
                                    <Badge 
                                      key={i} 
                                      variant="outline" 
                                      className={`mr-1 mb-0.5 text-xs ${
                                        w.confidence === 'high'
                                          ? 'border-red-300 text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/30'
                                          : 'border-amber-300 text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30'
                                      }`}
                                    >
                                      {getPiiTypeLabel(w.type)}: {w.match}
                                    </Badge>
                                  ))}
                              </div>
                            );
                          })}
                        </div>
                        {mediumCount > 0 && highCount === 0 && (
                          <p className="mt-2 text-xs italic">Disse er middels sikkerhet — gjennomgå for å bekrefte.</p>
                        )}
                      </AlertDescription>
                    </Alert>
                  );
                })()}

                {piiScanning && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Eye className="h-4 w-4 animate-pulse" />
                    <span>Skanner for personopplysninger...</span>
                  </div>
                )}

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

                <PiiFieldWrapper fieldName="background" label="Bakgrunn for tiltaket" fieldResults={fieldResults}>
                  <RichTextEditor
                    value={formData.background}
                    onChange={(value) => updateField('background', value)}
                    placeholder="Beskriv bakgrunnen for tiltaket... (ikke bruk personnavn)"
                    minHeight="120px"
                    testId="editor-background"
                  />
                </PiiFieldWrapper>

                <PiiFieldWrapper fieldName="actions" label="Arbeid og tiltak som er gjennomført" fieldResults={fieldResults}>
                  <RichTextEditor
                    value={formData.actions}
                    onChange={(value) => updateField('actions', value)}
                    placeholder="Beskriv arbeidet som er gjennomført... (bruk «brukeren», «ungdom» osv.)"
                    minHeight="150px"
                    testId="editor-actions"
                  />
                </PiiFieldWrapper>

                <PiiFieldWrapper fieldName="progress" label="Fremgang og utvikling" fieldResults={fieldResults}>
                  <RichTextEditor
                    value={formData.progress}
                    onChange={(value) => updateField('progress', value)}
                    placeholder="Beskriv fremgangen... (ikke bruk personnavn)"
                    minHeight="120px"
                    testId="editor-progress"
                  />
                </PiiFieldWrapper>

                <PiiFieldWrapper fieldName="challenges" label="Utfordringer" fieldResults={fieldResults}>
                  <RichTextEditor
                    value={formData.challenges}
                    onChange={(value) => updateField('challenges', value)}
                    placeholder="Beskriv eventuelle utfordringer... (bruk «gutten», «jenta» osv.)"
                    minHeight="120px"
                    testId="editor-challenges"
                  />
                </PiiFieldWrapper>

                <PiiFieldWrapper fieldName="factors" label="Faktorer som påvirker" fieldResults={fieldResults}>
                  <RichTextEditor
                    value={formData.factors}
                    onChange={(value) => updateField('factors', value)}
                    placeholder="Beskriv faktorer som påvirker... (ikke bruk personnavn)"
                    minHeight="100px"
                    testId="editor-factors"
                  />
                </PiiFieldWrapper>

                <PiiFieldWrapper fieldName="assessment" label="Vurdering" fieldResults={fieldResults}>
                  <RichTextEditor
                    value={formData.assessment}
                    onChange={(value) => updateField('assessment', value)}
                    placeholder="Din vurdering... (bruk «brukeren», «klienten» osv.)"
                    minHeight="120px"
                    testId="editor-assessment"
                  />
                </PiiFieldWrapper>

                <PiiFieldWrapper fieldName="recommendations" label="Anbefalinger" fieldResults={fieldResults}>
                  <RichTextEditor
                    value={formData.recommendations}
                    onChange={(value) => updateField('recommendations', value)}
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
                    placeholder="Eventulle notater... (ikke inkluder personnavn eller personopplysninger)"
                    rows={2}
                    data-testid="input-notes"
                  />
                </PiiFieldWrapper>

                <div className="flex gap-2 pt-4 items-center">
                  <Button 
                    type="submit" 
                    disabled={saveMutation.isPending || (hasPii && !piiDismissed)}
                    data-testid="button-save-report"
                  >
                    {saveMutation.isPending ? "Lagrer..." : (editingReport ? "Oppdater" : "Lagre utkast")}
                  </Button>
                  <Button type="button" variant="outline" onClick={cancelEdit} data-testid="button-cancel">
                    Avbryt
                  </Button>
                  {hasPii && !piiDismissed && (
                    <span className="text-sm text-destructive flex items-center gap-1">
                      <ShieldAlert className="h-4 w-4" />
                      Fjern personopplysninger før lagring
                    </span>
                  )}
                </div>
              </form>
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
                  setStatusFilter(status);
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
                  <Badge className={statusColors[selectedFeedbackReport.status]}>
                    {statusLabels[selectedFeedbackReport.status]}
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
                  onClick={() => {
                    if (selectedFeedbackReport && confirm("Er du sikker på at du vil slette denne rapporten?")) {
                      deleteMutation.mutate(selectedFeedbackReport.id);
                      setFeedbackDialogOpen(false);
                    }
                  }}
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
      </div>
    </PortalLayout>
  );
}
