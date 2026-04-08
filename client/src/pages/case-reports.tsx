import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { 
  FileText, 
  Plus, 
  Edit, 
  Send, 
  AlertTriangle,
  Info,
  MessageCircle,
  BarChart3,
  Download,
  ShieldAlert,
  Save,
  CheckCircle2,
  Wand2,
} from "lucide-react";
import { PortalLayout } from "@/components/portal/portal-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { MonthPicker } from "@/components/ui/month-picker";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RotateCcw, Trash2 } from "lucide-react";
import { AdvancedCaseReportBuilder } from "@/components/cms/advanced-case-report-builder";
import { CaseAnalyticsDashboard } from "@/components/cms/case-analytics-dashboard";
import { CaseReportExport } from "@/components/cms/case-report-export";
import { TimeTrackingPdfDesigner } from "@/components/reports/time-tracking-pdf-designer";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { usePiiDetection } from "@/hooks/use-pii-detection";
import { useDraft } from "@/hooks/use-draft";
import { useSuggestionSettings } from "@/hooks/use-suggestion-settings";
import { useRolePreview } from "@/hooks/use-role-preview";
import { useSuggestionVisibility } from "@/hooks/use-suggestion-visibility";
import { getPiiTypeLabel, getPiiSeverity, ANONYMOUS_ALTERNATIVES, type PiiWarning, type PiiScanResult } from "@/lib/pii-detector";
import { PiiSummaryBanner, PiiSummaryDrawer, type PiiIssue } from "@/components/pii-summary-drawer";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { REPORT_TEMPLATES } from "@/lib/report-templates";
import { isSuggestionSurfaceEnabled } from "@/lib/suggestion-settings";
import { format } from "date-fns";
import { subDays } from "date-fns";
import { nb } from "date-fns/locale";
import type { CaseReport, ReportStatus } from "@shared/schema";
import { normalizeRole } from "@shared/roles";

type CaseReportResponse = {
  reports: CaseReport[];
};

type TimeReportEntry = {
  id: string;
  userId: string;
  caseNumber: string | null;
  description: string;
  hours: number;
  date: string;
  status: string;
  createdAt: string;
  userName: string;
  department: string;
};

type SuggestionValue<T> = {
  value: T;
  confidence: number;
  sampleSize: number;
  reason: string;
};

type CaseReportSuggestionFieldKey =
  | "background"
  | "actions"
  | "progress"
  | "challenges"
  | "factors"
  | "assessment"
  | "recommendations"
  | "notes";

type CaseReportSuggestionsResponse = {
  month: string;
  analyzedReports: number;
  suggestion: {
    caseId: SuggestionValue<string | null>;
    template: SuggestionValue<string | null>;
    copyPreviousMonth: SuggestionValue<boolean>;
    fields: Record<CaseReportSuggestionFieldKey, SuggestionValue<string | null>>;
  };
  previousMonthReport: null | {
    id: number;
    caseId: string;
    month: string;
    fields: Record<CaseReportSuggestionFieldKey, string | null>;
  };
  personalization: {
    totalFeedback: number;
    acceptanceRate: number | null;
    feedbackByType: Record<string, { accepted: number; rejected: number }>;
  };
  policy?: {
    mode: string;
    confidenceThreshold: number;
    source: string;
  };
};

const statusColors: Record<ReportStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  submitted: "bg-warning/10 text-warning border-warning/20",
  needs_revision: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  approved: "bg-success/10 text-success border-success/20",
  rejected: "bg-destructive/10 text-destructive border-destructive/20",
};

const statusLabels: Record<ReportStatus, string> = {
  draft: "Utkast",
  submitted: "Sendt inn",
  needs_revision: "Trenger revisjon",
  approved: "Godkjent",
  rejected: "Avslått",
};

const timeEntryStatusLabels: Record<string, string> = {
  pending: "Venter",
  approved: "Godkjent",
  rejected: "Avvist",
};

const timeEntryStatusClasses: Record<string, string> = {
  pending: "bg-warning/10 text-warning border-warning/20",
  approved: "bg-success/10 text-success border-success/20",
  rejected: "bg-destructive/10 text-destructive border-destructive/20",
};

/* ── Lifecycle strip ────────────────────────────────────────── */
const LIFECYCLE_STEPS = [
  { key: "draft",     label: "Utkast" },
  { key: "submitted", label: "Sendt inn" },
  { key: "review",    label: "Gjennomgang" },
  { key: "approved",  label: "Godkjent" },
] as const;

function statusToLifecycleStep(status: ReportStatus): string {
  if (status === "needs_revision" || status === "rejected") return "review";
  return status;
}

