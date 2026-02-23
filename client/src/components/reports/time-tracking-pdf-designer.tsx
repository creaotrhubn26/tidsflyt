import { useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Loader2, Palette, Plus, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type TimeTrackingPdfDensity = "comfortable" | "compact";
type TimeTrackingPdfSection = "header" | "period" | "summary" | "table" | "footer";
type TimeTrackingPdfColumn = "date" | "user" | "department" | "caseNumber" | "description" | "hours" | "status";
type TimeTrackingPdfFontFamily = "inter" | "arial" | "georgia" | "times_new_roman" | "verdana" | "courier_new";
type TimeTrackingPdfCaseDetails = {
  caseOwner: string;
  principal: string;
  reference: string;
  workType: string;
  clientCaseNumber: string;
  period: string;
};
type TimeTrackingPdfContactDetail = {
  label: string;
  value: string;
};

type TimeTrackingPdfTemplate = {
  title: string;
  subtitle: string;
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
  fontFamily: TimeTrackingPdfFontFamily;
  baseFontSize: number;
  titleFontSize: number;
  subtitleFontSize: number;
  tableFontSize: number;
  footerFontSize: number;
  lineHeight: number;
  showCaseDetails: boolean;
  caseDetailsTitle: string;
  caseDetails: TimeTrackingPdfCaseDetails;
  showContactDetails: boolean;
  contactTitle: string;
  contactDetails: TimeTrackingPdfContactDetail[];
  showSummary: boolean;
  showGeneratedDate: boolean;
  showPeriod: boolean;
  showFooter: boolean;
  showTotalsRow: boolean;
  stripeRows: boolean;
  density: TimeTrackingPdfDensity;
  footerText: string;
  headerAlignment: "left" | "center";
  logoPosition: "left" | "right" | "top";
  tableBorderStyle: "soft" | "full" | "none";
  sectionOrder: TimeTrackingPdfSection[];
  visibleColumns: TimeTrackingPdfColumn[];
};

type TimeTrackingPdfTemplateResponse = {
  template: TimeTrackingPdfTemplate;
  canEdit: boolean;
  scope: "vendor" | "global";
};

type TimeTrackingPdfDesignerProps = {
  className?: string;
  buttonVariant?: ComponentProps<typeof Button>["variant"];
  buttonSize?: ComponentProps<typeof Button>["size"];
  buttonLabel?: string;
  mode?: "dialog" | "inline";
};

const HEX_COLOR_REGEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const FONT_FAMILY_OPTIONS: Array<{ value: TimeTrackingPdfFontFamily; label: string }> = [
  { value: "inter", label: "Inter (standard)" },
  { value: "arial", label: "Arial" },
  { value: "georgia", label: "Georgia" },
  { value: "times_new_roman", label: "Times New Roman" },
  { value: "verdana", label: "Verdana" },
  { value: "courier_new", label: "Courier New" },
];

const SECTION_ORDER_DEFAULT: TimeTrackingPdfSection[] = [
  "header",
  "period",
  "summary",
  "table",
  "footer",
];

const COLUMN_ORDER_DEFAULT: TimeTrackingPdfColumn[] = [
  "date",
  "user",
  "department",
  "caseNumber",
  "description",
  "hours",
  "status",
];

const SECTION_META: Record<TimeTrackingPdfSection, { label: string; description: string; fixed?: boolean }> = {
  header: {
    label: "Header",
    description: "Tittel, undertittel, logo og generert-dato",
    fixed: true,
  },
  period: {
    label: "Periode",
    description: "Vis valgt dato-periode og saksinformasjon",
  },
  summary: {
    label: "Oppsummering",
    description: "Totalt timer og antall registreringer",
  },
  table: {
    label: "Tabell",
    description: "Selve tidslinjene",
    fixed: true,
  },
  footer: {
    label: "Footer",
    description: "Signatur/tekst nederst",
  },
};

const COLUMN_META: Record<TimeTrackingPdfColumn, { label: string; description: string; fixed?: boolean }> = {
  date: { label: "Dato", description: "Registreringsdato" },
  user: { label: "Bruker", description: "Ansattnavn" },
  department: { label: "Avdeling", description: "Avdeling/gruppe" },
  caseNumber: { label: "Saksnummer", description: "Case-ID/nummer" },
  description: { label: "Beskrivelse", description: "Hva som ble gjort" },
  hours: { label: "Timer", description: "Antall timer", fixed: true },
  status: { label: "Status", description: "Godkjenningsstatus" },
};

const FALLBACK_TEMPLATE: TimeTrackingPdfTemplate = {
  title: "Timerapport",
  subtitle: "Timeføring og status i valgt periode",
  logoUrl: null,
  primaryColor: "#0f766e",
  accentColor: "#1f2937",
  fontFamily: "inter",
  baseFontSize: 12,
  titleFontSize: 28,
  subtitleFontSize: 14,
  tableFontSize: 12,
  footerFontSize: 11,
  lineHeight: 1.45,
  showCaseDetails: false,
  caseDetailsTitle: "Saksinformasjon",
  caseDetails: {
    caseOwner: "",
    principal: "",
    reference: "",
    workType: "",
    clientCaseNumber: "",
    period: "",
  },
  showContactDetails: false,
  contactTitle: "Kontakt",
  contactDetails: [],
  showSummary: true,
  showGeneratedDate: true,
  showPeriod: true,
  showFooter: true,
  showTotalsRow: true,
  stripeRows: true,
  density: "comfortable",
  footerText: "Generert med Tidum",
  headerAlignment: "left",
  logoPosition: "right",
  tableBorderStyle: "soft",
  sectionOrder: [...SECTION_ORDER_DEFAULT],
  visibleColumns: [...COLUMN_ORDER_DEFAULT],
};

function safeColor(input: string, fallback: string): string {
  return HEX_COLOR_REGEX.test(input) ? input : fallback;
}

function normalizeNumberRange(value: unknown, fallback: number, min: number, max: number, decimals = 0): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const clamped = Math.max(min, Math.min(max, parsed));
  if (decimals <= 0) {
    return Math.round(clamped);
  }
  const factor = 10 ** decimals;
  return Math.round(clamped * factor) / factor;
}

function resolveFontFamilyStack(fontFamily: TimeTrackingPdfFontFamily): string {
  switch (fontFamily) {
    case "arial":
      return "Arial, Helvetica, sans-serif";
    case "georgia":
      return "Georgia, 'Times New Roman', serif";
    case "times_new_roman":
      return "'Times New Roman', Times, serif";
    case "verdana":
      return "Verdana, Geneva, sans-serif";
    case "courier_new":
      return "'Courier New', Courier, monospace";
    case "inter":
    default:
      return "'Inter', 'Segoe UI', Arial, sans-serif";
  }
}

