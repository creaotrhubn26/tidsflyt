import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { hashSsn } from "../../../../server/lib/eid-hash";

describe("hashSsn", () => {
  const originalPepper = process.env.EID_SSN_HASH_PEPPER;

  beforeEach(() => {
    process.env.EID_SSN_HASH_PEPPER = "test-pepper-do-not-use-in-prod";
  });

  afterEach(() => {
    if (originalPepper === undefined) {
      delete process.env.EID_SSN_HASH_PEPPER;
    } else {
      process.env.EID_SSN_HASH_PEPPER = originalPepper;
    }
  });

  it("produces the same hash for the same fnr", () => {
    expect(hashSsn("12345678901")).toBe(hashSsn("12345678901"));
  });

  it("produces different hashes for different fnr", () => {
    expect(hashSsn("12345678901")).not.toBe(hashSsn("10987654321"));
  });

  it("strips whitespace before hashing so formatting does not change the key", () => {
    expect(hashSsn("123 456 78901")).toBe(hashSsn("12345678901"));
  });

  it("never leaks the fnr itself in the output", () => {
    expect(hashSsn("12345678901")).not.toContain("12345678901");
  });

  it("throws when EID_SSN_HASH_PEPPER is not configured", () => {
    delete process.env.EID_SSN_HASH_PEPPER;
    expect(() => hashSsn("12345678901")).toThrow("EID_SSN_HASH_PEPPER");
  });
});
