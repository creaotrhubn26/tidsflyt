import { randomBytes, createCipheriv, createDecipheriv } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM anbefalt IV-lengde

function requireKey(): Buffer {
  const key = process.env.SECRETS_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("SECRETS_ENCRYPTION_KEY er ikke konfigurert");
  }
  const buf = Buffer.from(key, "base64");
  if (buf.length !== 32) {
    throw new Error("SECRETS_ENCRYPTION_KEY må være 32 byte (base64-kodet)");
  }
  return buf;
}

export function encryptSecret(plaintext: string): string {
  const key = requireKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${ciphertext.toString("base64")}`;
}

export function decryptSecret(value: string): string {
  const key = requireKey();
  const [ivB64, authTagB64, ciphertextB64] = value.split(":");
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error("Ugyldig kryptert format — forventet iv:authTag:ciphertext");
  }
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

export function isEncryptedSecret(value: string): boolean {
  const parts = value.split(":");
  if (parts.length !== 3) return false;
  return parts.every((p) => /^[A-Za-z0-9+/]+=*$/.test(p) && p.length > 0);
}
