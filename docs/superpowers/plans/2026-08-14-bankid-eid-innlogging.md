# BankID/Buypass eID-innlogging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La ansatte (saksbehandlere, tiltaksledere, teamledere, miljøarbeidere — alle roller utenfor admin-sjiktet) logge inn med BankID/Buypass via Signicat i stedet for Google/e-post, med kobling av eID til eksisterende konto og tvungen bruk etter første kobling.

**Architecture:** `openid-client` (allerede i `package.json`) + Passport-strategi mot Signicats OIDC-discovery, samme Express-sesjon (`connect-pg-simple`) som `custom-auth.ts` allerede bruker. Fnr hashes (HMAC-SHA256 + pepper) og er kontonøkkelen i en ny `eid_identities`-tabell — aldri leverandørens `sub`. Innlogging oppretter aldri ny bruker; kun oppslag mot eksisterende `users`-rad. Samme strategi/rute håndterer både "logg inn" og "koble til innlogget bruker" — grenen avgjøres av `req.isAuthenticated()` i verify-funksjonen, ikke av separate state-tabeller.

**Tech Stack:** Express, Passport, `openid-client` (v6, `openid-client/passport`), Drizzle ORM (`node-postgres`), PostgreSQL, React + Wouter (frontend), Vitest.

**Spec:** `docs/superpowers/specs/2026-08-14-bankid-eid-innlogging-design.md`

## Global Constraints

- Innlogging oppretter **aldri** ny bruker — kun oppslag mot eksisterende `users`-rad via `ssn_hash`. Ukjent fnr → avvis, ikke opprett.
- Bind alltid på `ssn_hash`, aldri på leverandørens `sub` (kun metadata).
- Ingen fallback-hash på fødselsdato — manglende fnr-claim skal feile rent, ikke falle tilbake til en svakere nøkkel.
- `EID_SSN_HASH_PEPPER` er en egen hemmelighet, ikke gjenbruk av `SESSION_SECRET`/`TIDUM_SECRET_KEY`.
- Ingen avhengighet til `server/replit_integrations/` — ikke importer noe derfra.
- Admin-sjiktet (`canAccessVendorApiAdmin`: `super_admin`, `hovedadmin`, `vendor_admin`) er unntatt fra tvungen eID — beholder Google/e-post uendret.
- Hver eID-autentisering logges i `auth_login_events` med `session_id` (= `req.sessionID`) satt kun når autentiseringen faktisk logget inn brukeren.
- `onConflict`-target i enhver upsert mot `eid_identities` må være nøyaktig `(user_id, provider)` — matcher den unike indeksen.
- Migrasjonsfil er `migrations/050_eid_identities.sql` — se spec for hvorfor nummeret kan kollidere med Documaster-branchen ved merge.

---

## Task 1: Datamodell — migrasjon og Drizzle-skjema

**Files:**
- Create: `migrations/050_eid_identities.sql`
- Modify: `shared/models/auth.ts`

**Interfaces:**
- Produces: `eidIdentities` (Drizzle table), `authLoginEvents` (Drizzle table), `EidIdentity`, `NewEidIdentity`, `AuthLoginEvent` types — eksportert fra `@shared/schema` (via eksisterende `export * from "./models/auth"` i `shared/schema.ts:1868`).

- [ ] **Step 1: Skriv migrasjonsfilen**

`migrations/050_eid_identities.sql`:

```sql
-- Migration 050: eid_identities + auth_login_events
--
-- Datamodell for BankID/Buypass-innlogging via Signicat. ssn_hash er
-- kontonøkkelen — samme person skal matche samme rad uansett om hun logger
-- inn med BankID eller Buypass, forutsatt fnr-scope er hentet fra begge.
-- Fødselsnummer lagres aldri i klartekst, kun HMAC-SHA256-hash.

CREATE TABLE IF NOT EXISTS eid_identities (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider     VARCHAR NOT NULL,
  sub          TEXT NOT NULL,
  ssn_hash     TEXT NOT NULL,
  given_name   TEXT,
  family_name  TEXT,
  full_name    TEXT,
  raw_claims   JSONB,
  verified_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS eid_identities_user_provider_key
  ON eid_identities (user_id, provider);

CREATE UNIQUE INDEX IF NOT EXISTS eid_identities_ssn_provider_key
  ON eid_identities (ssn_hash, provider);

CREATE INDEX IF NOT EXISTS eid_identities_ssn_idx ON eid_identities (ssn_hash);

CREATE TABLE IF NOT EXISTS auth_login_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider    VARCHAR NOT NULL,
  user_id     VARCHAR REFERENCES users(id),
  session_id  TEXT,
  ip_address  TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS auth_login_events_user_idx
  ON auth_login_events (user_id, created_at DESC);
```

