/**
 * server/lib/timesheet-lock.ts
 *
 * Edit-lock for log_row entries tied to a month that has been submitted or
 * approved. Prevents workers from silently rewriting history after their
 * tiltaksleder has reviewed/approved the period.
 *
 * Admin-level roles bypass the lock (for corrections after approval).
 */

import { pool } from '../db';
import { ADMIN_ROLES } from '../middleware/auth';

export interface LockStatus {
  locked: boolean;
  status?: 'submitted' | 'approved' | 'draft' | 'rejected';
  month?: string;
}

/** Extract YYYY-MM from a date-like value (ISO string or Date). */
export function monthKey(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Lookup whether a user's month is locked (submitted/approved). */
export async function getMonthLockStatus(
  userId: string,
  month: string,
): Promise<LockStatus> {
  if (!userId || !month) return { locked: false };
  try {
    const result = await pool.query(
      `SELECT status FROM timesheet_submissions
       WHERE user_id = $1 AND month = $2
       LIMIT 1`,
      [userId, month],
    );
    const row = result.rows[0];
    if (!row) return { locked: false };
    const locked = row.status === 'submitted' || row.status === 'approved';
    return { locked, status: row.status, month };
  } catch (err: any) {
    // If the table doesn't exist yet (fresh DB), fail open — no lock.
    if (String(err?.message || '').includes('relation "timesheet_submissions" does not exist')) {
      return { locked: false };
    }
    throw err;
  }
}

export interface LockCheckOptions {
  userId: string;
  date: string | Date;
  callerRole?: string | null;
}

/**
 * Throws a LockViolation if the target date falls in a locked month
 * (unless the caller has an admin-level role).
 */
export class LockViolation extends Error {
  status = 423; // Locked
  constructor(public lockStatus: LockStatus) {
    super(
      lockStatus.status === 'approved'
        ? `Måneden ${lockStatus.month} er godkjent og låst. Be tiltakslederen åpne for endringer.`
        : `Måneden ${lockStatus.month} er sendt til godkjenning og låst. Trekk tilbake innsendingen først.`,
    );
    this.name = 'LockViolation';
  }
}

export async function assertMonthNotLocked({
  userId,
  date,
  callerRole,
}: LockCheckOptions): Promise<void> {
  const role = (callerRole ?? '').toLowerCase().replace(/[\s-]/g, '_');
  if (ADMIN_ROLES.includes(role)) return; // admins can override
  const month = monthKey(date);
  if (!month) return;
  const status = await getMonthLockStatus(userId, month);
  if (status.locked) throw new LockViolation(status);
}

/**
 * Express error-handler helper: translates LockViolation to a 423 response.
 * Call as `catch(err => handleLockError(err, res))`.
 */
export function handleLockError(err: unknown, res: import('express').Response): boolean {
  if (err instanceof LockViolation) {
    res.status(err.status).json({ error: err.message, lockStatus: err.lockStatus });
    return true;
  }
  return false;
}
