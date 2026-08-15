# Buypass eID-innlogging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Legge til Buypass som en egen, uavhengig eID-innloggingsmetode i Tidum — for web og iOS-appen — med kontobinding som gjenkjenner samme fysiske person uansett om de bruker BankID (Idura) eller Buypass.

**Architecture:** Ny fil `server/buypass-auth.ts` bruker den allerede installerte `openid-client`-pakken (generisk OIDC-klient) mot Buypass' direkte, Keycloak-baserte OIDC-endepunkt — parallelt med, ikke i stedet for, den eksisterende `@criipto/verify-express`-baserte Idura-integrasjonen. `eid-auth.ts`s kontogjenkjenningslogikk generaliseres til å slå opp på `ssn_hash` alene (uten provider-filter), slik at kobling via én metode automatisk gjør den andre metoden gjenkjennbar.

**Tech Stack:** `openid-client` v6 (funksjonelt API, verifisert direkte mot `node_modules/openid-client/build/index.d.ts`), Express, Drizzle, SwiftUI/`ASWebAuthenticationSession`.

**Spec:** `docs/superpowers/specs/2026-08-15-buypass-eid-innlogging-design.md`

## Global Constraints

- Ingen ny npm-avhengighet — `openid-client` (`^6.8.1`) er allerede installert.
- `hashSsn()` fra `server/lib/eid-hash.ts` gjenbrukes uendret for Buypass.
- Fødselsnummer lagres aldri i klartekst — kun `ssn_hash`.
- Opprett ALDRI ny bruker fra en Buypass-innlogging — kun kobling/gjenkjenning mot eksisterende `users`-rader.
- Web: full link+login-gren (identisk mønster som BankID). Mobil: kun frittstående innlogging — kobling til allerede innlogget mobilsesjon er utenfor omfang.
- `redirect_uri` bygges alltid fra `getAppBaseUrl()` (absolutt URL), aldri fra `req.get('host')` — unngår den samme sesjonstap-buggen som ble funnet og fikset for Idura bak Netlify-proxyen tidligere denne økten.
- `BUYPASS_SSN_CLAIM_KEY` er konfigurerbar via env-var (ikke hardkodet) — den faktiske claim-verdien er ikke offentlig dokumentert, kun synlig med en ekte Buypass-kundeavtale.

---

## File Structure

**Backend:**
- Modify: `server/eid-auth.ts` — generaliser `resolveUserByEidIdentity`, `upsertEidIdentity`, `logAuthEvent` til å ta `provider` som eksplisitt parameter i stedet for å hardkode `"bankid"`; fjern provider-filteret fra kontogjenkjenning.
- Create: `server/buypass-auth.ts` — ny fil, web- og mobil-ruter for Buypass, speiler strukturen i `eid-auth.ts`.
- Modify: `server/routes.ts` — importer og kall `setupBuypassAuth(app)`.
- Test: `client/src/test/server/eid-auth.test.ts` — utvid med tester for provider-uavhengig gjenkjenning.

**Web frontend:**
- Modify: `client/src/lib/auth-utils.ts` — ny konstant `BUYPASS_LOGIN_URL`.
- Modify: `client/src/pages/landing.tsx` — erstatt deaktivert Buypass-knapp med fungerende.
- Modify: `client/src/pages/koble-bankid.tsx` — generaliser tekst, legg til Buypass-knapp.

**iOS:**
- Modify: `ios/Tidum/Tidum/Auth/AuthSession.swift` — ny `Provider.buypass`-case.
- Modify: `ios/Tidum/Tidum/Features/Login/LoginView.swift` — ny Buypass-knapp.

---

### Task 1: Provider-uavhengig kontogjenkjenning

**Files:**
- Modify: `server/eid-auth.ts:58-139` (`resolveUserByEidIdentity`, `upsertEidIdentity`, `logAuthEvent`)
- Modify: `server/eid-auth.ts:197-354` (`handleIduraCallback`, `handleIduraMobileCallback` — oppdater kallene til de generaliserte funksjonene)
- Test: `client/src/test/server/eid-auth.test.ts`

**Interfaces:**
- Produces (konsumeres av Task 2/3): `resolveUserByEidIdentity(ssnHash: string, provider: string): Promise<AuthUser | null>` (nå eksportert), `upsertEidIdentity(params: {..., provider: string}): Promise<void>`, `logAuthEvent(params: {..., provider: string}): Promise<void>`.

