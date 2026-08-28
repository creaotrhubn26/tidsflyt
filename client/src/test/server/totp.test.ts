import { describe, it, expect, beforeEach } from "vitest";
import { randomBytes } from "crypto";
import { authenticator } from "otplib";
import { sealSecret } from "../../../../server/lib/secret-box";
import { generateRecoveryCodes, hashTotpRecoveryCode, verifyTotpCode } from "../../../../server/lib/totp";

// Statiske imports, ikke dynamisk re-import med cache-busting: secret-box
// leser nøkkelmiljøet med signaturbasert cache-invalidering, så en fersk
// nøkkel per test i beforeEach er nok — ingen modul-cache å omgå.
describe("totp", () => {
  beforeEach(() => {
    process.env.TIDUM_SECRET_KEY = randomBytes(32).toString("base64");
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

  it("en gyldig otplib-generert TOTP-kode verifiseres riktig mot en forseglet secret", () => {
    const secret = authenticator.generateSecret();
    const code = authenticator.generate(secret);
    expect(verifyTotpCode(sealSecret(secret), code)).toBe(true);
  });

  it("en feil kode avvises", () => {
    const secret = authenticator.generateSecret();
    expect(verifyTotpCode(sealSecret(secret), "000000")).toBe(false);
  });
});

describe("redirectAfterLogin er koblet til alle sesjonsbaserte innloggingsspor", () => {
  it("custom-auth eksporterer redirectAfterLogin, og eid-auth (BankID-innlogging) importerer/laster den uten feil", async () => {
    const customAuth = await import("../../../../server/custom-auth");
    expect(typeof customAuth.redirectAfterLogin).toBe("function");

    const eidAuth = await import("../../../../server/eid-auth");
    expect(typeof eidAuth.setupEidAuth).toBe("function");

    const entraAuth = await import("../../../../server/entra-id-auth");
    expect(typeof entraAuth.setupEntraIdAuth).toBe("function");
  });
});
