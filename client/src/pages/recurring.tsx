import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useSuggestionSettings } from "@/hooks/use-suggestion-settings";
import { useSuggestionVisibility } from "@/hooks/use-suggestion-visibility";
import { PortalLayout } from "@/components/portal/portal-layout";
import { useInstitutions } from "@/hooks/use-institutions";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { CalendarIcon, Plus, Repeat, Trash2, Edit2, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { isSuggestionSurfaceEnabled } from "@/lib/suggestion-settings";

interface RecurringEntry {
  id: number;
  userId: string;
  title: string;
  description: string | null;
  activity: string;
  project: string | null;
  place: string | null;
  hours: string | number;
  startTime: string | null;
  recurrenceType: "daily" | "weekly" | "monthly";
  recurrenceDays: string[] | string | null;
  recurrenceDayOfMonth: number | null;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  lastGeneratedDate: string | null;
  createdAt: string;
}

// Normalise entry from server: recurrenceDays comes back as a JSON string
function parseRecurringDays(v: string | string[] | null): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  try { const arr = JSON.parse(v); return Array.isArray(arr) ? arr : []; } catch { return []; }
}

const DAY_LABELS: Record<string, string> = {
  monday: "mandag", tuesday: "tirsdag", wednesday: "onsdag",
  thursday: "torsdag", friday: "fredag", saturday: "lørdag", sunday: "søndag",
};

const WEEKDAYS = [
  { value: "monday", label: "Mandag" },
  { value: "tuesday", label: "Tirsdag" },
  { value: "wednesday", label: "Onsdag" },
  { value: "thursday", label: "Torsdag" },
  { value: "friday", label: "Fredag" },
  { value: "saturday", label: "Lørdag" },
  { value: "sunday", label: "Søndag" },
];

