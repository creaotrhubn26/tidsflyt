import { describe, it, expect, beforeEach } from "vitest";
import { randomBytes } from "crypto";
import { authenticator } from "otplib";
import { encryptSecret } from "../../../../server/lib/secret-crypto";
import { generateRecoveryCodes, hashTotpRecoveryCode, verifyTotpCode } from "../../../../server/lib/totp";

// Static imports, ikke dynamisk re-import med cache-busting: både
// secret-crypto og totp leser SECRETS_ENCRYPTION_KEY fra process.env inne i
// hver funksjon (requireKey()), aldri ved modul-load — så en fersk nøkkel
// per test i beforeEach er nok, ingen modul-cache å omgå.
describe("totp", () => {
  beforeEach(() => {
    process.env.SECRETS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  });

  it("genererer 10 unike gjenopprettingskoder, returnert i klartekst kun ved oppsett", () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
  });

  it("hashTotpRecoveryCode er deterministisk (samme kode -> samme hash, for oppslag)", () => {
    expect(hashTotpRecoveryCode("ABCD-1234")).toBe(hashTotpRecoveryCode("ABCD-1234"));
    expect(hashTotpRecoveryCode("ABCD-1234")).not.toBe(hashTotpRecoveryCode("ABCD-5678"));
  });

  it("en gyldig otplib-generert TOTP-kode verifiseres riktig mot en kryptert secret", () => {
    const secret = authenticator.generateSecret();
    const code = authenticator.generate(secret);
    expect(verifyTotpCode(encryptSecret(secret), code)).toBe(true);
  });

  it("en feil kode avvises", () => {
    const secret = authenticator.generateSecret();
    expect(verifyTotpCode(encryptSecret(secret), "000000")).toBe(false);
  });
});
