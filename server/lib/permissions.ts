import { db } from "../db";
import { roles, rolePermissions, permissions } from "@shared/models/permissions";
import { eq, and } from "drizzle-orm";

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
