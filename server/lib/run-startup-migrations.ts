import { readFile } from "fs/promises";
import { join } from "path";
import { pool } from "../db";

// Migrations to apply on every startup. All SQL must be idempotent
// (CREATE TABLE IF NOT EXISTS, ON CONFLICT DO NOTHING, etc.) so they
// can run repeatedly without error or data loss.
const STARTUP_MIGRATIONS: string[] = [
  "036_pricing_sales.sql",
  "037_revenue_analytics.sql",
  "038_stripe_and_brand.sql",
  "039_dpa_template.sql",
  "040_email_templates.sql",
  "041_access_request_hovedadmin.sql",
  "042_employee_imports.sql",
  "043_company_users_email_unique.sql",
  "044_vendor_seat_log.sql",
  "045_company_users_vendor_id_backfill.sql",
  "047_log_row_sak_id.sql",
  "048_user_cases_day_rate.sql",
  "049_sak_locations.sql",
  "050_eid_identities.sql",
  "051_mobile_refresh_tokens.sql",
  "053_expected_ssn_hash.sql",
  "054_role_permission_system.sql",
  "055_admin_users_role_id_unification.sql",
];

export async function runStartupMigrations(): Promise<void> {
  // Migrations live at <repo-root>/migrations/ in both dev (tsx from repo
  // root) and prod (node dist/index.cjs from repo root). Don't use
  // import.meta.url — esbuild bundles to CJS where it's undefined.
  const migrationsDir = join(process.cwd(), "migrations");

  for (const filename of STARTUP_MIGRATIONS) {
    try {
      const sql = await readFile(join(migrationsDir, filename), "utf8");
      await pool.query(sql);
      console.log(`[migration] applied ${filename}`);

      // Spec (fase 1.5, seksjon A) krever at username-kollisjonshopp i denne
      // migrasjonen ikke logges stille — tell og varsl om rader migrasjonens
      // WHERE NOT EXISTS (u2.username = a.username) hoppet over.
      if (filename === "055_admin_users_role_id_unification.sql") {
        const skipped = await pool.query(`
          SELECT COUNT(*) FROM admin_users a
          WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.email = a.email)
            AND EXISTS (SELECT 1 FROM users u2 WHERE u2.username = a.username)
            AND a.role IN ('super_admin', 'vendor_admin')
        `);
        if (Number(skipped.rows[0].count) > 0) {
          console.warn(`[migration 055] ${skipped.rows[0].count} admin_users row(s) skipped pairing due to username collision — remain on name-based role resolution fallback`);
        }
      }
    } catch (err: any) {
      // Don't crash startup — log and continue. Schema mismatches will
      // show up on first query against the affected table.
      console.error(`[migration] FAILED ${filename}:`, err?.message || err);
    }
  }
}
