import { useMemo } from "react";
import {
  CheckCircle,
  AlertTriangle,
  FileText,
  Clock,
  ArrowRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DashboardNextActionProps {
  mode?: "default" | "tiltaksleder" | "miljoarbeider";
  pendingApprovals: number;
  overdueItems: number;
  myDrafts: number;
  totalHours: number;
  navigate: (path: string) => void;
}

interface NextAction {
  icon: typeof Clock;
  label: string;
  description: string;
  buttonText: string;
  path: string;
  variant: "critical" | "warning" | "info" | "neutral";
}

const VARIANT_STYLES: Record<NextAction["variant"], string> = {
  critical: "border-red-200 dark:border-red-800 bg-red-50/60 dark:bg-red-950/30",
  warning: "border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/30",
  info: "border-[#1F6B73]/20 dark:border-[#51C2D0]/20 bg-[#1F6B73]/5 dark:bg-[#51C2D0]/5",
  neutral: "border-[#d8e4e0] dark:border-border bg-white/80 dark:bg-card",
};

const ICON_STYLES: Record<NextAction["variant"], string> = {
  critical: "text-red-600 dark:text-red-400",
  warning: "text-amber-600 dark:text-amber-400",
  info: "text-[#1F6B73] dark:text-[#51C2D0]",
  neutral: "text-[#1F6B73] dark:text-[#51C2D0]",
};

export function DashboardNextAction({
  mode = "default",
  pendingApprovals,
  overdueItems,
  myDrafts,
  totalHours,
  navigate,
}: DashboardNextActionProps) {
  const isTiltaksleder = mode === "tiltaksleder";
  const isMiljoarbeider = mode === "miljoarbeider";

  const action = useMemo((): NextAction => {
    if ((isTiltaksleder || isMiljoarbeider) && pendingApprovals > 0) {
      return {
        icon: CheckCircle,
        label: isMiljoarbeider
          ? `Du har ${pendingApprovals} oppfølginger som gjenstår`
          : `Følg opp ${pendingApprovals} tiltak med manglende rapport`,
        description: isMiljoarbeider
          ? "Dokumenter oppfølging rolig og stegvis"
          : "Sikre kontinuitet og dokumentasjon i dag",
        buttonText: isMiljoarbeider ? "Start oppfølging" : "Gå til tiltak",
        path: "/cases",
        variant: "warning",
      };
    }
    if ((isTiltaksleder || isMiljoarbeider) && overdueItems > 0) {
      return {
        icon: AlertTriangle,
        label: isMiljoarbeider
          ? `${overdueItems} deltakere trenger oppfølging`
          : `${overdueItems} tiltak mangler nylig oppfølging`,
        description: isMiljoarbeider
          ? "Se hvem som bør kontaktes først"
          : "Prioriter deltakere med lengst opphold",
        buttonText: isMiljoarbeider ? "Se deltakere" : "Åpne tiltak",
        path: "/cases",
        variant: "critical",
      };
    }

    if (overdueItems > 0) {
      return {
        icon: AlertTriangle,
        label: `${overdueItems} forfalte elementer`,
        description: "Disse krever umiddelbar oppmerksomhet",
        buttonText: "Håndter nå",
        path: "/time-tracking",
        variant: "critical",
      };
    }
    if (pendingApprovals > 0) {
      return {
        icon: CheckCircle,
        label: `Godkjenn ${pendingApprovals} ${pendingApprovals === 1 ? "timeliste" : "timelister"}`,
        description: "Timelister venter på din godkjenning",
        buttonText: "Godkjenn nå",
        path: "/time-tracking",
        variant: "warning",
      };
    }
    if (myDrafts > 0) {
      return {
        icon: FileText,
        label: `Fullfør ${myDrafts} utkast`,
        description: "Du har uferdige rapporter",
        buttonText: "Fortsett",
        path: "/cases",
        variant: "info",
      };
    }
    return {
      icon: Clock,
      label: "Registrer timer for i dag",
      description:
        totalHours > 0
          ? `Du har registrert ${totalHours.toFixed(1)}t denne uken`
          : "Start med å registrere dagens arbeid",
      buttonText: "Registrer",
      path: "/time-tracking",
      variant: "neutral",
    };
  }, [pendingApprovals, overdueItems, myDrafts, totalHours, isTiltaksleder, isMiljoarbeider]);

  const Icon = action.icon;

  return (
    <Card
      className={cn(
        "rounded-xl border transition-all hover:shadow-md hover:-translate-y-px cursor-pointer active:translate-y-0",
        VARIANT_STYLES[action.variant],
      )}
      onClick={() => navigate(action.path)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          navigate(action.path);
        }
      }}
      data-testid="next-action"
    >
      <CardContent className="flex items-center gap-4 p-4">
        <div className={cn("shrink-0", ICON_STYLES[action.variant])}>
          <Icon className="h-6 w-6" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[#153c46] dark:text-foreground">
            {action.label}
          </p>
          <p className="text-xs text-[#5f7075] dark:text-muted-foreground truncate">
            {action.description}
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="shrink-0 gap-1 text-xs font-medium text-[#1F6B73] dark:text-[#51C2D0] hover:text-[#153c46] dark:hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation();
            navigate(action.path);
          }}
        >
          {action.buttonText}
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </CardContent>
    </Card>
  );
}
