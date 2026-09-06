/**
 * server/seed/turnus-demo.ts
 *
 * Deterministic demo dataset for Tidum Turnus — the fixture the demo capture
 * (docs/anbud/2026-113925-demo-manus.md) records against.
 *
 * Why this exists: a demo video that records against live data changes every
 * time it is shot, and risks putting real employee names on screen. Everything
 * here is invented, fixed, and idempotent, so the same run produces the same
 * grid on every machine — the only thing that legitimately varies between takes
 * is the solver's measured time, which is the point of the K-08 beat.
 *
 * NOT wired into startup. Demo data must never appear in a customer database,
 * so this is invoked explicitly (npm run seed:turnus-demo) against a local or
 * staging database.
 *
 * The people are fictional. Names are ordinary Norwegian first/last
 * combinations chosen to read naturally on screen; any resemblance to a real
 * employee is coincidental and unintended.
 */

import type { PoolClient } from "pg";
import { pool } from "../db";
import { setLocalSystemRlsContext } from "../lib/database-rls-context";

const ORG_NAVN = "Solvang bo- og omsorgssenter";
const AVDELING_NAVN = "Avdeling Nord";
const PLAN_NAVN = "Grunnturnus vår 2026";

/** Fixed so the calendar in the recording never shifts. Monday, ISO week 10. */
const PLAN_START = "2026-03-02";
const ROTASJON_UKER = 6;
const ANTALL_LINJER = 25; // K-08 measures generation of ~25 lines.

// pause: minutes. AML §10-9 requires a break above 5.5 hours, and all three
// codes are longer — without a value here every shift in the recording carries
// a §10-9 warning, which is how the first complete capture came out.
const VAKTKODER = [
  { kode: "D", navn: "Dag", start: "07:00", slutt: "15:00", timer: 8.0, type: "dag", farge: "#0369a1", pause: 30 },
  { kode: "A", navn: "Aften", start: "14:30", slutt: "22:30", timer: 8.0, type: "aften", farge: "#7c3aed", pause: 30 },
  { kode: "N", navn: "Natt", start: "22:00", slutt: "07:15", timer: 9.25, type: "natt", farge: "#1e293b", pause: 45 },
] as const;

const KOMPETANSER = ["Sykepleier", "Helsefagarbeider", "Assistent"] as const;

/**
 * 28 employees for 25 lines — a little slack, because a pool with no slack
 * makes every generation infeasible and demos nothing. Competence mix mirrors a
 * real ward: a sykepleier core, a helsefagarbeider majority, a few assistants.
 */
const ANSATT_RAD: Array<[string, number, (typeof KOMPETANSER)[number]]> = [
  ["Ingrid Halvorsen", 100, "Sykepleier"],
  ["Marte Sunde", 100, "Sykepleier"],
  ["Kristoffer Aune", 100, "Sykepleier"],
  ["Nina Bergli", 80, "Sykepleier"],
  ["Håkon Rydland", 100, "Sykepleier"],
  ["Silje Tangen", 75, "Sykepleier"],
  ["Anders Kvam", 100, "Sykepleier"],
  ["Live Osland", 60, "Sykepleier"],
  ["Bjørn Iversen", 100, "Helsefagarbeider"],
  ["Kari Mo", 100, "Helsefagarbeider"],
  ["Tone Ellefsen", 80, "Helsefagarbeider"],
  ["Ole Fjeld", 100, "Helsefagarbeider"],
  ["Hanne Vik", 100, "Helsefagarbeider"],
  ["Jonas Brekke", 90, "Helsefagarbeider"],
  ["Mari Lunde", 100, "Helsefagarbeider"],
  ["Sindre Nesheim", 100, "Helsefagarbeider"],
  ["Elin Grøtte", 70, "Helsefagarbeider"],
  ["Trond Bakken", 100, "Helsefagarbeider"],
  ["Åse Vollan", 80, "Helsefagarbeider"],
  ["Petter Sandvik", 100, "Helsefagarbeider"],
  ["Guro Hjelle", 100, "Helsefagarbeider"],
  ["Even Trandum", 60, "Helsefagarbeider"],
  ["Rita Lien", 100, "Helsefagarbeider"],
  ["Simen Dahle", 100, "Assistent"],
  ["Frida Norheim", 50, "Assistent"],
  ["Lars Ødegård", 100, "Assistent"],
  ["Camilla Stene", 80, "Assistent"],
  ["Nikolai Ruud", 100, "Assistent"],
];

