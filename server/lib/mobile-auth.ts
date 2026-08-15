import jwt from "jsonwebtoken";
import { randomBytes, createHash } from "crypto";
import { db } from "../db";
import { mobileRefreshTokens } from "@shared/schema";
import { eq } from "drizzle-orm";

export const MOBILE_ACCESS_TOKEN_TTL_SECONDS = 60 * 60; // 1 time
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dager

// Egen hemmelighet, ikke delt med e-post-magic-link-tokenene i custom-auth.ts —
// samme isolasjonsprinsipp som EID_SSN_HASH_PEPPER: en kompromittert
// mobil-hemmelighet skal aldri kunne forfalske en annen tokentype.
function requireSecret(): string {
  const secret = process.env.MOBILE_JWT_SECRET;
  if (!secret) {
    throw new Error("MOBILE_JWT_SECRET er ikke konfigurert");
  }
  return secret;
}

export function signAccessToken(userId: string): string {
  return jwt.sign({ sub: userId }, requireSecret(), { expiresIn: MOBILE_ACCESS_TOKEN_TTL_SECONDS });
}

export function verifyAccessToken(token: string): string {
  const payload = jwt.verify(token, requireSecret()) as jwt.JwtPayload;
  if (typeof payload.sub !== "string") {
    throw new Error("Ugyldig mobil-token: mangler sub");
  }
  return payload.sub;
}

function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function issueMobileTokens(
  userId: string,
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const accessToken = signAccessToken(userId);
  const refreshToken = randomBytes(32).toString("hex");
  await db.insert(mobileRefreshTokens).values({
    userId,
    tokenHash: hashRefreshToken(refreshToken),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
  });
  return { accessToken, refreshToken, expiresIn: MOBILE_ACCESS_TOKEN_TTL_SECONDS };
}

export async function refreshMobileAccessToken(
  refreshToken: string,
): Promise<{ accessToken: string; expiresIn: number } | null> {
  const tokenHash = hashRefreshToken(refreshToken);
  const [row] = await db
    .select()
    .from(mobileRefreshTokens)
    .where(eq(mobileRefreshTokens.tokenHash, tokenHash))
    .limit(1);
  if (!row || row.revokedAt || row.expiresAt.getTime() < Date.now()) {
    return null;
  }
  return { accessToken: signAccessToken(row.userId), expiresIn: MOBILE_ACCESS_TOKEN_TTL_SECONDS };
}

export async function revokeMobileRefreshToken(refreshToken: string): Promise<void> {
  const tokenHash = hashRefreshToken(refreshToken);
  await db
    .update(mobileRefreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(mobileRefreshTokens.tokenHash, tokenHash));
}
