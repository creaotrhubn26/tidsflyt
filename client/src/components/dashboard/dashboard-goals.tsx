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

interface DashboardGoalsProps {
  stats: StatsData | undefined;
  mode?: "default" | "tiltaksleder";
}

const COLOR_CLASSES = {
  blue: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40",
  green: "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/40",
  purple: "text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40",
} as const;

export function DashboardGoals({ stats, mode = "default" }: DashboardGoalsProps) {
  const [open, setOpen] = useState(true);
  const isTiltaksleder = mode === "tiltaksleder";

  const goals = useMemo(() => {
    const totalHours = stats?.totalHours ?? 0;
    const pending = stats?.pendingApprovals ?? 0;
    const workDays = totalHours / 8;

    // Compute approval rate safely – clamp 0–100, show "insufficient data" when basis is weak
    let approvalRate: number | null = null;
    let approvalInsufficient = false;
    if (workDays < 1) {
      approvalInsufficient = true;
    } else {
      approvalRate = Math.max(0, Math.min(100, 100 - (pending / workDays) * 100));
    }

    if (isTiltaksleder) {
      const continuity = Math.max(0, Math.min(100, 100 - pending * 4));
      const reportOnTime = approvalInsufficient ? null : approvalRate;
      const participantPlanCoverage = Math.max(0, Math.min(100, 75 - pending * 2));
      const avgDaysBetweenFollowup = Math.max(1, 7 + pending);

      return [
        {
          id: 1,
          title: "Jevn oppfølging",
          current: continuity,
          target: 90,
          unit: "%",
          icon: Clock,
          color: "blue" as const,
          tooltip: "Andel tiltak med aktivitet uten lange hull i perioden.",
          extraLabel: null as string | null,
          insufficient: false,
        },
        {
          id: 2,
          title: "Rapporter innen frist",
          current: reportOnTime ?? 0,
          target: 95,
          unit: "%",
          icon: CheckCircle,
          color: "green" as const,
          tooltip: "Andel rapporter levert innen planlagt frist.",
          extraLabel: pending > 0 ? `${pending} mangler gjennomgang` : null,
          insufficient: reportOnTime === null,
        },
        {
          id: 3,
          title: "Deltakere med plan",
          current: participantPlanCoverage,
          target: 100,
          unit: "%",
          icon: Briefcase,
          color: "purple" as const,
          tooltip: "Andel deltakere med oppdatert plan og siste kontakt registrert.",
          extraLabel: null,
          insufficient: false,
        },
        {
          id: 4,
          title: "Snitt dager mellom oppfølging",
          current: avgDaysBetweenFollowup,
          target: 7,
          unit: "d",
          icon: Target,
          color: "blue" as const,
          tooltip: "Lavere tall betyr tettere oppfølging i teamet.",
          extraLabel: null,
          insufficient: false,
        },
      ];
    }

    return [
      {
        id: 1,
        title: "Månedlige timer",
        current: totalHours,
        target: 160,
        unit: "timer",
        icon: Clock,
        color: "blue" as const,
        tooltip: "Totalt registrerte timer denne måneden vs. 160 t mål",
        extraLabel: null as string | null,
        insufficient: false,
      },
      {
        id: 2,
        title: "Godkjenningsrate",
        current: approvalRate ?? 0,
        target: 100,
        unit: "%",
        icon: CheckCircle,
        color: "green" as const,
        tooltip:
          "100% \u2212 (ventende godkjenninger \u00f7 arbeidsdager) \u00d7 100. Krever minst 1 arbeidsdag med data.",
        extraLabel: pending > 0 ? `${pending} ventende` : null,
        insufficient: approvalInsufficient,
      },
      {
        id: 3,
        title: "Aktive saker",
        current: stats?.casesThisWeek ?? 0,
        target: 15,
        unit: "saker",
        icon: Briefcase,
        color: "purple" as const,
        tooltip: "Antall saker opprettet denne uken vs. ukentlig mål",
        extraLabel: null,
        insufficient: false,
      },
    ];
  }, [stats, isTiltaksleder]);

  return (
    <Card className="rounded-2xl border-[#d8e4e0] dark:border-border bg-white/95 dark:bg-card shadow-sm">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader className="pb-3">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center justify-between text-left"
            >
              <CardTitle className="flex items-center gap-2 text-lg">
                <Target className="h-5 w-5 text-[#1F6B73]" />
                {isTiltaksleder ? "Kvalitet og kontinuitet" : "Mål og fremdrift"}
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
            {isTiltaksleder ? "Faglig kvalitet i oppfølging og dokumentasjon" : "Spor fremdrift mot månedlige mål"}
          </CardDescription>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="pt-0">
            <div className="space-y-4">
              {goals.map((goal) => {
                const Icon = goal.icon;
                const percentage = goal.insufficient
                  ? 0
                  : Math.min(Math.max((goal.current / goal.target) * 100, 0), 100);

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
                            {goal.current.toFixed(goal.unit === "%" ? 0 : 1)} / {goal.target}{" "}
                            {goal.unit}
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
