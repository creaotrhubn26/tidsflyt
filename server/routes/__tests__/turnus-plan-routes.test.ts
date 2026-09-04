import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import express from "express";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { pool } from "../../db";
import { withSystemRlsContext } from "../../lib/database-rls-context";
import { registerTurnusPlanRoutes } from "../turnus-plan-routes";

function appFor(userId: string) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as any).user = { id: userId }; next(); });
  registerTurnusPlanRoutes(app);
  return app;
}

describe("turnus plan/behov/vaktlinjer routes", () => {
  const nonce = randomUUID();
  const userId = `plan-${nonce}`;
  let orgId: number;
  let avdelingId: number;

  beforeAll(async () => {
    await pool.query(readFileSync("migrations/105_turnus_core.sql", "utf8"));
    await pool.query(readFileSync("migrations/106_turnus_org_members.sql", "utf8"));
    await pool.query(`INSERT INTO users (id, email) VALUES ($1,$2) ON CONFLICT (id) DO NOTHING`, [userId, `${userId}@example.test`]);
    await withSystemRlsContext("test_plan", async (c) => {
      const o = await c.query(`INSERT INTO tidum_turnus_organisasjoner (navn) VALUES ($1) RETURNING id`, [`Org ${nonce}`]);
      orgId = Number(o.rows[0].id);
      await c.query(`INSERT INTO tidum_turnus_org_members (org_id, user_id, rolle) VALUES ($1,$2,'leder')`, [orgId, userId]);
      const a = await c.query(`INSERT INTO tidum_turnus_avdelinger (org_id, navn) VALUES ($1,$2) RETURNING id`, [orgId, `Avd ${nonce}`]);
      avdelingId = Number(a.rows[0].id);
    });
  });

  it("rejects a plan with a foreign/nonexistent avdelingId", async () => {
    const app = appFor(userId);
    const r = await request(app).post("/api/turnus/planer").send({ navn: "Plan", avdelingId: 999999 });
    expect(r.status).toBe(400);
  });

  it("creates and lists a plan, tracks readiness gating", async () => {
    const app = appFor(userId);
    const created = await request(app).post("/api/turnus/planer").send({ navn: `Plan ${nonce}`, avdelingId });
    expect(created.status).toBe(200);
    const planId = created.body.id;

    const list = await request(app).get("/api/turnus/planer");
    expect(list.body.some((p: any) => p.id === planId)).toBe(true);

    const bareReadiness = await request(app).get(`/api/turnus/planer/${planId}/readiness`);
    expect(bareReadiness.status).toBe(200);
    expect(bareReadiness.body.ready).toBe(false);
    expect(bareReadiness.body.mangler).toContain("vaktkoder");
    expect(bareReadiness.body.mangler).toContain("ansatte");

    const vaktkode = await withSystemRlsContext("test_plan", async (c) =>
      (await c.query(`INSERT INTO tidum_turnus_vaktkoder (org_id, kode) VALUES ($1,$2) RETURNING id`, [orgId, `D${nonce.slice(0, 4)}`])).rows[0]);
    const ansatt = await withSystemRlsContext("test_plan", async (c) =>
      (await c.query(`INSERT INTO tidum_turnus_ansatte (org_id, navn) VALUES ($1,$2) RETURNING id`, [orgId, `Ansatt ${nonce}`])).rows[0]);

    const behov = await request(app).post("/api/turnus/bemanningsbehov").send({
      avdelingId,
      vaktkodeId: Number(vaktkode.id),
    });
    expect(behov.status).toBe(200);

    await withSystemRlsContext("test_plan", async (c) =>
      c.query(`INSERT INTO tidum_turnus_regler (org_id, regeltype) VALUES ($1,$2)`, [orgId, "aml_daglig_hvile_11t"]));

    const vaktlinje = await request(app).post(`/api/turnus/planer/${planId}/vaktlinjer`).send({
      linjenr: 1,
      tildeltAnsattId: Number(ansatt.id),
    });
    expect(vaktlinje.status).toBe(200);
    const vaktlinjeList = await request(app).get(`/api/turnus/planer/${planId}/vaktlinjer`);
    expect(vaktlinjeList.body.some((v: any) => v.id === vaktlinje.body.id)).toBe(true);

    const behovList = await request(app).get(`/api/turnus/planer/${planId}/behov`);
    expect(behovList.body.some((b: any) => b.id === behov.body.id)).toBe(true);

    const readyReadiness = await request(app).get(`/api/turnus/planer/${planId}/readiness`);
    expect(readyReadiness.status).toBe(200);
    expect(readyReadiness.body).toEqual({ ready: true, mangler: [] });
  });

  it("rejects bemanningsbehov with a foreign/nonexistent vaktkodeId", async () => {
    const app = appFor(userId);
    const r = await request(app).post("/api/turnus/bemanningsbehov").send({ avdelingId, vaktkodeId: 999999 });
    expect(r.status).toBe(400);
  });

  it("rejects a vaktlinje for an unknown plan with 400", async () => {
    const app = appFor(userId);
    const r = await request(app).post("/api/turnus/planer/999999/vaktlinjer").send({ linjenr: 1 });
    expect(r.status).toBe(400);
  });

  it("returns 404 for readiness on a foreign/nonexistent plan", async () => {
    const app = appFor(userId);
    const r = await request(app).get("/api/turnus/planer/999999/readiness");
    expect(r.status).toBe(404);
  });

  it("returns 404 for vaktlinjer GET on a foreign/nonexistent plan", async () => {
    const app = appFor(userId);
    const r = await request(app).get("/api/turnus/planer/999999/vaktlinjer");
    expect(r.status).toBe(404);
  });

  it("returns 404 for behov GET on a foreign/nonexistent plan", async () => {
    const app = appFor(userId);
    const r = await request(app).get("/api/turnus/planer/999999/behov");
    expect(r.status).toBe(404);
  });

  it("rejects an unauthenticated request with 403", async () => {
    const app = express();
    app.use(express.json());
    registerTurnusPlanRoutes(app);
    const r = await request(app).get("/api/turnus/planer");
    expect(r.status).toBe(403);
  });
});
