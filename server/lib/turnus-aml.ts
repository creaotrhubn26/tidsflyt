/**
 * server/lib/turnus-aml.ts
 *
 * Pure, in-memory evaluation of a WHOLE rota against the Working Environment
 * Act (Arbeidsmiljøloven kap. 10). Unlike validateShift() in arbeidstidsloven.ts
 * (which is DB-backed for the SmartTiming timesheet domain), this takes an
 * explicit array of shifts and does NO IO — so the CP-SAT sidecar's output,
 * a manually edited rota, and the override consequence-preview all use one
 * evaluator.
 *
 * Hard rules (severity 'error' — a generated turnus must never violate these):
 *   - §10-6: max 13 t worked in a day (absolute daily ceiling)
 *   - §10-8: min 11 t continuous rest between consecutive shifts
 *   - §10-6: max 48 t worked in an ISO week (incl. overtime, averaged ceiling)
 * Soft rules (severity 'warning' — surfaced, not blocking):
 *   - §10-4: 9 t/day, 40 t/week alminnelig arbeidstid
 *   - §10-9: pause requirement over 5,5 t / 8 t
 *   - §10-8: 35 t continuous weekly rest (see ceiling note below)
 *
 * Reuses shiftHours() from arbeidstidsloven.ts so the hour arithmetic
 * (overnight-safe, break-subtracting) is defined in exactly one place.
 */

import { shiftHours } from './arbeidstidsloven';
import type { TurnusShift } from '@shared/turnus-solver-contract';

export type TurnusAmlCode =
  | 'max_daily_over_13h'
  | 'max_daily_over_9h'
  | 'insufficient_rest_11h'
  | 'weekly_over_48h'
  | 'weekly_over_40h'
  | 'weekly_rest_under_35h'
  | 'missing_break_over_5_5h'
  | 'missing_break_over_8h';

export interface TurnusAmlBrudd {
  code: TurnusAmlCode;
  severity: 'error' | 'warning';
  ansattId: number;
  dato: string;
  message: string;
  details?: Record<string, unknown>;
}

/** Absolute instant (ms) for a shift's start, overnight-aware for its end. */
function shiftBounds(s: TurnusShift): { start: Date; end: Date } {
  const start = new Date(`${s.dato}T${s.startTid.slice(0, 5)}:00`);
  const end = new Date(`${s.dato}T${s.sluttTid.slice(0, 5)}:00`);
  if (end.getTime() <= start.getTime()) {
    // overnight: ends next day
    end.setDate(end.getDate() + 1);
  }
  return { start, end };
}

