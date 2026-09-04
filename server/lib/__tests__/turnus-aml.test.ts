import { describe, expect, it } from 'vitest';
import { evaluateTurnusAml, harteBrudd } from '../turnus-aml';
import type { TurnusShift } from '@shared/turnus-solver-contract';

const A = 1; // ansattId

describe('evaluateTurnusAml', () => {
  it('a lawful line has no violations', () => {
    const shifts: TurnusShift[] = [
      { ansattId: A, dato: '2026-01-05', startTid: '08:00', sluttTid: '15:30', pauseTimer: 0.5 }, // Mon 7h
      { ansattId: A, dato: '2026-01-06', startTid: '08:00', sluttTid: '15:30', pauseTimer: 0.5 }, // Tue
      { ansattId: A, dato: '2026-01-08', startTid: '08:00', sluttTid: '15:30', pauseTimer: 0.5 }, // Thu
    ];
    expect(evaluateTurnusAml(shifts)).toEqual([]);
  });

  it('flags a shift over 13h as a hard error', () => {
    const shifts: TurnusShift[] = [
      { ansattId: A, dato: '2026-01-05', startTid: '06:00', sluttTid: '20:00', pauseTimer: 0.5 }, // 13.5h
    ];
    const brudd = evaluateTurnusAml(shifts);
    expect(brudd.some((b) => b.code === 'max_daily_over_13h' && b.severity === 'error')).toBe(true);
  });

  it('flags <11h rest between consecutive shifts as a hard error', () => {
    const shifts: TurnusShift[] = [
      { ansattId: A, dato: '2026-01-05', startTid: '08:00', sluttTid: '22:00', pauseTimer: 1 }, // ends 22:00 (13h)
      { ansattId: A, dato: '2026-01-06', startTid: '06:00', sluttTid: '12:00' }, // starts 06:00 → 8h rest
    ];
    const brudd = evaluateTurnusAml(shifts);
    const rest = brudd.find((b) => b.code === 'insufficient_rest_11h');
    expect(rest?.severity).toBe('error');
    expect((rest?.details as any).restHours).toBe(8);
  });

  it('overnight shift end is next-day aware (no false rest violation)', () => {
    const shifts: TurnusShift[] = [
      { ansattId: A, dato: '2026-01-05', startTid: '22:00', sluttTid: '06:00' }, // night, ends 06:00 next day
      { ansattId: A, dato: '2026-01-06', startTid: '22:00', sluttTid: '06:00' }, // next night → 16h rest
    ];
    expect(evaluateTurnusAml(shifts).some((b) => b.code === 'insufficient_rest_11h')).toBe(false);
  });

  it('flags weekly worked > 48h as a hard error', () => {
    // 6 shifts × 8.5h net in one ISO week = 51h
    const shifts: TurnusShift[] = [5, 6, 7, 8, 9, 10].map((d) => ({
      ansattId: A,
      dato: `2026-01-0${d}`.replace('010', '10'),
      startTid: '08:00',
      sluttTid: '17:00', // 9h - 0.5 break = 8.5h
      pauseTimer: 0.5,
    }));
    const brudd = evaluateTurnusAml(shifts);
    expect(brudd.some((b) => b.code === 'weekly_over_48h' && b.severity === 'error')).toBe(true);
  });

  it('separates employees (one over-limit does not implicate the other)', () => {
    const shifts: TurnusShift[] = [
      { ansattId: 1, dato: '2026-01-05', startTid: '06:00', sluttTid: '20:00', pauseTimer: 0.5 }, // 13.5h
      { ansattId: 2, dato: '2026-01-05', startTid: '08:00', sluttTid: '15:00', pauseTimer: 0.5 }, // 6.5h ok
    ];
    const brudd = evaluateTurnusAml(shifts);
    expect(brudd.every((b) => b.ansattId === 1)).toBe(true);
  });

  it('harteBrudd returns only errors', () => {
    const shifts: TurnusShift[] = [
      { ansattId: A, dato: '2026-01-05', startTid: '08:00', sluttTid: '18:00', pauseTimer: 0 }, // 10h → 9h warning + 5.5h pause warning
    ];
    const all = evaluateTurnusAml(shifts);
    expect(all.some((b) => b.severity === 'warning')).toBe(true);
    expect(harteBrudd(shifts).every((b) => b.severity === 'error')).toBe(true);
  });
});
