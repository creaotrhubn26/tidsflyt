import { useEffect, useMemo, useState } from "react";
import { Plus, Clock, Send, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

  /* ── Collapsed pill ── */
  if (!expanded) {
    return (
      <div className="space-y-2">
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
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  className="h-7 px-2.5 text-xs"
                  onClick={applySuggestion}
                  data-testid="dashboard-quick-log-apply-suggestion"
                >
                  Bruk
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                  onClick={dismissSuggestion}
                  data-testid="dashboard-quick-log-dismiss-suggestion"
                >
                  Ikke nå
                </Button>
                {onApplyWeekSuggestion && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2.5 text-xs"
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
                    className="h-7 px-2.5 text-xs"
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

        <button
          type="button"
          onClick={() => setExpanded(true)}
          className={cn(
            "w-full flex items-center gap-3 rounded-xl border border-dashed border-border",
            "bg-muted/20 px-4 py-2.5 text-sm text-muted-foreground",
            "hover:bg-muted/40 hover:text-foreground hover:border-primary/30 transition-all group",
          )}
        >
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 group-hover:bg-primary/20 transition-colors flex-shrink-0">
            <Plus className="h-3.5 w-3.5 text-primary" />
          </div>
          <Clock className="h-3.5 w-3.5 flex-shrink-0" />
          <span>Logg tid raskt…</span>
          <span className="ml-auto text-[10px] text-muted-foreground/50 hidden sm:inline capitalize">
            {todayLabel}
          </span>
        </button>
      </div>
    );
  }

  /* ── Expanded inline form ── */
  return (
    <div className="rounded-xl border border-primary/20 bg-card px-4 py-3.5 shadow-sm animate-in fade-in slide-in-from-top-1 duration-150">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3 capitalize">
        Logg tid · {todayLabel}
      </p>
      {justSaved ? (
        <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400 py-1">
          <CheckCircle2 className="h-4 w-4" />
          Tid logget!
        </div>
      ) : (
        <div className="flex flex-wrap sm:flex-nowrap gap-2 items-center">
          <Input
            placeholder="Hva jobbet du med?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="flex-1 min-w-40 h-8 text-sm"
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            data-testid="dashboard-quick-log-description"
            autoFocus
          />
          <div className="relative w-24 flex-shrink-0">
            <Input
              placeholder="Timer"
              value={hours}
              type="number"
              min="0.25"
              step="0.25"
              max="24"
              onChange={(e) => setHours(e.target.value)}
              className="h-8 text-sm pr-7"
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              data-testid="dashboard-quick-log-hours"
            />
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
              t
            </span>
          </div>
          <Button
            size="sm"
            className="h-8 gap-1.5 px-3 flex-shrink-0"
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
            className="h-8 px-2 flex-shrink-0 text-muted-foreground hover:text-foreground"
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
      )}
      {logMutation.isError && (
        <p className="mt-2 text-xs text-destructive">
          Noe gikk galt. Prøv igjen.
        </p>
      )}
    </div>
  );
}
