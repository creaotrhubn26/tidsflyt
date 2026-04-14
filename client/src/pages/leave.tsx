import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Calendar as CalendarIcon, Plus, Check, X, Clock, Pencil, Trash2,
} from "lucide-react";
import { PortalLayout } from "@/components/portal/portal-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { format, differenceInBusinessDays } from "date-fns";
import { nb } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useRolePreview } from "@/hooks/use-role-preview";
import { queryClient, apiRequest } from "@/lib/queryClient";

const ADMIN_ROLES = ["tiltaksleder", "teamleder", "hovedadmin", "admin", "super_admin"];

const STATUS_BADGE: Record<string, string> = {
  pending:   "bg-amber-500/10 text-amber-600 border-amber-500/20",
  approved:  "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  rejected:  "bg-destructive/10 text-destructive border-destructive/20",
  cancelled: "bg-muted text-muted-foreground border-border",
};
const STATUS_LABEL: Record<string, string> = {
  pending: "Venter", approved: "Godkjent", rejected: "Avvist", cancelled: "Avbrutt",
};

export default function LeavePage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { effectiveRole } = useRolePreview();
  const isAdmin = ADMIN_ROLES.includes(effectiveRole);
  const userId = user?.id ? String(user.id) : "";

  const [showRequestDialog, setShowRequestDialog] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [selectedType, setSelectedType] = useState("");
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [reason, setReason] = useState("");

  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [tab, setTab] = useState<"mine" | "godkjenning">("mine");

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: leaveTypes = [] } = useQuery<any[]>({
    queryKey: ["/api/leave/types"],
  });

  const { data: balances = [] } = useQuery<any[]>({
    queryKey: ["/api/leave/balance", { userId, year: selectedYear }],
    queryFn: () => apiRequest("GET", `/api/leave/balance?userId=${encodeURIComponent(userId)}&year=${selectedYear}`).then(r => r.json()),
    enabled: !!userId,
  });

  const { data: myRequests = [] } = useQuery<any[]>({
    queryKey: ["/api/leave/requests", { userId, year: selectedYear }],
    queryFn: () => apiRequest("GET", `/api/leave/requests?userId=${encodeURIComponent(userId)}`).then(r => r.json()),
    enabled: !!userId,
  });

  const { data: pendingRequests = [] } = useQuery<any[]>({
    queryKey: ["/api/leave/requests", { status: "pending" }],
    queryFn: () => apiRequest("GET", `/api/leave/requests?status=pending`).then(r => r.json()),
    enabled: isAdmin,
  });

  // Filter requests by selected year on the client (server has no year filter yet)
  const myRequestsForYear = useMemo(() => {
    return myRequests.filter((r: any) => r.startDate && new Date(r.startDate).getFullYear() === selectedYear);
  }, [myRequests, selectedYear]);

  const pendingForOthers = useMemo(
    () => pendingRequests.filter((r: any) => r.userId !== userId),
    [pendingRequests, userId],
  );

  // ── Mutations ────────────────────────────────────────────────────────────

  const createRequest = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/leave/requests", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leave/requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leave/balance"] });
      closeDialog();
      toast({ title: "Sendt", description: "Fraværssøknad sendt til godkjenning" });
    },
    onError: (e: any) => toast({ title: "Feil", description: e?.message || "Kunne ikke sende", variant: "destructive" }),
  });

  const updateRequest = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiRequest("PUT", `/api/leave/requests/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leave/requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leave/balance"] });
      closeDialog();
      toast({ title: "Oppdatert", description: "Søknaden er endret" });
    },
    onError: (e: any) => toast({ title: "Feil", description: e?.message || "Kunne ikke oppdatere", variant: "destructive" }),
  });

  const cancelRequest = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/leave/requests/${id}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leave/requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leave/balance"] });
      toast({ title: "Avbrutt", description: "Søknaden ble trukket tilbake" });
    },
    onError: (e: any) => toast({ title: "Feil", description: e?.message || "Kunne ikke avbryte", variant: "destructive" }),
  });

  const reviewRequest = useMutation({
    mutationFn: ({ id, status, reviewComment }: { id: number; status: string; reviewComment?: string }) =>
      apiRequest("PATCH", `/api/leave/requests/${id}`, { status, reviewComment }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leave/requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leave/balance"] });
      toast({ title: "Behandlet", description: "Søknaden er behandlet" });
    },
    onError: (e: any) => toast({ title: "Feil", description: e?.message || "Kunne ikke behandle", variant: "destructive" }),
  });

  // ── Helpers ──────────────────────────────────────────────────────────────

  const resetForm = () => {
    setSelectedType(""); setStartDate(undefined); setEndDate(undefined);
    setReason(""); setEditingId(null);
  };
  const closeDialog = () => { setShowRequestDialog(false); resetForm(); };

  const openEdit = (req: any) => {
    setEditingId(req.id);
    setSelectedType(String(req.leaveTypeId));
    setStartDate(new Date(req.startDate));
    setEndDate(new Date(req.endDate));
    setReason(req.reason ?? "");
    setShowRequestDialog(true);
  };

  const handleSubmitRequest = () => {
    if (!selectedType || !startDate || !endDate) {
      toast({ title: "Mangler informasjon", description: "Fyll ut alle felt", variant: "destructive" });
      return;
    }
    if (endDate < startDate) {
      toast({ title: "Ugyldig datoer", description: "Sluttdato kan ikke være før startdato", variant: "destructive" });
      return;
    }
    const days = differenceInBusinessDays(endDate, startDate) + 1;
    const body = {
      userId,
      leaveTypeId: parseInt(selectedType),
      startDate: format(startDate, "yyyy-MM-dd"),
      endDate: format(endDate, "yyyy-MM-dd"),
      days,
      reason,
    };
    if (editingId) {
      updateRequest.mutate({ id: editingId, data: body });
    } else {
      createRequest.mutate(body);
    }
  };

  // Years available based on existing requests + current year
  const availableYears = useMemo(() => {
    const ys = new Set<number>([currentYear]);
    myRequests.forEach((r: any) => {
      if (r.startDate) ys.add(new Date(r.startDate).getFullYear());
    });
    return Array.from(ys).sort((a, b) => b - a);
  }, [myRequests, currentYear]);

  return (
    <PortalLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Fravær</h1>
            <p className="text-muted-foreground mt-1">Administrer ferie og fravær</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Year selector */}
            <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                {availableYears.map(y => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => setShowRequestDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Ny søknad
            </Button>
          </div>
        </div>

        {/* Balances */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {balances.length === 0 ? (
            <Card className="md:col-span-2 lg:col-span-3">
              <CardContent className="py-6 text-sm text-muted-foreground text-center">
                Ingen saldo for {selectedYear}. {isAdmin && "Initialiser feriesaldoer for året via admin."}
              </CardContent>
            </Card>
          ) : balances.map((balance: any) => (
            <Card key={balance.id}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  {balance.leaveTypeIcon
                    ? <span className="text-xl">{balance.leaveTypeIcon}</span>
                    : <CalendarIcon className="h-5 w-5 text-muted-foreground" />}
                  {balance.leaveTypeName}
                  <Badge variant="outline" className="ml-auto text-[10px]">{selectedYear}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Totalt:</span>
                    <span className="font-medium">{parseFloat(balance.totalDays || 0).toFixed(1)} dager</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Brukt:</span>
                    <span className="font-medium">{parseFloat(balance.usedDays || 0).toFixed(1)} dager</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Venter:</span>
                    <span className="font-medium">{parseFloat(balance.pendingDays || 0).toFixed(1)} dager</span>
                  </div>
                  <div className="flex justify-between text-sm pt-2 border-t">
                    <span className="font-medium">Gjenstående {selectedYear}:</span>
                    <span className="font-bold text-primary">{parseFloat(balance.remainingDays || 0).toFixed(1)} dager</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tabs: Mine søknader / Godkjenning (admin) */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList>
            <TabsTrigger value="mine">Mine søknader</TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="godkjenning">
                Godkjenning
                {pendingForOthers.length > 0 && (
                  <Badge variant="secondary" className="ml-2 text-[10px]">{pendingForOthers.length}</Badge>
                )}
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="mine">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Mine søknader — {selectedYear}</CardTitle>
              </CardHeader>
              <CardContent>
                {myRequestsForYear.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">Ingen søknader for {selectedYear}</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Fra</TableHead>
                        <TableHead>Til</TableHead>
                        <TableHead>Dager</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Sendt</TableHead>
                        <TableHead className="text-right">Handlinger</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {myRequestsForYear.map((req: any) => (
                        <TableRow key={req.id}>
                          <TableCell className="font-medium">{req.leaveTypeName}</TableCell>
                          <TableCell>{format(new Date(req.startDate), "dd.MM.yyyy", { locale: nb })}</TableCell>
                          <TableCell>{format(new Date(req.endDate), "dd.MM.yyyy", { locale: nb })}</TableCell>
                          <TableCell>{parseFloat(req.days).toFixed(1)}</TableCell>
                          <TableCell>
                            <Badge className={cn("border", STATUS_BADGE[req.status || "pending"])}>
                              {STATUS_LABEL[req.status] ?? "Venter"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {format(new Date(req.createdAt), "dd.MM.yyyy", { locale: nb })}
                          </TableCell>
                          <TableCell className="text-right">
                            {req.status === "pending" ? (
                              <div className="inline-flex gap-1">
                                <Button size="sm" variant="ghost" onClick={() => openEdit(req)} aria-label="Rediger">
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="sm" variant="ghost"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => {
                                    if (confirm("Er du sikker på at du vil avbryte denne søknaden?")) cancelRequest.mutate(req.id);
                                  }}
                                  aria-label="Avbryt"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            ) : req.reviewComment ? (
                              <span className="text-[11px] text-muted-foreground italic">{req.reviewComment}</span>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {isAdmin && (
            <TabsContent value="godkjenning">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Clock className="h-4 w-4 text-amber-500" />
                    Ventende søknader
                    <Badge variant="secondary" className="ml-2 text-[10px]">{pendingForOthers.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {pendingForOthers.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">Ingen søknader venter på godkjenning.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Søker</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Periode</TableHead>
                          <TableHead>Dager</TableHead>
                          <TableHead>Begrunnelse</TableHead>
                          <TableHead className="text-right">Handlinger</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pendingForOthers.map((req: any) => (
                          <TableRow key={req.id}>
                            <TableCell className="font-mono text-xs">{req.userId}</TableCell>
                            <TableCell className="font-medium">{req.leaveTypeName}</TableCell>
                            <TableCell>
                              {format(new Date(req.startDate), "dd.MM", { locale: nb })}
                              {" – "}
                              {format(new Date(req.endDate), "dd.MM.yyyy", { locale: nb })}
                            </TableCell>
                            <TableCell>{parseFloat(req.days).toFixed(1)}</TableCell>
                            <TableCell className="max-w-[240px] truncate text-xs text-muted-foreground">
                              {req.reason || "—"}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="inline-flex gap-1">
                                <Button
                                  size="sm" variant="ghost"
                                  className="text-emerald-600 hover:text-emerald-700"
                                  onClick={() => reviewRequest.mutate({ id: req.id, status: "approved" })}
                                  aria-label="Godkjenn"
                                >
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm" variant="ghost"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => {
                                    const comment = prompt("Begrunnelse for avslag (valgfri):") ?? undefined;
                                    reviewRequest.mutate({ id: req.id, status: "rejected", reviewComment: comment });
                                  }}
                                  aria-label="Avslå"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>

        {/* New / Edit Request Dialog */}
        <Dialog open={showRequestDialog} onOpenChange={(open) => { if (!open) closeDialog(); else setShowRequestDialog(true); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? "Rediger søknad" : "Ny fraværssøknad"}</DialogTitle>
              <DialogDescription>
                {editingId ? "Endre detaljer på ventende søknad" : "Send en søknad om fravær til godkjenning"}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Type fravær</Label>
                <Select value={selectedType} onValueChange={setSelectedType} disabled={!!editingId}>
                  <SelectTrigger><SelectValue placeholder="Velg type" /></SelectTrigger>
                  <SelectContent>
                    {leaveTypes.map((type: any) => (
                      <SelectItem key={type.id} value={type.id.toString()}>{type.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {editingId && (
                  <p className="text-[11px] text-muted-foreground">Type kan ikke endres. Avbryt og lag ny søknad om det trengs.</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Fra dato</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !startDate && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {startDate ? format(startDate, "dd.MM.yyyy", { locale: nb }) : "Velg dato"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar mode="single" selected={startDate} onSelect={setStartDate} initialFocus />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2">
                  <Label>Til dato</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !endDate && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {endDate ? format(endDate, "dd.MM.yyyy", { locale: nb }) : "Velg dato"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar mode="single" selected={endDate} onSelect={setEndDate} initialFocus disabled={(date) => startDate ? date < startDate : false} />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {startDate && endDate && (
                <div className="text-sm text-muted-foreground">
                  Antall virkedager: <span className="font-semibold text-foreground">{differenceInBusinessDays(endDate, startDate) + 1}</span>
                </div>
              )}

              <div className="space-y-2">
                <Label>Begrunnelse (valgfri)</Label>
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Beskriv årsaken til fraværet…" rows={3} />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={closeDialog}>Avbryt</Button>
              <Button onClick={handleSubmitRequest} disabled={createRequest.isPending || updateRequest.isPending}>
                {editingId ? "Lagre endringer" : "Send søknad"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PortalLayout>
  );
}