- [ ] **Step 2: Kjør migrasjonen mot lokal database**

Run: `psql "$DATABASE_URL" -f migrations/050_eid_identities.sql`
Expected: `CREATE TABLE`/`CREATE INDEX` for hver linje, ingen feil.

- [ ] **Step 3: Verifiser tabellene finnes**

Run:
```bash
psql "$DATABASE_URL" -c "SELECT table_name FROM information_schema.tables WHERE table_name IN ('eid_identities', 'auth_login_events');"
```
Expected: begge tabellnavn i resultatet.

- [ ] **Step 4: Legg til Drizzle-tabellene i `shared/models/auth.ts`**

Oppdater importlinjen øverst (legg til `index` er allerede der; legg til `jsonb` er allerede der; legg til `text`, `uniqueIndex`, `uuid`):

```ts
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
```

Legg til nederst i filen, etter `export type User = typeof users.$inferSelect;`:

```ts
export const eidIdentities = pgTable(
  "eid_identities",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    provider: varchar("provider").notNull(),
    sub: text("sub").notNull(),
    ssnHash: text("ssn_hash").notNull(),
    givenName: text("given_name"),
    familyName: text("family_name"),
    fullName: text("full_name"),
    rawClaims: jsonb("raw_claims"),
    verifiedAt: timestamp("verified_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("eid_identities_user_provider_key").on(table.userId, table.provider),
    uniqueIndex("eid_identities_ssn_provider_key").on(table.ssnHash, table.provider),
    index("eid_identities_ssn_idx").on(table.ssnHash),
  ],
);

export type EidIdentity = typeof eidIdentities.$inferSelect;
export type NewEidIdentity = typeof eidIdentities.$inferInsert;

export const authLoginEvents = pgTable(
  "auth_login_events",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    provider: varchar("provider").notNull(),
    userId: varchar("user_id").references(() => users.id),
    sessionId: text("session_id"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("auth_login_events_user_idx").on(table.userId, table.createdAt)],
);

export type AuthLoginEvent = typeof authLoginEvents.$inferSelect;
export type NewAuthLoginEvent = typeof authLoginEvents.$inferInsert;
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: ingen nye feil relatert til `shared/models/auth.ts`.

- [ ] **Step 6: Commit**

```bash
git add migrations/050_eid_identities.sql shared/models/auth.ts
git commit -m "feat(eid): legg til eid_identities og auth_login_events"
```

---

## Task 2: Fnr-hashing (`server/lib/eid-hash.ts`)

**Files:**
- Create: `server/lib/eid-hash.ts`
- Test: `client/src/test/server/eid-hash.test.ts`

**Interfaces:**
- Produces: `hashSsn(fnr: string): string` — brukes av Task 3+ for å bygge `ssn_hash`.

- [ ] **Step 1: Skriv failende test**

`client/src/test/server/eid-hash.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { hashSsn } from "../../../../server/lib/eid-hash";

describe("hashSsn", () => {
  const originalPepper = process.env.EID_SSN_HASH_PEPPER;

  beforeEach(() => {
    process.env.EID_SSN_HASH_PEPPER = "test-pepper-do-not-use-in-prod";
  });

  afterEach(() => {
    process.env.EID_SSN_HASH_PEPPER = originalPepper;
  });

  it("produces the same hash for the same fnr", () => {
    expect(hashSsn("12345678901")).toBe(hashSsn("12345678901"));
  });

  it("produces different hashes for different fnr", () => {
    expect(hashSsn("12345678901")).not.toBe(hashSsn("10987654321"));
  });

  it("strips whitespace before hashing so formatting does not change the key", () => {
    expect(hashSsn("123 456 78901")).toBe(hashSsn("12345678901"));
  });

  it("never leaks the fnr itself in the output", () => {
    expect(hashSsn("12345678901")).not.toContain("12345678901");
  });

  it("throws when EID_SSN_HASH_PEPPER is not configured", () => {
    delete process.env.EID_SSN_HASH_PEPPER;
    expect(() => hashSsn("12345678901")).toThrow("EID_SSN_HASH_PEPPER");
  });
});
```

- [ ] **Step 2: Kjør testen og bekreft at den feiler**

Run: `npx vitest run client/src/test/server/eid-hash.test.ts`
Expected: FAIL — `Cannot find module '../../../../server/lib/eid-hash'`

- [ ] **Step 3: Implementer `server/lib/eid-hash.ts`**

```ts
import { createHmac } from "crypto";

