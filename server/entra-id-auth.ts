/**
 * server/entra-id-auth.ts
 *
 * Entra ID SSO for kommuneansatte (saksbehandler/barnevernsleder). Multi-
 * tenant Azure AD-app-mønster: Tidum registrerer ÉN app selv
 * (ENTRA_ID_CLIENT_ID/SECRET, globale miljøvariabler), og hver kommune
 * oppgir sin egen Azure-katalog-ID (tidum_kommuner.entra_id_tenant_id).
 *
 * Speiler PKCE/state/token-exchange-mønsteret fra Buypass-integrasjonen i
 * eid-auth.ts, men enklere autentisering (client_secret, ikke en signert
 * client-assertion-JWT — Entra ID krever ikke det for denne flyten).
 *
 * Oppretter ALDRI en ny bruker ved innlogging — kun kobling til en
 * allerede invitert users-rad (kommuneId + email satt av
 * POST /api/kommuner/:id/admins).
 */
import type { Express, RequestHandler } from "express";
import { randomBytes, createHash } from "crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { db } from "./db";
import { authLoginEvents, eidIdentities, kommuner, users } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { hashSsn } from "./lib/eid-hash";
import { getAppBaseUrl } from "./lib/app-base-url";
import { redirectAfterLogin } from "./custom-auth";
import type { AuthUser } from "./lib/auth-types";

declare module "express-session" {
  interface SessionData {
    entraIdOAuth?: {
      state: string;
      nonce: string;
      codeVerifier: string;
      kommuneId: number;
    };
  }
}

const ENTRA_LOGIN_PATH = "/api/auth/entra-id/login";
const ENTRA_CALLBACK_PATH = "/api/auth/entra-id/callback";
const ENTRA_SCOPE = "openid profile email";

// NB: returverdien (AuthUser) bærer bevisst ikke kommuneId — den brukes kun
// til å slå opp raden her, aldri lagret på sesjonen. En fremtidig kommune-
// scopet autorisasjonssjekk MÅ hente kommuneId på nytt fra `users` via
// req.user.id og MÅ feile lukket hvis den mangler — se auth-types.ts.
async function resolveInvitedUser(kommuneId: number, email: string): Promise<AuthUser | null> {
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.kommuneId, kommuneId), eq(users.email, email.toLowerCase().trim())))
    .limit(1);
  if (!user) return null;
  return {
    id: user.id,
    email: user.email || "",
    name: [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.email || "",
    profileImageUrl: user.profileImageUrl,
    provider: "",
    role: user.role || "kommune_saksbehandler",
    vendorId: user.vendorId,
  } as AuthUser;
}

async function upsertEntraIdentity(params: {
  userId: string;
  oid: string;
  kommuneId: number;
  givenName: string | null;
  familyName: string | null;
  fullName: string | null;
  rawClaims: Record<string, unknown>;
}): Promise<void> {
  const ssnHash = hashSsn(`${params.kommuneId}:${params.oid}`);
  await db
    .insert(eidIdentities)
    .values({
      userId: params.userId,
      provider: "entra_id",
      sub: params.oid,
      ssnHash,
      givenName: params.givenName,
      familyName: params.familyName,
      fullName: params.fullName,
      rawClaims: params.rawClaims,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [eidIdentities.userId, eidIdentities.provider],
      set: {
        sub: params.oid,
        ssnHash,
        givenName: params.givenName,
        familyName: params.familyName,
        fullName: params.fullName,
        rawClaims: params.rawClaims,
        updatedAt: new Date(),
      },
    });
}

