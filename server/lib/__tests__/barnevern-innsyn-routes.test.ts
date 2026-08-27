import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import http from "http";
import { pool } from "../../db";
import { withSystemRlsContext } from "../database-rls-context";

// Krav 16: innsynsbegjæring — mottak, frist, beslutning med unntak,
// utlevering med audit og klageflyt.
describe("Barnevern innsynskrav (krav 16)", { timeout: 20000 }, () => {
  const cleanupKommuneIds: number[] = [];
  const cleanupMeldingIds: string[] = [];
  const cleanupSakIds: string[] = [];
  const cleanupUserIds: string[] = [];

  afterEach(async () => {
    const sakIds = cleanupSakIds.splice(0);
    const meldingIds = cleanupMeldingIds.splice(0);
    const userIds = cleanupUserIds.splice(0);
    const kommuneIds = cleanupKommuneIds.splice(0);
    await withSystemRlsContext("barnevern_innsyn_test_cleanup", async (client) => {
      for (const id of sakIds) {
        await client.query(`DELETE FROM tidum_frister WHERE entity_id = $1`, [id]);
        await client.query(
          `DELETE FROM tidum_frister WHERE entity_id IN
             (SELECT id::text FROM tidum_barnevern_innsynskrav WHERE sak_id = $1)`,
          [id],
        );
        await client.query(`DELETE FROM tidum_barnevern_sak_fase_historikk WHERE sak_id = $1`, [id]);
        // Innsynskrav og journal CASCADEr fra saken.
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

  async function opprettSak(app: any) {
    const melding = await request(app).post("/api/barnevern/meldinger").send({
      melderKategori: "skole", beskrivelse: "Innsynstest.",
    });
    cleanupMeldingIds.push(melding.body.id);
    const res = await request(app).post(`/api/barnevern/meldinger/${melding.body.id}/send-til-undersokelse`).send({});
    cleanupSakIds.push(res.body.sak.id);
    return res.body.sak;
  }

  it("full flyt: mottak med frist → delvis innvilgelse med unntak → utlevering med audit → klage → oversendelse", async () => {
    const kommuneId = await insertTestKommune();
    const { app: lederApp } = await actorApp("leder", kommuneId, "barnevernsleder");
    const { id: sbId, app: sbApp } = await actorApp("sb", kommuneId, "kommune_saksbehandler");
    const sak = await opprettSak(sbApp);

    const krav = await request(sbApp).post(`/api/barnevern/saker/${sak.id}/innsynskrav`).send({
      partNavn: "Mor Testesen",
      partRelasjon: "forelder",
    });
    expect(krav.status).toBe(201);
    expect(krav.body.status).toBe("mottatt");

    // Behandlingsfrist registrert i fristmotoren (5 dager).
    const { rows: frister } = await pool.query(
      `SELECT frist_type, status FROM tidum_frister WHERE entity_type = 'barnevern_innsynskrav' AND entity_id = $1`,
      [krav.body.id],
    );
    expect(frister).toHaveLength(1);
    expect(frister[0].frist_type).toBe("innsyn");

    // Saksbehandler kan ikke beslutte; delvis uten unntak avvises.
    const nektet = await request(sbApp).post(`/api/barnevern/innsynskrav/${krav.body.id}/beslutning`).send({
      utfall: "innvilget",
    });
    expect(nektet.status).toBe(403);
    const utenUnntak = await request(lederApp).post(`/api/barnevern/innsynskrav/${krav.body.id}/beslutning`).send({
      utfall: "delvis_innvilget", begrunnelse: "Deler skjermes.",
    });
    expect(utenUnntak.status).toBe(400);

    // Utlevering før beslutning avvises.
    const forTidlig = await request(sbApp).post(`/api/barnevern/innsynskrav/${krav.body.id}/utlever`).send({ via: "utskrift" });
    expect(forTidlig.status).toBe(409);

    const beslutning = await request(lederApp).post(`/api/barnevern/innsynskrav/${krav.body.id}/beslutning`).send({
      utfall: "delvis_innvilget",
      begrunnelse: "Opplysninger om melder skjermes av hensyn til kilden.",
      unntak: [{ hjemmel: "fvl. § 19 første ledd bokstav b", beskrivelse: "Melders identitet" }],
    });
    expect(beslutning.status).toBe(200);
    expect(beslutning.body.status).toBe("delvis_innvilget");

    // Fristen kansellert; beslutningen journalført.
    const { rows: etterBeslutning } = await pool.query(
      `SELECT status FROM tidum_frister WHERE entity_type = 'barnevern_innsynskrav' AND entity_id = $1`,
      [krav.body.id],
    );
    expect(etterBeslutning[0].status).toBe("kansellert");
    const journal = await request(sbApp).get(`/api/barnevern/saker/${sak.id}/journal`);
    const beslutningsInnforsel = journal.body.find((j: any) => j.innhold.includes("Innsynsbegjæring fra Mor Testesen"));
    expect(beslutningsInnforsel.kategori).toBe("vedtak");
    expect(beslutningsInnforsel.innhold).toContain("fvl. § 19");

    const utlevert = await request(sbApp).post(`/api/barnevern/innsynskrav/${krav.body.id}/utlever`).send({
      via: "sikker_dialog",
    });
    expect(utlevert.status).toBe(200);
    expect(utlevert.body.status).toBe("utlevert");

    const { rows: audit } = await pool.query(
      `SELECT detaljer FROM tidum_barnevern_tilgangslogg
        WHERE user_id = $1 AND objekt_type = 'innsynsutlevering' AND objekt_id = $2`,
      [sbId, krav.body.id],
    );
    expect(audit).toHaveLength(1);
    expect(audit[0].detaljer.antallUnntak).toBe(1);

    // Klage → oversendelse (leder).
    const klage = await request(sbApp).post(`/api/barnevern/innsynskrav/${krav.body.id}/klage`).send({
      notat: "Part klager på skjermingen.",
    });
    expect(klage.status).toBe(200);
    expect(klage.body.status).toBe("klage_mottatt");

    const oversendtAvSb = await request(sbApp).post(`/api/barnevern/innsynskrav/${krav.body.id}/oversend-klage`).send({});
    expect(oversendtAvSb.status).toBe(403);
    const oversendt = await request(lederApp).post(`/api/barnevern/innsynskrav/${krav.body.id}/oversend-klage`).send({});
    expect(oversendt.status).toBe(200);
    expect(oversendt.body.status).toBe("oversendt_klageinstans");
  });

  it("avslag krever begrunnelse; innvilget klage-sperre; tenant-isolasjon", async () => {
    const kommuneA = await insertTestKommune();
    const kommuneB = await insertTestKommune();
    const { app: lederApp } = await actorApp("leder", kommuneA, "barnevernsleder");
    const { app: sbApp } = await actorApp("sb", kommuneA, "kommune_saksbehandler");
    const { app: fremmedApp } = await actorApp("sb-b", kommuneB, "kommune_saksbehandler");
    const sak = await opprettSak(sbApp);

    const krav = await request(sbApp).post(`/api/barnevern/saker/${sak.id}/innsynskrav`).send({
      partNavn: "Far Testesen", partRelasjon: "forelder",
    });

    const utenBegrunnelse = await request(lederApp).post(`/api/barnevern/innsynskrav/${krav.body.id}/beslutning`).send({
      utfall: "avslatt",
    });
    expect(utenBegrunnelse.status).toBe(400);

    // Klage før beslutning avvises.
    const forTidligKlage = await request(sbApp).post(`/api/barnevern/innsynskrav/${krav.body.id}/klage`).send({});
    expect(forTidligKlage.status).toBe(409);

    // Annen kommune når ingenting.
    const fremmedListe = await request(fremmedApp).get(`/api/barnevern/saker/${sak.id}/innsynskrav`);
    expect(fremmedListe.status).toBe(404);
    const fremmedBeslutning = await request(fremmedApp).post(`/api/barnevern/innsynskrav/${krav.body.id}/utlever`).send({ via: "manuell" });
    expect(fremmedBeslutning.status).toBe(409);
  });
});
