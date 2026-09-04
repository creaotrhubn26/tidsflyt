import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { pool } from "../../db";
import { withSystemRlsContext } from "../../lib/database-rls-context";
import { requireTurnusActor } from "../turnus-actor";

describe("requireTurnusActor DB resolution", () => {
  const nonce = randomUUID();
  const userId = `actor-${nonce}`;
  let orgId = 0;
  beforeAll(async () => {
    await pool.query(readFileSync("migrations/105_turnus_core.sql", "utf8"));
    await pool.query(readFileSync("migrations/106_turnus_org_members.sql", "utf8"));
    await withSystemRlsContext("test_actor_106", async (c) => {
      const o = await c.query(`INSERT INTO tidum_turnus_organisasjoner (navn) VALUES ($1) RETURNING id`, [`Org ${nonce}`]);
      orgId = Number(o.rows[0].id);
      await c.query(`INSERT INTO tidum_turnus_org_members (org_id, user_id, rolle) VALUES ($1,$2,'leder')`, [orgId, userId]);
    });
  });
  it("returns null without an authenticated user", async () => {
    expect(await requireTurnusActor({} as any)).toBeNull();
  });
  it("returns null for a user with no org membership", async () => {
    expect(await requireTurnusActor({ user: { id: `nobody-${nonce}` } } as any)).toBeNull();
  });
  it("resolves org + rolle from membership", async () => {
    const actor = await requireTurnusActor({ user: { id: userId } } as any);
    expect(actor).toEqual({ userId, orgId, role: "leder" });
  });
});
