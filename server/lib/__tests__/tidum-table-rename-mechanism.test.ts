import { describe, it, expect, afterEach } from "vitest";
import { pool } from "../../db";

describe("tidum table rename mechanism (migrations/057's DO-block pattern)", () => {
  afterEach(async () => {
    await pool.query(`DROP TABLE IF EXISTS test_rename_mechanism_old`);
    await pool.query(`DROP TABLE IF EXISTS test_rename_mechanism_tidum_old`);
  });

  async function runRenameBlock() {
    await pool.query(`
      DO $$ BEGIN
        ALTER TABLE IF EXISTS test_rename_mechanism_old RENAME TO test_rename_mechanism_tidum_old;
      EXCEPTION WHEN duplicate_table THEN NULL; END $$;
    `);
  }

  it("renames a fresh table", async () => {
    await pool.query(`CREATE TABLE test_rename_mechanism_old (id SERIAL PRIMARY KEY, val TEXT)`);
    await pool.query(`INSERT INTO test_rename_mechanism_old (val) VALUES ('hello')`);

    await runRenameBlock();

    const { rows: oldRows } = await pool.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = 'test_rename_mechanism_old'`,
    );
    expect(oldRows.length).toBe(0);
    const { rows: newRows } = await pool.query(
      `SELECT val FROM test_rename_mechanism_tidum_old`,
    );
    expect(newRows.length).toBe(1);
    expect(newRows[0].val).toBe("hello");
  });

  it("is idempotent — running the block twice does not error, even after the table is already renamed", async () => {
    await pool.query(`CREATE TABLE test_rename_mechanism_old (id SERIAL PRIMARY KEY)`);
    await runRenameBlock();
    await runRenameBlock();
    // Second run: old table doesn't exist (IF EXISTS no-ops), new table
    // already exists — must not throw.
  });

  it("no-ops safely when the old table never existed at all", async () => {
    await runRenameBlock();
    const { rows } = await pool.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = 'test_rename_mechanism_tidum_old'`,
    );
    expect(rows.length).toBe(0);
  });
});
