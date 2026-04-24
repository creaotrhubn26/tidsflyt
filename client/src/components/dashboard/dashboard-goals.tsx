import { useState, useMemo } from "react";
import {
  Target,
  Clock,
  CheckCircle,
  Briefcase,
  ChevronDown,
  Info,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface StatsData {
  totalHours: number;
  pendingApprovals: number;
  casesThisWeek: number;
}

export interface DashboardKpi {
  id: string | number;
  title: string;
  current: number;
  target: number;
  unit: string;
  icon: "clock" | "check" | "briefcase" | "target";
  color: "blue" | "green" | "purple";
  tooltip: string;
  extraLabel: string | null;
  insufficient: boolean;
  lowerIsBetter?: boolean;
}

interface DashboardGoalsProps {
  stats: StatsData | undefined;
  mode?: "default" | "tiltaksleder" | "miljoarbeider";
  // When provided, overrides the stats-derived goals with real KPIs computed
  // server-side (see /api/dashboard/kpis). Used for tiltaksleder + miljøarbeider.
  kpis?: DashboardKpi[] | null;
  // Per-user targets (user-level fallback); used for default-mode goals.
  targets?: {
    monthlyHoursTarget?: number;
    weeklyCasesTarget?: number;
  };
}

const COLOR_CLASSES = {
  blue: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40",
  green: "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/40",
  purple: "text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40",
} as const;

const ICON_MAP = {
  clock: Clock,
  check: CheckCircle,
  briefcase: Briefcase,
  target: Target,
} as const;

export function DashboardGoals({ stats, mode = "default", kpis, targets }: DashboardGoalsProps) {
  const [open, setOpen] = useState(true);
  const isTiltaksleder = mode === "tiltaksleder";
  const isMiljoarbeider = mode === "miljoarbeider";

  const goals = useMemo<DashboardKpi[]>(() => {
    // Prefer real server-computed KPIs when provided (tiltaksleder + miljøarbeider).
    if (Array.isArray(kpis) && kpis.length > 0) {
      return kpis;
    }

    const totalHours = stats?.totalHours ?? 0;
    const pending = stats?.pendingApprovals ?? 0;
    const workDays = totalHours / 8;

    let approvalRate: number | null = null;
    let approvalInsufficient = false;
    if (workDays < 1) {
      approvalInsufficient = true;
    } else {
      approvalRate = Math.max(0, Math.min(100, 100 - (pending / workDays) * 100));
    }

    if (isTiltaksleder || isMiljoarbeider) {
      // Real KPIs for these modes come from the server via the `kpis` prop.
      // Return empty until they arrive — avoids rendering synthetic placeholders.
      return [];
    }

    const monthlyHoursTarget = targets?.monthlyHoursTarget ?? 160;
    const weeklyCasesTarget = targets?.weeklyCasesTarget ?? 15;

    return [
      {
        id: 1,
        title: "Månedlige timer",
        current: totalHours,
        target: monthlyHoursTarget,
        unit: "timer",
        icon: "clock",
        color: "blue",
        tooltip: `Totalt registrerte timer denne måneden vs. ${monthlyHoursTarget} t mål`,
        extraLabel: null,
        insufficient: false,
      },
      {
        id: 2,
        title: "Godkjenningsrate",
        current: approvalRate ?? 0,
        target: 100,
        unit: "%",
        icon: "check",
        color: "green",
        tooltip:
          "100% \u2212 (ventende godkjenninger \u00f7 arbeidsdager) \u00d7 100. Krever minst 1 arbeidsdag med data.",
        extraLabel: pending > 0 ? `${pending} ventende` : null,
        insufficient: approvalInsufficient,
      },
      {
        id: 3,
        title: "Aktive saker",
        current: stats?.casesThisWeek ?? 0,
        target: weeklyCasesTarget,
        unit: "saker",
        icon: "briefcase",
        color: "purple",
        tooltip: `Antall saker opprettet denne uken vs. ukentlig mål (${weeklyCasesTarget})`,
        extraLabel: null,
        insufficient: false,
      },
    ];
  }, [stats, isTiltaksleder, isMiljoarbeider, kpis, targets]);

  return (
    <Card className="rounded-2xl border-border bg-card shadow-sm">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader className="pb-3">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center justify-between text-left"
            >
              <CardTitle className="flex items-center gap-2 text-lg">
                <Target className="h-5 w-5 text-primary" />
                {isTiltaksleder
                  ? "Kvalitet og kontinuitet"
                  : isMiljoarbeider
                  ? "Min fremdrift"
                  : "Mål og fremdrift"}
              </CardTitle>
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform duration-200",
                  open && "rotate-180",
                )}
              />
            </button>
          </CollapsibleTrigger>
          <CardDescription>
            {isTiltaksleder
              ? "Faglig kvalitet i oppfølging og dokumentasjon"
              : isMiljoarbeider
              ? "Timer, rapporter og saker jeg følger opp"
              : "Spor fremdrift mot månedlige mål"}
          </CardDescription>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="pt-0">
            <div className="space-y-4">
              {goals.length === 0 && (isTiltaksleder || isMiljoarbeider) && (
                <p className="text-sm text-muted-foreground">Laster KPI-er…</p>
              )}
              {goals.map((goal) => {
                const Icon = typeof goal.icon === "string" ? ICON_MAP[goal.icon] : goal.icon;
                let percentage: number;
                if (goal.insufficient) {
                  percentage = 0;
                } else if (goal.lowerIsBetter) {
                  // For targets where lower is better (e.g. pending backlog, days between follow-ups),
                  // map current=target → 100%, current=0 → 100% when target=0, linear decay beyond target.
                  if (goal.target <= 0) {
                    percentage = goal.current === 0 ? 100 : 0;
                  } else if (goal.current <= goal.target) {
                    percentage = 100;
                  } else {
                    percentage = Math.max(0, 100 - ((goal.current - goal.target) / goal.target) * 100);
                  }
                } else {
                  percentage = Math.min(Math.max((goal.current / Math.max(goal.target, 0.001)) * 100, 0), 100);
                }

                return (
                  <div key={goal.id} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={cn("p-1.5 rounded-lg", COLOR_CLASSES[goal.color])}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <span className="text-sm font-medium">{goal.title}</span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-3.5 w-3.5 text-muted-foreground/50 hover:text-muted-foreground cursor-help transition-colors" />
                          </TooltipTrigger>
                          <TooltipContent
                            side="top"
                            className="max-w-[240px] text-xs leading-relaxed"
                          >
                            {goal.tooltip}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <div className="text-right">
                        {goal.insufficient ? (
                          <span className="text-xs italic text-muted-foreground">
                            Ikke nok data
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground tabular-nums">
                            {goal.lowerIsBetter && goal.target === 0
                              ? `${goal.current.toFixed(0)} ${goal.unit}`.trim()
                              : `${goal.current.toFixed(goal.unit === "%" ? 0 : 1)} / ${goal.target} ${goal.unit}`.trim()}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Progress value={percentage} className="flex-1 h-2" />
                      <span className="text-xs font-medium text-muted-foreground w-12 text-right tabular-nums">
                        {goal.insufficient ? "\u2014" : `${percentage.toFixed(0)}%`}
                      </span>
                    </div>
                    {goal.extraLabel && (
                      <p className="text-xs text-muted-foreground pl-9">{goal.extraLabel}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
