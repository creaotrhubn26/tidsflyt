import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { normalizeRole } from "@shared/roles";
import { Link2, TrendingUp } from "lucide-react";

type IntegrationKey = "fiken" | "tripletex" | "other";
type IntegrationStatus =
  | "requested"
  | "evaluating"
  | "planned"
  | "in_development"
  | "beta"
  | "launched"
  | "not_now";

interface IntegrationCatalogItem {
  key: IntegrationKey;
  name: string;
  description: string;
  isActive: boolean;
}

interface IntegrationRoadmapItem {
  integrationKey: IntegrationKey;
  name: string;
  description: string;
  status: IntegrationStatus;
  statusReason: string | null;
  targetQuarter: string | null;
  scoreTotal: number;
  scoreDemand: number;
  scoreMrr: number;
  scoreFit: number;
  fitScoreInput: number;
  primaryVendors: number;
  teamSignals: number;
  updatedAt: string | null;
  mine?: {
    hasPrimaryRequest: boolean;
    hasTeamSignal: boolean;
  };
}

interface RoadmapResponse {
  statuses: IntegrationStatus[];
  roadmap: IntegrationRoadmapItem[];
}

interface CatalogResponse {
  catalog: IntegrationCatalogItem[];
}

interface MyRequestsResponse {
  primary: Array<{
    id: number;
    integration_key: IntegrationKey;
  }>;
  signals: Array<{
    id: number;
    integration_key: IntegrationKey;
  }>;
}

interface AnalyticsResponse {
  periodDays: number;
  summaryByIntegration: Array<{
    integrationKey: IntegrationKey;
    name: string;
    uniqueVendors: number;
    teamSignals: number;
    status: IntegrationStatus;
    score: {
      total: number;
      demand: number;
      mrr: number;
      fit: number;
      fitInput: number;
    };
  }>;
  trends: {
    selectedPeriod: {
      primaryRequests: number;
      teamSignals: number;
    };
  };
  conversion: {
    requestedToPlanned: {
      percent: number;
      numerator: number;
      denominator: number;
    };
    plannedToLaunched: {
      percent: number;
      numerator: number;
      denominator: number;
    };
  };
}

interface AdminRequestsResponse {
  primary: Array<{
    id: number;
    integration_key: IntegrationKey;
    integration_name: string;
    vendor_name: string | null;
    requester_email: string | null;
    urgency: string | null;
    created_at: string;
  }>;
  signals: Array<{
    id: number;
    integration_key: IntegrationKey;
    integration_name: string;
    vendor_name: string | null;
    user_email: string | null;
    created_at: string;
  }>;
}

interface RoadmapAdminDraft {
  status: IntegrationStatus;
  statusReason: string;
  targetQuarter: string;
  fitScore: string;
}

interface IntegrationRequestsPanelProps {
  showAdminTools?: boolean;
  className?: string;
}

const STATUS_LABELS: Record<IntegrationStatus, string> = {
  requested: "Forespurt",
  evaluating: "Vurderes",
  planned: "Planlagt",
  in_development: "Under utvikling",
  beta: "Beta",
  launched: "Lansert",
  not_now: "Ikke nå",
};

function statusBadgeVariant(status: IntegrationStatus): "default" | "secondary" | "outline" | "destructive" {
  if (status === "launched") return "default";
  if (status === "not_now") return "destructive";
  if (status === "planned" || status === "in_development" || status === "beta") return "secondary";
  return "outline";
}

function parseApiError(error: unknown): string {
  if (!(error instanceof Error)) return "Noe gikk galt";
  const message = error.message || "Noe gikk galt";
  const parts = message.split(":");
  if (parts.length < 2) return message;
  const payload = parts.slice(1).join(":").trim();
  try {
    const parsed = JSON.parse(payload);
    return parsed.error || message;
  } catch {
    return payload || message;
  }
}

