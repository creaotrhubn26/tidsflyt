/**
 * /tiltaksleder/satser
 *
 * Sats-administrasjon for tiltaksleder + admin. Viser månedstotal per
 * (sak × bruker × lokasjon), tillater inline-redigering av sats, og
 * gir CRUD over lokasjoner per sak.
 *
 * Sats-prioritet:
 *   1. sak_locations.{hourly_rate,day_rate} (overstyrer)
 *   2. user_cases.{hourly_rate,day_rate}    (default per bruker × sak)
 */
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, HelpCircle, MapPin, Plus, Trash2, ArrowLeft, ArrowRight, Edit3, Save, X } from 'lucide-react';
import { PortalLayout } from '@/components/portal/portal-layout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface MonthlyRow {
  sakId: string;
  saksnummer: string;
  sakTitle: string;
  vendorId: number;
  companyUserId: number | null;
  userEmail: string | null;
  userCaseId: number | null;
  hourlyRate: number | null;
  dayRate: number | null;
  rateMode: 'hour' | 'day';
  locationId: string | null;
  locationName: string | null;
  locationMode: 'hour' | 'day' | null;
  locationHourly: number | null;
  locationDay: number | null;
  hours: number;
  days: number;
  amount: number;
}

interface SakLocation {
  id: string;
  sak_id: string;
  name: string;
  address: string | null;
  rate_mode: 'hour' | 'day';
  hourly_rate: string | null;
  day_rate: string | null;
  active: boolean;
}

function formatKr(value: number): string {
  return new Intl.NumberFormat('nb-NO', { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 }).format(value);
}

function formatHours(value: number): string {
  return `${value.toFixed(1)} t`;
}

