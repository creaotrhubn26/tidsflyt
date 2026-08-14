import { describe, it, expect } from "vitest";
import { requiresEidLogin, buildEidStatus, EID_PROVIDERS } from "../../../../server/eid-auth";

describe("requiresEidLogin", () => {
  it("does not require eID for super_admin", () => {
    expect(requiresEidLogin("super_admin")).toBe(false);
  });

  it("does not require eID for hovedadmin", () => {
    expect(requiresEidLogin("hovedadmin")).toBe(false);
  });

  it("does not require eID for vendor_admin", () => {
    expect(requiresEidLogin("vendor_admin")).toBe(false);
  });

  it("requires eID for tiltaksleder", () => {
    expect(requiresEidLogin("tiltaksleder")).toBe(true);
  });

  it("requires eID for teamleder", () => {
    expect(requiresEidLogin("teamleder")).toBe(true);
  });

  it("requires eID for case_manager", () => {
    expect(requiresEidLogin("case_manager")).toBe(true);
  });

  it("requires eID for miljoarbeider", () => {
    expect(requiresEidLogin("miljoarbeider")).toBe(true);
  });

  it("requires eID for member", () => {
    expect(requiresEidLogin("member")).toBe(true);
  });

  it("requires eID for an unknown/null role (defaults to member)", () => {
    expect(requiresEidLogin(null)).toBe(true);
  });
});

describe("buildEidStatus", () => {
  it("is not required and not linked for admin roles with no identity", () => {
    expect(buildEidStatus("vendor_admin", false)).toEqual({ linked: false, required: false });
  });

  it("is required and not linked for a non-admin role with no identity yet", () => {
    expect(buildEidStatus("miljoarbeider", false)).toEqual({ linked: false, required: true });
  });

  it("is required and linked once the identity exists", () => {
    expect(buildEidStatus("miljoarbeider", true)).toEqual({ linked: true, required: true });
  });
});

describe("EID_PROVIDERS", () => {
  it("requests the ssn scope and reads the socialno claim for BankID", () => {
    expect(EID_PROVIDERS.bankid.scope).toContain("ssn");
    expect(EID_PROVIDERS.bankid.ssnClaimKey).toBe("socialno");
  });

  it("requests the bpnnin scope and reads the bp_nnin_sub claim for Buypass", () => {
    expect(EID_PROVIDERS.buypass.scope).toContain("bpnnin");
    expect(EID_PROVIDERS.buypass.ssnClaimKey).toBe("bp_nnin_sub");
  });
});
