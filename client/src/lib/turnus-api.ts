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
}): Promise<any> {
  return requestJson("/api/turnus/planer", jsonInit("POST", input));
}

export function getReadiness(planId: string): Promise<any> {
  return requestJson(`/api/turnus/planer/${planId}/readiness`);
}

export function listVaktlinjer(planId: string): Promise<any[]> {
  return requestJson(`/api/turnus/planer/${planId}/vaktlinjer`);
}
