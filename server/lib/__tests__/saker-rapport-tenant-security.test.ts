import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { pool } from "../../db";
import { rapportRouter, sakerRouter } from "../../sakerRapportRoutes";

type Identity = { id: string; role: string; vendorId: number };

describe("saker/rapporter: tenant- og objektautorisasjon", () => {
  const nonce = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`;
  const leaderA: Identity = { id: `sec-leader-a-${nonce}`, role: "tiltaksleder", vendorId: 931_001 };
  const workerA: Identity = { id: `sec-worker-a-${nonce}`, role: "miljoarbeider", vendorId: leaderA.vendorId };
  const leaderB: Identity = { id: `sec-leader-b-${nonce}`, role: "tiltaksleder", vendorId: 932_001 };
  const workerB: Identity = { id: `sec-worker-b-${nonce}`, role: "miljoarbeider", vendorId: leaderB.vendorId };

  let sakA = "";
  let sakB = "";
  let rapportA = "";
  let rapportB = "";
  let maalA = "";
  let maalB = "";
  let aktivitetB = "";

  function appFor(identity: Identity) {
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.user = identity;
      req.authUser = identity;
      req.isAuthenticated = () => true;
      next();
    });
    app.use("/api/saker", sakerRouter);
    app.use("/api/rapporter", rapportRouter);
    return app;
  }

  beforeAll(async () => {
    for (const identity of [leaderA, workerA, leaderB, workerB]) {
      await pool.query(
        `INSERT INTO users (id, username, password, email, role, vendor_id)
         VALUES ($1, $2, 'test-only-not-a-login-secret', $3, $4, $5)`,
        [identity.id, identity.id, `${identity.id}@example.test`, identity.role, identity.vendorId],
      );
    }

    const caseRows = await pool.query(
      `INSERT INTO tidum_saker
         (saksnummer, tittel, vendor_id, tiltaksleder_id, tildelte_user_id)
       VALUES
         ($1, 'Sikkerhet sak A', $2, $3, $4::jsonb),
         ($5, 'Sikkerhet sak B', $6, $7, $8::jsonb)
       RETURNING id, saksnummer`,
      [
        `SEC-A-${nonce}`, leaderA.vendorId, leaderA.id, JSON.stringify([workerA.id]),
        `SEC-B-${nonce}`, leaderB.vendorId, leaderB.id, JSON.stringify([workerB.id, workerA.id]),
      ],
    );
    sakA = caseRows.rows.find((row) => row.saksnummer === `SEC-A-${nonce}`).id;
    sakB = caseRows.rows.find((row) => row.saksnummer === `SEC-B-${nonce}`).id;

    const reportRows = await pool.query(
      `INSERT INTO tidum_rapporter
         (sak_id, user_id, tiltaksleder_id, status, innledning, periode_from, periode_to)
       VALUES
         ($1, $2, $3, 'utkast', 'tenant-a-marker', '2026-08-01', '2026-08-31'),
         ($4, $5, $6, 'til_godkjenning', 'tenant-b-marker', '2026-08-01', '2026-08-31')
       RETURNING id, sak_id`,
      [sakA, workerA.id, leaderA.id, sakB, workerB.id, leaderB.id],
    );
    rapportA = reportRows.rows.find((row) => row.sak_id === sakA).id;
    rapportB = reportRows.rows.find((row) => row.sak_id === sakB).id;

    const goalRows = await pool.query(
      `INSERT INTO tidum_rapport_maal (rapport_id, nummer, beskrivelse)
       VALUES ($1, 1, 'mål-a-marker'), ($2, 1, 'mål-b-marker')
       RETURNING id, rapport_id`,
      [rapportA, rapportB],
    );
    maalA = goalRows.rows.find((row) => row.rapport_id === rapportA).id;
    maalB = goalRows.rows.find((row) => row.rapport_id === rapportB).id;

    const activity = await pool.query(
      `INSERT INTO tidum_rapport_aktiviteter
         (rapport_id, mal_id, dato, beskrivelse)
       VALUES ($1, $2, '2026-08-15', 'aktivitet-b-marker')
       RETURNING id`,
      [rapportB, maalB],
    );
    aktivitetB = activity.rows[0].id;
  }, 60_000);

  afterAll(async () => {
    if (sakA || sakB) {
      await pool.query(
        `DELETE FROM tidum_sak_journal_attachments
         WHERE journal_entry_id IN (
           SELECT id FROM tidum_sak_journal WHERE sak_id = ANY($1::uuid[])
         )`,
        [[sakA, sakB]],
      );
      await pool.query(`DELETE FROM tidum_sak_journal WHERE sak_id = ANY($1::uuid[])`, [[sakA, sakB]]);
    }
    if (rapportA || rapportB) {
      await pool.query(`DELETE FROM tidum_rapporter WHERE id = ANY($1::uuid[])`, [[rapportA, rapportB]]);
    }
    if (sakA || sakB) {
      await pool.query(`DELETE FROM tidum_saker WHERE id = ANY($1::uuid[])`, [[sakA, sakB]]);
    }
    await pool.query(`DELETE FROM users WHERE id = ANY($1::varchar[])`, [[leaderA.id, workerA.id, leaderB.id, workerB.id]]);
  }, 60_000);

  it("nekter endring, sletting og tildeling på en annen tenants sak", async () => {
    const app = appFor(leaderA);

    expect((await request(app).patch(`/api/saker/${sakB}`).send({ tittel: "overtatt" })).status).toBe(404);
    expect((await request(app).post(`/api/saker/${sakB}/tildel`).send({ userIds: [workerA.id] })).status).toBe(404);
    expect((await request(app).delete(`/api/saker/${sakB}`)).status).toBe(404);

    const crossTenantAssignment = await request(app)
      .post(`/api/saker/${sakA}/tildel`)
      .send({ userIds: [workerB.id] });
    expect(crossTenantAssignment.status).toBe(400);

    const unchanged = await pool.query(
      `SELECT tittel, tildelte_user_id FROM tidum_saker WHERE id = $1`,
      [sakB],
    );
    expect(unchanged.rows[0].tittel).toBe("Sikkerhet sak B");
    expect(unchanged.rows[0].tildelte_user_id).toEqual([workerB.id, workerA.id]);
  });

  it("krever både tenant og tildeling for journaltilgang", async () => {
    const app = appFor(workerA);
    expect((await request(app).get(`/api/saker/${sakB}/journal`)).status).toBe(404);

    const own = await request(app)
      .post(`/api/saker/${sakA}/journal`)
      .send({ content: "Tillatt notat i egen tenant." });
    expect(own.status).toBe(201);
    expect(own.body.userId).toBe(workerA.id);
  });

  it("tenant-sikrer rapportlesing, oppretting og redigering uten mass assignment", async () => {
    const workerApp = appFor(workerA);
    const leaderApp = appFor(leaderA);

    expect((await request(workerApp).get(`/api/rapporter/${rapportB}`)).status).toBe(404);
    expect((await request(workerApp).patch(`/api/rapporter/${rapportB}`).send({ innledning: "overtatt" })).status).toBe(404);
    expect((await request(workerApp).post("/api/rapporter").send({ sakId: sakB })).status).toBe(404);
    expect((await request(leaderApp).patch(`/api/rapporter/${rapportA}`).send({ innledning: "leder-redigering" })).status).toBe(404);

    const ownUpdate = await request(workerApp).patch(`/api/rapporter/${rapportA}`).send({
      innledning: "eier-redigering",
      userId: workerB.id,
      tiltakslederId: leaderB.id,
      status: "godkjent",
      reviewedBy: workerB.id,
    });
    expect(ownUpdate.status).toBe(200);

    const persisted = await pool.query(
      `SELECT innledning, user_id, tiltaksleder_id, status, reviewed_by
       FROM tidum_rapporter WHERE id = $1`,
      [rapportA],
    );
    expect(persisted.rows[0]).toEqual({
      innledning: "eier-redigering",
      user_id: workerA.id,
      tiltaksleder_id: leaderA.id,
      status: "utkast",
      reviewed_by: null,
    });
  });

  it("forankrer mål i rapporten fra URL-en", async () => {
    const app = appFor(workerA);
    expect((await request(app).get(`/api/rapporter/${rapportB}/maal`)).status).toBe(404);
    expect((await request(app).post(`/api/rapporter/${rapportB}/maal`).send({ beskrivelse: "angriper-mål" })).status).toBe(404);

    const crossParent = await request(app)
      .patch(`/api/rapporter/${rapportA}/maal/${maalB}`)
      .send({ beskrivelse: "overtatt mål" });
    expect(crossParent.status).toBe(404);

    const own = await request(app)
      .patch(`/api/rapporter/${rapportA}/maal/${maalA}`)
      .send({ fremdrift: 25 });
    expect(own.status).toBe(200);

    const foreign = await pool.query(`SELECT beskrivelse FROM tidum_rapport_maal WHERE id = $1`, [maalB]);
    expect(foreign.rows[0].beskrivelse).toBe("mål-b-marker");
  });

  it("forankrer aktiviteter i rapporten og avviser mål fra en annen rapport", async () => {
    const app = appFor(workerA);
    expect((await request(app).get(`/api/rapporter/${rapportB}/aktiviteter`)).status).toBe(404);

    const crossGoal = await request(app)
      .post(`/api/rapporter/${rapportA}/aktiviteter`)
      .send({ malId: maalB, dato: "2026-08-16", beskrivelse: "ulovlig kobling" });
    expect(crossGoal.status).toBe(404);

    const crossParentDelete = await request(app)
      .delete(`/api/rapporter/${rapportA}/aktiviteter/${aktivitetB}`);
    expect(crossParentDelete.status).toBe(404);

    const own = await request(app)
      .post(`/api/rapporter/${rapportA}/aktiviteter`)
      .send({ malId: maalA, dato: "2026-08-16", beskrivelse: "tillatt aktivitet" });
    expect(own.status).toBe(200);
    expect((await request(app).delete(`/api/rapporter/${rapportA}/aktiviteter/${own.body.id}`)).status).toBe(200);

    const foreign = await pool.query(`SELECT COUNT(*)::int AS count FROM tidum_rapport_aktiviteter WHERE id = $1`, [aktivitetB]);
    expect(foreign.rows[0].count).toBe(1);
  });

  it("skjuler audit/kommentarer og bulk-godkjenning på tvers av tenant", async () => {
    const workerApp = appFor(workerA);
    const leaderApp = appFor(leaderA);

    expect((await request(workerApp).get(`/api/rapporter/${rapportB}/audit`)).status).toBe(404);
    expect((await request(workerApp).get(`/api/rapporter/${rapportB}/kommentarer`)).status).toBe(404);
    expect((await request(leaderApp).post(`/api/rapporter/${rapportB}/kommentarer`).send({ tekst: "angriper" })).status).toBe(404);
    expect((await request(leaderApp).post(`/api/rapporter/${rapportB}/godkjenn`).send({})).status).toBe(404);

    const bulk = await request(leaderApp)
      .post("/api/rapporter/bulk/godkjenn")
      .send({ ids: [rapportB] });
    expect(bulk.status).toBe(200);
    expect(bulk.body.approved).toBe(0);
    expect(bulk.body.failed).toHaveLength(1);

    const foreign = await pool.query(`SELECT status FROM tidum_rapporter WHERE id = $1`, [rapportB]);
    expect(foreign.rows[0].status).toBe("til_godkjenning");
  });
});
