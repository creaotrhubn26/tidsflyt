import { useState, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ShieldAlert, ArrowRight, Check, Wand2, ChevronRight, AlertTriangle } from "lucide-react";
import {
  getPiiTypeLabel,
  getPiiSeverity,
  getConfidenceLabel,
  type PiiWarning,
  type PiiScanResult,
} from "@/lib/pii-detector";

// ─── Field label map (Norwegian) ──────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  background: "Bakgrunn",
  actions: "Arbeid og tiltak",
  progress: "Fremgang",
  challenges: "Utfordringer",
  factors: "Faktorer",
  assessment: "Vurdering",
  recommendations: "Anbefalinger",
  notes: "Notater",
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PiiIssue {
  field: string;
  fieldLabel: string;
  warning: PiiWarning;
}

interface PiiSummaryDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fieldResults: Record<string, PiiScanResult>;
  /** Called when user clicks "Replace" on a single issue */
  onReplace: (field: string, match: string, replacement: string) => void;
  /** Called when user clicks "Replace All" */
  onReplaceAll: (replacements: PiiIssue[]) => void;
}

// ─── Compact trigger banner ───────────────────────────────────────────────────

interface PiiSummaryBannerProps {
  totalWarnings: number;
  highCount: number;
  onClick: () => void;
  isPending?: boolean;
}

/**
 * Compact banner that replaces the large inline PII list.
 * Shows: "3 potential PII issues found → Review"
 */
export function PiiSummaryBanner({
  totalWarnings,
  highCount,
  onClick,
  isPending,
}: PiiSummaryBannerProps) {
  if (totalWarnings === 0 && !isPending) return null;

  if (isPending) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
        <ShieldAlert className="h-4 w-4 animate-pulse" />
        <span>Skanner for personopplysninger…</span>
      </div>
    );
  }

  const isCritical = highCount > 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm transition-colors hover:bg-accent/50 ${
        isCritical
          ? "border-destructive/40 bg-destructive/5 text-destructive"
          : "border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300"
      }`}
    >
      <span className="flex items-center gap-2 font-medium">
        <ShieldAlert className="h-4 w-4" />
        {totalWarnings} {totalWarnings === 1 ? "mulig personopplysning" : "mulige personopplysninger"} funnet
        {highCount > 0 && (
          <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
            {highCount} kritisk
          </Badge>
        )}
      </span>
      <span className="flex items-center gap-1 text-xs opacity-80">
        Gjennomgå <ChevronRight className="h-3.5 w-3.5" />
      </span>
    </button>
  );
}

// ─── Main drawer ──────────────────────────────────────────────────────────────

export function PiiSummaryDrawer({
  open,
  onOpenChange,
  fieldResults,
  onReplace,
  onReplaceAll,
}: PiiSummaryDrawerProps) {
  const [replacedIssues, setReplacedIssues] = useState<Set<string>>(new Set());

  // Flatten all warnings into a sorted list
  const issues: PiiIssue[] = Object.entries(fieldResults)
    .flatMap(([field, result]) =>
      result.warnings.map((w) => ({
        field,
        fieldLabel: FIELD_LABELS[field] || field,
        warning: w,
      })),
    )
    .sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      return order[a.warning.confidence] - order[b.warning.confidence];
    });

  const pendingIssues = issues.filter(
    (issue) => !replacedIssues.has(issueKey(issue)),
  );

  const handleReplace = (issue: PiiIssue) => {
    onReplace(issue.field, issue.warning.match, issue.warning.suggestion);
    setReplacedIssues((prev) => new Set(prev).add(issueKey(issue)));
  };

  const handleReplaceAll = () => {
    onReplaceAll(pendingIssues);
    setReplacedIssues(
      new Set(issues.map((i) => issueKey(i))),
    );
  };

  // Reset replaced state when results change
  const issuesFingerprint = issues.map(issueKey).join("|");
  // Reset replaced issues whenever the underlying scan results change (new fields scanned etc.)
  useEffect(() => {
    setReplacedIssues(new Set());
  }, [issuesFingerprint]);
  // We need to reset when the drawer opens with new data
  // Using a simple approach: reset on open
  const handleOpenChange = (v: boolean) => {
    if (v) setReplacedIssues(new Set());
    onOpenChange(v);
  };

  if (issues.length === 0) return null;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-600" />
            Personvern — gjennomgang
          </SheetTitle>
          <SheetDescription>
            {pendingIssues.length} av {issues.length}{" "}
            {issues.length === 1 ? "funn" : "funn"} gjenstår.
            Erstatt enkeltvis eller alle på én gang.
          </SheetDescription>
        </SheetHeader>

        {/* Replace All button */}
        {pendingIssues.length > 1 && (
          <div className="pt-2 pb-1">
            <Button
              type="button"
              variant="default"
              size="sm"
              className="w-full gap-2"
              onClick={handleReplaceAll}
            >
              <Wand2 className="h-4 w-4" />
              Erstatt alle ({pendingIssues.length})
            </Button>
          </div>
        )}

        {/* Issue list */}
        <ScrollArea className="flex-1 -mx-6 px-6 mt-2">
          <div className="space-y-3 pb-6">
            {issues.map((issue) => {
              const key = issueKey(issue);
              const isReplaced = replacedIssues.has(key);
              const severity = getPiiSeverity(issue.warning.type);
              const isCritical = severity === "critical" || severity === "high";

              return (
                <div
                  key={key}
                  className={`rounded-lg border p-3 transition-all ${
                    isReplaced
                      ? "border-green-300 bg-green-50 dark:bg-green-950/20 opacity-60"
                      : isCritical
                        ? "border-destructive/30 bg-destructive/5"
                        : "border-amber-300/50 bg-amber-50/50 dark:bg-amber-950/10"
                  }`}
                >
                  {/* Header: field + confidence */}
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-muted-foreground">
                      {issue.fieldLabel}
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${
                        issue.warning.confidence === "high"
                          ? "border-red-300 text-red-700 dark:text-red-300"
                          : issue.warning.confidence === "medium"
                            ? "border-amber-300 text-amber-700 dark:text-amber-300"
                            : "border-muted text-muted-foreground"
                      }`}
                    >
                      {getConfidenceLabel(issue.warning.confidence)}
                    </Badge>
                  </div>

                  {/* Type + match */}
                  <div className="flex items-start gap-2 mb-2">
                    <AlertTriangle
                      className={`h-3.5 w-3.5 mt-0.5 flex-shrink-0 ${
                        isCritical ? "text-destructive" : "text-amber-500"
                      }`}
                    />
                    <div className="text-sm">
                      <span className="font-medium">
                        {getPiiTypeLabel(issue.warning.type)}:
                      </span>{" "}
                      <span className="font-mono text-xs bg-muted px-1 py-0.5 rounded">
                        {issue.warning.match}
                      </span>
                    </div>
                  </div>

                  {/* Replacement action */}
                  {isReplaced ? (
                    <div className="flex items-center gap-1.5 text-xs text-green-700 dark:text-green-400">
                      <Check className="h-3.5 w-3.5" />
                      Erstattet
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full gap-2 text-xs h-8"
                      onClick={() => handleReplace(issue)}
                    >
                      <span className="truncate font-mono">
                        {issue.warning.match}
                      </span>
                      <ArrowRight className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate text-green-700 dark:text-green-400 font-medium">
                        {issue.warning.suggestion}
                      </span>
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function issueKey(issue: PiiIssue): string {
  return `${issue.field}::${issue.warning.type}::${issue.warning.match}::${issue.warning.offset}`;
}
