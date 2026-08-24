import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import http from "http";
import { pool } from "../../db";

// Regresjon for en BOLA-sårbarhet i applyAccessRequestDecision (og hjelperne
// den kaller, ensureHovedadminForAccessRequest / syncApprovedPortalUser):
// en angriper kan navngi et vilkårlig offers e-post som alt_hovedadmin_email
// på en offentlig, selvbetjent tilgangsforespørsel (POST /api/access-requests).
// Når en super_admin/CreatorHub senere godkjenner forespørselen, overskrev
// koden UBETINGET vendor_id/role/password_hash på offerets eksisterende
// tidum_admin_users/users-rad — uansett hvilken vendor den tilhørte fra før.
// Se server/routes.ts: ensureHovedadminForAccessRequest, syncApprovedPortalUser,
// applyAccessRequestDecision.
//
// Denne testfila bruker det interne CreatorHub-synk-endepunktet
// (delt-hemmelighet i header, ikke sesjon) fordi det utløser nøyaktig samme
// applyAccessRequestDecision-kode som den sesjonsbeskyttede
// PATCH /api/access-requests/:id (super_admin) — selve autorisasjonslogikken
// under test er identisk uavhengig av hvilken rute som trigger den.
const CREATORHUB_SYNC_SECRET = "test-creatorhub-sync-secret-tenant-mismatch";
process.env.TIDUM_CREATORHUB_SYNC_SECRET = CREATORHUB_SYNC_SECRET;

