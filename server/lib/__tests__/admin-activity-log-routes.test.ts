import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import jwt from "jsonwebtoken";
import type { db as DbType, pool as PoolType } from "../../db";
import { roles } from "@shared/models/permissions";
import { eq } from "drizzle-orm";

const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || "change-me-in-production";

describe("admin activity log routes", () => {
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
    return jwt.sign({ id: "test-activity-super-admin", email: "sa@example.com", role: "super_admin", roleId: role.id }, JWT_SECRET);
  }

  async function signVendorAdminToken() {
    const [role] = await db.select().from(roles).where(eq(roles.name, "vendor_admin")).limit(1);
    return jwt.sign({ id: "test-activity-vendor-admin", email: "va@example.com", role: "vendor_admin", roleId: role.id }, JWT_SECRET);
  }

  afterEach(async () => {
    await pool.query(`DELETE FROM tidum_admin_activity_log WHERE user_id LIKE 'test-activity-%'`);
  });

  it("POST /api/admin/activity/page-view logs a page_view row", async () => {
    const token = await signSuperAdminToken();
    const res = await request(app)
      .post("/api/admin/activity/page-view")
      .set("Authorization", `Bearer ${token}`)
      .send({ path: "/admin/roller" });

    expect(res.status).toBe(201);
    const { rows } = await pool.query(
      `SELECT event_type, path FROM tidum_admin_activity_log WHERE user_id = 'test-activity-super-admin'`,
    );
    expect(rows.length).toBe(1);
    expect(rows[0].event_type).toBe("page_view");
    expect(rows[0].path).toBe("/admin/roller");
  });

  it("POST /api/admin/activity/page-view rejects a path that doesn't start with /admin", async () => {
    const token = await signSuperAdminToken();
    const res = await request(app)
      .post("/api/admin/activity/page-view")
      .set("Authorization", `Bearer ${token}`)
      .send({ path: "/not-admin" });

    expect(res.status).toBe(400);
  });

  it("a mutation through an unrelated authenticateAdmin route logs a mutation row with the real status code", async () => {
    const token = await signVendorAdminToken();
    // attachActivityLogging() skips writing when NODE_ENV === "test" (fix
    // for stray rows from unrelated test files that don't know this table
    // exists — see server/smartTimingRoutes.ts). Vitest sets NODE_ENV to
    // "test" for the whole run, including this file, so this test — whose
    // entire point is to prove attachActivityLogging DOES write — must
    // temporarily flip it for the duration of this one request, same
    // pattern beforeAll already uses around the module import.
    const prevNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    let res: request.Response;
    try {
      // vendor_admin has no role.manage, so this 403s — the log should still
      // record the attempt, with status_code 403, not just successes.
      res = await request(app)
        .post("/api/admin/roles")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "should_not_be_created", scope: "global" });
    } finally {
      process.env.NODE_ENV = prevNodeEnv;
    }
    expect(res.status).toBe(403);

    // res.on('finish') fires asynchronously after the response is sent —
    // give it a moment before querying.
    await new Promise((resolve) => setTimeout(resolve, 200));
    const { rows } = await pool.query(
      `SELECT event_type, method, path, status_code FROM tidum_admin_activity_log WHERE user_id = 'test-activity-vendor-admin'`,
    );
    expect(rows.length).toBe(1);
    expect(rows[0].event_type).toBe("mutation");
    expect(rows[0].method).toBe("POST");
    expect(rows[0].path).toBe("/api/admin/roles");
    expect(rows[0].status_code).toBe(403);
  });

  it("a GET request does not log a mutation row", async () => {
    const token = await signSuperAdminToken();
    await request(app)
      .get("/api/admin/permissions")
      .set("Authorization", `Bearer ${token}`);

    await new Promise((resolve) => setTimeout(resolve, 200));
    const { rows } = await pool.query(
      `SELECT 1 FROM tidum_admin_activity_log WHERE user_id = 'test-activity-super-admin' AND event_type = 'mutation'`,
    );
    expect(rows.length).toBe(0);
  });

  it("GET /api/admin/activity rejects a caller without activity_log.view", async () => {
    const token = await signVendorAdminToken();
    const res = await request(app)
      .get("/api/admin/activity")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("GET /api/admin/activity returns entries, filterable by userId", async () => {
    const token = await signSuperAdminToken();
    await request(app)
      .post("/api/admin/activity/page-view")
      .set("Authorization", `Bearer ${token}`)
      .send({ path: "/admin/roller" });

    const res = await request(app)
      .get("/api/admin/activity")
      .query({ userId: "test-activity-super-admin" })
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.every((r: any) => r.user_id === "test-activity-super-admin")).toBe(true);
  });
});