- [ ] **Step 1: Skriv den feilende testen**

```typescript
// client/src/test/server/eid-auth.test.ts — legg til nederst i filen
import { db } from "../../../../server/db";
import { eidIdentities, users } from "../../../../shared/schema";
import { eq } from "drizzle-orm";

describe("resolveUserByEidIdentity — provider-uavhengig gjenkjenning", () => {
  it("gjenkjenner en bruker via Buypass-innlogging når kun BankID er koblet fra før", async () => {
    const { resolveUserByEidIdentity } = await import("../../../../server/eid-auth");

    const [user] = await db
      .insert(users)
      .values({ email: `cross-provider-test-${Date.now()}@example.com`, role: "member" })
      .returning();

    const ssnHash = "test-hash-" + Date.now();
    await db.insert(eidIdentities).values({
      userId: user.id,
      provider: "bankid",
      sub: "test-sub",
      ssnHash,
      givenName: "Test",
      familyName: "Testsen",
      fullName: "Test Testsen",
      rawClaims: {},
    });

    const resolved = await resolveUserByEidIdentity(ssnHash, "buypass");

    expect(resolved).not.toBeNull();
    expect(resolved?.id).toBe(user.id);
    // provider skal reflektere DENNE innloggingens metode (buypass),
    // ikke hvilken provider som opprinnelig koblet raden (bankid).
    expect(resolved?.provider).toBe("buypass");

    await db.delete(eidIdentities).where(eq(eidIdentities.userId, user.id));
    await db.delete(users).where(eq(users.id, user.id));
  });

  it("returnerer null når ingen kobling finnes for noen provider", async () => {
    const { resolveUserByEidIdentity } = await import("../../../../server/eid-auth");
    const resolved = await resolveUserByEidIdentity("nonexistent-hash-" + Date.now(), "buypass");
    expect(resolved).toBeNull();
  });
});
```

- [ ] **Step 2: Kjør testen, bekreft at den feiler**

Run: `npx vitest run client/src/test/server/eid-auth.test.ts`
Expected: FAIL — `resolveUserByEidIdentity` er ikke eksportert, eller signaturen mismatcher (kun 1 parameter i dag).

- [ ] **Step 3: Generaliser `resolveUserByEidIdentity`**

I `server/eid-auth.ts`, erstatt den eksisterende (linje 58-79):

```typescript
async function resolveUserByEidIdentity(ssnHash: string): Promise<AuthUser | null> {
  const [identity] = await db
    .select()
    .from(eidIdentities)
    .where(and(eq(eidIdentities.provider, "bankid"), eq(eidIdentities.ssnHash, ssnHash)))
    .limit(1);

  if (!identity) return null;

  const [user] = await db.select().from(users).where(eq(users.id, identity.userId)).limit(1);
  if (!user) return null;

  return {
    id: user.id,
    email: user.email || "",
    name: [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.email || "",
    profileImageUrl: user.profileImageUrl,
    provider: "bankid",
    role: user.role || "member",
    vendorId: user.vendorId,
  };
}
```

med:

```typescript
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
```

- [ ] **Step 4: Generaliser `upsertEidIdentity` og `logAuthEvent`**

Erstatt (linje 81-120):

```typescript
async function upsertEidIdentity(params: {
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
        provider: "bankid",
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
```

med (kun `provider` lagt til params + brukt i stedet for hardkodet `"bankid"`, resten uendret):

```typescript
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
```

Erstatt (linje 122-139):

```typescript
async function logAuthEvent(params: {
  userId: string | null;
  sessionId: string | null;
  ipAddress: string | undefined;
  userAgent: string | undefined;
}): Promise<void> {
  try {
    await db.insert(authLoginEvents).values({
      provider: "bankid",
      userId: params.userId,
      sessionId: params.sessionId,
      ipAddress: params.ipAddress || null,
      userAgent: params.userAgent || null,
    });
  } catch (err) {
    console.error("AUTH LOGIN EVENT WRITE FAILED", params.userId, err);
  }
}
```

med:

```typescript
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
```

- [ ] **Step 5: Oppdater alle eksisterende kallsteder i samme fil til å sende `provider: "bankid"` eksplisitt**

