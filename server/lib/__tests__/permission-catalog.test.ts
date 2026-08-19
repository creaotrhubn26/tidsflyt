import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { PERMISSION_CATALOG } from "../permission-catalog";
import { pool } from "../../db";

describe("PERMISSION_CATALOG matches migration seed", () => {
  it("every catalog key exists in migrations/054_role_permission_system.sql", () => {
    const sql = readFileSync("migrations/054_role_permission_system.sql", "utf8");
    for (const { key } of PERMISSION_CATALOG) {
      expect(sql.includes(`'${key}'`)).toBe(true);
    }
  });

  it("has exactly 7 entries (update this test when you add one)", () => {
    expect(PERMISSION_CATALOG.length).toBe(7);
  });
});

describe("vendor_admin system role does not have vendor.admin.create", () => {
  it("stays unscoped-privilege-free after (re-)running migration 054", async () => {
    // Re-apply the (idempotent) migration so this also proves the
    // migration's explicit DELETE cleans up a stale grant from before this
    // fix — not merely that a fresh seed never inserts one. vendor.admin.create
    // is unscoped (no vendor ownership check), so granting it to vendor_admin
    // let any vendor_admin create admin users on ANY vendor's tenant; it must
    // stay super_admin-only.
    const sql = readFileSync("migrations/054_role_permission_system.sql", "utf8");
    await pool.query(sql);

    const { rows } = await pool.query(
      `SELECT 1 FROM tidum_role_permissions rp
       JOIN tidum_roles r ON r.id = rp.role_id
       JOIN tidum_permissions p ON p.id = rp.permission_id
       WHERE r.name = 'vendor_admin' AND r.is_system_default = true AND p.key = 'vendor.admin.create'`
    );
    expect(rows.length).toBe(0);
  });
});
