import {
  Users,
  FileText,
  Clock,
  Send,
  CheckCircle2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import tidumWordmark from "@assets/tidum-wordmark.png";

interface DashboardOnboardingProps {
  hasUsers: boolean;
  hasCases: boolean;
  hasHours: boolean;
  hasReports: boolean;
  navigate: (path: string) => void;
}

export function DashboardOnboarding({
  hasUsers,
  hasCases,
  hasHours,
  hasReports,
  navigate,
}: DashboardOnboardingProps) {
  const steps = [
    {
      id: "users",
      label: "Legg til brukere",
      description: "Inviter teamet ditt til Tidum",
      done: hasUsers,
      action: () => navigate("/users"),
      icon: Users,
    },
    {
      id: "case",
      label: "Opprett første sak",
      description: "Start med en ny klientsak",
      done: hasCases,
      action: () => navigate("/cases"),
      icon: FileText,
    },
    {
      id: "hours",
      label: "Registrer første time",
      description: "Logg din første arbeidsøkt",
      done: hasHours,
      action: () => navigate("/time-tracking"),
      icon: Clock,
    },
    {
      id: "report",
      label: "Send første rapport",
      description: "Generer og send en rapport",
      done: hasReports,
      action: () => navigate("/cases"),
      icon: Send,
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;
  const percentage = (completedCount / steps.length) * 100;

  // Don't show if all steps are done
  if (completedCount === steps.length) return null;

  return (
    <Card className="rounded-2xl border-primary/20 bg-gradient-to-br from-primary/5 to-transparent shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <img src={tidumWordmark} alt="Tidum" className="h-6 w-auto object-contain" />
          <span>Kom i gang med Tidum</span>
        </CardTitle>
        <CardDescription>
          Fullfør oppsettet for å få mest ut av Tidum
        </CardDescription>
        <div className="flex items-center gap-3 mt-2">
          <Progress value={percentage} className="flex-1 h-2" />
          <span className="text-xs font-medium text-muted-foreground tabular-nums">
            {completedCount}/{steps.length}
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid gap-2 sm:grid-cols-2">
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <Button
                key={step.id}
                variant="outline"
                className={cn(
                  "h-auto flex-col items-start gap-1.5 p-4 transition-all",
                  step.done
                    ? "bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800 opacity-70"
                    : "hover:bg-accent hover:shadow-md hover:-translate-y-px active:translate-y-0",
                )}
                onClick={step.action}
                disabled={step.done}
              >
                <div className="flex w-full items-center gap-2">
                  {step.done ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                  ) : (
                    <Icon className="h-4 w-4 text-primary shrink-0" />
                  )}
                  <span
                    className={cn(
                      "text-sm font-medium",
                      step.done && "line-through text-muted-foreground",
                    )}
                  >
                    {step.label}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground pl-6">
                  {step.description}
                </p>
              </Button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
