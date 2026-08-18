import { describe, it, expect, afterEach } from "vitest";
import { db } from "../../db";
import { roles } from "@shared/models/permissions";
import { eq } from "drizzle-orm";
import request from "supertest";
import express from "express";
import { registerSmartTimingRoutes, authenticateAdmin } from "../../smartTimingRoutes";

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
    process.env.NODE_ENV = "development";

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
    registerSmartTimingRoutes(app);

    const res = await request(app).get("/__test/roleId");
    expect(res.status).toBe(200);
    expect(res.body.roleId).toBe(superAdmin.id);
  });
});
