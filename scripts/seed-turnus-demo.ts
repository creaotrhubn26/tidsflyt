/**
 * scripts/seed-turnus-demo.ts
 *
 * Seeds a demo Tidum Turnus organisasjon so the /turnus UI has something to
 * show (and so `Generer` yields a rich result with XAI). Idempotent: wipes the
 * demo org first, then reseeds. Links the DEV_USER (id "1") as an org member so
 * the dev-auth bypass can drive the page locally.
 *
 * Bruk: DATABASE_URL=postgresql://localhost:5432/tidsflyt_test npx tsx scripts/seed-turnus-demo.ts
 */
import 'dotenv/config';
import { pool } from '../server/db';
import { withSystemRlsContext } from '../server/lib/database-rls-context';

const DEMO_NAVN = 'Demo kommune (turnus)';
const DEV_USER_ID = process.env.TURNUS_DEMO_USER_ID ?? '1';

async function main(): Promise<void> {
  await withSystemRlsContext('seed_turnus_demo', async (c) => {
    // Wipe any prior demo org (cascades clear child rows via app-level deletes).
    const { rows: [eks] } = await c.query(
      `SELECT id FROM tidum_turnus_organisasjoner WHERE navn = $1`, [DEMO_NAVN]);
    if (eks) {
      const org = eks.id;
      for (const t of [
        'tidum_turnus_genereringsavvik', 'tidum_turnus_genereringer',
        'tidum_turnus_kalendervakter', 'tidum_turnus_linje_vakter', 'tidum_turnus_vaktlinjer',
        'tidum_turnus_onsker', 'tidum_turnus_regler', 'tidum_turnus_prioriteringsprofil',
        'tidum_turnus_bemanningsbehov', 'tidum_turnus_planer',
        'tidum_turnus_ansatt_kompetanser', 'tidum_turnus_ansatte',
        'tidum_turnus_vaktkoder', 'tidum_turnus_kompetanser', 'tidum_turnus_avdelinger',
        'tidum_turnus_org_members',
      ]) {
        await c.query(`DELETE FROM ${t} WHERE org_id = $1`, [org]);
      }
      await c.query(`DELETE FROM tidum_turnus_organisasjoner WHERE id = $1`, [org]);
    }

    const { rows: [org] } = await c.query(
      `INSERT INTO tidum_turnus_organisasjoner (navn, orgnr) VALUES ($1, '999000111') RETURNING id`,
      [DEMO_NAVN]);
    const orgId = org.id as number;

    await c.query(
      `INSERT INTO tidum_turnus_org_members (org_id, user_id, rolle) VALUES ($1, $2, 'leder')`,
      [orgId, DEV_USER_ID]);

    const { rows: [avd] } = await c.query(
      `INSERT INTO tidum_turnus_avdelinger (org_id, navn) VALUES ($1, 'Sykehjem avd. A') RETURNING id`,
      [orgId]);
    const avdId = avd.id as number;

    const { rows: [komp] } = await c.query(
      `INSERT INTO tidum_turnus_kompetanser (org_id, navn) VALUES ($1, 'Sykepleier') RETURNING id`,
      [orgId]);
    const kompId = komp.id as number;

    // 6 employees, half with the competence.
    const ansIds: number[] = [];
    for (let i = 1; i <= 6; i++) {
      const { rows: [a] } = await c.query(
        `INSERT INTO tidum_turnus_ansatte (org_id, primar_avdeling_id, navn, stillingsprosent)
         VALUES ($1, $2, $3, 100) RETURNING id`,
        [orgId, avdId, `Ansatt ${i}`]);
      ansIds.push(a.id);
      if (i % 2 === 0) {
        await c.query(
          `INSERT INTO tidum_turnus_ansatt_kompetanser (org_id, ansatt_id, kompetanse_id) VALUES ($1,$2,$3)`,
          [orgId, a.id, kompId]);
      }
    }

    // Day/evening/night vaktkoder.
    const vk: Record<string, number> = {};
    for (const [kode, s, e] of [['D', '07:00', '15:00'], ['A', '15:00', '23:00'], ['N', '23:00', '07:00']] as const) {
      const { rows: [v] } = await c.query(
        `INSERT INTO tidum_turnus_vaktkoder (org_id, kode, start_tid, slutt_tid, varighet_timer, teller_som_arbeid)
         VALUES ($1,$2,$3,$4,7.5,true) RETURNING id`,
        [orgId, kode, s, e]);
      vk[kode] = v.id;
    }

    // Coverage: 2×day, 1×evening, 1×night on weekdays (ukedag 1–5).
    for (let dag = 1; dag <= 5; dag++) {
      await c.query(`INSERT INTO tidum_turnus_bemanningsbehov (org_id, avdeling_id, ukedag, vaktkode_id, antall_krevd) VALUES ($1,$2,$3,$4,2)`, [orgId, avdId, dag, vk.D]);
      await c.query(`INSERT INTO tidum_turnus_bemanningsbehov (org_id, avdeling_id, ukedag, vaktkode_id, antall_krevd) VALUES ($1,$2,$3,$4,1)`, [orgId, avdId, dag, vk.A]);
      await c.query(`INSERT INTO tidum_turnus_bemanningsbehov (org_id, avdeling_id, ukedag, vaktkode_id, antall_krevd) VALUES ($1,$2,$3,$4,1)`, [orgId, avdId, dag, vk.N]);
    }

    const { rows: [plan] } = await c.query(
      `INSERT INTO tidum_turnus_planer (org_id, avdeling_id, navn, rotasjon_uker, start_dato)
       VALUES ($1,$2,'Grunnturnus uke 2', 1, '2026-01-05') RETURNING id`,
      [orgId, avdId]);

    await c.query(
      `INSERT INTO tidum_turnus_prioriteringsprofil (org_id, plan_id, vekt_onsker, vekt_helgefrekvens, vekt_rettferdighet, vekt_kontinuitet, vekt_kostnad)
       VALUES ($1,$2,8,6,7,5,4)`,
      [orgId, plan.id]);

    await c.query(
      `INSERT INTO tidum_turnus_regler (org_id, regeltype, haard, kilde) VALUES ($1,'aml_daglig_hvile_11t',true,'lov'),($1,'helgefrekvens',false,'lokal_avtale')`,
      [orgId]);

    await c.query(
      `INSERT INTO tidum_turnus_onsker (org_id, ansatt_id, plan_id, type, dato, prioritet)
       VALUES ($1,$2,$3,'onske_fri','2026-01-07','bor')`,
      [orgId, ansIds[0], plan.id]);

    console.log(`Seedet turnus-demo: org ${orgId}, avdeling ${avdId}, 6 ansatte, 3 vaktkoder, plan ${plan.id}, medlem user_id=${DEV_USER_ID}.`);
  });
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
