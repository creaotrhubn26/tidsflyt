/**
 * server/routes/tiltaksleder-rates-routes.ts
 *
 * T18 — sats-administrasjon for tiltaksleder.
 *
 *   PATCH /api/tiltaksleder/user-cases/:id/rate
 *     Body: { rateMode?, hourlyRate?, dayRate? }
 *     Tilgang: kun tiltaksleder som er satt som tiltakslederId på saken,
 *              eller hovedadmin / vendor_admin / super_admin.
 *
 *   GET /api/tiltaksleder/monthly-totals?period=YYYY-MM
 *     Returnerer aggregat per bruker × sak: timer, døgn, sats, beløp.
 *     Tilgang: tiltaksleder ser kun sine egne saker; vendor-admin ser alle.
 *
 *   GET /api/tiltaksleder/rate-suggestion?role=...
 *     Foreslår default-sats basert på rolle. Bare hint, ikke autoritativt.
 */

import type { Express, Request, Response } from 'express';
import { pool } from '../db';
import { requireAuth } from '../middleware/auth';

function currentUser(req: Request) {
  return (req as any).authUser ?? (req as any).user ?? null;
}
function userRole(req: Request): string {
  const role = String(currentUser(req)?.role || '').toLowerCase().replace(/[\s-]/g, '_');
  return role;
}
function userId(req: Request): number | null {
  const u = currentUser(req);
  const id = u?.id;
  const n = Number(id);
  return Number.isFinite(n) ? n : null;
}
function vendorId(req: Request): number | null {
  const u = currentUser(req);
  const v = u?.vendorId ?? u?.vendor_id;
  return v ? Number(v) : null;
}
function isSuperOrVendorAdmin(req: Request): boolean {
  const r = userRole(req);
  return r === 'super_admin' || r === 'vendor_admin' || r === 'hovedadmin' || r === 'admin';
}
function isTiltakslederLevel(req: Request): boolean {
  const r = userRole(req);
  return r === 'tiltaksleder' || r === 'teamleder' || r === 'case_manager' || isSuperOrVendorAdmin(req);
}

/**
 * Smart-default-satser basert på rolle. Bevisst konservative tall som
 * vendor-admin bør justere til faktiske satser ved første tildeling.
 */
const ROLE_DEFAULTS: Record<string, { hourly: number; day: number }> = {
  miljoarbeider: { hourly: 280, day: 2_400 },
  tiltaksleder:  { hourly: 450, day: 3_800 },
  teamleder:     { hourly: 420, day: 3_600 },
  case_manager:  { hourly: 480, day: 4_000 },
  vendor_admin:  { hourly: 0,   day: 0 },
};

function rateSuggestionFor(role: string): { hourly: number; day: number } {
  const key = String(role || '').toLowerCase().replace(/[\s-]/g, '_');
  return ROLE_DEFAULTS[key] ?? { hourly: 0, day: 0 };
}

async function assertSakAccess(
  req: Request,
  sakId: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const result = await pool.query(
    `SELECT id, vendor_id, tiltaksleder_id, tildelte_user_id FROM saker WHERE id = $1 LIMIT 1`,
    [sakId],
  );
  if (result.rows.length === 0) return { ok: false, status: 404, error: 'Sak finnes ikke' };
  const sak = result.rows[0];
  const callerVendor = vendorId(req);
  const callerUserId = userId(req);
  const role = userRole(req);

  if (role === 'super_admin') return { ok: true };
  if (sak.vendor_id !== callerVendor) return { ok: false, status: 403, error: 'Ikke samme vendor' };
  if (isSuperOrVendorAdmin(req)) return { ok: true };

  const tildelte = Array.isArray(sak.tildelte_user_id) ? sak.tildelte_user_id : [];
  const tildelteIds = tildelte.map((x: any) => Number(x)).filter((n: number) => Number.isFinite(n));
  const isTiltaksleder = callerUserId != null && Number(sak.tiltaksleder_id) === callerUserId;
  const isAssigned = callerUserId != null && tildelteIds.includes(callerUserId);
  if (isTiltaksleder || isAssigned) return { ok: true };
  return { ok: false, status: 403, error: 'Ikke tilgang til saken' };
}

