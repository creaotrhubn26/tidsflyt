/**
 * useStuckDetection — detects when a user appears stuck inside the app and
 * surfaces a one-time helper signal. Three heuristics:
 *
 *  1. Idle on the same page for >idleMs without meaningful interaction.
 *  2. Repeated open/close of the same dialog within a short window
 *     (frustration signal).
 *  3. Fast back/forward navigation across the same routes (lost-in-app
 *     signal).
 *
 * Thresholds and enabled state are read from CMS guide-config so admins
 * can tune behavior without redeploying. Telemetry events are emitted on
 * every trip + dismissal so future ML can learn what works.
 *
 * Returns { stuck, dismiss, reset }.  `stuck` is true when a heuristic fires;
 * dismiss() suppresses it for the current page; reset() re-arms after
 * navigation. The caller decides what UI to render (typically the floating
 * "Trenger du hjelp?" CTA in PortalLayout).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useGuideConfig } from "./use-guide-config";

export function useStuckDetection(): {
  stuck: boolean;
  reason: "idle" | "nav" | "dialog" | null;
  dismiss: () => void;
  reset: () => void;
} {
  const { config } = useGuideConfig();
  const enabled = config.stuck.enabled;
  const IDLE_MS = config.stuck.thresholds.idleMs;
  const NAV_WINDOW_MS = config.stuck.thresholds.navWindowMs;
  const NAV_THRESHOLD = config.stuck.thresholds.navThreshold;
  const DIALOG_WINDOW_MS = config.stuck.thresholds.dialogWindowMs;
  const DIALOG_THRESHOLD = config.stuck.thresholds.dialogThreshold;
  const [location] = useLocation();
  const [stuck, setStuck] = useState(false);
  const [reason, setReason] = useState<"idle" | "nav" | "dialog" | null>(null);

  const dismissedFor = useRef<Set<string>>(new Set());
  const idleTimer = useRef<number>();
  const navTimes = useRef<number[]>([]);
  const dialogEvents = useRef<{ at: number; key: string }[]>([]);

  const trip = useCallback(
    (r: "idle" | "nav" | "dialog") => {
      if (!enabled) return;
      if (dismissedFor.current.has(location)) return;
      setStuck(true);
      setReason(r);
      // Telemetry hook — emits a window event so the host app can wire
      // analytics or experimentation tooling without changing this hook.
      try {
        window.dispatchEvent(new CustomEvent("tidum:stuck", { detail: { reason: r, path: location } }));
      } catch {}
    },
    [enabled, location]
  );

  // ── Idle detection ─────────────────────────────────────────────────────
  useEffect(() => {
    const arm = () => {
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
      idleTimer.current = window.setTimeout(() => trip("idle"), IDLE_MS);
    };
    const onActivity = () => arm();
    arm();
    const events: (keyof WindowEventMap)[] = [
      "mousemove",
      "keydown",
      "click",
      "scroll",
      "touchstart",
    ];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity));
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
    };
  }, [trip]);

  // ── Navigation thrash detection ────────────────────────────────────────
  useEffect(() => {
    const now = Date.now();
    navTimes.current = navTimes.current.filter((t) => now - t < NAV_WINDOW_MS);
    navTimes.current.push(now);
    if (navTimes.current.length >= NAV_THRESHOLD) {
      trip("nav");
    }
    // Dismissals reset on navigation away from the dismissed page
    setStuck(false);
    setReason(null);
  }, [location, trip]);

  // ── Dialog open/close frustration ──────────────────────────────────────
  useEffect(() => {
    // Watches Radix dialogs (data-state="open") and counts open/close cycles
    // per data-testid (or fallback to text content).
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type !== "attributes" || m.attributeName !== "data-state") continue;
        const target = m.target as HTMLElement;
        if (!target.matches?.("[role='dialog'], [role='alertdialog']")) continue;
        const state = target.getAttribute("data-state");
        if (state !== "open" && state !== "closed") continue;
        const key =
          target.getAttribute("data-testid") ||
          target.querySelector("[data-tour-target]")?.getAttribute("data-tour-target") ||
          target.getAttribute("aria-labelledby") ||
          "anonymous-dialog";
        const now = Date.now();
        dialogEvents.current = dialogEvents.current.filter(
          (e) => now - e.at < DIALOG_WINDOW_MS && e.key === key
        );
        dialogEvents.current.push({ at: now, key });
        const sameKeyEvents = dialogEvents.current.filter((e) => e.key === key);
        if (sameKeyEvents.length >= DIALOG_THRESHOLD * 2) {
          // Each open + close = 2 events; 3 cycles = 6 events
          trip("dialog");
        }
      }
    });

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["data-state"],
      subtree: true,
    });
    return () => observer.disconnect();
  }, [trip]);

  const dismiss = useCallback(() => {
    dismissedFor.current.add(location);
    setStuck(false);
    setReason(null);
  }, [location]);

  const reset = useCallback(() => {
    dismissedFor.current.clear();
    navTimes.current = [];
    dialogEvents.current = [];
    setStuck(false);
    setReason(null);
  }, []);

  return { stuck, reason, dismiss, reset };
}
