import * as client from "openid-client";
import { Strategy, type VerifyFunctionWithRequest } from "openid-client/passport";
import passport from "passport";
import type { Express } from "express";
import { db } from "./db";
import { authLoginEvents, eidIdentities, users } from "@shared/schema";
import { and, eq } from "drizzle-orm";
import { canAccessVendorApiAdmin } from "@shared/roles";
import { getEidCallbackUrl } from "./lib/app-base-url";
import { hashSsn } from "./lib/eid-hash";
import type { AuthUser } from "./lib/auth-types";

export type EidProvider = "bankid" | "buypass";

interface EidProviderConfig {
  clientIdEnv: string;
  clientSecretEnv: string;
  scope: string;
  ssnClaimKey: string;
}

// BankID først (Task 3). Buypass legges til i Task 6 med samme struktur —
// annet scope og annen claim-nøkkel for fødselsnummer, se skillens tabell.
export const EID_PROVIDERS: Record<EidProvider, EidProviderConfig> = {
  bankid: {
    clientIdEnv: "SIGNICAT_BANKID_CLIENT_ID",
    clientSecretEnv: "SIGNICAT_BANKID_CLIENT_SECRET",
    scope: "openid ssn",
    ssnClaimKey: "socialno",
  },
  buypass: {
    clientIdEnv: "SIGNICAT_BUYPASS_CLIENT_ID",
    clientSecretEnv: "SIGNICAT_BUYPASS_CLIENT_SECRET",
    scope: "openid bpnnin",
    ssnClaimKey: "bp_nnin_sub",
  },
};

export function requiresEidLogin(role: string | null | undefined): boolean {
  return !canAccessVendorApiAdmin(role);
}

export function buildEidStatus(
  role: string | null | undefined,
  linked: boolean,
  anyProviderRegistered: boolean,
): { linked: boolean; required: boolean } {
  return { linked, required: requiresEidLogin(role) && anyProviderRegistered };
}

export async function hasLinkedEid(userId: string): Promise<boolean> {
  // Fail-safe, not fail-closed: any error here (e.g. eid_identities missing
  // because a migration hasn't run yet) must never block Google/e-post login
  // for every role. Worst case a user who should be forced to eID gets one
  // more non-eID login before the gate catches up — far better than an outage.
  try {
    const rows = await db
      .select({ id: eidIdentities.id })
      .from(eidIdentities)
      .where(eq(eidIdentities.userId, userId))
      .limit(1);
    return rows.length > 0;
  } catch (err) {
    console.error("[eid] hasLinkedEid query failed — treating as not linked", userId, err);
    return false;
  }
}

async function resolveUserByEidIdentity(
  provider: EidProvider,
  ssnHash: string,
): Promise<AuthUser | null> {
  const [identity] = await db
    .select()
    .from(eidIdentities)
    .where(and(eq(eidIdentities.provider, provider), eq(eidIdentities.ssnHash, ssnHash)))
    .limit(1);

  if (!identity) return null;

  const [user] = await db.select().from(users).where(eq(users.id, identity.userId)).limit(1);
  if (!user) return null;

  return {
    id: user.id,
    email: user.email || "",
    name: [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.email || "",
    profileImageUrl: user.profileImageUrl,
    provider,
    role: user.role || "member",
    vendorId: user.vendorId,
  };
}

async function upsertEidIdentity(params: {
  userId: string;
  provider: EidProvider;
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
        provider: params.provider,
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
    console.error("EID IDENTITY WRITE FAILED", params.userId, params.provider, err);
    throw err;
  }
}

async function logAuthEvent(params: {
  provider: EidProvider;
  userId: string | null;
  sessionId: string | null;
  ipAddress: string | undefined;
  userAgent: string | undefined;
}): Promise<void> {
  try {
    await db.insert(authLoginEvents).values({
      provider: params.provider,
      userId: params.userId,
      sessionId: params.sessionId,
      ipAddress: params.ipAddress || null,
      userAgent: params.userAgent || null,
    });
  } catch (err) {
    console.error("AUTH LOGIN EVENT WRITE FAILED", params.provider, params.userId, err);
  }
}

// Brukes av /eid/link/:provider og /eid/status til å vite hvilke providere
// som faktisk fikk en Strategy registrert (kan være færre enn EID_PROVIDERS
// hvis Signicat-credentials for én av dem ikke er satt ennå).
const registeredProviders = new Set<EidProvider>();

export async function setupEidAuth(app: Express): Promise<void> {
  if (!process.env.EID_SSN_HASH_PEPPER) {
    // Samme filosofi som Google-oppsettet lenger ned i custom-auth.ts
    // (`if (process.env.GOOGLE_CLIENT_ID && ...)`): manglende credentials
    // deaktiverer KUN denne innloggingsmetoden, tar aldri ned resten av
    // appen. Google/e-post må fortsette å virke uansett Signicat-status.
    console.warn("[eid] EID_SSN_HASH_PEPPER er ikke satt — BankID/Buypass er deaktivert");
    return;
  }

  await registerProvider(app, "bankid");
  await registerProvider(app, "buypass");

  app.get("/api/auth/eid/link/:provider", (req, res, next) => {
    const provider = req.params.provider as EidProvider;
    if (!registeredProviders.has(provider)) {
      return res.status(500).json({ error: "Denne eID-leverandøren er ikke konfigurert" });
    }
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Ikke autentisert" });
    }
    passport.authenticate(`eid:${provider}`)(req, res, next);
  });

  app.get("/api/auth/eid/status", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Ikke autentisert" });
    }
    const user = req.user as AuthUser;
    const linked = await hasLinkedEid(user.id);
    res.json(buildEidStatus(user.role, linked, registeredProviders.size > 0));
  });
}

