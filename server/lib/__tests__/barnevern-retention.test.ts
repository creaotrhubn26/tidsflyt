/**
 * Retention/dataminimering (krav 22/24): gamle terminale SMS-er og
 * prosessert FIKS-rålogg minimeres; ferske og uprosesserte rader røres
 * aldri; varslede driftsalarmer slettes etter fristen.
 */
import { describe, it, expect, afterEach } from "vitest";
import { pool } from "../../db";
import { withSystemRlsContext } from "../database-rls-context";
import { kjorBarnevernRetention } from "../barnevern-retention";

describe("barnevern-retention (krav 22/24)", { timeout: 20000 }, () => {
  const cleanupKommuneIds: number[] = [];
  const cleanupUserIds: string[] = [];

  afterEach(async () => {
    const kommuneIds = cleanupKommuneIds.splice(0);
    const userIds = cleanupUserIds.splice(0);
    await withSystemRlsContext("barnevern_retention_test_cleanup", async (client) => {
      if (kommuneIds.length) {
        await client.query(`DELETE FROM tidum_sms_utboks WHERE kommune_id = ANY($1::int[])`, [kommuneIds]);
        await client.query(`DELETE FROM tidum_fiks_raw_intake_log WHERE kommune_id = ANY($1::int[])`, [kommuneIds]);
        await client.query(`DELETE FROM tidum_drift_alarmer WHERE kommune_id = ANY($1::int[])`, [kommuneIds]);
      }
    });
    for (const id of userIds) await pool.query(`DELETE FROM users WHERE id = $1`, [id]);
    for (const id of kommuneIds) await pool.query(`DELETE FROM tidum_kommuner WHERE id = $1`, [id]);
  });

  it("minimerer gamle terminale rader, lar ferske/uprosesserte stå, sletter varslede alarmer", async () => {
    const { rows: [kommune] } = await pool.query(
      `INSERT INTO tidum_kommuner (navn, org_nummer, kommunenummer) VALUES ($1, $2, '9999') RETURNING id`,
      [`Retentionkommune ${Date.now()}`, `${900000000 + Math.floor(Math.random() * 99999999)}`],
    );
    cleanupKommuneIds.push(kommune.id);
    const userId = `ret-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await pool.query(
      `INSERT INTO users (id, username, password, email, kommune_id, role) VALUES ($1, $2, 'x', $3, $4, 'kommune_saksbehandler')`,
      [userId, userId, `${userId}@example.com`, kommune.id],
    );
    cleanupUserIds.push(userId);

    await withSystemRlsContext("barnevern_retention_test_seed", async (client) => {
      // SMS: gammel sendt (minimeres), gammel koet (røres ikke), fersk sendt (røres ikke)
      await client.query(
        `INSERT INTO tidum_sms_utboks (kommune_id, mottaker_telefon, melding, formaal, status, sendt_dato, opprettet_av, created_at) VALUES
           ($1, '+4799999991', 'sensitivt innhold A', 'varsling', 'sendt', NOW() - INTERVAL '100 days', $2, NOW() - INTERVAL '100 days'),
           ($1, '+4799999992', 'sensitivt innhold B', 'varsling', 'koet', NULL, $2, NOW() - INTERVAL '100 days'),
           ($1, '+4799999993', 'sensitivt innhold C', 'varsling', 'sendt', NOW(), $2, NOW())`,
        [kommune.id, userId],
      );
      // FIKS: gammel prosessert (minimeres), gammel uprosessert (røres ikke)
      await client.query(
        `INSERT INTO tidum_fiks_raw_intake_log (kommune_id, raw_payload_encrypted, received_at, processed_at) VALUES
           ($1, 'kryptert-payload-1', NOW() - INTERVAL '100 days', NOW() - INTERVAL '99 days'),
           ($1, 'kryptert-payload-2', NOW() - INTERVAL '100 days', NULL)`,
        [kommune.id],
      );
      // Alarmer: gammel varslet (slettes), gammel uvarslet (beholdes)
      await client.query(
        `INSERT INTO tidum_drift_alarmer (kilde, entity_id, kommune_id, varslet, created_at) VALUES
           ('sms', 'ret-gammel-varslet', $1, TRUE, NOW() - INTERVAL '200 days'),
           ('sms', 'ret-gammel-uvarslet', $1, FALSE, NOW() - INTERVAL '200 days')`,
        [kommune.id],
      );
    });

    const res = await kjorBarnevernRetention();
    expect(res.sms).toBeGreaterThanOrEqual(1);
    expect(res.fiks).toBeGreaterThanOrEqual(1);
    expect(res.alarmer).toBeGreaterThanOrEqual(1);

    const { rows: smsRader } = await pool.query(
      `SELECT mottaker_telefon, melding FROM tidum_sms_utboks WHERE kommune_id = $1 ORDER BY mottaker_telefon`,
      [kommune.id],
    );
    expect(smsRader.map((r) => r.melding)).toEqual(["[minimert]", "sensitivt innhold B", "sensitivt innhold C"]);

    const { rows: fiksRader } = await pool.query(
      `SELECT raw_payload_encrypted, processed_at FROM tidum_fiks_raw_intake_log WHERE kommune_id = $1 ORDER BY processed_at NULLS LAST`,
      [kommune.id],
    );
    expect(fiksRader[0].raw_payload_encrypted).toBe("[minimert]");
    expect(fiksRader[1].raw_payload_encrypted).toBe("kryptert-payload-2");

    const { rows: alarmer } = await pool.query(
      `SELECT entity_id FROM tidum_drift_alarmer WHERE kommune_id = $1`, [kommune.id],
    );
    expect(alarmer.map((a) => a.entity_id)).toEqual(["ret-gammel-uvarslet"]);

    // Idempotent: andre kjøring rører ingenting nytt.
    const andre = await kjorBarnevernRetention();
    expect(andre.sms).toBe(0);
    expect(andre.fiks).toBe(0);
  });
});
