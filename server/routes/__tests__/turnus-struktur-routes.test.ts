import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import express from "express";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { pool } from "../../db";
import { withSystemRlsContext } from "../../lib/database-rls-context";
import { registerTurnusStrukturRoutes } from "../turnus-struktur-routes";

function appFor(userId: string) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as any).user = { id: userId }; next(); });
  registerTurnusStrukturRoutes(app);
  return app;
}

describe("turnus struktur routes", () => {
  const nonce = randomUUID();
  const userId = `struktur-${nonce}`;
  beforeAll(async () => {
    await pool.query(readFileSync("migrations/105_turnus_core.sql", "utf8"));
    await pool.query(readFileSync("migrations/106_turnus_org_members.sql", "utf8"));
    await withSystemRlsContext("test_struktur", async (c) => {
      const o = await c.query(`INSERT INTO tidum_turnus_organisasjoner (navn) VALUES ($1) RETURNING id`, [`Org ${nonce}`]);
      await c.query(`INSERT INTO tidum_turnus_org_members (org_id, user_id, rolle) VALUES ($1,$2,'leder')`, [Number(o.rows[0].id), userId]);
    });
  });
  it("creates and lists an avdeling scoped to the actor's org", async () => {
    const app = appFor(userId);
    const created = await request(app).post("/api/turnus/avdelinger").send({ navn: `Avd ${nonce}` });
    expect(created.status).toBe(200);
    expect(created.body.navn).toBe(`Avd ${nonce}`);
    const list = await request(app).get("/api/turnus/avdelinger");
    expect(list.status).toBe(200);
    expect(list.body.some((a: any) => a.navn === `Avd ${nonce}`)).toBe(true);
  });
  it("rejects an unauthenticated request with 403", async () => {
    const app = express();
    app.use(express.json());
    registerTurnusStrukturRoutes(app);
    const r = await request(app).get("/api/turnus/avdelinger");
    expect(r.status).toBe(403);
  });
});
