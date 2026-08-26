import crypto from "node:crypto";
import { describe, it, expect, vi, afterEach } from "vitest";
import { getMaskinportenToken } from "../../fiks-io/maskinporten-client";
import { sealSecret } from "../secret-box";

describe("fiks-io/maskinporten-client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("henter token fra riktig test-endepunkt med scope ks:fiks og signert JWT-assertion", async () => {
    vi.stubEnv("NODE_ENV", "test");
    // openSecret krever ekte forseglet format og RS256 krever en ekte PEM-
    // nøkkel — bruk en genererte engangs-RSA-nøkkel, ikke en vilkårlig streng.
    vi.stubEnv("TIDUM_SECRET_KEY", "test-only-key-for-maskinporten-client-test");
    const { privateKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs1", format: "pem" },
      publicKeyEncoding: { type: "pkcs1", format: "pem" },
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "test-token-123", expires_in: 120 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const token = await getMaskinportenToken({
      fiksKontoId: "test-konto",
      fiksPrivateKeyEncrypted: sealSecret(privateKey),
      fiksCertificatePem: "-----BEGIN CERTIFICATE-----\ndummy\n-----END CERTIFICATE-----",
    }, { testMode: true });

    expect(token).toBe("test-token-123");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://test.maskinporten.no/token",
      expect.objectContaining({ method: "POST" }),
    );
    const [, options] = fetchMock.mock.calls[0];
    expect(String(options.body)).toContain("grant_type=");
  });

  it("kaster feil hvis Maskinporten svarer med feil", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => "unauthorized" }));
    await expect(
      getMaskinportenToken({
        fiksKontoId: "test-konto",
        fiksPrivateKeyEncrypted: "enc:v1:dummy",
        fiksCertificatePem: "dummy",
      }, { testMode: true }),
    ).rejects.toThrow();
  });
});
