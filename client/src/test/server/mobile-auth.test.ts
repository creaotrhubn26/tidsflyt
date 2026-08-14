import { describe, it, expect, beforeAll } from "vitest";
import { db } from "../../../../server/db";
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
    const [user] = await db
      .insert(users)
      .values({ email: `mobile-auth-test-${Date.now()}@example.com`, role: "member" })
      .returning();

    const { refreshToken } = await issueMobileTokens(user.id);

    const refreshed = await refreshMobileAccessToken(refreshToken);
    expect(refreshed).not.toBeNull();
    expect(refreshed?.accessToken).toBeTruthy();

    await revokeMobileRefreshToken(refreshToken);
    const afterRevoke = await refreshMobileAccessToken(refreshToken);
    expect(afterRevoke).toBeNull();

    await db.delete(mobileRefreshTokens).where(eq(mobileRefreshTokens.userId, user.id));
    await db.delete(users).where(eq(users.id, user.id));
  });

  it("returns null for an unknown refresh token", async () => {
    const { refreshMobileAccessToken } = await import("../../../../server/lib/mobile-auth");
    expect(await refreshMobileAccessToken("not-a-real-token")).toBeNull();
  });
});
