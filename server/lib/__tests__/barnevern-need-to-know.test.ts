import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import http from "http";
import { pool } from "../../db";
import { withSystemRlsContext } from "../database-rls-context";

// Krav 14: kommune_admin uten saksinnsyn + need-to-know på saksnivå.
describe("Barnevern need-to-know og kommune_admin (krav 14)", { timeout: 20000 }, () => {
  const cleanupKommuneIds: number[] = [];
  const cleanupMeldingIds: string[] = [];
  const cleanupSakIds: string[] = [];
  const cleanupUserIds: string[] = [];

  afterEach(async () => {
    const sakIds = cleanupSakIds.splice(0);
    const meldingIds = cleanupMeldingIds.splice(0);
    const userIds = cleanupUserIds.splice(0);
    const kommuneIds = cleanupKommuneIds.splice(0);
    await withSystemRlsContext("barnevern_ntk_test_cleanup", async (client) => {
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

  it("kommune_admin har ingen saksinnsyn, men administrerer kommunens brukere", async () => {
    const kommuneId = await insertTestKommune();
    const { app: adminApp } = await actorApp("adm", kommuneId, "kommune_admin");
    const { id: sbId, app: sbApp } = await actorApp("sb", kommuneId, "kommune_saksbehandler");
    const { app: lederApp } = await actorApp("leder", kommuneId, "barnevernsleder");

    const melding = await request(sbApp).post("/api/barnevern/meldinger").send({
      melderKategori: "skole", beskrivelse: "Admin skal ikke se denne.",
    });
    cleanupMeldingIds.push(melding.body.id);

    // Ingen fagtilgang.
    for (const path of ["/api/barnevern/meldinger", `/api/barnevern/meldinger/${melding.body.id}`, "/api/barnevern/saker", "/api/barnevern/oppgaver"]) {
      const res = await request(adminApp).get(path);
      expect({ path, status: res.status }).toEqual({ path, status: 403 });
    }
    const opprettNektet = await request(adminApp).post("/api/barnevern/meldinger").send({
      melderKategori: "skole", beskrivelse: "Nektes.",
    });
    expect(opprettNektet.status).toBe(403);

    // Brukeradministrasjon fungerer.
    const brukere = await request(adminApp).get("/api/kommune/brukere");
    expect(brukere.status).toBe(200);
    expect(brukere.body.map((b: any) => b.id)).toContain(sbId);

    // Saksbehandler kan ikke administrere brukere (sjekkes FØR rollebyttet
    // gjør vedkommende til leder); leder kan liste.
    const sbNektet = await request(sbApp).get("/api/kommune/brukere");
    expect(sbNektet.status).toBe(403);
    const lederListe = await request(lederApp).get("/api/kommune/brukere");
    expect(lederListe.status).toBe(200);

    const rollebytte = await request(adminApp).patch(`/api/kommune/brukere/${sbId}/rolle`).send({
      rolle: "barnevernsleder",
    });
    expect(rollebytte.status).toBe(200);
    expect(rollebytte.body.rolle).toBe("barnevernsleder");
  });

  it("need-to-know: saksbehandler ser kun egne/utildelte objekter; leder ser alt", async () => {
    const kommuneId = await insertTestKommune();
    const { id: lederId, app: lederApp } = await actorApp("leder", kommuneId, "barnevernsleder");
    const { id: sb1Id, app: sb1App } = await actorApp("sb1", kommuneId, "kommune_saksbehandler");
    const { app: sb2App } = await actorApp("sb2", kommuneId, "kommune_saksbehandler");

    // Utildelt melding: begge saksbehandlere ser den (mottak må plukkes).
    const utildelt = await request(sb1App).post("/api/barnevern/meldinger").send({
      melderKategori: "skole", beskrivelse: "Utildelt melding.",
    });
    cleanupMeldingIds.push(utildelt.body.id);
    expect((await request(sb2App).get(`/api/barnevern/meldinger/${utildelt.body.id}`)).status).toBe(200);

    // Tildel sb1 — sb2 mister tilgangen, leder beholder.
    await request(lederApp).patch(`/api/barnevern/meldinger/${utildelt.body.id}/tildel`).send({
      tildeltSaksbehandlerId: sb1Id,
    });
    expect((await request(sb1App).get(`/api/barnevern/meldinger/${utildelt.body.id}`)).status).toBe(200);
    expect((await request(sb2App).get(`/api/barnevern/meldinger/${utildelt.body.id}`)).status).toBe(404);
    expect((await request(lederApp).get(`/api/barnevern/meldinger/${utildelt.body.id}`)).status).toBe(200);

    // Listen filtreres tilsvarende.
    const sb2Liste = await request(sb2App).get("/api/barnevern/meldinger");
    expect(sb2Liste.body.map((m: any) => m.id)).not.toContain(utildelt.body.id);

    // sb2 kan verken redigere eller henlegge den tildelte meldingen.
    const rediger = await request(sb2App).patch(`/api/barnevern/meldinger/${utildelt.body.id}`).send({
      begrunnelse: "Forsøk.", endringer: { barnNavn: "X" },
    });
    expect(rediger.status).toBe(404);
    const henlegg = await request(sb2App).post(`/api/barnevern/meldinger/${utildelt.body.id}/henlegg`).send({
      begrunnelse: "Forsøk.",
    });
    expect(henlegg.status).toBe(404);

    // Saken arver tildelingen fra meldingen: sb2 ser den ikke, sb1 og leder gjør.
    const undersokelse = await request(sb1App).post(`/api/barnevern/meldinger/${utildelt.body.id}/send-til-undersokelse`).send({});
    cleanupSakIds.push(undersokelse.body.sak.id);
    const sakId = undersokelse.body.sak.id;

    expect((await request(sb1App).get(`/api/barnevern/saker/${sakId}`)).status).toBe(200);
    expect((await request(sb2App).get(`/api/barnevern/saker/${sakId}`)).status).toBe(404);
    expect((await request(lederApp).get(`/api/barnevern/saker/${sakId}`)).status).toBe(200);

    const sb2Saker = await request(sb2App).get("/api/barnevern/saker");
    expect(sb2Saker.body.map((s: any) => s.id)).not.toContain(sakId);

    // Underflatene arver: journal, planer og dokumenter nektes for sb2.
    const journalNektet = await request(sb2App).post(`/api/barnevern/saker/${sakId}/journal`).send({
      kategori: "notat", innhold: "Forsøk.",
    });
    expect(journalNektet.status).toBe(404);
    const planNektet = await request(sb2App).get(`/api/barnevern/saker/${sakId}/planer`);
    expect(planNektet.status).toBe(404);
    const dokNektet = await request(sb2App).get(`/api/barnevern/saker/${sakId}/dokumenter`);
    expect(dokNektet.status).toBe(404);

    // sb1 (tildelt) kan journalføre.
    const journalOk = await request(sb1App).post(`/api/barnevern/saker/${sakId}/journal`).send({
      kategori: "notat", innhold: "Tildelt saksbehandler journalfører.",
    });
    expect(journalOk.status).toBe(201);
    expect(lederId).toBeTruthy();
  });

  it("rollebytte-sperrer: egen rolle, fremmed kommune og ikke-kommuneroller", async () => {
    const kommuneA = await insertTestKommune();
    const kommuneB = await insertTestKommune();
    const { id: adminId, app: adminApp } = await actorApp("adm", kommuneA, "kommune_admin");
    const { id: sbBId } = await actorApp("sb-b", kommuneB, "kommune_saksbehandler");
    const { id: sbAId, app: lederApp } = await (async () => {
      const sbA = await actorApp("sb-a", kommuneA, "kommune_saksbehandler");
      const leder = await actorApp("leder-a", kommuneA, "barnevernsleder");
      return { id: sbA.id, app: leder.app };
    })();

    const egenRolle = await request(adminApp).patch(`/api/kommune/brukere/${adminId}/rolle`).send({
      rolle: "barnevernsleder",
    });
    expect(egenRolle.status).toBe(400);

    const fremmedKommune = await request(adminApp).patch(`/api/kommune/brukere/${sbBId}/rolle`).send({
      rolle: "barnevernsleder",
    });
    expect(fremmedKommune.status).toBe(404);

    const ikkeKommunerolle = await request(adminApp).patch(`/api/kommune/brukere/${sbAId}/rolle`).send({
      rolle: "miljoarbeider",
    });
    expect(ikkeKommunerolle.status).toBe(400);

    // Barnevernsleder kan gjøre noen til saksbehandler, men ikke kommune_admin.
    const lederTilAdmin = await request(lederApp).patch(`/api/kommune/brukere/${sbAId}/rolle`).send({
      rolle: "kommune_admin",
    });
    expect(lederTilAdmin.status).toBe(403);
  });
});
