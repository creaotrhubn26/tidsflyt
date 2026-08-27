import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { STARTUP_MIGRATIONS } from "../run-startup-migrations";

const migrationSql = readFileSync(
  join(process.cwd(), "migrations", "065_rapport_templates_constraints.sql"),
  "utf8",
);
const seedSource = readFileSync(
  join(process.cwd(), "server", "seed", "rapport-templates.ts"),
  "utf8",
);

describe("rapport-template system slug contract", () => {
  it("runs migration 065 during startup", () => {
    expect(STARTUP_MIGRATIONS).toContain(
      "065_rapport_templates_constraints.sql",
    );
  });

  it("repoints references before deleting duplicate system templates", () => {
    const institutionUpdate = migrationSql.indexOf(
      "UPDATE tidum_vendor_institutions",
    );
    const reportUpdate = migrationSql.indexOf("UPDATE tidum_rapporter");
    const duplicateDelete = migrationSql.indexOf(
      "DELETE FROM tidum_rapport_templates",
    );

    expect(institutionUpdate).toBeGreaterThan(-1);
    expect(reportUpdate).toBeGreaterThan(-1);
    expect(institutionUpdate).toBeLessThan(duplicateDelete);
    expect(reportUpdate).toBeLessThan(duplicateDelete);
  });

  it("defines the partial system index used by both seed paths", () => {
    expect(migrationSql).toMatch(
      /UNIQUE INDEX IF NOT EXISTS tidum_rapport_templates_system_slug_unique[\s\S]*WHERE vendor_id IS NULL/,
    );
    expect(seedSource).toContain(
      "targetWhere: sql`${rapportTemplates.vendorId} IS NULL`",
    );
    expect(seedSource).toContain(
      "ON CONFLICT (slug) WHERE vendor_id IS NULL DO UPDATE",
    );
  });
});
