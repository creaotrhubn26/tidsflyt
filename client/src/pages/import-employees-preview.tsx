/**
 * Preview-side for en staged import.
 *
 *   /import-employees/:id/preview
 *
 * Hovedadmin går gjennom alle rader, justerer rolle per rad, klikker Bekreft.
 * Sikkerhetsventiler:
 *  - Bulk "Sett alle til X" inkluderer IKKE vendor_admin
 *  - Bekreftelses-modal lister opp navn på de som blir vendor_admin
 *  - Soft warning når vendor_admin > 3
 *  - Duplikater og feilrader markeres tydelig — kan ikke endres
 *
 * Status 'confirmed' = importen er allerede gjort. Da viser vi resultatet og
 * en rollback-knapp (kun innenfor 7-dagers-vinduet).
 */

import { useState, useMemo } from 'react';
import { useParams, useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  Undo2,
  Sparkles,
  Star,
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

type RowStatus = 'valid' | 'error' | 'duplicate' | 'imported' | 'skipped';

interface SeatWarning {
  current_users: number;
  will_have: number;
  max_users: number;
  overrun_by: number;
}

interface ImportRecord {
  id: string;
  vendorId: number;
  source: string;
  status: 'staged' | 'confirmed' | 'rolled_back' | 'failed';
  fileName: string | null;
  rowCount: number;
  createdBy: string;
  createdAt: string;
  confirmedAt: string | null;
  rolledBackAt: string | null;
  summaryJsonb: {
    valid?: number;
    errors?: number;
    duplicates?: number;
    imported?: number;
    skipped?: number;
    admin_grants?: string[];
    seat_warning?: SeatWarning | null;
    seat_overrun?: SeatWarning & { acked_by: string; acked_at: string };
  } | null;
}

interface ImportRow {
  id: string;
  importId: string;
  rowIndex: number;
  externalId: string | null;
  rawJsonb: Record<string, unknown>;
  parsedJsonb: {
    email?: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    department?: string;
    jobTitle?: string;
    hiredDate?: string;
  } | null;
  status: RowStatus;
  errorMsg: string | null;
  roleAssigned: string | null;
  targetUserId: number | null;
}

interface ImportResponse {
  import: ImportRecord;
  rows: ImportRow[];
}

const ROLE_OPTIONS_NORMAL: Array<{ value: string; label: string }> = [
  { value: 'miljoarbeider', label: 'Miljøarbeider' },
  { value: 'tiltaksleder',  label: 'Tiltaksleder' },
  { value: 'teamleder',     label: 'Teamleder' },
  { value: 'case_manager',  label: 'Saksbehandler' },
];
const ROLE_OPTION_ADMIN = { value: 'vendor_admin', label: 'Leverandøradmin ⚠' };

const ROLE_LABEL: Record<string, string> = {
  miljoarbeider: 'Miljøarbeider',
  tiltaksleder:  'Tiltaksleder',
  teamleder:     'Teamleder',
  case_manager:  'Saksbehandler',
  vendor_admin:  'Leverandøradmin',
};

function StatusBadge({ status }: { status: RowStatus }) {
  switch (status) {
    case 'valid':     return <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-800">Klar</Badge>;
    case 'error':     return <Badge variant="outline" className="border-rose-300 bg-rose-50 text-rose-800">Feil</Badge>;
    case 'duplicate': return <Badge variant="outline" className="border-slate-300 bg-slate-50 text-slate-700">Allerede registrert</Badge>;
    case 'imported':  return <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-800">Importert</Badge>;
    case 'skipped':   return <Badge variant="outline" className="border-slate-300 bg-slate-50 text-slate-600">Hoppet over</Badge>;
  }
}

export default function ImportEmployeesPreviewPage() {
  const params = useParams<{ id: string }>();
  const importId = params.id;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rollbackOpen, setRollbackOpen] = useState(false);
  const [gdprAck, setGdprAck] = useState(false);
  const [seatAck, setSeatAck] = useState(false);

  // Tideman-feedback (vises kun når importen er bekreftet)
  const [tidemanRating, setTidemanRating] = useState<number>(0);
  const [tidemanComment, setTidemanComment] = useState('');
  const [tidemanSent, setTidemanSent] = useState(false);
  const tidemanMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/imports/${importId}/feedback`, {
        rating: tidemanRating,
        comment: tidemanComment.trim() || undefined,
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error || 'Sending feilet');
      }
    },
    onSuccess: () => {
      setTidemanSent(true);
      toast({ title: 'Takk!', description: 'Tideman har sendt tilbakemeldingen din videre.' });
    },
    onError: (err: any) => toast({ title: 'Tideman fikk ikke meldingen', description: err?.message, variant: 'destructive' }),
  });

  const { data, isLoading, error } = useQuery<ImportResponse>({
    queryKey: ['/api/imports', importId],
    enabled: !!importId,
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ rowId, role }: { rowId: string; role: string }) => {
      const res = await apiRequest('PATCH', `/api/imports/${importId}/rows/${rowId}`, { role_assigned: role });
      if (!res.ok) throw new Error((await res.json())?.error || 'Feilet');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['/api/imports', importId] }),
    onError: (err: any) => toast({ title: 'Feil', description: err?.message, variant: 'destructive' }),
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const body: { gdpr_ack: boolean; seat_overrun_ack?: boolean } = { gdpr_ack: true };
      if (seatAck) body.seat_overrun_ack = true;
      const res = await apiRequest('POST', `/api/imports/${importId}/confirm`, body);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Bekreftelse feilet');
      return json;
    },
    onSuccess: (json: any) => {
      toast({
        title: 'Importen er fullført',
        description: `${json.imported} ansatte opprettet, ${json.skipped} hoppet over.`,
      });
      setConfirmOpen(false);
      setGdprAck(false);
      setSeatAck(false);
      qc.invalidateQueries({ queryKey: ['/api/imports', importId] });
    },
    onError: (err: any) => toast({ title: 'Feil', description: err?.message, variant: 'destructive' }),
  });

  const rollbackMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('DELETE', `/api/imports/${importId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Rollback feilet');
      return json;
    },
    onSuccess: (json: any) => {
      toast({
        title: 'Rollback fullført',
        description: `${json.rolled_back} ansatte fjernet.`,
      });
      setRollbackOpen(false);
      qc.invalidateQueries({ queryKey: ['/api/imports', importId] });
    },
    onError: (err: any) => toast({ title: 'Feil', description: err?.message, variant: 'destructive' }),
  });

  const rows = data?.rows ?? [];
  const importRec = data?.import;
  const isStaged = importRec?.status === 'staged';
  const isConfirmed = importRec?.status === 'confirmed';

  const adminGrants = useMemo(
    () => rows.filter((r) => r.status === 'valid' && r.roleAssigned === 'vendor_admin'),
    [rows],
  );

  const validRows = useMemo(() => rows.filter((r) => r.status === 'valid'), [rows]);
  const seatWarning = importRec?.summaryJsonb?.seat_warning ?? null;
  const confirmDisabled = !gdprAck || (seatWarning != null && !seatAck) || confirmMutation.isPending;

  function setRoleForRow(rowId: string, role: string) {
    updateRoleMutation.mutate({ rowId, role });
  }

  async function bulkSetRole(role: string) {
    if (role === 'vendor_admin') return; // bulk-aksjon ekskluderer admin-rolle
    const targets = validRows.filter((r) => r.roleAssigned !== role);
    if (targets.length === 0) return;
    if (!confirm(`Sett ${targets.length} rader til "${ROLE_LABEL[role]}"?`)) return;
    for (const r of targets) {
      await updateRoleMutation.mutateAsync({ rowId: r.id, role });
    }
  }

  if (isLoading) {
    return (
      <main className="container mx-auto max-w-6xl px-4 py-12 text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
        <p className="mt-2 text-sm text-muted-foreground">Henter import...</p>
      </main>
    );
  }
  if (error || !importRec) {
    return (
      <main className="container mx-auto max-w-6xl px-4 py-12 text-center">
        <XCircle className="mx-auto h-10 w-10 text-rose-500" />
        <p className="mt-2 text-sm">Kunne ikke laste importen.</p>
        <Button variant="outline" onClick={() => navigate('/import-employees')} className="mt-3">Gå tilbake</Button>
      </main>
    );
  }

  return (
    <main className="container mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/import-employees')} className="mb-2">
          <ArrowLeft className="mr-1 h-4 w-4" />
          Ny import
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#16343d]">Importer ansatte — preview</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Kilde: <strong>{importRec.source}</strong> · Fil:{' '}
              <span className="font-mono">{importRec.fileName ?? '(ukjent)'}</span> · {importRec.rowCount} rader
            </p>
          </div>
          <div className="flex gap-2">
            {isStaged && (
              <>
                <Button variant="outline" onClick={() => navigate('/import-employees')} data-testid="button-cancel">
                  Avbryt
                </Button>
                <Button
                  onClick={() => setConfirmOpen(true)}
                  disabled={validRows.length === 0}
                  data-testid="button-open-confirm"
                >
                  Bekreft import ({validRows.length})
                </Button>
              </>
            )}
            {isConfirmed && (
              <Button variant="destructive" onClick={() => setRollbackOpen(true)} data-testid="button-open-rollback">
                <Undo2 className="mr-1 h-4 w-4" />
                Rull tilbake
              </Button>
            )}
          </div>
        </div>
      </header>

      {isConfirmed && (
        <Card className="mb-4 border-emerald-300 bg-emerald-50 p-3">
          <div className="flex items-start gap-2 text-sm text-emerald-900">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <strong>Importen er bekreftet.</strong>{' '}
              {importRec.summaryJsonb?.imported ?? 0} ansatte opprettet,{' '}
              {importRec.summaryJsonb?.skipped ?? 0} hoppet over. Rollback-vinduet er 7 dager fra{' '}
              {importRec.confirmedAt && new Date(importRec.confirmedAt).toLocaleString('nb')}.
            </div>
          </div>
        </Card>
      )}

      {isConfirmed && !tidemanSent && (
        <Card className="mb-4 border-slate-200 p-4" data-testid="tideman-feedback-card">
          <p className="text-[10px] uppercase tracking-widest text-slate-500">Tideman · feedback-mottaker</p>
          <h3 className="mt-1 text-base font-semibold text-[#16343d]">Hvordan gikk importen?</h3>
          <p className="mt-1 text-sm text-[#486168]">
            Si fra hvis noe var rart eller fungerte bra — Tideman tar imot tilbakemeldingen og sender den videre til Tidum-teamet.
          </p>
          <div className="mt-3 flex items-center gap-1" role="radiogroup" aria-label="Rating 1 til 5 stjerner">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={tidemanRating === n}
                aria-label={`${n} av 5 stjerner`}
                onClick={() => setTidemanRating(n)}
                className="rounded p-1 transition hover:bg-slate-100"
                data-testid={`tideman-star-${n}`}
              >
                <Star
                  className={`h-6 w-6 ${tidemanRating >= n ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`}
                />
              </button>
            ))}
          </div>
          <textarea
            value={tidemanComment}
            onChange={(e) => setTidemanComment(e.target.value)}
            placeholder="Hva fungerte? Hva kan bli bedre? (valgfritt)"
            maxLength={4000}
            rows={3}
            className="mt-3 w-full rounded-md border border-slate-300 p-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            data-testid="tideman-comment"
          />
          <div className="mt-3 flex items-center justify-between">
            <p className="text-xs text-slate-500">
              {tidemanRating === 0 ? 'Velg minst én stjerne for å sende.' : `Du har valgt ${tidemanRating} av 5.`}
            </p>
            <Button
              onClick={() => tidemanMutation.mutate()}
              disabled={tidemanRating === 0 || tidemanMutation.isPending}
              data-testid="tideman-submit"
            >
              {tidemanMutation.isPending ? 'Sender til Tideman…' : 'Send til Tideman'}
            </Button>
          </div>
        </Card>
      )}

      {isConfirmed && tidemanSent && (
        <Card className="mb-4 border-emerald-200 bg-emerald-50 p-3" data-testid="tideman-thanks">
          <div className="flex items-start gap-2 text-sm text-emerald-900">
            <Star className="mt-0.5 h-4 w-4 shrink-0 fill-amber-400 text-amber-400" />
            <div>
              <strong>Takk!</strong> Tideman har sendt tilbakemeldingen videre til Tidum-teamet. Vi setter pris på det.
            </div>
          </div>
        </Card>
      )}

      {/* Seat-overrun banner: vises både ved staged (advarsel) og confirmed (bekreftet overrun) */}
      {(seatWarning || importRec.summaryJsonb?.seat_overrun) && (
        <Card className="mb-4 border-amber-400 bg-amber-50 p-4" data-testid="seat-warning-banner">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
            <div className="text-sm text-amber-900">
              <p className="font-semibold">Importen overstiger avtalt brukerantall</p>
              {(() => {
                const sw = seatWarning ?? importRec.summaryJsonb?.seat_overrun!;
                return (
                  <p className="mt-1">
                    Dere har <strong>{sw.current_users}</strong> brukere i Tidum i dag. Etter denne importen vil dere ha <strong>{sw.will_have}</strong>, som er <strong>{sw.overrun_by}</strong> over avtalt grense på <strong>{sw.max_users}</strong>.
                  </p>
                );
              })()}
              <p className="mt-2 text-xs">
                Iht. avtalens §2.4 oppgraderes dere til riktig prising-tier ved neste fakturasyklus. Daniel (Tidum-support) blir automatisk varslet ved bekreftelse, slik at tier-justering kan trigges.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Summary + bulk-aksjoner */}
      {isStaged && (
        <Card className="mb-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <span className="font-semibold">{validRows.length}</span> klar ·{' '}
              <span className="text-rose-700">{rows.filter((r) => r.status === 'error').length}</span> feil ·{' '}
              <span className="text-slate-600">{rows.filter((r) => r.status === 'duplicate').length}</span> duplikater
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Sett alle til:</span>
              {ROLE_OPTIONS_NORMAL.map((opt) => (
                <Button
                  key={opt.value}
                  variant="outline"
                  size="sm"
                  onClick={() => bulkSetRole(opt.value)}
                  data-testid={`bulk-${opt.value}`}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>
          {adminGrants.length > 3 && (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                Du har valgt <strong>{adminGrants.length}</strong> personer som leverandøradmin. Det er uvanlig mange — vurder om alle virkelig trenger admin-tilgang.
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Rad-tabell */}
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Navn</th>
              <th className="px-3 py-2">E-post</th>
              <th className="px-3 py-2">Telefon</th>
              <th className="px-3 py-2">Avdeling</th>
              <th className="px-3 py-2">Stilling</th>
              <th className="px-3 py-2">Rolle i Tidum</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const p = r.parsedJsonb;
              const isEditable = r.status === 'valid' && isStaged;
              const suggested = r.roleAssigned === 'tiltaksleder' && p?.jobTitle;
              return (
                <tr
                  key={r.id}
                  className={
                    'border-t ' +
                    (r.status === 'error' ? 'bg-rose-50/50 ' :
                     r.status === 'duplicate' ? 'bg-slate-50/50 ' :
                     r.status === 'imported' ? 'bg-blue-50/30 ' : '')
                  }
                  data-testid={`row-${r.rowIndex}`}
                >
                  <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                  <td className="px-3 py-2">
                    {p ? `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{p?.email ?? <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-3 py-2">{p?.phone ?? <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-3 py-2">{p?.department ?? <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-3 py-2">
                    {p?.jobTitle ?? <span className="text-muted-foreground">—</span>}
                    {suggested && (
                      <span className="ml-1 inline-flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-800">
                        <Sparkles className="h-3 w-3" />
                        Foreslått
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {r.status === 'error' && <span className="text-xs text-rose-700">{r.errorMsg}</span>}
                    {r.status === 'duplicate' && <span className="text-xs text-muted-foreground">Allerede i Tidum</span>}
                    {r.status === 'imported' && (
                      <span className="text-xs">{r.roleAssigned ? ROLE_LABEL[r.roleAssigned] ?? r.roleAssigned : '—'}</span>
                    )}
                    {isEditable && (
                      <Select
                        value={r.roleAssigned ?? 'miljoarbeider'}
                        onValueChange={(v) => setRoleForRow(r.id, v)}
                      >
                        <SelectTrigger className="h-8 w-[180px] text-xs" data-testid={`role-select-${r.rowIndex}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLE_OPTIONS_NORMAL.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                          <div className="my-1 h-px bg-border" />
                          <SelectItem value={ROLE_OPTION_ADMIN.value}>{ROLE_OPTION_ADMIN.label}</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {/* Bekreftelses-modal */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bekreft import</DialogTitle>
            <DialogDescription>
              {validRows.length} ansatte vil bli opprettet i Tidum med rollene du har valgt. Denne handlingen kan rulles tilbake innen 7 dager.
            </DialogDescription>
          </DialogHeader>
          {adminGrants.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
              <div className="flex items-start gap-2 text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-semibold">
                    Du gir leverandøradmin-tilgang til {adminGrants.length} {adminGrants.length === 1 ? 'person' : 'personer'}:
                  </p>
                  <ul className="mt-2 list-disc space-y-0.5 pl-5">
                    {adminGrants.map((r) => (
                      <li key={r.id} className="font-mono text-xs">
                        {r.parsedJsonb?.email}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-amber-800">
                    Disse vil ha tilnærmet samme rettigheter som deg selv. Forsikre deg om at det stemmer.
                  </p>
                </div>
              </div>
            </div>
          )}
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs">
            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                checked={gdprAck}
                onChange={(e) => setGdprAck(e.target.checked)}
                className="mt-0.5"
                data-testid="checkbox-gdpr-ack"
              />
              <span className="text-[#37474d]">
                Jeg bekrefter at vår virksomhet har rettsgrunnlag (typisk arbeidskontrakt eller berettiget interesse iht. GDPR art. 6) for å overføre disse personopplysningene til Tidum, og at vi har informert de ansatte iht. art. 13. Tidum behandler dataene som databehandler iht. signert databehandleravtale (DPA).
              </span>
            </label>
          </div>
          {seatWarning && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs">
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  checked={seatAck}
                  onChange={(e) => setSeatAck(e.target.checked)}
                  className="mt-0.5"
                  data-testid="checkbox-seat-ack"
                />
                <span className="text-amber-900">
                  Jeg aksepterer at vi går fra <strong>{seatWarning.current_users}</strong> til <strong>{seatWarning.will_have}</strong> brukere — <strong>{seatWarning.overrun_by}</strong> over avtalt grense på <strong>{seatWarning.max_users}</strong> — og at dette utløser en tier-oppgradering ved neste fakturasyklus iht. avtalens §2.4.
                </span>
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setConfirmOpen(false); setGdprAck(false); setSeatAck(false); }}>Avbryt</Button>
            <Button
              onClick={() => confirmMutation.mutate()}
              disabled={confirmDisabled}
              data-testid="button-confirm-import"
            >
              {confirmMutation.isPending ? 'Importerer...' : `Bekreft og opprett ${validRows.length} brukere`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rollback-modal */}
      <Dialog open={rollbackOpen} onOpenChange={setRollbackOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rull tilbake importen?</DialogTitle>
            <DialogDescription>
              Alle {importRec.summaryJsonb?.imported ?? 0} ansatte som ble opprettet av denne importen blir slettet fra Tidum. Dette kan ikke angres.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRollbackOpen(false)}>Avbryt</Button>
            <Button
              variant="destructive"
              onClick={() => rollbackMutation.mutate()}
              disabled={rollbackMutation.isPending}
              data-testid="button-confirm-rollback"
            >
              {rollbackMutation.isPending ? 'Ruller tilbake...' : 'Ja, rull tilbake'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
