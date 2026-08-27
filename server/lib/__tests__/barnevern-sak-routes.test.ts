import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import http from "http";
import { pool } from "../../db";
import { withSystemRlsContext } from "../database-rls-context";

// Samme oppsett som barnevern-melding-routes.test.ts: hver aktør får en full
// registerRoutes-app, så 5 s standardtimeout er for stram.
describe("Barnevern sak-ruter (krav 2: faseflyt)", { timeout: 20000 }, () => {
  const cleanupKommuneIds: number[] = [];
  const cleanupMeldingIds: string[] = [];
  const cleanupSakIds: string[] = [];
  const cleanupUserIds: string[] = [];

  afterEach(async () => {
    const sakIds = cleanupSakIds.splice(0);
    const meldingIds = cleanupMeldingIds.splice(0);
    const userIds = cleanupUserIds.splice(0);
    const kommuneIds = cleanupKommuneIds.splice(0);
    await withSystemRlsContext("barnevern_sak_test_cleanup", async (client) => {
      for (const id of sakIds) {
        await client.query(`DELETE FROM tidum_frister WHERE entity_id = $1`, [id]);
        await client.query(`DELETE FROM tidum_barnevern_sak_fase_historikk WHERE sak_id = $1`, [id]);
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

  /** Oppretter melding og sender den til undersøkelse; returnerer sak-svaret. */
  async function opprettSak(app: any) {
    const meldingRes = await request(app).post("/api/barnevern/meldinger").send({
      melderKategori: "skole",
      beskrivelse: "Bekymring for omsorgssituasjonen.",
      barnNavn: "Test Barn",
    });
    expect(meldingRes.status).toBe(201);
    cleanupMeldingIds.push(meldingRes.body.id);
    const res = await request(app).post(`/api/barnevern/meldinger/${meldingRes.body.id}/send-til-undersokelse`).send({});
    expect(res.status).toBe(200);
    cleanupSakIds.push(res.body.sak.id);
    return { meldingId: meldingRes.body.id, sak: res.body.sak };
  }

  it("full prosess: melding → undersøkelsessak → tiltak → avsluttet, med historikk og frister", async () => {
    const kommuneId = await insertTestKommune();
    const { id: lederId, app: lederApp } = await actorApp("leder", kommuneId, "barnevernsleder");
    const { app: sbApp } = await actorApp("sb", kommuneId, "kommune_saksbehandler");

    const { meldingId, sak } = await opprettSak(sbApp);
    expect(sak.saksnummer).toMatch(/^BVS-9999-\d+$/);

    // Saken finnes med fase undersøkelse, barnedata fra meldingen og aktiv frist.
    const hentet = await request(sbApp).get(`/api/barnevern/saker/${sak.id}`);
    expect(hentet.status).toBe(200);
    expect(hentet.body.fase).toBe("undersokelse");
    expect(hentet.body.barnNavn).toBe("Test Barn");
    expect(hentet.body.meldingId).toBe(meldingId);
    expect(hentet.body.faseHistorikk).toHaveLength(1);
    expect(hentet.body.faseHistorikk[0].tilFase).toBe("undersokelse");

    const { rows: frister } = await pool.query(
      `SELECT * FROM tidum_frister WHERE entity_type = 'barnevern_sak' AND entity_id = $1 AND status = 'aktiv'`,
      [sak.id],
    );
    expect(frister).toHaveLength(1);
    expect(frister[0].frist_type).toBe("undersokelse");

    // Saksbehandler konkluderer undersøkelsen med tiltak.
    const tilTiltak = await request(sbApp).post(`/api/barnevern/saker/${sak.id}/fase`).send({
      tilFase: "tiltak",
      begrunnelse: "Undersøkelsen konkluderer med hjelpetiltak.",
    });
    expect(tilTiltak.status).toBe(200);
    expect(tilTiltak.body.fase).toBe("tiltak");

    // Undersøkelsesfristen kanselleres når saken forlater undersøkelse.
    const { rows: etterOvergang } = await pool.query(
      `SELECT status FROM tidum_frister WHERE entity_type = 'barnevern_sak' AND entity_id = $1`,
      [sak.id],
    );
    expect(etterOvergang[0].status).toBe("kansellert");

    // Avslutning er et vedtak: leder godkjenner.
    const avslutt = await request(lederApp).post(`/api/barnevern/saker/${sak.id}/fase`).send({
      tilFase: "avsluttet",
      begrunnelse: "Tiltak gjennomført og avsluttet.",
    });
    expect(avslutt.status).toBe(200);
    expect(avslutt.body.fase).toBe("avsluttet");
    expect(avslutt.body.avsluttetAvUserId).toBe(lederId);
    expect(avslutt.body.avsluttetDato).toBeTruthy();

    const tilSlutt = await request(sbApp).get(`/api/barnevern/saker/${sak.id}`);
    expect(tilSlutt.body.faseHistorikk.map((h: any) => h.tilFase))
      .toEqual(["undersokelse", "tiltak", "avsluttet"]);
  });

  it("avsluttende faser krever barnevernsleder", async () => {
    const kommuneId = await insertTestKommune();
    const { app: sbApp } = await actorApp("sb", kommuneId, "kommune_saksbehandler");
    const { sak } = await opprettSak(sbApp);

    const res = await request(sbApp).post(`/api/barnevern/saker/${sak.id}/fase`).send({
      tilFase: "henlagt",
      begrunnelse: "Forsøk uten ledergodkjenning.",
    });
    expect(res.status).toBe(403);
  });

  it("avviser overgang som ikke er tillatt fra nåværende fase, og krever begrunnelse", async () => {
    const kommuneId = await insertTestKommune();
    const { app: lederApp } = await actorApp("leder", kommuneId, "barnevernsleder");
    const { sak } = await opprettSak(lederApp);

    const ugyldig = await request(lederApp).post(`/api/barnevern/saker/${sak.id}/fase`).send({
      tilFase: "avsluttet",
      begrunnelse: "Undersøkelse kan ikke hoppe rett til avsluttet.",
    });
    expect(ugyldig.status).toBe(400);

    const utenBegrunnelse = await request(lederApp).post(`/api/barnevern/saker/${sak.id}/fase`).send({
      tilFase: "tiltak",
    });
    expect(utenBegrunnelse.status).toBe(400);
  });

  it("saker er kommune-isolert: annen kommunes aktør får 404", async () => {
    const kommuneA = await insertTestKommune();
    const kommuneB = await insertTestKommune();
    const { app: appA } = await actorApp("sb-a", kommuneA, "kommune_saksbehandler");
    const { app: appB } = await actorApp("sb-b", kommuneB, "kommune_saksbehandler");
    const { sak } = await opprettSak(appA);

    const res = await request(appB).get(`/api/barnevern/saker/${sak.id}`);
    expect(res.status).toBe(404);

    const liste = await request(appB).get("/api/barnevern/saker");
    expect(liste.body.map((s: any) => s.id)).not.toContain(sak.id);
  });

  it("allerede avklart melding kan verken sendes til undersøkelse igjen eller henlegges", async () => {
    const kommuneId = await insertTestKommune();
    const { app } = await actorApp("sb", kommuneId, "kommune_saksbehandler");
    const { meldingId } = await opprettSak(app);

    const igjen = await request(app).post(`/api/barnevern/meldinger/${meldingId}/send-til-undersokelse`).send({});
    expect(igjen.status).toBe(409);

    const henlegg = await request(app).post(`/api/barnevern/meldinger/${meldingId}/henlegg`).send({
      begrunnelse: "Skal avvises.",
    });
    expect(henlegg.status).toBe(404);
  });
});
