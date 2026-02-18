import { useState } from "react";
import { AlertTriangle, Info, ChevronRight, ChevronDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface DashboardAlert {
  id: number;
  type: "info" | "warning" | "critical";
  title: string;
  description: string;
  action: () => void;
}

interface DashboardAlertsProps {
  alerts: DashboardAlert[];
}

const SEVERITY_LABELS: Record<DashboardAlert["type"], string> = {
  info: "Info",
  warning: "Advarsel",
  critical: "Kritisk",
};

const ALERT_STYLES: Record<DashboardAlert["type"], { card: string; icon: string; badge: string }> = {
  info: {
    card: "border-l-blue-500 bg-blue-50/50 dark:bg-blue-950/30",
    icon: "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400",
    badge: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800",
  },
  warning: {
    card: "border-l-orange-500 bg-orange-50/50 dark:bg-orange-950/30",
    icon: "bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400",
    badge: "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800",
  },
  critical: {
    card: "border-l-red-600 bg-red-50/60 dark:bg-red-950/40",
    icon: "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400",
    badge: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800",
  },
};

export function DashboardAlerts({ alerts }: DashboardAlertsProps) {
  const [showAll, setShowAll] = useState(false);

  if (alerts.length === 0) return null;

  const visibleAlerts = showAll ? alerts : alerts.slice(0, 2);
  const hiddenCount = alerts.length - 2;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        {visibleAlerts.map((alert) => {
          const styles = ALERT_STYLES[alert.type];
          const IconComponent = alert.type === "info" ? Info : AlertTriangle;
          return (
            <Card
              key={alert.id}
              className={cn(
                "border-l-4 cursor-pointer transition-all hover:shadow-md hover:-translate-y-px active:translate-y-0",
                styles.card,
              )}
              onClick={alert.action}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  alert.action();
                }
              }}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className={cn("p-2 rounded-lg shrink-0", styles.icon)}>
                    <IconComponent className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge
                        variant="outline"
                        className={cn("text-[10px] px-1.5 py-0 font-medium", styles.badge)}
                      >
                        {SEVERITY_LABELS[alert.type]}
                      </Badge>
                    </div>
                    <h4 className="font-semibold text-sm">{alert.title}</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">{alert.description}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {hiddenCount > 0 && !showAll && (
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-[#5f7075] dark:text-muted-foreground"
          onClick={() => setShowAll(true)}
        >
          <ChevronDown className="mr-1 h-3.5 w-3.5" />
          Vis alle varsler ({alerts.length})
        </Button>
      )}
    </div>
  );
}
