import { describe, it, expect } from "vitest";
import { requiresEidLogin } from "../../../../server/eid-auth";

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
