import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Star, ArrowRight, Clock, FileText, CheckCircle, Download, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

/* ═══════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════ */

interface FeedbackRequest {
  id: number;
  vendorId: number | null;
  userId: string | null;
  requestType: string;
  status: string;
  triggeredAt: string;
  metadata: any;
}

interface FeedbackDialogProps {
  userId?: string;
  vendorId?: number;
}

/* ═══════════════════════════════════════════════════
   Context mapping — requestType → copy + icon
   ═══════════════════════════════════════════════════ */

interface ContextConfig {
  icon: typeof Clock;
  contextLabel: string;
  title: string;
  description: string;
}

const CONTEXT_MAP: Record<string, ContextConfig> = {
  after_report_submit: {
    icon: FileText,
    contextLabel: "Du sendte nettopp inn en rapport.",
    title: "Hvor enkelt var det å sende inn rapporten?",
    description: "Kort tilbakemelding hjelper oss å gjøre prosessen enda enklere.",
  },
  after_approval: {
    icon: CheckCircle,
    contextLabel: "Rapporten din ble behandlet.",
    title: "Var tilbakemeldingen tydelig og nyttig?",
    description: "Vi ønsker å forbedre hvordan godkjenning og tilbakemelding fungerer.",
  },
  after_timesheet: {
    icon: Clock,
    contextLabel: "Du registrerte timer nettopp.",
    title: "Hvor lett var det å registrere timer i dag?",
    description: "Vi jobber med å gjøre timeføring raskere og enklere.",
  },
  after_export: {
    icon: Download,
    contextLabel: "Du eksporterte en PDF.",
    title: "Fungerte eksporten som forventet?",
    description: "Gi oss et raskt inntrykk av eksportopplevelsen.",
  },
  onboarding_week1: {
    icon: Users,
    contextLabel: "Du har brukt Tidum i én uke.",
    title: "Hvor lett var det å komme i gang?",
    description: "De første dagene er viktigst — hjelp oss å gjøre starten bedre.",
  },
  user_milestone: {
    icon: Star,
    contextLabel: "Du har nådd en milepæl i Tidum!",
    title: "Hvordan trives du med Tidum så langt?",
    description: "Fortell oss hva som fungerer — og hva vi kan gjøre bedre.",
  },
  vendor_milestone: {
    icon: Users,
    contextLabel: "Teamet ditt bruker Tidum aktivt.",
    title: "Hvordan passer Tidum for teamet?",
    description: "Tilbakemeldingen din hjelper oss å tilpasse løsningen bedre.",
  },
};

const DEFAULT_CONTEXT: ContextConfig = {
  icon: Star,
  contextLabel: "",
  title: "Hvordan trives du med Tidum?",
  description: "Din tilbakemelding hjelper oss å gjøre tjenesten bedre for alle.",
};

/* ═══════════════════════════════════════════════════
   Quick-reason chips
   ═══════════════════════════════════════════════════ */

const NEGATIVE_CHIPS = [
  "Uklart hva jeg skulle gjøre",
  "For mange steg",
  "Manglet oversikt",
  "Bug / teknisk feil",
  "For tregt",
];

const POSITIVE_CHIPS = [
  "Enkelt og oversiktlig",
  "Sparte tid",
  "Fin struktur",
  "Trygg følelse (GDPR)",
  "Bra design",
];

/* ═══════════════════════════════════════════════════
   Rating labels (B2B-friendly 1–5 scale)
   ═══════════════════════════════════════════════════ */

const RATING_LABELS: Record<number, string> = {
  1: "Dårlig",
  2: "Svakt",
  3: "OK",
  4: "Bra",
  5: "Fantastisk",
};

/* ═══════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════ */

