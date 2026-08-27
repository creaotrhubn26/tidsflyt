import type { Request } from "express";
import { normalizeRole } from "@shared/roles";
import { pool } from "../db";

export type LeaveActor = {
  id: string;
  email: string | null;
  role: string;
  vendorId: number;
};

const LEAVE_MANAGER_ROLES = new Set([
  "hovedadmin",
  "vendor_admin",
  "tiltaksleder",
  "teamleder",
]);

function requestIdentity(req: Request): any {
  return (req as any).authUser ?? (req as any).user ?? null;
}

/**
 * Fravær inneholder helse- og arbeidsforholdsdata. Autorisasjonen bruker derfor
 * bare bruker-ID-en fra sesjonen/tokenet og henter rolle/tenant på nytt fra DB.
 * Global super_admin får ikke implisitt innsyn i kundens fraværsdata; eventuell
 * supporttilgang må etableres som en separat, tidsbegrenset og auditert flyt.
 */
export async function resolveLeaveActor(req: Request): Promise<LeaveActor | null> {
  const id = String(requestIdentity(req)?.id ?? "").trim();
  if (!id || id.length > 255) return null;

  const result = await pool.query(
    `SELECT id, email, role, vendor_id, kommune_id
       FROM users
      WHERE id = $1
      LIMIT 1`,
    [id],
  );
  const row = result.rows[0];
  if (!row) return null;

  const role = normalizeRole(String(row.role ?? ""));
  const vendorId = Number(row.vendor_id);
  const kommuneId = row.kommune_id == null ? null : Number(row.kommune_id);
  if (
    role === "super_admin"
    || !Number.isInteger(vendorId)
    || vendorId <= 0
    || kommuneId !== null
  ) {
    return null;
  }

  return {
    id: String(row.id),
    email: typeof row.email === "string" ? row.email : null,
    role,
    vendorId,
  };
}

export function canManageLeave(actor: LeaveActor): boolean {
  return LEAVE_MANAGER_ROLES.has(normalizeRole(actor.role));
}

export async function userBelongsToLeaveVendor(
  userId: string,
  vendorId: number,
): Promise<boolean> {
  if (!userId || userId.length > 255) return false;
  const result = await pool.query(
    `SELECT 1
       FROM users
      WHERE id = $1
        AND vendor_id = $2
        AND kommune_id IS NULL
      LIMIT 1`,
    [userId, vendorId],
  );
  return result.rows.length === 1;
}

export async function resolveLeaveTargetUser(
  actor: LeaveActor,
  requestedUserId: unknown,
): Promise<string | null> {
  const requested = requestedUserId == null
    ? ""
    : String(requestedUserId).trim();
  if (!requested || requested === actor.id) return actor.id;
  if (!canManageLeave(actor)) return null;
  return (await userBelongsToLeaveVendor(requested, actor.vendorId))
    ? requested
    : null;
}