I `handleIduraCallback` (linje 197-277) og `handleIduraMobileCallback` (linje 308-354): hvert kall til `resolveUserByEidIdentity(ssnHash)` blir `resolveUserByEidIdentity(ssnHash, "bankid")`; hvert `upsertEidIdentity({...})`-kall og `logAuthEvent({...})`-kall får `provider: "bankid",` lagt til i sitt params-objekt. Det er 2 kall til `resolveUserByEidIdentity` (ett i hver variant), 1 kall til `upsertEidIdentity` (kun i web-variantens link-gren), og 7 kall til `logAuthEvent` totalt i filen (4 i web-varianten: manglende-fnr/lenke/ikke-koblet/vellykket-innlogging; 3 i mobil-varianten: manglende-fnr/ikke-koblet/vellykket-innlogging) — søk etter `logAuthEvent(` og legg til `provider: "bankid"` i hvert treff. Ingen annen logikk endres.

- [ ] **Step 6: Kjør testen, bekreft at den passerer**

Run: `npx vitest run client/src/test/server/eid-auth.test.ts`
Expected: PASS (alle tester i filen, inkludert de 2 nye og de eksisterende `requiresEidLogin`/`buildEidStatus`-testene). Merk: de 2 nye testene krever en ekte databasetilkobling (`DATABASE_URL`) — i miljøer uten dette (kjent, dokumentert begrensning fra denne økten) kan de ikke fullføre; vurder testens LOGIKK ved inspeksjon i så fall, ikke som en kodefeil.

- [ ] **Step 7: Verifiser typecheck**

Run: `npx tsc --noEmit`
Expected: ingen nye feil.

- [ ] **Step 8: Commit**

```bash
git add server/eid-auth.ts client/src/test/server/eid-auth.test.ts
git commit -m "feat(buypass): make eID account recognition provider-agnostic"
```

---

### Task 2: Buypass backend — web

**Files:**
- Create: `server/buypass-auth.ts`
- Modify: `server/routes.ts` (import + kall `setupBuypassAuth`)

**Interfaces:**
- Consumes: `resolveUserByEidIdentity`, `hasLinkedEid` (eksportert fra `server/eid-auth.ts`, Task 1); `hashSsn` (`server/lib/eid-hash.ts`); `hasSessionAuth` (`server/custom-auth.ts`); `getAppBaseUrl` (`server/lib/app-base-url.ts`); `authRateLimit` (`server/rate-limit.ts`).
- Produces (konsumeres av Task 3, Task 4): `export async function setupBuypassAuth(app: Express): Promise<void>` — registrerer `GET /api/auth/buypass/login` og `GET /api/auth/buypass/callback`.

- [ ] **Step 1: Verifiser `openid-client`s faktiske API-signatur før du skriver kode**

Kjør: `grep -n "^export declare function discovery\|^export declare function buildAuthorizationUrl\|^export declare function authorizationCodeGrant" node_modules/openid-client/build/index.d.ts`

Forventet output (bekreftet under planlegging, verifiser at det fortsatt stemmer i dette repoet før du fortsetter):
```
export declare function discovery(server: URL, clientId: string, metadata?: Partial<ClientMetadata> | string, clientAuthentication?: ClientAuth, options?: DiscoveryRequestOptions): Promise<Configuration>;
export declare function buildAuthorizationUrl(config: Configuration, parameters: URLSearchParams | Record<string, string>): URL;
export declare function authorizationCodeGrant(config: Configuration, currentUrl: URL | Request, checks?: AuthorizationCodeGrantChecks, tokenEndpointParameters?: URLSearchParams | Record<string, string>, options?: AuthorizationCodeGrantOptions): Promise<oauth.TokenEndpointResponse & TokenEndpointResponseHelpers>;
```

Hvis signaturene avviker fra dette (f.eks. pakken har blitt oppgradert siden planleggingstidspunktet), STOPP og rapporter — ikke gjett deg videre, tilpass koden under til den faktiske signaturen.

- [ ] **Step 2: Skriv `server/buypass-auth.ts`**

```typescript
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
```

Merk: `resolveUserByEidIdentity` og `hasLinkedEid` importeres fra `./eid-auth` (Task 1 eksporterte `resolveUserByEidIdentity`; `hasLinkedEid` var allerede eksportert). `/api/auth/eid/status` (i `eid-auth.ts`) endres ikke — den er allerede provider-agnostisk siden `hasLinkedEid` sjekker om NOEN rad finnes for brukeren, uavhengig av provider.

