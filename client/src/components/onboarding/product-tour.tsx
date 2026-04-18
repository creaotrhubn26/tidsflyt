/**
 * Interactive product tour: spotlight overlay + tooltip card stepping through
 * key UI anchors. Auto-launches on first visit (controlled by tourCompleted
 * in user settings). Skippable, replayable via `?tour=restart`.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { createPortal } from "react-dom";
import { ArrowRight, ChevronLeft, ChevronRight, HelpCircle, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface TourStep {
  id: string;
  title: string;
  body: string;
  /** CSS selector for the element to highlight. Omit for centered modal. */
  selector?: string;
  /** Where to place the tooltip relative to the target. */
  placement?: "top" | "bottom" | "left" | "right" | "center";
  /** Optional path to navigate to before showing this step. */
  navigateTo?: string;
}

interface ProductTourProps {
  steps: TourStep[];
  open: boolean;
  startIndex?: number;
  onClose: (completed: boolean) => void;
}

const PADDING = 8;
const TOOLTIP_WIDTH = 340;
const TOOLTIP_OFFSET = 14;

export function ProductTour({ steps, open, startIndex = 0, onClose }: ProductTourProps) {
  const [, navigate] = useLocation();
  const [stepIndex, setStepIndex] = useState(startIndex);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [vp, setVp] = useState({ w: typeof window !== "undefined" ? window.innerWidth : 0, h: typeof window !== "undefined" ? window.innerHeight : 0 });

  const currentStep = steps[stepIndex];

  // Reset on open/close
  useEffect(() => {
    if (open) setStepIndex(startIndex);
  }, [open, startIndex]);

  // Navigate when step requests it
  useEffect(() => {
    if (!open || !currentStep?.navigateTo) return;
    if (window.location.pathname !== currentStep.navigateTo) {
      navigate(currentStep.navigateTo);
    }
  }, [open, currentStep, navigate]);

  // Track viewport
  useEffect(() => {
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Re-measure target on step change + window resize + interval (for layout shifts)
  const measure = useCallback(() => {
    if (!open || !currentStep?.selector) {
      setRect(null);
      return;
    }
    const el = document.querySelector(currentStep.selector) as HTMLElement | null;
    if (!el) {
      setRect(null);
      return;
    }
    el.scrollIntoView({ behavior: "auto", block: "center" });
    const r = el.getBoundingClientRect();
    setRect(r);
  }, [open, currentStep]);

  useLayoutEffect(() => {
    if (!open) return;
    measure();
    const id = window.setInterval(measure, 400);
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [open, measure]);

  // Lock body scroll while tour is active
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  // Keyboard nav
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose(false);
      else if (e.key === "ArrowRight") goNext();
      else if (e.key === "ArrowLeft") goPrev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, stepIndex, steps.length]);

  const goNext = useCallback(() => {
    if (stepIndex >= steps.length - 1) {
      onClose(true);
    } else {
      setStepIndex((i) => i + 1);
    }
  }, [stepIndex, steps.length, onClose]);

  const goPrev = useCallback(() => {
    setStepIndex((i) => Math.max(0, i - 1));
  }, []);

  const tooltipPos = useMemo(() => {
    if (!currentStep) return { left: 0, top: 0, placement: "center" as const };
    const placement = currentStep.placement ?? (rect ? "right" : "center");

    if (placement === "center" || !rect) {
      return {
        left: Math.max(16, (vp.w - TOOLTIP_WIDTH) / 2),
        top: Math.max(16, vp.h / 2 - 140),
        placement: "center" as const,
      };
    }

    let left = 0;
    let top = 0;
    switch (placement) {
      case "right":
        left = rect.right + TOOLTIP_OFFSET;
        top = rect.top + rect.height / 2 - 80;
        break;
      case "left":
        left = rect.left - TOOLTIP_OFFSET - TOOLTIP_WIDTH;
        top = rect.top + rect.height / 2 - 80;
        break;
      case "bottom":
        left = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2;
        top = rect.bottom + TOOLTIP_OFFSET;
        break;
      case "top":
        left = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2;
        top = rect.top - TOOLTIP_OFFSET - 200;
        break;
    }
    // Clamp to viewport
    left = Math.max(12, Math.min(left, vp.w - TOOLTIP_WIDTH - 12));
    top = Math.max(12, Math.min(top, vp.h - 220));
    return { left, top, placement };
  }, [currentStep, rect, vp]);

  if (!open || !currentStep) return null;

  const isCentered = tooltipPos.placement === "center";

  return createPortal(
    <div className="fixed inset-0 z-[9999] pointer-events-none" data-tour-overlay>
      {/* Spotlight via SVG mask: full-screen overlay minus target rect */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-auto"
        onClick={(e) => {
          // Click outside spotlight closes
          if (e.target === e.currentTarget) onClose(false);
        }}
      >
        <defs>
          <mask id="tour-mask">
            <rect width="100%" height="100%" fill="white" />
            {rect && !isCentered && (
              <rect
                x={Math.max(0, rect.left - PADDING)}
                y={Math.max(0, rect.top - PADDING)}
                width={rect.width + PADDING * 2}
                height={rect.height + PADDING * 2}
                rx={10}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(15, 23, 42, 0.65)"
          mask="url(#tour-mask)"
        />
        {rect && !isCentered && (
          <rect
            x={rect.left - PADDING}
            y={rect.top - PADDING}
            width={rect.width + PADDING * 2}
            height={rect.height + PADDING * 2}
            rx={10}
            fill="none"
            stroke="rgb(16, 185, 129)"
            strokeWidth={2}
            className="animate-pulse"
          />
        )}
      </svg>

      {/* Tooltip card */}
      <div
        className={cn(
          "absolute pointer-events-auto rounded-xl bg-white text-slate-900 shadow-2xl border border-slate-200 overflow-hidden",
          "animate-in fade-in slide-in-from-bottom-2 duration-200"
        )}
        style={{ left: tooltipPos.left, top: tooltipPos.top, width: TOOLTIP_WIDTH }}
        data-tour-tooltip
      >
        <div className="px-5 py-4 bg-gradient-to-r from-emerald-500 to-teal-600 text-white flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          <span className="text-xs font-semibold uppercase tracking-wider opacity-95">
            Steg {stepIndex + 1} av {steps.length}
          </span>
          <button
            type="button"
            onClick={() => onClose(false)}
            className="ml-auto -mr-1 h-7 w-7 rounded-md flex items-center justify-center hover:bg-white/15 transition-colors"
            aria-label="Lukk omvisning"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-2">
          <h3 className="text-base font-bold leading-tight">{currentStep.title}</h3>
          <p className="text-sm text-slate-600 leading-relaxed">{currentStep.body}</p>
        </div>
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => onClose(false)}
            className="text-xs text-slate-500 hover:text-slate-700"
          >
            Hopp over
          </button>
          <div className="flex items-center gap-2">
            {stepIndex > 0 && (
              <Button variant="outline" size="sm" onClick={goPrev}>
                <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                Tilbake
              </Button>
            )}
            <Button size="sm" onClick={goNext}>
              {stepIndex >= steps.length - 1 ? (
                <>
                  Ferdig
                  <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </>
              ) : (
                <>
                  Neste
                  <ChevronRight className="h-3.5 w-3.5 ml-1" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Default tour steps for Tidum (referenced from PortalLayout).
   Anchored to existing data-testid selectors in the sidebar.
   ───────────────────────────────────────────────────────────────────────── */

export const DEFAULT_TIDUM_TOUR: TourStep[] = [
  {
    id: "welcome",
    title: "Velkommen til Tidum 👋",
    body: "Vi tar deg gjennom de viktigste delene på under et minutt. Du kan hoppe over når som helst.",
    placement: "center",
    navigateTo: "/dashboard",
  },
  {
    id: "dashboard",
    title: "Dashboardet er hjemmebasen",
    body: "Her ser du alt som krever oppfølging — rapporter, tiltak, klientsaker. Tilpasses din rolle.",
    selector: '[data-testid="sidebar-dashboard"]',
    placement: "right",
  },
  {
    id: "saker",
    title: "Saker og klienter",
    body: "Opprett saker direkte fra Brønnøysundregisteret, tildel miljøarbeidere og hold institusjonene oversiktlige.",
    selector: '[data-testid="guide-category-saker"], [data-testid="sidebar-saker"], [data-testid="sidebar-institusjoner"]',
    placement: "right",
  },
  {
    id: "rapportering",
    title: "Rapportering",
    body: "Skriv saksrapporter med auto‑lagring. Bedrift og oppdragsgiver fylles automatisk fra saken.",
    selector: '[data-testid="sidebar-rapporter"]',
    placement: "right",
  },
  {
    id: "tid",
    title: "Tid og fravær",
    body: "Stempel inn/ut, registrer aktivitet, søk om fravær — alt i én flyt.",
    selector: '[data-testid="sidebar-timeføring"]',
    placement: "right",
  },
  {
    id: "help",
    title: "Trenger du hjelp underveis?",
    body: "«Kom i gang med Tidum» finner du alltid i menyen. For en komplett guide, besøk /guide.",
    selector: '[data-testid="sidebar-kom-i-gang-med-tidum"]',
    placement: "right",
  },
];

/**
 * Floating "?" button shown after the tour is dismissed — restarts the tour
 * or opens the guide. Mounted from PortalLayout.
 */
export function TourReplayButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed bottom-6 right-6 z-40 h-12 w-12 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center"
      aria-label="Start omvisning på nytt"
      title="Start omvisning på nytt"
      data-testid="tour-replay-button"
    >
      <HelpCircle className="h-5 w-5" />
    </button>
  );
}
