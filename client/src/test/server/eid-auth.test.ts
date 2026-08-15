import { describe, it, expect } from "vitest";
import { requiresEidLogin, buildEidStatus } from "../../../../server/eid-auth";

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
    expect(buildEidStatus("vendor_admin", false, true)).toEqual({ linked: false, required: false });
  });

  it("is required and not linked for a non-admin role with no identity yet", () => {
    expect(buildEidStatus("miljoarbeider", false, true)).toEqual({ linked: false, required: true });
  });

  it("is required and linked once the identity exists", () => {
    expect(buildEidStatus("miljoarbeider", true, true)).toEqual({ linked: true, required: true });
  });

  it("is not required for a non-admin role when no eID provider is registered, even though the identity is linked", () => {
    expect(buildEidStatus("miljoarbeider", true, false)).toEqual({ linked: true, required: false });
  });
});

import { db } from "../../../../server/db";
import { eidIdentities, users } from "../../../../shared/schema";
import { eq } from "drizzle-orm";

describe("resolveUserByEidIdentity — provider-uavhengig gjenkjenning", () => {
  it("gjenkjenner en bruker via Buypass-innlogging når kun BankID er koblet fra før", async () => {
    const { resolveUserByEidIdentity } = await import("../../../../server/eid-auth");

    const [user] = await db
      .insert(users)
      .values({ email: `cross-provider-test-${Date.now()}@example.com`, role: "member" })
      .returning();

    const ssnHash = "test-hash-" + Date.now();
    await db.insert(eidIdentities).values({
      userId: user.id,
      provider: "bankid",
      sub: "test-sub",
      ssnHash,
      givenName: "Test",
      familyName: "Testsen",
      fullName: "Test Testsen",
      rawClaims: {},
    });

    const resolved = await resolveUserByEidIdentity(ssnHash, "buypass");

    expect(resolved).not.toBeNull();
    expect(resolved?.id).toBe(user.id);
    // provider skal reflektere DENNE innloggingens metode (buypass),
    // ikke hvilken provider som opprinnelig koblet raden (bankid).
    expect(resolved?.provider).toBe("buypass");

    await db.delete(eidIdentities).where(eq(eidIdentities.userId, user.id));
    await db.delete(users).where(eq(users.id, user.id));
  });

  it("returnerer null når ingen kobling finnes for noen provider", async () => {
    const { resolveUserByEidIdentity } = await import("../../../../server/eid-auth");
    const resolved = await resolveUserByEidIdentity("nonexistent-hash-" + Date.now(), "buypass");
    expect(resolved).toBeNull();
  });
});
