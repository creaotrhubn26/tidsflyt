/**
 * AES-256-GCM-forsegling av integrasjonshemmeligheter og datanøkler.
 *
 * Nye verdier bruker et selvbeskrivende, versjonert format:
 *   enc:v2:<key-id>:<iv>:<tag>:<ciphertext>
 *
 * TIDUM_SECRET_KEYRING er et JSON-objekt med nøkkel-ID -> hemmelighet, mens
 * TIDUM_SECRET_ACTIVE_KEY_ID velger nøkkelen som brukes for nye verdier.
 * Legacy TIDUM_SECRET_KEY tas med som "legacy-v1". Gamle nøkkelversjoner må
 * beholdes til alle konvolutter er pakket om.
 *
 * enc:v1-data fra tidligere versjoner kan fortsatt åpnes. Uforseglede legacy-
 * verdier returneres fortsatt uendret for integrasjonskonfigurasjoner, men
 * sikker dialog krever uttrykkelig at nøkkelsettet er konfigurert.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const V1_PREFIX = "enc:v1:";
const V2_PREFIX = "enc:v2:";
const LEGACY_KEY_ID = "legacy-v1";
const KEY_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

type KeyConfig = {
  activeKeyId: string;
  keys: Map<string, Buffer>;
  legacyV1Keys: Buffer[];
};

let cachedSignature: string | undefined;
let cachedConfig: KeyConfig | null | undefined;
let warnedMissingKey = false;

function parseKeyring(raw: string): Record<string, string> {
  if (!raw.trim()) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("TIDUM_SECRET_KEYRING må være et gyldig JSON-objekt");
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("TIDUM_SECRET_KEYRING må være et JSON-objekt");
  }
  const values: Record<string, string> = {};
  for (const [keyId, value] of Object.entries(parsed)) {
    if (!KEY_ID_PATTERN.test(keyId) || typeof value !== "string" || value.length < 32) {
      throw new Error("TIDUM_SECRET_KEYRING inneholder en ugyldig nøkkelversjon");
    }
    values[keyId] = value;
  }
  return values;
}

function getKeyConfig(): KeyConfig | null {
  const legacy = process.env.TIDUM_SECRET_KEY || "";
  const keyringRaw = process.env.TIDUM_SECRET_KEYRING || "";
  const requestedActive = process.env.TIDUM_SECRET_ACTIVE_KEY_ID || "";
  const signature = `${legacy}\u0000${keyringRaw}\u0000${requestedActive}`;
  if (cachedSignature === signature && cachedConfig !== undefined) return cachedConfig;

  const rawKeys = parseKeyring(keyringRaw);
  if (legacy && !rawKeys[LEGACY_KEY_ID]) rawKeys[LEGACY_KEY_ID] = legacy;
  const keyIds = Object.keys(rawKeys);
  if (keyIds.length === 0) {
    cachedSignature = signature;
    cachedConfig = null;
    return null;
  }

  const activeKeyId = requestedActive || (keyIds.length === 1 ? keyIds[0] : "");
  if (!activeKeyId || !rawKeys[activeKeyId]) {
    throw new Error("TIDUM_SECRET_ACTIVE_KEY_ID må peke på en nøkkel i TIDUM_SECRET_KEYRING");
  }

  const keys = new Map<string, Buffer>();
  const legacyV1Keys: Buffer[] = [];
  const seenRaw = new Set<string>();
  for (const [keyId, raw] of Object.entries(rawKeys)) {
    // Høyentropisk serverhemmelighet, ikke brukerpassord. Nøkkel-ID i saltet
    // gir domeneseparasjon mellom versjoner.
    keys.set(keyId, scryptSync(raw, `tidum-secret-box:${keyId}`, 32));
    if (!seenRaw.has(raw)) {
      seenRaw.add(raw);
      legacyV1Keys.push(scryptSync(raw, "tidum-secret-box-v1", 32));
    }
  }

  cachedSignature = signature;
  cachedConfig = { activeKeyId, keys, legacyV1Keys };
  return cachedConfig;
}

export function isSecretBoxConfigured(): boolean {
  return getKeyConfig() !== null;
}

export function getActiveSecretKeyId(): string {
  const config = getKeyConfig();
  if (!config) throw new Error("SECRET_KEY_NOT_CONFIGURED");
  return config.activeKeyId;
}

export function sealSecret(plain: string): string {
  const config = getKeyConfig();
  if (!config) {
    if (!warnedMissingKey) {
      console.warn(
        "[secret-box] Ingen krypteringsnøkkel er satt — integrasjonshemmeligheter lagres i KLARTEKST. Sett nøkkelsettet i prod.",
      );
      warnedMissingKey = true;
    }
    return plain;
  }
  const key = config.keys.get(config.activeKeyId)!;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    "enc",
    "v2",
    config.activeKeyId,
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

export function openSecret(stored: string): string {
  if (!stored.startsWith(V1_PREFIX) && !stored.startsWith(V2_PREFIX)) return stored;
  const config = getKeyConfig();
  if (!config) {
    throw new Error("[secret-box] Fant forseglet verdi, men ingen krypteringsnøkkel er satt.");
  }

  if (stored.startsWith(V2_PREFIX)) {
    const parts = stored.slice(V2_PREFIX.length).split(":");
    if (parts.length !== 4) throw new Error("[secret-box] Ugyldig forseglet format");
    const [keyId, ivB64, tagB64, dataB64] = parts;
    const key = config.keys.get(keyId);
    if (!key) throw new Error(`[secret-box] Mangler nøkkelversjon ${keyId}`);
    return decrypt(key, ivB64, tagB64, dataB64);
  }

  const parts = stored.slice(V1_PREFIX.length).split(":");
  if (parts.length !== 3) throw new Error("[secret-box] Ugyldig forseglet format");
  const [ivB64, tagB64, dataB64] = parts;
  for (const key of config.legacyV1Keys) {
    try {
      return decrypt(key, ivB64, tagB64, dataB64);
    } catch {
      // AES-GCM avviser feil nøkkel; prøv neste historiske versjon.
    }
  }
  throw new Error("[secret-box] Ingen konfigurert nøkkel kunne åpne legacy-konvolutten");
}

function decrypt(key: Buffer, ivB64: string, tagB64: string, dataB64: string): string {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function sealedSecretKeyId(stored: string): string | null {
  if (stored.startsWith(V2_PREFIX)) return stored.slice(V2_PREFIX.length).split(":", 1)[0] || null;
  if (stored.startsWith(V1_PREFIX)) return "legacy-unversioned";
  return null;
}

export function rewrapSecret(stored: string): string {
  if (sealedSecretKeyId(stored) === getActiveSecretKeyId()) return stored;
  return sealSecret(openSecret(stored));
}
