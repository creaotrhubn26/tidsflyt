import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import http from "http";
import fs from "fs";
import path from "path";
import { pool } from "../../db";

describe("Barnevern melding-vedlegg", () => {
  const cleanupKommuneIds: number[] = [];
  const cleanupMeldingIds: string[] = [];
  const cleanupFilePaths: string[] = [];
  const cleanupUserIds: string[] = [];

  afterEach(async () => {
    for (const filePath of cleanupFilePaths.splice(0)) {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    for (const id of cleanupMeldingIds.splice(0)) {
      await pool.query(`DELETE FROM tidum_barnevern_melding_vedlegg WHERE melding_id = $1`, [id]);
      await pool.query(`DELETE FROM tidum_frister WHERE entity_id = $1`, [id]);
      await pool.query(`DELETE FROM tidum_barnevern_meldinger WHERE id = $1`, [id]);
    }
    for (const id of cleanupUserIds.splice(0)) {
      await pool.query(`DELETE FROM users WHERE id = $1`, [id]);
    }
    for (const id of cleanupKommuneIds.splice(0)) {
      await pool.query(`DELETE FROM tidum_kommuner WHERE id = $1`, [id]);
    }
  });

  async function insertTestKommune(): Promise<number> {
    const { rows: [row] } = await pool.query(
      `INSERT INTO tidum_kommuner (navn, org_nummer, kommunenummer) VALUES ($1, $2, '9998') RETURNING id`,
      [`Testkommune ${Date.now()}`, `${900000000 + Math.floor(Math.random() * 99999999)}`],
    );
    cleanupKommuneIds.push(row.id);
    return row.id;
  }

  // uploaded_by har FK til users.id (NOT NULL, Task 1-skjema). Samme mønster
  // som insertTestUser() i barnevern-melding-routes.test.ts (Task 3).
  async function insertTestUser(id: string, kommuneId: number): Promise<void> {
    await pool.query(
      `INSERT INTO users (id, username, password, email, kommune_id) VALUES ($1, $2, 'x', $3, $4)`,
      [id, id, `${id}@example.com`, kommuneId],
    );
    cleanupUserIds.push(id);
  }

  async function appWithUser(user: { id: string; role: string; kommuneId?: number }) {
    const { registerRoutes } = await import("../../routes");
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.user = user;
      req.isAuthenticated = () => true;
      next();
    });
    await registerRoutes(http.createServer(), app);
    return app;
  }

  it("kan laste opp og laste ned et vedlegg på egen kommunes melding", async () => {
    const kommuneId = await insertTestKommune();
    await insertTestUser("sb-vedlegg-1", kommuneId);
    const app = await appWithUser({ id: "sb-vedlegg-1", role: "kommune_saksbehandler", kommuneId });
    const created = await request(app).post("/api/barnevern/meldinger").send({
      melderKategori: "skole", beskrivelse: "Test vedlegg",
    });
    cleanupMeldingIds.push(created.body.id);

    const upload = await request(app)
      .post(`/api/barnevern/meldinger/${created.body.id}/vedlegg`)
      .attach("file", Buffer.from("test-innhold"), "notat.pdf");
    expect(upload.status).toBe(201);
    expect(upload.body.originalName).toBe("notat.pdf");

    const download = await request(app).get(
      `/api/barnevern/meldinger/${created.body.id}/vedlegg/${upload.body.id}`,
    );
    expect(download.status).toBe(200);
    // application/pdf parses som binær hos superagent (res.body er en Buffer, ikke res.text)
    expect(Buffer.from(download.body).toString()).toBe("test-innhold");
  });

  it("aktør i kommune B kan IKKE laste ned vedlegg fra en melding i kommune A", async () => {
    const kommuneA = await insertTestKommune();
    const kommuneB = await insertTestKommune();
    await insertTestUser("sb-vedlegg-a", kommuneA);
    await insertTestUser("sb-vedlegg-b", kommuneB);
    const appA = await appWithUser({ id: "sb-vedlegg-a", role: "kommune_saksbehandler", kommuneId: kommuneA });
    const created = await request(appA).post("/api/barnevern/meldinger").send({
      melderKategori: "skole", beskrivelse: "Test tverr-kommune",
    });
    cleanupMeldingIds.push(created.body.id);
    const upload = await request(appA)
      .post(`/api/barnevern/meldinger/${created.body.id}/vedlegg`)
      .attach("file", Buffer.from("hemmelig"), "hemmelig.pdf");

    const appB = await appWithUser({ id: "sb-vedlegg-b", role: "kommune_saksbehandler", kommuneId: kommuneB });
    const res = await request(appB).get(
      `/api/barnevern/meldinger/${created.body.id}/vedlegg/${upload.body.id}`,
    );
    expect(res.status).toBe(404);
  });
});
