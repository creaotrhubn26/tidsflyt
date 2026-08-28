import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import http from "http";
import { pool } from "../../db";
import { withSystemRlsContext } from "../database-rls-context";
import { KPI_KATALOG } from "../../routes/barnevern-kpi-routes";

// Krav 13: nøkkeltall med dokumentert kilde/formel, beregnet sporbart.
describe("Barnevern KPI (krav 13)", { timeout: 20000 }, () => {
  const cleanupKommuneIds: number[] = [];
  const cleanupMeldingIds: string[] = [];
  const cleanupSakIds: string[] = [];
  const cleanupUserIds: string[] = [];

  afterEach(async () => {
    const sakIds = cleanupSakIds.splice(0);
    const meldingIds = cleanupMeldingIds.splice(0);
    const userIds = cleanupUserIds.splice(0);
    const kommuneIds = cleanupKommuneIds.splice(0);
    await withSystemRlsContext("kpi_test_cleanup", async (client) => {
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

  it("katalogen bærer kilde/formel/eier for hver KPI, og verdiene beregnes fra saksdataene", async () => {
    const kommuneId = await insertTestKommune();
    const { app: lederApp } = await actorApp("leder", kommuneId, "barnevernsleder");
    const { app: sbApp } = await actorApp("sb", kommuneId, "kommune_saksbehandler");

    // Én melding + én undersøkelsessak.
    const melding = await request(sbApp).post("/api/barnevern/meldinger").send({
      melderKategori: "skole", beskrivelse: "KPI-test.",
    });
    cleanupMeldingIds.push(melding.body.id);
    const undersokelse = await request(sbApp).post(`/api/barnevern/meldinger/${melding.body.id}/send-til-undersokelse`).send({});
    cleanupSakIds.push(undersokelse.body.sak.id);

    // Saksbehandler nektes (ledelsestall).
    const nektet = await request(sbApp).get("/api/barnevern/kpi");
    expect(nektet.status).toBe(403);

    const res = await request(lederApp).get("/api/barnevern/kpi");
    expect(res.status).toBe(200);
    expect(res.body.kpier).toHaveLength(KPI_KATALOG.length);

    for (const kpi of res.body.kpier) {
      expect(kpi.kilde, kpi.id).toBeTruthy();
      expect(kpi.formel, kpi.id).toContain("SELECT");
      expect(kpi.eier, kpi.id).toBeTruthy();
      expect(kpi.frekvens, kpi.id).toBeTruthy();
    }

    const perId = Object.fromEntries(res.body.kpier.map((k: any) => [k.id, k.verdi]));
    expect(perId.meldinger_30d).toBe(1);
    expect(perId.aktive_undersokelser).toBe(1);
    expect(perId.undersokelser_over_frist).toBe(0);
    // Avklart samme dag → 100 % innen frist og ~0 dagers avklaringstid.
    expect(perId.avklart_innen_frist_90d).toBe(100);
    expect(perId.snitt_avklaringstid_90d).toBe(0);
    expect(perId.saker_i_tiltak).toBe(0);
  });

  it("tallene er tenant-isolerte", async () => {
    const kommuneA = await insertTestKommune();
    const kommuneB = await insertTestKommune();
    const { app: sbA } = await actorApp("sb-a", kommuneA, "kommune_saksbehandler");
    const { app: lederB } = await actorApp("leder-b", kommuneB, "barnevernsleder");

    const melding = await request(sbA).post("/api/barnevern/meldinger").send({
      melderKategori: "nav", beskrivelse: "Skal ikke telle i B.",
    });
    cleanupMeldingIds.push(melding.body.id);

    const res = await request(lederB).get("/api/barnevern/kpi");
    const perId = Object.fromEntries(res.body.kpier.map((k: any) => [k.id, k.verdi]));
    expect(perId.meldinger_30d).toBe(0);
  });
});