export function hashSsn(fnr: string): string {
  const pepper = process.env.EID_SSN_HASH_PEPPER;
  if (!pepper) {
    throw new Error("EID_SSN_HASH_PEPPER is not configured");
  }

  const normalized = fnr.replace(/\s+/g, "");
  return createHmac("sha256", pepper).update(normalized).digest("hex");
}
```

- [ ] **Step 4: Kjør testen og bekreft at den passerer**

Run: `npx vitest run client/src/test/server/eid-hash.test.ts`
Expected: PASS, 5/5 tester.

- [ ] **Step 5: Commit**

```bash
git add server/lib/eid-hash.ts client/src/test/server/eid-hash.test.ts
git commit -m "feat(eid): hashSsn-hjelpefunksjon med pepper"
```

---

## Task 3: `server/eid-auth.ts` — BankID-innlogging (kjerne)

Dette er hovedmodulen. Bygger BankID først (per spec: verifiser mot sandkasse
før Buypass legges til i Task 6). Inkluderer callback-URL-hjelperen i
`app-base-url.ts` og selve `AuthUser`-typen som trekkes ut til en delt fil,
fordi begge er forutsetninger denne modulen trenger for å eksistere.

**Files:**
- Create: `server/lib/auth-types.ts`
- Modify: `server/custom-auth.ts` (bruk delt type i stedet for lokal `interface AuthUser`)
- Modify: `server/lib/app-base-url.ts`
- Create: `server/eid-auth.ts`
- Modify: `server/routes.ts`
- Test: `client/src/test/server/eid-auth.test.ts`

**Interfaces:**
- Consumes: `db` fra `./db` (Drizzle-instans), `users`/`eidIdentities`/`authLoginEvents` fra `@shared/schema`, `hashSsn` fra `./lib/eid-hash` (Task 2), `getAppBaseUrl` fra `./lib/app-base-url`.
- Produces: `AuthUser` (type, flyttet til `server/lib/auth-types.ts`), `requiresEidLogin(role: string | null | undefined): boolean`, `setupEidAuth(app: Express): Promise<void>` — kalt fra `routes.ts`. Brukes videre av Task 4 (kobling/status) og Task 5 (håndheving i `custom-auth.ts`).

- [ ] **Step 1: Trekk ut `AuthUser` til en delt fil**

Create `server/lib/auth-types.ts`:

```ts
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  profileImageUrl: string | null;
  provider: string;
  role: string;
  vendorId: number | null;
}
```

I `server/custom-auth.ts`, erstatt (linje 16-24):

```ts
interface AuthUser {
  id: string;
  email: string;
  name: string;
  profileImageUrl: string | null;
  provider: string;
  role: string;
  vendorId: number | null;
}
```

med:

```ts
import type { AuthUser } from "./lib/auth-types";
```

(plassert sammen med de andre importene øverst i filen, f.eks. rett under `import { emailService } from "./lib/email-service";`).

- [ ] **Step 2: Kjør typecheck for å bekrefte at uttrekket ikke knakk noe**

Run: `npx tsc --noEmit`
Expected: ingen nye feil.

- [ ] **Step 3: Legg til callback-URL-hjelper i `server/lib/app-base-url.ts`**

Legg til etter `getGoogleCallbackUrl`:

```ts
export function getEidCallbackUrl(provider: "bankid" | "buypass"): string {
  return `${getAppBaseUrl()}/api/auth/${provider}/callback`;
}
```

- [ ] **Step 4: Skriv failende test for `requiresEidLogin`**

Create `client/src/test/server/eid-auth.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { requiresEidLogin } from "../../../../server/eid-auth";

