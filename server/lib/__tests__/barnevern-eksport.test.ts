import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import http from "http";
import { pool } from "../../db";
import { withSystemRlsContext } from "../database-rls-context";

// Krav 12: tidsavgrenset CSV-eksport med masking, formelnøytralisering og audit.
describe("Barnevern CSV-eksport (krav 12)", { timeout: 20000 }, () => {
  const cleanupKommuneIds: number[] = [];
  const cleanupMeldingIds: string[] = [];
  const cleanupSakIds: string[] = [];
  const cleanupUserIds: string[] = [];

  afterEach(async () => {
    const sakIds = cleanupSakIds.splice(0);
    const meldingIds = cleanupMeldingIds.splice(0);
    const userIds = cleanupUserIds.splice(0);
    const kommuneIds = cleanupKommuneIds.splice(0);
    await withSystemRlsContext("barnevern_eksport_test_cleanup", async (client) => {
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

  // Spenn over tidssonegrensen mellom UTC og DB-lokal tid.
  const iGaar = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const iMorgen = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  it("eksporterer meldinger med maskert fnr, nøytraliserte formler og auditlogg", async () => {
    const kommuneId = await insertTestKommune();
    const { id: lederId, app: lederApp } = await actorApp("leder", kommuneId, "barnevernsleder");
    const { app: sbApp } = await actorApp("sb", kommuneId, "kommune_saksbehandler");

    const melding = await request(sbApp).post("/api/barnevern/meldinger").send({
      melderKategori: "skole",
      beskrivelse: "Eksporttest.",
      barnNavn: "=HYPERLINK(\"https://ond.example\")",
      barnFodselsnummer: "01019912345",
    });
    cleanupMeldingIds.push(melding.body.id);

    const res = await request(lederApp).get(`/api/barnevern/eksport/meldinger.csv?fra=${iGaar}&til=${iMorgen}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toContain("barnevern-meldinger");

    const tekst = res.text;
    // Fødselsdato beholdt, personnummer maskert; fullt fnr finnes ikke.
    expect(tekst).toContain("010199*****");
    expect(tekst).not.toContain("01019912345");
    // Formel nøytralisert med apostrof-prefiks.
    expect(tekst).toContain("'=HYPERLINK");
    expect(tekst).toContain(melding.body.meldingsnummer);

    const { rows: audit } = await pool.query(
      `SELECT detaljer FROM tidum_barnevern_tilgangslogg
        WHERE user_id = $1 AND objekt_type = 'eksport_meldinger'`,
      [lederId],
    );
    expect(audit).toHaveLength(1);
    expect(audit[0].detaljer.antallRader).toBe(1);
  });

  it("saker eksporteres; periode påkrevd; rollesperre og tenant-isolasjon", async () => {
    const kommuneA = await insertTestKommune();
    const kommuneB = await insertTestKommune();
    const { app: lederApp } = await actorApp("leder", kommuneA, "barnevernsleder");
    const { app: sbApp } = await actorApp("sb", kommuneA, "kommune_saksbehandler");
    const { app: lederBApp } = await actorApp("leder-b", kommuneB, "barnevernsleder");

    const melding = await request(sbApp).post("/api/barnevern/meldinger").send({
      melderKategori: "nav", beskrivelse: "Sakseksport.", barnNavn: "Eksportbarn",
    });
    cleanupMeldingIds.push(melding.body.id);
    const undersokelse = await request(sbApp).post(`/api/barnevern/meldinger/${melding.body.id}/send-til-undersokelse`).send({});
    cleanupSakIds.push(undersokelse.body.sak.id);

    const utenPeriode = await request(lederApp).get("/api/barnevern/eksport/saker.csv");
    expect(utenPeriode.status).toBe(400);
    const feilPeriode = await request(lederApp).get("/api/barnevern/eksport/saker.csv?fra=2026-12-31&til=2026-01-01");
    expect(feilPeriode.status).toBe(400);

    const nektet = await request(sbApp).get(`/api/barnevern/eksport/saker.csv?fra=${iGaar}&til=${iMorgen}`);
    expect(nektet.status).toBe(403);

    const res = await request(lederApp).get(`/api/barnevern/eksport/saker.csv?fra=${iGaar}&til=${iMorgen}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain(undersokelse.body.sak.saksnummer);
    expect(res.text).toContain("undersokelse");

    // Annen kommunes leder får tom eksport (kun header).
    const fremmed = await request(lederBApp).get(`/api/barnevern/eksport/saker.csv?fra=${iGaar}&til=${iMorgen}`);
    expect(fremmed.status).toBe(200);
    expect(fremmed.text).not.toContain(undersokelse.body.sak.saksnummer);
  });
});
