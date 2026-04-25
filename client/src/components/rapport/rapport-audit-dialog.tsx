/**
 * RapportAuditDialog
 *
 * Tidslinje-visning av endringer på en saksrapport. Brukes av tiltakslederen
 * (eller miljøarbeider/admin/super_admin med tilgang) for å se hvem som har
 * gjort hva med rapporten over tid — opprettet, innsendt, godkjent, returnert,
 * videresendt til institusjon, osv.
 *
 * Kilde: GET /api/rapporter/:id/audit (server/sakerRapportRoutes.ts)
 *
 * Salgsargument: dokumenterer hele behandlingsløpet fra utkast til arkiv,
 * et krav fra offentlige innkjøpere som barnevern og kommune.
 */
import { useQuery } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  History, Loader2, AlertCircle,
  FileEdit, Send, CheckCircle2, XCircle, ArrowRightCircle, Clock, Activity,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

interface RapportAuditEvent {
  id: string;
  rapportId: string;
  userId: number | null;
  userName: string | null;
  userRole: string | null;
  eventType: string;
  eventLabel: string | null;
  details: Record<string, any> | null;
  createdAt: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  rapportId: string;
  rapportTitle?: string;
}

const EVENT_META: Record<string, { label: string; className: string; Icon: any }> = {
  created: {
    label: "Opprettet",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
    Icon: FileEdit,
  },
  submitted: {
    label: "Sendt til godkjenning",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    Icon: Send,
  },
  approved: {
    label: "Godkjent",
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
    Icon: CheckCircle2,
  },
  returned: {
    label: "Returnert",
    className: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
    Icon: XCircle,
  },
  auto_forwarded: {
    label: "Videresendt",
    className: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
    Icon: ArrowRightCircle,
  },
  time_entries_imported: {
    label: "Timer importert",
    className: "bg-slate-100 text-slate-800 dark:bg-slate-900/40 dark:text-slate-300",
    Icon: Activity,
  },
};

function eventDisplay(eventType: string) {
  return EVENT_META[eventType] ?? {
    label: eventType,
    className: "bg-slate-100 text-slate-800 dark:bg-slate-900/40 dark:text-slate-300",
    Icon: Clock,
  };
}

function formatDetails(eventType: string, details: Record<string, any> | null): string | null {
  if (!details) return null;
  if (eventType === "approved" || eventType === "returned") {
    if (details.kommentar) return `Kommentar: ${String(details.kommentar)}`;
  }
  if (eventType === "auto_forwarded") {
    if (details.institutionName) return `→ ${String(details.institutionName)}`;
  }
  if (eventType === "time_entries_imported") {
    const count = details.count ?? details.imported;
    if (count) return `${count} oppføringer`;
  }
  return null;
}

export function RapportAuditDialog({ open, onClose, rapportId, rapportTitle }: Props) {
  const { data: events = [], isLoading, error } = useQuery<RapportAuditEvent[]>({
    queryKey: ["/api/rapporter", rapportId, "audit"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/rapporter/${rapportId}/audit`);
      return res.json();
    },
    enabled: open && !!rapportId,
    staleTime: 30_000,
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[560px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            Historikk
            {rapportTitle && (
              <span className="ml-1 text-sm font-normal text-muted-foreground truncate">
                — {rapportTitle}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            Komplett tidslinje over rapportens behandlingsløp.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Laster historikk…
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 text-sm text-red-600">
              <AlertCircle className="h-4 w-4" /> Kunne ikke laste historikk.
            </div>
          ) : events.length === 0 ? (
            <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground text-center">
              Ingen registrert historikk for denne rapporten.
            </p>
          ) : (
            <ol className="space-y-4 pl-4 border-l-2 border-border">
              {events.map((e) => {
                const meta = eventDisplay(e.eventType);
                const Icon = meta.Icon;
                const detail = formatDetails(e.eventType, e.details);
                return (
                  <li key={e.id} className="relative" data-testid={`rapport-audit-${e.id}`}>
                    <span className="absolute -left-[26px] top-0 inline-flex h-5 w-5 items-center justify-center rounded-full bg-background border-2 border-primary">
                      <Icon className="h-2.5 w-2.5 text-primary" />
                    </span>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={cn("text-[10px] h-5 px-2", meta.className)}>{meta.label}</Badge>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {new Date(e.createdAt).toLocaleString("nb-NO", {
                            day: "2-digit", month: "short", year: "numeric",
                            hour: "2-digit", minute: "2-digit",
                          })}
                        </span>
                        {e.userName && (
                          <span className="text-xs text-muted-foreground">
                            av <span className="font-medium text-foreground">{e.userName}</span>
                            {e.userRole && e.userRole !== "system" && (
                              <span className="text-muted-foreground/70"> ({e.userRole})</span>
                            )}
                          </span>
                        )}
                      </div>
                      {e.eventLabel && (
                        <p className="text-sm text-foreground">{e.eventLabel}</p>
                      )}
                      {detail && (
                        <p className="text-xs text-muted-foreground italic">{detail}</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Lukk</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
