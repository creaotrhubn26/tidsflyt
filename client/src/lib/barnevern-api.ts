/**
 * API-klient for kommunalt barnevern: meldingsmottak (krav 1),
 * sak/faseflyt (krav 2) og journal (krav 4).
 */

export type BarnevernMelding = {
  id: string;
  kommuneId: number;
  meldingsnummer: string;
  kilde: string;
  mottattDato: string;
  melderKategori: string;
  melderNavn: string | null;
  melderKontakt: string | null;
  barnFodselsnummer: string | null;
  barnNavn: string | null;
  beskrivelse: string;
  status: string;
  tildeltSaksbehandlerId: string | null;
  avklaringsfrist: string;
  avklartDato: string | null;
  henleggelseBegrunnelse: string | null;
  prioritet: "akutt" | "normal";
  ufodtBarn: boolean;
  termindato: string | null;
  forelderMeldingId: string | null;
  soskenkopiAvMeldingId: string | null;
  sak?: { id: string; saksnummer: string };
};

export type MeldingRevisjon = {
  begrunnelse: string;
  feltEndringer: Record<string, { fra: unknown; til: unknown }>;
  endretAvUserId: string;
  createdAt: string;
};

export type BarnevernSak = {
  id: string;
  kommuneId: number;
  saksnummer: string;
  meldingId: string | null;
  barnFodselsnummer: string | null;
  barnNavn: string | null;
  fase: string;
  tildeltSaksbehandlerId: string | null;
  undersokelsesfrist: string | null;
  avsluttetDato: string | null;
  avsluttetAvUserId: string | null;
  createdAt: string;
  faseHistorikk?: FaseHistorikk[];
};

export type FaseHistorikk = {
  fraFase: string | null;
  tilFase: string;
  begrunnelse: string | null;
  endretAvUserId: string;
  createdAt: string;
};

export type JournalEntry = {
  id: string;
  kategori: string;
  innhold: string;
  correctsEntryId: string | null;
  forfatterUserId: string;
  createdAt: string;
};

export class BarnevernApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "include", ...init });
  const body = await response.json().catch(() => null) as { error?: unknown } | null;
  if (!response.ok) {
    throw new BarnevernApiError(
      typeof body?.error === "string" ? body.error : "Operasjonen kunne ikke fullføres",
      response.status,
    );
  }
  return body as T;
}

