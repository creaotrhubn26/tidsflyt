import type { Express, Request, RequestHandler } from "express";
import { discovery, buildAuthorizationUrl, authorizationCodeGrant, randomState, randomPKCECodeVerifier, calculatePKCECodeChallenge } from "openid-client";
import type { Configuration } from "openid-client";
import { hasSessionAuth } from "./custom-auth";
import { hasLinkedEid, resolveUserByEidIdentity } from "./eid-auth";
import { hashSsn } from "./lib/eid-hash";
import { getAppBaseUrl } from "./lib/app-base-url";
import { authRateLimit } from "./rate-limit";
import { db } from "./db";
import { authLoginEvents, eidIdentities } from "@shared/schema";
import type { AuthUser } from "./lib/auth-types";

const BUYPASS_LOGIN_PATH = "/api/auth/buypass/login";
const BUYPASS_CALLBACK_PATH = "/api/auth/buypass/callback";
// Ikke offentlig dokumentert av Buypass — konfigurerbar til dere ser et ekte
// utstedt token fra deres realm. Se spec §"Kjente fakta" for detaljer.
const BUYPASS_SSN_CLAIM_KEY = process.env.BUYPASS_SSN_CLAIM_KEY || "national_identity_number";

function getSessionBag(req: Request): Record<string, unknown> {
  return req.session as unknown as Record<string, unknown>;
}

async function upsertBuypassIdentity(params: {
  userId: string;
  sub: string;
  ssnHash: string;
  givenName: string | null;
  familyName: string | null;
  fullName: string | null;
  rawClaims: Record<string, unknown>;
}): Promise<void> {
  try {
    await db
      .insert(eidIdentities)
      .values({
        userId: params.userId,
        provider: "buypass",
        sub: params.sub,
        ssnHash: params.ssnHash,
        givenName: params.givenName,
        familyName: params.familyName,
        fullName: params.fullName,
        rawClaims: params.rawClaims,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [eidIdentities.userId, eidIdentities.provider],
        set: {
          sub: params.sub,
          ssnHash: params.ssnHash,
          givenName: params.givenName,
          familyName: params.familyName,
          fullName: params.fullName,
          rawClaims: params.rawClaims,
          updatedAt: new Date(),
        },
      });
  } catch (err) {
    console.error("BUYPASS IDENTITY WRITE FAILED", params.userId, err);
    throw err;
  }
}

async function logBuypassAuthEvent(params: {
  userId: string | null;
  sessionId: string | null;
  ipAddress: string | undefined;
  userAgent: string | undefined;
}): Promise<void> {
  try {
    await db.insert(authLoginEvents).values({
      provider: "buypass",
      userId: params.userId,
      sessionId: params.sessionId,
      ipAddress: params.ipAddress || null,
      userAgent: params.userAgent || null,
    });
  } catch (err) {
    console.error("BUYPASS AUTH LOGIN EVENT WRITE FAILED", params.userId, err);
  }
}

export async function setupBuypassAuth(app: Express): Promise<void> {
  if (!process.env.EID_SSN_HASH_PEPPER) {
    console.warn("[buypass] EID_SSN_HASH_PEPPER er ikke satt — Buypass er deaktivert");
    return;
  }

  const issuerUrl = process.env.BUYPASS_ISSUER_URL;
  const clientId = process.env.BUYPASS_CLIENT_ID;
  const clientSecret = process.env.BUYPASS_CLIENT_SECRET;

  if (!issuerUrl || !clientId || !clientSecret) {
    console.warn(
      "[buypass] BUYPASS_ISSUER_URL/BUYPASS_CLIENT_ID/BUYPASS_CLIENT_SECRET er ikke konfigurert — Buypass er deaktivert",
    );
    return;
  }

  const config: Configuration = await discovery(new URL(issuerUrl), clientId, { client_secret: clientSecret });

  const buypassRedirectUri = `${getAppBaseUrl()}${BUYPASS_CALLBACK_PATH}`;

  app.get(BUYPASS_LOGIN_PATH, authRateLimit, async (req, res, next) => {
    try {
      const state = randomState();
      const codeVerifier = randomPKCECodeVerifier();
      const codeChallenge = await calculatePKCECodeChallenge(codeVerifier);
      const bag = getSessionBag(req);
      bag.buypassState = state;
      bag.buypassCodeVerifier = codeVerifier;

      const authUrl = buildAuthorizationUrl(config, {
        redirect_uri: buypassRedirectUri,
        scope: "openid",
        state,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
      });
      res.redirect(authUrl.href);
    } catch (err) {
      next(err);
    }
  });

  app.get(BUYPASS_CALLBACK_PATH, authRateLimit, async (req, res, next) => {
    try {
      const bag = getSessionBag(req);
      const expectedState = bag.buypassState as string | undefined;
      const pkceCodeVerifier = bag.buypassCodeVerifier as string | undefined;
      if (!expectedState || !pkceCodeVerifier) {
        return res.redirect("/?error=eid_failed");
      }

      const currentUrl = new URL(req.originalUrl, getAppBaseUrl());
      const tokens = await authorizationCodeGrant(config, currentUrl, {
        expectedState,
        pkceCodeVerifier,
      });
      const claims = tokens.claims();
      if (!claims) {
        return res.redirect("/?error=eid_failed");
      }

      const fnr = claims[BUYPASS_SSN_CLAIM_KEY];
      if (typeof fnr !== "string" || !fnr) {
        await logBuypassAuthEvent({
          userId: null,
          sessionId: null,
          ipAddress: req.ip,
          userAgent: req.get("user-agent") || undefined,
        });
        return res.redirect("/?error=eid_missing_ssn");
      }

      const ssnHash = hashSsn(fnr);
      const sub = typeof claims.sub === "string" ? claims.sub : String(claims.sub);
      const givenName = typeof claims.given_name === "string" ? claims.given_name : null;
      const familyName = typeof claims.family_name === "string" ? claims.family_name : null;
      const fullName = typeof claims.name === "string" ? claims.name : null;
      const rawClaims: Record<string, unknown> = { ...claims };
      delete rawClaims[BUYPASS_SSN_CLAIM_KEY];

      if (hasSessionAuth(req) && req.user) {
        const currentUser = req.user as AuthUser;
        await upsertBuypassIdentity({
          userId: currentUser.id,
          sub,
          ssnHash,
          givenName,
          familyName,
          fullName,
          rawClaims,
        });
        await logBuypassAuthEvent({
          userId: currentUser.id,
          sessionId: null,
          ipAddress: req.ip,
          userAgent: req.get("user-agent") || undefined,
        });
        return res.redirect("/dashboard");
      }

      const resolvedUser = await resolveUserByEidIdentity(ssnHash, "buypass");
      if (!resolvedUser) {
        await logBuypassAuthEvent({
          userId: null,
          sessionId: null,
          ipAddress: req.ip,
          userAgent: req.get("user-agent") || undefined,
        });
        return res.redirect("/?error=eid_not_linked");
      }

      await logBuypassAuthEvent({
        userId: resolvedUser.id,
        sessionId: req.sessionID,
        ipAddress: req.ip,
        userAgent: req.get("user-agent") || undefined,
      });

      req.logIn(resolvedUser, (loginError) => {
        if (loginError) return next(loginError);
        return res.redirect("/dashboard");
      });
    } catch (err) {
      if ((err as { code?: string })?.code === "23505") {
        return res.redirect("/?error=eid_already_linked");
      }
      return next(err);
    }
  });
}