function shiftMonth(period: string, delta: number): string {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function periodLabel(period: string): string {
  const [y, m] = period.split('-').map(Number);
  const months = ['Januar', 'Februar', 'Mars', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Desember'];
  return `${months[m - 1]} ${y}`;
}

export default function TiltakslederSatserPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [period, setPeriod] = useState<string>(currentPeriod());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{ userCaseId: number; field: 'hourly' | 'day' } | null>(null);
  const [editValue, setEditValue] = useState('');

  const { data, isLoading } = useQuery<{ rows: MonthlyRow[]; total: number; period: string }>({
    queryKey: ['/api/tiltaksleder/monthly-totals', period],
    queryFn: async () => {
      const r = await apiRequest('GET', `/api/tiltaksleder/monthly-totals?period=${period}`);
      return r.json();
    },
  });

  const updateRate = useMutation({
    mutationFn: async (input: { userCaseId: number; rateMode?: 'hour' | 'day'; hourlyRate?: number; dayRate?: number }) => {
      const r = await apiRequest('PATCH', `/api/tiltaksleder/user-cases/${input.userCaseId}/rate`, {
        rateMode: input.rateMode,
        hourlyRate: input.hourlyRate,
        dayRate: input.dayRate,
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.error || 'Sats-oppdatering feilet');
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/tiltaksleder/monthly-totals'] });
      toast({ title: 'Sats oppdatert' });
    },
    onError: (err: any) => toast({ title: 'Kunne ikke oppdatere sats', description: err?.message, variant: 'destructive' }),
  });

  // Group rows by (sakId, userEmail) — within each (user × sak) we may have
  // multiple locations + a default-bucket (locationId=null).
  const groupedBySak = useMemo(() => {
    const out = new Map<string, { sakId: string; saksnummer: string; sakTitle: string; rows: MonthlyRow[]; subtotal: number }>();
    for (const r of data?.rows ?? []) {
      const key = r.sakId;
      const existing = out.get(key);
      if (existing) {
        existing.rows.push(r);
        existing.subtotal += r.amount;
      } else {
        out.set(key, { sakId: r.sakId, saksnummer: r.saksnummer, sakTitle: r.sakTitle, rows: [r], subtotal: r.amount });
      }
    }
    return Array.from(out.values()).sort((a, b) => a.sakTitle.localeCompare(b.sakTitle, 'nb'));
  }, [data]);

  const grandTotal = data?.total ?? 0;

  const startEdit = (userCaseId: number, field: 'hourly' | 'day', current: number | null) => {
    setEditing({ userCaseId, field });
    setEditValue(current != null ? String(current) : '');
  };
  const cancelEdit = () => { setEditing(null); setEditValue(''); };
  const saveEdit = () => {
    if (!editing) return;
    const value = Number(editValue);
    if (!Number.isFinite(value) || value < 0) {
      toast({ title: 'Ugyldig verdi', variant: 'destructive' });
      return;
    }
    updateRate.mutate({
      userCaseId: editing.userCaseId,
      hourlyRate: editing.field === 'hourly' ? value : undefined,
      dayRate: editing.field === 'day' ? value : undefined,
    });
    cancelEdit();
  };

  const toggleSak = (sakId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(sakId)) next.delete(sakId);
      else next.add(sakId);
      return next;
    });
  };

  return (
    <PortalLayout>
      <div className="mx-auto max-w-6xl px-4 py-6">
        {/* Tideman-banner */}
        <Card className="mb-4 overflow-hidden border-slate-200 p-0" data-testid="tideman-rates-header">
          <div className="bg-gradient-to-r from-amber-500 to-orange-600 px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/20 ring-1 ring-white/40" aria-hidden="true">
                <HelpCircle className="h-4 w-4" />
              </div>
              <div className="leading-tight">
                <p className="text-[10px] uppercase tracking-widest text-white/80">Tideman · hjelpe-agent</p>
                <p className="text-sm font-semibold">Satser og månedstotaler</p>
              </div>
            </div>
          </div>
          <div className="p-4 text-sm text-[#486168]">
            Klikk på en kr-verdi for å endre sats. Lokasjons-sats overstyrer bruker-sats — så hvis Tom har 280 kr/t generelt, men 1 800 kr/døgn i Bjørndalen, så regnes Bjørndalen-tiden med døgnsats.
          </div>
        </Card>

        {/* Måneds-velger */}
        <div className="mb-4 flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setPeriod(shiftMonth(period, -1))} data-testid="prev-month">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <p className="min-w-[140px] text-center text-sm font-semibold text-[#16343d]">{periodLabel(period)}</p>
            <Button variant="outline" size="icon" onClick={() => setPeriod(shiftMonth(period, 1))} data-testid="next-month">
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setPeriod(currentPeriod())} data-testid="today">I dag</Button>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-widest text-slate-500">Måneden totalt</p>
            <p className="text-xl font-bold text-[#16343d]" data-testid="grand-total">{formatKr(grandTotal)}</p>
          </div>
        </div>

        {/* Innhold */}
        {isLoading && <Card className="p-8 text-center text-sm text-slate-500">Henter data…</Card>}

        {!isLoading && groupedBySak.length === 0 && (
          <Card className="p-8 text-center text-sm text-slate-500">
            Ingen registrert tid på dine saker i {periodLabel(period)}. Når miljøarbeidere fører timer, vises beløpene her.
          </Card>
        )}

        {!isLoading && groupedBySak.map((group) => {
          const isCollapsed = collapsed.has(group.sakId);
          return (
            <Card key={group.sakId} className="mb-3 overflow-hidden border-slate-200" data-testid={`sak-group-${group.sakId}`}>
              <button
                type="button"
                onClick={() => toggleSak(group.sakId)}
                className="flex w-full items-center justify-between bg-slate-50 px-4 py-3 hover:bg-slate-100"
              >
                <div className="flex items-center gap-2">
                  {isCollapsed ? <ChevronRight className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
                  <div className="text-left">
                    <p className="text-sm font-semibold text-[#16343d]">{group.sakTitle}</p>
                    <p className="text-xs text-slate-500">{group.saksnummer}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-widest text-slate-500">Sak totalt</p>
                  <p className="text-base font-semibold text-[#16343d]">{formatKr(group.subtotal)}</p>
                </div>
              </button>

              {!isCollapsed && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-white text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-2 text-left">Bruker</th>
                        <th className="px-4 py-2 text-left">Lokasjon</th>
                        <th className="px-4 py-2 text-left">Modus</th>
                        <th className="px-4 py-2 text-right">Sats</th>
                        <th className="px-4 py-2 text-right">Mengde</th>
                        <th className="px-4 py-2 text-right">Beløp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map((r, idx) => {
                        const isLocOverride = r.locationId != null;
                        const effectiveMode: 'hour' | 'day' = isLocOverride
                          ? (r.locationMode ?? 'hour')
                          : r.rateMode;
                        const effectiveRate = isLocOverride
                          ? (effectiveMode === 'day' ? r.locationDay : r.locationHourly)
                          : (effectiveMode === 'day' ? r.dayRate : r.hourlyRate);
                        const isEditingThis =
                          !isLocOverride &&
                          editing?.userCaseId === r.userCaseId &&
                          editing?.field === (effectiveMode === 'day' ? 'day' : 'hourly');
                        return (
                          <tr key={`${group.sakId}-${idx}`} className="border-t border-slate-100" data-testid={`row-${r.userCaseId ?? 'orphan'}-${r.locationId ?? 'default'}`}>
                            <td className="px-4 py-2 text-[#16343d]">{r.userEmail ?? '—'}</td>
                            <td className="px-4 py-2 text-slate-700">
                              {r.locationName ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-900">
                                  <MapPin className="h-3 w-3" />
                                  {r.locationName}
                                </span>
                              ) : (
                                <span className="text-xs text-slate-400">— ingen —</span>
                              )}
                            </td>
                            <td className="px-4 py-2">
                              {!isLocOverride && r.userCaseId != null ? (
                                <RateModeToggle
                                  current={effectiveMode}
                                  onChange={(mode) => updateRate.mutate({ userCaseId: r.userCaseId!, rateMode: mode })}
                                  testIdPrefix={`row-${r.userCaseId}`}
                                />
                              ) : (
                                <span className="text-xs uppercase text-slate-500">{effectiveMode === 'day' ? 'Døgn' : 'Time'}</span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-right">
                              {isEditingThis ? (
                                <div className="flex items-center justify-end gap-1">
                                  <Input
                                    type="number"
                                    min="0"
                                    step="10"
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') saveEdit();
                                      if (e.key === 'Escape') cancelEdit();
                                    }}
                                    className="h-7 w-24 text-right"
                                    autoFocus
                                    data-testid="rate-edit-input"
                                  />
                                  <Button size="icon" variant="ghost" onClick={saveEdit} className="h-7 w-7"><Save className="h-3 w-3" /></Button>
                                  <Button size="icon" variant="ghost" onClick={cancelEdit} className="h-7 w-7"><X className="h-3 w-3" /></Button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  disabled={isLocOverride || r.userCaseId == null}
                                  onClick={() => r.userCaseId != null && startEdit(r.userCaseId, effectiveMode === 'day' ? 'day' : 'hourly', effectiveRate)}
                                  className={`inline-flex items-center gap-1 rounded px-2 py-0.5 ${isLocOverride ? 'cursor-not-allowed text-slate-500' : 'hover:bg-slate-100 text-[#16343d]'}`}
                                  data-testid={`rate-button-${r.userCaseId ?? 'orphan'}`}
                                  title={isLocOverride ? 'Lokasjons-sats — endre via lokasjons-knappen i sak-headeren' : 'Klikk for å endre sats'}
                                >
                                  {effectiveRate != null ? formatKr(effectiveRate) : <span className="text-amber-700">Sett sats</span>}
                                  {!isLocOverride && r.userCaseId != null && <Edit3 className="h-3 w-3 text-slate-400" />}
                                </button>
                              )}
                            </td>
                            <td className="px-4 py-2 text-right text-slate-700">
                              {effectiveMode === 'day' ? `${r.days} dgn` : formatHours(r.hours)}
                            </td>
                            <td className="px-4 py-2 text-right font-semibold text-[#16343d]">
                              {formatKr(r.amount)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  <SakLocationsEditor sakId={group.sakId} />
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </PortalLayout>
  );
}

/* ─── Rate-modus-toggle (Time/Døgn) ────────────────────────────────────── */
function RateModeToggle({
  current,
  onChange,
  testIdPrefix,
}: {
  current: 'hour' | 'day';
  onChange: (mode: 'hour' | 'day') => void;
  testIdPrefix: string;
}) {
  return (
    <div className="inline-flex rounded-md border border-slate-200 p-0.5 text-xs">
      <button
        type="button"
        onClick={() => current !== 'hour' && onChange('hour')}
        className={`px-2 py-0.5 rounded ${current === 'hour' ? 'bg-amber-500 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
        data-testid={`${testIdPrefix}-mode-hour`}
      >
        Time
      </button>
      <button
        type="button"
        onClick={() => current !== 'day' && onChange('day')}
        className={`px-2 py-0.5 rounded ${current === 'day' ? 'bg-amber-500 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
        data-testid={`${testIdPrefix}-mode-day`}
      >
        Døgn
      </button>
    </div>
  );
}

/* ─── Lokasjons-editor for én sak ──────────────────────────────────────── */
function SakLocationsEditor({ sakId }: { sakId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftAddress, setDraftAddress] = useState('');
  const [draftMode, setDraftMode] = useState<'hour' | 'day'>('day');
  const [draftHourly, setDraftHourly] = useState('');
  const [draftDay, setDraftDay] = useState('');

  const { data } = useQuery<{ locations: SakLocation[] }>({
    queryKey: ['/api/saker', sakId, 'locations'],
    queryFn: async () => {
      const r = await apiRequest('GET', `/api/saker/${sakId}/locations`);
      return r.json();
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const r = await apiRequest('POST', `/api/saker/${sakId}/locations`, {
        name: draftName.trim(),
        address: draftAddress.trim() || undefined,
        rateMode: draftMode,
        hourlyRate: draftHourly ? Number(draftHourly) : undefined,
        dayRate: draftDay ? Number(draftDay) : undefined,
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.error || 'Lokasjon kunne ikke opprettes');
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/saker', sakId, 'locations'] });
      qc.invalidateQueries({ queryKey: ['/api/tiltaksleder/monthly-totals'] });
      setAdding(false);
      setDraftName(''); setDraftAddress(''); setDraftMode('day'); setDraftHourly(''); setDraftDay('');
      toast({ title: 'Lokasjon lagt til' });
    },
    onError: (err: any) => toast({ title: 'Kunne ikke legge til lokasjon', description: err?.message, variant: 'destructive' }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiRequest('DELETE', `/api/saker/${sakId}/locations/${id}`);
      if (!r.ok) throw new Error('Kunne ikke fjerne');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/saker', sakId, 'locations'] });
      qc.invalidateQueries({ queryKey: ['/api/tiltaksleder/monthly-totals'] });
    },
  });

  const activeLocations = (data?.locations ?? []).filter((l) => l.active);

  return (
    <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Lokasjoner</p>
        {!adding && (
          <Button size="sm" variant="ghost" onClick={() => setAdding(true)} data-testid={`add-location-${sakId}`}>
            <Plus className="mr-1 h-3 w-3" /> Legg til lokasjon
          </Button>
        )}
      </div>

      {activeLocations.length === 0 && !adding && (
        <p className="text-xs text-slate-400">Ingen lokasjoner registrert. Legg til en tiltaksbolig for å bruke døgnsats.</p>
      )}

      {activeLocations.length > 0 && (
        <ul className="space-y-1.5">
          {activeLocations.map((loc) => (
            <li key={loc.id} className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
              <div className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 text-amber-600" />
                <div>
                  <p className="font-medium text-[#16343d]">{loc.name}</p>
                  {loc.address && <p className="text-xs text-slate-500">{loc.address}</p>}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <p className="text-xs text-slate-600">
                  {loc.rate_mode === 'day' && loc.day_rate ? `${formatKr(Number(loc.day_rate))} / døgn` : null}
                  {loc.rate_mode === 'hour' && loc.hourly_rate ? `${formatKr(Number(loc.hourly_rate))} / time` : null}
                </p>
                <button
                  type="button"
                  onClick={() => remove.mutate(loc.id)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                  aria-label="Fjern lokasjon"
                  data-testid={`remove-location-${loc.id}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <div className="mt-2 rounded-md border border-amber-200 bg-amber-50/50 p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Navn *</Label>
              <Input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="Tiltaksbolig Bjørndalen"
                className="h-8"
                data-testid="new-location-name"
              />
            </div>
            <div>
              <Label className="text-xs">Adresse</Label>
              <Input
                value={draftAddress}
                onChange={(e) => setDraftAddress(e.target.value)}
                placeholder="Storgata 12, 0181 Oslo"
                className="h-8"
                data-testid="new-location-address"
              />
            </div>
            <div>
              <Label className="text-xs">Modus</Label>
              <div className="flex gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant={draftMode === 'hour' ? 'default' : 'outline'}
                  onClick={() => setDraftMode('hour')}
                  className="h-8"
                >Time</Button>
                <Button
                  type="button"
                  size="sm"
                  variant={draftMode === 'day' ? 'default' : 'outline'}
                  onClick={() => setDraftMode('day')}
                  className="h-8"
                >Døgn</Button>
              </div>
            </div>
            <div>
              <Label className="text-xs">{draftMode === 'day' ? 'Døgnsats (kr)' : 'Timesats (kr)'}</Label>
              <Input
                type="number"
                min="0"
                step="10"
                value={draftMode === 'day' ? draftDay : draftHourly}
                onChange={(e) => draftMode === 'day' ? setDraftDay(e.target.value) : setDraftHourly(e.target.value)}
                placeholder={draftMode === 'day' ? '1800' : '280'}
                className="h-8"
                data-testid="new-location-rate"
              />
            </div>
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Avbryt</Button>
            <Button
              size="sm"
              onClick={() => create.mutate()}
              disabled={!draftName.trim() || create.isPending}
              data-testid="save-location"
            >
              {create.isPending ? 'Lagrer…' : 'Lagre lokasjon'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
