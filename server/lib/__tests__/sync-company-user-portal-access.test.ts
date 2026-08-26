import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import jwt from "jsonwebtoken";
import { pool } from "../../db";

const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || "change-me-in-production";

// Regresjon: syncCompanyUserToPortalAccess sin INSERT-gren (genuint ny
// e-post, ingen eksisterende users-rad) omgikk Drizzle-skjemaet
// (shared/models/auth.ts) fullstendig — det skjemaet mangler username,
// password OG role_id, selv om alle tre er ekte kolonner i den delte
// public.users-tabellen (eid av et urelatert produkt). Insert-veien
// feilet derfor på NOT NULL-kolonnene username/password (23502), og satte
// aldri role_id (fase 1.5/1.6s tildelingssystem) på noen av grenene.
describe("syncCompanyUserToPortalAccess (server/smartTimingRoutes.ts)", () => {
  const cleanupEmails: string[] = [];
  afterEach(async () => {
    for (const email of cleanupEmails.splice(0)) {
      await pool.query(`DELETE FROM tidum_company_users WHERE user_email = $1`, [email]);
      await pool.query(`DELETE FROM users WHERE email = $1`, [email]);
    }
  });

  async function getRoleIdByName(name: string): Promise<string> {
    const { rows } = await pool.query(
      `SELECT id FROM tidum_roles WHERE name = $1 AND scope = 'global' AND is_system_default = true`,
      [name],
    );
    expect(rows[0]?.id, `fant ingen tidum_roles-rad for '${name}'`).toBeTruthy();
    return rows[0].id;
  }

  it("genuint ny e-post: INSERT lykkes (ikke lenger 23502) og setter både role og role_id", async () => {
    process.env.NODE_ENV = "production";
    const { registerSmartTimingRoutes } = await import("../../smartTimingRoutes");
    const app = express();
    app.use(express.json());
    registerSmartTimingRoutes(app);

    // vendorId: 1 matcher company_id under (BOLA-fiks A krever nå at aktørens
    // egen vendorId matcher target-company_id for den raske godkjenningsveien).
    const token = jwt.sign(
      { id: "test-vendor-admin-sync", email: "va-sync@example.com", role: "vendor_admin", vendorId: 1 },
      JWT_SECRET,
    );
    const email = `test_sync_new_${Date.now()}@example.com`;
    cleanupEmails.push(email);

    const res = await request(app)
      .post("/api/company/users")
      .set("Authorization", `Bearer ${token}`)
      .send({ company_id: 1, user_email: email, role: "miljoarbeider", sendInvite: false });

    expect(res.status).toBe(201);

    const { rows } = await pool.query(
      `SELECT role, role_id, username, password FROM users WHERE email = $1`,
      [email],
    );
    expect(rows.length).toBe(1);
    expect(rows[0].role).toBe("miljoarbeider");
    expect(rows[0].role_id).toBe(await getRoleIdByName("miljoarbeider"));
    expect(rows[0].username).toBeTruthy();
    expect(rows[0].password).toBeTruthy();
  });

  it("eksisterende e-post: rolleendring via PATCH oppdaterer både role og role_id på den samme raden", async () => {
    process.env.NODE_ENV = "production";
    const { registerSmartTimingRoutes } = await import("../../smartTimingRoutes");
    const app = express();
    app.use(express.json());
    registerSmartTimingRoutes(app);

    const token = jwt.sign(
      { id: "test-vendor-admin-sync-2", email: "va-sync-2@example.com", role: "vendor_admin", vendorId: 1 },
      JWT_SECRET,
    );
    const email = `test_sync_update_${Date.now()}@example.com`;
    cleanupEmails.push(email);

    // Opprett først som miljoarbeider via samme insert-vei som over.
    const createRes = await request(app)
      .post("/api/company/users")
      .set("Authorization", `Bearer ${token}`)
      .send({ company_id: 1, user_email: email, role: "miljoarbeider", sendInvite: false });
    expect(createRes.status).toBe(201);
    const companyUserId = createRes.body.id;

    // Godkjenning med ny rolle utløser syncCompanyUserToPortalAccess sin
    // UPDATE-gren (result.rows[0].approved === true).
    const patchRes = await request(app)
      .patch(`/api/company/users/${companyUserId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ company_id: 1, role: "teamleder", approved: true });
    expect(patchRes.status).toBe(200);

    const { rows } = await pool.query(`SELECT role, role_id FROM users WHERE email = $1`, [email]);
    expect(rows.length).toBe(1);
    expect(rows[0].role).toBe("teamleder");
    expect(rows[0].role_id).toBe(await getRoleIdByName("teamleder"));
  });
});