export function FeedbackDialog({ userId, vendorId }: FeedbackDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [selectedChips, setSelectedChips] = useState<string[]>([]);
  const [step, setStep] = useState<1 | 2>(1);
  const openedAt = useRef<number>(0);
  const { toast } = useToast();
  const reduceMotion = useReducedMotion();

  const { data: pendingRequest } = useQuery<FeedbackRequest | null>({
    queryKey: [
      "/api/feedback/pending",
      { userId, vendorId: vendorId?.toString() },
    ],
    enabled: !!(userId || vendorId),
  });

  // Derive context config from request type
  const ctx = useMemo<ContextConfig>(() => {
    if (!pendingRequest) return DEFAULT_CONTEXT;
    return CONTEXT_MAP[pendingRequest.requestType] ?? DEFAULT_CONTEXT;
  }, [pendingRequest]);

  // Available chips based on rating
  const chips = useMemo(
    () => (rating >= 4 ? POSITIVE_CHIPS : NEGATIVE_CHIPS),
    [rating],
  );

  // Open dialog when pending request appears
  useEffect(() => {
    if (pendingRequest && pendingRequest.status === "pending") {
      setIsOpen(true);
      openedAt.current = Date.now();
    }
  }, [pendingRequest]);

  // Reset state when dialog closes
  const resetState = useCallback(() => {
    setRating(0);
    setHoverRating(0);
    setFeedback("");
    setSelectedChips([]);
    setStep(1);
  }, []);

  const toggleChip = useCallback((chip: string) => {
    setSelectedChips((prev) =>
      prev.includes(chip) ? prev.filter((c) => c !== chip) : [...prev, chip],
    );
  }, []);

  /* ── Mutations ── */

  const invalidateFeedback = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/feedback/pending"] });
    queryClient.invalidateQueries({ queryKey: ["/api/feedback/stats"] });
  }, []);

  const submitMutation = useMutation({
    mutationFn: async () => {
      const timeToSubmitMs = Date.now() - openedAt.current;
      const response = await apiRequest("POST", "/api/feedback/respond", {
        requestId: pendingRequest?.id,
        vendorId,
        userId,
        ratingScore: rating,
        satisfactionLabel:
          rating >= 4 ? "satisfied" : rating >= 3 ? "neutral" : "unsatisfied",
        textualFeedback: feedback || null,
        // Instrumentation metadata
        metadata: {
          requestType: pendingRequest?.requestType,
          reasons: selectedChips,
          timeToSubmitMs,
        },
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Takk for tilbakemeldingen!",
        description: "Din vurdering hjelper oss å forbedre tjenesten.",
      });
      setIsOpen(false);
      resetState();
      invalidateFeedback();
    },
    onError: () => {
      toast({
        title: "Noe gikk galt",
        description: "Kunne ikke sende tilbakemeldingen. Prøv igjen senere.",
        variant: "destructive",
      });
    },
  });

  const snoozeMutation = useMutation({
    mutationFn: async (hours: number = 24) => {
      const response = await apiRequest("POST", "/api/feedback/snooze", {
        requestId: pendingRequest?.id,
        snoozeHours: hours,
      });
      return response.json();
    },
    onSuccess: () => {
      setIsOpen(false);
      resetState();
      invalidateFeedback();
    },
  });

  const dismissMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/feedback/dismiss", {
        requestId: pendingRequest?.id,
      });
      return response.json();
    },
    onSuccess: () => {
      setIsOpen(false);
      resetState();
      invalidateFeedback();
    },
  });

  /* ── Handlers ── */

  const handleRatingSelect = useCallback(
    (star: number) => {
      setRating(star);
      // Clear chips if switching between positive/negative
      if ((star >= 4) !== (rating >= 4)) {
        setSelectedChips([]);
      }
    },
    [rating],
  );

  const handleSubmit = useCallback(() => {
    if (rating === 0) {
      toast({
        title: "Velg en vurdering",
        description: "Vennligst velg en vurdering før du sender.",
        variant: "destructive",
      });
      return;
    }
    submitMutation.mutate();
  }, [rating, submitMutation, toast]);

  // ESC / X → auto-snooze 24h instead of hard close
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open && pendingRequest) {
        snoozeMutation.mutate(24);
      }
      setIsOpen(open);
    },
    [pendingRequest, snoozeMutation],
  );

  if (!pendingRequest) return null;

  const CtxIcon = ctx.icon;
  const activeRating = hoverRating || rating;
  const isPositive = rating >= 4;

  /* animation variants */
  const motionProps = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -6 },
        transition: { duration: 0.15 },
      };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-[440px] rounded-2xl border-[#d8e4e0] dark:border-border bg-[linear-gradient(180deg,#ffffff,#f7fbf9)] dark:bg-card shadow-[0_20px_60px_rgba(20,58,65,0.12)] dark:shadow-none p-0 gap-0 overflow-hidden"
        data-testid="feedback-dialog"
      >
        {/* ── Context banner ── */}
        {ctx.contextLabel && (
          <div className="flex items-center gap-2 px-6 pt-5 pb-0">
            <div className="rounded-full bg-[#1F6B73]/10 dark:bg-[#51C2D0]/10 p-1.5">
              <CtxIcon className="h-3.5 w-3.5 text-[#1F6B73] dark:text-[#51C2D0]" />
            </div>
            <p className="text-xs font-medium text-[#5d6d72] dark:text-muted-foreground">
              {ctx.contextLabel}
            </p>
          </div>
        )}

        <DialogHeader className="px-6 pt-4 pb-0">
          <DialogTitle className="text-lg font-semibold text-[#153c46] dark:text-foreground leading-snug">
            {ctx.title}
          </DialogTitle>
          <DialogDescription className="text-sm text-[#5d6d72] dark:text-muted-foreground mt-1">
            {ctx.description}
          </DialogDescription>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {step === 1 ? (
            /* ═══════════ STEP 1 — Rating ═══════════ */
            <motion.div key="step1" {...motionProps} className="px-6 py-5">
              <div className="flex flex-col items-center gap-4">
                {/* Star row with labels */}
                <div className="flex items-end gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      className="group flex flex-col items-center gap-1 p-1 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F6B73] rounded-lg"
                      onClick={() => handleRatingSelect(star)}
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(0)}
                      aria-label={`${star} av 5: ${RATING_LABELS[star]}`}
                      data-testid={`button-star-${star}`}
                    >
                      <Star
                        className={cn(
                          "h-9 w-9 transition-colors",
                          star <= activeRating
                            ? "fill-[#1F6B73] text-[#1F6B73] dark:fill-[#51C2D0] dark:text-[#51C2D0]"
                            : "text-[#d2dfdb] dark:text-border",
                        )}
                      />
                      <span
                        className={cn(
                          "text-[10px] font-medium transition-colors",
                          star <= activeRating
                            ? "text-[#1F6B73] dark:text-[#51C2D0]"
                            : "text-[#5d6d72]/60 dark:text-muted-foreground/50",
                        )}
                      >
                        {RATING_LABELS[star]}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Rating feedback label */}
                <AnimatePresence>
                  {rating > 0 && (
                    <motion.p
                      {...motionProps}
                      className="text-sm font-semibold text-[#1F6B73] dark:text-[#51C2D0]"
                    >
                      {RATING_LABELS[rating]}
                      {rating === 5 && " 🙌"}
                    </motion.p>
                  )}
                </AnimatePresence>

                {/* Step 1 → Step 2 button */}
                {rating > 0 && (
                  <motion.div {...motionProps}>
                    <Button
                      type="button"
                      onClick={() => setStep(2)}
                      className="mt-1 bg-[#1F6B73] hover:bg-[#185a61] dark:bg-[#51C2D0] dark:hover:bg-[#3fb0bd] dark:text-[#0e1a1f] text-white"
                      data-testid="button-continue-step2"
                    >
                      Fortsett
                      <ArrowRight className="ml-1.5 h-4 w-4" />
                    </Button>
                  </motion.div>
                )}
              </div>
            </motion.div>
          ) : (
            /* ═══════════ STEP 2 — Chips + optional comment ═══════════ */
            <motion.div key="step2" {...motionProps} className="px-6 py-5 space-y-5">
              {/* Quick-reason chips */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-[#24383e] dark:text-foreground">
                    {isPositive
                      ? "Hva fungerte spesielt bra?"
                      : "Hva bør vi forbedre først?"}
                  </p>
                  <Badge
                    variant={isPositive ? "default" : "destructive"}
                    className={cn(
                      "text-[10px] px-1.5 py-0",
                      isPositive
                        ? "bg-[#1F6B73]/10 text-[#1F6B73] dark:bg-[#51C2D0]/10 dark:text-[#51C2D0] border-0"
                        : "",
                    )}
                  >
                    {isPositive ? "Positiv" : "Negativ"}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {chips.map((chip) => {
                    const selected = selectedChips.includes(chip);
                    return (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => toggleChip(chip)}
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs font-medium transition-all",
                          selected
                            ? "border-[#1F6B73] dark:border-[#51C2D0] bg-[#1F6B73]/10 dark:bg-[#51C2D0]/10 text-[#1F6B73] dark:text-[#51C2D0]"
                            : "border-[#dbe6e2] dark:border-border text-[#5d6d72] dark:text-muted-foreground hover:border-[#1F6B73]/40 dark:hover:border-[#51C2D0]/40 hover:bg-[#1F6B73]/5 dark:hover:bg-[#51C2D0]/5",
                        )}
                        data-testid={`chip-${chip.slice(0, 12).replace(/\s/g, "-").toLowerCase()}`}
                      >
                        {chip}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Context-aware textarea */}
              <div className="space-y-1.5">
                <label
                  htmlFor="feedback"
                  className="text-sm font-medium text-[#24383e] dark:text-foreground"
                >
                  {isPositive
                    ? "Noe mer du vil dele? (valgfritt)"
                    : "Hva kan vi gjøre bedre? (valgfritt)"}
                </label>
                <Textarea
                  id="feedback"
                  placeholder={
                    isPositive
                      ? "Fortell oss hva som gjør Tidum bra for deg..."
                      : "Beskriv hva som ikke fungerte..."
                  }
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  className="min-h-[72px] rounded-xl border-[#dbe6e2] dark:border-border bg-white dark:bg-[#0f191e] text-sm placeholder:text-[#5d6d72]/50 focus-visible:ring-[#1F6B73] dark:focus-visible:ring-[#51C2D0]"
                  data-testid="input-feedback-text"
                />
              </div>

              {/* Selected rating indicator */}
              <div className="flex items-center gap-2 mb-1">
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star
                      key={s}
                      className={cn(
                        "h-3.5 w-3.5",
                        s <= rating
                          ? "fill-[#1F6B73] text-[#1F6B73] dark:fill-[#51C2D0] dark:text-[#51C2D0]"
                          : "text-[#d2dfdb] dark:text-border",
                      )}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-[11px] text-[#1F6B73] dark:text-[#51C2D0] hover:underline font-medium"
                >
                  Endre
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Footer actions ── */}
        <div className="border-t border-[#dbe6e2] dark:border-border bg-[#f7fbf9] dark:bg-[#0f191e] px-6 py-4 space-y-2">
          {step === 2 && (
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={submitMutation.isPending}
              className="w-full bg-[#1F6B73] hover:bg-[#185a61] dark:bg-[#51C2D0] dark:hover:bg-[#3fb0bd] dark:text-[#0e1a1f] text-white rounded-xl h-10"
              data-testid="button-submit-feedback"
            >
              {submitMutation.isPending ? "Sender..." : "Send tilbakemelding"}
            </Button>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => snoozeMutation.mutate(72)}
              disabled={snoozeMutation.isPending}
              className="flex-1 rounded-xl border-[#dbe6e2] dark:border-border text-[#5d6d72] dark:text-muted-foreground text-xs h-9"
              data-testid="button-snooze-feedback"
            >
              Spør meg senere
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => dismissMutation.mutate()}
              disabled={dismissMutation.isPending}
              className="flex-1 rounded-xl text-[#5d6d72] dark:text-muted-foreground text-xs h-9 hover:bg-[#1F6B73]/5"
              data-testid="button-dismiss-feedback"
            >
              Ikke spør igjen denne måneden
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
