import { describe, it, expect } from "vitest";
import request from "supertest";
import express from "express";

// BOLA regression: GET /api/company/logs and GET /api/company/audit are
// gated by requireAuth + sharedRequireAdminRole (server/middleware/auth.ts),
// but sharedRequireAdminRole's authenticate() only checks the actor's ROLE
// (e.g. teamleder), never whether the requested company_id belongs to that
// actor's own vendor. A teamleder for vendor 111 could read vendor 222's
// time logs / audit trail just by changing the company_id query param.
// Root cause: authenticate()'s session branch never copied req.user.vendorId
// onto req.authUser, so the fix's own guard (actorVendorId !== companyId)
// always saw `undefined !== companyId` — true for every companyId, but the
// guard didn't exist there at all before this fix.
describe("GET /api/company/logs and /api/company/audit are tenant-scoped", () => {
  // NODE_ENV must be "production" BEFORE the first import of
  // smartTimingRoutes.ts in this file — isDevMode is a module-load-time
  // constant, and vitest's default NODE_ENV ("test") would otherwise trip
  // the dev-mode bypass in both requireAuth and authenticate(), signing
  // every request in as super_admin regardless of the injected session user.
  process.env.NODE_ENV = "production";

  async function appWithSessionUser(vendorId: number, role = "teamleder") {
    const { registerSmartTimingRoutes } = await import("../../smartTimingRoutes");
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.user = { id: "test-teamleder", email: "tl@example.com", role, vendorId };
      req.isAuthenticated = () => true;
      next();
    });
    registerSmartTimingRoutes(app);
    return app;
  }

  it("GET /api/company/logs: 403 when company_id belongs to another vendor", async () => {
    const app = await appWithSessionUser(111);
    const res = await request(app).get("/api/company/logs?company_id=222");
    expect(res.status).toBe(403);
  });

  it("GET /api/company/logs: 200 when company_id matches the actor's own vendor", async () => {
    const app = await appWithSessionUser(111);
    const res = await request(app).get("/api/company/logs?company_id=111");
    expect(res.status).toBe(200);
  });

  it("GET /api/company/audit: 403 when company_id belongs to another vendor", async () => {
    const app = await appWithSessionUser(111);
    const res = await request(app).get("/api/company/audit?company_id=222");
    expect(res.status).toBe(403);
  });

  it("GET /api/company/audit: 200 when company_id matches the actor's own vendor", async () => {
    const app = await appWithSessionUser(111);
    const res = await request(app).get("/api/company/audit?company_id=111");
    expect(res.status).toBe(200);
  });
});
