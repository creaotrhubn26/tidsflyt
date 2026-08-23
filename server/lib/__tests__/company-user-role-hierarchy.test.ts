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

    // vendorId: 1 matcher company_id i requesten under — en ekte tiltaksleder
    // ville hatt sin egen vendorId på JWT-et (resolveActorRoleForCompanys
    // fast-vei krever nå dette, se Fix A / BOLA-fiks).
    const token = jwt.sign(
      { id: "test-tiltaksleder", email: "t@example.com", role: "tiltaksleder", vendorId: 1 },
      JWT_SECRET,
    );
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

  // BOLA-fiks C (syncCompanyUserToPortalAccess): en e-post som allerede
  // tilhører en bruker i en ANNEN virksomhet (annen vendor_id på
  // public.users) skal IKKE stille kunne overskrives av en invitasjon fra
  // en fremmed virksomhet — det ville vært en kontooverdragelse på tvers
  // av leverandører. Se TENANT_MISMATCH-guarden i syncCompanyUserToPortalAccess.
  it("kan IKKE invitere en e-post som allerede tilhører en annen virksomhet (TENANT_MISMATCH -> 409, ingen overskriving)", async () => {
    process.env.NODE_ENV = "production";
    const { registerSmartTimingRoutes } = await import("../../smartTimingRoutes");
    const app = express();
    app.use(express.json());
    registerSmartTimingRoutes(app);

    const actorVendorId = 501001;
    const foreignVendorId = 501002;
    const targetEmail = `test_tenant_mismatch_${Date.now()}@example.com`;
    cleanupEmails.push(targetEmail);

    // Brukeren finnes allerede, tilknyttet en HELT ANNEN virksomhet.
    await pool.query(
      `INSERT INTO users (username, password, email, role, vendor_id) VALUES ($1, 'unused', $2, 'member', $3)`,
      [targetEmail, targetEmail, foreignVendorId],
    );

    const token = jwt.sign(
      {
        id: "test-actor-tenant-mismatch",
        email: "tm-actor@example.com",
        role: "vendor_admin",
        vendorId: actorVendorId,
      },
      JWT_SECRET,
    );

    const res = await request(app)
      .post("/api/company/users")
      .set("Authorization", `Bearer ${token}`)
      .send({ company_id: actorVendorId, user_email: targetEmail, role: "miljoarbeider", sendInvite: false });

    expect(res.status).toBe(409);

    // Den opprinnelige raden i public.users (den DELTE, urelaterte tabellen)
    // skal stå helt uendret — verken vendor_id eller role skal ha blitt
    // overskrevet av den fremmede invitasjonen.
    const { rows } = await pool.query(`SELECT vendor_id, role FROM users WHERE email = $1`, [targetEmail]);
    expect(rows.length).toBe(1);
    expect(rows[0].vendor_id).toBe(foreignVendorId);
    expect(rows[0].role).toBe("member");
  });

  // BOLA-fiks A, oppfølging: resolveActorRoleForCompanys fallback-oppslag
  // returnerte tidligere aktørens opprinnelige, uverifiserte rolle når
  // aktøren ikke hadde noen rad i target-company_id (0 rader). Dette gjorde
  // hoved-fail-closed-sjekken over (actorVendorId === companyId) tannløs:
  // en ekte, gyldig innlogget vendor_admin for company 111 kunne bytte ut
  // company_id i requesten med en HELT FREMMED virksomhet (222, der de
  // aldri har hatt noen relasjon) og likevel få sin egen rolle tilbake.
  // Fallback-veien fail-closer nå til "member" på 0 rader, akkurat som
  // isKommuneRole-guarden lenger opp.
  it("vendor_admin med vendorId 111 kan IKKE administrere en fremmed virksomhet (company_id 222) den ikke har noen relasjon til", async () => {
    process.env.NODE_ENV = "production";
    const { registerSmartTimingRoutes } = await import("../../smartTimingRoutes");
    const app = express();
    app.use(express.json());
    registerSmartTimingRoutes(app);

    const token = jwt.sign(
      { id: "test-foreign-tenant-attack", email: "foreign_attacker@example.com", role: "vendor_admin", vendorId: 111 },
      JWT_SECRET,
    );
    const targetEmail = `test_foreign_tenant_${Date.now()}@example.com`;

    const res = await request(app)
      .post("/api/company/users")
      .set("Authorization", `Bearer ${token}`)
      .send({ company_id: 222, user_email: targetEmail, role: "member", sendInvite: false });

    expect(res.status).toBe(403);

    // Bekreft at raden faktisk ikke ble opprettet for den fremmede
    // virksomheten (ikke bare feil statuskode).
    const { rows } = await pool.query(`SELECT id FROM tidum_company_users WHERE user_email = $1`, [targetEmail]);
    expect(rows.length).toBe(0);
  });

  // BOLA-fiks D (GET /api/company/users): ruten manglet tenant-scoping —
  // enhver autentisert aktør kunne lese EN VILKÅRLIG virksomhets brukerliste
  // ved å endre company_id-query-parameteren.
  it("GET /api/company/users er tenant-scoped: aktør kan lese egen virksomhet, ikke en fremmed", async () => {
    const ownVendorId = 502001;
    const foreignVendorId = 502002;

    const { registerSmartTimingRoutes } = await import("../../smartTimingRoutes");
    const app = express();
    app.use(express.json());
    // GET /api/company/users bruker den LOKALE requireAuth (ikke
    // authenticateAdmin), som leser aktøren fra req.user — samme
    // injiserings-mønster som server/lib/__tests__/task-assignment-routes.test.ts
    // sin appWithUser-helper.
    app.use((req: any, _res, next) => {
      req.user = { id: "test-reader", email: "reader@example.com", role: "vendor_admin", vendorId: ownVendorId };
      req.isAuthenticated = () => true;
      next();
    });
    registerSmartTimingRoutes(app);

    const foreignRes = await request(app).get(`/api/company/users?company_id=${foreignVendorId}`);
    expect(foreignRes.status).toBe(403);

    const ownRes = await request(app).get(`/api/company/users?company_id=${ownVendorId}`);
    expect(ownRes.status).toBe(200);
    expect(Array.isArray(ownRes.body)).toBe(true);
  });

  // BOLA-fiks runde 2, Fiks 1: PATCH-spørringen scopet ikke på company_id —
  // en aktør med rett rolle for SIN egen company_id kunne sende en
  // ANNEN virksomhets rad-id (serial, trivielt gjettbar) og endre den.
  it("PATCH /api/company/users/:id kan IKKE endre en rad som tilhører en annen company_id (404, uendret rad)", async () => {
    process.env.NODE_ENV = "production";
    const { registerSmartTimingRoutes } = await import("../../smartTimingRoutes");
    const app = express();
    app.use(express.json());
    registerSmartTimingRoutes(app);

    const actorVendorId = 503001;
    const foreignCompanyId = 503002;
    const foreignEmail = `test_cross_tenant_patch_${Date.now()}@example.com`;
    cleanupEmails.push(foreignEmail);

    const { rows: inserted } = await pool.query(
      `INSERT INTO tidum_company_users (vendor_id, company_id, user_email, role, approved)
       VALUES ($1, $1, $2, 'teamleder', true) RETURNING id`,
      [foreignCompanyId, foreignEmail],
    );
    const foreignRowId = inserted[0].id;

    const token = jwt.sign(
      { id: "test-cross-tenant-patch-actor", email: "cross-patch-actor@example.com", role: "vendor_admin", vendorId: actorVendorId },
      JWT_SECRET,
    );

    const res = await request(app)
      .patch(`/api/company/users/${foreignRowId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ company_id: actorVendorId, role: "miljoarbeider", approved: false });

    expect(res.status).toBe(404);

    const { rows } = await pool.query(
      `SELECT role, approved, company_id FROM tidum_company_users WHERE id = $1`,
      [foreignRowId],
    );
    expect(rows.length).toBe(1);
    expect(rows[0].role).toBe("teamleder");
    expect(rows[0].approved).toBe(true);
    expect(rows[0].company_id).toBe(foreignCompanyId);
  });

  // BOLA-fiks runde 2, Fiks 1: samme mangel som over, for DELETE.
  it("DELETE /api/company/users/:id kan IKKE slette en rad som tilhører en annen company_id (404, raden består)", async () => {
    process.env.NODE_ENV = "production";
    const { registerSmartTimingRoutes } = await import("../../smartTimingRoutes");
    const app = express();
    app.use(express.json());
    registerSmartTimingRoutes(app);

    const actorVendorId = 503011;
    const foreignCompanyId = 503012;
    const foreignEmail = `test_cross_tenant_delete_${Date.now()}@example.com`;
    cleanupEmails.push(foreignEmail);

    const { rows: inserted } = await pool.query(
      `INSERT INTO tidum_company_users (vendor_id, company_id, user_email, role, approved)
       VALUES ($1, $1, $2, 'teamleder', true) RETURNING id`,
      [foreignCompanyId, foreignEmail],
    );
    const foreignRowId = inserted[0].id;

    const token = jwt.sign(
      { id: "test-cross-tenant-delete-actor", email: "cross-delete-actor@example.com", role: "vendor_admin", vendorId: actorVendorId },
      JWT_SECRET,
    );

    const res = await request(app)
      .delete(`/api/company/users/${foreignRowId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ company_id: actorVendorId });

    expect(res.status).toBe(404);

    const { rows } = await pool.query(`SELECT id FROM tidum_company_users WHERE id = $1`, [foreignRowId]);
    expect(rows.length).toBe(1);
  });

  // BOLA-fiks runde 2, Fiks 4: klienten sender i praksis IKKE company_id som
  // query-param til GET /api/company/users, så ruten falt tilbake til
  // hardkodet company_id=1 og 403'et enhver legitim aktør med en annen
  // vendorId. Uten company_id skal ruten falle tilbake til aktørens EGEN
  // vendorId og returnere 200 med deres egen virksomhets brukere.
  it("GET /api/company/users uten company_id-param returnerer 200 med aktørens EGEN virksomhet (ikke 403, ikke hardkodet company 1)", async () => {
    const ownVendorId = 503101;
    const ownEmail = `test_get_no_param_${Date.now()}@example.com`;
    cleanupEmails.push(ownEmail);

    await pool.query(
      `INSERT INTO tidum_company_users (vendor_id, company_id, user_email, role, approved)
       VALUES ($1, $1, $2, 'miljoarbeider', true)`,
      [ownVendorId, ownEmail],
    );

    const { registerSmartTimingRoutes } = await import("../../smartTimingRoutes");
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.user = { id: "test-reader-no-param", email: "reader-no-param@example.com", role: "vendor_admin", vendorId: ownVendorId };
      req.isAuthenticated = () => true;
      next();
    });
    registerSmartTimingRoutes(app);

    const res = await request(app).get("/api/company/users");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((row: any) => row.user_email === ownEmail)).toBe(true);
    expect(res.body.every((row: any) => row.company_id === ownVendorId)).toBe(true);
  });
});
