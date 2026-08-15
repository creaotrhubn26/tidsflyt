import type { Express, RequestHandler } from "express";
import { CriiptoVerifyExpressRedirect } from "@criipto/verify-express";
import type { JWTPayload } from "jose";
import { db } from "./db";
import { authLoginEvents, eidIdentities, users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { canAccessVendorApiAdmin } from "@shared/roles";
import { hashSsn } from "./lib/eid-hash";
import type { AuthUser } from "./lib/auth-types";
import { getAppBaseUrl } from "./lib/app-base-url";
import { hasSessionAuth } from "./custom-auth";
import { issueMobileTokens } from "./lib/mobile-auth";
import { authRateLimit } from "./rate-limit";

declare global {
  namespace Express {
    interface Request {
      claims?: JWTPayload;
    }
  }
}

// Idura (tidligere Criipto) er brokeren — én OIDC-klient for hele appen.
// BankID velges via acr_values på autoriser-kallet, ikke via en egen
// klient/strategi per eID-metode slik Signicat-modellen krevde. Buypass
// er ikke støttet av Idura og er derfor ikke med her.
const IDURA_LOGIN_PATH = "/api/auth/idura/login";
const IDURA_CALLBACK_PATH = "/api/auth/idura/callback";
const IDURA_ACR_BANKID = process.env.IDURA_ACR_BANKID || "urn:grn:authn:no:bankid";
const IDURA_SSN_CLAIM_KEY = "socialno";

export function requiresEidLogin(role: string | null | undefined): boolean {
  return !canAccessVendorApiAdmin(role);
}

export function buildEidStatus(
  role: string | null | undefined,
  linked: boolean,
  iduraConfigured: boolean,
): { linked: boolean; required: boolean } {
  return { linked, required: requiresEidLogin(role) && iduraConfigured };
}

export async function hasLinkedEid(userId: string): Promise<boolean> {
  try {
    const rows = await db
      .select({ id: eidIdentities.id })
      .from(eidIdentities)
      .where(eq(eidIdentities.userId, userId))
      .limit(1);
    return rows.length > 0;
  } catch (err) {
    console.error("HAS LINKED EID QUERY FAILED", userId, err);
    return false;
  }
}

// Provider-uavhengig oppslag: ssn_hash er kontonøkkelen, ikke provider.
// En bruker koblet via BankID gjenkjennes umiddelbart av et Buypass-
// innloggingsforsøk med samme fnr-hash, og omvendt — matcher kommentaren i
// migrasjon 050 om at "samme person skal matche samme rad uansett om hun
// logger inn med BankID eller Buypass". `provider`-parameteren beskriver
// KUN hvilken metode DENNE innloggingen skjedde med (satt på det returnerte
// AuthUser-objektet), ikke hvilken provider som opprinnelig skrev raden.
export async function resolveUserByEidIdentity(ssnHash: string, provider: string): Promise<AuthUser | null> {
  const [identity] = await db
    .select()
    .from(eidIdentities)
    .where(eq(eidIdentities.ssnHash, ssnHash))
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

// Sjekk om ssn_hash allerede peker på en ANNEN bruker enn den som forsøker å
// koble til — på tvers av provider. Kan ikke uttrykkes som DB-constraint:
// unik-indeksene er (userId, provider) og (ssnHash, provider), ikke ssnHash
// alene, så to ulike brukere kan i prinsippet dele en ssn_hash på tvers av
// provider uten å bryte noen constraint. Denne sjekken er det som hindrer
// at koblingen skjer i utgangspunktet.
export async function findConflictingEidUser(ssnHash: string, currentUserId: string): Promise<boolean> {
  const [existing] = await db
    .select({ userId: eidIdentities.userId })
    .from(eidIdentities)
    .where(eq(eidIdentities.ssnHash, ssnHash))
    .limit(1);
  return Boolean(existing && existing.userId !== currentUserId);
}

async function upsertEidIdentity(params: {
  userId: string;
  provider: string;
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
    console.error("EID IDENTITY WRITE FAILED", params.userId, err);
    throw err;
  }
}

async function logAuthEvent(params: {
  provider: string;
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
    console.error("AUTH LOGIN EVENT WRITE FAILED", params.userId, err);
  }
}

export async function setupEidAuth(app: Express): Promise<void> {
  if (!process.env.EID_SSN_HASH_PEPPER) {
    // Samme filosofi som Google-oppsettet i custom-auth.ts
    // (`if (process.env.GOOGLE_CLIENT_ID && ...)`): manglende credentials
    // deaktiverer KUN denne innloggingsmetoden, tar aldri ned resten av
    // appen. Google/e-post må fortsette å virke uansett Idura-status.
    console.warn("[eid] EID_SSN_HASH_PEPPER er ikke satt — BankID er deaktivert");
    return;
  }

  const domain = process.env.IDURA_DOMAIN;
  const clientID = process.env.IDURA_CLIENT_ID;
  const clientSecret = process.env.IDURA_CLIENT_SECRET;

  if (!domain || !clientID || !clientSecret) {
    console.warn(
      "[eid] IDURA_DOMAIN/IDURA_CLIENT_ID/IDURA_CLIENT_SECRET er ikke konfigurert — BankID er deaktivert",
    );
    return;
  }

  const idura = new CriiptoVerifyExpressRedirect({
    domain,
    clientID,
    clientSecret,
    // Absolutt URL, ikke relativ sti: relativ sti får @criipto/verify-express
    // til å bygge redirect_uri fra req.get('host'), som bak Netlifys _redirects-
    // proxy er tidum-backend.onrender.com (proxyens egen upstream-Host), ikke
    // tidum.no. Idura sender da sluttbrukeren rett til onrender.com — et annet
    // origin enn der økt-cookien (satt uten Domain-attributt, host-only for
    // tidum.no) faktisk finnes, så økten "forsvinner" ved kobling. Samme
    // mønster som getGoogleCallbackUrl() bruker for Google-innlogging.
    redirectUri: `${getAppBaseUrl()}${IDURA_CALLBACK_PATH}`,
    beforeAuthorize: (_req, options) => ({
      ...options,
      scope: "openid ssn",
      acr_values: IDURA_ACR_BANKID,
    }),
  });

  // To ruter, samme middleware+handler. IDURA_LOGIN_PATH er trigger-inngangen
  // knappene peker på; IDURA_CALLBACK_PATH er den eksakte redirect_uri-en
  // registrert i Idura-dashbordet. De MÅ være forskjellige stier: hvis
  // trigger-hitet skjer på nøyaktig samme sti som redirectUri, legger
  // @criipto/verify-express automatisk til en ?returnTo=-parameter på
  // redirect_uri-en den sender til Idura — som da ikke lenger er et eksakt
  // treff mot det registrerte redirect_uri-et (Idura støtter ikke wildcards),
  // og hele autoriseringen feiler med invalid_request. Verifisert i praksis
  // mot test-miljøet, ikke antatt.
  //
  // Kobling vs. innlogging avgjøres av om det allerede finnes en sesjon når
  // callback-steget kjører, ikke av hvilken URL knappen pekte på.
  // force:true hopper alltid over sesjonens claims-cache — hvert klikk skal
  // være en ekte, fersk BankID-autentisering, aldri en gjenbrukt verdi.
  const iduraMiddleware = idura.middleware({ force: true, failureRedirect: "/" }) as unknown as RequestHandler;

  const handleIduraCallback: RequestHandler = async (req, res, next) => {
    try {
        const claims = req.claims;
        if (!claims) {
          return res.redirect("/?error=eid_failed");
        }

        const fnr = claims[IDURA_SSN_CLAIM_KEY];
        if (typeof fnr !== "string" || !fnr) {
          // Logges selv om vi avviser: Idura fakturerer autentiseringen
          // uansett om vi fikk fnr eller ikke (kostnadssporing).
          await logAuthEvent({
            provider: "bankid",
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
        delete rawClaims[IDURA_SSN_CLAIM_KEY];

        if (hasSessionAuth(req) && req.user) {
          // Kobling: bruker er allerede innlogget (Google/e-post), dette er
          // eierskapsbeviset. Skriv koblingen og behold samme innloggede bruker.
          const currentUser = req.user as AuthUser;
          if (await findConflictingEidUser(ssnHash, currentUser.id)) {
            return res.redirect("/?error=eid_already_linked");
          }
          await upsertEidIdentity({
            userId: currentUser.id,
            provider: "bankid",
            sub,
            ssnHash,
            givenName,
            familyName,
            fullName,
            rawClaims,
          });
          await logAuthEvent({
            provider: "bankid",
            userId: currentUser.id,
            sessionId: null, // koblingen fødte ikke økten
            ipAddress: req.ip,
            userAgent: req.get("user-agent") || undefined,
          });
          return res.redirect("/dashboard");
        }

        // Innlogging: slå opp eksisterende kobling. Opprett ALDRI ny bruker.
        const resolvedUser = await resolveUserByEidIdentity(ssnHash, "bankid");
        if (!resolvedUser) {
          await logAuthEvent({
            provider: "bankid",
            userId: null,
            sessionId: null,
            ipAddress: req.ip,
            userAgent: req.get("user-agent") || undefined,
          });
          return res.redirect("/?error=eid_not_linked");
        }

        await logAuthEvent({
          provider: "bankid",
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
        // Denne fnr-hashen er allerede koblet til en ANNEN bruker.
        return res.redirect("/?error=eid_already_linked");
      }
      return next(err);
    }
  };

  app.get(IDURA_LOGIN_PATH, iduraMiddleware, handleIduraCallback);
  app.get(IDURA_CALLBACK_PATH, iduraMiddleware, handleIduraCallback);

  // Mobilappens BankID-innlogging. Egen CriiptoVerifyExpressRedirect-instans
  // fordi redirectUri er fast per instans (biblioteket støtter ingen
  // per-kall override) — samme prinsipp som web-varianten over, bare med et
  // annet fast mål. Kun frittstående innlogging i fase 1: kobling til en
  // allerede innlogget mobil-sesjon er eksplisitt utenfor omfang her, se
  // Global Constraints i planen.
  const IDURA_MOBILE_LOGIN_PATH = "/api/auth/idura/login-mobile";
  const IDURA_MOBILE_CALLBACK_PATH = "/api/auth/idura/callback-mobile";
  const MOBILE_AUTH_CALLBACK_URL = "tidum://auth-callback";

  const iduraMobile = new CriiptoVerifyExpressRedirect({
    domain,
    clientID,
    clientSecret,
    redirectUri: `${getAppBaseUrl()}${IDURA_MOBILE_CALLBACK_PATH}`,
    beforeAuthorize: (_req, options) => ({
      ...options,
      scope: "openid ssn",
      acr_values: IDURA_ACR_BANKID,
    }),
  });
  const iduraMobileMiddleware = iduraMobile.middleware({
    force: true,
    failureRedirect: MOBILE_AUTH_CALLBACK_URL,
  }) as unknown as RequestHandler;

  const handleIduraMobileCallback: RequestHandler = async (req, res, next) => {
    try {
      const claims = req.claims;
      if (!claims) {
        return res.redirect(`${MOBILE_AUTH_CALLBACK_URL}?error=eid_failed`);
      }

      const fnr = claims[IDURA_SSN_CLAIM_KEY];
      if (typeof fnr !== "string" || !fnr) {
        await logAuthEvent({
          provider: "bankid",
          userId: null,
          sessionId: null,
          ipAddress: req.ip,
          userAgent: req.get("user-agent") || undefined,
        });
        return res.redirect(`${MOBILE_AUTH_CALLBACK_URL}?error=eid_missing_ssn`);
      }

      const ssnHash = hashSsn(fnr);
      const resolvedUser = await resolveUserByEidIdentity(ssnHash, "bankid");
      if (!resolvedUser) {
        await logAuthEvent({
          provider: "bankid",
          userId: null,
          sessionId: null,
          ipAddress: req.ip,
          userAgent: req.get("user-agent") || undefined,
        });
        return res.redirect(`${MOBILE_AUTH_CALLBACK_URL}?error=eid_not_linked`);
      }

      await logAuthEvent({
        provider: "bankid",
        userId: resolvedUser.id,
        sessionId: null,
        ipAddress: req.ip,
        userAgent: req.get("user-agent") || undefined,
      });

      const { accessToken, refreshToken, expiresIn } = await issueMobileTokens(resolvedUser.id);
      const redirectUrl = new URL(MOBILE_AUTH_CALLBACK_URL);
      redirectUrl.searchParams.set("access_token", accessToken);
      redirectUrl.searchParams.set("refresh_token", refreshToken);
      redirectUrl.searchParams.set("expires_in", String(expiresIn));
      return res.redirect(redirectUrl.toString());
    } catch (err) {
      return next(err);
    }
  };

  app.get(IDURA_MOBILE_LOGIN_PATH, authRateLimit, iduraMobileMiddleware, handleIduraMobileCallback);
  app.get(IDURA_MOBILE_CALLBACK_PATH, authRateLimit, iduraMobileMiddleware, handleIduraMobileCallback);

  app.get("/api/auth/eid/status", async (req, res) => {
    if (!req.user) {
      return res.status(401).json({ message: "Ikke autentisert" });
    }
    const user = req.user as AuthUser;
    const linked = await hasLinkedEid(user.id);
    res.json(buildEidStatus(user.role, linked, true));
  });
}
