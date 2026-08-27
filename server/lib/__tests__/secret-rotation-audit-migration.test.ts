import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { pool } from "../../db";

describe("secret rotation audit migration 082", () => {
  beforeAll(async () => {
    const sql = readFileSync("migrations/082_secret_rotation_run_audit.sql", "utf8");
    await pool.query(sql);
    await pool.query(sql);
  }, 60_000);

  it("creates validated checks and an immutable trigger", async () => {
    const constraints = await pool.query(
      `SELECT conname, convalidated
         FROM pg_constraint
        WHERE conrelid = 'tidum_secret_rotation_runs'::regclass
        ORDER BY conname`,
    );
    expect(constraints.rows).toEqual(expect.arrayContaining([
      { conname: "tidum_secret_rotation_runs_active_key_check", convalidated: true },
      { conname: "tidum_secret_rotation_runs_counts_check", convalidated: true },
      { conname: "tidum_secret_rotation_runs_manual_actor_check", convalidated: true },
      { conname: "tidum_secret_rotation_runs_source_check", convalidated: true },
      { conname: "tidum_secret_rotation_runs_status_check", convalidated: true },
    ]));
    const trigger = await pool.query(
      `SELECT tgenabled
         FROM pg_trigger
        WHERE tgrelid = 'tidum_secret_rotation_runs'::regclass
          AND tgname = 'tidum_secret_rotation_runs_immutable_trigger'`,
    );
    expect(trigger.rows).toEqual([{ tgenabled: "O" }]);
  });

  it("accepts only aggregate evidence and rejects later mutation without leaving a fixture", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const inserted = await client.query(
        `INSERT INTO tidum_secret_rotation_runs
           (rotation_source, initiated_by, active_key_id, status, rotated_counts, remaining_counts)
         VALUES ('manual', 'test-secret-operator', 'test-v1', 'completed',
                 '{"archiveConfigs":1}'::jsonb, '{"archiveConfigs":0}'::jsonb)
         RETURNING id, rotated_counts, remaining_counts`,
      );
      expect(inserted.rows[0]).toEqual(expect.objectContaining({
        rotated_counts: { archiveConfigs: 1 },
        remaining_counts: { archiveConfigs: 0 },
      }));
      await expect(client.query(
        "UPDATE tidum_secret_rotation_runs SET status = 'failed' WHERE id = $1",
        [inserted.rows[0].id],
      )).rejects.toThrow(/append-only/);
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
  });

  it("requires an identified actor for manual runs", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await expect(client.query(
        `INSERT INTO tidum_secret_rotation_runs
           (rotation_source, initiated_by, active_key_id, status)
         VALUES ('manual', NULL, 'test-v1', 'completed')`,
      )).rejects.toThrow(/manual_actor_check/);
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
  });
});
