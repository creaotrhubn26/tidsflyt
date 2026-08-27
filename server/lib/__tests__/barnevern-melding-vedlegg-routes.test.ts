import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import http from "http";
import fs from "fs";
import path from "path";
import { pool } from "../../db";
import { withSystemRlsContext } from "../database-rls-context";

describe("Barnevern melding-vedlegg", () => {
  const cleanupKommuneIds: number[] = [];
  const cleanupMeldingIds: string[] = [];
  const cleanupFilePaths: string[] = [];
  const cleanupUserIds: string[] = [];

  afterEach(async () => {
    for (const filePath of cleanupFilePaths.splice(0)) {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    const meldingIds = cleanupMeldingIds.splice(0);
    const userIds = cleanupUserIds.splice(0);
    const kommuneIds = cleanupKommuneIds.splice(0);
    await withSystemRlsContext("barnevern_attachment_test_cleanup", async (client) => {
      for (const id of meldingIds) {
        await client.query(`DELETE FROM tidum_barnevern_melding_vedlegg WHERE melding_id = $1`, [id]);
        await client.query(`DELETE FROM tidum_frister WHERE entity_id = $1`, [id]);
        await client.query(`DELETE FROM tidum_barnevern_meldinger WHERE id = $1`, [id]);
      }
    });
    for (const id of userIds) await pool.query(`DELETE FROM users WHERE id = $1`, [id]);
    for (const id of kommuneIds) await pool.query(`DELETE FROM tidum_kommuner WHERE id = $1`, [id]);
  });

  async function insertTestKommune(): Promise<number> {
    const { rows: [row] } = await pool.query(
      `INSERT INTO tidum_kommuner (navn, org_nummer, kommunenummer) VALUES ($1, $2, '9998') RETURNING id`,
      [`Testkommune ${Date.now()}`, `${900000000 + Math.floor(Math.random() * 99999999)}`],
    );
    cleanupKommuneIds.push(row.id);
    return row.id;
  }

  // Må speile BARNEVERN_UPLOAD_DIR i server/routes/barnevern-melding-routes.ts
  // (bevisst UTENFOR den offentlig monterte uploads/-roten).
  const uploadedFilePath = (filename: string) =>
    path.join(process.cwd(), "private-uploads", "barnevern-meldinger", filename);

  // Unik id per kjøring så suiten er re-kjørbar etter en avbrutt kjøring.
  const uniqueId = (prefix: string) =>
    `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // uploaded_by har FK til users.id (NOT NULL, Task 1-skjema), og rutene henter
  // rolle/kommune fra users via req.user.id — aktøren MÅ finnes i databasen.
  async function insertTestUser(id: string, kommuneId: number, role: string): Promise<void> {
    await pool.query(
      `INSERT INTO users (id, username, password, email, kommune_id, role) VALUES ($1, $2, 'x', $3, $4, $5)`,
      [id, id, `${id}@example.com`, kommuneId, role],
    );
    cleanupUserIds.push(id);
  }

  async function appWithUser(user: { id: string }) {
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

  async function actorApp(prefix: string, kommuneId: number, role: string) {
    const id = uniqueId(prefix);
    await insertTestUser(id, kommuneId, role);
    return { id, app: await appWithUser({ id }) };
  }

  // Fullt registerRoutes-app + multer-disk-IO — 5 s standardtimeout er for knapp
  // under full-suite-belastning (passerer isolert, flaket i full kjøring).
  it("kan laste opp og laste ned et vedlegg på egen kommunes melding", { timeout: 15000 }, async () => {
    const kommuneId = await insertTestKommune();
    const { app } = await actorApp("sb-vedlegg", kommuneId, "kommune_saksbehandler");
    const created = await request(app).post("/api/barnevern/meldinger").send({
      melderKategori: "skole", beskrivelse: "Test vedlegg",
    });
    cleanupMeldingIds.push(created.body.id);

    const upload = await request(app)
      .post(`/api/barnevern/meldinger/${created.body.id}/vedlegg`)
      .attach("file", Buffer.from("test-innhold"), "notat.pdf");
    expect(upload.status).toBe(201);
    cleanupFilePaths.push(uploadedFilePath(upload.body.filename));
    expect(upload.body.originalName).toBe("notat.pdf");

    const download = await request(app).get(
      `/api/barnevern/meldinger/${created.body.id}/vedlegg/${upload.body.id}`,
    );
    expect(download.status).toBe(200);
    // application/pdf parses som binær hos superagent (res.body er en Buffer, ikke res.text)
    expect(Buffer.from(download.body).toString()).toBe("test-innhold");
  });

  // To fulle registerRoutes-apper i én test — 5 s standardtimeout er for knapp.
  it("aktør i kommune B kan IKKE laste ned vedlegg fra en melding i kommune A", { timeout: 15000 }, async () => {
    const kommuneA = await insertTestKommune();
    const kommuneB = await insertTestKommune();
    const { app: appA } = await actorApp("sb-vedlegg-a", kommuneA, "kommune_saksbehandler");
    const created = await request(appA).post("/api/barnevern/meldinger").send({
      melderKategori: "skole", beskrivelse: "Test tverr-kommune",
    });
    cleanupMeldingIds.push(created.body.id);
    const upload = await request(appA)
      .post(`/api/barnevern/meldinger/${created.body.id}/vedlegg`)
      .attach("file", Buffer.from("hemmelig"), "hemmelig.pdf");
    cleanupFilePaths.push(uploadedFilePath(upload.body.filename));

    const { app: appB } = await actorApp("sb-vedlegg-b", kommuneB, "kommune_saksbehandler");
    const res = await request(appB).get(
      `/api/barnevern/meldinger/${created.body.id}/vedlegg/${upload.body.id}`,
    );
    expect(res.status).toBe(404);
  });
});
