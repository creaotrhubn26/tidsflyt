/**
 * Driftsalarm (krav 3/25): terminale køfeil registreres én gang,
 * samles i én e-post, og re-varsles aldri.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { pool } from "../../db";
import { withSystemRlsContext } from "../database-rls-context";
import { emailService } from "../email-service";
import { sjekkDriftAlarmer } from "../drift-alarm";

describe("drift-alarm (krav 3/25)", { timeout: 20000 }, () => {
  const cleanupKommuneIds: number[] = [];
  const cleanupUserIds: string[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    delete process.env.DRIFT_ALARM_EPOST;
    const kommuneIds = cleanupKommuneIds.splice(0);
    const userIds = cleanupUserIds.splice(0);
    await withSystemRlsContext("drift_alarm_test_cleanup", async (client) => {
      if (kommuneIds.length) {
        await client.query(`DELETE FROM tidum_drift_alarmer WHERE kommune_id = ANY($1::int[])`, [kommuneIds]);
        await client.query(`DELETE FROM tidum_sms_utboks WHERE kommune_id = ANY($1::int[])`, [kommuneIds]);
        await client.query(`DELETE FROM tidum_barnevernsregister_innsendinger WHERE kommune_id = ANY($1::int[])`, [kommuneIds]);
      }
    });
    for (const id of userIds) await pool.query(`DELETE FROM users WHERE id = $1`, [id]);
    for (const id of kommuneIds) await pool.query(`DELETE FROM tidum_kommuner WHERE id = $1`, [id]);
  });

  async function seedFeil(): Promise<number> {
    const { rows: [kommune] } = await pool.query(
      `INSERT INTO tidum_kommuner (navn, org_nummer, kommunenummer) VALUES ($1, $2, '9999') RETURNING id`,
      [`Alarmkommune ${Date.now()}`, `${900000000 + Math.floor(Math.random() * 99999999)}`],
    );
    cleanupKommuneIds.push(kommune.id);
    const userId = `alarm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await pool.query(
      `INSERT INTO users (id, username, password, email, kommune_id, role) VALUES ($1, $2, 'x', $3, $4, 'kommune_saksbehandler')`,
      [userId, userId, `${userId}@example.com`, kommune.id],
    );
    cleanupUserIds.push(userId);
    await withSystemRlsContext("drift_alarm_test_seed", async (client) => {
      await client.query(
        `INSERT INTO tidum_sms_utboks (kommune_id, mottaker_telefon, melding, formaal, status, feil, opprettet_av)
         VALUES ($1, '+4799999999', 'test', 'varsling', 'feilet', 'gateway 500', $2)`,
        [kommune.id, userId],
      );
      await client.query(
        `INSERT INTO tidum_barnevernsregister_innsendinger (kommune_id, rapportdato, datasett, innholds_hash, status, valideringsfeil)
         VALUES ($1, CURRENT_DATE, '{}'::jsonb, 'hash', 'avvist', '["mangler fase"]'::jsonb)`,
        [kommune.id],
      );
    });
    return kommune.id;
  }

  it("registrerer terminale feil, logger uten mottaker, sender samle-epost og dedupliserer", async () => {
    const kommuneId = await seedFeil();
    const sendSpy = vi.spyOn(emailService, "sendEmail").mockResolvedValue(true);

    // Uten mottaker: alarmer registreres men ingen e-post.
    delete process.env.DRIFT_ALARM_EPOST;
    const forste = await sjekkDriftAlarmer();
    expect(forste.nye).toBe(2);
    expect(forste.varslede).toBe(0);
    expect(sendSpy).not.toHaveBeenCalled();

    // Med mottaker: etterslepet varsles i én e-post og merkes.
    process.env.DRIFT_ALARM_EPOST = "drift@example.com";
    const andre = await sjekkDriftAlarmer();
    expect(andre.nye).toBe(0);
    expect(andre.varslede).toBe(2);
    expect(sendSpy).toHaveBeenCalledTimes(1);
    const epost = sendSpy.mock.calls[0][0] as any;
    expect(epost.to).toBe("drift@example.com");
    expect(epost.html).toContain("SMS-utboks");
    expect(epost.html).toContain("Barnevernsregisteret");
    expect(epost.html).toContain("gateway 500");

    // Tredje kjøring: ingenting nytt, ingen ny e-post.
    const tredje = await sjekkDriftAlarmer();
    expect(tredje.nye).toBe(0);
    expect(tredje.varslede).toBe(0);
    expect(sendSpy).toHaveBeenCalledTimes(1);

    const { rows } = await pool.query(
      `SELECT varslet FROM tidum_drift_alarmer WHERE kommune_id = $1`, [kommuneId],
    );
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.varslet)).toBe(true);
  });

  it("lar alarmer stå uvarslet når e-postutsendelsen feiler", async () => {
    await seedFeil();
    process.env.DRIFT_ALARM_EPOST = "drift@example.com";
    const sendSpy = vi.spyOn(emailService, "sendEmail").mockResolvedValue(false);

    const res = await sjekkDriftAlarmer();
    expect(res.nye).toBe(2);
    expect(res.varslede).toBe(0);

    // Neste kjøring prøver samme alarmer på nytt.
    sendSpy.mockResolvedValue(true);
    const retry = await sjekkDriftAlarmer();
    expect(retry.varslede).toBe(2);
  });
});