/**
 * Staffing demand per weekday. Weekends run leaner, which is what makes the
 * weekend-fairness objective visible in the generated result.
 * [ukedag 1-7] → { D, A, N }
 */
const BEHOV: Record<number, { D: number; A: number; N: number }> = {
  1: { D: 5, A: 4, N: 2 },
  2: { D: 5, A: 4, N: 2 },
  3: { D: 5, A: 4, N: 2 },
  4: { D: 5, A: 4, N: 2 },
  5: { D: 5, A: 4, N: 2 },
  6: { D: 4, A: 3, N: 2 },
  7: { D: 4, A: 3, N: 2 },
};

async function seedInTransaction(client: PoolClient): Promise<{ orgId: number; planId: number; userId: string }> {
  // The organisasjoner INSERT policy checks the row's own id, which does not
  // exist yet — so org creation cannot run under turnus context. System context
  // with a named operation is the documented path for exactly this.
  await setLocalSystemRlsContext(client, "seed_turnus_demo");

  // Look first, then insert. ON CONFLICT DO NOTHING is useless here: there is no
  // unique constraint on navn, so the conflict never fires and every run would
  // create another organisation. Verified by running the seed three times.
  const orgId = await upsert(
    client,
    `INSERT INTO tidum_turnus_organisasjoner (navn, orgnr) VALUES ($1, $2) RETURNING id`,
    `SELECT id FROM tidum_turnus_organisasjoner WHERE navn = $1 ORDER BY id LIMIT 1`,
    [ORG_NAVN, "999888777"],
    [ORG_NAVN],
  );

  const avdeling = await upsert(
    client,
    `INSERT INTO tidum_turnus_avdelinger (org_id, navn) VALUES ($1, $2) RETURNING id`,
    `SELECT id FROM tidum_turnus_avdelinger WHERE org_id = $1 AND navn = $2`,
    [orgId, AVDELING_NAVN],
  );

  // Shift codes.
  const vaktkodeId: Record<string, number> = {};
  for (const v of VAKTKODER) {
    vaktkodeId[v.kode] = await upsert(
      client,
      `INSERT INTO tidum_turnus_vaktkoder
         (org_id, kode, navn, start_tid, slutt_tid, varighet_timer, type, farge, pause_min)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      `SELECT id FROM tidum_turnus_vaktkoder WHERE org_id = $1 AND kode = $2`,
      [orgId, v.kode, v.navn, v.start, v.slutt, v.timer, v.type, v.farge, v.pause],
      [orgId, v.kode],
    );
    // upsert() skips rows that already exist, so a changed value in this file
    // would otherwise never reach a database that has been seeded before. The
    // fixture is the authority for its own shift codes, so keep them in step.
    await client.query(
      `UPDATE tidum_turnus_vaktkoder
          SET pause_min = $3, varighet_timer = $4, start_tid = $5, slutt_tid = $6
        WHERE org_id = $1 AND id = $2`,
      [orgId, vaktkodeId[v.kode], v.pause, v.timer, v.start, v.slutt],
    );
  }

  // Competences.
  const kompetanseId: Record<string, number> = {};
  for (const k of KOMPETANSER) {
    kompetanseId[k] = await upsert(
      client,
      `INSERT INTO tidum_turnus_kompetanser (org_id, navn) VALUES ($1,$2) RETURNING id`,
      `SELECT id FROM tidum_turnus_kompetanser WHERE org_id = $1 AND navn = $2`,
      [orgId, k],
    );
  }

  // Employees + their competence.
  const ansattId: Record<string, number> = {};
  for (const [navn, prosent, kompetanse] of ANSATT_RAD) {
    const id = await upsert(
      client,
      `INSERT INTO tidum_turnus_ansatte (org_id, primar_avdeling_id, navn, stillingsprosent)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      `SELECT id FROM tidum_turnus_ansatte WHERE org_id = $1 AND navn = $2`,
      [orgId, avdeling, navn, prosent],
      [orgId, navn],
    );
    ansattId[navn] = id;
    await client.query(
      `INSERT INTO tidum_turnus_ansatt_kompetanser (org_id, ansatt_id, kompetanse_id)
       VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [orgId, id, kompetanseId[kompetanse]],
    );
  }

  // Staffing demand. At least one sykepleier is required on every shift — the
  // constraint that makes the competence dimension real rather than decorative.
  await client.query(`DELETE FROM tidum_turnus_bemanningsbehov WHERE org_id = $1 AND avdeling_id = $2`, [orgId, avdeling]);
  for (const [ukedagStr, krav] of Object.entries(BEHOV)) {
    const ukedag = Number(ukedagStr);
    for (const kode of ["D", "A", "N"] as const) {
      await client.query(
        `INSERT INTO tidum_turnus_bemanningsbehov (org_id, avdeling_id, ukedag, vaktkode_id, antall_krevd)
         VALUES ($1,$2,$3,$4,$5)`,
        [orgId, avdeling, ukedag, vaktkodeId[kode], krav[kode]],
      );
      await client.query(
        `INSERT INTO tidum_turnus_bemanningsbehov
           (org_id, avdeling_id, ukedag, vaktkode_id, antall_krevd, kompetanse_krav_id)
         VALUES ($1,$2,$3,$4,1,$5)`,
        [orgId, avdeling, ukedag, vaktkodeId[kode], kompetanseId["Sykepleier"]],
      );
    }
  }

  // Rules. Two statutory hard limits, one local agreement, and one personal
  // dispensasjon — the last is what makes the K-02/K-03 beat concrete: a rule
  // that applies to exactly one named person and must not leak to the rest.
  await client.query(`DELETE FROM tidum_turnus_regler WHERE org_id = $1`, [orgId]);
  const regler: Array<[string, object, boolean, number, string, number | null]> = [
    ["aml_daglig_hvile_11t", { timer: 11 }, true, 0, "lov", null],
    ["aml_max_uketimer", { timer: 48 }, true, 0, "lov", null],
    ["max_netter_paa_rad", { antall: 3 }, true, 0, "lokal_avtale", null],
    ["max_vakter_paa_rad", { antall: 5 }, false, 4, "lokal_avtale", null],
    // Dispensasjon: shorter daily rest for one employee who asked for it.
    ["aml_daglig_hvile_11t", { timer: 9 }, true, 0, "dispensasjon", ansattId["Live Osland"]],
  ];
  for (const [regeltype, parametre, haard, vekt, kilde, ansatt] of regler) {
    await client.query(
      `INSERT INTO tidum_turnus_regler (org_id, avdeling_id, ansatt_id, regeltype, parametre, haard, vekt, kilde, aktiv)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::tidum_turnus_regel_kilde, TRUE)`,
      [orgId, ansatt ? null : avdeling, ansatt, regeltype, JSON.stringify(parametre), haard, vekt, kilde],
    );
  }

  // Plan + 25 lines.
  const planId = await upsert(
    client,
    `INSERT INTO tidum_turnus_planer (org_id, avdeling_id, navn, rotasjon_uker, start_dato, status)
     VALUES ($1,$2,$3,$4,$5,'utkast') RETURNING id`,
    `SELECT id FROM tidum_turnus_planer WHERE org_id = $1 AND navn = $2`,
    [orgId, avdeling, PLAN_NAVN, ROTASJON_UKER, PLAN_START],
    [orgId, PLAN_NAVN],
  );

  const eksisterende = await client.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM tidum_turnus_vaktlinjer WHERE org_id = $1 AND plan_id = $2`,
    [orgId, planId],
  );
  if (Number(eksisterende.rows[0].n) === 0) {
    for (let i = 1; i <= ANTALL_LINJER; i++) {
      await client.query(
        `INSERT INTO tidum_turnus_vaktlinjer (org_id, plan_id, linjenr, stillingsprosent, tildelt_ansatt_id)
         VALUES ($1,$2,$3,$4,$5)`,
        [orgId, planId, i, ANSATT_RAD[i - 1][1], ansattId[ANSATT_RAD[i - 1][0]]],
      );
    }
  }

  // Wishes.
  //
  // Only `onske_fri` and `onske_vakt` exist: those are the two options the UI
  // offers (turnus.tsx) and the only two the solver scores (solver.py). An
  // earlier version of this seed invented fri_dato/fri_ukedag/onsker_vaktkode,
  // which the solver silently ignored — the run then reported zero unmet goals
  // not because every wish was honoured but because none were ever considered.
  //
  // The contention is deliberate and calibrated. Saturday 21 March needs 12
  // people (D 4+1 sykepleier, A 3+1, N 2+1) and 18 of the 28 employees ask for
  // it off, leaving 10 available — so at least two wishes must break, and the
  // XAI panel has something real to explain. Four sykepleiere stay available
  // for the three competence slots, which keeps the model feasible.
  const HELGEFRI = "2026-03-21";
  const helgesokere = [
    "Marte Sunde", "Nina Bergli", "Silje Tangen", "Live Osland",
    "Bjørn Iversen", "Kari Mo", "Tone Ellefsen", "Ole Fjeld", "Hanne Vik",
    "Jonas Brekke", "Mari Lunde", "Sindre Nesheim", "Elin Grøtte",
    "Trond Bakken", "Åse Vollan",
    "Simen Dahle", "Frida Norheim", "Lars Ødegård",
  ];

  await client.query(`DELETE FROM tidum_turnus_onsker WHERE org_id = $1`, [orgId]);
  const onsker: Array<[string, string, string, string | null, string, string]> = [
    // Marte's wedding — the one the narration names.
    ["Marte Sunde", "onske_fri", "2026-03-14", null, "maa", "Bryllup i familien"],
    ["Marte Sunde", "onske_fri", "2026-03-15", null, "maa", "Bryllup i familien"],
    // Bjørn prefers nights, and asks for specific ones.
    ["Bjørn Iversen", "onske_vakt", "2026-03-09", "N", "bor", "Foretrekker nattevakt"],
    ["Bjørn Iversen", "onske_vakt", "2026-03-10", "N", "bor", "Foretrekker nattevakt"],
    // Elin's standing Wednesday commitment, as concrete dates.
    ["Elin Grøtte", "onske_fri", "2026-03-04", null, "bor", "Fast avtale på onsdager"],
    ["Elin Grøtte", "onske_fri", "2026-03-11", null, "bor", "Fast avtale på onsdager"],
    ...helgesokere.map(
      (navn): [string, string, string, string | null, string, string] =>
        [navn, "onske_fri", HELGEFRI, null, "bor", "Ønsker fri denne helgen"],
    ),
  ];
  for (const [navn, type, dato, kode, prioritet, begrunnelse] of onsker) {
    await client.query(
      `INSERT INTO tidum_turnus_onsker
         (org_id, ansatt_id, plan_id, type, dato, vaktkode_id, prioritet, begrunnelse, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7::tidum_turnus_onske_prioritet,$8,'registrert')`,
      [orgId, ansattId[navn], planId, type, dato, kode ? vaktkodeId[kode] : null, prioritet, begrunnelse],
    );
  }

  // Priority weights. Deliberately not all equal: the XAI beat needs a visible
  // ranking to explain, and a flat profile explains nothing.
  await client.query(`DELETE FROM tidum_turnus_prioriteringsprofil WHERE org_id = $1 AND plan_id = $2`, [orgId, planId]);
  await client.query(
    `INSERT INTO tidum_turnus_prioriteringsprofil
       (org_id, plan_id, vekt_onsker, vekt_helgefrekvens, vekt_rettferdighet, vekt_kontinuitet, vekt_kostnad)
     VALUES ($1,$2,8,7,6,4,3)`,
    [orgId, planId],
  );

  // Membership. Without a row here requireTurnusActor() returns null for every
  // caller, so the whole fixture would be invisible in the UI — seedable but
  // impossible to open, which is useless for a demo recording.
  //
  // TURNUS_DEMO_USER names an existing users.id to link. Falls back to a demo
  // user this seed owns, so a fresh database works with no extra setup. For a
  // recording driven through ALLOW_DEV_AUTH_BYPASS, pass TURNUS_DEMO_USER=1 —
  // the bypass authenticates as user id '1'.
  //
  // Gotcha worth knowing before recording day: requireTurnusActor() resolves the
  // OLDEST membership (ORDER BY created_at ASC LIMIT 1). On a database that
  // already holds turnus test data, the linked user is probably a member of some
  // earlier org, and that one wins — the demo org stays invisible even though
  // this row exists. Seed against a clean database, or delete the older
  // membership first.
  const demoUserId = process.env.TURNUS_DEMO_USER?.trim() || "turnus-demo-planlegger";
  if (!process.env.TURNUS_DEMO_USER) {
    await client.query(
      `INSERT INTO users (id, email, first_name, last_name, language)
       VALUES ($1, $2, 'Demo', 'Planlegger', 'no')
       ON CONFLICT (id) DO NOTHING`,
      [demoUserId, "demo.planlegger@solvang.example"],
    );
  }
  const { rows: medlem } = await client.query(
    `SELECT id FROM tidum_turnus_org_members WHERE org_id = $1 AND user_id = $2`,
    [orgId, demoUserId],
  );
  if (!medlem[0]) {
    await client.query(
      `INSERT INTO tidum_turnus_org_members (org_id, user_id, rolle)
       VALUES ($1, $2, 'planlegger')`,
      [orgId, demoUserId],
    );
  }

  // Notification defaults, so the publish/notify beat has something to show.
  await client.query(
    `INSERT INTO tidum_turnus_varsel_innstillinger (org_id, paaminnelse_min, epost, app, sms, aktiv)
     VALUES ($1, 60, true, true, false, true)
     ON CONFLICT (org_id) DO NOTHING`,
    [orgId],
  );

  return { orgId, planId, userId: demoUserId };
}

