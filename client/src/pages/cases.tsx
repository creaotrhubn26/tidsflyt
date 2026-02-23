import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  ArrowRight,
  BarChart3,
  Building2,
  CalendarDays,
  ClipboardList,
  FileText,
  FolderKanban,
  Pencil,
  Plus,
  Search,
} from "lucide-react";
import { PortalLayout } from "@/components/portal/portal-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";

type ProjectInfoRow = {
  id: number;
  konsulent: string | null;
  bedrift: string | null;
  oppdragsgiver: string | null;
  tiltak: string | null;
  periode: string | null;
  klient_id: string | null;
  user_id: string | null;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
};

type CaseReportsResponse = {
  reports: Array<Record<string, unknown>>;
};

type ReportStatus = "draft" | "submitted" | "needs_revision" | "approved" | "rejected";

const statusLabels: Record<ReportStatus, string> = {
  draft: "Utkast",
  submitted: "Sendt inn",
  needs_revision: "Trenger revisjon",
  approved: "Godkjent",
  rejected: "Avslått",
};

const statusBadgeClass: Record<ReportStatus, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  submitted: "bg-warning/10 text-warning border-warning/30",
  needs_revision: "bg-orange-500/10 text-orange-600 border-orange-500/30",
  approved: "bg-success/10 text-success border-success/30",
  rejected: "bg-destructive/10 text-destructive border-destructive/30",
};

const emptyCaseForm = {
  oppdragsgiver: "",
  tiltak: "",
  periode: "",
  konsulent: "",
  bedrift: "",
  klient_id: "",
};

function normalizeReportStatus(value: unknown): ReportStatus {
  const status = String(value || "").toLowerCase();
  if (status === "submitted") return "submitted";
  if (status === "needs_revision") return "needs_revision";
  if (status === "approved") return "approved";
  if (status === "rejected") return "rejected";
  return "draft";
}

