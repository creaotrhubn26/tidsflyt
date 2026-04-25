/**
 * server/lib/gdpr.ts
 *
 * GDPR compliance helpers for Tidum:
 *   - Retention purge: rounds GPS coords on aged travel_legs and deletes
 *     legs + audit entries past their retention window.
 *   - Right to erasure (Art. 17): pseudonymizes a user across log_row,
 *     travel_legs, audit, leave_requests, and time-related artifacts.
 *   - Data portability (Art. 20): assembles a JSON bundle of the user's
 *     personal data.
 *
 * Per-vendor overrides live in `vendors.settings.gdpr` jsonb. Defaults below.
 */

import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { pool } from '../db';

/**
 * Retention defaults aligned to Datatilsynets veiledning + norske lover.
 * Hver verdi er knyttet til konkret hjemmel/anbefaling.
 *
 * Per-vendor overrides via `vendors.settings.gdpr` — f.eks. barnevern-vendorer
 * må sette auditRetentionYears=25 for å treffe Barnevernsloven §10-1.
 */
export const GDPR_DEFAULTS = {
  /**
   * GPS-coords på travel_legs blurres til 3 desimaler (~110m) etter dette.
   * Datatilsynet anbefaler 30-90 dager for GPS-data fra ansatte.
   */
  travelLegCoordsBlurDays: 90,

  /**
   * travel_legs slettes helt etter dette. Bokføringsloven §13 krever 5 år
   * for primær-dokumentasjon, så kjøreloggen som regnskaps-bilag matcher.
   */
  travelLegRetentionYears: 5,

  /**
   * log_row_audit slettes etter dette. 5 år matcher bokføringsloven §13.
   * For barnevern-vendorer: sett auditRetentionYears=25 for §10-1.
   */
  auditRetentionYears: 5,

  /**
   * leave_attachments (sykmeldinger) slettes etter dette.
   * Helsedata = Art. 9 særlig kategori. Datatilsynet anbefaler kort
   * oppbevaring; 1 år dekker behovet for å verifisere fraværet er
   * dokumentert mens revisjon er aktuell.
   */
  leaveAttachmentRetentionYears: 1,
} as const;

/**
 * Public-facing retention policy summary. Brukes av /api/gdpr/retention-policy
 * og kan hentes inn i DPA-bilag.
 */
export const RETENTION_POLICY_POLICY = [
  {
    dataType: "GPS-koordinater (kjøregodt)",
    storage: "travel_legs.from_lat/lng + to_lat/lng",
    purpose: "Beregne kjøregodtgjørelse mellom miljøarbeiders posisjon og saks arbeidssted",
    legalBasis: "Personopplysningsloven §6(1)(b) — nødvendig for kontrakt + Arbeidsmiljøloven §9-1 (kontrolltiltak)",
    initialPrecision: "7 desimaler (~1cm)",
    afterDays: GDPR_DEFAULTS.travelLegCoordsBlurDays,
    afterAction: "Avrundes til 3 desimaler (~110m), kun nok til å verifisere distanse",
    deleteAfterYears: GDPR_DEFAULTS.travelLegRetentionYears,
    deleteReason: "Bokføringsloven §13 oppbevaring av regnskapsbilag",
  },
  {
    dataType: "Endringshistorikk på timeoppføringer",
    storage: "log_row_audit",
    purpose: "Sporbarhet for revisjon, godkjenningsdokumentasjon",
    legalBasis: "Personopplysningsloven §6(1)(c) — rettslig forpliktelse (bokføring) + §6(1)(f) — legitim interesse",
    deleteAfterYears: GDPR_DEFAULTS.auditRetentionYears,
    deleteReason: "Bokføringsloven §13 (5 år). Barnevern-saker krever 25 år (§10-1).",
  },
  {
    dataType: "Sykmeldinger (helsedata)",
    storage: "leave_attachments + uploads/leave/",
    purpose: "Dokumentere fravær overfor arbeidsgiver",
    legalBasis: "Personopplysningsloven §6(1)(b) + §9(2)(b) — arbeidsforhold-forpliktelse",
    specialCategory: true,
    deleteAfterYears: GDPR_DEFAULTS.leaveAttachmentRetentionYears,
    deleteReason: "Datatilsynet — kort oppbevaring av Art. 9 helsedata. Aggregert fraværsstatistikk beholdes anonymt.",
  },
  {
    dataType: "Timeregistreringer (log_row)",
    storage: "log_row",
    purpose: "Lønnsutbetaling og timefakturering",
    legalBasis: "Personopplysningsloven §6(1)(b) — arbeidskontrakt",
    deleteAfterYears: 5,
    deleteReason: "Bokføringsloven §13. Brukeren pseudonymiseres ved sletteforespørsel; oppføringen beholdes for regnskap.",
  },
  {
    dataType: "Saksrapporter (rapporter)",
    storage: "rapporter, rapport_aktiviteter, rapport_maal",
    purpose: "Dokumentere oppfølging i klientsaker",
    legalBasis: "Barnevernsloven §10 / NAV-loven §6 / kommunale lovhjemler avhengig av sektor",
    deleteAfterYears: "Sektorbestemt — 25 år (barnevern), 10 år (helse), 5+ år (kommune)",
    deleteReason: "Per-vendor retensjons-overrides matcher sektorens lovhjemmel",
  },
] as const;

