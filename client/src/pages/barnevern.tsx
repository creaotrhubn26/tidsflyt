/**
 * client/src/pages/barnevern.tsx
 *
 * Kommunalt barnevern: meldingsmottak (krav 1), sak/faseflyt (krav 2) og
 * journal (krav 4). Rute: /barnevern — kun kommuneroller (se App.tsx).
 */
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, ArrowRight, Baby, FileText, FolderOpen, Home, Inbox,
  MessageSquare, Paperclip, Pencil, Phone, Plus, Search, Stamp,
  Users as UsersIcon,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
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

const JOURNAL_IKONER: Record<string, typeof FileText> = {
  notat: FileText, telefonsamtale: Phone, mote: UsersIcon, hjemmebesok: Home,
  samtale_med_barnet: MessageSquare, vedtak: Stamp, annet: FileText,
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

/** Frist som chip med gjenstående tid: grønn > 7 d, oransje ≤ 7 d, rød passert. */
function FristChip({ frist, ferdig, label }: { frist: string | null | undefined; ferdig?: boolean; label?: string }) {
  if (!frist) return null;
  const dager = Math.ceil((new Date(frist).getTime() - Date.now()) / 86400000);
  const tekst = ferdig
    ? "Overholdt"
    : dager < 0 ? `Frist passert (${-dager} d siden)`
    : dager === 0 ? "Frist i dag"
    : `${dager} d igjen`;
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium tabular-nums",
      ferdig ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
      : dager < 0 ? "border-destructive/40 bg-destructive/10 text-destructive"
      : dager <= 7 ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
      : "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    )}>
      <AlertTriangle className={cn("h-3 w-3", (ferdig || dager > 7) && "hidden")} />
      {label ? `${label}: ` : ""}{tekst}
    </span>
  );
}

/** Faseflyt som stegindikator. Henlagt vises som eget endepunkt. */
function FaseStepper({ fase }: { fase: string }) {
  const steg = ["undersokelse", "tiltak", "avsluttet"];
  const aktivIdx = fase === "henlagt" ? -1 : steg.indexOf(fase);
  return (
    <div className="flex items-center gap-1.5 text-[11px] font-medium" aria-label="Faseflyt">
      {steg.map((f, i) => (
        <div key={f} className="flex items-center gap-1.5">
          {i > 0 && <div className={cn("h-px w-5", i <= aktivIdx ? "bg-primary" : "bg-border")} />}
          <span className={cn(
            "flex items-center gap-1 rounded-full px-2 py-0.5",
            i < aktivIdx && "bg-primary/15 text-primary",
            i === aktivIdx && "bg-primary text-primary-foreground",
            i > aktivIdx && "bg-muted text-muted-foreground",
          )}>
            {i < aktivIdx && <span aria-hidden>✓</span>}
            {SAK_FASER[f]}
          </span>
        </div>
      ))}
      {fase === "henlagt" && (
        <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-muted-foreground">Henlagt</span>
      )}
    </div>
  );
}

/** Skeleton-rader for listelasting. */
function ListeSkeleton() {
  return (
    <div className="space-y-2" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-lg border bg-card p-3 shadow-sm">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="mt-2 h-3 w-40" />
        </div>
      ))}
    </div>
  );
}

