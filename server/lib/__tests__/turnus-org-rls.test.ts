import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../../db";

async function setTurnusOrg(client: any, orgId: number | null) {
  await client.query(
    `SELECT set_config('tidum.rls_mode', $1, true),
            set_config('tidum.turnus_org_id', $2, true),
            set_config('tidum.rls_system_operation', '', true)`,
    [orgId == null ? "deny" : "turnus", orgId == null ? "" : String(orgId)],
  );
}

describe("turnus org RLS migration 105", () => {
  const nonce = randomUUID();
  let orgA = 0;
  let orgB = 0;

  beforeAll(async () => {
    const migration = readFileSync("migrations/105_turnus_core.sql", "utf8");
    await pool.query(migration);
    await pool.query(migration); // idempotent

    // Insert two orgs under system context.
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE pg_database_owner");
      await client.query(
        `SELECT set_config('tidum.rls_mode','system',true),
                set_config('tidum.rls_system_operation','test_105',true)`,
      );
      const { rows } = await client.query(
        `INSERT INTO tidum_turnus_organisasjoner (navn) VALUES ($1),($2) RETURNING id`,
        [`Org A ${nonce}`, `Org B ${nonce}`],
      );
      orgA = Number(rows[0].id);
      orgB = Number(rows[1].id);
      await client.query("COMMIT");
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await pool.query(
      `DELETE FROM tidum_turnus_organisasjoner WHERE id = ANY($1::int[])`,
      [[orgA, orgB]],
    );
  });

  it("org A context sees only org A", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE pg_database_owner");
      await setTurnusOrg(client, orgA);
      const { rows } = await client.query(
        `SELECT id FROM tidum_turnus_organisasjoner WHERE id = ANY($1::int[])`,
        [[orgA, orgB]],
      );
      await client.query("COMMIT");
      expect(rows.map((r) => Number(r.id))).toEqual([orgA]);
    } finally {
      client.release();
    }
  });

  it("deny context sees nothing", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE pg_database_owner");
      await setTurnusOrg(client, null);
      const { rows } = await client.query(
        `SELECT id FROM tidum_turnus_organisasjoner WHERE id = ANY($1::int[])`,
        [[orgA, orgB]],
      );
      await client.query("COMMIT");
      expect(rows).toHaveLength(0);
    } finally {
      client.release();
    }
  });
});
