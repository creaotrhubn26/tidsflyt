import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { openSecret } from "../lib/secret-box";

interface KommuneFiksConfig {
  fiksKontoId: string;
  fiksPrivateKeyEncrypted: string;
  fiksCertificatePem: string;
}

const MASKINPORTEN_SCOPE = "ks:fiks";

function endpointFor(testMode: boolean): string {
  return testMode ? "https://test.maskinporten.no/token" : "https://maskinporten.no/token";
}

function issuerFor(testMode: boolean): string {
  return testMode ? "https://test.maskinporten.no/" : "https://maskinporten.no/";
}

export async function getMaskinportenToken(
  config: KommuneFiksConfig,
  opts: { testMode?: boolean } = {},
): Promise<string> {
  const testMode = opts.testMode ?? process.env.NODE_ENV !== "production";
  const privateKey = openSecret(config.fiksPrivateKeyEncrypted);

  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    {
      aud: issuerFor(testMode),
      scope: MASKINPORTEN_SCOPE,
      iss: config.fiksKontoId,
      exp: now + 120,
      iat: now,
      jti: crypto.randomUUID(),
    },
    privateKey,
    { algorithm: "RS256" },
  );

  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });

  const res = await fetch(endpointFor(testMode), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Maskinporten-tokenutveksling feilet (${res.status}): ${detail}`);
  }

  const data = await res.json();
  return data.access_token;
}
