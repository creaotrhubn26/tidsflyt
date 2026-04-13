/**
 * client/src/pages/rapporter/RapportListePage.tsx
 *
 * Overview of all rapporter for the current user.
 * Miljøarbeidere see their own, tiltaksledere see those assigned to them.
 */

import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
// removed PortalLayout — rapport pages are standalone editors
import { Button } from "@/components/ui/button";
import { Badge }  from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Plus, FileText, Clock, CheckCircle, XCircle,
  Archive, ChevronRight, Download,
} from "lucide-react";

interface Rapport {
  id: string;
  status: string;
  konsulent?: string;
  tiltak?: string;
  oppdragsgiver?: string;
  klientRef?: string;
  periodeFrom?: string;
  periodeTo?: string;
  totalMinutter?: number;
  antallAktiviteter?: number;
  updatedAt?: string;
  innsendt?: string;
  godkjent?: string;
}

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof Clock }> = {
  utkast:          { label: "Utkast",     variant: "outline",      icon: FileText },
  til_godkjenning: { label: "Venter",     variant: "secondary",    icon: Clock },
  returnert:       { label: "Returnert",  variant: "destructive",  icon: XCircle },
  godkjent:        { label: "Godkjent",   variant: "default",      icon: CheckCircle },
  arkivert:        { label: "Arkivert",   variant: "outline",      icon: Archive },
};

function formatPeriode(from?: string | null): string {
  if (!from) return "Ukjent periode";
  return new Date(from).toLocaleDateString("nb-NO", { month: "long", year: "numeric" });
}

function formatHours(mins?: number | null): string {
  if (!mins) return "0t";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}t ${m}m` : `${h}t`;
}

export default function RapportListePage() {
  const [, navigate] = useLocation();

  const { data: rapporter = [], isLoading } = useQuery<Rapport[]>({
    queryKey: ["/api/rapporter"],
    queryFn: () => apiRequest("/api/rapporter"),
  });

  const drafts    = rapporter.filter(r => r.status === "utkast");
  const pending   = rapporter.filter(r => r.status === "til_godkjenning");
  const returned  = rapporter.filter(r => r.status === "returnert");
  const approved  = rapporter.filter(r => r.status === "godkjent");

  return (
    <div className="min-h-screen bg-background">
      {/* NAV BAR */}
      <div className="border-b bg-card/80 backdrop-blur sticky top-0 z-40 px-6 py-2">
        <div className="max-w-4xl mx-auto flex items-center gap-4 text-sm">
          <button onClick={() => navigate("/dashboard")} className="text-muted-foreground hover:text-foreground transition-colors">Dashboard</button>
          <span className="text-muted-foreground/40">/</span>
          <span className="text-foreground font-medium">Rapporter</span>
        </div>
      </div>

      {/* HEADER */}
      <div className="max-w-4xl mx-auto px-6 pt-6 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Mine rapporter</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {rapporter.length} rapport{rapporter.length !== 1 ? "er" : ""} totalt
          </p>
        </div>
        <Button onClick={() => navigate("/rapporter/ny")}>
          <Plus className="h-4 w-4 mr-1.5" /> Ny rapport
        </Button>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">

        {/* STATS */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Utkast",    value: drafts.length,   color: "text-muted-foreground" },
            { label: "Venter",    value: pending.length,   color: "text-amber-600" },
            { label: "Returnert", value: returned.length,  color: "text-destructive" },
            { label: "Godkjent",  value: approved.length,  color: "text-primary" },
          ].map(({ label, value, color }) => (
            <Card key={label} className="p-4 text-center">
              <div className={`text-2xl font-bold ${color}`}>{value}</div>
              <div className="text-xs text-muted-foreground mt-1">{label}</div>
            </Card>
          ))}
        </div>

        {/* LOADING */}
        {isLoading && (
          <div className="text-center py-12 text-muted-foreground">
            <div className="inline-flex items-center gap-2 text-sm">
              <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
              Laster rapporter...
            </div>
          </div>
        )}

        {/* EMPTY STATE */}
        {!isLoading && rapporter.length === 0 && (
          <Card className="p-12 text-center">
            <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground/30" />
            <h2 className="text-lg font-semibold mb-2">Ingen rapporter ennå</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Opprett din første rapport for å komme i gang.
            </p>
            <Button onClick={() => navigate("/rapporter/ny")}>
              <Plus className="h-4 w-4 mr-1.5" /> Opprett rapport
            </Button>
          </Card>
        )}

        {/* RETURNED — needs attention */}
        {returned.length > 0 && (
          <RapportSection
            title="Returnert — krever endring"
            icon={<XCircle className="h-4 w-4 text-destructive" />}
            rapporter={returned}
            onOpen={(id) => navigate(`/rapporter/${id}`)}
          />
        )}

        {/* DRAFTS */}
        {drafts.length > 0 && (
          <RapportSection
            title="Utkast"
            icon={<FileText className="h-4 w-4 text-muted-foreground" />}
            rapporter={drafts}
            onOpen={(id) => navigate(`/rapporter/${id}`)}
          />
        )}

        {/* PENDING */}
        {pending.length > 0 && (
          <RapportSection
            title="Sendt til godkjenning"
            icon={<Clock className="h-4 w-4 text-amber-500" />}
            rapporter={pending}
            onOpen={(id) => navigate(`/rapporter/${id}`)}
          />
        )}

        {/* APPROVED */}
        {approved.length > 0 && (
          <RapportSection
            title="Godkjent"
            icon={<CheckCircle className="h-4 w-4 text-primary" />}
            rapporter={approved}
            onOpen={(id) => navigate(`/rapporter/${id}`)}
          />
        )}
      </div>
    </div>
  );
}

function RapportSection({ title, icon, rapporter, onOpen }: {
  title: string;
  icon: React.ReactNode;
  rapporter: Rapport[];
  onOpen: (id: string) => void;
}) {
  return (
    <Card>
      <CardHeader className="py-3 px-4 border-b">
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-semibold text-sm">{title}</span>
          <Badge variant="secondary" className="ml-auto text-xs">{rapporter.length}</Badge>
        </div>
      </CardHeader>
      <div className="divide-y">
        {rapporter.map((r) => {
          const cfg = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.utkast;
          return (
            <button
              key={r.id}
              onClick={() => onOpen(r.id)}
              className="w-full text-left px-4 py-3 flex items-center gap-4 hover:bg-muted/30 transition-colors group"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-medium text-sm truncate">
                    {formatPeriode(r.periodeFrom)}
                  </span>
                  <Badge variant={cfg.variant} className="text-[10px] flex-shrink-0">
                    {cfg.label}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {[r.oppdragsgiver, r.klientRef, r.tiltak].filter(Boolean).join(" · ") || "Ingen detaljer"}
                </p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                {r.totalMinutter != null && r.totalMinutter > 0 && (
                  <span className="text-xs font-semibold text-primary">{formatHours(r.totalMinutter)}</span>
                )}
                {r.antallAktiviteter != null && r.antallAktiviteter > 0 && (
                  <span className="text-xs text-muted-foreground">{r.antallAktiviteter} akt.</span>
                )}
                {r.status === "godkjent" && (
                  <Button
                    variant="ghost" size="sm" className="h-7 text-xs opacity-0 group-hover:opacity-100"
                    aria-label={`Last ned PDF for ${formatPeriode(r.periodeFrom)}`}
                    onClick={(e) => { e.stopPropagation(); window.open(`/api/rapporter/${r.id}/pdf`, "_blank"); }}
                  >
                    <Download className="h-3 w-3 mr-1" /> PDF
                  </Button>
                )}
                <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
