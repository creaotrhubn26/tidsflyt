import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import http from "http";
import { pool } from "../../db";
import { withSystemRlsContext } from "../database-rls-context";

// Krav 1: prioritet, ufødt barn, tilleggsmelding, søskenkopi og kontrollert
// redigering med revisjonshistorikk. Samme oppsett som melding-testene.
describe("Barnevern komplett meldingsmottak (krav 1)", { timeout: 20000 }, () => {
  const cleanupKommuneIds: number[] = [];
  const cleanupMeldingIds: string[] = [];
  const cleanupUserIds: string[] = [];

  afterEach(async () => {
    const meldingIds = cleanupMeldingIds.splice(0);
    const userIds = cleanupUserIds.splice(0);
    const kommuneIds = cleanupKommuneIds.splice(0);
    await withSystemRlsContext("barnevern_komplett_test_cleanup", async (client) => {
      // Tillegg/søskenkopi refererer forelder — slett barna først.
      for (const id of meldingIds) {
        await client.query(
          `DELETE FROM tidum_frister WHERE entity_id IN
             (SELECT id::text FROM tidum_barnevern_meldinger WHERE forelder_melding_id = $1 OR soskenkopi_av_melding_id = $1)`,
          [id],
        );
        await client.query(
          `DELETE FROM tidum_barnevern_meldinger WHERE forelder_melding_id = $1 OR soskenkopi_av_melding_id = $1`,
          [id],
        );
        await client.query(`DELETE FROM tidum_frister WHERE entity_id = $1`, [id]);
        // Revisjoner er append-only (ingen DELETE-grant); ON DELETE CASCADE
        // fra meldingen rydder dem.
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

  it("akutt prioritet gir 24 timers avklaringsfrist; normal gir 7 dager", async () => {
    const kommuneId = await insertTestKommune();
    const { app } = await actorApp("sb", kommuneId, "kommune_saksbehandler");

    const akutt = await request(app).post("/api/barnevern/meldinger").send({
      melderKategori: "politi",
      beskrivelse: "Akutt bekymring.",
      prioritet: "akutt",
    });
    expect(akutt.status).toBe(201);
    cleanupMeldingIds.push(akutt.body.id);
    const akuttTimer = (new Date(akutt.body.avklaringsfrist).getTime() - Date.now()) / 3600000;
    expect(akuttTimer).toBeGreaterThan(23);
    expect(akuttTimer).toBeLessThan(25);

    const normal = await request(app).post("/api/barnevern/meldinger").send({
      melderKategori: "skole",
      beskrivelse: "Ordinær bekymring.",
    });
    expect(normal.status).toBe(201);
    cleanupMeldingIds.push(normal.body.id);
    expect(normal.body.prioritet).toBe("normal");
    const normalTimer = (new Date(normal.body.avklaringsfrist).getTime() - Date.now()) / 3600000;
    expect(normalTimer).toBeGreaterThan(7 * 24 - 1);
  });

  it("ufødt barn: termindato tillatt, fødselsnummer avvist", async () => {
    const kommuneId = await insertTestKommune();
    const { app } = await actorApp("sb", kommuneId, "kommune_saksbehandler");

    const ok = await request(app).post("/api/barnevern/meldinger").send({
      melderKategori: "helsepersonell",
      beskrivelse: "Bekymring for ufødt barn.",
      ufodtBarn: true,
      termindato: "2026-12-01",
    });
    expect(ok.status).toBe(201);
    cleanupMeldingIds.push(ok.body.id);
    expect(ok.body.ufodtBarn).toBe(true);

    const medFnr = await request(app).post("/api/barnevern/meldinger").send({
      melderKategori: "helsepersonell",
      beskrivelse: "Ugyldig kombinasjon.",
      ufodtBarn: true,
      barnFodselsnummer: "12345678901",
    });
    expect(medFnr.status).toBe(400);

    const terminUtenUfodt = await request(app).post("/api/barnevern/meldinger").send({
      melderKategori: "helsepersonell",
      beskrivelse: "Ugyldig kombinasjon.",
      termindato: "2026-12-01",
    });
    expect(terminUtenUfodt.status).toBe(400);
  });

  it("tilleggsmelding arver barn og kobles flatt til opprinnelig melding", async () => {
    const kommuneId = await insertTestKommune();
    const { app } = await actorApp("sb", kommuneId, "kommune_saksbehandler");

    const original = await request(app).post("/api/barnevern/meldinger").send({
      melderKategori: "skole",
      beskrivelse: "Første bekymring.",
      barnNavn: "Barn A",
      barnFodselsnummer: "12345678901",
    });
    cleanupMeldingIds.push(original.body.id);

    const tillegg = await request(app).post(`/api/barnevern/meldinger/${original.body.id}/tillegg`).send({
      beskrivelse: "Ny informasjon i samme sak.",
    });
    expect(tillegg.status).toBe(201);
    expect(tillegg.body.forelderMeldingId).toBe(original.body.id);
    expect(tillegg.body.barnNavn).toBe("Barn A");
    expect(tillegg.body.barnFodselsnummer).toBe("12345678901");

    // Tillegg på tillegget kjedes fortsatt til originalen (flat struktur).
    const tillegg2 = await request(app).post(`/api/barnevern/meldinger/${tillegg.body.id}/tillegg`).send({
      beskrivelse: "Enda mer informasjon.",
    });
    expect(tillegg2.status).toBe(201);
    expect(tillegg2.body.forelderMeldingId).toBe(original.body.id);
  });

  it("søskenkopi kopierer melder/beskrivelse men krever eget barn", async () => {
    const kommuneId = await insertTestKommune();
    const { app } = await actorApp("sb", kommuneId, "kommune_saksbehandler");

    const original = await request(app).post("/api/barnevern/meldinger").send({
      melderKategori: "nav",
      melderNavn: "Melder X",
      beskrivelse: "Bekymring som gjelder flere barn.",
      barnNavn: "Barn A",
    });
    cleanupMeldingIds.push(original.body.id);

    const utenBarn = await request(app).post(`/api/barnevern/meldinger/${original.body.id}/soskenkopi`).send({});
    expect(utenBarn.status).toBe(400);

    const kopi = await request(app).post(`/api/barnevern/meldinger/${original.body.id}/soskenkopi`).send({
      barnNavn: "Barn B",
    });
    expect(kopi.status).toBe(201);
    expect(kopi.body.soskenkopiAvMeldingId).toBe(original.body.id);
    expect(kopi.body.barnNavn).toBe("Barn B");
    expect(kopi.body.melderNavn).toBe("Melder X");
    expect(kopi.body.beskrivelse).toBe("Bekymring som gjelder flere barn.");
    expect(kopi.body.id).not.toBe(original.body.id);
  });

  it("kontrollert redigering: whitelist, begrunnelse, revisjonslogg og sperre etter avklaring", async () => {
    const kommuneId = await insertTestKommune();
    const { id: userId, app } = await actorApp("sb", kommuneId, "kommune_saksbehandler");

    const melding = await request(app).post("/api/barnevern/meldinger").send({
      melderKategori: "skole",
      beskrivelse: "Opprinnelig beskrivelse.",
      barnNavn: "Feil Navn",
    });
    cleanupMeldingIds.push(melding.body.id);

    const utenBegrunnelse = await request(app).patch(`/api/barnevern/meldinger/${melding.body.id}`).send({
      endringer: { barnNavn: "Riktig Navn" },
    });
    expect(utenBegrunnelse.status).toBe(400);

    const ulovligFelt = await request(app).patch(`/api/barnevern/meldinger/${melding.body.id}`).send({
      begrunnelse: "Forsøk.",
      endringer: { status: "henlagt" },
    });
    expect(ulovligFelt.status).toBe(400);

    const ok = await request(app).patch(`/api/barnevern/meldinger/${melding.body.id}`).send({
      begrunnelse: "Navnet var feilstavet ved registrering.",
      endringer: { barnNavn: "Riktig Navn", beskrivelse: "Korrigert beskrivelse." },
    });
    expect(ok.status).toBe(200);
    expect(ok.body.barnNavn).toBe("Riktig Navn");

    const revisjoner = await request(app).get(`/api/barnevern/meldinger/${melding.body.id}/revisjoner`);
    expect(revisjoner.status).toBe(200);
    expect(revisjoner.body).toHaveLength(1);
    expect(revisjoner.body[0].endretAvUserId).toBe(userId);
    expect(revisjoner.body[0].feltEndringer.barnNavn).toEqual({ fra: "Feil Navn", til: "Riktig Navn" });
    expect(revisjoner.body[0].feltEndringer.beskrivelse.til).toBe("Korrigert beskrivelse.");

    // Etter avklaring er redigering sperret.
    const undersokelse = await request(app).post(`/api/barnevern/meldinger/${melding.body.id}/send-til-undersokelse`).send({});
    expect(undersokelse.status).toBe(200);
    await withSystemRlsContext("barnevern_komplett_test_cleanup", async (client) => {
      await client.query(`DELETE FROM tidum_frister WHERE entity_id = $1`, [undersokelse.body.sak.id]);
      await client.query(`DELETE FROM tidum_barnevern_saker WHERE id = $1`, [undersokelse.body.sak.id]);
    });

    const etterAvklaring = await request(app).patch(`/api/barnevern/meldinger/${melding.body.id}`).send({
      begrunnelse: "For sent.",
      endringer: { barnNavn: "Nytt Navn" },
    });
    expect(etterAvklaring.status).toBe(409);
  });
});
