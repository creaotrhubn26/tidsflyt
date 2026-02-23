import { useEffect, useMemo, useState } from "react";
import { Plus, Clock, Send, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { cn } from "@/lib/utils";

async function postTimeEntry(data: {
  description: string;
  hours: number;
  date: string;
  caseNumber?: string | null;
}) {
  const res = await fetch("/api/time-entries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ ...data, status: "pending" }),
  });
  if (!res.ok) throw new Error("Failed to log time");
  return res.json();
}

interface DashboardQuickLogProps {
  suggestedProjectId?: string | null;
  suggestedProjectLabel?: string | null;
  suggestedDescription?: string | null;
  suggestedHours?: number | null;
  suggestionReason?: string | null;
  suggestionConfidence?: number | null;
  onApplySuggestion?: () => void;
  onDismissSuggestion?: () => void;
  onApplyWeekSuggestion?: () => void;
  onOpenBulkCopy?: () => void;
}

export function DashboardQuickLog({
  suggestedProjectId = null,
  suggestedProjectLabel = null,
  suggestedDescription = null,
  suggestedHours = null,
  suggestionReason = null,
  suggestionConfidence = null,
  onApplySuggestion,
  onDismissSuggestion,
  onApplyWeekSuggestion,
  onOpenBulkCopy,
}: DashboardQuickLogProps) {
  const [expanded, setExpanded] = useState(false);
  const [description, setDescription] = useState("");
  const [hours, setHours] = useState("");
  const [justSaved, setJustSaved] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [showSuggestionHint, setShowSuggestionHint] = useState(true);
  const queryClient = useQueryClient();

  const hasSuggestion = useMemo(() => {
    const hasDescription = !!suggestedDescription?.trim();
    const hasHours = suggestedHours != null && suggestedHours > 0;
    const hasProject = !!suggestedProjectId;
    return hasDescription || hasHours || hasProject;
  }, [suggestedDescription, suggestedHours, suggestedProjectId]);

  useEffect(() => {
    setShowSuggestionHint(true);
  }, [suggestedDescription, suggestedHours, suggestedProjectId]);

  const logMutation = useMutation({
    mutationFn: postTimeEntry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/chart-data"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      setDescription("");
      setHours("");
      setSelectedProjectId(null);
      setJustSaved(true);
      setTimeout(() => {
        setJustSaved(false);
        setExpanded(false);
      }, 1600);
    },
  });

  const canSubmit =
    description.trim().length > 0 &&
    parseFloat(hours) > 0 &&
    !logMutation.isPending;

  const todayLabel = format(new Date(), "EEEE d. MMMM", { locale: nb });

  const handleSubmit = () => {
    if (!canSubmit) return;
    logMutation.mutate({
      description: description.trim(),
      hours: parseFloat(hours),
      date: format(new Date(), "yyyy-MM-dd"),
      caseNumber: selectedProjectId,
    });
  };

  const applySuggestion = () => {
    if (suggestedDescription?.trim()) {
      setDescription(suggestedDescription.trim());
    }
    if (suggestedHours != null && suggestedHours > 0) {
      setHours(String(suggestedHours));
    }
    setSelectedProjectId(suggestedProjectId || null);
    setShowSuggestionHint(false);
    setExpanded(true);
    onApplySuggestion?.();
  };

  const dismissSuggestion = () => {
    setShowSuggestionHint(false);
    onDismissSuggestion?.();
  };

  return (
    <Card className="overflow-hidden rounded-2xl border-border bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b border-border bg-muted px-4 py-2 text-muted-foreground">
        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary/15 text-primary">+</span>
        <p className="text-[15px] font-medium">
          {expanded ? "Hurtigregistrering aktiv" : "Logg tid raskt"}
        </p>
        <span className="ml-auto hidden text-[11px] capitalize sm:inline">{todayLabel}</span>
      </div>
      <CardContent className="p-4 space-y-3">
        {hasSuggestion && showSuggestionHint && (
          <div
            className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3"
            data-testid="dashboard-quick-log-suggestion"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/90">
                  Smart forslag
                </p>
                <p className="mt-1 text-sm font-medium text-foreground">
                  {suggestedDescription?.trim() || "Bruk forslag fra forrige føring"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {suggestedHours != null ? `${suggestedHours}t` : "Timer ikke foreslått ennå"}
                  {suggestedProjectLabel ? ` • ${suggestedProjectLabel}` : ""}
                </p>
                {(suggestionReason || suggestionConfidence != null) && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {suggestionReason || "Basert på tidligere føringer"}
                    {suggestionConfidence != null ? ` · ${Math.round(suggestionConfidence * 100)}%` : ""}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  size="sm"
                  className="h-8 rounded-lg px-3 text-xs"
                  onClick={applySuggestion}
                  data-testid="dashboard-quick-log-apply-suggestion"
                >
                  Bruk
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 rounded-lg px-2.5 text-xs text-muted-foreground hover:text-foreground"
                  onClick={dismissSuggestion}
                  data-testid="dashboard-quick-log-dismiss-suggestion"
                >
                  Ikke nå
                </Button>
                {onApplyWeekSuggestion && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-lg px-3 text-xs"
                    onClick={onApplyWeekSuggestion}
                    data-testid="dashboard-quick-log-apply-week-suggestion"
                  >
                    Hele uka
                  </Button>
                )}
                {onOpenBulkCopy && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-lg px-3 text-xs"
                    onClick={onOpenBulkCopy}
                    data-testid="dashboard-quick-log-open-bulk-copy"
                  >
                    Kopier måned
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {!expanded ? (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className={cn(
              "w-full flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3",
              "text-sm text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground",
            )}
          >
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-muted">
              <Plus className="h-4 w-4 text-primary" />
            </span>
            <Clock className="h-4 w-4 flex-shrink-0" />
            <span className="font-medium">Åpne hurtigføring</span>
          </button>
        ) : justSaved ? (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            Tid logget!
          </div>
        ) : (
          <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-150">
            <Input
              placeholder="Hva jobbet du med?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="h-10 text-sm"
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              data-testid="dashboard-quick-log-description"
              autoFocus
            />
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative w-28 flex-shrink-0">
                <Input
                  placeholder="Timer"
                  value={hours}
                  type="number"
                  min="0.25"
                  step="0.25"
                  max="24"
                  onChange={(e) => setHours(e.target.value)}
                  className="h-10 text-sm pr-7"
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                  data-testid="dashboard-quick-log-hours"
                />
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
                  t
                </span>
              </div>
              <Button
                size="sm"
                className="h-10 gap-1.5 rounded-xl px-4"
                onClick={handleSubmit}
                disabled={!canSubmit}
              >
                {logMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                Logg
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-10 rounded-xl px-3 text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setExpanded(false);
                  setDescription("");
                  setHours("");
                  setSelectedProjectId(null);
                }}
              >
                Avbryt
              </Button>
            </div>
          </div>
        )}

        {logMutation.isError && (
          <p className="text-xs text-destructive">
            Noe gikk galt. Prøv igjen.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
