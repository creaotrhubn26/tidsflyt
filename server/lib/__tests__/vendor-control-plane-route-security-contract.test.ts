import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const customAuth = readFileSync("server/custom-auth.ts", "utf8");
const globalAuthorization = readFileSync("server/lib/global-admin-authorization.ts", "utf8");
const routes = readFileSync("server/routes.ts", "utf8");
const powerOffice = readFileSync("server/routes/poweroffice-routes.ts", "utf8");
const fristCron = readFileSync("server/routes/frist-escalation-cron.ts", "utf8");
const taskCron = readFileSync("server/routes/task-escalation-cron.ts", "utf8");
const seatCron = readFileSync("server/routes/seat-overrun-cron.ts", "utf8");
const rapportCron = readFileSync("server/routes/rapport-reminder-cron.ts", "utf8");
const timesheetCron = readFileSync("server/routes/timesheet-reminder-cron.ts", "utf8");
const roles = readFileSync("shared/roles.ts", "utf8");
const appRoutes = readFileSync("client/src/App.tsx", "utf8");
const profile = readFileSync("client/src/pages/profile.tsx", "utf8");
const vendorApiPage = readFileSync("client/src/pages/vendor-api-admin.tsx", "utf8");
const integrationPanel = readFileSync("client/src/components/integrations/integration-requests-panel.tsx", "utf8");

describe("vendor credentials and manual control-plane route contract", () => {
  it("uses fresh database actors for both tenant admin boundaries", () => {
    expect(customAuth).toContain("resolveFreshVendorCredentialAdmin");
    expect(customAuth).toContain("resolveFreshVendorDataAdmin");
    expect(customAuth).toContain("resolveFreshVendorMember");
    expect(customAuth).toContain("resolveFreshIntegrationAdmin");
    expect(customAuth).toContain("applyFreshVendorActor(req, actor)");
    expect(customAuth).toContain("hasSessionAuth(req)");
    expect(globalAuthorization).toContain("resolveFreshVendorCredentialAdmin");
    expect(globalAuthorization).toContain("canManageVendorCredentials(actor.role)");
  });

  it("removes the request-controlled local vendor API guard", () => {
    expect(routes).toContain("requireSuperAdmin");
    expect(routes).toContain("requireVendorAuth");
    expect(routes).not.toContain("const requireVendorAuth = async");
    expect(routes).not.toContain("Super admin can target a specific vendor");
    for (const path of [
      "/api/vendor/api-status",
      "/api/vendor/api-keys",
      "/api/vendor/enable-api",
    ]) {
      expect(routes).toContain(`${path}\", requireVendorAuth`);
    }
    expect(routes).toContain("const vendorApiKeyCreateSchema = z.object");
    expect(routes).toContain("id: apiKeys.id");
    expect(routes).not.toContain("Super admin can access all vendors");
  });

  it("separates supplier roadmap control from tenant integration demand", () => {
    expect(routes).toContain('"/api/integrations/requests/primary", requireVendorAuth');
    expect(routes).toContain('"/api/integrations/requests/signal", requireVendorMember');
    expect(routes).toContain('"/api/integrations/requests/me", requireVendorMember');
    expect(routes).toContain('"/api/admin/integrations/requests", requireIntegrationAdmin');
    expect(routes).toContain('"/api/admin/integrations/analytics", requireIntegrationAdmin');
    expect(routes).toContain('"/api/admin/integrations/roadmap/:integrationKey", requireSuperAdmin');
    expect(routes).toContain('"/api/admin/integrations/roadmap/:integrationKey/recalculate-score", requireSuperAdmin');
    expect(routes).not.toContain("canManageIntegrationRoadmap");
    expect(routes).not.toContain("resolveVendorIdForIntegrationRequest");
    expect(integrationPanel).toContain("canManageVendorCredentials(normalizedRole)");
    expect(integrationPanel).toContain('const canManageRoadmap = normalizedRole === "super_admin"');
  });

  it("separates global PowerOffice visibility from tenant credentials", () => {
    expect(powerOffice).toContain("/poweroffice/visibility', requireSuperAdmin");
    for (const path of [
      "/poweroffice/status",
      "/poweroffice/connect",
      "/poweroffice/disconnect",
      "/poweroffice/push-timer",
      "/poweroffice/mappings",
      "/poweroffice/vendor-users",
      "/poweroffice/test",
    ]) {
      expect(powerOffice).toContain(`${path}', requireVendorAuth`);
    }
    expect(powerOffice).not.toContain("const ADMIN_ROLES");
    expect(powerOffice).not.toContain("function isSuperAdmin");
    expect(powerOffice).toContain("isMappableVendorUser");
  });

  it("puts every global manual sweep behind the shared fresh superadmin guard", () => {
    const expected = [
      [fristCron, '"/api/admin/frist-escalation/run", requireSuperAdmin'],
      [taskCron, '"/api/task-escalations/run", requireSuperAdmin'],
      [seatCron, "'/api/admin/seat-overrun/sweep', requireSuperAdmin"],
      [rapportCron, "'/api/rapport-reminders/run', requireSuperAdmin"],
      [timesheetCron, "'/api/timesheet-reminders/run', requireSuperAdmin"],
    ] as const;
    for (const [source, declaration] of expected) {
      expect(source).toContain(declaration);
      expect(source).not.toContain("isSuperAdmin(req)");
      expect(source).not.toContain("isAdminRole(req)");
    }
    expect(timesheetCron).toContain("'/api/vendor/timesheet-deadline', requireVendorDataAdmin");
  });

  it("keeps supplier super_admin out of tenant credential UI", () => {
    expect(roles).toContain("export function canManageVendorCredentials");
    expect(appRoutes).toContain(
      '<AuthGuard requiredRoles={["vendor_admin", "hovedadmin", "admin"]}><VendorApiAdmin /></AuthGuard>',
    );
    expect(profile).toContain("canManageVendorCredentials(normalizedRole) && <PowerOfficeConnectCard />");
    expect(vendorApiPage).toContain("canManageVendorCredentials(effectiveRole)");
  });
});
