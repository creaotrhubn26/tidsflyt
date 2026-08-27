import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { requireEmailLoginSecret } from "../../../../server/custom-auth";
import { requireAuthJwtSecret } from "../../../../server/middleware/auth";

describe("JWT-hemmeligheter krever eksplisitt konfigurasjon, ingen fallback", () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.EMAIL_MAGIC_LINK_SECRET;
    delete process.env.JWT_SECRET;
    delete process.env.SESSION_SECRET;
    delete process.env.AUTH_JWT_SECRET;
  });

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it("requireEmailLoginSecret kaster når EMAIL_MAGIC_LINK_SECRET mangler", () => {
    expect(() => requireEmailLoginSecret()).toThrow(/EMAIL_MAGIC_LINK_SECRET/);
  });

  it("requireEmailLoginSecret returnerer verdien når satt, uten fallback", () => {
    process.env.EMAIL_MAGIC_LINK_SECRET = "test-magic-link-secret";
    process.env.JWT_SECRET = "should-never-be-used";
    expect(requireEmailLoginSecret()).toBe("test-magic-link-secret");
  });

  it("requireAuthJwtSecret kaster når AUTH_JWT_SECRET mangler, selv med eldre secrets satt", () => {
    process.env.JWT_SECRET = "should-never-be-used";
    process.env.SESSION_SECRET = "should-never-be-used-either";
    expect(() => requireAuthJwtSecret()).toThrow(/AUTH_JWT_SECRET/);
  });

  it("requireAuthJwtSecret returnerer AUTH_JWT_SECRET når satt", () => {
    process.env.AUTH_JWT_SECRET = "test-auth-jwt-secret";
    expect(requireAuthJwtSecret()).toBe("test-auth-jwt-secret");
  });
});
