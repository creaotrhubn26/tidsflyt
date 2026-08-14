import { describe, it, expect } from "vitest";
import { shouldRejectNonEidLogin } from "../../../../server/custom-auth";

describe("shouldRejectNonEidLogin", () => {
  it("never rejects admin-tier roles, linked or not", () => {
    expect(shouldRejectNonEidLogin("vendor_admin", false)).toBe(false);
    expect(shouldRejectNonEidLogin("vendor_admin", true)).toBe(false);
  });

  it("allows the one-time bootstrap login before eID is linked", () => {
    expect(shouldRejectNonEidLogin("miljoarbeider", false)).toBe(false);
  });

  it("rejects Google/e-post once eID is linked for a non-admin role", () => {
    expect(shouldRejectNonEidLogin("miljoarbeider", true)).toBe(true);
  });
});
