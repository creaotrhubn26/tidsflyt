import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  FileText, 
  Plus, 
  Edit, 
  Send, 
  AlertTriangle,
  Info,
  X,
  Check,
} from "lucide-react";
import { PortalLayout } from "@/components/portal/portal-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import type { CaseReport } from "@shared/schema";

type CaseReportResponse = {
  reports: CaseReport[];
};

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  submitted: "bg-warning/10 text-warning border-warning/20",
  approved: "bg-success/10 text-success border-success/20",
  rejected: "bg-destructive/10 text-destructive border-destructive/20",
};

const statusLabels: Record<string, string> = {
  draft: "Utkast",
  submitted: "Sendt inn",
  approved: "Godkjent",
  rejected: "Avslått",
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

export default function CaseReportsPage() {
  const { toast } = useToast();
  const [editingReport, setEditingReport] = useState<CaseReport | null>(null);
  const [formData, setFormData] = useState(emptyFormData);
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false);
  const [selectedFeedbackReport, setSelectedFeedbackReport] = useState<CaseReport | null>(null);
  const [showForm, setShowForm] = useState(false);

  const { data: reportsData, isLoading } = useQuery<CaseReportResponse>({
    queryKey: ["/api/case-reports"],
  });

  const reports = reportsData?.reports || [];

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
      return apiRequest("PUT", `/api/case-reports/${reportId}`, { status: "submitted" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/case-reports"] });
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
    if (confirm("Send inn rapporten for godkjenning?")) {
      submitMutation.mutate(reportId);
    }
  };

  const openFeedbackDialog = (report: CaseReport) => {
    setSelectedFeedbackReport(report);
    setFeedbackDialogOpen(true);
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
    saveMutation.mutate(formData);
  };

  const cancelEdit = () => {
    setEditingReport(null);
    setFormData(emptyFormData);
    setShowForm(false);
  };

  return (
    <PortalLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold" data-testid="text-page-title">Mine saksrapporter</h1>
            <p className="text-muted-foreground">Skriv og administrer månedlige saksrapporter</p>
          </div>
          {!showForm && (
            <Button onClick={() => setShowForm(true)} data-testid="button-new-report">
              <Plus className="h-4 w-4 mr-2" />
              Ny rapport
            </Button>
          )}
        </div>

        {showForm && (
          <Card>
            <CardHeader>
              <CardTitle>{editingReport ? "Rediger rapport" : "Ny saksrapport"}</CardTitle>
              <CardDescription>
                {editingReport ? "Oppdater rapporten og lagre endringene." : "Fyll ut felene og lagre som utkast."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSave} className="space-y-4">
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

                <div className="space-y-2">
                  <Label htmlFor="background">Bakgrunn for tiltaket</Label>
                  <Textarea
                    id="background"
                    value={formData.background}
                    onChange={(e) => setFormData({ ...formData, background: e.target.value })}
                    placeholder="Beskriv bakgrunnen for tiltaket..."
                    rows={3}
                    data-testid="input-background"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="actions">Arbeid og tiltak som er gjennomført</Label>
                  <Textarea
                    id="actions"
                    value={formData.actions}
                    onChange={(e) => setFormData({ ...formData, actions: e.target.value })}
                    placeholder="Beskriv arbeidet som er gjennomført..."
                    rows={3}
                    data-testid="input-actions"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="progress">Fremgang og utvikling</Label>
                  <Textarea
                    id="progress"
                    value={formData.progress}
                    onChange={(e) => setFormData({ ...formData, progress: e.target.value })}
                    placeholder="Beskriv fremgangen..."
                    rows={3}
                    data-testid="input-progress"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="challenges">Utfordringer</Label>
                  <Textarea
                    id="challenges"
                    value={formData.challenges}
                    onChange={(e) => setFormData({ ...formData, challenges: e.target.value })}
                    placeholder="Beskriv eventuelle utfordringer..."
                    rows={3}
                    data-testid="input-challenges"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="factors">Faktorer som påvirker</Label>
                  <Textarea
                    id="factors"
                    value={formData.factors}
                    onChange={(e) => setFormData({ ...formData, factors: e.target.value })}
                    placeholder="Beskriv faktorer som påvirker..."
                    rows={2}
                    data-testid="input-factors"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="assessment">Vurdering</Label>
                  <Textarea
                    id="assessment"
                    value={formData.assessment}
                    onChange={(e) => setFormData({ ...formData, assessment: e.target.value })}
                    placeholder="Din vurdering..."
                    rows={3}
                    data-testid="input-assessment"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="recommendations">Anbefalinger</Label>
                  <Textarea
                    id="recommendations"
                    value={formData.recommendations}
                    onChange={(e) => setFormData({ ...formData, recommendations: e.target.value })}
                    placeholder="Dine anbefalinger..."
                    rows={3}
                    data-testid="input-recommendations"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notater (valgfritt)</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Eventulle notater..."
                    rows={2}
                    data-testid="input-notes"
                  />
                </div>

                <div className="flex gap-2 pt-4">
                  <Button 
                    type="submit" 
                    disabled={saveMutation.isPending}
                    data-testid="button-save-report"
                  >
                    {saveMutation.isPending ? "Lagrer..." : (editingReport ? "Oppdater" : "Lagre utkast")}
                  </Button>
                  <Button type="button" variant="outline" onClick={cancelEdit} data-testid="button-cancel">
                    Avbryt
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

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
              <h3 className="font-medium mb-2">Ingen rapporter ennå</h3>
              <p className="text-muted-foreground mb-4">Kom i gang ved å opprette din første saksrapport.</p>
              {!showForm && (
                <Button onClick={() => setShowForm(true)} data-testid="button-create-first">
                  <Plus className="h-4 w-4 mr-2" />
                  Opprett rapport
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {reports.map((report, index) => (
              <Card key={report.id} data-testid={`card-report-${report.id}`}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <h3 className="font-semibold" data-testid={`text-case-id-${index}`}>{report.caseId}</h3>
                      <p className="text-sm text-muted-foreground">{report.month}</p>
                    </div>
                    <Badge className={statusColors[report.status]} data-testid={`badge-status-${index}`}>
                      {statusLabels[report.status]}
                    </Badge>
                  </div>

                  {report.rejectionReason && (
                    <Alert variant="destructive" className="mb-4 cursor-pointer" onClick={() => openFeedbackDialog(report)}>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Rapporten ble avslått</AlertTitle>
                      <AlertDescription className="line-clamp-2">
                        {report.rejectionReason}
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="flex gap-2 flex-wrap">
                    {(report.status === "draft" || report.status === "rejected") && (
                      <>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={() => startEdit(report)}
                          data-testid={`button-edit-${index}`}
                        >
                          <Edit className="h-4 w-4 mr-1" />
                          Rediger
                        </Button>
                        <Button 
                          size="sm" 
                          onClick={() => handleSubmit(report.id)}
                          disabled={submitMutation.isPending}
                          data-testid={`button-submit-${index}`}
                        >
                          <Send className="h-4 w-4 mr-1" />
                          Send inn
                        </Button>
                      </>
                    )}
                    {report.rejectionReason && (
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        onClick={() => openFeedbackDialog(report)}
                        data-testid={`button-feedback-${index}`}
                      >
                        <Info className="h-4 w-4 mr-1" />
                        Se tilbakemelding
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={feedbackDialogOpen} onOpenChange={setFeedbackDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Tilbakemelding på rapport</DialogTitle>
              <DialogDescription>
                {selectedFeedbackReport?.caseId} - {selectedFeedbackReport?.month}
              </DialogDescription>
            </DialogHeader>

            {selectedFeedbackReport && (
              <div className="space-y-4">
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

                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>Trenger du hjelp?</AlertTitle>
                  <AlertDescription>
                    Hvis du er usikker på hva som må endres, ta kontakt med din kontaktperson eller administrator.
                  </AlertDescription>
                </Alert>
              </div>
            )}

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setFeedbackDialogOpen(false)} data-testid="button-close-dialog">
                Lukk
              </Button>
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
