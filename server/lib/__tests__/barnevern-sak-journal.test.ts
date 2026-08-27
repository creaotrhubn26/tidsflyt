import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import http from "http";
import { pool } from "../../db";
import { withSystemRlsContext } from "../database-rls-context";

// Krav 4: append-only journal på kommunal barnevernssak.
describe("Barnevern sak-journal (krav 4)", { timeout: 20000 }, () => {
  const cleanupKommuneIds: number[] = [];
  const cleanupMeldingIds: string[] = [];
  const cleanupSakIds: string[] = [];
  const cleanupUserIds: string[] = [];

  afterEach(async () => {
    const sakIds = cleanupSakIds.splice(0);
    const meldingIds = cleanupMeldingIds.splice(0);
    const userIds = cleanupUserIds.splice(0);
    const kommuneIds = cleanupKommuneIds.splice(0);
    await withSystemRlsContext("barnevern_journal_test_cleanup", async (client) => {
      for (const id of sakIds) {
        await client.query(`DELETE FROM tidum_frister WHERE entity_id = $1`, [id]);
        await client.query(`DELETE FROM tidum_barnevern_sak_fase_historikk WHERE sak_id = $1`, [id]);
        // Journal og vedlegg er append-only (ingen DELETE-grant);
        // ON DELETE CASCADE fra saken rydder dem.
        await client.query(`DELETE FROM tidum_barnevern_saker WHERE id = $1`, [id]);
      }
      for (const id of meldingIds) {
        await client.query(`DELETE FROM tidum_frister WHERE entity_id = $1`, [id]);
        await client.query(`DELETE FROM tidum_barnevern_meldinger WHERE id = $1`, [id]);
      }
    });
    for (const id of userIds) await pool.query(`DELETE FROM users WHERE id = $1`, [id]);
    for (const id of kommuneIds) await pool.query(`DELETE FROM tidum_kommuner WHERE id = $1`, [id]);
  });

  async function insertTestKommune(): Promise<number> {
    const { rows: [row] } = await pool.query(
      `INSERT INTO tidum_kommuner (navn, org_nummer, kommunenummer) VALUES ($1, $2, '9999') RETURNING id`,
      [`Testkommune ${Date.now()}`, `${900000000 + Math.floor(Math.random() * 99999999)}`],
    );
    cleanupKommuneIds.push(row.id);
    return row.id;
  }

  const uniqueId = (prefix: string) =>
    `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  async function actorApp(prefix: string, kommuneId: number, role: string) {
    const id = uniqueId(prefix);
    await pool.query(
      `INSERT INTO users (id, username, password, email, kommune_id, role) VALUES ($1, $2, 'x', $3, $4, $5)`,
      [id, id, `${id}@example.com`, kommuneId, role],
    );
    cleanupUserIds.push(id);
    const { registerRoutes } = await import("../../routes");
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.user = { id };
      req.isAuthenticated = () => true;
      next();
    });
    await registerRoutes(http.createServer(), app);
    return { id, app };
  }

  async function opprettSak(app: any) {
    const melding = await request(app).post("/api/barnevern/meldinger").send({
      melderKategori: "skole",
      beskrivelse: "Bekymring.",
      barnNavn: "Test Barn",
    });
    cleanupMeldingIds.push(melding.body.id);
    const res = await request(app).post(`/api/barnevern/meldinger/${melding.body.id}/send-til-undersokelse`).send({});
    cleanupSakIds.push(res.body.sak.id);
    return res.body.sak;
  }

  it("journalfører med kategori, tid og forfatter; retter med ny rad; listes kronologisk", async () => {
    const kommuneId = await insertTestKommune();
    const { id: userId, app } = await actorApp("sb", kommuneId, "kommune_saksbehandler");
    const sak = await opprettSak(app);

    const forste = await request(app).post(`/api/barnevern/saker/${sak.id}/journal`).send({
      kategori: "telefonsamtale",
      innhold: "Samtale med skolen om fravær.",
    });
    expect(forste.status).toBe(201);
    expect(forste.body.forfatterUserId).toBe(userId);
    expect(forste.body.createdAt).toBeTruthy();

    const retting = await request(app).post(`/api/barnevern/saker/${sak.id}/journal`).send({
      kategori: "telefonsamtale",
      innhold: "Korreksjon: samtalen gjaldt også søsken.",
      correctsEntryId: forste.body.id,
    });
    expect(retting.status).toBe(201);
    expect(retting.body.correctsEntryId).toBe(forste.body.id);

    const liste = await request(app).get(`/api/barnevern/saker/${sak.id}/journal`);
    expect(liste.status).toBe(200);
    expect(liste.body).toHaveLength(2);
    expect(liste.body[0].id).toBe(forste.body.id);
    expect(liste.body[1].correctsEntryId).toBe(forste.body.id);
  });

  it("avviser ugyldig kategori, tomt innhold og retting mot annen saks oppføring", async () => {
    const kommuneId = await insertTestKommune();
    const { app } = await actorApp("sb", kommuneId, "kommune_saksbehandler");
    const sakA = await opprettSak(app);
    const sakB = await opprettSak(app);

    const ugyldigKategori = await request(app).post(`/api/barnevern/saker/${sakA.id}/journal`).send({
      kategori: "sms",
      innhold: "Tekst.",
    });
    expect(ugyldigKategori.status).toBe(400);

    const tomt = await request(app).post(`/api/barnevern/saker/${sakA.id}/journal`).send({
      kategori: "notat",
      innhold: "   ",
    });
    expect(tomt.status).toBe(400);

    const paaA = await request(app).post(`/api/barnevern/saker/${sakA.id}/journal`).send({
      kategori: "notat",
      innhold: "Oppføring på sak A.",
    });
    const kryssRetting = await request(app).post(`/api/barnevern/saker/${sakB.id}/journal`).send({
      kategori: "notat",
      innhold: "Retter på tvers av saker.",
      correctsEntryId: paaA.body.id,
    });
    expect(kryssRetting.status).toBe(400);
  });

  it("journal er kommune-isolert og har ingen endrings-/sletteruter", async () => {
    const kommuneA = await insertTestKommune();
    const kommuneB = await insertTestKommune();
    const { app: appA } = await actorApp("sb-a", kommuneA, "kommune_saksbehandler");
    const { app: appB } = await actorApp("sb-b", kommuneB, "kommune_saksbehandler");
    const sak = await opprettSak(appA);

    await request(appA).post(`/api/barnevern/saker/${sak.id}/journal`).send({
      kategori: "notat",
      innhold: "Sensitivt notat.",
    });

    const fremmed = await request(appB).get(`/api/barnevern/saker/${sak.id}/journal`);
    expect(fremmed.status).toBe(404);

    // Append-only: PATCH/PUT/DELETE finnes ikke.
    const liste = await request(appA).get(`/api/barnevern/saker/${sak.id}/journal`);
    const entryId = liste.body[0].id;
    for (const metode of ["patch", "put", "delete"] as const) {
      const res = await (request(appA) as any)[metode](`/api/barnevern/saker/${sak.id}/journal/${entryId}`).send({});
      expect(res.status).toBe(404);
    }
  });

  it("vedlegg lastes opp og ned med tilgangskontroll", async () => {
    const kommuneA = await insertTestKommune();
    const kommuneB = await insertTestKommune();
    const { app: appA } = await actorApp("sb-a", kommuneA, "kommune_saksbehandler");
    const { app: appB } = await actorApp("sb-b", kommuneB, "kommune_saksbehandler");
    const sak = await opprettSak(appA);

    const entry = await request(appA).post(`/api/barnevern/saker/${sak.id}/journal`).send({
      kategori: "mote",
      innhold: "Referat med vedlegg.",
    });

    const opplasting = await request(appA)
      .post(`/api/barnevern/saker/${sak.id}/journal/${entry.body.id}/vedlegg`)
      .attach("file", Buffer.from("%PDF-1.4 test"), { filename: "referat.pdf", contentType: "application/pdf" });
    expect(opplasting.status).toBe(201);
    expect(opplasting.body.originalName).toBe("referat.pdf");

    const nedlasting = await request(appA)
      .get(`/api/barnevern/saker/${sak.id}/journal/${entry.body.id}/vedlegg/${opplasting.body.id}`);
    expect(nedlasting.status).toBe(200);
    expect(nedlasting.headers["content-type"]).toContain("application/pdf");

    const fremmed = await request(appB)
      .get(`/api/barnevern/saker/${sak.id}/journal/${entry.body.id}/vedlegg/${opplasting.body.id}`);
    expect(fremmed.status).toBe(404);
  });
});
