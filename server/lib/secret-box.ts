/**
 * server/lib/secret-box.ts
 *
 * Forsegling av integrasjonshemmeligheter før de lagres i databasen
 * (AES-256-GCM). Nøkkelen leses fra TIDUM_SECRET_KEY — en vilkårlig
 * streng som strekkes til 32 byte med scrypt og fast salt. Formatet er
 * selvbeskrivende ("enc:v1:<iv>:<tag>:<cipher>", alt base64url), så
 * openSecret kan skille forseglede verdier fra eldre klartekst og
 * returnere sistnevnte uendret (bakoverkompatibilitet med rader lagret
 * før denne modulen fantes).
 *
 * Uten TIDUM_SECRET_KEY lagres verdier i klartekst med en engangs-
 * advarsel i loggen — dev-miljøer skal ikke knekke, men prod skal ha
 * nøkkelen satt.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const PREFIX = "enc:v1:";

let cachedKey: Buffer | null | undefined;
let warnedMissingKey = false;

function getKey(): Buffer | null {
  if (cachedKey !== undefined) return cachedKey;
  const raw = process.env.TIDUM_SECRET_KEY || "";
  if (!raw) {
    cachedKey = null;
    return null;
  }
  // Fast salt er akseptabelt her: input er en server-hemmelighet med høy
  // entropi, ikke et brukerpassord — scrypt brukes kun som nøkkelstrekking.
  cachedKey = scryptSync(raw, "tidum-secret-box-v1", 32);
  return cachedKey;
}

/** True hvis forsegling er aktiv (TIDUM_SECRET_KEY er satt). */
export function isSecretBoxConfigured(): boolean {
  return getKey() !== null;
}

/** Forsegl en hemmelighet for lagring. Klartekst-fallback uten nøkkel. */
export function sealSecret(plain: string): string {
  const key = getKey();
  if (!key) {
    if (!warnedMissingKey) {
      console.warn(
        "[secret-box] TIDUM_SECRET_KEY er ikke satt — integrasjonshemmeligheter lagres i KLARTEKST. Sett nøkkelen i prod."
      );
      warnedMissingKey = true;
    }
    return plain;
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return (
    PREFIX +
    iv.toString("base64url") +
    ":" +
    tag.toString("base64url") +
    ":" +
    encrypted.toString("base64url")
  );
}

/** Åpne en lagret verdi. Verdier uten "enc:v1:"-prefiks returneres som de er. */
export function openSecret(stored: string): string {
  if (!stored.startsWith(PREFIX)) return stored;
  const key = getKey();
  if (!key) {
    throw new Error(
      "[secret-box] Fant forseglet hemmelighet, men TIDUM_SECRET_KEY er ikke satt — kan ikke dekryptere."
    );
  }
  const parts = stored.slice(PREFIX.length).split(":");
  if (parts.length !== 3) throw new Error("[secret-box] Ugyldig forseglet format");
  const [ivB64, tagB64, dataB64] = parts;
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
