export type SuggestionMode = "off" | "dashboard_only" | "balanced" | "proactive";
export type SuggestionFrequency = "low" | "normal" | "high";
export type SuggestionBlockCategory = "project" | "description" | "case_id";

export interface SuggestionBlockedData {
  projects: string[];
  descriptions: string[];
  caseIds: string[];
}

export interface SuggestionTeamPreset {
  mode: SuggestionMode;
  frequency: SuggestionFrequency;
  confidenceThreshold: number;
}

export interface SuggestionRolloutInfo {
  featureEnabled: boolean;
  experimentsEnabled: boolean;
  variant: "control" | "proactive_test";
  recommendedMode: SuggestionMode;
  source: "feature_flag_off" | "team_default" | "experiment" | "user_override";
}

export interface SuggestionSettings {
  mode: SuggestionMode;
  frequency: SuggestionFrequency;
  confidenceThreshold: number;
  blocked: SuggestionBlockedData;
  userOverride: boolean;
  teamDefault: SuggestionTeamPreset | null;
  rollout: SuggestionRolloutInfo | null;
  updatedAt: string;
}

export type SuggestionSurface = "dashboard" | "workflow" | "automation";

const DEFAULT_UPDATED_AT = "1970-01-01T00:00:00.000Z";

export const DEFAULT_SUGGESTION_SETTINGS: SuggestionSettings = {
  mode: "balanced",
  frequency: "normal",
  confidenceThreshold: 0.45,
  blocked: {
    projects: [],
    descriptions: [],
    caseIds: [],
  },
  userOverride: false,
  teamDefault: null,
  rollout: null,
  updatedAt: DEFAULT_UPDATED_AT,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeMode(value: unknown): SuggestionMode {
  return value === "off" ||
    value === "dashboard_only" ||
    value === "balanced" ||
    value === "proactive"
    ? value
    : DEFAULT_SUGGESTION_SETTINGS.mode;
}

function normalizeFrequency(value: unknown): SuggestionFrequency {
  return value === "low" || value === "normal" || value === "high"
    ? value
    : DEFAULT_SUGGESTION_SETTINGS.frequency;
}

function normalizeConfidenceThreshold(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_SUGGESTION_SETTINGS.confidenceThreshold;
  }
  return Math.max(0.2, Math.min(0.95, value));
}

function normalizeBlockedList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const unique = new Map<string, string>();
  value.forEach((entry) => {
    if (typeof entry !== "string") return;
    const trimmed = entry.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (!unique.has(key)) {
      unique.set(key, trimmed);
    }
  });
  return Array.from(unique.values()).slice(-120);
}

function normalizeBlocked(raw: unknown): SuggestionBlockedData {
  if (!isRecord(raw)) {
    return { ...DEFAULT_SUGGESTION_SETTINGS.blocked };
  }
  return {
    projects: normalizeBlockedList(raw.projects),
    descriptions: normalizeBlockedList(raw.descriptions),
    caseIds: normalizeBlockedList(raw.caseIds),
  };
}

function normalizeTeamPreset(raw: unknown): SuggestionTeamPreset | null {
  if (!isRecord(raw)) return null;
  return {
    mode: normalizeMode(raw.mode),
    frequency: normalizeFrequency(raw.frequency),
    confidenceThreshold: normalizeConfidenceThreshold(raw.confidenceThreshold),
  };
}

function normalizeRollout(raw: unknown): SuggestionRolloutInfo | null {
  if (!isRecord(raw)) return null;
  const featureEnabled = typeof raw.featureEnabled === "boolean" ? raw.featureEnabled : true;
  const experimentsEnabled = typeof raw.experimentsEnabled === "boolean" ? raw.experimentsEnabled : true;
  const variant = raw.variant === "proactive_test" ? "proactive_test" : "control";
  const source = raw.source === "feature_flag_off" ||
    raw.source === "team_default" ||
    raw.source === "experiment" ||
    raw.source === "user_override"
    ? raw.source
    : "team_default";

  return {
    featureEnabled,
    experimentsEnabled,
    variant,
    recommendedMode: normalizeMode(raw.recommendedMode),
    source,
  };
}

export function normalizeSuggestionSettings(raw: unknown): SuggestionSettings {
  if (!isRecord(raw)) {
    return { ...DEFAULT_SUGGESTION_SETTINGS };
  }

  const updatedAt =
    typeof raw.updatedAt === "string" && raw.updatedAt.trim().length > 0
      ? raw.updatedAt
      : DEFAULT_SUGGESTION_SETTINGS.updatedAt;

  return {
    mode: normalizeMode(raw.mode),
    frequency: normalizeFrequency(raw.frequency),
    confidenceThreshold: normalizeConfidenceThreshold(raw.confidenceThreshold),
    blocked: normalizeBlocked(raw.blocked),
    userOverride: typeof raw.userOverride === "boolean" ? raw.userOverride : DEFAULT_SUGGESTION_SETTINGS.userOverride,
    teamDefault: normalizeTeamPreset(raw.teamDefault),
    rollout: normalizeRollout(raw.rollout),
    updatedAt,
  };
}

export function isSuggestionSurfaceEnabled(settings: SuggestionSettings, surface: SuggestionSurface): boolean {
  switch (settings.mode) {
    case "off":
      return false;
    case "dashboard_only":
      return surface === "dashboard";
    case "balanced":
      return surface === "dashboard" || surface === "workflow";
    case "proactive":
      return true;
    default:
      return true;
  }
}

export function getSuggestionFrequencyCooldownMs(frequency: SuggestionFrequency): number {
  switch (frequency) {
    case "low":
      return 72 * 60 * 60 * 1000;
    case "normal":
      return 24 * 60 * 60 * 1000;
    case "high":
      return 8 * 60 * 60 * 1000;
    default:
      return 24 * 60 * 60 * 1000;
  }
}
