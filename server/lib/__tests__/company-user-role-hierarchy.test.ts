import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import jwt from "jsonwebtoken";
import { pool } from "../../db";

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
});
