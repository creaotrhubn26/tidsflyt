import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import http from "http";
import { pool } from "../../db";
import { withSystemRlsContext } from "../database-rls-context";

// Krav 15: lesing og nedlasting logges append-only og er søkbart for leder.
describe("Barnevern tilgangslogg (krav 15)", { timeout: 20000 }, () => {
  const cleanupKommuneIds: number[] = [];
  const cleanupMeldingIds: string[] = [];
  const cleanupSakIds: string[] = [];
  const cleanupUserIds: string[] = [];

  afterEach(async () => {
    const sakIds = cleanupSakIds.splice(0);
    const meldingIds = cleanupMeldingIds.splice(0);
    const userIds = cleanupUserIds.splice(0);
    const kommuneIds = cleanupKommuneIds.splice(0);
    await withSystemRlsContext("barnevern_tilgangslogg_cleanup", async (client) => {
      // Append-only logg uten DELETE-grant ryddes via superbruker-pool etterpå.
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
      // Eier av test-DB er ikke underlagt grants; FORCE RLS omgås av
      // superuser-attributt lokalt. Feiler dette i et miljø med striktere
      // rolle, rydder tidsserien seg selv via kommunesletting nedenfor.
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

  it("lesing av melding og sak logges med bruker, handling og objekt", async () => {
    const kommuneId = await insertTestKommune();
    const { id: sbId, app } = await actorApp("sb", kommuneId, "kommune_saksbehandler");

    const melding = await request(app).post("/api/barnevern/meldinger").send({
      melderKategori: "skole",
      beskrivelse: "Loggtest.",
    });
    cleanupMeldingIds.push(melding.body.id);

    await request(app).get(`/api/barnevern/meldinger/${melding.body.id}`);

    const undersokelse = await request(app).post(`/api/barnevern/meldinger/${melding.body.id}/send-til-undersokelse`).send({});
    cleanupSakIds.push(undersokelse.body.sak.id);
    await request(app).get(`/api/barnevern/saker/${undersokelse.body.sak.id}`);
    await request(app).get(`/api/barnevern/saker/${undersokelse.body.sak.id}/journal`);

    const { rows } = await pool.query(
      `SELECT handling, objekt_type, objekt_id FROM tidum_barnevern_tilgangslogg
        WHERE user_id = $1 ORDER BY created_at ASC`,
      [sbId],
    );
    const typer = rows.map((r) => `${r.handling}:${r.objekt_type}`);
    expect(typer).toContain("lest:melding");
    expect(typer).toContain("lest:sak");
    expect(typer).toContain("lest:sak_journal");
  });

  it("nedlasting av journalvedlegg logges med filnavn", async () => {
    const kommuneId = await insertTestKommune();
    const { id: sbId, app } = await actorApp("sb", kommuneId, "kommune_saksbehandler");

    const melding = await request(app).post("/api/barnevern/meldinger").send({
      melderKategori: "skole",
      beskrivelse: "Vedleggslogg.",
    });
    cleanupMeldingIds.push(melding.body.id);
    const undersokelse = await request(app).post(`/api/barnevern/meldinger/${melding.body.id}/send-til-undersokelse`).send({});
    cleanupSakIds.push(undersokelse.body.sak.id);
    const sakId = undersokelse.body.sak.id;

    const entry = await request(app).post(`/api/barnevern/saker/${sakId}/journal`).send({
      kategori: "notat",
      innhold: "Med vedlegg.",
    });
    const vedlegg = await request(app)
      .post(`/api/barnevern/saker/${sakId}/journal/${entry.body.id}/vedlegg`)
      .attach("file", Buffer.from("%PDF-1.4"), { filename: "logg.pdf", contentType: "application/pdf" });

    await request(app).get(`/api/barnevern/saker/${sakId}/journal/${entry.body.id}/vedlegg/${vedlegg.body.id}`);

    const { rows } = await pool.query(
      `SELECT detaljer FROM tidum_barnevern_tilgangslogg
        WHERE user_id = $1 AND handling = 'nedlastet' AND objekt_type = 'journal_vedlegg'`,
      [sbId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].detaljer.filnavn).toBe("logg.pdf");
  });

  it("tilgangsloggen er søkbar for barnevernsleder, sperret for saksbehandler og tenant-isolert", async () => {
    const kommuneA = await insertTestKommune();
    const kommuneB = await insertTestKommune();
    const { id: sbId, app: sbApp } = await actorApp("sb", kommuneA, "kommune_saksbehandler");
    const { app: lederApp } = await actorApp("leder", kommuneA, "barnevernsleder");
    const { app: lederBApp } = await actorApp("leder-b", kommuneB, "barnevernsleder");

    const melding = await request(sbApp).post("/api/barnevern/meldinger").send({
      melderKategori: "politi",
      beskrivelse: "Revisortest.",
    });
    cleanupMeldingIds.push(melding.body.id);
    await request(sbApp).get(`/api/barnevern/meldinger/${melding.body.id}`);

    const nektet = await request(sbApp).get("/api/barnevern/tilgangslogg");
    expect(nektet.status).toBe(403);

    const logg = await request(lederApp).get(`/api/barnevern/tilgangslogg?userId=${sbId}`);
    expect(logg.status).toBe(200);
    expect(logg.body.length).toBeGreaterThan(0);
    expect(logg.body[0].userId).toBe(sbId);

    const filtrert = await request(lederApp).get(
      `/api/barnevern/tilgangslogg?objektType=melding&objektId=${melding.body.id}`,
    );
    expect(filtrert.body.every((r: any) => r.objektType === "melding" && r.objektId === melding.body.id)).toBe(true);

    // Annen kommunes leder ser ingenting av dette.
    const fremmed = await request(lederBApp).get(`/api/barnevern/tilgangslogg?userId=${sbId}`);
    expect(fremmed.status).toBe(200);
    expect(fremmed.body).toHaveLength(0);
  });
});
