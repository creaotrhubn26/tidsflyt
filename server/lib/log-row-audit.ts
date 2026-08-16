/**
 * server/lib/log-row-audit.ts
 *
 * Append-only audit trail for log_row mutations. Supports compliance
 * (arbeidstilsynet, internrevisjon) and simplifies "who changed what, when"
 * investigations without rewriting the main log_row schema.
 *
 * Schema is created lazily on first import (no migration needed).
 */

import type { Request } from 'express';
import { pool } from '../db';

export type AuditAction = 'create' | 'update' | 'delete';

let ensured = false;

/** Idempotent — creates the audit table and its index if missing. */
export async function ensureLogRowAuditTable(): Promise<void> {
  if (ensured) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS log_row_audit (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        log_row_id UUID NOT NULL,
        action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete')),
        before_data JSONB,
        after_data JSONB,
        changed_by TEXT,
        changed_by_role TEXT,
        changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ip_address TEXT,
        user_agent TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_log_row_audit_row_id ON log_row_audit(log_row_id);
      CREATE INDEX IF NOT EXISTS idx_log_row_audit_changed_at ON log_row_audit(changed_at DESC);
    `);
    ensured = true;
  } catch (err) {
    console.error('Failed to ensure log_row_audit table:', err);
    throw err;
  }
}

function callerFromReq(req: Request): { userId: string | null; role: string | null; ip: string | null; userAgent: string | null } {
  const u = (req as any).authUser ?? (req as any).user ?? null;
  const userId = u?.id ? String(u.id) : null;
  const role = u?.role ? String(u.role) : null;
  const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0].trim()
    ?? (req.socket?.remoteAddress ?? null);
  const userAgent = (req.headers['user-agent'] as string | undefined) ?? null;
  return { userId, role, ip, userAgent };
}

export interface AuditWriteOptions {
  action: AuditAction;
  logRowId: string;
  before?: Record<string, any> | null;
  after?: Record<string, any> | null;
  req?: Request;
}

/** Write one audit entry. Best-effort — never throws into the caller's flow. */
export async function auditLogRow(opts: AuditWriteOptions): Promise<void> {
  try {
    await ensureLogRowAuditTable();
    const caller = opts.req ? callerFromReq(opts.req) : { userId: null, role: null, ip: null, userAgent: null };
    await pool.query(
      `INSERT INTO log_row_audit
         (log_row_id, action, before_data, after_data, changed_by, changed_by_role, ip_address, user_agent)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, $7, $8)`,
      [
        opts.logRowId,
        opts.action,
        opts.before ? JSON.stringify(opts.before) : null,
        opts.after ? JSON.stringify(opts.after) : null,
        caller.userId,
        caller.role,
        caller.ip,
        caller.userAgent,
      ],
    );
  } catch (err) {
    // Audit must never break a user-facing mutation; log and swallow.
    console.error('[audit] failed to write log_row_audit entry:', err);
  }
}

export interface AuditRecord {
  id: string;
  logRowId: string;
  action: AuditAction;
  beforeData: Record<string, any> | null;
  afterData: Record<string, any> | null;
  changedBy: string | null;
  changedByRole: string | null;
  changedAt: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export async function listAuditForLogRow(logRowId: string, limit = 50): Promise<AuditRecord[]> {
  await ensureLogRowAuditTable();
  const result = await pool.query(
    `SELECT id, log_row_id, action, before_data, after_data,
            changed_by, changed_by_role, changed_at, ip_address, user_agent
     FROM log_row_audit
     WHERE log_row_id = $1
     ORDER BY changed_at DESC
     LIMIT $2`,
    [logRowId, limit],
  );
  return result.rows.map((r: any) => ({
    id: r.id,
    logRowId: r.log_row_id,
    action: r.action,
    beforeData: r.before_data,
    afterData: r.after_data,
    changedBy: r.changed_by,
    changedByRole: r.changed_by_role,
    changedAt: (r.changed_at instanceof Date ? r.changed_at.toISOString() : String(r.changed_at)),
    ipAddress: r.ip_address,
    userAgent: r.user_agent,
  }));
}