async function registerProvider(app: Express, provider: EidProvider): Promise<void> {
  const config = EID_PROVIDERS[provider];
  const issuerUrl = process.env.SIGNICAT_ISSUER_URL;
  const clientId = process.env[config.clientIdEnv];
  const clientSecret = process.env[config.clientSecretEnv];

  if (!issuerUrl || !clientId || !clientSecret) {
    console.warn(
      `[eid:${provider}] ikke konfigurert (mangler SIGNICAT_ISSUER_URL, ${config.clientIdEnv} eller ${config.clientSecretEnv}) — hopper over registrering`,
    );
    return;
  }

  const strategyName = `eid:${provider}`;
  // Discovery må være ferdig FØR Strategy konstrueres — konstruktøren leser
  // config synkront. setupEidAuth awaiter dette før routes.ts starter
  // serveren, så ingen request kan treffe ruten før strategien er klar.
  //
  // I try/catch: en nede/utilgjengelig Signicat (DNS, nettverk, rotert
  // secret, discovery som feiler) skal ALDRI kunne ta ned serverstart,
  // samme filosofi som manglende env-vars-tidligavbruddet over.
  let oidcConfig: Awaited<ReturnType<typeof client.discovery>>;
  try {
    oidcConfig = await client.discovery(new URL(issuerUrl), clientId, clientSecret);
  } catch (err) {
    console.warn(`[eid:${provider}] discovery mot Signicat feilet — hopper over registrering`, err);
    return;
  }

  const verify: VerifyFunctionWithRequest = async (req, tokens, verified) => {
    try {
      const claims: Record<string, unknown> = tokens.claims() || {};
      console.log(`[eid:${provider}] claim keys on first token:`, Object.keys(claims));

      const fnr = claims[config.ssnClaimKey];
      if (typeof fnr !== "string" || !fnr) {
        // Logges selv om vi avviser: Signicat fakturerer autentiseringen
        // uansett om vi fikk fnr eller ikke (regel 5 — kostnadssporing).
        await logAuthEvent({
          provider,
          userId: null,
          sessionId: null,
          ipAddress: req.ip,
          userAgent: req.get("user-agent") || undefined,
        });
        return verified(null, false, { message: "eid_missing_ssn" });
      }

      const ssnHash = hashSsn(fnr);
      const sub = String(claims.sub);
      const givenName = typeof claims.given_name === "string" ? claims.given_name : null;
      const familyName = typeof claims.family_name === "string" ? claims.family_name : null;
      const fullName = typeof claims.name === "string" ? claims.name : null;
      const rawClaims = { ...claims };
      delete rawClaims[config.ssnClaimKey];

      if (req.isAuthenticated() && req.user) {
        // Kobling: bruker er allerede innlogget (Google/e-post), dette er
        // eierskapsbeviset. Skriv koblingen og behold samme innloggede bruker.
        await upsertEidIdentity({
          userId: (req.user as AuthUser).id,
          provider,
          sub,
          ssnHash,
          givenName,
          familyName,
          fullName,
          rawClaims,
        });
        await logAuthEvent({
          provider,
          userId: (req.user as AuthUser).id,
          sessionId: null, // koblingen fødte ikke økten
          ipAddress: req.ip,
          userAgent: req.get("user-agent") || undefined,
        });
        return verified(null, req.user as AuthUser);
      }

      // Innlogging: slå opp eksisterende kobling. Opprett ALDRI ny bruker.
      const resolvedUser = await resolveUserByEidIdentity(provider, ssnHash);
      if (!resolvedUser) {
        await logAuthEvent({
          provider,
          userId: null,
          sessionId: null,
          ipAddress: req.ip,
          userAgent: req.get("user-agent") || undefined,
        });
        return verified(null, false, { message: "eid_not_linked" });
      }

      await logAuthEvent({
        provider,
        userId: resolvedUser.id,
        sessionId: req.sessionID,
        ipAddress: req.ip,
        userAgent: req.get("user-agent") || undefined,
      });

      return verified(null, resolvedUser);
    } catch (err) {
      // Unique-constraint-brudd på eid_identities_ssn_provider_key: denne
      // fnr-en er allerede koblet til en ANNEN bruker. Beskyttelsen virker
      // som tiltenkt — bare gi brukeren en forståelig feilmelding i stedet
      // for en rå 500.
      if ((err as { code?: string })?.code === "23505") {
        return verified(null, false, { message: "eid_already_linked" });
      }
      return verified(err as Error);
    }
  };

  passport.use(
    strategyName,
    new Strategy(
      {
        name: strategyName,
        config: oidcConfig,
        callbackURL: getEidCallbackUrl(provider),
        scope: config.scope,
        passReqToCallback: true,
      },
      verify,
    ),
  );
  registeredProviders.add(provider);

  app.get(`/api/auth/${provider}/login`, passport.authenticate(strategyName));

  app.get(`/api/auth/${provider}/callback`, (req, res, next) => {
    passport.authenticate(strategyName, (err: Error | null, user: AuthUser | false, info?: { message?: string }) => {
      if (err) return next(err);
      if (!user) {
        const errorCode = info?.message || "eid_failed";
        return res.redirect(`/?error=${errorCode}`);
      }
      req.logIn(user, (loginError) => {
        if (loginError) return next(loginError);
        return res.redirect("/dashboard");
      });
    })(req, res, next);
  });
}
