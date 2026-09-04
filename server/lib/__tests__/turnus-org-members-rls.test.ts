import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { pool } from "../../db";
import { withSystemRlsContext, withTurnusOrgRlsContext } from "../database-rls-context";

describe("turnus_org_members RLS 106", () => {
  const nonce = randomUUID();
  let orgA = 0, orgB = 0;
  beforeAll(async () => {
    await pool.query(readFileSync("migrations/105_turnus_core.sql", "utf8"));
    await pool.query(readFileSync("migrations/106_turnus_org_members.sql", "utf8"));
    await withSystemRlsContext("test_106", async (c) => {
      const o = await c.query(`INSERT INTO tidum_turnus_organisasjoner (navn) VALUES ($1),($2) RETURNING id`, [`A ${nonce}`, `B ${nonce}`]);
      orgA = Number(o.rows[0].id); orgB = Number(o.rows[1].id);
      await c.query(`INSERT INTO tidum_turnus_org_members (org_id, user_id, rolle) VALUES ($1,$2,'planlegger')`, [orgA, `u-${nonce}`]);
    });
  });
  it("org B context cannot see org A membership", async () => {
    const rows = await withTurnusOrgRlsContext(orgB, async (c) =>
      (await c.query(`SELECT id FROM tidum_turnus_org_members WHERE org_id = $1`, [orgA])).rows);
    expect(rows).toHaveLength(0);
  });
});
