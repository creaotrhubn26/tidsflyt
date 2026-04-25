/**
 * TimesheetAuditDialog
 *
 * Tiltaksleder/admin: viser historikk for log_row-oppføringer i en innsendt
 * timeliste (måned × bruker). Brukes på godkjenningssiden for å verifisere
 * at det ikke har skjedd endringer "i siste minutt".
 *
 * Data:
 *   - GET /api/time-entries?userId=…&startDate=…&endDate=… for å liste
 *     oppføringer i måneden
 *   - GET /api/logs/:id/audit per oppføring (lazy — kun når raden ekspanderes)
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Loader2, History, FileText, AlertCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

interface TimeEntry {
  id: string;
  userId: string;
  caseNumber: string | null;
  description: string;
  hours: number;
  date: string;
  status: string;
  createdAt: string;
}

interface AuditRecord {
  id: string;
  logRowId: string;
  action: "create" | "update" | "delete";
  beforeData: Record<string, any> | null;
  afterData: Record<string, any> | null;
  changedBy: string | null;
  changedByRole: string | null;
  changedAt: string;
  ipAddress: string | null;
  userAgent: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  userId: string;
  userLabel?: string;
  month: string; // YYYY-MM
}

function monthBounds(month: string): { from: string; to: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  const y = Number(m[1]);
  const mm = Number(m[2]);
  const from = `${m[1]}-${m[2]}-01`;
  const lastDay = new Date(y, mm, 0).getDate();
  const to = `${m[1]}-${m[2]}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

const ACTION_BADGE: Record<AuditRecord["action"], { label: string; className: string }> = {
  create: { label: "Opprettet", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" },
  update: { label: "Endret", className: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
  delete: { label: "Slettet", className: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" },
};

const RELEVANT_FIELDS: Array<{ key: string; label: string }> = [
  { key: "date", label: "Dato" },
  { key: "start_time", label: "Fra" },
  { key: "end_time", label: "Til" },
  { key: "break_hours", label: "Pause" },
  { key: "activity", label: "Aktivitet" },
  { key: "title", label: "Tittel" },
  { key: "project", label: "Prosjekt/sak" },
  { key: "place", label: "Sted" },
  { key: "notes", label: "Notat" },
];

function diffFields(before: Record<string, any> | null, after: Record<string, any> | null) {
  const changes: Array<{ key: string; label: string; from: any; to: any }> = [];
  for (const f of RELEVANT_FIELDS) {
    const b = before?.[f.key];
    const a = after?.[f.key];
    if (b !== a && !(b == null && a == null)) {
      changes.push({ key: f.key, label: f.label, from: b ?? "—", to: a ?? "—" });
    }
  }
  return changes;
}

function AuditEntryRow({ entry }: { entry: TimeEntry }) {
  const [open, setOpen] = useState(false);
  const { data: audit, isLoading, error } = useQuery<AuditRecord[]>({
    queryKey: ["/api/logs", entry.id, "audit"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/logs/${entry.id}/audit`);
      return res.json();
    },
    enabled: open,
    staleTime: 60_000,
  });

  return (
    <div className="rounded-lg border border-border" data-testid={`audit-row-${entry.id}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/40 transition-colors"
      >
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium tabular-nums">{entry.date}</span>
            <span className="text-sm text-muted-foreground tabular-nums">{entry.hours.toFixed(1)} t</span>
            {entry.caseNumber && (
              <Badge variant="outline" className="text-[10px] h-4 px-1.5">{entry.caseNumber}</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {entry.description || "(uten beskrivelse)"}
          </p>
        </div>
      </button>

      {open && (
        <div className="border-t border-border bg-muted/20 p-3 space-y-2">
          {isLoading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Henter historikk…
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 text-xs text-red-600">
              <AlertCircle className="h-3 w-3" /> Kunne ikke hente historikk
            </div>
          )}
          {audit && audit.length === 0 && (
            <p className="text-xs text-muted-foreground">Ingen registrert historikk for denne oppføringen.</p>
          )}
          {audit && audit.length > 0 && (
            <ol className="space-y-2 relative pl-3 border-l border-border">
              {audit.map((a) => {
                const changes = a.action === "update" ? diffFields(a.beforeData, a.afterData) : [];
                return (
                  <li key={a.id} className="text-xs space-y-1 relative">
                    <span className="absolute -left-[7px] top-1 inline-block h-2 w-2 rounded-full bg-primary" />
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={cn("text-[10px] h-4 px-1.5", ACTION_BADGE[a.action].className)}>
                        {ACTION_BADGE[a.action].label}
                      </Badge>
                      <span className="text-muted-foreground tabular-nums">
                        {new Date(a.changedAt).toLocaleString("nb-NO")}
                      </span>
                      {a.changedBy && (
                        <span className="text-muted-foreground">
                          av <span className="font-mono">{a.changedBy}</span>
                          {a.changedByRole ? ` (${a.changedByRole})` : ""}
                        </span>
                      )}
                    </div>
                    {a.action === "update" && changes.length > 0 && (
                      <ul className="ml-1 space-y-0.5 text-[11px]">
                        {changes.map((c) => (
                          <li key={c.key}>
                            <span className="text-muted-foreground">{c.label}:</span>{" "}
                            <span className="line-through text-red-600/80">{String(c.from)}</span>
                            {" → "}
                            <span className="text-emerald-700 dark:text-emerald-400">{String(c.to)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {a.action === "create" && (
                      <p className="ml-1 text-[11px] text-muted-foreground">Opprettet med {entry.hours.toFixed(1)} t.</p>
                    )}
                    {a.action === "delete" && (
                      <p className="ml-1 text-[11px] text-muted-foreground">Oppføring slettet.</p>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

export function TimesheetAuditDialog({ open, onClose, userId, userLabel, month }: Props) {
  const bounds = useMemo(() => monthBounds(month), [month]);

  const { data: entries = [], isLoading } = useQuery<TimeEntry[]>({
    queryKey: ["/api/time-entries", { userId, startDate: bounds?.from, endDate: bounds?.to }],
    queryFn: async () => {
      if (!bounds) return [];
      const url = `/api/time-entries?userId=${encodeURIComponent(userId)}&startDate=${bounds.from}&endDate=${bounds.to}`;
      const res = await apiRequest("GET", url);
      return res.json();
    },
    enabled: open && !!bounds,
    staleTime: 30_000,
  });

  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
    [entries],
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[640px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            Historikk — {userLabel || userId}
          </DialogTitle>
          <DialogDescription>
            Alle endringer på timeoppføringer for {month}. Klikk en oppføring for å se full historikk.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Laster oppføringer…
            </div>
          ) : sortedEntries.length === 0 ? (
            <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground text-center">
              Ingen registrerte timer for {month}.
            </p>
          ) : (
            sortedEntries.map((e) => <AuditEntryRow key={e.id} entry={e} />)
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Lukk</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
