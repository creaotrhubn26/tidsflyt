import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import jwt from "jsonwebtoken";
import { pool } from "../../db";
import { isKommuneRole } from "@shared/roles";

describe("isKommuneRole", () => {
  it("gjenkjenner begge kommune-rollene", () => {
    expect(isKommuneRole("barnevernsleder")).toBe(true);
    expect(isKommuneRole("kommune_saksbehandler")).toBe(true);
  });

  it("er false for vendor-roller, tomme/ukjente verdier", () => {
    expect(isKommuneRole("hovedadmin")).toBe(false);
    expect(isKommuneRole("vendor_admin")).toBe(false);
    expect(isKommuneRole("super_admin")).toBe(false);
    expect(isKommuneRole(null)).toBe(false);
    expect(isKommuneRole(undefined)).toBe(false);
    expect(isKommuneRole("noe-ukjent")).toBe(false);
  });
});

const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || "change-me-in-production";

describe("company-user routes bruker canManageRoleDynamic/canManageUsersDynamic", () => {
  const cleanupEmails: string[] = [];
  afterEach(async () => {
    for (const email of cleanupEmails.splice(0)) {
      await pool.query(`DELETE FROM tidum_company_users WHERE user_email = $1`, [email]);
      // POST /api/company/users also upserts public.users (syncCompanyUserToPortalAccess) —
      // clean up any row it created/updated so test emails don't leak into the
      // shared, unrelated public.users table.
      await pool.query(`DELETE FROM users WHERE email = $1`, [email]);
    }
  });

  it("tiltaksleder kan invitere miljoarbeider (POST /api/company/users)", async () => {
    process.env.NODE_ENV = "production";
    const { registerSmartTimingRoutes } = await import("../../smartTimingRoutes");
    const app = express();
    app.use(express.json());
    registerSmartTimingRoutes(app);

    const token = jwt.sign({ id: "test-tiltaksleder", email: "t@example.com", role: "tiltaksleder" }, JWT_SECRET);
    const email = `test_f16_${Date.now()}@example.com`;
    cleanupEmails.push(email);

    const res = await request(app)
      .post("/api/company/users")
      .set("Authorization", `Bearer ${token}`)
      .send({ company_id: 1, user_email: email, role: "miljoarbeider", sendInvite: false });

    expect(res.status).toBe(201);
  });

  it("tiltaksleder kan IKKE invitere vendor_admin (POST /api/company/users)", async () => {
    process.env.NODE_ENV = "production";
    const { registerSmartTimingRoutes } = await import("../../smartTimingRoutes");
    const app = express();
    app.use(express.json());
    registerSmartTimingRoutes(app);

    const token = jwt.sign({ id: "test-tiltaksleder-2", email: "t2@example.com", role: "tiltaksleder" }, JWT_SECRET);
    const email = `test_f16_denied_${Date.now()}@example.com`;

    const res = await request(app)
      .post("/api/company/users")
      .set("Authorization", `Bearer ${token}`)
      .send({ company_id: 1, user_email: email, role: "vendor_admin", sendInvite: false });

    expect(res.status).toBe(403);
  });

  it("member kan ikke gjøre noe (canManageUsersDynamic-gaten alene stopper POST)", async () => {
    process.env.NODE_ENV = "production";
    const { registerSmartTimingRoutes } = await import("../../smartTimingRoutes");
    const app = express();
    app.use(express.json());
    registerSmartTimingRoutes(app);

    const token = jwt.sign({ id: "test-member", email: "m@example.com", role: "member" }, JWT_SECRET);

    const res = await request(app)
      .post("/api/company/users")
      .set("Authorization", `Bearer ${token}`)
      .send({ company_id: 1, user_email: `test_f16_member_${Date.now()}@example.com`, role: "member", sendInvite: false });

    expect(res.status).toBe(403);
  });

  it("resolveActorRoleForCompanys tidum_company_users-gren: en aktør med member som sesjonsrolle, men tiltaksleder i tidum_company_users for DENNE company_id, kan invitere miljoarbeider", async () => {
    process.env.NODE_ENV = "production";
    const { registerSmartTimingRoutes } = await import("../../smartTimingRoutes");
    const app = express();
    app.use(express.json());
    registerSmartTimingRoutes(app);

    const actorEmail = `test_f16_actor_branch2_${Date.now()}@example.com`;
    cleanupEmails.push(actorEmail);
    // Selve aktøren registrert som tiltaksleder for company_id 1 — dette
    // er raden resolveActorRoleForCompany finner når sesjonens EGEN rolle
    // (member, under) ikke alene kvalifiserer til canManageUsersDynamic.
    await pool.query(
      `INSERT INTO tidum_company_users (vendor_id, company_id, user_email, role, approved) VALUES (1, 1, $1, 'tiltaksleder', true)`,
      [actorEmail],
    );

    // JWT-payloadens "role" er bevisst 'member' — normalizeRole(req.user.role)
    // alene ville feilet canManageUsersDynamic, og tvinger dermed
    // resolveActorRoleForCompany til å slå opp raden over via e-post+company_id.
    const token = jwt.sign({ id: "test-actor-branch2", email: actorEmail, role: "member" }, JWT_SECRET);
    const targetEmail = `test_f16_target_branch2_${Date.now()}@example.com`;
    cleanupEmails.push(targetEmail);

    const res = await request(app)
      .post("/api/company/users")
      .set("Authorization", `Bearer ${token}`)
      .send({ company_id: 1, user_email: targetEmail, role: "miljoarbeider", sendInvite: false });

    expect(res.status).toBe(201);
  });

  // Regresjonstest for det kritiske funnet i "Final whole-branch review":
  // barnevernsleder (rank 85, can_manage_others=true) rangerer over
  // hovedadmin (80)/vendor_admin (70) i canManageRoleDynamic sin globale,
  // tenant-blinde rank-skala. Uten resolveActorRoleForCompanys
  // isKommuneRole-vakt ville en barnevernsleder som logget seg inn (f.eks.
  // via magic-link, se progress.md) kunne opphøye seg selv til hovedadmin
  // på en VILKÅRLIG leverandørs company_id, uten noen medlemskapssjekk.
  it("barnevernsleder kan IKKE invitere/oppgradere en company-user til hovedadmin (privilegie-eskalering lukket)", async () => {
    process.env.NODE_ENV = "production";
    const { registerSmartTimingRoutes } = await import("../../smartTimingRoutes");
    const app = express();
    app.use(express.json());
    registerSmartTimingRoutes(app);

    const token = jwt.sign(
      { id: "test-barnevernsleder", email: "bvl@example.com", role: "barnevernsleder" },
      JWT_SECRET,
    );
    const targetEmail = `test_priv_esc_${Date.now()}@example.com`;

    const res = await request(app)
      .post("/api/company/users")
      .set("Authorization", `Bearer ${token}`)
      .send({ company_id: 999999, user_email: targetEmail, role: "hovedadmin", sendInvite: false });

    expect(res.status).toBe(403);

    // Bekreft at raden faktisk ikke ble opprettet (ikke bare feil statuskode).
    const { rows } = await pool.query(`SELECT id FROM tidum_company_users WHERE user_email = $1`, [targetEmail]);
    expect(rows.length).toBe(0);
  });
});
