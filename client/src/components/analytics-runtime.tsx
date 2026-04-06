import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
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
        <div className="space-y-3">
          <p className="text-sm font-semibold text-slate-900">Analyse og innsikt for Tidum</p>
          <p className="text-sm text-slate-600">
            Vi bruker informasjonskapsler og tilsvarende lagring på den offentlige Tidum-siden for å holde siden sikker og for å forstå hvilke sider og henvendelser som faktisk brukes.
          </p>
          <div className="grid gap-2 text-sm text-slate-600">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
              <p className="font-medium text-slate-900">Kun nødvendige</p>
              <p className="mt-1">
                Holder innlogging, sikkerhet, sesjon og samtykkevalget ditt i gang. Disse brukes for at nettstedet og forespørselsflyten skal fungere som den skal.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
              <p className="font-medium text-slate-900">Analyse</p>
              <p className="mt-1">
                Måler sidevisninger, CTA-klikk og bruk av de offentlige sidene på <strong>tidum.no</strong>, slik at vi kan forbedre innhold, navigasjon og forespørselsflyt.
              </p>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Les mer i{" "}
            <Link href="/personvern" className="font-medium text-slate-700 underline underline-offset-2">
              personvernerklæringen
            </Link>{" "}
            og{" "}
            <Link href="/vilkar" className="font-medium text-slate-700 underline underline-offset-2">
              vilkårene
            </Link>
            .
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
