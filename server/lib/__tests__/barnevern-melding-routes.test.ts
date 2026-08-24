import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import http from "http";
import { pool } from "../../db";

describe("Barnevern meldingsmottak-ruter", () => {
  const cleanupKommuneIds: number[] = [];
  const cleanupMeldingIds: string[] = [];
  const cleanupUserIds: string[] = [];

  afterEach(async () => {
    for (const id of cleanupMeldingIds.splice(0)) {
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
      `INSERT INTO tidum_kommuner (navn, org_nummer, kommunenummer) VALUES ($1, $2, '9999') RETURNING id`,
      [`Testkommune ${Date.now()}`, `${900000000 + Math.floor(Math.random() * 99999999)}`],
    );
    cleanupKommuneIds.push(row.id);
    return row.id;
  }

  // tildeltSaksbehandlerId og avklartAvUserId har FK til users.id (Task 1-
  // skjema). req.user injiseres direkte i disse testene uten ekte
  // passport-login, så enhver id som skal SKRIVES til en av disse to
  // FK-kolonnene må først eksistere som en ekte users-rad (samme mønster
  // som insertUser() i task-assignment-routes.test.ts).
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

  it("kommune_saksbehandler kan opprette en manuell melding, avklaringsfrist beregnes til +7 dager", async () => {
    const kommuneId = await insertTestKommune();
    const app = await appWithUser({ id: "test-saksbehandler-1", role: "kommune_saksbehandler", kommuneId });

    const res = await request(app).post("/api/barnevern/meldinger").send({
      melderKategori: "skole",
      beskrivelse: "Bekymring for barnets skolefravær.",
    });

    expect(res.status).toBe(201);
    cleanupMeldingIds.push(res.body.id);
    expect(res.body.status).toBe("mottatt");
    expect(res.body.meldingsnummer).toMatch(/^BVM-9999-/);
    const dueAt = new Date(res.body.avklaringsfrist).getTime();
    const expected = Date.now() + 7 * 86400000;
    expect(Math.abs(dueAt - expected)).toBeLessThan(60_000);
  });

  it("aktør i kommune A kan IKKE se en melding i kommune B (404, ikke 403)", async () => {
    const kommuneA = await insertTestKommune();
    const kommuneB = await insertTestKommune();
    const appA = await appWithUser({ id: "user-a", role: "kommune_saksbehandler", kommuneId: kommuneA });
    const created = await request(appA).post("/api/barnevern/meldinger").send({
      melderKategori: "anonym",
      beskrivelse: "Test på tvers av kommuner.",
    });
    cleanupMeldingIds.push(created.body.id);

    const appB = await appWithUser({ id: "user-b", role: "kommune_saksbehandler", kommuneId: kommuneB });
    const res = await request(appB).get(`/api/barnevern/meldinger/${created.body.id}`);
    expect(res.status).toBe(404);
  });

  it("GET /api/barnevern/meldinger lister kun egen kommunes meldinger", async () => {
    const kommuneA = await insertTestKommune();
    const kommuneB = await insertTestKommune();
    const appA = await appWithUser({ id: "user-a2", role: "kommune_saksbehandler", kommuneId: kommuneA });
    const appB = await appWithUser({ id: "user-b2", role: "kommune_saksbehandler", kommuneId: kommuneB });
    const inA = await request(appA).post("/api/barnevern/meldinger").send({ melderKategori: "politi", beskrivelse: "A" });
    const inB = await request(appB).post("/api/barnevern/meldinger").send({ melderKategori: "politi", beskrivelse: "B" });
    cleanupMeldingIds.push(inA.body.id, inB.body.id);

    const listA = await request(appA).get("/api/barnevern/meldinger");
    expect(listA.body.find((m: any) => m.id === inA.body.id)).toBeDefined();
    expect(listA.body.find((m: any) => m.id === inB.body.id)).toBeUndefined();
  });

  it("PATCH .../tildel: barnevernsleder kan tildele, status går fra mottatt til under_avklaring", async () => {
    const kommuneId = await insertTestKommune();
    await insertTestUser("sb-1", kommuneId);
    const saksbehandlerApp = await appWithUser({ id: "sb-1", role: "kommune_saksbehandler", kommuneId });
    const created = await request(saksbehandlerApp).post("/api/barnevern/meldinger").send({
      melderKategori: "lege", beskrivelse: "Test tildeling",
    });
    cleanupMeldingIds.push(created.body.id);

    const lederApp = await appWithUser({ id: "leder-1", role: "barnevernsleder", kommuneId });
    const res = await request(lederApp)
      .patch(`/api/barnevern/meldinger/${created.body.id}/tildel`)
      .send({ tildeltSaksbehandlerId: "sb-1" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("under_avklaring");
    expect(res.body.tildeltSaksbehandlerId).toBe("sb-1");
  });

  it("kommune_saksbehandler kan IKKE tildele (kun barnevernsleder)", async () => {
    const kommuneId = await insertTestKommune();
    const app = await appWithUser({ id: "sb-2", role: "kommune_saksbehandler", kommuneId });
    const created = await request(app).post("/api/barnevern/meldinger").send({
      melderKategori: "nav", beskrivelse: "Test",
    });
    cleanupMeldingIds.push(created.body.id);

    const res = await request(app)
      .patch(`/api/barnevern/meldinger/${created.body.id}/tildel`)
      .send({ tildeltSaksbehandlerId: "sb-2" });
    expect(res.status).toBe(403);
  });

  it("henlegg krever begrunnelse (400 uten), setter status+avklartDato ved suksess, kansellerer fristen", async () => {
    const kommuneId = await insertTestKommune();
    await insertTestUser("sb-3", kommuneId);
    const app = await appWithUser({ id: "sb-3", role: "kommune_saksbehandler", kommuneId });
    const created = await request(app).post("/api/barnevern/meldinger").send({
      melderKategori: "familie_nabo", beskrivelse: "Test henleggelse",
    });
    cleanupMeldingIds.push(created.body.id);

    const missing = await request(app).post(`/api/barnevern/meldinger/${created.body.id}/henlegg`).send({});
    expect(missing.status).toBe(400);

    const res = await request(app)
      .post(`/api/barnevern/meldinger/${created.body.id}/henlegg`)
      .send({ begrunnelse: "Ikke grunnlag for videre oppfølging." });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("henlagt");
    expect(res.body.avklartDato).toBeDefined();

    const { rows } = await pool.query(
      `SELECT status FROM tidum_frister WHERE entity_type = 'barnevern_melding' AND entity_id = $1`,
      [created.body.id],
    );
    expect(rows[0].status).toBe("kansellert");
  });

  it("avviser opprettelse med ugyldig melderKategori (400)", async () => {
    const kommuneId = await insertTestKommune();
    const app = await appWithUser({ id: "sb-5", role: "kommune_saksbehandler", kommuneId });
    const res = await request(app).post("/api/barnevern/meldinger").send({
      melderKategori: "ikke-en-gyldig-kategori",
      beskrivelse: "Test",
    });
    expect(res.status).toBe(400);
  });

  it("avviser opprettelse med ugyldig barnFodselsnummer-format (400)", async () => {
    const kommuneId = await insertTestKommune();
    const app = await appWithUser({ id: "sb-6", role: "kommune_saksbehandler", kommuneId });
    const res = await request(app).post("/api/barnevern/meldinger").send({
      melderKategori: "skole",
      beskrivelse: "Test",
      barnFodselsnummer: "123", // ikke 11 siffer
    });
    expect(res.status).toBe(400);
  });

  it("send-til-undersokelse setter riktig status og kansellerer fristen", async () => {
    const kommuneId = await insertTestKommune();
    await insertTestUser("sb-4", kommuneId);
    const app = await appWithUser({ id: "sb-4", role: "kommune_saksbehandler", kommuneId });
    const created = await request(app).post("/api/barnevern/meldinger").send({
      melderKategori: "helsepersonell", beskrivelse: "Test videresending",
    });
    cleanupMeldingIds.push(created.body.id);

    const res = await request(app).post(`/api/barnevern/meldinger/${created.body.id}/send-til-undersokelse`).send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("sendt_til_undersokelse");
  });
});
