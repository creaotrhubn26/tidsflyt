import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  FileText, 
  Check, 
  X, 
  MessageCircle, 
  Send,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  Eye,
  Filter,
} from "lucide-react";
import { PortalLayout } from "@/components/portal/portal-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import type { CaseReport } from "@shared/schema";

type AdminCaseReportResponse = {
  reports: CaseReport[];
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

export default function AdminCaseReviewsPage() {
  const { toast } = useToast();
  const [selectedReport, setSelectedReport] = useState<CaseReport | null>(null);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [feedbackText, setFeedbackText] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [isInternalNote, setIsInternalNote] = useState(false);
  const adminUsername = "admin";

  const { data: reportsData, isLoading, refetch } = useQuery<AdminCaseReportResponse>({
    queryKey: ["/api/admin/case-reports", { status: statusFilter === "all" ? undefined : statusFilter }],
    queryFn: async () => {
      const params = statusFilter !== "all" ? `?status=${statusFilter}` : "";
      const res = await fetch(`/api/admin/case-reports${params}`, {
        headers: { "Authorization": `Bearer ${localStorage.getItem("adminToken") || ""}` }
      });
      return res.json();
    },
  });

  const reports = reportsData?.reports || [];

  const { data: comments, refetch: refetchComments } = useQuery<ReportComment[]>({
    queryKey: ["/api/case-reports", selectedReport?.id, "comments", "admin"],
    queryFn: async () => {
      if (!selectedReport?.id) return [];
      const res = await fetch(`/api/case-reports/${selectedReport.id}/comments?include_internal=true`);
      return res.json();
    },
    enabled: !!selectedReport?.id && reviewDialogOpen,
  });

  const approveMutation = useMutation({
    mutationFn: async (reportId: number) => {
      return fetch(`/api/admin/case-reports/${reportId}/approve`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("adminToken") || ""}`
        },
      }).then(r => r.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/case-reports"] });
      setReviewDialogOpen(false);
      toast({ title: "Godkjent", description: "Rapporten er godkjent." });
    },
    onError: (error: any) => {
      toast({ title: "Feil", description: error?.message || "Kunne ikke godkjenne rapporten.", variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ reportId, reason }: { reportId: number; reason: string }) => {
      return fetch(`/api/admin/case-reports/${reportId}/reject`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("adminToken") || ""}`
        },
        body: JSON.stringify({ reason }),
      }).then(r => r.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/case-reports"] });
      setReviewDialogOpen(false);
      setRejectionReason("");
      toast({ title: "Avslått", description: "Rapporten er avslått med tilbakemelding." });
    },
    onError: (error: any) => {
      toast({ title: "Feil", description: error?.message || "Kunne ikke avslå rapporten.", variant: "destructive" });
    },
  });

  const feedbackMutation = useMutation({
    mutationFn: async ({ reportId, content, isInternal, requestRevision }: { reportId: number; content: string; isInternal: boolean; requestRevision: boolean }) => {
      return fetch(`/api/admin/case-reports/${reportId}/feedback`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("adminToken") || ""}`
        },
        body: JSON.stringify({ content, is_internal: isInternal, request_revision: requestRevision }),
      }).then(r => r.json());
    },
    onSuccess: () => {
      setFeedbackText("");
      refetchComments();
      refetch();
      toast({ title: "Sendt", description: "Tilbakemeldingen er sendt." });
    },
    onError: (error: any) => {
      toast({ title: "Feil", description: error?.message || "Kunne ikke sende tilbakemelding.", variant: "destructive" });
    },
  });

  const openReviewDialog = (report: CaseReport) => {
    setSelectedReport(report);
    setReviewDialogOpen(true);
    setFeedbackText("");
    setRejectionReason("");
  };

  const formatDateTime = (dateStr: string | Date | null) => {
    if (!dateStr) return "";
    return format(new Date(dateStr), "d. MMMM yyyy 'kl.' HH:mm", { locale: nb });
  };

  const pendingCount = reports.filter(r => r.status === "pending" || r.status === "submitted").length;

  return (
    <PortalLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold" data-testid="text-page-title">Saksrapporter til godkjenning</h1>
            <p className="text-muted-foreground">Gjennomgå og gi tilbakemelding på innsendte saksrapporter</p>
          </div>
          {pendingCount > 0 && (
            <Badge variant="secondary" className="text-sm">
              {pendingCount} venter på behandling
            </Badge>
          )}
        </div>

        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
          <TabsList>
            <TabsTrigger value="pending" data-testid="tab-pending">
              <Clock className="h-4 w-4 mr-1" />
              Til behandling
            </TabsTrigger>
            <TabsTrigger value="needs_revision" data-testid="tab-needs-revision">
              <AlertTriangle className="h-4 w-4 mr-1" />
              Trenger revisjon
            </TabsTrigger>
            <TabsTrigger value="approved" data-testid="tab-approved">
              <CheckCircle2 className="h-4 w-4 mr-1" />
              Godkjente
            </TabsTrigger>
            <TabsTrigger value="rejected" data-testid="tab-rejected">
              <XCircle className="h-4 w-4 mr-1" />
              Avslåtte
            </TabsTrigger>
            <TabsTrigger value="all" data-testid="tab-all">
              Alle
            </TabsTrigger>
          </TabsList>
        </Tabs>

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
        ) : reports.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-medium mb-2">Ingen rapporter</h3>
              <p className="text-muted-foreground">Det er ingen rapporter som matcher filteret ditt.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {reports.map((report, index) => (
              <Card key={report.id} className="hover-elevate cursor-pointer" onClick={() => openReviewDialog(report)} data-testid={`card-report-${report.id}`}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <h3 className="font-semibold" data-testid={`text-case-id-${index}`}>{report.caseId}</h3>
                      <p className="text-sm text-muted-foreground">{report.month}</p>
                      <p className="text-xs text-muted-foreground mt-1">Bruker: {report.userId}</p>
                    </div>
                    <Badge className={statusColors[report.status]} data-testid={`badge-status-${index}`}>
                      {statusLabels[report.status]}
                    </Badge>
                  </div>

                  {report.background && (
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                      {report.background}
                    </p>
                  )}

                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); openReviewDialog(report); }} data-testid={`button-review-${index}`}>
                      <Eye className="h-4 w-4 mr-1" />
                      Gjennomgå
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Gjennomgå saksrapport</DialogTitle>
              <DialogDescription>
                {selectedReport?.caseId} - {selectedReport?.month}
              </DialogDescription>
            </DialogHeader>

            {selectedReport && (
              <div className="space-y-6">
                <div className="flex items-center gap-2">
                  <Badge className={statusColors[selectedReport.status]}>
                    {statusLabels[selectedReport.status]}
                  </Badge>
                  <span className="text-sm text-muted-foreground">Bruker: {selectedReport.userId}</span>
                </div>

                <div className="grid gap-4">
                  {selectedReport.background && (
                    <div>
                      <Label className="text-muted-foreground text-xs">Bakgrunn</Label>
                      <p className="text-sm mt-1 whitespace-pre-wrap bg-muted/50 p-3 rounded-md">{selectedReport.background}</p>
                    </div>
                  )}
                  {selectedReport.actions && (
                    <div>
                      <Label className="text-muted-foreground text-xs">Tiltak</Label>
                      <p className="text-sm mt-1 whitespace-pre-wrap bg-muted/50 p-3 rounded-md">{selectedReport.actions}</p>
                    </div>
                  )}
                  {selectedReport.progress && (
                    <div>
                      <Label className="text-muted-foreground text-xs">Fremgang</Label>
                      <p className="text-sm mt-1 whitespace-pre-wrap bg-muted/50 p-3 rounded-md">{selectedReport.progress}</p>
                    </div>
                  )}
                  {selectedReport.challenges && (
                    <div>
                      <Label className="text-muted-foreground text-xs">Utfordringer</Label>
                      <p className="text-sm mt-1 whitespace-pre-wrap bg-muted/50 p-3 rounded-md">{selectedReport.challenges}</p>
                    </div>
                  )}
                  {selectedReport.assessment && (
                    <div>
                      <Label className="text-muted-foreground text-xs">Vurdering</Label>
                      <p className="text-sm mt-1 whitespace-pre-wrap bg-muted/50 p-3 rounded-md">{selectedReport.assessment}</p>
                    </div>
                  )}
                  {selectedReport.recommendations && (
                    <div>
                      <Label className="text-muted-foreground text-xs">Anbefalinger</Label>
                      <p className="text-sm mt-1 whitespace-pre-wrap bg-muted/50 p-3 rounded-md">{selectedReport.recommendations}</p>
                    </div>
                  )}
                </div>

                <div className="border-t pt-4">
                  <h4 className="font-medium mb-3 flex items-center gap-2">
                    <MessageCircle className="h-4 w-4" />
                    Kommentarer og tilbakemeldinger
                  </h4>
                  
                  {comments && comments.length > 0 ? (
                    <div className="space-y-3 mb-4 max-h-48 overflow-y-auto">
                      {comments.map((comment) => (
                        <div 
                          key={comment.id} 
                          className={`p-3 rounded-md ${
                            comment.is_internal 
                              ? "bg-orange-500/5 border-l-2 border-orange-500" 
                              : comment.author_role === "admin" 
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
                              {comment.is_internal && (
                                <Badge variant="secondary" className="ml-2 text-xs">Intern</Badge>
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

                  <div className="space-y-3 border-t pt-4">
                    <Textarea
                      value={feedbackText}
                      onChange={(e) => setFeedbackText(e.target.value)}
                      placeholder="Skriv en tilbakemelding til brukeren..."
                      rows={3}
                      data-testid="input-feedback"
                    />
                    <div className="flex items-center gap-4">
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="internal" 
                          checked={isInternalNote}
                          onCheckedChange={(checked) => setIsInternalNote(checked === true)}
                        />
                        <Label htmlFor="internal" className="text-sm">Intern merknad (ikke synlig for bruker)</Label>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => feedbackMutation.mutate({ 
                          reportId: selectedReport.id, 
                          content: feedbackText, 
                          isInternal: isInternalNote,
                          requestRevision: false 
                        })}
                        disabled={!feedbackText.trim() || feedbackMutation.isPending}
                        data-testid="button-send-feedback"
                      >
                        <Send className="h-4 w-4 mr-1" />
                        Send kommentar
                      </Button>
                      <Button 
                        size="sm" 
                        variant="secondary"
                        onClick={() => feedbackMutation.mutate({ 
                          reportId: selectedReport.id, 
                          content: feedbackText, 
                          isInternal: false,
                          requestRevision: true 
                        })}
                        disabled={!feedbackText.trim() || feedbackMutation.isPending}
                        data-testid="button-request-revision"
                      >
                        <AlertTriangle className="h-4 w-4 mr-1" />
                        Be om revisjon
                      </Button>
                    </div>
                  </div>
                </div>

                {(selectedReport.status === "pending" || selectedReport.status === "submitted") && (
                  <div className="border-t pt-4">
                    <h4 className="font-medium mb-3">Avslag med begrunnelse</h4>
                    <Textarea
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      placeholder="Begrunn avslaget..."
                      rows={2}
                      data-testid="input-rejection-reason"
                    />
                  </div>
                )}
              </div>
            )}

            <DialogFooter className="gap-2 flex-wrap">
              <Button variant="outline" onClick={() => setReviewDialogOpen(false)} data-testid="button-close">
                Lukk
              </Button>
              {selectedReport && (selectedReport.status === "pending" || selectedReport.status === "submitted") && (
                <>
                  <Button 
                    variant="destructive"
                    onClick={() => rejectMutation.mutate({ reportId: selectedReport.id, reason: rejectionReason })}
                    disabled={!rejectionReason.trim() || rejectMutation.isPending}
                    data-testid="button-reject"
                  >
                    <X className="h-4 w-4 mr-1" />
                    Avslå
                  </Button>
                  <Button 
                    onClick={() => approveMutation.mutate(selectedReport.id)}
                    disabled={approveMutation.isPending}
                    data-testid="button-approve"
                  >
                    <Check className="h-4 w-4 mr-1" />
                    Godkjenn
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PortalLayout>
  );
}
