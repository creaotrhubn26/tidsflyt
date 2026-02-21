import { AlertTriangle, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface StatusSignal {
  id: string;
  tone: "red" | "yellow" | "green";
  label: string;
  detail: string;
}

interface DashboardStatusTodayProps {
  signals: StatusSignal[];
}

const toneStyles = {
  red: {
    card: "border-red-200 dark:border-red-800 bg-red-50/60 dark:bg-red-950/30",
    icon: "text-red-600 dark:text-red-400",
    chip: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400",
    iconNode: AlertTriangle,
    label: "Kritisk",
  },
  yellow: {
    card: "border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/25",
    icon: "text-amber-600 dark:text-amber-400",
    chip: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400",
    iconNode: AlertCircle,
    label: "Obs",
  },
  green: {
    card: "border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/25",
    icon: "text-emerald-600 dark:text-emerald-400",
    chip: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400",
    iconNode: CheckCircle2,
    label: "I rute",
  },
} as const;

export function DashboardStatusToday({ signals }: DashboardStatusTodayProps) {
  return (
    <Card className="rounded-2xl border-border bg-card shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Clock className="h-5 w-5 text-primary" />
          Status i dag
        </CardTitle>
        <CardDescription>Rød/gul/grønn oversikt over oppfølging og avvik</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {signals.map((signal) => {
            const tone = toneStyles[signal.tone];
            const Icon = tone.iconNode;
            return (
              <div
                key={signal.id}
                className={cn("rounded-xl border p-3", tone.card)}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold", tone.chip)}>
                    {tone.label}
                  </span>
                  <Icon className={cn("h-4 w-4 shrink-0", tone.icon)} />
                </div>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {signal.label}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {signal.detail}
                </p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