function jsonInit(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

// ── MELDINGER ────────────────────────────────────────────────────────────────

export function listMeldinger(status?: string): Promise<BarnevernMelding[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return requestJson(`/api/barnevern/meldinger${query}`);
}

export function getMelding(id: string): Promise<BarnevernMelding> {
  return requestJson(`/api/barnevern/meldinger/${id}`);
}

export function createMelding(input: {
  melderKategori: string;
  melderNavn?: string;
  melderKontakt?: string;
  barnNavn?: string;
  barnFodselsnummer?: string;
  beskrivelse: string;
  prioritet?: "akutt" | "normal";
  ufodtBarn?: boolean;
  termindato?: string;
}): Promise<BarnevernMelding> {
  return requestJson("/api/barnevern/meldinger", jsonInit("POST", input));
}

export function redigerMelding(id: string, begrunnelse: string, endringer: Record<string, unknown>): Promise<BarnevernMelding> {
  return requestJson(`/api/barnevern/meldinger/${id}`, jsonInit("PATCH", { begrunnelse, endringer }));
}

export function listRevisjoner(id: string): Promise<MeldingRevisjon[]> {
  return requestJson(`/api/barnevern/meldinger/${id}/revisjoner`);
}

export function henleggMelding(id: string, begrunnelse: string): Promise<BarnevernMelding> {
  return requestJson(`/api/barnevern/meldinger/${id}/henlegg`, jsonInit("POST", { begrunnelse }));
}

export function sendTilUndersokelse(id: string): Promise<BarnevernMelding> {
  return requestJson(`/api/barnevern/meldinger/${id}/send-til-undersokelse`, jsonInit("POST", {}));
}

export function opprettTillegg(id: string, beskrivelse: string): Promise<BarnevernMelding> {
  return requestJson(`/api/barnevern/meldinger/${id}/tillegg`, jsonInit("POST", { beskrivelse }));
}

export function opprettSoskenkopi(id: string, input: {
  barnNavn?: string;
  barnFodselsnummer?: string;
  ufodtBarn?: boolean;
  termindato?: string;
}): Promise<BarnevernMelding> {
  return requestJson(`/api/barnevern/meldinger/${id}/soskenkopi`, jsonInit("POST", input));
}

// ── SAKER ────────────────────────────────────────────────────────────────────

export function listSaker(fase?: string): Promise<BarnevernSak[]> {
  const query = fase ? `?fase=${encodeURIComponent(fase)}` : "";
  return requestJson(`/api/barnevern/saker${query}`);
}

export function getSak(id: string): Promise<BarnevernSak> {
  return requestJson(`/api/barnevern/saker/${id}`);
}

export function endreFase(id: string, tilFase: string, begrunnelse: string): Promise<BarnevernSak> {
  return requestJson(`/api/barnevern/saker/${id}/fase`, jsonInit("POST", { tilFase, begrunnelse }));
}

// ── OPPGAVER ─────────────────────────────────────────────────────────────────

export type Oppgave = {
  id: string;
  entityType: "melding" | "sak";
  entityId: string;
  tittel: string;
  beskrivelse: string | null;
  tildeltUserId: string;
  frist: string | null;
  status: string;
  fullfortDato: string | null;
};

export function listOppgaver(entityType: string, entityId: string): Promise<Oppgave[]> {
  return requestJson(`/api/barnevern/oppgaver?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`);
}

export function opprettOppgave(input: {
  entityType: "melding" | "sak";
  entityId: string;
  tittel: string;
  beskrivelse?: string;
  tildeltUserId: string;
  frist?: string;
}): Promise<Oppgave> {
  return requestJson("/api/barnevern/oppgaver", jsonInit("POST", input));
}

export function fullforOppgave(id: string): Promise<Oppgave> {
  return requestJson(`/api/barnevern/oppgaver/${id}/fullfor`, jsonInit("PATCH", {}));
}

// ── PLANER ───────────────────────────────────────────────────────────────────

export type PlanTiltak = {
  id: string;
  beskrivelse: string;
  ansvarlig: string;
  frist: string | null;
  status: string;
  statusnotat: string | null;
};

export type Plan = {
  id: string;
  sakId: string;
  plantype: string;
  versjon: number;
  status: string;
  formaal: string | null;
  deltakere: { navn: string; rolle: string }[];
  evalueringsfrist: string | null;
  godkjentDato: string | null;
  tiltak: PlanTiltak[];
};

export function listPlaner(sakId: string): Promise<Plan[]> {
  return requestJson(`/api/barnevern/saker/${sakId}/planer`);
}

export function opprettPlan(sakId: string, input: {
  plantype?: string;
  formaal?: string;
  evalueringsfrist?: string;
}): Promise<Plan> {
  return requestJson(`/api/barnevern/saker/${sakId}/planer`, jsonInit("POST", input));
}

export function godkjennPlan(id: string): Promise<Plan> {
  return requestJson(`/api/barnevern/planer/${id}/godkjenn`, jsonInit("POST", {}));
}

export function nyPlanVersjon(id: string): Promise<Plan> {
  return requestJson(`/api/barnevern/planer/${id}/ny-versjon`, jsonInit("POST", {}));
}

export function opprettPlanTiltak(planId: string, input: {
  beskrivelse: string;
  ansvarlig: string;
  frist?: string;
}): Promise<PlanTiltak> {
  return requestJson(`/api/barnevern/planer/${planId}/tiltak`, jsonInit("POST", input));
}

export function settTiltakStatus(tiltakId: string, status: string, statusnotat?: string): Promise<PlanTiltak> {
  return requestJson(`/api/barnevern/plan-tiltak/${tiltakId}/status`, jsonInit("PATCH", { status, statusnotat }));
}

// ── DOKUMENTER ───────────────────────────────────────────────────────────────

export type Dokumentmal = {
  malId: string;
  dokumenttype: "vedtak" | "brev";
  tittel: string;
  hjemmel: string | null;
};

export type Dokument = {
  id: string;
  sakId: string;
  dokumenttype: string;
  malId: string;
  tittel: string;
  hjemmel: string | null;
  innhold: string;
  mottaker: { navn: string } | null;
  status: string;
  ekspedertVia: string | null;
  createdAt: string;
};

export function listDokumentmaler(): Promise<Dokumentmal[]> {
  return requestJson("/api/barnevern/dokumentmaler");
}

export function listDokumenter(sakId: string): Promise<Dokument[]> {
  return requestJson(`/api/barnevern/saker/${sakId}/dokumenter`);
}

export function opprettDokument(sakId: string, input: {
  malId: string;
  mottaker?: { navn: string };
  planId?: string;
}): Promise<Dokument> {
  return requestJson(`/api/barnevern/saker/${sakId}/dokumenter`, jsonInit("POST", input));
}

export function godkjennDokument(id: string): Promise<Dokument> {
  return requestJson(`/api/barnevern/dokumenter/${id}/godkjenn`, jsonInit("POST", {}));
}

export function ekspederDokument(id: string, via: "sikker_dialog" | "manuell"): Promise<Dokument> {
  return requestJson(`/api/barnevern/dokumenter/${id}/ekspeder`, jsonInit("POST", { via }));
}

// ── INNSYN ───────────────────────────────────────────────────────────────────

export type Innsynskrav = {
  id: string;
  sakId: string;
  partNavn: string;
  partRelasjon: string;
  mottattDato: string;
  behandlingsfrist: string;
  status: string;
  unntak: { hjemmel: string; beskrivelse: string }[];
  beslutningBegrunnelse: string | null;
  utlevertDato: string | null;
  utlevertVia: string | null;
  klageMottattDato: string | null;
};

export function listInnsynskrav(sakId: string): Promise<Innsynskrav[]> {
  return requestJson(`/api/barnevern/saker/${sakId}/innsynskrav`);
}

export function opprettInnsynskrav(sakId: string, input: { partNavn: string; partRelasjon: string }): Promise<Innsynskrav> {
  return requestJson(`/api/barnevern/saker/${sakId}/innsynskrav`, jsonInit("POST", input));
}

export function besluttInnsyn(id: string, input: {
  utfall: string;
  begrunnelse?: string;
  unntak?: { hjemmel: string; beskrivelse: string }[];
}): Promise<Innsynskrav> {
  return requestJson(`/api/barnevern/innsynskrav/${id}/beslutning`, jsonInit("POST", input));
}

export function utleverInnsyn(id: string, via: string): Promise<Innsynskrav> {
  return requestJson(`/api/barnevern/innsynskrav/${id}/utlever`, jsonInit("POST", { via }));
}

export function registrerInnsynKlage(id: string, notat?: string): Promise<Innsynskrav> {
  return requestJson(`/api/barnevern/innsynskrav/${id}/klage`, jsonInit("POST", { notat }));
}

export function oversendInnsynKlage(id: string): Promise<Innsynskrav> {
  return requestJson(`/api/barnevern/innsynskrav/${id}/oversend-klage`, jsonInit("POST", {}));
}

// ── FOREBYGGENDE ─────────────────────────────────────────────────────────────

export type ForebyggendeAktivitet = {
  id: string;
  dato: string;
  beskrivelse: string;
  antallDeltakere: number | null;
  notat: string | null;
};

export type ForebyggendeTiltak = {
  id: string;
  tittel: string;
  beskrivelse: string | null;
  kategori: string;
  samarbeidsparter: { navn: string; type?: string }[];
  startDato: string | null;
  sluttDato: string | null;
  status: string;
  aktiviteter?: ForebyggendeAktivitet[];
};

export function listForebyggende(): Promise<ForebyggendeTiltak[]> {
  return requestJson("/api/barnevern/forebyggende");
}

export function getForebyggende(id: string): Promise<ForebyggendeTiltak> {
  return requestJson(`/api/barnevern/forebyggende/${id}`);
}

export function opprettForebyggende(input: {
  tittel: string;
  beskrivelse?: string;
  kategori: string;
  samarbeidsparter?: { navn: string; type?: string }[];
  startDato?: string;
}): Promise<ForebyggendeTiltak> {
  return requestJson("/api/barnevern/forebyggende", jsonInit("POST", input));
}

export function settForebyggendeStatus(id: string, status: string): Promise<ForebyggendeTiltak> {
  return requestJson(`/api/barnevern/forebyggende/${id}`, jsonInit("PATCH", { status }));
}

export function registrerForebyggendeAktivitet(id: string, input: {
  dato: string;
  beskrivelse: string;
  antallDeltakere?: number;
}): Promise<ForebyggendeAktivitet> {
  return requestJson(`/api/barnevern/forebyggende/${id}/aktiviteter`, jsonInit("POST", input));
}

export function getForebyggendeStatistikk(): Promise<{
  perKategori: { kategori: string; status: string; antall: number }[];
  aktivitetPerAar: { aar: number; antall_aktiviteter: number; antall_deltakere: number }[];
}> {
  return requestJson("/api/barnevern/forebyggende/statistikk");
}

// ── INNRAPPORTERING (Barnevernsregisteret) ───────────────────────────────────

export type BvrInnsending = {
  id: string;
  rapportdato: string;
  status: string;
  innholdsHash: string;
  valideringsfeil: string[] | null;
  forsok: number;
  kvittering: Record<string, unknown> | null;
  feil: string | null;
  sendtDato: string | null;
};

export function listInnrapportering(): Promise<BvrInnsending[]> {
  return requestJson("/api/barnevern/innrapportering");
}

export function kjorInnrapportering(rapportdato?: string): Promise<{ id: string; status: string }> {
  return requestJson("/api/barnevern/innrapportering/kjor", jsonInit("POST", rapportdato ? { rapportdato } : {}));
}

export function getHalvaarsrapport(aar: number, halvaar: 1 | 2): Promise<any> {
  return requestJson(`/api/barnevern/rapportering/halvaar?aar=${aar}&halvaar=${halvaar}`);
}

// ── NØKKELTALL (KPI) ─────────────────────────────────────────────────────────

export type Kpi = {
  id: string;
  navn: string;
  beskrivelse: string;
  kilde: string;
  formel: string;
  eier: string;
  frekvens: string;
  enhet: "antall" | "prosent" | "dager";
  verdi: number | null;
  forrigeVerdi: number | null;
  serie: number[] | null;
};

export function listKpi(): Promise<{ generert: string; kpier: Kpi[] }> {
  return requestJson("/api/barnevern/kpi");
}

// ── JOURNAL ──────────────────────────────────────────────────────────────────

export function listJournal(sakId: string): Promise<JournalEntry[]> {
  return requestJson(`/api/barnevern/saker/${sakId}/journal`);
}

export function opprettJournal(sakId: string, input: {
  kategori: string;
  innhold: string;
  correctsEntryId?: string;
}): Promise<JournalEntry> {
  return requestJson(`/api/barnevern/saker/${sakId}/journal`, jsonInit("POST", input));
}

export async function lastOppJournalVedlegg(sakId: string, entryId: string, file: File): Promise<{ id: string; originalName: string }> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(`/api/barnevern/saker/${sakId}/journal/${entryId}/vedlegg`, {
    method: "POST",
    credentials: "include",
    body: form,
  });
  const body = await response.json().catch(() => null) as any;
  if (!response.ok) {
    throw new BarnevernApiError(
      typeof body?.error === "string" ? body.error : "Kunne ikke laste opp vedlegget",
      response.status,
    );
  }
  return body;
}

