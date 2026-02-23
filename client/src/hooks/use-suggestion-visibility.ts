import { useCallback, useEffect, useState } from "react";
import {
  getSuggestionFrequencyCooldownMs,
  type SuggestionFrequency,
} from "@/lib/suggestion-settings";

type SuggestionSurfaceKey =
  | "dashboard_time"
  | "dashboard_case"
  | "time_tracking"
  | "time_calendar"
  | "case_reports"
  | "invoices"
  | "recurring"
  | "reports_schedule";

interface UseSuggestionVisibilityOptions {
  surface: SuggestionSurfaceKey;
  enabled: boolean;
  frequency: SuggestionFrequency;
  scopeKey?: string | null;
}

const STORAGE_PREFIX = "tidum-suggestion-last-seen";

function getStorageKey(surface: SuggestionSurfaceKey, scopeKey?: string | null): string {
  const normalizedScope = scopeKey && scopeKey.trim().length > 0 ? scopeKey.trim() : "default";
  return `${STORAGE_PREFIX}:${surface}:${normalizedScope}`;
}

function readLastSeenMs(surface: SuggestionSurfaceKey, scopeKey?: string | null): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(getStorageKey(surface, scopeKey));
    if (!raw) return null;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeLastSeenMs(surface: SuggestionSurfaceKey, timestampMs: number, scopeKey?: string | null) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(getStorageKey(surface, scopeKey), String(timestampMs));
  } catch {
    // ignore storage errors
  }
}

export function useSuggestionVisibility({
  surface,
  enabled,
  frequency,
  scopeKey,
}: UseSuggestionVisibilityOptions) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setIsVisible(false);
      return;
    }

    const cooldownMs = getSuggestionFrequencyCooldownMs(frequency);
    const now = Date.now();
    const lastSeenMs = readLastSeenMs(surface, scopeKey);

    if (lastSeenMs && now - lastSeenMs < cooldownMs) {
      setIsVisible(false);
      return;
    }

    setIsVisible(true);
    writeLastSeenMs(surface, now, scopeKey);
  }, [enabled, frequency, scopeKey, surface]);

  const dismiss = useCallback(() => {
    writeLastSeenMs(surface, Date.now(), scopeKey);
    setIsVisible(false);
  }, [scopeKey, surface]);

  return {
    isVisible,
    dismiss,
  };
}