describe("applyAccessRequestDecision: TENANT_MISMATCH-vakt (server/routes.ts)", () => {
  const cleanupAccessRequestIds: number[] = [];
  const cleanupAdminEmails: string[] = [];
  const cleanupUserEmails: string[] = [];

  afterEach(async () => {
    for (const id of cleanupAccessRequestIds.splice(0)) {
      await pool.query(`DELETE FROM access_requests WHERE id = $1`, [id]);
    }
    for (const email of cleanupAdminEmails.splice(0)) {
      await pool.query(`DELETE FROM tidum_admin_users WHERE email = $1`, [email]);
    }
    for (const email of cleanupUserEmails.splice(0)) {
      await pool.query(`DELETE FROM users WHERE email = $1`, [email]);
    }
  });

  async function buildApp() {
    const { registerRoutes } = await import("../../routes");
    const app = express();
    app.use(express.json());
    await registerRoutes(http.createServer(), app);
    return app;
  }

  async function insertPendingAccessRequest(overrides: {
    requesterEmail: string;
    altHovedadminEmail: string;
  }): Promise<number> {
    const {
      rows: [row],
    } = await pool.query(
      `INSERT INTO access_requests
         (full_name, email, company, is_hovedadmin, alt_hovedadmin_name, alt_hovedadmin_email, status)
       VALUES ($1, $2, $3, false, $4, $5, 'pending')
       RETURNING id`,
      [
        "Angriper Testesen",
        overrides.requesterEmail,
        "Angriper AS",
        "Offer Testesen",
        overrides.altHovedadminEmail,
      ],
    );
    cleanupAccessRequestIds.push(row.id);
    return row.id;
  }

  function approve(app: express.Express, requestId: number, vendorId: number) {
    return request(app)
      .post(`/api/internal/creatorhub/access-requests/${requestId}/status`)
      .set("x-tidum-sync-secret", CREATORHUB_SYNC_SECRET)
      .send({ status: "approved", vendorId, role: "hovedadmin" });
  }

  it("tidum_admin_users-konflikt: offerets e-post tilhører allerede en annen vendor -> 409, ingen overskriving", async () => {
    const foreignVendorId = 810001 + Math.floor(Math.random() * 10000);
    const attackerVendorId = 820001 + Math.floor(Math.random() * 10000);
    const victimEmail = `victim_admin_${Date.now()}@example.com`;
    cleanupAdminEmails.push(victimEmail);

    await pool.query(
      `INSERT INTO tidum_admin_users (username, email, password_hash, role, vendor_id, is_active)
       VALUES ($1, $2, 'original-password-hash', 'hovedadmin', $3, true)`,
      [`victim-admin-${Date.now()}`, victimEmail, String(foreignVendorId)],
    );

    const requestId = await insertPendingAccessRequest({
      requesterEmail: `attacker_${Date.now()}@example.com`,
      altHovedadminEmail: victimEmail,
    });

    const app = await buildApp();
    const res = await approve(app, requestId, attackerVendorId);

    expect(res.status).toBe(409);

    const { rows: [adminRow] } = await pool.query(
      `SELECT vendor_id, password_hash FROM tidum_admin_users WHERE email = $1`,
      [victimEmail],
    );
    expect(adminRow.vendor_id).toBe(String(foreignVendorId));
    expect(adminRow.password_hash).toBe("original-password-hash");

    const { rows: [reqRow] } = await pool.query(
      `SELECT status, vendor_id FROM access_requests WHERE id = $1`,
      [requestId],
    );
    expect(reqRow.status).toBe("pending");
    expect(reqRow.vendor_id).toBeNull();
  });

  it("users-konflikt: offerets e-post tilhører allerede en annen vendor i users -> 409, vendorId uendret", async () => {
    const foreignVendorId = 830001 + Math.floor(Math.random() * 10000);
    const attackerVendorId = 840001 + Math.floor(Math.random() * 10000);
    const victimEmail = `victim_portal_${Date.now()}@example.com`;
    cleanupUserEmails.push(victimEmail);
    cleanupAdminEmails.push(victimEmail);

    await pool.query(
      `INSERT INTO users (username, password, email, role, vendor_id)
       VALUES ($1, 'unused', $2, 'tiltaksleder', $3)`,
      [`victim-portal-${Date.now()}`, victimEmail, foreignVendorId],
    );

    const requestId = await insertPendingAccessRequest({
      requesterEmail: `attacker2_${Date.now()}@example.com`,
      altHovedadminEmail: victimEmail,
    });

    const app = await buildApp();
    const res = await approve(app, requestId, attackerVendorId);

    expect(res.status).toBe(409);

    const { rows: [userRow] } = await pool.query(
      `SELECT vendor_id, role FROM users WHERE email = $1`,
      [victimEmail],
    );
    expect(userRow.vendor_id).toBe(foreignVendorId);
    expect(userRow.role).toBe("tiltaksleder");

    const { rows: [reqRow] } = await pool.query(
      `SELECT status FROM access_requests WHERE id = $1`,
      [requestId],
    );
    expect(reqRow.status).toBe("pending");
  });

  it("happy path: samme vendor på begge sider -> godkjenning lykkes som før (vakten blokkerer ikke legitim re-godkjenning)", async () => {
    const ownVendorId = 850001 + Math.floor(Math.random() * 10000);
    const hovedadminEmail = `hovedadmin_ok_${Date.now()}@example.com`;
    cleanupAdminEmails.push(hovedadminEmail);
    cleanupUserEmails.push(hovedadminEmail);

    // Både tidum_admin_users og users har FRA FØR samme vendor som den som
    // godkjennes til — guarden skal ikke blokkere dette (ikke en konflikt).
    await pool.query(
      `INSERT INTO tidum_admin_users (username, email, password_hash, role, vendor_id, is_active)
       VALUES ($1, $2, 'old-hash', 'hovedadmin', $3, true)`,
      [`hovedadmin-ok-${Date.now()}`, hovedadminEmail, String(ownVendorId)],
    );
    await pool.query(
      `INSERT INTO users (username, password, email, role, vendor_id)
       VALUES ($1, 'unused', $2, 'tiltaksleder', $3)`,
      [`hovedadmin-ok-portal-${Date.now()}`, hovedadminEmail, ownVendorId],
    );

    const requestId = await insertPendingAccessRequest({
      requesterEmail: `requester_ok_${Date.now()}@example.com`,
      altHovedadminEmail: hovedadminEmail,
    });

    const app = await buildApp();
    const res = await approve(app, requestId, ownVendorId);

    expect(res.status).toBe(200);

    const { rows: [adminRow] } = await pool.query(
      `SELECT vendor_id, role FROM tidum_admin_users WHERE email = $1`,
      [hovedadminEmail],
    );
    expect(adminRow.vendor_id).toBe(String(ownVendorId));
    expect(adminRow.role).toBe("hovedadmin");

    const { rows: [userRow] } = await pool.query(
      `SELECT vendor_id, role FROM users WHERE email = $1`,
      [hovedadminEmail],
    );
    expect(userRow.vendor_id).toBe(ownVendorId);
    expect(userRow.role).toBe("hovedadmin");

    const { rows: [reqRow] } = await pool.query(
      `SELECT status, vendor_id FROM access_requests WHERE id = $1`,
      [requestId],
    );
    expect(reqRow.status).toBe("approved");
    expect(reqRow.vendor_id).toBe(ownVendorId);
  });
});
