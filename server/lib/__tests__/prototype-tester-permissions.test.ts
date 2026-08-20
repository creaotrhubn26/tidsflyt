import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express from "express";
import jwt from "jsonwebtoken";
import { db } from "../../db";
import { roles } from "@shared/models/permissions";
import { eq } from "drizzle-orm";

// Samme fallback-kjede som JWT_SECRET i server/smartTimingRoutes.ts —
// konstanten selv er modul-privat og ikke eksportert, så testen regner den
// ut identisk fra samme miljøvariabler i stedet for å importere den.
const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || "change-me-in-production";

function signAdminToken(payload: { id: string; email: string; role: string; roleId?: string }) {
  return jwt.sign(payload, JWT_SECRET);
}

describe("prototype-tester and expected-ssn routes use hasPermission()", () => {
  // smartTimingRoutes.ts's isDevMode (`NODE_ENV !== 'production'`) is a
  // module-load-time constant, and Vitest's default NODE_ENV is "test" —
  // which trips the dev-mode bypass in authenticateAdmin and signs every
  // request in as the real super_admin, ignoring our crafted JWT entirely.
  // Force NODE_ENV to "production" and re-import the module fresh so these
  // tests actually exercise the JWT + hasPermission() path — the only path
  // this permission check matters on in real deployments.
  //
  // This is done ONCE for the whole file (not per test case): isDevMode is
  // baked into the fresh module instance at import time, so all 4 requests
  // below can share the single resulting `app`. Re-importing per test case
  // would re-run registerSmartTimingRoutes()'s fire-and-forget bootstrap
  // side effects (blog tables, report tables, etc.) 4x over, and — worse —
  // would leave the pool from the last iteration closed almost immediately
  // after creation, racing its own still-in-flight bootstrap queries
  // ("Cannot use a pool after calling end on the pool"). One shared app
  // means one pool that stays open for the whole file's runtime, giving its
  // background bootstrap chain time to finish before afterAll closes it.
  let app: express.Express;
  let dynamicDbPool: { end: () => Promise<void> };

  beforeAll(async () => {
    const prevNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    vi.resetModules();
    const { registerSmartTimingRoutes } = await import("../../smartTimingRoutes");
    // Same reset module graph, so this resolves to the identical fresh
    // db.ts instance (and Pool) that smartTimingRoutes.ts imported
    // internally — grabbed here so afterAll can close it.
    ({ pool: dynamicDbPool } = await import("../../db"));
    process.env.NODE_ENV = prevNodeEnv;

    app = express();
    app.use(express.json());
    registerSmartTimingRoutes(app);
  });

  afterAll(async () => {
    // registerSmartTimingRoutes() also kicks off unrelated fire-and-forget
    // app-bootstrap chains (blog seed/tables, report tables, etc.) against
    // this same pool that we have no handle to await — they're not part of
    // what these tests exercise. A short grace period lets them settle
    // before we close the pool, instead of racing "Cannot use a pool after
    // calling end on the pool" into stderr. ponytail: fixed delay, not a
    // real wait — if this ever flakes, the fix is on the app side (return/
    // await those bootstrap promises from registerSmartTimingRoutes).
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await dynamicDbPool.end();
  });

  const cases: Array<[string, string, string]> = [
    ["GET", "/api/prototype-testers", "test_role_no_role_manage"],
    ["POST", "/api/prototype-testers", "test_role_no_invite"],
    [
      "POST",
      "/api/prototype-testers/00000000-0000-0000-0000-000000000000/convert-to-vendor-admin",
      "test_role_no_convert",
    ],
    ["PATCH", "/api/admin/users/expected-ssn", "test_role_no_expected_ssn"],
  ];

  for (const [method, path, roleName] of cases) {
    it(`${method} ${path} rejects a role without the matching permission`, async () => {
      const [role] = await db.insert(roles).values({ name: roleName, scope: "global" }).returning();

      try {
        // role: 'super_admin' deliberately — the legacy string check
        // (`req.admin.role !== 'super_admin'`) trusts this field blindly
        // and would ALLOW the request. roleId points to a role that
        // genuinely has no permissions granted, so hasPermission()
        // correctly denies.
        const token = signAdminToken({ id: "test-user", email: "t@example.com", role: "super_admin", roleId: role.id });

        const res = await (request(app) as any)
          [method.toLowerCase()](path)
          .set("Authorization", `Bearer ${token}`)
          .send({});

        expect(res.status).toBe(403);
      } finally {
        // Runs even if the assertion above throws, so a real regression or
        // a flaky run never leaves a stray role row behind in the real DB.
        await db.delete(roles).where(eq(roles.id, role.id));
      }
    });
  }
});