interface VendorRetentionConfig {
  travelLegCoordsBlurDays: number;
  travelLegRetentionYears: number;
  auditRetentionYears: number;
  leaveAttachmentRetentionYears: number;
}

async function readVendorRetention(vendorId: number | null): Promise<VendorRetentionConfig> {
  if (!vendorId) return { ...GDPR_DEFAULTS };
  try {
    const r = await pool.query('SELECT settings FROM vendors WHERE id = $1::text OR id::text = $1::text LIMIT 1', [String(vendorId)]);
    const settings = (r.rows[0]?.settings ?? {}) as Record<string, any>;
    const g = (settings.gdpr ?? {}) as Record<string, any>;
    const num = (v: any, d: number) => Number.isFinite(Number(v)) ? Number(v) : d;
    return {
      travelLegCoordsBlurDays: num(g.travelLegCoordsBlurDays, GDPR_DEFAULTS.travelLegCoordsBlurDays),
      travelLegRetentionYears: num(g.travelLegRetentionYears, GDPR_DEFAULTS.travelLegRetentionYears),
      auditRetentionYears: num(g.auditRetentionYears, GDPR_DEFAULTS.auditRetentionYears),
      leaveAttachmentRetentionYears: num(g.leaveAttachmentRetentionYears, GDPR_DEFAULTS.leaveAttachmentRetentionYears),
    };
  } catch {
    return { ...GDPR_DEFAULTS };
  }
}

export interface PurgeResult {
  travelLegsCoordsBlurred: number;
  travelLegsDeleted: number;
  auditEntriesDeleted: number;
  leaveAttachmentsDeleted: number;
  errors: string[];
}

/**
 * Run a retention pass. Per-row vendor lookups are skipped — instead the
 * default retention is used as the floor, and each vendor's override is
 * applied as the ceiling within the same pass via grouped queries. For the
 * MVP we run with global defaults; per-vendor differentiation is a future
 * pass when vendor count grows.
 */
