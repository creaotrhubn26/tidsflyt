/**
 * server/lib/poweroffice-push.ts
 *
 * Push an approved timesheet (log_row entries for one user × one month) to
 * PowerOffice Go as HourRegistration records.
 *
 * Payload shape targets PowerOffice Go API v2:
 *   POST /HourRegistrations
 *   Body: { employeeCode, date, hours, projectCode?, description?, startTime?, endTime? }
 *
 * NOTE ON FIELD NAMES: PowerOffice Go's exact schema varies with client
 * setup (some tenants use employeeNo, others employeeId; projectCode vs
 * projectId). The mapper below is kept in one place so the field names
 * can be tuned once without touching the orchestration.
 */

import { db, pool } from '../db';
import { eq, and } from 'drizzle-orm';
import { vendorIntegrations, logRow } from '@shared/schema';
import { call, PowerOfficeApiError } from './poweroffice';
import { getMapping, ensurePowerOfficeMappingsTable } from './poweroffice-mappings';

export interface PushResult {
  month: string;
  vendorId: number;
  pushed: number;
  failed: number;
  skipped: number;
  errors: Array<{ userId: string; date?: string; reason: string }>;
}

interface HourRegistrationPayload {
  employeeCode: string;
  date: string;
  hours: number;
  startTime?: string;
  endTime?: string;
  projectCode?: string;
  description?: string;
}

function computeHours(startTime: string | null, endTime: string | null, breakHours: string | number | null): number {
  if (!startTime || !endTime) return 0;
  const [sh, sm] = String(startTime).split(':').map(Number);
  const [eh, em] = String(endTime).split(':').map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;
  const breakH = Number(breakHours ?? 0) || 0;
  return Math.max(0, Math.round((mins / 60 - breakH) * 100) / 100);
}

function toHourRegistration(
  row: { date: string; start_time: string | null; end_time: string | null; break_hours: string | null; project: string | null; title: string | null; activity: string | null; notes: string | null },
  employeeCode: string,
): HourRegistrationPayload {
  const hours = computeHours(row.start_time, row.end_time, row.break_hours);
  return {
    employeeCode,
    date: String(row.date).slice(0, 10),
    hours,
    startTime: row.start_time ? String(row.start_time).slice(0, 5) : undefined,
    endTime: row.end_time ? String(row.end_time).slice(0, 5) : undefined,
    projectCode: row.project || undefined,
    description: (row.title || row.activity || row.notes || 'Arbeid').slice(0, 200),
  };
}

async function persistResult(
  integrationId: string,
  status: 'active' | 'invalid',
  error: string | null,
): Promise<void> {
  await db
    .update(vendorIntegrations)
    .set({
      lastUsedAt: new Date(),
      lastError: error,
      status,
      updatedAt: new Date(),
    })
    .where(eq(vendorIntegrations.id, integrationId));
}

/**
 * Orchestrator. Scope = one vendor × one month, optionally filtered to one user.
 *
 * Behaviour:
 *   1. Resolve active PowerOffice integration for the vendor.
 *   2. Find approved timesheet_submissions for the month (filter by userId).
 *   3. For each user: look up PO employee mapping. Missing → skipped.
 *   4. For each log_row in that user's month: POST /HourRegistrations.
 *   5. Persist lastUsedAt. On any PO 401/403, flip status='invalid'.
 */
export async function pushTimesheetToPowerOffice(args: {
  vendorId: number;
  month: string;              // "YYYY-MM"
  userIdFilter?: string;
}): Promise<PushResult> {
  const result: PushResult = {
    month: args.month,
    vendorId: args.vendorId,
    pushed: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  const [integration] = await db
    .select()
    .from(vendorIntegrations)
    .where(and(
      eq(vendorIntegrations.vendorId, args.vendorId),
      eq(vendorIntegrations.provider, 'poweroffice'),
      eq(vendorIntegrations.status, 'active'),
    ))
    .limit(1);

  if (!integration) {
    result.errors.push({ userId: '-', reason: 'Ingen aktiv PowerOffice-integrasjon for denne vendor.' });
    result.failed++;
    return result;
  }

  await ensurePowerOfficeMappingsTable();

  // Approved timesheets for the month
  const subs = await pool.query(
    `SELECT user_id FROM timesheet_submissions
     WHERE vendor_id = $1 AND month = $2 AND status = 'approved'
       ${args.userIdFilter ? 'AND user_id = $3' : ''}`,
    args.userIdFilter
      ? [args.vendorId, args.month, args.userIdFilter]
      : [args.vendorId, args.month],
  ).catch(() => ({ rows: [] as Array<{ user_id: string }> }));

  if (subs.rows.length === 0) {
    result.errors.push({ userId: '-', reason: `Ingen godkjent timeliste for ${args.month} funnet.` });
    await persistResult(integration.id, 'active', 'Ingen godkjente timelister å pushe');
    return result;
  }

  // Compute month bounds for log_row lookup
  const [y, m] = args.month.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m)) {
    result.errors.push({ userId: '-', reason: 'Ugyldig månedsformat (forventer YYYY-MM)' });
    result.failed++;
    return result;
  }
  const firstDay = `${args.month}-01`;
  const lastDay = `${args.month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;

  let lastApiError: string | null = null;
  let apiAuthFailed = false;

  for (const { user_id: tidumUserId } of subs.rows) {
    const mapping = await getMapping(args.vendorId, tidumUserId);
    if (!mapping) {
      result.skipped++;
      result.errors.push({
        userId: tidumUserId,
        reason: 'Mangler PO-ansatt-ID i mapping — legg til på integrasjonssiden.',
      });
      continue;
    }

    // Fetch log_row entries for this user × month
    const entries = await pool.query(
      `SELECT id, date::text AS date, start_time::text AS start_time, end_time::text AS end_time,
              break_hours::text AS break_hours, project, title, activity, notes
       FROM log_row
       WHERE user_id = $1 AND date >= $2 AND date <= $3
       ORDER BY date ASC, start_time ASC`,
      [tidumUserId, firstDay, lastDay],
    );

    for (const row of entries.rows) {
      const payload = toHourRegistration(row, mapping.poEmployeeId);
      if (payload.hours <= 0) {
        result.skipped++;
        continue;
      }
      try {
        await call(integration.clientKey, {
          method: 'POST',
          path: '/HourRegistrations',
          body: payload,
        });
        result.pushed++;
      } catch (err: any) {
        result.failed++;
        const msg = err instanceof PowerOfficeApiError
          ? `PO ${err.status}: ${typeof err.body === 'string' ? err.body.slice(0, 200) : JSON.stringify(err.body).slice(0, 200)}`
          : String(err?.message || err);
        lastApiError = msg;
        if (err instanceof PowerOfficeApiError && (err.status === 401 || err.status === 403)) {
          apiAuthFailed = true;
        }
        result.errors.push({ userId: tidumUserId, date: payload.date, reason: msg });
        if (apiAuthFailed) break; // stop hammering on bad auth
      }
    }

    if (apiAuthFailed) break;
  }

  await persistResult(
    integration.id,
    apiAuthFailed ? 'invalid' : 'active',
    result.failed > 0 ? lastApiError : null,
  );

  return result;
}
