import { AlertTriangle, ArrowRight, UserRound } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export interface RiskParticipant {
  id: string;
  name: string;
  reason: string;
  severity: "hoy" | "moderat";
}

interface DashboardRiskParticipantsProps {
  participants: RiskParticipant[];
  navigate: (path: string) => void;
}

export function DashboardRiskParticipants({ participants, navigate }: DashboardRiskParticipantsProps) {
  if (participants.length === 0) {
    return null;
  }

  return (
    <Card className="rounded-2xl border-border bg-card shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          Deltakere i risiko
        </CardTitle>
        <CardDescription>Behov for rask oppfølging basert på nylig aktivitet</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {participants.slice(0, 5).map((participant) => (
          <div
            key={participant.id}
            className="flex items-center justify-between rounded-lg border border-border p-3"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <UserRound className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground truncate">
                  {participant.name}
                </p>
                <Badge
                  variant="outline"
                  className={participant.severity === "hoy"
                    ? "text-[10px] border-red-200 dark:border-red-800 text-red-600 dark:text-red-400"
                    : "text-[10px] border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400"
                  }
                >
                  {participant.severity === "hoy" ? "Høy" : "Moderat"}
                </Badge>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground pl-6">
                {participant.reason}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Åpne sak for ${participant.name}`}
              title={`Åpne sak for ${participant.name}`}
              className="shrink-0"
              onClick={() => navigate("/cases")}
            >
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