- [ ] **Step 3: Wire inn i `server/routes.ts`**

Legg til import ved siden av den eksisterende `import { setupEidAuth } from "./eid-auth";` (linje 56):

```typescript
import { setupBuypassAuth } from "./buypass-auth";
```

Legg til rett etter `await setupEidAuth(app);` (linje 1556):

```typescript
  await setupBuypassAuth(app);
```

- [ ] **Step 4: Verifiser typecheck**

Run: `npx tsc --noEmit`
Expected: ingen feil.

- [ ] **Step 5: Commit**

```bash
git add server/buypass-auth.ts server/routes.ts
git commit -m "feat(buypass): add web login/callback routes via openid-client"
```

---

### Task 3: Buypass backend — mobil

**Files:**
- Modify: `server/buypass-auth.ts`

**Interfaces:**
- Consumes: `issueMobileTokens` (`server/lib/mobile-auth.ts`), samt alt fra Task 2 i samme fil.
- Produces: `GET /api/auth/buypass/login-mobile`, `GET /api/auth/buypass/callback-mobile` — redirecter til `tidum://auth-callback` med JWT-tokens, samme mønster som Idura-mobil.

- [ ] **Step 1: Legg til import**

Legg til i `server/buypass-auth.ts`s importliste:

```typescript
import { issueMobileTokens } from "./lib/mobile-auth";
```

- [ ] **Step 2: Legg til mobil-rutene**

Inni `setupBuypassAuth`, rett etter web-callback-routen fra Task 2 (før den avsluttende `}`-en for funksjonen):

```typescript
  const BUYPASS_MOBILE_LOGIN_PATH = "/api/auth/buypass/login-mobile";
  const BUYPASS_MOBILE_CALLBACK_PATH = "/api/auth/buypass/callback-mobile";
  const MOBILE_AUTH_CALLBACK_URL = "tidum://auth-callback";
  const buypassMobileRedirectUri = `${getAppBaseUrl()}${BUYPASS_MOBILE_CALLBACK_PATH}`;

  app.get(BUYPASS_MOBILE_LOGIN_PATH, authRateLimit, async (req, res, next) => {
    try {
      const state = randomState();
      const codeVerifier = randomPKCECodeVerifier();
      const codeChallenge = await calculatePKCECodeChallenge(codeVerifier);
      const bag = getSessionBag(req);
      bag.buypassMobileState = state;
      bag.buypassMobileCodeVerifier = codeVerifier;

      const authUrl = buildAuthorizationUrl(config, {
        redirect_uri: buypassMobileRedirectUri,
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

  app.get(BUYPASS_MOBILE_CALLBACK_PATH, authRateLimit, async (req, res, next) => {
    try {
      const bag = getSessionBag(req);
      const expectedState = bag.buypassMobileState as string | undefined;
      const pkceCodeVerifier = bag.buypassMobileCodeVerifier as string | undefined;
      if (!expectedState || !pkceCodeVerifier) {
        return res.redirect(`${MOBILE_AUTH_CALLBACK_URL}?error=eid_failed`);
      }

      const currentUrl = new URL(req.originalUrl, getAppBaseUrl());
      const tokens = await authorizationCodeGrant(config, currentUrl, {
        expectedState,
        pkceCodeVerifier,
      });
      const claims = tokens.claims();
      if (!claims) {
        return res.redirect(`${MOBILE_AUTH_CALLBACK_URL}?error=eid_failed`);
      }

      const fnr = claims[BUYPASS_SSN_CLAIM_KEY];
      if (typeof fnr !== "string" || !fnr) {
        await logBuypassAuthEvent({
          userId: null,
          sessionId: null,
          ipAddress: req.ip,
          userAgent: req.get("user-agent") || undefined,
        });
        return res.redirect(`${MOBILE_AUTH_CALLBACK_URL}?error=eid_missing_ssn`);
      }

      const ssnHash = hashSsn(fnr);
      const resolvedUser = await resolveUserByEidIdentity(ssnHash, "buypass");
      if (!resolvedUser) {
        await logBuypassAuthEvent({
          userId: null,
          sessionId: null,
          ipAddress: req.ip,
          userAgent: req.get("user-agent") || undefined,
        });
        return res.redirect(`${MOBILE_AUTH_CALLBACK_URL}?error=eid_not_linked`);
      }

      await logBuypassAuthEvent({
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
  });
```

