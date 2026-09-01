import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import jwt from "jsonwebtoken";
import { readFileSync } from "fs";
import { join } from "path";
import type { db as DbType, pool as PoolType } from "../../db";
import { roles } from "@shared/models/permissions";
import { eq } from "drizzle-orm";

const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || "change-me-in-production";

describe("role management routes", () => {
  // smartTimingRoutes.ts's isDevMode (`NODE_ENV !== 'production'`) is a
  // module-load-time constant, and Vitest's default NODE_ENV is "test" —
  // which trips the dev-mode bypass in authenticateAdmin and hands every
  // request the real super_admin roleId, ignoring the crafted JWTs this file
  // signs entirely. Force NODE_ENV to "production" and re-import the module
  // fresh (once, in beforeAll — not per test/per import) so these tests
  // actually exercise the JWT + hasPermission() role.manage gate, matching
  // vendor-routes-permissions.test.ts / prototype-tester-permissions.test.ts.
  // Same shared-app/shared-pool shape as those files — registerSmartTimingRoutes()
  // kicks off fire-and-forget bootstrap side effects against the pool, so one
  // app/one pool for the whole file avoids racing "Cannot use a pool after
  // calling end on the pool" from a closed-too-early pool.
  let app: express.Express;
  let db: typeof DbType;
  let pool: typeof PoolType;

  beforeAll(async () => {
    const prevNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    vi.resetModules();
    const { registerSmartTimingRoutes } = await import("../../smartTimingRoutes");
    ({ db, pool } = await import("../../db"));
    process.env.NODE_ENV = prevNodeEnv;

    app = express();
    app.use(express.json());
    registerSmartTimingRoutes(app);
  });

  afterEach(async () => {
    await db.delete(roles).where(eq(roles.name, "test_role_task6"));
  });

  afterAll(async () => {
    // registerSmartTimingRoutes() also kicks off unrelated fire-and-forget
    // app-bootstrap chains (blog seed/tables, report tables, etc.) against
    // this same pool that we have no handle to await. Same grace period as
    // prototype-tester-permissions.test.ts — lets them settle before we
    // close the pool, instead of racing "Cannot use a pool after calling
    // end on the pool" into stderr.
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await pool.end();
  });

  async function signSuperAdminToken() {
    const [role] = await db.select().from(roles).where(eq(roles.name, "super_admin")).limit(1);
    return jwt.sign({ id: "test-super-admin", email: "sa@example.com", role: "super_admin", roleId: role.id }, JWT_SECRET);
  }

  // vendor_admin's real (migrated) system role — per
  // server/lib/permission-catalog.ts VENDOR_ADMIN_PERMISSION_KEYS it only
  // ever gets vendor.poweroffice_visibility.toggle, never role.manage.
  async function signVendorAdminToken() {
    const [role] = await db.select().from(roles).where(eq(roles.name, "vendor_admin")).limit(1);
    return jwt.sign({ id: "test-vendor-admin", email: "va@example.com", role: "vendor_admin", roleId: role.id }, JWT_SECRET);
  }

  // Disposable users.id for tests that need a controllable role_id without
  // touching a real (possibly production) account. username/password are
  // legacy NOT NULL columns on this shared public.users table, unrelated to
  // what these tests exercise — filled with disposable values.
  async function createDisposableUser(): Promise<string> {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const {
      rows: [row],
    } = await pool.query(
      `INSERT INTO users (username, password, email) VALUES ($1, 'x', $2) RETURNING id, role_id`,
      [`test_role_mgmt_user_${suffix}`, `test-role-mgmt-${suffix}@example.com`],
    );
    return row.id;
  }

  it("GET /api/admin/permissions returns the full catalog", async () => {
    const token = await signSuperAdminToken();
    const res = await request(app)
      .get("/api/admin/permissions")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    // Speiler PERMISSION_CATALOG direkte — vokser katalogen, vokser
    // forventningen med den (aldri stale igjen).
    const { PERMISSION_CATALOG } = await import("../permission-catalog");
    expect(res.body.length).toBe(PERMISSION_CATALOG.length);
  });

  it("POST /api/admin/roles creates a role with no permissions", async () => {
    const token = await signSuperAdminToken();
    const res = await request(app)
      .post("/api/admin/roles")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "test_role_task6", scope: "global" });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("test_role_task6");
  });

  it("DELETE /api/admin/roles/:id blocks deletion when users are attached", async () => {
    const [role] = await db.insert(roles).values({ name: "test_role_task6", scope: "global" }).returning();
    const userId = await createDisposableUser();
    // Freshly created disposable user, so this is NULL — captured rather
    // than assumed, and restored exactly (not hardcoded) below.
    const {
      rows: [before],
    } = await pool.query(`SELECT role_id FROM users WHERE id = $1`, [userId]);
    const originalRoleId = before.role_id;

    try {
      await pool.query(`UPDATE users SET role_id = $1 WHERE id = $2`, [role.id, userId]);

      const token = await signSuperAdminToken();
      const res = await request(app)
        .delete(`/api/admin/roles/${role.id}`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(409);
    } finally {
      // Runs even if the assertion above throws, so a failed run never
      // leaves the mutation in place (which would also cascade into
      // afterEach's `DELETE FROM tidum_roles` failing on an FK violation).
      await pool.query(`UPDATE users SET role_id = $1 WHERE id = $2`, [originalRoleId, userId]);
      await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
    }
  });

  it("DELETE /api/admin/roles/:id blocks deletion of a system role", async () => {
    const [role] = await db.select().from(roles).where(eq(roles.name, "super_admin")).limit(1);

    const token = await signSuperAdminToken();
    const res = await request(app)
      .delete(`/api/admin/roles/${role.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(409);

    const stillThere = await db.select().from(roles).where(eq(roles.id, role.id)).limit(1);
    expect(stillThere.length).toBe(1);
  });

  it("PUT /api/admin/roles/:id/permissions allows editing a system role's permissions when it doesn't remove the last role.manage", async () => {
    const [vendorAdminRole] = await db.select().from(roles).where(eq(roles.name, "vendor_admin")).limit(1);
    const before = await pool.query(
      `SELECT permission_id FROM tidum_role_permissions WHERE role_id = $1`,
      [vendorAdminRole.id],
    );
    const originalPermissionIds = before.rows.map((r) => r.permission_id);

    try {
      const token = await signSuperAdminToken();
      const res = await request(app)
        .put(`/api/admin/roles/${vendorAdminRole.id}/permissions`)
        .set("Authorization", `Bearer ${token}`)
        .send({ permissionIds: [] });

      // vendor_admin never had role.manage (only super_admin does), so
      // removing everything from it can never trip the self-lockout guard.
      expect(res.status).toBe(200);
    } finally {
      await pool.query(`DELETE FROM tidum_role_permissions WHERE role_id = $1`, [vendorAdminRole.id]);
      for (const permissionId of originalPermissionIds) {
        await pool.query(
          `INSERT INTO tidum_role_permissions (role_id, permission_id) VALUES ($1, $2)`,
          [vendorAdminRole.id, permissionId],
        );
      }
    }
  });

  it("PUT .../permissions blocks removing role.manage from the only role with assigned members that has it", async () => {
    const [superAdminRole] = await db.select().from(roles).where(eq(roles.name, "super_admin")).limit(1);
    const userId = await createDisposableUser();

    try {
      await pool.query(`UPDATE users SET role_id = $1 WHERE id = $2`, [superAdminRole.id, userId]);

      const token = await signSuperAdminToken();
      const res = await request(app)
        .put(`/api/admin/roles/${superAdminRole.id}/permissions`)
        .set("Authorization", `Bearer ${token}`)
        // Empty set — removes ALL permissions from super_admin, including
        // role.manage, which is exactly what the self-lockout guard exists
        // to catch (super_admin is the only role with an assigned member
        // that has role.manage at this point in the test).
        .send({ permissionIds: [] });

      expect(res.status).toBe(409);
    } finally {
      await pool.query(`UPDATE users SET role_id = NULL WHERE id = $1`, [userId]);
      await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
    }
  });

  it("PUT .../permissions allows removing role.manage from a role when another role with assigned members still has it", async () => {
    const [superAdminRole] = await db.select().from(roles).where(eq(roles.name, "super_admin")).limit(1);
    const [roleManagePermission] = await pool
      .query(`SELECT id FROM tidum_permissions WHERE key = 'role.manage'`)
      .then((r) => r.rows);
    const [newRole] = await db.insert(roles).values({ name: "test_lockout_guard_role", scope: "global" }).returning();
    const userOnNewRole = await createDisposableUser();
    const userOnSuperAdmin = await createDisposableUser();
    // Snapshot super_admin's ACTUAL current permission set before mutating —
    // don't assume it's "all of tidum_permissions" (that assumption could
    // silently overwrite a legitimately customized prod super_admin role
    // that didn't have all 7 permissions before this test ran). Mirrors the
    // vendor_admin snapshot/restore pattern above.
    const beforeSuperAdmin = await pool.query(
      `SELECT permission_id FROM tidum_role_permissions WHERE role_id = $1`,
      [superAdminRole.id],
    );
    const originalSuperAdminPermissionIds = beforeSuperAdmin.rows.map((r) => r.permission_id);

    try {
      await pool.query(
        `INSERT INTO tidum_role_permissions (role_id, permission_id) VALUES ($1, $2)`,
        [newRole.id, roleManagePermission.id],
      );
      await pool.query(`UPDATE users SET role_id = $1 WHERE id = $2`, [newRole.id, userOnNewRole]);
      await pool.query(`UPDATE users SET role_id = $1 WHERE id = $2`, [superAdminRole.id, userOnSuperAdmin]);

      const token = await signSuperAdminToken();
      const res = await request(app)
        .put(`/api/admin/roles/${superAdminRole.id}/permissions`)
        .set("Authorization", `Bearer ${token}`)
        .send({ permissionIds: [] });

      expect(res.status).toBe(200);
    } finally {
      await pool.query(`UPDATE users SET role_id = NULL WHERE id IN ($1, $2)`, [userOnNewRole, userOnSuperAdmin]);
      await pool.query(`DELETE FROM users WHERE id IN ($1, $2)`, [userOnNewRole, userOnSuperAdmin]);
      await pool.query(`DELETE FROM tidum_role_permissions WHERE role_id = $1`, [superAdminRole.id]);
      // Gjenopprett super_admins EKSAKTE snapshot fra før testen kjørte —
      // ikke anta at rollen hadde alle 7 tillatelser.
      for (const permissionId of originalSuperAdminPermissionIds) {
        await pool.query(
          `INSERT INTO tidum_role_permissions (role_id, permission_id) VALUES ($1, $2)`,
          [superAdminRole.id, permissionId],
        );
      }
      await pool.query(`DELETE FROM tidum_role_permissions WHERE role_id = $1`, [newRole.id]);
      await db.delete(roles).where(eq(roles.id, newRole.id));
    }
  });

  it("PUT .../permissions never runs the self-lockout check for a role with 0 assigned members", async () => {
    const [role] = await db.insert(roles).values({ name: "test_no_members_role", scope: "global" }).returning();
    const [roleManagePermission] = await pool
      .query(`SELECT id FROM tidum_permissions WHERE key = 'role.manage'`)
      .then((r) => r.rows);
    await pool.query(
      `INSERT INTO tidum_role_permissions (role_id, permission_id) VALUES ($1, $2)`,
      [role.id, roleManagePermission.id],
    );

    try {
      const token = await signSuperAdminToken();
      const res = await request(app)
        .put(`/api/admin/roles/${role.id}/permissions`)
        .set("Authorization", `Bearer ${token}`)
        .send({ permissionIds: [] });

      expect(res.status).toBe(200);
    } finally {
      // The route's own DELETE FROM tidum_role_permissions only runs if the
      // request reached its success path — if the assertion above throws
      // (or the route returns non-200 before its own cleanup), the row
      // inserted above is still there. Clean it up explicitly first so the
      // role delete below doesn't FK-fail.
      await pool.query(`DELETE FROM tidum_role_permissions WHERE role_id = $1`, [role.id]);
      await db.delete(roles).where(eq(roles.id, role.id));
    }
  });

  it("DELETE /api/admin/roles/:id blocks deleting a 0-member role that is the sole holder of role.manage", async () => {
    // super_admin holds role.manage by default in this environment, so
    // newRole can't be the SOLE holder unless super_admin's grant is
    // temporarily removed too — snapshot/restore, same pattern as the PUT
    // self-lockout tests above. Caller authenticates AS the role being
    // deleted (not as super_admin), since super_admin's role.manage is
    // gone for the duration of this test.
    const [superAdminRole] = await db.select().from(roles).where(eq(roles.name, "super_admin")).limit(1);
    const [roleManagePermission] = await pool
      .query(`SELECT id FROM tidum_permissions WHERE key = 'role.manage'`)
      .then((r) => r.rows);
    const beforeSuperAdmin = await pool.query(
      `SELECT permission_id FROM tidum_role_permissions WHERE role_id = $1`,
      [superAdminRole.id],
    );
    const originalSuperAdminPermissionIds = beforeSuperAdmin.rows.map((r) => r.permission_id);
    const [newRole] = await db.insert(roles).values({ name: "test_delete_floor_role", scope: "global" }).returning();

    try {
      await pool.query(
        `DELETE FROM tidum_role_permissions WHERE role_id = $1 AND permission_id = $2`,
        [superAdminRole.id, roleManagePermission.id],
      );
      await pool.query(
        `INSERT INTO tidum_role_permissions (role_id, permission_id) VALUES ($1, $2)`,
        [newRole.id, roleManagePermission.id],
      );
      const token = jwt.sign(
        { id: "test-delete-floor", email: "df@example.com", role: newRole.name, roleId: newRole.id },
        JWT_SECRET,
      );

      const res = await request(app)
        .delete(`/api/admin/roles/${newRole.id}`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(409);
      const stillThere = await db.select().from(roles).where(eq(roles.id, newRole.id)).limit(1);
      expect(stillThere.length).toBe(1);
    } finally {
      await pool.query(`DELETE FROM tidum_role_permissions WHERE role_id = $1`, [newRole.id]);
      await db.delete(roles).where(eq(roles.id, newRole.id));
      // Gjenopprett super_admins eksakte snapshot fra før testen kjørte.
      await pool.query(`DELETE FROM tidum_role_permissions WHERE role_id = $1`, [superAdminRole.id]);
      for (const permissionId of originalSuperAdminPermissionIds) {
        await pool.query(
          `INSERT INTO tidum_role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT (role_id, permission_id) DO NOTHING`,
          [superAdminRole.id, permissionId],
        );
      }
    }
  });

  it("DELETE /api/admin/roles/:id allows deleting a 0-member role.manage-holding role when another role still has it", async () => {
    // super_admin already holds role.manage and is untouched by this test —
    // that's the "another role" that lets deletion of newRole proceed.
    const [roleManagePermission] = await pool
      .query(`SELECT id FROM tidum_permissions WHERE key = 'role.manage'`)
      .then((r) => r.rows);
    const [newRole] = await db.insert(roles).values({ name: "test_delete_floor_role2", scope: "global" }).returning();

    try {
      await pool.query(
        `INSERT INTO tidum_role_permissions (role_id, permission_id) VALUES ($1, $2)`,
        [newRole.id, roleManagePermission.id],
      );
      const token = await signSuperAdminToken();

      const res = await request(app)
        .delete(`/api/admin/roles/${newRole.id}`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      const stillThere = await db.select().from(roles).where(eq(roles.id, newRole.id)).limit(1);
      expect(stillThere.length).toBe(0);
    } finally {
      // The route's DELETE FROM tidum_roles cascades tidum_role_permissions
      // via FK, but only on the success path — clean up explicitly first in
      // case the request failed before reaching it.
      await pool.query(`DELETE FROM tidum_role_permissions WHERE role_id = $1`, [newRole.id]);
      await db.delete(roles).where(eq(roles.id, newRole.id));
    }
  });

  it("migration 054's role-permission seed is fresh-install-only — doesn't re-seed a role emptied via the API", async () => {
    const [vendorAdminRole] = await db.select().from(roles).where(eq(roles.name, "vendor_admin")).limit(1);
    const before = await pool.query(
      `SELECT permission_id FROM tidum_role_permissions WHERE role_id = $1`,
      [vendorAdminRole.id],
    );
    const originalPermissionIds = before.rows.map((r) => r.permission_id);

    try {
      // Tøm vendor_admin for tillatelser (samme sluttresultat som en super
      // admin ville fått via PUT .../permissions med permissionIds: []).
      await pool.query(`DELETE FROM tidum_role_permissions WHERE role_id = $1`, [vendorAdminRole.id]);

      // Re-kjør migrasjon 054 — simulerer neste server-oppstart/deploy.
      const sql054 = readFileSync(join(process.cwd(), "migrations", "054_role_permission_system.sql"), "utf8");
      await pool.query(sql054);

      const after = await pool.query(
        `SELECT permission_id FROM tidum_role_permissions WHERE role_id = $1`,
        [vendorAdminRole.id],
      );
      expect(after.rows.length).toBe(0);
    } finally {
      for (const permissionId of originalPermissionIds) {
        await pool.query(
          `INSERT INTO tidum_role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT (role_id, permission_id) DO NOTHING`,
          [vendorAdminRole.id, permissionId],
        );
      }
    }
  });

  it("DELETE /api/admin/roles/:id returns 404 for a role that doesn't exist", async () => {
    const token = await signSuperAdminToken();
    const res = await request(app)
      .delete(`/api/admin/roles/00000000-0000-0000-0000-000000000000`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it("rejects role-management routes for a role without role.manage (vendor_admin)", async () => {
    const token = await signVendorAdminToken();

    const postRes = await request(app)
      .post("/api/admin/roles")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "should_not_be_created_by_vendor_admin", scope: "global" });
    expect(postRes.status).toBe(403);

    // The role.manage check runs before the route touches :id, so a
    // syntactically valid but nonexistent UUID is enough to prove the gate
    // fires — no real role needs to exist at this id.
    const putRes = await request(app)
      .put(`/api/admin/roles/00000000-0000-0000-0000-000000000000/permissions`)
      .set("Authorization", `Bearer ${token}`)
      .send({ permissionIds: [] });
    expect(putRes.status).toBe(403);
  });
});
