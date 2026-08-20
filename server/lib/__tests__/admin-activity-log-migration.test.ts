import { describe, it, expect } from "vitest";
import { pool } from "../../db";
import { readFileSync } from "fs";
import { join } from "path";

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

  it("does not re-grant activity_log.view to super_admin after it's explicitly removed", async () => {
    await runMigration();
    const { rows: permRows } = await pool.query(
      `SELECT id FROM tidum_permissions WHERE key = 'activity_log.view'`,
    );
    const { rows: roleRows } = await pool.query(
      `SELECT id FROM tidum_roles WHERE name = 'super_admin' AND scope = 'global'`,
    );
    const permissionId = permRows[0].id;
    const roleId = roleRows[0].id;

    try {
      // Simuler at en super admin fjernet tillatelsen via UI-et.
      await pool.query(
        `DELETE FROM tidum_role_permissions WHERE role_id = $1 AND permission_id = $2`,
        [roleId, permissionId],
      );

      // Simuler neste server-oppstart.
      await runMigration();

      const { rows: afterRows } = await pool.query(
        `SELECT 1 FROM tidum_role_permissions WHERE role_id = $1 AND permission_id = $2`,
        [roleId, permissionId],
      );
      expect(afterRows.length).toBe(0);
    } finally {
      // Gjenopprett — testen skal ikke etterlate super_admin uten denne
      // tillatelsen for resten av testsuiten/produksjon.
      await pool.query(
        `INSERT INTO tidum_role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT (role_id, permission_id) DO NOTHING`,
        [roleId, permissionId],
      );
    }
  });

  it("is idempotent — running twice produces no duplicates or errors", async () => {
    await runMigration();
    await runMigration();
  });
});
