import { describe, it, expect } from "vitest";
import { STARTUP_MIGRATIONS } from "../run-startup-migrations";

// Guard for the 057-first invariant (se ordre-kommentaren i
// run-startup-migrations.ts): 057 må kjøre før 036-056, ellers gjenoppstår
// shadow-table-hendelsen. Ren array-sjekk, ingen databasetilkobling.
describe("STARTUP_MIGRATIONS rekkefølge", () => {
  it("057_tidum_table_rename.sql er første oppføring", () => {
    expect(STARTUP_MIGRATIONS[0]).toBe("057_tidum_table_rename.sql");
  });

  it("registrerer rapportmal-constrainten etter PR #21-migrasjonene", () => {
    expect(STARTUP_MIGRATIONS).toContain("065_rapport_templates_constraints.sql");
    expect(STARTUP_MIGRATIONS.indexOf("065_rapport_templates_constraints.sql"))
      .toBeGreaterThan(STARTUP_MIGRATIONS.indexOf("064_barnevern_meldingsmottak.sql"));
  });

  it("oppretter Tidums vendor-tabell før 064 lager vendor-FK", () => {
    expect(STARTUP_MIGRATIONS).toContain("066_tidum_vendors.sql");
    expect(STARTUP_MIGRATIONS.indexOf("066_tidum_vendors.sql"))
      .toBeLessThan(STARTUP_MIGRATIONS.indexOf("064_barnevern_meldingsmottak.sql"));
  });

  it("registrerer de nye objektintegritetsmigrasjonene i avhengighetsrekkefølge", () => {
    const invoice = STARTUP_MIGRATIONS.indexOf("067_tidum_invoices.sql");
    const caseReport = STARTUP_MIGRATIONS.indexOf("068_case_report_tenant_integrity.sql");
    const emailComposer = STARTUP_MIGRATIONS.indexOf("069_email_composer_tenant_integrity.sql");

    expect(invoice).toBeGreaterThan(-1);
    expect(caseReport).toBeGreaterThan(invoice);
    expect(emailComposer).toBeGreaterThan(caseReport);
  });
});