Merk: `MOBILE_AUTH_CALLBACK_URL` er samme streng-konstant som i `eid-auth.ts` og `custom-auth.ts` — bevisst duplisert per fil (samme mønster som allerede etablert for Idura/Google-mobil), ikke delt via en felles konstant, siden hver fil allerede definerer sin egen lokalt.

- [ ] **Step 3: Verifiser typecheck**

Run: `npx tsc --noEmit`
Expected: ingen feil.

- [ ] **Step 4: Commit**

```bash
git add server/buypass-auth.ts
git commit -m "feat(buypass): add mobile login/callback routes"
```

---

### Task 4: Web-frontend

**Files:**
- Modify: `client/src/lib/auth-utils.ts`
- Modify: `client/src/pages/landing.tsx:717-731` (hero-raden med innloggingsknapper)
- Modify: `client/src/pages/koble-bankid.tsx`

**Interfaces:**
- Consumes: ingen backend-avhengighet utover selve URL-stien (`/api/auth/buypass/login`, registrert i Task 2).
- Produces: ingen (bladnode for frontend).

- [ ] **Step 1: Legg til `BUYPASS_LOGIN_URL`**

I `client/src/lib/auth-utils.ts`, rett etter den eksisterende `export const IDURA_LOGIN_URL = "/api/auth/idura/login";` (linje 39):

```typescript
export const BUYPASS_LOGIN_URL = "/api/auth/buypass/login";
```

- [ ] **Step 2: Erstatt den deaktiverte Buypass-knappen på landingssiden**

I `client/src/pages/landing.tsx`, erstatt:

```tsx
                <Button
                  type="button"
                  disabled
                  variant="outline"
                  className="tidum-btn-secondary h-auto cursor-not-allowed px-6 py-3 text-lg font-medium opacity-60"
                >
                  Buypass (Kommer snart)
                </Button>
```

med:

```tsx
                <Button
                  type="button"
                  onClick={() => startBuypassLogin("hero_buypass")}
                  variant="outline"
                  className="tidum-btn-secondary h-auto px-6 py-3 text-lg font-medium"
                >
                  Logg inn med Buypass
                </Button>
```

Legg til `startBuypassLogin`-funksjonen i samme fil, rett etter den eksisterende `startEidLogin`-funksjonen (samme mønster — se `startEidLogin` for eksakt plassering: søk etter `const startEidLogin = (source: string) => {` og legg denne rett etter dens avsluttende `};`):

```typescript
  const startBuypassLogin = (source: string) => {
    trackTidumPublicEvent("tidum_buypass_login_click", {
      source,
      destination: BUYPASS_LOGIN_URL,
    });
    window.location.href = BUYPASS_LOGIN_URL;
  };
```

I `client/src/pages/landing.tsx:8`, endre `import { buildGoogleAuthUrl, IDURA_LOGIN_URL } from "@/lib/auth-utils";` til `import { buildGoogleAuthUrl, IDURA_LOGIN_URL, BUYPASS_LOGIN_URL } from "@/lib/auth-utils";`.

- [ ] **Step 3: Generaliser koble-siden**

Erstatt hele innholdet i `client/src/pages/koble-bankid.tsx`:

```tsx
import { Button } from "@/components/ui/button";
import { IDURA_LOGIN_URL, BUYPASS_LOGIN_URL } from "@/lib/auth-utils";

export default function KobleBankId() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-md text-center space-y-6">
        <h1 className="text-2xl font-semibold">Koble eID til kontoen din</h1>
        <p className="text-muted-foreground">
          Tidum krever eID for din rolle. Dette gjøres kun én gang — etter
          koblingen bruker du BankID eller Buypass for all fremtidig innlogging.
        </p>
        <div className="flex flex-col gap-3">
          <Button
            type="button"
            onClick={() => {
              window.location.href = IDURA_LOGIN_URL;
            }}
          >
            Fortsett med BankID
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              window.location.href = BUYPASS_LOGIN_URL;
            }}
          >
            Fortsett med Buypass
          </Button>
        </div>
      </div>
    </main>
  );
}
```

