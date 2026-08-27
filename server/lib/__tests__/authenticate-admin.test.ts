import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { db, pool } from "../../db";
import { roles } from "@shared/models/permissions";
import { eq } from "drizzle-orm";
import request from "supertest";
import express from "express";
import jwt from "jsonwebtoken";
import { readFileSync } from "node:fs";
import { authenticateAdmin } from "../../smartTimingRoutes";

const JWT_SECRET = process.env.AUTH_JWT_SECRET || "test-auth-jwt-secret";

describe("authenticateAdmin sets req.admin.roleId", () => {
  afterEach(async () => {
    // This test creates no rows, so there's nothing to clean up in the
    // happy path — this is a defensive no-op guard, tolerant of a
    // not-yet-migrated `roles` table in this environment (relation
    // "roles" does not exist), matching the fail-closed spirit of
    // hasPermission rather than turning an infra gap into a red test.
    try {
      await db.delete(roles).where(eq(roles.name, "test_role_for_auth_check"));
    } catch (err: any) {
      if ((err?.cause?.code ?? err?.code) !== "42P01") throw err;
    }
  });

  it("dev-mode branch resolves the migrated super_admin role's real id", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousBypass = process.env.ALLOW_DEV_AUTH_BYPASS;
    process.env.NODE_ENV = "development";
    process.env.ALLOW_DEV_AUTH_BYPASS = "true";

    try {
      // Real super_admin id, read fresh from the DB rather than hardcoded —
      // it can differ across environments/reseeds.
      const [superAdmin] = await db
        .select()
        .from(roles)
        .where(eq(roles.name, "super_admin"));
      expect(superAdmin?.id).toBeTruthy();

      const app = express();
      // Test-only route that runs the real authenticateAdmin middleware and
      // echoes what it set — proves actual roleId resolution, not just that
      // some unrelated route didn't 403 (that route only checks the legacy
      // `role` string, so it would pass regardless of roleId).
      app.get("/__test/roleId", authenticateAdmin, (req: any, res) => {
        res.json({ roleId: req.admin.roleId });
      });

      const res = await request(app).get("/__test/roleId");
      expect(res.status).toBe(200);
      expect(res.body.roleId).toBe(superAdmin.id);
    } finally {
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
      if (previousBypass === undefined) {
        delete process.env.ALLOW_DEV_AUTH_BYPASS;
      } else {
        process.env.ALLOW_DEV_AUTH_BYPASS = previousBypass;
      }
    }
  });
});