/** Tom detalj-flate: dagens fristbilde + hurtighandling (UX pkt. 8). */
function TomDetaljFlate({ tittel, meldinger, saker, onNy }: {
  tittel: string;
  meldinger: { id: string; meldingsnummer: string; status: string; avklaringsfrist?: string | null }[];
  saker: { id: string; saksnummer: string; fase: string; undersokelsesfrist?: string | null }[];
  onNy: () => void;
}) {
  const naerFrist = [
    ...meldinger
      .filter((m) => (m.status === "mottatt" || m.status === "under_avklaring") && m.avklaringsfrist)
      .map((m) => ({ id: m.id, navn: m.meldingsnummer, frist: m.avklaringsfrist! })),
    ...saker
      .filter((x) => x.fase === "undersokelse" && x.undersokelsesfrist)
      .map((x) => ({ id: x.id, navn: x.saksnummer, frist: x.undersokelsesfrist! })),
  ].sort((a, b) => new Date(a.frist).getTime() - new Date(b.frist).getTime()).slice(0, 4);

  return (
    <div className="flex h-full min-h-[260px] flex-col items-center justify-center gap-4 rounded-xl border border-dashed bg-card/50 p-6 text-center">
      <p className="text-sm text-muted-foreground">{tittel} fra listen — eller start noe nytt.</p>
      {naerFrist.length > 0 && (
        <div className="w-full max-w-sm space-y-1.5 text-left">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Nærmeste frister</p>
          {naerFrist.map((f) => (
            <div key={f.id} className="flex items-center justify-between rounded-md border bg-card px-3 py-1.5 text-sm">
              <span className="font-medium">{f.navn}</span>
              <FristChip frist={f.frist} />
            </div>
          ))}
        </div>
      )}
      <Button size="sm" variant="outline" onClick={onNy}>
        <Plus className="mr-1.5 h-4 w-4" /> Ny bekymringsmelding
      </Button>
    </div>
  );
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
    <Card data-testid="melding-detalj" className="shadow-md overflow-hidden">
      <CardHeader className="pb-3 bg-muted/40 border-b">
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

// ── INNSYN (krav 16) ─────────────────────────────────────────────────────────

const INNSYN_STATUSER: Record<string, string> = {
  mottatt: "Mottatt", innvilget: "Innvilget", delvis_innvilget: "Delvis innvilget",
  avslatt: "Avslått", utlevert: "Utlevert", klage_mottatt: "Klage mottatt",
  oversendt_klageinstans: "Oversendt statsforvalteren",
};

function InnsynSeksjon({ sakId }: { sakId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [partNavn, setPartNavn] = useState("");
  const [partRelasjon, setPartRelasjon] = useState("forelder");
  const [beslutningFor, setBeslutningFor] = useState<string | null>(null);
  const [utfall, setUtfall] = useState("innvilget");
  const [begrunnelse, setBegrunnelse] = useState("");
  const [unntakHjemmel, setUnntakHjemmel] = useState("");
  const [unntakBeskrivelse, setUnntakBeskrivelse] = useState("");

  const { data: krav = [] } = useQuery({
    queryKey: ["barnevern-innsyn", sakId],
    queryFn: () => api.listInnsynskrav(sakId),
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["barnevern-innsyn", sakId] });
  const feil = (e: Error) => toast({ title: "Feil", description: e.message, variant: "destructive" });

  const opprett = useMutation({
    mutationFn: () => api.opprettInnsynskrav(sakId, { partNavn, partRelasjon }),
    onSuccess: () => { invalidate(); setPartNavn(""); toast({ title: "Innsynsbegjæring registrert (5 dagers frist)" }); },
    onError: feil,
  });
  const beslutt = useMutation({
    mutationFn: (id: string) => api.besluttInnsyn(id, {
      utfall,
      begrunnelse: begrunnelse || undefined,
      unntak: utfall === "delvis_innvilget" && unntakHjemmel
        ? [{ hjemmel: unntakHjemmel, beskrivelse: unntakBeskrivelse }]
        : undefined,
    }),
    onSuccess: () => {
      invalidate(); setBeslutningFor(null); setBegrunnelse(""); setUnntakHjemmel(""); setUnntakBeskrivelse("");
      queryClient.invalidateQueries({ queryKey: ["barnevern-sak-journal", sakId] });
      toast({ title: "Beslutning journalført" });
    },
    onError: feil,
  });
  const utlever = useMutation({
    mutationFn: ({ id, via }: { id: string; via: string }) => api.utleverInnsyn(id, via),
    onSuccess: () => { invalidate(); toast({ title: "Utlevering auditlogget" }); },
    onError: feil,
  });
  const klage = useMutation({
    mutationFn: (id: string) => api.registrerInnsynKlage(id),
    onSuccess: () => { invalidate(); toast({ title: "Klage registrert" }); },
    onError: feil,
  });
  const oversend = useMutation({
    mutationFn: (id: string) => api.oversendInnsynKlage(id),
    onSuccess: () => { invalidate(); toast({ title: "Klage oversendt statsforvalteren" }); },
    onError: feil,
  });

  return (
    <div className="space-y-3 text-sm">
      <div className="flex gap-2 flex-wrap">
        <Input placeholder="Partens navn" className="w-48" value={partNavn} onChange={(e) => setPartNavn(e.target.value)} data-testid="innsyn-part-input" />
        <Select value={partRelasjon} onValueChange={setPartRelasjon}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            {["forelder", "barn", "verge", "fullmektig", "annet"].map((r) => (
              <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={() => opprett.mutate()} disabled={!partNavn.trim() || opprett.isPending} data-testid="innsyn-opprett-button">
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Registrer begjæring
        </Button>
      </div>

      <ul className="space-y-2">
        {krav.map((k) => (
          <li key={k.id} className="border rounded-md p-2.5 space-y-1.5" data-testid={`innsyn-${k.id}`}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="font-medium">{k.partNavn} <span className="text-xs text-muted-foreground capitalize">({k.partRelasjon})</span></span>
              <Badge variant={k.status === "avslatt" ? "destructive" : "secondary"} className="text-[10px]">
                {INNSYN_STATUSER[k.status] ?? k.status}
              </Badge>
            </div>
            <p className={cn("text-xs", k.status === "mottatt" && fristPassert(k.behandlingsfrist) ? "text-destructive font-medium" : "text-muted-foreground")}>
              Behandlingsfrist: {formatDato(k.behandlingsfrist)}
            </p>
            {k.beslutningBegrunnelse && <p className="text-xs text-muted-foreground">Begrunnelse: {k.beslutningBegrunnelse}</p>}
            {k.unntak?.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Unntatt: {k.unntak.map((u) => `${u.beskrivelse} (${u.hjemmel})`).join("; ")}
              </p>
            )}

            <div className="flex gap-2 flex-wrap">
              {k.status === "mottatt" && (
                <Button size="sm" variant="outline" onClick={() => setBeslutningFor(beslutningFor === k.id ? null : k.id)} data-testid={`innsyn-beslutt-${k.id}`}>
                  Beslutt (barnevernsleder)
                </Button>
              )}
              {(k.status === "innvilget" || k.status === "delvis_innvilget") && (
                <Button size="sm" onClick={() => utlever.mutate({ id: k.id, via: "sikker_dialog" })} data-testid={`innsyn-utlever-${k.id}`}>
                  Utlever via sikker dialog
                </Button>
              )}
              {["avslatt", "delvis_innvilget", "utlevert"].includes(k.status) && (
                <Button size="sm" variant="ghost" onClick={() => klage.mutate(k.id)}>Registrer klage</Button>
              )}
              {k.status === "klage_mottatt" && (
                <Button size="sm" variant="outline" onClick={() => oversend.mutate(k.id)}>
                  Oversend statsforvalteren (leder)
                </Button>
              )}
            </div>

            {beslutningFor === k.id && (
              <div className="border-t pt-2 space-y-2">
                <Select value={utfall} onValueChange={setUtfall}>
                  <SelectTrigger className="w-52" data-testid="innsyn-utfall-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="innvilget">Innvilget</SelectItem>
                    <SelectItem value="delvis_innvilget">Delvis innvilget (unntak)</SelectItem>
                    <SelectItem value="avslatt">Avslått</SelectItem>
                  </SelectContent>
                </Select>
                {utfall === "delvis_innvilget" && (
                  <div className="flex gap-2">
                    <Input placeholder="Hjemmel (f.eks. fvl. § 19 b)" value={unntakHjemmel} onChange={(e) => setUnntakHjemmel(e.target.value)} data-testid="innsyn-hjemmel-input" />
                    <Input placeholder="Hva unntas" value={unntakBeskrivelse} onChange={(e) => setUnntakBeskrivelse(e.target.value)} />
                  </div>
                )}
                {utfall !== "innvilget" && (
                  <Textarea rows={2} placeholder="Begrunnelse (påkrevd)" value={begrunnelse} onChange={(e) => setBegrunnelse(e.target.value)} data-testid="innsyn-begrunnelse-input" />
                )}
                <Button size="sm" onClick={() => beslutt.mutate(k.id)} disabled={beslutt.isPending} data-testid="innsyn-bekreft-button">
                  Fatt beslutning
                </Button>
              </div>
            )}
          </li>
        ))}
        {krav.length === 0 && <li className="text-xs text-muted-foreground">Ingen innsynsbegjæringer.</li>}
      </ul>
    </div>
  );
}

// ── FOREBYGGENDE (krav 18) ───────────────────────────────────────────────────

const FOREBYGGENDE_KATEGORIER: Record<string, string> = {
  program: "Program", prosjekt: "Prosjekt", samarbeid: "Samarbeid", kampanje: "Kampanje", annet: "Annet",
};
const FOREBYGGENDE_STATUSER: Record<string, string> = {
  planlagt: "Planlagt", pagar: "Pågår", avsluttet: "Avsluttet",
};

function ForebyggendeFane() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tittel, setTittel] = useState("");
  const [kategori, setKategori] = useState("program");
  const [valgtId, setValgtId] = useState<string | null>(null);
  const [aktivitetBeskrivelse, setAktivitetBeskrivelse] = useState("");
  const [aktivitetDato, setAktivitetDato] = useState("");
  const [aktivitetDeltakere, setAktivitetDeltakere] = useState("");

  const { data: tiltak = [] } = useQuery({
    queryKey: ["barnevern-forebyggende"],
    queryFn: () => api.listForebyggende(),
  });
  const { data: valgt } = useQuery({
    queryKey: ["barnevern-forebyggende", valgtId],
    queryFn: () => api.getForebyggende(valgtId!),
    enabled: !!valgtId,
  });
  const { data: statistikk } = useQuery({
    queryKey: ["barnevern-forebyggende-statistikk"],
    queryFn: () => api.getForebyggendeStatistikk(),
  });
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["barnevern-forebyggende"] });
    queryClient.invalidateQueries({ queryKey: ["barnevern-forebyggende-statistikk"] });
    if (valgtId) queryClient.invalidateQueries({ queryKey: ["barnevern-forebyggende", valgtId] });
  };
  const feil = (e: Error) => toast({ title: "Feil", description: e.message, variant: "destructive" });

  const opprett = useMutation({
    mutationFn: () => api.opprettForebyggende({ tittel, kategori }),
    onSuccess: (t) => { invalidate(); setTittel(""); setValgtId(t.id); toast({ title: "Tiltak opprettet" }); },
    onError: feil,
  });
  const settStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.settForebyggendeStatus(id, status),
    onSuccess: invalidate,
    onError: feil,
  });
  const nyAktivitet = useMutation({
    mutationFn: () => api.registrerForebyggendeAktivitet(valgtId!, {
      dato: aktivitetDato,
      beskrivelse: aktivitetBeskrivelse,
      antallDeltakere: aktivitetDeltakere ? Number(aktivitetDeltakere) : undefined,
    }),
    onSuccess: () => { invalidate(); setAktivitetBeskrivelse(""); setAktivitetDeltakere(""); toast({ title: "Aktivitet registrert" }); },
    onError: feil,
  });

  const aaretsAktivitet = statistikk?.aktivitetPerAar?.[0];

  return (
    <div className="space-y-4">
      {aaretsAktivitet && (
        <p className="text-sm text-muted-foreground" data-testid="forebyggende-statistikk">
          {aaretsAktivitet.aar}: {aaretsAktivitet.antall_aktiviteter} aktiviteter, {aaretsAktivitet.antall_deltakere} deltakere.
        </p>
      )}
      <div className="flex gap-2 flex-wrap">
        <Input placeholder="Nytt forebyggende tiltak …" className="w-64" value={tittel} onChange={(e) => setTittel(e.target.value)} data-testid="forebyggende-tittel-input" />
        <Select value={kategori} onValueChange={setKategori}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(FOREBYGGENDE_KATEGORIER).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={() => opprett.mutate()} disabled={!tittel.trim() || opprett.isPending} data-testid="forebyggende-opprett-button">
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Opprett
        </Button>
      </div>

      <div className="grid md:grid-cols-[minmax(260px,340px)_1fr] gap-4">
        <div className="space-y-2">
          {tiltak.map((t) => (
            <button key={t.id} type="button" onClick={() => setValgtId(t.id)}
              className={cn("w-full text-left border rounded-md p-2.5 hover:bg-muted/50 transition-colors",
                valgtId === t.id && "border-primary bg-muted/40")}
              data-testid={`forebyggende-rad-${t.id}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-sm">{t.tittel}</span>
                <Badge variant="outline" className="text-[10px]">{FOREBYGGENDE_STATUSER[t.status] ?? t.status}</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{FOREBYGGENDE_KATEGORIER[t.kategori] ?? t.kategori}</p>
            </button>
          ))}
          {tiltak.length === 0 && <p className="text-sm text-muted-foreground">Ingen tiltak registrert.</p>}
        </div>
        <div>
          {valgt ? (
            <Card data-testid="forebyggende-detalj">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="text-base">{valgt.tittel}</CardTitle>
                  <Select value={valgt.status} onValueChange={(v) => settStatus.mutate({ id: valgt.id, status: v })}>
                    <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(FOREBYGGENDE_STATUSER).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {valgt.samarbeidsparter?.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Samarbeidsparter: {valgt.samarbeidsparter.map((p) => p.navn).join(", ")}
                  </p>
                )}
                <div className="flex gap-2 flex-wrap">
                  <Input type="date" className="w-40" value={aktivitetDato} onChange={(e) => setAktivitetDato(e.target.value)} data-testid="aktivitet-dato-input" />
                  <Input placeholder="Aktivitet" className="flex-1 min-w-40" value={aktivitetBeskrivelse} onChange={(e) => setAktivitetBeskrivelse(e.target.value)} data-testid="aktivitet-beskrivelse-input" />
                  <Input placeholder="Deltakere" inputMode="numeric" className="w-24" value={aktivitetDeltakere} onChange={(e) => setAktivitetDeltakere(e.target.value.replace(/\D/g, ""))} data-testid="aktivitet-deltakere-input" />
                  <Button size="sm" onClick={() => nyAktivitet.mutate()}
                    disabled={!aktivitetDato || !aktivitetBeskrivelse.trim() || nyAktivitet.isPending}
                    data-testid="aktivitet-registrer-button">
                    Registrer
                  </Button>
                </div>
                <ul className="space-y-1.5">
                  {(valgt.aktiviteter ?? []).map((a) => (
                    <li key={a.id} className="border-l-2 pl-2 text-xs">
                      <span className="text-muted-foreground">{a.dato}:</span> {a.beskrivelse}
                      {a.antallDeltakere != null && <span className="text-muted-foreground"> ({a.antallDeltakere} deltakere)</span>}
                    </li>
                  ))}
                  {(valgt.aktiviteter ?? []).length === 0 && (
                    <li className="text-xs text-muted-foreground">Ingen aktiviteter ennå.</li>
                  )}
                </ul>
              </CardContent>
            </Card>
          ) : (
            <p className="text-sm text-muted-foreground p-4">Velg et tiltak fra listen.</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── INNRAPPORTERING (krav 10 — Barnevernsregisteret) ─────────────────────────

const BVR_STATUSER: Record<string, string> = {
  koet: "I kø", sender: "Sender", sendt: "Sendt", feilet: "Feilet", avvist: "Avvist (validering)",
};

function InnrapporteringFane() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: innsendinger = [], error } = useQuery({
    queryKey: ["barnevern-innrapportering"],
    queryFn: () => api.listInnrapportering(),
    retry: false,
  });
  const kjor = useMutation({
    mutationFn: () => api.kjorInnrapportering(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["barnevern-innrapportering"] });
      toast({ title: "Innrapportering køet", description: "Gårsdagens datasett er kvalitetssikret og lagt i kø." });
    },
    onError: (e: Error) => toast({ title: "Feil", description: e.message, variant: "destructive" }),
  });

  if (error) {
    return <p className="text-sm text-muted-foreground p-4">Innrapporteringsloggen er forbeholdt barnevernsleder.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm text-muted-foreground">
          Daglig automatisk innsending til Barnevernsregisteret (Bufdir) via KS FIKS Protokoll.
          Kjøres 06:00; datasett kvalitetssikres før sending.
        </p>
        <Button size="sm" onClick={() => kjor.mutate()} disabled={kjor.isPending} data-testid="innrapportering-kjor-button">
          Kjør nå
        </Button>
      </div>
      <ul className="space-y-2">
        {innsendinger.map((i) => (
          <li key={i.id} className="border rounded-md p-2.5 text-sm" data-testid={`innsending-${i.id}`}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="font-medium">{String(i.rapportdato).slice(0, 10)}</span>
              <Badge variant={i.status === "sendt" ? "default" : i.status === "avvist" || i.status === "feilet" ? "destructive" : "secondary"} className="text-[10px]">
                {BVR_STATUSER[i.status] ?? i.status}
              </Badge>
            </div>
            {i.kvittering && (
              <p className="text-xs text-muted-foreground mt-1">
                Kvittering: {JSON.stringify(i.kvittering).slice(0, 120)}
              </p>
            )}
            {i.valideringsfeil && i.valideringsfeil.length > 0 && (
              <ul className="text-xs text-destructive mt-1 list-disc pl-4">
                {i.valideringsfeil.map((f, idx) => <li key={idx}>{f}</li>)}
              </ul>
            )}
            {i.feil && <p className="text-xs text-destructive mt-1">{i.feil} (forsøk {i.forsok})</p>}
            <p className="text-[10px] text-muted-foreground mt-1 font-mono">sha256: {i.innholdsHash.slice(0, 16)}…</p>
          </li>
        ))}
        {innsendinger.length === 0 && <li className="text-sm text-muted-foreground">Ingen innsendinger ennå.</li>}
      </ul>
    </div>
  );
}

// ── NØKKELTALL (krav 13) ─────────────────────────────────────────────────────

/** Minimal SVG-sparkline for KPI-serier (ingen avhengigheter). */
function Sparkline({ serie }: { serie: number[] }) {
  const maks = Math.max(...serie, 1);
  const b = 96, h = 28;
  const punkter = serie.map((v, i) => `${(i / (serie.length - 1)) * b},${h - (v / maks) * (h - 4) - 2}`).join(" ");
  return (
    <svg width={b} height={h} viewBox={`0 0 ${b} ${h}`} aria-hidden className="text-primary/70">
      <polyline points={punkter} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TrendLinje({ kpi }: { kpi: api.Kpi }) {
  if (kpi.forrigeVerdi == null || kpi.verdi == null) return null;
  const diff = kpi.verdi - kpi.forrigeVerdi;
  const pil = diff > 0 ? "↑" : diff < 0 ? "↓" : "→";
  return (
    <span className="text-[11px] text-muted-foreground tabular-nums">
      {pil} {diff > 0 ? "+" : ""}{diff} vs forrige 30 d ({kpi.forrigeVerdi})
    </span>
  );
}

function NokkeltallFane() {
  const { data, error } = useQuery({
    queryKey: ["barnevern-kpi"],
    queryFn: () => api.listKpi(),
    retry: false,
  });

  if (error) {
    return <p className="text-sm text-muted-foreground p-4">Nøkkeltallene er forbeholdt barnevernsleder.</p>;
  }
  if (!data) {
    return (
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3" aria-hidden>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="rounded-xl border bg-card p-4 shadow-sm">
            <Skeleton className="h-8 w-16" /><Skeleton className="mt-2 h-4 w-32" />
          </div>
        ))}
      </div>
    );
  }

  const formater = (kpi: api.Kpi) => {
    if (kpi.verdi == null) return "—";
    if (kpi.enhet === "prosent") return `${kpi.verdi} %`;
    if (kpi.enhet === "dager") return `${kpi.verdi} d`;
    return String(kpi.verdi);
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Beregnet direkte fra saksdataene {formatDato(data.generert)}. Klikk et kort for kilde og formel —
        det er dokumentasjonen på hvordan tallet hentes.
      </p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {data.kpier.map((kpi) => (
          <details key={kpi.id}
            className="group rounded-xl border bg-card p-4 shadow-sm transition-all hover:shadow hover:border-primary/40 open:border-primary/50 open:shadow"
            data-testid={`kpi-${kpi.id}`}>
            <summary className="cursor-pointer list-none">
              <div className="flex items-start justify-between gap-2">
                <span className="block text-3xl font-semibold tracking-tight tabular-nums text-primary">{formater(kpi)}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{kpi.frekvens}</span>
              </div>
              <span className="mt-1 block text-sm font-medium">{kpi.navn}</span>
              <div className="mt-1 flex items-end justify-between gap-2">
                <TrendLinje kpi={kpi} />
                {kpi.serie && kpi.serie.length > 1 && <Sparkline serie={kpi.serie} />}
              </div>
              <span className="mt-0.5 block text-[11px] text-muted-foreground group-open:hidden">Klikk for kilde og formel</span>
            </summary>
            <div className="mt-2 pt-2 border-t text-xs text-muted-foreground space-y-1">
              <p>{kpi.beskrivelse}</p>
              <p><span className="font-medium">Kilde:</span> {kpi.kilde}</p>
              <p><span className="font-medium">Eier:</span> {kpi.eier} · <span className="font-medium">Frekvens:</span> {kpi.frekvens}</p>
              <p className="font-mono text-[10px] break-all">{kpi.formel}</p>
            </div>
          </details>
        ))}
      </div>
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
    <Card data-testid="sak-detalj" className="shadow-md overflow-hidden">
      <CardHeader className="pb-3 bg-muted/40 border-b">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-base">{sak.saksnummer}</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {sak.barnNavn ?? "Ukjent barn"} · Opprettet {formatDato(sak.createdAt)}
            </p>
          </div>
          <Badge>{SAK_FASER[sak.fase] ?? sak.fase}</Badge>
        </div>
        <div className="mt-2"><FaseStepper fase={sak.fase} /></div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {sak.fase === "undersokelse" && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            Undersøkelsesfrist {formatDato(sak.undersokelsesfrist)}
            <FristChip frist={sak.undersokelsesfrist} />
          </div>
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
            <TabsTrigger value="innsyn" data-testid="sak-tab-innsyn">Innsyn</TabsTrigger>
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

          <ul className="relative space-y-3 pl-5 before:absolute before:left-[13px] before:top-1 before:bottom-1 before:w-px before:bg-border">
            {journal.map((entry) => {
              const Ikon = JOURNAL_IKONER[entry.kategori] ?? FileText;
              return (
              <li key={entry.id} className="relative" data-testid={`journal-entry-${entry.id}`}>
                <span className="absolute -left-5 top-1 flex h-6 w-6 items-center justify-center rounded-full border bg-card text-primary shadow-sm">
                  <Ikon className="h-3 w-3" />
                </span>
                <div className="rounded-lg border bg-card p-2.5 shadow-sm ml-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium">{JOURNAL_KATEGORIER[entry.kategori] ?? entry.kategori}</span>
                      <span className="text-xs text-muted-foreground">{formatDato(entry.createdAt)}</span>
                      {entry.correctsEntryId && <Badge variant="secondary" className="text-[10px]">Retting</Badge>}
                    </div>
                    <Button size="sm" variant="ghost" className="h-7 px-2" aria-label="Legg ved fil"
                      onClick={() => { setVedleggEntryId(entry.id); fileInput.current?.click(); }}>
                      <Paperclip className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap">{entry.innhold}</p>
                </div>
              </li>
            );})}
            {journal.length === 0 && <li className="text-xs text-muted-foreground -ml-5">Ingen journaloppføringer ennå.</li>}
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
          <TabsContent value="innsyn" className="mt-3">
            <InnsynSeksjon sakId={sakId} />
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
  const [meldingSok, setMeldingSok] = useState("");
  const [meldingFilter, setMeldingFilter] = useState<string | null>(null);
  const [sakSok, setSakSok] = useState("");
  const [sakFilter, setSakFilter] = useState<string | null>(null);

  const { data: meldinger = [], isLoading: lasterMeldinger } = useQuery({
    queryKey: ["barnevern-meldinger"],
    queryFn: () => api.listMeldinger(),
  });
  const { data: saker = [], isLoading: lasterSaker } = useQuery({
    queryKey: ["barnevern-saker"],
    queryFn: () => api.listSaker(),
  });

  const visteMeldinger = meldinger.filter((m) => {
    if (meldingFilter === "akutt" && m.prioritet !== "akutt") return false;
    if (meldingFilter && meldingFilter !== "akutt" && m.status !== meldingFilter) return false;
    const q = meldingSok.trim().toLowerCase();
    if (q && !`${m.meldingsnummer} ${m.barnNavn ?? ""}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const visteSaker = saker.filter((sak) => {
    if (sakFilter && sak.fase !== sakFilter) return false;
    const q = sakSok.trim().toLowerCase();
    if (q && !`${sak.saksnummer} ${sak.barnNavn ?? ""}`.toLowerCase().includes(q)) return false;
    return true;
  });

  const filterChip = (aktiv: boolean) => cn(
    "rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors",
    aktiv ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:border-primary/40",
  );

  // Piltast-navigasjon i listene (UX pkt. 10).
  const pilNav = (e: React.KeyboardEvent, ider: string[], valgt: string | null, velg: (id: string) => void) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const i = valgt ? ider.indexOf(valgt) : -1;
    const neste = e.key === "ArrowDown" ? Math.min(i + 1, ider.length - 1) : Math.max(i - 1, 0);
    if (ider[neste]) velg(ider[neste]);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/60 to-background">
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap border-b pb-4">
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <UsersIcon className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-semibold tracking-tight" data-testid="barnevern-title">Barnevern</h1>
            <p className="text-sm text-muted-foreground">Meldingsmottak, saksbehandling og rapportering</p>
          </div>
        </div>
        <Button onClick={() => setNyMeldingOpen(true)} data-testid="ny-melding-button" className="shadow-sm">
          <Plus className="h-4 w-4 mr-1.5" /> Ny bekymringsmelding
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-11 gap-1 bg-card border shadow-sm px-1.5">
          <TabsTrigger value="meldinger" data-testid="tab-meldinger" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Inbox className="h-4 w-4 mr-1.5" /> Meldinger
            <span className="ml-1.5 rounded-full bg-foreground/10 px-1.5 text-[11px] tabular-nums group-data-[state=active]:bg-primary-foreground/20">{meldinger.length}</span>
          </TabsTrigger>
          <TabsTrigger value="saker" data-testid="tab-saker" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <FolderOpen className="h-4 w-4 mr-1.5" /> Saker
            <span className="ml-1.5 rounded-full bg-foreground/10 px-1.5 text-[11px] tabular-nums">{saker.length}</span>
          </TabsTrigger>
          <TabsTrigger value="forebyggende" data-testid="tab-forebyggende" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Forebyggende</TabsTrigger>
          <TabsTrigger value="innrapportering" data-testid="tab-innrapportering" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Innrapportering</TabsTrigger>
          <TabsTrigger value="nokkeltall" data-testid="tab-nokkeltall" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Nøkkeltall</TabsTrigger>
        </TabsList>

        <TabsContent value="meldinger" className="mt-4">
          <div className="grid md:grid-cols-[minmax(260px,340px)_1fr] gap-4">
            <div className={cn("space-y-2", valgtMeldingId && "hidden md:block")}
              role="listbox" aria-label="Bekymringsmeldinger" tabIndex={0}
              onKeyDown={(e) => pilNav(e, visteMeldinger.map((m) => m.id), valgtMeldingId, setValgtMeldingId)}>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={meldingSok} onChange={(e) => setMeldingSok(e.target.value)}
                  placeholder="Søk på nummer eller barn …" className="pl-8 bg-card" data-testid="melding-sok" />
              </div>
              <div className="flex flex-wrap gap-1.5 pb-1">
                {[["akutt", "Akutt"], ["mottatt", "Mottatt"], ["under_avklaring", "Under avklaring"], ["henlagt", "Henlagt"]].map(([verdi, navn]) => (
                  <button key={verdi} type="button" className={filterChip(meldingFilter === verdi)}
                    onClick={() => setMeldingFilter(meldingFilter === verdi ? null : verdi)}>{navn}</button>
                ))}
              </div>
              {lasterMeldinger && <ListeSkeleton />}
              {visteMeldinger.map((m) => {
                const status = MELDING_STATUS[m.status] ?? { label: m.status, variant: "outline" as const };
                return (
                  <button key={m.id} type="button"
                    onClick={() => setValgtMeldingId(m.id)}
                    className={cn(
                      "w-full text-left rounded-lg border bg-card p-3 shadow-sm transition-all hover:shadow hover:border-primary/40",
                      "border-l-4 border-l-transparent",
                      m.prioritet === "akutt" && "border-l-destructive/70",
                      valgtMeldingId === m.id && "border-primary border-l-primary bg-primary/5 shadow",
                    )}
                    role="option" aria-selected={valgtMeldingId === m.id}
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
                    {(m.status === "mottatt" || m.status === "under_avklaring") && (
                      <div className="mt-1.5"><FristChip frist={m.avklaringsfrist} /></div>
                    )}
                  </button>
                );
              })}
              {!lasterMeldinger && visteMeldinger.length === 0 && (
                <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground"><Inbox className="mx-auto mb-2 h-8 w-8 opacity-40" />{meldinger.length === 0 ? "Ingen meldinger registrert." : "Ingen treff — juster søk eller filter."}</div>
              )}
            </div>
            <div className={cn(!valgtMeldingId && "hidden md:block")}>
              {valgtMeldingId ? (
                <div className="space-y-2">
                  <Button variant="ghost" size="sm" className="md:hidden -ml-2" onClick={() => setValgtMeldingId(null)}>← Til listen</Button>
                  <MeldingDetalj meldingId={valgtMeldingId} onSakOpprettet={(sakId) => { setValgtSakId(sakId); setTab("saker"); }} />
                </div>
              ) : <TomDetaljFlate tittel="Velg en melding" meldinger={meldinger} saker={saker} onNy={() => setNyMeldingOpen(true)} />}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="saker" className="mt-4">
          <div className="grid md:grid-cols-[minmax(260px,340px)_1fr] gap-4">
            <div className={cn("space-y-2", valgtSakId && "hidden md:block")}
              role="listbox" aria-label="Barnevernssaker" tabIndex={0}
              onKeyDown={(e) => pilNav(e, visteSaker.map((x) => x.id), valgtSakId, setValgtSakId)}>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={sakSok} onChange={(e) => setSakSok(e.target.value)}
                  placeholder="Søk på saksnummer eller barn …" className="pl-8 bg-card" data-testid="sak-sok" />
              </div>
              <div className="flex flex-wrap gap-1.5 pb-1">
                {Object.entries(SAK_FASER).map(([verdi, navn]) => (
                  <button key={verdi} type="button" className={filterChip(sakFilter === verdi)}
                    onClick={() => setSakFilter(sakFilter === verdi ? null : verdi)}>{navn}</button>
                ))}
              </div>
              {lasterSaker && <ListeSkeleton />}
              {visteSaker.map((s) => (
                <button key={s.id} type="button"
                  onClick={() => setValgtSakId(s.id)}
                  className={cn(
                    "w-full text-left rounded-lg border bg-card p-3 shadow-sm transition-all hover:shadow hover:border-primary/40 border-l-4 border-l-transparent",
                    valgtSakId === s.id && "border-primary border-l-primary bg-primary/5 shadow",
                  )}
                  role="option" aria-selected={valgtSakId === s.id}
                  data-testid={`sak-rad-${s.id}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm">{s.saksnummer}</span>
                    <Badge className="text-[10px]">{SAK_FASER[s.fase] ?? s.fase}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {s.barnNavn ?? "Ukjent barn"} · {formatDato(s.createdAt)}
                  </p>
                  {s.fase === "undersokelse" && (
                    <div className="mt-1.5"><FristChip frist={s.undersokelsesfrist} /></div>
                  )}
                </button>
              ))}
              {!lasterSaker && visteSaker.length === 0 && (
                <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground"><FolderOpen className="mx-auto mb-2 h-8 w-8 opacity-40" />{saker.length === 0 ? "Ingen saker ennå. Opprett fra en melding." : "Ingen treff — juster søk eller filter."}</div>
              )}
            </div>
            <div className={cn(!valgtSakId && "hidden md:block")}>
              {valgtSakId ? (
                <div className="space-y-2">
                  <Button variant="ghost" size="sm" className="md:hidden -ml-2" onClick={() => setValgtSakId(null)}>← Til listen</Button>
                  <SakDetalj sakId={valgtSakId} />
                </div>
              ) : <TomDetaljFlate tittel="Velg en sak" meldinger={meldinger} saker={saker} onNy={() => setNyMeldingOpen(true)} />}
            </div>
          </div>
        </TabsContent>
        <TabsContent value="forebyggende" className="mt-4">
          <ForebyggendeFane />
        </TabsContent>
        <TabsContent value="innrapportering" className="mt-4">
          <InnrapporteringFane />
        </TabsContent>
        <TabsContent value="nokkeltall" className="mt-4">
          <NokkeltallFane />
        </TabsContent>
      </Tabs>

      <NyMeldingDialog open={nyMeldingOpen} onOpenChange={setNyMeldingOpen} />
    </div>
    </div>
  );
}
