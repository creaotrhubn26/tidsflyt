import { useEffect, useId, useMemo, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement | string,
        options: {
          sitekey: string;
          action?: string;
          theme?: "light" | "dark" | "auto";
          appearance?: "always" | "interaction-only" | "execute";
          callback?: (token: string) => void;
          "expired-callback"?: () => void;
          "timeout-callback"?: () => void;
          "error-callback"?: () => void;
        },
      ) => string;
      remove?: (widgetId: string) => void;
      reset?: (widgetId?: string) => void;
    };
    __tidumTurnstileScriptPromise?: Promise<void>;
  }
}

type CloudflareTurnstileProps = {
  siteKey: string;
  action: string;
  onTokenChange: (token: string | null) => void;
  className?: string;
};

const TURNSTILE_SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

function ensureTurnstileScript() {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }

  if (window.turnstile) {
    return Promise.resolve();
  }

  if (window.__tidumTurnstileScriptPromise) {
    return window.__tidumTurnstileScriptPromise;
  }

  window.__tidumTurnstileScriptPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[data-turnstile-script="true"]',
    );

    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener(
        "error",
        () => reject(new Error("Turnstile script failed to load")),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.setAttribute("data-turnstile-script", "true");
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("Turnstile script failed to load"));
    document.head.appendChild(script);
  });

  return window.__tidumTurnstileScriptPromise;
}

export function CloudflareTurnstile({
  siteKey,
  action,
  onTokenChange,
  className,
}: CloudflareTurnstileProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const componentId = useId();
  const containerId = useMemo(
    () => `tidum-turnstile-${componentId.replace(/[:]/g, "")}`,
    [componentId],
  );

  useEffect(() => {
    let cancelled = false;
    onTokenChange(null);
    setLoadError(null);

    if (!siteKey) {
      return;
    }

    ensureTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) {
          return;
        }

        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          action,
          theme: "light",
          appearance: "always",
          callback: (token) => onTokenChange(token),
          "expired-callback": () => onTokenChange(null),
          "timeout-callback": () => onTokenChange(null),
          "error-callback": () => onTokenChange(null),
        });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        console.error("Turnstile load error:", error);
        setLoadError("Sikkerhetskontrollen kunne ikke lastes inn.");
        onTokenChange(null);
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile?.remove) {
        window.turnstile.remove(widgetIdRef.current);
      }
      widgetIdRef.current = null;
    };
  }, [action, onTokenChange, siteKey]);

  if (!siteKey) {
    return null;
  }

  return (
    <div className={className}>
      <div
        id={containerId}
        ref={containerRef}
        data-testid="turnstile-widget"
        className="min-h-[72px]"
      />
      <p className="mt-2 text-xs leading-relaxed text-[#5B686B]">
        {loadError ||
          "Skjemaet er beskyttet av Cloudflare Turnstile for å hindre spam og misbruk."}
      </p>
    </div>
  );
}
