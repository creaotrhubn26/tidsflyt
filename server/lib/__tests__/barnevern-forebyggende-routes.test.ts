import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import http from "http";
import { pool } from "../../db";
import { withSystemRlsContext } from "../database-rls-context";

// Krav 18: forebyggende arbeid — prosjekter, aktiviteter og aggregering.
describe("Barnevern forebyggende arbeid (krav 18)", { timeout: 20000 }, () => {
  const cleanupKommuneIds: number[] = [];
  const cleanupForebyggendeIds: string[] = [];
  const cleanupUserIds: string[] = [];

  afterEach(async () => {
    const forebyggendeIds = cleanupForebyggendeIds.splice(0);
    const userIds = cleanupUserIds.splice(0);
    const kommuneIds = cleanupKommuneIds.splice(0);
    await withSystemRlsContext("barnevern_forebyggende_test_cleanup", async (client) => {
      for (const id of forebyggendeIds) {
        // Aktiviteter er append-only og CASCADEr fra tiltaket.
        await client.query(`DELETE FROM tidum_barnevern_forebyggende WHERE id = $1`, [id]);
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

  it("oppretter tiltak med samarbeidsparter, registrerer aktiviteter og aggregerer", async () => {
    const kommuneId = await insertTestKommune();
    const { id: sbId, app } = await actorApp("sb", kommuneId, "kommune_saksbehandler");

    const tiltak = await request(app).post("/api/barnevern/forebyggende").send({
      tittel: "Foreldreveiledningskurs høst 2026",
      beskrivelse: "Kurs i samarbeid med helsestasjonen.",
      kategori: "program",
      samarbeidsparter: [
        { navn: "Helsestasjonen", type: "helsestasjon" },
        { navn: "Os skole", type: "skole" },
      ],
      startDato: "2026-09-01",
    });
    expect(tiltak.status).toBe(201);
    cleanupForebyggendeIds.push(tiltak.body.id);
    expect(tiltak.body.status).toBe("planlagt");
    expect(tiltak.body.ansvarligUserId).toBe(sbId);

    await request(app).patch(`/api/barnevern/forebyggende/${tiltak.body.id}`).send({ status: "pagar" });

    const a1 = await request(app).post(`/api/barnevern/forebyggende/${tiltak.body.id}/aktiviteter`).send({
      dato: "2026-09-10", beskrivelse: "Første kurskveld", antallDeltakere: 12,
    });
    expect(a1.status).toBe(201);
    const a2 = await request(app).post(`/api/barnevern/forebyggende/${tiltak.body.id}/aktiviteter`).send({
      dato: "2026-09-17", beskrivelse: "Andre kurskveld", antallDeltakere: 15,
    });
    expect(a2.status).toBe(201);

    const detalj = await request(app).get(`/api/barnevern/forebyggende/${tiltak.body.id}`);
    expect(detalj.body.aktiviteter).toHaveLength(2);
    expect(detalj.body.samarbeidsparter).toHaveLength(2);

    const statistikk = await request(app).get("/api/barnevern/forebyggende/statistikk");
    expect(statistikk.status).toBe(200);
    const program = statistikk.body.perKategori.find((r: any) => r.kategori === "program" && r.status === "pagar");
    expect(program.antall).toBe(1);
    const aar2026 = statistikk.body.aktivitetPerAar.find((r: any) => r.aar === 2026);
    expect(aar2026.antall_aktiviteter).toBe(2);
    expect(aar2026.antall_deltakere).toBe(27);
  });

  it("validering og tenant-isolasjon", async () => {
    const kommuneA = await insertTestKommune();
    const kommuneB = await insertTestKommune();
    const { app: appA } = await actorApp("sb-a", kommuneA, "kommune_saksbehandler");
    const { app: appB } = await actorApp("sb-b", kommuneB, "kommune_saksbehandler");

    const ugyldigKategori = await request(appA).post("/api/barnevern/forebyggende").send({
      tittel: "X", kategori: "feil",
    });
    expect(ugyldigKategori.status).toBe(400);

    const tiltak = await request(appA).post("/api/barnevern/forebyggende").send({
      tittel: "Skolesamarbeid", kategori: "samarbeid",
    });
    cleanupForebyggendeIds.push(tiltak.body.id);

    const ugyldigDato = await request(appA).post(`/api/barnevern/forebyggende/${tiltak.body.id}/aktiviteter`).send({
      dato: "10.09.2026", beskrivelse: "Feil datoformat",
    });
    expect(ugyldigDato.status).toBe(400);
    const negativeDeltakere = await request(appA).post(`/api/barnevern/forebyggende/${tiltak.body.id}/aktiviteter`).send({
      dato: "2026-09-10", beskrivelse: "Negativt", antallDeltakere: -1,
    });
    expect(negativeDeltakere.status).toBe(400);

    const fremmedDetalj = await request(appB).get(`/api/barnevern/forebyggende/${tiltak.body.id}`);
    expect(fremmedDetalj.status).toBe(404);
    const fremmedListe = await request(appB).get("/api/barnevern/forebyggende");
    expect(fremmedListe.body.map((t: any) => t.id)).not.toContain(tiltak.body.id);
  });
});