/** ISO-week key (YYYY-Www) so weekly aggregates group Mon–Sun. */
function isoWeekKey(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  const day = d.getDay() || 7;
  d.setDate(d.getDate() + 4 - day); // Thursday of this week
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

/**
 * Evaluate every employee's shifts. Returns all violations found; caller
 * decides how to act (solver rejects any 'error'; consequence-preview surfaces
 * both). Shifts for different employees never interact.
 */
export function evaluateTurnusAml(shifts: TurnusShift[]): TurnusAmlBrudd[] {
  const brudd: TurnusAmlBrudd[] = [];

  // Group per employee.
  const perAnsatt = new Map<number, TurnusShift[]>();
  for (const s of shifts) {
    const arr = perAnsatt.get(s.ansattId) ?? [];
    arr.push(s);
    perAnsatt.set(s.ansattId, arr);
  }

  for (const [ansattId, egne] of perAnsatt) {
    // Sort chronologically by actual start instant.
    const sorted = [...egne].sort(
      (a, b) => shiftBounds(a).start.getTime() - shiftBounds(b).start.getTime(),
    );

    // Per-shift: daily length + pause.
    for (const s of sorted) {
      const t = shiftHours(s.startTid, s.sluttTid, s.pauseTimer ?? 0);
      if (t > 13) {
        brudd.push({
          code: 'max_daily_over_13h', severity: 'error', ansattId, dato: s.dato,
          message: `Vakt på ${t.toFixed(1)} t overstiger AML §10-6 absolutt dagsgrense på 13 t.`,
          details: { hours: round1(t) },
        });
      } else if (t > 9) {
        brudd.push({
          code: 'max_daily_over_9h', severity: 'warning', ansattId, dato: s.dato,
          message: `Vakt på ${t.toFixed(1)} t over alminnelig 9 t/dag (§10-4).`,
          details: { hours: round1(t) },
        });
      }
      const pause = Number(s.pauseTimer ?? 0) || 0;
      if (t > 8 && pause < 0.5) {
        brudd.push({
          code: 'missing_break_over_8h', severity: 'warning', ansattId, dato: s.dato,
          message: `Vakt over 8 t krever minst 30 min pause (§10-9); registrert ${Math.round(pause * 60)} min.`,
          details: { breakMinutes: Math.round(pause * 60) },
        });
      } else if (t > 5.5 && pause <= 0) {
        brudd.push({
          code: 'missing_break_over_5_5h', severity: 'warning', ansattId, dato: s.dato,
          message: `Vakt over 5,5 t krever minst én pause (§10-9).`,
        });
      }
    }

    // Consecutive-shift rest (§10-8, 11 t) — hard.
    for (let i = 1; i < sorted.length; i++) {
      const prevEnd = shiftBounds(sorted[i - 1]).end;
      const currStart = shiftBounds(sorted[i]).start;
      const restH = (currStart.getTime() - prevEnd.getTime()) / 3_600_000;
      if (restH >= 0 && restH < 11) {
        brudd.push({
          code: 'insufficient_rest_11h', severity: 'error', ansattId, dato: sorted[i].dato,
          message: `Kun ${restH.toFixed(1)} t hvile fra forrige vakts slutt; AML §10-8 krever 11 t sammenhengende døgnhvile.`,
          details: { restHours: round1(restH) },
        });
      }
    }

    // Weekly worked totals (ISO week) — 48 t hard, 40 t soft.
    const perWeek = new Map<string, { hours: number; firstDato: string }>();
    for (const s of sorted) {
      const key = isoWeekKey(s.dato);
      const cur = perWeek.get(key) ?? { hours: 0, firstDato: s.dato };
      cur.hours += shiftHours(s.startTid, s.sluttTid, s.pauseTimer ?? 0);
      perWeek.set(key, cur);
    }
    for (const [, w] of perWeek) {
      if (w.hours > 48) {
        brudd.push({
          code: 'weekly_over_48h', severity: 'error', ansattId, dato: w.firstDato,
          message: `Ukens arbeidstid ${w.hours.toFixed(1)} t overstiger 48 t (§10-6).`,
          details: { weeklyHours: round1(w.hours) },
        });
      } else if (w.hours > 40) {
        brudd.push({
          code: 'weekly_over_40h', severity: 'warning', ansattId, dato: w.firstDato,
          message: `Ukens arbeidstid ${w.hours.toFixed(1)} t over alminnelig 40 t (§10-4).`,
          details: { weeklyHours: round1(w.hours) },
        });
      }
    }

    // Weekly continuous rest (§10-8, 35 t).
    // ponytail: approximated as "largest gap between consecutive shifts within
    // the week must be >= 35h" — good for dense rota lines; upgrade to a rolling
    // 7-day-window scan if a line ever has a single shift per week (then the
    // gap-based check can't see the surrounding rest). Marked warning, not hard.
    const weekGaps = new Map<string, number>();
    for (let i = 1; i < sorted.length; i++) {
      const prevEnd = shiftBounds(sorted[i - 1]).end;
      const currStart = shiftBounds(sorted[i]).start;
      const gapH = (currStart.getTime() - prevEnd.getTime()) / 3_600_000;
      const key = isoWeekKey(sorted[i].dato);
      weekGaps.set(key, Math.max(weekGaps.get(key) ?? 0, gapH));
    }
    for (const [key, w] of perWeek) {
      // Only meaningful when the week has >1 shift (a gap exists to measure).
      const count = sorted.filter((s) => isoWeekKey(s.dato) === key).length;
      if (count > 1) {
        const maxGap = weekGaps.get(key) ?? 0;
        if (maxGap < 35) {
          brudd.push({
            code: 'weekly_rest_under_35h', severity: 'warning', ansattId, dato: w.firstDato,
            message: `Uken mangler 35 t sammenhengende ukehvile (§10-8); største hvileperiode ${maxGap.toFixed(1)} t.`,
            details: { maxRestHours: round1(maxGap) },
          });
        }
      }
    }
  }

  return brudd;
}

/** Convenience: only the blocking (hard) violations a generated turnus must avoid. */
export function harteBrudd(shifts: TurnusShift[]): TurnusAmlBrudd[] {
  return evaluateTurnusAml(shifts).filter((b) => b.severity === 'error');
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
