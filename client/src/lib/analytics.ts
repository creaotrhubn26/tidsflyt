declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    __tidumAnalyticsConfig?: TidumAnalyticsConfig;
  }
}

export interface TidumAnalyticsConfig {
  enabled: boolean;
  ga4_measurement_id?: string | null;
  ga4_stream_id?: string | null;
  gtm_container_id?: string | null;
  enable_page_views?: boolean;
  enable_events?: boolean;
  enable_consent_mode?: boolean;
  cookie_consent?: "required" | "optional" | "granted" | string | null;
  excluded_paths?: string[] | null;
}

const TIDUM_CONSENT_KEY = "tidum-analytics-consent";

const DEFAULT_EXCLUDED_PREFIXES = [
  "/dashboard",
  "/time-tracking",
  "/time",
  "/reports",
  "/case-reports",
  "/cases",
  "/profile",
  "/settings",
  "/invites",
  "/users",
  "/leave",
  "/invoices",
  "/overtime",
  "/recurring",
  "/timesheets",
  "/forward",
  "/email",
  "/admin",
  "/vendors",
  "/cms",
  "/cms-legacy",
  "/api-docs",
  "/vendor/api",
];

type ConsentState = "granted" | "denied";

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function ensureDataLayer() {
  if (!isBrowser()) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () {
    window.dataLayer?.push(arguments);
  };
}

function getStoredConsent(): ConsentState | null {
  if (!isBrowser()) return null;

  try {
    const value = window.localStorage.getItem(TIDUM_CONSENT_KEY);
    return value === "granted" || value === "denied" ? value : null;
  } catch {
    return null;
  }
}

export function setStoredConsent(value: ConsentState) {
  if (!isBrowser()) return;

  try {
    window.localStorage.setItem(TIDUM_CONSENT_KEY, value);
  } catch {
    // Ignore storage failures in restricted browsers.
  }
}

function normalizeConsentValue(config: TidumAnalyticsConfig): ConsentState {
  if (config.cookie_consent === "granted") {
    return "granted";
  }

  return getStoredConsent() ?? "denied";
}

function getConsentPayload(value: ConsentState) {
  return {
    analytics_storage: value,
    ad_storage: value,
    ad_user_data: value,
    ad_personalization: value,
    functionality_storage: "granted",
    security_storage: "granted",
  };
}

export function applyAnalyticsConsent(config: TidumAnalyticsConfig, value: ConsentState) {
  if (!isBrowser()) return;

  ensureDataLayer();
  if (config.enable_consent_mode) {
    window.gtag?.("consent", "update", getConsentPayload(value));
  }
  setStoredConsent(value);
}

function hasScript(marker: string, value: string): boolean {
  if (!isBrowser()) return false;
  return Boolean(document.querySelector(`script[data-${marker}="${value}"]`));
}

function loadGoogleAnalytics(measurementId: string) {
  if (!isBrowser() || !measurementId || hasScript("tidum-ga", measurementId)) return;

  ensureDataLayer();

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  script.dataset.tidumGa = measurementId;
  script.onload = () => {
    window.gtag?.("js", new Date());
    window.gtag?.("config", measurementId, { send_page_view: false });
  };
  document.head.appendChild(script);
}

function loadTagManager(containerId: string) {
  if (!isBrowser() || !containerId || hasScript("tidum-gtm", containerId)) return;

  ensureDataLayer();
  window.dataLayer?.push({ "gtm.start": Date.now(), event: "gtm.js" });

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(containerId)}`;
  script.dataset.tidumGtm = containerId;
  document.head.appendChild(script);
}

export function shouldTrackPath(config: TidumAnalyticsConfig, pathname: string): boolean {
  const rules = [
    ...DEFAULT_EXCLUDED_PREFIXES,
    ...(config.excluded_paths || []),
  ]
    .map((entry) => entry?.trim())
    .filter((entry): entry is string => Boolean(entry));

  return !rules.some((rule) => pathname === rule || pathname.startsWith(`${rule}/`));
}

export function initializeAnalytics(config: TidumAnalyticsConfig) {
  if (!isBrowser() || !config.enabled) return;

  ensureDataLayer();
  if (config.enable_consent_mode) {
    window.gtag?.("consent", "default", getConsentPayload(normalizeConsentValue(config)));
  }

  if (config.gtm_container_id) {
    loadTagManager(config.gtm_container_id);
  }

  if (config.ga4_measurement_id) {
    loadGoogleAnalytics(config.ga4_measurement_id);
  }
}

export function trackTidumPageView(config: TidumAnalyticsConfig, pathname: string) {
  if (!isBrowser() || !config.enabled || !config.enable_page_views) return;
  if (!shouldTrackPath(config, pathname)) return;

  const consent = normalizeConsentValue(config);
  if (config.cookie_consent !== "granted" && consent !== "granted") return;

  const payload = {
    page_path: pathname,
    page_title: document.title,
    page_location: window.location.href,
  };

  if (config.ga4_measurement_id) {
    window.gtag?.("config", config.ga4_measurement_id, payload);
  }

  if (config.gtm_container_id) {
    window.dataLayer?.push({
      event: "tidum_page_view",
      ...payload,
    });
  }
}

export function trackTidumEvent(
  config: TidumAnalyticsConfig,
  eventName: string,
  params: Record<string, unknown> = {},
) {
  if (!isBrowser() || !config.enabled || !config.enable_events) return;

  const consent = normalizeConsentValue(config);
  if (config.cookie_consent !== "granted" && consent !== "granted") return;

  if (config.ga4_measurement_id) {
    window.gtag?.("event", eventName, params);
  }

  if (config.gtm_container_id) {
    window.dataLayer?.push({
      event: eventName,
      ...params,
    });
  }
}

export function needsConsentPrompt(config: TidumAnalyticsConfig, pathname: string): boolean {
  if (!config.enabled) return false;
  if (!shouldTrackPath(config, pathname)) return false;
  if (config.cookie_consent === "granted") return false;
  return getStoredConsent() === null;
}
