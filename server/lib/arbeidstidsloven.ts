/**
 * server/lib/arbeidstidsloven.ts
 *
 * Validator for time-entry inputs against the Norwegian Working Environment Act
 * (Arbeidstidsloven / Arbeidsmiljøloven kap. 10).
 *
 * Thresholds used:
 *   - Alminnelig arbeidstid (§10-4): 9 t/dag, 40 t/uke
 *   - Maks arbeidstid inkl overtid (§10-6): 48 t/uke (gjennomsnittelig),
 *     med 13 t som absolutt dagsgrense (soft cap – merarbeid må avtales)
 *   - Hviletid mellom arbeidsdager (§10-8): min 11 t sammenhengende
 *   - Pause (§10-9): arbeidstid > 5,5 t krever minst én pause, arbeidstid > 8 t
 *     bør ha minst 30 min pause.
 *
 * The validator returns two lists:
 *   - `errors` — blocking; the insert/update must not proceed unless caller is
 *     admin or explicitly passes `bypassAtl: true`.
 *   - `warnings` — informational; attached to the response body so the UI can
 *     surface a banner without blocking the flow.
 */

import { pool } from '../db';
import { ADMIN_ROLES } from '../middleware/auth';

export interface ShiftInput {
  userId: string;
  date: string;              // YYYY-MM-DD
  startTime: string;         // HH:MM[:SS]
  endTime: string;           // HH:MM[:SS]
  breakHours?: number | string | null;
  /** When updating an existing entry, pass its id so we exclude it from lookups. */
  excludeEntryId?: string | null;
}

export interface AtlIssue {
  code:
    | 'max_daily_over_9h'
    | 'max_daily_over_13h'
    | 'missing_break_over_5_5h'
    | 'missing_break_over_8h'
    | 'insufficient_rest_11h'
    | 'weekly_over_48h'
    | 'weekly_over_40h';
  severity: 'warning' | 'error';
  message: string;
  details?: Record<string, unknown>;
}

export interface AtlValidationResult {
  warnings: AtlIssue[];
  errors: AtlIssue[];
}

function parseHM(t: string): { h: number; m: number } {
  const [h = '0', m = '0'] = String(t).split(':');
  return { h: Number(h), m: Number(m) };
}

/** Net worked hours for a shift (endTime - startTime - breakHours), overnight-safe. */
export function shiftHours(startTime: string, endTime: string, breakHours: number | string | null | undefined): number {
  const s = parseHM(startTime);
  const e = parseHM(endTime);
  let mins = (e.h * 60 + e.m) - (s.h * 60 + s.m);
  if (mins < 0) mins += 24 * 60; // overnight
  const breakH = Number(breakHours ?? 0) || 0;
  return Math.max(0, mins / 60 - breakH);
}

