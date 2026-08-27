import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { readFileSync } from "node:fs";
import { pool } from "../../db";
import { isAuthenticatedOrBearer, requireSuperAdmin, resolveBearerUser } from "../../custom-auth";
import { registerGdprRoutes } from "../../routes/gdpr-routes";
import { signAccessToken } from "../mobile-auth";

type Identity = {
  id: string;
  email: string;
  role: string;
  vendorId?: number | null;
};

describe("fresh global admin and tenant-scoped GDPR authorization", () => {
  const nonce = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`;
  const globalId = `global-auth-${nonce}`;
  const tenantAdminId = `tenant-admin-${nonce}`;
  const memberAId = `gdpr-member-a-${nonce}`;
  const memberBId = `gdpr-member-b-${nonce}`;
  const erasedTargetId = `gdpr-erasure-target-${nonce}`;
  const globalEmail = `global-auth-${nonce}@example.com`;
  const erasedTargetEmail = `gdpr-erasure-target-${nonce}@example.com`;
  let vendorAId = 0;
  let vendorBId = 0;
  let superAdminRoleId = "";
  let vendorAdminRoleId = "";
  let erasedPseudonym = "";
  const previousMobileSecret = process.env.MOBILE_JWT_SECRET;

  function appFor(identity: Identity) {
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.user = identity;
      req.session = { passport: { user: identity } };
      req.isAuthenticated = () => true;
      next();
    });
    app.get("/api/test/global-admin", requireSuperAdmin, (_req, res) => res.json({ ok: true }));
    registerGdprRoutes(app);
    return app;
  }

  beforeAll(async () => {
    const gdprAuditMigration = readFileSync("migrations/080_gdpr_erasure_audit.sql", "utf8");
    await pool.query(gdprAuditMigration);
    await pool.query(gdprAuditMigration);

    superAdminRoleId = (await pool.query(
      `SELECT id
         FROM tidum_roles
        WHERE name = 'super_admin'
          AND scope = 'global'
          AND vendor_id IS NULL
          AND is_system_default = true
        LIMIT 1`,
    )).rows[0]?.id;
    if (!superAdminRoleId) throw new Error("Missing canonical super_admin role fixture");
    vendorAdminRoleId = (await pool.query(
      `SELECT id
         FROM tidum_roles
        WHERE name = 'vendor_admin'
          AND scope = 'global'
          AND vendor_id IS NULL
          AND is_system_default = true
        LIMIT 1`,
    )).rows[0]?.id;
    if (!vendorAdminRoleId) throw new Error("Missing canonical vendor_admin role fixture");

    const vendors = await pool.query(
      `INSERT INTO tidum_vendors (name, slug)
       VALUES ($1, $2), ($3, $4)
       RETURNING id, slug`,
      [
        `GDPR tenant A ${nonce}`,
        `gdpr-a-${nonce}`,
        `GDPR tenant B ${nonce}`,
        `gdpr-b-${nonce}`,
      ],
    );
    vendorAId = Number(vendors.rows.find((row) => row.slug === `gdpr-a-${nonce}`).id);
    vendorBId = Number(vendors.rows.find((row) => row.slug === `gdpr-b-${nonce}`).id);

    await pool.query(
      `INSERT INTO users (id, username, password, email, role, role_id, vendor_id)
       VALUES
         ($1, $2, 'x', $3, 'super_admin', $4, NULL),
         ($5, $6, 'x', $7, 'hovedadmin', NULL, $8),
         ($9, $10, 'x', $11, 'member', NULL, $8),
         ($12, $13, 'x', $14, 'member', NULL, $15),
         ($16, $17, 'x', $18, 'vendor_admin', NULL, $8)`,
      [
        globalId,
        `global_auth_${nonce}`,
        globalEmail,
        superAdminRoleId,
        tenantAdminId,
        `tenant_admin_${nonce}`,
        `tenant-admin-${nonce}@example.com`,
        vendorAId,
        memberAId,
        `gdpr_member_a_${nonce}`,
        `gdpr-member-a-${nonce}@example.com`,
        memberBId,
        `gdpr_member_b_${nonce}`,
        `gdpr-member-b-${nonce}@example.com`,
        vendorBId,
        erasedTargetId,
        `gdpr_erasure_target_${nonce}`,
        erasedTargetEmail,
      ],
    );
    await pool.query(
      `INSERT INTO tidum_admin_users
         (username, email, password_hash, role, vendor_id, is_active)
       VALUES ($1, $2, 'x', 'super_admin', NULL, true)`,
      [`global_admin_${nonce}`, globalEmail],
    );
    await pool.query(
      `INSERT INTO tidum_admin_users
         (username, email, password_hash, role, vendor_id, is_active)
       VALUES ($1, $2, 'x', 'vendor_admin', $3, true)`,
      [`gdpr_erasure_admin_${nonce}`, erasedTargetEmail, vendorAId],
    );
    await pool.query("UPDATE users SET role_id = $1 WHERE id = $2", [vendorAdminRoleId, erasedTargetId]);
  }, 60_000);

  beforeEach(async () => {
    delete process.env.ALLOW_DEV_AUTH_BYPASS;
    await pool.query("UPDATE tidum_admin_users SET is_active = true WHERE email = $1", [globalEmail]);
    await pool.query(
      "UPDATE users SET role = 'super_admin', role_id = $1, vendor_id = NULL, kommune_id = NULL WHERE id = $2",
      [superAdminRoleId, globalId],
    );
  });

  afterAll(async () => {
    if (erasedPseudonym) {
      await pool.query("DELETE FROM tidum_gdpr_erasure_audit WHERE target_pseudonym = $1", [erasedPseudonym]).catch(() => undefined);
    }
    await pool.query("DELETE FROM tidum_admin_users WHERE email = ANY($1::text[])", [[globalEmail, erasedTargetEmail]]).catch(() => undefined);
    await pool.query(
      "DELETE FROM users WHERE id = ANY($1::text[])",
      [[globalId, tenantAdminId, memberAId, memberBId, erasedTargetId]],
    ).catch(() => undefined);
    await pool.query("DELETE FROM tidum_vendors WHERE id = ANY($1::int[])", [[vendorAId, vendorBId]]).catch(() => undefined);
    if (previousMobileSecret === undefined) delete process.env.MOBILE_JWT_SECRET;
    else process.env.MOBILE_JWT_SECRET = previousMobileSecret;
  });

  it("uses the fresh DB role and never treats hovedadmin as global super_admin", async () => {
    const forgedTenant = appFor({
      id: tenantAdminId,
      email: `tenant-admin-${nonce}@example.com`,
      role: "super_admin",
      vendorId: null,
    });
    expect((await request(forgedTenant).get("/api/test/global-admin")).status).toBe(403);

    const staleGlobal = appFor({ id: globalId, email: globalEmail, role: "member", vendorId: vendorAId });
    expect((await request(staleGlobal).get("/api/test/global-admin")).status).toBe(200);
  });

  it("revokes an existing global session after canonical role removal or admin deactivation", async () => {
    const app = appFor({ id: globalId, email: globalEmail, role: "super_admin", vendorId: null });
    await pool.query("UPDATE users SET role_id = NULL WHERE id = $1", [globalId]);
    expect((await request(app).get("/api/test/global-admin")).status).toBe(403);

    await pool.query("UPDATE users SET role_id = $1 WHERE id = $2", [superAdminRoleId, globalId]);
    await pool.query("UPDATE tidum_admin_users SET is_active = false WHERE email = $1", [globalEmail]);
    expect((await request(app).get("/api/test/global-admin")).status).toBe(403);
  });

  it("allows a fresh tenant leader to export only users in the same vendor", async () => {
    const app = appFor({
      id: tenantAdminId,
      email: `tenant-admin-${nonce}@example.com`,
      role: "super_admin",
      vendorId: vendorBId,
    });
    const ownTenant = await request(app).get(`/api/admin/users/${encodeURIComponent(memberAId)}/data-export`);
    expect(ownTenant.status).toBe(200);
    expect(ownTenant.headers["cache-control"]).toContain("no-store");
    expect(ownTenant.headers["x-content-type-options"]).toBe("nosniff");
    expect(ownTenant.headers["content-disposition"]).toContain("tidum-data-export-");
    expect(ownTenant.headers["content-disposition"]).not.toContain(memberAId);
    expect(ownTenant.body.profile.id).toBe(memberAId);

    const foreignTenant = await request(app).get(`/api/admin/users/${encodeURIComponent(memberBId)}/data-export`);
    expect(foreignTenant.status).toBe(404);
  });

  it("denies forged members and global supplier admins implicit customer export", async () => {
    const forgedMember = appFor({
      id: memberAId,
      email: `gdpr-member-a-${nonce}@example.com`,
      role: "hovedadmin",
      vendorId: vendorAId,
    });
    expect((await request(forgedMember).get(`/api/admin/users/${memberAId}/data-export`)).status).toBe(403);

    const global = appFor({ id: globalId, email: globalEmail, role: "super_admin", vendorId: null });
    expect((await request(global).get(`/api/admin/users/${memberAId}/data-export`)).status).toBe(403);
  });

  it("blocks stale tenant claims from global erasure and purge", async () => {
    const forgedTenant = appFor({
      id: tenantAdminId,
      email: `tenant-admin-${nonce}@example.com`,
      role: "super_admin",
      vendorId: null,
    });
    const erase = await request(forgedTenant)
      .post(`/api/admin/users/${memberBId}/erase`)
      .send({ confirm: true, reason: "Documented request TEST-123" });
    expect(erase.status).toBe(403);
    expect((await pool.query("SELECT COUNT(*)::int AS count FROM users WHERE id = $1", [memberBId])).rows[0].count).toBe(1);

    expect((await request(forgedTenant).post("/api/gdpr/purge/run").send({ confirm: "PURGE" })).status).toBe(403);
  });

  it("requires explicit destructive confirmation and a documented erasure reason", async () => {
    const global = appFor({ id: globalId, email: globalEmail, role: "member", vendorId: vendorAId });
    expect((await request(global).post("/api/gdpr/purge/run").send({})).status).toBe(400);
    expect((await request(global).post(`/api/admin/users/${memberAId}/erase`).send({ confirm: true })).status).toBe(400);
    expect((await pool.query("SELECT COUNT(*)::int AS count FROM users WHERE id = $1", [memberAId])).rows[0].count).toBe(1);
  });

  it("erases credentials and revokes session, mobile and eID authentication", async () => {
    process.env.MOBILE_JWT_SECRET = `gdpr-security-test-${nonce}`;
    const accessToken = signAccessToken(erasedTargetId);
    const sessionId = `gdpr-session-${nonce}`;
    await pool.query(
      `INSERT INTO tidum_sessions (sid, sess, expire)
       VALUES ($1, $2::jsonb, NOW() + INTERVAL '1 day')`,
      [sessionId, JSON.stringify({ passport: { user: { id: erasedTargetId } } })],
    );
    await pool.query(
      `INSERT INTO tidum_mobile_refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '1 day')`,
      [erasedTargetId, `gdpr-token-${nonce}`],
    );
    await pool.query(
      `INSERT INTO tidum_eid_identities (user_id, provider, sub, ssn_hash)
       VALUES ($1, 'bankid', $2, $3)`,
      [erasedTargetId, `gdpr-sub-${nonce}`, `gdpr-ssn-${nonce}`],
    );
    await pool.query("UPDATE users SET expected_ssn_hash = $1 WHERE id = $2", [`gdpr-expected-${nonce}`, erasedTargetId]);

    const global = appFor({ id: globalId, email: globalEmail, role: "member", vendorId: vendorAId });
    const response = await request(global)
      .post(`/api/admin/users/${erasedTargetId}/erase`)
      .send({ confirm: true, reason: `Documented controller request TEST-ERASURE-${nonce}` });
    expect(response.status).toBe(200);
    erasedPseudonym = response.body.pseudonym;

    const user = (await pool.query(
      `SELECT username, password, email, role, role_id, vendor_id, expected_ssn_hash
         FROM users WHERE id = $1`,
      [erasedTargetId],
    )).rows[0];
    expect(user).toMatchObject({
      username: erasedPseudonym,
      email: `${erasedPseudonym}@erased.tidum.local`,
      role: "member",
      role_id: null,
      vendor_id: vendorAId,
      expected_ssn_hash: null,
    });
    expect(user.password).not.toBe("x");
    expect((await pool.query("SELECT is_active FROM tidum_admin_users WHERE email = $1", [erasedTargetEmail])).rows[0].is_active).toBe(false);
    expect((await pool.query("SELECT COUNT(*)::int AS count FROM tidum_sessions WHERE sid = $1", [sessionId])).rows[0].count).toBe(0);
    expect((await pool.query("SELECT COUNT(*)::int AS count FROM tidum_mobile_refresh_tokens WHERE user_id = $1", [erasedTargetId])).rows[0].count).toBe(0);
    expect((await pool.query("SELECT COUNT(*)::int AS count FROM tidum_eid_identities WHERE user_id = $1", [erasedTargetId])).rows[0].count).toBe(0);
    const audit = await pool.query(
      `SELECT actor_reference, reason, status, completed_at
         FROM tidum_gdpr_erasure_audit
        WHERE target_pseudonym = $1`,
      [erasedPseudonym],
    );
    expect(audit.rows[0]).toMatchObject({
      actor_reference: globalId,
      status: "completed",
    });
    expect(audit.rows[0]?.reason).toContain(`TEST-ERASURE-${nonce}`);
    expect(audit.rows[0]?.completed_at).toBeInstanceOf(Date);

    const bearerApp = express();
    bearerApp.use(resolveBearerUser);
    bearerApp.get("/protected", isAuthenticatedOrBearer, (_req, res) => res.json({ ok: true }));
    expect((await request(bearerApp).get("/protected").set("Authorization", `Bearer ${accessToken}`)).status).toBe(401);
  });
});
