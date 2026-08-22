import { describe, it, expect, afterEach } from "vitest";
import { pool } from "../../db";
import { readFileSync } from "fs";
import { join } from "path";

describe("tidum_admin_users/users role_id unification (migration 055)", () => {
  // Pattern-based cleanup, not id-array-based: an id array is skipped
  // whenever a preceding assertion (or a destructure like `pairedUser.id`
  // on a query result that came back empty — exactly the regression this
  // suite exists to catch) throws before the push runs, leaking the row
  // into the real shared production `users`/`tidum_admin_users` tables. Deleting
  // by the test_unif_ username prefix is immune to that whole bug class.
  afterEach(async () => {
    await pool.query(`DELETE FROM tidum_admin_users WHERE username LIKE 'test_unif_%'`);
    await pool.query(`DELETE FROM users WHERE username LIKE 'test_unif_%'`);
  });

  async function runMigration() {
    const sql = readFileSync(
      join(process.cwd(), "migrations", "055_admin_users_role_id_unification.sql"),
      "utf8",
    );
    await pool.query(sql);
  }

  it("creates a paired users row for an tidum_admin_users row with no matching email, with role_id set", async () => {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const {
      rows: [adminUser],
    } = await pool.query(
      `INSERT INTO tidum_admin_users (username, email, password_hash, role, vendor_id)
       VALUES ($1, $2, 'x', 'super_admin', NULL) RETURNING id, email`,
      [`test_unif_admin_${suffix}`, `test-unif-${suffix}@example.com`],
    );

    await runMigration();

    const {
      rows: [pairedUser],
    } = await pool.query(
      `SELECT u.id, u.role_id, r.name as role_name
       FROM users u JOIN tidum_roles r ON r.id = u.role_id
       WHERE u.email = $1`,
      [adminUser.email],
    );
    expect(pairedUser).toBeDefined();
    expect(pairedUser.role_name).toBe("super_admin");
  });

  it("does NOT backfill role_id on an existing paired users row that has it set to NULL, and does not duplicate the row", async () => {
    // This migration used to also backfill role_id on already-paired rows
    // whenever it was NULL — removed in fase 1.5's final review: role_id
    // becomes NULL both for "never assigned" AND for a deliberate
    // unassignment via PATCH /api/admin/users/:id/role, and the migration
    // (which reruns on every server startup) couldn't tell those apart,
    // silently re-granting a role an admin had just intentionally removed.
    // The only remaining job for a paired-but-NULL row is: don't touch it,
    // and don't create a duplicate users row for the same email.
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const email = `test-unif-paired-${suffix}@example.com`;
    await pool.query(
      `INSERT INTO tidum_admin_users (username, email, password_hash, role, vendor_id)
       VALUES ($1, $2, 'x', 'vendor_admin', NULL) RETURNING id`,
      [`test_unif_paired_admin_${suffix}`, email],
    );
    const {
      rows: [existingUser],
    } = await pool.query(
      `INSERT INTO users (username, password, email, role, role_id)
       VALUES ($1, 'x', $2, 'vendor_admin', NULL) RETURNING id`,
      [`test_unif_paired_user_${suffix}`, email],
    );

    await runMigration();

    const { rows } = await pool.query(
      `SELECT id, role_id FROM users WHERE email = $1`,
      [email],
    );
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe(existingUser.id);
    expect(rows[0].role_id).toBeNull();
  });

  it("is idempotent — running twice produces no duplicates or errors", async () => {
    await runMigration();
    await runMigration();
  });
});
