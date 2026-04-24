/**
 * server/routes/holidays-routes.ts
 *
 * Norwegian public holidays (nb-NO) for a given year. Computed deterministically
 * from fixed dates + Gauss's Easter algorithm — no DB, no external call.
 *
 * Endpoints:
 *   GET /api/holidays?year=YYYY — list for one year
 *   GET /api/holidays/range?from=YYYY-MM-DD&to=YYYY-MM-DD — filtered list across years
 */

import type { Express, Request, Response } from 'express';

export interface Holiday {
  date: string;      // YYYY-MM-DD
  name: string;      // nb-NO
  slug: string;      // stable identifier
  fixed: boolean;    // true for fixed-date holidays, false for Easter-based
}

/** Gauss's Easter algorithm — returns Gregorian date of Easter Sunday. */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=March, 4=April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** All nb-NO public holidays ("offentlige høytidsdager") for the given year. */
export function norwegianHolidays(year: number): Holiday[] {
  const easter = easterSunday(year);

  const fixed: Array<[string, string, string]> = [
    [`${year}-01-01`, 'Første nyttårsdag', 'nyttar'],
    [`${year}-05-01`, 'Offentlig høytidsdag (Arbeidernes dag)', 'arbeidernes-dag'],
    [`${year}-05-17`, 'Grunnlovsdagen', 'grunnlovsdagen'],
    [`${year}-12-25`, 'Første juledag', 'forste-juledag'],
    [`${year}-12-26`, 'Andre juledag', 'andre-juledag'],
  ];

  const easterBased: Array<[Date, string, string]> = [
    [addDays(easter, -3), 'Skjærtorsdag', 'skjaertorsdag'],
    [addDays(easter, -2), 'Langfredag', 'langfredag'],
    [addDays(easter, 0),  'Første påskedag', 'forste-paaskedag'],
    [addDays(easter, 1),  'Andre påskedag', 'andre-paaskedag'],
    [addDays(easter, 39), 'Kristi himmelfartsdag', 'kristi-himmelfart'],
    [addDays(easter, 49), 'Første pinsedag', 'forste-pinsedag'],
    [addDays(easter, 50), 'Andre pinsedag', 'andre-pinsedag'],
  ];

  const all: Holiday[] = [
    ...fixed.map(([date, name, slug]) => ({ date, name, slug, fixed: true })),
    ...easterBased.map(([d, name, slug]) => ({ date: isoDate(d), name, slug, fixed: false })),
  ];

  all.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return all;
}

/** All nb-NO holidays that fall within [from, to] inclusive (ISO dates). */
export function norwegianHolidaysInRange(fromIso: string, toIso: string): Holiday[] {
  const fromYear = Number(fromIso.slice(0, 4));
  const toYear = Number(toIso.slice(0, 4));
  if (!Number.isFinite(fromYear) || !Number.isFinite(toYear) || fromYear > toYear) return [];
  const out: Holiday[] = [];
  for (let y = fromYear; y <= toYear; y++) {
    for (const h of norwegianHolidays(y)) {
      if (h.date >= fromIso && h.date <= toIso) out.push(h);
    }
  }
  return out;
}

export function registerHolidaysRoutes(app: Express) {
  app.get('/api/holidays', (req: Request, res: Response) => {
    try {
      const year = Number(req.query.year ?? new Date().getFullYear());
      if (!Number.isInteger(year) || year < 1583 || year > 2999) {
        return res.status(400).json({ error: 'year må være et heltall mellom 1583 og 2999' });
      }
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.json({ year, holidays: norwegianHolidays(year) });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/holidays/range', (req: Request, res: Response) => {
    try {
      const from = String(req.query.from ?? '');
      const to = String(req.query.to ?? '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
        return res.status(400).json({ error: 'from og to må være YYYY-MM-DD' });
      }
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.json({ from, to, holidays: norwegianHolidaysInRange(from, to) });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}
