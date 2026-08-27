import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const customAuth = readFileSync("server/custom-auth.ts", "utf8");
const globalAdminAuthorization = readFileSync("server/lib/global-admin-authorization.ts", "utf8");
const routes = readFileSync("server/routes.ts", "utf8");
const gdprRoutes = readFileSync("server/routes/gdpr-routes.ts", "utf8");
const pricingRoutes = readFileSync("server/routes/pricing-routes.ts", "utf8");
const analyticsRoutes = readFileSync("server/routes/analytics-routes.ts", "utf8");
const stripeRoutes = readFileSync("server/routes/stripe-routes.ts", "utf8");
const appRoutes = readFileSync("client/src/App.tsx", "utf8");
const accessRequestsPage = readFileSync("client/src/pages/access-requests.tsx", "utf8");

describe("global admin route contract", () => {
  it("resolves exact global super_admin from the database", () => {
    const middleware = customAuth.slice(customAuth.indexOf("export const requireSuperAdmin"));
    expect(middleware).toContain("resolveFreshGlobalSuperAdmin(req)");
    expect(middleware).not.toContain("isSuperAdminLikeRole");
    expect(middleware).toContain("hasSessionAuth(req)");
    expect(globalAdminAuthorization).toContain("assigned_role.id = u.role_id");
    expect(globalAdminAuthorization).toContain('actor.assignedAdminRole !== "super_admin"');
    expect(globalAdminAuthorization).toContain("actor.assignedAdminRoleIsSystemDefault");
  });

  it("uses the shared fresh middleware on every global control-plane family", () => {
    for (const source of [pricingRoutes, analyticsRoutes, stripeRoutes]) {
      expect(source).toContain('import { requireSuperAdmin } from "../custom-auth"');
      expect(source).toContain("requireSuperAdmin");
    }
    expect(routes).toContain("hasSessionAuth, requireSuperAdmin");
    expect(routes).not.toContain("const requireSuperAdmin = async");
    expect(routes).toContain('app.get("/api/access-requests", requireSuperAdmin');
    expect(routes).toContain('app.patch("/api/access-requests/:id", requireSuperAdmin');
  });

  it("separates global destructive GDPR actions from tenant data export", () => {
    expect(gdprRoutes).toContain("app.post('/api/admin/users/:id/erase', requireSuperAdmin");
    expect(gdprRoutes).toContain("app.post('/api/gdpr/purge/run', requireSuperAdmin");
    expect(gdprRoutes).toContain("requireVendorDataAdmin");
    expect(gdprRoutes).toContain("userBelongsToVendorDataScope");
    expect(gdprRoutes).toContain('req.body?.confirm !== "PURGE"');
    expect(gdprRoutes).not.toContain("res.status(500).json({ error: e.message })");
  });

  it("shows access-request control plane only to exact super_admin in the client", () => {
    expect(appRoutes).toContain(
      '<AuthGuard requiredRoles={["super_admin"]}><AccessRequests /></AuthGuard>',
    );
    expect(accessRequestsPage).toContain(
      'normalizeRole(effectiveRole) === "super_admin"',
    );
    expect(accessRequestsPage).not.toContain("isSuperAdminLikeRole(effectiveRole)");
  });
});
