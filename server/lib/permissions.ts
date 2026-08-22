import { db } from "../db";
import { roles, rolePermissions, permissions } from "@shared/models/permissions";
import { eq, and } from "drizzle-orm";
import { normalizeRole } from "@shared/roles";

export async function hasPermission(
  roleId: string | null | undefined,
  permissionKey: string,
  cache?: Map<string, boolean>,
): Promise<boolean> {
  if (!roleId) return false;

  const cacheKey = `${roleId}:${permissionKey}`;
  if (cache?.has(cacheKey)) return cache.get(cacheKey)!;

  try {
    const [row] = await db
      .select({ id: rolePermissions.roleId })
      .from(rolePermissions)
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(and(eq(rolePermissions.roleId, roleId), eq(permissions.key, permissionKey)))
      .limit(1);

    const result = !!row;
    cache?.set(cacheKey, result);
    return result;
  } catch (err) {
    console.error("[permissions] hasPermission query failed", roleId, permissionKey, err);
    return false;
  }
}

export async function getRoleById(roleId: string) {
  const [role] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
  return role ?? null;
}

export async function getRoleRank(roleName: string, cache?: Map<string, number>): Promise<number> {
  const normalizedRoleName = normalizeRole(roleName);
  if (cache?.has(normalizedRoleName)) return cache.get(normalizedRoleName)!;

  try {
    const [row] = await db
      .select({ rank: roles.rank })
      .from(roles)
      .where(and(eq(roles.scope, "global"), eq(roles.name, normalizedRoleName), eq(roles.isSystemDefault, true)))
      .limit(1);

    const result = row?.rank ?? -1;
    cache?.set(normalizedRoleName, result);
    return result;
  } catch (err) {
    console.error("[permissions] getRoleRank query failed", normalizedRoleName, err);
    return -1;
  }
}

export async function getRoleCanManageOthers(roleName: string, cache?: Map<string, boolean>): Promise<boolean> {
  const normalizedRoleName = normalizeRole(roleName);
  if (cache?.has(normalizedRoleName)) return cache.get(normalizedRoleName)!;

  try {
    const [row] = await db
      .select({ canManageOthers: roles.canManageOthers })
      .from(roles)
      .where(and(eq(roles.scope, "global"), eq(roles.name, normalizedRoleName), eq(roles.isSystemDefault, true)))
      .limit(1);

    const result = row?.canManageOthers ?? false;
    cache?.set(normalizedRoleName, result);
    return result;
  } catch (err) {
    console.error("[permissions] getRoleCanManageOthers query failed", normalizedRoleName, err);
    return false;
  }
}

export async function canManageRoleDynamic(
  actorRoleName: string,
  targetRoleName: string,
  rankCache?: Map<string, number>,
  canManageOthersCache?: Map<string, boolean>,
): Promise<boolean> {
  const [canManage, actorRank, targetRank] = await Promise.all([
    getRoleCanManageOthers(actorRoleName, canManageOthersCache),
    getRoleRank(actorRoleName, rankCache),
    getRoleRank(targetRoleName, rankCache),
  ]);
  // rank alene kan ikke uttrykke "administrerer aldri noen" (prototype_tester:
  // rank 85, men can_manage_others FALSE) — se migrations/058 og
  // task-1-report.md fixround 1. can_manage_others er en egen, uavhengig
  // guard fra rank-sammenligningen under.
  if (!canManage) return false;
  // -1 betyr ukjent rolle (rekke ikke funnet, eller DB-feil) — en ukjent
  // rolle kan aldri administrere noe, og kan aldri bli administrert.
  // Uten denne guarden ville -1 < 0 (miljoarbeider) feilaktig gitt true.
  if (actorRank < 0 || targetRank < 0) return false;
  return targetRank < actorRank;
}

export async function canManageUsersDynamic(actorRoleName: string, cache?: Map<string, boolean>): Promise<boolean> {
  return getRoleCanManageOthers(actorRoleName, cache);
}
