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
 * verdier tillates i utvikling og i den eksplisitte rotasjonsbanen, men
 * avvises ved ordinær produksjonslesing.
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
} from "crypto";
import { readFileSync, statSync } from "node:fs";
import { isAbsolute } from "node:path";

const V1_PREFIX = "enc:v1:";
const V2_PREFIX = "enc:v2:";
const LEGACY_KEY_ID = "legacy-v1";
const KEY_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
const MAX_KEYRING_FILE_BYTES = 64 * 1024;

export type SecretBoxSource = "environment" | "mounted-file" | "none";

export type SecretBoxRuntimeStatus = {
  configured: boolean;
  productionReady: boolean;
  source: SecretBoxSource;
  activeKeyId: string | null;
  keyCount: number;
  legacyKeyConfigured: boolean;
  reason: "READY" | "NOT_CONFIGURED" | "INVALID_CONFIGURATION";
};

type KeyConfig = {
  activeKeyId: string;
  keys: Map<string, Buffer>;
  legacyV1Keys: Buffer[];
  source: Exclude<SecretBoxSource, "none">;
  versionedKeyCount: number;
  activeIsVersioned: boolean;
  legacyKeyConfigured: boolean;
};

type KeyringMaterial = {
  raw: string;
  source: SecretBoxSource;
};

let cachedSignature: string | undefined;
let cachedConfig: KeyConfig | null | undefined;
let warnedMissingKey = false;

function sourceHint(): SecretBoxSource {
  if ((process.env.TIDUM_SECRET_KEYRING_FILE || "").trim()) return "mounted-file";
  if ((process.env.TIDUM_SECRET_KEYRING || "").trim()) return "environment";
  return "none";
}

function readKeyringMaterial(): KeyringMaterial {
  const inline = (process.env.TIDUM_SECRET_KEYRING || "").trim();
  const filePath = (process.env.TIDUM_SECRET_KEYRING_FILE || "").trim();
  if (inline && filePath) throw new Error("SECRET_KEYRING_SOURCE_CONFLICT");
  if (inline) {
    if (Buffer.byteLength(inline, "utf8") > MAX_KEYRING_FILE_BYTES) {
      throw new Error("SECRET_KEYRING_ENV_TOO_LARGE");
    }
    return { raw: inline, source: "environment" };
  }
  if (!filePath) return { raw: "", source: "none" };
  if (!isAbsolute(filePath)) throw new Error("SECRET_KEYRING_FILE_MUST_BE_ABSOLUTE");

  const stat = statSync(filePath);
  if (!stat.isFile() || stat.size < 2 || stat.size > MAX_KEYRING_FILE_BYTES) {
    throw new Error("SECRET_KEYRING_FILE_INVALID");
  }
  if (
    process.env.NODE_ENV === "production"
    && process.platform !== "win32"
    && (stat.mode & 0o077) !== 0
  ) {
    throw new Error("SECRET_KEYRING_FILE_PERMISSIONS_TOO_OPEN");
  }
  return { raw: readFileSync(filePath, "utf8").trim(), source: "mounted-file" };
}

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
  const material = readKeyringMaterial();
  const keyringRaw = material.raw;
  const requestedActive = process.env.TIDUM_SECRET_ACTIVE_KEY_ID || "";
  const signature = createHash("sha256")
    .update(`${material.source}\u0000${legacy}\u0000${keyringRaw}\u0000${requestedActive}`, "utf8")
    .digest("base64url");
  if (cachedSignature === signature && cachedConfig !== undefined) return cachedConfig;

  const rawKeys = parseKeyring(keyringRaw);
  const versionedKeyIds = new Set(Object.keys(rawKeys));
  const versionedKeyCount = versionedKeyIds.size;
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
  cachedConfig = {
    activeKeyId,
    keys,
    legacyV1Keys,
    source: material.source === "none" ? "environment" : material.source,
    versionedKeyCount,
    activeIsVersioned: versionedKeyIds.has(activeKeyId),
    legacyKeyConfigured: Boolean(legacy),
  };
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

export function getSecretBoxRuntimeStatus(): SecretBoxRuntimeStatus {
  try {
    const config = getKeyConfig();
    if (!config) {
      return {
        configured: false,
        productionReady: false,
        source: "none",
        activeKeyId: null,
        keyCount: 0,
        legacyKeyConfigured: false,
        reason: "NOT_CONFIGURED",
      };
    }
    const productionReady = process.env.NODE_ENV !== "production" || (
      config.versionedKeyCount > 0
      && Boolean((process.env.TIDUM_SECRET_ACTIVE_KEY_ID || "").trim())
      && config.activeIsVersioned
    );
    return {
      configured: true,
      productionReady,
      source: config.source,
      activeKeyId: config.activeKeyId,
      keyCount: config.versionedKeyCount,
      legacyKeyConfigured: config.legacyKeyConfigured,
      reason: productionReady ? "READY" : "INVALID_CONFIGURATION",
    };
  } catch {
    return {
      configured: false,
      productionReady: false,
      source: sourceHint(),
      activeKeyId: null,
      keyCount: 0,
      legacyKeyConfigured: Boolean(process.env.TIDUM_SECRET_KEY),
      reason: "INVALID_CONFIGURATION",
    };
  }
}

export function assertSecretBoxProductionReady(): void {
  if (process.env.NODE_ENV !== "production") return;
  const status = getSecretBoxRuntimeStatus();
  if (!status.productionReady) throw new Error(`SECRET_RUNTIME_${status.reason}`);
}

export function sealSecret(plain: string): string {
  const config = getKeyConfig();
  if (!config) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SECRET_RUNTIME_NOT_CONFIGURED");
    }
    if (!warnedMissingKey) {
      console.warn(
        "[secret-box] Ingen krypteringsnøkkel er satt — utviklingsverdier lagres i klartekst.",
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

export function openSecret(
  stored: string,
  options: { allowLegacyPlaintextForRotation?: boolean } = {},
): string {
  if (!stored.startsWith(V1_PREFIX) && !stored.startsWith(V2_PREFIX)) {
    if (process.env.NODE_ENV === "production" && !options.allowLegacyPlaintextForRotation) {
      throw new Error("LEGACY_PLAINTEXT_SECRET_DISABLED");
    }
    return stored;
  }
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
  return sealSecret(openSecret(stored, { allowLegacyPlaintextForRotation: true }));
}