describe("requiresEidLogin", () => {
  it("does not require eID for super_admin", () => {
    expect(requiresEidLogin("super_admin")).toBe(false);
  });

  it("does not require eID for hovedadmin", () => {
    expect(requiresEidLogin("hovedadmin")).toBe(false);
  });

  it("does not require eID for vendor_admin", () => {
    expect(requiresEidLogin("vendor_admin")).toBe(false);
  });

  it("requires eID for tiltaksleder", () => {
    expect(requiresEidLogin("tiltaksleder")).toBe(true);
  });

  it("requires eID for teamleder", () => {
    expect(requiresEidLogin("teamleder")).toBe(true);
  });

  it("requires eID for case_manager", () => {
    expect(requiresEidLogin("case_manager")).toBe(true);
  });

  it("requires eID for miljoarbeider", () => {
    expect(requiresEidLogin("miljoarbeider")).toBe(true);
  });

  it("requires eID for member", () => {
    expect(requiresEidLogin("member")).toBe(true);
  });

  it("requires eID for an unknown/null role (defaults to member)", () => {
    expect(requiresEidLogin(null)).toBe(true);
  });
});
```

- [ ] **Step 5: Kjør testen og bekreft at den feiler**

Run: `npx vitest run client/src/test/server/eid-auth.test.ts`
Expected: FAIL — `Cannot find module '../../../../server/eid-auth'`

- [ ] **Step 6: Implementer `server/eid-auth.ts`**

```ts
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
const EID_PROVIDERS: Record<EidProvider, EidProviderConfig> = {
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
  const oidcConfig = await client.discovery(new URL(issuerUrl), clientId, clientSecret);

  const verify: VerifyFunctionWithRequest = async (req, tokens, verified) => {
    try {
      const claims = tokens.claims() || {};
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
```

- [ ] **Step 7: Kjør `requiresEidLogin`-testen og bekreft at den passerer**

Run: `npx vitest run client/src/test/server/eid-auth.test.ts`
Expected: PASS, 9/9 tester.

- [ ] **Step 8: Koble modulen til appen i `server/routes.ts`**

Etter linje 1554 (`await setupCustomAuth(app);`), legg til:

```ts
  await setupEidAuth(app);
```

Og legg til import øverst i filen sammen med `setupCustomAuth`-importen (linje 55):

```ts
import { buildEmailLoginUrl, setupCustomAuth, isAuthenticated } from "./custom-auth";
import { setupEidAuth } from "./eid-auth";
```

- [ ] **Step 9: Typecheck**

Run: `npx tsc --noEmit`
Expected: ingen nye feil.

- [ ] **Step 10: Commit**

```bash
git add server/lib/auth-types.ts server/lib/app-base-url.ts server/custom-auth.ts server/eid-auth.ts server/routes.ts client/src/test/server/eid-auth.test.ts
git commit -m "feat(eid): BankID-innlogging mot Signicat (kun oppslag, ingen registrering)"
```

**Manuell verifisering (blokkert på Signicat-avtale, kan ikke automatiseres i denne planen):** Når `SIGNICAT_ISSUER_URL`/`SIGNICAT_BANKID_CLIENT_ID`/`_SECRET` er satt mot sandkasse, logg inn én gang og bekreft i loggen at `claim keys on first token` inneholder `socialno`. Uten det er scope ikke aktivert i Signicat-dashbordet — se spec, "Åpne punkter".

---

## Task 4: Kobling og status-endepunkt

**Files:**
- Modify: `server/eid-auth.ts`
- Test: `client/src/test/server/eid-auth.test.ts` (utvider fila fra Task 3)

**Interfaces:**
- Consumes: `EID_PROVIDERS`, `resolveUserByEidIdentity`-mønsteret fra Task 3.
- Produces: `GET /api/auth/eid/link/:provider` (krever sesjon), `GET /api/auth/eid/status` — `{ linked: boolean, required: boolean }`. Brukes av frontend i Task 8.

- [ ] **Step 1: Skriv failende test for statuslogikken**

I `client/src/test/server/eid-auth.test.ts`, utvid den eksisterende importlinjen fra Task 3 (ikke legg til en ny — to `import`-linjer fra samme modul med overlappende navn gir "Duplicate identifier" i TypeScript):

```ts
import { requiresEidLogin, buildEidStatus } from "../../../../server/eid-auth";
```

Legg så til testene:

```ts
describe("buildEidStatus", () => {
  it("is not required and not linked for admin roles with no identity", () => {
    expect(buildEidStatus("vendor_admin", false)).toEqual({ linked: false, required: false });
  });

  it("is required and not linked for a non-admin role with no identity yet", () => {
    expect(buildEidStatus("miljoarbeider", false)).toEqual({ linked: false, required: true });
  });

  it("is required and linked once the identity exists", () => {
    expect(buildEidStatus("miljoarbeider", true)).toEqual({ linked: true, required: true });
  });
});
```

- [ ] **Step 2: Kjør testen og bekreft at den feiler**

Run: `npx vitest run client/src/test/server/eid-auth.test.ts`
Expected: FAIL — `buildEidStatus` er ikke eksportert ennå.

- [ ] **Step 3: Implementer koblingsrute, statusendepunkt og `buildEidStatus`**

Legg til i `server/eid-auth.ts` (importer `isAuthenticated` fra `./custom-auth`, `eq`/`and` er allerede importert):

```ts
export function buildEidStatus(
  role: string | null | undefined,
  linked: boolean,
): { linked: boolean; required: boolean } {
  return { linked, required: requiresEidLogin(role) };
}

async function hasLinkedEid(userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: eidIdentities.id })
    .from(eidIdentities)
    .where(eq(eidIdentities.userId, userId))
    .limit(1);
  return rows.length > 0;
}
```

Legg til de to nye rutene i `setupEidAuth` sin eksisterende body fra Task 3, rett etter `await registerProvider(app, "bankid");` og før den lukkende `}`:

```ts
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
    res.json(buildEidStatus(user.role, linked));
  });
