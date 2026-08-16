import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomBytes } from "crypto";
import { encryptSecret, decryptSecret, isEncryptedSecret } from "../../../../server/lib/secret-crypto";

describe("secret-crypto", () => {
  const originalKey = process.env.SECRETS_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.SECRETS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  });

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.SECRETS_ENCRYPTION_KEY;
    } else {
      process.env.SECRETS_ENCRYPTION_KEY = originalKey;
    }
  });

  it("krypterer og dekrypterer til samme verdi (rundtur)", () => {
    const plaintext = "super-hemmelig-poweroffice-nokkel";
    const ciphertext = encryptSecret(plaintext);
    expect(ciphertext).not.toBe(plaintext);
    expect(decryptSecret(ciphertext)).toBe(plaintext);
  });

  it("produserer ulik ciphertext for samme plaintext ved to kall (tilfeldig IV)", () => {
    expect(encryptSecret("samme-verdi")).not.toBe(encryptSecret("samme-verdi"));
  });

  it("isEncryptedSecret kjenner igjen kryptert format, ikke klartekst", () => {
    expect(isEncryptedSecret(encryptSecret("verdi"))).toBe(true);
    expect(isEncryptedSecret("ren-klartekst-uten-kolon")).toBe(false);
  });

  it("kaster ved manipulert ciphertext (auth-tag feiler)", () => {
    const ciphertext = encryptSecret("verdi");
    const tampered = ciphertext.slice(0, -4) + "abcd";
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("krever SECRETS_ENCRYPTION_KEY", () => {
    delete process.env.SECRETS_ENCRYPTION_KEY;
    expect(() => encryptSecret("x")).toThrow(/SECRETS_ENCRYPTION_KEY/);
  });
});

describe("isEncryptedSecret hindrer dobbel-kryptering", () => {
  const originalKey = process.env.SECRETS_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.SECRETS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  });

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.SECRETS_ENCRYPTION_KEY;
    } else {
      process.env.SECRETS_ENCRYPTION_KEY = originalKey;
    }
  });

  it("en allerede kryptert verdi krypteres ikke på nytt av et idempotent script-mønster", () => {
    const once = encryptSecret("original-verdi");
    // simulerer scriptets "hopp over hvis allerede kryptert"-sjekk
    const shouldSkip = isEncryptedSecret(once);
    expect(shouldSkip).toBe(true);
  });
});
