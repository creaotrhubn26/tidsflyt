import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  TidumAnalyticsConfig,
  applyAnalyticsConsent,
  initializeAnalytics,
  needsConsentPrompt,
  setStoredConsent,
  shouldTrackPath,
  trackTidumPageView,
} from "@/lib/analytics";

const defaultConfig: TidumAnalyticsConfig = { enabled: false };

export function AnalyticsRuntime() {
  const [location] = useLocation();
  const [config, setConfig] = useState<TidumAnalyticsConfig>(defaultConfig);
  const [showConsent, setShowConsent] = useState(false);
  const lastTrackedPath = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadConfig() {
      try {
        const response = await fetch("/api/analytics/config", {
          credentials: "same-origin",
        });
        if (!response.ok) return;
        const payload = (await response.json()) as TidumAnalyticsConfig;
        if (cancelled) return;
        setConfig(payload);
      } catch {
        if (!cancelled) {
          setConfig(defaultConfig);
        }
      }
    }

    loadConfig();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!config.enabled) return;
    initializeAnalytics(config);
    setShowConsent(needsConsentPrompt(config, location));
  }, [config, location]);

  useEffect(() => {
    if (!config.enabled) return;
    if (!shouldTrackPath(config, location)) return;
    if (lastTrackedPath.current === location) return;

    trackTidumPageView(config, location);
    lastTrackedPath.current = location;
  }, [config, location]);

  if (!showConsent) {
    return null;
  }

  return (
    <div className="fixed inset-x-0 bottom-4 z-[70] px-4">
      <div
        className={cn(
          "mx-auto flex max-w-4xl flex-col gap-4 rounded-3xl border border-slate-200 bg-white/95 p-5 shadow-2xl backdrop-blur",
          "sm:flex-row sm:items-end sm:justify-between",
        )}
      >
        <div className="space-y-1">
          <p className="text-sm font-semibold text-slate-900">Analyse og innsikt for Tidum</p>
          <p className="text-sm text-slate-600">
            Vi bruker egne analyseverktøy for å forstå hvordan den offentlige Tidum-siden brukes, forbedre innholdet og måle henvendelser.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:min-w-[240px] sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            className="border-slate-300"
            onClick={() => {
              setStoredConsent("denied");
              applyAnalyticsConsent(config, "denied");
              setShowConsent(false);
            }}
          >
            Kun nødvendige
          </Button>
          <Button
            className="bg-slate-900 text-white hover:bg-slate-800"
            onClick={() => {
              setStoredConsent("granted");
              applyAnalyticsConsent(config, "granted");
              setShowConsent(false);
              trackTidumPageView(config, location);
            }}
          >
            Godta analyse
          </Button>
        </div>
      </div>
    </div>
  );
}
