import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import http from "http";
import { pool } from "../../db";
import { withSystemRlsContext } from "../database-rls-context";

// Krav 5: versjonert plan med deltakere, tiltak, evalueringsfrist og
// faglig godkjenning på kommunal barnevernssak.
describe("Barnevern planer (krav 5)", { timeout: 20000 }, () => {
  const cleanupKommuneIds: number[] = [];
  const cleanupMeldingIds: string[] = [];
  const cleanupSakIds: string[] = [];
  const cleanupPlanIds: string[] = [];
  const cleanupUserIds: string[] = [];

  afterEach(async () => {
    const planIds = cleanupPlanIds.splice(0);
    const sakIds = cleanupSakIds.splice(0);
    const meldingIds = cleanupMeldingIds.splice(0);
    const userIds = cleanupUserIds.splice(0);
    const kommuneIds = cleanupKommuneIds.splice(0);
    await withSystemRlsContext("barnevern_plan_test_cleanup", async (client) => {
      for (const id of planIds) {
        await client.query(`DELETE FROM tidum_frister WHERE entity_id = $1`, [id]);
      }
      for (const id of sakIds) {
        await client.query(`DELETE FROM tidum_frister WHERE entity_id = $1`, [id]);
        await client.query(`DELETE FROM tidum_barnevern_sak_fase_historikk WHERE sak_id = $1`, [id]);
        // Planer og tiltak har CASCADE fra saken.
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
      melderKategori: "skole",
      beskrivelse: "Plantest.",
    });
    cleanupMeldingIds.push(melding.body.id);
    const res = await request(app).post(`/api/barnevern/meldinger/${melding.body.id}/send-til-undersokelse`).send({});
    cleanupSakIds.push(res.body.sak.id);
    return res.body.sak;
  }

  it("full planflyt: utkast med deltakere og tiltak → ledergodkjenning med evalueringsfrist → ny versjon", async () => {
    const kommuneId = await insertTestKommune();
    const { id: lederId, app: lederApp } = await actorApp("leder", kommuneId, "barnevernsleder");
    const { app: sbApp } = await actorApp("sb", kommuneId, "kommune_saksbehandler");
    const sak = await opprettSak(sbApp);

    const evalueringsfrist = new Date(Date.now() + 30 * 86400000).toISOString();
    const utkast = await request(sbApp).post(`/api/barnevern/saker/${sak.id}/planer`).send({
      formaal: "Stabil skolegang og trygg omsorg.",
      deltakere: [
        { navn: "Mor Testesen", rolle: "forelder" },
        { navn: "Kari Saksbehandler", rolle: "saksbehandler" },
      ],
      evalueringsfrist,
    });
    expect(utkast.status).toBe(201);
    cleanupPlanIds.push(utkast.body.id);
    expect(utkast.body.versjon).toBe(1);
    expect(utkast.body.status).toBe("utkast");

    // Bare ett utkast av gangen.
    const dobbelt = await request(sbApp).post(`/api/barnevern/saker/${sak.id}/planer`).send({});
    expect(dobbelt.status).toBe(409);

    const tiltak = await request(sbApp).post(`/api/barnevern/planer/${utkast.body.id}/tiltak`).send({
      beskrivelse: "Miljøterapeut i hjemmet to ganger i uken",
      ansvarlig: "Kari Saksbehandler",
      frist: "2026-10-01",
    });
    expect(tiltak.status).toBe(201);

    // Saksbehandler kan ikke godkjenne.
    const nektet = await request(sbApp).post(`/api/barnevern/planer/${utkast.body.id}/godkjenn`).send({});
    expect(nektet.status).toBe(403);

    const godkjent = await request(lederApp).post(`/api/barnevern/planer/${utkast.body.id}/godkjenn`).send({});
    expect(godkjent.status).toBe(200);
    expect(godkjent.body.status).toBe("godkjent");
    expect(godkjent.body.godkjentAv).toBe(lederId);

    // Evalueringsfrist registrert i fristmotoren.
    const { rows: frister } = await pool.query(
      `SELECT frist_type, status FROM tidum_frister WHERE entity_type = 'barnevern_plan' AND entity_id = $1`,
      [utkast.body.id],
    );
    expect(frister).toHaveLength(1);
    expect(frister[0].frist_type).toBe("evaluering");
    expect(frister[0].status).toBe("aktiv");

    // Godkjent plan kan ikke redigeres direkte.
    const laast = await request(sbApp).patch(`/api/barnevern/planer/${utkast.body.id}`).send({ formaal: "Endres ikke" });
    expect(laast.status).toBe(404);

    // Ny versjon kopierer innhold og tiltak.
    const v2 = await request(sbApp).post(`/api/barnevern/planer/${utkast.body.id}/ny-versjon`).send({});
    expect(v2.status).toBe(201);
    cleanupPlanIds.push(v2.body.id);
    expect(v2.body.versjon).toBe(2);
    expect(v2.body.status).toBe("utkast");
    expect(v2.body.formaal).toBe("Stabil skolegang og trygg omsorg.");

    const v2Godkjent = await request(lederApp).post(`/api/barnevern/planer/${v2.body.id}/godkjenn`).send({});
    expect(v2Godkjent.status).toBe(200);

    // v1 er nå erstattet og evalueringsfristen kansellert.
    const liste = await request(sbApp).get(`/api/barnevern/saker/${sak.id}/planer`);
    const v1 = liste.body.find((p: any) => p.versjon === 1);
    expect(v1.status).toBe("erstattet");
    expect(v1.tiltak).toHaveLength(1);
    const v2iListe = liste.body.find((p: any) => p.versjon === 2);
    expect(v2iListe.tiltak).toHaveLength(1);

    const { rows: v1Frist } = await pool.query(
      `SELECT status FROM tidum_frister WHERE entity_type = 'barnevern_plan' AND entity_id = $1`,
      [utkast.body.id],
    );
    expect(v1Frist[0].status).toBe("kansellert");
  });

  it("statusrapportering på tiltak fungerer også etter godkjenning; validering og tenant-isolasjon", async () => {
    const kommuneA = await insertTestKommune();
    const kommuneB = await insertTestKommune();
    const { app: lederApp } = await actorApp("leder", kommuneA, "barnevernsleder");
    const { app: sbApp } = await actorApp("sb", kommuneA, "kommune_saksbehandler");
    const { app: fremmedApp } = await actorApp("sb-b", kommuneB, "kommune_saksbehandler");
    const sak = await opprettSak(sbApp);

    const ugyldigDeltaker = await request(sbApp).post(`/api/barnevern/saker/${sak.id}/planer`).send({
      deltakere: [{ navn: "", rolle: "forelder" }],
    });
    expect(ugyldigDeltaker.status).toBe(400);

    const utkast = await request(sbApp).post(`/api/barnevern/saker/${sak.id}/planer`).send({});
    cleanupPlanIds.push(utkast.body.id);
    const tiltak = await request(sbApp).post(`/api/barnevern/planer/${utkast.body.id}/tiltak`).send({
      beskrivelse: "Støttekontakt",
      ansvarlig: "Kari",
    });
    await request(lederApp).post(`/api/barnevern/planer/${utkast.body.id}/godkjenn`).send({});

    // Oppfølging: status kan rapporteres på godkjent plan.
    const status = await request(sbApp).patch(`/api/barnevern/plan-tiltak/${tiltak.body.id}/status`).send({
      status: "pagar",
      statusnotat: "Startet opp.",
    });
    expect(status.status).toBe(200);
    expect(status.body.status).toBe("pagar");

    // Nye tiltak kan ikke legges på godkjent plan.
    const laast = await request(sbApp).post(`/api/barnevern/planer/${utkast.body.id}/tiltak`).send({
      beskrivelse: "For sent",
      ansvarlig: "Kari",
    });
    expect(laast.status).toBe(404);

    // Annen kommune ser ingenting.
    const fremmedListe = await request(fremmedApp).get(`/api/barnevern/saker/${sak.id}/planer`);
    expect(fremmedListe.status).toBe(404);
    const fremmedStatus = await request(fremmedApp).patch(`/api/barnevern/plan-tiltak/${tiltak.body.id}/status`).send({
      status: "avbrutt",
    });
    expect(fremmedStatus.status).toBe(404);
  });
});
