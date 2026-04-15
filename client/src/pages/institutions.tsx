import { useEffect, useMemo, useRef, useState } from "react";
import { PortalLayout } from "@/components/portal/portal-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useRolePreview } from "@/hooks/use-role-preview";
import { useBrregSearch, type BrregCompany } from "@/hooks/use-brreg-search";
import { useInstitutions, useInstitutionStats, type Institution } from "@/hooks/use-institutions";
import { useRapportTemplates } from "@/hooks/use-rapport-templates";
import {
  Building2, Plus, Search, Trash2, Pencil, Mail, Phone, MapPin,
  CheckCircle2, AlertCircle, Forward, Clock, Loader2,
  FileText, FolderKanban, TrendingUp, Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

const ADMIN_ROLES = ["vendor_admin", "tiltaksleder", "teamleder", "hovedadmin", "admin", "super_admin"];

const TYPE_LABELS: Record<string, string> = {
  barnevern:  "Barnevern",
  nav:        "NAV",
  kommune:    "Kommune",
  privat:     "Privat",
  helsevesen: "Helsevesen",
  annet:      "Annet",
};

const emptyForm: Partial<Institution> = {
  name: "",
  orgNumber: "",
  institutionType: "annet",
  contactPerson: "",
  contactEmail: "",
  contactPhone: "",
  address: "",
  autoForwardRapport: false,
  forwardEmail: "",
  overtimeApplicable: true,
  defaultRapportTemplateId: null,
  notes: "",
  brregVerified: false,
};

export default function InstitutionsPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { effectiveRole } = useRolePreview();
  const isAdmin = ADMIN_ROLES.includes(effectiveRole);

  const { institutions, isLoading, create, update, remove } = useInstitutions();
  const { data: statsList = [] } = useInstitutionStats();
  const { templates } = useRapportTemplates();
  const statsByInstId = useMemo(() => {
    const m = new Map<string, any>();
    statsList.forEach(s => m.set(s.institutionId, s));
    return m;
  }, [statsList]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Institution | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState<Partial<Institution>>(emptyForm);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkCsv, setBulkCsv] = useState("");
  const [bulkResult, setBulkResult] = useState<any>(null);
  const qc = useQueryClient();
  const bulkImport = useMutation({
    mutationFn: (rows: any[]) => apiRequest("/api/institutions/bulk", {
      method: "POST", body: JSON.stringify({ rows }),
    }),
    onSuccess: (res: any) => {
      setBulkResult(res);
      qc.invalidateQueries({ queryKey: ["/api/institutions"] });
      toast({ title: `${res?.created ?? 0} institusjoner lagt til` });
    },
    onError: (e: any) => toast({ title: "Import feilet", description: e.message, variant: "destructive" }),
  });

  function parseCsvInstitutions(csv: string): any[] {
    const lines = csv.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return [];
    // Detect header
    const headerLine = lines[0].toLowerCase();
    const hasHeader = /(name|navn|orgnr|institution|type|email)/.test(headerLine);
    const rows = hasHeader ? lines.slice(1) : lines;
    const headers = hasHeader
      ? lines[0].split(/[,;]/).map(h => h.trim().toLowerCase())
      : ["name", "orgnumber", "institutiontype", "contactemail", "forwardemail"];
    return rows.map(line => {
      const cols = line.split(/[,;]/).map(c => c.trim());
      const obj: any = {};
      headers.forEach((h, i) => { obj[h] = cols[i] ?? ""; });
      // Normalize keys
      return {
        name: obj.name || obj.navn || cols[0] || "",
        orgNumber: obj.orgnumber || obj.orgnr || obj["org-nr"] || null,
        institutionType: obj.institutiontype || obj.type || null,
        contactEmail: obj.contactemail || obj.email || obj["e-post"] || null,
        forwardEmail: obj.forwardemail || obj.videresendEmail || null,
        autoForwardRapport: !!(obj.autoforward || obj.autoforwardrapport),
        notes: obj.notes || obj.notat || null,
      };
    }).filter(r => r.name);
  }

  // Brreg lookup inside the dialog
  const brreg = useBrregSearch();
  const [brregQuery, setBrregQuery] = useState("");
  const brregRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (brregRef.current && !brregRef.current.contains(e.target as Node)) brreg.setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [brreg]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return institutions;
    return institutions.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        (i.orgNumber || "").includes(q) ||
        (i.contactEmail || "").toLowerCase().includes(q),
    );
  }, [institutions, search]);

  const stats = useMemo(() => {
    const total = institutions.length;
    const autoForward = institutions.filter((i) => i.autoForwardRapport).length;
    const noOvertime = institutions.filter((i) => !i.overtimeApplicable).length;
    return { total, autoForward, noOvertime };
  }, [institutions]);

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setBrregQuery("");
    brreg.reset();
    setShowDialog(true);
  };

  const openEdit = (inst: Institution) => {
    setEditing(inst);
    setForm({
      name: inst.name,
      orgNumber: inst.orgNumber || "",
      institutionType: inst.institutionType || "annet",
      contactPerson: inst.contactPerson || "",
      contactEmail: inst.contactEmail || "",
      contactPhone: inst.contactPhone || "",
      address: inst.address || "",
      autoForwardRapport: inst.autoForwardRapport,
      forwardEmail: inst.forwardEmail || "",
      overtimeApplicable: inst.overtimeApplicable,
      defaultRapportTemplateId: inst.defaultRapportTemplateId,
      notes: inst.notes || "",
      brregVerified: inst.brregVerified,
    });
    setBrregQuery("");
    brreg.reset();
    setShowDialog(true);
  };

  const handleSubmit = async () => {
    if (!form.name?.trim()) {
      toast({ title: "Navn er påkrevd", variant: "destructive" });
      return;
    }
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, data: form });
        toast({ title: "Lagret", description: "Institusjon oppdatert" });
      } else {
        await create.mutateAsync(form);
        toast({ title: "Opprettet", description: "Institusjon lagt til" });
      }
      setShowDialog(false);
    } catch (e: any) {
      toast({ title: "Feil", description: e.message, variant: "destructive" });
    }
  };

  const handleDelete = async (inst: Institution) => {
    if (!confirm(`Slett institusjon "${inst.name}"? Tilknyttede saker vil miste koblingen.`)) return;
    try {
      await remove.mutateAsync(inst.id);
      toast({ title: "Slettet" });
    } catch (e: any) {
      toast({ title: "Feil", description: e.message, variant: "destructive" });
    }
  };

  return (
    <PortalLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
              <Building2 className="h-7 w-7 text-primary" />
              Institusjoner
            </h1>
            <p className="text-muted-foreground mt-1">
              Oppdragsgivere og samarbeidspartnere — barnevern, NAV, kommune og andre
            </p>
          </div>
          {isAdmin && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setBulkOpen(true); setBulkResult(null); setBulkCsv(""); }}>
                <Upload className="h-4 w-4 mr-2" />
                Bulk-import
              </Button>
              <Button onClick={openNew}>
                <Plus className="h-4 w-4 mr-2" />
                Ny institusjon
              </Button>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Totalt</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Forward className="h-3 w-3" /> Auto-videresending
              </p>
              <p className="text-2xl font-bold text-primary">{stats.autoForward}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" /> Uten overtidsbetaling
              </p>
              <p className="text-2xl font-bold text-amber-600">{stats.noOvertime}</p>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Søk etter navn, org-nr eller e-post…"
            className="pl-9"
          />
        </div>

        {/* List */}
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Laster…</div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              {institutions.length === 0
                ? "Ingen institusjoner registrert ennå. Klikk \"Ny institusjon\" for å legge til den første."
                : "Ingen treff. Prøv et annet søk."}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {filtered.map((inst) => (
              <Card key={inst.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="rounded-lg p-2 bg-primary/10 text-primary">
                      <Building2 className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold">{inst.name}</h3>
                        {inst.institutionType && (
                          <Badge variant="outline" className="text-[10px]">{TYPE_LABELS[inst.institutionType] ?? inst.institutionType}</Badge>
                        )}
                        {inst.brregVerified && (
                          <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-600">
                            <CheckCircle2 className="h-3 w-3 mr-0.5" /> Brreg
                          </Badge>
                        )}
                      </div>
                      {inst.orgNumber && (
                        <p className="text-xs text-muted-foreground font-mono mt-0.5">Org-nr: {inst.orgNumber}</p>
                      )}
                      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                        {inst.contactPerson && <div className="truncate">{inst.contactPerson}</div>}
                        {inst.contactEmail && (
                          <div className="flex items-center gap-1 truncate">
                            <Mail className="h-3 w-3 flex-shrink-0" /> {inst.contactEmail}
                          </div>
                        )}
                        {inst.contactPhone && (
                          <div className="flex items-center gap-1">
                            <Phone className="h-3 w-3 flex-shrink-0" /> {inst.contactPhone}
                          </div>
                        )}
                        {inst.address && (
                          <div className="flex items-center gap-1 truncate">
                            <MapPin className="h-3 w-3 flex-shrink-0" /> {inst.address}
                          </div>
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {inst.autoForwardRapport ? (
                          <Badge variant="secondary" className="text-[10px] border-emerald-500/40 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20">
                            <Forward className="h-3 w-3 mr-1" /> Auto-videresender til {inst.forwardEmail}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">
                            <Forward className="h-3 w-3 mr-1 opacity-50" /> Ingen auto-videresending
                          </Badge>
                        )}
                        {!inst.overtimeApplicable && (
                          <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-600">
                            <Clock className="h-3 w-3 mr-1" /> Uten overtid
                          </Badge>
                        )}
                      </div>

                      {/* Per-institution stats */}
                      {(() => {
                        const s = statsByInstId.get(inst.id);
                        if (!s) return null;
                        const hasAny = s.activeSaker > 0 || s.rapporterThisMonth.total > 0 || s.approvedHoursTotal > 0;
                        if (!hasAny) return null;
                        return (
                          <div className="mt-3 pt-3 border-t flex flex-wrap gap-3 text-xs">
                            <span className="flex items-center gap-1 text-muted-foreground" title="Aktive saker">
                              <FolderKanban className="h-3 w-3" />
                              <span className="font-semibold text-foreground">{s.activeSaker}</span>
                              <span>saker</span>
                            </span>
                            {s.rapporterThisMonth.total > 0 && (
                              <span className="flex items-center gap-1 text-muted-foreground" title="Rapporter denne måneden">
                                <FileText className="h-3 w-3" />
                                <span className="font-semibold text-foreground">{s.rapporterThisMonth.total}</span>
                                <span>rapport{s.rapporterThisMonth.total === 1 ? "" : "er"} denne mnd</span>
                                {s.rapporterThisMonth.godkjent > 0 && (
                                  <span className="text-emerald-600">({s.rapporterThisMonth.godkjent} godkjent)</span>
                                )}
                              </span>
                            )}
                            {s.approvedHoursTotal > 0 && (
                              <span className="flex items-center gap-1 text-muted-foreground" title="Totalt godkjente timer">
                                <TrendingUp className="h-3 w-3" />
                                <span className="font-semibold text-foreground">{s.approvedHoursTotal.toFixed(1)}t</span>
                                <span>godkjent</span>
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                    {isAdmin && (
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(inst)} aria-label="Rediger">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleDelete(inst)}
                          aria-label="Slett"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Add/Edit dialog */}
        <Dialog open={showDialog} onOpenChange={(o) => { setShowDialog(o); if (!o) setEditing(null); }}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? "Rediger institusjon" : "Ny institusjon"}</DialogTitle>
              <DialogDescription>
                {editing
                  ? "Oppdater detaljer eller automatiseringer."
                  : "Søk i Brønnøysundregisteret for å fylle ut automatisk, eller skriv inn manuelt."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Brreg search (only on create) */}
              {!editing && (
                <div className="space-y-2 relative" ref={brregRef}>
                  <Label className="flex items-center gap-1">
                    <Search className="h-3.5 w-3.5" />
                    Søk i Brønnøysundregisteret
                  </Label>
                  <div className="relative">
                    <Input
                      value={brregQuery}
                      onChange={(e) => { setBrregQuery(e.target.value); brreg.search(e.target.value); }}
                      onFocus={() => { if (brreg.results.length > 0) brreg.setOpen(true); }}
                      placeholder="Org-nr eller bedriftsnavn…"
                      autoComplete="off"
                    />
                    {brreg.loading && (
                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    )}
                  </div>
                  {brreg.open && brreg.results.length > 0 && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg max-h-60 overflow-y-auto">
                      {brreg.results.map((c: BrregCompany) => (
                        <button
                          key={c.organisasjonsnummer}
                          type="button"
                          className="w-full text-left px-3 py-2.5 hover:bg-accent border-b last:border-0 transition-colors"
                          onClick={() => {
                            brreg.select(c);
                            const addr = c.forretningsadresse;
                            const addressStr = addr
                              ? [addr.adresse?.join(", "), addr.postnummer, addr.poststed].filter(Boolean).join(", ")
                              : "";
                            setForm((prev) => ({
                              ...prev,
                              name: c.navn,
                              orgNumber: c.organisasjonsnummer,
                              address: addressStr,
                              brregVerified: true,
                            }));
                            setBrregQuery(`${c.organisasjonsnummer} — ${c.navn}`);
                          }}
                        >
                          <div className="font-medium text-sm">{c.navn}</div>
                          <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                            <span className="font-mono">{c.organisasjonsnummer}</span>
                            {c.forretningsadresse?.poststed && <span>· {c.forretningsadresse.poststed}</span>}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Navn *</Label>
                  <Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Organisasjonsnummer</Label>
                  <Input
                    value={form.orgNumber ?? ""}
                    onChange={(e) => setForm({ ...form, orgNumber: e.target.value.replace(/\D/g, "").slice(0, 9) })}
                    placeholder="9 siffer"
                    inputMode="numeric"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={form.institutionType ?? "annet"} onValueChange={(v) => setForm({ ...form, institutionType: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(TYPE_LABELS).map(([v, l]) => (
                        <SelectItem key={v} value={v}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Adresse</Label>
                  <Input value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                </div>
              </div>

              {/* Contact */}
              <div className="border-t pt-4 space-y-3">
                <p className="text-sm font-semibold">Kontaktinformasjon</p>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Kontaktperson</Label>
                    <Input value={form.contactPerson ?? ""} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>E-post</Label>
                    <Input type="email" value={form.contactEmail ?? ""} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Telefon</Label>
                    <Input value={form.contactPhone ?? ""} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
                  </div>
                </div>
              </div>

              {/* Rapport template */}
              <div className="border-t pt-4 space-y-2">
                <Label className="flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  Standard rapport-mal
                </Label>
                <Select
                  value={form.defaultRapportTemplateId ?? "__none__"}
                  onValueChange={(v) => setForm({ ...form, defaultRapportTemplateId: v === "__none__" ? null : v })}
                >
                  <SelectTrigger><SelectValue placeholder="Velg mal…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— bruk generell mal —</SelectItem>
                    {templates
                      .filter(t => !form.institutionType || !t.suggestedInstitutionType || t.suggestedInstitutionType === form.institutionType || t.suggestedInstitutionType === null)
                      .map(t => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                          {t.isSystem && <Badge variant="outline" className="ml-2 text-[9px]">System</Badge>}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Nye rapporter for saker knyttet til denne institusjonen bruker denne malen som utgangspunkt.
                </p>
              </div>

              {/* Automations */}
              <div className="border-t pt-4 space-y-3">
                <p className="text-sm font-semibold">Automatiseringer</p>

                <div className="rounded-lg border p-3 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <Label htmlFor="auto-forward" className="text-sm flex items-center gap-1.5">
                        <Forward className="h-3.5 w-3.5" />
                        Videresend rapport ved innsending
                      </Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Når miljøarbeider sender rapport til godkjenning, sendes også PDF til oppdragsgiver.
                      </p>
                    </div>
                    <Switch
                      id="auto-forward"
                      checked={!!form.autoForwardRapport}
                      onCheckedChange={(v) => setForm({ ...form, autoForwardRapport: v })}
                    />
                  </div>
                  {form.autoForwardRapport && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">E-post for videresending</Label>
                      <Input
                        type="email"
                        value={form.forwardEmail ?? ""}
                        onChange={(e) => setForm({ ...form, forwardEmail: e.target.value })}
                        placeholder="oppdragsgiver@institusjon.no"
                      />
                    </div>
                  )}
                </div>

                <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
                  <div className="flex-1">
                    <Label htmlFor="overtime" className="text-sm flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      Overtidsbetaling gjelder for arbeid hos denne institusjonen
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Skru av hvis miljøarbeidere ikke får overtidstillegg når de jobber for denne institusjonen.
                    </p>
                  </div>
                  <Switch
                    id="overtime"
                    checked={form.overtimeApplicable !== false}
                    onCheckedChange={(v) => setForm({ ...form, overtimeApplicable: v })}
                  />
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label>Interne notater</Label>
                <Textarea
                  value={form.notes ?? ""}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Avtale-detaljer, faktureringsinfo, særskilte rutiner…"
                  rows={3}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDialog(false)}>Avbryt</Button>
              <Button onClick={handleSubmit} disabled={create.isPending || update.isPending}>
                {(create.isPending || update.isPending) ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                {editing ? "Lagre endringer" : "Opprett institusjon"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Bulk-import dialog */}
        <Dialog open={bulkOpen} onOpenChange={(o) => { setBulkOpen(o); if (!o) { setBulkCsv(""); setBulkResult(null); } }}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Bulk-import institusjoner</DialogTitle>
              <DialogDescription>
                Lim inn en CSV med én institusjon per linje. Header-rad er valgfri.
              </DialogDescription>
            </DialogHeader>
            {bulkResult ? (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-md border p-3 text-center">
                    <div className="text-2xl font-bold text-emerald-600">{bulkResult.created ?? 0}</div>
                    <div className="text-xs text-muted-foreground">Opprettet</div>
                  </div>
                  <div className="rounded-md border p-3 text-center">
                    <div className="text-2xl font-bold text-amber-600">{bulkResult.skipped?.length ?? 0}</div>
                    <div className="text-xs text-muted-foreground">Hoppet over</div>
                  </div>
                  <div className="rounded-md border p-3 text-center">
                    <div className="text-2xl font-bold text-destructive">{bulkResult.failed?.length ?? 0}</div>
                    <div className="text-xs text-muted-foreground">Feilet</div>
                  </div>
                </div>
                {bulkResult.skipped?.length > 0 && (
                  <div className="rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-500/30 p-3 text-xs space-y-1 max-h-40 overflow-y-auto">
                    {bulkResult.skipped.map((s: any, i: number) => (
                      <div key={i}>
                        <span className="font-medium">{s.row?.name ?? "(uten navn)"}</span>: {s.reason}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <Label className="text-xs">CSV-kolonner: navn, orgnr, type (barnevern/nav/kommune/privat/helsevesen/annet), contactEmail, forwardEmail</Label>
                <Textarea
                  value={bulkCsv}
                  onChange={(e) => setBulkCsv(e.target.value)}
                  rows={10}
                  placeholder={"name,orgnumber,institutiontype,contactEmail\nBufetat Oslo,987654321,barnevern,post@example.no\nNAV Ullern,123456789,nav,kontakt@nav.no"}
                  className="font-mono text-xs"
                />
              </div>
            )}
            <DialogFooter>
              {bulkResult ? (
                <Button onClick={() => setBulkOpen(false)}>Ferdig</Button>
              ) : (
                <>
                  <Button variant="outline" onClick={() => setBulkOpen(false)}>Avbryt</Button>
                  <Button
                    disabled={!bulkCsv.trim() || bulkImport.isPending}
                    onClick={() => {
                      const rows = parseCsvInstitutions(bulkCsv);
                      if (rows.length === 0) {
                        toast({ title: "Ingen gyldige rader", variant: "destructive" });
                        return;
                      }
                      bulkImport.mutate(rows);
                    }}
                  >
                    {bulkImport.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                    Importer
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PortalLayout>
  );
}