export function registerTiltakslederRatesRoutes(app: Express) {
  /** GET /api/tiltaksleder/rate-suggestion?role=miljoarbeider */
  app.get('/api/tiltaksleder/rate-suggestion', requireAuth, (req: Request, res: Response) => {
    if (!isTiltakslederLevel(req)) return res.status(403).json({ error: 'Forbidden' });
    const role = String(req.query.role || '');
    return res.json({ role, suggestion: rateSuggestionFor(role) });
  });

  /** PATCH /api/tiltaksleder/user-cases/:id/rate */
  app.patch('/api/tiltaksleder/user-cases/:id/rate', requireAuth, async (req: Request, res: Response) => {
    try {
      if (!isTiltakslederLevel(req)) return res.status(403).json({ error: 'Forbidden' });
      const userCaseId = Number(req.params.id);
      if (!Number.isInteger(userCaseId)) return res.status(400).json({ error: 'Ugyldig user-case-id' });

      const { rateMode, hourlyRate, dayRate } = req.body ?? {};
      if (rateMode != null && rateMode !== 'hour' && rateMode !== 'day') {
        return res.status(400).json({ error: 'rateMode må være "hour" eller "day"' });
      }
      const hr = hourlyRate != null ? Number(hourlyRate) : null;
      const dr = dayRate != null ? Number(dayRate) : null;
      if (hr != null && (!Number.isFinite(hr) || hr < 0 || hr > 100_000)) {
        return res.status(400).json({ error: 'hourlyRate må være tall 0–100000' });
      }
      if (dr != null && (!Number.isFinite(dr) || dr < 0 || dr > 1_000_000)) {
        return res.status(400).json({ error: 'dayRate må være tall 0–1000000' });
      }

      // Hent user_case + saks-eier for tilgangs-kontroll
      const lookup = await pool.query(
        `SELECT uc.id, uc.case_id, uc.company_user_id, cu.vendor_id, cu.user_email,
                s.id AS sak_uuid, s.tiltaksleder_id, s.tildelte_user_id, s.vendor_id AS sak_vendor_id
         FROM user_cases uc
         LEFT JOIN company_users cu ON cu.id = uc.company_user_id
         LEFT JOIN saker s ON s.saksnummer = uc.case_id
         WHERE uc.id = $1
         LIMIT 1`,
        [userCaseId],
      );
      if (lookup.rows.length === 0) {
        return res.status(404).json({ error: 'user_case finnes ikke' });
      }
      const row = lookup.rows[0];

      const callerVendor = vendorId(req);
      const callerUserId = userId(req);
      const isOwnVendor = callerVendor != null && (row.vendor_id === callerVendor || row.sak_vendor_id === callerVendor);

      if (!isOwnVendor && !(userRole(req) === 'super_admin')) {
        return res.status(403).json({ error: 'Ikke samme vendor' });
      }

      // For tiltaksleder/teamleder/case_manager: må være tiltakslederId
      // på saken eller stå i tildelteUserId. Vendor_admin/hovedadmin/super_admin
      // har full tilgang innen vendor.
      if (!isSuperOrVendorAdmin(req)) {
        const tildelte: any[] = Array.isArray(row.tildelte_user_id) ? row.tildelte_user_id : [];
        const tildelteIds = tildelte.map((x) => Number(x)).filter((n) => Number.isFinite(n));
        const isTiltaksleder = callerUserId != null && Number(row.tiltaksleder_id) === callerUserId;
        const isAssigned = callerUserId != null && tildelteIds.includes(callerUserId);
        if (!isTiltaksleder && !isAssigned) {
          return res.status(403).json({ error: 'Du er ikke tiltaksleder eller tildelt på denne saken' });
        }
      }

      // Bygg dynamisk UPDATE basert på hva som faktisk ble sendt
      const sets: string[] = ['updated_by = $1'];
      const params: any[] = [currentUser(req)?.email ?? 'unknown'];
      let p = 2;
      if (rateMode != null) { sets.push(`rate_mode = $${p++}`); params.push(rateMode); }
      if (hr != null)       { sets.push(`hourly_rate = $${p++}`); params.push(hr); }
      if (dr != null)       { sets.push(`day_rate = $${p++}`);   params.push(dr); }
      params.push(userCaseId);

      const result = await pool.query(
        `UPDATE user_cases SET ${sets.join(', ')} WHERE id = $${p} RETURNING *`,
        params,
      );
      return res.json({ ok: true, userCase: result.rows[0] });
    } catch (err: any) {
      console.error('[tiltaksleder-rates] PATCH failed', err);
      return res.status(500).json({ error: err?.message || 'Feilet' });
    }
  });

  /**
   * GET /api/tiltaksleder/monthly-totals?period=YYYY-MM
   *
   * Aggregat: per (vendor, sak, bruker) henter vi
   *   - timer (sum av sluttid - starttid - pause)
   *   - døgn  (count distinct date)
   *   - rate  (fra user_cases — hourlyRate eller dayRate avhengig av rateMode)
   *   - beløp (rate × mengde)
   *
   * Filter:
   *   - Tiltaksleder ser kun saker hen er tiltakslederId for eller tildelt
   *   - Vendor-admin ser alle saker i sin vendor
   *   - Super_admin ser alt (ingen filter)
   */
  app.get('/api/tiltaksleder/monthly-totals', requireAuth, async (req: Request, res: Response) => {
    try {
      if (!isTiltakslederLevel(req)) return res.status(403).json({ error: 'Forbidden' });

      const period = String(req.query.period || '').match(/^(\d{4})-(\d{2})$/);
      if (!period) return res.status(400).json({ error: 'period må være YYYY-MM' });
      const [, year, month] = period;
      const periodStart = `${year}-${month}-01`;
      // Last day of month: trick — start of next month, minus 1 day handled via lt comparison
      const nextMonth = String(Number(month) % 12 + 1).padStart(2, '0');
      const nextYear = Number(month) === 12 ? String(Number(year) + 1) : year;
      const nextMonthStart = `${nextYear}-${nextMonth}-01`;

      const callerVendor = vendorId(req);
      const callerUserId = userId(req);
      const callerRole = userRole(req);

      // SQL: aggregat fra log_row joined med saker, user_cases OG sak_locations.
      // Sats-prioritet:
      //   1) Hvis log_row.sak_location_id finnes → sak_locations.rate_mode + rate
      //   2) Ellers → user_cases.rate_mode + rate
      //
      // Vi grupperer per (sak, bruker, lokasjon) for å regne korrekte beløp
      // når en bruker har timer i flere lokasjoner med ulike satser. UI
      // aggregerer videre per (sak, bruker) for visning.
      const sql = `
        WITH scoped_saker AS (
          SELECT s.id, s.saksnummer, s.tittel, s.vendor_id, s.tiltaksleder_id, s.tildelte_user_id
          FROM saker s
          WHERE
            ${callerRole === 'super_admin' ? 'TRUE' :
              callerRole === 'vendor_admin' || callerRole === 'hovedadmin' || callerRole === 'admin'
                ? 's.vendor_id = $1'
                : 's.vendor_id = $1 AND (s.tiltaksleder_id = $2 OR s.tildelte_user_id @> $3::jsonb)'}
        ),
        scoped_logs AS (
          SELECT
            lr.sak_id,
            lr.sak_location_id,
            lr.user_id AS user_id_text,
            lr.date,
            EXTRACT(EPOCH FROM (lr.end_time - lr.start_time)) / 3600.0 - COALESCE(lr.break_hours, 0)::numeric AS hours
          FROM log_row lr
          WHERE lr.sak_id IN (SELECT id FROM scoped_saker)
            AND lr.date >= $4::date
            AND lr.date <  $5::date
        ),
        per_bucket AS (
          SELECT
            ss.id          AS sak_id,
            ss.saksnummer,
            ss.tittel      AS sak_title,
            ss.vendor_id,
            cu.id          AS company_user_id,
            cu.user_email,
            uc.id          AS user_case_id,
            uc.hourly_rate AS uc_hourly,
            uc.day_rate    AS uc_day,
            uc.rate_mode   AS uc_mode,
            sl_loc.id          AS location_id,
            sl_loc.name        AS location_name,
            sl_loc.rate_mode   AS loc_mode,
            sl_loc.hourly_rate AS loc_hourly,
            sl_loc.day_rate    AS loc_day,
            COALESCE(SUM(slogs.hours), 0)::numeric  AS hours,
            COUNT(DISTINCT slogs.date)::int         AS days
          FROM scoped_saker ss
          JOIN scoped_logs slogs ON slogs.sak_id = ss.id
          LEFT JOIN company_users cu
                 ON cu.vendor_id = ss.vendor_id
                AND cu.id::text = slogs.user_id_text
          LEFT JOIN user_cases uc
                 ON uc.company_user_id = cu.id
                AND uc.case_id = ss.saksnummer
          LEFT JOIN sak_locations sl_loc
                 ON sl_loc.id = slogs.sak_location_id
          GROUP BY ss.id, ss.saksnummer, ss.tittel, ss.vendor_id, cu.id, cu.user_email,
                   uc.id, uc.hourly_rate, uc.day_rate, uc.rate_mode,
                   sl_loc.id, sl_loc.name, sl_loc.rate_mode, sl_loc.hourly_rate, sl_loc.day_rate
        )
        SELECT
          sak_id, saksnummer, sak_title, vendor_id,
          company_user_id, user_email, user_case_id,
          uc_hourly AS hourly_rate, uc_day AS day_rate, uc_mode AS rate_mode,
          location_id, location_name,
          loc_mode, loc_hourly, loc_day,
          hours, days,
          CASE
            WHEN location_id IS NOT NULL AND loc_mode = 'day'
              THEN COALESCE(loc_day, 0)::numeric * days
            WHEN location_id IS NOT NULL
              THEN COALESCE(loc_hourly, 0)::numeric * hours
            WHEN uc_mode = 'day'
              THEN COALESCE(uc_day, 0)::numeric * days
            ELSE COALESCE(uc_hourly, 0)::numeric * hours
          END :: numeric(12,2) AS amount
        FROM per_bucket
        ORDER BY sak_title ASC, user_email ASC, location_name ASC NULLS FIRST
      `;

      const params: any[] = [];
      if (callerRole === 'super_admin') {
        params.push(periodStart, nextMonthStart);
      } else if (
        callerRole === 'vendor_admin' || callerRole === 'hovedadmin' || callerRole === 'admin'
      ) {
        params.push(callerVendor, periodStart, nextMonthStart);
        // Bytt $4/$5 til $2/$3 ved å lage SQL-en på nytt med riktig nummerering
      }

      // Bygg SQL med riktig param-nummerering basert på rolle
      let finalSql: string;
      let finalParams: any[];
      if (callerRole === 'super_admin') {
        finalSql = sql.replace('$4', '$1').replace('$5', '$2');
        finalParams = [periodStart, nextMonthStart];
      } else if (
        callerRole === 'vendor_admin' || callerRole === 'hovedadmin' || callerRole === 'admin'
      ) {
        finalSql = sql.replace('$4', '$2').replace('$5', '$3');
        finalParams = [callerVendor, periodStart, nextMonthStart];
      } else {
        // tiltaksleder: $1 = vendor, $2 = userId, $3 = userId-as-jsonb-array, $4/$5 = dates
        finalSql = sql; // placeholders som de er
        finalParams = [callerVendor, callerUserId, JSON.stringify([callerUserId]), periodStart, nextMonthStart];
      }

      const result = await pool.query(finalSql, finalParams);
      const rows = result.rows.map((r) => ({
        sakId: r.sak_id,
        saksnummer: r.saksnummer,
        sakTitle: r.sak_title,
        vendorId: r.vendor_id,
        companyUserId: r.company_user_id,
        userEmail: r.user_email,
        userCaseId: r.user_case_id,
        hourlyRate: r.hourly_rate != null ? Number(r.hourly_rate) : null,
        dayRate: r.day_rate != null ? Number(r.day_rate) : null,
        rateMode: r.rate_mode || 'hour',
        locationId: r.location_id ?? null,
        locationName: r.location_name ?? null,
        locationMode: r.loc_mode ?? null,
        locationHourly: r.loc_hourly != null ? Number(r.loc_hourly) : null,
        locationDay: r.loc_day != null ? Number(r.loc_day) : null,
        hours: Number(r.hours ?? 0),
        days: Number(r.days ?? 0),
        amount: Number(r.amount ?? 0),
      }));
      const total = rows.reduce((s, r) => s + (r.amount || 0), 0);
      return res.json({ period: `${year}-${month}`, rows, total });
    } catch (err: any) {
      console.error('[tiltaksleder-rates] monthly-totals failed', err);
      return res.status(500).json({ error: err?.message || 'Feilet' });
    }
  });

  /** GET /api/saker/:sakId/locations — list locations for a sak */
  app.get('/api/saker/:sakId/locations', requireAuth, async (req: Request, res: Response) => {
    try {
      if (!isTiltakslederLevel(req)) return res.status(403).json({ error: 'Forbidden' });
      const access = await assertSakAccess(req, req.params.sakId);
      if (!access.ok) return res.status(access.status).json({ error: access.error });

      const result = await pool.query(
        `SELECT * FROM sak_locations WHERE sak_id = $1 ORDER BY active DESC, name ASC`,
        [req.params.sakId],
      );
      return res.json({ locations: result.rows });
    } catch (err: any) {
      console.error('[locations] GET failed', err);
      return res.status(500).json({ error: err?.message || 'Feilet' });
    }
  });

  /** POST /api/saker/:sakId/locations — create new location */
  app.post('/api/saker/:sakId/locations', requireAuth, async (req: Request, res: Response) => {
    try {
      if (!isTiltakslederLevel(req)) return res.status(403).json({ error: 'Forbidden' });
      const access = await assertSakAccess(req, req.params.sakId);
      if (!access.ok) return res.status(access.status).json({ error: access.error });

      const { name, address, rateMode, hourlyRate, dayRate } = req.body ?? {};
      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'name er påkrevd' });
      }
      const mode = rateMode === 'day' ? 'day' : 'hour';
      const hr = hourlyRate != null ? Number(hourlyRate) : null;
      const dr = dayRate != null ? Number(dayRate) : null;
      if (hr != null && (!Number.isFinite(hr) || hr < 0 || hr > 100_000)) {
        return res.status(400).json({ error: 'hourlyRate må være tall 0–100000' });
      }
      if (dr != null && (!Number.isFinite(dr) || dr < 0 || dr > 1_000_000)) {
        return res.status(400).json({ error: 'dayRate må være tall 0–1000000' });
      }

      const result = await pool.query(
        `INSERT INTO sak_locations (sak_id, name, address, rate_mode, hourly_rate, day_rate, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          req.params.sakId,
          name.trim().slice(0, 200),
          typeof address === 'string' ? address.trim().slice(0, 500) : null,
          mode,
          hr,
          dr,
          currentUser(req)?.email ?? null,
        ],
      );
      return res.status(201).json({ location: result.rows[0] });
    } catch (err: any) {
      console.error('[locations] POST failed', err);
      return res.status(500).json({ error: err?.message || 'Feilet' });
    }
  });

  /** PATCH /api/saker/:sakId/locations/:id — update location */
  app.patch('/api/saker/:sakId/locations/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      if (!isTiltakslederLevel(req)) return res.status(403).json({ error: 'Forbidden' });
      const access = await assertSakAccess(req, req.params.sakId);
      if (!access.ok) return res.status(access.status).json({ error: access.error });

      const { name, address, rateMode, hourlyRate, dayRate, active } = req.body ?? {};
      const sets: string[] = ['updated_at = NOW()'];
      const params: any[] = [];
      let p = 1;
      if (name != null) { sets.push(`name = $${p++}`); params.push(String(name).trim().slice(0, 200)); }
      if (address !== undefined) {
        sets.push(`address = $${p++}`);
        params.push(typeof address === 'string' ? address.trim().slice(0, 500) : null);
      }
      if (rateMode === 'hour' || rateMode === 'day') {
        sets.push(`rate_mode = $${p++}`); params.push(rateMode);
      }
      if (hourlyRate !== undefined) {
        const hr = hourlyRate != null ? Number(hourlyRate) : null;
        if (hr != null && (!Number.isFinite(hr) || hr < 0)) return res.status(400).json({ error: 'hourlyRate ugyldig' });
        sets.push(`hourly_rate = $${p++}`); params.push(hr);
      }
      if (dayRate !== undefined) {
        const dr = dayRate != null ? Number(dayRate) : null;
        if (dr != null && (!Number.isFinite(dr) || dr < 0)) return res.status(400).json({ error: 'dayRate ugyldig' });
        sets.push(`day_rate = $${p++}`); params.push(dr);
      }
      if (typeof active === 'boolean') {
        sets.push(`active = $${p++}`); params.push(active);
      }
      params.push(req.params.id, req.params.sakId);

      const result = await pool.query(
        `UPDATE sak_locations SET ${sets.join(', ')}
         WHERE id = $${p++} AND sak_id = $${p}
         RETURNING *`,
        params,
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Lokasjon finnes ikke' });
      return res.json({ location: result.rows[0] });
    } catch (err: any) {
      console.error('[locations] PATCH failed', err);
      return res.status(500).json({ error: err?.message || 'Feilet' });
    }
  });

  /** DELETE /api/saker/:sakId/locations/:id — soft-delete (active=false) */
  app.delete('/api/saker/:sakId/locations/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      if (!isTiltakslederLevel(req)) return res.status(403).json({ error: 'Forbidden' });
      const access = await assertSakAccess(req, req.params.sakId);
      if (!access.ok) return res.status(access.status).json({ error: access.error });

      const result = await pool.query(
        `UPDATE sak_locations SET active = false, updated_at = NOW()
         WHERE id = $1 AND sak_id = $2 RETURNING id`,
        [req.params.id, req.params.sakId],
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Lokasjon finnes ikke' });
      return res.json({ ok: true });
    } catch (err: any) {
      console.error('[locations] DELETE failed', err);
      return res.status(500).json({ error: err?.message || 'Feilet' });
    }
  });
}
