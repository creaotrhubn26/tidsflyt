import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import http from "http";
import { pool } from "../../db";
import { withSystemRlsContext } from "../database-rls-context";

// Krav 10: aggregert rapporteringsgrunnlag beregnet fra saksdataene.
describe("Barnevern rapporteringsgrunnlag (krav 10)", { timeout: 20000 }, () => {
  const cleanupKommuneIds: number[] = [];
  const cleanupMeldingIds: string[] = [];
  const cleanupSakIds: string[] = [];
  const cleanupUserIds: string[] = [];

  afterEach(async () => {
    const sakIds = cleanupSakIds.splice(0);
    const meldingIds = cleanupMeldingIds.splice(0);
    const userIds = cleanupUserIds.splice(0);
    const kommuneIds = cleanupKommuneIds.splice(0);
    await withSystemRlsContext("barnevern_rapportering_test_cleanup", async (client) => {
      for (const id of sakIds) {
        await client.query(`DELETE FROM tidum_frister WHERE entity_id = $1`, [id]);
        await client.query(`DELETE FROM tidum_barnevern_saker WHERE id = $1`, [id]);
      }
      for (const id of meldingIds) {
        await client.query(`DELETE FROM tidum_frister WHERE entity_id = $1`, [id]);
        await client.query(`DELETE FROM tidum_barnevern_meldinger WHERE id = $1`, [id]);
      }
    });
    for (const id of userIds) {
      await pool.query(`DELETE FROM tidum_barnevern_tilgangslogg WHERE user_id = $1`, [id]).catch(() => {});
      await pool.query(`DELETE FROM users WHERE id = $1`, [id]);
    }
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

  it("beregner meldings-, undersøkelses- og bestandstall for perioden; kun leder", async () => {
    const kommuneId = await insertTestKommune();
    const { app: lederApp } = await actorApp("leder", kommuneId, "barnevernsleder");
    const { app: sbApp } = await actorApp("sb", kommuneId, "kommune_saksbehandler");

    // To meldinger nå (inneværende halvår): én akutt til undersøkelse
    // (konkludert til tiltak), én henlagt.
    const m1 = await request(sbApp).post("/api/barnevern/meldinger").send({
      melderKategori: "politi", beskrivelse: "Rapporteringstest 1.", prioritet: "akutt",
    });
    cleanupMeldingIds.push(m1.body.id);
    const u1 = await request(sbApp).post(`/api/barnevern/meldinger/${m1.body.id}/send-til-undersokelse`).send({});
    cleanupSakIds.push(u1.body.sak.id);
    await request(sbApp).post(`/api/barnevern/saker/${u1.body.sak.id}/fase`).send({
      tilFase: "tiltak", begrunnelse: "Konkludert med tiltak.",
    });

    const m2 = await request(sbApp).post("/api/barnevern/meldinger").send({
      melderKategori: "skole", beskrivelse: "Rapporteringstest 2.",
    });
    cleanupMeldingIds.push(m2.body.id);
    await request(sbApp).post(`/api/barnevern/meldinger/${m2.body.id}/henlegg`).send({
      begrunnelse: "Åpenbart grunnløs.",
    });

    const naa = new Date();
    const halvaar = naa.getUTCMonth() < 6 ? 1 : 2;

    // Saksbehandler nektes.
    const nektet = await request(sbApp).get(`/api/barnevern/rapportering/halvaar?aar=${naa.getUTCFullYear()}&halvaar=${halvaar}`);
    expect(nektet.status).toBe(403);

    const rapport = await request(lederApp).get(`/api/barnevern/rapportering/halvaar?aar=${naa.getUTCFullYear()}&halvaar=${halvaar}`);
    expect(rapport.status).toBe(200);
    expect(rapport.body.metadata.kommunenummer).toBe("9999");

    expect(rapport.body.meldinger.mottatt).toBe(2);
    expect(rapport.body.meldinger.akutte).toBe(1);
    expect(rapport.body.meldinger.henlagt).toBe(1);
    expect(rapport.body.meldinger.til_undersokelse).toBe(1);
    expect(rapport.body.meldinger.fristbrudd).toBe(0);

    expect(rapport.body.undersokelser.startet).toBe(1);
    expect(rapport.body.undersokelser.konkludert).toBe(1);
    expect(rapport.body.undersokelser.konklusjoner.tiltak).toBe(1);
    expect(rapport.body.undersokelser.aktive_over_frist).toBe(0);

    expect(rapport.body.bestand.i_tiltak).toBe(1);
    expect(rapport.body.bestand.i_undersokelse).toBe(0);

    // Tom periode gir nuller, ikke feil.
    const tom = await request(lederApp).get(`/api/barnevern/rapportering/halvaar?aar=2021&halvaar=1`);
    expect(tom.status).toBe(200);
    expect(tom.body.meldinger.mottatt).toBe(0);
    expect(tom.body.undersokelser.startet).toBe(0);

    const ugyldig = await request(lederApp).get(`/api/barnevern/rapportering/halvaar?aar=2026&halvaar=3`);
    expect(ugyldig.status).toBe(400);
  });

  it("rapporteringsgrunnlaget er tenant-isolert", async () => {
    const kommuneA = await insertTestKommune();
    const kommuneB = await insertTestKommune();
    const { app: sbA } = await actorApp("sb-a", kommuneA, "kommune_saksbehandler");
    const { app: lederB } = await actorApp("leder-b", kommuneB, "barnevernsleder");

    const melding = await request(sbA).post("/api/barnevern/meldinger").send({
      melderKategori: "nav", beskrivelse: "Skal ikke telle i B.",
    });
    cleanupMeldingIds.push(melding.body.id);

    const naa = new Date();
    const halvaar = naa.getUTCMonth() < 6 ? 1 : 2;
    const rapportB = await request(lederB).get(`/api/barnevern/rapportering/halvaar?aar=${naa.getUTCFullYear()}&halvaar=${halvaar}`);
    expect(rapportB.status).toBe(200);
    expect(rapportB.body.meldinger.mottatt).toBe(0);
  });
});
