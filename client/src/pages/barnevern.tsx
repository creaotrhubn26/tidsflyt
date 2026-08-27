/**
 * client/src/pages/barnevern.tsx
 *
 * Kommunalt barnevern: meldingsmottak (krav 1), sak/faseflyt (krav 2) og
 * journal (krav 4). Rute: /barnevern — kun kommuneroller (se App.tsx).
 */
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, ArrowRight, Baby, FileText, FolderOpen, Inbox, Paperclip,
  Pencil, Plus, Users as UsersIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import * as api from "@/lib/barnevern-api";
import { cn } from "@/lib/utils";

const MELDER_KATEGORIER: Record<string, string> = {
  skole: "Skole", barnehage: "Barnehage", helsepersonell: "Helsepersonell", lege: "Lege",
  politi: "Politi", nav: "NAV", familie_nabo: "Familie/nabo", anonym: "Anonym", annet: "Annet",
};

const MELDING_STATUS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  mottatt: { label: "Mottatt", variant: "secondary" },
  under_avklaring: { label: "Under avklaring", variant: "default" },
  henlagt: { label: "Henlagt", variant: "outline" },
  sendt_til_undersokelse: { label: "Til undersøkelse", variant: "default" },
};

const SAK_FASER: Record<string, string> = {
  undersokelse: "Undersøkelse", tiltak: "Tiltak", avsluttet: "Avsluttet", henlagt: "Henlagt",
};

const FASE_OVERGANGER: Record<string, string[]> = {
  undersokelse: ["tiltak", "henlagt"],
  tiltak: ["avsluttet"],
  avsluttet: [],
  henlagt: [],
};

const TILTAK_STATUSER: Record<string, string> = {
  planlagt: "Planlagt", pagar: "Pågår", fullfort: "Fullført", avbrutt: "Avbrutt",
};

const PLAN_STATUSER: Record<string, string> = {
  utkast: "Utkast", godkjent: "Godkjent", erstattet: "Erstattet", avsluttet: "Avsluttet",
};

const DOKUMENT_STATUSER: Record<string, string> = {
  utkast: "Utkast", godkjent: "Godkjent", ekspedert: "Ekspedert",
};

const JOURNAL_KATEGORIER: Record<string, string> = {
  notat: "Notat", telefonsamtale: "Telefonsamtale", mote: "Møte", hjemmebesok: "Hjemmebesøk",
  samtale_med_barnet: "Samtale med barnet", vedtak: "Vedtak", annet: "Annet",
};

