import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import jwt from "jsonwebtoken";
import type { db as DbType, pool as PoolType } from "../../db";
import { roles } from "@shared/models/permissions";
import { eq } from "drizzle-orm";

const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || "change-me-in-production";

describe("role assignment routes", () => {
  // Same NODE_ENV=production + vi.resetModules() + shared-app/shared-pool
  // pattern as role-management-routes.test.ts — see that file for why
  // (isDevMode is a module-load-time constant that otherwise bypasses the
  // JWT + hasPermission() role.manage gate these tests exercise).
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

  afterAll(async () => {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await pool.end();
  });

  async function signSuperAdminToken() {
    const [role] = await db.select().from(roles).where(eq(roles.name, "super_admin")).limit(1);
    return jwt.sign({ id: "test-super-admin", email: "sa@example.com", role: "super_admin", roleId: role.id }, JWT_SECRET);
  }

  async function signVendorAdminToken() {
    const [role] = await db.select().from(roles).where(eq(roles.name, "vendor_admin")).limit(1);
    return jwt.sign({ id: "test-vendor-admin", email: "va@example.com", role: "vendor_admin", roleId: role.id }, JWT_SECRET);
  }

  async function createDisposableUser(): Promise<string> {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const {
      rows: [row],
    } = await pool.query(
      `INSERT INTO users (username, password, email) VALUES ($1, 'x', $2) RETURNING id`,
      [`test_assign_user_${suffix}`, `test-assign-${suffix}@example.com`],
    );
    return row.id;
  }

  const createdRoleIds: string[] = [];
  const createdUserIds: string[] = [];

  afterEach(async () => {
    for (const id of createdUserIds.splice(0)) {
      await pool.query(`DELETE FROM users WHERE id = $1`, [id]);
    }
    for (const id of createdRoleIds.splice(0)) {
      await pool.query(`DELETE FROM tidum_roles WHERE id = $1`, [id]);
    }
  });

  it("PATCH /api/admin/users/:id/role assigns a role to a user", async () => {
    const [role] = await db.insert(roles).values({ name: "test_assign_role", scope: "global" }).returning();
    createdRoleIds.push(role.id);
    const userId = await createDisposableUser();
    createdUserIds.push(userId);

    const token = await signSuperAdminToken();
    const res = await request(app)
      .patch(`/api/admin/users/${userId}/role`)
      .set("Authorization", `Bearer ${token}`)
      .send({ roleId: role.id });

    expect(res.status).toBe(200);
    expect(res.body.role_id).toBe(role.id);
  });

  it("PATCH /api/admin/users/:id/role with roleId: null unassigns", async () => {
    const [role] = await db.insert(roles).values({ name: "test_assign_role2", scope: "global" }).returning();
    createdRoleIds.push(role.id);
    const userId = await createDisposableUser();
    createdUserIds.push(userId);
    await pool.query(`UPDATE users SET role_id = $1 WHERE id = $2`, [role.id, userId]);

    const token = await signSuperAdminToken();
    const res = await request(app)
      .patch(`/api/admin/users/${userId}/role`)
      .set("Authorization", `Bearer ${token}`)
      .send({ roleId: null });

    expect(res.status).toBe(200);
    expect(res.body.role_id).toBeNull();
  });

  it("PATCH /api/admin/users/:id/role returns 404 for unknown roleId", async () => {
    const userId = await createDisposableUser();
    createdUserIds.push(userId);

    const token = await signSuperAdminToken();
    const res = await request(app)
      .patch(`/api/admin/users/${userId}/role`)
      .set("Authorization", `Bearer ${token}`)
      .send({ roleId: "00000000-0000-0000-0000-000000000000" });

    expect(res.status).toBe(404);
  });

  it("PATCH /api/admin/users/:id/role returns 404 for unknown user", async () => {
    const [role] = await db.insert(roles).values({ name: "test_assign_role3", scope: "global" }).returning();
    createdRoleIds.push(role.id);

    const token = await signSuperAdminToken();
    const res = await request(app)
      .patch(`/api/admin/users/00000000-0000-0000-0000-000000000000/role`)
      .set("Authorization", `Bearer ${token}`)
      .send({ roleId: role.id });

    expect(res.status).toBe(404);
  });

  it("PATCH /api/admin/users/:id/role blocks unassigning the only user holding a role with role.manage", async () => {
    const [superAdminRole] = await db.select().from(roles).where(eq(roles.name, "super_admin")).limit(1);
    const userId = await createDisposableUser();
    createdUserIds.push(userId);
    await pool.query(`UPDATE users SET role_id = $1 WHERE id = $2`, [superAdminRole.id, userId]);

    const token = await signSuperAdminToken();
    const res = await request(app)
      .patch(`/api/admin/users/${userId}/role`)
      .set("Authorization", `Bearer ${token}`)
      .send({ roleId: null });

    expect(res.status).toBe(409);
  });

  it("PATCH /api/admin/users/:id/role allows unassigning role.manage from a user when another role with an assigned member still has it", async () => {
    const [superAdminRole] = await db.select().from(roles).where(eq(roles.name, "super_admin")).limit(1);
    const [roleManagePermission] = await pool
      .query(`SELECT id FROM tidum_permissions WHERE key = 'role.manage'`)
      .then((r) => r.rows);
    const [newRole] = await db.insert(roles).values({ name: "test_assign_lockout_role", scope: "global" }).returning();
    createdRoleIds.push(newRole.id);
    await pool.query(
      `INSERT INTO tidum_role_permissions (role_id, permission_id) VALUES ($1, $2)`,
      [newRole.id, roleManagePermission.id],
    );
    const userOnNewRole = await createDisposableUser();
    createdUserIds.push(userOnNewRole);
    const userOnSuperAdmin = await createDisposableUser();
    createdUserIds.push(userOnSuperAdmin);
    await pool.query(`UPDATE users SET role_id = $1 WHERE id = $2`, [newRole.id, userOnNewRole]);
    await pool.query(`UPDATE users SET role_id = $1 WHERE id = $2`, [superAdminRole.id, userOnSuperAdmin]);

    const token = await signSuperAdminToken();
    const res = await request(app)
      .patch(`/api/admin/users/${userOnSuperAdmin}/role`)
      .set("Authorization", `Bearer ${token}`)
      .send({ roleId: null });

    expect(res.status).toBe(200);
  });

  it("PATCH /api/admin/users/:id/role allows routine reassignment for a user who never had role.manage", async () => {
    const [roleA] = await db.insert(roles).values({ name: "test_assign_lockout_role_a", scope: "global" }).returning();
    createdRoleIds.push(roleA.id);
    const [roleB] = await db.insert(roles).values({ name: "test_assign_lockout_role_b", scope: "global" }).returning();
    createdRoleIds.push(roleB.id);
    const userId = await createDisposableUser();
    createdUserIds.push(userId);
    await pool.query(`UPDATE users SET role_id = $1 WHERE id = $2`, [roleA.id, userId]);

    const token = await signSuperAdminToken();
    const res = await request(app)
      .patch(`/api/admin/users/${userId}/role`)
      .set("Authorization", `Bearer ${token}`)
      .send({ roleId: roleB.id });

    expect(res.status).toBe(200);
  });

  it("PATCH /api/admin/users/:id/role rejects a caller without role.manage", async () => {
    const userId = await createDisposableUser();
    createdUserIds.push(userId);

    const token = await signVendorAdminToken();
    const res = await request(app)
      .patch(`/api/admin/users/${userId}/role`)
      .set("Authorization", `Bearer ${token}`)
      .send({ roleId: null });

    expect(res.status).toBe(403);
  });

  it("GET /api/admin/roles/:id/members lists assigned users", async () => {
    const [role] = await db.insert(roles).values({ name: "test_assign_role4", scope: "global" }).returning();
    createdRoleIds.push(role.id);
    const userId = await createDisposableUser();
    createdUserIds.push(userId);
    await pool.query(`UPDATE users SET role_id = $1 WHERE id = $2`, [role.id, userId]);

    const token = await signSuperAdminToken();
    const res = await request(app)
      .get(`/api/admin/roles/${role.id}/members`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.map((u: any) => u.id)).toContain(userId);
  });

  it("GET /api/admin/users/search finds a user by partial email", async () => {
    const userId = await createDisposableUser();
    createdUserIds.push(userId);
    const {
      rows: [{ email }],
    } = await pool.query(`SELECT email FROM users WHERE id = $1`, [userId]);
    const searchTerm = email.split("@")[0].slice(0, 10);

    const token = await signSuperAdminToken();
    const res = await request(app)
      .get(`/api/admin/users/search`)
      .query({ q: searchTerm })
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.map((u: any) => u.id)).toContain(userId);
  });

  it("GET /api/admin/users/search returns empty for a query under 2 chars", async () => {
    const token = await signSuperAdminToken();
    const res = await request(app)
      .get(`/api/admin/users/search`)
      .query({ q: "a" })
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
