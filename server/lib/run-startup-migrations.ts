import { readFile } from "fs/promises";
import { join } from "path";
import { pool } from "../db";

// Migrations to apply on every startup. All SQL must be idempotent
// (CREATE TABLE IF NOT EXISTS, ON CONFLICT DO NOTHING, etc.) so they
// can run repeatedly without error or data loss.
//
// ORDER IS EXECUTION ORDER. runStartupMigrations() iterates this array
// top-to-bottom with no sorting — position here is the only thing that
// decides what runs when.
//
// !! 057_tidum_table_rename.sql MUST BE REGISTERED AS THE FIRST ENTRY,
// ahead of 036-056, despite its higher number. 036-056 were rewritten to
// CREATE/ALTER the tidum_-prefixed table names; 057 is what actually
// renames the existing, data-holding tables to those names. If 057 runs
// after (or not at all), 036-056 create 31 *empty shadow tables* under the
// tidum_ names next to the real, still-old-named tables holding the data.
// That happened once against the shared production DB and had to be
// cleaned up by hand. Keep it first — never move it down or re-sort this
// array by filename.
export const STARTUP_MIGRATIONS: string[] = [
  "057_tidum_table_rename.sql",
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
  "052_archive_integration.sql",
  "053_expected_ssn_hash.sql",
  "054_role_permission_system.sql",
  "055_admin_users_role_id_unification.sql",
  "056_admin_activity_log.sql",
  "058_role_hierarchy_rank.sql",
  "059_task_assignment.sql",
  "060_notifications_drop_stale_user_id_not_null.sql",
  "061_notifications_drop_remaining_stale_not_null.sql",
  "062_sak_journal.sql",
  "063_kommuner.sql",
  // 064 creates an integer FK to the canonical Tidum-owned vendor table.
  // Run 066 first despite its higher number; startup order is explicit here.
  "066_tidum_vendors.sql",
  "064_barnevern_meldingsmottak.sql",
  "065_rapport_templates_constraints.sql",
  "067_tidum_invoices.sql",
  "068_case_report_tenant_integrity.sql",
  "069_email_composer_tenant_integrity.sql",
  "070_outbound_email_policy.sql",
  "071_secure_dialog_foundation.sql",
  "072_secure_dialog_ui_support.sql",
  "073_secure_attachment_malware_quarantine.sql",
  "074_secure_dialog_archive_retention_keys.sql",
  "075_archive_token_url.sql",
  "076_elements_archive_provider.sql",
  "077_saker_rapport_tenant_security.sql",
  "078_cms_control_plane_security.sql",
  "079_leave_tenant_security.sql",
  "080_gdpr_erasure_audit.sql",
  "081_poweroffice_client_key_encryption.sql",
  "082_secret_rotation_run_audit.sql",
  "083_barnevern_municipality_rls.sql",
  "084_secure_dialog_municipality_rls.sql",
  "085_archive_dual_tenant_rls.sql",
  "086_deadline_tenant_rls.sql",
  "087_barnevern_sak.sql",
  "088_barnevern_melding_komplett.sql",
  "089_barnevern_sak_journal.sql",
  "090_barnevern_oppgaver.sql",
  "091_barnevern_tilgangslogg.sql",
  "092_barnevern_planer.sql",
  "093_barnevern_dokumenter.sql",
  "094_barnevern_innsynskrav.sql",
  "095_barnevern_forebyggende.sql",
  "096_sms_utboks.sql",
];

// Eldre migrasjoner (< 083) som likevel er fail-closed — se kommentaren i
// catch-blokken for hvorfor hver enkelt står her.
const LEGACY_FAIL_CLOSED = new Set([
  "057_tidum_table_rename.sql",
  "077_saker_rapport_tenant_security.sql",
  "079_leave_tenant_security.sql",
  "080_gdpr_erasure_audit.sql",
  "081_poweroffice_client_key_encryption.sql",
  "082_secret_rotation_run_audit.sql",
]);

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
    } catch (err: any) {
      console.error(`[migration] FAILED ${filename}:`, err?.message || err);

      // 057 is load-bearing (see the ordering comment above): every
      // migration after it targets tidum_-prefixed names on the assumption
      // that 057 already renamed the data-holding tables. If 057 fails and
      // we let startup continue anyway, 036-056 recreate the exact empty
      // shadow-table incident this whole initiative had to clean up once
      // already. Abort startup instead of limping on with a half-migrated
      // schema. 077 is also fail-closed: the application code stores current
      // UUID/varchar user IDs in the case/report domain, so continuing with
      // legacy integer columns would break authorization and assignment.
      // 079 is likewise fail-closed: continuing without tenant constraints on
      // health-/absence data would re-open cross-customer reads and writes.
      // 080 is fail-closed because irreversible GDPR erasure must never run
      // without first being able to persist its documented controller intent.
      // 081 is fail-closed because new PowerOffice credentials must never be
      // accepted without the sealed-format database guard and rotation audit.
      // 082 is fail-closed because a platform rotation must never be reported
      // as successful without durable append-only run evidence. 083 is
      // fail-closed because request code now depends on FORCE RLS and its
      // transaction-local municipality context for database-level isolation.
      // 084 extends the same fail-closed boundary to secure dialog, including
      // eID-party object access and internal queue/governance operations. 085
      // protects archive credentials, case links and receipts for both vendor
      // and municipality tenants. 086 applies the same boundary to deadlines
      // and enforces recipient/user tenant integrity without placing the
      // shared authentication registry itself behind RLS. 087 creates the
      // municipal child-welfare case tables with the same FORCE RLS boundary
      // that the sak routes depend on.
      // Other migration failures remain non-fatal and are surfaced on first
      // query against the affected table.
      // Fail-closed er STANDARD for alle migrasjoner fra og med 083 (alt
      // etter RLS-grunnmuren bærer sikkerhets-/tenantinvariantene appkoden
      // avhenger av), pluss de navngitte eldre. En ny migrasjon blir dermed
      // fail-closed automatisk — ingen håndvedlikeholdt kjede å glemme.
      if (LEGACY_FAIL_CLOSED.has(filename) || parseInt(filename, 10) >= 83) {
        throw err;
      }
      continue;
    }

    // Spec (fase 1.5, seksjon A) krever at username-kollisjonshopp i denne
    // migrasjonen ikke logges stille — tell og varsl om rader migrasjonens
    // WHERE NOT EXISTS (u2.username = a.username) hoppet over. Egen
    // try/catch, utenfor migrasjonens egen: 055 har allerede committet på
    // dette punktet, så en feil her er en separat, mindre alvorlig hendelse
    // — skal ALDRI logges som "[migration] FAILED 055", som ville antydet
    // at selve migreringen mislyktes.
    if (filename === "055_admin_users_role_id_unification.sql") {
      try {
        const skipped = await pool.query(`
          SELECT COUNT(*) FROM tidum_admin_users a
          WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.email = a.email)
            AND EXISTS (SELECT 1 FROM users u2 WHERE u2.username = a.username)
            AND a.role IN ('super_admin', 'vendor_admin')
        `);
        if (Number(skipped.rows[0].count) > 0) {
          console.warn(`[migration 055] ${skipped.rows[0].count} tidum_admin_users row(s) skipped pairing due to username collision — remain on name-based role resolution fallback`);
        }
      } catch (err: any) {
        console.error(`[migration 055] failed to check for skipped username-collision rows (055 itself already applied successfully):`, err?.message || err);
      }
    }
  }
}