describe("authenticateAdmin JWT branch resolves both id spaces", () => {
  // Same shared-app/shared-pool shape as prototype-tester-permissions.test.ts —
  // isDevMode is baked in at module-load time, so NODE_ENV must be forced to
  // "production" and the module graph reset *before* import to actually
  // exercise the JWT branch instead of the dev-mode bypass.
  let app: express.Express;
  let dynamicDb: typeof db;
  let dynamicDbPool: typeof pool;

  // Fresh module graph + own pool per test (not beforeAll) since each test
  // below needs isolated tidum_admin_users/users rows and there are only two of
  // them — simpler than sharing one app across cases the way
  // prototype-tester-permissions.test.ts does for its four.
  beforeEach(async () => {
    const prevNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    vi.resetModules();
    const { authenticateAdmin: authAdmin } = await import(
      "../../smartTimingRoutes"
    );
    ({ db: dynamicDb, pool: dynamicDbPool } = await import("../../db"));
    process.env.NODE_ENV = prevNodeEnv;

    app = express();
    app.get("/__test/roleId", authAdmin, (req: any, res) => {
      res.json({ roleId: req.admin.roleId });
    });
    app.get("/api/cms/__test/roleId", authAdmin, (req: any, res) => {
      res.json({ roleId: req.admin.roleId });
    });
  });

  afterEach(async () => {
    // registerSmartTimingRoutes() also kicks off unrelated fire-and-forget
    // app-bootstrap chains against this same pool. Same grace period as
    // prototype-tester-permissions.test.ts before closing it.
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await dynamicDbPool.end();
  });

  it("tidum_admin_users-shaped JWT (id from tidum_admin_users id space) resolves roleId via the tidum_admin_users -> users email join", async () => {
    const [role] = await dynamicDb
      .insert(roles)
      .values({ name: "test_role_jwt_fallback_join", scope: "global" })
      .returning();
    const email = `jwt-fallback-join-${Date.now()}@example.com`;
    let adminUserId: number | undefined;
    let userId: string | undefined;

    try {
      const {
        rows: [adminUserRow],
      } = await dynamicDbPool.query(
        `INSERT INTO tidum_admin_users (username, email, password_hash) VALUES ($1, $2, 'x') RETURNING id`,
        [`jwt_fallback_join_${Date.now()}`, email],
      );
      adminUserId = adminUserRow.id;

      // username/password are legacy NOT NULL columns on public.users
      // unrelated to this test — filled with disposable values.
      const {
        rows: [userRow],
      } = await dynamicDbPool.query(
        `INSERT INTO users (username, password, email, role_id) VALUES ($1, 'x', $2, $3) RETURNING id`,
        [`jwt_fallback_join_user_${Date.now()}`, email, role.id],
      );
      userId = userRow.id;

      // No roleId in the payload and no email — matches what
      // /api/admin/login actually signs (see smartTimingRoutes.ts).
      const token = jwt.sign({ id: adminUserId, username: "x", role: "vendor_admin" }, JWT_SECRET);
      const res = await request(app).get("/__test/roleId").set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.roleId).toBe(role.id);
    } finally {
      if (userId) await dynamicDbPool.query(`DELETE FROM users WHERE id = $1`, [userId]);
      if (adminUserId) await dynamicDbPool.query(`DELETE FROM tidum_admin_users WHERE id = $1`, [adminUserId]);
      await dynamicDb.delete(roles).where(eq(roles.id, role.id));
    }
  });

  it("tidum_admin_users-shaped JWT resolves via the email join even when tidum_admin_users and users store the email with different casing", async () => {
    // pairAdminUserWithUsersTable normalizes email to lowercase when
    // writing users.email, but tidum_admin_users.email keeps whatever case the
    // caller originally supplied (e.g. Ola.Nordmann@Firma.no) — the join
    // must not miss this pairing just because the two sides disagree on
    // case. Found in fase 1.5's final review.
    const [role] = await dynamicDb
      .insert(roles)
      .values({ name: "test_role_jwt_case_insensitive_join", scope: "global" })
      .returning();
    const mixedCaseEmail = `Mixed.Case.${Date.now()}@Example.COM`;
    let adminUserId: number | undefined;
    let userId: string | undefined;

    try {
      const {
        rows: [adminUserRow],
      } = await dynamicDbPool.query(
        `INSERT INTO tidum_admin_users (username, email, password_hash) VALUES ($1, $2, 'x') RETURNING id`,
        [`jwt_case_join_${Date.now()}`, mixedCaseEmail],
      );
      adminUserId = adminUserRow.id;

      // users.email stored lowercase, matching pairAdminUserWithUsersTable's
      // actual write behavior — tidum_admin_users keeps the original mixed case.
      const {
        rows: [userRow],
      } = await dynamicDbPool.query(
        `INSERT INTO users (username, password, email, role_id) VALUES ($1, 'x', $2, $3) RETURNING id`,
        [`jwt_case_join_user_${Date.now()}`, mixedCaseEmail.toLowerCase(), role.id],
      );
      userId = userRow.id;

      const token = jwt.sign({ id: adminUserId, username: "x", role: "vendor_admin" }, JWT_SECRET);
      const res = await request(app).get("/__test/roleId").set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.roleId).toBe(role.id);
    } finally {
      if (userId) await dynamicDbPool.query(`DELETE FROM users WHERE id = $1`, [userId]);
      if (adminUserId) await dynamicDbPool.query(`DELETE FROM tidum_admin_users WHERE id = $1`, [adminUserId]);
      await dynamicDb.delete(roles).where(eq(roles.id, role.id));
    }
  });

  it("tidum_admin_users-shaped JWT with no linked users row falls back to the real system role by name (not undefined, not blindly super_admin)", async () => {
    const email = `jwt-fallback-noname-${Date.now()}@example.com`;
    let adminUserId: number | undefined;

    try {
      const {
        rows: [adminUserRow],
      } = await dynamicDbPool.query(
        `INSERT INTO tidum_admin_users (username, email, password_hash, role) VALUES ($1, $2, 'x', 'vendor_admin') RETURNING id`,
        [`jwt_fallback_noname_${Date.now()}`, email],
      );
      adminUserId = adminUserRow.id;

      const [vendorAdminRole] = await dynamicDb
        .select()
        .from(roles)
        .where(eq(roles.name, "vendor_admin"));
      expect(vendorAdminRole?.id).toBeTruthy();

      const token = jwt.sign({ id: adminUserId, username: "x", role: "vendor_admin" }, JWT_SECRET);
      const res = await request(app).get("/__test/roleId").set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.roleId).toBe(vendorAdminRole.id);
    } finally {
      if (adminUserId) await dynamicDbPool.query(`DELETE FROM tidum_admin_users WHERE id = $1`, [adminUserId]);
    }
  });

  it("tidum_admin_users-shaped JWT whose paired users row has role_id = NULL (explicitly unassigned via 'Fjern') resolves to undefined, not the name-based fallback", async () => {
    const email = `jwt-unassigned-${Date.now()}@example.com`;
    let adminUserId: number | undefined;
    let userId: string | undefined;

    try {
      const {
        rows: [adminUserRow],
      } = await dynamicDbPool.query(
        `INSERT INTO tidum_admin_users (username, email, password_hash, role) VALUES ($1, $2, 'x', 'vendor_admin') RETURNING id`,
        [`jwt_unassigned_${Date.now()}`, email],
      );
      adminUserId = adminUserRow.id;

      // A paired users row exists (matched on email) but role_id is
      // explicitly NULL — this is what PATCH /api/admin/users/:id/role
      // {roleId: null} ("Fjern") produces. The row's existence, not its
      // role_id value, must stop the fallthrough to the name-based fallback.
      const {
        rows: [userRow],
      } = await dynamicDbPool.query(
        `INSERT INTO users (username, password, email, role_id) VALUES ($1, 'x', $2, NULL) RETURNING id`,
        [`jwt_unassigned_user_${Date.now()}`, email],
      );
      userId = userRow.id;

      const token = jwt.sign({ id: adminUserId, username: "x", role: "vendor_admin" }, JWT_SECRET);
      const res = await request(app).get("/__test/roleId").set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.roleId).toBeUndefined();
    } finally {
      if (userId) await dynamicDbPool.query(`DELETE FROM users WHERE id = $1`, [userId]);
      if (adminUserId) await dynamicDbPool.query(`DELETE FROM tidum_admin_users WHERE id = $1`, [adminUserId]);
    }
  });

  it("unknown string-shaped users JWT skips the integer admin-id lookup and fails closed", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const token = jwt.sign(
        { id: `test-string-jwt-${Date.now()}`, role: "vendor_admin" },
        JWT_SECRET,
      );
      const res = await request(app).get("/__test/roleId").set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.roleId).toBeUndefined();
      expect(errorSpy).not.toHaveBeenCalledWith(
        "[authenticateAdmin] failed tidum_admin_users email-join roleId lookup",
        expect.anything(),
      );
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("does not let a numeric admin-token collide into an unrelated users.id", async () => {
    const [vendorAdminRole] = await dynamicDb
      .select()
      .from(roles)
      .where(eq(roles.name, "vendor_admin"));
    const [superAdminRole] = await dynamicDb
      .select()
      .from(roles)
      .where(eq(roles.name, "super_admin"));
    const marker = Date.now();
    const adminRow = await dynamicDbPool.query(
      `INSERT INTO tidum_admin_users (username, email, password_hash, role)
       VALUES ($1, $2, 'x', 'vendor_admin') RETURNING id`,
      [`cms_collision_admin_${marker}`, `cms-collision-admin-${marker}@example.com`],
    );
    const adminId = adminRow.rows[0].id;
    await dynamicDbPool.query(
      `INSERT INTO users (id, username, password, email, role, role_id)
       VALUES ($1, $2, 'x', $3, 'super_admin', $4)`,
      [String(adminId), `cms_collision_user_${marker}`, `cms-collision-user-${marker}@example.com`, superAdminRole.id],
    );

    try {
      const token = jwt.sign({ id: adminId, role: "vendor_admin" }, JWT_SECRET);
      const response = await request(app).get("/__test/roleId").set("Authorization", `Bearer ${token}`);
      expect(response.status).toBe(200);
      expect(response.body.roleId).toBe(vendorAdminRole.id);
    } finally {
      await dynamicDbPool.query("DELETE FROM users WHERE id = $1", [String(adminId)]);
      await dynamicDbPool.query("DELETE FROM tidum_admin_users WHERE id = $1", [adminId]);
    }
  });

  it("allows only a currently assigned cms.manage role into the global CMS control plane", async () => {
    const migrationSql = readFileSync("migrations/078_cms_control_plane_security.sql", "utf8");
    await dynamicDbPool.query(migrationSql);
    const roleRows = await dynamicDbPool.query(
      `SELECT id, name FROM tidum_roles WHERE name IN ('super_admin', 'vendor_admin') AND is_system_default = true`,
    );
    const superRoleId = roleRows.rows.find((row) => row.name === "super_admin")?.id;
    const vendorRoleId = roleRows.rows.find((row) => row.name === "vendor_admin")?.id;
    expect(superRoleId).toBeTruthy();
    expect(vendorRoleId).toBeTruthy();

    const marker = Date.now();
    const inserted = await dynamicDbPool.query(
      `INSERT INTO users (username, password, email, role, role_id)
       VALUES ($1, 'x', $2, 'super_admin', $3), ($4, 'x', $5, 'vendor_admin', $6)
       RETURNING id, role`,
      [
        `cms_super_${marker}`,
        `cms-super-${marker}@example.com`,
        superRoleId,
        `cms_vendor_${marker}`,
        `cms-vendor-${marker}@example.com`,
        vendorRoleId,
      ],
    );
    const superUser = inserted.rows.find((row) => row.role === "super_admin");
    const vendorUser = inserted.rows.find((row) => row.role === "vendor_admin");

    try {
      const vendorToken = jwt.sign({ id: vendorUser.id, role: "super_admin", roleId: superRoleId }, JWT_SECRET);
      const denied = await request(app)
        .get("/api/cms/__test/roleId")
        .set("Authorization", `Bearer ${vendorToken}`);
      expect(denied.status).toBe(403);

      const superToken = jwt.sign({ id: superUser.id, role: "vendor_admin", roleId: vendorRoleId }, JWT_SECRET);
      const allowed = await request(app)
        .get("/api/cms/__test/roleId")
        .set("Authorization", `Bearer ${superToken}`);
      expect(allowed.status).toBe(200);
      expect(allowed.body.roleId).toBe(superRoleId);
    } finally {
      await dynamicDbPool.query("DELETE FROM users WHERE id = ANY($1::text[])", [inserted.rows.map((row) => row.id)]);
    }
  });
});
