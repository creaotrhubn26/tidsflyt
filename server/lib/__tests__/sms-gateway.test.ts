import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import http from "http";
import { pool } from "../../db";
import {
  MAX_MELDING_LENGDE,
  normaliserTelefon,
  processDueSms,
  setSmsGatewayForTesting,
} from "../sms/sms-gateway";

// Krav 9: leverandørnøytral SMS-gateway med tenant-bundet utboks.
describe("SMS-gateway og utboks (krav 9)", { timeout: 20000 }, () => {
  const cleanupKommuneIds: number[] = [];
  const cleanupUserIds: string[] = [];

  afterEach(async () => {
    setSmsGatewayForTesting(null);
    for (const id of cleanupUserIds.splice(0)) {
      await pool.query(`DELETE FROM tidum_sms_utboks WHERE opprettet_av = $1`, [id]);
      await pool.query(`DELETE FROM users WHERE id = $1`, [id]);
    }
    for (const id of cleanupKommuneIds.splice(0)) {
      await pool.query(`DELETE FROM tidum_kommuner WHERE id = $1`, [id]);
    }
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

  it("normaliserer norske og internasjonale numre, avviser ugyldige", () => {
    expect(normaliserTelefon("412 34 567")).toBe("+4741234567");
    expect(normaliserTelefon("+47 912 34 567")).toBe("+4791234567");
    expect(normaliserTelefon("004741234567")).toBe("+4741234567");
    expect(normaliserTelefon("+4612345678")).toBe("+4612345678");
    expect(normaliserTelefon("12345")).toBeNull();
    expect(normaliserTelefon("21234567")).toBeNull(); // fasttelefon, ikke mobil
    // Fasttelefon slipper heller ikke gjennom via landkode-prefiks.
    expect(normaliserTelefon("+4721234567")).toBeNull();
    expect(normaliserTelefon("004721234567")).toBeNull();
  });

  it("køer via API, prosesserer mot gateway-adapter og markerer sendt", async () => {
    const kommuneId = await insertTestKommune();
    const { app } = await actorApp("sb", kommuneId, "kommune_saksbehandler");

    const sendte: any[] = [];
    setSmsGatewayForTesting({
      send: async (input) => {
        sendte.push(input);
        return { gatewayMeldingId: "gw-123" };
      },
    });

    const res = await request(app).post("/api/sms/send").send({
      telefon: "412 34 567",
      melding: "Påminnelse om avtale i morgen kl. 10.",
      formaal: "avtalevarsel",
    });
    expect(res.status).toBe(202);

    await processDueSms();

    // Rutas fire-and-forget-prosessering kan holde claimet ('sender') når
    // testens eget kall returnerer — vent på terminal status.
    let rad: any;
    for (let i = 0; i < 40; i++) {
      ({ rows: [rad] } = await pool.query(`SELECT * FROM tidum_sms_utboks WHERE id = $1`, [res.body.id]));
      if (rad.status !== "koet" && rad.status !== "sender") break;
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(rad.status).toBe("sendt");
    expect(rad.gateway_melding_id).toBe("gw-123");
    expect(rad.reservasjon_status).toBe("ikke_sjekket");
    expect(sendte.some((s) => s.telefon === "+4741234567")).toBe(true);
  });

  it("gatewayfeil gir backoff og til slutt terminal 'feilet'; uten gateway blir kø stående", async () => {
    const kommuneId = await insertTestKommune();
    const { id: userId, app } = await actorApp("sb", kommuneId, "kommune_saksbehandler");

    // Uten gateway: prosessering er no-op.
    const res = await request(app).post("/api/sms/send").send({
      telefon: "41234567", melding: "Test.", formaal: "test",
    });
    expect(res.status).toBe(202);
    await processDueSms();
    const { rows: [urort] } = await pool.query(`SELECT status, forsok FROM tidum_sms_utboks WHERE id = $1`, [res.body.id]);
    expect(urort.status).toBe("koet");
    expect(urort.forsok).toBe(0);

    // Feilende gateway: forsøk telles, backoff settes.
    setSmsGatewayForTesting({
      send: async () => { throw new Error("gateway nede"); },
    });
    await processDueSms();
    const { rows: [etterFeil] } = await pool.query(`SELECT * FROM tidum_sms_utboks WHERE id = $1`, [res.body.id]);
    expect(etterFeil.status).toBe("koet");
    expect(etterFeil.forsok).toBe(1);
    expect(etterFeil.feil).toContain("gateway nede");
    expect(new Date(etterFeil.neste_forsok).getTime()).toBeGreaterThan(Date.now());

    // Tvang til terminal: sett forsok tett på taket og forfall nå.
    await pool.query(
      `UPDATE tidum_sms_utboks SET forsok = 7, neste_forsok = NOW() WHERE id = $1`,
      [res.body.id],
    );
    await processDueSms();
    const { rows: [terminal] } = await pool.query(`SELECT status FROM tidum_sms_utboks WHERE id = $1`, [res.body.id]);
    expect(terminal.status).toBe("feilet");

    // Rydd raden eksplisitt (opprettet_av-basert cleanup dekker den også).
    expect(userId).toBeTruthy();
  });

  it("ugyldig nummer avvises; utboks-innsyn kun for leder og tenant-isolert", async () => {
    const kommuneA = await insertTestKommune();
    const kommuneB = await insertTestKommune();
    const { app: sbApp } = await actorApp("sb", kommuneA, "kommune_saksbehandler");
    const { app: lederApp } = await actorApp("leder", kommuneA, "barnevernsleder");
    const { app: lederBApp } = await actorApp("leder-b", kommuneB, "barnevernsleder");

    const ugyldig = await request(sbApp).post("/api/sms/send").send({
      telefon: "12345", melding: "X", formaal: "test",
    });
    expect(ugyldig.status).toBe(400);

    const utenFormaal = await request(sbApp).post("/api/sms/send").send({
      telefon: "41234567", melding: "X",
    });
    expect(utenFormaal.status).toBe(400);

    const ok = await request(sbApp).post("/api/sms/send").send({
      telefon: "41234567", melding: "Hemmelig innhold.", formaal: "avtalevarsel",
    });
    expect(ok.status).toBe(202);

    const nektet = await request(sbApp).get("/api/sms/utboks");
    expect(nektet.status).toBe(403);

    const liste = await request(lederApp).get("/api/sms/utboks");
    expect(liste.status).toBe(200);
    const rad = liste.body.find((r: any) => r.id === ok.body.id);
    expect(rad.formaal).toBe("avtalevarsel");
    // Meldingsinnhold eksponeres ikke i listen.
    expect(rad.melding).toBeUndefined();

    const fremmed = await request(lederBApp).get("/api/sms/utboks");
    expect(fremmed.body.map((r: any) => r.id)).not.toContain(ok.body.id);
  });

  it("for lang melding avvises; claim er eksklusivt; reservert mottaker blokkeres fail-closed", async () => {
    const kommuneId = await insertTestKommune();
    const { app } = await actorApp("sb", kommuneId, "kommune_saksbehandler");

    const forLang = await request(app).post("/api/sms/send").send({
      telefon: "41234567", melding: "x".repeat(MAX_MELDING_LENGDE + 1), formaal: "test",
    });
    expect(forLang.status).toBe(400);

    // Ingen gateway under oppsettet — rutas umiddelbare prosessering skal
    // ikke rekke å sende radene før testen har satt tilstandene sine.
    setSmsGatewayForTesting(null);

    // Rad som allerede er claimet ('sender') av en annen prosess røres ikke.
    const claimet = await request(app).post("/api/sms/send").send({
      telefon: "41234567", melding: "Claimet.", formaal: "test",
    });
    await pool.query(`UPDATE tidum_sms_utboks SET status = 'sender' WHERE id = $1`, [claimet.body.id]);
    // Rad med reservert mottaker blokkeres og når aldri gatewayen.
    const reservert = await request(app).post("/api/sms/send").send({
      telefon: "91234567", melding: "Reservert.", formaal: "test",
    });
    await pool.query(
      `UPDATE tidum_sms_utboks SET reservasjon_status = 'reservert' WHERE id = $1`,
      [reservert.body.id],
    );

    const sendte: string[] = [];
    setSmsGatewayForTesting({
      send: async (input) => { sendte.push(input.telefon); return { gatewayMeldingId: "gw-1" }; },
    });
    const resultat = await processDueSms();
    expect(resultat.blokkert).toBeGreaterThanOrEqual(1);

    const { rows: [claimetRad] } = await pool.query(`SELECT status FROM tidum_sms_utboks WHERE id = $1`, [claimet.body.id]);
    expect(claimetRad.status).toBe("sender");
    const { rows: [reservertRad] } = await pool.query(`SELECT status FROM tidum_sms_utboks WHERE id = $1`, [reservert.body.id]);
    expect(reservertRad.status).toBe("blokkert");
    expect(sendte).not.toContain("+4791234567");

    // Stale 'sender'-rad (krasjet prosess) gjenopprettes til kø og sendes.
    await pool.query(
      `UPDATE tidum_sms_utboks SET updated_at = NOW() - interval '15 minutes' WHERE id = $1`,
      [claimet.body.id],
    );
    await processDueSms();
    const { rows: [gjenopprettet] } = await pool.query(`SELECT status FROM tidum_sms_utboks WHERE id = $1`, [claimet.body.id]);
    expect(gjenopprettet.status).toBe("sendt");
  });
});
