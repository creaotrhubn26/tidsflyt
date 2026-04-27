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
    } catch (err: any) {
      // Don't crash startup — log and continue. Schema mismatches will
      // show up on first query against the affected table.
      console.error(`[migration] FAILED ${filename}:`, err?.message || err);
    }
  }
}