export function IntegrationRequestsPanel({ showAdminTools = false, className }: IntegrationRequestsPanelProps) {
  const { toast } = useToast();
  const { user } = useAuth();

  const normalizedRole = normalizeRole(user?.role);
  const canCreatePrimary = ["super_admin", "hovedadmin", "admin", "vendor_admin"].includes(normalizedRole);
  const canManageRoadmap = ["super_admin", "hovedadmin", "admin"].includes(normalizedRole);

  const [selectedIntegrationKey, setSelectedIntegrationKey] = useState<IntegrationKey>("fiken");
  const [mode, setMode] = useState<"primary" | "signal">("signal");
  const [requestNote, setRequestNote] = useState("");
  const [useCase, setUseCase] = useState("");
  const [signalNote, setSignalNote] = useState("");
  const [estimatedMonthlyVolume, setEstimatedMonthlyVolume] = useState("");
  const [urgency, setUrgency] = useState<"low" | "normal" | "high">("normal");
  const [analyticsDays, setAnalyticsDays] = useState<7 | 30 | 90>(30);
  const [roadmapDrafts, setRoadmapDrafts] = useState<Record<string, RoadmapAdminDraft>>({});

  const { data: catalogData, isLoading: catalogLoading } = useQuery<CatalogResponse>({
    queryKey: ["/api/integrations/catalog"],
    staleTime: 60_000,
  });

  const { data: roadmapData, isLoading: roadmapLoading } = useQuery<RoadmapResponse>({
    queryKey: ["/api/integrations/roadmap"],
    staleTime: 30_000,
  });

  const { data: myRequestsData } = useQuery<MyRequestsResponse>({
    queryKey: ["/api/integrations/requests/me"],
    staleTime: 30_000,
  });

  const { data: analyticsData } = useQuery<AnalyticsResponse>({
    queryKey: ["/api/admin/integrations/analytics", { days: String(analyticsDays) }],
    enabled: showAdminTools,
    staleTime: 30_000,
  });

  const { data: adminRequestsData } = useQuery<AdminRequestsResponse>({
    queryKey: ["/api/admin/integrations/requests"],
    enabled: showAdminTools,
    staleTime: 30_000,
  });

  const selectedCatalogItem = useMemo(
    () => (catalogData?.catalog || []).find((item) => item.key === selectedIntegrationKey) || null,
    [catalogData?.catalog, selectedIntegrationKey],
  );

  const myPrimaryKeys = useMemo(
    () => new Set((myRequestsData?.primary || []).map((item) => item.integration_key)),
    [myRequestsData?.primary],
  );

  const mySignalKeys = useMemo(
    () => new Set((myRequestsData?.signals || []).map((item) => item.integration_key)),
    [myRequestsData?.signals],
  );

  useEffect(() => {
    const rows = roadmapData?.roadmap || [];
    setRoadmapDrafts((previous) => {
      const next: Record<string, RoadmapAdminDraft> = { ...previous };
      rows.forEach((row) => {
        next[row.integrationKey] = {
          status: next[row.integrationKey]?.status || row.status,
          statusReason: next[row.integrationKey]?.statusReason ?? row.statusReason ?? "",
          targetQuarter: next[row.integrationKey]?.targetQuarter ?? row.targetQuarter ?? "",
          fitScore: next[row.integrationKey]?.fitScore ?? String(row.fitScoreInput || 3),
        };
      });
      return next;
    });
  }, [roadmapData?.roadmap]);

  const invalidateIntegrationQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/integrations/roadmap"] });
    queryClient.invalidateQueries({ queryKey: ["/api/integrations/requests/me"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/integrations/analytics"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/integrations/requests"] });
  };

  const primaryRequestMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        integrationKey: selectedIntegrationKey,
        requestNote: requestNote.trim() || undefined,
        useCase: useCase.trim() || undefined,
        estimatedMonthlyVolume: estimatedMonthlyVolume.trim().length > 0
          ? Number(estimatedMonthlyVolume)
          : undefined,
        urgency,
      };
      const response = await apiRequest("POST", "/api/integrations/requests/primary", payload);
      return response.json();
    },
    onSuccess: () => {
      invalidateIntegrationQueries();
      setRequestNote("");
      setUseCase("");
      setEstimatedMonthlyVolume("");
      toast({ title: "Hovedforespørsel sendt" });
    },
    onError: (error) => {
      toast({ title: "Kunne ikke sende hovedforespørsel", description: parseApiError(error), variant: "destructive" });
    },
  });

  const signalMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        integrationKey: selectedIntegrationKey,
        note: signalNote.trim() || undefined,
      };
      const response = await apiRequest("POST", "/api/integrations/requests/signal", payload);
      return response.json();
    },
    onSuccess: () => {
      invalidateIntegrationQueries();
      setSignalNote("");
      toast({ title: "Team-signal sendt" });
    },
    onError: (error) => {
      toast({ title: "Kunne ikke sende signal", description: parseApiError(error), variant: "destructive" });
    },
  });

  const roadmapPatchMutation = useMutation({
    mutationFn: async (integrationKey: IntegrationKey) => {
      const draft = roadmapDrafts[integrationKey];
      const payload = {
        status: draft.status,
        statusReason: draft.statusReason.trim() || null,
        targetQuarter: draft.targetQuarter.trim() || null,
        fitScore: Number(draft.fitScore || "3"),
      };
      const response = await apiRequest("PATCH", `/api/admin/integrations/roadmap/${integrationKey}`, payload);
      return response.json();
    },
    onSuccess: () => {
      invalidateIntegrationQueries();
      toast({ title: "Roadmap oppdatert" });
    },
    onError: (error) => {
      toast({ title: "Kunne ikke oppdatere roadmap", description: parseApiError(error), variant: "destructive" });
    },
  });

  const recalcMutation = useMutation({
    mutationFn: async (integrationKey: IntegrationKey) => {
      const response = await apiRequest("POST", `/api/admin/integrations/roadmap/${integrationKey}/recalculate-score`);
      return response.json();
    },
    onSuccess: () => {
      invalidateIntegrationQueries();
      toast({ title: "Score oppdatert" });
    },
    onError: (error) => {
      toast({ title: "Kunne ikke recalculere score", description: parseApiError(error), variant: "destructive" });
    },
  });

  const submitDisabled = primaryRequestMutation.isPending || signalMutation.isPending;
  const shouldRequireNote = selectedIntegrationKey === "other";

  const handleSubmit = () => {
    if (mode === "primary") {
      primaryRequestMutation.mutate();
      return;
    }
    signalMutation.mutate();
  };

  const selectedAlreadyPrimary = myPrimaryKeys.has(selectedIntegrationKey);
  const selectedAlreadySignaled = mySignalKeys.has(selectedIntegrationKey);

  return (
    <div className={className ? `${className} space-y-6` : "space-y-6"}>
      <Card data-testid="integration-request-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Link2 className="h-5 w-5" />
            Integrasjoner (forespørsler)
          </CardTitle>
          <CardDescription>
            Foreslå Fiken, Tripletex eller Annet. Vi prioriterer etter etterspørsel, kommersiell verdi og strategisk fit.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Integrasjon</Label>
              <Select value={selectedIntegrationKey} onValueChange={(value) => setSelectedIntegrationKey(value as IntegrationKey)}>
                <SelectTrigger data-testid="integration-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(catalogData?.catalog || []).map((item) => (
                    <SelectItem key={item.key} value={item.key}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedCatalogItem?.description ? (
                <p className="text-xs text-muted-foreground">{selectedCatalogItem.description}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label>Type forespørsel</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={mode === "signal" ? "default" : "outline"}
                  onClick={() => setMode("signal")}
                  disabled={submitDisabled}
                  data-testid="integration-mode-signal"
                >
                  Team-signal
                </Button>
                <Button
                  type="button"
                  variant={mode === "primary" ? "default" : "outline"}
                  onClick={() => setMode("primary")}
                  disabled={!canCreatePrimary || submitDisabled}
                  data-testid="integration-mode-primary"
                >
                  Hovedforespørsel
                </Button>
              </div>
              {!canCreatePrimary && mode === "primary" ? (
                <p className="text-xs text-muted-foreground">Kun admin/vendor_admin kan sende hovedforespørsel.</p>
              ) : null}
            </div>
          </div>

          {mode === "primary" ? (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Hva trenger dere? (valgfritt)</Label>
                <Textarea
                  value={requestNote}
                  onChange={(event) => setRequestNote(event.target.value)}
                  placeholder="Kort beskrivelse av behovet"
                  data-testid="integration-primary-note"
                />
              </div>
              <div className="space-y-2">
                <Label>Use case</Label>
                <Textarea
                  value={useCase}
                  onChange={(event) => setUseCase(event.target.value)}
                  placeholder={shouldRequireNote ? "Beskriv ønsket integrasjon uten personopplysninger" : "Hvordan skal integrasjonen brukes i arbeidsflyten?"}
                  data-testid="integration-primary-use-case"
                />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Estimert volum per måned</Label>
                  <Input
                    value={estimatedMonthlyVolume}
                    onChange={(event) => setEstimatedMonthlyVolume(event.target.value.replace(/[^0-9]/g, ""))}
                    inputMode="numeric"
                    placeholder="f.eks. 250"
                    data-testid="integration-primary-volume"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Hast</Label>
                  <Select value={urgency} onValueChange={(value) => setUrgency(value as "low" | "normal" | "high")}>
                    <SelectTrigger data-testid="integration-primary-urgency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Lav</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="high">Høy</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Kommentar (valgfritt, påkrevd for Annet)</Label>
              <Textarea
                value={signalNote}
                onChange={(event) => setSignalNote(event.target.value)}
                placeholder={shouldRequireNote ? "Beskriv ønsket integrasjon uten navn/personinfo" : "Hva er viktigst for deg i denne integrasjonen?"}
                data-testid="integration-signal-note"
              />
            </div>
          )}

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex gap-2 text-xs">
              {selectedAlreadyPrimary ? <Badge variant="secondary">Du har hovedforespørsel</Badge> : null}
              {selectedAlreadySignaled ? <Badge variant="outline">Du har team-signal</Badge> : null}
            </div>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={submitDisabled || catalogLoading || (mode === "primary" && (!canCreatePrimary || selectedAlreadyPrimary)) || (mode === "signal" && selectedAlreadySignaled) || (shouldRequireNote && mode === "signal" && signalNote.trim().length === 0)}
              data-testid="integration-submit"
            >
              {mode === "primary" ? "Send hovedforespørsel" : "Send team-signal"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="integration-roadmap-card">
        <CardHeader>
          <CardTitle className="text-lg">Åpen roadmap</CardTitle>
          <CardDescription>
            Synlig for alle verifiserte brukere. Status flyttes manuelt av produkt/admin.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {roadmapLoading ? (
            <p className="text-sm text-muted-foreground">Laster roadmap...</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Integrasjon</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Vendors</TableHead>
                    <TableHead>Signaler</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Målkvartal</TableHead>
                    {canManageRoadmap ? <TableHead>Admin</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(roadmapData?.roadmap || []).map((row) => {
                    const draft = roadmapDrafts[row.integrationKey] || {
                      status: row.status,
                      statusReason: row.statusReason || "",
                      targetQuarter: row.targetQuarter || "",
                      fitScore: String(row.fitScoreInput || 3),
                    };

                    return (
                      <TableRow key={row.integrationKey} data-testid={`integration-roadmap-row-${row.integrationKey}`}>
                        <TableCell>
                          <div className="space-y-1">
                            <p className="font-medium">{row.name}</p>
                            <p className="text-xs text-muted-foreground">{row.description}</p>
                            <div className="flex gap-2 text-xs">
                              {row.mine?.hasPrimaryRequest ? <Badge variant="secondary">Min hovedforespørsel</Badge> : null}
                              {row.mine?.hasTeamSignal ? <Badge variant="outline">Mitt signal</Badge> : null}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusBadgeVariant(row.status)}>{STATUS_LABELS[row.status]}</Badge>
                        </TableCell>
                        <TableCell>{row.primaryVendors}</TableCell>
                        <TableCell>{row.teamSignals}</TableCell>
                        <TableCell className="font-medium">{row.scoreTotal.toFixed(1)}</TableCell>
                        <TableCell>{row.targetQuarter || "-"}</TableCell>
                        {canManageRoadmap ? (
                          <TableCell className="min-w-[280px] space-y-2">
                            <Select
                              value={draft.status}
                              onValueChange={(value) => {
                                setRoadmapDrafts((previous) => ({
                                  ...previous,
                                  [row.integrationKey]: {
                                    ...draft,
                                    status: value as IntegrationStatus,
                                  },
                                }));
                              }}
                            >
                              <SelectTrigger data-testid={`integration-admin-status-${row.integrationKey}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {roadmapData?.statuses?.map((status) => (
                                  <SelectItem key={status} value={status}>{STATUS_LABELS[status]}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Input
                              value={draft.targetQuarter}
                              onChange={(event) => {
                                const value = event.target.value;
                                setRoadmapDrafts((previous) => ({
                                  ...previous,
                                  [row.integrationKey]: {
                                    ...draft,
                                    targetQuarter: value,
                                  },
                                }));
                              }}
                              placeholder="f.eks. 2026-Q3"
                              data-testid={`integration-admin-quarter-${row.integrationKey}`}
                            />
                            <Input
                              value={draft.fitScore}
                              onChange={(event) => {
                                const value = event.target.value.replace(/[^0-9]/g, "");
                                setRoadmapDrafts((previous) => ({
                                  ...previous,
                                  [row.integrationKey]: {
                                    ...draft,
                                    fitScore: value,
                                  },
                                }));
                              }}
                              placeholder="Fit score 1-5"
                              data-testid={`integration-admin-fit-${row.integrationKey}`}
                            />
                            <Input
                              value={draft.statusReason}
                              onChange={(event) => {
                                const value = event.target.value;
                                setRoadmapDrafts((previous) => ({
                                  ...previous,
                                  [row.integrationKey]: {
                                    ...draft,
                                    statusReason: value,
                                  },
                                }));
                              }}
                              placeholder="Begrunnelse"
                              data-testid={`integration-admin-reason-${row.integrationKey}`}
                            />
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => roadmapPatchMutation.mutate(row.integrationKey)}
                                disabled={roadmapPatchMutation.isPending}
                                data-testid={`integration-admin-save-${row.integrationKey}`}
                              >
                                Lagre
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => recalcMutation.mutate(row.integrationKey)}
                                disabled={recalcMutation.isPending}
                                data-testid={`integration-admin-recalc-${row.integrationKey}`}
                              >
                                Recalc
                              </Button>
                            </div>
                          </TableCell>
                        ) : null}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {showAdminTools ? (
        <Card data-testid="integration-analytics-card">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Integrasjonsanalyse
            </CardTitle>
            <CardDescription>Trender og scoregrunnlag for prioritering</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              {[7, 30, 90].map((days) => (
                <Button
                  key={days}
                  type="button"
                  variant={analyticsDays === days ? "default" : "outline"}
                  onClick={() => setAnalyticsDays(days as 7 | 30 | 90)}
                  size="sm"
                  data-testid={`integration-analytics-days-${days}`}
                >
                  {days} dager
                </Button>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Forespørsler ({analyticsDays}d)</p>
                <p className="text-lg font-semibold">{analyticsData?.trends.selectedPeriod.primaryRequests ?? 0}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Signaler ({analyticsDays}d)</p>
                <p className="text-lg font-semibold">{analyticsData?.trends.selectedPeriod.teamSignals ?? 0}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Requested → Planned</p>
                <p className="text-lg font-semibold">{(analyticsData?.conversion.requestedToPlanned.percent ?? 0).toFixed(1)}%</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Planned → Launched</p>
                <p className="text-lg font-semibold">{(analyticsData?.conversion.plannedToLaunched.percent ?? 0).toFixed(1)}%</p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Hovedforespørsler</p>
                <p className="mb-2 text-lg font-semibold">{adminRequestsData?.primary?.length ?? 0}</p>
                <div className="space-y-1 text-xs text-muted-foreground">
                  {(adminRequestsData?.primary || []).slice(0, 5).map((item) => (
                    <p key={item.id}>
                      {item.integration_name} • {item.vendor_name || "Ukjent vendor"}
                    </p>
                  ))}
                </div>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Team-signaler</p>
                <p className="mb-2 text-lg font-semibold">{adminRequestsData?.signals?.length ?? 0}</p>
                <div className="space-y-1 text-xs text-muted-foreground">
                  {(adminRequestsData?.signals || []).slice(0, 5).map((item) => (
                    <p key={item.id}>
                      {item.integration_name} • {item.vendor_name || "Ukjent vendor"}
                    </p>
                  ))}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Integrasjon</TableHead>
                    <TableHead>Unike vendors</TableHead>
                    <TableHead>Team-signaler</TableHead>
                    <TableHead>Total score</TableHead>
                    <TableHead>Demand</TableHead>
                    <TableHead>MRR</TableHead>
                    <TableHead>Fit</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(analyticsData?.summaryByIntegration || []).map((row) => (
                    <TableRow key={row.integrationKey}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell>{row.uniqueVendors}</TableCell>
                      <TableCell>{row.teamSignals}</TableCell>
                      <TableCell>{row.score.total.toFixed(1)}</TableCell>
                      <TableCell>{row.score.demand.toFixed(1)}</TableCell>
                      <TableCell>{row.score.mrr.toFixed(1)}</TableCell>
                      <TableCell>{row.score.fit.toFixed(1)}</TableCell>
                      <TableCell>
                        <Badge variant={statusBadgeVariant(row.status)}>{STATUS_LABELS[row.status]}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

export default IntegrationRequestsPanel;
