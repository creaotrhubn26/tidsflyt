import { describe, expect, it } from "vitest";
import { selectReportTemplateUpdateFields } from "../report-template-update";

describe("selectReportTemplateUpdateFields", () => {
  it("allows only known mutable report-template columns", () => {
    expect(selectReportTemplateUpdateFields({
      name: "Ny mal",
      blocks: [{ type: "header" }],
      privacy_notice_enabled: true,
    })).toEqual({
      fields: ["name", "blocks", "privacy_notice_enabled"],
      rejectedFields: [],
    });
  });

  it("rejects a request-body key that attempts to inject SQL", () => {
    const injection = "name = 'owned', description = current_user --";
    expect(selectReportTemplateUpdateFields({ [injection]: "x" })).toEqual({
      fields: [],
      rejectedFields: [injection],
    });
  });

  it("rejects tenant and ownership reassignment fields", () => {
    expect(selectReportTemplateUpdateFields({
      name: "Legitim endring",
      vendor_id: 99,
      company_id: 42,
      created_by: "attacker",
    })).toEqual({
      fields: ["name"],
      rejectedFields: ["vendor_id", "company_id", "created_by"],
    });
  });

  it("ignores client metadata without ever treating it as a SQL identifier", () => {
    expect(selectReportTemplateUpdateFields({
      id: 7,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
      name: "Oppdatert",
    })).toEqual({
      fields: ["name"],
      rejectedFields: [],
    });
  });
});