export default function CasesPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const currentUserId = user?.id ?? "default";

  const [activeTab, setActiveTab] = useState<"overview" | "reports">("overview");
  const [searchQuery, setSearchQuery] = useState("");
  const [showCaseDialog, setShowCaseDialog] = useState(false);
  const [editingCase, setEditingCase] = useState<ProjectInfoRow | null>(null);
  const [caseForm, setCaseForm] = useState(emptyCaseForm);

  const { data: rawProjectInfoData, isLoading: isLoadingProjectInfo } = useQuery<ProjectInfoRow[] | { error?: string }>({
    queryKey: ["/api/project-info", { user_id: currentUserId }],
  });

  const projectInfo = useMemo(
    () => (Array.isArray(rawProjectInfoData) ? rawProjectInfoData : []),
    [rawProjectInfoData],
  );

  const { data: rawReportsData, isLoading: isLoadingReports } = useQuery<CaseReportsResponse>({
    queryKey: ["/api/case-reports", { user_id: currentUserId }],
  });

  const reports = rawReportsData?.reports || [];

  const reportSummary = useMemo(() => {
    const summary = {
      total: reports.length,
      draft: 0,
      submitted: 0,
      needs_revision: 0,
      approved: 0,
      rejected: 0,
    };

    reports.forEach((report) => {
      const status = normalizeReportStatus((report as any).status);
      summary[status] += 1;
    });

    return summary;
  }, [reports]);

  const caseReportIndex = useMemo(() => {
    const index = new Map<
      string,
      {
        count: number;
        latest: { month: string; status: ReportStatus; updatedAt: string } | null;
      }
    >();

    reports.forEach((report) => {
      const caseId = String((report as any).case_id ?? (report as any).caseId ?? "").trim();
      if (!caseId) return;

      const month = String((report as any).month ?? "");
      const status = normalizeReportStatus((report as any).status);
      const updatedAt = String(
        (report as any).updated_at ??
          (report as any).updatedAt ??
          (report as any).created_at ??
          (report as any).createdAt ??
          "",
      );

      const existing = index.get(caseId);
      if (!existing) {
        index.set(caseId, {
          count: 1,
          latest: { month, status, updatedAt },
        });
        return;
      }

      const existingDate = existing.latest?.updatedAt ? new Date(existing.latest.updatedAt).getTime() : 0;
      const incomingDate = updatedAt ? new Date(updatedAt).getTime() : 0;

      index.set(caseId, {
        count: existing.count + 1,
        latest: incomingDate >= existingDate ? { month, status, updatedAt } : existing.latest,
      });
    });

    return index;
  }, [reports]);

  const activeCases = useMemo(
    () => projectInfo.filter((item) => item.is_active !== false),
    [projectInfo],
  );

  const filteredCases = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    if (!needle) return activeCases;

    return activeCases.filter((item) => {
      const searchable = [
        item.oppdragsgiver || "",
        item.tiltak || "",
        item.konsulent || "",
        item.bedrift || "",
        item.klient_id || "",
      ]
        .join(" ")
        .toLowerCase();
      return searchable.includes(needle);
    });
  }, [activeCases, searchQuery]);

  const institutionsCount = useMemo(() => {
    const set = new Set(
      activeCases
        .map((item) => (item.oppdragsgiver || "").trim())
        .filter((value) => value.length > 0),
    );
    return set.size;
  }, [activeCases]);

  const consultantsCount = useMemo(() => {
    const set = new Set(
      activeCases
        .map((item) => (item.konsulent || "").trim())
        .filter((value) => value.length > 0),
    );
    return set.size;
  }, [activeCases]);

  const recentReports = useMemo(() => {
    return [...reports]
      .sort((a, b) => {
        const aDate = String((a as any).updated_at ?? (a as any).updatedAt ?? (a as any).created_at ?? (a as any).createdAt ?? "");
        const bDate = String((b as any).updated_at ?? (b as any).updatedAt ?? (b as any).created_at ?? (b as any).createdAt ?? "");
        return new Date(bDate).getTime() - new Date(aDate).getTime();
      })
      .slice(0, 8);
  }, [reports]);

  const saveCaseMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        oppdragsgiver: caseForm.oppdragsgiver.trim(),
        tiltak: caseForm.tiltak.trim(),
        periode: caseForm.periode.trim() || null,
        konsulent: caseForm.konsulent.trim() || null,
        bedrift: caseForm.bedrift.trim() || null,
        klient_id: caseForm.klient_id.trim() || null,
        user_id: currentUserId,
      };

      if (editingCase) {
        return apiRequest("PUT", `/api/project-info/${editingCase.id}`, payload);
      }
      return apiRequest("POST", "/api/project-info", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/project-info"] });
      setShowCaseDialog(false);
      setEditingCase(null);
      setCaseForm(emptyCaseForm);
      toast({
        title: editingCase ? "Sak oppdatert" : "Sak opprettet",
        description: editingCase
          ? "Saksavtalen er oppdatert."
          : "Ny avtale er lagt til i saksoversikten.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Feil",
        description: error?.message || "Kunne ikke lagre saken.",
        variant: "destructive",
      });
    },
  });

  const handleOpenNewCase = () => {
    setEditingCase(null);
    setCaseForm(emptyCaseForm);
    setShowCaseDialog(true);
  };

  const handleOpenEditCase = (item: ProjectInfoRow) => {
    setEditingCase(item);
    setCaseForm({
      oppdragsgiver: item.oppdragsgiver || "",
      tiltak: item.tiltak || "",
      periode: item.periode || "",
      konsulent: item.konsulent || "",
      bedrift: item.bedrift || "",
      klient_id: item.klient_id || "",
    });
    setShowCaseDialog(true);
  };

  const handleSaveCase = () => {
    if (!caseForm.oppdragsgiver.trim() || !caseForm.tiltak.trim()) {
      toast({
        title: "Manglende felt",
        description: "Institusjon/oppdragsgiver og tiltak er påkrevd.",
        variant: "destructive",
      });
      return;
    }
    saveCaseMutation.mutate();
  };

  return (
    <PortalLayout>
      <Dialog open={showCaseDialog} onOpenChange={setShowCaseDialog}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingCase ? "Rediger sak" : "Ny sak / avtale"}</DialogTitle>
            <DialogDescription>
              Registrer avtaler leverandøren har med institusjoner som skoler, NAV eller andre institusjoner.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="oppdragsgiver">Institusjon / oppdragsgiver *</Label>
              <Input
                id="oppdragsgiver"
                value={caseForm.oppdragsgiver}
                onChange={(event) => setCaseForm((prev) => ({ ...prev, oppdragsgiver: event.target.value }))}
                placeholder="F.eks. Oslo VGS"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tiltak">Tiltak / avtale *</Label>
              <Input
                id="tiltak"
                value={caseForm.tiltak}
                onChange={(event) => setCaseForm((prev) => ({ ...prev, tiltak: event.target.value }))}
                placeholder="F.eks. Oppfølging i skoleløp"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="periode">Periode</Label>
              <Input
                id="periode"
                value={caseForm.periode}
                onChange={(event) => setCaseForm((prev) => ({ ...prev, periode: event.target.value }))}
                placeholder="F.eks. 2026-01 til 2026-12"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="konsulent">Ansvarlig konsulent</Label>
              <Input
                id="konsulent"
                value={caseForm.konsulent}
                onChange={(event) => setCaseForm((prev) => ({ ...prev, konsulent: event.target.value }))}
                placeholder="F.eks. Kari Nordmann"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bedrift">Leverandør / bedrift</Label>
              <Input
                id="bedrift"
                value={caseForm.bedrift}
                onChange={(event) => setCaseForm((prev) => ({ ...prev, bedrift: event.target.value }))}
                placeholder="F.eks. Tidum AS"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="klient-id">Saks-ID / referanse</Label>
              <Input
                id="klient-id"
                value={caseForm.klient_id}
                onChange={(event) => setCaseForm((prev) => ({ ...prev, klient_id: event.target.value }))}
                placeholder="F.eks. SAK-2026-104"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCaseDialog(false);
                setEditingCase(null);
                setCaseForm(emptyCaseForm);
              }}
            >
              Avbryt
            </Button>
            <Button onClick={handleSaveCase} disabled={saveCaseMutation.isPending}>
              {saveCaseMutation.isPending ? "Lagrer..." : editingCase ? "Oppdater sak" : "Opprett sak"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Saker</h1>
            <p className="text-muted-foreground mt-1">
              Oversikt over avtaler leverandøren har med institusjoner, og kobling til tilhørende saksrapporter.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => navigate("/case-reports")}>
              <ClipboardList className="h-4 w-4 mr-2" />
              Åpne saksrapporter
            </Button>
            <Button onClick={handleOpenNewCase}>
              <Plus className="h-4 w-4 mr-2" />
              Ny sak / avtale
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "overview" | "reports")} className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="overview" className="gap-2">
              <FolderKanban className="h-4 w-4" />
              Saksoversikt
            </TabsTrigger>
            <TabsTrigger value="reports" className="gap-2">
              <FileText className="h-4 w-4" />
              Saksrapporter
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Aktive saker</p>
                  <p className="text-2xl font-semibold mt-1">{activeCases.length}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Institusjoner</p>
                  <p className="text-2xl font-semibold mt-1">{institutionsCount}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Ansvarlige konsulenter</p>
                  <p className="text-2xl font-semibold mt-1">{consultantsCount}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Totale saksrapporter</p>
                  <p className="text-2xl font-semibold mt-1">{reportSummary.total}</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Søk på institusjon, tiltak, konsulent, referanse..."
                  />
                </div>
              </CardContent>
            </Card>

            {isLoadingProjectInfo ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Card key={`skeleton-${index}`}>
                    <CardContent className="p-5">
                      <div className="space-y-3">
                        <div className="h-5 w-1/2 rounded bg-muted animate-pulse" />
                        <div className="h-4 w-4/5 rounded bg-muted animate-pulse" />
                        <div className="h-4 w-3/5 rounded bg-muted animate-pulse" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : filteredCases.length === 0 ? (
              <Card>
                <CardContent className="p-10 text-center">
                  <FolderKanban className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                  <p className="font-medium">Ingen saker funnet</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Registrer første avtale for å få oversikt over institusjoner og tiltak.
                  </p>
                  <Button className="mt-4" onClick={handleOpenNewCase}>
                    <Plus className="h-4 w-4 mr-2" />
                    Opprett første sak
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {filteredCases.map((item) => {
                  const caseReference = item.klient_id?.trim() || "";
                  const reportInfo = caseReference ? caseReportIndex.get(caseReference) : undefined;
                  const latestStatus = reportInfo?.latest?.status || null;

                  return (
                    <Card key={item.id} className="border-slate-200/70 dark:border-slate-700/70">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <CardTitle className="text-base flex items-center gap-2">
                              <Building2 className="h-4 w-4 text-primary" />
                              {item.oppdragsgiver || "Uten oppdragsgiver"}
                            </CardTitle>
                            <CardDescription>{item.tiltak || "Ingen tiltak angitt"}</CardDescription>
                          </div>
                          {latestStatus ? (
                            <Badge variant="outline" className={statusBadgeClass[latestStatus]}>
                              {statusLabels[latestStatus]}
                            </Badge>
                          ) : (
                            <Badge variant="outline">Ingen rapporter</Badge>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                          <div className="rounded-md bg-muted/40 px-3 py-2">
                            <p className="text-xs text-muted-foreground">Periode</p>
                            <p className="font-medium mt-1">{item.periode || "Ikke satt"}</p>
                          </div>
                          <div className="rounded-md bg-muted/40 px-3 py-2">
                            <p className="text-xs text-muted-foreground">Konsulent</p>
                            <p className="font-medium mt-1">{item.konsulent || "Ikke satt"}</p>
                          </div>
                          <div className="rounded-md bg-muted/40 px-3 py-2">
                            <p className="text-xs text-muted-foreground">Bedrift</p>
                            <p className="font-medium mt-1">{item.bedrift || "Ikke satt"}</p>
                          </div>
                          <div className="rounded-md bg-muted/40 px-3 py-2">
                            <p className="text-xs text-muted-foreground">Saksreferanse</p>
                            <p className="font-mono font-medium mt-1">{caseReference || "Ikke satt"}</p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="text-xs text-muted-foreground">
                            {reportInfo ? `${reportInfo.count} rapport(er) registrert` : "Ingen rapporthistorikk ennå"}
                          </div>
                          <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" onClick={() => handleOpenEditCase(item)}>
                              <Pencil className="h-3.5 w-3.5 mr-1.5" />
                              Rediger
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => {
                                const params = new URLSearchParams();
                                params.set("create", "1");
                                if (caseReference) params.set("prefillCaseId", caseReference);
                                navigate(`/case-reports?${params.toString()}`);
                              }}
                            >
                              Ny saksrapport
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="reports" className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Totalt</p>
                  <p className="text-xl font-semibold mt-1">{reportSummary.total}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Utkast</p>
                  <p className="text-xl font-semibold mt-1">{reportSummary.draft}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Sendt inn</p>
                  <p className="text-xl font-semibold mt-1">{reportSummary.submitted}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Trenger revisjon</p>
                  <p className="text-xl font-semibold mt-1">{reportSummary.needs_revision}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Godkjent</p>
                  <p className="text-xl font-semibold mt-1">{reportSummary.approved}</p>
                </CardContent>
              </Card>
            </div>

            <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
              <CardContent className="p-5 flex items-center justify-between gap-4 flex-wrap">
                <div className="space-y-1">
                  <p className="font-semibold flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-primary" />
                    Administrer saksrapporter
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Gå til full rapportside for å opprette, redigere, sende inn og analysere saksrapporter.
                  </p>
                </div>
                <Button onClick={() => navigate("/case-reports")}>
                  Åpne saksrapporter
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Siste rapportaktivitet</CardTitle>
                <CardDescription>Nyeste rapporter på tvers av sakene dine.</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingReports ? (
                  <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <div key={`report-skeleton-${index}`} className="h-11 rounded bg-muted animate-pulse" />
                    ))}
                  </div>
                ) : recentReports.length === 0 ? (
                  <div className="text-center py-8 text-sm text-muted-foreground">
                    Ingen saksrapporter registrert ennå.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {recentReports.map((report, index) => {
                      const status = normalizeReportStatus((report as any).status);
                      const caseId = String((report as any).case_id ?? (report as any).caseId ?? "Uten saks-ID");
                      const month = String((report as any).month ?? "Ukjent måned");

                      return (
                        <div
                          key={`${caseId}-${month}-${index}`}
                          className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2.5"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{caseId}</p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                              <CalendarDays className="h-3.5 w-3.5" />
                              {month}
                            </p>
                          </div>
                          <Badge variant="outline" className={statusBadgeClass[status]}>
                            {statusLabels[status]}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </PortalLayout>
  );
}
