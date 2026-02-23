import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { PortalLayout } from "@/components/portal/portal-layout";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { Clock, Settings, TrendingUp, CheckCircle2, XCircle, Calendar as CalendarIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface OvertimeSettings {
  id: number;
  userId: string;
  weeklyThreshold: number;
  dailyThreshold: number;
  rate150: number;
  rate200: number;
  effectiveFrom: string;
  createdAt: string;
}

interface OvertimeEntry {
  id: number;
  userId: string;
  date: string;
  regularHours: number;
  overtimeHours: number;
  rate150Hours: number;
  rate200Hours: number;
  totalCompensation: number;
  status: "pending" | "approved" | "rejected";
  approvedBy: string | null;
  approvedAt: string | null;
  notes: string | null;
  createdAt: string;
}

interface OvertimeSummary {
  period: string;
  totalRegularHours: number;
  totalOvertimeHours: number;
  total150Hours: number;
  total200Hours: number;
  totalCompensation: number;
  entriesCount: number;
}

export default function OvertimePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<Date>(new Date());

  // Settings form
  const [weeklyThreshold, setWeeklyThreshold] = useState("37.5");
  const [dailyThreshold, setDailyThreshold] = useState("7.5");
  const [rate150, setRate150] = useState("1.5");
  const [rate200, setRate200] = useState("2.0");

  // Fetch settings
  const { data: settings } = useQuery<OvertimeSettings>({
    queryKey: ["/api/overtime/settings"],
  });

  // Fetch entries
  const { data: entries = [], isLoading: entriesLoading } = useQuery<OvertimeEntry[]>({
    queryKey: ["/api/overtime/entries"],
  });

  // Fetch summary
  const monthStr = format(selectedMonth, "yyyy-MM");
  const { data: summary } = useQuery<OvertimeSummary>({
    queryKey: [`/api/overtime/summary?month=${monthStr}`],
  });

  // Update settings mutation
  const updateSettingsMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch("/api/overtime/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Kunne ikke lagre innstillinger");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/overtime/settings"] });
      toast({ title: "Lagret", description: "Overtidsinnstillinger oppdatert" });
      setIsSettingsOpen(false);
    },
    onError: () => {
      toast({ title: "Feil", description: "Kunne ikke lagre innstillinger", variant: "destructive" });
    },
  });

  // Calculate overtime mutation
  const calculateMutation = useMutation({
    mutationFn: async (data: { startDate: string; endDate: string }) => {
      const res = await fetch("/api/overtime/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Kunne ikke beregne overtid");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/overtime/entries"] });
      queryClient.invalidateQueries({ queryKey: [`/api/overtime/summary?month=${monthStr}`] });
      toast({ 
        title: "Beregnet", 
        description: `${data.entries?.length || 0} overtidsdager funnet` 
      });
    },
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async ({ id, status, notes }: { id: number; status: string; notes?: string }) => {
      const res = await fetch(`/api/overtime/entries/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status, approvedBy: notes }),
      });
      if (!res.ok) throw new Error("Kunne ikke oppdatere status");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/overtime/entries"] });
      toast({ title: "Oppdatert", description: "Status endret" });
    },
  });

  const handleSaveSettings = () => {
    updateSettingsMutation.mutate({
      weeklyThreshold: parseFloat(weeklyThreshold),
      dailyThreshold: parseFloat(dailyThreshold),
      rate150: parseFloat(rate150),
      rate200: parseFloat(rate200),
    });
  };

  const handleCalculate = () => {
    const startDate = format(selectedMonth, "yyyy-MM-01");
    const endDate = format(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0), "yyyy-MM-dd");
    calculateMutation.mutate({ startDate, endDate });
  };

  // Load settings into form
  useState(() => {
    if (settings) {
      setWeeklyThreshold(settings.weeklyThreshold.toString());
      setDailyThreshold(settings.dailyThreshold.toString());
      setRate150(settings.rate150.toString());
      setRate200(settings.rate200.toString());
    }
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-green-500"><CheckCircle2 className="h-3 w-3 mr-1" />Godkjent</Badge>;
      case "rejected":
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Avvist</Badge>;
      default:
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Venter</Badge>;
    }
  };

  return (
    <PortalLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Overtid</h1>
            <p className="text-muted-foreground">
              Automatisk beregning og godkjenning av overtidstimer
            </p>
          </div>
          <div className="flex gap-2">
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
                  <DialogDescription>
                    Sett terskelverdi og satser for overtidsberegning
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="weeklyThreshold">Ukentlig terskel (timer)</Label>
                      <Input
                        id="weeklyThreshold"
                        type="number"
                        step="0.5"
                        value={weeklyThreshold}
                        onChange={(e) => setWeeklyThreshold(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground mt-1">Standard: 37.5</p>
                    </div>
                    <div>
                      <Label htmlFor="dailyThreshold">Daglig terskel (timer)</Label>
                      <Input
                        id="dailyThreshold"
                        type="number"
                        step="0.5"
                        value={dailyThreshold}
                        onChange={(e) => setDailyThreshold(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground mt-1">Standard: 7.5</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="rate150">50% tillegg (multiplier)</Label>
                      <Input
                        id="rate150"
                        type="number"
                        step="0.1"
                        value={rate150}
                        onChange={(e) => setRate150(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground mt-1">Standard: 1.5x</p>
                    </div>
                    <div>
                      <Label htmlFor="rate200">100% tillegg (multiplier)</Label>
                      <Input
                        id="rate200"
                        type="number"
                        step="0.1"
                        value={rate200}
                        onChange={(e) => setRate200(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground mt-1">Standard: 2.0x</p>
                    </div>
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsSettingsOpen(false)}>
                    Avbryt
                  </Button>
                  <Button onClick={handleSaveSettings} disabled={updateSettingsMutation.isPending}>
                    Lagre
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Button onClick={handleCalculate} disabled={calculateMutation.isPending}>
              <TrendingUp className="h-4 w-4 mr-2" />
              Beregn overtid
            </Button>
          </div>
        </div>

        {/* Summary Card */}
        {summary && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Månedssammendrag</CardTitle>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm">
                      <CalendarIcon className="h-4 w-4 mr-2" />
                      {format(selectedMonth, "MMMM yyyy", { locale: nb })}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={selectedMonth}
                      onSelect={(date) => date && setSelectedMonth(date)}
                      locale={nb}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Ordinære timer</p>
                  <p className="text-2xl font-bold">{summary.totalRegularHours}t</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Overtidstimer</p>
                  <p className="text-2xl font-bold text-orange-500">{summary.totalOvertimeHours}t</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">50% tillegg</p>
                  <p className="text-2xl font-bold">{summary.total150Hours}t</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">100% tillegg</p>
                  <p className="text-2xl font-bold">{summary.total200Hours}t</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total kompensasjon</p>
                  <p className="text-2xl font-bold text-green-500">{summary.totalCompensation}t</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Entries Table */}
        <Card>
          <CardHeader>
            <CardTitle>Overtidsregistreringer</CardTitle>
            <CardDescription>
              Automatisk beregnet basert på innstillinger
            </CardDescription>
          </CardHeader>
          <CardContent>
            {entriesLoading ? (
              <div className="py-8 text-center text-muted-foreground">Laster...</div>
            ) : entries.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                Ingen overtidsregistreringer. Klikk "Beregn overtid" for å starte.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dato</TableHead>
                    <TableHead>Ordinær</TableHead>
                    <TableHead>Overtid</TableHead>
                    <TableHead>50% tillegg</TableHead>
                    <TableHead>100% tillegg</TableHead>
                    <TableHead>Kompensasjon</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Handlinger</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>
                        {format(new Date(entry.date), "dd.MM.yyyy", { locale: nb })}
                      </TableCell>
                      <TableCell>{entry.regularHours}t</TableCell>
                      <TableCell className="font-medium text-orange-500">
                        {entry.overtimeHours}t
                      </TableCell>
                      <TableCell>{entry.rate150Hours}t</TableCell>
                      <TableCell>{entry.rate200Hours}t</TableCell>
                      <TableCell className="font-medium text-green-500">
                        {entry.totalCompensation}t
                      </TableCell>
                      <TableCell>{getStatusBadge(entry.status)}</TableCell>
                      <TableCell>
                        {entry.status === "pending" && (
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                approveMutation.mutate({
                                  id: entry.id,
                                  status: "approved",
                                })
                              }
                            >
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                approveMutation.mutate({
                                  id: entry.id,
                                  status: "rejected",
                                })
                              }
                            >
                              <XCircle className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Hvordan det fungerer
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">
              • Overtid beregnes basert på daglige og ukentlige terskler
            </p>
            <p className="text-sm text-muted-foreground">
              • Timer utover daglig terskel får 50% tillegg (1.5x)
            </p>
            <p className="text-sm text-muted-foreground">
              • Timer utover ukentlig terskel får 100% tillegg (2.0x)
            </p>
            <p className="text-sm text-muted-foreground">
              • Overtid må godkjennes av leder før utbetaling
            </p>
          </CardContent>
        </Card>
      </div>
    </PortalLayout>
  );
}
