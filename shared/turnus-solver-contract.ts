/**
 * shared/turnus-solver-contract.ts
 *
 * Versioned JSON contract between the Node backend and the Python OR-Tools
 * CP-SAT sidecar (A1b). Both sides serialize/deserialize these shapes; bump
 * CONTRACT_VERSION on any breaking change so a mismatched sidecar is rejected
 * rather than silently misinterpreting the payload.
 *
 * The same TurnusShift shape is what server/lib/turnus-aml.ts evaluates, so a
 * generated rota, a manually edited rota, and the consequence-preview all speak
 * one vocabulary.
 */

export const CONTRACT_VERSION = 1;

/** One concrete assigned shift in a rota (no DB ids required to evaluate AML). */
export interface TurnusShift {
  ansattId: number;
  dato: string; // YYYY-MM-DD
  startTid: string; // HH:MM (24h)
  sluttTid: string; // HH:MM (24h); may be < startTid for overnight
  pauseTimer?: number; // paid/unpaid break subtracted from worked hours
  vaktkodeId?: number | null;
}

/** A single coverage requirement the solver must satisfy (hard). */
export interface DekningsKrav {
  avdelingId: number;
  dato: string; // YYYY-MM-DD
  vaktkodeId: number;
  antallKrevd: number;
  kompetanseKravId?: number | null;
}

/** An employee available to the solver. */
export interface SolverAnsatt {
  ansattId: number;
  stillingsprosent: number;
  kompetanser: number[];
  primarAvdelingId?: number | null;
}

/** Objective weights (mirrors tidum_turnus_prioriteringsprofil). */
export interface PrioriteringsVekter {
  vektOnsker: number;
  vektHelgefrekvens: number;
  vektRettferdighet: number;
  vektKontinuitet: number;
  vektKostnad: number;
}

/** A soft preference the solver optimizes toward (not a hard constraint). */
export interface OnskeInput {
  ansattId: number;
  dato: string;
  vaktkodeId?: number | null;
  type: string; // onske_vakt | onske_fri | ...
  prioritet: 'maa' | 'bor' | 'kan';
}

export interface SolverRequest {
  contractVersion: number;
  planId: number;
  orgId: number;
  rotasjonUker: number;
  startDato: string; // YYYY-MM-DD
  ansatte: SolverAnsatt[];
  vaktkoder: Array<{ vaktkodeId: number; startTid: string; sluttTid: string; varighetTimer?: number | null; tellerSomArbeid: boolean }>;
  dekningskrav: DekningsKrav[];
  onsker: OnskeInput[];
  vekter: PrioriteringsVekter;
  /** Shifts the planner has locked; the solver must keep these exactly. */
  laasteVakter: TurnusShift[];
  /** Solver wall-clock budget; the sidecar returns its best feasible solution. */
  maxSekunder?: number;
}

/** Which hard constraint bound at the optimum, for XAI. */
export interface BindendeConstraint {
  type: 'dekning' | 'kompetanse' | 'aml' | 'laast';
  referanse: string; // e.g. "dekning:avd=3:2026-01-05:vaktkode=1"
  forklaring: string;
}

/** A soft goal the solver could not fully satisfy, for XAI. */
export interface UoppfyltMaal {
  type: 'onske' | 'helgefrekvens' | 'rettferdighet' | 'kontinuitet' | 'kostnad';
  referanse: string;
  avvik: number; // how far from ideal (unitless per-dimension)
  forklaring: string;
}

export type SolverStatus = 'optimal' | 'feasible' | 'infeasible' | 'error';

export interface SolverResponse {
  contractVersion: number;
  status: SolverStatus;
  /** Present when status is optimal|feasible. */
  vakter: TurnusShift[];
  /** Hard constraints that bound the result (XAI "why"). */
  bindende: BindendeConstraint[];
  /** Soft goals left unmet, with magnitude (XAI "what we couldn't do"). */
  uoppfylte: UoppfyltMaal[];
  /** Objective value broken down per priority dimension (XAI "how we weighed"). */
  objektiv: Partial<Record<UoppfyltMaal['type'], number>>;
  /** On infeasible: the minimal conflicting hard-constraint set, if the solver produced one. */
  konfliktsett?: BindendeConstraint[];
  solveTidMs: number;
  solverVersjon: string;
  feilmelding?: string;
}
