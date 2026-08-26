import { describe, it, expect } from "vitest";
import request from "supertest";
import express from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || "change-me-in-production";

describe("GET /api/company/users/manageable-roles", () => {
  it("vendor_admin får tiltaksleder/teamleder/case_manager/miljoarbeider/member/user, ikke hovedadmin/super_admin", async () => {
    process.env.NODE_ENV = "production";
    const { registerSmartTimingRoutes } = await import("../../smartTimingRoutes");
    const app = express();
    registerSmartTimingRoutes(app);

    // vendorId: 1 matcher company_id under (BOLA-fiks A).
    const token = jwt.sign(
      { id: "test-va", email: "va@example.com", role: "vendor_admin", vendorId: 1 },
      JWT_SECRET,
    );
    const res = await request(app)
      .get("/api/company/users/manageable-roles?company_id=1")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.roles.sort()).toEqual(
      ["case_manager", "member", "miljoarbeider", "teamleder", "tiltaksleder", "user"].sort(),
    );
  });

  it("member får tom liste", async () => {
    process.env.NODE_ENV = "production";
    const { registerSmartTimingRoutes } = await import("../../smartTimingRoutes");
    const app = express();
    registerSmartTimingRoutes(app);

    const token = jwt.sign({ id: "test-member-mr", email: "m@example.com", role: "member" }, JWT_SECRET);
    const res = await request(app)
      .get("/api/company/users/manageable-roles?company_id=1")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.roles).toEqual([]);
  });

  it("preview_role brukes kun når aktøren selv kvalifiserer til å forhåndsvise", async () => {
    process.env.NODE_ENV = "production";
    const { registerSmartTimingRoutes } = await import("../../smartTimingRoutes");
    const app = express();
    registerSmartTimingRoutes(app);

    // super_admin kvalifiserer (canManageUsersDynamic er sann for super_admin)
    // og forhåndsviser som tiltaksleder — skal få tiltaksleders liste, ikke sin egen.
    const superAdminToken = jwt.sign({ id: "test-sa-preview", email: "sa@example.com", role: "super_admin" }, JWT_SECRET);
    const previewRes = await request(app)
      .get("/api/company/users/manageable-roles?company_id=1&preview_role=tiltaksleder")
      .set("Authorization", `Bearer ${superAdminToken}`);

    expect(previewRes.status).toBe(200);
    expect(previewRes.body.roles.sort()).toEqual(["member", "miljoarbeider", "user"].sort());

    // member kvalifiserer IKKE (canManageUsersDynamic er usann) — preview_role
    // skal ignoreres, member får fortsatt sin egen (tomme) liste.
    const memberToken = jwt.sign({ id: "test-member-preview", email: "mp@example.com", role: "member" }, JWT_SECRET);
    const ignoredRes = await request(app)
      .get("/api/company/users/manageable-roles?company_id=1&preview_role=super_admin")
      .set("Authorization", `Bearer ${memberToken}`);

    expect(ignoredRes.status).toBe(200);
    expect(ignoredRes.body.roles).toEqual([]);
  });
});
