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
  const cleanupVendorIds: number[] = [];

  afterEach(async () => {
    const emails = [...new Set([...cleanupAdminEmails, ...cleanupUserEmails])];
    for (const id of cleanupAccessRequestIds.splice(0)) {
      await pool.query(`DELETE FROM access_requests WHERE id = $1`, [id]);
    }
    for (const email of emails) {
      await pool.query(`DELETE FROM tidum_company_users WHERE LOWER(user_email) = LOWER($1)`, [email]);
      await pool.query(`DELETE FROM tidum_admin_users WHERE email = $1`, [email]);
      await pool.query(`DELETE FROM users WHERE email = $1`, [email]);
    }
    cleanupAdminEmails.length = 0;
    cleanupUserEmails.length = 0;
    for (const id of cleanupVendorIds.splice(0)) {
      await pool.query(`DELETE FROM tidum_vendors WHERE id = $1`, [id]);
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

  function approve(app: express.Express, requestId: number, vendorId?: number) {
    return request(app)
      .post(`/api/internal/creatorhub/access-requests/${requestId}/status`)
      .set("x-tidum-sync-secret", CREATORHUB_SYNC_SECRET)
      .send({
        status: "approved",
        ...(vendorId === undefined ? {} : { vendorId }),
        role: "hovedadmin",
      });
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
    expect(adminRow.vendor_id).toBe(foreignVendorId);
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

    // Regresjon for fix-runde 4: guard 2 (users) kaster ETTER at guard 1
    // (tidum_admin_users) allerede har INSERT-et en ny admin-rad for
    // offeret bundet til angriperens vendor. Uten transaksjonen ville denne
    // raden overlevd 409-en og gjort kontoen kaprbar via
    // POST /api/auth/email/request-link. db.transaction skal rulle den
    // tilbake sammen med alt annet.
    const { rows: adminRows } = await pool.query(
      `SELECT vendor_id FROM tidum_admin_users WHERE LOWER(email) = LOWER($1)`,
      [victimEmail],
    );
    expect(adminRows.length).toBe(0);
  });

  it("case-bypass: alt_hovedadmin_email med annen bokstav-kasing enn offerets lagrede e-post -> 409, ingen overskriving", async () => {
    const foreignVendorId = 860001 + Math.floor(Math.random() * 10000);
    const attackerVendorId = 870001 + Math.floor(Math.random() * 10000);
    const victimEmailLower = `victim_case_${Date.now()}@example.com`;
    const victimEmailMixedCase = `Victim_Case_${Date.now()}@Example.com`;
    cleanupUserEmails.push(victimEmailLower);
    cleanupAdminEmails.push(victimEmailLower);

    await pool.query(
      `INSERT INTO users (username, password, email, role, vendor_id)
       VALUES ($1, 'unused', $2, 'tiltaksleder', $3)`,
      [`victim-case-${Date.now()}`, victimEmailLower, foreignVendorId],
    );

    const requestId = await insertPendingAccessRequest({
      requesterEmail: `attacker_case_${Date.now()}@example.com`,
      altHovedadminEmail: victimEmailMixedCase,
    });

    const app = await buildApp();
    const res = await approve(app, requestId, attackerVendorId);

    expect(res.status).toBe(409);

    const { rows: [userRow] } = await pool.query(
      `SELECT vendor_id, role FROM users WHERE LOWER(email) = LOWER($1)`,
      [victimEmailLower],
    );
    expect(userRow.vendor_id).toBe(foreignVendorId);
    expect(userRow.role).toBe("tiltaksleder");

    const { rows: [reqRow] } = await pool.query(
      `SELECT status FROM access_requests WHERE id = $1`,
      [requestId],
    );
    expect(reqRow.status).toBe("pending");

    const { rows: adminRows } = await pool.query(
      `SELECT vendor_id FROM tidum_admin_users WHERE LOWER(email) = LOWER($1)`,
      [victimEmailLower],
    );
    expect(adminRows.length).toBe(0);
  });

  it("tidum_company_users-konflikt: bulkimportert e-post i annen tenant -> 409 og ingen identitet opprettes", async () => {
    const foreignVendorId = 871001 + Math.floor(Math.random() * 10000);
    const attackerVendorId = 872001 + Math.floor(Math.random() * 10000);
    const victimEmail = `victim_company_only_${Date.now()}@example.com`;
    cleanupAdminEmails.push(victimEmail);
    cleanupUserEmails.push(victimEmail);

    await pool.query(
      `INSERT INTO tidum_company_users (vendor_id, company_id, user_email, role, approved)
       VALUES ($1, $1, $2, 'miljoarbeider', true)`,
      [foreignVendorId, victimEmail],
    );

    const requestId = await insertPendingAccessRequest({
      requesterEmail: `attacker_company_only_${Date.now()}@example.com`,
      altHovedadminEmail: victimEmail,
    });

    const app = await buildApp();
    const res = await approve(app, requestId, attackerVendorId);
    expect(res.status).toBe(409);

    const companyRows = await pool.query(
      `SELECT vendor_id, role FROM tidum_company_users WHERE LOWER(user_email) = LOWER($1)`,
      [victimEmail],
    );
    expect(companyRows.rows).toEqual([
      { vendor_id: foreignVendorId, role: "miljoarbeider" },
    ]);
    expect((await pool.query(
      `SELECT 1 FROM tidum_admin_users WHERE LOWER(email) = LOWER($1)`,
      [victimEmail],
    )).rows).toHaveLength(0);
    expect((await pool.query(
      `SELECT 1 FROM users WHERE LOWER(email) = LOWER($1)`,
      [victimEmail],
    )).rows).toHaveLength(0);

    const { rows: [reqRow] } = await pool.query(
      `SELECT status, vendor_id FROM access_requests WHERE id = $1`,
      [requestId],
    );
    expect(reqRow).toMatchObject({ status: "pending", vendor_id: null });
  });

  it("samtidige godkjenninger kan ikke flytte samme hovedadmin-e-post mellom tenants", async () => {
    const firstVendorId = 873001 + Math.floor(Math.random() * 10000);
    const secondVendorId = 884001 + Math.floor(Math.random() * 10000);
    const sharedEmail = `concurrent_hovedadmin_${Date.now()}@example.com`;
    cleanupAdminEmails.push(sharedEmail);
    cleanupUserEmails.push(sharedEmail);

    const firstRequestId = await insertPendingAccessRequest({
      requesterEmail: `concurrent_requester_1_${Date.now()}@example.com`,
      altHovedadminEmail: sharedEmail,
    });
    const secondRequestId = await insertPendingAccessRequest({
      requesterEmail: `concurrent_requester_2_${Date.now()}@example.com`,
      altHovedadminEmail: sharedEmail,
    });

    const app = await buildApp();
    const [first, second] = await Promise.all([
      approve(app, firstRequestId, firstVendorId),
      approve(app, secondRequestId, secondVendorId),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);

    const winnerVendorId = first.status === 200 ? firstVendorId : secondVendorId;
    const winnerRequestId = first.status === 200 ? firstRequestId : secondRequestId;
    const loserRequestId = first.status === 409 ? firstRequestId : secondRequestId;

    const { rows: [adminRow] } = await pool.query(
      `SELECT vendor_id FROM tidum_admin_users WHERE email = $1`,
      [sharedEmail],
    );
    const { rows: [userRow] } = await pool.query(
      `SELECT vendor_id FROM users WHERE email = $1`,
      [sharedEmail],
    );
    expect(adminRow.vendor_id).toBe(winnerVendorId);
    expect(userRow.vendor_id).toBe(winnerVendorId);

    const requestRows = await pool.query(
      `SELECT id, status, vendor_id FROM access_requests WHERE id = ANY($1::int[])`,
      [[winnerRequestId, loserRequestId]],
    );
    expect(requestRows.rows).toEqual(expect.arrayContaining([
      { id: winnerRequestId, status: "approved", vendor_id: winnerVendorId },
      { id: loserRequestId, status: "pending", vendor_id: null },
    ]));
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
    expect(adminRow.vendor_id).toBe(ownVendorId);
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

  it("oppretter manglende Tidum-vendor atomisk når godkjenning ikke oppgir vendorId", async () => {
    const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const email = `auto_vendor_${suffix}@example.com`;
    const orgNumber = String(900_000_000 + (Number(suffix.slice(-8)) % 99_999_999)).slice(0, 9);
    cleanupAdminEmails.push(email);
    cleanupUserEmails.push(email);

    const {
      rows: [accessRequest],
    } = await pool.query(
      `INSERT INTO access_requests
         (full_name, email, company, org_number, institution_type, is_hovedadmin, status)
       VALUES ('Auto Vendor', $1, $2, $3, 'barnevern', true, 'pending')
       RETURNING id`,
      [email, `Auto Vendor ${suffix}`, orgNumber],
    );
    cleanupAccessRequestIds.push(accessRequest.id);

    const app = await buildApp();
    const res = await approve(app, accessRequest.id);

    expect(res.status).toBe(200);
    expect(res.body.vendorId).toEqual(expect.any(Number));
    cleanupVendorIds.push(res.body.vendorId);

    const {
      rows: [vendor],
    } = await pool.query(
      `SELECT name, org_number, institution_type FROM tidum_vendors WHERE id = $1`,
      [res.body.vendorId],
    );
    expect(vendor).toMatchObject({
      name: `Auto Vendor ${suffix}`,
      org_number: orgNumber,
      institution_type: "barnevern",
    });

    const {
      rows: [admin],
    } = await pool.query(
      `SELECT vendor_id, password_hash FROM tidum_admin_users WHERE email = $1`,
      [email],
    );
    expect(admin.vendor_id).toBe(res.body.vendorId);
    expect(admin.password_hash).toMatch(/^\$2[aby]\$/);
  });

  it("ruller også ny vendor tilbake når en senere tenant-vakt avviser godkjenningen", async () => {
    const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const victimEmail = `auto_vendor_conflict_${suffix}@example.com`;
    const foreignVendorId = 880001 + Math.floor(Math.random() * 10000);
    const orgNumber = String(800_000_000 + (Number(suffix.slice(-8)) % 99_999_999)).slice(0, 9);
    cleanupUserEmails.push(victimEmail);
    cleanupAdminEmails.push(victimEmail);

    await pool.query(
      `INSERT INTO users (username, password, email, role, vendor_id)
       VALUES ($1, 'unused', $2, 'tiltaksleder', $3)`,
      [`auto-vendor-conflict-${suffix}`, victimEmail, foreignVendorId],
    );

    const {
      rows: [accessRequest],
    } = await pool.query(
      `INSERT INTO access_requests
         (full_name, email, company, org_number, institution_type,
          is_hovedadmin, alt_hovedadmin_name, alt_hovedadmin_email, status)
       VALUES ('Requester', $1, $2, $3, 'barnevern', false, 'Victim', $4, 'pending')
       RETURNING id`,
      [
        `requester_auto_${suffix}@example.com`,
        `Rollback Vendor ${suffix}`,
        orgNumber,
        victimEmail,
      ],
    );
    cleanupAccessRequestIds.push(accessRequest.id);

    const app = await buildApp();
    const res = await approve(app, accessRequest.id);
    expect(res.status).toBe(409);

    const vendorResult = await pool.query(
      `SELECT id FROM tidum_vendors WHERE org_number = $1`,
      [orgNumber],
    );
    expect(vendorResult.rows).toHaveLength(0);

    const {
      rows: [pendingRequest],
    } = await pool.query(
      `SELECT status, vendor_id FROM access_requests WHERE id = $1`,
      [accessRequest.id],
    );
    expect(pendingRequest).toMatchObject({ status: "pending", vendor_id: null });
  });
});
