import { useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Briefcase,
  CheckCircle,
  ChevronDown,
  FileText,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export interface TaskCounts {
  pendingApprovals: number;
  overdueItems: number;
  myDrafts: number;
  assignedCases: number;
}

interface DashboardTasksProps {
  tasks: TaskCounts;
  navigate: (path: string) => void;
  mode?: "default" | "tiltaksleder";
}

export function DashboardTasks({ tasks, navigate, mode = "default" }: DashboardTasksProps) {
  const [open, setOpen] = useState(true);
  const isTiltaksleder = mode === "tiltaksleder";

  // Ranked by importance: overdue first, then pending, then others
  const tiles = [
    {
      key: "overdue",
      count: tasks.overdueItems,
      label: isTiltaksleder ? "Tiltak uten aktivitet" : "Forfalt",
      sublabel: isTiltaksleder ? "Siste 7 dager" : "Krever handling",
      icon: AlertTriangle,
      iconColor: "text-red-500",
      path: "/cases",
      highlight: tasks.overdueItems > 0,
      highlightClass: "border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/30",
      countColor: "text-red-600",
    },
    {
      key: "approvals",
      count: tasks.pendingApprovals,
      label: isTiltaksleder ? "Rapporter til gjennomgang" : "Godkjenninger",
      sublabel: isTiltaksleder ? "Må vurderes" : "Venter på deg",
      icon: AlertCircle,
      iconColor: "text-orange-500",
      path: "/cases",
      highlight: tasks.pendingApprovals > 0,
      highlightClass: "border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20",
      countColor: "text-primary",
    },
    {
      key: "drafts",
      count: tasks.myDrafts,
      label: isTiltaksleder ? "Tiltak nær rapportfrist" : "Utkast",
      sublabel: isTiltaksleder ? "Neste 72 timer" : "Uferdige rapporter",
      icon: FileText,
      iconColor: "text-slate-500",
      path: "/cases",
      highlight: false,
      highlightClass: "",
      countColor: "text-primary",
    },
    {
      key: "assigned",
      count: tasks.assignedCases,
      label: isTiltaksleder ? "Deltakere uten kontakt" : "Tildelte saker",
      sublabel: isTiltaksleder ? "Krever oppfølging" : "Aktive",
      icon: Briefcase,
      iconColor: "text-blue-500",
      path: "/cases",
      highlight: false,
      highlightClass: "",
      countColor: "text-primary",
    },
  ];

  const visibleTiles = isTiltaksleder ? tiles.filter((tile) => tile.count > 0) : tiles;

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
                <CheckCircle className="h-5 w-5 text-primary" />
                {isTiltaksleder ? "Tiltak som krever oppfølging" : "Mine oppgaver"}
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
            {isTiltaksleder ? "Prioritert etter alvorlighet" : "Ting som krever din oppmerksomhet"}
          </CardDescription>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="pt-0">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {visibleTiles.map((tile) => {
                const Icon = tile.icon;
                return (
                  <Button
                    key={tile.key}
                    variant="outline"
                    className={cn(
                      "h-auto flex-col items-start gap-2 p-4 transition-all hover:shadow-md hover:-translate-y-px active:translate-y-0",
                      tile.highlight ? tile.highlightClass : "hover:bg-accent",
                    )}
                    onClick={() => navigate(tile.path)}
                  >
                    <div className="flex w-full items-center justify-between">
                      <span className={cn("text-2xl font-bold tabular-nums", tile.countColor)}>
                        {tile.count}
                      </span>
                      <Icon className={cn("h-5 w-5", tile.iconColor)} />
                    </div>
                    <div className="text-left">
                      <div className="font-medium text-sm">{tile.label}</div>
                      <div className="text-xs text-muted-foreground">{tile.sublabel}</div>
                    </div>
                  </Button>
                );
              })}
              {isTiltaksleder && visibleTiles.length === 0 && (
                <p className="col-span-full text-sm text-muted-foreground italic py-2">
                  Ingen akutte oppfølgingspunkter akkurat nå.
                </p>
              )}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
