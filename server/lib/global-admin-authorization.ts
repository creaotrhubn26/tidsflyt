import type { Request } from "express";
import { canManageVendorCredentials, normalizeRole } from "@shared/roles";
import { pool } from "../db";

export type FreshAdminActor = {
  id: string;
  email: string | null;
  role: string;
  assignedAdminRole: string | null;
  assignedAdminRoleIsSystemDefault: boolean;
  vendorId: number | null;
  kommuneId: number | null;
};

export type FreshIntegrationAdminActor = FreshAdminActor & {
  integrationAdminScope: "global" | "vendor";
};

const VENDOR_DATA_ADMIN_ROLES = new Set([
  "hovedadmin",
  "vendor_admin",
  "tiltaksleder",
  "teamleder",
]);

function identityId(req: Request): string | null {
  const identity = (req as any).authUser ?? (req as any).user ?? null;
  const id = String(identity?.id ?? "").trim();
  return id && id.length <= 255 ? id : null;
}

export async function resolveFreshAdminActor(req: Request): Promise<FreshAdminActor | null> {
  const id = identityId(req);
  if (!id) return null;

  const result = await pool.query(
    `SELECT u.id, u.email, u.role, u.vendor_id, u.kommune_id,
            assigned_role.name AS assigned_role_name,
            assigned_role.scope AS assigned_role_scope,
            assigned_role.vendor_id AS assigned_role_vendor_id,
            assigned_role.is_system_default AS assigned_role_is_system_default,
            admin_state.admin_count,
            admin_state.all_active AS admin_all_active
       FROM users u
       LEFT JOIN tidum_roles assigned_role ON assigned_role.id = u.role_id
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS admin_count,
                BOOL_AND(is_active IS TRUE) AS all_active
           FROM tidum_admin_users
          WHERE lower(email) = lower(u.email)
       ) admin_state ON true
      WHERE u.id = $1
      LIMIT 1`,
    [id],
  );
  const row = result.rows[0];
  if (!row || Number(row.admin_count) > 1 || row.admin_all_active === false) return null;

  const vendorId = row.vendor_id == null ? null : Number(row.vendor_id);
  const kommuneId = row.kommune_id == null ? null : Number(row.kommune_id);
  if (vendorId != null && (!Number.isInteger(vendorId) || vendorId <= 0)) return null;
  if (kommuneId != null && (!Number.isInteger(kommuneId) || kommuneId <= 0)) return null;

  const assignedAdminRole =
    row.assigned_role_scope === "global"
    && row.assigned_role_vendor_id == null
    && typeof row.assigned_role_name === "string"
      ? normalizeRole(row.assigned_role_name)
      : null;

  return {
    id: String(row.id),
    email: typeof row.email === "string" ? row.email : null,
    role: normalizeRole(String(row.role ?? "")),
    assignedAdminRole,
    assignedAdminRoleIsSystemDefault: row.assigned_role_is_system_default === true,
    vendorId,
    kommuneId,
  };
}

export async function resolveFreshGlobalSuperAdmin(req: Request): Promise<FreshAdminActor | null> {
  const actor = await resolveFreshAdminActor(req);
  if (
    !actor
    || actor.assignedAdminRole !== "super_admin"
    || !actor.assignedAdminRoleIsSystemDefault
    || actor.vendorId !== null
    || actor.kommuneId !== null
  ) {
    return null;
  }
  return actor;
}

export async function resolveFreshVendorMember(req: Request): Promise<FreshAdminActor | null> {
  const actor = await resolveFreshAdminActor(req);
  if (!actor || actor.vendorId == null || actor.kommuneId !== null) return null;
  return actor;
}

export async function resolveFreshVendorDataAdmin(req: Request): Promise<FreshAdminActor | null> {
  const actor = await resolveFreshAdminActor(req);
  if (
    !actor
    || !VENDOR_DATA_ADMIN_ROLES.has(actor.role)
    || (
      actor.role === "vendor_admin"
      && (
        actor.assignedAdminRole !== "vendor_admin"
        || !actor.assignedAdminRoleIsSystemDefault
      )
    )
    || actor.vendorId == null
    || actor.kommuneId !== null
  ) {
    return null;
  }
  return actor;
}

export async function resolveFreshVendorCredentialAdmin(req: Request): Promise<FreshAdminActor | null> {
  const actor = await resolveFreshAdminActor(req);
  if (
    !actor
    || !canManageVendorCredentials(actor.role)
    || (
      actor.role === "vendor_admin"
      && (
        actor.assignedAdminRole !== "vendor_admin"
        || !actor.assignedAdminRoleIsSystemDefault
      )
    )
    || actor.vendorId == null
    || actor.kommuneId !== null
  ) {
    return null;
  }
  return actor;
}

export async function resolveFreshIntegrationAdmin(req: Request): Promise<FreshIntegrationAdminActor | null> {
  const actor = await resolveFreshAdminActor(req);
  if (!actor) return null;

  if (
    actor.assignedAdminRole === "super_admin"
    && actor.assignedAdminRoleIsSystemDefault
    && actor.vendorId === null
    && actor.kommuneId === null
  ) {
    return { ...actor, integrationAdminScope: "global" };
  }

  if (
    canManageVendorCredentials(actor.role)
    && (
      actor.role !== "vendor_admin"
      || (
        actor.assignedAdminRole === "vendor_admin"
        && actor.assignedAdminRoleIsSystemDefault
      )
    )
    && actor.vendorId != null
    && actor.kommuneId === null
  ) {
    return { ...actor, integrationAdminScope: "vendor" };
  }

  return null;
}

export async function userBelongsToVendorDataScope(
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
