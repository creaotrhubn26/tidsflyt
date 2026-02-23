import { CheckCircle2, ChevronRight, FileText, Clock3, CalendarClock, Check } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const TIMER_STORAGE_KEY = "tidum-worker-mobile-timer-v1";

export interface WorkerTodaySignal {
  id: string;
  label: string;
  value: number;
  tone: "green" | "yellow" | "red";
}

export interface WorkerParticipant {
  id: string;
  name: string;
  tiltak: string;
  lastFollowupLabel: string;
  status: "i-rute" | "snart-frist" | "trenger-oppfolging";
}

interface DashboardWorkerMobileProps {
  userId?: string;
  userName?: string;
  todaySignals: WorkerTodaySignal[];
  participants: WorkerParticipant[];
  navigate: (path: string) => void;
}

const toneStyles = {
  green: "border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/25",
  yellow: "border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/25",
  red: "border-red-200 dark:border-red-800 bg-red-50/60 dark:bg-red-950/25",
} as const;

export function DashboardWorkerMobile({
  userId = "default",
  userName = "Maria",
  todaySignals,
  participants,
  navigate,
}: DashboardWorkerMobileProps) {
  const { toast } = useToast();
  const [elapsedSeconds, setElapsedSeconds] = useState(() => {
    if (typeof window === "undefined") return 2 * 60 * 60 + 15 * 60;

    try {
      const rawState = window.localStorage.getItem(TIMER_STORAGE_KEY);
      if (!rawState) return 2 * 60 * 60 + 15 * 60;
      const parsedState = JSON.parse(rawState) as {
        elapsedSeconds?: number;
      };
      return parsedState.elapsedSeconds ?? 2 * 60 * 60 + 15 * 60;
    } catch {
      return 2 * 60 * 60 + 15 * 60;
    }
  });
  const [pausedSeconds, setPausedSeconds] = useState(() => {
    if (typeof window === "undefined") return 30;

    try {
      const rawState = window.localStorage.getItem(TIMER_STORAGE_KEY);
      if (!rawState) return 30;
      const parsedState = JSON.parse(rawState) as {
        pausedSeconds?: number;
      };
      return parsedState.pausedSeconds ?? 30;
    } catch {
      return 30;
    }
  });
  const [isRunning, setIsRunning] = useState(() => {
    if (typeof window === "undefined") return true;

    try {
      const rawState = window.localStorage.getItem(TIMER_STORAGE_KEY);
      if (!rawState) return true;
      const parsedState = JSON.parse(rawState) as {
        isRunning?: boolean;
      };
      return parsedState.isRunning ?? true;
    } catch {
      return true;
    }
  });
  const [pauseStartedAt, setPauseStartedAt] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;

    try {
      const rawState = window.localStorage.getItem(TIMER_STORAGE_KEY);
      if (!rawState) return null;
      const parsedState = JSON.parse(rawState) as {
        pauseStartedAt?: number | null;
      };
      return parsedState.pauseStartedAt ?? null;
    } catch {
      return null;
    }
  });
  const [nowSeconds, setNowSeconds] = useState(() => Math.floor(Date.now() / 1000));
  const [isSaving, setIsSaving] = useState(false);
  const [sessionHydrated, setSessionHydrated] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  // Refs for requestAnimationFrame smooth clock hand
  const clockHandRef = useRef<SVGLineElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);

    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);

    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowSeconds(Math.floor(Date.now() / 1000));
      if (isRunning) {
        setElapsedSeconds((current) => current + 1);
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isRunning]);

  // Smooth continuous clock hand rotation via requestAnimationFrame
  // One full 360° rotation = 3600 seconds (60 minutes)
  useEffect(() => {
    cancelAnimationFrame(rafRef.current);

    if (!isRunning) {
      // When paused: freeze at current position
      if (clockHandRef.current) {
        const deg = (elapsedSeconds % 3600) / 3600 * 360;
        clockHandRef.current.setAttribute("transform", `rotate(${deg} 100 100)`);
      }
      return;
    }

    // Snapshot wall-clock and elapsed at the moment tracking starts/resumes
    const wallStart = performance.now();
    const elapsedStart = elapsedSeconds;

    const tick = (now: number) => {
      const dt = (now - wallStart) / 1000;
      const totalElapsed = elapsedStart + dt;
      const deg = (totalElapsed % 3600) / 3600 * 360;
      if (clockHandRef.current) {
        clockHandRef.current.setAttribute("transform", `rotate(${deg} 100 100)`);
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // Only restart animation loop when running state or hydration changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning, sessionHydrated]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    window.localStorage.setItem(
      TIMER_STORAGE_KEY,
      JSON.stringify({
        elapsedSeconds,
        pausedSeconds,
        isRunning,
        pauseStartedAt,
      }),
    );
  }, [elapsedSeconds, pausedSeconds, isRunning, pauseStartedAt]);

  const syncTimerSession = useCallback(async () => {
    if (!userId) return;

    try {
      await apiRequest("POST", "/api/timer-session", {
        userId,
        elapsedSeconds,
        pausedSeconds,
        isRunning,
        pauseStartedAt: pauseStartedAt ? new Date(pauseStartedAt).toISOString() : null,
      });
    } catch {
      // ignore sync errors; local state remains source of truth for UX continuity
    }
  }, [userId, elapsedSeconds, pausedSeconds, isRunning, pauseStartedAt]);

  useEffect(() => {
    let cancelled = false;

    const loadSession = async () => {
      if (!userId) {
        setSessionHydrated(true);
        return;
      }

      try {
        const res = await apiRequest("GET", `/api/timer-session?userId=${encodeURIComponent(userId)}`);
        const session = await res.json();
        if (!cancelled && session) {
          if (typeof session.elapsedSeconds === "number") setElapsedSeconds(session.elapsedSeconds);
          if (typeof session.pausedSeconds === "number") setPausedSeconds(session.pausedSeconds);
          if (typeof session.isRunning === "boolean") setIsRunning(session.isRunning);
          setPauseStartedAt(session.pauseStartedAt ? new Date(session.pauseStartedAt).getTime() : null);
        }
      } catch {
        // ignore hydrate errors; localStorage fallback still works
      } finally {
        if (!cancelled) setSessionHydrated(true);
      }
    };

    void loadSession();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!sessionHydrated || !userId) return;

    if (isRunning && elapsedSeconds > 0 && elapsedSeconds % 15 === 0) {
      void syncTimerSession();
    }
  }, [sessionHydrated, userId, isRunning, elapsedSeconds, syncTimerSession]);

  useEffect(() => {
    if (!sessionHydrated || !userId) return;
    void syncTimerSession();
  }, [sessionHydrated, userId, isRunning, pauseStartedAt, pausedSeconds, syncTimerSession]);

  const currentPauseSeconds = !isRunning && pauseStartedAt
    ? pausedSeconds + nowSeconds - Math.floor(pauseStartedAt / 1000)
    : pausedSeconds;

  const pauseTotalMinutes = Math.floor(currentPauseSeconds / 60);
  const pauseHours = Math.floor(pauseTotalMinutes / 60);
  const pauseMinutes = pauseTotalMinutes % 60;
  const pauseText = `${String(pauseHours).padStart(2, "0")}:${String(pauseMinutes).padStart(2, "0")}`;

  const handleTogglePause = () => {
    if (isRunning) {
      setIsRunning(false);
      setPauseStartedAt(Date.now());
      return;
    }

    if (pauseStartedAt) {
      const additionalPaused = Math.max(0, Math.floor((Date.now() - pauseStartedAt) / 1000));
      setPausedSeconds((current) => current + additionalPaused);
    }
    setPauseStartedAt(null);
    setIsRunning(true);
  };

  const handleFinish = async () => {
    if (isSaving) return;

    if (pauseStartedAt) {
      const additionalPaused = Math.max(0, Math.floor((Date.now() - pauseStartedAt) / 1000));
      setPausedSeconds((current) => current + additionalPaused);
      setPauseStartedAt(null);
    }

    const loggedHours = Math.round((elapsedSeconds / 3600) * 100) / 100;
    if (loggedHours <= 0) {
      toast({
        title: "Ingen tid å lagre",
        description: "Registreringen må være minst ett minutt før den kan lagres.",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);

    try {
      await apiRequest("POST", "/api/time-entries", {
        userId,
        caseNumber: "general",
        description: "Registrert fra Min arbeidsdag",
        hours: loggedHours,
        date: new Date().toISOString().slice(0, 10),
        status: "pending",
      });

      setIsRunning(false);
      setElapsedSeconds(0);
      setPausedSeconds(0);
      setPauseStartedAt(null);
      try {
        await apiRequest("DELETE", `/api/timer-session/${encodeURIComponent(userId)}`);
      } catch {
        // ignore cleanup failure
      }
      toast({ title: "Lagret", description: "Timene er lagret i databasen." });
      navigate("/time-tracking");
    } catch (error: any) {
      toast({
        title: "Kunne ikke lagre",
        description: error?.message || "DB-lagring feilet. Prøv igjen.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const elapsed = useMemo(() => {
    const totalMinutes = Math.floor(elapsedSeconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return { hours, minutes, totalMinutes };
  }, [elapsedSeconds]);

  const targetMinutes = 8 * 60;
  const progressPercent = Math.min(100, Math.max(0, (elapsed.totalMinutes / targetMinutes) * 100));
  const circumference = 2 * Math.PI * 88;
  const progressArc = (progressPercent / 100) * circumference;
  const isFinished = !isRunning && elapsedSeconds === 0 && sessionHydrated;

  const missingNotes = todaySignals[1]?.value ?? 0;
  const nearDeadline = todaySignals[2]?.value ?? 0;
  const totalWeekHours = 37;
  const totalWeekMinutes = 20;

  const activityRows = participants.slice(0, 4).map((participant, index) => ({
    id: participant.id,
    day: ["Onsdag", "Tirsdag", "Mandag", "Søndag"][index] ?? "I dag",
    from: index === 3 ? "--:--" : "08:00",
    to: index === 3 ? "--:--" : index === 0 ? "15:30" : "16:00",
    saved: participant.status !== "trenger-oppfolging",
  }));

  return (
    <div data-testid="worker-mobile-root" className="space-y-3 md:hidden">
      {/* Breathing animation keyframes — active only while tracking */}
      <style>{`
        @keyframes tidum-breathe {
          0%, 100% { opacity: 0.98; }
          50% { opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          .tidum-animated-card {
            animation: none !important;
          }
          .tidum-transition {
            transition: none !important;
          }
        }
      `}</style>

      <div className="px-0.5">
        <h2 className="text-[28px] leading-none font-semibold tracking-tight text-foreground">
          Hei, {userName}!
        </h2>
      </div>

      <Card
        data-testid="worker-top-card"
        className={cn(
          "tidum-animated-card overflow-hidden rounded-[24px] border border-border bg-card shadow-[0_10px_26px_rgba(26,52,59,0.07)]",
          isRunning && !prefersReducedMotion && "animate-[tidum-breathe_4s_cubic-bezier(0.4,0,0.2,1)_infinite]",
        )}
      >
        <div className="flex items-center gap-2 border-b border-border bg-muted px-4 py-2 text-muted-foreground">
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary/15 text-primary">✓</span>
          <p className="text-[15px] font-medium">
            {isRunning ? "Du er i gang! Registreringen pågår" : "Registrering pauset"}
          </p>
        </div>
        <CardContent className="px-4 pt-3 pb-4">
          <div className="flex items-center gap-4">
            <svg
              viewBox="0 0 200 200"
                className={cn(
                  "h-[150px] w-[150px] shrink-0 motion-reduce:transition-none",
                  isFinished ? "opacity-40" : !isRunning ? "opacity-70" : "opacity-100",
                  !prefersReducedMotion && "transition-opacity duration-500",
                )}
                role="img"
              aria-label="Analog klokke"
            >
              {/* Track ring */}
              <circle cx="100" cy="100" r="88" fill="none" stroke="hsl(var(--muted))" strokeWidth="6" />
              {/* Progress arc — smooth 1s linear transition */}
              <circle
                cx="100" cy="100" r="88"
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={`${progressArc} ${circumference}`}
                transform="rotate(-90 100 100)"
                className="tidum-transition"
              />
              {/* Clock face */}
              <circle cx="100" cy="100" r="82" className="fill-white dark:fill-[hsl(var(--card))]" />
              {/* Tick marks at 12, 3, 6, 9 */}
              <line x1="100" y1="22" x2="100" y2="34" stroke="hsl(var(--border))" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="100" y1="166" x2="100" y2="178" stroke="hsl(var(--border))" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="22" y1="100" x2="34" y2="100" stroke="hsl(var(--border))" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="166" y1="100" x2="178" y2="100" stroke="hsl(var(--border))" strokeWidth="1.5" strokeLinecap="round" />
              {/* Clock hand — positioned via requestAnimationFrame for continuous smooth rotation */}
              <line
                ref={clockHandRef}
                data-testid="worker-clock-hand"
                x1="100" y1="100" x2="100" y2="32"
                stroke="hsl(var(--primary))"
                strokeWidth="2.5"
                strokeLinecap="round"
                transform={`rotate(${(elapsedSeconds % 3600) / 3600 * 360} 100 100)`}
              />
              {/* Center dot */}
              <circle cx="100" cy="100" r="5" fill="hsl(var(--primary))" />
            </svg>
            <div className="min-w-0 flex-1">
              <p role="timer" aria-live="polite" className="text-[32px] leading-none font-semibold tracking-tight text-foreground tabular-nums">
                {elapsed.hours} t {String(elapsed.minutes).padStart(2, "0")}
                <span className="ml-1 text-[22px] font-medium text-muted-foreground">min</span>
              </p>
              <div className="mt-2 border-t border-border pt-2">
                <Button
                  variant="outline"
                  className="h-11 w-full rounded-[12px] border-border bg-muted text-foreground hover:bg-muted/80"
                  onClick={handleTogglePause}
                >
                  <span className="text-lg font-semibold">{isRunning ? "Pause" : "Fortsett"}</span>
                  <span className="mx-3 h-5 w-px bg-border" />
                  <span className="text-[15px] leading-none font-medium tabular-nums text-muted-foreground">{pauseText} min</span>
                  <ChevronRight className="ml-2 h-4 w-4 text-muted-foreground" />
                </Button>
                <Button
                  className="mt-2 h-11 w-full rounded-[12px] bg-primary hover:bg-primary/90 text-primary-foreground text-lg leading-none font-semibold"
                  onClick={handleFinish}
                  disabled={isSaving}
                >
                  {isSaving ? "Lagrer…" : "Ferdig"}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="px-4 py-2 border-b border-border bg-muted">
          <p className="flex items-center gap-2 text-[18px] font-medium text-foreground">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-primary" />
            {isRunning ? "Registrering pågår…" : "Registrering pauset"}
          </p>
        </div>
        <CardContent className="p-4">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span className="tabular-nums">{elapsed.hours} t {String(elapsed.minutes).padStart(2, "0")} min registrert</span>
            <span className="tabular-nums">8 t mål</span>
          </div>
          <Progress value={progressPercent} className="mt-2 h-2 bg-muted" />
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card className={cn("rounded-2xl border p-0", toneStyles.yellow)}>
          <CardContent className="p-3.5">
            <div className="flex items-center gap-2 text-foreground">
              <Clock3 className="h-4 w-4" />
              <p className="font-semibold">I dag</p>
            </div>
            <p className="mt-2 text-[20px] leading-none font-medium tabular-nums text-foreground">08:00 – 16:00</p>
            <p className="mt-1 text-xs text-muted-foreground">Registrert i dag</p>
          </CardContent>
        </Card>
        <Card className={cn("rounded-2xl border p-0", toneStyles.green)}>
          <CardContent className="p-3.5">
            <div className="flex items-center gap-2 text-foreground">
              <CalendarClock className="h-4 w-4" />
              <p className="font-semibold">Sist uke</p>
            </div>
            <p className="mt-2 text-[20px] leading-none font-medium tabular-nums text-foreground">{totalWeekHours} t {String(totalWeekMinutes).padStart(2, "0")} min</p>
            <p className="mt-1 text-xs text-muted-foreground">Total arbeidstid</p>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border-border bg-card shadow-sm">
        <CardContent className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xl leading-none font-semibold tracking-tight text-foreground">Aktivitet</h3>
            <Button aria-label="Gå til oppfølging" title="Gå til oppfølging" variant="ghost" size="sm" className="h-8 px-2" onClick={() => navigate("/case-reports")}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-1.5">
            {activityRows.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => navigate("/case-reports")}
                className="w-full rounded-xl border border-border px-3 py-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-muted">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    </span>
                    <span className="text-[15px] leading-none font-medium text-foreground truncate">{row.day}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground tabular-nums">
                    <span>{row.from} – {row.to}</span>
                    {row.saved ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                        <Check className="h-3.5 w-3.5" />
                        Lagret
                      </span>
                    ) : null}
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button onClick={() => navigate("/case-reports?create=1")} className="w-full rounded-xl bg-primary text-primary-foreground hover:bg-primary/90">
              Ny oppfølging
            </Button>
            <Button variant="outline" onClick={() => navigate("/case-reports")} className="w-full rounded-xl">
              Hurtignotat
            </Button>
          </div>

          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>{missingNotes} notater gjenstår</span>
            <span>{nearDeadline} nær frist</span>
          </div>

          <Button variant="ghost" className="mt-1.5 w-full text-primary" onClick={() => navigate("/case-reports")}>
            <CheckCircle2 className="h-4 w-4 mr-1.5" />
            Trenger støtte
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
