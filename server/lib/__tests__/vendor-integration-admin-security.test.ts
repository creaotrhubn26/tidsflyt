import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { pool } from "../../db";
import {
  requireIntegrationAdmin,
  requireVendorAuth,
  requireVendorDataAdmin,
  requireVendorMember,
} from "../../custom-auth";
import { registerPowerOfficeRoutes } from "../../routes/poweroffice-routes";

type Identity = {
  id: string;
  email: string;
  role: string;
  vendorId?: number | null;
};

describe("fresh vendor credential and PowerOffice authorization", () => {
  const nonce = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`;
  const globalId = `vendor-control-global-${nonce}`;
  const hovedadminId = `vendor-control-hoved-${nonce}`;
  const vendorAdminId = `vendor-control-admin-${nonce}`;
  const leaderId = `vendor-control-leader-${nonce}`;
  const memberId = `vendor-control-member-${nonce}`;
  const ownWorkerId = `vendor-control-worker-a-${nonce}`;
  const foreignWorkerId = `vendor-control-worker-b-${nonce}`;
  const globalEmail = `vendor-control-global-${nonce}@example.com`;
  const hovedadminEmail = `vendor-control-hoved-${nonce}@example.com`;
  const vendorAdminEmail = `vendor-control-admin-${nonce}@example.com`;
  let vendorAId = 0;
  let vendorBId = 0;
  let superAdminRoleId = "";
  let vendorAdminRoleId = "";

  function appFor(identity: Identity) {
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.user = { ...identity };
      req.session = { passport: { user: { ...identity } } };
      req.isAuthenticated = () => true;
      next();
    });
    app.get("/test/vendor-credentials", requireVendorAuth, (req: any, res) => {
      res.json({ vendorId: req.vendorId, role: req.userRole });
    });
    app.get("/test/vendor-data", requireVendorDataAdmin, (req: any, res) => {
      res.json({ vendorId: req.vendorId, role: req.userRole });
    });
    app.get("/test/vendor-member", requireVendorMember, (req: any, res) => {
      res.json({ vendorId: req.vendorId, role: req.userRole });
    });
    app.get("/test/integration-admin", requireIntegrationAdmin, (req: any, res) => {
      res.json({ vendorId: req.vendorId ?? null, role: req.userRole, isSuperAdmin: req.isSuperAdmin });
    });
    registerPowerOfficeRoutes(app);
    return app;
  }

  beforeAll(async () => {
    const roles = await pool.query(
      `SELECT name, id
         FROM tidum_roles
        WHERE name IN ('super_admin', 'vendor_admin')
          AND scope = 'global'
          AND vendor_id IS NULL
          AND is_system_default = true`,
    );
    superAdminRoleId = roles.rows.find((row) => row.name === "super_admin")?.id ?? "";
    vendorAdminRoleId = roles.rows.find((row) => row.name === "vendor_admin")?.id ?? "";
    if (!superAdminRoleId || !vendorAdminRoleId) throw new Error("Missing canonical admin roles");

    const vendors = await pool.query(
      `INSERT INTO tidum_vendors (name, slug, settings)
       VALUES ($1, $2, '{}'::jsonb), ($3, $4, '{}'::jsonb)
       RETURNING id, slug`,
      [
        `Vendor control A ${nonce}`,
        `vendor-control-a-${nonce}`,
        `Vendor control B ${nonce}`,
        `vendor-control-b-${nonce}`,
      ],
    );
    vendorAId = Number(vendors.rows.find((row) => row.slug === `vendor-control-a-${nonce}`).id);
    vendorBId = Number(vendors.rows.find((row) => row.slug === `vendor-control-b-${nonce}`).id);

    await pool.query(
      `INSERT INTO users (id, username, password, email, role, role_id, vendor_id)
       VALUES
         ($1, $2, 'x', $3, 'super_admin', $4, NULL),
         ($5, $6, 'x', $7, 'hovedadmin', NULL, $8),
         ($9, $10, 'x', $11, 'vendor_admin', $12, $8),
         ($13, $14, 'x', $15, 'tiltaksleder', NULL, $8),
         ($16, $17, 'x', $18, 'member', NULL, $8),
         ($19, $20, 'x', $21, 'miljoarbeider', NULL, $8),
         ($22, $23, 'x', $24, 'miljoarbeider', NULL, $25)`,
      [
        globalId, `vendor_control_global_${nonce}`, globalEmail, superAdminRoleId,
        hovedadminId, `vendor_control_hoved_${nonce}`, hovedadminEmail, vendorAId,
        vendorAdminId, `vendor_control_admin_${nonce}`, vendorAdminEmail, vendorAdminRoleId,
        leaderId, `vendor_control_leader_${nonce}`, `vendor-control-leader-${nonce}@example.com`,
        memberId, `vendor_control_member_${nonce}`, `vendor-control-member-${nonce}@example.com`,
        ownWorkerId, `vendor_control_worker_a_${nonce}`, `vendor-control-worker-a-${nonce}@example.com`,
        foreignWorkerId, `vendor_control_worker_b_${nonce}`, `vendor-control-worker-b-${nonce}@example.com`, vendorBId,
      ],
    );
    await pool.query(
      `INSERT INTO tidum_admin_users (username, email, password_hash, role, vendor_id, is_active)
       VALUES
         ($1, $2, 'x', 'super_admin', NULL, true),
         ($3, $4, 'x', 'hovedadmin', $5, true),
         ($6, $7, 'x', 'vendor_admin', $5, true)`,
      [
        `vendor_control_global_admin_${nonce}`, globalEmail,
        `vendor_control_hoved_admin_${nonce}`, hovedadminEmail, vendorAId,
        `vendor_control_vendor_admin_${nonce}`, vendorAdminEmail,
      ],
    );
    await pool.query(
      `INSERT INTO tidum_vendor_integrations (vendor_id, provider, client_key, label, status)
       VALUES ($1, 'poweroffice', $2, $3, 'active'), ($4, 'poweroffice', $5, $6, 'active')`,
      [vendorAId, `client-a-${nonce}`, `PowerOffice A ${nonce}`, vendorBId, `client-b-${nonce}`, `PowerOffice B ${nonce}`],
    );
  }, 60_000);

  beforeEach(async () => {
    delete process.env.ALLOW_DEV_AUTH_BYPASS;
    await pool.query(
      `UPDATE users
          SET role = 'hovedadmin', role_id = NULL, vendor_id = $1, kommune_id = NULL
        WHERE id = $2`,
      [vendorAId, hovedadminId],
    );
    await pool.query(
      `UPDATE users
          SET role = 'vendor_admin', role_id = $1, vendor_id = $2, kommune_id = NULL
        WHERE id = $3`,
      [vendorAdminRoleId, vendorAId, vendorAdminId],
    );
    await pool.query(
      `UPDATE users SET role = 'tiltaksleder', role_id = NULL, vendor_id = $1, kommune_id = NULL WHERE id = $2`,
      [vendorAId, leaderId],
    );
    await pool.query(
      `UPDATE users SET role = 'member', role_id = NULL, vendor_id = $1, kommune_id = NULL WHERE id = $2`,
      [vendorAId, memberId],
    );
    await pool.query(
      `UPDATE users SET role = 'super_admin', role_id = $1, vendor_id = NULL, kommune_id = NULL WHERE id = $2`,
      [superAdminRoleId, globalId],
    );
    await pool.query(
      `UPDATE tidum_admin_users SET is_active = true
        WHERE email = ANY($1::text[])`,
      [[globalEmail, hovedadminEmail, vendorAdminEmail]],
    );
    await pool.query(
      `DELETE FROM tidum_poweroffice_employee_mappings WHERE vendor_id = ANY($1::int[])`,
      [[vendorAId, vendorBId]],
    ).catch(() => undefined);
  });

  afterAll(async () => {
    await pool.query(
      `DELETE FROM tidum_poweroffice_employee_mappings WHERE vendor_id = ANY($1::int[])`,
      [[vendorAId, vendorBId]],
    ).catch(() => undefined);
    await pool.query(
      `DELETE FROM tidum_vendor_integrations WHERE vendor_id = ANY($1::int[])`,
      [[vendorAId, vendorBId]],
    ).catch(() => undefined);
    await pool.query(
      `DELETE FROM tidum_admin_users WHERE email = ANY($1::text[])`,
      [[globalEmail, hovedadminEmail, vendorAdminEmail]],
    ).catch(() => undefined);
    await pool.query(
      `DELETE FROM users WHERE id = ANY($1::text[])`,
      [[globalId, hovedadminId, vendorAdminId, leaderId, memberId, ownWorkerId, foreignWorkerId]],
    ).catch(() => undefined);
    await pool.query(
      `DELETE FROM tidum_vendors WHERE id = ANY($1::int[])`,
      [[vendorAId, vendorBId]],
    ).catch(() => undefined);
  });

  it("uses fresh tenant membership and revokes a stale hovedadmin session", async () => {
    const app = appFor({ id: hovedadminId, email: hovedadminEmail, role: "super_admin", vendorId: vendorBId });
    const fresh = await request(app).get("/test/vendor-credentials");
    expect(fresh.status).toBe(200);
    expect(fresh.body).toEqual({ vendorId: vendorAId, role: "hovedadmin" });

    await pool.query("UPDATE users SET role = 'member' WHERE id = $1", [hovedadminId]);
    expect((await request(app).get("/test/vendor-credentials")).status).toBe(403);
  });

  it("requires the canonical vendor_admin role assignment and active admin grant", async () => {
    const app = appFor({ id: vendorAdminId, email: vendorAdminEmail, role: "hovedadmin", vendorId: vendorBId });
    expect((await request(app).get("/test/vendor-credentials")).body.vendorId).toBe(vendorAId);

    await pool.query("UPDATE users SET role_id = NULL WHERE id = $1", [vendorAdminId]);
    expect((await request(app).get("/test/vendor-credentials")).status).toBe(403);

    await pool.query("UPDATE users SET role_id = $1 WHERE id = $2", [vendorAdminRoleId, vendorAdminId]);
    await pool.query("UPDATE tidum_admin_users SET is_active = false WHERE email = $1", [vendorAdminEmail]);
    expect((await request(app).get("/test/vendor-credentials")).status).toBe(403);
  });

  it("allows an operational leader only through the data-admin boundary", async () => {
    const app = appFor({
      id: leaderId,
      email: `vendor-control-leader-${nonce}@example.com`,
      role: "vendor_admin",
      vendorId: vendorBId,
    });
    expect((await request(app).get("/test/vendor-data")).body).toEqual({ vendorId: vendorAId, role: "tiltaksleder" });
    expect((await request(app).get("/test/vendor-credentials")).status).toBe(403);
    expect((await request(app).get("/api/integrations/poweroffice/status")).status).toBe(403);
  });

  it("derives member tenant and role freshly for integration demand", async () => {
    const app = appFor({
      id: memberId,
      email: `vendor-control-member-${nonce}@example.com`,
      role: "super_admin",
      vendorId: vendorBId,
    });
    expect((await request(app).get("/test/vendor-member")).body).toEqual({
      vendorId: vendorAId,
      role: "member",
    });
  });

  it("separates global integration control from tenant integration administration", async () => {
    const globalApp = appFor({ id: globalId, email: globalEmail, role: "hovedadmin", vendorId: vendorBId });
    expect((await request(globalApp).get("/test/integration-admin")).body).toEqual({
      vendorId: null,
      role: "super_admin",
      isSuperAdmin: true,
    });

    const tenantApp = appFor({ id: hovedadminId, email: hovedadminEmail, role: "super_admin", vendorId: vendorBId });
    expect((await request(tenantApp).get("/test/integration-admin")).body).toEqual({
      vendorId: vendorAId,
      role: "hovedadmin",
      isSuperAdmin: false,
    });

    const leaderApp = appFor({
      id: leaderId,
      email: `vendor-control-leader-${nonce}@example.com`,
      role: "super_admin",
      vendorId: vendorBId,
    });
    expect((await request(leaderApp).get("/test/integration-admin")).status).toBe(403);
  });

  it("keeps global supplier admin outside customer credentials but allows visibility control", async () => {
    const app = appFor({ id: globalId, email: globalEmail, role: "hovedadmin", vendorId: vendorBId });
    expect((await request(app).get(`/test/vendor-credentials?vendorId=${vendorBId}`)).status).toBe(403);
    expect((await request(app).get("/api/integrations/poweroffice/status")).status).toBe(403);

    const visibility = await request(app)
      .patch(`/api/admin/vendors/${vendorBId}/poweroffice/visibility`)
      .send({ hidden: true, reason: "Security boundary test" });
    expect(visibility.status).toBe(200);
    expect(visibility.body).toMatchObject({ vendorId: vendorBId, hidden: true });
  });

  it("returns only the fresh actor tenant's PowerOffice state", async () => {
    const app = appFor({ id: hovedadminId, email: hovedadminEmail, role: "hovedadmin", vendorId: vendorBId });
    const response = await request(app).get("/api/integrations/poweroffice/status");
    expect(response.status).toBe(200);
    expect(response.body.label).toBe(`PowerOffice A ${nonce}`);
    expect(response.body.vendorId).toBe(vendorAId);
    expect(response.body).not.toHaveProperty("clientKey");
  });

  it("blocks a forged admin claim and stale role on PowerOffice routes", async () => {
    const forgedMember = appFor({
      id: memberId,
      email: `vendor-control-member-${nonce}@example.com`,
      role: "hovedadmin",
      vendorId: vendorAId,
    });
    expect((await request(forgedMember).get("/api/integrations/poweroffice/status")).status).toBe(403);

    const staleHovedadmin = appFor({ id: hovedadminId, email: hovedadminEmail, role: "hovedadmin", vendorId: vendorAId });
    await pool.query("UPDATE users SET role = 'member' WHERE id = $1", [hovedadminId]);
    expect((await request(staleHovedadmin).get("/api/integrations/poweroffice/status")).status).toBe(403);
  });

  it("rejects cross-tenant and ineligible PowerOffice mappings", async () => {
    const app = appFor({ id: hovedadminId, email: hovedadminEmail, role: "hovedadmin", vendorId: vendorAId });
    const foreign = await request(app)
      .post("/api/integrations/poweroffice/mappings")
      .send({ tidumUserId: foreignWorkerId, poEmployeeId: "PO-FOREIGN" });
    expect(foreign.status).toBe(404);

    const ineligible = await request(app)
      .post("/api/integrations/poweroffice/mappings")
      .send({ tidumUserId: memberId, poEmployeeId: "PO-MEMBER" });
    expect(ineligible.status).toBe(404);

    const own = await request(app)
      .post("/api/integrations/poweroffice/mappings")
      .send({ tidumUserId: ownWorkerId, poEmployeeId: "PO-OWN", employeeName: "Own worker" });
    expect(own.status).toBe(200);
    expect(own.body).toMatchObject({ vendorId: vendorAId, tidumUserId: ownWorkerId, poEmployeeId: "PO-OWN" });

    const rows = await pool.query(
      `SELECT vendor_id, tidum_user_id FROM tidum_poweroffice_employee_mappings
        WHERE vendor_id = $1`,
      [vendorAId],
    );
    expect(rows.rows).toEqual([{ vendor_id: vendorAId, tidum_user_id: ownWorkerId }]);
  });

  it("rejects a cross-tenant user filter before a PowerOffice push", async () => {
    const app = appFor({ id: hovedadminId, email: hovedadminEmail, role: "hovedadmin", vendorId: vendorAId });
    const response = await request(app)
      .post("/api/integrations/poweroffice/push-timer")
      .send({ month: "2026-08", userId: foreignWorkerId });
    expect(response.status).toBe(404);
  });
});
