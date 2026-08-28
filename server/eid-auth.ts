import type { Express, RequestHandler } from "express";
import { CriiptoVerifyExpressRedirect } from "@criipto/verify-express";
import { SignJWT, importPKCS8, createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { randomBytes, createHash } from "crypto";
import { db } from "./db";
import { authLoginEvents, eidIdentities, users } from "@shared/schema";
import { and, eq } from "drizzle-orm";
import { canAccessVendorApiAdmin } from "@shared/roles";
import { hashSsn } from "./lib/eid-hash";
import type { AuthUser } from "./lib/auth-types";
import { getAppBaseUrl } from "./lib/app-base-url";
import { hasSessionAuth, redirectAfterLogin } from "./custom-auth";
import { issueMobileTokens } from "./lib/mobile-auth";
import { authRateLimit } from "./rate-limit";

declare global {
  namespace Express {
    interface Request {
      claims?: JWTPayload;
    }
  }
}

declare module "express-session" {
  interface SessionData {
    // Kortlevd PKCE/CSRF-tilstand for Buypass sin authorization_code-flyt.
    // Slettes (one-shot) idet callback-steget leser den.
    buypassOAuth?: {
      state: string;
      nonce: string;
      codeVerifier: string;
    };
  }
}

// Idura (tidligere Criipto) er brokeren for BankID — én OIDC-klient for hele
// appen, BankID velges via acr_values på autoriser-kallet. Idura støtter ikke
// Buypass, så Buypass er en egen, direkte OIDC-klient mot Buypass ID lenger
// ned i denne filen — ikke via Idura.
const IDURA_LOGIN_PATH = "/api/auth/idura/login";
const IDURA_CALLBACK_PATH = "/api/auth/idura/callback";
const IDURA_ACR_BANKID = process.env.IDURA_ACR_BANKID || "urn:grn:authn:no:bankid";
const IDURA_SSN_CLAIM_KEY = "socialno";

// Buypass ID — direkte OIDC, ikke via Idura. Fødselsnummer krever scopet
// `bpnnin` og kommer tilbake i claimet `bp_nnin_sub` (IKKE `socialno` som hos
// BankID/Idura).
//
// Bekreftet mot Buypass sin egen OIDC-discovery (auth.tsp.buypass.no/auth/
// realms/buypassid/.well-known/openid-configuration) at BuypassID kun
// autentiserer klienten med `private_key_jwt` — IKKE client_secret og IKKE
// mTLS på selve TLS-forbindelsen. Certifikatet brukes til å SIGNERE en
// client assertion-JWT som sendes i selve token-kallet, matcher Keycloaks
// «Signed JWT with Client Certificate»-autentikator (derav at Buypass krever
// nettopp et sertifikat, ikke bare et nøkkelpar). @criipto/verify-express
// støtter kun client_secret, så hele Buypass-flyten (authorize-redirect,
// PKCE, token-utveksling, id_token-verifisering) er bygget for hånd her,
// ikke via biblioteket BankID bruker.
const BUYPASS_LOGIN_PATH = "/api/auth/buypass/login";
const BUYPASS_CALLBACK_PATH = "/api/auth/buypass/callback";
const BUYPASS_SSN_CLAIM_KEY = "bp_nnin_sub";
const BUYPASS_SCOPE = "openid profile bpid bpnnin";
const BUYPASS_AUTHORIZE_PATH = "protocol/openid-connect/auth";
const BUYPASS_TOKEN_PATH = "protocol/openid-connect/token";
const BUYPASS_JWKS_PATH = "protocol/openid-connect/certs";

// Bygger og signerer en RFC 7523 client assertion-JWT for Buypass sin
// private_key_jwt-autentisering. `x5t#S256`-header-claimet (SHA-256-
// fingeravtrykk av selve sertifikatet, ikke nøkkelen) er det Keycloak bruker
// til å slå opp hvilket registrert sertifikat JWT-en skal verifiseres mot —
// uten dette matcher Buypass ikke signaturen mot riktig klient-credential.
async function buildBuypassClientAssertion(params: {
  clientId: string;
  tokenEndpoint: string;
  certPem: string;
  keyPem: string;
}): Promise<string> {
  const privateKey = await importPKCS8(params.keyPem, "RS256");
  const certDer = Buffer.from(
    params.certPem.replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\s+/g, ""),
    "base64",
  );
  const x5tS256 = createHash("sha256").update(certDer).digest("base64url");

  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256", "x5t#S256": x5tS256 })
    .setIssuer(params.clientId)
    .setSubject(params.clientId)
    .setAudience(params.tokenEndpoint)
    .setJti(randomBytes(16).toString("hex"))
    .setIssuedAt()
    .setExpirationTime("60s")
    .sign(privateKey);
}

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

