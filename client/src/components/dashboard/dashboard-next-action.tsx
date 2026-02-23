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
  smartSuggestion?: {
    label: string;
    description: string;
    path: string;
  } | null;
  onUseSmartSuggestion?: () => void;
  onDismissSmartSuggestion?: () => void;
}

interface NextAction {
  icon: typeof Clock;
  label: string;
  description: string;
  buttonText: string;
  path: string;
  variant: "critical" | "warning" | "info" | "neutral";
  isSmartSuggestion?: boolean;
}

const VARIANT_STYLES: Record<NextAction["variant"], string> = {
  critical: "border-red-200 dark:border-red-800 bg-red-50/60 dark:bg-red-950/30",
  warning: "border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/30",
  info: "border-primary/20 bg-primary/5",
  neutral: "border-border bg-card",
};

const ICON_STYLES: Record<NextAction["variant"], string> = {
  critical: "text-red-600 dark:text-red-400",
  warning: "text-amber-600 dark:text-amber-400",
  info: "text-primary",
  neutral: "text-primary",
};

export function DashboardNextAction({
  mode = "default",
  pendingApprovals,
  overdueItems,
  myDrafts,
  totalHours,
  navigate,
  smartSuggestion,
  onUseSmartSuggestion,
  onDismissSmartSuggestion,
}: DashboardNextActionProps) {
  const isTiltaksleder = mode === "tiltaksleder";
  const isMiljoarbeider = mode === "miljoarbeider";
  const followupPath = isMiljoarbeider ? "/case-reports" : "/cases";
  const followupCreatePath = isMiljoarbeider ? "/case-reports?create=1" : "/cases";

  const action = useMemo((): NextAction | null => {
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
        path: followupCreatePath,
        variant: "warning",
      };
    }
    if ((isTiltaksleder || isMiljoarbeider) && overdueItems > 0) {
      return {
        icon: AlertTriangle,
        label: isMiljoarbeider
          ? `${overdueItems} klientsaker trenger oppfølging`
          : `${overdueItems} tiltak mangler nylig oppfølging`,
        description: isMiljoarbeider
          ? "Se hvem som bør kontaktes først"
          : "Prioriter klientsaker med lengst opphold",
        buttonText: isMiljoarbeider ? "Se klientsaker" : "Åpne tiltak",
        path: followupPath,
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
        path: isMiljoarbeider ? "/case-reports" : "/cases",
        variant: "info",
      };
    }

    if (!isTiltaksleder && !isMiljoarbeider && smartSuggestion) {
      return {
        icon: Clock,
        label: smartSuggestion.label,
        description: smartSuggestion.description,
        buttonText: "Start med forslag",
        path: smartSuggestion.path,
        variant: "info",
        isSmartSuggestion: true,
      };
    }
    return null;
  }, [pendingApprovals, overdueItems, myDrafts, totalHours, isTiltaksleder, isMiljoarbeider, smartSuggestion, followupCreatePath, followupPath]);

  if (!action) return null;

  const Icon = action.icon;
  const handleActionNavigate = () => {
    if (action.isSmartSuggestion) {
      onUseSmartSuggestion?.();
    }
    navigate(action.path);
  };

  return (
    <Card
      className={cn(
        "rounded-xl border transition-all hover:shadow-md hover:-translate-y-px cursor-pointer active:translate-y-0",
        VARIANT_STYLES[action.variant],
      )}
      onClick={handleActionNavigate}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleActionNavigate();
        }
      }}
      data-testid="next-action"
    >
      <CardContent className="flex items-center gap-4 p-4">
        <div className={cn("shrink-0", ICON_STYLES[action.variant])}>
          <Icon className="h-6 w-6" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">
            {action.label}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {action.description}
          </p>
        </div>
        {action.isSmartSuggestion && onDismissSmartSuggestion && (
          <Button
            size="sm"
            variant="ghost"
            className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              onDismissSmartSuggestion();
            }}
          >
            Ikke nå
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="shrink-0 gap-1 text-xs font-medium text-primary hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation();
            handleActionNavigate();
          }}
        >
          {action.buttonText}
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </CardContent>
    </Card>
  );
}
