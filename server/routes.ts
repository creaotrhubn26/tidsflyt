import type { Express } from "express";
import express from "express";
import { type Server } from "http";
import { storage } from "./storage";

import { getUncachableGitHubClient } from "./github";
import { registerSmartTimingRoutes } from "./smartTimingRoutes";
import { registerLeaveRoutes } from "./routes/leave-routes";
import { registerInvoiceRoutes } from "./routes/invoice-routes";
import { registerOvertimeRoutes } from "./routes/overtime-routes";
import { registerRecurringRoutes } from "./routes/recurring-routes";
import { registerExportRoutes } from "./routes/export-routes";
import { registerForwardRoutes } from "./routes/forward-routes";
import { registerEmailComposerRoutes } from "./routes/email-composer-routes";
import { registerNotificationRoutes, createNotification, notifyByRole } from "./routes/notification-routes";
import { emailService } from "./lib/email-service";
import vendorApi from "./vendor-api";
import { generateApiKey } from "./api-middleware";
import { db, pool } from "./db";
import { apiKeys, vendors, accessRequests, insertAccessRequestSchema, builderPages, insertBuilderPageSchema, sectionTemplates, pageVersions, formSubmissions, pageAnalytics, users } from "@shared/schema";
import { eq, and, isNull, desc, sql } from "drizzle-orm";
import multer from "multer";
import path from "path";
import fs from "fs";
import sharp from "sharp";
import { z } from "zod";
import { setupCustomAuth, isAuthenticated } from "./custom-auth";
import { requireAdminRole, ADMIN_ROLES } from "./middleware/auth";
import { canAccessVendorApiAdmin, canManageUsers, isTopAdminRole, normalizeRole } from "@shared/roles";
import { apiRateLimit, publicWriteRateLimit, publicReadRateLimit } from "./rate-limit";
import { cache } from "./micro-cache";


// Zod schema for bulk time entry validation
const bulkTimeEntrySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (expected YYYY-MM-DD)"),
  hours: z.number().min(0, "Hours cannot be negative").max(24, "Hours cannot exceed 24"),
  description: z.string().min(1, "Description is required").max(500, "Description too long"),
  caseNumber: z.string().nullable().optional(),
});

const bulkRequestSchema = z.object({
  userId: z.string().optional(),
  entries: z.array(bulkTimeEntrySchema).min(1, "At least one entry required").max(31, "Maximum 31 entries"),
  overwrite: z.boolean().optional().default(false),
});

const timerSessionSchema = z.object({
  userId: z.string().optional(),
  elapsedSeconds: z.number().int().min(0),
  pausedSeconds: z.number().int().min(0),
  isRunning: z.boolean(),
  pauseStartedAt: z.string().datetime().nullable().optional(),
});

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const YEAR_MONTH_REGEX = /^\d{4}-\d{2}$/;

const timeSuggestionFeedbackSchema = z.object({
  suggestionType: z.enum([
    "project",
    "description",
    "hours",
    "bulk_copy_prev_month",
    "apply_all",
    "manual_prefill",
  ]),
  outcome: z.enum(["accepted", "rejected"]),
  date: z.string().regex(DATE_ONLY_REGEX, "Invalid date format (expected YYYY-MM-DD)").nullable().optional(),
  suggestedValue: z.string().max(500).nullable().optional(),
  chosenValue: z.string().max(500).nullable().optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
});

const caseReportSuggestionFeedbackSchema = z.object({
  suggestionType: z.string().min(1).max(80),
  outcome: z.enum(["accepted", "rejected"]),
  month: z.string().regex(YEAR_MONTH_REGEX, "Invalid month format (expected YYYY-MM)").nullable().optional(),
  caseId: z.string().max(120).nullable().optional(),
  suggestedValue: z.string().max(5000).nullable().optional(),
  chosenValue: z.string().max(5000).nullable().optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
});

const suggestionSettingsModeSchema = z.enum([
  "off",
  "dashboard_only",
  "balanced",
  "proactive",
]);

const suggestionSettingsFrequencySchema = z.enum([
  "low",
  "normal",
  "high",
]);

const suggestionConfidenceThresholdSchema = z.number().min(0.2).max(0.95);

const suggestionSettingsPatchSchema = z.object({
  mode: suggestionSettingsModeSchema.optional(),
  frequency: suggestionSettingsFrequencySchema.optional(),
  confidenceThreshold: suggestionConfidenceThresholdSchema.optional(),
}).refine((data) => data.mode !== undefined || data.frequency !== undefined || data.confidenceThreshold !== undefined, {
  message: "At least one setting must be provided",
});

const suggestionBlockSchema = z.object({
  category: z.enum(["project", "description", "case_id"]),
  value: z.string().trim().min(1).max(200),
});

const suggestionTeamPresetSchema = z.object({
  mode: suggestionSettingsModeSchema,
  frequency: suggestionSettingsFrequencySchema,
  confidenceThreshold: suggestionConfidenceThresholdSchema,
});

const suggestionTeamDefaultUpdateSchema = z.object({
  role: z.string().trim().min(1).max(40),
  preset: suggestionTeamPresetSchema,
});

const timeTrackingWorkTypeSchema = z.object({
  id: z.string().trim().min(1).max(80).optional(),
  name: z.string().trim().min(1).max(80),
  color: z.string().trim().max(40).optional(),
  entryMode: z.enum(["timer_or_manual", "manual_only"]).optional(),
});

const timeTrackingWorkTypesPatchSchema = z.object({
  role: z.string().trim().min(1).max(40),
  workTypes: z.array(timeTrackingWorkTypeSchema).max(20),
});

const timeTrackingPdfTemplatePatchSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  subtitle: z.string().trim().max(180).nullable().optional(),
  logoUrl: z.string().trim().max(2048).nullable().optional(),
  primaryColor: z.string().trim().max(20).optional(),
  accentColor: z.string().trim().max(20).optional(),
  fontFamily: z.enum([
    "inter",
    "arial",
    "georgia",
    "times_new_roman",
    "verdana",
    "courier_new",
  ]).optional(),
  baseFontSize: z.number().min(10).max(16).optional(),
  titleFontSize: z.number().min(18).max(42).optional(),
  subtitleFontSize: z.number().min(11).max(24).optional(),
  tableFontSize: z.number().min(9).max(16).optional(),
  footerFontSize: z.number().min(9).max(14).optional(),
  lineHeight: z.number().min(1.1).max(2).optional(),
  showCaseDetails: z.boolean().optional(),
  caseDetailsTitle: z.string().trim().max(80).nullable().optional(),
  caseDetails: z.object({
    caseOwner: z.string().trim().max(120).nullable().optional(),
    principal: z.string().trim().max(120).nullable().optional(),
    reference: z.string().trim().max(120).nullable().optional(),
    workType: z.string().trim().max(120).nullable().optional(),
    clientCaseNumber: z.string().trim().max(120).nullable().optional(),
    period: z.string().trim().max(120).nullable().optional(),
  }).optional(),
  showContactDetails: z.boolean().optional(),
  contactTitle: z.string().trim().max(80).nullable().optional(),
  contactDetails: z.array(
    z.object({
      label: z.string().trim().max(80),
      value: z.string().trim().max(240),
    }),
  ).max(12).optional(),
  showSummary: z.boolean().optional(),
  showGeneratedDate: z.boolean().optional(),
  showPeriod: z.boolean().optional(),
  showFooter: z.boolean().optional(),
  showTotalsRow: z.boolean().optional(),
  stripeRows: z.boolean().optional(),
  density: z.enum(["comfortable", "compact"]).optional(),
  footerText: z.string().trim().max(240).nullable().optional(),
  headerAlignment: z.enum(["left", "center"]).optional(),
  logoPosition: z.enum(["left", "right", "top"]).optional(),
  tableBorderStyle: z.enum(["soft", "full", "none"]).optional(),
  sectionOrder: z.array(z.enum(["header", "period", "summary", "table", "footer"])).max(10).optional(),
  visibleColumns: z.array(z.enum(["date", "user", "department", "caseNumber", "description", "hours", "status"])).max(7).optional(),
}).refine((data) => (
  data.title !== undefined
  || data.subtitle !== undefined
  || data.logoUrl !== undefined
  || data.primaryColor !== undefined
  || data.accentColor !== undefined
  || data.fontFamily !== undefined
  || data.baseFontSize !== undefined
  || data.titleFontSize !== undefined
  || data.subtitleFontSize !== undefined
  || data.tableFontSize !== undefined
  || data.footerFontSize !== undefined
  || data.lineHeight !== undefined
  || data.showCaseDetails !== undefined
  || data.caseDetailsTitle !== undefined
  || data.caseDetails !== undefined
  || data.showContactDetails !== undefined
  || data.contactTitle !== undefined
  || data.contactDetails !== undefined
  || data.showSummary !== undefined
  || data.showGeneratedDate !== undefined
  || data.showPeriod !== undefined
  || data.showFooter !== undefined
  || data.showTotalsRow !== undefined
  || data.stripeRows !== undefined
  || data.density !== undefined
  || data.footerText !== undefined
  || data.headerAlignment !== undefined
  || data.logoPosition !== undefined
  || data.tableBorderStyle !== undefined
  || data.sectionOrder !== undefined
  || data.visibleColumns !== undefined
), {
  message: "At least one setting must be provided",
});

type FeedbackStatsMap = Record<string, { accepted: number; rejected: number }>;

