import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { PERMISSION_CATALOG } from "../permission-catalog";
import { pool } from "../../db";

describe("PERMISSION_CATALOG matches migration seed", () => {
  it("every catalog key exists in some migrations/*.sql file", () => {
    // A permission can be seeded by any migration, not just 054 — e.g.
    // activity_log.view is seeded by 056 (see 056's comment for why it
    // can't reuse 054's guard). Glob every migration file so a THIRD
    // future permission-adding migration doesn't silently break this test
    // again.
    const migrationsDir = join(process.cwd(), "migrations");
    const sql = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => readFileSync(join(migrationsDir, f), "utf8"))
      .join("\n");
    for (const { key } of PERMISSION_CATALOG) {
      expect(sql.includes(`'${key}'`)).toBe(true);
    }
  });

  it("has exactly 9 entries across all migrations (update this test when you add one)", () => {
    expect(PERMISSION_CATALOG.length).toBe(9);
  });
});

describe("global CMS permission", () => {
  it("is seeded only to super_admin and stays idempotent", async () => {
    const sql = readFileSync("migrations/078_cms_control_plane_security.sql", "utf8");
    await pool.query(sql);
    await pool.query(sql);

    const { rows } = await pool.query(
      `SELECT r.name
         FROM tidum_role_permissions rp
        JOIN tidum_roles r ON r.id = rp.role_id
        JOIN tidum_permissions p ON p.id = rp.permission_id
        WHERE p.key = 'cms.manage'
          AND r.is_system_default = true
        ORDER BY r.name`,
    );
    expect(rows.map((row) => row.name)).toEqual(["super_admin"]);
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
