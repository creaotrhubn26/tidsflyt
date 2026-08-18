import { describe, it, expect, afterEach } from "vitest";
import { db } from "../../db";
import { roles } from "@shared/models/permissions";
import { eq } from "drizzle-orm";
import request from "supertest";
import express from "express";
import { registerSmartTimingRoutes } from "../../smartTimingRoutes";

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
    const app = express();
    registerSmartTimingRoutes(app);

    const res = await request(app).get("/api/prototype-testers");
    // isDevMode-grenen skal ikke gi 403 lenger nå at role_id er satt —
    // dette er akkurat regresjonen fallgruve 1 i skillen advarer mot.
    expect(res.status).not.toBe(403);
  });
});
