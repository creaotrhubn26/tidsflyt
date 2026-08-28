import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import http from "http";
import { pool } from "../../db";
import { withSystemRlsContext } from "../database-rls-context";
import {
  processDueBvrInnsendinger,
  queueBvrInnsending,
  setBvrTransportForTesting,
  validerDatasett,
  type BvrDatasett,
} from "../barnevernsregister";

// Krav 10/28: daglig innrapportering til Barnevernsregisteret.
describe("Barnevernsregisteret-innrapportering (krav 10/28)", { timeout: 20000 }, () => {
  const cleanupKommuneIds: number[] = [];
  const cleanupMeldingIds: string[] = [];
  const cleanupSakIds: string[] = [];
  const cleanupUserIds: string[] = [];

  afterEach(async () => {
    setBvrTransportForTesting(null);
    const sakIds = cleanupSakIds.splice(0);
    const meldingIds = cleanupMeldingIds.splice(0);
    const userIds = cleanupUserIds.splice(0);
    const kommuneIds = cleanupKommuneIds.splice(0);
    await withSystemRlsContext("bvr_test_cleanup", async (client) => {
      for (const id of kommuneIds) {
        await client.query(`DELETE FROM tidum_barnevernsregister_innsendinger WHERE kommune_id = $1`, [id]);
      }
      for (const id of sakIds) {
        await client.query(`DELETE FROM tidum_frister WHERE entity_id = $1`, [id]);
        await client.query(`DELETE FROM tidum_barnevern_sak_fase_historikk WHERE sak_id = $1`, [id]);
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

  async function insertTestKommune(kommunenummer = "9999"): Promise<number> {
    const { rows: [row] } = await pool.query(
      `INSERT INTO tidum_kommuner (navn, org_nummer, kommunenummer) VALUES ($1, $2, $3) RETURNING id`,
      [`Testkommune ${Date.now()}`, `${900000000 + Math.floor(Math.random() * 99999999)}`, kommunenummer],
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

  const iDag = new Date().toISOString().slice(0, 10);

  it("kvalitetssikring avviser ugyldige datasett før innsending", () => {
    const gyldig: BvrDatasett = {
      kommunenummer: "3001",
      kommune: "Testby",
      rapportdato: "2026-08-27",
      hendelserSisteDogn: {
        meldingerMottatt: 2, meldingerAvklart: 1, meldingerHenlagt: 1,
        undersokelserStartet: 1, undersokelserKonkludert: 0, faseoverganger: {},
      },
      bestand: {
        meldingerUnderAvklaring: 1, sakerIUndersokelse: 1, sakerITiltak: 0,
        aktiveGodkjentePlaner: 0, meldingerOverFrist: 0, undersokelserOverFrist: 0,
      },
    };
    expect(validerDatasett(gyldig)).toEqual([]);

    expect(validerDatasett({ ...gyldig, kommunenummer: "" })).toContain(
      "Kommunenummer mangler eller er ikke fire siffer.",
    );
    expect(validerDatasett({
      ...gyldig,
      bestand: { ...gyldig.bestand, sakerIUndersokelse: -1 },
    }).some((f) => f.includes("sakerIUndersokelse"))).toBe(true);
    expect(validerDatasett({
      ...gyldig,
      hendelserSisteDogn: { ...gyldig.hendelserSisteDogn, meldingerHenlagt: 5 },
    })).toContain("Henlagte meldinger overstiger avklarte i samme døgn.");
  });

  it("bygger dagsnapshot fra saksdata, sender via transport og lagrer kvittering; idempotent per dag", async () => {
    const kommuneId = await insertTestKommune("3001");
    const { app } = await actorApp("sb", kommuneId, "kommune_saksbehandler");

    const melding = await request(app).post("/api/barnevern/meldinger").send({
      melderKategori: "skole", beskrivelse: "BVR-test.",
    });
    cleanupMeldingIds.push(melding.body.id);
    const undersokelse = await request(app).post(`/api/barnevern/meldinger/${melding.body.id}/send-til-undersokelse`).send({});
    cleanupSakIds.push(undersokelse.body.sak.id);

    const koet = await queueBvrInnsending(kommuneId, iDag);
    expect(koet.queued).toBe(true);
    expect(koet.status).toBe("koet");

    const sendteDatasett: any[] = [];
    setBvrTransportForTesting({
      send: async (input) => {
        sendteDatasett.push(input);
        return { kvittering: { mottaksId: "BVR-2026-001", status: "godkjent" } };
      },
    });
    const resultat = await processDueBvrInnsendinger();
    expect(resultat.sendt).toBe(1);

    const { rows: [rad] } = await pool.query(
      `SELECT * FROM tidum_barnevernsregister_innsendinger WHERE id = $1`, [koet.id],
    );
    expect(rad.status).toBe("sendt");
    expect(rad.kvittering.mottaksId).toBe("BVR-2026-001");
    expect(rad.innholds_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(sendteDatasett[0].kommunenummer).toBe("3001");
    expect(sendteDatasett[0].datasett.hendelserSisteDogn.meldingerMottatt).toBe(1);
    expect(sendteDatasett[0].datasett.bestand.sakerIUndersokelse).toBe(1);

    // Idempotens: ny køing samme dag rører ikke det sendte datasettet.
    const igjen = await queueBvrInnsending(kommuneId, iDag);
    expect(igjen.status).toBe("sendt");
    const { rows: [uendret] } = await pool.query(
      `SELECT status, kvittering FROM tidum_barnevernsregister_innsendinger WHERE kommune_id = $1 AND rapportdato = $2`,
      [kommuneId, iDag],
    );
    expect(uendret.status).toBe("sendt");
    expect(uendret.kvittering.mottaksId).toBe("BVR-2026-001");
  });

  it("ugyldig kommunenummer gir 'avvist' som aldri sendes; uten transport blir kø stående", async () => {
    const kommuneId = await insertTestKommune("XX"); // ikke fire siffer

    const koet = await queueBvrInnsending(kommuneId, iDag);
    expect(koet.status).toBe("avvist");

    setBvrTransportForTesting({
      send: async () => { throw new Error("skal aldri kalles"); },
    });
    const resultat = await processDueBvrInnsendinger();
    expect(resultat.sendt).toBe(0);
    expect(resultat.feilet).toBe(0);

    const { rows: [rad] } = await pool.query(
      `SELECT status, valideringsfeil FROM tidum_barnevernsregister_innsendinger WHERE id = $1`, [koet.id],
    );
    expect(rad.status).toBe("avvist");
    expect(rad.valideringsfeil.length).toBeGreaterThan(0);
  });

  it("leder ser innsendingsloggen og kan trigge manuelt; saksbehandler nektes; tenant-isolert", async () => {
    const kommuneA = await insertTestKommune("3001");
    const kommuneB = await insertTestKommune("3002");
    const { app: lederApp } = await actorApp("leder", kommuneA, "barnevernsleder");
    const { app: sbApp } = await actorApp("sb", kommuneA, "kommune_saksbehandler");
    const { app: lederBApp } = await actorApp("leder-b", kommuneB, "barnevernsleder");

    const nektet = await request(sbApp).post("/api/barnevern/innrapportering/kjor").send({});
    expect(nektet.status).toBe(403);

    const kjort = await request(lederApp).post("/api/barnevern/innrapportering/kjor").send({ rapportdato: iDag });
    expect(kjort.status).toBe(202);

    const logg = await request(lederApp).get("/api/barnevern/innrapportering");
    expect(logg.status).toBe(200);
    expect(logg.body.map((r: any) => r.id)).toContain(kjort.body.id);

    const fremmed = await request(lederBApp).get("/api/barnevern/innrapportering");
    expect(fremmed.body.map((r: any) => r.id)).not.toContain(kjort.body.id);
  });
});
