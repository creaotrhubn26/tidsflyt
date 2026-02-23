import { useState, useEffect, useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isWeekend, getDay, subMonths } from "date-fns";
import { nb } from "date-fns/locale";
import { Calendar, ChevronLeft, ChevronRight, AlertTriangle, Copy } from "lucide-react";
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
  initialGenerationMode?: "default" | "copy_previous_month";
}

interface DayEntry {
  date: string;
  hours: number;
  enabled: boolean;
  hasExisting: boolean;
  isHoliday: boolean;
  holidayName?: string;
}

interface PreviousMonthTimeEntry {
  date: string;
  hours: number;
  description: string;
  caseNumber: string | null;
}

interface WorkTypeOption {
  id: string;
  name: string;
}

interface WorkTypeSettingsResponse {
  workTypes: WorkTypeOption[];
}

// Norwegian public holidays calculation
function getNorwegianHolidays(year: number): Map<string, string> {
  const holidays = new Map<string, string>();
  
  // Fixed holidays
  holidays.set(`${year}-01-01`, "Nyttårsdag");
  holidays.set(`${year}-05-01`, "Arbeidernes dag");
  holidays.set(`${year}-05-17`, "Grunnlovsdag");
  holidays.set(`${year}-12-25`, "1. juledag");
  holidays.set(`${year}-12-26`, "2. juledag");
  
  // Easter-based holidays (using Gauss algorithm)
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  
  const easterSunday = new Date(year, month - 1, day);
  
  const addDays = (date: Date, days: number) => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  };
  
  const formatDate = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };
  
  // Easter-based holidays
  holidays.set(formatDate(addDays(easterSunday, -3)), "Skjærtorsdag");
  holidays.set(formatDate(addDays(easterSunday, -2)), "Langfredag");
  holidays.set(formatDate(easterSunday), "1. påskedag");
  holidays.set(formatDate(addDays(easterSunday, 1)), "2. påskedag");
  holidays.set(formatDate(addDays(easterSunday, 39)), "Kristi himmelfartsdag");
  holidays.set(formatDate(addDays(easterSunday, 49)), "1. pinsedag");
  holidays.set(formatDate(addDays(easterSunday, 50)), "2. pinsedag");
  
  return holidays;
}

const WEEKDAY_NAMES = ["Man", "Tir", "Ons", "Tor", "Fre"];
const NO_PROJECT_VALUE = "no_project";

const getWeekdayTemplateKey = (date: Date) => {
  const dayOfWeek = getDay(date); // 0 = Sunday, 1 = Monday ... 6 = Saturday
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return null;
  }

  const occurrence = Math.floor((date.getDate() - 1) / 7) + 1;
  return `${dayOfWeek}-${occurrence}`;
};

const getMostFrequentValue = (valueMap: Map<string, number>) => {
  let bestValue: string | null = null;
  let bestCount = 0;

  valueMap.forEach((count, value) => {
    if (count > bestCount) {
      bestValue = value;
      bestCount = count;
    }
  });

  return bestValue;
};

const parseLocalDate = (dateStr: string) => {
  const [yearStr, monthStr, dayStr] = dateStr.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  if (!year || !month || !day) {
    return null;
  }

  const parsed = new Date(year, month - 1, day);
  return isNaN(parsed.getTime()) ? null : parsed;
};

