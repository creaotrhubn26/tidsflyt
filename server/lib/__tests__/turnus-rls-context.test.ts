import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { pool } from "../../db";
import { withTurnusOrgRlsContext, withSystemRlsContext } from "../database-rls-context";

describe("withTurnusOrgRlsContext", () => {
  const nonce = randomUUID();
  let orgA = 0;
  let orgB = 0;

  beforeAll(async () => {
    await pool.query(readFileSync("migrations/105_turnus_core.sql", "utf8"));
    await withSystemRlsContext("test_ctx_105", async (client) => {
      const { rows } = await client.query(
        `INSERT INTO tidum_turnus_organisasjoner (navn) VALUES ($1),($2) RETURNING id`,
        [`Ctx A ${nonce}`, `Ctx B ${nonce}`],
      );
      orgA = Number(rows[0].id);
      orgB = Number(rows[1].id);
    });
  });

  it("scopes reads to the given org", async () => {
    const visible = await withTurnusOrgRlsContext(orgA, async (client) => {
      const { rows } = await client.query(
        `SELECT id FROM tidum_turnus_organisasjoner WHERE id = ANY($1::int[])`,
        [[orgA, orgB]],
      );
      return rows.map((r) => Number(r.id));
    });
    expect(visible).toEqual([orgA]);
  });
});