function formatDato(value: string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("nb-NO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function fristPassert(value: string | null | undefined): boolean {
  return !!value && new Date(value).getTime() < Date.now();
}

// ── NY MELDING ───────────────────────────────────────────────────────────────

function NyMeldingDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [melderKategori, setMelderKategori] = useState("skole");
  const [melderNavn, setMelderNavn] = useState("");
  const [melderKontakt, setMelderKontakt] = useState("");
  const [barnNavn, setBarnNavn] = useState("");
  const [barnFodselsnummer, setBarnFodselsnummer] = useState("");
  const [beskrivelse, setBeskrivelse] = useState("");
  const [prioritet, setPrioritet] = useState<"akutt" | "normal">("normal");
  const [ufodtBarn, setUfodtBarn] = useState(false);
  const [termindato, setTermindato] = useState("");

  const opprett = useMutation({
    mutationFn: () => api.createMelding({
      melderKategori,
      melderNavn: melderNavn || undefined,
      melderKontakt: melderKontakt || undefined,
      barnNavn: barnNavn || undefined,
      barnFodselsnummer: ufodtBarn ? undefined : (barnFodselsnummer || undefined),
      beskrivelse,
      prioritet,
      ufodtBarn: ufodtBarn || undefined,
      termindato: ufodtBarn && termindato ? termindato : undefined,
    }),
    onSuccess: (melding) => {
      queryClient.invalidateQueries({ queryKey: ["barnevern-meldinger"] });
      toast({ title: `Melding ${melding.meldingsnummer} registrert` });
      onOpenChange(false);
      setMelderNavn(""); setMelderKontakt(""); setBarnNavn(""); setBarnFodselsnummer("");
      setBeskrivelse(""); setPrioritet("normal"); setUfodtBarn(false); setTermindato("");
    },
    onError: (e: Error) => toast({ title: "Feil", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Registrer bekymringsmelding</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Melderkategori</Label>
              <Select value={melderKategori} onValueChange={setMelderKategori}>
                <SelectTrigger data-testid="melding-kategori-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(MELDER_KATEGORIER).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Prioritet</Label>
              <Select value={prioritet} onValueChange={(v) => setPrioritet(v as any)}>
                <SelectTrigger data-testid="melding-prioritet-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal (7 dagers frist)</SelectItem>
                  <SelectItem value="akutt">Akutt (24 timers frist)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Melders navn</Label>
              <Input value={melderNavn} onChange={(e) => setMelderNavn(e.target.value)} placeholder="Valgfritt" />
            </div>
            <div className="space-y-1.5">
              <Label>Melders kontaktinfo</Label>
              <Input value={melderKontakt} onChange={(e) => setMelderKontakt(e.target.value)} placeholder="Telefon/e-post" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="ufodt" checked={ufodtBarn} onCheckedChange={(c) => setUfodtBarn(c === true)} data-testid="melding-ufodt-checkbox" />
            <Label htmlFor="ufodt" className="flex items-center gap-1.5 cursor-pointer">
              <Baby className="h-4 w-4" /> Gjelder ufødt barn
            </Label>
          </div>
          {ufodtBarn ? (
            <div className="space-y-1.5">
              <Label>Termindato</Label>
              <Input type="date" value={termindato} onChange={(e) => setTermindato(e.target.value)} data-testid="melding-termindato-input" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Barnets navn</Label>
                <Input value={barnNavn} onChange={(e) => setBarnNavn(e.target.value)} data-testid="melding-barnnavn-input" />
              </div>
              <div className="space-y-1.5">
                <Label>Fødselsnummer</Label>
                <Input value={barnFodselsnummer} inputMode="numeric" maxLength={11}
                  onChange={(e) => setBarnFodselsnummer(e.target.value.replace(/\D/g, ""))} placeholder="11 siffer" />
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Beskrivelse av bekymringen</Label>
            <Textarea rows={5} value={beskrivelse} onChange={(e) => setBeskrivelse(e.target.value)} data-testid="melding-beskrivelse-input" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Avbryt</Button>
          <Button onClick={() => opprett.mutate()} disabled={!beskrivelse.trim() || opprett.isPending} data-testid="melding-lagre-button">
            Registrer melding
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── MELDINGSDETALJ ───────────────────────────────────────────────────────────

function MeldingDetalj({ meldingId, onSakOpprettet }: { meldingId: string; onSakOpprettet: (sakId: string) => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [henleggOpen, setHenleggOpen] = useState(false);
  const [henleggBegrunnelse, setHenleggBegrunnelse] = useState("");
  const [redigerOpen, setRedigerOpen] = useState(false);
  const [redigerBegrunnelse, setRedigerBegrunnelse] = useState("");
  const [redigerBeskrivelse, setRedigerBeskrivelse] = useState<string | null>(null);
  const [redigerBarnNavn, setRedigerBarnNavn] = useState<string | null>(null);
  const [tilleggOpen, setTilleggOpen] = useState(false);
  const [tilleggBeskrivelse, setTilleggBeskrivelse] = useState("");
  const [soskenOpen, setSoskenOpen] = useState(false);
  const [soskenNavn, setSoskenNavn] = useState("");
  const [soskenFnr, setSoskenFnr] = useState("");

  const { data: melding } = useQuery({
    queryKey: ["barnevern-melding", meldingId],
    queryFn: () => api.getMelding(meldingId),
  });
  const { data: revisjoner = [] } = useQuery({
    queryKey: ["barnevern-melding-revisjoner", meldingId],
    queryFn: () => api.listRevisjoner(meldingId),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["barnevern-meldinger"] });
    queryClient.invalidateQueries({ queryKey: ["barnevern-melding", meldingId] });
    queryClient.invalidateQueries({ queryKey: ["barnevern-melding-revisjoner", meldingId] });
  };

  const feil = (e: Error) => toast({ title: "Feil", description: e.message, variant: "destructive" });

  const undersokelse = useMutation({
    mutationFn: () => api.sendTilUndersokelse(meldingId),
    onSuccess: (m) => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["barnevern-saker"] });
      toast({ title: `Undersøkelsessak ${m.sak?.saksnummer} opprettet` });
      if (m.sak) onSakOpprettet(m.sak.id);
    },
    onError: feil,
  });
  const henlegg = useMutation({
    mutationFn: () => api.henleggMelding(meldingId, henleggBegrunnelse),
    onSuccess: () => { invalidate(); setHenleggOpen(false); setHenleggBegrunnelse(""); toast({ title: "Meldingen er henlagt" }); },
    onError: feil,
  });
  const rediger = useMutation({
    mutationFn: () => {
      const endringer: Record<string, unknown> = {};
      if (redigerBeskrivelse !== null) endringer.beskrivelse = redigerBeskrivelse;
      if (redigerBarnNavn !== null) endringer.barnNavn = redigerBarnNavn;
      return api.redigerMelding(meldingId, redigerBegrunnelse, endringer);
    },
    onSuccess: () => {
      invalidate(); setRedigerOpen(false); setRedigerBegrunnelse("");
      setRedigerBeskrivelse(null); setRedigerBarnNavn(null);
      toast({ title: "Meldingen er rettet", description: "Endringen er logget i revisjonshistorikken." });
    },
    onError: feil,
  });
  const tillegg = useMutation({
    mutationFn: () => api.opprettTillegg(meldingId, tilleggBeskrivelse),
    onSuccess: (m) => {
      invalidate(); setTilleggOpen(false); setTilleggBeskrivelse("");
      toast({ title: `Tilleggsmelding ${m.meldingsnummer} registrert` });
    },
    onError: feil,
  });
  const sosken = useMutation({
    mutationFn: () => api.opprettSoskenkopi(meldingId, {
      barnNavn: soskenNavn || undefined,
      barnFodselsnummer: soskenFnr || undefined,
    }),
    onSuccess: (m) => {
      invalidate(); setSoskenOpen(false); setSoskenNavn(""); setSoskenFnr("");
      toast({ title: `Søskenkopi ${m.meldingsnummer} registrert` });
    },
    onError: feil,
  });

  if (!melding) return null;
  const status = MELDING_STATUS[melding.status] ?? { label: melding.status, variant: "outline" as const };
  const kanBehandles = melding.status === "mottatt" || melding.status === "under_avklaring";

  return (
    <Card data-testid="melding-detalj">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-base">{melding.meldingsnummer}</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Mottatt {formatDato(melding.mottattDato)}</p>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {melding.prioritet === "akutt" && (
              <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />Akutt</Badge>
            )}
            {melding.ufodtBarn && <Badge variant="outline"><Baby className="h-3 w-3 mr-1" />Ufødt barn</Badge>}
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          <div><span className="text-muted-foreground">Melder:</span> {MELDER_KATEGORIER[melding.melderKategori] ?? melding.melderKategori}{melding.melderNavn ? ` — ${melding.melderNavn}` : ""}</div>
          <div><span className="text-muted-foreground">Kontakt:</span> {melding.melderKontakt ?? "—"}</div>
          <div><span className="text-muted-foreground">Barn:</span> {melding.ufodtBarn ? `Ufødt (termin ${melding.termindato ?? "ukjent"})` : (melding.barnNavn ?? "—")}</div>
          <div className={cn(fristPassert(melding.avklaringsfrist) && !melding.avklartDato && "text-destructive font-medium")}>
            <span className="text-muted-foreground">Avklaringsfrist:</span> {formatDato(melding.avklaringsfrist)}
          </div>
        </div>
        <p className="whitespace-pre-wrap border rounded-md p-3 bg-muted/30">{melding.beskrivelse}</p>
        {melding.henleggelseBegrunnelse && (
          <p className="text-xs text-muted-foreground">Henleggelse: {melding.henleggelseBegrunnelse}</p>
        )}
        {revisjoner.length > 0 && (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">{revisjoner.length} retting(er) i revisjonshistorikken</summary>
            <ul className="mt-2 space-y-1.5">
              {revisjoner.map((r, i) => (
                <li key={i} className="border-l-2 pl-2">
                  <span className="text-muted-foreground">{formatDato(r.createdAt)}:</span> {r.begrunnelse}
                  <span className="text-muted-foreground"> ({Object.keys(r.feltEndringer).join(", ")})</span>
                </li>
              ))}
            </ul>
          </details>
        )}

        {kanBehandles && (
          <div className="flex gap-2 flex-wrap pt-1">
            <Button size="sm" onClick={() => undersokelse.mutate()} disabled={undersokelse.isPending} data-testid="melding-undersokelse-button">
              <ArrowRight className="h-3.5 w-3.5 mr-1.5" /> Opprett undersøkelsessak
            </Button>
            <Button size="sm" variant="outline" onClick={() => setRedigerOpen(true)}>
              <Pencil className="h-3.5 w-3.5 mr-1.5" /> Rett melding
            </Button>
            <Button size="sm" variant="outline" onClick={() => setHenleggOpen(true)}
              className="text-destructive border-destructive/30" data-testid="melding-henlegg-button">
              Henlegg
            </Button>
          </div>
        )}
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="ghost" onClick={() => setTilleggOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Tilleggsmelding
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSoskenOpen(true)}>
            <UsersIcon className="h-3.5 w-3.5 mr-1.5" /> Søskenkopi
          </Button>
        </div>

        <div className="pt-1 border-t">
          <p className="text-xs font-medium text-muted-foreground mb-2 mt-2">Oppgaver på meldingen</p>
          <OppgaveSeksjon entityType="melding" entityId={meldingId} />
        </div>
      </CardContent>

      <Dialog open={henleggOpen} onOpenChange={setHenleggOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Henlegg melding</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label>Begrunnelse (påkrevd)</Label>
            <Textarea rows={3} value={henleggBegrunnelse} onChange={(e) => setHenleggBegrunnelse(e.target.value)} data-testid="henlegg-begrunnelse-input" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHenleggOpen(false)}>Avbryt</Button>
            <Button variant="destructive" onClick={() => henlegg.mutate()}
              disabled={!henleggBegrunnelse.trim() || henlegg.isPending} data-testid="henlegg-bekreft-button">
              Henlegg
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={redigerOpen} onOpenChange={setRedigerOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Rett melding</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Barnets navn</Label>
              <Input value={redigerBarnNavn ?? melding.barnNavn ?? ""} onChange={(e) => setRedigerBarnNavn(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Beskrivelse</Label>
              <Textarea rows={4} value={redigerBeskrivelse ?? melding.beskrivelse} onChange={(e) => setRedigerBeskrivelse(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Begrunnelse for rettingen (påkrevd, logges)</Label>
              <Textarea rows={2} value={redigerBegrunnelse} onChange={(e) => setRedigerBegrunnelse(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRedigerOpen(false)}>Avbryt</Button>
            <Button onClick={() => rediger.mutate()}
              disabled={!redigerBegrunnelse.trim() || (redigerBeskrivelse === null && redigerBarnNavn === null) || rediger.isPending}>
              Lagre retting
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={tilleggOpen} onOpenChange={setTilleggOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Tilleggsmelding</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">Ny informasjon om samme barn. Kobles automatisk til denne meldingen og får egen avklaringsfrist.</p>
          <div className="space-y-1.5">
            <Label>Beskrivelse</Label>
            <Textarea rows={4} value={tilleggBeskrivelse} onChange={(e) => setTilleggBeskrivelse(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTilleggOpen(false)}>Avbryt</Button>
            <Button onClick={() => tillegg.mutate()} disabled={!tilleggBeskrivelse.trim() || tillegg.isPending}>
              Registrer tillegg
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={soskenOpen} onOpenChange={setSoskenOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Søskenkopi</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">Samme melder og bekymring registrert som egen melding for et søsken.</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Søskenets navn</Label>
              <Input value={soskenNavn} onChange={(e) => setSoskenNavn(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Fødselsnummer</Label>
              <Input value={soskenFnr} inputMode="numeric" maxLength={11}
                onChange={(e) => setSoskenFnr(e.target.value.replace(/\D/g, ""))} placeholder="Valgfritt" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSoskenOpen(false)}>Avbryt</Button>
            <Button onClick={() => sosken.mutate()} disabled={(!soskenNavn.trim() && !soskenFnr.trim()) || sosken.isPending}>
              Registrer søskenkopi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ── PLAN (krav 5) ────────────────────────────────────────────────────────────

function PlanSeksjon({ sakId }: { sakId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formaal, setFormaal] = useState("");
  const [evalueringsfrist, setEvalueringsfrist] = useState("");
  const [tiltakBeskrivelse, setTiltakBeskrivelse] = useState("");
  const [tiltakAnsvarlig, setTiltakAnsvarlig] = useState("");

  const { data: planer = [] } = useQuery({
    queryKey: ["barnevern-planer", sakId],
    queryFn: () => api.listPlaner(sakId),
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["barnevern-planer", sakId] });
  const feil = (e: Error) => toast({ title: "Feil", description: e.message, variant: "destructive" });

  const opprett = useMutation({
    mutationFn: () => api.opprettPlan(sakId, {
      formaal: formaal || undefined,
      evalueringsfrist: evalueringsfrist ? new Date(evalueringsfrist).toISOString() : undefined,
    }),
    onSuccess: () => { invalidate(); setFormaal(""); setEvalueringsfrist(""); toast({ title: "Planutkast opprettet" }); },
    onError: feil,
  });
  const godkjenn = useMutation({
    mutationFn: (id: string) => api.godkjennPlan(id),
    onSuccess: () => { invalidate(); toast({ title: "Plan godkjent" }); },
    onError: feil,
  });
  const nyVersjon = useMutation({
    mutationFn: (id: string) => api.nyPlanVersjon(id),
    onSuccess: () => { invalidate(); toast({ title: "Nytt utkast opprettet fra godkjent versjon" }); },
    onError: feil,
  });
  const nyttTiltak = useMutation({
    mutationFn: (planId: string) => api.opprettPlanTiltak(planId, {
      beskrivelse: tiltakBeskrivelse,
      ansvarlig: tiltakAnsvarlig,
    }),
    onSuccess: () => { invalidate(); setTiltakBeskrivelse(""); setTiltakAnsvarlig(""); toast({ title: "Tiltak lagt til" }); },
    onError: feil,
  });
  const tiltakStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.settTiltakStatus(id, status),
    onSuccess: invalidate,
    onError: feil,
  });

  const utkast = planer.find((p) => p.status === "utkast");
  const gjeldende = planer.find((p) => p.status === "godkjent");

  return (
    <div className="space-y-3 text-sm">
      {!utkast && (
        <div className="border rounded-md p-3 space-y-2">
          <p className="font-medium text-xs text-muted-foreground">Nytt planutkast (tiltaksplan)</p>
          <Input placeholder="Formål med planen" value={formaal} onChange={(e) => setFormaal(e.target.value)} data-testid="plan-formaal-input" />
          <div className="flex gap-2 items-center">
            <Label className="text-xs whitespace-nowrap">Evalueringsfrist</Label>
            <Input type="date" value={evalueringsfrist} onChange={(e) => setEvalueringsfrist(e.target.value)} className="w-44" />
            <Button size="sm" onClick={() => opprett.mutate()} disabled={opprett.isPending} data-testid="plan-opprett-button">
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Opprett utkast
            </Button>
          </div>
        </div>
      )}

      {planer.map((plan) => (
        <div key={plan.id} className="border rounded-md p-3 space-y-2" data-testid={`plan-${plan.id}`}>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="font-medium">Tiltaksplan v{plan.versjon}</span>
            <div className="flex gap-1.5">
              <Badge variant={plan.status === "godkjent" ? "default" : plan.status === "utkast" ? "secondary" : "outline"}>
                {PLAN_STATUSER[plan.status] ?? plan.status}
              </Badge>
            </div>
          </div>
          {plan.formaal && <p className="text-xs text-muted-foreground">{plan.formaal}</p>}
          {plan.evalueringsfrist && (
            <p className={cn("text-xs", plan.status === "godkjent" && fristPassert(plan.evalueringsfrist) ? "text-destructive font-medium" : "text-muted-foreground")}>
              Evaluering: {formatDato(plan.evalueringsfrist)}
            </p>
          )}

          <ul className="space-y-1.5">
            {plan.tiltak.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 border-l-2 pl-2">
                <span>{t.beskrivelse} <span className="text-xs text-muted-foreground">({t.ansvarlig})</span></span>
                {plan.status !== "erstattet" ? (
                  <Select value={t.status} onValueChange={(v) => tiltakStatus.mutate({ id: t.id, status: v })}>
                    <SelectTrigger className="w-28 h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(TILTAK_STATUSER).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant="outline" className="text-[10px]">{TILTAK_STATUSER[t.status] ?? t.status}</Badge>
                )}
              </li>
            ))}
          </ul>

          {plan.status === "utkast" && (
            <div className="space-y-2 pt-1">
              <div className="flex gap-2">
                <Input placeholder="Nytt tiltak" value={tiltakBeskrivelse} onChange={(e) => setTiltakBeskrivelse(e.target.value)} data-testid="tiltak-beskrivelse-input" />
                <Input placeholder="Ansvarlig" className="w-40" value={tiltakAnsvarlig} onChange={(e) => setTiltakAnsvarlig(e.target.value)} data-testid="tiltak-ansvarlig-input" />
                <Button size="sm" variant="outline" onClick={() => nyttTiltak.mutate(plan.id)}
                  disabled={!tiltakBeskrivelse.trim() || !tiltakAnsvarlig.trim()} data-testid="tiltak-legg-til-button">
                  Legg til
                </Button>
              </div>
              <Button size="sm" onClick={() => godkjenn.mutate(plan.id)} disabled={godkjenn.isPending} data-testid="plan-godkjenn-button">
                Godkjenn plan (barnevernsleder)
              </Button>
            </div>
          )}
          {plan.status === "godkjent" && plan.id === gjeldende?.id && !utkast && (
            <Button size="sm" variant="outline" onClick={() => nyVersjon.mutate(plan.id)} data-testid="plan-ny-versjon-button">
              Ny versjon
            </Button>
          )}
        </div>
      ))}
      {planer.length === 0 && <p className="text-xs text-muted-foreground">Ingen plan ennå.</p>}
    </div>
  );
}

// ── DOKUMENTER (krav 6) ──────────────────────────────────────────────────────

function DokumentSeksjon({ sakId }: { sakId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [malId, setMalId] = useState("");
  const [mottakerNavn, setMottakerNavn] = useState("");

  const { data: maler = [] } = useQuery({
    queryKey: ["barnevern-dokumentmaler"],
    queryFn: () => api.listDokumentmaler(),
  });
  const { data: dokumenter = [] } = useQuery({
    queryKey: ["barnevern-dokumenter", sakId],
    queryFn: () => api.listDokumenter(sakId),
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["barnevern-dokumenter", sakId] });
  const feil = (e: Error) => toast({ title: "Feil", description: e.message, variant: "destructive" });

  const opprett = useMutation({
    mutationFn: () => api.opprettDokument(sakId, {
      malId,
      mottaker: mottakerNavn ? { navn: mottakerNavn } : undefined,
    }),
    onSuccess: () => { invalidate(); setMottakerNavn(""); toast({ title: "Dokumentutkast opprettet fra mal" }); },
    onError: feil,
  });
  const godkjenn = useMutation({
    mutationFn: (id: string) => api.godkjennDokument(id),
    onSuccess: () => { invalidate(); toast({ title: "Dokument godkjent" }); },
    onError: feil,
  });
  const ekspeder = useMutation({
    mutationFn: ({ id, via }: { id: string; via: "sikker_dialog" | "manuell" }) => api.ekspederDokument(id, via),
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["barnevern-sak-journal", sakId] });
      toast({ title: "Dokument ekspedert og journalført" });
    },
    onError: feil,
  });

  return (
    <div className="space-y-3 text-sm">
      <div className="border rounded-md p-3 space-y-2">
        <p className="font-medium text-xs text-muted-foreground">Nytt dokument fra mal</p>
        <div className="flex gap-2 flex-wrap">
          <Select value={malId} onValueChange={setMalId}>
            <SelectTrigger className="w-64" data-testid="dokument-mal-select"><SelectValue placeholder="Velg mal" /></SelectTrigger>
            <SelectContent>
              {maler.map((m) => (
                <SelectItem key={m.malId} value={m.malId}>
                  {m.tittel}{m.hjemmel ? ` (${m.hjemmel})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input placeholder="Mottaker" className="w-44" value={mottakerNavn} onChange={(e) => setMottakerNavn(e.target.value)} data-testid="dokument-mottaker-input" />
          <Button size="sm" onClick={() => opprett.mutate()} disabled={!malId || opprett.isPending} data-testid="dokument-opprett-button">
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Opprett
          </Button>
        </div>
      </div>

      <ul className="space-y-2">
        {dokumenter.map((d) => (
          <li key={d.id} className="border rounded-md p-3 space-y-1.5" data-testid={`dokument-${d.id}`}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="font-medium">{d.tittel}</span>
              <div className="flex gap-1.5">
                <Badge variant="outline" className="text-[10px] capitalize">{d.dokumenttype}</Badge>
                <Badge variant={d.status === "ekspedert" ? "default" : "secondary"} className="text-[10px]">
                  {DOKUMENT_STATUSER[d.status] ?? d.status}
                </Badge>
              </div>
            </div>
            {d.hjemmel && <p className="text-xs text-muted-foreground">Hjemmel: {d.hjemmel}</p>}
            {d.mottaker?.navn && <p className="text-xs text-muted-foreground">Mottaker: {d.mottaker.navn}</p>}
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">Vis innhold</summary>
              <p className="mt-1 whitespace-pre-wrap border rounded p-2 bg-muted/30">{d.innhold}</p>
            </details>
            <div className="flex gap-2">
              {d.status === "utkast" && (
                <Button size="sm" onClick={() => godkjenn.mutate(d.id)} data-testid={`dokument-godkjenn-${d.id}`}>
                  Godkjenn{d.dokumenttype === "vedtak" ? " (barnevernsleder)" : ""}
                </Button>
              )}
              {d.status === "godkjent" && (
                <>
                  <Button size="sm" onClick={() => ekspeder.mutate({ id: d.id, via: "sikker_dialog" })} data-testid={`dokument-ekspeder-${d.id}`}>
                    Ekspeder via sikker dialog
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => ekspeder.mutate({ id: d.id, via: "manuell" })}>
                    Ekspedert manuelt
                  </Button>
                </>
              )}
            </div>
          </li>
        ))}
        {dokumenter.length === 0 && <li className="text-xs text-muted-foreground">Ingen dokumenter ennå.</li>}
      </ul>
    </div>
  );
}

// ── OPPGAVER (krav 3) ────────────────────────────────────────────────────────

function OppgaveSeksjon({ entityType, entityId }: { entityType: "melding" | "sak"; entityId: string }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [tittel, setTittel] = useState("");
  const [frist, setFrist] = useState("");

  const { data: oppgaver = [] } = useQuery({
    queryKey: ["barnevern-oppgaver", entityType, entityId],
    queryFn: () => api.listOppgaver(entityType, entityId),
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["barnevern-oppgaver", entityType, entityId] });
  const feil = (e: Error) => toast({ title: "Feil", description: e.message, variant: "destructive" });

  const opprett = useMutation({
    // ponytail: tildeles innlogget bruker; velger for kollega-tildeling
    // legges til når kommune-brukerliste-endepunkt finnes.
    mutationFn: () => api.opprettOppgave({
      entityType,
      entityId,
      tittel,
      tildeltUserId: (user as any)?.id,
      frist: frist ? new Date(`${frist}T12:00:00`).toISOString() : undefined,
    }),
    onSuccess: () => { invalidate(); setTittel(""); setFrist(""); toast({ title: "Oppgave opprettet" }); },
    onError: feil,
  });
  const fullfor = useMutation({
    mutationFn: (id: string) => api.fullforOppgave(id),
    onSuccess: () => { invalidate(); toast({ title: "Oppgave fullført" }); },
    onError: feil,
  });

  return (
    <div className="space-y-3 text-sm">
      <div className="flex gap-2">
        <Input placeholder="Ny oppgave …" value={tittel} onChange={(e) => setTittel(e.target.value)} data-testid="oppgave-tittel-input" />
        <Input type="date" className="w-40" value={frist} onChange={(e) => setFrist(e.target.value)} data-testid="oppgave-frist-input" />
        <Button size="sm" onClick={() => opprett.mutate()} disabled={!tittel.trim() || opprett.isPending} data-testid="oppgave-opprett-button">
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Opprett
        </Button>
      </div>
      <ul className="space-y-1.5">
        {oppgaver.map((o) => (
          <li key={o.id} className="flex items-center justify-between gap-2 border rounded-md p-2" data-testid={`oppgave-${o.id}`}>
            <div>
              <span className={cn(o.status !== "apen" && "line-through text-muted-foreground")}>{o.tittel}</span>
              {o.frist && (
                <span className={cn("text-xs ml-2", o.status === "apen" && fristPassert(o.frist) ? "text-destructive font-medium" : "text-muted-foreground")}>
                  Frist {formatDato(o.frist)}
                </span>
              )}
            </div>
            {o.status === "apen" ? (
              <Button size="sm" variant="outline" className="h-7" onClick={() => fullfor.mutate(o.id)} data-testid={`oppgave-fullfor-${o.id}`}>
                Fullfør
              </Button>
            ) : (
              <Badge variant="outline" className="text-[10px]">{o.status === "fullfort" ? "Fullført" : "Kansellert"}</Badge>
            )}
          </li>
        ))}
        {oppgaver.length === 0 && <li className="text-xs text-muted-foreground">Ingen oppgaver.</li>}
      </ul>
    </div>
  );
}

// ── SAKSDETALJ MED JOURNAL ───────────────────────────────────────────────────

function SakDetalj({ sakId }: { sakId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [faseOpen, setFaseOpen] = useState(false);
  const [tilFase, setTilFase] = useState("");
  const [faseBegrunnelse, setFaseBegrunnelse] = useState("");
  const [journalKategori, setJournalKategori] = useState("notat");
  const [journalInnhold, setJournalInnhold] = useState("");
  const [vedleggEntryId, setVedleggEntryId] = useState<string | null>(null);

  const { data: sak } = useQuery({
    queryKey: ["barnevern-sak", sakId],
    queryFn: () => api.getSak(sakId),
  });
  const { data: journal = [] } = useQuery({
    queryKey: ["barnevern-sak-journal", sakId],
    queryFn: () => api.listJournal(sakId),
  });

  const feil = (e: Error) => toast({ title: "Feil", description: e.message, variant: "destructive" });

  const endreFase = useMutation({
    mutationFn: () => api.endreFase(sakId, tilFase, faseBegrunnelse),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["barnevern-sak", sakId] });
      queryClient.invalidateQueries({ queryKey: ["barnevern-saker"] });
      setFaseOpen(false); setFaseBegrunnelse(""); setTilFase("");
      toast({ title: "Faseovergang gjennomført" });
    },
    onError: feil,
  });
  const nyJournal = useMutation({
    mutationFn: () => api.opprettJournal(sakId, { kategori: journalKategori, innhold: journalInnhold }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["barnevern-sak-journal", sakId] });
      setJournalInnhold("");
      toast({ title: "Journalført" });
    },
    onError: feil,
  });
  const lastOpp = useMutation({
    mutationFn: ({ entryId, file }: { entryId: string; file: File }) =>
      api.lastOppJournalVedlegg(sakId, entryId, file),
    onSuccess: () => toast({ title: "Vedlegg lastet opp" }),
    onError: feil,
  });

  if (!sak) return null;
  const overganger = FASE_OVERGANGER[sak.fase] ?? [];

  return (
    <Card data-testid="sak-detalj">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-base">{sak.saksnummer}</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {sak.barnNavn ?? "Ukjent barn"} · Opprettet {formatDato(sak.createdAt)}
            </p>
          </div>
          <Badge>{SAK_FASER[sak.fase] ?? sak.fase}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {sak.fase === "undersokelse" && (
          <p className={cn("text-xs", fristPassert(sak.undersokelsesfrist) ? "text-destructive font-medium" : "text-muted-foreground")}>
            Undersøkelsesfrist: {formatDato(sak.undersokelsesfrist)}
          </p>
        )}

        {overganger.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {overganger.map((fase) => (
              <Button key={fase} size="sm" variant={fase === "henlagt" ? "outline" : "default"}
                onClick={() => { setTilFase(fase); setFaseOpen(true); }} data-testid={`fase-${fase}-button`}>
                <ArrowRight className="h-3.5 w-3.5 mr-1.5" /> {SAK_FASER[fase]}
              </Button>
            ))}
          </div>
        )}

        {(sak.faseHistorikk?.length ?? 0) > 0 && (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">Fasehistorikk ({sak.faseHistorikk!.length})</summary>
            <ul className="mt-2 space-y-1.5">
              {sak.faseHistorikk!.map((h, i) => (
                <li key={i} className="border-l-2 pl-2">
                  <span className="text-muted-foreground">{formatDato(h.createdAt)}:</span>{" "}
                  {h.fraFase ? `${SAK_FASER[h.fraFase] ?? h.fraFase} → ` : ""}{SAK_FASER[h.tilFase] ?? h.tilFase}
                  {h.begrunnelse ? ` — ${h.begrunnelse}` : ""}
                </li>
              ))}
            </ul>
          </details>
        )}

        <Tabs defaultValue="journal">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="journal" data-testid="sak-tab-journal">Journal</TabsTrigger>
            <TabsTrigger value="plan" data-testid="sak-tab-plan">Plan</TabsTrigger>
            <TabsTrigger value="dokumenter" data-testid="sak-tab-dokumenter">Dokumenter</TabsTrigger>
            <TabsTrigger value="oppgaver" data-testid="sak-tab-oppgaver">Oppgaver</TabsTrigger>
          </TabsList>

          <TabsContent value="journal" className="mt-3 space-y-2">
          <div className="flex gap-2">
            <Select value={journalKategori} onValueChange={setJournalKategori}>
              <SelectTrigger className="w-44" data-testid="journal-kategori-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(JOURNAL_KATEGORIER).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea rows={2} className="flex-1" placeholder="Ny journaloppføring …"
              value={journalInnhold} onChange={(e) => setJournalInnhold(e.target.value)} data-testid="journal-innhold-input" />
          </div>
          <Button size="sm" onClick={() => nyJournal.mutate()}
            disabled={!journalInnhold.trim() || nyJournal.isPending} data-testid="journal-lagre-button">
            Journalfør
          </Button>

          <input ref={fileInput} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.heic,.heif,.webp"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file && vedleggEntryId) lastOpp.mutate({ entryId: vedleggEntryId, file });
              e.target.value = "";
            }} />

          <ul className="space-y-2">
            {journal.map((entry) => (
              <li key={entry.id} className="border rounded-md p-2.5" data-testid={`journal-entry-${entry.id}`}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">{JOURNAL_KATEGORIER[entry.kategori] ?? entry.kategori}</Badge>
                    <span className="text-xs text-muted-foreground">{formatDato(entry.createdAt)}</span>
                    {entry.correctsEntryId && <Badge variant="secondary" className="text-[10px]">Retting</Badge>}
                  </div>
                  <Button size="sm" variant="ghost" className="h-7 px-2"
                    onClick={() => { setVedleggEntryId(entry.id); fileInput.current?.click(); }}>
                    <Paperclip className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <p className="mt-1 whitespace-pre-wrap">{entry.innhold}</p>
              </li>
            ))}
            {journal.length === 0 && <li className="text-xs text-muted-foreground">Ingen journaloppføringer ennå.</li>}
          </ul>
          </TabsContent>

          <TabsContent value="plan" className="mt-3">
            <PlanSeksjon sakId={sakId} />
          </TabsContent>
          <TabsContent value="dokumenter" className="mt-3">
            <DokumentSeksjon sakId={sakId} />
          </TabsContent>
          <TabsContent value="oppgaver" className="mt-3">
            <OppgaveSeksjon entityType="sak" entityId={sakId} />
          </TabsContent>
        </Tabs>
      </CardContent>

      <Dialog open={faseOpen} onOpenChange={setFaseOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Overgang til {SAK_FASER[tilFase] ?? tilFase}</DialogTitle></DialogHeader>
          {(tilFase === "avsluttet" || tilFase === "henlagt") && (
            <p className="text-xs text-muted-foreground">Avsluttende vedtak — krever barnevernsleder.</p>
          )}
          <div className="space-y-1.5">
            <Label>Begrunnelse (påkrevd, logges i fasehistorikken)</Label>
            <Textarea rows={3} value={faseBegrunnelse} onChange={(e) => setFaseBegrunnelse(e.target.value)} data-testid="fase-begrunnelse-input" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFaseOpen(false)}>Avbryt</Button>
            <Button onClick={() => endreFase.mutate()}
              disabled={!faseBegrunnelse.trim() || endreFase.isPending} data-testid="fase-bekreft-button">
              Gjennomfør
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ── HOVEDSIDE ────────────────────────────────────────────────────────────────

export default function BarnevernPage() {
  const [tab, setTab] = useState("meldinger");
  const [nyMeldingOpen, setNyMeldingOpen] = useState(false);
  const [valgtMeldingId, setValgtMeldingId] = useState<string | null>(null);
  const [valgtSakId, setValgtSakId] = useState<string | null>(null);

  const { data: meldinger = [], isLoading: lasterMeldinger } = useQuery({
    queryKey: ["barnevern-meldinger"],
    queryFn: () => api.listMeldinger(),
  });
  const { data: saker = [], isLoading: lasterSaker } = useQuery({
    queryKey: ["barnevern-saker"],
    queryFn: () => api.listSaker(),
  });

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-xl md:text-2xl font-semibold" data-testid="barnevern-title">Barnevern</h1>
        <Button onClick={() => setNyMeldingOpen(true)} data-testid="ny-melding-button">
          <Plus className="h-4 w-4 mr-1.5" /> Ny bekymringsmelding
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="meldinger" data-testid="tab-meldinger">
            <Inbox className="h-4 w-4 mr-1.5" /> Meldinger ({meldinger.length})
          </TabsTrigger>
          <TabsTrigger value="saker" data-testid="tab-saker">
            <FolderOpen className="h-4 w-4 mr-1.5" /> Saker ({saker.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="meldinger" className="mt-4">
          <div className="grid md:grid-cols-[minmax(260px,340px)_1fr] gap-4">
            <div className="space-y-2">
              {lasterMeldinger && <p className="text-sm text-muted-foreground">Laster …</p>}
              {meldinger.map((m) => {
                const status = MELDING_STATUS[m.status] ?? { label: m.status, variant: "outline" as const };
                return (
                  <button key={m.id} type="button"
                    onClick={() => setValgtMeldingId(m.id)}
                    className={cn(
                      "w-full text-left border rounded-md p-2.5 hover:bg-muted/50 transition-colors",
                      valgtMeldingId === m.id && "border-primary bg-muted/40",
                    )}
                    data-testid={`melding-rad-${m.id}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm">{m.meldingsnummer}</span>
                      <div className="flex gap-1">
                        {m.prioritet === "akutt" && <Badge variant="destructive" className="text-[10px]">Akutt</Badge>}
                        <Badge variant={status.variant} className="text-[10px]">{status.label}</Badge>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {m.ufodtBarn ? "Ufødt barn" : (m.barnNavn ?? "Ukjent barn")} · {formatDato(m.mottattDato)}
                    </p>
                  </button>
                );
              })}
              {!lasterMeldinger && meldinger.length === 0 && (
                <p className="text-sm text-muted-foreground">Ingen meldinger registrert.</p>
              )}
            </div>
            <div>
              {valgtMeldingId
                ? <MeldingDetalj meldingId={valgtMeldingId} onSakOpprettet={(sakId) => { setValgtSakId(sakId); setTab("saker"); }} />
                : <p className="text-sm text-muted-foreground p-4">Velg en melding fra listen.</p>}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="saker" className="mt-4">
          <div className="grid md:grid-cols-[minmax(260px,340px)_1fr] gap-4">
            <div className="space-y-2">
              {lasterSaker && <p className="text-sm text-muted-foreground">Laster …</p>}
              {saker.map((s) => (
                <button key={s.id} type="button"
                  onClick={() => setValgtSakId(s.id)}
                  className={cn(
                    "w-full text-left border rounded-md p-2.5 hover:bg-muted/50 transition-colors",
                    valgtSakId === s.id && "border-primary bg-muted/40",
                  )}
                  data-testid={`sak-rad-${s.id}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm">{s.saksnummer}</span>
                    <Badge className="text-[10px]">{SAK_FASER[s.fase] ?? s.fase}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {s.barnNavn ?? "Ukjent barn"} · {formatDato(s.createdAt)}
                  </p>
                </button>
              ))}
              {!lasterSaker && saker.length === 0 && (
                <p className="text-sm text-muted-foreground">Ingen saker ennå. Opprett fra en melding.</p>
              )}
            </div>
            <div>
              {valgtSakId
                ? <SakDetalj sakId={valgtSakId} />
                : <p className="text-sm text-muted-foreground p-4">Velg en sak fra listen.</p>}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <NyMeldingDialog open={nyMeldingOpen} onOpenChange={setNyMeldingOpen} />
    </div>
  );
}
