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
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

type RowStatus = 'valid' | 'error' | 'duplicate' | 'imported' | 'skipped';

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
  summaryJsonb: { valid?: number; errors?: number; duplicates?: number; imported?: number; skipped?: number; admin_grants?: string[] } | null;
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
      const res = await apiRequest('POST', `/api/imports/${importId}/confirm`, {});
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Avbryt</Button>
            <Button
              onClick={() => confirmMutation.mutate()}
              disabled={confirmMutation.isPending}
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
