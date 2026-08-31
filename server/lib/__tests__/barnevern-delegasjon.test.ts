/**
 * Krav 15-rest: delegasjon ved fravær, break-glass-nødtilgang og
 * skjermet adresse — alle auditlogget, alle tidsavgrenset/opphevbare.
 */
import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import http from "http";
import { pool } from "../../db";
import { withSystemRlsContext } from "../database-rls-context";

describe("Barnevern delegasjon/break-glass/skjerming (krav 15)", { timeout: 20000 }, () => {
  const cleanupKommuneIds: number[] = [];
  const cleanupMeldingIds: string[] = [];
  const cleanupSakIds: string[] = [];
  const cleanupUserIds: string[] = [];

  afterEach(async () => {
    const sakIds = cleanupSakIds.splice(0);
    const meldingIds = cleanupMeldingIds.splice(0);
    const userIds = cleanupUserIds.splice(0);
    const kommuneIds = cleanupKommuneIds.splice(0);
    await withSystemRlsContext("barnevern_delegasjon_test_cleanup", async (client) => {
      if (kommuneIds.length) {
        await client.query(`DELETE FROM tidum_barnevern_tilgangsdelegasjoner WHERE kommune_id = ANY($1::int[])`, [kommuneIds]);
      }
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
      [`Delegasjonskommune ${Date.now()}`, `${900000000 + Math.floor(Math.random() * 99999999)}`],
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

  it("delegasjon gir stedfortreder tilgang til fraværendes sak; oppheving stenger den", async () => {
    const kommuneId = await insertTestKommune();
    const { app: lederApp } = await actorApp("leder", kommuneId, "barnevernsleder");
    const { id: sb1Id, app: sb1App } = await actorApp("sb1", kommuneId, "kommune_saksbehandler");
    const { id: sb2Id, app: sb2App } = await actorApp("sb2", kommuneId, "kommune_saksbehandler");

    // sb1 oppretter sak og TILDELES den (need-to-know sperrer sb2).
    const melding = await request(sb1App).post("/api/barnevern/meldinger").send({
      melderKategori: "skole", beskrivelse: "Delegasjonstest.",
    });
    cleanupMeldingIds.push(melding.body.id);
    const und = await request(sb1App).post(`/api/barnevern/meldinger/${melding.body.id}/send-til-undersokelse`).send({});
    const sakId = und.body.sak.id;
    cleanupSakIds.push(sakId);
    await withSystemRlsContext("delegasjon_test_tildel", (client) => client.query(
      `UPDATE tidum_barnevern_saker SET tildelt_saksbehandler_id = $1 WHERE id = $2`, [sb1Id, sakId],
    ));

    const sperret = await request(sb2App).get(`/api/barnevern/saker/${sakId}`);
    expect(sperret.status).toBe(404);

    // Saksbehandler kan ikke delegere; leder kan, med obligatorisk begrunnelse.
    const nektet = await request(sb2App).post("/api/barnevern/delegasjoner").send({
      fraUserId: sb1Id, tilUserId: sb2Id, tilDato: new Date(Date.now() + 86400000).toISOString(), begrunnelse: "x",
    });
    expect(nektet.status).toBe(403);
    const utenBegrunnelse = await request(lederApp).post("/api/barnevern/delegasjoner").send({
      fraUserId: sb1Id, tilUserId: sb2Id, tilDato: new Date(Date.now() + 86400000).toISOString(),
    });
    expect(utenBegrunnelse.status).toBe(400);

    const delegasjon = await request(lederApp).post("/api/barnevern/delegasjoner").send({
      fraUserId: sb1Id, tilUserId: sb2Id,
      tilDato: new Date(Date.now() + 86400000).toISOString(),
      begrunnelse: "Ferieavvikling uke 36 — sb2 er stedfortreder.",
    });
    expect(delegasjon.status).toBe(201);

    const aapnet = await request(sb2App).get(`/api/barnevern/saker/${sakId}`);
    expect(aapnet.status).toBe(200);

    // Oppheving stenger tilgangen; raden bevares som tilgangsbevis.
    const opphev = await request(lederApp).post(`/api/barnevern/delegasjoner/${delegasjon.body.id}/opphev`).send({});
    expect(opphev.status).toBe(200);
    const stengt = await request(sb2App).get(`/api/barnevern/saker/${sakId}`);
    expect(stengt.status).toBe(404);
    const liste = await request(lederApp).get("/api/barnevern/delegasjoner");
    expect(liste.body.find((d: any) => d.id === delegasjon.body.id).opphevetAt).toBeTruthy();
  });

  it("break-glass gir tidsavgrenset nødtilgang til én sak med høylytt audit; skjerming markerer saken", async () => {
    const kommuneId = await insertTestKommune();
    const { app: lederApp } = await actorApp("leder", kommuneId, "barnevernsleder");
    const { id: sb1Id, app: sb1App } = await actorApp("sb1", kommuneId, "kommune_saksbehandler");
    const { id: sb2Id, app: sb2App } = await actorApp("sb2", kommuneId, "kommune_saksbehandler");

    const melding = await request(sb1App).post("/api/barnevern/meldinger").send({
      melderKategori: "politi", beskrivelse: "Akutt.",
    });
    cleanupMeldingIds.push(melding.body.id);
    const und = await request(sb1App).post(`/api/barnevern/meldinger/${melding.body.id}/send-til-undersokelse`).send({});
    const sakId = und.body.sak.id;
    cleanupSakIds.push(sakId);
    await withSystemRlsContext("breakglass_test_tildel", (client) => client.query(
      `UPDATE tidum_barnevern_saker SET tildelt_saksbehandler_id = $1 WHERE id = $2`, [sb1Id, sakId],
    ));

    expect((await request(sb2App).get(`/api/barnevern/saker/${sakId}`)).status).toBe(404);

    // For kort begrunnelse avvises.
    const kort = await request(sb2App).post(`/api/barnevern/saker/${sakId}/nodtilgang`).send({ begrunnelse: "haster" });
    expect(kort.status).toBe(400);

    const nod = await request(sb2App).post(`/api/barnevern/saker/${sakId}/nodtilgang`).send({
      begrunnelse: "Akutt hendelse på kveldstid — tildelt saksbehandler utilgjengelig.",
    });
    expect(nod.status).toBe(201);
    expect(nod.body.type).toBe("break_glass");

    expect((await request(sb2App).get(`/api/barnevern/saker/${sakId}`)).status).toBe(200);

    // Høylytt audit + synlig i leders delegasjonsliste.
    const { rows: audit } = await pool.query(
      `SELECT detaljer FROM tidum_barnevern_tilgangslogg
        WHERE user_id = $1 AND objekt_type = 'break_glass'`,
      [sb2Id],
    );
    expect(audit).toHaveLength(1);
    expect(audit[0].detaljer.sakId).toBe(sakId);
    const liste = await request(lederApp).get("/api/barnevern/delegasjoner");
    expect(liste.body.some((d: any) => d.type === "break_glass" && d.sakId === sakId)).toBe(true);

    // Skjermet adresse: kun leder; flagget auditlogges.
    expect((await request(sb2App).post(`/api/barnevern/saker/${sakId}/skjerming`).send({ skjermet: true })).status).toBe(403);
    const skjerm = await request(lederApp).post(`/api/barnevern/saker/${sakId}/skjerming`).send({
      skjermet: true, merknad: "Sperret adresse — trusselvurdering.",
    });
    expect(skjerm.status).toBe(200);
    expect(skjerm.body.adresseSkjermet).toBe(true);
    const { rows: [sakRad] } = await pool.query(
      `SELECT adresse_skjermet FROM tidum_barnevern_saker WHERE id = $1`, [sakId],
    );
    expect(sakRad.adresse_skjermet).toBe(true);
  });
});