export default function RecurringPage() {
  const { toast } = useToast();
  const { settings: suggestionSettings } = useSuggestionSettings();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<RecurringEntry | null>(null);
  const { institutions } = useInstitutions();

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [activity, setActivity] = useState("");
  const [project, setProject] = useState("");
  const [hours, setHours] = useState("1");
  const [startTime, setStartTime] = useState("09:00");
  const [recurrenceType, setRecurrenceType] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [selectedDays, setSelectedDays] = useState<string[]>(["monday", "wednesday", "friday"]);
  const [monthlyDay, setMonthlyDay] = useState("1");
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [selectedInstitutionId, setSelectedInstitutionId] = useState<string>("");

  // Fetch recurring entries
  const { data: entries = [], isLoading } = useQuery<RecurringEntry[]>({
    queryKey: ["/api/recurring"],
  });

  const latestEntryTemplate = useMemo(() => {
    if (!entries.length) return null;
    return [...entries].sort((a, b) => {
      const aTime = new Date(a.createdAt).getTime();
      const bTime = new Date(b.createdAt).getTime();
      return bTime - aTime;
    })[0];
  }, [entries]);
  const automationSuggestionsEnabled = isSuggestionSurfaceEnabled(suggestionSettings, "automation");

  const recurringSuggestionVisibility = useSuggestionVisibility({
    surface: "recurring",
    enabled: isDialogOpen && !editingEntry && automationSuggestionsEnabled && !!latestEntryTemplate,
    frequency: suggestionSettings.frequency,
    scopeKey: latestEntryTemplate ? `${latestEntryTemplate.id}:${latestEntryTemplate.createdAt}` : "none",
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch("/api/recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Kunne ikke opprette gjentakende oppføring");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recurring"] });
      toast({ title: "Opprettet", description: "Gjentakende oppføring opprettet" });
      resetForm();
      setIsDialogOpen(false);
    },
    onError: () => {
      toast({ title: "Feil", description: "Kunne ikke opprette oppføring", variant: "destructive" });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await fetch(`/api/recurring/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Kunne ikke oppdatere");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recurring"] });
      toast({ title: "Oppdatert", description: "Endringer lagret" });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/recurring/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Kunne ikke slette");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recurring"] });
      toast({ title: "Slettet", description: "Gjentakende oppføring fjernet" });
    },
  });

  // Generate mutation (manual trigger)
  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/recurring/generate", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Kunne ikke generere");
      return res.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: "Generert", 
        description: `${data.generated} nye tidsposter opprettet` 
      });
    },
  });

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setActivity("");
    setProject("");
    setHours("1");
    setStartTime("09:00");
    setRecurrenceType("weekly");
    setSelectedDays(["monday", "wednesday", "friday"]);
    setMonthlyDay("1");
    setStartDate(new Date());
    setEndDate(undefined);
    setSelectedInstitutionId("");
    setEditingEntry(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (recurrenceType === "weekly" && selectedDays.length === 0) {
      toast({ title: "Velg minst én dag", description: "Ukentlige oppgaver trenger minst én dag", variant: "destructive" });
      return;
    }

    const data = {
      title,
      description: description || null,
      activity,
      project: project || null,
      hours: parseFloat(hours),
      startTime,
      recurrenceType,
      recurrenceDays: recurrenceType === "weekly" ? selectedDays : null,
      recurrenceDayOfMonth: recurrenceType === "monthly" ? parseInt(monthlyDay) : null,
      startDate: format(startDate, "yyyy-MM-dd"),
      endDate: endDate ? format(endDate, "yyyy-MM-dd") : null,
      institutionId: selectedInstitutionId || null,
    };

    if (editingEntry) {
      updateMutation.mutate({ id: editingEntry.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (entry: RecurringEntry) => {
    setEditingEntry(entry);
    setTitle(entry.title);
    setDescription(entry.description || "");
    setActivity(entry.activity);
    setProject(entry.project || "");
    setHours(String(entry.hours));
    setStartTime(entry.startTime || "09:00");
    setRecurrenceType(entry.recurrenceType);
    setSelectedDays(parseRecurringDays(entry.recurrenceDays));
    setMonthlyDay(entry.recurrenceDayOfMonth?.toString() || "1");
    setStartDate(new Date(entry.startDate));
    setEndDate(entry.endDate ? new Date(entry.endDate) : undefined);
    setSelectedInstitutionId((entry as any).institutionId || "");
    setIsDialogOpen(true);
  };

  const toggleActive = (entry: RecurringEntry) => {
    updateMutation.mutate({
      id: entry.id,
      data: { isActive: !entry.isActive },
    });
  };

  const applyLatestEntryTemplate = () => {
    if (!latestEntryTemplate) return;

    setTitle(latestEntryTemplate.title);
    setDescription(latestEntryTemplate.description || "");
    setActivity(latestEntryTemplate.activity);
    setProject(latestEntryTemplate.project || "");
    setHours(String(latestEntryTemplate.hours));
    setStartTime(latestEntryTemplate.startTime || "09:00");
    setRecurrenceType(latestEntryTemplate.recurrenceType);
    setSelectedDays(parseRecurringDays(latestEntryTemplate.recurrenceDays));
    setMonthlyDay(String(latestEntryTemplate.recurrenceDayOfMonth || 1));
    setStartDate(new Date());
    setEndDate(undefined);

    toast({
      title: "Forslag brukt",
      description: `Kopierte oppsett fra "${latestEntryTemplate.title}" og satte ny startdato til i dag.`,
    });
  };

  return (
    <PortalLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Gjentakende Tidsposter</h1>
            <p className="text-muted-foreground">
              Automatisk generering av tidsposter basert på mønster
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending}
            >
              <Play className="h-4 w-4 mr-2" />
              Generer nå
            </Button>
            <Dialog open={isDialogOpen} onOpenChange={(open) => {
              setIsDialogOpen(open);
              if (!open) resetForm();
            }}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Ny oppføring
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>
                    {editingEntry ? "Rediger oppføring" : "Ny gjentakende oppføring"}
                  </DialogTitle>
                  <DialogDescription>
                    Tidsposter blir automatisk opprettet hver dag kl. 00:05
                  </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                  {!editingEntry && latestEntryTemplate && recurringSuggestionVisibility.isVisible && (
                    <div className="rounded-md border border-primary/25 bg-primary/5 p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-medium">Kopier siste oppføring</p>
                        <p className="text-xs text-muted-foreground">
                          Bruker oppsett fra "{latestEntryTemplate.title}" og tilpasser startdato til i dag.
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={applyLatestEntryTemplate}
                        data-testid="recurring-copy-latest"
                      >
                        Bruk siste
                      </Button>
                    </div>
                  )}

                  {/* Title */}
                  <div>
                    <Label htmlFor="title">Tittel *</Label>
                    <Input
                      id="title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="F.eks. Daglig standup"
                      required
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <Label htmlFor="description">Beskrivelse</Label>
                    <Textarea
                      id="description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Valgfri beskrivelse"
                      rows={2}
                    />
                  </div>

                  {/* Activity & Project */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="activity">Aktivitet *</Label>
                      <Input
                        id="activity"
                        value={activity}
                        onChange={(e) => setActivity(e.target.value)}
                        placeholder="F.eks. Møte"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="project">Prosjekt</Label>
                      <Input
                        id="project"
                        value={project}
                        onChange={(e) => setProject(e.target.value)}
                        placeholder="Valgfritt"
                      />
                    </div>
                  </div>

                  {/* Start time + Hours */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="startTime">Starttid *</Label>
                      <Input
                        id="startTime"
                        type="time"
                        step="300"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="hours">Timer *</Label>
                      <Input
                        id="hours"
                        type="number"
                        step="0.25"
                        min="0.25"
                        max="24"
                        value={hours}
                        onChange={(e) => setHours(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  {/* Institution (optional) */}
                  {institutions.length > 0 && (
                    <div>
                      <Label>Institusjon (valgfri)</Label>
                      <Select
                        value={selectedInstitutionId || "__none__"}
                        onValueChange={(v) => setSelectedInstitutionId(v === "__none__" ? "" : v)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Velg institusjon…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— ingen (gjelder alle) —</SelectItem>
                          {institutions.filter(i => i.active !== false).map(inst => (
                            <SelectItem key={inst.id} value={inst.id}>
                              {inst.name}
                              {inst.orgNumber && <span className="text-muted-foreground ml-2 text-xs">({inst.orgNumber})</span>}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Knytt denne faste oppgaven til en institusjon for bedre oversikt.
                      </p>
                    </div>
                  )}

                  {/* Recurrence Type */}
                  <div>
                    <Label>Gjentagelsesmønster *</Label>
                    <Select value={recurrenceType} onValueChange={(v: any) => setRecurrenceType(v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Daglig</SelectItem>
                        <SelectItem value="weekly">Ukentlig</SelectItem>
                        <SelectItem value="monthly">Månedlig</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Weekly: Select days */}
                  {recurrenceType === "weekly" && (
                    <div>
                      <Label>Velg dager</Label>
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        {WEEKDAYS.map((day) => (
                          <div key={day.value} className="flex items-center space-x-2">
                            <Checkbox
                              id={day.value}
                              checked={selectedDays.includes(day.value)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setSelectedDays([...selectedDays, day.value]);
                                } else {
                                  setSelectedDays(selectedDays.filter((d) => d !== day.value));
                                }
                              }}
                            />
                            <Label htmlFor={day.value} className="cursor-pointer">
                              {day.label}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Monthly: Select day */}
                  {recurrenceType === "monthly" && (
                    <div>
                      <Label htmlFor="monthlyDay">Dag i måneden (1-31)</Label>
                      <Input
                        id="monthlyDay"
                        type="number"
                        min="1"
                        max="31"
                        value={monthlyDay}
                        onChange={(e) => setMonthlyDay(e.target.value)}
                        required
                      />
                      {parseInt(monthlyDay) >= 29 && (
                        <p className="text-xs text-amber-600 mt-1">
                          Merk: Dag {monthlyDay} finnes ikke i alle måneder. Måneder uten dag {monthlyDay} bruker siste dag i måneden.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Start Date */}
                  <div>
                    <Label>Startdato *</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !startDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {startDate ? format(startDate, "PPP", { locale: nb }) : "Velg dato"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={startDate}
                          onSelect={(date) => date && setStartDate(date)}
                          locale={nb}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* End Date (optional) */}
                  <div>
                    <Label>Sluttdato (valgfri)</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !endDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {endDate ? format(endDate, "PPP", { locale: nb }) : "Ingen sluttdato"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={endDate}
                          onSelect={setEndDate}
                          locale={nb}
                          disabled={(date) => date < startDate}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setIsDialogOpen(false);
                        resetForm();
                      }}
                    >
                      Avbryt
                    </Button>
                    <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                      {editingEntry ? "Oppdater" : "Opprett"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Info Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Repeat className="h-5 w-5" />
              Hvordan det fungerer
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">
              • Tidsposter genereres automatisk hver dag kl. 00:05
            </p>
            <p className="text-sm text-muted-foreground">
              • Duplikater unngås automatisk
            </p>
            <p className="text-sm text-muted-foreground">
              • Du kan deaktivere oppføringer uten å slette dem
            </p>
            <p className="text-sm text-muted-foreground">
              • Test genereringen manuelt med "Generer nå" knappen
            </p>
          </CardContent>
        </Card>

        {/* Entries List */}
        {isLoading ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Laster...
            </CardContent>
          </Card>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4">
            <div className="relative mb-6">
              <div className="absolute inset-0 rounded-full bg-primary/20 blur-2xl scale-150" />
              <div className="relative flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-indigo-500/20 border border-primary/20 shadow-lg">
                <Repeat className="h-7 w-7 text-primary" />
              </div>
            </div>
            <h3 className="text-xl font-semibold mb-2">Ingen gjentakende oppføringer ennå</h3>
            <p className="text-sm text-muted-foreground text-center max-w-xs mb-6 leading-relaxed">
              Opprett en gjentakende oppføring for å automatisere regelmessige tidsregistreringer.
            </p>
            <Button size="lg" className="gap-2 px-8 shadow-md" onClick={() => { setIsDialogOpen(true); }}>
              <Plus className="h-5 w-5" />
              Opprett første oppføring
            </Button>
          </div>
        ) : (
          <div className="grid gap-4">
            {entries.map((entry) => (
              <Card key={entry.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="flex items-center gap-2">
                        {entry.title}
                        {!entry.isActive && (
                          <Badge variant="secondary">Deaktivert</Badge>
                        )}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        {entry.description}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={entry.isActive}
                        onCheckedChange={() => toggleActive(entry)}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(entry)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (confirm("Er du sikker på at du vil slette denne?")) {
                            deleteMutation.mutate(entry.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground text-xs">Aktivitet</span>
                      <p className="font-medium">{entry.activity || "—"}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">Prosjekt</span>
                      <p className="font-medium">{entry.project || "—"}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">Tid</span>
                      <p className="font-medium">{entry.startTime || "09:00"} · {entry.hours}t</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">Mønster</span>
                      <p className="font-medium">
                        {entry.recurrenceType === "daily" && "Daglig"}
                        {entry.recurrenceType === "weekly" && `Ukentlig: ${parseRecurringDays(entry.recurrenceDays).map(d => DAY_LABELS[d] ?? d).join(", ") || "ingen dager"}`}
                        {entry.recurrenceType === "monthly" && `Månedlig: dag ${entry.recurrenceDayOfMonth}`}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">Periode</span>
                      <p className="font-medium">
                        {format(new Date(entry.startDate), "dd.MM.yyyy", { locale: nb })}
                        {entry.endDate ? ` → ${format(new Date(entry.endDate), "dd.MM.yyyy", { locale: nb })}` : " → ∞"}
                      </p>
                    </div>
                    {(entry as any).institutionId && (
                      <div className="col-span-2 md:col-span-5">
                        <span className="text-muted-foreground text-xs">Institusjon</span>
                        <p className="font-medium text-xs">
                          {institutions.find(i => i.id === (entry as any).institutionId)?.name ?? "—"}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="mt-3 pt-3 border-t flex items-center gap-4 text-xs text-muted-foreground">
                    <span>
                      Sist generert:{" "}
                      <span className="font-medium text-foreground">
                        {entry.lastGeneratedDate
                          ? format(new Date(entry.lastGeneratedDate), "dd.MM.yyyy", { locale: nb })
                          : "Aldri"}
                      </span>
                    </span>
                    <UpcomingPreview entryId={entry.id} enabled={entry.isActive} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </PortalLayout>
  );
}

function UpcomingPreview({ entryId, enabled }: { entryId: number; enabled: boolean }) {
  const { data } = useQuery<{ upcoming: string[] }>({
    queryKey: [`/api/recurring/${entryId}/preview`],
    enabled,
    staleTime: 1000 * 60 * 30, // 30 min — these barely change
  });

  if (!enabled) return <span className="italic">Deaktivert</span>;
  const upcoming = data?.upcoming ?? [];
  if (upcoming.length === 0) return <span className="italic">Ingen planlagte kjøringer</span>;

  return (
    <span className="flex items-center gap-1 flex-wrap">
      Neste:{" "}
      {upcoming.slice(0, 3).map((d, i) => (
        <Badge key={d} variant="outline" className="text-[10px] font-normal">
          {format(new Date(d), i === 0 ? "dd. MMM" : "dd.MM", { locale: nb })}
        </Badge>
      ))}
    </span>
  );
}
