import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import http from "http";
import { pool } from "../../db";

// Konfigurasjonsstatus for integrasjonene — «lim inn endepunkter og se at
// de plukkes opp». Verdier skal aldri lekke, kun satt/ikke satt.
describe("Integrasjonsstatus", { timeout: 20000 }, () => {
  const cleanupUserIds: string[] = [];
  const ENV_VARS = [
    "FIKS_MASKINPORTEN_KLIENT_ID", "FIKS_IO_KONTO_ID", "FIKS_IO_INTEGRASJON_ID",
    "FIKS_IO_INTEGRASJON_PASSORD", "BVR_FIKS_MOTTAKER_KONTO_ID",
    "SMS_GATEWAY_URL", "SMS_GATEWAY_TOKEN", "FIKS_MOTTAK_FELTMAPPING",
  ];

  afterEach(async () => {
    for (const v of ENV_VARS) delete process.env[v];
    for (const id of cleanupUserIds.splice(0)) {
      await pool.query(`DELETE FROM users WHERE id = $1`, [id]);
    }
  });

  async function superAdminApp() {
    const id = `sa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await pool.query(
      `INSERT INTO users (id, username, password, email, role, role_id) VALUES ($1, $2, 'x', $3, 'super_admin', (SELECT id FROM tidum_roles WHERE name='super_admin' AND scope='global' AND is_system_default = true))`,
      [id, id, `${id}@example.com`],
    );
    cleanupUserIds.push(id);
    const { registerRoutes } = await import("../../routes");
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.user = { id };
      req.session = { passport: { user: id } };
      req.authUser = { id };
      req.isAuthenticated = () => true;
      next();
    });
    await registerRoutes(http.createServer(), app);
    return app;
  }

  it("viser mangler uten verdier; flipper til klar når variabler settes; ugyldig mapping flagges", async () => {
    const app = await superAdminApp();

    const forst = await request(app).get("/api/admin/integrasjoner/status");
    expect(forst.status).toBe(200);
    expect(forst.body.smsGateway.klar).toBe(false);
    expect(forst.body.smsGateway.mangler).toContain("SMS_GATEWAY_URL");
    expect(forst.body.maskinporten.mangler).toContain("FIKS_MASKINPORTEN_KLIENT_ID");

    process.env.SMS_GATEWAY_URL = "https://gateway.halden.kommune.no/sms";
    process.env.SMS_GATEWAY_TOKEN = "supersecret-token-123";
    process.env.FIKS_MOTTAK_FELTMAPPING = "{ikke gyldig json";

    const etter = await request(app).get("/api/admin/integrasjoner/status");
    expect(etter.body.smsGateway.klar).toBe(true);
    // Verdier lekker aldri.
    expect(JSON.stringify(etter.body)).not.toContain("supersecret-token-123");
    expect(JSON.stringify(etter.body)).not.toContain("gateway.halden");
    // Ugyldig mapping rapporteres som ikke satt, med merknad.
    const mapping = etter.body.fiksMottakBekymringsmelding.vars.find((v: any) => v.navn === "FIKS_MOTTAK_FELTMAPPING");
    expect(mapping.satt).toBe(false);
    expect(mapping.merknad).toContain("UGYLDIG");
  });

  it("kun super_admin", async () => {
    const id = `sb-${Date.now()}`;
    await pool.query(
      `INSERT INTO users (id, username, password, email, role) VALUES ($1, $2, 'x', $3, 'kommune_saksbehandler')`,
      [id, id, `${id}@example.com`],
    );
    cleanupUserIds.push(id);
    const { registerRoutes } = await import("../../routes");
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.user = { id };
      req.session = { passport: { user: id } };
      req.authUser = { id };
      req.isAuthenticated = () => true;
      next();
    });
    await registerRoutes(http.createServer(), app);

    const res = await request(app).get("/api/admin/integrasjoner/status");
    expect([401, 403]).toContain(res.status);
  });
});