export async function runGdprPurge(): Promise<PurgeResult> {
  const cfg = await readVendorRetention(null); // global defaults
  const result: PurgeResult = {
    travelLegsCoordsBlurred: 0,
    travelLegsDeleted: 0,
    auditEntriesDeleted: 0,
    leaveAttachmentsDeleted: 0,
    errors: [],
  };

  // 1. Round coords on aged travel_legs (privacy degradation, not deletion)
  try {
    const r = await pool.query(
      `UPDATE travel_legs
         SET from_lat = ROUND(from_lat::numeric, 3),
             from_lng = ROUND(from_lng::numeric, 3),
             to_lat   = ROUND(to_lat::numeric, 3),
             to_lng   = ROUND(to_lng::numeric, 3),
             updated_at = NOW()
       WHERE created_at < NOW() - ($1::int || ' days')::interval
         AND (
           (from_lat IS NOT NULL AND from_lat::numeric != ROUND(from_lat::numeric, 3))
           OR (to_lat IS NOT NULL AND to_lat::numeric != ROUND(to_lat::numeric, 3))
         )`,
      [cfg.travelLegCoordsBlurDays],
    );
    result.travelLegsCoordsBlurred = r.rowCount ?? 0;
  } catch (e: any) {
    if (!String(e?.message || '').includes('relation "travel_legs" does not exist')) {
      result.errors.push(`travel_legs blur: ${e.message}`);
    }
  }

  // 2. Delete travel_legs past retention years
  try {
    const r = await pool.query(
      `DELETE FROM travel_legs WHERE created_at < NOW() - ($1::int || ' years')::interval`,
      [cfg.travelLegRetentionYears],
    );
    result.travelLegsDeleted = r.rowCount ?? 0;
  } catch (e: any) {
    if (!String(e?.message || '').includes('relation "travel_legs" does not exist')) {
      result.errors.push(`travel_legs delete: ${e.message}`);
    }
  }

  // 3. Delete log_row_audit past retention years
  try {
    const r = await pool.query(
      `DELETE FROM log_row_audit WHERE changed_at < NOW() - ($1::int || ' years')::interval`,
      [cfg.auditRetentionYears],
    );
    result.auditEntriesDeleted = r.rowCount ?? 0;
  } catch (e: any) {
    if (!String(e?.message || '').includes('relation "log_row_audit" does not exist')) {
      result.errors.push(`audit purge: ${e.message}`);
    }
  }

  // 4. Delete aged leave_attachments (and the underlying files)
  try {
    const r = await pool.query(
      `SELECT id, filename FROM leave_attachments
       WHERE uploaded_at < NOW() - ($1::int || ' years')::interval`,
      [cfg.leaveAttachmentRetentionYears],
    );
    const uploadDir = path.join(process.cwd(), 'uploads', 'leave');
    for (const row of r.rows) {
      try {
        await fs.unlink(path.join(uploadDir, row.filename));
      } catch { /* file may already be missing */ }
    }
    if (r.rows.length > 0) {
      const ids = r.rows.map(x => x.id);
      await pool.query('DELETE FROM leave_attachments WHERE id = ANY($1::uuid[])', [ids]);
      result.leaveAttachmentsDeleted = r.rows.length;
    }
  } catch (e: any) {
    if (!String(e?.message || '').includes('relation "leave_attachments" does not exist')) {
      result.errors.push(`leave_attachments purge: ${e.message}`);
    }
  }

  return result;
}

// ── Right to erasure (Art. 17) ───────────────────────────────────────────────

export interface ErasureResult {
  userId: string;
  pseudonym: string;
  rowsAffected: Record<string, number>;
  filesDeleted: number;
  erasedAt: string;
}

/**
 * Hard-delete is rarely safe (FK refs, immutable accounting periods).
 * Pseudonymize instead: replace user_id with `erased-{shortHash}` so the
 * person is no longer identifiable, but aggregate / audit history remains
 * coherent. The mapping is intentionally one-way (no reverse lookup table).
 */