// ── Tilgang: revisorlogg, delegasjoner, break-glass (krav 15) ────────────

export type TilgangsloggRad = {
  id: string;
  userId: string;
  handling: string;
  objektType: string;
  objektId: string;
  detaljer: Record<string, unknown> | null;
  createdAt: string;
};

export function listTilgangslogg(filter: { objektType?: string; userId?: string } = {}): Promise<TilgangsloggRad[]> {
  const params = new URLSearchParams();
  if (filter.objektType) params.set("objektType", filter.objektType);
  if (filter.userId) params.set("userId", filter.userId);
  const qs = params.toString();
  return requestJson(`/api/barnevern/tilgangslogg${qs ? `?${qs}` : ""}`);
}

export type Delegasjon = {
  id: string;
  type: "delegasjon" | "break_glass";
  fraUserId: string | null;
  tilUserId: string;
  sakId: string | null;
  begrunnelse: string;
  fraDato: string;
  tilDato: string;
  opprettetAv: string;
  opphevetAv: string | null;
  opphevetAt: string | null;
  createdAt: string;
};

export function listDelegasjoner(): Promise<Delegasjon[]> {
  return requestJson("/api/barnevern/delegasjoner");
}

export function opprettDelegasjon(input: { fraUserId: string; tilUserId: string; tilDato: string; begrunnelse: string }): Promise<Delegasjon> {
  return requestJson("/api/barnevern/delegasjoner", jsonInit("POST", input));
}

export function opphevDelegasjon(id: string): Promise<Delegasjon> {
  return requestJson(`/api/barnevern/delegasjoner/${id}/opphev`, jsonInit("POST", {}));
}

export type KommuneBruker = {
  id: string;
  email: string;
  navn: string | null;
  rolle: string;
  rolleLabel: string;
};

export function listKommuneBrukere(): Promise<KommuneBruker[]> {
  return requestJson("/api/kommune/brukere");
}