Filnavn og rute (`/logg-inn/koble-bankid`) beholdes uendret — en omdøping ville kreve en redirect-regel for eksisterende lenker, unødvendig omfang for denne runden.

- [ ] **Step 4: Verifiser typecheck og bygg**

Run: `npx tsc --noEmit`
Expected: ingen feil.

Run: `npm run build`
Expected: bygger uten feil.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/auth-utils.ts client/src/pages/landing.tsx client/src/pages/koble-bankid.tsx
git commit -m "feat(buypass): wire up Buypass login on landing and koble-eid pages"
```

---

### Task 5: iOS-frontend

**Files:**
- Modify: `ios/Tidum/Tidum/Auth/AuthSession.swift`
- Modify: `ios/Tidum/Tidum/Features/Login/LoginView.swift`

**Interfaces:**
- Consumes: ingen ny backend-avhengighet utover URL-stien (`/api/auth/buypass/login-mobile`, registrert i Task 3).
- Produces: ingen (bladnode).

- [ ] **Step 1: Legg til `.buypass`-case i `AuthSession.Provider`**

I `ios/Tidum/Tidum/Auth/AuthSession.swift`, erstatt:

```swift
    enum Provider {
        case bankID, google

        var loginPath: String {
            switch self {
            case .bankID: "/api/auth/idura/login-mobile"
            case .google: "/api/auth/google-mobile"
            }
        }
    }
```

med:

```swift
    enum Provider {
        case bankID, google, buypass

        var loginPath: String {
            switch self {
            case .bankID: "/api/auth/idura/login-mobile"
            case .google: "/api/auth/google-mobile"
            case .buypass: "/api/auth/buypass/login-mobile"
            }
        }
    }
```

- [ ] **Step 2: Legg til Buypass-knapp i `LoginView`**

I `ios/Tidum/Tidum/Features/Login/LoginView.swift`, legg til rett etter den eksisterende Google-knappen (før den avsluttende `}` for `VStack`):

```swift
            Button("Logg inn med Buypass") {
                Task { await appState.login(with: .buypass) }
            }
            .buttonStyle(.bordered)
```

- [ ] **Step 3: Bygg og kjør hele testsuiten**

Run:
```bash
cd ios/Tidum
xcodegen generate
xcodebuild test -scheme Tidum -destination 'platform=iOS Simulator,name=iPhone 16'
```
Expected: `** TEST SUCCEEDED **` — samme fulle testsuite som før denne runden (ingen nye tester kreves for dette bladnode-UI-tillegget; en ny knapp med en allerede-testet `Provider`-case og allerede-testet `appState.login(with:)`-kall trenger ingen egen test utover at hele appen fortsatt bygger og de eksisterende testene fortsatt består).

- [ ] **Step 4: Commit**

```bash
git add ios/Tidum/Tidum/Auth/AuthSession.swift ios/Tidum/Tidum/Features/Login/LoginView.swift
git commit -m "feat(buypass): add Buypass login option to iOS app"
```

---

## Manuelle oppfølgingspunkter (ikke kode, sporet for ledger)

1. **Buypass-kundeavtale:** `BUYPASS_ISSUER_URL` (realm-navn), `BUYPASS_CLIENT_ID`, `BUYPASS_CLIENT_SECRET` — gis av Buypass ved kundeavtale. Uten disse er `setupBuypassAuth` inert (samme "manglende credentials deaktiverer kun denne metoden"-mønster som Idura/Google).
2. **Verifiser `BUYPASS_SSN_CLAIM_KEY`s faktiske verdi** mot et ekte utstedt token fra realet — standardverdien (`national_identity_number`) er en velbegrunnet gjetning på vanlig Keycloak-konvensjon, ikke bekreftet av Buypass' offentlige dokumentasjon.
3. **Registrer `redirect_uri`** hos Buypass for både web (`${APP_BASE_URL}/api/auth/buypass/callback`) og mobil (`${APP_BASE_URL}/api/auth/buypass/callback-mobile`) — manuelt steg i Buypass' eget administrasjonsgrensesnitt.
4. **Render:** sett `BUYPASS_ISSUER_URL`, `BUYPASS_CLIENT_ID`, `BUYPASS_CLIENT_SECRET` som env-vars når credentials finnes.
5. Live-testing av hele flyten kan først skje når punkt 1-4 er på plass.
