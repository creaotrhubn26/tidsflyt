import { describe, it, expect, vi, afterAll } from "vitest";
import request from "supertest";
import express from "express";
import jwt from "jsonwebtoken";
import { db } from "../../db";
import { roles } from "@shared/models/permissions";
import { eq } from "drizzle-orm";

// Samme fallback-kjede som JWT_SECRET i server/smartTimingRoutes.ts:41 —
// konstanten selv er modul-privat og ikke eksportert, så testen regner den
// ut identisk fra samme miljøvariabler i stedet for å importere den.
const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || "change-me-in-production";

function signAdminToken(payload: { id: string; email: string; role: string; roleId?: string }) {
  return jwt.sign(payload, JWT_SECRET);
}

describe("vendor routes use hasPermission()", () => {
  // vi.resetModules() below forces a fresh import of server/db.ts (see
  // comment in the test), which eagerly opens its own pg Pool (up to 20
  // connections) at module load. Close it here rather than letting it
  // idle-timeout on its own.
  let dynamicDbPool: { end: () => Promise<void> } | undefined;
  afterAll(async () => {
    await dynamicDbPool?.end();
  });

  it("rejects vendor admin creation without vendor.admin.create permission", async () => {
    // smartTimingRoutes.ts's isDevMode (`NODE_ENV !== 'production'`) is a
    // module-load-time constant, and Vitest's default NODE_ENV is "test" —
    // which trips the dev-mode bypass in authenticateAdmin and signs every
    // request in as the real super_admin (who legitimately has
    // vendor.admin.create), ignoring our crafted JWT entirely. Force
    // NODE_ENV to "production" and re-import the module fresh so this test
    // actually exercises the JWT + hasPermission() path — the only path
    // this permission check matters on in real deployments.
    const prevNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    vi.resetModules();
    const { registerSmartTimingRoutes } = await import("../../smartTimingRoutes");
    // Same reset module graph, so this resolves to the identical fresh
    // db.ts instance (and Pool) that smartTimingRoutes.ts imported
    // internally — grabbed here so afterAll can close it.
    ({ pool: dynamicDbPool } = await import("../../db"));
    process.env.NODE_ENV = prevNodeEnv;

    const [role] = await db
      .insert(roles)
      .values({ name: "test_role_no_vendor_perm", scope: "global" })
      .returning();

    try {
      const app = express();
      app.use(express.json());
      registerSmartTimingRoutes(app);

      // role: 'super_admin' deliberately — the legacy string check
      // (`req.admin.role !== 'super_admin'`) trusts this field blindly and
      // would ALLOW the request. roleId points to a role that genuinely has
      // no permissions granted, so hasPermission() correctly denies. A
      // payload with a non-super_admin role string wouldn't discriminate:
      // both the old and new checks deny it, so it can't prove the route
      // was actually migrated (verified by running this test against the
      // unmigrated route — see task-4-report.md).
      const token = signAdminToken({ id: "test-user-1", email: "t@example.com", role: "super_admin", roleId: role.id });
      const res = await request(app)
        .post("/api/vendors/1/admins")
        .set("Authorization", `Bearer ${token}`)
        .send({ username: "test", email: "test@example.com" });

      expect(res.status).toBe(403);
    } finally {
      // Runs even if the assertion above throws, so a real regression or a
      // flaky run never leaves a stray role row behind in the real DB.
      await db.delete(roles).where(eq(roles.id, role.id));
    }
  });
});
