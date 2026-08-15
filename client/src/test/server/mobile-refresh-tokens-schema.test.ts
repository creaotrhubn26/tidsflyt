import { describe, it, expect } from "vitest";
import { mobileRefreshTokens } from "../../../../shared/models/auth";

describe("mobileRefreshTokens schema", () => {
  it("exposes the expected columns", () => {
    expect(Object.keys(mobileRefreshTokens)).toEqual(
      expect.arrayContaining(["id", "userId", "tokenHash", "expiresAt", "revokedAt", "createdAt"]),
    );
  });
});
