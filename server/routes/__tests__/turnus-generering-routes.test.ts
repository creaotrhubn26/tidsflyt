import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import express from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

// The two tests that actually run the CP-SAT sidecar need python3 + ortools.
// Where that isn't installed (e.g. the JS CI job), skip them — the solver itself
// is covered by turnus-solver/test_solver.py (pytest) where ortools is present.
// The pure-AML/konsekvens/404 tests below never touch the solver and always run.
let SOLVER_OK = true;
try {
  execFileSync(process.env.TURNUS_SOLVER_PYTHON ?? 'python3', ['-c', 'import ortools'], { stdio: 'ignore' });
} catch {
  SOLVER_OK = false;
  // eslint-disable-next-line no-console
  console.warn('[turnus-generering.test] ortools/python unavailable — skipping CP-SAT integration cases');
}
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

  it.skipIf(!SOLVER_OK)('generates a rota, persists the run + proposed shifts', async () => {
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

  it.skipIf(!SOLVER_OK)('forklaring returns structured XAI + narration for a run', async () => {
    const app = appFor(userId);
    const gen = await request(app).post(`/api/turnus/planer/${planId}/generer`).send({});
    const f = await request(app).get(`/api/turnus/genereringer/${gen.body.generId}/forklaring`);
    expect(f.status).toBe(200);
    expect(f.body.strukturert.status).toBe('fullfort');
    expect(Array.isArray(f.body.strukturert.prioriteringer)).toBe(true);
    // no OPENAI key in test → narration falls back to the deterministic summary
    expect(f.body.narrasjon).toBe(f.body.strukturert.sammendrag);
    expect(typeof f.body.narrasjon).toBe('string');
  }, 30_000);

  it('forklaring on a foreign generation → 404', async () => {
    const app = appFor(userId);
    const r = await request(app).get('/api/turnus/genereringer/999999/forklaring');
    expect(r.status).toBe(404);
  });

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

  it('konsekvens rejects a malformed element with 400 (no hang/crash)', async () => {
    const app = appFor(userId);
    const r = await request(app).post('/api/turnus/konsekvens').send({ endringer: [{}] });
    expect(r.status).toBe(400);
  });

  it.skipIf(!SOLVER_OK)('vakter lists a run\'s generated shifts with code + times + name (A5 grid)', async () => {
    const app = appFor(userId);
    const gen = await request(app).post(`/api/turnus/planer/${planId}/generer`).send({});
    const v = await request(app).get(`/api/turnus/genereringer/${gen.body.generId}/vakter`);
    expect(v.status).toBe(200);
    expect(v.body).toHaveLength(2);
    for (const row of v.body) {
      expect(row.kode).toBe('D');
      expect(row.startTid).toBe('08:00');
      expect(row.sluttTid).toBe('16:00');
      expect(['A', 'B']).toContain(row.ansattNavn);
    }
  }, 30_000);

  it('vakter on a foreign/nonexistent generation → 404', async () => {
    const app = appFor(userId);
    const r = await request(app).get('/api/turnus/genereringer/999999/vakter');
    expect(r.status).toBe(404);
  });

  it.skipIf(!SOLVER_OK)('PATCH vakter reassigns a shift to another employee (A5 save)', async () => {
    const app = appFor(userId);
    const gen = await request(app).post(`/api/turnus/planer/${planId}/generer`).send({});
    const list = await request(app).get(`/api/turnus/genereringer/${gen.body.generId}/vakter`);
    const v = list.body[0];
    const annen = list.body.find((x: any) => x.ansattId !== v.ansattId);
    const r = await request(app).patch(`/api/turnus/genereringer/${gen.body.generId}/vakter`)
      .send({ endringer: [{ vaktId: v.id, ansattId: annen.ansattId }] });
    expect(r.status).toBe(200);
    expect(r.body.oppdatert).toBe(1);
    const after = await request(app).get(`/api/turnus/genereringer/${gen.body.generId}/vakter`);
    expect(after.body.find((x: any) => x.id === v.id).ansattId).toBe(annen.ansattId);
  }, 30_000);

  it('PATCH vakter rejects a foreign ansattId with 400', async () => {
    const app = appFor(userId);
    const gen = await request(app).post(`/api/turnus/planer/${planId}/generer`).send({});
    // generering may be infeasible without solver; only assert the validation path
    const genId = gen.body.generId ?? 1;
    const r = await request(app).patch(`/api/turnus/genereringer/${genId}/vakter`)
      .send({ endringer: [{ vaktId: 1, ansattId: 999999 }] });
    expect([400, 404]).toContain(r.status);
  });

  it('PATCH vakter requires an endringer array', async () => {
    const app = appFor(userId);
    const r = await request(app).patch('/api/turnus/genereringer/1/vakter').send({ endringer: 'x' });
    expect(r.status).toBe(400);
  });

  it.skipIf(!SOLVER_OK)('kontekst returns per-day required coverage (dekning vs behov)', async () => {
    const app = appFor(userId);
    const gen = await request(app).post(`/api/turnus/planer/${planId}/generer`).send({});
    const k = await request(app).get(`/api/turnus/genereringer/${gen.body.generId}/kontekst`);
    expect(k.status).toBe(200);
    expect(Array.isArray(k.body.krav)).toBe(true);
    // seeded behov requires 2 on Monday 2026-01-05
    const man = k.body.krav.find((x: any) => x.dato === '2026-01-05');
    expect(man?.krevd).toBe(2);
    expect(Array.isArray(k.body.onsker)).toBe(true);
  }, 30_000);

  it('kontekst on a foreign/nonexistent generation → 404', async () => {
    const app = appFor(userId);
    const r = await request(app).get('/api/turnus/genereringer/999999/kontekst');
    expect(r.status).toBe(404);
  });

  it.skipIf(!SOLVER_OK)('pdf export returns an application/pdf document', async () => {
    const app = appFor(userId);
    const gen = await request(app).post(`/api/turnus/planer/${planId}/generer`).send({});
    const r = await request(app).get(`/api/turnus/genereringer/${gen.body.generId}/pdf`).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toContain('application/pdf');
    expect(r.body.slice(0, 5).toString()).toBe('%PDF-'); // valid PDF magic
  }, 30_000);

  it('pdf on a foreign/nonexistent generation → 404', async () => {
    const app = appFor(userId);
    const r = await request(app).get('/api/turnus/genereringer/999999/pdf');
    expect(r.status).toBe(404);
  });

  it.skipIf(!SOLVER_OK)('publiser marks shifts published + reports who lacks email (no SMTP sends)', async () => {
    const app = appFor(userId);
    const gen = await request(app).post(`/api/turnus/planer/${planId}/generer`).send({});
    const r = await request(app).post(`/api/turnus/genereringer/${gen.body.generId}/publiser`).send({});
    expect(r.status).toBe(200);
    expect(r.body.publisert).toBe(2);       // 2 shifts flipped to 'publisert'
    expect(r.body.mottakere).toBe(0);       // seeded A/B have no user_email
    expect(r.body.utenEpost).toBe(2);
    expect(r.body.varslet).toBe(0);
    expect(r.body.varsletApp).toBe(0);      // no matching platform accounts
  }, 30_000);

  it.skipIf(!SOLVER_OK)('publiser creates an in-app notification for an ansatt with a platform account', async () => {
    const app = appFor(userId);
    // give employee A a platform account by email, then publish
    const epost = `ans-${nonce}@example.test`;
    await withSystemRlsContext('test_gen', async (c) => {
      await c.query(`UPDATE tidum_turnus_ansatte SET user_email = $1 WHERE org_id = $2 AND navn = 'A'`, [epost, orgId]);
    });
    await pool.query(
      `INSERT INTO users (id, email, role) VALUES ($1, $2, 'user') ON CONFLICT (id) DO NOTHING`,
      [`u-${nonce}`, epost]);
    const gen = await request(app).post(`/api/turnus/planer/${planId}/generer`).send({});
    const r = await request(app).post(`/api/turnus/genereringer/${gen.body.generId}/publiser`)
      .send({ kanaler: ['app'] });
    expect(r.status).toBe(200);
    expect(r.body.varsletApp).toBe(1);
    const n = await pool.query(`SELECT 1 FROM notifications WHERE recipient_id = $1 AND type = 'turnus_publisert'`, [`u-${nonce}`]);
    expect(n.rowCount).toBe(1);
  }, 30_000);

  it('publiser on a foreign/nonexistent generation → 404', async () => {
    const app = appFor(userId);
    const r = await request(app).post('/api/turnus/genereringer/999999/publiser').send({});
    expect(r.status).toBe(404);
  });
});
