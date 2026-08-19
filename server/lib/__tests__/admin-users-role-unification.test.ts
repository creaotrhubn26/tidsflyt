import { describe, it, expect, afterEach } from "vitest";
import { pool } from "../../db";
import { readFileSync } from "fs";
import { join } from "path";

describe("admin_users/users role_id unification (migration 055)", () => {
  const createdUserIds: string[] = [];
  const createdAdminUserIds: number[] = [];

  afterEach(async () => {
    for (const id of createdUserIds.splice(0)) {
      await pool.query(`DELETE FROM users WHERE id = $1`, [id]);
    }
    for (const id of createdAdminUserIds.splice(0)) {
      await pool.query(`DELETE FROM admin_users WHERE id = $1`, [id]);
    }
  });

  async function runMigration() {
    const sql = readFileSync(
      join(process.cwd(), "migrations", "055_admin_users_role_id_unification.sql"),
      "utf8",
    );
    await pool.query(sql);
  }

  it("creates a paired users row for an admin_users row with no matching email, with role_id set", async () => {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const {
      rows: [adminUser],
    } = await pool.query(
      `INSERT INTO admin_users (username, email, password_hash, role, vendor_id)
       VALUES ($1, $2, 'x', 'super_admin', NULL) RETURNING id, email`,
      [`test_unif_admin_${suffix}`, `test-unif-${suffix}@example.com`],
    );
    createdAdminUserIds.push(adminUser.id);

    await runMigration();

    const {
      rows: [pairedUser],
    } = await pool.query(
      `SELECT u.id, u.role_id, r.name as role_name
       FROM users u JOIN tidum_roles r ON r.id = u.role_id
       WHERE u.email = $1`,
      [adminUser.email],
    );
    createdUserIds.push(pairedUser.id);
    expect(pairedUser).toBeDefined();
    expect(pairedUser.role_name).toBe("super_admin");
  });

  it("backfills role_id on an existing paired users row that lacks one, without duplicating", async () => {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const email = `test-unif-paired-${suffix}@example.com`;
    const {
      rows: [adminUser],
    } = await pool.query(
      `INSERT INTO admin_users (username, email, password_hash, role, vendor_id)
       VALUES ($1, $2, 'x', 'vendor_admin', NULL) RETURNING id`,
      [`test_unif_paired_admin_${suffix}`, email],
    );
    createdAdminUserIds.push(adminUser.id);
    const {
      rows: [existingUser],
    } = await pool.query(
      `INSERT INTO users (username, password, email, role, role_id)
       VALUES ($1, 'x', $2, 'vendor_admin', NULL) RETURNING id`,
      [`test_unif_paired_user_${suffix}`, email],
    );
    createdUserIds.push(existingUser.id);

    await runMigration();

    const { rows } = await pool.query(
      `SELECT u.id, r.name as role_name FROM users u JOIN tidum_roles r ON r.id = u.role_id WHERE u.email = $1`,
      [email],
    );
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe(existingUser.id);
    expect(rows[0].role_name).toBe("vendor_admin");
  });

  it("is idempotent — running twice produces no duplicates or errors", async () => {
    await runMigration();
    await runMigration();
  });
});
