import { createHmac } from "crypto";

export function hashSsn(fnr: string): string {
  const pepper = process.env.EID_SSN_HASH_PEPPER;
  if (!pepper) {
    throw new Error("EID_SSN_HASH_PEPPER is not configured");
  }

  const normalized = fnr.replace(/\s+/g, "");
  return createHmac("sha256", pepper).update(normalized).digest("hex");
}
