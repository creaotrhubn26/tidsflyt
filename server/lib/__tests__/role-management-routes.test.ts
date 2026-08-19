import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import jwt from "jsonwebtoken";
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
    expect(res.body.length).toBe(7);
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
      // Gjenopprett super_admins fulle tillatelsessett (alle 7) — testen fjernet dem.
      await pool.query(
        `INSERT INTO tidum_role_permissions (role_id, permission_id) SELECT $1, id FROM tidum_permissions`,
        [superAdminRole.id],
      );
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

    const token = await signSuperAdminToken();
    const res = await request(app)
      .put(`/api/admin/roles/${role.id}/permissions`)
      .set("Authorization", `Bearer ${token}`)
      .send({ permissionIds: [] });

    expect(res.status).toBe(200);

    await db.delete(roles).where(eq(roles.id, role.id));
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
