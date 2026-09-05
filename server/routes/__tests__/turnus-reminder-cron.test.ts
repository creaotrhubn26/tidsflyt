import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../../db';
import { withSystemRlsContext } from '../../lib/database-rls-context';
import { runTurnusReminders } from '../turnus-reminder-cron';

describe('turnus shift reminders (cron)', () => {
  const nonce = randomUUID();
  const epost = `rem-${nonce}@example.test`;
  let orgId = 0;

  beforeAll(async () => {
    for (const m of ['105_turnus_core.sql', '106_turnus_org_members.sql', '107_turnus_genereringer.sql',
                     '108_turnus_ansatt_telefon.sql', '109_turnus_paaminnelser.sql']) {
      await pool.query(readFileSync(`migrations/${m}`, 'utf8'));
    }
    await pool.query(`INSERT INTO users (id, email, role) VALUES ($1,$2,'user') ON CONFLICT (id) DO NOTHING`, [`u-${nonce}`, epost]);
    await withSystemRlsContext('test_rem', async (c) => {
      const { rows: [org] } = await c.query(`INSERT INTO tidum_turnus_organisasjoner (navn) VALUES ($1) RETURNING id`, [`Org ${nonce}`]);
      orgId = Number(org.id);
      const { rows: [avd] } = await c.query(`INSERT INTO tidum_turnus_avdelinger (org_id, navn) VALUES ($1,'Avd') RETURNING id`, [orgId]);
      const { rows: [a] } = await c.query(
        `INSERT INTO tidum_turnus_ansatte (org_id, primar_avdeling_id, navn, user_email) VALUES ($1,$2,'A',$3) RETURNING id`,
        [orgId, avd.id, epost]);
      const { rows: [vk] } = await c.query(
        `INSERT INTO tidum_turnus_vaktkoder (org_id, kode, start_tid, slutt_tid) VALUES ($1,'D','08:00','16:00') RETURNING id`, [orgId]);
      // a published shift on 2026-03-02 starting 08:00
      await c.query(
        `INSERT INTO tidum_turnus_kalendervakter (org_id, avdeling_id, dato, vaktkode_id, ansatt_id, status)
         VALUES ($1,$2,'2026-03-02',$3,$4,'publisert')`, [orgId, avd.id, vk.id, a.id]);
      // reminder settings: 60 min before, app channel on
      await c.query(
        `INSERT INTO tidum_turnus_varsel_innstillinger (org_id, paaminnelse_min, epost, app, sms, aktiv)
         VALUES ($1, 60, false, true, false, true)`, [orgId]);
    });
  });

  it('reminds a due shift once (app notification + paaminnet_at), never twice', async () => {
    // 07:30 local — the 08:00 shift is within the 60-min window
    const first = await runTurnusReminders('2026-03-02 07:30:00');
    expect(first.kandidater).toBe(1);
    expect(first.sendt).toBe(1);

    const n = await pool.query(`SELECT 1 FROM notifications WHERE recipient_id = $1 AND type = 'turnus_paaminnelse'`, [`u-${nonce}`]);
    expect(n.rowCount).toBe(1);

    // second run at the same time → already claimed, nothing due
    const second = await runTurnusReminders('2026-03-02 07:30:00');
    expect(second.kandidater).toBe(0);
  });

  it('does not remind a shift outside the lead window', async () => {
    // 06:00 local — 08:00 shift is >60 min away; and it was already reminded above
    const r = await runTurnusReminders('2026-03-02 06:00:00');
    expect(r.kandidater).toBe(0);
  });
});