export async function setupEntraIdAuth(app: Express): Promise<void> {
  const clientId = process.env.ENTRA_ID_CLIENT_ID;
  const clientSecret = process.env.ENTRA_ID_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.warn("[entra-id] ENTRA_ID_CLIENT_ID/ENTRA_ID_CLIENT_SECRET er ikke konfigurert — Entra ID SSO er deaktivert");
    return;
  }

  const redirectUri = `${getAppBaseUrl()}${ENTRA_CALLBACK_PATH}`;

  app.get(ENTRA_LOGIN_PATH, async (req, res) => {
    const kommuneId = parseInt(String(req.query.kommuneId));
    if (!Number.isInteger(kommuneId)) {
      return res.status(400).json({ error: "kommuneId er påkrevd" });
    }

    const [kommune] = await db.select().from(kommuner).where(eq(kommuner.id, kommuneId)).limit(1);
    if (!kommune || !kommune.entraIdTenantId) {
      return res.status(400).json({ error: "Entra ID er ikke konfigurert for denne kommunen ennå" });
    }

    const state = randomBytes(24).toString("base64url");
    const nonce = randomBytes(24).toString("base64url");
    const codeVerifier = randomBytes(32).toString("base64url");
    const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");

    req.session.entraIdOAuth = { state, nonce, codeVerifier, kommuneId };

    const url = new URL(`https://login.microsoftonline.com/${kommune.entraIdTenantId}/oauth2/v2.0/authorize`);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", ENTRA_SCOPE);
    url.searchParams.set("state", state);
    url.searchParams.set("nonce", nonce);
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");

    res.redirect(url.toString());
  });

  app.get(ENTRA_CALLBACK_PATH, async (req, res, next) => {
    try {
      const { code, state } = req.query;
      const stored = req.session.entraIdOAuth;
      delete req.session.entraIdOAuth; // one-shot — hindrer replay av samme state

      if (typeof code !== "string" || typeof state !== "string" || !stored || state !== stored.state) {
        return res.redirect("/?error=eid_failed");
      }

      const [kommune] = await db.select().from(kommuner).where(eq(kommuner.id, stored.kommuneId)).limit(1);
      if (!kommune || !kommune.entraIdTenantId) {
        return res.redirect("/?error=eid_failed");
      }

      const tokenEndpoint = `https://login.microsoftonline.com/${kommune.entraIdTenantId}/oauth2/v2.0/token`;
      const tokenRes = await fetch(tokenEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          client_id: clientId,
          client_secret: clientSecret,
          code_verifier: stored.codeVerifier,
        }),
      });

      if (!tokenRes.ok) {
        const errBody = await tokenRes.text().catch(() => "");
        console.error("[entra-id] Token-utveksling feilet", tokenRes.status, errBody);
        return res.redirect("/?error=eid_failed");
      }

      const tokens = (await tokenRes.json()) as { id_token?: string };
      if (!tokens.id_token) {
        console.error("[entra-id] Token-respons mangler id_token");
        return res.redirect("/?error=eid_failed");
      }

      const jwks = createRemoteJWKSet(
        new URL(`https://login.microsoftonline.com/${kommune.entraIdTenantId}/discovery/v2.0/keys`),
      );
      const { payload: claims } = await jwtVerify(tokens.id_token, jwks, {
        issuer: `https://login.microsoftonline.com/${kommune.entraIdTenantId}/v2.0`,
        audience: clientId,
      });

      if (stored.nonce && claims.nonce !== stored.nonce) {
        return res.redirect("/?error=eid_failed");
      }

      const oid = typeof claims.oid === "string" ? claims.oid : null;
      const email = typeof claims.email === "string" ? claims.email
        : typeof claims.preferred_username === "string" ? claims.preferred_username : null;
      if (!oid || !email) {
        return res.redirect("/?error=eid_missing_claims");
      }

      const resolvedUser = await resolveInvitedUser(stored.kommuneId, email);
      if (!resolvedUser) {
        await db.insert(authLoginEvents).values({ provider: "entra_id", userId: null, sessionId: null, ipAddress: req.ip, userAgent: req.get("user-agent") || null });
        return res.redirect("/?error=eid_not_linked");
      }

      await upsertEntraIdentity({
        userId: resolvedUser.id,
        oid,
        kommuneId: stored.kommuneId,
        givenName: typeof claims.given_name === "string" ? claims.given_name : null,
        familyName: typeof claims.family_name === "string" ? claims.family_name : null,
        fullName: typeof claims.name === "string" ? claims.name : null,
        rawClaims: { ...claims },
      });

      await db.insert(authLoginEvents).values({
        provider: "entra_id",
        userId: resolvedUser.id,
        sessionId: req.sessionID,
        ipAddress: req.ip,
        userAgent: req.get("user-agent") || null,
      });

      req.logIn(resolvedUser, (loginError) => {
        if (loginError) return next(loginError);
        redirectAfterLogin(req, res, resolvedUser, "/dashboard").catch(next);
      });
    } catch (err) {
      console.error("[entra-id] Callback feilet", err);
      return res.redirect("/?error=eid_failed");
    }
  });
}
