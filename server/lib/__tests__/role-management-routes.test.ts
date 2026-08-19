import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import jwt from "jsonwebtoken";
import { registerSmartTimingRoutes } from "../../smartTimingRoutes";
import { db, pool } from "../../db";
import { roles } from "@shared/models/permissions";
import { eq } from "drizzle-orm";

const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || "change-me-in-production";

async function signSuperAdminToken() {
  const [role] = await db.select().from(roles).where(eq(roles.name, "super_admin")).limit(1);
  return jwt.sign({ id: "test-super-admin", email: "sa@example.com", role: "super_admin", roleId: role.id }, JWT_SECRET);
}

describe("role management routes", () => {
  // Same shared-app/shared-pool shape as prototype-tester-permissions.test.ts —
  // registerSmartTimingRoutes() kicks off fire-and-forget bootstrap side effects
  // against the pool, so one app/one pool for the whole file avoids racing
  // "Cannot use a pool after calling end on the pool" from a closed-too-early pool.
  let app: express.Express;

  beforeAll(() => {
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
    // Raw SQL, not the drizzle `users` select — the live users table is
    // missing columns the ORM schema declares (e.g. expected_ssn_hash from
    // migrations/053, not yet applied here), so a full `db.select().from(users)`
    // 500s. Only `id` is needed for this test.
    const { rows: [testUser] } = await pool.query(`SELECT id FROM users LIMIT 1`);
    await pool.query(`UPDATE users SET role_id = $1 WHERE id = $2`, [role.id, testUser.id]);

    const token = await signSuperAdminToken();
    const res = await request(app)
      .delete(`/api/admin/roles/${role.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(409);

    await pool.query(`UPDATE users SET role_id = NULL WHERE id = $1`, [testUser.id]);
  });
});
