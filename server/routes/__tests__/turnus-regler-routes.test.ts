import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import express from "express";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { pool } from "../../db";
import { withSystemRlsContext } from "../../lib/database-rls-context";
import { registerTurnusReglerRoutes } from "../turnus-regler-routes";

function appFor(userId: string) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as any).user = { id: userId }; next(); });
  registerTurnusReglerRoutes(app);
  return app;
}

describe("turnus regler/onsker/prioritering routes", () => {
  const nonce = randomUUID();
  const userId = `regler-${nonce}`;
  let orgId: number;

  beforeAll(async () => {
    await pool.query(readFileSync("migrations/105_turnus_core.sql", "utf8"));
    await pool.query(readFileSync("migrations/106_turnus_org_members.sql", "utf8"));
    await pool.query(`INSERT INTO users (id, email) VALUES ($1,$2) ON CONFLICT (id) DO NOTHING`, [userId, `${userId}@example.test`]);
    await withSystemRlsContext("test_regler", async (c) => {
      const o = await c.query(`INSERT INTO tidum_turnus_organisasjoner (navn) VALUES ($1) RETURNING id`, [`Org ${nonce}`]);
      orgId = Number(o.rows[0].id);
      await c.query(`INSERT INTO tidum_turnus_org_members (org_id, user_id, rolle) VALUES ($1,$2,'leder')`, [orgId, userId]);
    });
  });

  it("creates, lists, and soft-deletes a regel", async () => {
    const app = appFor(userId);
    const c = await request(app).post("/api/turnus/regler").send({ regeltype: "aml_daglig_hvile_11t", haard: true });
    expect(c.status).toBe(200);
    expect(c.body.regeltype).toBe("aml_daglig_hvile_11t");
    expect(Number(c.body.org_id)).toBe(orgId);
    const list = await request(app).get("/api/turnus/regler");
    expect(list.body.some((r: any) => r.id === c.body.id)).toBe(true);
    const del = await request(app).delete(`/api/turnus/regler/${c.body.id}`);
    expect(del.status).toBe(200);
    const after = await request(app).get("/api/turnus/regler");
    expect(after.body.some((r: any) => r.id === c.body.id)).toBe(false);
  });

  it("rejects a regel without regeltype", async () => {
    const app = appFor(userId);
    const r = await request(app).post("/api/turnus/regler").send({ haard: true });
    expect(r.status).toBe(400);
  });

  it("rejects deleting an unknown regel with 404", async () => {
    const app = appFor(userId);
    const r = await request(app).delete("/api/turnus/regler/999999");
    expect(r.status).toBe(404);
  });

  it("creates and lists an onske, rejecting missing fields", async () => {
    const app = appFor(userId);
    const ansatt = await withSystemRlsContext("test_regler", async (c) =>
      (await c.query(`INSERT INTO tidum_turnus_ansatte (org_id, navn) VALUES ($1,$2) RETURNING id`, [orgId, `Ansatt ${nonce}`])).rows[0]);
    const created = await request(app).post("/api/turnus/onsker").send({ ansattId: Number(ansatt.id), type: "fri" });
    expect(created.status).toBe(200);
    expect(created.body.type).toBe("fri");
    const list = await request(app).get("/api/turnus/onsker");
    expect(list.body.some((o: any) => o.id === created.body.id)).toBe(true);
    const bad = await request(app).post("/api/turnus/onsker").send({ type: "fri" });
    expect(bad.status).toBe(400);
  });

  it("creates and returns the latest prioritering profile", async () => {
    const app = appFor(userId);
    await request(app).post("/api/turnus/prioritering").send({ vektOnsker: 3 });
    const second = await request(app).post("/api/turnus/prioritering").send({ vektOnsker: 7 });
    expect(second.status).toBe(200);
    expect(second.body.vekt_onsker).toBe(7);
    const get = await request(app).get("/api/turnus/prioritering");
    expect(get.status).toBe(200);
    expect(get.body.vekt_onsker).toBe(7);
  });

  it("rejects an unauthenticated request with 403", async () => {
    const app = express();
    app.use(express.json());
    registerTurnusReglerRoutes(app);
    const r = await request(app).get("/api/turnus/regler");
    expect(r.status).toBe(403);
  });
});
