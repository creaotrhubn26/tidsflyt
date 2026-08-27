import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import {
  getActiveSecretKeyId,
  isSecretBoxConfigured,
  openSecret,
  sealSecret,
  sealedSecretKeyId,
} from "./secret-box";

const PREFIX = "sdc:v1:";

function requireSecureDialogEncryption(): void {
  if (!isSecretBoxConfigured()) {
    throw new Error("SECURE_DIALOG_ENCRYPTION_NOT_CONFIGURED");
  }
}

/**
 * Innhold krypteres med en tilfeldig datanøkkel. Bare datanøkkelen pakkes med
 * den aktive servernøkkelen. Ved rotasjon endres derfor del 3–4, mens IV,
 * autentiseringstag og innholdschiffer (del 5–7) forblir byte-identiske.
 */
export function sealSecureDialogContent(content: string): string {
  requireSecureDialogEncryption();
  const dataKey = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", dataKey, iv);
  const encrypted = Buffer.concat([cipher.update(content, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const wrappedDataKey = sealSecret(dataKey.toString("base64url"));
  return [
    "sdc",
    "v1",
    getActiveSecretKeyId(),
    Buffer.from(wrappedDataKey, "utf8").toString("base64url"),
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

export function openSecureDialogContent(stored: string): string {
  requireSecureDialogEncryption();
  if (!stored.startsWith(PREFIX)) return openSecret(stored);
  const parts = stored.split(":");
  if (parts.length !== 7) throw new Error("INVALID_SECURE_DIALOG_ENVELOPE");
  const [, , keyId, wrappedB64, ivB64, tagB64, dataB64] = parts;
  const wrapped = Buffer.from(wrappedB64, "base64url").toString("utf8");
  if (sealedSecretKeyId(wrapped) !== keyId) throw new Error("SECURE_DIALOG_KEY_ID_MISMATCH");
  const dataKey = Buffer.from(openSecret(wrapped), "base64url");
  if (dataKey.length !== 32) throw new Error("INVALID_SECURE_DIALOG_DATA_KEY");
  const decipher = createDecipheriv("aes-256-gcm", dataKey, Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function secureDialogContentKeyId(stored: string): string | null {
  if (!stored.startsWith(PREFIX)) return sealedSecretKeyId(stored);
  const parts = stored.split(":");
  return parts.length === 7 ? parts[2] || null : null;
}

export function secureDialogContentNeedsRotation(stored: string): boolean {
  requireSecureDialogEncryption();
  return secureDialogContentKeyId(stored) !== getActiveSecretKeyId();
}

export function rewrapSecureDialogContent(stored: string): string {
  requireSecureDialogEncryption();
  if (!stored.startsWith(PREFIX)) {
    // Énveis oppgradering fra legacy direktekryptering til datanøkkelkonvolutt.
    return sealSecureDialogContent(openSecret(stored, {
      allowLegacyPlaintextForRotation: true,
    }));
  }
  const parts = stored.split(":");
  if (parts.length !== 7) throw new Error("INVALID_SECURE_DIALOG_ENVELOPE");
  if (parts[2] === getActiveSecretKeyId()) return stored;
  const wrapped = Buffer.from(parts[3], "base64url").toString("utf8");
  const dataKey = openSecret(wrapped);
  const rewrapped = sealSecret(dataKey);
  return [
    "sdc",
    "v1",
    getActiveSecretKeyId(),
    Buffer.from(rewrapped, "utf8").toString("base64url"),
    parts[4],
    parts[5],
    parts[6],
  ].join(":");
}