function dateOnly(d: string | Date): string {
  if (typeof d === 'string') return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

/** ISO week start (Monday) for a given date — used for "weekly total" windows. */
function mondayOf(iso: string): Date {
  const d = new Date(iso + 'T00:00:00');
  const dow = d.getDay() || 7; // Sun=0 → 7
  d.setDate(d.getDate() - (dow - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Hours between the end of the previous shift and start of the candidate shift. */
function restHoursBetween(prevEnd: Date, currStart: Date): number {
  const mins = (currStart.getTime() - prevEnd.getTime()) / (1000 * 60);
  return mins / 60;
}

export async function validateShift(input: ShiftInput): Promise<AtlValidationResult> {
  const warnings: AtlIssue[] = [];
  const errors: AtlIssue[] = [];

  const breakH = Number(input.breakHours ?? 0) || 0;
  const hours = shiftHours(input.startTime, input.endTime, breakH);

  // 1. Daily length.
  if (hours > 13) {
    errors.push({
      code: 'max_daily_over_13h',
      severity: 'error',
      message: `Dagen har ${hours.toFixed(1)} t arbeid. Arbeidstidsloven setter 13 t som absolutt grense; be tiltakslederen registrere dette som overtid med avtale, eller dele vakten.`,
      details: { hours },
    });
  } else if (hours > 9) {
    warnings.push({
      code: 'max_daily_over_9h',
      severity: 'warning',
      message: `Dagen har ${hours.toFixed(1)} t arbeid. Alminnelig arbeidstid er 9 t/dag (§10-4). Merarbeid utover dette regnes som overtid.`,
      details: { hours },
    });
  }

  // 2. Break requirement.
  if (hours > 8 && breakH < 0.5) {
    warnings.push({
      code: 'missing_break_over_8h',
      severity: 'warning',
      message: `Ved arbeidstid over 8 t kreves minst 30 min pause. Registrert pause: ${Math.round(breakH * 60)} min.`,
      details: { hours, breakMinutes: Math.round(breakH * 60) },
    });
  } else if (hours > 5.5 && breakH <= 0) {
    warnings.push({
      code: 'missing_break_over_5_5h',
      severity: 'warning',
      message: `Arbeidstid over 5,5 t krever minst én pause (§10-9).`,
      details: { hours },
    });
  }

  // 3. Daily rest + weekly aggregates — need DB lookups.
  const lookbackStart = new Date(input.date + 'T00:00:00');
  lookbackStart.setDate(lookbackStart.getDate() - 14);
  const lookbackStartStr = dateOnly(lookbackStart);
  const lookbackEnd = input.date;

  let rows: Array<{ id: string; date: string; start_time: string; end_time: string; break_hours: string | number | null }> = [];
  try {
    const params: any[] = [input.userId, lookbackStartStr, lookbackEnd];
    let sql = `SELECT id, date::text as date, start_time::text as start_time, end_time::text as end_time, break_hours
               FROM log_row
               WHERE user_id = $1 AND date >= $2 AND date <= $3`;
    if (input.excludeEntryId) {
      params.push(input.excludeEntryId);
      sql += ` AND id <> $4`;
    }
    const result = await pool.query(sql, params);
    rows = result.rows;
  } catch (err: any) {
    // If table not available (edge case), skip DB-dependent checks — we already
    // have the daily-length + break warnings above, which is the bigger signal.
    if (String(err?.message || '').includes('relation "log_row" does not exist')) {
      return { warnings, errors };
    }
    throw err;
  }

  // 3a. Rest since the most recent prior shift (end time on any prior date).
  const candidateStart = new Date(`${input.date}T${input.startTime.slice(0, 5)}:00`);
  let latestPriorEnd: Date | null = null;
  for (const r of rows) {
    const endStr = `${r.date}T${String(r.end_time).slice(0, 5)}:00`;
    const endAt = new Date(endStr);
    if (endAt < candidateStart) {
      if (!latestPriorEnd || endAt > latestPriorEnd) latestPriorEnd = endAt;
    }
  }
  if (latestPriorEnd) {
    const rest = restHoursBetween(latestPriorEnd, candidateStart);
    if (rest < 11) {
      warnings.push({
        code: 'insufficient_rest_11h',
        severity: 'warning',
        message: `Hviletid fra forrige vakts slutt til denne vaktens start er ${rest.toFixed(1)} t. Arbeidstidsloven krever min 11 t sammenhengende døgnhvile (§10-8).`,
        details: { restHours: Math.round(rest * 10) / 10 },
      });
    }
  }

  // 3b. Weekly totals — sum of shift hours in the same ISO week.
  const weekStart = mondayOf(input.date);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  let weeklyHours = hours; // include the candidate
  for (const r of rows) {
    const d = new Date(r.date + 'T00:00:00');
    if (d < weekStart || d > weekEnd) continue;
    weeklyHours += shiftHours(String(r.start_time), String(r.end_time), Number(r.break_hours ?? 0));
  }
  if (weeklyHours > 48) {
    warnings.push({
      code: 'weekly_over_48h',
      severity: 'warning',
      message: `Ukens totale arbeidstid inkludert denne vakten blir ${weeklyHours.toFixed(1)} t. Arbeidstidsloven setter normalt 48 t/uke som grense inkl. overtid (§10-6).`,
      details: { weeklyHours: Math.round(weeklyHours * 10) / 10 },
    });
  } else if (weeklyHours > 40) {
    warnings.push({
      code: 'weekly_over_40h',
      severity: 'warning',
      message: `Ukens totale arbeidstid inkludert denne vakten blir ${weeklyHours.toFixed(1)} t. Alminnelig ukearbeidstid er 40 t (§10-4).`,
      details: { weeklyHours: Math.round(weeklyHours * 10) / 10 },
    });
  }

  return { warnings, errors };
}

export class AtlViolation extends Error {
  status = 422;
  constructor(public result: AtlValidationResult) {
    const codes = result.errors.map(e => e.code).join(', ');
    super(`Arbeidstidsloven-brudd: ${codes}`);
    this.name = 'AtlViolation';
  }
}

export interface AtlEnforceOptions extends ShiftInput {
  callerRole?: string | null;
  bypass?: boolean;
}

/**
 * Enforces errors by throwing AtlViolation. Returns the full result so the
 * caller can include warnings in its response even when no errors were raised.
 */
export async function enforceAtl(opts: AtlEnforceOptions): Promise<AtlValidationResult> {
  const result = await validateShift(opts);
  if (result.errors.length === 0) return result;

  const role = (opts.callerRole ?? '').toLowerCase().replace(/[\s-]/g, '_');
  const isAdmin = ADMIN_ROLES.includes(role);
  if (opts.bypass && isAdmin) return result; // only admins may bypass

  throw new AtlViolation(result);
}

export function handleAtlError(err: unknown, res: import('express').Response): boolean {
  if (err instanceof AtlViolation) {
    res.status(err.status).json({
      error: err.message,
      atl: err.result,
    });
    return true;
  }
  return false;
}