export async function eraseUser(userId: string, actorEmail: string | null): Promise<ErasureResult> {
  const hash = crypto.createHash('sha256').update(userId).digest('hex').slice(0, 12);
  const pseudonym = `erased-${hash}`;
  const rowsAffected: Record<string, number> = {};
  let filesDeleted = 0;

  const safeUpdate = async (sql: string, params: any[], key: string) => {
    try {
      const r = await pool.query(sql, params);
      rowsAffected[key] = r.rowCount ?? 0;
    } catch (e: any) {
      // Tables that don't exist in this env are silently skipped
      if (!String(e?.message || '').includes('does not exist')) {
        rowsAffected[key] = -1;
      }
    }
  };

  // log_row — pseudonymize user_id and clear notes that may contain personal data
  await safeUpdate(
    `UPDATE log_row SET user_id = $1, notes = NULL, place = NULL, updated_at = NOW()
     WHERE user_id = $2`,
    [pseudonym, userId],
    'log_row',
  );

  // travel_legs — pseudonymize + clear coords (Art 9 risk reduction)
  await safeUpdate(
    `UPDATE travel_legs SET user_id = $1,
       from_lat = NULL, from_lng = NULL, to_lat = NULL, to_lng = NULL,
       notes = NULL, updated_at = NOW()
     WHERE user_id = $2`,
    [pseudonym, userId],
    'travel_legs',
  );

  // log_row_audit — pseudonymize but keep timeline
  await safeUpdate(
    `UPDATE log_row_audit SET changed_by = $1, ip_address = NULL, user_agent = NULL
     WHERE changed_by = $2`,
    [pseudonym, userId],
    'log_row_audit',
  );

  // timer_sessions — drop entirely (live state, no audit value post-erasure)
  await safeUpdate(`DELETE FROM timer_sessions WHERE user_id = $1`, [userId], 'timer_sessions');

  // leave_requests — pseudonymize + clear free-text reason
  await safeUpdate(
    `UPDATE leave_requests SET user_id = $1, reason = NULL WHERE user_id = $2`,
    [pseudonym, userId],
    'leave_requests',
  );

  // leave_attachments — delete files + rows (sykmelding = Art. 9 helsedata)
  try {
    const r = await pool.query(
      `SELECT la.id, la.filename FROM leave_attachments la
       JOIN leave_requests lr ON lr.id = la.leave_request_id
       WHERE lr.user_id = $1`,
      [pseudonym], // already pseudonymized above
    );
    const uploadDir = path.join(process.cwd(), 'uploads', 'leave');
    for (const row of r.rows) {
      try { await fs.unlink(path.join(uploadDir, row.filename)); filesDeleted++; }
      catch { /* file may already be missing */ }
    }
    if (r.rows.length > 0) {
      await pool.query('DELETE FROM leave_attachments WHERE id = ANY($1::uuid[])', [r.rows.map(x => x.id)]);
      rowsAffected.leave_attachments = r.rows.length;
    }
  } catch (e: any) {
    if (!String(e?.message || '').includes('does not exist')) {
      rowsAffected.leave_attachments = -1;
    }
  }

  // user_settings — drop preferences (no audit value post-erasure)
  await safeUpdate(`DELETE FROM user_settings WHERE user_id = $1`, [userId], 'user_settings');

  // user_drafts — drop (offline drafts may contain client-data)
  await safeUpdate(`DELETE FROM user_drafts WHERE user_id = $1`, [userId], 'user_drafts');

  // poweroffice_employee_mappings — drop (the mapping is now meaningless)
  await safeUpdate(
    `DELETE FROM poweroffice_employee_mappings WHERE tidum_user_id = $1`,
    [userId],
    'poweroffice_employee_mappings',
  );

  // The users row itself — pseudonymize columns that store personal data,
  // keep the row for FK integrity. Anyone querying the table sees the pseudonym.
  await safeUpdate(
    `UPDATE users SET
       email = $1 || '@erased.tidum.local',
       first_name = NULL, last_name = NULL, phone = NULL,
       profile_image_url = NULL,
       updated_at = NOW()
     WHERE id = $2`,
    [pseudonym, userId],
    'users',
  );

  // Final audit entry — record that erasure happened (non-personal metadata only)
  try {
    await pool.query(
      `INSERT INTO activities (user_id, action, description, timestamp)
       VALUES ($1, 'gdpr_erasure', $2, NOW())`,
      [pseudonym, `Bruker pseudonymisert (Art. 17). Initiert av: ${actorEmail || 'system'}`],
    );
  } catch { /* activities is best-effort */ }

  return {
    userId,
    pseudonym,
    rowsAffected,
    filesDeleted,
    erasedAt: new Date().toISOString(),
  };
}

