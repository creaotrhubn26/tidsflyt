/**
 * API-klient for turnus/vakanser: avdelinger, ansatte, vaktkoder,
 * regler, ønsker, prioritering, planer, behov, og vaktlinjer.
 */

export class TurnusApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "include", ...init });
  const body = await response.json().catch(() => null) as { error?: unknown } | null;
  if (!response.ok) {
    throw new TurnusApiError(
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

// ── AVDELINGER ───────────────────────────────────────────────────────────────

export function listAvdelinger(): Promise<any[]> {
  return requestJson("/api/turnus/avdelinger");
}

export function opprettAvdeling(input: {
  navn: string;
  parentId?: number;
}): Promise<any> {
  return requestJson("/api/turnus/avdelinger", jsonInit("POST", input));
}

// ── ANSATTE ──────────────────────────────────────────────────────────────────

export function listAnsatte(): Promise<any[]> {
  return requestJson("/api/turnus/ansatte");
}

export function opprettAnsatt(input: {
  navn: string;
  primarAvdelingId?: number;
  userEmail?: string;
  telefon?: string;
}): Promise<any> {
  return requestJson("/api/turnus/ansatte", jsonInit("POST", input));
}

// ── VAKTKODER ────────────────────────────────────────────────────────────────

export function listVaktkoder(): Promise<any[]> {
  return requestJson("/api/turnus/vaktkoder");
}

export function opprettVaktkode(input: {
  kode: string;
  navn?: string;
  startTid?: string;
  sluttTid?: string;
  varighetTimer?: number;
  type?: string;
  tellerSomArbeid?: boolean;
  farge?: string;
}): Promise<any> {
  return requestJson("/api/turnus/vaktkoder", jsonInit("POST", input));
}

// ── REGLER ───────────────────────────────────────────────────────────────────

export function listRegler(): Promise<any[]> {
  return requestJson("/api/turnus/regler");
}

export function opprettRegel(input: {
  regeltype: string;
  avdelingId?: number;
  ansattId?: number;
  haard?: boolean;
  parametre?: Record<string, unknown>;
}): Promise<any> {
  return requestJson("/api/turnus/regler", jsonInit("POST", input));
}

export function slettRegel(id: string): Promise<{ ok: boolean }> {
  return requestJson(`/api/turnus/regler/${id}`, jsonInit("DELETE", undefined));
}

// ── ØNSKER ───────────────────────────────────────────────────────────────────

export function listOnsker(): Promise<any[]> {
  return requestJson("/api/turnus/onsker");
}

export function opprettOnske(input: {
  ansattId: number;
  type: string;
  vaktkodeId?: number;
  planId?: number;
}): Promise<any> {
  return requestJson("/api/turnus/onsker", jsonInit("POST", input));
}

// ── PRIORITERING ─────────────────────────────────────────────────────────────

export function getPrioritering(): Promise<any> {
  return requestJson("/api/turnus/prioritering");
}

export function lagrePrioritering(input: {
  planId?: number;
  vektOnsker?: number;
  vektHelgefrekvens?: number;
  vektRettferdighet?: number;
  vektKontinuitet?: number;
  vektKostnad?: number;
}): Promise<any> {
  return requestJson("/api/turnus/prioritering", jsonInit("POST", input));
}

// ── PLANER ───────────────────────────────────────────────────────────────────

export function listPlaner(): Promise<any[]> {
  return requestJson("/api/turnus/planer");
}

export function opprettPlan(input: {
  navn: string;
  avdelingId: number;
  rotasjonUker?: number;
  startDato?: string;
}): Promise<any> {
  return requestJson("/api/turnus/planer", jsonInit("POST", input));
}

export function getReadiness(planId: string | number): Promise<any> {
  return requestJson(`/api/turnus/planer/${planId}/readiness`);
}

export function listVaktlinjer(planId: string | number): Promise<any[]> {
  return requestJson(`/api/turnus/planer/${planId}/vaktlinjer`);
}

// ── BEMANNINGSBEHOV ──────────────────────────────────────────────────────────

export function getPlanBehov(planId: string | number): Promise<any[]> {
  return requestJson(`/api/turnus/planer/${planId}/behov`);
}

export function opprettBemanningsbehov(input: {
  avdelingId: number;
  vaktkodeId: number;
  ukedag?: number;
  dato?: string;
  antallKrevd?: number;
  kompetanseKravId?: number;
}): Promise<any> {
  return requestJson("/api/turnus/bemanningsbehov", jsonInit("POST", input));
}

// ── GENERERING + XAI ─────────────────────────────────────────────────────────

export function genererTurnus(planId: string | number): Promise<{
  generId: number; status: string; solverStatus: string;
  vakterSkrevet: number; avvik: number; solveTidMs: number; feilmelding: string | null;
}> {
  return requestJson(`/api/turnus/planer/${planId}/generer`, jsonInit("POST", {}));
}

export function getGenerering(id: string | number): Promise<any> {
  return requestJson(`/api/turnus/genereringer/${id}`);
}

export function getForklaring(id: string | number): Promise<{
  strukturert: { status: string; prioriteringer: Array<{ dimensjon: string; etikett: string; vekt: number }>; uoppfylte: any[]; konflikter: any[]; sammendrag: string };
  narrasjon: string;
}> {
  return requestJson(`/api/turnus/genereringer/${id}/forklaring`);
}

export interface GenerertVakt {
  id: number; ansattId: number | null; ansattNavn: string | null;
  dato: string; vaktkodeId: number; kode: string; startTid: string; sluttTid: string;
}
export function listGenereringVakter(id: string | number): Promise<GenerertVakt[]> {
  return requestJson(`/api/turnus/genereringer/${id}/vakter`);
}
export function lagreVaktEndringer(
  id: string | number,
  endringer: Array<{ vaktId: number; ansattId: number }>,
): Promise<{ oppdatert: number }> {
  return requestJson(`/api/turnus/genereringer/${id}/vakter`, jsonInit("PATCH", { endringer }));
}
export interface GenereringKontekst {
  krav: Array<{ dato: string; krevd: number }>;
  onsker: Array<{ ansattId: number; dato: string; vaktkodeId: number | null; type: string; prioritet: string }>;
}
export function getGenereringKontekst(id: string | number): Promise<GenereringKontekst> {
  return requestJson(`/api/turnus/genereringer/${id}/kontekst`);
}
export interface VarselInnstillinger { paaminnelse_min: number; epost: boolean; app: boolean; sms: boolean; aktiv: boolean }
export function getVarselInnstillinger(): Promise<VarselInnstillinger> {
  return requestJson(`/api/turnus/varsel-innstillinger`);
}
export function lagreVarselInnstillinger(input: { paaminnelseMin: number; epost: boolean; app: boolean; sms: boolean; aktiv: boolean }): Promise<VarselInnstillinger> {
  return requestJson(`/api/turnus/varsel-innstillinger`, jsonInit("PUT", input));
}

export function publiserTurnus(id: string | number, kanaler?: string[]): Promise<{ publisert: number; varslet: number; varsletApp: number; varsletSms: number; medTelefon: number; utenEpost: number; mottakere: number }> {
  return requestJson(`/api/turnus/genereringer/${id}/publiser`, jsonInit("POST", kanaler ? { kanaler } : {}));
}

export function konsekvens(endringer: Array<{
  ansattId: number; dato: string; startTid: string; sluttTid: string; pauseTimer?: number;
}>): Promise<{ brudd: any[]; harHardeBrudd: boolean }> {
  return requestJson("/api/turnus/konsekvens", jsonInit("POST", { endringer }));
}