```

`setupEidAuth` sin fulle kropp er nå (kun til referanse — ikke skriv den om, bare sett inn de to rutene over på riktig sted):

```ts
export async function setupEidAuth(app: Express): Promise<void> {
  if (!process.env.EID_SSN_HASH_PEPPER) {
    console.warn("[eid] EID_SSN_HASH_PEPPER er ikke satt — BankID/Buypass er deaktivert");
    return;
  }

  await registerProvider(app, "bankid");

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
    res.json(buildEidStatus(user.role, linked));
  });
}
```

Merk: siden `setupEidAuth` nå `return`er tidlig når pepperen mangler, vil `/api/auth/eid/link/:provider` og `/api/auth/eid/status` ikke bli registrert i det tilfellet heller — det er greit, samme prinsipp som resten av modulen: uten pepper kan ingenting eID-relatert fungere, men Google/e-post er upåvirket.

- [ ] **Step 4: Kjør testene og bekreft at de passerer**

Run: `npx vitest run client/src/test/server/eid-auth.test.ts`
Expected: PASS, alle tester (9 fra Task 3 + 3 nye).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: ingen nye feil.

- [ ] **Step 6: Commit**

```bash
git add server/eid-auth.ts client/src/test/server/eid-auth.test.ts
git commit -m "feat(eid): koblingsrute og statusendepunkt"
```

---

## Task 5: Håndheving i `custom-auth.ts`

**Files:**
- Modify: `server/custom-auth.ts`
- Test: `client/src/test/server/eid-enforcement.test.ts`

**Interfaces:**
- Consumes: `requiresEidLogin` og `hasLinkedEid(userId: string): Promise<boolean>` fra `server/eid-auth.ts` (`hasLinkedEid` er definert lokalt i Task 4 for `/eid/status` — dette steget eksporterer den samme funksjonen for gjenbruk her).

- [ ] **Step 1: Eksporter `hasLinkedEid` fra `server/eid-auth.ts`**

I `server/eid-auth.ts`, endre:

```ts
async function hasLinkedEid(userId: string): Promise<boolean> {
```

til:

```ts
export async function hasLinkedEid(userId: string): Promise<boolean> {
```

- [ ] **Step 2: Skriv failende test for håndhevingsbeslutningen**

Create `client/src/test/server/eid-enforcement.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { shouldRejectNonEidLogin } from "../../../../server/custom-auth";

describe("shouldRejectNonEidLogin", () => {
  it("never rejects admin-tier roles, linked or not", () => {
    expect(shouldRejectNonEidLogin("vendor_admin", false)).toBe(false);
    expect(shouldRejectNonEidLogin("vendor_admin", true)).toBe(false);
  });

  it("allows the one-time bootstrap login before eID is linked", () => {
    expect(shouldRejectNonEidLogin("miljoarbeider", false)).toBe(false);
  });

  it("rejects Google/e-post once eID is linked for a non-admin role", () => {
    expect(shouldRejectNonEidLogin("miljoarbeider", true)).toBe(true);
  });
});
```

- [ ] **Step 3: Kjør testen og bekreft at den feiler**

Run: `npx vitest run client/src/test/server/eid-enforcement.test.ts`
Expected: FAIL — `shouldRejectNonEidLogin` er ikke eksportert.

- [ ] **Step 4: Implementer beslutningsfunksjonen og koble den inn**

I `server/custom-auth.ts`, legg til importen (sammen med de andre lokale importene øverst):

```ts
import { requiresEidLogin, hasLinkedEid } from "./eid-auth";
```

Legg til rett over `declare global {` (rundt linje 236):

```ts
export function shouldRejectNonEidLogin(role: string | null | undefined, eidLinked: boolean): boolean {
  return requiresEidLogin(role) && eidLinked;
}
```

I Google-callback-handleren (linje 353-376), sjekk gaten **før** `req.logIn` kalles — brukeren skal ikke få en sesjon i det hele tatt hvis den skal avvises. Endre:

```ts
        if (!user) {
          const normalizedMessage = info?.message?.toLowerCase() || "";
          const errorCode = normalizedMessage.includes("tilgangsforespørsel")
            ? "access_request_required"
            : "auth_failed";
          return res.redirect(`/?error=${errorCode}`);
        }

        req.logIn(user, (loginError) => {
          if (loginError) {
            return next(loginError);
          }
          return res.redirect(getPostAuthRedirect(req));
        });
      })(req, res, next);
    }
  );
```

til:

```ts
        if (!user) {
          const normalizedMessage = info?.message?.toLowerCase() || "";
          const errorCode = normalizedMessage.includes("tilgangsforespørsel")
            ? "access_request_required"
            : "auth_failed";
          return res.redirect(`/?error=${errorCode}`);
        }

        hasLinkedEid(user.id)
          .then((eidLinked) => {
            if (shouldRejectNonEidLogin(user.role, eidLinked)) {
              return res.redirect("/?error=eid_required");
            }
            req.logIn(user, (loginError) => {
              if (loginError) {
                return next(loginError);
              }
              return res.redirect(getPostAuthRedirect(req));
            });
          })
          .catch(next);
      })(req, res, next);
    }
  );
