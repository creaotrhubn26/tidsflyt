import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import session from "express-session";
import passport from "passport";
import request from "supertest";
import { pool } from "../../db";

// req.logIn (kalt av setupEntraIdAuth sin callback-rute) er passport sin
// API, satt opp globalt av setupCustomAuth i den ekte appen (routes.ts
// kaller alltid setupCustomAuth FØR setupEntraIdAuth). Testen her monterer
// kun setupEntraIdAuth isolert, så samme oppsett må gjøres her.
passport.serializeUser((user, done) => done(null, user as Express.User));
passport.deserializeUser((user, done) => done(null, user as Express.User));

const jwtVerifyMock = vi.fn();
vi.mock("jose", async () => {
  const actual = await vi.importActual<typeof import("jose")>("jose");
  return { ...actual, createRemoteJWKSet: () => ({}), jwtVerify: (...args: any[]) => jwtVerifyMock(...args) };
});

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

describe("Entra ID SSO", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    jwtVerifyMock.mockReset();
    process.env.ENTRA_ID_CLIENT_ID = "test-client-id";
    process.env.ENTRA_ID_CLIENT_SECRET = "test-client-secret";
    // hashSsn() (server/lib/eid-hash.ts) krever et pepper — samme
    // konvensjon som client/src/test/server/eid-hash.test.ts. Ikke satt i
    // .env i dette miljøet (BankID/Buypass er også deaktivert lokalt).
    process.env.EID_SSN_HASH_PEPPER = "test-pepper-do-not-use-in-prod";
  });

  async function buildApp() {
    const { setupEntraIdAuth } = await import("../../entra-id-auth");
    const app = express();
    app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
    app.use(passport.initialize());
    app.use(passport.session());
    app.use(express.json());
    await setupEntraIdAuth(app);
    return app;
  }

  it("login-ruten gir tydelig feil for en kommune uten entraIdTenantId konfigurert", async () => {
    const { rows: [kommune] } = await pool.query(
      `INSERT INTO tidum_kommuner (navn, org_nummer) VALUES ('Uten Entra', $1) RETURNING id`,
      [`${Date.now()}12345`.slice(0, 9)],
    );
    try {
      const app = await buildApp();
      const res = await request(app).get(`/api/auth/entra-id/login?kommuneId=${kommune.id}`);
      expect(res.status).toBe(400);
    } finally {
      await pool.query(`DELETE FROM tidum_kommuner WHERE id = $1`, [kommune.id]);
    }
  });

  it("login-ruten redirecter til Microsoft med riktig tenant for en konfigurert kommune", async () => {
    const { rows: [kommune] } = await pool.query(
      `INSERT INTO tidum_kommuner (navn, org_nummer, entra_id_tenant_id) VALUES ('Med Entra', $1, 'test-tenant-guid') RETURNING id`,
      [`${Date.now()}54321`.slice(0, 9)],
    );
    try {
      const app = await buildApp();
      const res = await request(app).get(`/api/auth/entra-id/login?kommuneId=${kommune.id}`);
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain("login.microsoftonline.com/test-tenant-guid");
      expect(res.headers.location).toContain("code_challenge_method=S256");
    } finally {
      await pool.query(`DELETE FROM tidum_kommuner WHERE id = $1`, [kommune.id]);
    }
  });

  it("uten ENTRA_ID_CLIENT_ID/SECRET er login-ruten deaktivert (404)", async () => {
    delete process.env.ENTRA_ID_CLIENT_ID;
    delete process.env.ENTRA_ID_CLIENT_SECRET;
    const app = await buildApp();
    const res = await request(app).get("/api/auth/entra-id/login?kommuneId=1");
    expect(res.status).toBe(404);
  });

  // Dekker HELE callback-flyten — token-utveksling, id_token-verifisering,
  // kobling til en allerede invitert users-rad, og faktisk innlogging.
  // De to testene over dekker kun login-ruten (redirect-logikk); uten denne
  // testen ville callback-koden (den viktigste delen av tasken) stått helt
  // uten testdekning.
  it("callback kobler en gyldig id_token til en allerede invitert bruker og logger inn", async () => {
    const { rows: [kommune] } = await pool.query(
      `INSERT INTO tidum_kommuner (navn, org_nummer, entra_id_tenant_id) VALUES ('Callback-test', $1, 'callback-tenant-guid') RETURNING id`,
      [`${Date.now()}`.slice(-9)],
    );
    const email = `entra-${Date.now()}@example.com`;
    const roleId = (await pool.query(
      `SELECT id FROM tidum_roles WHERE name = 'kommune_saksbehandler' AND scope = 'global' AND is_system_default = true`,
    )).rows[0]?.id ?? null;
    const { rows: [user] } = await pool.query(
      `INSERT INTO users (id, username, password, email, role, role_id, kommune_id)
       VALUES (gen_random_uuid(), $1, 'unused-admin-users-pairing', $2, 'kommune_saksbehandler', $3, $4) RETURNING id`,
      [email, email, roleId, kommune.id],
    );

    try {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id_token: "fake-jwt" }) });

      const app = await buildApp();
      const agent = request.agent(app);

      // Steg 1: hent login-redirecten for å få en ekte, gyldig sesjonstilstand
      // (state/nonce/codeVerifier/kommuneId) lagret i sesjonen.
      const loginRes = await agent.get(`/api/auth/entra-id/login?kommuneId=${kommune.id}`);
      const redirectUrl = new URL(loginRes.headers.location);
      const state = redirectUrl.searchParams.get("state");
      const nonce = redirectUrl.searchParams.get("nonce");
      jwtVerifyMock.mockResolvedValue({
        payload: { oid: "test-oid-123", email, given_name: "Test", family_name: "Testesen", name: "Test Testesen", nonce },
      });

      // Steg 2: kall callback med samme state (samme sesjon via agent).
      const callbackRes = await agent.get(`/api/auth/entra-id/callback?code=fake-code&state=${state}`);
      expect(callbackRes.status).toBe(302);
      expect(callbackRes.headers.location).toBe("/dashboard");

      const { rows: identityRows } = await pool.query(
        `SELECT sub, provider FROM tidum_eid_identities WHERE user_id = $1 AND provider = 'entra_id'`,
        [user.id],
      );
      expect(identityRows).toHaveLength(1);
      expect(identityRows[0].sub).toBe("test-oid-123");
    } finally {
      // setupEntraIdAuth logger et vellykket innlogg til tidum_auth_login_events
      // (samme mønster som eid-auth.ts) — uten denne opprydningen slår
      // sletting av users under på en fremmednøkkel uten CASCADE.
      await pool.query(`DELETE FROM tidum_auth_login_events WHERE user_id = $1`, [user.id]);
      await pool.query(`DELETE FROM tidum_eid_identities WHERE user_id = $1`, [user.id]);
      await pool.query(`DELETE FROM users WHERE id = $1`, [user.id]);
      await pool.query(`DELETE FROM tidum_kommuner WHERE id = $1`, [kommune.id]);
    }
  });

  it("callback avviser en innlogging fra en bruker som ikke er invitert til kommunen (eid_not_linked)", async () => {
    const { rows: [kommune] } = await pool.query(
      `INSERT INTO tidum_kommuner (navn, org_nummer, entra_id_tenant_id) VALUES ('Uinvitert-test', $1, 'uninvited-tenant-guid') RETURNING id`,
      [`${Date.now()}`.slice(-9)],
    );

    try {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id_token: "fake-jwt" }) });

      const app = await buildApp();
      const agent = request.agent(app);
      const loginRes = await agent.get(`/api/auth/entra-id/login?kommuneId=${kommune.id}`);
      const redirectUrl = new URL(loginRes.headers.location);
      const state = redirectUrl.searchParams.get("state");
      jwtVerifyMock.mockResolvedValue({
        payload: { oid: "never-invited-oid", email: "ikke-invitert@example.com", nonce: redirectUrl.searchParams.get("nonce") },
      });

      const callbackRes = await agent.get(`/api/auth/entra-id/callback?code=fake-code&state=${state}`);
      expect(callbackRes.status).toBe(302);
      expect(callbackRes.headers.location).toBe("/?error=eid_not_linked");
    } finally {
      await pool.query(`DELETE FROM tidum_kommuner WHERE id = $1`, [kommune.id]);
    }
  });
});
