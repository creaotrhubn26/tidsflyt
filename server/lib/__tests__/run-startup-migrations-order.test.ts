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
    const emailPolicy = STARTUP_MIGRATIONS.indexOf("070_outbound_email_policy.sql");
    const secureDialog = STARTUP_MIGRATIONS.indexOf("071_secure_dialog_foundation.sql");
    const secureDialogUi = STARTUP_MIGRATIONS.indexOf("072_secure_dialog_ui_support.sql");
    const secureAttachment = STARTUP_MIGRATIONS.indexOf("073_secure_attachment_malware_quarantine.sql");
    const secureGovernance = STARTUP_MIGRATIONS.indexOf("074_secure_dialog_archive_retention_keys.sql");
    const archiveTokenUrl = STARTUP_MIGRATIONS.indexOf("075_archive_token_url.sql");
    const elementsArchive = STARTUP_MIGRATIONS.indexOf("076_elements_archive_provider.sql");
    const caseReportSecurity = STARTUP_MIGRATIONS.indexOf("077_saker_rapport_tenant_security.sql");
    const cmsControlPlane = STARTUP_MIGRATIONS.indexOf("078_cms_control_plane_security.sql");
    const leaveTenantSecurity = STARTUP_MIGRATIONS.indexOf("079_leave_tenant_security.sql");
    const gdprErasureAudit = STARTUP_MIGRATIONS.indexOf("080_gdpr_erasure_audit.sql");
    const powerOfficeEncryption = STARTUP_MIGRATIONS.indexOf("081_poweroffice_client_key_encryption.sql");
    const secretRotationAudit = STARTUP_MIGRATIONS.indexOf("082_secret_rotation_run_audit.sql");
    const barnevernRls = STARTUP_MIGRATIONS.indexOf("083_barnevern_municipality_rls.sql");
    const secureDialogRls = STARTUP_MIGRATIONS.indexOf("084_secure_dialog_municipality_rls.sql");
    const archiveRls = STARTUP_MIGRATIONS.indexOf("085_archive_dual_tenant_rls.sql");
    const deadlineRls = STARTUP_MIGRATIONS.indexOf("086_deadline_tenant_rls.sql");

    expect(invoice).toBeGreaterThan(-1);
    expect(caseReport).toBeGreaterThan(invoice);
    expect(emailComposer).toBeGreaterThan(caseReport);
    expect(emailPolicy).toBeGreaterThan(emailComposer);
    expect(secureDialog).toBeGreaterThan(emailPolicy);
    expect(secureDialogUi).toBeGreaterThan(secureDialog);
    expect(secureAttachment).toBeGreaterThan(secureDialogUi);
    expect(secureGovernance).toBeGreaterThan(secureAttachment);
    expect(archiveTokenUrl).toBeGreaterThan(secureGovernance);
    expect(elementsArchive).toBeGreaterThan(archiveTokenUrl);
    expect(caseReportSecurity).toBeGreaterThan(elementsArchive);
    expect(cmsControlPlane).toBeGreaterThan(caseReportSecurity);
    expect(leaveTenantSecurity).toBeGreaterThan(cmsControlPlane);
    expect(gdprErasureAudit).toBeGreaterThan(leaveTenantSecurity);
    expect(powerOfficeEncryption).toBeGreaterThan(gdprErasureAudit);
    expect(secretRotationAudit).toBeGreaterThan(powerOfficeEncryption);
    expect(barnevernRls).toBeGreaterThan(secretRotationAudit);
    expect(secureDialogRls).toBeGreaterThan(barnevernRls);
    expect(archiveRls).toBeGreaterThan(secureDialogRls);
    expect(deadlineRls).toBeGreaterThan(archiveRls);
  });

  it("har frist-RLS som siste, fail-closed oppstartsmigrasjon", () => {
    expect(STARTUP_MIGRATIONS.at(-1)).toBe("086_deadline_tenant_rls.sql");
  });
});
