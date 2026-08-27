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