// Slår opp på fnr-hash ALENE, uavhengig av hvilken eID-leverandør som traff.
// Samme person får ulik `sub` hos BankID og Buypass, men samme fødselsnummer
// -> samme hash. Filtrerer man i tillegg på provider her, får samme person to
// kontoer den dagen de logger inn med den andre eID-metoden første gang.
async function resolveUserByEidIdentity(ssnHash: string): Promise<AuthUser | null> {
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
    provider: identity.provider,
    role: user.role || "member",
    vendorId: user.vendorId,
  };
}

// Fallback når ingen tidum_eid_identities-rad finnes ennå: super admin kan
// forhåndsregistrere hvilket fødselsnummer en konto skal kobles til, FØR
// personen noensinne har logget inn med eID (se migrations/053). Denne
// slår opp den forventede hashen på users direkte — brukes kun av
// createEidCallbackHandler, som skriver selve tidum_eid_identities-raden og
// nullstiller feltet idet koblingen er gjort (one-shot, ikke gjenbrukbar).
async function resolveUserByExpectedSsnHash(ssnHash: string): Promise<AuthUser | null> {
  const [user] = await db.select().from(users).where(eq(users.expectedSsnHash, ssnHash)).limit(1);
  if (!user) return null;

  return {
    id: user.id,
    email: user.email || "",
    name: [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.email || "",
    profileImageUrl: user.profileImageUrl,
    provider: "",
    role: user.role || "member",
    vendorId: user.vendorId,
  };
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
    console.error("EID IDENTITY WRITE FAILED", params.userId, params.provider, err);
    throw err;
  }
}

export async function resolveUserForVerifiedEid(params: {
  provider: string;
  sub: string;
  ssnHash: string;
  givenName: string | null;
  familyName: string | null;
  fullName: string | null;
  rawClaims: Record<string, unknown>;
}): Promise<AuthUser | null> {
  let resolvedUser = await resolveUserByEidIdentity(params.ssnHash);

  if (!resolvedUser) {
    resolvedUser = await resolveUserByExpectedSsnHash(params.ssnHash);
  }
  if (!resolvedUser) return null;

  // Also write the current provider. A person first linked with BankID must
  // get a Buypass identity row when later logging in with Buypass (and vice
  // versa), while the shared ssn hash still resolves to the same user.
  await upsertEidIdentity({
    userId: resolvedUser.id,
    provider: params.provider,
    sub: params.sub,
    ssnHash: params.ssnHash,
    givenName: params.givenName,
    familyName: params.familyName,
    fullName: params.fullName,
    rawClaims: params.rawClaims,
  });
  await db
    .update(users)
    .set({ expectedSsnHash: null, updatedAt: new Date() })
    .where(and(eq(users.id, resolvedUser.id), eq(users.expectedSsnHash, params.ssnHash)));

  return { ...resolvedUser, provider: params.provider };
}

export function eidPostLoginPath(role: string | null | undefined): string {
  return role === "innbygger" ? "/innbygger" : "/dashboard";
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
    console.error("AUTH LOGIN EVENT WRITE FAILED", params.userId, params.provider, err);
  }
}

function sanitizeEidClaims(
  claims: JWTPayload,
  ssnClaimKey: string,
  rawSsn: string,
): Record<string, unknown> {
  const sensitiveKey = /(ssn|socialno|fnr|fødsels|person.?number|national.?id|nnin)/i;
  const scrubValue = (value: unknown): unknown => {
    if (typeof value === "string") return value.split(rawSsn).join("[redacted]");
    if (Array.isArray(value)) return value.map(scrubValue);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .filter(([key]) => !sensitiveKey.test(key))
          .map(([key, nested]) => [key, scrubValue(nested)]),
      );
    }
    return value;
  };

  return Object.fromEntries(
    Object.entries(claims)
      .filter(([key]) => key !== ssnClaimKey && !sensitiveKey.test(key))
      .map(([key, value]) => [key, scrubValue(value)]),
  );
}