```

(Denne handleren er allerede en synkron callback gitt til `passport.authenticate`, ikke en `async`-funksjon — `.then/.catch` unngår å endre signaturen.)

Samme mønster i e-post-verify-handleren (linje 421-441). Endre:

```ts
      const user = await resolveAuthorizedUserByEmail({
        email: payload.email,
        provider: "email",
      });

      if (!user) {
        return res.redirect("/?error=access_request_required");
      }

      req.logIn(user, (loginError) => {
        if (loginError) {
          return next(loginError);
        }
        return res.redirect(getPostAuthRedirect(req, payload?.returnTo));
      });
```

til:

```ts
      const user = await resolveAuthorizedUserByEmail({
        email: payload.email,
        provider: "email",
      });

      if (!user) {
        return res.redirect("/?error=access_request_required");
      }

      const eidLinked = await hasLinkedEid(user.id);
      if (shouldRejectNonEidLogin(user.role, eidLinked)) {
        return res.redirect("/?error=eid_required");
      }

      req.logIn(user, (loginError) => {
        if (loginError) {
          return next(loginError);
        }
        return res.redirect(getPostAuthRedirect(req, payload?.returnTo));
      });
```

(Denne handleren er allerede `async` — `await` er trygt å bruke direkte.)

- [ ] **Step 5: Kjør testen og bekreft at den passerer**

Run: `npx vitest run client/src/test/server/eid-enforcement.test.ts`
Expected: PASS, 3/3 tester.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: ingen nye feil.

- [ ] **Step 7: Commit**

```bash
git add server/custom-auth.ts server/eid-auth.ts client/src/test/server/eid-enforcement.test.ts
git commit -m "feat(eid): håndhev BankID for roller utenfor admin-sjiktet"
```

---

## Task 6: Buypass-provider

**Files:**
- Modify: `server/eid-auth.ts`
- Test: `client/src/test/server/eid-auth.test.ts`

**Interfaces:**
- Consumes: `EID_PROVIDERS`, `registerProvider` fra Task 3 (allerede provider-parameterisert — Buypass krever ingen nye funksjoner, kun et andre kall).

- [ ] **Step 1: Skriv failende test for at Buypass-config finnes med riktig scope/claim**

I `client/src/test/server/eid-auth.test.ts`, utvid igjen den samme importlinjen (fra Task 4) i stedet for å legge til en ny:

```ts
import { requiresEidLogin, buildEidStatus, EID_PROVIDERS } from "../../../../server/eid-auth";
```

Legg så til testene:

```ts
describe("EID_PROVIDERS", () => {
  it("requests the ssn scope and reads the socialno claim for BankID", () => {
    expect(EID_PROVIDERS.bankid.scope).toContain("ssn");
    expect(EID_PROVIDERS.bankid.ssnClaimKey).toBe("socialno");
  });

  it("requests the bpnnin scope and reads the bp_nnin_sub claim for Buypass", () => {
    expect(EID_PROVIDERS.buypass.scope).toContain("bpnnin");
    expect(EID_PROVIDERS.buypass.ssnClaimKey).toBe("bp_nnin_sub");
  });
});
```

- [ ] **Step 2: Kjør testen og bekreft at den feiler**

Run: `npx vitest run client/src/test/server/eid-auth.test.ts`
Expected: FAIL — `EID_PROVIDERS` er ikke eksportert.

- [ ] **Step 3: Eksporter `EID_PROVIDERS` og registrer Buypass**

I `server/eid-auth.ts`, endre:

```ts
const EID_PROVIDERS: Record<EidProvider, EidProviderConfig> = {
```

til:

```ts
export const EID_PROVIDERS: Record<EidProvider, EidProviderConfig> = {
```

I `setupEidAuth`, rett etter `await registerProvider(app, "bankid");`, legg til:

```ts
  await registerProvider(app, "buypass");
```

- [ ] **Step 4: Kjør testen og bekreft at den passerer**

Run: `npx vitest run client/src/test/server/eid-auth.test.ts`
Expected: PASS, alle tester.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: ingen nye feil.

- [ ] **Step 6: Commit**

```bash
git add server/eid-auth.ts client/src/test/server/eid-auth.test.ts
git commit -m "feat(eid): registrer Buypass som andre eID-leverandør"
```

**Manuell verifisering (blokkert på Signicat-avtale):** samme claim-loggings-sjekk som BankID, men bekreft `bp_nnin_sub` i stedet for `socialno`.

---

## Task 7: Frontend — innloggingsknapper

**Files:**
- Modify: `client/src/lib/auth-utils.ts`
- Modify: `client/src/pages/landing.tsx`

**Interfaces:**
- Produces: `buildEidAuthUrl(provider: "bankid" | "buypass", returnTo?: string | null): string` — gjenbrukes av Task 8 for koblingsknappen.

- [ ] **Step 1: Legg til `buildEidAuthUrl` i `auth-utils.ts`**

Etter `buildGoogleAuthUrl` (linje 27-35):

```ts
export function buildEidAuthUrl(provider: "bankid" | "buypass", returnTo?: string | null): string {
  const params = new URLSearchParams();
  const sanitizedReturnTo = sanitizeReturnTo(returnTo);
  if (sanitizedReturnTo) {
    params.set("returnTo", sanitizedReturnTo);
  }
  const query = params.toString();
  return query ? `/api/auth/${provider}/login?${query}` : `/api/auth/${provider}/login`;
}
```

- [ ] **Step 2: Legg til knappene i `landing.tsx`**

Importer `buildEidAuthUrl` sammen med `buildGoogleAuthUrl` øverst i filen. Legg til sporings- og start-funksjoner rett under `startGoogleLogin` (linje 534-537):

```ts
  const startEidLogin = (provider: "bankid" | "buypass", source: string) => {
    trackTidumPublicEvent(`tidum_${provider}_login_click`, {
      source,
      destination: `/api/auth/${provider}/login`,
    });
    window.location.href = buildEidAuthUrl(provider, "/dashboard");
  };
```

Legg til knappene etter Google-knappen i hero-seksjonen (linje 687-695):

```tsx
                <Button
                  type="button"
                  onClick={() => startGoogleLogin("hero_secondary")}
                  variant="outline"
                  className="tidum-btn-secondary h-auto px-6 py-3 text-lg font-medium"
                >
                  Logg inn med Google
                </Button>
                <Button
                  type="button"
                  onClick={() => startEidLogin("bankid", "hero_bankid")}
                  variant="outline"
                  className="tidum-btn-secondary h-auto px-6 py-3 text-lg font-medium"
                >
                  Logg inn med BankID
                </Button>
                <Button
                  type="button"
                  onClick={() => startEidLogin("buypass", "hero_buypass")}
                  variant="outline"
                  className="tidum-btn-secondary h-auto px-6 py-3 text-lg font-medium"
                >
                  Logg inn med Buypass
                </Button>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: ingen nye feil.

- [ ] **Step 4: Manuell verifisering i nettleser**

Run: `npm run dev`, åpne `http://localhost:5000/`, bekreft at begge nye knappene vises og at klikk navigerer til `/api/auth/bankid/login` / `/api/auth/buypass/login` (vil feile med redirect til `/?error=...` uten ekte Signicat-credentials — det er forventet før Task 3/6 sine "Åpne punkter" er løst).

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/auth-utils.ts client/src/pages/landing.tsx
git commit -m "feat(eid): BankID/Buypass-knapper på forsiden"
```

---

## Task 8: Frontend — tvungen kobling og gate

**Files:**
- Create: `client/src/hooks/use-eid-status.ts`
- Create: `client/src/pages/koble-bankid.tsx`
- Modify: `client/src/components/auth-guard.tsx`
- Modify: `client/src/App.tsx`

**Interfaces:**
- Consumes: `useAuth` (`client/src/hooks/use-auth.ts`), `buildEidAuthUrl` (Task 7).
- Produces: `useEidStatus()` — `{ data: { linked: boolean, required: boolean } | undefined, isLoading: boolean }`.

- [ ] **Step 1: Lag `use-eid-status.ts`**

```ts
import { useQuery } from "@tanstack/react-query";

interface EidStatus {
  linked: boolean;
  required: boolean;
}

async function fetchEidStatus(): Promise<EidStatus | null> {
  const response = await fetch("/api/auth/eid/status", { credentials: "include" });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(`${response.status}: ${response.statusText}`);
  return response.json();
}

export function useEidStatus(enabled: boolean) {
  return useQuery<EidStatus | null>({
    queryKey: ["/api/auth/eid/status"],
    queryFn: fetchEidStatus,
    enabled,
    retry: false,
    staleTime: 1000 * 60 * 5,
  });
}
```

- [ ] **Step 2: Lag koblingssiden**

Create `client/src/pages/koble-bankid.tsx`:

```tsx
import { Button } from "@/components/ui/button";
import { buildEidAuthUrl } from "@/lib/auth-utils";

export default function KobleBankId() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-md text-center space-y-6">
        <h1 className="text-2xl font-semibold">Koble BankID til kontoen din</h1>
        <p className="text-muted-foreground">
          Tidum krever BankID for din rolle. Dette gjøres kun én gang — etter
          koblingen bruker du BankID for all fremtidig innlogging.
        </p>
        <div className="flex flex-col gap-3">
          <Button
            type="button"
            onClick={() => {
              window.location.href = buildEidAuthUrl("bankid", "/dashboard");
            }}
          >
            Fortsett med BankID
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              window.location.href = buildEidAuthUrl("buypass", "/dashboard");
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

- [ ] **Step 3: Koble gaten inn i `AuthGuard`**

Erstatt hele innholdet i `client/src/components/auth-guard.tsx` med:

```tsx
import { type ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useEidStatus } from "@/hooks/use-eid-status";
import { useRolePreview } from "@/hooks/use-role-preview";
import { Redirect } from "wouter";
import { normalizeRole } from "@shared/roles";

interface AuthGuardProps {
  children: ReactNode;
  /** If set, require the user to have one of these roles */
  requiredRoles?: string[];
}

const EID_LINK_PATH = "/logg-inn/koble-bankid";

export function AuthGuard({ children, requiredRoles }: AuthGuardProps) {
  // DEV MODE: bypass auth to allow full page access
  const isDev = import.meta.env.DEV;
  const { user, isLoading, isAuthenticated } = useAuth();
  const { effectiveRole } = useRolePreview();
  const { data: eidStatus, isLoading: eidStatusLoading } = useEidStatus(isAuthenticated && !isDev);

  const hasRequiredRole = (() => {
    if (!requiredRoles || !user) return true;
    const normalizedUserRole = normalizeRole(effectiveRole);
    const normalizedRequiredRoles = requiredRoles.map((role) => normalizeRole(role));
    return normalizedRequiredRoles.includes(normalizedUserRole);
  })();

  if (isDev) {
    if (!hasRequiredRole) {
      return <Redirect to="/dashboard" />;
    }
    return <>{children}</>;
  }

  if (isLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background">
        <div className="inline-flex items-center gap-3 text-sm font-medium text-muted-foreground">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-primary" />
          Laster...
        </div>
      </main>
    );
  }

  if (!isAuthenticated) {
    return <Redirect to="/" />;
  }

  if (
    !eidStatusLoading &&
    eidStatus?.required &&
    !eidStatus.linked &&
    window.location.pathname !== EID_LINK_PATH
  ) {
    return <Redirect to={EID_LINK_PATH} />;
  }

  if (!hasRequiredRole) {
    return <Redirect to="/dashboard" />;
  }

  return <>{children}</>;
}
```

- [ ] **Step 4: Legg til ruten i `App.tsx`**

Legg til lazy-importen sammen med de andre (etter `const Landing = lazy(...)`, linje 21):

```ts
const KobleBankId = lazy(() => import("@/pages/koble-bankid"));
```

Legg til ruten før "Protected routes"-kommentaren (før linje 148, `<Route path="/dashboard">`), som en åpen (ikke `AuthGuard`-innpakket) rute siden `AuthGuard` selv redirecter hit før brukeren har lov til å se resten av appen:

```tsx
        <Route path="/logg-inn/koble-bankid" component={KobleBankId} />
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: ingen nye feil.

- [ ] **Step 6: Manuell verifisering i nettleser**

Run: `npm run dev`. Siden `isDev` bypasser hele gaten (linje `if (isDev) { ... }` i `AuthGuard`), bekreft manuelt kun at:
1. `/logg-inn/koble-bankid` rendrer uten å kreve innlogging (egen rute, ikke pakket i `AuthGuard`).
2. Begge knappene navigerer til riktig `/api/auth/{provider}/login`-URL.

Full gate-oppførsel (redirect fra `/dashboard` når `required && !linked`) kan først verifiseres ende-til-ende når `NODE_ENV=production` kjøres lokalt med en ekte, ikke-linket bruker — noteres som manuell produksjonsverifisering, ikke en del av denne planens automatiserte tester.

- [ ] **Step 7: Commit**

```bash
git add client/src/hooks/use-eid-status.ts client/src/pages/koble-bankid.tsx client/src/components/auth-guard.tsx client/src/App.tsx
git commit -m "feat(eid): tvungen koblingsside og AuthGuard-gate"
```

---

## Etter alle tasks

- Kjør hele testsuiten: `npx vitest run client/src/test/server/`
- Kjør full typecheck: `npx tsc --noEmit`
- Push branch og åpne PR mot `main` (spør bruker først, per vanlig rutine).
- Ekstern avhengighet før produksjon: Signicat-avtale + `client_id`/`client_secret` for begge leverandører, fnr-scope aktivert i dashbordet, `EID_SSN_HASH_PEPPER` satt i alle miljøer — se spec, "Åpne punkter".
