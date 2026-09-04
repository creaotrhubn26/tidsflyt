import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../../db";

describe("turnus child-table RLS (avdelinger)", () => {
  const nonce = randomUUID();
  let orgA = 0;
  let orgB = 0;
  let avdA = 0;

  async function sys(client: any) {
    await client.query(
      `SELECT set_config('tidum.rls_mode','system',true),
              set_config('tidum.rls_system_operation','test_schema_105',true)`,
    );
  }

  beforeAll(async () => {
    const migration = readFileSync("migrations/105_turnus_core.sql", "utf8");
    await pool.query(migration);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE pg_database_owner");
      await sys(client);
      const orgs = await client.query(
        `INSERT INTO tidum_turnus_organisasjoner (navn) VALUES ($1),($2) RETURNING id`,
        [`Org A ${nonce}`, `Org B ${nonce}`],
      );
      orgA = Number(orgs.rows[0].id);
      orgB = Number(orgs.rows[1].id);
      const avd = await client.query(
        `INSERT INTO tidum_turnus_avdelinger (org_id, navn) VALUES ($1,$2) RETURNING id`,
        [orgA, `Avd A ${nonce}`],
      );
      avdA = Number(avd.rows[0].id);
      await client.query("COMMIT");
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM tidum_turnus_avdelinger WHERE id = $1`, [avdA]);
    await pool.query(`DELETE FROM tidum_turnus_organisasjoner WHERE id = ANY($1::int[])`, [[orgA, orgB]]);
  });

  it("org B context cannot see org A's avdeling", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE pg_database_owner");
      await client.query(
        `SELECT set_config('tidum.rls_mode','turnus',true),
                set_config('tidum.turnus_org_id',$1,true)`,
        [String(orgB)],
      );
      const { rows } = await client.query(
        `SELECT id FROM tidum_turnus_avdelinger WHERE id = $1`,
        [avdA],
      );
      await client.query("COMMIT");
      expect(rows).toHaveLength(0);
    } finally {
      client.release();
    }
  });
});
