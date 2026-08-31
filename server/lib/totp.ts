import { authenticator } from "otplib";
import { randomBytes, createHash } from "crypto";
import { sealSecret, openSecret } from "./secret-box";
import { db } from "../db";
import { adminTotpCredentials } from "@shared/schema";
import { eq } from "drizzle-orm";

export function generateRecoveryCodes(): string[] {
  return Array.from({ length: 10 }, () => {
    const raw = randomBytes(5).toString("hex").toUpperCase();
    return `${raw.slice(0, 5)}-${raw.slice(5, 10)}`;
  });
}

export function hashTotpRecoveryCode(code: string): string {
  return createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
}

export function verifyTotpCode(encryptedSecret: string, code: string): boolean {
  const secret = openSecret(encryptedSecret);
  return authenticator.verify({ token: code, secret });
}

export async function hasTotpEnrolled(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: adminTotpCredentials.id })
    .from(adminTotpCredentials)
    .where(eq(adminTotpCredentials.userId, userId))
    .limit(1);
  return Boolean(row);
}

export async function verifyTotpOrRecoveryCode(userId: string, code: string): Promise<boolean> {
  const [row] = await db
    .select()
    .from(adminTotpCredentials)
    .where(eq(adminTotpCredentials.userId, userId))
    .limit(1);
  if (!row) return false;

  // En kastet feil her (typisk dekrypteringsfeil fordi TIDUM_SECRET_KEY(RING)
  // er rotert/mangler) må IKKE hoppe over gjenopprettingskodene under —
  // nøyaktig det scenarioet er grunnen til at de finnes. Behandles som
  // "koden matchet ikke".
  let totpMatched = false;
  try {
    totpMatched = verifyTotpCode(row.totpSecretEncrypted, code);
  } catch (err) {
    console.error("[totp] kunne ikke verifisere TOTP-koden, faller tilbake til gjenopprettingskode:", err);
  }

  if (totpMatched) {
    await db
      .update(adminTotpCredentials)
      .set({ lastUsedAt: new Date() })
      .where(eq(adminTotpCredentials.userId, userId));
    return true;
  }

  const hashedInput = hashTotpRecoveryCode(code);
  const remaining = (row.recoveryCodesHashed as string[]).filter((h) => h !== hashedInput);
  if (remaining.length < (row.recoveryCodesHashed as string[]).length) {
    await db
      .update(adminTotpCredentials)
      .set({ recoveryCodesHashed: remaining, lastUsedAt: new Date() })
      .where(eq(adminTotpCredentials.userId, userId));
    return true;
  }

  return false;
}

export { sealSecret as encryptTotpSecret };
export { authenticator };