/**
 * Insert-then-select helper. The turnus tables have no natural unique
 * constraints to hang ON CONFLICT on, so idempotency is "look first, insert if
 * absent" — correct here because the seed runs single-threaded against a demo
 * database, not concurrently against production.
 */
async function upsert(
  client: PoolClient,
  insertSql: string,
  selectSql: string,
  insertParams: unknown[],
  selectParams?: unknown[],
): Promise<number> {
  const found = await client.query<{ id: number }>(selectSql, selectParams ?? insertParams.slice(0, 2));
  if (found.rows[0]) return found.rows[0].id;
  const created = await client.query<{ id: number }>(insertSql, insertParams);
  return created.rows[0].id;
}

export async function seedTurnusDemo(): Promise<{ orgId: number; planId: number; userId: string }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await seedInTransaction(client);
    await client.query("COMMIT");
    console.log(
      `[seed:turnus-demo] «${ORG_NAVN}» klar — org_id=${result.orgId}, plan_id=${result.planId}, ` +
        `${ANSATT_RAD.length} ansatte, ${ANTALL_LINJER} vaktlinjer, start ${PLAN_START}, ` +
        `planlegger=${result.userId}`,
    );
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// Allow `tsx server/seed/turnus-demo.ts` directly.
if (process.argv[1] && process.argv[1].endsWith("turnus-demo.ts")) {
  seedTurnusDemo()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[seed:turnus-demo] feilet:", err);
      process.exit(1);
    });
}
