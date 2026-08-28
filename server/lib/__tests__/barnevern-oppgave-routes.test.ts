import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import http from "http";
import { pool } from "../../db";
import { withSystemRlsContext } from "../database-rls-context";
import { runFristEscalations } from "../frist-engine";

// Krav 3: oppgaver med eier, frist, varsel og eskalering på barnevernsobjekter.
describe("Barnevern oppgaver (krav 3)", { timeout: 20000 }, () => {
  const cleanupKommuneIds: number[] = [];
  const cleanupMeldingIds: string[] = [];
  const cleanupOppgaveIds: string[] = [];
  const cleanupUserIds: string[] = [];

  afterEach(async () => {
    const oppgaveIds = cleanupOppgaveIds.splice(0);
    const meldingIds = cleanupMeldingIds.splice(0);
    const userIds = cleanupUserIds.splice(0);
    const kommuneIds = cleanupKommuneIds.splice(0);
    for (const id of userIds) {
      await pool.query(`DELETE FROM notifications WHERE recipient_id = $1`, [id]);
    }
    await withSystemRlsContext("barnevern_oppgave_test_cleanup", async (client) => {
      for (const id of oppgaveIds) {
        await client.query(`DELETE FROM tidum_frister WHERE entity_id = $1`, [id]);
        await client.query(`DELETE FROM tidum_barnevern_oppgaver WHERE id = $1`, [id]);
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

  async function insertUser(kommuneId: number, role: string): Promise<string> {
    const id = uniqueId(role.slice(0, 5));
    await pool.query(
      `INSERT INTO users (id, username, password, email, kommune_id, role) VALUES ($1, $2, 'x', $3, $4, $5)`,
      [id, id, `${id}@example.com`, kommuneId, role],
    );
    cleanupUserIds.push(id);
    return id;
  }

  async function appForUser(id: string) {
    const { registerRoutes } = await import("../../routes");
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.user = { id };
      req.isAuthenticated = () => true;
      next();
    });
    await registerRoutes(http.createServer(), app);
    return app;
  }

  async function opprettMelding(app: any) {
    const res = await request(app).post("/api/barnevern/meldinger").send({
      melderKategori: "skole",
      beskrivelse: "Oppgavetest.",
    });
    cleanupMeldingIds.push(res.body.id);
    return res.body.id;
  }

  it("oppretter oppgave på melding med frist i fristmotoren; fullføring kansellerer fristen", async () => {
    const kommuneId = await insertTestKommune();
    const sbId = await insertUser(kommuneId, "kommune_saksbehandler");
    const app = await appForUser(sbId);
    const meldingId = await opprettMelding(app);

    const frist = new Date(Date.now() + 3 * 86400000).toISOString();
    const opprettet = await request(app).post("/api/barnevern/oppgaver").send({
      entityType: "melding",
      entityId: meldingId,
      tittel: "Innhent uttalelse fra skolen",
      tildeltUserId: sbId,
      frist,
    });
    expect(opprettet.status).toBe(201);
    cleanupOppgaveIds.push(opprettet.body.id);
    expect(opprettet.body.status).toBe("apen");

    const { rows: frister } = await pool.query(
      `SELECT * FROM tidum_frister WHERE entity_type = 'barnevern_oppgave' AND entity_id = $1 AND status = 'aktiv'`,
      [opprettet.body.id],
    );
    expect(frister).toHaveLength(1);
    expect(frister[0].frist_type).toBe("oppgave");
    expect(frister[0].notify_user_id).toBe(sbId);

    const fullfort = await request(app).patch(`/api/barnevern/oppgaver/${opprettet.body.id}/fullfor`).send({});
    expect(fullfort.status).toBe(200);
    expect(fullfort.body.status).toBe("fullfort");
    expect(fullfort.body.fullfortAv).toBe(sbId);

    const { rows: etter } = await pool.query(
      `SELECT status FROM tidum_frister WHERE entity_type = 'barnevern_oppgave' AND entity_id = $1`,
      [opprettet.body.id],
    );
    expect(etter[0].status).toBe("kansellert");

    // Fullført oppgave kan ikke fullføres igjen.
    const igjen = await request(app).patch(`/api/barnevern/oppgaver/${opprettet.body.id}/fullfor`).send({});
    expect(igjen.status).toBe(404);
  });

  it("avviser ukjent objekt, tildelt utenfor kommunen og lister tenant-isolert", async () => {
    const kommuneA = await insertTestKommune();
    const kommuneB = await insertTestKommune();
    const sbA = await insertUser(kommuneA, "kommune_saksbehandler");
    const sbB = await insertUser(kommuneB, "kommune_saksbehandler");
    const appA = await appForUser(sbA);
    const appB = await appForUser(sbB);
    const meldingId = await opprettMelding(appA);

    const ukjent = await request(appA).post("/api/barnevern/oppgaver").send({
      entityType: "sak",
      entityId: meldingId, // melding-id finnes ikke i sak-tabellen
      tittel: "Feil objekt",
      tildeltUserId: sbA,
    });
    expect(ukjent.status).toBe(404);

    const fremmedTildelt = await request(appA).post("/api/barnevern/oppgaver").send({
      entityType: "melding",
      entityId: meldingId,
      tittel: "Tildelt i feil kommune",
      tildeltUserId: sbB,
    });
    expect(fremmedTildelt.status).toBe(400);

    const ok = await request(appA).post("/api/barnevern/oppgaver").send({
      entityType: "melding",
      entityId: meldingId,
      tittel: "Ekte oppgave",
      tildeltUserId: sbA,
    });
    cleanupOppgaveIds.push(ok.body.id);

    const listeB = await request(appB).get("/api/barnevern/oppgaver");
    expect(listeB.body.map((o: any) => o.id)).not.toContain(ok.body.id);

    const listeA = await request(appA).get(`/api/barnevern/oppgaver?entityType=melding&entityId=${meldingId}`);
    expect(listeA.body.map((o: any) => o.id)).toContain(ok.body.id);
  });

  it("eskaleringsmatrise: oversittet oppgavefrist varsler eier og barnevernsleder", async () => {
    const kommuneId = await insertTestKommune();
    const lederId = await insertUser(kommuneId, "barnevernsleder");
    const sbId = await insertUser(kommuneId, "kommune_saksbehandler");
    const app = await appForUser(sbId);
    const meldingId = await opprettMelding(app);

    const opprettet = await request(app).post("/api/barnevern/oppgaver").send({
      entityType: "melding",
      entityId: meldingId,
      tittel: "Oversittes",
      tildeltUserId: sbId,
      frist: new Date(Date.now() + 86400000).toISOString(),
    });
    cleanupOppgaveIds.push(opprettet.body.id);

    // Sett fristen 2 dager tilbake — offset 1-terskelen for leder er passert.
    await withSystemRlsContext("barnevern_oppgave_test_setup", async (client) => {
      await client.query(
        `UPDATE tidum_frister SET due_at = NOW() - interval '2 days'
          WHERE entity_type = 'barnevern_oppgave' AND entity_id = $1`,
        [opprettet.body.id],
      );
    });

    await runFristEscalations(undefined, [opprettet.body.id]);

    const { rows: eierVarsler } = await pool.query(
      `SELECT type FROM notifications WHERE recipient_id = $1 AND type = 'frist_eskalering'`,
      [sbId],
    );
    expect(eierVarsler.length).toBeGreaterThan(0);

    const { rows: lederVarsler } = await pool.query(
      `SELECT payload FROM notifications WHERE recipient_id = $1 AND type = 'frist_eskalering_leder'`,
      [lederId],
    );
    expect(lederVarsler.length).toBeGreaterThan(0);
  });
});