export function BulkTimeEntryModal({
  open,
  onOpenChange,
  userId,
  initialGenerationMode = "default",
}: BulkTimeEntryModalProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [defaultHours, setDefaultHours] = useState("7.5");
  const [description, setDescription] = useState("Arbeid");
  const [selectedProject, setSelectedProject] = useState(NO_PROJECT_VALUE);
  const [overwriteExisting, setOverwriteExisting] = useState(false);
  const [dayEntries, setDayEntries] = useState<DayEntry[]>([]);
  const [entryGenerationMode, setEntryGenerationMode] = useState<"default" | "copy_previous_month">("default");

  const monthStart = startOfMonth(selectedMonth);
  const monthEnd = endOfMonth(selectedMonth);
  const previousMonth = useMemo(() => subMonths(selectedMonth, 1), [selectedMonth]);
  const previousMonthStart = startOfMonth(previousMonth);
  const previousMonthEnd = endOfMonth(previousMonth);

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

  const { data: previousMonthEntries = [], isFetching: isPreviousMonthLoading } = useQuery<PreviousMonthTimeEntry[]>({
    queryKey: ["/api/time-entries", {
      userId,
      startDate: format(previousMonthStart, "yyyy-MM-dd"),
      endDate: format(previousMonthEnd, "yyyy-MM-dd"),
    }],
    enabled: open,
  });

  const { data: workTypeSettingsData } = useQuery<WorkTypeSettingsResponse>({
    queryKey: ["/api/time-tracking/work-types"],
    enabled: open,
  });

  const workTypeOptions = useMemo(
    () => workTypeSettingsData?.workTypes || [],
    [workTypeSettingsData],
  );

  const previousMonthSummary = useMemo(() => {
    const hoursByWeekdayTemplate = new Map<string, number>();
    const descriptionCounts = new Map<string, number>();
    const projectCounts = new Map<string, number>();

    previousMonthEntries.forEach((entry) => {
      const parsedDate = parseLocalDate(entry.date);
      if (!parsedDate) {
        return;
      }

      const templateKey = getWeekdayTemplateKey(parsedDate);
      if (templateKey) {
        const currentHours = hoursByWeekdayTemplate.get(templateKey) || 0;
        hoursByWeekdayTemplate.set(templateKey, currentHours + (entry.hours || 0));
      }

      const trimmedDescription = entry.description?.trim();
      if (trimmedDescription) {
        descriptionCounts.set(trimmedDescription, (descriptionCounts.get(trimmedDescription) || 0) + 1);
      }

      const projectKey = entry.caseNumber?.trim() || NO_PROJECT_VALUE;
      projectCounts.set(projectKey, (projectCounts.get(projectKey) || 0) + 1);
    });

    const preferredDescription = getMostFrequentValue(descriptionCounts);
    const preferredProjectRaw = getMostFrequentValue(projectCounts) || NO_PROJECT_VALUE;
    const preferredProject = workTypeOptions.some((p) => p.id === preferredProjectRaw)
      ? preferredProjectRaw
      : NO_PROJECT_VALUE;

    return {
      hoursByWeekdayTemplate,
      preferredDescription,
      preferredProject,
      totalEntries: previousMonthEntries.length,
      mappedTemplateDays: hoursByWeekdayTemplate.size,
    };
  }, [previousMonthEntries, workTypeOptions]);

  useEffect(() => {
    if (!open) return;
    if (initialGenerationMode !== "copy_previous_month") return;
    if (isPreviousMonthLoading) return;
    if (previousMonthSummary.mappedTemplateDays === 0) return;

    setEntryGenerationMode("copy_previous_month");
    setStep(2);
    if (previousMonthSummary.preferredDescription) {
      setDescription(previousMonthSummary.preferredDescription);
    }
    setSelectedProject(previousMonthSummary.preferredProject || NO_PROJECT_VALUE);
  }, [
    initialGenerationMode,
    isPreviousMonthLoading,
    open,
    previousMonthSummary.mappedTemplateDays,
    previousMonthSummary.preferredDescription,
    previousMonthSummary.preferredProject,
  ]);

  useEffect(() => {
    if (selectedProject === NO_PROJECT_VALUE) return;
    if (workTypeOptions.some((workType) => workType.id === selectedProject)) return;
    setSelectedProject(NO_PROJECT_VALUE);
  }, [selectedProject, workTypeOptions]);

  // Get holidays for the selected month's year
  const holidays = useMemo(() => {
    return getNorwegianHolidays(selectedMonth.getFullYear());
  }, [selectedMonth]);

  // Generate weekday entries when moving to step 2
  useEffect(() => {
    if (step === 2) {
      const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
      const weekdays = days.filter(d => !isWeekend(d));
      const fallbackHours = parseFloat(defaultHours) || 7.5;
      
      const entries: DayEntry[] = weekdays.map(day => {
        const dateStr = format(day, "yyyy-MM-dd");
        const holidayName = holidays.get(dateStr);
        const isHoliday = !!holidayName;

        let hours = fallbackHours;
        let enabled = !isHoliday;

        if (entryGenerationMode === "copy_previous_month") {
          const templateKey = getWeekdayTemplateKey(day);
          const copiedHours = templateKey ? previousMonthSummary.hoursByWeekdayTemplate.get(templateKey) : undefined;
          const hasCopiedHours = copiedHours != null && copiedHours > 0;

          if (hasCopiedHours) {
            hours = copiedHours;
          }
          enabled = hasCopiedHours && !isHoliday;
        }

        return {
          date: dateStr,
          hours,
          enabled,
          hasExisting: existingDates.has(dateStr),
          isHoliday,
          holidayName,
        };
      });
      
      setDayEntries(entries);
    }
  }, [step, monthStart, monthEnd, defaultHours, existingDates, holidays, entryGenerationMode, previousMonthSummary]);

  // Update hasExisting when existingDates changes
  useEffect(() => {
    if (dayEntries.length > 0 && existingData) {
      setDayEntries(prev => prev.map(entry => ({
        ...entry,
        hasExisting: existingDates.has(entry.date),
      })));
    }
  }, [existingDates]);

  useEffect(() => {
    if (!open) return;
    setEntryGenerationMode(initialGenerationMode);
  }, [initialGenerationMode, open]);

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
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries/suggestions"] });
      
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

  const suggestionFeedbackMutation = useMutation({
    mutationFn: async (data: {
      suggestionType: "bulk_copy_prev_month";
      outcome: "accepted" | "rejected";
      suggestedValue?: string | null;
      chosenValue?: string | null;
      date?: string | null;
      metadata?: Record<string, unknown>;
    }) => {
      return apiRequest("POST", "/api/time-entries/suggestions/feedback", data);
    },
  });

  const resetModal = () => {
    setStep(1);
    setDayEntries([]);
    setOverwriteExisting(false);
    setSelectedProject(NO_PROJECT_VALUE);
    setDescription("Arbeid");
    setDefaultHours("7.5");
    setEntryGenerationMode(initialGenerationMode);
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

  const handleCopyPreviousMonth = () => {
    if (isPreviousMonthLoading) {
      return;
    }

    if (previousMonthSummary.mappedTemplateDays === 0) {
      toast({
        title: "Ingen føringer å kopiere",
        description: "Fant ingen hverdagsføringer i forrige måned.",
        variant: "destructive",
      });
      return;
    }

    if (previousMonthSummary.preferredDescription) {
      setDescription(previousMonthSummary.preferredDescription);
    }

    setSelectedProject(previousMonthSummary.preferredProject);
    setEntryGenerationMode("copy_previous_month");
    suggestionFeedbackMutation.mutate({
      suggestionType: "bulk_copy_prev_month",
      outcome: "accepted",
      suggestedValue: "copy_previous_month",
      chosenValue: "copy_previous_month",
      date: format(selectedMonth, "yyyy-MM-dd"),
      metadata: {
        previousMonthEntries: previousMonthSummary.totalEntries,
        mappedTemplateDays: previousMonthSummary.mappedTemplateDays,
      },
    });
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
      isNaN(e.hours) || e.hours < 0 || e.hours > 24
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
      caseNumber: selectedProject === NO_PROJECT_VALUE ? null : selectedProject,
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

  // Find holidays falling on weekends this month (for info display)
  const weekendHolidays = useMemo(() => {
    const result: { date: string; name: string; displayDate: string }[] = [];
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    
    for (const day of days) {
      if (isWeekend(day)) {
        const dateStr = format(day, "yyyy-MM-dd");
        const holidayName = holidays.get(dateStr);
        if (holidayName) {
          result.push({
            date: dateStr,
            name: holidayName,
            displayDate: format(day, "d. MMM", { locale: nb }),
          });
        }
      }
    }
    return result;
  }, [monthStart, monthEnd, holidays]);

  const weekdayHolidayCount = dayEntries.filter(e => e.isHoliday).length;

  // Group entries by week for calendar display
  const weekGroups = useMemo(() => {
    const weeks: DayEntry[][] = [];
    let currentWeek: DayEntry[] = [];
    
    dayEntries.forEach((entry, _index) => {
      const parsedEntryDate = parseLocalDate(entry.date);
      if (!parsedEntryDate) {
        return;
      }
      const dayOfWeek = getDay(parsedEntryDate);
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
              <Label>Type arbeid (valgfritt)</Label>
              <Select value={selectedProject} onValueChange={setSelectedProject}>
                <SelectTrigger data-testid="select-bulk-project">
                  <SelectValue placeholder="Velg type arbeid" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PROJECT_VALUE}>Ingen</SelectItem>
                  {workTypeOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-md border p-3 bg-muted/20 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm">
                  <p className="font-medium">Kopier forrige måned</p>
                  <p className="text-xs text-muted-foreground">
                    Bruker føringer fra {format(previousMonth, "MMMM yyyy", { locale: nb })} og tilpasser til samme ukedager i valgt måned.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleCopyPreviousMonth}
                  disabled={isPreviousMonthLoading || previousMonthSummary.mappedTemplateDays === 0}
                  data-testid="button-copy-previous-month"
                >
                  <Copy className="h-4 w-4 mr-2" />
                  {isPreviousMonthLoading ? "Laster..." : "Kopier"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {previousMonthSummary.totalEntries > 0
                  ? `${previousMonthSummary.totalEntries} føringer funnet (${previousMonthSummary.mappedTemplateDays} hverdagsmønstre kan kopieres).`
                  : "Ingen føringer funnet i forrige måned."}
              </p>
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

            {/* Holiday info */}
            {(weekdayHolidayCount > 0 || weekendHolidays.length > 0) && (
              <div className="p-3 bg-accent/10 rounded-md border border-accent/20 text-sm">
                <p className="font-medium mb-1">Helligdager denne måneden</p>
                {weekdayHolidayCount > 0 && (
                  <p className="text-muted-foreground text-xs">
                    {weekdayHolidayCount} helligdag(er) på hverdager er markert i kalenderen (deaktivert som standard)
                  </p>
                )}
                {weekendHolidays.length > 0 && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    <span>Helligdager på helg: </span>
                    {weekendHolidays.map((h, i) => (
                      <span key={h.date}>
                        {h.name} ({h.displayDate})
                        {i < weekendHolidays.length - 1 ? ", " : ""}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

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
                  {week.map((entry, _dayIndex) => {
                    const entryIndex = dayEntries.findIndex(e => e.date === entry.date);
                    const parsedEntryDate = parseLocalDate(entry.date);
                    const dayNum = parsedEntryDate ? parsedEntryDate.getDate() : Number(entry.date.split("-")[2] || "0");
                    
                    const isInvalidHours = entry.enabled && (isNaN(entry.hours) || entry.hours < 0 || entry.hours > 24);
                    
                    return (
                      <div
                        key={entry.date}
                        className={cn(
                          "p-2 rounded-md border text-center transition-colors",
                          entry.enabled 
                            ? "bg-primary/10 border-primary/30" 
                            : "bg-muted/30 border-muted",
                          entry.isHoliday && "bg-accent/20 border-accent/40",
                          entry.hasExisting && entry.enabled && "ring-2 ring-warning/50",
                          isInvalidHours && "ring-2 ring-destructive/50 bg-destructive/10"
                        )}
                        data-testid={`day-cell-${entry.date}`}
                        title={entry.holidayName || undefined}
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
                            !entry.enabled && "text-muted-foreground",
                            entry.isHoliday && "text-accent-foreground"
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
                        {entry.isHoliday && (
                          <span className="text-[10px] text-accent-foreground mt-0.5 block truncate" title={entry.holidayName}>
                            {entry.holidayName}
                          </span>
                        )}
                        {entry.hasExisting && !entry.isHoliday && (
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