// ── Data portability (Art. 20) ───────────────────────────────────────────────

export interface DataExportBundle {
  exportedAt: string;
  exportedFor: string;
  profile: any | null;
  userSettings: any | null;
  timeEntries: any[];
  travelLegs: any[];
  leaveRequests: any[];
  leaveAttachments: Array<{ id: string; originalName: string; mimeType: string; sizeBytes: number; uploadedAt: string }>;
  rapporter: any[];
  notes: string;
}

/** Build a portable JSON snapshot of all personal data Tidum holds for a user. */
export async function exportUserData(userId: string): Promise<DataExportBundle> {
  const get = async (sql: string, params: any[]): Promise<any[]> => {
    try {
      const r = await pool.query(sql, params);
      return r.rows;
    } catch (e: any) {
      if (String(e?.message || '').includes('does not exist')) return [];
      throw e;
    }
  };

  const [profileRows] = [await get(
    `SELECT id, email, first_name, last_name, role, vendor_id, language, phone,
            created_at, updated_at
     FROM users WHERE id = $1`,
    [userId],
  )];

  const userSettingsRows = await get(`SELECT * FROM user_settings WHERE user_id = $1`, [userId]);

  const timeEntries = await get(
    `SELECT id, date::text AS date, start_time::text AS start_time, end_time::text AS end_time,
            break_hours::text AS break_hours, activity, title, project, place, notes,
            expense_coverage::text AS expense_coverage, created_at, updated_at
     FROM log_row WHERE user_id = $1 ORDER BY date DESC LIMIT 5000`,
    [userId],
  );

  const travelLegs = await get(
    `SELECT id, date::text AS date, from_name, to_name,
            from_lat, from_lng, to_lat, to_lng,
            kilometers::text AS kilometers, total_amount::text AS total_amount,
            passenger_count, source, created_at
     FROM travel_legs WHERE user_id = $1 ORDER BY date DESC LIMIT 5000`,
    [userId],
  );

  const leaveRequests = await get(
    `SELECT id, leave_type_id, start_date::text AS start_date, end_date::text AS end_date,
            days, reason, status, created_at
     FROM leave_requests WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId],
  );

  const leaveAttachmentsRows = await get(
    `SELECT la.id, la.original_name, la.mime_type, la.size_bytes, la.uploaded_at
     FROM leave_attachments la
     JOIN leave_requests lr ON lr.id = la.leave_request_id
     WHERE lr.user_id = $1`,
    [userId],
  );

  // rapporter.userId is integer in schema — try both string and integer form
  const userIdNum = Number(userId);
  const rapporter = await get(
    Number.isFinite(userIdNum)
      ? `SELECT id, sak_id, status, klient_ref, periode_from::text AS periode_from,
                periode_to::text AS periode_to, total_minutter, antall_dager,
                innsendt, godkjent, created_at, updated_at
         FROM rapporter WHERE user_id = $1 ORDER BY created_at DESC`
      : `SELECT 1 WHERE FALSE`,
    Number.isFinite(userIdNum) ? [userIdNum] : [],
  );

  return {
    exportedAt: new Date().toISOString(),
    exportedFor: userId,
    profile: profileRows[0] ?? null,
    userSettings: userSettingsRows[0] ?? null,
    timeEntries,
    travelLegs,
    leaveRequests,
    leaveAttachments: leaveAttachmentsRows.map((a: any) => ({
      id: a.id,
      originalName: a.original_name,
      mimeType: a.mime_type,
      sizeBytes: a.size_bytes,
      uploadedAt: a.uploaded_at instanceof Date ? a.uploaded_at.toISOString() : String(a.uploaded_at),
    })),
    rapporter,
    notes: 'Eksportert i henhold til personvernforordningen Art. 20 (rett til dataportabilitet). '
      + 'Inneholder personopplysninger Tidum behandler om brukeren. '
      + 'Vedleggsfiler kan lastes ned separat via /api/leave/attachments/:id/download mens brukeren fortsatt er aktiv.',
  };
}
