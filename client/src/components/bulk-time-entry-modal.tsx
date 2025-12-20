import { useState, useEffect, useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isWeekend, getDay } from "date-fns";
import { nb } from "date-fns/locale";
import { Calendar, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

interface BulkTimeEntryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
}

interface DayEntry {
  date: string;
  hours: number;
  enabled: boolean;
  hasExisting: boolean;
}

const projectOptions = [
  { id: "general", name: "Generelt arbeid" },
  { id: "development", name: "Utvikling" },
  { id: "meeting", name: "Møte" },
  { id: "support", name: "Kundesupport" },
  { id: "admin", name: "Administrasjon" },
];

const WEEKDAY_NAMES = ["Man", "Tir", "Ons", "Tor", "Fre"];

export function BulkTimeEntryModal({ open, onOpenChange, userId }: BulkTimeEntryModalProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [defaultHours, setDefaultHours] = useState("7.5");
  const [description, setDescription] = useState("Arbeid");
  const [selectedProject, setSelectedProject] = useState("");
  const [overwriteExisting, setOverwriteExisting] = useState(false);
  const [dayEntries, setDayEntries] = useState<DayEntry[]>([]);

  const monthStart = startOfMonth(selectedMonth);
  const monthEnd = endOfMonth(selectedMonth);

  // Check for existing entries in the selected month
  const { data: existingData } = useQuery<{ existingDates: string[] }>({
    queryKey: ["/api/time-entries/check-existing", { 
      userId, 
      startDate: format(monthStart, "yyyy-MM-dd"), 
      endDate: format(monthEnd, "yyyy-MM-dd") 
    }],
    enabled: open && step === 2,
  });

  const existingDates = useMemo(() => new Set(existingData?.existingDates || []), [existingData]);

  // Generate weekday entries when moving to step 2
  useEffect(() => {
    if (step === 2) {
      const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
      const weekdays = days.filter(d => !isWeekend(d));
      
      const entries: DayEntry[] = weekdays.map(day => {
        const dateStr = format(day, "yyyy-MM-dd");
        return {
          date: dateStr,
          hours: parseFloat(defaultHours) || 7.5,
          enabled: true,
          hasExisting: existingDates.has(dateStr),
        };
      });
      
      setDayEntries(entries);
    }
  }, [step, monthStart, monthEnd, defaultHours, existingDates]);

  // Update hasExisting when existingDates changes
  useEffect(() => {
    if (dayEntries.length > 0 && existingData) {
      setDayEntries(prev => prev.map(entry => ({
        ...entry,
        hasExisting: existingDates.has(entry.date),
      })));
    }
  }, [existingDates]);

  const bulkMutation = useMutation({
    mutationFn: async (data: { entries: { date: string; hours: number; description: string; caseNumber: string | null }[]; overwrite: boolean }) => {
      return apiRequest("POST", "/api/time-entries/bulk", {
        userId,
        entries: data.entries,
        overwrite: data.overwrite,
      });
    },
    onSuccess: async (response) => {
      const result = await response.json();
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      
      const messages = [];
      if (result.created > 0) messages.push(`${result.created} opprettet`);
      if (result.overwritten > 0) messages.push(`${result.overwritten} overskrevet`);
      if (result.skipped > 0) messages.push(`${result.skipped} hoppet over`);
      
      toast({
        title: "Bulk-registrering fullført",
        description: messages.join(", "),
      });
      
      onOpenChange(false);
      resetModal();
    },
    onError: (error: any) => {
      toast({
        title: "Feil",
        description: error?.message || "Kunne ikke lagre registreringer",
        variant: "destructive",
      });
    },
  });

  const resetModal = () => {
    setStep(1);
    setDayEntries([]);
    setOverwriteExisting(false);
  };

  const handleClose = () => {
    onOpenChange(false);
    resetModal();
  };

  const handleNextStep = () => {
    if (!description.trim()) {
      toast({ title: "Mangler beskrivelse", variant: "destructive" });
      return;
    }
    setStep(2);
  };

  const handleSubmit = () => {
    const enabledEntries = dayEntries.filter(e => e.enabled);

    if (enabledEntries.length === 0) {
      toast({ title: "Ingen dager valgt", variant: "destructive" });
      return;
    }

    // Validate all entries have valid hours
    const invalidDays = enabledEntries.filter(e => 
      isNaN(e.hours) || e.hours <= 0 || e.hours > 24
    );
    
    if (invalidDays.length > 0) {
      toast({ 
        title: "Ugyldige timer", 
        description: `${invalidDays.length} dag(er) har ugyldige timer (må være mellom 0.1 og 24)`,
        variant: "destructive" 
      });
      return;
    }

    const entries = enabledEntries.map(e => ({
      date: e.date,
      hours: e.hours,
      description,
      caseNumber: selectedProject || null,
    }));

    bulkMutation.mutate({
      entries,
      overwrite: overwriteExisting,
    });
  };

  const toggleDay = (index: number) => {
    setDayEntries(prev => prev.map((e, i) => 
      i === index ? { ...e, enabled: !e.enabled } : e
    ));
  };

  const updateDayHours = (index: number, hours: string) => {
    const numHours = parseFloat(hours) || 0;
    setDayEntries(prev => prev.map((e, i) => 
      i === index ? { ...e, hours: numHours } : e
    ));
  };

  const selectAllWeekdays = () => {
    setDayEntries(prev => prev.map(e => ({ ...e, enabled: true })));
  };

  const clearAllWeekdays = () => {
    setDayEntries(prev => prev.map(e => ({ ...e, enabled: false })));
  };

  const navigateMonth = (direction: number) => {
    const newMonth = new Date(selectedMonth);
    newMonth.setMonth(newMonth.getMonth() + direction);
    setSelectedMonth(newMonth);
  };

  const totalHours = dayEntries
    .filter(e => e.enabled)
    .reduce((sum, e) => sum + e.hours, 0);

  const conflictCount = dayEntries.filter(e => e.enabled && e.hasExisting).length;

  // Group entries by week for calendar display
  const weekGroups = useMemo(() => {
    const weeks: DayEntry[][] = [];
    let currentWeek: DayEntry[] = [];
    
    dayEntries.forEach((entry, index) => {
      const dayOfWeek = getDay(new Date(entry.date));
      // Monday = 1, so we use dayOfWeek - 1 for Monday-based index
      const mondayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      
      if (mondayIndex === 0 && currentWeek.length > 0) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
      currentWeek.push(entry);
    });
    
    if (currentWeek.length > 0) {
      weeks.push(currentWeek);
    }
    
    return weeks;
  }, [dayEntries]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Fyll ut måned
          </DialogTitle>
          <DialogDescription>
            {step === 1 
              ? "Velg måned og standardinnstillinger" 
              : "Juster timer for individuelle dager"}
          </DialogDescription>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between gap-4">
              <Label>Måned</Label>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={() => navigateMonth(-1)}
                  data-testid="month-prev"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="min-w-[140px] text-center font-medium" data-testid="selected-month">
                  {format(selectedMonth, "MMMM yyyy", { locale: nb })}
                </span>
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={() => navigateMonth(1)}
                  data-testid="month-next"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="default-hours">Standard arbeidstid per dag</Label>
              <Input
                id="default-hours"
                type="number"
                step="0.5"
                min="0"
                max="24"
                value={defaultHours}
                onChange={(e) => setDefaultHours(e.target.value)}
                placeholder="7.5"
                data-testid="input-default-hours"
              />
              <p className="text-xs text-muted-foreground">Norsk standard: 7,5 timer</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bulk-description">Beskrivelse</Label>
              <Input
                id="bulk-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Arbeid"
                data-testid="input-bulk-description"
              />
            </div>

            <div className="space-y-2">
              <Label>Prosjekt (valgfritt)</Label>
              <Select value={selectedProject} onValueChange={setSelectedProject}>
                <SelectTrigger data-testid="select-bulk-project">
                  <SelectValue placeholder="Velg prosjekt" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Ingen</SelectItem>
                  {projectOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            {/* Quick actions */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={selectAllWeekdays} data-testid="select-all-days">
                  Velg alle
                </Button>
                <Button variant="outline" size="sm" onClick={clearAllWeekdays} data-testid="clear-all-days">
                  Fjern alle
                </Button>
              </div>
              <Badge variant="secondary" data-testid="total-hours-badge">
                Totalt: {totalHours.toFixed(1)} timer
              </Badge>
            </div>

            {/* Conflict warning */}
            {conflictCount > 0 && (
              <div className="flex items-start gap-2 p-3 bg-warning/10 rounded-md border border-warning/20">
                <AlertTriangle className="h-4 w-4 text-warning mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-medium">{conflictCount} dager har eksisterende registreringer</p>
                  <div className="flex items-center gap-2 mt-2">
                    <Checkbox
                      id="overwrite"
                      checked={overwriteExisting}
                      onCheckedChange={(checked) => setOverwriteExisting(checked === true)}
                      data-testid="checkbox-overwrite"
                    />
                    <label htmlFor="overwrite" className="text-xs cursor-pointer">
                      Overskriv eksisterende registreringer
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* Calendar header */}
            <div className="grid grid-cols-5 gap-1 text-center text-xs font-medium text-muted-foreground">
              {WEEKDAY_NAMES.map(day => (
                <div key={day}>{day}</div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="space-y-1 max-h-[300px] overflow-y-auto">
              {weekGroups.map((week, weekIndex) => (
                <div key={weekIndex} className="grid grid-cols-5 gap-1">
                  {week.map((entry, dayIndex) => {
                    const entryIndex = dayEntries.findIndex(e => e.date === entry.date);
                    const dayNum = parseInt(format(new Date(entry.date), "d"));
                    
                    const isInvalidHours = entry.enabled && (isNaN(entry.hours) || entry.hours <= 0 || entry.hours > 24);
                    
                    return (
                      <div
                        key={entry.date}
                        className={cn(
                          "p-2 rounded-md border text-center transition-colors",
                          entry.enabled 
                            ? "bg-primary/10 border-primary/30" 
                            : "bg-muted/30 border-muted",
                          entry.hasExisting && entry.enabled && "ring-2 ring-warning/50",
                          isInvalidHours && "ring-2 ring-destructive/50 bg-destructive/10"
                        )}
                        data-testid={`day-cell-${entry.date}`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <Checkbox
                            checked={entry.enabled}
                            onCheckedChange={() => toggleDay(entryIndex)}
                            className="h-3 w-3"
                            data-testid={`checkbox-day-${entry.date}`}
                          />
                          <span className={cn(
                            "text-xs font-medium",
                            !entry.enabled && "text-muted-foreground"
                          )}>
                            {dayNum}
                          </span>
                        </div>
                        <Input
                          type="number"
                          step="0.5"
                          min="0"
                          max="24"
                          value={entry.hours}
                          onChange={(e) => updateDayHours(entryIndex, e.target.value)}
                          disabled={!entry.enabled}
                          className="h-7 text-xs text-center px-1"
                          data-testid={`input-hours-${entry.date}`}
                        />
                        {entry.hasExisting && (
                          <span className="text-[10px] text-warning mt-0.5 block">Finnes</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === 2 && (
            <Button variant="outline" onClick={() => setStep(1)} data-testid="button-back">
              Tilbake
            </Button>
          )}
          <Button variant="outline" onClick={handleClose} data-testid="button-cancel-bulk">
            Avbryt
          </Button>
          {step === 1 ? (
            <Button onClick={handleNextStep} data-testid="button-next-step">
              Neste
            </Button>
          ) : (
            <Button 
              onClick={handleSubmit} 
              disabled={bulkMutation.isPending}
              data-testid="button-submit-bulk"
            >
              {bulkMutation.isPending ? "Lagrer..." : `Registrer ${dayEntries.filter(e => e.enabled).length} dager`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
