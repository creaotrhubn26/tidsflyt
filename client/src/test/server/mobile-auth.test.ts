import { describe, it, expect, beforeAll } from "vitest";
import { db, pool } from "../../../../server/db";
import { mobileRefreshTokens, users } from "../../../../shared/schema";
import { eq } from "drizzle-orm";

beforeAll(() => {
  process.env.MOBILE_JWT_SECRET = "test-secret-do-not-use-in-prod";
});

describe("signAccessToken / verifyAccessToken", () => {
  it("round-trips a user id", async () => {
    const { signAccessToken, verifyAccessToken } = await import("../../../../server/lib/mobile-auth");
    const token = signAccessToken("user-123");
    expect(verifyAccessToken(token)).toBe("user-123");
  });

  it("throws on a tampered token", async () => {
    const { signAccessToken, verifyAccessToken } = await import("../../../../server/lib/mobile-auth");
    const token = signAccessToken("user-123");
    expect(() => verifyAccessToken(token + "x")).toThrow();
  });
});

describe("issueMobileTokens / refreshMobileAccessToken / revokeMobileRefreshToken", () => {
  it("issues a refresh token that can refresh an access token, then stops working once revoked", async () => {
    const { issueMobileTokens, refreshMobileAccessToken, revokeMobileRefreshToken } = await import(
      "../../../../server/lib/mobile-auth"
    );
    // Raw SQL, not db.insert(users) — public.users has hidden NOT NULL
    // columns (username, password) from an unrelated product sharing this
    // database, which Tidum's own Drizzle schema (shared/models/auth.ts)
    // doesn't declare. Same pattern as createDisposableUser() elsewhere in
    // this test suite (e.g. server/lib/__tests__/role-management-routes.test.ts).
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const {
      rows: [user],
    } = await pool.query(
      `INSERT INTO users (username, password, email, role) VALUES ($1, 'x', $2, 'member') RETURNING id`,
      [`test_mobile_auth_${suffix}`, `mobile-auth-test-${suffix}@example.com`],
    );

    try {
      const { refreshToken } = await issueMobileTokens(user.id);

      const refreshed = await refreshMobileAccessToken(refreshToken);
      expect(refreshed).not.toBeNull();
      expect(refreshed?.accessToken).toBeTruthy();

      await revokeMobileRefreshToken(refreshToken);
      const afterRevoke = await refreshMobileAccessToken(refreshToken);
      expect(afterRevoke).toBeNull();
    } finally {
      // Runs even if an assertion above throws, so a failed run never
      // leaves the row behind in the shared production database.
      await db.delete(mobileRefreshTokens).where(eq(mobileRefreshTokens.userId, user.id));
      await db.delete(users).where(eq(users.id, user.id));
    }
  });

  it("returns null for an unknown refresh token", async () => {
    const { refreshMobileAccessToken } = await import("../../../../server/lib/mobile-auth");
    expect(await refreshMobileAccessToken("not-a-real-token")).toBeNull();
  });
});