// Delt callback-logikk mellom BankID og Buypass. Ikke dupliser denne per
// leverandør — det er nøyaktig slik implementasjonene glir fra hverandre
// over tid og bare den ene veien blir testet.
function createEidCallbackHandler(provider: string, ssnClaimKey: string): RequestHandler {
  return async (req, res, next) => {
    try {
      const claims = req.claims;
      if (!claims) {
        return res.redirect("/?error=eid_failed");
      }

      const fnr = claims[ssnClaimKey];
      if (typeof fnr !== "string" || !fnr) {
        // Logges selv om vi avviser: leverandøren fakturerer autentiseringen
        // uansett om vi fikk fnr eller ikke (kostnadssporing).
        await logAuthEvent({
          provider,
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
      const rawClaims = sanitizeEidClaims(claims, ssnClaimKey, fnr);

      if (hasSessionAuth(req) && req.user) {
        // Kobling: bruker er allerede innlogget (Google/e-post), dette er
        // eierskapsbeviset. Skriv koblingen og behold samme innloggede bruker.
        const currentUser = req.user as AuthUser;
        const [currentUserRow] = await db
          .select({ expectedSsnHash: users.expectedSsnHash })
          .from(users)
          .where(eq(users.id, currentUser.id))
          .limit(1);
        if (currentUserRow?.expectedSsnHash && currentUserRow.expectedSsnHash !== ssnHash) {
          return res.redirect("/?error=eid_identity_mismatch");
        }
        await upsertEidIdentity({
          userId: currentUser.id,
          provider,
          sub,
          ssnHash,
          givenName,
          familyName,
          fullName,
          rawClaims,
        });
        if (currentUserRow?.expectedSsnHash === ssnHash) {
          await db
            .update(users)
            .set({ expectedSsnHash: null, updatedAt: new Date() })
            .where(and(eq(users.id, currentUser.id), eq(users.expectedSsnHash, ssnHash)));
        }
        await logAuthEvent({
          provider,
          userId: currentUser.id,
          sessionId: null, // koblingen fødte ikke økten
          ipAddress: req.ip,
          userAgent: req.get("user-agent") || undefined,
        });
        return res.redirect(eidPostLoginPath(currentUser.role));
      }

      // Innlogging: slå opp eksisterende kobling på tvers av leverandører
      // (fnr-hash er nøkkelen). Opprett ALDRI ny bruker.
      const resolvedUser = await resolveUserForVerifiedEid({
        provider,
        sub,
        ssnHash,
        givenName,
        familyName,
        fullName,
        rawClaims,
      });

      if (!resolvedUser) {
        await logAuthEvent({
          provider,
          userId: null,
          sessionId: null,
          ipAddress: req.ip,
          userAgent: req.get("user-agent") || undefined,
        });
        return res.redirect("/?error=eid_not_linked");
      }

      await logAuthEvent({
        provider,
        userId: resolvedUser.id,
        sessionId: req.sessionID,
        ipAddress: req.ip,
        userAgent: req.get("user-agent") || undefined,
      });

      req.logIn(resolvedUser, (loginError) => {
        if (loginError) return next(loginError);
        redirectAfterLogin(req, res, resolvedUser, eidPostLoginPath(resolvedUser.role)).catch(next);
      });
    } catch (err) {
      if ((err as { code?: string })?.code === "23505") {
        // Denne fnr-hashen er allerede koblet til en ANNEN bruker.
        return res.redirect("/?error=eid_already_linked");
      }
      return next(err);
    }
  };
}

export async function setupEidAuth(app: Express): Promise<void> {
  if (!process.env.EID_SSN_HASH_PEPPER) {
    // Pepperet brukes til å hashe fødselsnummer for BEGGE leverandører —
    // uten det kan verken BankID eller Buypass aktiveres. Google/e-post må
    // fortsette å virke uansett, samme filosofi som Google-oppsettet i
    // custom-auth.ts (`if (process.env.GOOGLE_CLIENT_ID && ...)`).
    console.warn("[eid] EID_SSN_HASH_PEPPER er ikke satt — BankID og Buypass er deaktivert");
    return;
  }

  const domain = process.env.IDURA_DOMAIN;
  const clientID = process.env.IDURA_CLIENT_ID;
  const clientSecret = process.env.IDURA_CLIENT_SECRET;

  // BankID (via Idura) og Buypass (direkte) er uavhengige av hverandre —
  // manglende oppsett for den ene skal ALDRI hindre den andre fra å
  // aktiveres. Derfor if/else-blokker her, ikke tidlige `return`.
  if (!domain || !clientID || !clientSecret) {
    console.warn(
      "[eid] IDURA_DOMAIN/IDURA_CLIENT_ID/IDURA_CLIENT_SECRET er ikke konfigurert — BankID er deaktivert",
    );
  } else {
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
    const handleIduraCallback = createEidCallbackHandler("bankid", IDURA_SSN_CLAIM_KEY);

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
        const resolvedUser = await resolveUserForVerifiedEid({
          provider: "bankid",
          sub: typeof claims.sub === "string" ? claims.sub : String(claims.sub),
          ssnHash,
          givenName: typeof claims.given_name === "string" ? claims.given_name : null,
          familyName: typeof claims.family_name === "string" ? claims.family_name : null,
          fullName: typeof claims.name === "string" ? claims.name : null,
          rawClaims: sanitizeEidClaims(claims, IDURA_SSN_CLAIM_KEY, fnr),
        });
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
  }

  // Buypass ID — direkte OIDC, egen klient, ikke via Idura. Samme
  // deaktiver-hvis-ukonfigurert-filosofi som BankID over: mangler noe av
  // dette, deaktiveres kun Buypass-innlogging, resten av appen (inkl.
  // BankID) upåvirket. PEM-ene settes som miljøvariabler (multiline er
  // greit i Render), aldri som filer sjekket inn i repoet.
  const buypassDomain = process.env.BUYPASS_DOMAIN;
  const buypassClientId = process.env.BUYPASS_CLIENT_ID;
  const buypassCertPem = process.env.BUYPASS_CLIENT_CERT_PEM;
  const buypassKeyPem = process.env.BUYPASS_CLIENT_KEY_PEM;

  if (!buypassDomain || !buypassClientId || !buypassCertPem || !buypassKeyPem) {
    console.warn(
      "[eid] BUYPASS_DOMAIN/BUYPASS_CLIENT_ID/BUYPASS_CLIENT_CERT_PEM/BUYPASS_CLIENT_KEY_PEM er ikke konfigurert — Buypass er deaktivert",
    );
  } else {
    const buypassAuthorizeEndpoint = `https://${buypassDomain}/${BUYPASS_AUTHORIZE_PATH}`;
    const buypassTokenEndpoint = `https://${buypassDomain}/${BUYPASS_TOKEN_PATH}`;
    const buypassJwks = createRemoteJWKSet(new URL(`https://${buypassDomain}/${BUYPASS_JWKS_PATH}`));
    const buypassRedirectUri = `${getAppBaseUrl()}${BUYPASS_CALLBACK_PATH}`;
    const handleBuypassIdentity = createEidCallbackHandler("buypass", BUYPASS_SSN_CLAIM_KEY);

    app.get(BUYPASS_LOGIN_PATH, (req, res) => {
      const state = randomBytes(24).toString("base64url");
      const nonce = randomBytes(24).toString("base64url");
      const codeVerifier = randomBytes(32).toString("base64url");
      const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");

      req.session.buypassOAuth = { state, nonce, codeVerifier };

      const url = new URL(buypassAuthorizeEndpoint);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("client_id", buypassClientId);
      url.searchParams.set("redirect_uri", buypassRedirectUri);
      url.searchParams.set("scope", BUYPASS_SCOPE);
      url.searchParams.set("state", state);
      url.searchParams.set("nonce", nonce);
      url.searchParams.set("code_challenge", codeChallenge);
      url.searchParams.set("code_challenge_method", "S256");

      res.redirect(url.toString());
    });

    app.get(BUYPASS_CALLBACK_PATH, async (req, res, next) => {
      try {
        const { code, state } = req.query;
        const stored = req.session.buypassOAuth;
        delete req.session.buypassOAuth; // one-shot — hindrer replay av samme state

        if (typeof code !== "string" || typeof state !== "string" || !stored || state !== stored.state) {
          return res.redirect("/?error=eid_failed");
        }

        const clientAssertion = await buildBuypassClientAssertion({
          clientId: buypassClientId,
          tokenEndpoint: buypassTokenEndpoint,
          certPem: buypassCertPem,
          keyPem: buypassKeyPem,
        });

        const tokenRes = await fetch(buypassTokenEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            code,
            redirect_uri: buypassRedirectUri,
            client_id: buypassClientId,
            code_verifier: stored.codeVerifier,
            client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
            client_assertion: clientAssertion,
          }),
        });

        if (!tokenRes.ok) {
          // Kroppen inneholder Buypass sin faktiske feilforklaring — logg
          // den, den er nøkkelen til å diagnostisere feil client-oppsett
          // (f.eks. feil x5t#S256 eller ikke-registrert sertifikat).
          const errBody = await tokenRes.text().catch(() => "");
          console.error("[eid] Buypass token-utveksling feilet", tokenRes.status, errBody);
          return res.redirect("/?error=eid_failed");
        }

        const tokens = (await tokenRes.json()) as { id_token?: string };
        if (!tokens.id_token) {
          console.error("[eid] Buypass token-respons mangler id_token");
          return res.redirect("/?error=eid_failed");
        }

        const { payload: claims } = await jwtVerify(tokens.id_token, buypassJwks, {
          issuer: `https://${buypassDomain}`,
          audience: buypassClientId,
        });

        if (stored.nonce && claims.nonce !== stored.nonce) {
          return res.redirect("/?error=eid_failed");
        }

        req.claims = claims;
        return handleBuypassIdentity(req, res, next);
      } catch (err) {
        console.error("[eid] Buypass callback feilet", err);
        return res.redirect("/?error=eid_failed");
      }
    });
  }

  app.get("/api/auth/eid/status", async (req, res) => {
    if (!req.user) {
      return res.status(401).json({ message: "Ikke autentisert" });
    }
    const user = req.user as AuthUser;
    const linked = await hasLinkedEid(user.id);
    res.json(buildEidStatus(user.role, linked, true));
  });
}
