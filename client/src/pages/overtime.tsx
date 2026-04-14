import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useRolePreview } from "@/hooks/use-role-preview";
import { PortalLayout } from "@/components/portal/portal-layout";
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  getISOWeek, addWeeks, subWeeks, addMonths, subMonths,
} from "date-fns";
import { nb } from "date-fns/locale";
import {
  Clock, Settings, TrendingUp, CheckCircle2, XCircle, Calendar as CalendarIcon,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface OvertimeSettings {
  userId: string;
  standardHoursPerDay: string;
  standardHoursPerWeek: string;
  overtimeRateMultiplier: string;
  doubleTimeThreshold: string | null;
}

interface OvertimeEntry {
  id: number;
  userId: string;
  date: string;
  regularHours: string;
  overtimeHours: string;
  doubleTimeHours: string;
  status: "pending" | "approved" | "rejected";
  approvedBy: string | null;
  approvedAt: string | null;
  notes: string | null;
  createdAt: string;
}

interface MonthSummary {
  period: string;
  totalRegularHours: number;
  totalOvertimeHours: number;
  total150Hours: number;
  total200Hours: number;
  compensation150: number;
  compensation200: number;
  totalCompensation: number;
  entriesCount: number;
  rate150: number;
  rate200: number;
}

const ADMIN_ROLES = ["tiltaksleder", "teamleder", "hovedadmin", "admin", "super_admin"];

export default function OvertimePage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { effectiveRole } = useRolePreview();
  const queryClient = useQueryClient();
  const isAdmin = ADMIN_ROLES.includes(effectiveRole);
  const userId = user?.id ? String(user.id) : "";

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"month" | "week">("month");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  // Settings form (hydrated via useEffect below)
  const [dailyThreshold, setDailyThreshold] = useState("7.5");
  const [weeklyThreshold, setWeeklyThreshold] = useState("37.5");
  const [rate150, setRate150] = useState("1.5");
  const [doubleTimeThreshold, setDoubleTimeThreshold] = useState("");

  // Date range derived from view mode
  const { rangeStart, rangeEnd, rangeLabel, prev, next } = useMemo(() => {
    if (viewMode === "week") {
      const start = startOfWeek(selectedDate, { weekStartsOn: 1 });
      const end = endOfWeek(selectedDate, { weekStartsOn: 1 });
      return {
        rangeStart: format(start, "yyyy-MM-dd"),
        rangeEnd: format(end, "yyyy-MM-dd"),
        rangeLabel: `Uke ${getISOWeek(selectedDate)} — ${format(start, "d. MMM", { locale: nb })}–${format(end, "d. MMM yyyy", { locale: nb })}`,
        prev: () => setSelectedDate(subWeeks(selectedDate, 1)),
        next: () => setSelectedDate(addWeeks(selectedDate, 1)),
      };
    }
    const start = startOfMonth(selectedDate);
    const end = endOfMonth(selectedDate);
    return {
      rangeStart: format(start, "yyyy-MM-dd"),
      rangeEnd: format(end, "yyyy-MM-dd"),
      rangeLabel: format(selectedDate, "MMMM yyyy", { locale: nb }),
      prev: () => setSelectedDate(subMonths(selectedDate, 1)),
      next: () => setSelectedDate(addMonths(selectedDate, 1)),
    };
  }, [viewMode, selectedDate]);

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: settings } = useQuery<OvertimeSettings>({
    queryKey: ["/api/overtime/settings", userId],
    queryFn: () => fetch(`/api/overtime/settings?userId=${encodeURIComponent(userId)}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!userId,
  });

  const { data: entriesData, isLoading: entriesLoading } = useQuery<{ entries: OvertimeEntry[] }>({
    queryKey: ["/api/overtime/entries", userId, rangeStart, rangeEnd],
    queryFn: () => fetch(`/api/overtime/entries?userId=${encodeURIComponent(userId)}&startDate=${rangeStart}&endDate=${rangeEnd}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!userId,
  });
  const entries = entriesData?.entries ?? [];

  // Summary only makes sense in month mode; in week mode we compute locally
  const monthStr = format(selectedDate, "yyyy-MM");
  const { data: monthSummary } = useQuery<MonthSummary>({
    queryKey: ["/api/overtime/summary", userId, monthStr],
    queryFn: () => fetch(`/api/overtime/summary?userId=${encodeURIComponent(userId)}&month=${monthStr}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!userId,
  });

  // Local aggregation for the current range (works for both week and month view)
  const rangeSummary = useMemo(() => {
    const rate150Num = parseFloat(settings?.overtimeRateMultiplier || "1.5");
    const rate200Num = 2.0;
    const total = entries.reduce((acc, e) => {
      const reg = parseFloat(e.regularHours || "0");
      const ot = parseFloat(e.overtimeHours || "0");
      const dt = parseFloat(e.doubleTimeHours || "0");
      acc.regular += reg;
      acc.overtime += ot;
      acc.doubleTime += dt;
      acc.comp150 += ot * rate150Num;
      acc.comp200 += dt * rate200Num;
      return acc;
    }, { regular: 0, overtime: 0, doubleTime: 0, comp150: 0, comp200: 0 });
    return {
      ...total,
      totalCompensation: total.comp150 + total.comp200,
      rate150: rate150Num,
      rate200: rate200Num,
    };
  }, [entries, settings]);

  // ── Mutations ────────────────────────────────────────────────────────────

  const updateSettings = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch("/api/overtime/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId, ...data }),
      });
      if (!res.ok) throw new Error("Kunne ikke lagre innstillinger");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/overtime/settings"] });
      toast({ title: "Lagret", description: "Overtidsinnstillinger oppdatert" });
      setIsSettingsOpen(false);
    },
    onError: () => toast({ title: "Feil", description: "Kunne ikke lagre innstillinger", variant: "destructive" }),
  });

  const calculate = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/overtime/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId, startDate: rangeStart, endDate: rangeEnd }),
      });
      if (!res.ok) throw new Error("Kunne ikke beregne overtid");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/overtime/entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/overtime/summary"] });
      toast({ title: "Beregnet", description: `${data.calculated || 0} overtidsdager funnet` });
    },
    onError: (e: any) => toast({ title: "Feil", description: e?.message || "Kunne ikke beregne", variant: "destructive" }),
  });

  const approve = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: "approved" | "rejected" }) => {
      const res = await fetch(`/api/overtime/entries/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Kunne ikke oppdatere status");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/overtime/entries"] });
      toast({ title: "Oppdatert", description: "Status endret" });
    },
  });

  // Hydrate form from fetched settings (fixed bug: was useState callback)
  useEffect(() => {
    if (!settings) return;
    setDailyThreshold(settings.standardHoursPerDay || "7.5");
    setWeeklyThreshold(settings.standardHoursPerWeek || "37.5");
    setRate150(settings.overtimeRateMultiplier || "1.5");
    setDoubleTimeThreshold(settings.doubleTimeThreshold ?? "");
  }, [settings]);

  const handleSaveSettings = () => {
    updateSettings.mutate({
      standardHoursPerDay: dailyThreshold,
      standardHoursPerWeek: weeklyThreshold,
      overtimeRateMultiplier: rate150,
      doubleTimeThreshold: doubleTimeThreshold || null,
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved": return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 border"><CheckCircle2 className="h-3 w-3 mr-1" />Godkjent</Badge>;
      case "rejected": return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Avvist</Badge>;
      default:         return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Venter</Badge>;
    }
  };

  return (
    <PortalLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Overtid</h1>
            <p className="text-muted-foreground">Automatisk beregning og godkjenning av overtidstimer</p>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <Settings className="h-4 w-4 mr-2" />
                    Innstillinger
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Overtidsinnstillinger</DialogTitle>
                    <DialogDescription>Sett terskelverdier og satser for overtidsberegning</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="dailyThreshold">Daglig terskel (timer)</Label>
                        <Input id="dailyThreshold" type="number" step="0.5" value={dailyThreshold} onChange={(e) => setDailyThreshold(e.target.value)} />
                        <p className="text-xs text-muted-foreground mt-1">Standard: 7.5</p>
                      </div>
                      <div>
                        <Label htmlFor="weeklyThreshold">Ukentlig terskel (timer)</Label>
                        <Input id="weeklyThreshold" type="number" step="0.5" value={weeklyThreshold} onChange={(e) => setWeeklyThreshold(e.target.value)} />
                        <p className="text-xs text-muted-foreground mt-1">Standard: 37.5</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="rate150">Overtidsmultiplier (50% tillegg)</Label>
                        <Input id="rate150" type="number" step="0.1" value={rate150} onChange={(e) => setRate150(e.target.value)} />
                        <p className="text-xs text-muted-foreground mt-1">Standard: 1.5x</p>
                      </div>
                      <div>
                        <Label htmlFor="doubleTimeThreshold">Terskel for 100% tillegg (timer/dag)</Label>
                        <Input id="doubleTimeThreshold" type="number" step="0.5" value={doubleTimeThreshold} onChange={(e) => setDoubleTimeThreshold(e.target.value)} placeholder="Valgfri" />
                        <p className="text-xs text-muted-foreground mt-1">F.eks. 12 — timer utover gir 2.0x</p>
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsSettingsOpen(false)}>Avbryt</Button>
                    <Button onClick={handleSaveSettings} disabled={updateSettings.isPending}>Lagre</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}

            <Button onClick={() => calculate.mutate()} disabled={calculate.isPending || !userId}>
              <TrendingUp className="h-4 w-4 mr-2" />
              Beregn overtid
            </Button>
          </div>
        </div>

        {/* View mode toggle & range picker */}
        <Card>
          <CardContent className="p-4 flex flex-col md:flex-row md:items-center gap-3">
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)}>
              <TabsList>
                <TabsTrigger value="month">Måned</TabsTrigger>
                <TabsTrigger value="week">Uke</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="flex items-center gap-2 md:ml-4">
              <Button variant="ghost" size="sm" onClick={prev} aria-label="Forrige">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="min-w-[220px]">
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {rangeLabel}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={selectedDate} onSelect={(d) => d && setSelectedDate(d)} locale={nb} />
                </PopoverContent>
              </Popover>
              <Button variant="ghost" size="sm" onClick={next} aria-label="Neste">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="md:ml-auto text-xs text-muted-foreground">
              Satser: overtid ×{rangeSummary.rate150.toFixed(1)}, dobbel ×{rangeSummary.rate200.toFixed(1)}
            </div>
          </CardContent>
        </Card>

        {/* Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {viewMode === "week" ? "Ukesammendrag" : "Månedssammendrag"}
            </CardTitle>
            <CardDescription>{rangeLabel}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <Stat label="Ordinære timer" value={`${rangeSummary.regular.toFixed(1)}t`} />
              <Stat label="Overtid (50%)" value={`${rangeSummary.overtime.toFixed(1)}t`} accent="text-amber-600" />
              <Stat label="Dobbel (100%)" value={`${rangeSummary.doubleTime.toFixed(1)}t`} accent="text-orange-600" />
              <Stat
                label="Kompensasjon 50%"
                value={`${rangeSummary.comp150.toFixed(1)}t`}
                hint={`${rangeSummary.overtime.toFixed(1)} × ${rangeSummary.rate150.toFixed(1)}`}
              />
              <Stat
                label="Total kompensasjon"
                value={`${rangeSummary.totalCompensation.toFixed(1)}t`}
                accent="text-emerald-600"
                hint={rangeSummary.comp200 > 0 ? `+${rangeSummary.comp200.toFixed(1)}t dobbel` : undefined}
              />
            </div>
          </CardContent>
        </Card>

        {/* Entries Table */}
        <Card>
          <CardHeader>
            <CardTitle>Overtidsregistreringer</CardTitle>
            <CardDescription>Automatisk beregnet basert på innstillinger</CardDescription>
          </CardHeader>
          <CardContent>
            {entriesLoading ? (
              <div className="py-8 text-center text-muted-foreground">Laster…</div>
            ) : entries.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                Ingen overtidsregistreringer i valgt periode. Klikk "Beregn overtid" for å starte.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dato</TableHead>
                    <TableHead>Ordinær</TableHead>
                    <TableHead>Overtid (50%)</TableHead>
                    <TableHead>Dobbel (100%)</TableHead>
                    <TableHead>Kompensasjon</TableHead>
                    <TableHead>Status</TableHead>
                    {isAdmin && <TableHead className="text-right">Handlinger</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => {
                    const ot = parseFloat(entry.overtimeHours || "0");
                    const dt = parseFloat(entry.doubleTimeHours || "0");
                    const comp = ot * rangeSummary.rate150 + dt * rangeSummary.rate200;
                    return (
                      <TableRow key={entry.id}>
                        <TableCell>{format(new Date(entry.date), "dd.MM.yyyy", { locale: nb })}</TableCell>
                        <TableCell>{parseFloat(entry.regularHours).toFixed(1)}t</TableCell>
                        <TableCell className="font-medium text-amber-600">{ot.toFixed(1)}t</TableCell>
                        <TableCell className="text-orange-600">{dt.toFixed(1)}t</TableCell>
                        <TableCell className="font-medium text-emerald-600">{comp.toFixed(1)}t</TableCell>
                        <TableCell>{getStatusBadge(entry.status)}</TableCell>
                        {isAdmin && (
                          <TableCell className="text-right">
                            {entry.status === "pending" && (
                              <div className="inline-flex gap-1">
                                <Button size="sm" variant="ghost" onClick={() => approve.mutate({ id: entry.id, status: "approved" })} aria-label="Godkjenn">
                                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => approve.mutate({ id: entry.id, status: "rejected" })} aria-label="Avvis">
                                  <XCircle className="h-4 w-4 text-red-500" />
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card className="border-border/70 bg-muted/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4" />
              Hvordan det fungerer
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm text-muted-foreground">
            <p>• Overtid beregnes automatisk basert på daglige og ukentlige terskler</p>
            <p>• Timer utover daglig terskel får {rangeSummary.rate150.toFixed(1)}× (50% tillegg)</p>
            <p>• Valgfri 100%-terskel gir {rangeSummary.rate200.toFixed(1)}× for ekstreme dager</p>
            <p>• Kompensasjonstimer = overtidstimer × sats (viser reell kostnad)</p>
            <p>• Overtid må godkjennes av tiltaksleder før utbetaling</p>
          </CardContent>
        </Card>
      </div>
    </PortalLayout>
  );
}

function Stat({ label, value, accent, hint }: { label: string; value: string; accent?: string; hint?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-2xl font-bold", accent)}>{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{hint}</p>}
    </div>
  );
}
