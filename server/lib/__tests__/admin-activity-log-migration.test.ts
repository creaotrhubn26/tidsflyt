import { describe, it, expect } from "vitest";
import { db, pool } from "../../db";
import { readFileSync } from "fs";
import { join } from "path";
import { roles } from "@shared/models/permissions";
import { eq } from "drizzle-orm";

describe("admin activity log migration (056)", () => {
  async function runMigration() {
    const sql = readFileSync(join(process.cwd(), "migrations", "056_admin_activity_log.sql"), "utf8");
    await pool.query(sql);
  }

  it("seeds activity_log.view to super_admin, not to vendor_admin", async () => {
    await runMigration();

    const { rows: superAdminRows } = await pool.query(`
      SELECT 1 FROM tidum_role_permissions rp
      JOIN tidum_roles r ON r.id = rp.role_id
      JOIN tidum_permissions p ON p.id = rp.permission_id
      WHERE r.name = 'super_admin' AND p.key = 'activity_log.view'
    `);
    expect(superAdminRows.length).toBe(1);

    const { rows: vendorAdminRows } = await pool.query(`
      SELECT 1 FROM tidum_role_permissions rp
      JOIN tidum_roles r ON r.id = rp.role_id
      JOIN tidum_permissions p ON p.id = rp.permission_id
      WHERE r.name = 'vendor_admin' AND p.key = 'activity_log.view'
    `);
    expect(vendorAdminRows.length).toBe(0);
  });

  it("does not re-grant activity_log.view after it's explicitly removed (proven on a disposable role, not the real super_admin)", async () => {
    // Fix (final review): the original version of this test deleted the
    // REAL super_admin system role's activity_log.view grant directly,
    // re-ran the migration, and restored it in a finally block. Vitest runs
    // test FILES in parallel by default, and admin-activity-log-routes.test.ts
    // has a test that needs the real super_admin to actually hold
    // activity_log.view to pass — so there was a race window (and a
    // permanent-loss risk if this process got killed between the DELETE and
    // the finally restore) where a real production super_admin account
    // transiently lost a real permission grant. Adapted per
    // role-management-routes.test.ts's createDisposableUser-adjacent
    // pattern: exercise the guard against disposable data instead.
    //
    // migrations/056's grant INSERT is hardcoded to WHERE r.name =
    // 'super_admin' AND r.scope = 'global', so it can never target a
    // disposable role directly — running the migration file verbatim
    // against a disposable role would prove nothing. Instead this
    // reproduces the migration's exact guarded-grant SQL shape (same
    // NOT EXISTS-against-tidum_permission_seed_log condition, same
    // ON CONFLICT DO NOTHING), parameterized on the disposable role's id.
    // The seed_log marker is keyed only by permission_key (not by role —
    // see the comment on tidum_permission_seed_log in 056), so this
    // exercises the REAL activity_log.view key's marker behavior — proving
    // the guard blocks a (re-)grant to ANY role once the key's marker is
    // set, which is exactly the bug class fix 3 targets — without ever
    // touching the real super_admin role's real grant.
    await runMigration();

    const { rows: permRows } = await pool.query(
      `SELECT id FROM tidum_permissions WHERE key = 'activity_log.view'`,
    );
    const permissionId = permRows[0].id;

    const [disposableRole] = await db
      .insert(roles)
      .values({ name: "test_seed_log_role", scope: "global" })
      .returning();

    try {
      // Grant directly, then remove it — simulates "this role had it, then
      // an admin explicitly revoked it via the UI".
      await pool.query(
        `INSERT INTO tidum_role_permissions (role_id, permission_id) VALUES ($1, $2)`,
        [disposableRole.id, permissionId],
      );
      await pool.query(
        `DELETE FROM tidum_role_permissions WHERE role_id = $1 AND permission_id = $2`,
        [disposableRole.id, permissionId],
      );

      // Same guarded-grant shape as migrations/056, targeting the
      // disposable role instead of the hardcoded super_admin match. The
      // real tidum_permission_seed_log row for 'activity_log.view' already
      // exists at this point (written by runMigration() above and by prior
      // server startups), so the NOT EXISTS guard should block this grant.
      await pool.query(
        `INSERT INTO tidum_role_permissions (role_id, permission_id)
         SELECT $1, p.id FROM tidum_permissions p
         WHERE p.key = 'activity_log.view'
           AND NOT EXISTS (SELECT 1 FROM tidum_permission_seed_log WHERE permission_key = 'activity_log.view')
         ON CONFLICT (role_id, permission_id) DO NOTHING`,
        [disposableRole.id],
      );

      const { rows: afterRows } = await pool.query(
        `SELECT 1 FROM tidum_role_permissions WHERE role_id = $1 AND permission_id = $2`,
        [disposableRole.id, permissionId],
      );
      expect(afterRows.length).toBe(0);
    } finally {
      await pool.query(`DELETE FROM tidum_role_permissions WHERE role_id = $1`, [disposableRole.id]);
      await db.delete(roles).where(eq(roles.id, disposableRole.id));
    }
  });

  it("is idempotent — running twice produces no duplicates or errors", async () => {
    await runMigration();
    await runMigration();
  });
});
