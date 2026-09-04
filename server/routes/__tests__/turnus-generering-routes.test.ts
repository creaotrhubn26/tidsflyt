import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import express from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../../db';
import { withSystemRlsContext } from '../../lib/database-rls-context';
import { registerTurnusGenereringRoutes } from '../turnus-generering-routes';

function appFor(userId: string) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as any).user = { id: userId }; next(); });
  registerTurnusGenereringRoutes(app);
  return app;
}

describe('turnus generering routes (CP-SAT integration)', () => {
  const nonce = randomUUID();
  const userId = `gen-${nonce}`;
  let orgId = 0;
  let planId = 0;

  beforeAll(async () => {
    for (const m of ['105_turnus_core.sql', '106_turnus_org_members.sql', '107_turnus_genereringer.sql']) {
      await pool.query(readFileSync(`migrations/${m}`, 'utf8'));
    }
    await withSystemRlsContext('test_gen', async (c) => {
      const { rows: [org] } = await c.query(
        `INSERT INTO tidum_turnus_organisasjoner (navn) VALUES ($1) RETURNING id`, [`Org ${nonce}`]);
      orgId = Number(org.id);
      await c.query(`INSERT INTO tidum_turnus_org_members (org_id, user_id, rolle) VALUES ($1,$2,'leder')`, [orgId, userId]);
      const { rows: [avd] } = await c.query(
        `INSERT INTO tidum_turnus_avdelinger (org_id, navn) VALUES ($1,$2) RETURNING id`, [orgId, 'Avd']);
      const avdId = Number(avd.id);
      // two employees
      await c.query(`INSERT INTO tidum_turnus_ansatte (org_id, primar_avdeling_id, navn, stillingsprosent) VALUES ($1,$2,'A',100),($1,$2,'B',100)`, [orgId, avdId]);
      // day vaktkode
      const { rows: [vk] } = await c.query(
        `INSERT INTO tidum_turnus_vaktkoder (org_id, kode, start_tid, slutt_tid, varighet_timer, teller_som_arbeid)
         VALUES ($1,'D','08:00','16:00',7.5,true) RETURNING id`, [orgId]);
      const vkId = Number(vk.id);
      // plan starting Monday 2026-01-05, 1-week rotation
      const { rows: [plan] } = await c.query(
        `INSERT INTO tidum_turnus_planer (org_id, avdeling_id, navn, rotasjon_uker, start_dato)
         VALUES ($1,$2,'P',1,'2026-01-05') RETURNING id`, [orgId, avdId]);
      planId = Number(plan.id);
      // need 2 on Monday (ukedag 1) — both employees fill it
      await c.query(
        `INSERT INTO tidum_turnus_bemanningsbehov (org_id, avdeling_id, ukedag, vaktkode_id, antall_krevd)
         VALUES ($1,$2,1,$3,2)`, [orgId, avdId, vkId]);
    });
  });

  it('generates a rota, persists the run + proposed shifts', async () => {
    const app = appFor(userId);
    const r = await request(app).post(`/api/turnus/planer/${planId}/generer`).send({});
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('fullfort');
    expect(r.body.vakterSkrevet).toBe(2); // 2 employees cover the Monday requirement
    // the run + shifts are persisted
    const check = await request(app).get(`/api/turnus/genereringer/${r.body.generId}`);
    expect(check.status).toBe(200);
    expect(check.body.generering.status).toBe('fullfort');
  }, 30_000);

  it('generer on a foreign/nonexistent plan → 404', async () => {
    const app = appFor(userId);
    const r = await request(app).post(`/api/turnus/planer/999999/generer`).send({});
    expect(r.status).toBe(404);
  });

  it('konsekvens preview flags a >13h shift as a hard AML violation', async () => {
    const app = appFor(userId);
    const r = await request(app).post('/api/turnus/konsekvens').send({
      endringer: [{ ansattId: 1, dato: '2026-01-05', startTid: '06:00', sluttTid: '20:00', pauseTimer: 0.5 }],
    });
    expect(r.status).toBe(200);
    expect(r.body.harHardeBrudd).toBe(true);
    expect(r.body.brudd.some((b: any) => b.code === 'max_daily_over_13h')).toBe(true);
  });

  it('konsekvens requires an endringer array', async () => {
    const app = appFor(userId);
    const r = await request(app).post('/api/turnus/konsekvens').send({});
    expect(r.status).toBe(400);
  });
});