function normalizeSectionOrder(value: unknown): TimeTrackingPdfSection[] {
  if (!Array.isArray(value)) {
    return [...SECTION_ORDER_DEFAULT];
  }

  const seen = new Set<TimeTrackingPdfSection>();
  const allowed = new Set<TimeTrackingPdfSection>(SECTION_ORDER_DEFAULT);
  const normalized: TimeTrackingPdfSection[] = [];

  for (const item of value) {
    const candidate = String(item || "").trim() as TimeTrackingPdfSection;
    if (!allowed.has(candidate) || seen.has(candidate)) {
      continue;
    }
    seen.add(candidate);
    normalized.push(candidate);
  }

  if (!normalized.includes("header")) {
    normalized.unshift("header");
  }
  if (!normalized.includes("table")) {
    normalized.push("table");
  }

  return normalized.length > 0 ? normalized : [...SECTION_ORDER_DEFAULT];
}

function normalizeVisibleColumns(value: unknown): TimeTrackingPdfColumn[] {
  if (!Array.isArray(value)) {
    return [...COLUMN_ORDER_DEFAULT];
  }

  const seen = new Set<TimeTrackingPdfColumn>();
  const allowed = new Set<TimeTrackingPdfColumn>(COLUMN_ORDER_DEFAULT);
  const normalized: TimeTrackingPdfColumn[] = [];

  for (const item of value) {
    const candidate = String(item || "").trim() as TimeTrackingPdfColumn;
    if (!allowed.has(candidate) || seen.has(candidate)) {
      continue;
    }
    seen.add(candidate);
    normalized.push(candidate);
  }

  if (!normalized.includes("hours")) {
    normalized.push("hours");
  }

  return normalized.length > 0 ? normalized : [...COLUMN_ORDER_DEFAULT];
}

function normalizeCaseDetails(value: unknown): TimeTrackingPdfCaseDetails {
  const defaults = FALLBACK_TEMPLATE.caseDetails;
  if (!value || typeof value !== "object") {
    return { ...defaults };
  }
  const row = value as Record<string, unknown>;
  return {
    caseOwner: String(row.caseOwner || "").trim().slice(0, 120),
    principal: String(row.principal || "").trim().slice(0, 120),
    reference: String(row.reference || "").trim().slice(0, 120),
    workType: String(row.workType || "").trim().slice(0, 120),
    clientCaseNumber: String(row.clientCaseNumber || "").trim().slice(0, 120),
    period: String(row.period || "").trim().slice(0, 120),
  };
}

function normalizeContactDetails(value: unknown): TimeTrackingPdfContactDetail[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const row = entry as Record<string, unknown>;
      const label = String(row.label || "").trim();
      const detailValue = String(row.value || "").trim();
      if (!label || !detailValue) {
        return null;
      }
      return {
        label: label.slice(0, 80),
        value: detailValue.slice(0, 240),
      };
    })
    .filter((entry): entry is TimeTrackingPdfContactDetail => Boolean(entry))
    .slice(0, 12);
}

function normalizeTemplate(input: unknown): TimeTrackingPdfTemplate {
  const output: TimeTrackingPdfTemplate = {
    ...FALLBACK_TEMPLATE,
    sectionOrder: [...FALLBACK_TEMPLATE.sectionOrder],
    visibleColumns: [...FALLBACK_TEMPLATE.visibleColumns],
  };

  if (!input || typeof input !== "object") {
    return output;
  }

  const rawValue = input as Record<string, unknown>;
  const value = input as Partial<TimeTrackingPdfTemplate>;

  if (typeof value.title === "string" && value.title.trim()) {
    output.title = value.title.trim();
  }

  if (typeof value.subtitle === "string") {
    output.subtitle = value.subtitle.trim();
  }

  if (typeof value.logoUrl === "string") {
    const trimmed = value.logoUrl.trim();
    output.logoUrl = trimmed ? trimmed : null;
  } else if (value.logoUrl === null) {
    output.logoUrl = null;
  }

  if (typeof value.primaryColor === "string") {
    output.primaryColor = safeColor(value.primaryColor.trim(), output.primaryColor);
  }
  if (typeof value.accentColor === "string") {
    output.accentColor = safeColor(value.accentColor.trim(), output.accentColor);
  }
  if (
    value.fontFamily === "inter"
    || value.fontFamily === "arial"
    || value.fontFamily === "georgia"
    || value.fontFamily === "times_new_roman"
    || value.fontFamily === "verdana"
    || value.fontFamily === "courier_new"
  ) {
    output.fontFamily = value.fontFamily;
  }
  output.baseFontSize = normalizeNumberRange(value.baseFontSize, output.baseFontSize, 10, 16);
  output.titleFontSize = normalizeNumberRange(value.titleFontSize, output.titleFontSize, 18, 42);
  output.subtitleFontSize = normalizeNumberRange(value.subtitleFontSize, output.subtitleFontSize, 11, 24);
  output.tableFontSize = normalizeNumberRange(value.tableFontSize, output.tableFontSize, 9, 16);
  output.footerFontSize = normalizeNumberRange(value.footerFontSize, output.footerFontSize, 9, 14);
  output.lineHeight = normalizeNumberRange(value.lineHeight, output.lineHeight, 1.1, 2, 2);
  if (typeof value.showCaseDetails === "boolean") {
    output.showCaseDetails = value.showCaseDetails;
  }
  if (rawValue.caseDetailsTitle === null) {
    output.caseDetailsTitle = "";
  } else if (typeof value.caseDetailsTitle === "string") {
    output.caseDetailsTitle = value.caseDetailsTitle.trim();
  }
  if (Object.prototype.hasOwnProperty.call(rawValue, "caseDetails")) {
    output.caseDetails = normalizeCaseDetails(rawValue.caseDetails);
  }
  if (typeof value.showContactDetails === "boolean") {
    output.showContactDetails = value.showContactDetails;
  }
  if (rawValue.contactTitle === null) {
    output.contactTitle = "";
  } else if (typeof value.contactTitle === "string") {
    output.contactTitle = value.contactTitle.trim();
  }
  if (Object.prototype.hasOwnProperty.call(rawValue, "contactDetails")) {
    output.contactDetails = normalizeContactDetails(rawValue.contactDetails);
  }

  if (typeof value.showSummary === "boolean") output.showSummary = value.showSummary;
  if (typeof value.showGeneratedDate === "boolean") output.showGeneratedDate = value.showGeneratedDate;
  if (typeof value.showPeriod === "boolean") output.showPeriod = value.showPeriod;
  if (typeof value.showFooter === "boolean") output.showFooter = value.showFooter;
  if (typeof value.showTotalsRow === "boolean") output.showTotalsRow = value.showTotalsRow;
  if (typeof value.stripeRows === "boolean") output.stripeRows = value.stripeRows;

  if (value.density === "comfortable" || value.density === "compact") {
    output.density = value.density;
  }

  if (typeof value.footerText === "string") {
    output.footerText = value.footerText.trim();
  }

  if (value.headerAlignment === "left" || value.headerAlignment === "center") {
    output.headerAlignment = value.headerAlignment;
  }

  if (value.logoPosition === "left" || value.logoPosition === "right" || value.logoPosition === "top") {
    output.logoPosition = value.logoPosition;
  }

  if (value.tableBorderStyle === "soft" || value.tableBorderStyle === "full" || value.tableBorderStyle === "none") {
    output.tableBorderStyle = value.tableBorderStyle;
  }

  if (Object.prototype.hasOwnProperty.call(value, "sectionOrder")) {
    output.sectionOrder = normalizeSectionOrder(value.sectionOrder);
  }

  if (Object.prototype.hasOwnProperty.call(value, "visibleColumns")) {
    output.visibleColumns = normalizeVisibleColumns(value.visibleColumns);
  }

  return output;
}