function formatDateOnly(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseDateOnly(input: string): Date | null {
  if (!DATE_ONLY_REGEX.test(input)) return null;
  const [year, month, day] = input.split("-").map((part) => Number(part));
  if (!year || !month || !day) return null;
  const parsed = new Date(year, month - 1, day);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return null;
  return parsed;
}

function shiftDays(base: Date, days: number): Date {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

function formatYearMonth(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

function parseYearMonth(input: string): Date | null {
  if (!YEAR_MONTH_REGEX.test(input)) return null;
  const [year, month] = input.split("-").map((part) => Number(part));
  if (!year || !month) return null;
  const parsed = new Date(year, month - 1, 1);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1) return null;
  return parsed;
}

function shiftMonths(base: Date, months: number): Date {
  const next = new Date(base);
  next.setMonth(next.getMonth() + months);
  return next;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundToQuarterHour(value: number): number {
  return Math.round(value * 4) / 4;
}

function modeWithCount(values: string[]): { value: string | null; count: number } {
  if (!values.length) return { value: null, count: 0 };
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  let bestValue: string | null = null;
  let bestCount = 0;
  counts.forEach((count, value) => {
    if (count > bestCount) {
      bestValue = value;
      bestCount = count;
    }
  });
  return { value: bestValue, count: bestCount };
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getFeedbackAcceptanceRate(feedbackByType: FeedbackStatsMap, suggestionType: string): number | null {
  const stats = feedbackByType[suggestionType];
  if (!stats) return null;
  const total = (stats.accepted || 0) + (stats.rejected || 0);
  if (!total) return null;
  return (stats.accepted || 0) / total;
}

function adjustConfidenceByFeedback(base: number, feedbackByType: FeedbackStatsMap, suggestionType: string): number {
  const acceptanceRate = getFeedbackAcceptanceRate(feedbackByType, suggestionType);
  if (acceptanceRate == null) {
    return clampNumber(base, 0.1, 0.98);
  }
  const adjustment = (acceptanceRate - 0.5) * 0.3;
  return clampNumber(base + adjustment, 0.1, 0.98);
}

type SuggestionPolicySource = "feature_flag_off" | "team_default" | "experiment" | "user_override";
type SuggestionExperimentVariant = "control" | "proactive_test";
type SuggestionTeamPreset = {
  mode: "off" | "dashboard_only" | "balanced" | "proactive";
  frequency: "low" | "normal" | "high";
  confidenceThreshold: number;
};

type SuggestionTeamDefaults = Record<string, SuggestionTeamPreset>;
type TimeTrackingEntryMode = "timer_or_manual" | "manual_only";
type TimeTrackingWorkType = {
  id: string;
  name: string;
  color: string;
  entryMode: TimeTrackingEntryMode;
};
type TimeTrackingWorkTypeConfig = Record<string, TimeTrackingWorkType[]>;
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

const TEAM_SUGGESTION_DEFAULTS_KEY = "suggestion_team_defaults";
const TIME_TRACKING_WORK_TYPES_KEY = "time_tracking_work_types";
const TIME_TRACKING_PDF_TEMPLATE_KEY_PREFIX = "time_tracking_pdf_template_v1";
const TIME_TRACKING_WORK_TYPE_COLORS = [
  "bg-primary",
  "bg-warning",
  "bg-info",
  "bg-success",
  "bg-muted",
] as const;
const HEX_COLOR_REGEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const SAFE_LOGO_URL_REGEX = /^(https?:\/\/|\/)/i;
const TIME_TRACKING_PDF_SECTION_ORDER_DEFAULT: TimeTrackingPdfSection[] = [
  "header",
  "period",
  "summary",
  "table",
  "footer",
];
const TIME_TRACKING_PDF_COLUMNS_DEFAULT: TimeTrackingPdfColumn[] = [
  "date",
  "user",
  "department",
  "caseNumber",
  "description",
  "hours",
  "status",
];
const TIME_TRACKING_PDF_SECTIONS = new Set<TimeTrackingPdfSection>(TIME_TRACKING_PDF_SECTION_ORDER_DEFAULT);
const TIME_TRACKING_PDF_COLUMNS = new Set<TimeTrackingPdfColumn>(TIME_TRACKING_PDF_COLUMNS_DEFAULT);

const DEFAULT_TIME_TRACKING_PDF_TEMPLATE: TimeTrackingPdfTemplate = {
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
  sectionOrder: [...TIME_TRACKING_PDF_SECTION_ORDER_DEFAULT],
  visibleColumns: [...TIME_TRACKING_PDF_COLUMNS_DEFAULT],
};

const DEFAULT_TIME_TRACKING_WORK_TYPE_CONFIG: TimeTrackingWorkTypeConfig = {
  default: [
    {
      id: "miljoarbeid",
      name: "Miljøarbeid",
      color: "bg-primary",
      entryMode: "timer_or_manual",
    },
    {
      id: "mote",
      name: "Møte",
      color: "bg-warning",
      entryMode: "timer_or_manual",
    },
    {
      id: "rapportskriving",
      name: "Rapportskriving",
      color: "bg-info",
      entryMode: "manual_only",
    },
  ],
  miljoarbeider: [
    {
      id: "miljoarbeid",
      name: "Miljøarbeid",
      color: "bg-primary",
      entryMode: "timer_or_manual",
    },
    {
      id: "mote",
      name: "Møte",
      color: "bg-warning",
      entryMode: "timer_or_manual",
    },
    {
      id: "rapportskriving",
      name: "Rapportskriving",
      color: "bg-info",
      entryMode: "manual_only",
    },
  ],
  tiltaksleder: [],
};

const DEFAULT_TEAM_SUGGESTION_DEFAULTS: SuggestionTeamDefaults = {
  default: { mode: "balanced", frequency: "normal", confidenceThreshold: 0.45 },
  super_admin: { mode: "proactive", frequency: "high", confidenceThreshold: 0.35 },
  hovedadmin: { mode: "proactive", frequency: "high", confidenceThreshold: 0.35 },
  admin: { mode: "balanced", frequency: "normal", confidenceThreshold: 0.45 },
  vendor_admin: { mode: "balanced", frequency: "normal", confidenceThreshold: 0.45 },
  tiltaksleder: { mode: "balanced", frequency: "normal", confidenceThreshold: 0.5 },
  teamleder: { mode: "balanced", frequency: "normal", confidenceThreshold: 0.5 },
  case_manager: { mode: "balanced", frequency: "normal", confidenceThreshold: 0.5 },
  miljoarbeider: { mode: "dashboard_only", frequency: "low", confidenceThreshold: 0.6 },
  member: { mode: "balanced", frequency: "normal", confidenceThreshold: 0.5 },
  user: { mode: "balanced", frequency: "normal", confidenceThreshold: 0.5 },
};

function normalizeSuggestionTeamPreset(raw: unknown): SuggestionTeamPreset | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const mode = suggestionSettingsModeSchema.safeParse(value.mode);
  const frequency = suggestionSettingsFrequencySchema.safeParse(value.frequency);
  const confidenceThreshold = suggestionConfidenceThresholdSchema.safeParse(value.confidenceThreshold);

  if (!mode.success || !frequency.success || !confidenceThreshold.success) {
    return null;
  }

  return {
    mode: mode.data,
    frequency: frequency.data,
    confidenceThreshold: confidenceThreshold.data,
  };
}

function cloneTeamDefaults(source: SuggestionTeamDefaults): SuggestionTeamDefaults {
  return Object.fromEntries(
    Object.entries(source).map(([key, preset]) => [
      key,
      { ...preset },
    ]),
  );
}

function normalizeWorkTypeId(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeTimeTrackingWorkType(
  raw: unknown,
  index: number,
): TimeTrackingWorkType | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const name = String(value.name || "").trim();
  if (!name) return null;

  const requestedId = String(value.id || "").trim();
  const normalizedId = normalizeWorkTypeId(requestedId || name);
  if (!normalizedId) return null;

  const requestedColor = String(value.color || "").trim();
  const color = TIME_TRACKING_WORK_TYPE_COLORS.includes(requestedColor as any)
    ? requestedColor
    : TIME_TRACKING_WORK_TYPE_COLORS[index % TIME_TRACKING_WORK_TYPE_COLORS.length];

  const requestedEntryMode = String(value.entryMode || "").trim().toLowerCase();
  const entryMode: TimeTrackingEntryMode = requestedEntryMode === "manual_only"
    ? "manual_only"
    : "timer_or_manual";

  return {
    id: normalizedId,
    name,
    color,
    entryMode,
  };
}

function normalizeTimeTrackingWorkTypeList(raw: unknown): TimeTrackingWorkType[] {
  if (!Array.isArray(raw)) return [];
  const normalized = raw
    .map((entry, index) => normalizeTimeTrackingWorkType(entry, index))
    .filter((entry): entry is TimeTrackingWorkType => Boolean(entry));

  return normalized.filter(
    (entry, index, array) => array.findIndex((candidate) => candidate.id === entry.id) === index,
  );
}

function cloneTimeTrackingWorkTypeConfig(source: TimeTrackingWorkTypeConfig): TimeTrackingWorkTypeConfig {
  return Object.fromEntries(
    Object.entries(source).map(([key, workTypes]) => [
      key,
      workTypes.map((workType) => ({ ...workType })),
    ]),
  );
}

function normalizeTimeTrackingWorkTypeConfig(raw: unknown): TimeTrackingWorkTypeConfig {
  const next = cloneTimeTrackingWorkTypeConfig(DEFAULT_TIME_TRACKING_WORK_TYPE_CONFIG);
  if (!raw || typeof raw !== "object") return next;

  Object.entries(raw as Record<string, unknown>).forEach(([key, workTypesRaw]) => {
    const roleKey = key === "default" ? "default" : normalizeRole(key);
    next[roleKey] = normalizeTimeTrackingWorkTypeList(workTypesRaw);
  });

  if (!Array.isArray(next.tiltaksleder)) {
    next.tiltaksleder = [];
  }

  return next;
}

function normalizeSuggestionTeamDefaults(raw: unknown): SuggestionTeamDefaults {
  const next = cloneTeamDefaults(DEFAULT_TEAM_SUGGESTION_DEFAULTS);
  if (!raw || typeof raw !== "object") return next;

  Object.entries(raw as Record<string, unknown>).forEach(([key, presetRaw]) => {
    const normalized = normalizeSuggestionTeamPreset(presetRaw);
    if (!normalized) return;
    const roleKey = key === "default" ? "default" : normalizeRole(key);
    next[roleKey] = normalized;
  });

  return next;
}

async function readSuggestionTeamDefaults(): Promise<SuggestionTeamDefaults> {
  try {
    const setting = await storage.getSiteSetting(TEAM_SUGGESTION_DEFAULTS_KEY);
    if (!setting?.value) return cloneTeamDefaults(DEFAULT_TEAM_SUGGESTION_DEFAULTS);
    const parsed = JSON.parse(setting.value);
    return normalizeSuggestionTeamDefaults(parsed);
  } catch {
    return cloneTeamDefaults(DEFAULT_TEAM_SUGGESTION_DEFAULTS);
  }
}

async function writeSuggestionTeamDefaults(defaults: SuggestionTeamDefaults): Promise<void> {
  await storage.upsertSiteSetting(TEAM_SUGGESTION_DEFAULTS_KEY, JSON.stringify(defaults));
}

async function readTimeTrackingWorkTypeConfig(): Promise<TimeTrackingWorkTypeConfig> {
  try {
    const setting = await storage.getSiteSetting(TIME_TRACKING_WORK_TYPES_KEY);
    if (!setting?.value) {
      return cloneTimeTrackingWorkTypeConfig(DEFAULT_TIME_TRACKING_WORK_TYPE_CONFIG);
    }
    const parsed = JSON.parse(setting.value);
    return normalizeTimeTrackingWorkTypeConfig(parsed);
  } catch {
    return cloneTimeTrackingWorkTypeConfig(DEFAULT_TIME_TRACKING_WORK_TYPE_CONFIG);
  }
}

async function writeTimeTrackingWorkTypeConfig(config: TimeTrackingWorkTypeConfig): Promise<void> {
  await storage.upsertSiteSetting(TIME_TRACKING_WORK_TYPES_KEY, JSON.stringify(config));
}

function cloneTimeTrackingPdfTemplate(source: TimeTrackingPdfTemplate): TimeTrackingPdfTemplate {
  return {
    ...source,
    caseDetails: { ...source.caseDetails },
    sectionOrder: [...source.sectionOrder],
    visibleColumns: [...source.visibleColumns],
    contactDetails: source.contactDetails.map((entry) => ({ ...entry })),
  };
}

function normalizeHexColor(value: unknown, fallback: string): string {
  const candidate = String(value || "").trim();
  if (!candidate) return fallback;
  return HEX_COLOR_REGEX.test(candidate) ? candidate : fallback;
}

function normalizeLogoUrl(value: unknown): string | null {
  const candidate = String(value || "").trim();
  if (!candidate) return null;
  if (!SAFE_LOGO_URL_REGEX.test(candidate)) return null;
  return candidate;
}

function normalizeNumericRange(value: unknown, fallback: number, min: number, max: number, decimals = 0): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const clamped = clampNumber(parsed, min, max);
  if (decimals <= 0) {
    return Math.round(clamped);
  }
  const factor = 10 ** decimals;
  return Math.round(clamped * factor) / factor;
}

function resolveTimeTrackingPdfFontStack(fontFamily: TimeTrackingPdfFontFamily): string {
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

function normalizeTimeTrackingPdfSectionOrder(value: unknown): TimeTrackingPdfSection[] {
  if (!Array.isArray(value)) {
    return [...TIME_TRACKING_PDF_SECTION_ORDER_DEFAULT];
  }

  const normalized = value
    .map((entry) => String(entry || "").trim())
    .filter((entry): entry is TimeTrackingPdfSection => TIME_TRACKING_PDF_SECTIONS.has(entry as TimeTrackingPdfSection))
    .filter((entry, index, array) => array.indexOf(entry) === index);

  if (!normalized.includes("table")) {
    normalized.push("table");
  }

  return normalized.length > 0 ? normalized : [...TIME_TRACKING_PDF_SECTION_ORDER_DEFAULT];
}

function normalizeTimeTrackingPdfVisibleColumns(value: unknown): TimeTrackingPdfColumn[] {
  if (!Array.isArray(value)) {
    return [...TIME_TRACKING_PDF_COLUMNS_DEFAULT];
  }

  const normalized = value
    .map((entry) => String(entry || "").trim())
    .filter((entry): entry is TimeTrackingPdfColumn => TIME_TRACKING_PDF_COLUMNS.has(entry as TimeTrackingPdfColumn))
    .filter((entry, index, array) => array.indexOf(entry) === index);

  if (!normalized.includes("hours")) {
    normalized.push("hours");
  }

  return normalized.length > 0 ? normalized : [...TIME_TRACKING_PDF_COLUMNS_DEFAULT];
}

function normalizeTimeTrackingPdfCaseDetails(value: unknown): TimeTrackingPdfCaseDetails {
  const defaults = DEFAULT_TIME_TRACKING_PDF_TEMPLATE.caseDetails;
  if (!value || typeof value !== "object") {
    return { ...defaults };
  }
  const record = value as Record<string, unknown>;
  return {
    caseOwner: String(record.caseOwner || "").trim().slice(0, 120),
    principal: String(record.principal || "").trim().slice(0, 120),
    reference: String(record.reference || "").trim().slice(0, 120),
    workType: String(record.workType || "").trim().slice(0, 120),
    clientCaseNumber: String(record.clientCaseNumber || "").trim().slice(0, 120),
    period: String(record.period || "").trim().slice(0, 120),
  };
}

function normalizeTimeTrackingPdfContactDetails(value: unknown): TimeTrackingPdfContactDetail[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized = value
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
    .filter((entry): entry is TimeTrackingPdfContactDetail => Boolean(entry));

  return normalized.slice(0, 12);
}

function normalizeTimeTrackingPdfTemplate(raw: unknown): TimeTrackingPdfTemplate {
  const next = cloneTimeTrackingPdfTemplate(DEFAULT_TIME_TRACKING_PDF_TEMPLATE);
  if (!raw || typeof raw !== "object") return next;

  const value = raw as Record<string, unknown>;
  const title = String(value.title || "").trim();
  if (title) next.title = title;

  if (value.subtitle === null) {
    next.subtitle = "";
  } else if (typeof value.subtitle === "string") {
    next.subtitle = value.subtitle.trim();
  }

  if (Object.prototype.hasOwnProperty.call(value, "logoUrl")) {
    next.logoUrl = normalizeLogoUrl(value.logoUrl);
  }
  next.primaryColor = normalizeHexColor(value.primaryColor, DEFAULT_TIME_TRACKING_PDF_TEMPLATE.primaryColor);
  next.accentColor = normalizeHexColor(value.accentColor, DEFAULT_TIME_TRACKING_PDF_TEMPLATE.accentColor);
  if (
    value.fontFamily === "inter"
    || value.fontFamily === "arial"
    || value.fontFamily === "georgia"
    || value.fontFamily === "times_new_roman"
    || value.fontFamily === "verdana"
    || value.fontFamily === "courier_new"
  ) {
    next.fontFamily = value.fontFamily;
  }
  next.baseFontSize = normalizeNumericRange(
    value.baseFontSize,
    DEFAULT_TIME_TRACKING_PDF_TEMPLATE.baseFontSize,
    10,
    16,
  );
  next.titleFontSize = normalizeNumericRange(
    value.titleFontSize,
    DEFAULT_TIME_TRACKING_PDF_TEMPLATE.titleFontSize,
    18,
    42,
  );
  next.subtitleFontSize = normalizeNumericRange(
    value.subtitleFontSize,
    DEFAULT_TIME_TRACKING_PDF_TEMPLATE.subtitleFontSize,
    11,
    24,
  );
  next.tableFontSize = normalizeNumericRange(
    value.tableFontSize,
    DEFAULT_TIME_TRACKING_PDF_TEMPLATE.tableFontSize,
    9,
    16,
  );
  next.footerFontSize = normalizeNumericRange(
    value.footerFontSize,
    DEFAULT_TIME_TRACKING_PDF_TEMPLATE.footerFontSize,
    9,
    14,
  );
  next.lineHeight = normalizeNumericRange(
    value.lineHeight,
    DEFAULT_TIME_TRACKING_PDF_TEMPLATE.lineHeight,
    1.1,
    2,
    2,
  );
  if (typeof value.showCaseDetails === "boolean") {
    next.showCaseDetails = value.showCaseDetails;
  }
  if (value.caseDetailsTitle === null) {
    next.caseDetailsTitle = "";
  } else if (typeof value.caseDetailsTitle === "string") {
    next.caseDetailsTitle = value.caseDetailsTitle.trim();
  }
  if (Object.prototype.hasOwnProperty.call(value, "caseDetails")) {
    next.caseDetails = normalizeTimeTrackingPdfCaseDetails(value.caseDetails);
  }
  if (typeof value.showContactDetails === "boolean") {
    next.showContactDetails = value.showContactDetails;
  }
  if (value.contactTitle === null) {
    next.contactTitle = "";
  } else if (typeof value.contactTitle === "string") {
    next.contactTitle = value.contactTitle.trim();
  }
  if (Object.prototype.hasOwnProperty.call(value, "contactDetails")) {
    next.contactDetails = normalizeTimeTrackingPdfContactDetails(value.contactDetails);
  }

  if (typeof value.showSummary === "boolean") {
    next.showSummary = value.showSummary;
  }
  if (typeof value.showGeneratedDate === "boolean") {
    next.showGeneratedDate = value.showGeneratedDate;
  }
  if (typeof value.showPeriod === "boolean") {
    next.showPeriod = value.showPeriod;
  }
  if (typeof value.showFooter === "boolean") {
    next.showFooter = value.showFooter;
  }
  if (typeof value.showTotalsRow === "boolean") {
    next.showTotalsRow = value.showTotalsRow;
  }
  if (typeof value.stripeRows === "boolean") {
    next.stripeRows = value.stripeRows;
  }
  if (value.density === "compact" || value.density === "comfortable") {
    next.density = value.density;
  }
  if (value.footerText === null) {
    next.footerText = "";
  } else if (typeof value.footerText === "string") {
    next.footerText = value.footerText.trim();
  }
  if (value.headerAlignment === "left" || value.headerAlignment === "center") {
    next.headerAlignment = value.headerAlignment;
  }
  if (value.logoPosition === "left" || value.logoPosition === "right" || value.logoPosition === "top") {
    next.logoPosition = value.logoPosition;
  }
  if (value.tableBorderStyle === "soft" || value.tableBorderStyle === "full" || value.tableBorderStyle === "none") {
    next.tableBorderStyle = value.tableBorderStyle;
  }
  if (Object.prototype.hasOwnProperty.call(value, "sectionOrder")) {
    next.sectionOrder = normalizeTimeTrackingPdfSectionOrder(value.sectionOrder);
  }
  if (Object.prototype.hasOwnProperty.call(value, "visibleColumns")) {
    next.visibleColumns = normalizeTimeTrackingPdfVisibleColumns(value.visibleColumns);
  }

  return next;
}

function resolveTimeTrackingPdfTemplateKey(vendorId: number | null | undefined): string {
  const parsedVendorId = Number(vendorId);
  if (Number.isFinite(parsedVendorId) && parsedVendorId > 0) {
    return `${TIME_TRACKING_PDF_TEMPLATE_KEY_PREFIX}:vendor:${parsedVendorId}`;
  }
  return `${TIME_TRACKING_PDF_TEMPLATE_KEY_PREFIX}:global`;
}

async function readTimeTrackingPdfTemplate(vendorId: number | null | undefined): Promise<TimeTrackingPdfTemplate> {
  const key = resolveTimeTrackingPdfTemplateKey(vendorId);
  const globalKey = resolveTimeTrackingPdfTemplateKey(null);
  try {
    const setting = await storage.getSiteSetting(key);
    if (setting?.value) {
      const parsed = JSON.parse(setting.value);
      return normalizeTimeTrackingPdfTemplate(parsed);
    }

    if (key !== globalKey) {
      const globalSetting = await storage.getSiteSetting(globalKey);
      if (globalSetting?.value) {
        const parsed = JSON.parse(globalSetting.value);
        return normalizeTimeTrackingPdfTemplate(parsed);
      }
    }
  } catch {
    // fall through to default
  }

  return cloneTimeTrackingPdfTemplate(DEFAULT_TIME_TRACKING_PDF_TEMPLATE);
}

async function writeTimeTrackingPdfTemplate(
  vendorId: number | null | undefined,
  template: TimeTrackingPdfTemplate,
): Promise<void> {
  const key = resolveTimeTrackingPdfTemplateKey(vendorId);
  await storage.upsertSiteSetting(key, JSON.stringify(template));
}

function canEditTimeTrackingPdfTemplate(role: string | null | undefined): boolean {
  const normalizedRole = normalizeRole(role);
  return normalizedRole === "tiltaksleder" || isTopAdminRole(normalizedRole);
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function resolveTimeTrackingWorkTypesForRole(
  config: TimeTrackingWorkTypeConfig,
  role: string | null | undefined,
): TimeTrackingWorkType[] {
  const normalizedRole = normalizeRole(role);
  return config[normalizedRole] || config.default || [];
}

function computeSuggestionExperimentVariant(userId: string): SuggestionExperimentVariant {
  const seed = `${userId}:suggestions-v1`;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash % 2 === 0 ? "control" : "proactive_test";
}

function isBlockedSuggestionValue(blockedValues: string[], value: string | null | undefined): boolean {
  if (!value) return false;
  const candidate = value.trim().toLowerCase();
  if (!candidate) return false;
  return blockedValues.some((entry) => entry.trim().toLowerCase() === candidate);
}

function fallbackSuggestionReason(
  sourceReason: string,
  fallback: "threshold" | "blocked",
  confidenceThreshold: number,
): string {
  if (fallback === "blocked") {
    return "Skjult fordi du har valgt «ikke foreslå igjen».";
  }
  const thresholdPercent = Math.round(confidenceThreshold * 100);
  return `${sourceReason} Skjult fordi sikkerhet er under terskelen (${thresholdPercent}%).`;
}

async function resolveSuggestionSettingsForUser(params: {
  userId: string;
  role: string | null | undefined;
  settingsOverride?: Awaited<ReturnType<typeof storage.getUserSuggestionSettings>>;
}) {
  const {
    userId,
    role,
    settingsOverride,
  } = params;

  const userSettings = settingsOverride || await storage.getUserSuggestionSettings(userId);
  const teamDefaults = await readSuggestionTeamDefaults();
  const normalizedRole = normalizeRole(role);
  const teamDefault = teamDefaults[normalizedRole] || teamDefaults.default;
  const featureEnabled = process.env.TIDUM_SUGGESTIONS_ENABLED !== "false";
  const experimentsEnabled = process.env.TIDUM_SUGGESTIONS_EXPERIMENTS !== "false";
  const variant = computeSuggestionExperimentVariant(userId);
  const recommendedMode = variant === "proactive_test" ? "proactive" : "balanced";

  let mode = userSettings.userOverride ? userSettings.mode : teamDefault.mode;
  let frequency = userSettings.userOverride ? userSettings.frequency : teamDefault.frequency;
  let confidenceThreshold = userSettings.userOverride
    ? userSettings.confidenceThreshold
    : teamDefault.confidenceThreshold;
  let source: SuggestionPolicySource = userSettings.userOverride ? "user_override" : "team_default";

  if (!featureEnabled) {
    mode = "off";
    source = "feature_flag_off";
  } else if (!userSettings.userOverride && experimentsEnabled && variant === "proactive_test" && mode === "balanced") {
    mode = "proactive";
    source = "experiment";
  }

  return {
    mode,
    frequency,
    confidenceThreshold,
    blocked: userSettings.blocked,
    userOverride: userSettings.userOverride,
    updatedAt: userSettings.updatedAt,
    teamDefault,
    rollout: {
      featureEnabled,
      experimentsEnabled,
      variant,
      recommendedMode,
      source,
    },
  };
}

function estimateTimeSavedMinutesFromFeedback(feedbackByType: FeedbackStatsMap): number {
  const weightByType: Record<string, number> = {
    project: 0.8,
    description: 0.8,
    hours: 0.6,
    bulk_copy_prev_month: 8,
    apply_all: 3,
    manual_prefill: 1.2,
    case_id: 1.5,
    template: 1.2,
    copy_previous_month: 10,
  };

  let total = 0;
  Object.entries(feedbackByType).forEach(([suggestionType, stats]) => {
    const accepted = Number(stats?.accepted || 0);
    if (!accepted) return;

    const dynamicFieldWeight = suggestionType.startsWith("field_") ? 0.7 : null;
    const weight = dynamicFieldWeight ?? weightByType[suggestionType] ?? 0.5;
    total += accepted * weight;
  });

  return Math.round(total);
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Setup Custom OAuth Auth (MUST be before other routes)
  await setupCustomAuth(app);
  
  // Skip seeding when using external database
  if (!process.env.EXTERNAL_DATABASE_URL) {
    try {
      await storage.seedData();
      console.log("Database initialization complete");
    } catch (error) {
      console.error("Database seed error:", error);
    }
  } else {
    console.log("Connected to external database - skipping seed");
  }
  
  // Register Smart Timing API routes
  registerSmartTimingRoutes(app);
  
  // Register Vendor API routes (v1)
  app.use("/api/v1/vendor", vendorApi);

  // Middleware to require vendor authentication via OAuth
  const requireVendorAuth = async (req: any, res: any, next: any) => {
    // Check if user is authenticated
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      return res.status(401).json({ 
        error: "Unauthorized", 
        message: "Please log in to access this resource." 
      });
    }

    const user = req.user;
    if (!user || !user.id) {
      return res.status(401).json({ 
        error: "Unauthorized", 
        message: "Invalid session." 
      });
    }

    // Check if user has vendor admin or super admin role
    if (!canAccessVendorApiAdmin(user.role)) {
      return res.status(403).json({ 
        error: "Forbidden", 
        message: "You do not have admin access. Contact your administrator." 
      });
    }

    // Super admin can access all vendors (vendorId from query/body/param)
    // Vendor admin can only access their own vendor
    if (user.role === 'super_admin') {
      req.isSuperAdmin = true;
      // Super admin can target a specific vendor via query, body, or params
      const targetVendorId = parseInt(req.query.vendorId || req.body?.vendorId || req.params?.vendorId);
      if (targetVendorId && !isNaN(targetVendorId)) {
        req.vendorId = targetVendorId;
      } else {
        // For routes that need a vendorId, super admin must provide one
        req.vendorId = null;
      }
    } else {
      if (!user.vendorId) {
        return res.status(403).json({ 
          error: "Forbidden", 
          message: "Vendor admin must be assigned to a vendor." 
        });
      }
      req.vendorId = user.vendorId;
      req.isSuperAdmin = false;
    }
    
    req.userId = user.id;
    req.userRole = user.role;
    next();
  };

  // Helper to get effective vendorId (for routes that require it)
  const getEffectiveVendorId = (req: any, res: any): number | null => {
    if (req.vendorId) return req.vendorId;
    if (req.isSuperAdmin) {
      // Super admin must specify vendorId for vendor-specific routes
      res.status(400).json({ 
        error: "Bad Request", 
        message: "Super admin must specify vendorId in query parameter." 
      });
      return null;
    }
    return req.vendorId;
  };

  // Middleware to require super admin role
  const requireSuperAdmin = async (req: any, res: any, next: any) => {
    await requireVendorAuth(req, res, () => {
      if (!req.isSuperAdmin) {
        return res.status(403).json({ 
          error: "Forbidden", 
          message: "Super admin access required." 
        });
      }
      next();
    });
  };

  // Vendor API management routes (for admin UI)
  app.get("/api/vendor/api-status", requireVendorAuth, async (req: any, res) => {
    try {
      const vendorId = getEffectiveVendorId(req, res);
      if (vendorId === null) return; // Response already sent
      
      const [vendor] = await db
        .select({
          apiAccessEnabled: vendors.apiAccessEnabled,
          apiSubscriptionStart: vendors.apiSubscriptionStart,
          apiSubscriptionEnd: vendors.apiSubscriptionEnd,
          apiMonthlyPrice: vendors.apiMonthlyPrice,
        })
        .from(vendors)
        .where(eq(vendors.id, vendorId))
        .limit(1);
      
      res.json(vendor || {
        apiAccessEnabled: false,
        apiSubscriptionStart: null,
        apiSubscriptionEnd: null,
        apiMonthlyPrice: "99.00",
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/vendor/api-keys", requireVendorAuth, async (req: any, res) => {
    try {
      const vendorId = getEffectiveVendorId(req, res);
      if (vendorId === null) return;
      
      const keys = await db
        .select()
        .from(apiKeys)
        .where(and(eq(apiKeys.vendorId, vendorId), isNull(apiKeys.revokedAt)));
      res.json(keys);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/vendor/api-keys", requireVendorAuth, async (req: any, res) => {
    try {
      const vendorId = getEffectiveVendorId(req, res);
      if (vendorId === null) return;
      
      const { name, permissions } = req.body;
      
      if (!name) {
        return res.status(400).json({ error: "Name is required" });
      }
      
      const { key, prefix, hash } = generateApiKey();
      
      await db.insert(apiKeys).values({
        vendorId,
        name,
        keyPrefix: prefix,
        keyHash: hash,
        permissions: permissions || ["read:time_entries"],
        rateLimit: 60,
        isActive: true,
      });
      
      res.json({ key, prefix });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/vendor/api-keys/:id", requireVendorAuth, async (req: any, res) => {
    try {
      const vendorId = getEffectiveVendorId(req, res);
      if (vendorId === null) return;
      
      const keyId = parseInt(req.params.id);
      
      // Verify the key belongs to this vendor before deleting (or super admin can delete any)
      const [existingKey] = await db
        .select()
        .from(apiKeys)
        .where(and(eq(apiKeys.id, keyId), eq(apiKeys.vendorId, vendorId)))
        .limit(1);
      
      if (!existingKey) {
        return res.status(404).json({ error: "API key not found" });
      }
      
      await db
        .update(apiKeys)
        .set({ isActive: false, revokedAt: new Date() })
        .where(eq(apiKeys.id, keyId));
      
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/vendor/enable-api", requireVendorAuth, async (req: any, res) => {
    try {
      const vendorId = getEffectiveVendorId(req, res);
      if (vendorId === null) return;
      
      const now = new Date();
      const oneYearFromNow = new Date();
      oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
      
      await db
        .update(vendors)
        .set({
          apiAccessEnabled: true,
          apiSubscriptionStart: now,
          apiSubscriptionEnd: oneYearFromNow,
        })
        .where(eq(vendors.id, vendorId));
      
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Access request routes (public - for new user registration and demo requests)
  app.post("/api/access-requests", publicWriteRateLimit, async (req, res) => {
    try {
      // Spam protection: honeypot check
      if (req.body._honeypot && req.body._honeypot.length > 0) {
        return res.json({ success: true, id: 0 }); // Fool bots
      }

      // Spam protection: time-based (min 3 seconds to fill form)
      const now = Date.now();
      const submissionTime = parseInt(req.body._timestamp) || 0;
      if (submissionTime && (now - submissionTime) < 3000) {
        return res.json({ success: true, id: 0 });
      }

      const parsed = insertAccessRequestSchema.safeParse({
        fullName: req.body.full_name,
        email: req.body.email,
        orgNumber: req.body.org_number,
        company: req.body.company,
        phone: req.body.phone,
        message: req.body.message,
        brregVerified: req.body.brreg_verified,
        institutionType: req.body.institution_type,
      });

      if (!parsed.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: parsed.error.flatten().fieldErrors 
        });
      }

      const [existing] = await db
        .select()
        .from(accessRequests)
        .where(and(
          eq(accessRequests.email, parsed.data.email),
          eq(accessRequests.status, "pending")
        ))
        .limit(1);

      if (existing) {
        return res.status(400).json({ 
          error: "Du har allerede en aktiv foresporsel. Vent pa godkjenning." 
        });
      }

      const [request] = await db
        .insert(accessRequests)
        .values(parsed.data)
        .returning();

      res.status(201).json({ success: true, id: request.id });
    } catch (error: any) {
      console.error("Access request error:", error);
      res.status(500).json({ error: "Kunne ikke sende foresporsel" });
    }
  });

  // Access request management (super admin only)
  app.get("/api/access-requests", requireSuperAdmin, async (req: any, res) => {
    try {
      const status = req.query.status || "pending";
      
      const requests = await db
        .select()
        .from(accessRequests)
        .where(eq(accessRequests.status, status as string))
        .orderBy(desc(accessRequests.createdAt));

      res.json(requests);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/access-requests/:id", requireSuperAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { status, vendorId } = req.body;
      const userId = req.user?.id;

      if (!["approved", "rejected"].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      const [request] = await db
        .select()
        .from(accessRequests)
        .where(eq(accessRequests.id, parseInt(id)))
        .limit(1);

      if (!request) {
        return res.status(404).json({ error: "Request not found" });
      }

      const updateData: any = {
        status,
        reviewedBy: userId,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      };

      if (status === "approved" && vendorId) {
        updateData.vendorId = vendorId;
      }

      const [updated] = await db
        .update(accessRequests)
        .set(updateData)
        .where(eq(accessRequests.id, parseInt(id)))
        .returning();

      // Send email notification to applicant
      if (request.email) {
        try {
          if (status === "approved") {
            await emailService.sendAccessApprovedEmail(
              request.email,
              request.fullName,
              request.company || undefined
            );
            console.log(`✅ Access approved email sent to ${request.email}`);
          } else if (status === "rejected") {
            await emailService.sendAccessRejectedEmail(
              request.email,
              request.fullName
            );
            console.log(`✅ Access rejected email sent to ${request.email}`);
          }
        } catch (emailErr) {
          console.error('⚠️ Failed to send access notification email:', emailErr);
          // Don't fail the request — the status update already succeeded
        }
      }

      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
  
  app.get("/api/github/repos", async (_req, res) => {
    try {
      const octokit = await getUncachableGitHubClient();
      const { data } = await octokit.repos.listForAuthenticatedUser({
        sort: 'updated',
        per_page: 100
      });
      res.json(data.map(r => ({ name: r.name, full_name: r.full_name, description: r.description, html_url: r.html_url })));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/stats", isAuthenticated, apiRateLimit, async (req, res) => {
    try {
      const { range } = req.query;
      const cacheKey = `stats:${range || 'default'}`;
      const cached = cache.get<object>(cacheKey);
      if (cached) {
        res.setHeader("Cache-Control", "private, max-age=30");
        return res.json(cached);
      }
      const stats = await storage.getStats(range as string);
      cache.set(cacheKey, stats, 30_000);
      res.setHeader("Cache-Control", "private, max-age=30");
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/users", isAuthenticated, requireAdminRole, async (_req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users.map(u => ({ ...u, password: undefined })));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/users/:id", isAuthenticated, async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) return res.status(404).json({ error: "User not found" });
      res.json({ ...user, password: undefined });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/users/:id", isAuthenticated, async (req, res) => {
    try {
      // If changing role, require admin privileges
      if (req.body.role) {
        const callerRole = normalizeRole((req.user as any)?.role || '');
        if (!ADMIN_ROLES.includes(callerRole)) {
          return res.status(403).json({ error: 'Kun admin kan endre brukerroller' });
        }
        // Prevent non-super-admins from setting super_admin
        if (normalizeRole(req.body.role) === 'super_admin' && callerRole !== 'super_admin') {
          return res.status(403).json({ error: 'Kun super_admin kan tildele super_admin-rollen' });
        }
      }
      const user = await storage.updateUser(req.params.id, req.body);
      if (!user) return res.status(404).json({ error: "User not found" });
      cache.del("userMap"); // invalidate enrichment cache
      res.json({ ...user, password: undefined });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /* ─── Profile: current user's own settings ─── */

  const profileUpdateSchema = z.object({
    firstName: z.string().min(1).max(100).optional(),
    lastName: z.string().max(100).optional(),
    phone: z.string().max(32).optional(),
    language: z.enum(["no", "en"]).optional(),
    notificationEmail: z.boolean().optional(),
    notificationPush: z.boolean().optional(),
    notificationWeekly: z.boolean().optional(),
  });

  app.get("/api/profile", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as { id: string }).id;
      const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (row) return res.json(row);
      // Fall back to session data with defaults if row not yet in DB
      const sessionUser = req.user as { id: string; email: string; name: string; role: string; vendorId: number | null };
      res.json({
        id: sessionUser.id,
        email: sessionUser.email,
        firstName: sessionUser.name?.split(" ")[0] ?? null,
        lastName: sessionUser.name?.split(" ").slice(1).join(" ") || null,
        profileImageUrl: null,
        role: sessionUser.role,
        vendorId: sessionUser.vendorId,
        createdAt: null,
        updatedAt: null,
        phone: null,
        language: "no",
        notificationEmail: true,
        notificationPush: false,
        notificationWeekly: true,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/profile", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as { id: string }).id;
      const parsed = profileUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors });
      }
      const updates = parsed.data;
      // Upsert: try update first, then insert if no row exists
      const result = await db
        .update(users)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(users.id, userId))
        .returning();
      if (result[0]) return res.json(result[0]);
      // User not in DB yet (dev mode / new OAuth user) — raw upsert because
      // username/password are NOT NULL with no defaults in this table.
      const sessionUser = req.user as { email: string; name: string; role: string; vendorId: number | null };
      const fn = updates.firstName ?? sessionUser.name?.split(" ")[0] ?? null;
      const ln = (updates.lastName ?? sessionUser.name?.split(" ").slice(1).join(" ")) || null;
      const ph = updates.phone ?? null;
      const lang = updates.language ?? "no";
      const ne = updates.notificationEmail ?? true;
      const np = updates.notificationPush ?? false;
      const nw = updates.notificationWeekly ?? true;
      const role = sessionUser.role ?? "user";
      const vid = sessionUser.vendorId ?? null;
      await db.execute(sql`
        INSERT INTO users
          (id, email, username, password, first_name, last_name, role, vendor_id,
           phone, language, notification_email, notification_push, notification_weekly)
        VALUES
          (${userId}, ${sessionUser.email}, ${userId}, '', ${fn}, ${ln}, ${role}, ${vid},
           ${ph}, ${lang}, ${ne}, ${np}, ${nw})
        ON CONFLICT (id) DO UPDATE SET
          first_name         = EXCLUDED.first_name,
          last_name          = EXCLUDED.last_name,
          phone              = EXCLUDED.phone,
          language           = EXCLUDED.language,
          notification_email = EXCLUDED.notification_email,
          notification_push  = EXCLUDED.notification_push,
          notification_weekly= EXCLUDED.notification_weekly,
          updated_at         = NOW()
      `);
      // Re-fetch via Drizzle so the response is camelCase-mapped uniformly
      const [upserted] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      res.json(upserted);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/suggestion-settings", isAuthenticated, async (req, res) => {
    try {
      const authUserId = String((req.user as any)?.id || "").trim();
      if (!authUserId) return res.status(401).json({ error: "Unauthorized" });

      const settings = await resolveSuggestionSettingsForUser({
        userId: authUserId,
        role: (req.user as any)?.role,
      });
      res.json(settings);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/suggestion-settings", isAuthenticated, async (req, res) => {
    try {
      const authUserId = String((req.user as any)?.id || "").trim();
      if (!authUserId) return res.status(401).json({ error: "Unauthorized" });

      const parsed = suggestionSettingsPatchSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: parsed.error.flatten(),
        });
      }

      const saved = await storage.updateUserSuggestionSettings(authUserId, {
        ...parsed.data,
        userOverride: true,
      });
      const settings = await resolveSuggestionSettingsForUser({
        userId: authUserId,
        role: (req.user as any)?.role,
        settingsOverride: saved,
      });
      res.json(settings);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/suggestion-settings/reset", isAuthenticated, async (req, res) => {
    try {
      const authUserId = String((req.user as any)?.id || "").trim();
      if (!authUserId) return res.status(401).json({ error: "Unauthorized" });

      const saved = await storage.updateUserSuggestionSettings(authUserId, {
        userOverride: false,
      });
      const settings = await resolveSuggestionSettingsForUser({
        userId: authUserId,
        role: (req.user as any)?.role,
        settingsOverride: saved,
      });
      res.json(settings);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/suggestion-settings/blocks", isAuthenticated, async (req, res) => {
    try {
      const authUserId = String((req.user as any)?.id || "").trim();
      if (!authUserId) return res.status(401).json({ error: "Unauthorized" });

      const parsed = suggestionBlockSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: parsed.error.flatten(),
        });
      }

      const saved = await storage.addUserSuggestionBlock(authUserId, parsed.data);
      const settings = await resolveSuggestionSettingsForUser({
        userId: authUserId,
        role: (req.user as any)?.role,
        settingsOverride: saved,
      });
      res.json(settings);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/suggestion-settings/blocks", isAuthenticated, async (req, res) => {
    try {
      const authUserId = String((req.user as any)?.id || "").trim();
      if (!authUserId) return res.status(401).json({ error: "Unauthorized" });

      const parsed = suggestionBlockSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: parsed.error.flatten(),
        });
      }

      const saved = await storage.removeUserSuggestionBlock(authUserId, parsed.data);
      const settings = await resolveSuggestionSettingsForUser({
        userId: authUserId,
        role: (req.user as any)?.role,
        settingsOverride: saved,
      });
      res.json(settings);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/suggestion-team-defaults", isAuthenticated, async (req, res) => {
    try {
      const userRole = (req.user as any)?.role;
      if (!canManageUsers(userRole)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const defaults = await readSuggestionTeamDefaults();
      res.json({ defaults });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/suggestion-team-defaults", isAuthenticated, async (req, res) => {
    try {
      const userRole = (req.user as any)?.role;
      if (!canManageUsers(userRole)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const parsed = suggestionTeamDefaultUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: parsed.error.flatten(),
        });
      }

      const defaults = await readSuggestionTeamDefaults();
      const roleKey = parsed.data.role === "default"
        ? "default"
        : normalizeRole(parsed.data.role);
      defaults[roleKey] = parsed.data.preset;
      await writeSuggestionTeamDefaults(defaults);
      res.json({ defaults });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/time-tracking/work-types", isAuthenticated, async (req, res) => {
    try {
      const normalizedRole = normalizeRole((req.user as any)?.role);
      const config = await readTimeTrackingWorkTypeConfig();
      const workTypes = resolveTimeTrackingWorkTypesForRole(config, normalizedRole);
      const timeTrackingEnabled = normalizedRole !== "tiltaksleder";

      res.json({
        role: normalizedRole,
        timeTrackingEnabled,
        workTypes,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/time-tracking/work-types/admin", isAuthenticated, async (req, res) => {
    try {
      const userRole = (req.user as any)?.role;
      if (!isTopAdminRole(userRole)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const config = await readTimeTrackingWorkTypeConfig();
      res.json({ config });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/time-tracking/work-types/admin", isAuthenticated, async (req, res) => {
    try {
      const userRole = (req.user as any)?.role;
      if (!isTopAdminRole(userRole)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const parsed = timeTrackingWorkTypesPatchSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: parsed.error.flatten(),
        });
      }

      const roleKey = parsed.data.role === "default"
        ? "default"
        : normalizeRole(parsed.data.role);
      if (roleKey === "tiltaksleder") {
        return res.status(400).json({
          error: "Tiltaksleder bruker ikke timeføring. Rollelisten kan ikke redigeres.",
        });
      }

      const config = await readTimeTrackingWorkTypeConfig();
      config[roleKey] = normalizeTimeTrackingWorkTypeList(parsed.data.workTypes);
      await writeTimeTrackingWorkTypeConfig(config);

      res.json({
        role: roleKey,
        workTypes: config[roleKey],
        config,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/time-tracking/pdf-template", isAuthenticated, async (req, res) => {
    try {
      const userRole = (req.user as any)?.role;
      const vendorIdRaw = Number((req.user as any)?.vendorId);
      const vendorId = Number.isFinite(vendorIdRaw) && vendorIdRaw > 0 ? vendorIdRaw : null;
      const template = await readTimeTrackingPdfTemplate(vendorId);

      res.json({
        template,
        canEdit: canEditTimeTrackingPdfTemplate(userRole),
        scope: vendorId ? "vendor" : "global",
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/time-tracking/pdf-template", isAuthenticated, async (req, res) => {
    try {
      const userRole = (req.user as any)?.role;
      if (!canEditTimeTrackingPdfTemplate(userRole)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const parsed = timeTrackingPdfTemplatePatchSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: parsed.error.flatten(),
        });
      }

      const vendorIdRaw = Number((req.user as any)?.vendorId);
      const vendorId = Number.isFinite(vendorIdRaw) && vendorIdRaw > 0 ? vendorIdRaw : null;
      const current = await readTimeTrackingPdfTemplate(vendorId);

      const mergedInput = {
        ...current,
        ...parsed.data,
        ...(parsed.data.caseDetails !== undefined
          ? {
            caseDetails: normalizeTimeTrackingPdfCaseDetails({
              ...current.caseDetails,
              ...parsed.data.caseDetails,
            }),
          }
          : {}),
        ...(parsed.data.caseDetailsTitle !== undefined
          ? { caseDetailsTitle: parsed.data.caseDetailsTitle === null ? "" : parsed.data.caseDetailsTitle }
          : {}),
        ...(parsed.data.subtitle !== undefined
          ? { subtitle: parsed.data.subtitle === null ? "" : parsed.data.subtitle }
          : {}),
        ...(parsed.data.logoUrl !== undefined
          ? { logoUrl: parsed.data.logoUrl === null ? null : parsed.data.logoUrl }
          : {}),
        ...(parsed.data.contactTitle !== undefined
          ? { contactTitle: parsed.data.contactTitle === null ? "" : parsed.data.contactTitle }
          : {}),
      };

      const merged = normalizeTimeTrackingPdfTemplate(mergedInput);

      await writeTimeTrackingPdfTemplate(vendorId, merged);

      res.json({
        template: merged,
        scope: vendorId ? "vendor" : "global",
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/suggestions/metrics", isAuthenticated, async (req, res) => {
    try {
      const authUserId = String((req.user as any)?.id || "").trim();
      if (!authUserId) return res.status(401).json({ error: "Unauthorized" });

      const [timePrefs, casePrefs] = await Promise.all([
        storage.getUserTimeTrackingPrefs(authUserId),
        storage.getUserCaseReportingPrefs(authUserId),
      ]);

      const accepted = (timePrefs.totalAccepted || 0) + (casePrefs.totalAccepted || 0);
      const rejected = (timePrefs.totalRejected || 0) + (casePrefs.totalRejected || 0);
      const totalFeedback = accepted + rejected;
      const acceptanceRate = totalFeedback > 0 ? accepted / totalFeedback : null;
      const overrideRate = totalFeedback > 0 ? rejected / totalFeedback : null;

      const timeSavedMinutes = estimateTimeSavedMinutesFromFeedback(timePrefs.feedbackByType || {})
        + estimateTimeSavedMinutesFromFeedback(casePrefs.feedbackByType || {});

      const preventedMisentries =
        Number(timePrefs.feedbackByType?.project?.rejected || 0)
        + Number(timePrefs.feedbackByType?.hours?.rejected || 0)
        + Number(casePrefs.feedbackByType?.case_id?.rejected || 0);

      const sevenDaysAgoMs = Date.now() - (7 * 24 * 60 * 60 * 1000);
      const recentTimeFeedback = (timePrefs.recentFeedback || []).filter((entry) => {
        const ts = Date.parse(entry.timestamp);
        return Number.isFinite(ts) && ts >= sevenDaysAgoMs;
      });
      const recentCaseFeedback = (casePrefs.recentFeedback || []).filter((entry) => {
        const ts = Date.parse(entry.timestamp);
        return Number.isFinite(ts) && ts >= sevenDaysAgoMs;
      });
      const periodAccepted = recentTimeFeedback.filter((entry) => entry.outcome === "accepted").length
        + recentCaseFeedback.filter((entry) => entry.outcome === "accepted").length;
      const periodRejected = recentTimeFeedback.filter((entry) => entry.outcome === "rejected").length
        + recentCaseFeedback.filter((entry) => entry.outcome === "rejected").length;
      const periodTotal = periodAccepted + periodRejected;

      res.json({
        totalFeedback,
        accepted,
        rejected,
        acceptanceRate,
        overrideRate,
        estimatedTimeSavedMinutes: timeSavedMinutes,
        preventedMisentries,
        period7d: {
          totalFeedback: periodTotal,
          accepted: periodAccepted,
          rejected: periodRejected,
          acceptanceRate: periodTotal > 0 ? periodAccepted / periodTotal : null,
        },
        bySurface: {
          timeTracking: {
            accepted: timePrefs.totalAccepted || 0,
            rejected: timePrefs.totalRejected || 0,
          },
          caseReporting: {
            accepted: casePrefs.totalAccepted || 0,
            rejected: casePrefs.totalRejected || 0,
          },
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/time-entries", isAuthenticated, async (req, res) => {
    try {
      const { userId, startDate, endDate, status } = req.query;
      const entries = await storage.getTimeEntries({
        userId: userId as string,
        startDate: startDate as string,
        endDate: endDate as string,
        status: status as string,
      });
      res.json(entries);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/company/me/assigned-cases", isAuthenticated, async (req, res) => {
    try {
      const authEmail = String((req.user as any)?.email || "").trim().toLowerCase();
      if (!authEmail) {
        return res.json([]);
      }

      const companyIdRaw = Number(req.query.company_id ?? 1);
      const companyId = Number.isFinite(companyIdRaw) && companyIdRaw > 0 ? companyIdRaw : 1;

      const result = await pool.query(
        `SELECT uc.id, uc.case_id, uc.case_title, uc.status, uc.assigned_at
         FROM company_users cu
         JOIN user_cases uc ON uc.company_user_id = cu.id
         WHERE cu.company_id = $1
           AND cu.approved = true
           AND (
             LOWER(cu.user_email) = $2
             OR LOWER(COALESCE(cu.google_email, '')) = $2
           )
           AND COALESCE(uc.status, 'active') <> 'inactive'
         ORDER BY uc.assigned_at DESC NULLS LAST, uc.created_at DESC NULLS LAST, uc.id DESC`,
        [companyId, authEmail],
      );

      res.json(result.rows);
    } catch (error: any) {
      const message = String(error?.message || "");
      if (
        message.includes("relation \"company_users\" does not exist")
        || message.includes("relation \"user_cases\" does not exist")
      ) {
        return res.json([]);
      }
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/time-entries/suggestions", isAuthenticated, async (req, res) => {
    try {
      const authUserId = String((req.user as any)?.id || "").trim();
      if (!authUserId) return res.status(401).json({ error: "Unauthorized" });
      const suggestionSettings = await resolveSuggestionSettingsForUser({
        userId: authUserId,
        role: (req.user as any)?.role,
      });

      const targetDateInput = typeof req.query.date === "string" ? req.query.date : formatDateOnly(new Date());
      const targetDate = parseDateOnly(targetDateInput) || new Date();
      const targetDateStr = formatDateOnly(targetDate);

      const lookbackStart = shiftDays(targetDate, -120);
      const lookbackStartStr = formatDateOnly(lookbackStart);

      const rawEntries = await storage.getTimeEntries({
        userId: authUserId,
        startDate: lookbackStartStr,
        endDate: targetDateStr,
      });

      const usableEntries = rawEntries.filter((entry) => {
        if (entry.caseNumber === "client_sick") return false;
        const parsedDate = parseDateOnly(entry.date);
        if (!parsedDate) return false;
        if (parsedDate.getTime() > targetDate.getTime()) return false;
        return entry.hours >= 0;
      });

      const targetWeekday = targetDate.getDay();
      const weekdayEntries = usableEntries.filter((entry) => {
        const parsedDate = parseDateOnly(entry.date);
        return parsedDate ? parsedDate.getDay() === targetWeekday : false;
      });

      const projectCandidateEntries = weekdayEntries.filter((entry) => !!entry.caseNumber);
      const projectSource = projectCandidateEntries.length >= 3
        ? projectCandidateEntries
        : usableEntries.filter((entry) => !!entry.caseNumber);
      const projectMode = modeWithCount(projectSource.map((entry) => String(entry.caseNumber)));

      const descriptionCandidateEntries = weekdayEntries.filter((entry) => !!entry.description?.trim());
      const descriptionSource = descriptionCandidateEntries.length >= 3
        ? descriptionCandidateEntries
        : usableEntries.filter((entry) => !!entry.description?.trim());
      const descriptionMode = modeWithCount(descriptionSource.map((entry) => entry.description.trim()));

      const weekdayHours = weekdayEntries.map((entry) => entry.hours).filter((hours) => hours > 0);
      const allHours = usableEntries.map((entry) => entry.hours).filter((hours) => hours > 0);
      const hourSource = weekdayHours.length >= 2 ? weekdayHours : allHours;
      const suggestedHours = hourSource.length
        ? clampNumber(roundToQuarterHour(average(hourSource)), 0.25, 24)
        : null;

      const prevMonthStart = new Date(targetDate.getFullYear(), targetDate.getMonth() - 1, 1);
      const prevMonthPrefix = `${prevMonthStart.getFullYear()}-${String(prevMonthStart.getMonth() + 1).padStart(2, "0")}-`;
      const previousMonthCount = usableEntries.filter((entry) => entry.date.startsWith(prevMonthPrefix)).length;

      const timePrefs = await storage.getUserTimeTrackingPrefs(authUserId);
      const feedbackByType: FeedbackStatsMap = timePrefs.feedbackByType || {};

      const projectBaseConfidence = projectMode.count
        ? clampNumber(0.35 + projectMode.count / 10, 0.2, 0.9)
        : 0.2;
      const descriptionBaseConfidence = descriptionMode.count
        ? clampNumber(0.3 + descriptionMode.count / 10, 0.2, 0.9)
        : 0.2;
      const hoursBaseConfidence = hourSource.length
        ? clampNumber(0.3 + hourSource.length / 12, 0.2, 0.9)
        : 0.2;
      const bulkBaseConfidence = previousMonthCount
        ? clampNumber(0.35 + previousMonthCount / 15, 0.2, 0.9)
        : 0.2;

      const totalFeedback = (timePrefs.totalAccepted || 0) + (timePrefs.totalRejected || 0);
      const acceptanceRate = totalFeedback > 0 ? (timePrefs.totalAccepted || 0) / totalFeedback : null;

      const projectSuggestion = {
        value: projectMode.value,
        confidence: adjustConfidenceByFeedback(projectBaseConfidence, feedbackByType, "project"),
        sampleSize: projectSource.length,
        reason: projectMode.value
          ? `Mest brukt prosjekt i lignende føringer (${projectMode.count} av ${projectSource.length}).`
          : "Ikke nok historikk for prosjektforslag ennå.",
      };
      const descriptionSuggestion = {
        value: descriptionMode.value,
        confidence: adjustConfidenceByFeedback(descriptionBaseConfidence, feedbackByType, "description"),
        sampleSize: descriptionSource.length,
        reason: descriptionMode.value
          ? `Mest brukt beskrivelse i lignende føringer (${descriptionMode.count} av ${descriptionSource.length}).`
          : "Ikke nok historikk for beskrivelsesforslag ennå.",
      };
      const hoursSuggestion = {
        value: suggestedHours,
        confidence: adjustConfidenceByFeedback(hoursBaseConfidence, feedbackByType, "hours"),
        sampleSize: hourSource.length,
        reason: suggestedHours != null
          ? `Gjennomsnitt fra ${hourSource.length} tidligere føringer.`
          : "Ikke nok historikk for timeforslag ennå.",
      };
      const bulkCopySuggestion = {
        value: previousMonthCount > 0,
        confidence: adjustConfidenceByFeedback(bulkBaseConfidence, feedbackByType, "bulk_copy_prev_month"),
        sampleSize: previousMonthCount,
        reason: previousMonthCount > 0
          ? `${previousMonthCount} føringer ble funnet i forrige måned.`
          : "Ingen føringer i forrige måned å kopiere fra.",
      };

      if (projectSuggestion.value && isBlockedSuggestionValue(suggestionSettings.blocked.projects, projectSuggestion.value)) {
        projectSuggestion.value = null;
        projectSuggestion.reason = fallbackSuggestionReason(projectSuggestion.reason, "blocked", suggestionSettings.confidenceThreshold);
      } else if (projectSuggestion.value && projectSuggestion.confidence < suggestionSettings.confidenceThreshold) {
        projectSuggestion.value = null;
        projectSuggestion.reason = fallbackSuggestionReason(projectSuggestion.reason, "threshold", suggestionSettings.confidenceThreshold);
      }

      if (descriptionSuggestion.value && isBlockedSuggestionValue(suggestionSettings.blocked.descriptions, descriptionSuggestion.value)) {
        descriptionSuggestion.value = null;
        descriptionSuggestion.reason = fallbackSuggestionReason(descriptionSuggestion.reason, "blocked", suggestionSettings.confidenceThreshold);
      } else if (descriptionSuggestion.value && descriptionSuggestion.confidence < suggestionSettings.confidenceThreshold) {
        descriptionSuggestion.value = null;
        descriptionSuggestion.reason = fallbackSuggestionReason(descriptionSuggestion.reason, "threshold", suggestionSettings.confidenceThreshold);
      }

      if (hoursSuggestion.value != null && hoursSuggestion.confidence < suggestionSettings.confidenceThreshold) {
        hoursSuggestion.value = null;
        hoursSuggestion.reason = fallbackSuggestionReason(hoursSuggestion.reason, "threshold", suggestionSettings.confidenceThreshold);
      }

      if (bulkCopySuggestion.value && bulkCopySuggestion.confidence < suggestionSettings.confidenceThreshold) {
        bulkCopySuggestion.value = false;
        bulkCopySuggestion.reason = fallbackSuggestionReason(bulkCopySuggestion.reason, "threshold", suggestionSettings.confidenceThreshold);
      }

      if (suggestionSettings.mode === "off") {
        projectSuggestion.value = null;
        descriptionSuggestion.value = null;
        hoursSuggestion.value = null;
        bulkCopySuggestion.value = false;
      }

      res.json({
        date: targetDateStr,
        analyzedEntries: usableEntries.length,
        suggestion: {
          project: projectSuggestion,
          description: descriptionSuggestion,
          hours: hoursSuggestion,
          bulkCopyPrevMonth: bulkCopySuggestion,
        },
        personalization: {
          totalFeedback,
          acceptanceRate,
          feedbackByType,
        },
        policy: {
          mode: suggestionSettings.mode,
          confidenceThreshold: suggestionSettings.confidenceThreshold,
          source: suggestionSettings.rollout.source,
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/time-entries/suggestions/feedback", isAuthenticated, async (req, res) => {
    try {
      const authUserId = String((req.user as any)?.id || "").trim();
      if (!authUserId) return res.status(401).json({ error: "Unauthorized" });

      const parsed = timeSuggestionFeedbackSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: parsed.error.flatten(),
        });
      }

      await storage.recordTimeTrackingFeedback(authUserId, {
        ...parsed.data,
        timestamp: new Date().toISOString(),
      });
      res.status(204).end();
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/case-reports/suggestions", isAuthenticated, async (req, res) => {
    try {
      const authUserId = String((req.user as any)?.id || "").trim();
      if (!authUserId) return res.status(401).json({ error: "Unauthorized" });
      const suggestionSettings = await resolveSuggestionSettingsForUser({
        userId: authUserId,
        role: (req.user as any)?.role,
      });

      const monthInput = typeof req.query.month === "string" ? req.query.month : formatYearMonth(new Date());
      const targetMonthDate = parseYearMonth(monthInput) || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      const targetMonth = formatYearMonth(targetMonthDate);
      const lookbackStart = formatYearMonth(shiftMonths(targetMonthDate, -18));

      const caseIdInputRaw = typeof req.query.caseId === "string" ? req.query.caseId : "";
      const caseIdInput = caseIdInputRaw.trim();

      const rawReportsResult = await pool.query(
        `SELECT
          id,
          case_id,
          month,
          background,
          actions,
          progress,
          challenges,
          factors,
          assessment,
          recommendations,
          notes,
          status,
          created_at,
          updated_at
        FROM case_reports
        WHERE user_id = $1
          AND month >= $2
          AND month <= $3
        ORDER BY month DESC, updated_at DESC, created_at DESC`,
        [authUserId, lookbackStart, targetMonth],
      );

      type ReportRow = {
        id: number;
        case_id: string;
        month: string;
        background?: string | null;
        actions?: string | null;
        progress?: string | null;
        challenges?: string | null;
        factors?: string | null;
        assessment?: string | null;
        recommendations?: string | null;
        notes?: string | null;
        status?: string | null;
      };

      const fieldKeys = [
        "background",
        "actions",
        "progress",
        "challenges",
        "factors",
        "assessment",
        "recommendations",
        "notes",
      ] as const;

      const isMeaningfulText = (value: unknown) => {
        if (typeof value !== "string") return false;
        return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().length > 0;
      };

      const reports = (rawReportsResult.rows as ReportRow[]).filter((report) => {
        if (!report?.case_id || typeof report.case_id !== "string") return false;
        if (!report?.month || !YEAR_MONTH_REGEX.test(report.month)) return false;
        return true;
      });

      const caseCounts = new Map<string, number>();
      reports.forEach((report) => {
        caseCounts.set(report.case_id, (caseCounts.get(report.case_id) || 0) + 1);
      });
      let suggestedCaseId: string | null = null;
      let suggestedCaseIdCount = 0;
      caseCounts.forEach((count, caseId) => {
        if (count > suggestedCaseIdCount) {
          suggestedCaseId = caseId;
          suggestedCaseIdCount = count;
        }
      });

      const preferredCaseId = caseIdInput || suggestedCaseId || null;
      const sameCaseReports = preferredCaseId
        ? reports.filter((report) => report.case_id === preferredCaseId)
        : [];
      const fieldSource = sameCaseReports.length > 0 ? sameCaseReports : reports;

      const previousMonth = formatYearMonth(shiftMonths(targetMonthDate, -1));
      const previousMonthCandidates = reports.filter((report) => {
        if (report.month !== previousMonth) return false;
        if (preferredCaseId && report.case_id !== preferredCaseId) return false;
        return true;
      });
      const previousMonthReport = previousMonthCandidates[0] || null;

      const casePrefs = await storage.getUserCaseReportingPrefs(authUserId);
      const feedbackByType = casePrefs.feedbackByType || {};
      const totalFeedback = (casePrefs.totalAccepted || 0) + (casePrefs.totalRejected || 0);
      const acceptanceRate = totalFeedback > 0 ? (casePrefs.totalAccepted || 0) / totalFeedback : null;

      const caseBaseConfidence = preferredCaseId
        ? clampNumber(0.4 + Math.min((caseCounts.get(preferredCaseId) || 0), 10) / 14, 0.25, 0.92)
        : 0.2;

      const caseSuggestion = {
        value: preferredCaseId,
        confidence: adjustConfidenceByFeedback(caseBaseConfidence, feedbackByType, "case_id"),
        sampleSize: preferredCaseId ? (caseCounts.get(preferredCaseId) || 0) : 0,
        reason: preferredCaseId
          ? `Mest brukte sak i tidligere rapporter (${caseCounts.get(preferredCaseId) || 0} treff).`
          : "Ingen historikk for saksforslag ennå.",
      };

      const templateSourceSize = sameCaseReports.length > 0 ? sameCaseReports.length : reports.length;
      let templateLabel = previousMonthReport
        ? "Forrige måned (samme sak)"
        : sameCaseReports.length > 0
          ? "Siste rapport for samme sak"
          : reports.length > 0
            ? "Siste rapport"
            : null;
      const templateBaseConfidence = templateLabel
        ? clampNumber(0.35 + Math.min(templateSourceSize, 10) / 14, 0.2, 0.9)
        : 0.2;
      const templateConfidence = adjustConfidenceByFeedback(templateBaseConfidence, feedbackByType, "template");

      const fieldsSuggestion = fieldKeys.reduce<Record<string, {
        value: string | null;
        confidence: number;
        sampleSize: number;
        reason: string;
      }>>((acc, fieldKey) => {
        const candidates = fieldSource.filter((report) => isMeaningfulText(report[fieldKey]));
        const latest = candidates[0];
        const value = latest ? String(latest[fieldKey]) : null;

        const baseConfidence = value
          ? preferredCaseId
            ? clampNumber(0.42 + Math.min(candidates.length, 10) / 14, 0.25, 0.92)
            : clampNumber(0.32 + Math.min(candidates.length, 10) / 18, 0.2, 0.88)
          : 0.2;

        acc[fieldKey] = {
          value,
          confidence: adjustConfidenceByFeedback(baseConfidence, feedbackByType, `field_${fieldKey}`),
          sampleSize: candidates.length,
          reason: value
            ? preferredCaseId
              ? `Hentet fra ${candidates.length} rapport(er) på samme sak.`
              : `Hentet fra ${candidates.length} tidligere rapport(er).`
            : "Ingen forslag tilgjengelig ennå.",
        };
        return acc;
      }, {});

      const copyPrevBaseConfidence = previousMonthReport
        ? clampNumber(0.45 + Math.min(previousMonthCandidates.length, 4) / 8, 0.25, 0.95)
        : 0.2;

      if (caseSuggestion.value && isBlockedSuggestionValue(suggestionSettings.blocked.caseIds, caseSuggestion.value)) {
        caseSuggestion.value = null;
        caseSuggestion.reason = fallbackSuggestionReason(caseSuggestion.reason, "blocked", suggestionSettings.confidenceThreshold);
      } else if (caseSuggestion.value && caseSuggestion.confidence < suggestionSettings.confidenceThreshold) {
        caseSuggestion.value = null;
        caseSuggestion.reason = fallbackSuggestionReason(caseSuggestion.reason, "threshold", suggestionSettings.confidenceThreshold);
      }

      let templateReason = templateLabel
        ? `Basert på ${templateSourceSize} relevant(e) rapport(er).`
        : "Ingen historikk for malforslag ennå.";

      if (templateLabel && templateConfidence < suggestionSettings.confidenceThreshold) {
        // template value is label-only metadata; hide when confidence is too low
        templateReason = fallbackSuggestionReason(templateReason, "threshold", suggestionSettings.confidenceThreshold);
        templateLabel = null;
      }

      Object.values(fieldsSuggestion).forEach((fieldSuggestion) => {
        if (!fieldSuggestion.value) return;
        if (fieldSuggestion.confidence < suggestionSettings.confidenceThreshold) {
          fieldSuggestion.value = null;
          fieldSuggestion.reason = fallbackSuggestionReason(fieldSuggestion.reason, "threshold", suggestionSettings.confidenceThreshold);
        }
      });

      let copyPreviousMonthValue = !!previousMonthReport;
      let copyPreviousMonthReason = previousMonthReport
        ? `Fant rapport fra ${previousMonth} som kan gjenbrukes.`
        : "Ingen rapport i forrige måned å kopiere fra.";
      const copyPreviousMonthConfidence = adjustConfidenceByFeedback(copyPrevBaseConfidence, feedbackByType, "copy_previous_month");
      if (copyPreviousMonthValue && copyPreviousMonthConfidence < suggestionSettings.confidenceThreshold) {
        copyPreviousMonthValue = false;
        copyPreviousMonthReason = fallbackSuggestionReason(copyPreviousMonthReason, "threshold", suggestionSettings.confidenceThreshold);
      }

      if (suggestionSettings.mode === "off") {
        caseSuggestion.value = null;
        templateLabel = null;
        templateReason = "Forslag er skrudd av.";
        copyPreviousMonthValue = false;
        Object.values(fieldsSuggestion).forEach((fieldSuggestion) => {
          fieldSuggestion.value = null;
        });
      }

      res.json({
        month: targetMonth,
        analyzedReports: reports.length,
        suggestion: {
          caseId: caseSuggestion,
          template: {
            value: templateLabel,
            confidence: templateConfidence,
            sampleSize: templateSourceSize,
            reason: templateReason,
          },
          copyPreviousMonth: {
            value: copyPreviousMonthValue,
            confidence: copyPreviousMonthConfidence,
            sampleSize: previousMonthCandidates.length,
            reason: copyPreviousMonthReason,
          },
          fields: fieldsSuggestion,
        },
        previousMonthReport: previousMonthReport
          ? {
              id: previousMonthReport.id,
              caseId: previousMonthReport.case_id,
              month: previousMonthReport.month,
              fields: fieldKeys.reduce<Record<string, string | null>>((acc, fieldKey) => {
                acc[fieldKey] = previousMonthReport[fieldKey] ?? null;
                return acc;
              }, {}),
            }
          : null,
        personalization: {
          totalFeedback,
          acceptanceRate,
          feedbackByType,
        },
        policy: {
          mode: suggestionSettings.mode,
          confidenceThreshold: suggestionSettings.confidenceThreshold,
          source: suggestionSettings.rollout.source,
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/case-reports/suggestions/feedback", isAuthenticated, async (req, res) => {
    try {
      const authUserId = String((req.user as any)?.id || "").trim();
      if (!authUserId) return res.status(401).json({ error: "Unauthorized" });

      const parsed = caseReportSuggestionFeedbackSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: parsed.error.flatten(),
        });
      }

      await storage.recordCaseReportingFeedback(authUserId, {
        ...parsed.data,
        timestamp: new Date().toISOString(),
      });

      res.status(204).end();
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/time-entries", isAuthenticated, async (req, res) => {
    try {
      const { caseNumber, description, hours, date, status, createdAt } = req.body;
      const userId = (req.user as any)?.id as string;
      const entry = await storage.createTimeEntry({
        userId,
        caseNumber,
        description,
        hours,
        date,
        status: status || 'pending',
        createdAt: createdAt || new Date().toISOString(),
      });
      await storage.createActivity({
        userId,
        action: "time_logged",
        description: `Registrerte ${hours} timer: ${description}`,
        timestamp: new Date().toISOString(),
      });
      // Invalidate aggregation caches after new time data
      cache.delByPrefix("stats:");
      cache.del("chart-data");
      res.status(201).json(entry);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/time-entries/:id", isAuthenticated, async (req, res) => {
    try {
      const entry = await storage.updateTimeEntry(req.params.id, req.body);
      if (!entry) return res.status(404).json({ error: "Entry not found" });
      res.json(entry);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/time-entries/:id", isAuthenticated, async (req, res) => {
    try {
      const deleted = await storage.deleteTimeEntry(req.params.id);
      if (!deleted) return res.status(404).json({ error: "Entry not found" });
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/timer-session", isAuthenticated, async (req, res) => {
    try {
      const userId = String((req.user as any)?.id || "").trim();
      if (!userId) return res.status(400).json({ error: "userId is required" });
      const session = await storage.getTimerSession(userId);
      res.json(session || null);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/timer-session", isAuthenticated, async (req, res) => {
    try {
      const parsed = timerSessionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
      }

      const payload = parsed.data;
      const userId = (req.user as any)?.id as string;
      const session = await storage.upsertTimerSession({
        userId,
        elapsedSeconds: payload.elapsedSeconds,
        pausedSeconds: payload.pausedSeconds,
        isRunning: payload.isRunning,
        pauseStartedAt: payload.pauseStartedAt ? new Date(payload.pauseStartedAt) : null,
      });

      res.json(session);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/timer-session/:userId", isAuthenticated, async (req, res) => {
    try {
      const userId = String((req.user as any)?.id || "").trim();
      if (!userId) return res.status(400).json({ error: "userId is required" });
      await storage.deleteTimerSession(userId);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Bulk create time entries for a month
  app.post("/api/time-entries/bulk", isAuthenticated, async (req, res) => {
    try {
      // Validate request with Zod schema
      const parseResult = bulkRequestSchema.safeParse(req.body);
      
      if (!parseResult.success) {
        const errors = parseResult.error.errors.map(e => 
          `${e.path.join('.')}: ${e.message}`
        );
        return res.status(400).json({ 
          error: "Validation failed", 
          details: errors 
        });
      }

      const { entries, overwrite } = parseResult.data;
      const userId = (req.user as any)?.id as string;

      const results = {
        created: 0,
        skipped: 0,
        overwritten: 0,
        processedDates: [] as string[],
      };

      // ── Batch pre-fetch to avoid N+1 queries ──────────────────────────────
      const dates = entries.map(e => e.date);
      const minDate = dates.reduce((a, b) => (a < b ? a : b));
      const maxDate = dates.reduce((a, b) => (a > b ? a : b));
      const existingInRange = await storage.getTimeEntries({
        userId,
        startDate: minDate,
        endDate: maxDate,
      });
      // Map date → first matching entry for O(1) lookups inside the loop
      const existingByDate = new Map(existingInRange.map(e => [e.date, e]));

      for (const entry of entries) {
        const { date, hours, description, caseNumber } = entry;
        const existing = existingByDate.get(date);

        if (existing) {
          if (overwrite) {
            await storage.updateTimeEntry(existing.id, {
              description: description.trim(),
              hours,
              caseNumber: caseNumber || null,
              status: 'pending',
            });
            results.overwritten++;
            results.processedDates.push(date);
          } else {
            results.skipped++;
          }
        } else {
          const created = await storage.createTimeEntry({
            userId,
            caseNumber: caseNumber || null,
            description: description.trim(),
            hours,
            date,
            status: 'pending',
            createdAt: new Date().toISOString(),
          });
          // Keep map consistent so duplicate dates in the same batch don't
          // produce two inserts
          existingByDate.set(date, created);
          results.created++;
          results.processedDates.push(date);
        }
      }

      // Log activity
      const totalEntries = results.created + results.overwritten;
      if (totalEntries > 0) {
        await storage.createActivity({
          userId,
          action: "bulk_time_logged",
          description: `Bulk-registrerte ${totalEntries} dager med timer`,
          timestamp: new Date().toISOString(),
        });
        // Invalidate aggregation caches
        cache.delByPrefix("stats:");
        cache.del("chart-data");
      }

      res.status(201).json(results);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Check for existing entries in date range
  app.get("/api/time-entries/check-existing", isAuthenticated, async (req, res) => {
    try {
      const { userId, startDate, endDate } = req.query;
      
      if (!userId || !startDate || !endDate) {
        return res.status(400).json({ error: "userId, startDate, and endDate required" });
      }

      const entries = await storage.getTimeEntries({
        userId: userId as string,
        startDate: startDate as string,
        endDate: endDate as string,
      });

      const existingDates = entries.map(e => e.date);
      res.json({ existingDates });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // Dashboard tasks
  // ─────────────────────────────────────────────────────────────
  app.get("/api/tasks", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const tasks = await storage.getDashboardTasks(userId);
      res.json(tasks);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/tasks", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const { title, linkedUrl, linkedLabel } = req.body;
      if (!title || typeof title !== "string" || !title.trim()) {
        return res.status(400).json({ error: "title is required" });
      }
      const task = await storage.createDashboardTask(userId, title.trim(), linkedUrl, linkedLabel);
      res.status(201).json(task);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/tasks/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const id = parseInt(req.params.id);
      const { title, done, linkedUrl, linkedLabel, snoozedUntil } = req.body;
      const updated = await storage.updateDashboardTask(id, userId, { title, done, linkedUrl, linkedLabel, snoozedUntil });
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/tasks/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const id = parseInt(req.params.id);
      const ok = await storage.deleteDashboardTask(id, userId);
      if (!ok) return res.status(404).json({ error: "Not found" });
      res.status(204).end();
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Task learning preferences ──
  app.get("/api/task-prefs", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const prefs = await storage.getUserTaskPrefs(userId);
      res.json(prefs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/task-prefs/event", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      await storage.recordTaskEvent(userId, req.body);
      res.status(204).end();
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/activities", isAuthenticated, apiRateLimit, async (req, res) => {
    try {
      const startDate = req.query.startDate as string | undefined;
      const endDate = req.query.endDate as string | undefined;
      const requestedLimit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const effectiveLimit = requestedLimit ?? (startDate || endDate ? 1000 : 50);

      let activities = await storage.getActivities(effectiveLimit);

      if (startDate || endDate) {
        activities = activities.filter((activity) => {
          const parsed = new Date(activity.timestamp);
          if (Number.isNaN(parsed.getTime())) return false;
          const activityDate = parsed.toISOString().split("T")[0];
          if (startDate && activityDate < startDate) return false;
          if (endDate && activityDate > endDate) return false;
          return true;
        });
      }

      // Cache the user-name map for 60 s to avoid getAllUsers() on every hit
      let userMap = cache.get<Map<string, { name: string; department?: string | null }>>("userMap");
      if (!userMap) {
        const users = await storage.getAllUsers();
        userMap = new Map(users.map(u => [u.id, u]));
        cache.set("userMap", userMap, 60_000);
      }

      const enriched = activities.map(a => ({
        ...a,
        userName: userMap!.get(a.userId)?.name || "Ukjent bruker",
      }));
      res.json(enriched);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/reports", isAuthenticated, apiRateLimit, async (req, res) => {
    try {
      const { startDate, endDate, userId, status } = req.query;
      const entries = await storage.getTimeEntries({
        userId: userId as string,
        startDate: startDate as string,
        endDate: endDate as string,
        status: status as string,
      });

      // Reuse cached user-map (shared with /api/activities)
      let userMap = cache.get<Map<string, { name: string; department?: string | null }>>("userMap");
      if (!userMap) {
        const users = await storage.getAllUsers();
        userMap = new Map(users.map(u => [u.id, u]));
        cache.set("userMap", userMap, 60_000);
      }

      const reports = entries.map(e => ({
        ...e,
        userName: userMap!.get(e.userId)?.name || "Ukjent",
        department: (userMap!.get(e.userId) as any)?.department || "-",
      }));

      res.json(reports);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/chart-data", isAuthenticated, apiRateLimit, async (_req, res) => {
    try {
      const cached = cache.get<object>("chart-data");
      if (cached) {
        res.setHeader("Cache-Control", "private, max-age=30");
        return res.json(cached);
      }
      // Limit to last 30 days to avoid a full-table scan on every request
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      const startDate = cutoff.toISOString().split("T")[0];
      const entries = await storage.getTimeEntries({ startDate });
      const users = await storage.getAllUsers();
      
      const dayNames = ["Son", "Man", "Tir", "Ons", "Tor", "Fre", "Lor"];
      const today = new Date();
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay() + 1);
      
      const hoursPerDay = Array(7).fill(0).map((_, i) => {
        const date = new Date(weekStart);
        date.setDate(weekStart.getDate() + i);
        const dateStr = date.toISOString().split('T')[0];
        const dayHours = entries
          .filter(e => e.date === dateStr)
          .reduce((sum, e) => sum + e.hours, 0);
        return { day: dayNames[(i + 1) % 7], hours: dayHours };
      });
      
      const heatmapData = entries.reduce((acc, entry) => {
        const existing = acc.find(d => d.date === entry.date);
        if (existing) {
          existing.hours += entry.hours;
        } else {
          acc.push({ date: entry.date, hours: entry.hours });
        }
        return acc;
      }, [] as { date: string; hours: number }[]);
      
      const payload = { hoursPerDay, heatmapData, totalUsers: users.length };
      cache.set("chart-data", payload, 30_000);
      res.setHeader("Cache-Control", "private, max-age=30");
      res.json(payload);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/reports/export", isAuthenticated, async (req, res) => {
    try {
      const { format, startDate, endDate, userId, status } = req.query;
      const entries = await storage.getTimeEntries({
        userId: userId as string,
        startDate: startDate as string,
        endDate: endDate as string,
        status: status as string,
      });
      const users = await storage.getAllUsers();
      const userMap = new Map(users.map(u => [u.id, u]));
      
      const data = entries.map(e => ({
        Dato: e.date,
        Bruker: userMap.get(e.userId)?.name || "Ukjent",
        Avdeling: userMap.get(e.userId)?.department || "-",
        Saksnummer: e.caseNumber || "-",
        Beskrivelse: e.description,
        Timer: e.hours,
        Status: e.status,
      }));

      if (format === "csv") {
        const headers = Object.keys(data[0] || {}).join(",");
        const rows = data.map(d => Object.values(d).map(v => `"${v}"`).join(",")).join("\n");
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", "attachment; filename=rapport.csv");
        res.send(`\uFEFF${headers}\n${rows}`);
      } else if (format === "excel") {
        const headers = Object.keys(data[0] || {}).join(";");
        const rows = data.map(d => Object.values(d).map(v => `"${v}"`).join(";")).join("\n");
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", "attachment; filename=rapport.xls");
        res.send(`\uFEFF${headers}\n${rows}`);
      } else if (format === "pdf") {
        const totalHours = data.reduce((sum: number, d: any) => sum + (parseFloat(d.Timer) || 0), 0);
        const vendorIdRaw = Number((req.user as any)?.vendorId);
        const vendorId = Number.isFinite(vendorIdRaw) && vendorIdRaw > 0 ? vendorIdRaw : null;
        const template = await readTimeTrackingPdfTemplate(vendorId);
        const generatedDate = new Date().toLocaleDateString("nb-NO");
        const periodValue = endDate
          ? `${String(startDate || "").trim()} - ${String(endDate).trim()}`
          : startDate
            ? `Fra dato: ${String(startDate).trim()}`
            : "Alle registreringer";
        const periodLabel = `Periode: ${periodValue}`;

        const cellPadding = template.density === "compact" ? "6px 8px" : "10px 12px";
        const tableFontSizeDefault = template.density === "compact" ? 11 : 12;
        const tableFontSize = `${normalizeNumericRange(template.tableFontSize, tableFontSizeDefault, 9, 16)}px`;
        const baseFontSize = `${normalizeNumericRange(template.baseFontSize, DEFAULT_TIME_TRACKING_PDF_TEMPLATE.baseFontSize, 10, 16)}px`;
        const titleFontSize = `${normalizeNumericRange(template.titleFontSize, DEFAULT_TIME_TRACKING_PDF_TEMPLATE.titleFontSize, 18, 42)}px`;
        const subtitleFontSize = `${normalizeNumericRange(template.subtitleFontSize, DEFAULT_TIME_TRACKING_PDF_TEMPLATE.subtitleFontSize, 11, 24)}px`;
        const footerFontSize = `${normalizeNumericRange(template.footerFontSize, DEFAULT_TIME_TRACKING_PDF_TEMPLATE.footerFontSize, 9, 14)}px`;
        const metaFontSize = `${Math.max(10, normalizeNumericRange(template.baseFontSize, DEFAULT_TIME_TRACKING_PDF_TEMPLATE.baseFontSize, 10, 16) - 1)}px`;
        const periodFontSize = `${Math.max(11, normalizeNumericRange(template.baseFontSize, DEFAULT_TIME_TRACKING_PDF_TEMPLATE.baseFontSize, 10, 16))}px`;
        const summaryFontSize = `${Math.max(11, normalizeNumericRange(template.baseFontSize, DEFAULT_TIME_TRACKING_PDF_TEMPLATE.baseFontSize, 10, 16) + (template.density === "compact" ? 0 : 1))}px`;
        const lineHeight = normalizeNumericRange(template.lineHeight, DEFAULT_TIME_TRACKING_PDF_TEMPLATE.lineHeight, 1.1, 2, 2);
        const fontStack = resolveTimeTrackingPdfFontStack(template.fontFamily);
        const visibleColumns = (template.visibleColumns || []).length
          ? template.visibleColumns
          : [...TIME_TRACKING_PDF_COLUMNS_DEFAULT];

        const columnLabel: Record<TimeTrackingPdfColumn, string> = {
          date: "Dato",
          user: "Bruker",
          department: "Avdeling",
          caseNumber: "Saksnummer",
          description: "Beskrivelse",
          hours: "Timer",
          status: "Status",
        };

        const resolveColumnValue = (row: Record<string, unknown>, column: TimeTrackingPdfColumn): string => {
          switch (column) {
            case "date":
              return String(row.Dato || "");
            case "user":
              return String(row.Bruker || "");
            case "department":
              return String(row.Avdeling || "");
            case "caseNumber":
              return String(row.Saksnummer || "");
            case "description":
              return String(row.Beskrivelse || "");
            case "hours": {
              const timerValue = Number(row.Timer);
              if (!Number.isFinite(timerValue)) return String(row.Timer || "");
              return timerValue.toFixed(1);
            }
            case "status":
              return String(row.Status || "");
            default:
              return "";
          }
        };

        const tableHeadersMarkup = visibleColumns
          .map((column) => `<th class="${column === "hours" ? "number" : ""}">${escapeHtml(columnLabel[column])}</th>`)
          .join("");

        const rowsMarkup = data.length > 0
          ? data
            .map((row, index) => {
              const rowClass = template.stripeRows && index % 2 === 1 ? "odd" : "";
              const cells = visibleColumns
                .map((column) => {
                  const value = resolveColumnValue(row as Record<string, unknown>, column);
                  return `<td class="${column === "hours" ? "number" : ""}">${escapeHtml(value)}</td>`;
                })
                .join("");
              return `<tr class="${rowClass}">${cells}</tr>`;
            })
            .join("\n")
          : `<tr><td class="empty-state" colspan="${visibleColumns.length}">Ingen registreringer i valgt periode.</td></tr>`;

        const totalsRowMarkup = (() => {
          if (!template.showTotalsRow || !visibleColumns.includes("hours")) return "";

          let labelPrinted = false;
          const cells = visibleColumns
            .map((column) => {
              if (column === "hours") {
                return `<td class="number total-hours">${escapeHtml(totalHours.toFixed(1))}</td>`;
              }
              if (!labelPrinted) {
                labelPrinted = true;
                return `<td class="total-label">Totalt</td>`;
              }
              return "<td></td>";
            })
            .join("");

          return `<tr class="totals-row">${cells}</tr>`;
        })();

        const subtitleMarkup = template.subtitle
          ? `<p class="subtitle">${escapeHtml(template.subtitle)}</p>`
          : "";
        const generatedMarkup = template.showGeneratedDate
          ? `<p class="meta">Generert: ${escapeHtml(generatedDate)}</p>`
          : "";
        const logoMarkup = template.logoUrl
          ? `<img class="brand-logo" src="${escapeHtml(template.logoUrl)}" alt="Logo" />`
          : "";

        const headerMarkup = (() => {
          if (template.logoPosition === "top") {
            return `
  <section class="report-header align-${template.headerAlignment} logo-top">
    ${logoMarkup ? `<div class="logo-top-wrap">${logoMarkup}</div>` : ""}
    <div class="report-title-wrap">
      <h1>${escapeHtml(template.title)}</h1>
      ${subtitleMarkup}
      ${generatedMarkup}
    </div>
  </section>`;
          }

          return `
  <section class="report-header align-${template.headerAlignment} logo-${template.logoPosition}">
    ${template.logoPosition === "left" ? logoMarkup : ""}
    <div class="report-title-wrap">
      <h1>${escapeHtml(template.title)}</h1>
      ${subtitleMarkup}
      ${generatedMarkup}
    </div>
    ${template.logoPosition === "right" ? logoMarkup : ""}
  </section>`;
        })();

        const summaryMarkup = template.showSummary
          ? `
  <section class="summary">
    <strong>Totalt timer:</strong> ${totalHours.toFixed(1)} timer<br>
    <strong>Antall registreringer:</strong> ${data.length}
  </section>`
          : "";

        const normalizedCaseDetails = normalizeTimeTrackingPdfCaseDetails(template.caseDetails);
        const resolvedCasePeriod = normalizedCaseDetails.period || periodValue;
        const caseDetailsRows = [
          { label: "Miljøarbeider", value: normalizedCaseDetails.caseOwner },
          { label: "Oppdragsgiver", value: normalizedCaseDetails.principal },
          { label: "Referanse", value: normalizedCaseDetails.reference },
          { label: "Type arbeid", value: normalizedCaseDetails.workType },
          { label: "Klient ID/Saks nr", value: normalizedCaseDetails.clientCaseNumber },
          { label: "Periode", value: resolvedCasePeriod },
        ].filter((entry) => entry.value.trim().length > 0);
        const caseDetailsMarkup = template.showCaseDetails && caseDetailsRows.length > 0
          ? `
  <div class="case-details">
    ${template.caseDetailsTitle.trim() ? `<p class="case-details-title">${escapeHtml(template.caseDetailsTitle.trim())}</p>` : ""}
    <div class="case-details-grid">
      ${caseDetailsRows
        .map((entry) => `<p><span class="case-label">${escapeHtml(entry.label)}:</span> <span class="case-value">${escapeHtml(entry.value)}</span></p>`)
        .join("\n")}
    </div>
  </div>`
          : "";
        const periodMarkup = (template.showPeriod || caseDetailsMarkup)
          ? `<section class="period-wrap">
    ${template.showPeriod ? `<p class="period">${escapeHtml(periodLabel)}</p>` : ""}
    ${caseDetailsMarkup}
  </section>`
          : "";

        const tableMarkup = `
  <section class="table-wrap">
    <table>
      <thead><tr>${tableHeadersMarkup}</tr></thead>
      <tbody>
        ${rowsMarkup}
        ${totalsRowMarkup}
      </tbody>
    </table>
  </section>`;

        const footerMarkup = template.showFooter
          ? `<section class="report-footer">${escapeHtml(template.footerText || "")}</section>`
          : "";
        const contactRows = normalizeTimeTrackingPdfContactDetails(template.contactDetails);
        const hasContactRows = template.showContactDetails && contactRows.length > 0;
        const contactTitleMarkup = template.contactTitle.trim()
          ? `<p class="contact-title">${escapeHtml(template.contactTitle.trim())}</p>`
          : "";
        const contactListMarkup = hasContactRows
          ? `
  <div class="contact-details">
    ${contactTitleMarkup}
    <ul class="contact-list">
      ${contactRows
        .map((row) => `<li><span class="contact-label">${escapeHtml(row.label)}:</span> <span class="contact-value">${escapeHtml(row.value)}</span></li>`)
        .join("\n")}
    </ul>
  </div>`
          : "";
        const footerNoteMarkup = template.showFooter && template.footerText.trim()
          ? `<p class="footer-note">${escapeHtml(template.footerText.trim())}</p>`
          : "";
        const footerSectionMarkup = hasContactRows || footerNoteMarkup
          ? `<section class="report-footer">${contactListMarkup}${footerNoteMarkup}</section>`
          : "";

        const sectionMarkup: Record<TimeTrackingPdfSection, string> = {
          header: headerMarkup,
          period: periodMarkup,
          summary: summaryMarkup,
          table: tableMarkup,
          footer: footerSectionMarkup || footerMarkup,
        };

        const orderedMarkup = (template.sectionOrder || TIME_TRACKING_PDF_SECTION_ORDER_DEFAULT)
          .map((section) => sectionMarkup[section] || "")
          .filter((part) => part.trim().length > 0)
          .join("\n");

        const borderWidth = template.tableBorderStyle === "none" ? "0" : "1px";
        const borderColor = template.tableBorderStyle === "full" ? "#94a3b8" : "#dbe2ea";
        const headerJustify = template.headerAlignment === "center" ? "center" : "space-between";

        const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Timerapport</title>
  <style>
    :root {
      --primary-color: ${template.primaryColor};
      --accent-color: ${template.accentColor};
      --font-family: ${fontStack};
      --base-font-size: ${baseFontSize};
      --title-font-size: ${titleFontSize};
      --subtitle-font-size: ${subtitleFontSize};
      --meta-font-size: ${metaFontSize};
      --period-font-size: ${periodFontSize};
      --summary-font-size: ${summaryFontSize};
      --footer-font-size: ${footerFontSize};
      --body-line-height: ${lineHeight};
      --cell-padding: ${cellPadding};
      --table-font-size: ${tableFontSize};
      --table-border-width: ${borderWidth};
      --table-border-color: ${borderColor};
    }
    body {
      font-family: var(--font-family);
      font-size: var(--base-font-size);
      line-height: var(--body-line-height);
      padding: 32px;
      color: #0f172a;
      background: #ffffff;
    }
    .report-header {
      display: flex;
      align-items: center;
      justify-content: ${headerJustify};
      gap: 16px;
      margin-bottom: 16px;
      border-bottom: 2px solid var(--primary-color);
      padding-bottom: 12px;
    }
    .report-header.align-center {
      text-align: center;
      flex-direction: column;
    }
    .report-header.logo-left,
    .report-header.logo-right {
      flex-direction: row;
    }
    .report-header.logo-left {
      justify-content: flex-start;
    }
    .report-header.logo-right {
      justify-content: space-between;
    }
    .logo-top-wrap {
      width: 100%;
      display: flex;
      justify-content: center;
    }
    .report-title-wrap h1 {
      color: var(--primary-color);
      margin: 0;
      font-size: var(--title-font-size);
      line-height: 1.2;
    }
    .subtitle {
      margin: 6px 0 0;
      color: #334155;
      font-size: var(--subtitle-font-size);
    }
    .meta {
      margin: 6px 0 0;
      color: #64748b;
      font-size: var(--meta-font-size);
    }
    .brand-logo {
      max-height: 56px;
      max-width: 220px;
      object-fit: contain;
      flex-shrink: 0;
    }
    .period-wrap {
      margin: 0 0 14px;
    }
    .period {
      margin: 0 0 8px;
      color: #334155;
      font-size: var(--period-font-size);
      font-weight: 500;
    }
    .case-details {
      margin-top: 6px;
      border: 1px solid #dbe2ea;
      border-radius: 10px;
      background: #f8fafc;
      padding: 10px 12px;
      color: #1e293b;
      font-size: var(--summary-font-size);
    }
    .case-details-title {
      margin: 0 0 6px;
      font-weight: 700;
      color: #0f172a;
    }
    .case-details-grid {
      display: grid;
      gap: 4px;
    }
    .case-label {
      font-weight: 600;
    }
    .summary {
      margin: 0 0 18px;
      padding: 12px 14px;
      background: #f8fafc;
      border-left: 4px solid var(--primary-color);
      border-radius: 10px;
      font-size: var(--summary-font-size);
      line-height: var(--body-line-height);
    }
    .table-wrap { margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td {
      border: var(--table-border-width) solid var(--table-border-color);
      padding: var(--cell-padding);
      text-align: left;
      vertical-align: top;
      font-size: var(--table-font-size);
    }
    th {
      background-color: var(--accent-color);
      color: white;
      font-weight: 600;
      white-space: nowrap;
    }
    tr.odd { background-color: #f8fafc; }
    .totals-row td {
      font-weight: 600;
      background: #f1f5f9;
    }
    .empty-state {
      text-align: center;
      color: #64748b;
      font-style: italic;
      padding: 20px 12px;
    }
    .number { text-align: right; font-variant-numeric: tabular-nums; }
    .report-footer {
      margin-top: 20px;
      border-top: 1px solid #e2e8f0;
      padding-top: 10px;
      font-size: var(--footer-font-size);
      color: #64748b;
      text-align: center;
    }
    .footer-note {
      margin: 8px 0 0;
    }
    .contact-details {
      text-align: left;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 10px 12px;
      background: #f8fafc;
      color: #334155;
      font-size: var(--footer-font-size);
    }
    .contact-title {
      margin: 0 0 6px;
      font-weight: 600;
      color: #0f172a;
    }
    .contact-list {
      margin: 0;
      padding: 0;
      list-style: none;
      display: grid;
      gap: 4px;
    }
    .contact-label {
      font-weight: 600;
    }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  ${orderedMarkup}
  <script>window.onload = () => window.print();</script>
</body>
</html>`;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.send(html);
      } else {
        res.json(data);
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ═══════════════════════════════════════════
  // Builder Pages CRUD (Visual Editor)
  // ═══════════════════════════════════════════

  // List all builder pages
  app.get("/api/cms/builder-pages", async (_req, res) => {
    try {
      const pages = await db.select().from(builderPages).orderBy(desc(builderPages.updatedAt));
      res.json(pages);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get a single builder page by id
  app.get("/api/cms/builder-pages/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const [page] = await db.select().from(builderPages).where(eq(builderPages.id, id));
      if (!page) return res.status(404).json({ error: "Page not found" });
      res.json(page);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get a builder page by slug (for public rendering)
  app.get("/api/cms/builder-pages/slug/:slug", publicReadRateLimit, async (req, res) => {
    try {
      const [page] = await db.select().from(builderPages).where(eq(builderPages.slug, req.params.slug));
      if (!page) return res.status(404).json({ error: "Page not found" });
      res.json(page);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create a new builder page
  app.post("/api/cms/builder-pages", isAuthenticated, requireAdminRole, async (req, res) => {
    try {
      const data = insertBuilderPageSchema.parse(req.body);
      const [page] = await db.insert(builderPages).values(data).returning();
      res.status(201).json(page);
    } catch (error: any) {
      if (error.code === '23505') return res.status(409).json({ error: "Slug already exists" });
      res.status(400).json({ error: error.message });
    }
  });

  // Update a builder page
  app.put("/api/cms/builder-pages/:id", isAuthenticated, requireAdminRole, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { title, slug, description, sections: pageSections, themeKey, status,
              metaTitle, metaDescription, ogImage, canonicalUrl, scheduledAt,
              globalHeader, globalFooter, customCss, locale, translationOf } = req.body;
      
      // Save current version before updating
      const [currentPage] = await db.select().from(builderPages).where(eq(builderPages.id, id));
      if (currentPage) {
        await db.insert(pageVersions).values({
          pageId: id,
          version: currentPage.version || 1,
          title: currentPage.title,
          sections: currentPage.sections,
          themeKey: currentPage.themeKey,
          customCss: currentPage.customCss,
          changeNote: req.body.changeNote || 'Auto-save',
        });
      }

      const updates: any = { updatedAt: new Date(), version: (currentPage?.version || 1) + 1 };
      if (title !== undefined) updates.title = title;
      if (slug !== undefined) updates.slug = slug;
      if (description !== undefined) updates.description = description;
      if (pageSections !== undefined) updates.sections = pageSections;
      if (themeKey !== undefined) updates.themeKey = themeKey;
      if (metaTitle !== undefined) updates.metaTitle = metaTitle;
      if (metaDescription !== undefined) updates.metaDescription = metaDescription;
      if (ogImage !== undefined) updates.ogImage = ogImage;
      if (canonicalUrl !== undefined) updates.canonicalUrl = canonicalUrl;
      if (globalHeader !== undefined) updates.globalHeader = globalHeader;
      if (globalFooter !== undefined) updates.globalFooter = globalFooter;
      if (customCss !== undefined) updates.customCss = customCss;
      if (locale !== undefined) updates.locale = locale;
      if (translationOf !== undefined) updates.translationOf = translationOf;
      if (scheduledAt !== undefined) {
        updates.scheduledAt = scheduledAt ? new Date(scheduledAt) : null;
        if (scheduledAt) updates.status = 'scheduled';
      }
      if (status !== undefined) {
        updates.status = status;
        if (status === 'published') updates.publishedAt = new Date();
      }
      const [page] = await db.update(builderPages).set(updates).where(eq(builderPages.id, id)).returning();
      if (!page) return res.status(404).json({ error: "Page not found" });
      res.json(page);
    } catch (error: any) {
      if (error.code === '23505') return res.status(409).json({ error: "Slug already exists" });
      res.status(400).json({ error: error.message });
    }
  });

  // Delete a builder page
  app.delete("/api/cms/builder-pages/:id", isAuthenticated, requireAdminRole, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const [page] = await db.delete(builderPages).where(eq(builderPages.id, id)).returning();
      if (!page) return res.status(404).json({ error: "Page not found" });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ═══════════════════════════════════════════
  // Section Templates CRUD
  // ═══════════════════════════════════════════

  app.get("/api/cms/section-templates", async (_req, res) => {
    try {
      const templates = await db.select().from(sectionTemplates).orderBy(desc(sectionTemplates.updatedAt));
      res.json(templates);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/cms/section-templates", isAuthenticated, requireAdminRole, async (req, res) => {
    try {
      const [template] = await db.insert(sectionTemplates).values({
        name: req.body.name,
        description: req.body.description,
        category: req.body.category || 'custom',
        thumbnail: req.body.thumbnail,
        sectionData: req.body.sectionData,
      }).returning();
      res.status(201).json(template);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/cms/section-templates/:id", isAuthenticated, requireAdminRole, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await db.delete(sectionTemplates).where(eq(sectionTemplates.id, id));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ═══════════════════════════════════════════
  // Page Versions (Revision History)
  // ═══════════════════════════════════════════

  app.get("/api/cms/page-versions/:pageId", async (req, res) => {
    try {
      const pageId = parseInt(req.params.pageId);
      const versions = await db.select().from(pageVersions)
        .where(eq(pageVersions.pageId, pageId))
        .orderBy(desc(pageVersions.version));
      res.json(versions);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Restore a specific version
  app.post("/api/cms/page-versions/:pageId/restore/:versionId", isAuthenticated, requireAdminRole, async (req, res) => {
    try {
      const pageId = parseInt(req.params.pageId);
      const versionId = parseInt(req.params.versionId);
      const [ver] = await db.select().from(pageVersions).where(eq(pageVersions.id, versionId));
      if (!ver) return res.status(404).json({ error: "Version not found" });

      // Save current as new version before restore
      const [currentPage] = await db.select().from(builderPages).where(eq(builderPages.id, pageId));
      if (currentPage) {
        await db.insert(pageVersions).values({
          pageId,
          version: (currentPage.version || 1),
          title: currentPage.title,
          sections: currentPage.sections,
          themeKey: currentPage.themeKey,
          customCss: currentPage.customCss,
          changeNote: 'Pre-restore backup',
        });
      }

      const [page] = await db.update(builderPages).set({
        title: ver.title,
        sections: ver.sections,
        themeKey: ver.themeKey,
        customCss: ver.customCss,
        version: (currentPage?.version || 1) + 1,
        updatedAt: new Date(),
      }).where(eq(builderPages.id, pageId)).returning();
      res.json(page);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ═══════════════════════════════════════════
  // Form Submissions
  // ═══════════════════════════════════════════

  app.get("/api/cms/form-submissions", async (req, res) => {
    try {
      const { pageId, status: formStatus } = req.query;
      let query = db.select().from(formSubmissions).orderBy(desc(formSubmissions.createdAt));
      const results = await query;
      const filtered = results.filter((s: any) => {
        if (pageId && s.pageId !== parseInt(pageId as string)) return false;
        if (formStatus && s.status !== formStatus) return false;
        return true;
      });
      res.json(filtered);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Public form submission endpoint (no auth needed)
  app.post("/api/cms/form-submissions", publicWriteRateLimit, async (req, res) => {
    try {
      const { pageId, pageSlug, formName, data } = req.body;
      const [submission] = await db.insert(formSubmissions).values({
        pageId: pageId || null,
        pageSlug: pageSlug || null,
        formName: formName || 'contact',
        data: data || {},
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      }).returning();
      res.status(201).json(submission);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.put("/api/cms/form-submissions/:id/status", isAuthenticated, requireAdminRole, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const [sub] = await db.update(formSubmissions)
        .set({ status: req.body.status })
        .where(eq(formSubmissions.id, id))
        .returning();
      res.json(sub);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ═══════════════════════════════════════════
  // Page Analytics
  // ═══════════════════════════════════════════

  // Track a page view (public, no auth)
  app.post("/api/cms/page-analytics/track", publicWriteRateLimit, async (req, res) => {
    try {
      const { pageId, pageSlug, duration, referrer, device } = req.body;
      await db.insert(pageAnalytics).values({
        pageId: pageId || 0,
        pageSlug,
        duration: duration || null,
        referrer: referrer || null,
        userAgent: req.get('user-agent'),
        device: device || 'desktop',
      });
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get analytics for a page
  app.get("/api/cms/page-analytics/:pageId", async (req, res) => {
    try {
      const pageId = parseInt(req.params.pageId);
      const views = await db.select().from(pageAnalytics)
        .where(eq(pageAnalytics.pageId, pageId))
        .orderBy(desc(pageAnalytics.viewedAt));
      
      const totalViews = views.length;
      const avgDuration = views.filter(v => v.duration).reduce((a, v) => a + (v.duration || 0), 0) / Math.max(1, views.filter(v => v.duration).length);
      const devices = views.reduce((acc: any, v) => {
        acc[v.device || 'unknown'] = (acc[v.device || 'unknown'] || 0) + 1;
        return acc;
      }, {});

      res.json({
        totalViews,
        avgDuration: Math.round(avgDuration),
        devices,
        recentViews: views.slice(0, 50),
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ═══════════════════════════════════════════
  // CMS Image Upload
  // ═══════════════════════════════════════════

  const cmsUploadDir = path.join(process.cwd(), 'uploads', 'cms');
  if (!fs.existsSync(cmsUploadDir)) {
    fs.mkdirSync(cmsUploadDir, { recursive: true });
  }

  const cmsStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, cmsUploadDir),
    filename: (_req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = path.extname(file.originalname);
      cb(null, 'cms-' + uniqueSuffix + ext);
    }
  });

  const cmsUpload = multer({
    storage: cmsStorage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (_req, file, cb) => {
      const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
      if (allowed.includes(file.mimetype)) cb(null, true);
      else cb(new Error('Invalid file type'));
    }
  });

  app.post("/api/cms/upload", cmsUpload.single('image'), async (req: any, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const originalPath = req.file.path;
    const originalSize = req.file.size;
    const isSvg = req.file.mimetype === 'image/svg+xml';
    const isGif = req.file.mimetype === 'image/gif';

    // Skip optimization for SVG and animated GIF
    if (isSvg || isGif) {
      const fileUrl = `/uploads/cms/${req.file.filename}`;
      return res.json({
        url: fileUrl,
        filename: req.file.filename,
        size: originalSize,
        originalSize,
        optimized: false,
        format: isSvg ? 'svg' : 'gif',
      });
    }

    try {
      // Read image metadata
      const metadata = await sharp(originalPath).metadata();
      const maxDimension = 2048;

      // Build the sharp pipeline
      let pipeline = sharp(originalPath).rotate(); // auto-rotate based on EXIF

      // Resize if larger than max dimension
      if ((metadata.width && metadata.width > maxDimension) || (metadata.height && metadata.height > maxDimension)) {
        pipeline = pipeline.resize(maxDimension, maxDimension, {
          fit: 'inside',
          withoutEnlargement: true,
        });
      }

      // Convert to WebP with quality 80 for best size/quality balance
      const optimizedFilename = req.file.filename.replace(/\.[^.]+$/, '.webp');
      const optimizedPath = path.join(cmsUploadDir, optimizedFilename);

      const result = await pipeline
        .webp({ quality: 80, effort: 4 })
        .toFile(optimizedPath);

      // Also generate a thumbnail (400px wide) for the editor
      const thumbFilename = 'thumb-' + optimizedFilename;
      const thumbPath = path.join(cmsUploadDir, thumbFilename);
      await sharp(optimizedPath)
        .resize(400, null, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 70 })
        .toFile(thumbPath);

      // Remove original file if different from optimized
      if (originalPath !== optimizedPath) {
        fs.unlink(originalPath, () => {});
      }

      const savings = Math.round((1 - result.size / originalSize) * 100);

      const fileUrl = `/uploads/cms/${optimizedFilename}`;
      const thumbUrl = `/uploads/cms/${thumbFilename}`;

      res.json({
        url: fileUrl,
        thumbnail: thumbUrl,
        filename: optimizedFilename,
        size: result.size,
        originalSize,
        optimized: true,
        format: 'webp',
        width: result.width,
        height: result.height,
        savings,
      });
    } catch (err: any) {
      console.error('Image optimization failed, serving original:', err.message);
      // Fallback: serve original
      const fileUrl = `/uploads/cms/${req.file.filename}`;
      res.json({
        url: fileUrl,
        filename: req.file.filename,
        size: originalSize,
        originalSize,
        optimized: false,
        error: 'Optimization failed, original served',
      });
    }
  });

  // Serve CMS uploads (1 hour browser cache)
  app.use('/uploads/cms', express.static(cmsUploadDir, { maxAge: '1h' }));

  // ═══════════════════════════════════════════
  // Scheduled Publishing Cron (check on each request)
  // ═══════════════════════════════════════════

  // Simple scheduled publishing check
  const checkScheduledPages = async () => {
    try {
      const now = new Date();
      const scheduled = await db.select().from(builderPages)
        .where(eq(builderPages.status, 'scheduled'));
      for (const page of scheduled) {
        if (page.scheduledAt && new Date(page.scheduledAt) <= now) {
          await db.update(builderPages).set({
            status: 'published',
            publishedAt: now,
            updatedAt: now,
          }).where(eq(builderPages.id, page.id));
          console.log(`[CMS] Auto-published scheduled page: ${page.slug}`);
        }
      }
    } catch (err) {
      console.error('[CMS] Scheduled publishing check failed:', err);
    }
  };

  // Check every minute
  setInterval(checkScheduledPages, 60 * 1000);

  // Register feature routes
  registerLeaveRoutes(app);
  registerInvoiceRoutes(app);
  registerOvertimeRoutes(app);
  registerRecurringRoutes(app);
  registerExportRoutes(app);
  registerForwardRoutes(app);
  registerEmailComposerRoutes(app);
  registerNotificationRoutes(app);

  return httpServer;
}