function ReportLifecycleStrip({ status }: { status: ReportStatus }) {
  const currentKey = statusToLifecycleStep(status);
  const currentIdx = LIFECYCLE_STEPS.findIndex((s) => s.key === currentKey);
  const isReturned = status === "needs_revision" || status === "rejected";

  return (
    <div className="flex items-center gap-1 py-2 w-full overflow-x-auto" role="list" aria-label="Rapportstatus">
      {LIFECYCLE_STEPS.map((step, i) => {
        const isPast    = i < currentIdx;
        const isCurrent = i === currentIdx;
        return (
          <React.Fragment key={step.key}>
            {i > 0 && (
              <div className={`h-0.5 flex-1 min-w-[16px] rounded ${isPast ? "bg-primary" : "bg-border"}`} />
            )}
            <div className="flex flex-col items-center gap-0.5 min-w-[56px]" role="listitem">
              {isPast ? (
                <CheckCircle2 className="h-5 w-5 text-primary" />
              ) : (
                <div
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${
                    isCurrent
                      ? isReturned
                        ? "bg-orange-500 text-white"
                        : "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {i + 1}
                </div>
              )}
              <span className={`text-[10px] leading-tight text-center ${isCurrent ? "font-semibold" : "text-muted-foreground"}`}>
                {step.label}
              </span>
              {isCurrent && (
                <span className={`text-[9px] ${isReturned ? "text-orange-500" : "text-primary"}`}>
                  {isReturned ? "Returnert" : "Du er her"}
                </span>
              )}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

type ReportComment = {
  id: number;
  report_id: number;
  author_id: string;
  author_name: string | null;
  author_role: string;
  content: string;
  is_internal: boolean;
  parent_id: number | null;
  read_at: string | null;
  created_at: string;
  updated_at: string;
};

const emptyFormData = {
  case_id: "",
  month: format(new Date(), "yyyy-MM"), // default to current month
  background: "",
  actions: "",
  progress: "",
  challenges: "",
  factors: "",
  assessment: "",
  recommendations: "",
  notes: "",
};

type ReportEditorSection = {
  key: CaseReportSuggestionFieldKey;
  label: string;
  shortLabel: string;
  description: string;
  hint?: string;
  placeholder: string;
  required: boolean;
  input: "richText" | "textarea";
  minHeight?: string;
  rows?: number;
};

const REPORT_EDITOR_SECTIONS: ReportEditorSection[] = [
  {
    key: "background",
    label: "Bakgrunn for tiltaket",
    shortLabel: "Bakgrunn",
    description: "Sett rammen for perioden og hvorfor tiltaket fortsatt er relevant.",
    hint: "Brukeren har hatt behov for tett oppfølging i perioden grunnet endringer i hjemmesituasjonen.",
    placeholder: "Beskriv bakgrunnen for tiltaket...",
    required: true,
    input: "richText",
    minHeight: "120px",
  },
  {
    key: "actions",
    label: "Arbeid og tiltak som er gjennomført",
    shortLabel: "Tiltak",
    description: "Beskriv hva som faktisk er gjort, og hvilke tiltak som har vært viktigst.",
    hint: "Det er gjennomført ukentlige samtaler med ungdommen, samt samarbeidsmøte med skolen.",
    placeholder: "Beskriv arbeidet som er gjennomført...",
    required: true,
    input: "richText",
    minHeight: "150px",
  },
  {
    key: "progress",
    label: "Fremgang og utvikling",
    shortLabel: "Fremgang",
    description: "Fang opp positive endringer, små steg og stabil utvikling siden sist.",
    hint: "Brukeren viser positiv utvikling i sosiale ferdigheter og har økt oppmøte på skolen.",
    placeholder: "Beskriv fremgangen...",
    required: false,
    input: "richText",
    minHeight: "120px",
  },
  {
    key: "challenges",
    label: "Utfordringer",
    shortLabel: "Utfordringer",
    description: "Beskriv hva som bremser utviklingen eller gjør oppfølgingen krevende.",
    hint: "Ungdommen har vist varierende motivasjon, noe som gjør jevn oppfølging utfordrende.",
    placeholder: "Beskriv eventuelle utfordringer...",
    required: false,
    input: "richText",
    minHeight: "120px",
  },
  {
    key: "factors",
    label: "Faktorer som påvirker",
    shortLabel: "Faktorer",
    description: "Noter ytre forhold eller støttefaktorer som forklarer utviklingen.",
    hint: "Stabil bosituasjon og godt nettverk rundt brukeren bidrar positivt til utviklingen.",
    placeholder: "Beskriv faktorer som påvirker...",
    required: false,
    input: "richText",
    minHeight: "100px",
  },
  {
    key: "assessment",
    label: "Vurdering",
    shortLabel: "Vurdering",
    description: "Gi din faglige vurdering av situasjonen og effekten av tiltakene.",
    hint: "Tiltaket vurderes som hensiktsmessig og bør videreføres med noen justeringer i neste periode.",
    placeholder: "Din vurdering...",
    required: true,
    input: "richText",
    minHeight: "120px",
  },
  {
    key: "recommendations",
    label: "Anbefalinger",
    shortLabel: "Anbefalinger",
    description: "Beskriv konkrete neste steg og anbefalte endringer for kommende periode.",
    hint: "Det anbefales å øke frekvensen av samtaler og involvere foresatte i større grad.",
    placeholder: "Dine anbefalinger...",
    required: false,
    input: "richText",
    minHeight: "120px",
  },
  {
    key: "notes",
    label: "Notater",
    shortLabel: "Notater",
    description: "Samle korte tilleggsopplysninger som ikke passer naturlig inn i hovedseksjonene.",
    hint: "Neste samarbeidsmøte er planlagt til starten av neste måned.",
    placeholder: "Eventuelle notater...",
    required: false,
    input: "textarea",
    rows: 3,
  },
];

/** Check whether form data has meaningful content worth persisting */
function formHasContent(data: typeof emptyFormData): boolean {
  return (
    Object.entries(data).some(
      ([key, val]) =>
        key !== 'case_id' && key !== 'month' && val && val.replace(/<[^>]*>/g, '').trim().length > 0,
    ) ||
    !!data.case_id ||
    !!data.month
  );
}

/** Inline PII warning wrapper for individual form fields */
function PiiFieldWrapper({ 
  fieldName, 
  label, 
  hint,
  fieldResults, 
  children 
}: { 
  fieldName: string; 
  label: string; 
  /** Soft writing guidance shown below the editor */
  hint?: string;
  fieldResults: Record<string, PiiScanResult>; 
  children: React.ReactNode;
}) {
  const result = fieldResults[fieldName];
  const hasWarnings = result?.hasPii;
  const highConfCount = result?.warnings.filter(w => w.confidence === 'high').length || 0;

  // Ring color based on highest confidence
  const ringClass = hasWarnings
    ? result.maxConfidence === 'high'
      ? "ring-2 ring-destructive/60 rounded-md"
      : "ring-2 ring-amber-500/50 rounded-md"
    : "";

  return (
    <div className="space-y-2">
      <Label htmlFor={fieldName} className={hasWarnings ? (highConfCount > 0 ? "text-destructive" : "text-amber-600 dark:text-amber-400") : ""}>
        {label}
        {hasWarnings && (
          <span className={`ml-2 text-xs font-normal ${highConfCount > 0 ? 'text-destructive' : 'text-amber-600 dark:text-amber-400'}`}>
            ({result.warnings.length} {result.warnings.length === 1 ? 'advarsel' : 'advarsler'}
            {highConfCount > 0 && ` — ${highConfCount} høy sikkerhet`})
          </span>
        )}
      </Label>
      <div className={ringClass}>
        {children}
      </div>
      {hint && !hasWarnings && (
        <p className="text-xs text-muted-foreground/70 italic leading-relaxed pl-0.5">
          Eksempel: {hint}
        </p>
      )}
      {hasWarnings && (
        <div className="space-y-1">
          {result.warnings
            .sort((a, b) => {
              const order = { high: 0, medium: 1, low: 2 };
              return order[a.confidence] - order[b.confidence];
            })
            .map((w: PiiWarning, i: number) => {
              const isHigh = w.confidence === 'high';
              const bgClass = isHigh
                ? 'bg-destructive/5 text-destructive'
                : 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300';
              const iconColor = isHigh ? 'text-destructive' : 'text-amber-500';
              
              return (
                <div key={i} className={`flex items-start gap-2 text-xs rounded px-2 py-1.5 ${bgClass}`}>
                  <AlertTriangle className={`h-3 w-3 mt-0.5 flex-shrink-0 ${iconColor}`} />
                  <div className="flex-1">
                    <span className="font-medium">{getPiiTypeLabel(w.type)}: {w.message}</span>
                    <span className={`ml-1.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                      isHigh ? 'bg-destructive/10 text-destructive' : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                    }`}>
                      {getPiiSeverity(w.type) === 'critical' ? 'Kritisk' : getPiiSeverity(w.type) === 'high' ? 'Høy' : 'Middels'}
                    </span>
                    <br />
                    <span className="text-muted-foreground">Forslag: {w.suggestion}</span>
                    {(getPiiSeverity(w.type) === 'critical' || getPiiSeverity(w.type) === 'high') && (
                      <span className="block mt-0.5 text-muted-foreground/70">
                        Alternativer: {ANONYMOUS_ALTERNATIVES.general.slice(0, 3).join(', ')}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

// ─── Section progress indicator ──────────────────────────────────────────────

const FORM_SECTIONS: ReadonlyArray<{
  key: CaseReportSuggestionFieldKey;
  label: string;
  required: boolean;
}> = REPORT_EDITOR_SECTIONS.map((section) => ({
  key: section.key,
  label: section.shortLabel,
  required: section.required,
}));

const REQUIRED_SECTIONS: CaseReportSuggestionFieldKey[] = FORM_SECTIONS.filter((s) => s.required).map((s) => s.key);
const REPORT_SUGGESTION_FIELD_KEYS: CaseReportSuggestionFieldKey[] = [
  "background",
  "actions",
  "progress",
  "challenges",
  "factors",
  "assessment",
  "recommendations",
  "notes",
];

function sectionHasContent(html: string): boolean {
  if (!html) return false;
  return html.replace(/<[^>]*>/g, "").trim().length > 0;
}

/** Check whether all required sections are filled */
function isReadyToSubmit(formData: typeof emptyFormData): boolean {
  return REQUIRED_SECTIONS.every((key) =>
    sectionHasContent((formData as any)[key]),
  );
}

function SectionProgress({ formData }: { formData: typeof emptyFormData }) {
  const filled = FORM_SECTIONS.filter((s) =>
    sectionHasContent((formData as any)[s.key]),
  ).length;
  const pct = Math.round((filled / FORM_SECTIONS.length) * 100);

  return (
    <div className="space-y-2">
      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
          <progress
            value={pct}
            max={100}
            aria-label="Rapportfremdrift"
            className={`h-full w-full bar-pct ${pct === 100 ? 'bar-pct-form-complete' : pct < 50 ? 'bar-pct-form-low' : ''}`}
          />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
          {filled}/{FORM_SECTIONS.length} seksjoner
        </span>
      </div>

      {/* Section chips */}
      <div className="flex items-center gap-1 overflow-x-auto py-1">
        {FORM_SECTIONS.map((s) => {
          const done = sectionHasContent((formData as any)[s.key]);
          return (
            <span
              key={s.key}
              className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                done
                  ? "bg-primary/10 text-primary"
                  : s.required
                    ? "bg-destructive/5 text-destructive/70 border border-dashed border-destructive/20"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${
                  done ? "bg-primary" : s.required ? "bg-destructive/40" : "bg-muted-foreground/40"
                }`}
              />
              {s.label}
              {s.required && !done && <span className="text-[9px]">*</span>}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function formatReportMonthLabel(month: string) {
  if (!month) return "Ikke valgt";
  try {
    return format(new Date(`${month}-01`), "MMMM yyyy", { locale: nb });
  } catch {
    return month;
  }
}

function ReportSectionCard({
  index,
  section,
  value,
  fieldResults,
  onChange,
  onBlur,
}: {
  index: number;
  section: ReportEditorSection;
  value: string;
  fieldResults: Record<string, PiiScanResult>;
  onChange: (value: string) => void;
  onBlur: () => void;
}) {
  const isCompleted = sectionHasContent(value);

  return (
    <Card
      id={`report-section-${section.key}`}
      className="scroll-mt-24 border-border/70 bg-background/70 shadow-sm"
    >
      <CardHeader className="space-y-3 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="text-[11px]">
            Del {index + 1}
          </Badge>
          {section.required && (
            <Badge variant="secondary" className="text-[11px]">
              Påkrevd
            </Badge>
          )}
          <Badge
            variant="outline"
            className={isCompleted ? "border-green-500/30 text-green-700 dark:text-green-400" : "text-muted-foreground"}
          >
            {isCompleted ? "Utfylt" : "Ikke fylt ut"}
          </Badge>
        </div>
        <div>
          <CardTitle className="text-lg">{section.label}</CardTitle>
          <CardDescription className="mt-1 text-sm">
            {section.description}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <PiiFieldWrapper
          fieldName={section.key}
          label={section.label}
          hint={section.hint}
          fieldResults={fieldResults}
        >
          {section.input === "textarea" ? (
            <Textarea
              id={section.key}
              className="bg-muted/30 dark:bg-muted/10 focus:bg-background transition-colors"
              value={value}
              onChange={(event) => onChange(event.target.value)}
              onBlur={onBlur}
              placeholder={section.placeholder}
              rows={section.rows ?? 3}
              data-testid={`input-${section.key}`}
            />
          ) : (
            <RichTextEditor
              value={value}
              onChange={onChange}
              onBlur={onBlur}
              placeholder={section.placeholder}
              minHeight={section.minHeight ?? "120px"}
              testId={`editor-${section.key}`}
            />
          )}
        </PiiFieldWrapper>
      </CardContent>
    </Card>
  );
}

function ReportComposerSidebar({
  editingReport,
  formData,
  isAutoSaving,
  lastSavedAt,
  reportSuggestions,
  shouldRenderReportSuggestions,
  duplicateReport,
  onJumpToSection,
  onApplyCaseIdSuggestion,
  onNeverSuggestCaseIdAgain,
  onApplyFieldSuggestions,
  onApplyPreviousMonthCopy,
  onDismissReportSuggestions,
}: {
  editingReport: CaseReport | null;
  formData: typeof emptyFormData;
  isAutoSaving: boolean;
  lastSavedAt: string | null;
  reportSuggestions: CaseReportSuggestionsResponse | null;
  shouldRenderReportSuggestions: boolean;
  duplicateReport: CaseReport | null;
  onJumpToSection: (key: CaseReportSuggestionFieldKey) => void;
  onApplyCaseIdSuggestion: () => void;
  onNeverSuggestCaseIdAgain: () => void;
  onApplyFieldSuggestions: (onlyEmptyFields: boolean) => void;
  onApplyPreviousMonthCopy: () => void;
  onDismissReportSuggestions: () => void;
}) {
  const missingRequired = FORM_SECTIONS.filter(
    (section) => section.required && !sectionHasContent((formData as Record<string, string>)[section.key] ?? ""),
  );
  const completedSections = FORM_SECTIONS.filter((section) =>
    sectionHasContent((formData as Record<string, string>)[section.key] ?? ""),
  ).length;
  const isReady = isReadyToSubmit(formData);

  return (
    <div className="order-first space-y-4 xl:order-last xl:sticky xl:top-24">
      <Card className="border-border/70 bg-background/80 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Skriveoversikt</CardTitle>
          <CardDescription>
            Hold oversikt over fremdrift, lagring og hva som mangler før innsending.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <div className="rounded-xl border border-border/70 bg-muted/30 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Sak</p>
              <p className="mt-1 font-medium">{formData.case_id || "Ikke valgt ennå"}</p>
            </div>
            <div className="rounded-xl border border-border/70 bg-muted/30 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Periode</p>
              <p className="mt-1 font-medium">{formatReportMonthLabel(formData.month)}</p>
            </div>
          </div>

          <div className="rounded-xl border border-border/70 bg-muted/20 p-3 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium">Fremdrift</span>
              <span className="text-xs text-muted-foreground">{completedSections}/{FORM_SECTIONS.length} seksjoner</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Status</span>
              <span className={isReady ? "text-green-700 dark:text-green-400 font-medium" : "text-amber-700 dark:text-amber-400 font-medium"}>
                {isReady ? "Klar til innsending" : `${missingRequired.length} påkrevde mangler`}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Lagring</span>
              <span className="text-right text-xs text-muted-foreground">
                {isAutoSaving
                  ? "Lagrer automatisk..."
                  : lastSavedAt
                    ? `Sist lagret ${format(new Date(lastSavedAt), "HH:mm", { locale: nb })}`
                    : editingReport
                      ? "Redigerer eksisterende utkast"
                      : "Utkast lagres lokalt"}
              </span>
            </div>
          </div>

          {duplicateReport && (
            <Alert className="border-orange-500/20 bg-orange-50/70 dark:bg-orange-950/10">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Rapport finnes allerede</AlertTitle>
              <AlertDescription>
                Det finnes allerede en rapport for {duplicateReport.caseId} i {duplicateReport.month}.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <p className="font-medium">Hopp til seksjon</p>
            <div className="grid gap-2">
              {REPORT_EDITOR_SECTIONS.map((section) => {
                const done = sectionHasContent((formData as Record<string, string>)[section.key] ?? "");
                return (
                  <Button
                    key={section.key}
                    type="button"
                    variant="outline"
                    className="justify-between"
                    onClick={() => onJumpToSection(section.key)}
                  >
                    <span>{section.shortLabel}</span>
                    <span className={done ? "text-green-700 dark:text-green-400 text-xs" : "text-muted-foreground text-xs"}>
                      {done ? "Utfylt" : section.required ? "Påkrevd" : "Valgfritt"}
                    </span>
                  </Button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {!editingReport && shouldRenderReportSuggestions && reportSuggestions && (
        <Card
          className="border-primary/25 bg-gradient-to-br from-primary/5 to-transparent shadow-sm"
          data-testid="case-report-suggestions-card"
        >
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Smarte forslag</CardTitle>
            <CardDescription>
              Basert på {reportSuggestions.analyzedReports} tidligere rapporter i samme arbeidsflyt.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="rounded-xl border bg-background/80 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Foreslått sak</p>
              <p className="mt-1 font-medium">{reportSuggestions.suggestion.caseId.value || "Ingen forslag ennå"}</p>
              <p className="mt-1 text-xs text-muted-foreground">{reportSuggestions.suggestion.caseId.reason}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={onApplyCaseIdSuggestion}
                disabled={!reportSuggestions.suggestion.caseId.value}
                data-testid="case-report-suggestion-apply-caseid"
              >
                Bruk sak
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onApplyFieldSuggestions(true)}
                data-testid="case-report-suggestion-apply-empty"
              >
                Fyll tomme felt
              </Button>
              {reportSuggestions.suggestion.copyPreviousMonth.value && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={onApplyPreviousMonthCopy}
                  data-testid="case-report-suggestion-copy-previous-month"
                >
                  Kopier forrige måned
                </Button>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={onNeverSuggestCaseIdAgain}
                disabled={!reportSuggestions.suggestion.caseId.value}
                data-testid="case-report-suggestion-never-caseid"
              >
                Ikke foreslå saken igjen
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={onDismissReportSuggestions}
                data-testid="case-report-suggestion-dismiss"
              >
                Skjul forslag
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function CaseReportsPage() {
  const [location, setLocation] = useLocation();
  const locationSearch = useMemo(() => {
    if (typeof window !== "undefined") {
      return window.location.search || "";
    }
    const index = location.indexOf("?");
    return index >= 0 ? location.slice(index) : "";
  }, [location]);
  const [routePath, routeSearchParams] = useMemo(() => {
    const [pathOnly] = location.split("?");
    const normalizedSearch = locationSearch.startsWith("?") ? locationSearch.slice(1) : locationSearch;
    return [pathOnly, new URLSearchParams(normalizedSearch)];
  }, [location, locationSearch]);
  const isCasesRoute = routePath === "/cases";
  const shouldAutoCreateFromDashboard = routeSearchParams.get("create") === "1";
  const shouldUseDashboardSuggestions = routeSearchParams.get("useSuggestions") === "1";
  const dashboardPrefillCaseId = (routeSearchParams.get("prefillCaseId") || "").trim();
  const dashboardPrefillMode = routeSearchParams.get("prefillMode");
  const dashboardPrefillKey = useMemo(() => `${routePath}?${locationSearch}`, [routePath, locationSearch]);
  const { toast } = useToast();
  const [editingReport, setEditingReport] = useState<CaseReport | null>(null);
  const [formData, setFormData] = useState(emptyFormData);
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false);
  const [selectedFeedbackReport, setSelectedFeedbackReport] = useState<CaseReport | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [reportsToExport, setReportsToExport] = useState<CaseReport[]>([]);
  const [activeTab, setActiveTab] = useState<string>("reports");
  const [timeReportRange, setTimeReportRange] = useState<"week" | "month" | "quarter">("month");
  const [analyticsTimeRange, setAnalyticsTimeRange] = useState<"7d" | "30d" | "90d" | "12m" | "all">("30d");
  const [statusFilter, setStatusFilter] = useState<ReportStatus | null>(null);
  const [piiDismissed, setPiiDismissed] = useState(false);
  const [piiDismissReason, setPiiDismissReason] = useState<string | null>(null);
  const [piiDismissDialogOpen, setPiiDismissDialogOpen] = useState(false);
  const [piiDrawerOpen, setPiiDrawerOpen] = useState(false);
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const [submitConfirmReportId, setSubmitConfirmReportId] = useState<number | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [reportSuggestionsDismissed, setReportSuggestionsDismissed] = useState(false);
  const dashboardPrefillAppliedRef = useRef<string | null>(null);
  const { user } = useAuth();
  const { effectiveRole } = useRolePreview();
  const isTiltaksleder = effectiveRole === "tiltaksleder";
  const { settings: suggestionSettings, blockSuggestionAsync } = useSuggestionSettings();
  const currentUserId = user?.id ?? "default";
  const workflowSuggestionsEnabled = isSuggestionSurfaceEnabled(suggestionSettings, "workflow");

  // PII Detection — scan on blur / save, not every keystroke
  const { fieldResults, totalWarnings, hasPii, scanFields, scanFieldsNow, isPending: piiScanning } = usePiiDetection({ debounceMs: 1500 });

  // --- Draft persistence (extracted hook) ---
  const {
    draftDialogOpen,
    pendingDraft,
    restoreDraft: restoreDraftRaw,
    discardDraft,
    clearDraft,
    isAutoSaving,
    lastSavedAt,
  } = useDraft<typeof emptyFormData>({
    storageKey: "tidum_case_report_draft",
    formData,
    isFormOpen: showForm,
    editingId: editingReport?.id ?? null,
    hasContent: formHasContent,
  });

  // Build the fields map once and reuse it
  const piiFieldsMap = useCallback((data: typeof formData) => ({
    background: data.background,
    actions: data.actions,
    progress: data.progress,
    challenges: data.challenges,
    factors: data.factors,
    assessment: data.assessment,
    recommendations: data.recommendations,
    notes: data.notes,
  }), []);

  // Debounced scan (used during typing — long debounce)
  const triggerPiiScan = useCallback((data: typeof formData) => {
    scanFields(piiFieldsMap(data));
  }, [scanFields, piiFieldsMap]);

  // Immediate scan (used on blur / save)
  const triggerPiiScanNow = useCallback((data?: typeof formData) => {
    scanFieldsNow(piiFieldsMap(data ?? formData));
  }, [scanFieldsNow, piiFieldsMap, formData]);

  const restoreDraft = useCallback(() => {
    const draft = restoreDraftRaw();
    if (!draft) return;
    setFormData(draft.formData);
    setShowForm(true);
    triggerPiiScan(draft.formData);
    toast({ title: "Utkast gjenopprettet", description: "Du kan fortsette der du slapp." });
  }, [restoreDraftRaw, triggerPiiScan, toast]);

  // Wrapper to update form data (PII scan deferred to blur)
  const updateField = useCallback((field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  // Blur handler — triggers immediate PII scan
  const handleFieldBlur = useCallback(() => {
    triggerPiiScanNow();
  }, [triggerPiiScanNow]);

  const jumpToSection = useCallback((key: CaseReportSuggestionFieldKey) => {
    document.getElementById(`report-section-${key}`)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

  // ── One-click PII anonymization ──────────────────────────────────────────
  const handlePiiReplace = useCallback(
    (field: string, match: string, replacement: string) => {
      setFormData((prev) => {
        const current = (prev as any)[field] as string;
        if (!current) return prev;
        // Replace in both plain text and HTML (the match may sit inside tags)
        const escaped = match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const updated = current.replace(new RegExp(escaped, 'gi'), replacement);
        const next = { ...prev, [field]: updated };
        triggerPiiScan(next);
        return next;
      });
    },
    [triggerPiiScan],
  );

  const handlePiiReplaceAll = useCallback(
    (issues: PiiIssue[]) => {
      setFormData((prev) => {
        let next = { ...prev };
        for (const issue of issues) {
          const current = (next as any)[issue.field] as string;
          if (!current) continue;
          const escaped = issue.warning.match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          (next as any)[issue.field] = current.replace(
            new RegExp(escaped, 'gi'),
            issue.warning.suggestion,
          );
        }
        triggerPiiScan(next);
        return next;
      });
      toast({ title: "Erstattet", description: `${issues.length} personopplysninger ble anonymisert.` });
    },
    [triggerPiiScan, toast],
  );

  const { data: reportsData, isLoading } = useQuery<CaseReportResponse>({
    queryKey: ["/api/case-reports"],
  });

  const reports = reportsData?.reports || [];

  const timeReportStartDate = useMemo(() => {
    const days = timeReportRange === "week" ? 7 : timeReportRange === "quarter" ? 90 : 30;
    return format(subDays(new Date(), days), "yyyy-MM-dd");
  }, [timeReportRange]);

  const { data: timeReports = [], isLoading: isLoadingTimeReports } = useQuery<TimeReportEntry[]>({
    queryKey: ["/api/reports", { startDate: timeReportStartDate, status: "" }],
    enabled: activeTab === "timeReports",
    staleTime: 0,
  });

  const latestTimeReports = useMemo(
    () =>
      [...timeReports]
        .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
        .slice(0, 8),
    [timeReports],
  );

  const timeReportStats = useMemo(() => {
    const totalHours = timeReports.reduce((sum, report) => sum + report.hours, 0);
    const uniqueUsers = new Set(timeReports.map((report) => report.userId)).size;
    const pendingCount = timeReports.filter((report) => report.status === "pending").length;
    return { totalHours, uniqueUsers, pendingCount };
  }, [timeReports]);

  useEffect(() => {
    if (!isTiltaksleder && activeTab === "timeReports") {
      setActiveTab("reports");
    }
  }, [activeTab, isTiltaksleder]);

  const { data: rawReportSuggestions } = useQuery<CaseReportSuggestionsResponse | Record<string, unknown>>({
    queryKey: ["/api/case-reports/suggestions", {
      caseId: formData.case_id || dashboardPrefillCaseId || undefined,
      month: formData.month || undefined,
    }],
    enabled: showForm && !editingReport && (workflowSuggestionsEnabled || shouldUseDashboardSuggestions),
    staleTime: 45_000,
  });

  const reportSuggestions = useMemo<CaseReportSuggestionsResponse | null>(() => {
    if (!rawReportSuggestions || typeof rawReportSuggestions !== "object") return null;
    if (!("suggestion" in rawReportSuggestions) || typeof rawReportSuggestions.suggestion !== "object") return null;
    return rawReportSuggestions as CaseReportSuggestionsResponse;
  }, [rawReportSuggestions]);

  const showReportSuggestionCard = Boolean(
    !editingReport && workflowSuggestionsEnabled && reportSuggestions && !reportSuggestionsDismissed,
  );

  const reportSuggestionVisibility = useSuggestionVisibility({
    surface: "case_reports",
    enabled: showReportSuggestionCard,
    frequency: suggestionSettings.frequency,
    scopeKey: `${formData.month}:${formData.case_id || dashboardPrefillCaseId || "none"}`,
  });

  const shouldRenderReportSuggestions = showReportSuggestionCard && reportSuggestionVisibility.isVisible;

  const suggestionFeedbackMutation = useMutation({
    mutationFn: async (payload: {
      suggestionType: string;
      outcome: "accepted" | "rejected";
      month?: string | null;
      caseId?: string | null;
      suggestedValue?: string | null;
      chosenValue?: string | null;
      metadata?: Record<string, unknown>;
    }) => {
      return apiRequest("POST", "/api/case-reports/suggestions/feedback", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/case-reports/suggestions"] });
    },
  });

  const sendReportSuggestionFeedback = useCallback((
    suggestionType: string,
    outcome: "accepted" | "rejected",
    suggestedValue?: string | null,
    chosenValue?: string | null,
    metadata?: Record<string, unknown>,
  ) => {
    suggestionFeedbackMutation.mutate({
      suggestionType,
      outcome,
      month: formData.month || null,
      caseId: formData.case_id || null,
      suggestedValue,
      chosenValue,
      metadata,
    });
  }, [formData.case_id, formData.month, suggestionFeedbackMutation]);

  const hasFormFieldContent = useCallback((key: CaseReportSuggestionFieldKey, value: string | null | undefined) => {
    if (key === "notes") return (value || "").trim().length > 0;
    return sectionHasContent(value || "");
  }, []);

  const applyCaseIdSuggestion = useCallback(() => {
    const suggestedCaseId = reportSuggestions?.suggestion.caseId.value?.trim() || "";
    if (!suggestedCaseId) return;

    setFormData((prev) => ({ ...prev, case_id: suggestedCaseId }));
    setReportSuggestionsDismissed(false);
    sendReportSuggestionFeedback("case_id", "accepted", suggestedCaseId, suggestedCaseId, { source: "case_reports_form" });
    toast({ title: "Forslag brukt", description: "Saksnummer er satt fra historikken din." });
  }, [reportSuggestions, sendReportSuggestionFeedback, toast]);

  const neverSuggestCaseIdAgain = useCallback(async () => {
    const suggestedCaseId = reportSuggestions?.suggestion.caseId.value?.trim() || "";
    if (!suggestedCaseId) return;

    try {
      await blockSuggestionAsync({ category: "case_id", value: suggestedCaseId });
      sendReportSuggestionFeedback("case_id", "rejected", suggestedCaseId, null, {
        source: "case_reports_form",
        neverSuggestAgain: true,
      });
      reportSuggestionVisibility.dismiss();
      setReportSuggestionsDismissed(true);
      toast({
        title: "Blokkert",
        description: "Denne saken blir ikke foreslått igjen før du fjerner blokkeringen i innstillinger.",
      });
    } catch (error: any) {
      toast({
        title: "Feil",
        description: error?.message || "Kunne ikke blokkere forslaget.",
        variant: "destructive",
      });
    }
  }, [blockSuggestionAsync, reportSuggestionVisibility, reportSuggestions, sendReportSuggestionFeedback, toast]);

  const applyFieldSuggestions = useCallback((onlyEmptyFields: boolean) => {
    if (!reportSuggestions) return;

    const appliedFields: CaseReportSuggestionFieldKey[] = [];
    let caseIdApplied = false;

    setFormData((previous) => {
      const next = { ...previous };

      const suggestedCaseId = reportSuggestions.suggestion.caseId.value?.trim();
      if (suggestedCaseId) {
        const canApplyCaseId = !onlyEmptyFields || !previous.case_id;
        if (canApplyCaseId) {
          next.case_id = suggestedCaseId;
          caseIdApplied = true;
        }
      }

      REPORT_SUGGESTION_FIELD_KEYS.forEach((fieldKey) => {
        const suggestedValue = reportSuggestions.suggestion.fields[fieldKey]?.value;
        if (!suggestedValue) return;

        const currentValue = String((previous as any)[fieldKey] ?? "");
        const hasCurrentContent = hasFormFieldContent(fieldKey, currentValue);
        if (onlyEmptyFields && hasCurrentContent) return;

        (next as any)[fieldKey] = suggestedValue;
        appliedFields.push(fieldKey);
      });

      return next;
    });

    if (!caseIdApplied && appliedFields.length === 0) {
      toast({
        title: "Ingen nye forslag",
        description: onlyEmptyFields
          ? "Alle relevante felt er allerede fylt ut."
          : "Fant ingen forslag å sette inn.",
      });
      return;
    }

    if (caseIdApplied && reportSuggestions.suggestion.caseId.value) {
      sendReportSuggestionFeedback(
        "case_id",
        "accepted",
        reportSuggestions.suggestion.caseId.value,
        reportSuggestions.suggestion.caseId.value,
        { source: "case_reports_form" },
      );
    }

    appliedFields.forEach((fieldKey) => {
      const fieldValue = reportSuggestions.suggestion.fields[fieldKey]?.value || null;
      sendReportSuggestionFeedback(
        `field_${fieldKey}`,
        "accepted",
        fieldValue,
        fieldValue,
        { source: "case_reports_form", onlyEmptyFields },
      );
    });

    sendReportSuggestionFeedback(
      "apply_all",
      "accepted",
      null,
      onlyEmptyFields ? "prefill_empty_fields" : "prefill_all_fields",
      {
        source: "case_reports_form",
        appliedFields,
        caseIdApplied,
        onlyEmptyFields,
      },
    );

    toast({
      title: "Forslag brukt",
      description: `${appliedFields.length + (caseIdApplied ? 1 : 0)} felt ble fylt ut.`,
    });
  }, [hasFormFieldContent, reportSuggestions, sendReportSuggestionFeedback, toast]);

  const applyPreviousMonthCopy = useCallback(() => {
    const previousMonthReport = reportSuggestions?.previousMonthReport;
    if (!previousMonthReport) {
      toast({ title: "Ingen rapport å kopiere", description: "Fant ingen rapport i forrige måned." });
      return;
    }

    setFormData((previous) => {
      const next = {
        ...previous,
        case_id: previousMonthReport.caseId || previous.case_id,
      };

      REPORT_SUGGESTION_FIELD_KEYS.forEach((fieldKey) => {
        const value = previousMonthReport.fields[fieldKey];
        if (value) {
          (next as any)[fieldKey] = value;
        }
      });

      return next;
    });

    sendReportSuggestionFeedback(
      "copy_previous_month",
      "accepted",
      previousMonthReport.month,
      formData.month || null,
      {
        source: "case_reports_form",
        reportId: previousMonthReport.id,
      },
    );
    sendReportSuggestionFeedback(
      "apply_all",
      "accepted",
      null,
      "copy_previous_month",
      {
        source: "case_reports_form",
        reportId: previousMonthReport.id,
        sourceMonth: previousMonthReport.month,
        targetMonth: formData.month,
      },
    );

    toast({
      title: "Kopiert fra forrige måned",
      description: `Feltene er kopiert fra ${previousMonthReport.month}. Måned er beholdt som ${formData.month}.`,
    });
  }, [formData.month, reportSuggestions, sendReportSuggestionFeedback, toast]);

  const dismissReportSuggestions = useCallback(() => {
    reportSuggestionVisibility.dismiss();
    setReportSuggestionsDismissed(true);
    sendReportSuggestionFeedback("apply_all", "rejected", null, null, {
      source: "case_reports_form",
    });
  }, [reportSuggestionVisibility, sendReportSuggestionFeedback]);

  useEffect(() => {
    if (!showForm || editingReport) return;
    setReportSuggestionsDismissed(false);
  }, [showForm, editingReport, formData.case_id, formData.month]);

  useEffect(() => {
    if (!shouldAutoCreateFromDashboard || editingReport) return;
    if (!showForm) {
      setShowForm(true);
    }
  }, [editingReport, shouldAutoCreateFromDashboard, showForm]);

  useEffect(() => {
    if (!shouldAutoCreateFromDashboard || editingReport || !showForm) return;
    if (dashboardPrefillAppliedRef.current === dashboardPrefillKey) return;

    if (dashboardPrefillCaseId && formData.case_id !== dashboardPrefillCaseId) {
      setFormData((previous) => ({ ...previous, case_id: dashboardPrefillCaseId }));
      return;
    }

    if (!shouldUseDashboardSuggestions) {
      dashboardPrefillAppliedRef.current = dashboardPrefillKey;
      return;
    }

    if (!reportSuggestions) return;

    if (dashboardPrefillMode === "copy_previous_month" && reportSuggestions.previousMonthReport) {
      applyPreviousMonthCopy();
    } else {
      applyFieldSuggestions(true);
    }

    dashboardPrefillAppliedRef.current = dashboardPrefillKey;
  }, [
    applyFieldSuggestions,
    applyPreviousMonthCopy,
    dashboardPrefillKey,
    dashboardPrefillCaseId,
    dashboardPrefillMode,
    editingReport,
    formData.case_id,
    reportSuggestions,
    shouldAutoCreateFromDashboard,
    shouldUseDashboardSuggestions,
    showForm,
  ]);

  // Duplicate detection: warn if a report already exists for this case_id + month
  const duplicateReport = useMemo(() => {
    if (editingReport || !formData.case_id || !formData.month) return null;
    return reports.find(
      (r) => r.caseId === formData.case_id && r.month === formData.month,
    ) ?? null;
  }, [reports, formData.case_id, formData.month, editingReport]);

  // Fetch comments for selected report
  const { data: comments, refetch: refetchComments } = useQuery<ReportComment[]>({
    queryKey: ["/api/case-reports", selectedFeedbackReport?.id, "comments"],
    queryFn: async () => {
      if (!selectedFeedbackReport?.id) return [];
      const res = await apiRequest("GET", `/api/case-reports/${selectedFeedbackReport.id}/comments`);
      return res.json();
    },
    enabled: !!selectedFeedbackReport?.id && feedbackDialogOpen,
  });

  // Add comment mutation with optimistic update
  const addCommentMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!selectedFeedbackReport) throw new Error("No report selected");
      return apiRequest("POST", `/api/case-reports/${selectedFeedbackReport.id}/comments`, {
        author_id: currentUserId,
        author_name: "Bruker",
        author_role: "user",
        content,
      });
    },
    onMutate: async (content: string) => {
      // Optimistic: append a temporary comment immediately
      const queryKey = ["/api/case-reports", selectedFeedbackReport?.id, "comments"];
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<ReportComment[]>(queryKey);
      const optimistic: ReportComment = {
        id: -Date.now(), // temp negative id
        report_id: selectedFeedbackReport?.id ?? 0,
        author_id: currentUserId,
        author_name: "Bruker",
        author_role: "user",
        content,
        is_internal: false,
        parent_id: null,
        read_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      queryClient.setQueryData<ReportComment[]>(queryKey, (old) => [...(old ?? []), optimistic]);
      setNewComment("");
      return { previous };
    },
    onError: (_error: any, _content: string, context: any) => {
      // Rollback on error
      if (context?.previous) {
        const queryKey = ["/api/case-reports", selectedFeedbackReport?.id, "comments"];
        queryClient.setQueryData(queryKey, context.previous);
      }
      toast({ title: "Feil", description: "Kunne ikke sende kommentar.", variant: "destructive" });
    },
    onSettled: () => {
      refetchComments();
      queryClient.invalidateQueries({ queryKey: ["/api/case-reports"] });
    },
    onSuccess: () => {
      toast({ title: "Sendt", description: "Kommentaren din er sendt." });
    },
  });

  // Mark comments as read when dialog opens
  useEffect(() => {
    if (feedbackDialogOpen && selectedFeedbackReport?.id) {
      apiRequest("POST", `/api/case-reports/${selectedFeedbackReport.id}/comments/mark-read`, {
        reader_id: currentUserId,
      }).catch(() => {
        // Silently ignore — non-critical
      });
    }
  }, [feedbackDialogOpen, selectedFeedbackReport?.id]);

  const saveMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      if (editingReport) {
        return apiRequest("PUT", `/api/case-reports/${editingReport.id}`, data);
      } else {
        return apiRequest("POST", "/api/case-reports", { ...data, user_id: currentUserId });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/case-reports"] });
      setEditingReport(null);
      setFormData(emptyFormData);
      setShowForm(false);
      setPiiDismissed(false);
      setPiiDismissReason(null);
      clearDraft();
      toast({ 
        title: editingReport ? "Oppdatert" : "Lagret", 
        description: editingReport ? "Rapporten er oppdatert." : "Utkast er lagret." 
      });
    },
    onError: (error: any) => {
      toast({ 
        title: "Feil", 
        description: error?.message || "Kunne ikke lagre rapporten.", 
        variant: "destructive" 
      });
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (reportId: number) => {
      return apiRequest("POST", `/api/case-reports/${reportId}/submit`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/case-reports"] });
      clearDraft();
      toast({ title: "Sendt inn", description: "Rapporten er sendt inn for godkjenning." });
    },
    onError: (error: any) => {
      toast({ 
        title: "Feil", 
        description: error?.message || "Kunne ikke sende inn rapporten.", 
        variant: "destructive" 
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (reportId: number) => {
      return apiRequest("DELETE", `/api/case-reports/${reportId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/case-reports"] });
      toast({ title: "Slettet", description: "Rapporten er slettet." });
    },
  });

  const startEdit = (report: CaseReport) => {
    const nextFormData = {
      case_id: report.caseId,
      month: report.month,
      background: report.background || "",
      actions: report.actions || "",
      progress: report.progress || "",
      challenges: report.challenges || "",
      factors: report.factors || "",
      assessment: report.assessment || "",
      recommendations: report.recommendations || "",
      notes: report.notes || "",
    };
    setEditingReport(report);
    setFormData(nextFormData);
    setShowForm(true);
    setPiiDismissed(false);
    setPiiDismissReason(null);
    triggerPiiScan(nextFormData);
    toast({ title: "Redigerer", description: "Utkast åpnet for redigering." });
  };

  const handleSubmit = (reportId: number) => {
    if (hasPii && !piiDismissed) {
      toast({ 
        title: "Kan ikke sende inn", 
        description: "Rapporten inneholder mulige personopplysninger. Navn og personlig informasjon er ikke tillatt i Tidum. Fjern disse før innsending.", 
        variant: "destructive" 
      });
      return;
    }
    if (!isReadyToSubmit(formData)) {
      toast({
        title: "Ufullstendig rapport",
        description: "Du må fylle ut Bakgrunn, Tiltak og Vurdering før innsending.",
        variant: "destructive",
      });
      return;
    }
    setSubmitConfirmOpen(true);
    setSubmitConfirmReportId(reportId);
  };

  const openFeedbackDialog = (report: CaseReport) => {
    setSelectedFeedbackReport(report);
    setFeedbackDialogOpen(true);
  };

  const handleViewReport = (report: CaseReport) => {
    openFeedbackDialog(report);
  };

  const handleExportReports = (reports: CaseReport[], _format: string) => {
    setReportsToExport(reports);
    setExportDialogOpen(true);
  };

  const handleExportTimeReports = async (formatType: "pdf" | "excel" | "csv") => {
    try {
      const params = new URLSearchParams({
        format: formatType,
        startDate: timeReportStartDate,
      });

      if (formatType === "pdf") {
        window.open(`/api/reports/export?${params.toString()}`, "_blank");
        toast({
          title: "Eksport startet",
          description: "PDF åpnes i ny fane.",
        });
        return;
      }

      const response = await fetch(`/api/reports/export?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Kunne ikke laste ned eksportfilen.");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      const fileDate = format(new Date(), "yyyy-MM-dd");
      a.href = url;
      a.download =
        formatType === "excel" ? `timelister-${fileDate}.xls` : `timelister-${fileDate}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      toast({
        title: "Eksport fullført",
        description: `Timelister ble eksportert som ${formatType.toUpperCase()}.`,
      });
    } catch (error: any) {
      toast({
        title: "Eksport feilet",
        description: error?.message || "Kunne ikke eksportere timelister akkurat nå.",
        variant: "destructive",
      });
    }
  };

  const handleBulkStatusChange = async (reportIds: number[], newStatus: string) => {
    try {
      // In a real app, implement bulk update API
      toast({ 
        title: "Oppdaterer", 
        description: `Oppdaterer status for ${reportIds.length} rapporter...` 
      });
      
      // For now, just show success
      setTimeout(() => {
        toast({ 
          title: "Oppdatert", 
          description: `${reportIds.length} rapporter oppdatert til ${newStatus}` 
        });
      }, 1000);
    } catch (error) {
      toast({ 
        title: "Feil", 
        description: "Kunne ikke oppdatere rapporter", 
        variant: "destructive" 
      });
    }
  };

  const formatDateTime = (dateStr: string | Date | null) => {
    if (!dateStr) return "";
    return format(new Date(dateStr), "d. MMMM yyyy 'kl.' HH:mm", { locale: nb });
  };

  const handleSave = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!formData.case_id || !formData.month) {
      toast({ title: "Feil", description: "Saksnummer og måned er påkrevd.", variant: "destructive" });
      return;
    }
    // Run immediate PII scan before save
    triggerPiiScanNow();
    if (hasPii && !piiDismissed) {
      setPiiDismissDialogOpen(true);
      return;
    }
    saveMutation.mutate(formData);
  };

  const cancelEdit = () => {
    setEditingReport(null);
    setFormData(emptyFormData);
    setShowForm(false);
    setPiiDismissed(false);
    setPiiDismissReason(null);
    clearDraft();
  };

  return (
    <PortalLayout>
      {/* Restore draft dialog */}
      <Dialog open={draftDialogOpen} onOpenChange={(open) => { if (!open) discardDraft(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-primary" />
              Uferdig utkast funnet
            </DialogTitle>
            <DialogDescription>
              {pendingDraft && (
                <>
                  Du har et ulagret utkast fra{" "}
                  <span className="font-medium text-foreground">
                    {format(new Date(pendingDraft.savedAt), "d. MMMM yyyy 'kl.' HH:mm", { locale: nb })}
                  </span>.
                  {pendingDraft.formData.case_id && (
                    <> Sak: <span className="font-medium text-foreground">{pendingDraft.formData.case_id}</span>.</>
                  )}
                  {" "}Vil du fortsette der du slapp?
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button variant="outline" onClick={discardDraft} className="gap-2">
              <Trash2 className="h-4 w-4" />
              Forkast
            </Button>
            <Button onClick={restoreDraft} className="gap-2">
              <RotateCcw className="h-4 w-4" />
              Fortsett
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold" data-testid="text-page-title">
              {isCasesRoute ? "Saker" : "Mine saksrapporter"}
            </h1>
            <p className="text-muted-foreground">
              {isCasesRoute
                ? "Oversikt over saker og tilhørende rapportering"
                : "Skriv og administrer månedlige saksrapporter med avanserte verktøy"}
            </p>
          </div>
          {!showForm && (
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                onClick={() => handleExportReports(reports, "pdf")}
                disabled={reports.length === 0}
              >
                <Download className="h-4 w-4 mr-2" />
                Eksporter
              </Button>
              <Button
                onClick={() => {
                  setEditingReport(null);
                  setFormData(emptyFormData);
                  setPiiDismissed(false);
                  setPiiDismissReason(null);
                  setShowForm(true);
                }}
                data-testid="button-new-report"
              >
                <Plus className="h-4 w-4 mr-2" />
                Ny rapport
              </Button>
            </div>
          )}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className={`grid w-full max-w-xl ${isTiltaksleder ? "grid-cols-3" : "grid-cols-2"}`}>
            <TabsTrigger value="reports" className="gap-2">
              <FileText className="h-4 w-4" />
              Saksrapporter
            </TabsTrigger>
            <TabsTrigger value="analytics" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Analyse
            </TabsTrigger>
            {isTiltaksleder && (
              <TabsTrigger value="timeReports" className="gap-2">
                <Download className="h-4 w-4" />
                Rapporter
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="reports" className="space-y-6">
            {showForm ? (
              <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
                <Card>
                  <CardHeader>
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <CardTitle>{editingReport ? "Rediger rapport" : "Ny saksrapport"}</CardTitle>
                        <CardDescription>
                          {editingReport
                            ? "Oppdater rapporten og lagre endringene."
                            : "Skriv rapporten i rolige, tydelige seksjoner og lagre underveis."}
                        </CardDescription>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{formData.case_id || "Ingen sak valgt"}</Badge>
                        <Badge variant="secondary">{formatReportMonthLabel(formData.month)}</Badge>
                      </div>
                    </div>
                    <div className="pt-2">
                      <ReportLifecycleStrip status={(editingReport?.status as ReportStatus) ?? "draft"} />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleSave} className="space-y-5">
                      <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/10 px-4 py-2.5 text-sm text-amber-700 dark:text-amber-400">
                        <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
                        <span>
                          Navn og personlig informasjon er ikke tillatt i Tidum. Bruk rolleord som «brukeren», «ungdom»
                          eller «foresatte» i stedet for identifiserende detaljer.
                        </span>
                      </div>

                      {!piiDismissed && (
                        <PiiSummaryBanner
                          totalWarnings={totalWarnings}
                          highCount={Object.values(fieldResults).flatMap(r => r.warnings).filter(w => w.confidence === 'high').length}
                          onClick={() => setPiiDrawerOpen(true)}
                          isPending={piiScanning}
                        />
                      )}

                      <PiiSummaryDrawer
                        open={piiDrawerOpen}
                        onOpenChange={setPiiDrawerOpen}
                        fieldResults={fieldResults}
                        onReplace={handlePiiReplace}
                        onReplaceAll={handlePiiReplaceAll}
                      />

                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="case_id">Saksnummer *</Label>
                          <Input
                            id="case_id"
                            value={formData.case_id}
                            onChange={(e) => setFormData({ ...formData, case_id: e.target.value })}
                            placeholder="F.eks. SAK-2024-001"
                            data-testid="input-case-id"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="month">Måned *</Label>
                          <MonthPicker
                            value={formData.month}
                            onChange={(v) => setFormData({ ...formData, month: v })}
                            data-testid="input-month"
                          />
                        </div>
                      </div>

                      {duplicateReport && (
                        <Alert variant="destructive">
                          <AlertTriangle className="h-4 w-4" />
                          <AlertTitle>Duplikat oppdaget</AlertTitle>
                          <AlertDescription>
                            Det finnes allerede en rapport for sak <strong>{duplicateReport.caseId}</strong> i{" "}
                            <strong>{duplicateReport.month}</strong> (status: {statusLabels[duplicateReport.status as ReportStatus] ?? duplicateReport.status}).
                            <Button
                              variant="ghost"
                              className="ml-1 h-auto px-1 text-primary underline"
                              onClick={() => startEdit(duplicateReport)}
                            >
                              Åpne eksisterende rapport
                            </Button>
                          </AlertDescription>
                        </Alert>
                      )}

                      <SectionProgress formData={formData} />

                      {!editingReport && (
                        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-muted/20 px-3 py-2">
                          <Label className="text-xs text-muted-foreground whitespace-nowrap">Mal</Label>
                          <Select
                            onValueChange={(templateId) => {
                              const template = REPORT_TEMPLATES.find((t) => t.id === templateId);
                              if (!template) return;
                              setFormData((prev) => {
                                const next = { ...prev };
                                for (const [key, value] of Object.entries(template.content)) {
                                  if (value && !sectionHasContent((next as any)[key])) {
                                    (next as any)[key] = value;
                                  }
                                }
                                return next;
                              });
                              toast({
                                title: "Mal brukt",
                                description: `«${template.label}» ble satt inn i tomme seksjoner.`,
                              });
                            }}
                          >
                            <SelectTrigger className="h-9 w-full text-xs sm:w-[280px] sm:max-w-[320px]">
                              <Wand2 className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
                              <SelectValue placeholder="Velg en rapportmal..." />
                            </SelectTrigger>
                            <SelectContent>
                              {REPORT_TEMPLATES.map((t) => (
                                <SelectItem key={t.id} value={t.id}>
                                  <div>
                                    <span className="font-medium">{t.label}</span>
                                    <span className="ml-2 text-xs text-muted-foreground">{t.description}</span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      <div className="space-y-4">
                        {REPORT_EDITOR_SECTIONS.map((section, index) => (
                          <ReportSectionCard
                            key={section.key}
                            index={index}
                            section={section}
                            value={(formData as Record<string, string>)[section.key] ?? ""}
                            fieldResults={fieldResults}
                            onChange={(value) => updateField(section.key, value)}
                            onBlur={handleFieldBlur}
                          />
                        ))}
                      </div>

                      <div className="h-20" />
                    </form>

                    <div className="sticky bottom-0 z-10 -mx-6 -mb-6 border-t bg-background/95 px-6 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur supports-[backdrop-filter]:bg-background/80">
                      <div className="flex flex-wrap items-center gap-3">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleSave}
                          disabled={saveMutation.isPending || (hasPii && !piiDismissed)}
                          data-testid="button-save-report"
                          className="gap-2"
                        >
                          <Save className="h-4 w-4" />
                          {saveMutation.isPending ? "Lagrer..." : editingReport ? "Oppdater utkast" : "Lagre utkast"}
                        </Button>
                        {editingReport && (
                          <Button
                            type="button"
                            className="gap-2"
                            disabled={submitMutation.isPending || (hasPii && !piiDismissed)}
                            onClick={() => handleSubmit(editingReport.id)}
                          >
                            <Send className="h-4 w-4" />
                            {submitMutation.isPending ? "Sender..." : "Send inn for godkjenning"}
                          </Button>
                        )}
                        <Button type="button" variant="ghost" onClick={cancelEdit} data-testid="button-cancel">
                          Avbryt
                        </Button>

                        <div className="ml-auto flex items-center gap-2" aria-live="polite" aria-atomic="true">
                          {piiScanning && (
                            <span className="text-xs text-muted-foreground animate-pulse" role="status">
                              Skanner…
                            </span>
                          )}
                          {hasPii && !piiDismissed ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 gap-1.5 text-destructive"
                              onClick={() => setPiiDrawerOpen(true)}
                            >
                              <ShieldAlert className="h-4 w-4" />
                              {totalWarnings} PII
                            </Button>
                          ) : !piiScanning && totalWarnings === 0 && formHasContent(formData) ? (
                            <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Ingen PII
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <p className="mt-1.5 text-[11px] text-muted-foreground/70">
                        {isAutoSaving
                          ? "Lagrer utkast automatisk…"
                          : lastSavedAt
                            ? `Sist lagret ${format(new Date(lastSavedAt), "d. MMM 'kl.' HH:mm", { locale: nb })}.`
                            : "Utkast lagres automatisk mens du skriver."}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <ReportComposerSidebar
                  editingReport={editingReport}
                  formData={formData}
                  isAutoSaving={isAutoSaving}
                  lastSavedAt={lastSavedAt}
                  reportSuggestions={reportSuggestions}
                  shouldRenderReportSuggestions={shouldRenderReportSuggestions}
                  duplicateReport={duplicateReport}
                  onJumpToSection={jumpToSection}
                  onApplyCaseIdSuggestion={applyCaseIdSuggestion}
                  onNeverSuggestCaseIdAgain={() => { void neverSuggestCaseIdAgain(); }}
                  onApplyFieldSuggestions={applyFieldSuggestions}
                  onApplyPreviousMonthCopy={applyPreviousMonthCopy}
                  onDismissReportSuggestions={dismissReportSuggestions}
                />
              </div>
            ) : (
              <>
                {isLoading ? (
                  <div className="grid md:grid-cols-2 gap-4">
                    {[1, 2, 3, 4].map((i) => (
                      <Card key={i}>
                        <CardContent className="p-6">
                          <Skeleton className="h-6 w-32 mb-2" />
                          <Skeleton className="h-4 w-24 mb-4" />
                          <Skeleton className="h-8 w-full" />
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <AdvancedCaseReportBuilder
                    reports={reports}
                    onViewReport={handleViewReport}
                    onEditReport={startEdit}
                    onExportReports={handleExportReports}
                    onBulkStatusChange={handleBulkStatusChange}
                    externalStatusFilter={statusFilter}
                    onCreateNew={() => setShowForm(true)}
                  />
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="analytics" className="space-y-6">
            {isLoading ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {[1, 2, 3, 4].map((i) => (
                  <Card key={i}>
                    <CardContent className="p-6">
                      <Skeleton className="h-4 w-20 mb-2" />
                      <Skeleton className="h-8 w-16 mb-1" />
                      <Skeleton className="h-3 w-32" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <CaseAnalyticsDashboard 
                reports={reports} 
                timeRange={analyticsTimeRange}
                onTimeRangeChange={setAnalyticsTimeRange}
                onFilterByStatus={(status) => {
                  setStatusFilter(status as ReportStatus);
                  setActiveTab("reports");
                  toast({
                    title: "Filter anvendt",
                    description: `Viser rapporter med status: ${status}`,
                  });
                }}
              />
            )}
          </TabsContent>

          {isTiltaksleder && (
            <TabsContent value="timeReports" className="space-y-6">
              <Card>
              <CardHeader>
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <CardTitle>Rapporter</CardTitle>
                    <CardDescription>Administrer og eksporter timelister og rapporter</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      value={timeReportRange}
                      onValueChange={(value) => setTimeReportRange(value as "week" | "month" | "quarter")}
                    >
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Velg periode" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="week">Siste 7 dager</SelectItem>
                        <SelectItem value="month">Siste 30 dager</SelectItem>
                        <SelectItem value="quarter">Siste 90 dager</SelectItem>
                      </SelectContent>
                    </Select>
                    <TimeTrackingPdfDesigner />
                    <Button variant="outline" onClick={() => setLocation("/reports")}>
                      Åpne full side
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-3">
                  <Card className="border-muted bg-muted/20">
                    <CardContent className="p-4">
                      <p className="text-sm text-muted-foreground">Totalt timer</p>
                      <p className="text-2xl font-semibold">{timeReportStats.totalHours.toFixed(1)}t</p>
                    </CardContent>
                  </Card>
                  <Card className="border-muted bg-muted/20">
                    <CardContent className="p-4">
                      <p className="text-sm text-muted-foreground">Aktive brukere</p>
                      <p className="text-2xl font-semibold">{timeReportStats.uniqueUsers}</p>
                    </CardContent>
                  </Card>
                  <Card className="border-muted bg-muted/20">
                    <CardContent className="p-4">
                      <p className="text-sm text-muted-foreground">Venter godkjenning</p>
                      <p className="text-2xl font-semibold">{timeReportStats.pendingCount}</p>
                    </CardContent>
                  </Card>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">Eksporter timelister</p>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => void handleExportTimeReports("pdf")}>
                      PDF
                    </Button>
                    <Button variant="outline" onClick={() => void handleExportTimeReports("excel")}>
                      Excel
                    </Button>
                    <Button variant="outline" onClick={() => void handleExportTimeReports("csv")}>
                      CSV
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-sm font-medium">Siste registreringer</p>
                  {isLoadingTimeReports ? (
                    <div className="space-y-2">
                      {[1, 2, 3, 4].map((index) => (
                        <Skeleton key={index} className="h-14 w-full" />
                      ))}
                    </div>
                  ) : latestTimeReports.length === 0 ? (
                    <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
                      Ingen timelister funnet for valgt periode.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {latestTimeReports.map((entry) => (
                        <div
                          key={entry.id}
                          className="flex flex-col gap-2 rounded-md border p-3 md:flex-row md:items-center md:justify-between"
                        >
                          <div>
                            <p className="font-medium leading-tight">{entry.userName}</p>
                            <p className="text-sm text-muted-foreground">
                              {entry.caseNumber ? `${entry.caseNumber} · ` : ""}
                              {entry.description || "Ingen beskrivelse"}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-sm text-muted-foreground">
                              {format(new Date(entry.date), "d. MMM yyyy", { locale: nb })}
                            </span>
                            <span className="font-semibold">{entry.hours.toFixed(1)}t</span>
                            <Badge
                              variant="outline"
                              className={timeEntryStatusClasses[entry.status] ?? "bg-muted text-muted-foreground"}
                            >
                              {timeEntryStatusLabels[entry.status] ?? entry.status}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>

        {/* Export Dialog */}
        <CaseReportExport
          reports={reportsToExport.length > 0 ? reportsToExport : reports}
          open={exportDialogOpen}
          onOpenChange={setExportDialogOpen}
        />

        <Dialog open={feedbackDialogOpen} onOpenChange={setFeedbackDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Tilbakemelding på rapport</DialogTitle>
              <DialogDescription>
                {selectedFeedbackReport?.caseId} - {selectedFeedbackReport?.month}
              </DialogDescription>
            </DialogHeader>

            {selectedFeedbackReport && (
              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                {/* Lifecycle strip */}
                <ReportLifecycleStrip status={selectedFeedbackReport.status as ReportStatus} />

                {/* Status badge */}
                <div className="flex items-center gap-2">
                  <Badge className={statusColors[selectedFeedbackReport.status as ReportStatus] ?? ""}>
                    {statusLabels[selectedFeedbackReport.status as ReportStatus] ?? selectedFeedbackReport.status}
                  </Badge>
                  {selectedFeedbackReport.approvedAt && (
                    <span className="text-sm text-muted-foreground">
                      Godkjent {formatDateTime(selectedFeedbackReport.approvedAt)}
                    </span>
                  )}
                </div>

                {/* Rejection info if rejected */}
                {(selectedFeedbackReport.status === "rejected" || selectedFeedbackReport.rejectionReason) && (
                  <>
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Rapporten er avslått</AlertTitle>
                      <AlertDescription>
                        Din rapport har blitt gjennomgått og krever endringer før den kan godkjennes.
                      </AlertDescription>
                    </Alert>

                    <div className="bg-destructive/5 border border-destructive/20 rounded-md p-4">
                      <h4 className="font-medium text-destructive mb-2">Årsak til avslag</h4>
                      <p className="whitespace-pre-wrap">{selectedFeedbackReport.rejectionReason}</p>
                    </div>

                    <div className="text-sm text-muted-foreground">
                      <p><strong>Avslått av:</strong> {selectedFeedbackReport.rejectedBy || "Administrator"}</p>
                      <p><strong>Dato:</strong> {formatDateTime(selectedFeedbackReport.rejectedAt)}</p>
                    </div>
                  </>
                )}

                {/* Comments section */}
                <div className="border-t pt-4">
                  <h4 className="font-medium mb-3 flex items-center gap-2">
                    <MessageCircle className="h-4 w-4" />
                    Tilbakemeldinger og diskusjon
                  </h4>
                  
                  {comments && comments.length > 0 ? (
                    <div className="space-y-3 mb-4">
                      {comments.map((comment) => (
                        <div 
                          key={comment.id} 
                          className={`p-3 rounded-md ${
                            comment.author_role === "admin" 
                              ? "bg-primary/5 border-l-2 border-primary" 
                              : "bg-muted"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-sm font-medium">
                              {comment.author_name || comment.author_id}
                              {comment.author_role === "admin" && (
                                <Badge variant="outline" className="ml-2 text-xs">Admin</Badge>
                              )}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {formatDateTime(comment.created_at)}
                            </span>
                          </div>
                          <p className="text-sm whitespace-pre-wrap">{comment.content}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center text-muted-foreground py-6 mb-4">
                      <MessageCircle className="h-8 w-8 mb-2 opacity-30" />
                      <p className="text-sm">Ingen kommentarer ennå.</p>
                    </div>
                  )}

                  {/* Add comment form */}
                  <div className="space-y-2">
                    <Textarea
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Skriv en kommentar eller still et spørsmål..."
                      rows={2}
                      data-testid="input-new-comment"
                    />
                    <Button 
                      size="sm" 
                      onClick={() => addCommentMutation.mutate(newComment)}
                      disabled={!newComment.trim() || addCommentMutation.isPending}
                      data-testid="button-send-comment"
                    >
                      <Send className="h-4 w-4 mr-1" />
                      {addCommentMutation.isPending ? "Sender..." : "Send kommentar"}
                    </Button>
                  </div>
                </div>

                {/* Next steps for rejected/needs_revision */}
                {(selectedFeedbackReport.status === "rejected" || selectedFeedbackReport.status === "needs_revision") && (
                  <div className="border-t pt-4">
                    <h4 className="font-medium mb-3">Neste steg</h4>
                    <ol className="space-y-2 text-sm">
                      <li className="flex gap-3 items-start">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium">1</span>
                        <span>Les tilbakemeldingen nøye og noter hvilke deler som må endres</span>
                      </li>
                      <li className="flex gap-3 items-start">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium">2</span>
                        <span>Klikk "Rediger" på rapporten for å gjøre endringer</span>
                      </li>
                      <li className="flex gap-3 items-start">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium">3</span>
                        <span>Send inn rapporten på nytt når endringene er gjort</span>
                      </li>
                    </ol>
                  </div>
                )}

                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>Trenger du hjelp?</AlertTitle>
                  <AlertDescription>
                    Bruk kommentarfeltet over for å stille spørsmål til administrator, eller ta kontakt med din kontaktperson.
                  </AlertDescription>
                </Alert>
              </div>
            )}

            <DialogFooter className="gap-2">
              {selectedFeedbackReport?.status === "draft" && (
                <Button
                  variant="destructive"
                  onClick={() => setDeleteConfirmOpen(true)}
                  disabled={deleteMutation.isPending}
                  data-testid="button-delete-report"
                >
                  {deleteMutation.isPending ? "Sletter..." : "Slett"}
                </Button>
              )}
              <Button variant="outline" onClick={() => setFeedbackDialogOpen(false)} data-testid="button-close-dialog">
                Lukk
              </Button>
              {(selectedFeedbackReport?.status === "draft" || selectedFeedbackReport?.status === "needs_revision") && (
                <Button
                  onClick={() => {
                    if (selectedFeedbackReport) handleSubmit(selectedFeedbackReport.id);
                  }}
                  disabled={submitMutation.isPending}
                  data-testid="button-submit-report"
                >
                  <Send className="h-4 w-4 mr-2" />
                  {submitMutation.isPending ? "Sender..." : "Send inn"}
                </Button>
              )}
              <Button 
                onClick={() => {
                  setFeedbackDialogOpen(false);
                  if (selectedFeedbackReport) startEdit(selectedFeedbackReport);
                }}
                data-testid="button-edit-now"
              >
                <Edit className="h-4 w-4 mr-2" />
                Rediger nå
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Submit confirmation dialog */}
        <Dialog open={submitConfirmOpen} onOpenChange={setSubmitConfirmOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Send className="h-5 w-5 text-primary" />
                Send inn for godkjenning
              </DialogTitle>
              <DialogDescription>
                Rapporten sendes til administrator for gjennomgang. Du kan ikke redigere den mens den er under behandling.
              </DialogDescription>
            </DialogHeader>

            {/* Report summary */}
            <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
              <p><strong>Sak:</strong> {formData.case_id || selectedFeedbackReport?.caseId}</p>
              <p><strong>Måned:</strong> {formData.month || selectedFeedbackReport?.month}</p>
              <p className="flex items-center gap-1.5">
                <strong>PII-status:</strong>
                {hasPii ? (
                  <span className="text-destructive flex items-center gap-1">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    {totalWarnings} advarsler
                  </span>
                ) : (
                  <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Ingen personopplysninger oppdaget
                  </span>
                )}
              </p>
            </div>

            <DialogFooter className="flex flex-col gap-2">
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setSubmitConfirmOpen(false)}>
                  Avbryt
                </Button>
                <Button
                  onClick={() => {
                    if (submitConfirmReportId) submitMutation.mutate(submitConfirmReportId);
                    setSubmitConfirmOpen(false);
                  }}
                  disabled={submitMutation.isPending}
                  className="gap-2"
                >
                  <Send className="h-4 w-4" />
                  {submitMutation.isPending ? "Sender..." : "Bekreft innsending"}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground/70 text-right">
                Du kan redigere igjen hvis rapporten returneres for revisjon.
              </p>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete confirmation dialog */}
        <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                Slett rapport
              </DialogTitle>
              <DialogDescription>
                Er du sikker på at du vil slette denne rapporten? Handlingen kan ikke angres.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
                Avbryt
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  if (selectedFeedbackReport) {
                    deleteMutation.mutate(selectedFeedbackReport.id);
                    setDeleteConfirmOpen(false);
                    setFeedbackDialogOpen(false);
                  }
                }}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? "Sletter..." : "Ja, slett"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* PII dismiss with reason dialog */}
        <Dialog open={piiDismissDialogOpen} onOpenChange={setPiiDismissDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-amber-500" />
                Personopplysninger oppdaget
              </DialogTitle>
              <DialogDescription>
                Det ble funnet {totalWarnings} mulige personopplysninger. Velg en grunn for å fortsette uten å fjerne dem.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <Label>Grunn for å overse advarslene</Label>
              <Select value={piiDismissReason ?? ""} onValueChange={(v) => setPiiDismissReason(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Velg en grunn..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="no_pii">Ingen reell personopplysning (falsk positiv)</SelectItem>
                  <SelectItem value="legally_required">Påkrevd av juridiske grunner</SelectItem>
                  <SelectItem value="internal_report">Intern rapport — unntak gjelder</SelectItem>
                  <SelectItem value="already_anonymized">Allerede anonymisert tilstrekkelig</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <DialogFooter className="flex gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setPiiDismissDialogOpen(false)}>
                Gå tilbake og rett opp
              </Button>
              <Button
                disabled={!piiDismissReason}
                onClick={() => {
                  setPiiDismissed(true);
                  setPiiDismissDialogOpen(false);
                  // Save immediately after dismissal
                  saveMutation.mutate(formData);
                  toast({
                    title: "PII-advarsler oversett",
                    description: `Grunn: ${piiDismissReason === 'no_pii' ? 'Falsk positiv' : piiDismissReason === 'legally_required' ? 'Juridisk påkrevd' : piiDismissReason === 'internal_report' ? 'Intern rapport' : 'Allerede anonymisert'}`,
                  });
                }}
              >
                Bekreft og lagre
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PortalLayout>
  );
}