function cloneTemplate(template: TimeTrackingPdfTemplate): TimeTrackingPdfTemplate {
  return {
    ...template,
    caseDetails: { ...template.caseDetails },
    sectionOrder: [...template.sectionOrder],
    visibleColumns: [...template.visibleColumns],
    contactDetails: template.contactDetails.map((entry) => ({ ...entry })),
  };
}

function getSectionEnabledState(section: TimeTrackingPdfSection, draft: TimeTrackingPdfTemplate): boolean {
  if (!draft.sectionOrder.includes(section)) {
    return false;
  }

  switch (section) {
    case "summary":
      return draft.showSummary;
    case "period":
      return draft.showPeriod || draft.showCaseDetails;
    case "footer":
      return draft.showFooter || draft.showContactDetails;
    default:
      return true;
  }
}

const PRESET_OPTIONS: Array<{
  id: "standard" | "minimal" | "compact";
  label: string;
  description: string;
}> = [
  {
    id: "standard",
    label: "Standard",
    description: "Balansert standard med alle seksjoner",
  },
  {
    id: "minimal",
    label: "Minimal",
    description: "Kun header og tabell",
  },
  {
    id: "compact",
    label: "Kompakt",
    description: "Mer informasjon i mindre plass",
  },
];

export function TimeTrackingPdfDesigner({
  className,
  buttonVariant = "outline",
  buttonSize = "sm",
  buttonLabel = "PDF-designer",
  mode = "dialog",
}: TimeTrackingPdfDesignerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<TimeTrackingPdfTemplate>(cloneTemplate(FALLBACK_TEMPLATE));
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const logoFileInputRef = useRef<HTMLInputElement | null>(null);

  const templateQuery = useQuery<TimeTrackingPdfTemplateResponse>({
    queryKey: ["/api/time-tracking/pdf-template"],
    queryFn: async () => {
      const response = await fetch("/api/time-tracking/pdf-template", {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Kunne ikke hente PDF-design.");
      }
      return response.json() as Promise<TimeTrackingPdfTemplateResponse>;
    },
    staleTime: 60_000,
  });

  const sourceTemplate = useMemo(
    () => normalizeTemplate(templateQuery.data?.template),
    [templateQuery.data?.template],
  );

  useEffect(() => {
    if (templateQuery.data?.template) {
      setDraft(cloneTemplate(normalizeTemplate(templateQuery.data.template)));
    }
  }, [templateQuery.data?.template]);

  const hasChanges = useMemo(() => {
    return JSON.stringify(draft) !== JSON.stringify(sourceTemplate);
  }, [draft, sourceTemplate]);

  const saveMutation = useMutation({
    mutationFn: async (payload: TimeTrackingPdfTemplate) => {
      const response = await fetch("/api/time-tracking/pdf-template", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || "Kunne ikke lagre PDF-design.");
      }
      return response.json() as Promise<{ template: TimeTrackingPdfTemplate; scope: "vendor" | "global" }>;
    },
    onSuccess: async (result) => {
      setDraft(cloneTemplate(normalizeTemplate(result.template)));
      await queryClient.invalidateQueries({ queryKey: ["/api/time-tracking/pdf-template"] });
      toast({
        title: "PDF-design lagret",
        description: "Neste eksport bruker den nye designen.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Kunne ikke lagre",
        description: error?.message || "Prøv igjen.",
        variant: "destructive",
      });
    },
  });

  const isLoading = templateQuery.isLoading;
  const canEdit = templateQuery.data?.canEdit ?? false;
  const previewPrimary = safeColor(draft.primaryColor, FALLBACK_TEMPLATE.primaryColor);
  const previewAccent = safeColor(draft.accentColor, FALLBACK_TEMPLATE.accentColor);
  const previewFontFamily = resolveFontFamilyStack(draft.fontFamily);

  const displaySections = useMemo(() => {
    const inOrder = normalizeSectionOrder(draft.sectionOrder);
    const missing = SECTION_ORDER_DEFAULT.filter((section) => !inOrder.includes(section));
    return [...inOrder, ...missing];
  }, [draft.sectionOrder]);

  const displayColumns = useMemo(() => {
    const inOrder = normalizeVisibleColumns(draft.visibleColumns);
    const missing = COLUMN_ORDER_DEFAULT.filter((column) => !inOrder.includes(column));
    return [...inOrder, ...missing];
  }, [draft.visibleColumns]);

  const visibleColumns = useMemo(
    () => normalizeVisibleColumns(draft.visibleColumns),
    [draft.visibleColumns],
  );

  const previewRows = useMemo(() => {
    return [
      {
        date: "23.02.2026",
        user: "Demo Bruker",
        department: "Miljøteam",
        caseNumber: "CASE-104",
        description: "Miljøarbeid",
        hours: "7.5",
        status: "Godkjent",
      },
      {
        date: "24.02.2026",
        user: "Demo Bruker",
        department: "Miljøteam",
        caseNumber: "CASE-104",
        description: "Rapportskriving",
        hours: "2.0",
        status: "Venter",
      },
    ];
  }, []);
  const previewContactRows = useMemo(
    () => normalizeContactDetails(draft.contactDetails),
    [draft.contactDetails],
  );
  const previewCaseRows = useMemo(() => {
    const resolvedPeriod = draft.caseDetails.period.trim() || "01.02.2026 - 29.02.2026";
    return [
      { label: "Miljøarbeider", value: draft.caseDetails.caseOwner.trim() },
      { label: "Oppdragsgiver", value: draft.caseDetails.principal.trim() },
      { label: "Referanse", value: draft.caseDetails.reference.trim() },
      { label: "Type arbeid", value: draft.caseDetails.workType.trim() },
      { label: "Klient ID/Saks nr", value: draft.caseDetails.clientCaseNumber.trim() },
      { label: "Periode", value: resolvedPeriod.trim() },
    ].filter((entry) => entry.value.length > 0);
  }, [draft.caseDetails]);

  const handleLogoFileSelected = async (file: File | null) => {
    if (!file || !canEdit) return;

    if (!file.type.startsWith("image/")) {
      toast({
        title: "Ugyldig fil",
        description: "Velg en bildefil (PNG, JPG, SVG, WebP eller GIF).",
        variant: "destructive",
      });
      return;
    }

    const formData = new FormData();
    formData.append("image", file);

    try {
      setIsUploadingLogo(true);
      const response = await fetch("/api/cms/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.url) {
        throw new Error(payload?.error || "Opplasting feilet.");
      }

      setDraft((prev) => ({
        ...prev,
        logoUrl: String(payload.url),
      }));
      toast({
        title: "Logo lastet opp",
        description: "Klikk «Lagre design» for å bruke logoen i eksport.",
      });
    } catch (error: any) {
      toast({
        title: "Opplasting feilet",
        description: error?.message || "Prøv igjen.",
        variant: "destructive",
      });
    } finally {
      setIsUploadingLogo(false);
      if (logoFileInputRef.current) {
        logoFileInputRef.current.value = "";
      }
    }
  };

  const moveSection = (section: TimeTrackingPdfSection, direction: "up" | "down") => {
    setDraft((prev) => {
      const order = [...normalizeSectionOrder(prev.sectionOrder)];
      const index = order.indexOf(section);
      if (index === -1) return prev;
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= order.length) return prev;

      const nextOrder = [...order];
      [nextOrder[index], nextOrder[targetIndex]] = [nextOrder[targetIndex], nextOrder[index]];

      return {
        ...prev,
        sectionOrder: nextOrder,
      };
    });
  };

  const toggleSection = (section: TimeTrackingPdfSection, enabled: boolean) => {
    if (SECTION_META[section].fixed) return;

    setDraft((prev) => {
      const order = [...normalizeSectionOrder(prev.sectionOrder)];
      const hasSection = order.includes(section);
      let nextOrder = order;

      if (enabled && !hasSection) {
        nextOrder = [...order, section];
      }
      if (!enabled && hasSection) {
        nextOrder = order.filter((entry) => entry !== section);
      }

      return {
        ...prev,
        showSummary: section === "summary" ? enabled : prev.showSummary,
        showPeriod: section === "period" ? enabled : prev.showPeriod,
        showFooter: section === "footer" ? enabled : prev.showFooter,
        sectionOrder: nextOrder,
      };
    });
  };

  const moveColumn = (column: TimeTrackingPdfColumn, direction: "up" | "down") => {
    setDraft((prev) => {
      const order = [...normalizeVisibleColumns(prev.visibleColumns)];
      const index = order.indexOf(column);
      if (index === -1) return prev;
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= order.length) return prev;

      const nextOrder = [...order];
      [nextOrder[index], nextOrder[targetIndex]] = [nextOrder[targetIndex], nextOrder[index]];

      return {
        ...prev,
        visibleColumns: nextOrder,
      };
    });
  };

  const toggleColumn = (column: TimeTrackingPdfColumn, enabled: boolean) => {
    if (COLUMN_META[column].fixed && !enabled) return;

    setDraft((prev) => {
      const order = [...normalizeVisibleColumns(prev.visibleColumns)];
      const hasColumn = order.includes(column);
      let nextOrder = order;

      if (enabled && !hasColumn) {
        nextOrder = [...order, column];
      }
      if (!enabled && hasColumn) {
        nextOrder = order.filter((entry) => entry !== column);
      }

      if (!nextOrder.includes("hours")) {
        nextOrder.push("hours");
      }

      return {
        ...prev,
        visibleColumns: nextOrder,
      };
    });
  };

  const updateCaseDetail = (key: keyof TimeTrackingPdfCaseDetails, value: string) => {
    setDraft((prev) => ({
      ...prev,
      caseDetails: {
        ...prev.caseDetails,
        [key]: value,
      },
    }));
  };

  const addContactDetail = () => {
    setDraft((prev) => {
      if (prev.contactDetails.length >= 12) {
        return prev;
      }
      return {
        ...prev,
        contactDetails: [
          ...prev.contactDetails,
          { label: "", value: "" },
        ],
      };
    });
  };

  const updateContactDetail = (index: number, key: "label" | "value", value: string) => {
    setDraft((prev) => ({
      ...prev,
      contactDetails: prev.contactDetails.map((entry, entryIndex) => (
        entryIndex === index
          ? { ...entry, [key]: value }
          : entry
      )),
    }));
  };

  const removeContactDetail = (index: number) => {
    setDraft((prev) => ({
      ...prev,
      contactDetails: prev.contactDetails.filter((_, entryIndex) => entryIndex !== index),
    }));
  };

  const applyPreset = (presetId: "standard" | "minimal" | "compact") => {
    setDraft((prev) => {
      if (presetId === "standard") {
        return cloneTemplate({
          ...FALLBACK_TEMPLATE,
          title: prev.title || FALLBACK_TEMPLATE.title,
          subtitle: prev.subtitle,
          logoUrl: prev.logoUrl,
          primaryColor: prev.primaryColor,
          accentColor: prev.accentColor,
          fontFamily: prev.fontFamily,
          baseFontSize: prev.baseFontSize,
          titleFontSize: prev.titleFontSize,
          subtitleFontSize: prev.subtitleFontSize,
          tableFontSize: prev.tableFontSize,
          footerFontSize: prev.footerFontSize,
          lineHeight: prev.lineHeight,
          showCaseDetails: prev.showCaseDetails,
          caseDetailsTitle: prev.caseDetailsTitle,
          caseDetails: prev.caseDetails,
          showContactDetails: prev.showContactDetails,
          contactTitle: prev.contactTitle,
          contactDetails: prev.contactDetails,
        });
      }

      if (presetId === "minimal") {
        return {
          ...prev,
          showSummary: false,
          showPeriod: false,
          showFooter: false,
          showGeneratedDate: false,
          showTotalsRow: true,
          stripeRows: false,
          showCaseDetails: false,
          showContactDetails: false,
          density: "compact",
          sectionOrder: ["header", "table"],
          visibleColumns: ["date", "description", "hours"],
          tableBorderStyle: "none",
        };
      }

      return {
        ...prev,
        showSummary: true,
        showPeriod: true,
        showFooter: true,
        showGeneratedDate: true,
        showTotalsRow: true,
        stripeRows: true,
        showCaseDetails: prev.showCaseDetails,
        showContactDetails: prev.showContactDetails,
        density: "compact",
        headerAlignment: "left",
        logoPosition: "right",
        tableBorderStyle: "full",
        sectionOrder: ["header", "period", "summary", "table", "footer"],
        visibleColumns: [...COLUMN_ORDER_DEFAULT],
      };
    });
  };

  const cellPaddingClass = draft.density === "compact" ? "py-1.5" : "py-2";
  const tableContainerClass = draft.tableBorderStyle === "none"
    ? "overflow-hidden rounded-md"
    : "overflow-hidden rounded-md border";

  const borderClass = draft.tableBorderStyle === "none"
    ? ""
    : draft.tableBorderStyle === "full"
      ? "border border-slate-300"
      : "border-b border-slate-200";

  const renderPreviewValue = (row: Record<TimeTrackingPdfColumn, string>, column: TimeTrackingPdfColumn) => {
    return row[column];
  };

  const editorBody = (
    <>
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-[700px] w-full" />
          <Skeleton className="h-[700px] w-full" />
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-5">
            {!canEdit && (
              <div className="rounded-md border border-dashed bg-muted/40 p-3 text-sm text-muted-foreground">
                Bare tiltaksleder og admin kan redigere PDF-design.
              </div>
            )}

            <div className="rounded-lg border p-4 space-y-4">
              <div className="space-y-1">
                <p className="text-sm font-medium">Grunnoppsett</p>
                <p className="text-xs text-muted-foreground">Tittel, logo, farger og tetthet</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="pdf-title">Rapporttittel</Label>
                <Input
                  id="pdf-title"
                  value={draft.title}
                  onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
                  disabled={!canEdit}
                  maxLength={120}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="pdf-subtitle">Undertittel</Label>
                <Input
                  id="pdf-subtitle"
                  value={draft.subtitle}
                  onChange={(event) => setDraft((prev) => ({ ...prev, subtitle: event.target.value }))}
                  disabled={!canEdit}
                  maxLength={180}
                  placeholder="Valgfri undertittel"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="pdf-logo">Logo URL</Label>
                <Input
                  id="pdf-logo"
                  value={draft.logoUrl ?? ""}
                  onChange={(event) => {
                    const value = event.target.value.trim();
                    setDraft((prev) => ({ ...prev, logoUrl: value || null }));
                  }}
                  disabled={!canEdit}
                  placeholder="https://... eller /uploads/logo.png"
                />
                <input
                  ref={logoFileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    void handleLogoFileSelected(event.target.files?.[0] ?? null);
                  }}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => logoFileInputRef.current?.click()}
                    disabled={!canEdit || isUploadingLogo}
                  >
                    {isUploadingLogo ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Laster opp...
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-4 w-4" />
                        Last opp logo
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setDraft((prev) => ({ ...prev, logoUrl: null }))}
                    disabled={!canEdit || !draft.logoUrl || isUploadingLogo}
                  >
                    <X className="mr-2 h-4 w-4" />
                    Fjern logo
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-[56px_1fr] items-end gap-2">
                <div className="space-y-2">
                  <Label htmlFor="pdf-primary-picker">Farge</Label>
                  <Input
                    id="pdf-primary-picker"
                    type="color"
                    value={previewPrimary}
                    onChange={(event) => setDraft((prev) => ({ ...prev, primaryColor: event.target.value }))}
                    disabled={!canEdit}
                    className="h-10 w-14 p-1"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pdf-primary-color">Primærfarge</Label>
                  <Input
                    id="pdf-primary-color"
                    value={draft.primaryColor}
                    onChange={(event) => setDraft((prev) => ({ ...prev, primaryColor: event.target.value }))}
                    disabled={!canEdit}
                    placeholder="#0f766e"
                  />
                </div>
              </div>

              <div className="grid grid-cols-[56px_1fr] items-end gap-2">
                <div className="space-y-2">
                  <Label htmlFor="pdf-accent-picker">Farge</Label>
                  <Input
                    id="pdf-accent-picker"
                    type="color"
                    value={previewAccent}
                    onChange={(event) => setDraft((prev) => ({ ...prev, accentColor: event.target.value }))}
                    disabled={!canEdit}
                    className="h-10 w-14 p-1"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pdf-accent-color">Tabellfarge</Label>
                  <Input
                    id="pdf-accent-color"
                    value={draft.accentColor}
                    onChange={(event) => setDraft((prev) => ({ ...prev, accentColor: event.target.value }))}
                    disabled={!canEdit}
                    placeholder="#1f2937"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Tetthet</Label>
                  <Select
                    value={draft.density}
                    onValueChange={(value) => setDraft((prev) => ({
                      ...prev,
                      density: value as TimeTrackingPdfDensity,
                    }))}
                    disabled={!canEdit}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="comfortable">Komfortabel</SelectItem>
                      <SelectItem value="compact">Kompakt</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Header-justering</Label>
                  <Select
                    value={draft.headerAlignment}
                    onValueChange={(value) => setDraft((prev) => ({
                      ...prev,
                      headerAlignment: value as "left" | "center",
                    }))}
                    disabled={!canEdit}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="left">Venstre</SelectItem>
                      <SelectItem value="center">Sentrert</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Logo-posisjon</Label>
                  <Select
                    value={draft.logoPosition}
                    onValueChange={(value) => setDraft((prev) => ({
                      ...prev,
                      logoPosition: value as "left" | "right" | "top",
                    }))}
                    disabled={!canEdit}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="left">Venstre</SelectItem>
                      <SelectItem value="right">Høyre</SelectItem>
                      <SelectItem value="top">Over tittel</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="rounded-lg border p-3 space-y-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Typografi</p>
                  <p className="text-xs text-muted-foreground">Font, tekststørrelse og linjehøyde</p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Fontfamilie</Label>
                    <Select
                      value={draft.fontFamily}
                      onValueChange={(value) => setDraft((prev) => ({
                        ...prev,
                        fontFamily: value as TimeTrackingPdfFontFamily,
                      }))}
                      disabled={!canEdit}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FONT_FAMILY_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="pdf-line-height">Linjehøyde</Label>
                    <Input
                      id="pdf-line-height"
                      type="number"
                      min={1.1}
                      max={2}
                      step={0.05}
                      value={draft.lineHeight}
                      onChange={(event) => setDraft((prev) => ({
                        ...prev,
                        lineHeight: normalizeNumberRange(event.target.value, prev.lineHeight, 1.1, 2, 2),
                      }))}
                      disabled={!canEdit}
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="pdf-base-font-size">Brødtekst (px)</Label>
                    <Input
                      id="pdf-base-font-size"
                      type="number"
                      min={10}
                      max={16}
                      step={1}
                      value={draft.baseFontSize}
                      onChange={(event) => setDraft((prev) => ({
                        ...prev,
                        baseFontSize: normalizeNumberRange(event.target.value, prev.baseFontSize, 10, 16),
                      }))}
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pdf-title-font-size">Tittel (px)</Label>
                    <Input
                      id="pdf-title-font-size"
                      type="number"
                      min={18}
                      max={42}
                      step={1}
                      value={draft.titleFontSize}
                      onChange={(event) => setDraft((prev) => ({
                        ...prev,
                        titleFontSize: normalizeNumberRange(event.target.value, prev.titleFontSize, 18, 42),
                      }))}
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pdf-subtitle-font-size">Undertittel (px)</Label>
                    <Input
                      id="pdf-subtitle-font-size"
                      type="number"
                      min={11}
                      max={24}
                      step={1}
                      value={draft.subtitleFontSize}
                      onChange={(event) => setDraft((prev) => ({
                        ...prev,
                        subtitleFontSize: normalizeNumberRange(event.target.value, prev.subtitleFontSize, 11, 24),
                      }))}
                      disabled={!canEdit}
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="pdf-table-font-size">Tabelltekst (px)</Label>
                    <Input
                      id="pdf-table-font-size"
                      type="number"
                      min={9}
                      max={16}
                      step={1}
                      value={draft.tableFontSize}
                      onChange={(event) => setDraft((prev) => ({
                        ...prev,
                        tableFontSize: normalizeNumberRange(event.target.value, prev.tableFontSize, 9, 16),
                      }))}
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pdf-footer-font-size">Footertekst (px)</Label>
                    <Input
                      id="pdf-footer-font-size"
                      type="number"
                      min={9}
                      max={14}
                      step={1}
                      value={draft.footerFontSize}
                      onChange={(event) => setDraft((prev) => ({
                        ...prev,
                        footerFontSize: normalizeNumberRange(event.target.value, prev.footerFontSize, 9, 14),
                      }))}
                      disabled={!canEdit}
                    />
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Tabell-linjer</Label>
                  <Select
                    value={draft.tableBorderStyle}
                    onValueChange={(value) => setDraft((prev) => ({
                      ...prev,
                      tableBorderStyle: value as "soft" | "full" | "none",
                    }))}
                    disabled={!canEdit}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="soft">Myke</SelectItem>
                      <SelectItem value="full">Tydelige</SelectItem>
                      <SelectItem value="none">Ingen</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pdf-footer-text">Footer-tekst</Label>
                  <Textarea
                    id="pdf-footer-text"
                    value={draft.footerText}
                    onChange={(event) => setDraft((prev) => ({ ...prev, footerText: event.target.value }))}
                    disabled={!canEdit}
                    maxLength={240}
                    rows={2}
                    placeholder="Generert med Tidum"
                  />
                </div>
              </div>

              <div className="rounded-lg border p-3 space-y-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Saksinformasjon</p>
                  <p className="text-xs text-muted-foreground">Vis nøkkeldata som følger saken i PDF</p>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="pdf-show-case-details" className="cursor-pointer">
                    Vis saksinfo i periode-seksjon
                  </Label>
                  <Switch
                    id="pdf-show-case-details"
                    checked={draft.showCaseDetails}
                    onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, showCaseDetails: checked }))}
                    disabled={!canEdit}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pdf-case-details-title">Saksinfo-tittel</Label>
                  <Input
                    id="pdf-case-details-title"
                    value={draft.caseDetailsTitle}
                    onChange={(event) => setDraft((prev) => ({ ...prev, caseDetailsTitle: event.target.value }))}
                    disabled={!canEdit || !draft.showCaseDetails}
                    placeholder="Saksinformasjon"
                    maxLength={80}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="pdf-case-owner">Miljøarbeider i saken</Label>
                    <Input
                      id="pdf-case-owner"
                      value={draft.caseDetails.caseOwner}
                      onChange={(event) => updateCaseDetail("caseOwner", event.target.value)}
                      disabled={!canEdit || !draft.showCaseDetails}
                      placeholder="Navn på miljøarbeider"
                      maxLength={120}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pdf-case-principal">Oppdragsgiver</Label>
                    <Input
                      id="pdf-case-principal"
                      value={draft.caseDetails.principal}
                      onChange={(event) => updateCaseDetail("principal", event.target.value)}
                      disabled={!canEdit || !draft.showCaseDetails}
                      placeholder="F.eks. kommune/skole/institusjon"
                      maxLength={120}
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="pdf-case-reference">Referanse</Label>
                    <Input
                      id="pdf-case-reference"
                      value={draft.caseDetails.reference}
                      onChange={(event) => updateCaseDetail("reference", event.target.value)}
                      disabled={!canEdit || !draft.showCaseDetails}
                      placeholder="Internt referansenummer"
                      maxLength={120}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pdf-case-work-type">Type arbeid</Label>
                    <Input
                      id="pdf-case-work-type"
                      value={draft.caseDetails.workType}
                      onChange={(event) => updateCaseDetail("workType", event.target.value)}
                      disabled={!canEdit || !draft.showCaseDetails}
                      placeholder="F.eks. Miljøarbeid / Møte"
                      maxLength={120}
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="pdf-case-client-id">Klient ID/Saks nr</Label>
                    <Input
                      id="pdf-case-client-id"
                      value={draft.caseDetails.clientCaseNumber}
                      onChange={(event) => updateCaseDetail("clientCaseNumber", event.target.value)}
                      disabled={!canEdit || !draft.showCaseDetails}
                      placeholder="F.eks. K-1034 / CASE-19"
                      maxLength={120}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pdf-case-period">Periode (valgfri overstyring)</Label>
                    <Input
                      id="pdf-case-period"
                      value={draft.caseDetails.period}
                      onChange={(event) => updateCaseDetail("period", event.target.value)}
                      disabled={!canEdit || !draft.showCaseDetails}
                      placeholder="Tom = bruker valgt eksportperiode"
                      maxLength={120}
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-lg border p-3 space-y-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Kontaktinformasjon</p>
                  <p className="text-xs text-muted-foreground">Legg til egne kategorier som e-post, telefon eller annet</p>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="pdf-show-contact-details" className="cursor-pointer">
                    Vis kontaktfelt i PDF
                  </Label>
                  <Switch
                    id="pdf-show-contact-details"
                    checked={draft.showContactDetails}
                    onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, showContactDetails: checked }))}
                    disabled={!canEdit}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pdf-contact-title">Kontakt-tittel</Label>
                  <Input
                    id="pdf-contact-title"
                    value={draft.contactTitle}
                    onChange={(event) => setDraft((prev) => ({ ...prev, contactTitle: event.target.value }))}
                    disabled={!canEdit || !draft.showContactDetails}
                    placeholder="Kontakt"
                    maxLength={80}
                  />
                </div>

                {draft.showContactDetails && (
                  <div className="space-y-2">
                    {draft.contactDetails.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        Ingen felt lagt til ennå.
                      </p>
                    )}

                    {draft.contactDetails.map((detail, index) => (
                      <div key={`contact-detail-${index}`} className="grid gap-2 rounded-md border p-2 sm:grid-cols-[1fr_1fr_auto]">
                        <Input
                          value={detail.label}
                          onChange={(event) => updateContactDetail(index, "label", event.target.value)}
                          disabled={!canEdit}
                          placeholder="Kategori (f.eks. E-post)"
                          maxLength={80}
                        />
                        <Input
                          value={detail.value}
                          onChange={(event) => updateContactDetail(index, "value", event.target.value)}
                          disabled={!canEdit}
                          placeholder="Verdi (f.eks. hello@firma.no)"
                          maxLength={240}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9"
                          onClick={() => removeContactDetail(index)}
                          disabled={!canEdit}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addContactDetail}
                      disabled={!canEdit || draft.contactDetails.length >= 12}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Legg til felt
                    </Button>
                  </div>
                )}
              </div>

              <div className="space-y-3 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="pdf-show-date" className="cursor-pointer">Vis generert-dato</Label>
                  <Switch
                    id="pdf-show-date"
                    checked={draft.showGeneratedDate}
                    onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, showGeneratedDate: checked }))}
                    disabled={!canEdit}
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="pdf-show-totals" className="cursor-pointer">Vis totalsum-rad</Label>
                  <Switch
                    id="pdf-show-totals"
                    checked={draft.showTotalsRow}
                    onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, showTotalsRow: checked }))}
                    disabled={!canEdit}
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="pdf-stripe-rows" className="cursor-pointer">Annenhver rad-farge</Label>
                  <Switch
                    id="pdf-stripe-rows"
                    checked={draft.stripeRows}
                    onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, stripeRows: checked }))}
                    disabled={!canEdit}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-lg border p-4 space-y-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">Seksjoner fra topp til bunn</p>
                <p className="text-xs text-muted-foreground">Aktiver, deaktiver og flytt rekkefølge</p>
              </div>

              <div className="space-y-2">
                {displaySections.map((section) => {
                  const enabled = getSectionEnabledState(section, draft);
                  const orderIndex = draft.sectionOrder.indexOf(section);
                  const canMoveUp = orderIndex > 0;
                  const canMoveDown = orderIndex !== -1 && orderIndex < draft.sectionOrder.length - 1;

                  return (
                    <div
                      key={`section-${section}`}
                      className={cn(
                        "rounded-md border p-2",
                        !enabled ? "opacity-65" : "opacity-100",
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{SECTION_META[section].label}</p>
                          <p className="text-xs text-muted-foreground">{SECTION_META[section].description}</p>
                        </div>

                        <Switch
                          checked={enabled}
                          onCheckedChange={(checked) => toggleSection(section, checked)}
                          disabled={!canEdit || SECTION_META[section].fixed}
                        />
                      </div>

                      <div className="mt-2 flex items-center justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => moveSection(section, "up")}
                          disabled={!canEdit || !enabled || !canMoveUp}
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => moveSection(section, "down")}
                          disabled={!canEdit || !enabled || !canMoveDown}
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-lg border p-4 space-y-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">Kolonner i tabellen</p>
                <p className="text-xs text-muted-foreground">Velg hvilke felt som skal vises og i hvilken rekkefølge</p>
              </div>

              <div className="space-y-2">
                {displayColumns.map((column) => {
                  const enabled = draft.visibleColumns.includes(column);
                  const orderIndex = draft.visibleColumns.indexOf(column);
                  const canMoveUp = orderIndex > 0;
                  const canMoveDown = orderIndex !== -1 && orderIndex < draft.visibleColumns.length - 1;

                  return (
                    <div
                      key={`column-${column}`}
                      className={cn(
                        "rounded-md border p-2",
                        !enabled ? "opacity-65" : "opacity-100",
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{COLUMN_META[column].label}</p>
                          <p className="text-xs text-muted-foreground">{COLUMN_META[column].description}</p>
                        </div>
                        <Switch
                          checked={enabled}
                          onCheckedChange={(checked) => toggleColumn(column, checked)}
                          disabled={!canEdit || COLUMN_META[column].fixed}
                        />
                      </div>

                      <div className="mt-2 flex items-center justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => moveColumn(column, "up")}
                          disabled={!canEdit || !enabled || !canMoveUp}
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => moveColumn(column, "down")}
                          disabled={!canEdit || !enabled || !canMoveDown}
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-lg border p-4 space-y-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">Hurtigprofiler</p>
                <p className="text-xs text-muted-foreground">Nyttig når du vil starte fra en stilmal</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {PRESET_OPTIONS.map((preset) => (
                  <Button
                    key={preset.id}
                    type="button"
                    variant="outline"
                    className="h-auto min-h-[58px] justify-start py-2 text-left"
                    onClick={() => applyPreset(preset.id)}
                    disabled={!canEdit}
                  >
                    <span className="block">
                      <span className="block text-sm font-medium">{preset.label}</span>
                      <span className="block text-xs text-muted-foreground">{preset.description}</span>
                    </span>
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <Card className="border-muted bg-muted/20 h-fit">
            <CardContent className="space-y-4 p-4">
              <div className="space-y-2">
                <p className="text-sm font-medium">Forhåndsvisning</p>
                <p className="text-xs text-muted-foreground">Seksjoner vises i valgt topp-til-bunn rekkefølge</p>
              </div>

              <div
                className="rounded-lg bg-white p-4 shadow-sm border"
                style={{
                  fontFamily: previewFontFamily,
                  fontSize: `${draft.baseFontSize}px`,
                  lineHeight: draft.lineHeight,
                }}
              >
                {normalizeSectionOrder(draft.sectionOrder).map((section) => {
                  if (section === "header") {
                    const headerAlignmentClass = draft.headerAlignment === "center" ? "text-center" : "text-left";
                    const logo = draft.logoUrl ? (
                      <img
                        src={draft.logoUrl}
                        alt="Logo"
                        className="h-10 max-w-[120px] object-contain"
                        onError={(event) => {
                          event.currentTarget.style.display = "none";
                        }}
                      />
                    ) : (
                      <div className="h-10 w-[88px] rounded border border-dashed bg-muted/40" />
                    );

                    if (draft.logoPosition === "top") {
                      return (
                        <div key="preview-header" className={cn("border-b pb-3", headerAlignmentClass)} style={{ borderColor: previewPrimary }}>
                          <div className="mb-2 flex justify-center">{logo}</div>
                          <p className="font-semibold" style={{ color: previewPrimary, fontSize: `${draft.titleFontSize}px`, lineHeight: 1.2 }}>
                            {draft.title || "Timerapport"}
                          </p>
                          {draft.subtitle && <p className="text-muted-foreground" style={{ fontSize: `${draft.subtitleFontSize}px` }}>{draft.subtitle}</p>}
                          {draft.showGeneratedDate && (
                            <p className="text-muted-foreground" style={{ fontSize: `${Math.max(10, draft.baseFontSize - 1)}px` }}>Generert: {new Date().toLocaleDateString("nb-NO")}</p>
                          )}
                        </div>
                      );
                    }

                    return (
                      <div key="preview-header" className={cn("flex items-start gap-3 border-b pb-3", headerAlignmentClass)} style={{ borderColor: previewPrimary }}>
                        {draft.logoPosition === "left" && logo}
                        <div className={cn("space-y-1", draft.headerAlignment === "center" && "flex-1") }>
                          <p className="font-semibold" style={{ color: previewPrimary, fontSize: `${draft.titleFontSize}px`, lineHeight: 1.2 }}>
                            {draft.title || "Timerapport"}
                          </p>
                          {draft.subtitle && <p className="text-muted-foreground" style={{ fontSize: `${draft.subtitleFontSize}px` }}>{draft.subtitle}</p>}
                          {draft.showGeneratedDate && (
                            <p className="text-muted-foreground" style={{ fontSize: `${Math.max(10, draft.baseFontSize - 1)}px` }}>Generert: {new Date().toLocaleDateString("nb-NO")}</p>
                          )}
                        </div>
                        {draft.logoPosition === "right" && logo}
                      </div>
                    );
                  }

                  if (section === "period") {
                    const hasCaseDetails = draft.showCaseDetails && previewCaseRows.length > 0;
                    if (!draft.showPeriod && !hasCaseDetails) return null;
                    return (
                      <div key="preview-period" className="mt-3 space-y-2">
                        {draft.showPeriod && (
                          <p className="text-muted-foreground" style={{ fontSize: `${Math.max(11, draft.baseFontSize)}px` }}>
                            Periode: 01.02.2026 - 29.02.2026
                          </p>
                        )}
                        {hasCaseDetails && (
                          <div className="rounded-md border bg-slate-50 p-2" style={{ fontSize: `${Math.max(11, draft.baseFontSize)}px` }}>
                            {draft.caseDetailsTitle.trim() && (
                              <p className="font-semibold text-slate-900">{draft.caseDetailsTitle.trim()}</p>
                            )}
                            <div className="mt-1 space-y-1">
                              {previewCaseRows.map((row, index) => (
                                <p key={`preview-case-row-${index}`} className="text-slate-700">
                                  <span className="font-semibold">{row.label}:</span> {row.value}
                                </p>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }

                  if (section === "summary") {
                    if (!draft.showSummary) return null;
                    return (
                      <div
                        key="preview-summary"
                        className="mt-3 rounded-md border-l-4 bg-slate-50 p-3"
                        style={{ borderColor: previewPrimary, fontSize: `${Math.max(11, draft.baseFontSize + 1)}px`, lineHeight: draft.lineHeight }}
                      >
                        Totalt timer: <strong>9.5</strong><br />
                        Antall registreringer: <strong>2</strong>
                      </div>
                    );
                  }

                  if (section === "table") {
                    return (
                      <div key="preview-table" className={cn("mt-3", tableContainerClass)}>
                        <div className={cn("grid", borderClass)} style={{ gridTemplateColumns: `repeat(${visibleColumns.length}, minmax(0, 1fr))` }}>
                          {visibleColumns.map((column) => (
                            <div
                              key={`preview-header-${column}`}
                              className={cn("px-2 py-2 font-semibold text-white", borderClass, column === "hours" && "text-right")}
                              style={{ backgroundColor: previewAccent, fontSize: `${draft.tableFontSize}px` }}
                            >
                              {COLUMN_META[column].label}
                            </div>
                          ))}
                        </div>

                        {previewRows.map((row, index) => (
                          <div
                            key={`preview-row-${index}`}
                            className={cn(
                              "grid",
                              draft.stripeRows && index % 2 === 1 ? "bg-slate-50" : "bg-white",
                            )}
                            style={{ gridTemplateColumns: `repeat(${visibleColumns.length}, minmax(0, 1fr))` }}
                          >
                            {visibleColumns.map((column) => (
                              <div
                                key={`preview-cell-${index}-${column}`}
                                className={cn(
                                  "px-2",
                                  cellPaddingClass,
                                  borderClass,
                                  column === "hours" && "text-right font-medium",
                                )}
                                style={{ fontSize: `${draft.tableFontSize}px` }}
                              >
                                {renderPreviewValue(row, column)}
                              </div>
                            ))}
                          </div>
                        ))}

                        {draft.showTotalsRow && visibleColumns.includes("hours") && (
                          <div className="grid bg-slate-100" style={{ gridTemplateColumns: `repeat(${visibleColumns.length}, minmax(0, 1fr))` }}>
                            {visibleColumns.map((column, index) => (
                              <div
                                key={`preview-total-${column}`}
                                className={cn(
                                  "px-2 py-2 font-semibold",
                                  borderClass,
                                  column === "hours" && "text-right",
                                )}
                                style={{ fontSize: `${draft.tableFontSize}px` }}
                              >
                                {column === "hours" ? "9.5" : index === 0 ? "Totalt" : ""}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  }

                  if (section === "footer") {
                    const hasContactDetails = draft.showContactDetails && previewContactRows.length > 0;
                    if (!draft.showFooter && !hasContactDetails) return null;
                    return (
                      <div key="preview-footer" className="mt-4 border-t pt-2 space-y-2">
                        {hasContactDetails && (
                          <div className="rounded-md border bg-slate-50 p-2" style={{ fontSize: `${draft.footerFontSize}px` }}>
                            {draft.contactTitle.trim() && (
                              <p className="font-semibold text-slate-900">{draft.contactTitle.trim()}</p>
                            )}
                            <div className="mt-1 space-y-1">
                              {previewContactRows.map((row, index) => (
                                <p key={`preview-contact-row-${index}`} className="text-slate-700">
                                  <span className="font-semibold">{row.label}:</span> {row.value}
                                </p>
                              ))}
                            </div>
                          </div>
                        )}
                        {draft.showFooter && (
                          <p className="text-center text-muted-foreground" style={{ fontSize: `${draft.footerFontSize}px` }}>
                            {draft.footerText || "Generert med Tidum"}
                          </p>
                        )}
                      </div>
                    );
                  }

                  return null;
                })}
              </div>

              <p className="text-xs text-muted-foreground">
                Forhåndsvisning er veiledende. Eksportdata kan ha flere eller færre rader.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
        <Button
          variant="ghost"
          onClick={() => setDraft(cloneTemplate(sourceTemplate))}
          disabled={!canEdit || !hasChanges || saveMutation.isPending}
        >
          Nullstill
        </Button>
        <Button
          onClick={() => saveMutation.mutate(draft)}
          disabled={!canEdit || !hasChanges || saveMutation.isPending}
        >
          {saveMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Lagrer...
            </>
          ) : (
            "Lagre design"
          )}
        </Button>
      </div>
    </>
  );

  if (mode === "inline") {
    return (
      <div className={cn("space-y-6", className)}>
        <div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
          Administrer PDF-design direkte her. Oppsettet brukes når timer eksporteres.
        </div>
        {editorBody}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className={className} size={buttonSize} variant={buttonVariant}>
          <Palette className="mr-2 h-4 w-4" />
          {buttonLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Design PDF for timeføring</DialogTitle>
          <DialogDescription>
            Administrer logo, seksjonsrekkefølge og tabelloppsett fra topp til bunn.
          </DialogDescription>
        </DialogHeader>
        {editorBody}
      </DialogContent>
    </Dialog>
  );
}
