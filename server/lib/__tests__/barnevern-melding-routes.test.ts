import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import http from "http";
import { pool } from "../../db";
import { withKommuneRlsContext, withSystemRlsContext } from "../database-rls-context";

// Hver aktør får en full registerRoutes-app (~2–3 s), og flere tester bygger to
// av dem — 5 s standardtimeout gir flaky feil uten at logikken er endret.
describe("Barnevern meldingsmottak-ruter", { timeout: 15000 }, () => {
  const cleanupKommuneIds: number[] = [];
  const cleanupMeldingIds: string[] = [];
  const cleanupUserIds: string[] = [];

  afterEach(async () => {
    const meldingIds = cleanupMeldingIds.splice(0);
    const userIds = cleanupUserIds.splice(0);
    const kommuneIds = cleanupKommuneIds.splice(0);
    await withSystemRlsContext("barnevern_test_cleanup", async (client) => {
      for (const id of meldingIds) {
        // «Send til undersøkelse» oppretter en sak som refererer meldingen.
        const { rows: saker } = await client.query(
          `SELECT id FROM tidum_barnevern_saker WHERE melding_id = $1`, [id],
        );
        for (const sak of saker) {
          await client.query(`DELETE FROM tidum_frister WHERE entity_id = $1`, [sak.id]);
          await client.query(`DELETE FROM tidum_barnevern_saker WHERE id = $1`, [sak.id]);
        }
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

  // Unik id per kjøring: faste id-er (sb-1 …) kolliderer med residu fra en
  // avbrutt tidligere kjøring og gjør suiten ikke re-kjørbar.
  const uniqueId = (prefix: string) =>
    `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Rutene henter rolle og kommune_id fra users via req.user.id (aldri fra
  // sesjonen), så hver aktør MÅ finnes som ekte users-rad med riktig rolle.
  // tildeltSaksbehandlerId/avklartAvUserId har i tillegg FK til users.id.
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

  /** Oppretter users-raden og en app som er logget inn som den brukeren. */
  async function actorApp(prefix: string, kommuneId: number, role: string) {
    const id = uniqueId(prefix);
    await insertTestUser(id, kommuneId, role);
    return { id, app: await appWithUser({ id }) };
  }

  it("kommune_saksbehandler kan opprette en manuell melding, avklaringsfrist beregnes til +7 dager", async () => {
    const kommuneId = await insertTestKommune();
    const { app } = await actorApp("sb", kommuneId, "kommune_saksbehandler");

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
    const { app: appA } = await actorApp("sb-a", kommuneA, "kommune_saksbehandler");
    const created = await request(appA).post("/api/barnevern/meldinger").send({
      melderKategori: "anonym",
      beskrivelse: "Test på tvers av kommuner.",
    });
    cleanupMeldingIds.push(created.body.id);

    const { app: appB } = await actorApp("sb-b", kommuneB, "kommune_saksbehandler");
    const res = await request(appB).get(`/api/barnevern/meldinger/${created.body.id}`);
    expect(res.status).toBe(404);
  });

  it("GET /api/barnevern/meldinger lister kun egen kommunes meldinger", async () => {
    const kommuneA = await insertTestKommune();
    const kommuneB = await insertTestKommune();
    const { app: appA } = await actorApp("sb-a2", kommuneA, "kommune_saksbehandler");
    const { app: appB } = await actorApp("sb-b2", kommuneB, "kommune_saksbehandler");
    const inA = await request(appA).post("/api/barnevern/meldinger").send({ melderKategori: "politi", beskrivelse: "A" });
    const inB = await request(appB).post("/api/barnevern/meldinger").send({ melderKategori: "politi", beskrivelse: "B" });
    cleanupMeldingIds.push(inA.body.id, inB.body.id);

    const listA = await request(appA).get("/api/barnevern/meldinger");
    expect(listA.body.find((m: any) => m.id === inA.body.id)).toBeDefined();
    expect(listA.body.find((m: any) => m.id === inB.body.id)).toBeUndefined();
  });

  it("PATCH .../tildel: barnevernsleder kan tildele, status går fra mottatt til under_avklaring", async () => {
    const kommuneId = await insertTestKommune();
    const { id: sbId, app: saksbehandlerApp } = await actorApp("sb", kommuneId, "kommune_saksbehandler");
    const created = await request(saksbehandlerApp).post("/api/barnevern/meldinger").send({
      melderKategori: "lege", beskrivelse: "Test tildeling",
    });
    cleanupMeldingIds.push(created.body.id);

    const { app: lederApp } = await actorApp("leder", kommuneId, "barnevernsleder");
    const res = await request(lederApp)
      .patch(`/api/barnevern/meldinger/${created.body.id}/tildel`)
      .send({ tildeltSaksbehandlerId: sbId });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("under_avklaring");
    expect(res.body.tildeltSaksbehandlerId).toBe(sbId);
  });

  it("kommune_saksbehandler kan IKKE tildele (kun barnevernsleder)", async () => {
    const kommuneId = await insertTestKommune();
    const { id, app } = await actorApp("sb", kommuneId, "kommune_saksbehandler");
    const created = await request(app).post("/api/barnevern/meldinger").send({
      melderKategori: "nav", beskrivelse: "Test",
    });
    cleanupMeldingIds.push(created.body.id);

    const res = await request(app)
      .patch(`/api/barnevern/meldinger/${created.body.id}/tildel`)
      .send({ tildeltSaksbehandlerId: id });
    expect(res.status).toBe(403);
  });

  it("barnevernsleder kan ikke tildele meldingen til en bruker i en annen kommune", async () => {
    const kommuneA = await insertTestKommune();
    const kommuneB = await insertTestKommune();
    const { app: creatorApp } = await actorApp("sb-a-cross", kommuneA, "kommune_saksbehandler");
    const { app: leaderApp } = await actorApp("leader-a-cross", kommuneA, "barnevernsleder");
    const { id: foreignUserId } = await actorApp("sb-b-cross", kommuneB, "kommune_saksbehandler");
    const created = await request(creatorApp).post("/api/barnevern/meldinger").send({
      melderKategori: "skole",
      beskrivelse: "Skal bli i kommune A",
    });
    cleanupMeldingIds.push(created.body.id);

    const response = await request(leaderApp)
      .patch(`/api/barnevern/meldinger/${created.body.id}/tildel`)
      .send({ tildeltSaksbehandlerId: foreignUserId });
    expect(response.status).toBe(400);

    const assignee = await withKommuneRlsContext(kommuneA, async (client) => (
      await client.query(
        `SELECT tildelt_saksbehandler_id FROM tidum_barnevern_meldinger WHERE id = $1`,
        [created.body.id],
      )
    ).rows[0]?.tildelt_saksbehandler_id);
    expect(assignee).toBeNull();
  });

  // Regresjonsvern: rolle/kommune leses fra users, ALDRI fra sesjonen. En
  // klient som påstår kommune-rolle i req.user, men ikke har den i databasen,
  // skal avvises (fail closed).
  it("avviser aktør som kun har kommune-rolle i sesjonen, ikke i databasen (403)", async () => {
    const kommuneId = await insertTestKommune();
    const id = uniqueId("utenfor-kommune");
    await insertTestUser(id, kommuneId, "member"); // ikke en kommune-rolle
    const { registerRoutes } = await import("../../routes");
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.user = { id, role: "barnevernsleder", kommuneId }; // påstått, ikke reell
      req.isAuthenticated = () => true;
      next();
    });
    await registerRoutes(http.createServer(), app);

    const res = await request(app).post("/api/barnevern/meldinger").send({
      melderKategori: "skole", beskrivelse: "Skal avvises",
    });
    expect(res.status).toBe(403);
  });

  it("frist for en utildelt melding varsler barnevernsleder i kommunen", async () => {
    const kommuneId = await insertTestKommune();
    const { id: lederId } = await actorApp("leder", kommuneId, "barnevernsleder");
    const { app } = await actorApp("sb", kommuneId, "kommune_saksbehandler");
    const created = await request(app).post("/api/barnevern/meldinger").send({
      melderKategori: "skole", beskrivelse: "Utildelt melding",
    });
    cleanupMeldingIds.push(created.body.id);

    const { rows } = await pool.query(
      `SELECT notify_user_id FROM tidum_frister WHERE entity_type = 'barnevern_melding' AND entity_id = $1`,
      [created.body.id],
    );
    expect(rows[0].notify_user_id).toBe(lederId);
  });

  it("henlegg krever begrunnelse (400 uten), setter status+avklartDato ved suksess, kansellerer fristen", async () => {
    const kommuneId = await insertTestKommune();
    const { app } = await actorApp("sb", kommuneId, "kommune_saksbehandler");
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
    const { app } = await actorApp("sb", kommuneId, "kommune_saksbehandler");
    const res = await request(app).post("/api/barnevern/meldinger").send({
      melderKategori: "ikke-en-gyldig-kategori",
      beskrivelse: "Test",
    });
    expect(res.status).toBe(400);
  });

  it("avviser opprettelse med ugyldig barnFodselsnummer-format (400)", async () => {
    const kommuneId = await insertTestKommune();
    const { app } = await actorApp("sb", kommuneId, "kommune_saksbehandler");
    const res = await request(app).post("/api/barnevern/meldinger").send({
      melderKategori: "skole",
      beskrivelse: "Test",
      barnFodselsnummer: "123", // ikke 11 siffer
    });
    expect(res.status).toBe(400);
  });

  it("send-til-undersokelse setter riktig status og kansellerer fristen", async () => {
    const kommuneId = await insertTestKommune();
    const { app } = await actorApp("sb", kommuneId, "kommune_saksbehandler");
    const created = await request(app).post("/api/barnevern/meldinger").send({
      melderKategori: "helsepersonell", beskrivelse: "Test videresending",
    });
    cleanupMeldingIds.push(created.body.id);

    const res = await request(app).post(`/api/barnevern/meldinger/${created.body.id}/send-til-undersokelse`).send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("sendt_til_undersokelse");
  });
});
