import { describe, it, expect, vi, afterAll } from "vitest";
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
  // vi.resetModules() below forces a fresh import of server/db.ts (see
  // comment inline), which eagerly opens its own pg Pool (up to 20
  // connections) at module load. Close it here rather than letting it
  // idle-timeout on its own.
  let dynamicDbPool: { end: () => Promise<void> } | undefined;
  afterAll(async () => {
    await dynamicDbPool?.end();
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
      // smartTimingRoutes.ts's isDevMode (`NODE_ENV !== 'production'`) is a
      // module-load-time constant, and Vitest's default NODE_ENV is "test" —
      // which trips the dev-mode bypass in authenticateAdmin and signs every
      // request in as the real super_admin, ignoring our crafted JWT
      // entirely. Force NODE_ENV to "production" and re-import the module
      // fresh so this test actually exercises the JWT + hasPermission()
      // path — the only path this permission check matters on in real
      // deployments.
      const prevNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";
      vi.resetModules();
      const { registerSmartTimingRoutes } = await import("../../smartTimingRoutes");
      // Same reset module graph, so this resolves to the identical fresh
      // db.ts instance (and Pool) that smartTimingRoutes.ts imported
      // internally — grabbed here so afterAll can close it.
      ({ pool: dynamicDbPool } = await import("../../db"));
      process.env.NODE_ENV = prevNodeEnv;

      const [role] = await db.insert(roles).values({ name: roleName, scope: "global" }).returning();

      try {
        const app = express();
        app.use(express.json());
        registerSmartTimingRoutes(app);

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
