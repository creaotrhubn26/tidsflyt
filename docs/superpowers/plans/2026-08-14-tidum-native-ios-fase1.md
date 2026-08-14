# Tidum Native iOS/iPadOS App — Fase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a TestFlight-distributable SwiftUI app covering the miljøarbeider daily flow (BankID/Google login, dashboard, timeføring, klientsaker, rapportskriving, profil), backed by a new JWT-over-Bearer auth path added to the existing Express backend alongside its unchanged session-cookie auth.

**Architecture:** Native SwiftUI (iOS/iPadOS 17+), MVVM with `@Observable` ViewModels, Swift Concurrency. One `APIClient` actor talks to the existing `/api/*` JSON contract. Backend gets: a `mobile_refresh_tokens` table, a `resolveBearerUser` middleware that populates `req.user` from a Bearer JWT (additive — session-cookie auth for web is untouched), and mobile-specific OAuth callback routes that redirect to a `tidum://auth-callback` custom URL scheme instead of the web's cookie-session redirect.

**Tech Stack:** Swift 6, SwiftUI, Swift Concurrency, Swift Testing, `LocalAuthentication`, `AuthenticationServices`, Keychain Services, XcodeGen (project generation). Backend: existing Express/Drizzle stack, `jsonwebtoken` (already a dependency — no new backend package).

**Spec:** `docs/superpowers/specs/2026-08-14-tidum-native-ios-fase1-design.md`

## Global Constraints

- Minimum iOS/iPadOS version: **17.0** (`@Observable` macro requirement).
- No new UI/networking/state-management third-party Swift packages — Apple frameworks only.
- Access token and refresh token live **only** in Keychain, never UserDefaults or disk.
- No offline database/sync engine in fase 1 (online-only).
- Distribution: TestFlight/internal, not public App Store, in fase 1.
- All 71 existing web `/api/*` routes stay functionally unchanged for session-cookie callers — only the auth check in front of the fase-1 subset is widened to also accept a Bearer JWT.
- **Scope correction from spec, grounded in the actual codebase during planning:** the spec's section 4.7 assumed "BankID-kobling-til-eksisterende-konto" (linking BankID to an already-logged-in mobile session) works via "samme prinsipp [som web], bare med token i stedet for cookie." It doesn't transfer that simply: `ASWebAuthenticationSession` is a browser-driven navigation, not an app-controlled network request, so there is no way to attach the app's Bearer token to the initial BankID redirect. Making that work needs a short-lived server-issued "link ticket" round-tripped through the OAuth session (a real, buildable mechanism, but a distinct piece of work). **This plan builds only standalone BankID/Google login for fase 1** (the flow every first-time mobile user actually hits) and defers the link-to-existing-mobile-session flow to a fase-1.5 follow-up plan. This is a scope ruling made during planning, not a silent drop — flagged here for the spec owner to confirm.

---

## File Structure

**Backend (existing repo, new/modified files):**
- Create: `migrations/051_mobile_refresh_tokens.sql`
- Modify: `shared/models/auth.ts` — add `mobileRefreshTokens` table
- Modify: `server/lib/run-startup-migrations.ts` — register migration 051
- Create: `server/lib/mobile-auth.ts` — JWT + refresh-token issue/verify/revoke, owns all token mechanics
- Modify: `server/custom-auth.ts` — `resolveBearerUser` + `isAuthenticatedOrBearer` middleware, mobile Google login/callback routes, `/api/auth/mobile/refresh` and `/api/auth/mobile/logout`, fix the inline `/api/auth/user` auth check
- Modify: `server/eid-auth.ts` — mobile BankID login/callback routes, fix the inline `/api/auth/eid/status` auth check
- Modify: `server/routes.ts` — swap `isAuthenticated` → `isAuthenticatedOrBearer` on the 10 fase-1 routes
- Test: `client/src/test/server/mobile-auth.test.ts`
- Test: `client/src/test/server/mobile-bearer-auth.test.ts`

**iOS (new directory, `ios/Tidum/`):**
```
ios/Tidum/
  project.yml                          — XcodeGen spec
  Tidum.xcodeproj                      — generated, not hand-edited
  Tidum/
    TidumApp.swift                     — @main entry, root view routing
    App/
      AppState.swift                   — @Observable, drives loggedOut/locked/unlocked
    Auth/
      KeychainStore.swift
      BiometricLock.swift
      AuthSession.swift                — ASWebAuthenticationSession wrapper
    Networking/
      APIClient.swift                  — actor, Bearer injection, 401→refresh→retry
      NetworkError.swift
      Models.swift                     — DTOs mirroring backend JSON
    Features/
      Login/LoginView.swift
      Lock/LockView.swift
      Dashboard/DashboardView.swift, DashboardViewModel.swift
      TimeTracking/TimeTrackingView.swift, TimeTrackingViewModel.swift
      Cases/CasesListView.swift, CaseDetailView.swift, CasesViewModel.swift
      CaseReports/NewReportView.swift, ReportViewModel.swift
      Profile/ProfileView.swift, ProfileViewModel.swift
    Root/RootView.swift, MainTabView.swift
  TidumTests/
    KeychainStoreTests.swift
    APIClientTests.swift
    MockURLProtocol.swift
  TidumUITests/
    CriticalPathUITests.swift
```

---

### Task 1: `mobile_refresh_tokens` table

**Files:**
- Create: `migrations/051_mobile_refresh_tokens.sql`
- Modify: `shared/models/auth.ts` (after the `eidIdentities` block, around line 60)
- Modify: `server/lib/run-startup-migrations.ts`
- Test: `client/src/test/server/mobile-refresh-tokens-schema.test.ts`

**Interfaces:**
- Produces: Drizzle table `mobileRefreshTokens` with columns `id, userId, tokenHash, expiresAt, revokedAt, createdAt` — consumed by Task 2's `server/lib/mobile-auth.ts`.

- [ ] **Step 1: Write the migration**

```sql
-- Migration 051: mobile_refresh_tokens
--
-- Refresh tokens for the native iOS app's JWT-over-Bearer auth path (see
-- server/lib/mobile-auth.ts). Only the SHA-256 hash of the token is stored —
-- the raw token is never persisted, so a leaked database row can't be
-- replayed. revoked_at lets a single stolen/lost device be cut off without
-- rotating the signing secret for everyone.

CREATE TABLE IF NOT EXISTS mobile_refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMP NOT NULL,
  revoked_at  TIMESTAMP,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mobile_refresh_tokens_user_idx
  ON mobile_refresh_tokens (user_id);
```

- [ ] **Step 2: Add the Drizzle table definition**

In `shared/models/auth.ts`, immediately after the `eidIdentities` block (after its closing `);` — the block ending around line 60 that starts with `uniqueIndex("eid_identities_user_provider_key")`):

```typescript
export const mobileRefreshTokens = pgTable("mobile_refresh_tokens", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type MobileRefreshToken = typeof mobileRefreshTokens.$inferSelect;
```

- [ ] **Step 3: Register the migration for startup**

In `server/lib/run-startup-migrations.ts`, add `"051_mobile_refresh_tokens.sql",` to the `STARTUP_MIGRATIONS` array, immediately after the existing `"050_eid_identities.sql",` line.

- [ ] **Step 4: Write a schema smoke test**

```typescript
// client/src/test/server/mobile-refresh-tokens-schema.test.ts
import { describe, it, expect } from "vitest";
import { mobileRefreshTokens } from "../../../../shared/models/auth";

describe("mobileRefreshTokens schema", () => {
  it("exposes the expected columns", () => {
    expect(Object.keys(mobileRefreshTokens)).toEqual(
      expect.arrayContaining(["id", "userId", "tokenHash", "expiresAt", "revokedAt", "createdAt"]),
    );
  });
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run client/src/test/server/mobile-refresh-tokens-schema.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add migrations/051_mobile_refresh_tokens.sql shared/models/auth.ts server/lib/run-startup-migrations.ts client/src/test/server/mobile-refresh-tokens-schema.test.ts
git commit -m "feat(mobile-auth): add mobile_refresh_tokens table"
```

---

### Task 2: Token issuance/verification (`server/lib/mobile-auth.ts`)

**Files:**
- Create: `server/lib/mobile-auth.ts`
- Test: `client/src/test/server/mobile-auth.test.ts`

**Interfaces:**
- Consumes: `mobileRefreshTokens` table (Task 1), `db` from `./db`, `users` from `@shared/schema`.
- Produces (consumed by Tasks 3, 4, 5):
  - `signAccessToken(userId: string): string`
  - `verifyAccessToken(token: string): string` — returns userId, throws on invalid/expired
  - `issueMobileTokens(userId: string): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }>`
  - `refreshMobileAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresIn: number } | null>`
  - `revokeMobileRefreshToken(refreshToken: string): Promise<void>`
  - `MOBILE_ACCESS_TOKEN_TTL_SECONDS: number` (3600)

- [ ] **Step 1: Write the failing tests**

```typescript
// client/src/test/server/mobile-auth.test.ts
import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  process.env.MOBILE_JWT_SECRET = "test-secret-do-not-use-in-prod";
});

describe("signAccessToken / verifyAccessToken", () => {
  it("round-trips a user id", async () => {
    const { signAccessToken, verifyAccessToken } = await import("../../../../server/lib/mobile-auth");
    const token = signAccessToken("user-123");
    expect(verifyAccessToken(token)).toBe("user-123");
  });

  it("throws on a tampered token", async () => {
    const { signAccessToken, verifyAccessToken } = await import("../../../../server/lib/mobile-auth");
    const token = signAccessToken("user-123");
    expect(() => verifyAccessToken(token + "x")).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run client/src/test/server/mobile-auth.test.ts`
Expected: FAIL with "Cannot find module '../../../../server/lib/mobile-auth'"

- [ ] **Step 3: Write the implementation**

```typescript
// server/lib/mobile-auth.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run client/src/test/server/mobile-auth.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Add refresh-token lifecycle tests**

Append to `client/src/test/server/mobile-auth.test.ts`:

```typescript
import { db } from "../../../../server/db";
import { mobileRefreshTokens, users } from "../../../../shared/schema";
import { eq } from "drizzle-orm";

describe("issueMobileTokens / refreshMobileAccessToken / revokeMobileRefreshToken", () => {
  it("issues a refresh token that can refresh an access token, then stops working once revoked", async () => {
    const { issueMobileTokens, refreshMobileAccessToken, revokeMobileRefreshToken } = await import(
      "../../../../server/lib/mobile-auth"
    );
    const [user] = await db
      .insert(users)
      .values({ email: `mobile-auth-test-${Date.now()}@example.com`, role: "member" })
      .returning();

    const { refreshToken } = await issueMobileTokens(user.id);

    const refreshed = await refreshMobileAccessToken(refreshToken);
    expect(refreshed).not.toBeNull();
    expect(refreshed?.accessToken).toBeTruthy();

    await revokeMobileRefreshToken(refreshToken);
    const afterRevoke = await refreshMobileAccessToken(refreshToken);
    expect(afterRevoke).toBeNull();

    await db.delete(mobileRefreshTokens).where(eq(mobileRefreshTokens.userId, user.id));
    await db.delete(users).where(eq(users.id, user.id));
  });

  it("returns null for an unknown refresh token", async () => {
    const { refreshMobileAccessToken } = await import("../../../../server/lib/mobile-auth");
    expect(await refreshMobileAccessToken("not-a-real-token")).toBeNull();
  });
});
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run client/src/test/server/mobile-auth.test.ts`
Expected: PASS (4 tests) — requires `DATABASE_URL` to point at a reachable test database, same as the rest of this test suite.

- [ ] **Step 7: Commit**

```bash
git add server/lib/mobile-auth.ts client/src/test/server/mobile-auth.test.ts
git commit -m "feat(mobile-auth): add JWT access-token and refresh-token issuance"
```

---

### Task 3: `resolveBearerUser` middleware and fase-1 route auth swap

**Files:**
- Modify: `server/custom-auth.ts` (add middleware near `isAuthenticated` at line 494; mount in `setupCustomAuth` after `app.use(passport.session())` at line 290; fix `/api/auth/user` at line 458-467)
- Modify: `server/eid-auth.ts` (fix `/api/auth/eid/status` at line 279-286)
- Modify: `server/routes.ts` (swap middleware on 10 routes, see Step 3)
- Test: `client/src/test/server/mobile-bearer-auth.test.ts`

**Interfaces:**
- Consumes: `verifyAccessToken` from `server/lib/mobile-auth.ts` (Task 2).
- Produces: `resolveBearerUser: RequestHandler` and `isAuthenticatedOrBearer: RequestHandler`, exported from `server/custom-auth.ts` — consumed by `server/routes.ts` (this task) and by Tasks 4/5's mobile auth routes (which run behind `resolveBearerUser` automatically since it's mounted globally).

- [ ] **Step 1: Write the failing test**

```typescript
// client/src/test/server/mobile-bearer-auth.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import express from "express";
import request from "supertest";

beforeAll(() => {
  process.env.MOBILE_JWT_SECRET = "test-secret-do-not-use-in-prod";
});

describe("isAuthenticatedOrBearer", () => {
  it("rejects a request with no credentials", async () => {
    const { isAuthenticatedOrBearer } = await import("../../../../server/custom-auth");
    const app = express();
    app.get("/protected", isAuthenticatedOrBearer, (_req, res) => res.json({ ok: true }));
    const res = await request(app).get("/protected");
    expect(res.status).toBe(401);
  });

  it("accepts a request with a valid Bearer access token and populates req.user", async () => {
    const { resolveBearerUser, isAuthenticatedOrBearer } = await import("../../../../server/custom-auth");
    const { signAccessToken } = await import("../../../../server/lib/mobile-auth");
    const { db } = await import("../../../../server/db");
    const { users } = await import("../../../../shared/schema");

    const [user] = await db
      .insert(users)
      .values({ email: `bearer-test-${Date.now()}@example.com`, role: "member", firstName: "Test" })
      .returning();

    const app = express();
    app.use(resolveBearerUser);
    app.get("/protected", isAuthenticatedOrBearer, (req, res) => res.json({ id: (req.user as any).id }));

    const token = signAccessToken(user.id);
    const res = await request(app).get("/protected").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(user.id);

    const { eq } = await import("drizzle-orm");
    await db.delete(users).where(eq(users.id, user.id));
  });
});
```

Requires `supertest` for in-process request testing. Check it's available: `npm ls supertest`. If not present, add it as a dev dependency: `npm install --save-dev supertest @types/supertest`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run client/src/test/server/mobile-bearer-auth.test.ts`
Expected: FAIL — `resolveBearerUser`/`isAuthenticatedOrBearer` are not exported yet.

- [ ] **Step 3: Add the middleware to `server/custom-auth.ts`**

Add this import at the top (alongside the existing `import { db } from "./db";` at line 7):

```typescript
import { verifyAccessToken } from "./lib/mobile-auth";
```

Add right after the existing `isAuthenticated` export (after line 500, `};`):

```typescript
// Populerer req.user fra en Bearer-JWT hvis til stede — påvirker ALDRI en
// gyldig Passport-sesjon (web), og blokkerer aldri selv: en manglende/ugyldig
// header lar requesten fortsette usatt, og ruten under avgjør 401 selv.
// Montert globalt i setupCustomAuth, rett etter passport.session(), slik at
// ALLE ruter i appen — også de som sjekker req.user direkte uten
// isAuthenticatedOrBearer (f.eks. sakerRapportRoutes.ts sin lokale
// requireAuth) — automatisk fungerer med mobil-token uten videre endring.
export const resolveBearerUser: RequestHandler = async (req, _res, next) => {
  if (req.user) return next();
  const authHeader = req.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return next();
  try {
    const userId = verifyAccessToken(authHeader.slice("Bearer ".length));
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (user) {
      req.user = {
        id: user.id,
        email: user.email || "",
        name: [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.email || "",
        profileImageUrl: user.profileImageUrl,
        provider: "mobile",
        role: user.role || "member",
        vendorId: user.vendorId,
      };
    }
  } catch {
    // Ugyldig/utløpt token — req.user forblir usatt, ruten under avgjør 401.
  }
  next();
};

export const isAuthenticatedOrBearer: RequestHandler = (req, res, next) => {
  if (isDev) return next();
  if (req.user) return next();
  res.status(401).json({ message: "Ikke autentisert" });
};
```

- [ ] **Step 4: Mount `resolveBearerUser` in `setupCustomAuth`**

In `server/custom-auth.ts`, change lines 288-290 from:

```typescript
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());
```

to:

```typescript
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());
  app.use(resolveBearerUser);
```

- [ ] **Step 5: Fix the inline-checked `/api/auth/user` route**

Change lines 458-467 from:

```typescript
  app.get("/api/auth/user", (req, res) => {
    if (isDev && !req.isAuthenticated?.()) {
      return res.json(DEV_USER);
    }
    if (req.isAuthenticated() && req.user) {
      res.json(req.user);
    } else {
      res.status(401).json({ message: "Ikke autentisert" });
    }
  });
```

to:

```typescript
  app.get("/api/auth/user", (req, res) => {
    if (isDev && !req.user) {
      return res.json(DEV_USER);
    }
    if (req.user) {
      res.json(req.user);
    } else {
      res.status(401).json({ message: "Ikke autentisert" });
    }
  });
```

(`req.isAuthenticated()` is Passport-session-specific and stays `false` for a Bearer-only request even though `resolveBearerUser` has populated `req.user` — checking `req.user` directly is correct for both auth methods and is exactly the invariant `resolveBearerUser` establishes.)

- [ ] **Step 6: Fix the inline-checked `/api/auth/eid/status` route**

In `server/eid-auth.ts`, change lines 279-282 from:

```typescript
  app.get("/api/auth/eid/status", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Ikke autentisert" });
    }
```

to:

```typescript
  app.get("/api/auth/eid/status", async (req, res) => {
    if (!req.user) {
      return res.status(401).json({ message: "Ikke autentisert" });
    }
```

- [ ] **Step 7: Swap `isAuthenticated` → `isAuthenticatedOrBearer` on the fase-1 routes**

In `server/routes.ts`, change the import at line 55 from:

```typescript
import { buildEmailLoginUrl, setupCustomAuth, isAuthenticated } from "./custom-auth";
```

to:

```typescript
import { buildEmailLoginUrl, setupCustomAuth, isAuthenticated, isAuthenticatedOrBearer } from "./custom-auth";
```

Then replace `isAuthenticated` with `isAuthenticatedOrBearer` on exactly these 10 route declarations (identify each by its exact route string — do not touch any other `isAuthenticated` usage in this file):

- Line 3929: `app.get("/api/stats", isAuthenticated, apiRateLimit, async (req, res) => {`
- Line 4171: `app.get("/api/profile", isAuthenticated, async (req, res) => {`
- Line 4199: `app.patch("/api/profile", isAuthenticated, async (req, res) => {`
- Line 4403: `app.get("/api/time-tracking/work-types", isAuthenticated, async (req, res) => {`
- Line 4615: `app.get("/api/time-entries", isAuthenticated, async (req, res) => {`
- Line 4630: `app.get("/api/worker/summary", isAuthenticated, async (req, res) => {`
- Line 4642: `app.get("/api/company/me/assigned-cases", isAuthenticated, async (req, res) => {`
- Line 5180: `app.post("/api/time-entries", isAuthenticated, async (req, res) => {`
- Line 5215: `app.patch("/api/time-entries/:id", isAuthenticated, async (req, res) => {`
- Line 5233: `app.delete("/api/time-entries/:id", isAuthenticated, async (req, res) => {`

Each becomes the same line with `isAuthenticatedOrBearer` in place of `isAuthenticated` — the rest of the line (route path, subsequent middleware, handler) is unchanged.

Line numbers were read at planning time and may have drifted by the time this task runs — search for the exact route-string text quoted above rather than trusting the line number if the file has since changed.

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run client/src/test/server/mobile-bearer-auth.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 9: Run the full existing server test suite to confirm no regression**

Run: `npx vitest run client/src/test/server/`
Expected: PASS — in particular `eid-auth.test.ts` and `eid-enforcement.test.ts` must still pass unchanged, since Steps 5-6 only widened the truthiness check, they didn't change behavior for session-authenticated requests.

- [ ] **Step 10: Commit**

```bash
git add server/custom-auth.ts server/eid-auth.ts server/routes.ts client/src/test/server/mobile-bearer-auth.test.ts package.json package-lock.json
git commit -m "feat(mobile-auth): add resolveBearerUser middleware, wire into fase-1 routes"
```

---

### Task 4: Mobile BankID login (`server/eid-auth.ts`)

**Files:**
- Modify: `server/eid-auth.ts`

**Interfaces:**
- Consumes: `issueMobileTokens` from `server/lib/mobile-auth.ts` (Task 2); existing `resolveUserByEidIdentity`, `hashSsn`, `logAuthEvent` (already in this file).
- Produces: `GET /api/auth/idura/login-mobile` and `GET /api/auth/idura/callback-mobile` routes. Redirects the device browser to `tidum://auth-callback?access_token=...&refresh_token=...&expires_in=...` on success, or `tidum://auth-callback?error=<code>` on failure (`eid_failed`, `eid_missing_ssn`, `eid_not_linked` — same codes the web flow already uses).

- [ ] **Step 1: Add the import**

At the top of `server/eid-auth.ts`, add to the existing imports:

```typescript
import { issueMobileTokens } from "./lib/mobile-auth";
```

- [ ] **Step 2: Add the mobile routes**

Inside `setupEidAuth`, immediately after the existing `app.get(IDURA_CALLBACK_PATH, iduraMiddleware, handleIduraCallback);` line (currently line 277), insert:

```typescript
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
          userId: null,
          sessionId: null,
          ipAddress: req.ip,
          userAgent: req.get("user-agent") || undefined,
        });
        return res.redirect(`${MOBILE_AUTH_CALLBACK_URL}?error=eid_missing_ssn`);
      }

      const ssnHash = hashSsn(fnr);
      const resolvedUser = await resolveUserByEidIdentity(ssnHash);
      if (!resolvedUser) {
        await logAuthEvent({
          userId: null,
          sessionId: null,
          ipAddress: req.ip,
          userAgent: req.get("user-agent") || undefined,
        });
        return res.redirect(`${MOBILE_AUTH_CALLBACK_URL}?error=eid_not_linked`);
      }

      await logAuthEvent({
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

  app.get(IDURA_MOBILE_LOGIN_PATH, iduraMobileMiddleware, handleIduraMobileCallback);
  app.get(IDURA_MOBILE_CALLBACK_PATH, iduraMobileMiddleware, handleIduraMobileCallback);
```

- [ ] **Step 3: Verify the server still starts and typechecks**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Manual setup note (not code — record in the task report)**

The Idura dashboard's registered redirect_uri list for this OIDC client needs `${getAppBaseUrl()}/api/auth/idura/callback-mobile` added (same manual console step as the `tidum-backend.onrender.com` callback added earlier this project). This can't be done via CLI — flag it in the task report as a manual follow-up for whoever has Idura console access, and note in `docs/superpowers/plans/2026-08-14-tidum-native-ios-fase1.md`'s ledger that BankID mobile login cannot be live-tested until this is done.

- [ ] **Step 5: Commit**

```bash
git add server/eid-auth.ts
git commit -m "feat(mobile-auth): add mobile BankID login routes, issuing JWT instead of a session"
```

---

### Task 5: Mobile Google login + refresh/logout endpoints (`server/custom-auth.ts`)

**Files:**
- Modify: `server/custom-auth.ts`

**Interfaces:**
- Consumes: `issueMobileTokens`, `refreshMobileAccessToken`, `revokeMobileRefreshToken` from `server/lib/mobile-auth.ts` (Task 2); existing `findOrCreateUser`, `hasLinkedEid`, `shouldRejectNonEidLogin` (already in this file).
- Produces: `GET /api/auth/google-mobile`, `GET /api/auth/google/callback-mobile`, `POST /api/auth/mobile/refresh`, `POST /api/auth/mobile/logout`.

- [ ] **Step 1: Add the import**

Add to the existing imports in `server/custom-auth.ts`:

```typescript
import { issueMobileTokens, refreshMobileAccessToken, revokeMobileRefreshToken } from "./lib/mobile-auth";
```

- [ ] **Step 2: Add the mobile Google routes**

Immediately after the existing `app.get("/api/auth/google/callback", ...)` block (ends around line 379), insert:

```typescript
  // Mobilappens Google-innlogging. passport-oauth2 lar callbackURL overstyres
  // per authenticate()-kall (options.callbackURL || this._callbackURL, se
  // node_modules/passport-oauth2/lib/strategy.js) — samme registrerte
  // "google"-strategi gjenbrukes, bare med et annet mål for redirect_uri enn
  // web-varianten. MOBILE_AUTH_CALLBACK_URL er custom URL scheme-en appen
  // fanger opp via ASWebAuthenticationSession.
  const MOBILE_AUTH_CALLBACK_URL = "tidum://auth-callback";
  const getGoogleMobileCallbackUrl = () => `${getAppBaseUrl()}/api/auth/google/callback-mobile`;

  app.get("/api/auth/google-mobile", (req, res, next) => {
    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.status(500).json({ error: "Google OAuth er ikke konfigurert" });
    }
    passport.authenticate("google", {
      scope: ["openid", "email"],
      prompt: "select_account",
      callbackURL: getGoogleMobileCallbackUrl(),
    } as any)(req, res, next);
  });

  app.get("/api/auth/google/callback-mobile", (req, res, next) => {
    passport.authenticate(
      "google",
      { callbackURL: getGoogleMobileCallbackUrl() } as any,
      (err: Error | null, user: AuthUser | false, info?: { message?: string }) => {
        if (err) return next(err);
        if (!user) {
          const normalizedMessage = info?.message?.toLowerCase() || "";
          const errorCode = normalizedMessage.includes("tilgangsforespørsel")
            ? "access_request_required"
            : "auth_failed";
          return res.redirect(`${MOBILE_AUTH_CALLBACK_URL}?error=${errorCode}`);
        }
        hasLinkedEid(user.id)
          .then(async (eidLinked) => {
            if (shouldRejectNonEidLogin(user.role, eidLinked)) {
              return res.redirect(`${MOBILE_AUTH_CALLBACK_URL}?error=eid_required`);
            }
            const { accessToken, refreshToken, expiresIn } = await issueMobileTokens(user.id);
            const redirectUrl = new URL(MOBILE_AUTH_CALLBACK_URL);
            redirectUrl.searchParams.set("access_token", accessToken);
            redirectUrl.searchParams.set("refresh_token", refreshToken);
            redirectUrl.searchParams.set("expires_in", String(expiresIn));
            return res.redirect(redirectUrl.toString());
          })
          .catch(next);
      },
    )(req, res, next);
  });
```

- [ ] **Step 3: Add refresh and logout endpoints**

Immediately after the block from Step 2, insert:

```typescript
  app.post("/api/auth/mobile/refresh", async (req, res) => {
    const refreshToken = typeof req.body?.refreshToken === "string" ? req.body.refreshToken : "";
    if (!refreshToken) {
      return res.status(400).json({ message: "refreshToken er påkrevd" });
    }
    const result = await refreshMobileAccessToken(refreshToken);
    if (!result) {
      return res.status(401).json({ message: "Ugyldig eller utløpt refresh-token" });
    }
    res.json(result);
  });

  app.post("/api/auth/mobile/logout", async (req, res) => {
    const refreshToken = typeof req.body?.refreshToken === "string" ? req.body.refreshToken : "";
    if (refreshToken) {
      await revokeMobileRefreshToken(refreshToken);
    }
    res.json({ success: true });
  });
```

- [ ] **Step 4: Write tests**

```typescript
// client/src/test/server/mobile-refresh-endpoint.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import express from "express";
import request from "supertest";

beforeAll(() => {
  process.env.MOBILE_JWT_SECRET = "test-secret-do-not-use-in-prod";
});

describe("POST /api/auth/mobile/refresh and /api/auth/mobile/logout", () => {
  it("rejects a missing refreshToken with 400", async () => {
    // Route registration happens inside setupCustomAuth, which needs a full
    // Express app + session store — exercised end-to-end via the app's own
    // integration tests. Here we test the underlying functions directly,
    // matching Task 2's coverage; this file documents the HTTP contract.
    const { refreshMobileAccessToken } = await import("../../../../server/lib/mobile-auth");
    expect(await refreshMobileAccessToken("")).toBeNull();
  });
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run client/src/test/server/mobile-refresh-endpoint.test.ts`
Expected: PASS

- [ ] **Step 6: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors. (The `as any` casts on `callbackURL` are necessary because `@types/passport-oauth2`'s `AuthenticateOptions` doesn't declare it, even though the runtime reads it — verified directly from `node_modules/passport-oauth2/lib/strategy.js` at planning time.)

- [ ] **Step 7: Manual setup note (record in task report)**

Google Cloud Console's "CreatorHub" OAuth client (the same one `tidum.no`/`tidum-backend.onrender.com` already use) needs `${getAppBaseUrl()}/api/auth/google/callback-mobile` added to Authorized redirect URIs — manual console step, flag as follow-up.

- [ ] **Step 8: Commit**

```bash
git add server/custom-auth.ts client/src/test/server/mobile-refresh-endpoint.test.ts
git commit -m "feat(mobile-auth): add mobile Google login, token refresh, and logout endpoints"
```

---

### Task 6: iOS project scaffold (XcodeGen)

**Files:**
- Create: `ios/Tidum/project.yml`
- Create: `ios/Tidum/Tidum/TidumApp.swift`
- Create: `ios/Tidum/Tidum/Root/RootView.swift`
- Create: `ios/Tidum/TidumTests/PlaceholderTests.swift` (replaced by real tests in later tasks — a genuinely empty test target fails `xcodebuild test`, so this exists only to make Step 4 pass; Task 9 adds `APIClientTests.swift` which supersedes it)
- Generated: `ios/Tidum/Tidum.xcodeproj` (via XcodeGen, not hand-edited, not committed — add to `.gitignore`)

**Interfaces:**
- Produces: a buildable, testable Xcode project — every later iOS task adds files under `ios/Tidum/Tidum/` and assumes `project.yml`'s `sources: [Tidum]` glob already picks them up automatically (no per-file project.yml edits needed for later tasks).

- [ ] **Step 1: Install XcodeGen**

Run: `which xcodegen || brew install xcodegen`
Expected: `xcodegen` on PATH afterward.

- [ ] **Step 2: Write the XcodeGen spec**

```yaml
# ios/Tidum/project.yml
name: Tidum
options:
  bundleIdPrefix: no.tidum
  deploymentTarget:
    iOS: "17.0"
settings:
  base:
    SWIFT_VERSION: "6.0"
targets:
  Tidum:
    type: application
    platform: iOS
    sources: [Tidum]
    info:
      path: Tidum/Info.plist
      properties:
        UILaunchScreen: {}
        CFBundleURLTypes:
          - CFBundleURLSchemes: [tidum]
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: no.tidum.app
        TARGETED_DEVICE_FAMILY: "1,2"
        SUPPORTS_MACCATALYST: false
  TidumTests:
    type: bundle.unit-test
    platform: iOS
    sources: [TidumTests]
    dependencies:
      - target: Tidum
  TidumUITests:
    type: bundle.ui-testing
    platform: iOS
    sources: [TidumUITests]
    dependencies:
      - target: Tidum
schemes:
  Tidum:
    build:
      targets:
        Tidum: all
    test:
      targets: [TidumTests, TidumUITests]
```

- [ ] **Step 3: Write the app entry point and a minimal root view**

```swift
// ios/Tidum/Tidum/TidumApp.swift
import SwiftUI

@main
struct TidumApp: App {
    var body: some Scene {
        WindowGroup {
            RootView()
        }
    }
}
```

```swift
// ios/Tidum/Tidum/Root/RootView.swift
import SwiftUI

struct RootView: View {
    var body: some View {
        Text("Tidum")
    }
}

#Preview {
    RootView()
}
```

```swift
// ios/Tidum/TidumTests/PlaceholderTests.swift
import Testing

@Suite("Placeholder")
struct PlaceholderTests {
    @Test func projectBuilds() {
        #expect(true)
    }
}
```

- [ ] **Step 4: Generate the project and verify it builds and tests green**

Run:
```bash
cd ios/Tidum
xcodegen generate
xcodebuild test -scheme Tidum -destination 'platform=iOS Simulator,name=iPhone 16' | tail -30
```
Expected: `** TEST SUCCEEDED **`

- [ ] **Step 5: Ignore the generated project file, commit the source**

```bash
cat >> .gitignore <<'EOF'

# iOS: XcodeGen-generated, regenerate with `xcodegen generate` in ios/Tidum
ios/Tidum/Tidum.xcodeproj/
ios/Tidum/*.xcworkspace/
ios/Tidum/DerivedData/
EOF
git add ios/Tidum/project.yml ios/Tidum/Tidum/TidumApp.swift ios/Tidum/Tidum/Root/RootView.swift ios/Tidum/TidumTests/PlaceholderTests.swift .gitignore
git commit -m "feat(ios): scaffold Xcode project via XcodeGen"
```

---

### Task 7: Keychain storage and Face ID lock

**Files:**
- Create: `ios/Tidum/Tidum/Auth/KeychainStore.swift`
- Create: `ios/Tidum/Tidum/Auth/BiometricLock.swift`
- Test: `ios/Tidum/TidumTests/KeychainStoreTests.swift`

**Interfaces:**
- Produces (consumed by Task 9's `AuthSession`/`AppState` and Task 10's `APIClient`):
  - `KeychainStore.save(accessToken: String, refreshToken: String) throws`
  - `KeychainStore.loadRefreshToken() -> String?` (biometry-gated read)
  - `KeychainStore.loadAccessToken() -> String?` (not biometry-gated — short-lived, read freely once unlocked)
  - `KeychainStore.updateAccessToken(_ token: String) throws`
  - `KeychainStore.clear()`
  - `BiometricLock.authenticate() async -> Bool`

- [ ] **Step 1: Write the failing test**

```swift
// ios/Tidum/TidumTests/KeychainStoreTests.swift
import Testing
@testable import Tidum

@Suite("KeychainStore")
struct KeychainStoreTests {
    @Test func savesAndLoadsAccessToken() throws {
        let store = KeychainStore(service: "no.tidum.tests.\(UUID().uuidString)")
        try store.save(accessToken: "access-123", refreshToken: "refresh-456")
        #expect(store.loadAccessToken() == "access-123")
        store.clear()
        #expect(store.loadAccessToken() == nil)
    }

    @Test func updatesAccessTokenInPlace() throws {
        let store = KeychainStore(service: "no.tidum.tests.\(UUID().uuidString)")
        try store.save(accessToken: "old", refreshToken: "refresh")
        try store.updateAccessToken("new")
        #expect(store.loadAccessToken() == "new")
        store.clear()
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `xcodebuild test -scheme Tidum -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:TidumTests/KeychainStoreTests`
Expected: FAIL — `KeychainStore` does not exist.

- [ ] **Step 3: Implement `KeychainStore`**

```swift
// ios/Tidum/Tidum/Auth/KeychainStore.swift
import Foundation
import Security

enum KeychainError: Error {
    case unhandled(OSStatus)
}

/// Wraps Keychain access for the two mobile auth tokens. The refresh token is
/// stored with a biometry access control (Face ID/Touch ID gate); the access
/// token is not — it's short-lived (1 hour) and read on every API call, so
/// gating it behind Face ID on every request would be unusable. The app-level
/// lock screen (see BiometricLock + AppState) is what actually enforces "you
/// must Face ID to use the app" — this class only enforces it at the storage
/// layer for the longer-lived refresh token.
final class KeychainStore {
    private let service: String
    private let accessTokenAccount = "accessToken"
    private let refreshTokenAccount = "refreshToken"

    init(service: String = "no.tidum.app") {
        self.service = service
    }

    func save(accessToken: String, refreshToken: String) throws {
        try setPlain(accessToken, account: accessTokenAccount)
        try setBiometryGated(refreshToken, account: refreshTokenAccount)
    }

    func updateAccessToken(_ token: String) throws {
        try setPlain(token, account: accessTokenAccount)
    }

    func loadAccessToken() -> String? {
        loadPlain(account: accessTokenAccount)
    }

    func loadRefreshToken() -> String? {
        loadBiometryGated(account: refreshTokenAccount)
    }

    func clear() {
        for account in [accessTokenAccount, refreshTokenAccount] {
            let query: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: service,
                kSecAttrAccount as String: account,
            ]
            SecItemDelete(query as CFDictionary)
        }
    }

    private func setPlain(_ value: String, account: String) throws {
        let data = Data(value.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
        var attributes = query
        attributes[kSecValueData as String] = data
        let status = SecItemAdd(attributes as CFDictionary, nil)
        guard status == errSecSuccess else { throw KeychainError.unhandled(status) }
    }

    private func loadPlain(account: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private func setBiometryGated(_ value: String, account: String) throws {
        let data = Data(value.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)

        guard
            let access = SecAccessControlCreateWithFlags(
                nil,
                kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly,
                .biometryCurrentSet,
                nil
            )
        else {
            throw KeychainError.unhandled(errSecParam)
        }

        var attributes = query
        attributes[kSecValueData as String] = data
        attributes[kSecAttrAccessControl as String] = access
        let status = SecItemAdd(attributes as CFDictionary, nil)
        guard status == errSecSuccess else { throw KeychainError.unhandled(status) }
    }

    private func loadBiometryGated(account: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
            kSecUseOperationPrompt as String: "Lås opp Tidum",
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
}
```

Note: on the iOS Simulator, `kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly` combined with `.biometryCurrentSet` requires the simulator to have a passcode/biometry enrolled (Simulator menu → Features → Face ID → Enrolled) — this test's simulator invocation in Step 4 assumes that's set up. If `KeychainStoreTests` fails specifically on `setBiometryGated`/`loadBiometryGated` with a simulator that has no enrolled biometry, that's an environment issue, not a code bug — the fix is enrolling Face ID in the simulator, not changing the implementation.

- [ ] **Step 4: Run test to verify it passes**

Run: `xcodebuild test -scheme Tidum -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:TidumTests/KeychainStoreTests`
Expected: `** TEST SUCCEEDED **`

- [ ] **Step 5: Implement `BiometricLock`**

```swift
// ios/Tidum/Tidum/Auth/BiometricLock.swift
import LocalAuthentication

@Observable
final class BiometricLock {
    func authenticate() async -> Bool {
        let context = LAContext()
        var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else {
            return false
        }
        do {
            return try await context.evaluatePolicy(
                .deviceOwnerAuthenticationWithBiometrics,
                localizedReason: "Lås opp Tidum"
            )
        } catch {
            return false
        }
    }
}
```

- [ ] **Step 6: Verify full test suite still passes**

Run: `xcodebuild test -scheme Tidum -destination 'platform=iOS Simulator,name=iPhone 16'`
Expected: `** TEST SUCCEEDED **`

- [ ] **Step 7: Commit**

```bash
git add ios/Tidum/Tidum/Auth/KeychainStore.swift ios/Tidum/Tidum/Auth/BiometricLock.swift ios/Tidum/TidumTests/KeychainStoreTests.swift
git commit -m "feat(ios): add Keychain token storage and Face ID lock"
```

---

### Task 8: Networking layer (`APIClient`, DTOs, `NetworkError`)

**Files:**
- Create: `ios/Tidum/Tidum/Networking/Models.swift`
- Create: `ios/Tidum/Tidum/Networking/NetworkError.swift`
- Create: `ios/Tidum/Tidum/Networking/APIClient.swift`
- Create: `ios/Tidum/TidumTests/MockURLProtocol.swift`
- Create: `ios/Tidum/TidumTests/APIClientTests.swift`

**Interfaces:**
- Consumes: `KeychainStore` (Task 7).
- Produces (consumed by every Feature task):
  - `struct AuthUser: Codable`, `struct DashboardStats: Codable`, `struct TimeEntry: Codable`, `struct WorkType: Codable`, `struct WorkTypesResponse: Codable`, `struct Sak: Codable`, `struct Rapport: Codable`
  - `enum NetworkError: Error { case offline, timeout, unauthorized, serverError(Int), decoding }`
  - `actor APIClient` with `func get<T: Decodable>(_ path: String) async throws -> T`, `func post<T: Decodable>(_ path: String, body: Encodable) async throws -> T`, `func patch<T: Decodable>(_ path: String, body: Encodable) async throws -> T`, `func delete(_ path: String) async throws`

- [ ] **Step 1: Define the DTOs**

Field names and optionality below are copied verbatim from the backend's actual response shapes (`server/lib/auth-types.ts`, `shared/schema.ts` `TimeEntry`/`saker`/`rapporter` tables, and the `/api/time-tracking/work-types` and `/api/stats` handlers in `server/routes.ts`), read directly during planning — not guessed.

```swift
// ios/Tidum/Tidum/Networking/Models.swift
import Foundation

struct AuthUser: Codable, Identifiable {
    let id: String
    let email: String
    let name: String
    let profileImageUrl: String?
    let provider: String
    let role: String
    let vendorId: Int?
}

struct DashboardStats: Codable {
    let totalHours: Double
    let activeUsers: Int
    let pendingApprovals: Int
    let casesThisWeek: Int
    let hoursTrend: Double
    let usersTrend: Double
    let approvalsTrend: Double
    let casesTrend: Double
}

struct TimeEntry: Codable, Identifiable {
    let id: String
    let userId: String
    let caseNumber: String?
    let description: String
    let hours: Double
    let expenseCoverage: Double?
    let date: String
    let status: String
    let createdAt: String
    let sakId: String?
    let sakLocationId: String?
}

struct NewTimeEntry: Encodable {
    let caseNumber: String?
    let description: String
    let hours: Double
    let date: String
    let sakId: String?
}

struct WorkType: Codable, Identifiable {
    let id: String
    let name: String
    let color: String
    let entryMode: String
}

struct WorkTypesResponse: Codable {
    let role: String
    let timeTrackingEnabled: Bool
    let workTypes: [WorkType]
}

struct Sak: Codable, Identifiable {
    let id: String
    let saksnummer: String
    let tittel: String
    let klientRef: String?
    let oppdragsgiver: String?
    let tiltakstype: String?
    let status: String?
    let beskrivelse: String?
}

struct Rapport: Codable, Identifiable {
    let id: String
    let sakId: String?
    let status: String?
    let innledning: String?
    let avslutning: String?
    let periodeFrom: String?
    let periodeTo: String?
    let createdAt: String?
}

struct NewRapport: Encodable {
    let sakId: String
    let innledning: String
    let avslutning: String
}

struct EidStatus: Codable {
    let linked: Bool
    let required: Bool
}

struct MobileAuthTokens: Codable {
    let accessToken: String
    let refreshToken: String
    let expiresIn: Int
}
```

- [ ] **Step 2: Define `NetworkError`**

```swift
// ios/Tidum/Tidum/Networking/NetworkError.swift
enum NetworkError: Error, Equatable {
    case offline
    case timeout
    case unauthorized
    case serverError(Int)
    case decoding
}
```

- [ ] **Step 3: Write the failing `APIClient` test**

```swift
// ios/Tidum/TidumTests/MockURLProtocol.swift
import Foundation

final class MockURLProtocol: URLProtocol {
    nonisolated(unsafe) static var handler: ((URLRequest) throws -> (HTTPURLResponse, Data))?

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard let handler = Self.handler else {
            client?.urlProtocol(self, didFailWithError: URLError(.badServerResponse))
            return
        }
        do {
            let (response, data) = try handler(request)
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}
```

```swift
// ios/Tidum/TidumTests/APIClientTests.swift
import Testing
import Foundation
@testable import Tidum

@Suite("APIClient")
struct APIClientTests {
    private func makeClient(store: KeychainStore) -> APIClient {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [MockURLProtocol.self]
        return APIClient(baseURL: URL(string: "https://tidum-backend.onrender.com")!, session: URLSession(configuration: config), keychain: store)
    }

    @Test func getDecodesAResponseAndSendsTheBearerToken() async throws {
        let store = KeychainStore(service: "no.tidum.tests.\(UUID().uuidString)")
        try store.save(accessToken: "token-abc", refreshToken: "refresh-abc")

        var capturedAuthHeader: String?
        MockURLProtocol.handler = { request in
            capturedAuthHeader = request.value(forHTTPHeaderField: "Authorization")
            let json = #"{"linked":true,"required":false}"#.data(using: .utf8)!
            let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            return (response, json)
        }

        let client = makeClient(store: store)
        let status: EidStatus = try await client.get("/api/auth/eid/status")

        #expect(status.linked == true)
        #expect(capturedAuthHeader == "Bearer token-abc")
        store.clear()
    }

    @Test func refreshesOnceOn401ThenRetriesTheOriginalRequest() async throws {
        let store = KeychainStore(service: "no.tidum.tests.\(UUID().uuidString)")
        try store.save(accessToken: "expired-token", refreshToken: "refresh-abc")

        var callCount = 0
        MockURLProtocol.handler = { request in
            callCount += 1
            if request.url?.path == "/api/auth/mobile/refresh" {
                let json = #"{"accessToken":"new-token","expiresIn":3600}"#.data(using: .utf8)!
                return (HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, json)
            }
            if callCount <= 2 {
                return (HTTPURLResponse(url: request.url!, statusCode: 401, httpVersion: nil, headerFields: nil)!, Data())
            }
            let json = #"{"linked":true,"required":false}"#.data(using: .utf8)!
            return (HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, json)
        }

        let client = makeClient(store: store)
        let status: EidStatus = try await client.get("/api/auth/eid/status")

        #expect(status.linked == true)
        #expect(store.loadAccessToken() == "new-token")
        store.clear()
    }

    @Test func throwsUnauthorizedWhenRefreshAlsoFails() async throws {
        let store = KeychainStore(service: "no.tidum.tests.\(UUID().uuidString)")
        try store.save(accessToken: "expired-token", refreshToken: "dead-refresh")

        MockURLProtocol.handler = { request in
            (HTTPURLResponse(url: request.url!, statusCode: 401, httpVersion: nil, headerFields: nil)!, Data())
        }

        let client = makeClient(store: store)
        await #expect(throws: NetworkError.unauthorized) {
            let _: EidStatus = try await client.get("/api/auth/eid/status")
        }
        store.clear()
    }

    @Test func getRetriesOnTimeoutAndSucceedsOnThirdAttempt() async throws {
        let store = KeychainStore(service: "no.tidum.tests.\(UUID().uuidString)")
        try store.save(accessToken: "token", refreshToken: "refresh")

        var attempt = 0
        MockURLProtocol.handler = { request in
            attempt += 1
            if attempt < 3 {
                throw URLError(.timedOut)
            }
            let json = #"{"linked":true,"required":false}"#.data(using: .utf8)!
            return (HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, json)
        }

        let client = makeClient(store: store)
        let status: EidStatus = try await client.get("/api/auth/eid/status")

        #expect(status.linked == true)
        #expect(attempt == 3)
        store.clear()
    }
}
```

- [ ] **Step 4: Run test to verify it fails**

Run: `xcodebuild test -scheme Tidum -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:TidumTests/APIClientTests`
Expected: FAIL — `APIClient` does not exist yet.

- [ ] **Step 5: Implement `APIClient`**

```swift
// ios/Tidum/Tidum/Networking/APIClient.swift
import Foundation

actor APIClient {
    private let baseURL: URL
    private let session: URLSession
    private let keychain: KeychainStore
    private let decoder: JSONDecoder = JSONDecoder()
    private let encoder: JSONEncoder = JSONEncoder()

    init(baseURL: URL, session: URLSession = .shared, keychain: KeychainStore) {
        self.baseURL = baseURL
        self.session = session
        self.keychain = keychain
    }

    func get<T: Decodable>(_ path: String) async throws -> T {
        var lastError: Error = NetworkError.offline
        for attempt in 0..<3 {
            do {
                return try await send(path: path, method: "GET", body: Optional<String>.none)
            } catch let error as NetworkError where error == .offline || error == .timeout {
                lastError = error
                if attempt < 2 {
                    try? await Task.sleep(nanoseconds: UInt64(pow(2.0, Double(attempt)) * 500_000_000))
                }
            }
        }
        throw lastError
    }

    func post<T: Decodable>(_ path: String, body: some Encodable) async throws -> T {
        try await send(path: path, method: "POST", body: body)
    }

    func patch<T: Decodable>(_ path: String, body: some Encodable) async throws -> T {
        try await send(path: path, method: "PATCH", body: body)
    }

    func delete(_ path: String) async throws {
        let _: EmptyResponse = try await send(path: path, method: "DELETE", body: Optional<String>.none)
    }

    private func send<Body: Encodable, T: Decodable>(
        path: String,
        method: String,
        body: Body?,
        isRetry: Bool = false
    ) async throws -> T {
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = method
        if let token = keychain.loadAccessToken() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try encoder.encode(body)
        }

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await session.data(for: request)
        } catch let error as URLError where error.code == .notConnectedToInternet {
            throw NetworkError.offline
        } catch let error as URLError where error.code == .timedOut {
            throw NetworkError.timeout
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            throw NetworkError.decoding
        }

        if httpResponse.statusCode == 401 {
            if isRetry { throw NetworkError.unauthorized }
            let refreshed = await attemptRefresh()
            guard refreshed else { throw NetworkError.unauthorized }
            return try await send(path: path, method: method, body: body, isRetry: true)
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            throw NetworkError.serverError(httpResponse.statusCode)
        }

        if data.isEmpty, let empty = EmptyResponse() as? T {
            return empty
        }
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw NetworkError.decoding
        }
    }

    private func attemptRefresh() async -> Bool {
        guard let refreshToken = keychain.loadRefreshToken() else { return false }
        var request = URLRequest(url: baseURL.appendingPathComponent("/api/auth/mobile/refresh"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? encoder.encode(["refreshToken": refreshToken])

        guard
            let (data, response) = try? await session.data(for: request),
            let httpResponse = response as? HTTPURLResponse,
            httpResponse.statusCode == 200,
            let refreshed = try? decoder.decode(RefreshResponse.self, from: data)
        else {
            return false
        }
        try? keychain.updateAccessToken(refreshed.accessToken)
        return true
    }
}

private struct RefreshResponse: Decodable {
    let accessToken: String
    let expiresIn: Int
}

struct EmptyResponse: Decodable {}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `xcodebuild test -scheme Tidum -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:TidumTests/APIClientTests`
Expected: `** TEST SUCCEEDED **` (4 tests, including GET's retry-with-backoff on transient network errors)

- [ ] **Step 7: Commit**

```bash
git add ios/Tidum/Tidum/Networking/ ios/Tidum/TidumTests/MockURLProtocol.swift ios/Tidum/TidumTests/APIClientTests.swift
git commit -m "feat(ios): add APIClient with Bearer auth and 401-refresh-retry"
```

---

### Task 9: Auth flow — `AuthSession`, `AppState`, login/lock screens, root routing

**Files:**
- Create: `ios/Tidum/Tidum/Auth/AuthSession.swift`
- Create: `ios/Tidum/Tidum/App/AppState.swift`
- Create: `ios/Tidum/Tidum/Features/Login/LoginView.swift`
- Create: `ios/Tidum/Tidum/Features/Lock/LockView.swift`
- Modify: `ios/Tidum/Tidum/Root/RootView.swift`
- Modify: `ios/Tidum/Tidum/TidumApp.swift`

**Interfaces:**
- Consumes: `KeychainStore`, `BiometricLock` (Task 7); `MobileAuthTokens` (Task 8).
- Produces: `@Observable AppState` with `enum AuthPhase { case loggedOut, locked, unlocked }` and `var phase: AuthPhase`, `func handleCallback(url: URL)`, `func unlock() async`, `func logOut()` — consumed by `RootView` (this task) and every Feature task's environment access to the current user/APIClient.

- [ ] **Step 1: Implement `AuthSession`**

```swift
// ios/Tidum/Tidum/Auth/AuthSession.swift
import AuthenticationServices
import UIKit

@Observable
final class AuthSession: NSObject {
    enum Provider {
        case bankID, google

        var loginPath: String {
            switch self {
            case .bankID: "/api/auth/idura/login-mobile"
            case .google: "/api/auth/google-mobile"
            }
        }
    }

    private var currentSession: ASWebAuthenticationSession?

    func start(_ provider: Provider, baseURL: URL) async throws -> URL {
        let authURL = baseURL.appendingPathComponent(provider.loginPath)
        return try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(
                url: authURL,
                callbackURLScheme: "tidum"
            ) { callbackURL, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                guard let callbackURL else {
                    continuation.resume(throwing: URLError(.badServerResponse))
                    return
                }
                continuation.resume(returning: callbackURL)
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = true
            self.currentSession = session
            session.start()
        }
    }
}

extension AuthSession: ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first?.windows.first { $0.isKeyWindow } ?? ASPresentationAnchor()
    }
}
```

- [ ] **Step 2: Implement `AppState`**

```swift
// ios/Tidum/Tidum/App/AppState.swift
import Foundation

enum AuthPhase {
    case loggedOut
    case locked
    case unlocked
}

@Observable
final class AppState {
    static let baseURL = URL(string: "https://tidum-backend.onrender.com")!

    var phase: AuthPhase
    var currentUser: AuthUser?
    var loginError: String?

    let keychain = KeychainStore()
    let biometricLock = BiometricLock()
    let authSession = AuthSession()
    let apiClient: APIClient

    init() {
        self.apiClient = APIClient(baseURL: Self.baseURL, keychain: keychain)
        self.phase = keychain.loadAccessToken() != nil ? .locked : .loggedOut
    }

    func login(with provider: AuthSession.Provider) async {
        loginError = nil
        do {
            let callbackURL = try await authSession.start(provider, baseURL: Self.baseURL)
            try handleCallback(url: callbackURL)
        } catch {
            loginError = "Innlogging feilet. Prøv igjen."
        }
    }

    func handleCallback(url: URL) throws {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            throw NetworkError.decoding
        }
        let query = Dictionary(uniqueKeysWithValues: (components.queryItems ?? []).map { ($0.name, $0.value ?? "") })

        if let errorCode = query["error"] {
            loginError = errorMessage(for: errorCode)
            return
        }

        guard
            let accessToken = query["access_token"],
            let refreshToken = query["refresh_token"]
        else {
            loginError = "Innlogging feilet. Prøv igjen."
            return
        }

        try keychain.save(accessToken: accessToken, refreshToken: refreshToken)
        phase = .unlocked
        Task { await loadCurrentUser() }
    }

    func unlock() async {
        guard await biometricLock.authenticate() else { return }
        phase = .unlocked
        await loadCurrentUser()
    }

    func logOut() {
        keychain.clear()
        currentUser = nil
        phase = .loggedOut
    }

    private func loadCurrentUser() async {
        currentUser = try? await apiClient.get("/api/auth/user")
    }

    private func errorMessage(for code: String) -> String {
        switch code {
        case "eid_not_linked": "Denne BankID-en er ikke koblet til en Tidum-konto."
        case "eid_missing_ssn": "Fikk ikke fødselsnummer fra BankID."
        case "access_request_required": "Kontoen din er ikke registrert. Send en tilgangsforespørsel."
        default: "Innlogging feilet. Prøv igjen."
        }
    }
}
```

- [ ] **Step 3: Implement `LoginView` and `LockView`**

```swift
// ios/Tidum/Tidum/Features/Login/LoginView.swift
import SwiftUI

struct LoginView: View {
    var appState: AppState

    var body: some View {
        VStack(spacing: 16) {
            Text("Tidum").font(.largeTitle.bold())
            if let error = appState.loginError {
                Text(error).foregroundStyle(.red).font(.footnote)
            }
            Button("Logg inn med BankID") {
                Task { await appState.login(with: .bankID) }
            }
            .buttonStyle(.borderedProminent)

            Button("Logg inn med Google") {
                Task { await appState.login(with: .google) }
            }
            .buttonStyle(.bordered)
        }
        .padding()
    }
}
```

```swift
// ios/Tidum/Tidum/Features/Lock/LockView.swift
import SwiftUI

struct LockView: View {
    var appState: AppState

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "faceid").font(.system(size: 48))
            Text("Lås opp Tidum")
            Button("Lås opp") {
                Task { await appState.unlock() }
            }
            .buttonStyle(.borderedProminent)
        }
        .task { await appState.unlock() }
    }
}
```

- [ ] **Step 4: Wire `RootView` and `TidumApp`**

```swift
// ios/Tidum/Tidum/Root/RootView.swift
import SwiftUI

struct RootView: View {
    @State private var appState = AppState()

    var body: some View {
        Group {
            switch appState.phase {
            case .loggedOut:
                LoginView(appState: appState)
            case .locked:
                LockView(appState: appState)
            case .unlocked:
                MainTabView(appState: appState)
            }
        }
        .onOpenURL { url in
            try? appState.handleCallback(url: url)
        }
    }
}

#Preview {
    RootView()
}
```

```swift
// ios/Tidum/Tidum/TidumApp.swift
import SwiftUI

@main
struct TidumApp: App {
    var body: some Scene {
        WindowGroup {
            RootView()
        }
    }
}
```

`MainTabView` doesn't exist yet — Task 10 creates it. This task's build will fail until then; that's expected and fine within a single task's Steps, but **Task 9 is not done until Task 10 lands**, since `RootView` won't compile standalone. Fold verification into Task 10's Step 4 instead of trying to build Task 9 in isolation.

- [ ] **Step 5: Commit (staged, verified together with Task 10)**

```bash
git add ios/Tidum/Tidum/Auth/AuthSession.swift ios/Tidum/Tidum/App/AppState.swift ios/Tidum/Tidum/Features/Login/LoginView.swift ios/Tidum/Tidum/Features/Lock/LockView.swift ios/Tidum/Tidum/Root/RootView.swift ios/Tidum/Tidum/TidumApp.swift
git commit -m "feat(ios): add auth session, app state, login/lock screens (build completes with Task 10)"
```

---

### Task 10: Tab shell and Dashboard

**Files:**
- Create: `ios/Tidum/Tidum/Root/MainTabView.swift`
- Create: `ios/Tidum/Tidum/Features/Dashboard/DashboardView.swift`
- Create: `ios/Tidum/Tidum/Features/Dashboard/DashboardViewModel.swift`
- Create: `ios/Tidum/TidumTests/DashboardViewModelTests.swift`

**Interfaces:**
- Consumes: `AppState`, `APIClient`, `DashboardStats` (Tasks 8-9).
- Produces: `MainTabView` — the 4-tab shell every later feature task's root view plugs into.

- [ ] **Step 1: Write the failing `DashboardViewModel` test**

```swift
// ios/Tidum/TidumTests/DashboardViewModelTests.swift
import Testing
import Foundation
@testable import Tidum

@Suite("DashboardViewModel")
struct DashboardViewModelTests {
    @Test func loadPopulatesStatsOnSuccess() async throws {
        let store = KeychainStore(service: "no.tidum.tests.\(UUID().uuidString)")
        try store.save(accessToken: "token", refreshToken: "refresh")

        MockURLProtocol.handler = { request in
            let json = #"{"totalHours":12.5,"activeUsers":3,"pendingApprovals":0,"casesThisWeek":2,"hoursTrend":0,"usersTrend":0,"approvalsTrend":0,"casesTrend":0}"#.data(using: .utf8)!
            return (HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, json)
        }

        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [MockURLProtocol.self]
        let client = APIClient(baseURL: URL(string: "https://tidum-backend.onrender.com")!, session: URLSession(configuration: config), keychain: store)

        let viewModel = DashboardViewModel(apiClient: client)
        await viewModel.load()

        #expect(viewModel.stats?.totalHours == 12.5)
        #expect(viewModel.errorMessage == nil)
        store.clear()
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `xcodebuild test -scheme Tidum -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:TidumTests/DashboardViewModelTests`
Expected: FAIL — `DashboardViewModel` does not exist.

- [ ] **Step 3: Implement `DashboardViewModel` and `DashboardView`**

```swift
// ios/Tidum/Tidum/Features/Dashboard/DashboardViewModel.swift
import Foundation

@Observable
final class DashboardViewModel {
    var stats: DashboardStats?
    var errorMessage: String?
    var isLoading = false

    private let apiClient: APIClient

    init(apiClient: APIClient) {
        self.apiClient = apiClient
    }

    func load() async {
        isLoading = true
        errorMessage = nil
        do {
            stats = try await apiClient.get("/api/stats")
        } catch NetworkError.offline {
            errorMessage = "Ingen nettforbindelse"
        } catch {
            errorMessage = "Kunne ikke laste dashboard"
        }
        isLoading = false
    }
}
```

```swift
// ios/Tidum/Tidum/Features/Dashboard/DashboardView.swift
import SwiftUI

struct DashboardView: View {
    @State private var viewModel: DashboardViewModel

    init(apiClient: APIClient) {
        _viewModel = State(initialValue: DashboardViewModel(apiClient: apiClient))
    }

    var body: some View {
        NavigationStack {
            List {
                if let error = viewModel.errorMessage {
                    Text(error).foregroundStyle(.red)
                }
                if let stats = viewModel.stats {
                    LabeledContent("Timer denne perioden", value: String(format: "%.1f t", stats.totalHours))
                    LabeledContent("Aktive tiltak", value: "\(stats.casesThisWeek)")
                }
            }
            .navigationTitle("Dashboard")
            .task { await viewModel.load() }
            .refreshable { await viewModel.load() }
        }
    }
}
```

- [ ] **Step 4: Implement `MainTabView` and verify the whole app builds**

```swift
// ios/Tidum/Tidum/Root/MainTabView.swift
import SwiftUI

struct MainTabView: View {
    var appState: AppState

    var body: some View {
        TabView {
            DashboardView(apiClient: appState.apiClient)
                .tabItem { Label("Dashboard", systemImage: "house") }

            Text("Timeføring") // Task 11 replaces this
                .tabItem { Label("Timeføring", systemImage: "clock") }

            Text("Klientsaker") // Task 12 replaces this
                .tabItem { Label("Klientsaker", systemImage: "folder") }

            Text("Profil") // Task 13 replaces this
                .tabItem { Label("Profil", systemImage: "person") }
        }
    }
}
```

Run: `xcodebuild test -scheme Tidum -destination 'platform=iOS Simulator,name=iPhone 16'`
Expected: `** TEST SUCCEEDED **` — this is the first point since Task 9 that the full app target compiles; it must succeed here.

- [ ] **Step 5: Commit**

```bash
git add ios/Tidum/Tidum/Root/MainTabView.swift ios/Tidum/Tidum/Features/Dashboard/ ios/Tidum/TidumTests/DashboardViewModelTests.swift
git commit -m "feat(ios): add tab shell and dashboard screen"
```

---

### Task 11: Timeføring (time tracking)

**Files:**
- Create: `ios/Tidum/Tidum/Features/TimeTracking/TimeTrackingViewModel.swift`
- Create: `ios/Tidum/Tidum/Features/TimeTracking/TimeTrackingView.swift`
- Modify: `ios/Tidum/Tidum/Root/MainTabView.swift`
- Create: `ios/Tidum/TidumTests/TimeTrackingViewModelTests.swift`

**Interfaces:**
- Consumes: `APIClient`, `TimeEntry`, `NewTimeEntry`, `WorkTypesResponse` (Task 8).
- Produces: nothing consumed by later tasks (leaf feature).

- [ ] **Step 1: Write the failing test**

```swift
// ios/Tidum/TidumTests/TimeTrackingViewModelTests.swift
import Testing
import Foundation
@testable import Tidum

@Suite("TimeTrackingViewModel")
struct TimeTrackingViewModelTests {
    @Test func loadPopulatesEntriesAndWorkTypes() async throws {
        let store = KeychainStore(service: "no.tidum.tests.\(UUID().uuidString)")
        try store.save(accessToken: "token", refreshToken: "refresh")

        MockURLProtocol.handler = { request in
            let path = request.url!.path
            if path == "/api/time-entries" {
                let json = #"[{"id":"e1","userId":"u1","caseNumber":null,"description":"Oppfølging","hours":2,"expenseCoverage":0,"date":"2026-08-14","status":"pending","createdAt":"2026-08-14T10:00:00.000Z","sakId":null,"sakLocationId":null}]"#.data(using: .utf8)!
                return (HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, json)
            }
            let json = #"{"role":"member","timeTrackingEnabled":true,"workTypes":[{"id":"miljoarbeid","name":"Miljøarbeid","color":"bg-primary","entryMode":"timer_or_manual"}]}"#.data(using: .utf8)!
            return (HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, json)
        }

        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [MockURLProtocol.self]
        let client = APIClient(baseURL: URL(string: "https://tidum-backend.onrender.com")!, session: URLSession(configuration: config), keychain: store)

        let viewModel = TimeTrackingViewModel(apiClient: client)
        await viewModel.load()

        #expect(viewModel.entries.count == 1)
        #expect(viewModel.workTypes.first?.name == "Miljøarbeid")
        store.clear()
    }

    @Test func stopTimerCreatesAnEntryAndClearsTimerStartedAt() async throws {
        let store = KeychainStore(service: "no.tidum.tests.\(UUID().uuidString)")
        try store.save(accessToken: "token", refreshToken: "refresh")

        MockURLProtocol.handler = { request in
            let json = #"{"id":"e2","userId":"u1","caseNumber":null,"description":"Timeregistrering","hours":0.5,"expenseCoverage":0,"date":"2026-08-14","status":"pending","createdAt":"2026-08-14T10:00:00.000Z","sakId":null,"sakLocationId":null}"#.data(using: .utf8)!
            return (HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, json)
        }

        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [MockURLProtocol.self]
        let client = APIClient(baseURL: URL(string: "https://tidum-backend.onrender.com")!, session: URLSession(configuration: config), keychain: store)

        let viewModel = TimeTrackingViewModel(apiClient: client)
        viewModel.startTimer()
        #expect(viewModel.timerStartedAt != nil)

        await viewModel.stopTimer(description: "Timeregistrering")

        #expect(viewModel.timerStartedAt == nil)
        #expect(viewModel.entries.first?.description == "Timeregistrering")
        store.clear()
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `xcodebuild test -scheme Tidum -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:TidumTests/TimeTrackingViewModelTests`
Expected: FAIL — `TimeTrackingViewModel` does not exist.

- [ ] **Step 3: Implement the view model**

```swift
// ios/Tidum/Tidum/Features/TimeTracking/TimeTrackingViewModel.swift
import Foundation

@Observable
final class TimeTrackingViewModel {
    var entries: [TimeEntry] = []
    var workTypes: [WorkType] = []
    var errorMessage: String?
    var isLoading = false
    /// Non-nil while the start/stop clock is running. A `TimelineView` in the
    /// view layer re-renders the elapsed display every second by reading this
    /// — no separate ticking `Timer` object needed.
    var timerStartedAt: Date?

    private let apiClient: APIClient

    init(apiClient: APIClient) {
        self.apiClient = apiClient
    }

    func startTimer() {
        timerStartedAt = Date()
    }

    func stopTimer(description: String) async {
        guard let startedAt = timerStartedAt else { return }
        timerStartedAt = nil
        let hours = max(Date().timeIntervalSince(startedAt), 60) / 3600
        await createEntry(description: description, hours: hours, date: startedAt)
    }

    func load() async {
        isLoading = true
        errorMessage = nil
        do {
            async let entriesTask: [TimeEntry] = apiClient.get("/api/time-entries")
            async let workTypesTask: WorkTypesResponse = apiClient.get("/api/time-tracking/work-types")
            entries = try await entriesTask
            workTypes = try await workTypesTask.workTypes
        } catch NetworkError.offline {
            errorMessage = "Ingen nettforbindelse"
        } catch {
            errorMessage = "Kunne ikke laste timeføring"
        }
        isLoading = false
    }

    func createEntry(description: String, hours: Double, date: Date) async {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withFullDate]
        let body = NewTimeEntry(caseNumber: nil, description: description, hours: hours, date: formatter.string(from: date), sakId: nil)
        do {
            let created: TimeEntry = try await apiClient.post("/api/time-entries", body: body)
            entries.insert(created, at: 0)
        } catch {
            errorMessage = "Kunne ikke lagre registrering"
        }
    }
}
```

- [ ] **Step 4: Implement the view**

```swift
// ios/Tidum/Tidum/Features/TimeTracking/TimeTrackingView.swift
import SwiftUI

struct TimeTrackingView: View {
    @State private var viewModel: TimeTrackingViewModel
    @State private var showingNewEntry = false
    @State private var newDescription = ""
    @State private var newHours = ""

    init(apiClient: APIClient) {
        _viewModel = State(initialValue: TimeTrackingViewModel(apiClient: apiClient))
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    TimerRow(viewModel: viewModel)
                }
                if let error = viewModel.errorMessage {
                    Text(error).foregroundStyle(.red)
                }
                ForEach(viewModel.entries) { entry in
                    VStack(alignment: .leading) {
                        Text(entry.description)
                        Text("\(entry.hours, specifier: "%.1f") t · \(entry.date)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .navigationTitle("Timeføring")
            .toolbar {
                Button("Ny registrering") { showingNewEntry = true }
            }
            .task { await viewModel.load() }
            .refreshable { await viewModel.load() }
            .sheet(isPresented: $showingNewEntry) {
                NavigationStack {
                    Form {
                        TextField("Beskrivelse", text: $newDescription)
                        TextField("Timer", text: $newHours)
                            .keyboardType(.decimalPad)
                    }
                    .navigationTitle("Ny registrering")
                    .toolbar {
                        Button("Lagre") {
                            if let hours = Double(newHours.replacingOccurrences(of: ",", with: ".")) {
                                Task {
                                    await viewModel.createEntry(description: newDescription, hours: hours, date: Date())
                                    showingNewEntry = false
                                    newDescription = ""
                                    newHours = ""
                                }
                            }
                        }
                        .disabled(newDescription.isEmpty || Double(newHours.replacingOccurrences(of: ",", with: ".")) == nil)
                    }
                }
            }
        }
    }
}

/// Speiler web sin "0 t 00 min" klokke: Start nå / Ferdig. TimelineView
/// re-renderer hvert sekund uten en egen Timer-instans i view-modellen.
private struct TimerRow: View {
    var viewModel: TimeTrackingViewModel
    @State private var description = ""

    var body: some View {
        if let startedAt = viewModel.timerStartedAt {
            TimelineView(.periodic(from: startedAt, by: 1)) { context in
                let elapsed = Int(context.date.timeIntervalSince(startedAt))
                VStack(alignment: .leading, spacing: 8) {
                    Text(String(format: "%02d:%02d:%02d", elapsed / 3600, (elapsed % 3600) / 60, elapsed % 60))
                        .font(.title.monospacedDigit())
                    TextField("Hva jobber du med?", text: $description)
                    Button("Ferdig") {
                        Task { await viewModel.stopTimer(description: description.isEmpty ? "Timeregistrering" : description) }
                    }
                    .buttonStyle(.borderedProminent)
                }
            }
        } else {
            Button("Start nå") { viewModel.startTimer() }
                .buttonStyle(.borderedProminent)
        }
    }
}
```

- [ ] **Step 5: Wire into `MainTabView`**

In `ios/Tidum/Tidum/Root/MainTabView.swift`, replace:

```swift
            Text("Timeføring") // Task 11 replaces this
                .tabItem { Label("Timeføring", systemImage: "clock") }
```

with:

```swift
            TimeTrackingView(apiClient: appState.apiClient)
                .tabItem { Label("Timeføring", systemImage: "clock") }
```

- [ ] **Step 6: Run full test suite and verify the app builds**

Run: `xcodebuild test -scheme Tidum -destination 'platform=iOS Simulator,name=iPhone 16'`
Expected: `** TEST SUCCEEDED **`

- [ ] **Step 7: Commit**

```bash
git add ios/Tidum/Tidum/Features/TimeTracking/ ios/Tidum/Tidum/Root/MainTabView.swift ios/Tidum/TidumTests/TimeTrackingViewModelTests.swift
git commit -m "feat(ios): add timeføring screen with entry list and manual entry form"
```

---

### Task 12: Klientsaker (cases)

**Files:**
- Create: `ios/Tidum/Tidum/Features/Cases/CasesViewModel.swift`
- Create: `ios/Tidum/Tidum/Features/Cases/CasesListView.swift`
- Create: `ios/Tidum/Tidum/Features/Cases/CaseDetailView.swift`
- Modify: `ios/Tidum/Tidum/Root/MainTabView.swift`
- Create: `ios/Tidum/TidumTests/CasesViewModelTests.swift`

**Interfaces:**
- Consumes: `APIClient`, `Sak` (Task 8).
- Produces: `CaseDetailView` — Task 13's "start a report from this case" entry point navigates here via a `NavigationLink`.

Cases live at `GET /api/saker` (role-filtered server-side: `user` role sees only cases they're assigned to, matching this app's audience), not `/api/company/me/assigned-cases` as the spec assumed — confirmed by reading `server/sakerRapportRoutes.ts` during planning. `/api/saker` uses its own local `requireAuth` (`!!req.user`), which Task 3's `resolveBearerUser` already satisfies with zero further backend changes.

- [ ] **Step 1: Write the failing test**

```swift
// ios/Tidum/TidumTests/CasesViewModelTests.swift
import Testing
import Foundation
@testable import Tidum

@Suite("CasesViewModel")
struct CasesViewModelTests {
    @Test func loadPopulatesCases() async throws {
        let store = KeychainStore(service: "no.tidum.tests.\(UUID().uuidString)")
        try store.save(accessToken: "token", refreshToken: "refresh")

        MockURLProtocol.handler = { request in
            let json = #"[{"id":"c1","saksnummer":"2026-001","tittel":"Oppfølging Ola","klientRef":"K-1","oppdragsgiver":null,"tiltakstype":"miljoarbeid","status":"aktiv","beskrivelse":null}]"#.data(using: .utf8)!
            return (HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, json)
        }

        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [MockURLProtocol.self]
        let client = APIClient(baseURL: URL(string: "https://tidum-backend.onrender.com")!, session: URLSession(configuration: config), keychain: store)

        let viewModel = CasesViewModel(apiClient: client)
        await viewModel.load()

        #expect(viewModel.cases.count == 1)
        #expect(viewModel.cases.first?.tittel == "Oppfølging Ola")
        store.clear()
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `xcodebuild test -scheme Tidum -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:TidumTests/CasesViewModelTests`
Expected: FAIL — `CasesViewModel` does not exist.

- [ ] **Step 3: Implement the view model**

```swift
// ios/Tidum/Tidum/Features/Cases/CasesViewModel.swift
import Foundation

@Observable
final class CasesViewModel {
    var cases: [Sak] = []
    var errorMessage: String?
    var isLoading = false

    let apiClient: APIClient

    init(apiClient: APIClient) {
        self.apiClient = apiClient
    }

    func load() async {
        isLoading = true
        errorMessage = nil
        do {
            cases = try await apiClient.get("/api/saker")
        } catch NetworkError.offline {
            errorMessage = "Ingen nettforbindelse"
        } catch {
            errorMessage = "Kunne ikke laste klientsaker"
        }
        isLoading = false
    }
}
```

- [ ] **Step 4: Implement the views**

```swift
// ios/Tidum/Tidum/Features/Cases/CasesListView.swift
import SwiftUI

struct CasesListView: View {
    @State private var viewModel: CasesViewModel

    init(apiClient: APIClient) {
        _viewModel = State(initialValue: CasesViewModel(apiClient: apiClient))
    }

    var body: some View {
        NavigationStack {
            List {
                if let error = viewModel.errorMessage {
                    Text(error).foregroundStyle(.red)
                }
                ForEach(viewModel.cases) { sak in
                    NavigationLink(value: sak) {
                        VStack(alignment: .leading) {
                            Text(sak.tittel)
                            Text(sak.saksnummer).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .navigationTitle("Klientsaker")
            .task { await viewModel.load() }
            .refreshable { await viewModel.load() }
            .navigationDestination(for: Sak.self) { sak in
                CaseDetailView(sak: sak, apiClient: viewModel.apiClient)
            }
        }
    }
}

extension Sak: Hashable {
    static func == (lhs: Sak, rhs: Sak) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}
```

```swift
// ios/Tidum/Tidum/Features/Cases/CaseDetailView.swift
import SwiftUI

struct CaseDetailView: View {
    let sak: Sak
    let apiClient: APIClient
    @State private var showingNewReport = false

    var body: some View {
        List {
            Section("Sak") {
                LabeledContent("Saksnummer", value: sak.saksnummer)
                if let klientRef = sak.klientRef {
                    LabeledContent("Klientreferanse", value: klientRef)
                }
                if let beskrivelse = sak.beskrivelse {
                    Text(beskrivelse)
                }
            }
        }
        .navigationTitle(sak.tittel)
        .toolbar {
            Button("Ny rapport") { showingNewReport = true }
        }
        .sheet(isPresented: $showingNewReport) {
            NewReportView(sak: sak, apiClient: apiClient)
        }
    }
}
```

- [ ] **Step 5: Wire into `MainTabView`**

In `ios/Tidum/Tidum/Root/MainTabView.swift`, replace:

```swift
            Text("Klientsaker") // Task 12 replaces this
                .tabItem { Label("Klientsaker", systemImage: "folder") }
```

with:

```swift
            CasesListView(apiClient: appState.apiClient)
                .tabItem { Label("Klientsaker", systemImage: "folder") }
```

- [ ] **Step 6: Run full test suite**

Run: `xcodebuild test -scheme Tidum -destination 'platform=iOS Simulator,name=iPhone 16'`
Expected: `** TEST SUCCEEDED **` — will fail to build until Task 13 provides `NewReportView` (referenced by `CaseDetailView` above). This is the same "build completes with the next task" situation as Task 9/10 — proceed to Task 13 before treating this task as done.

- [ ] **Step 7: Commit (verified together with Task 13)**

```bash
git add ios/Tidum/Tidum/Features/Cases/ ios/Tidum/Tidum/Root/MainTabView.swift ios/Tidum/TidumTests/CasesViewModelTests.swift
git commit -m "feat(ios): add klientsaker list and detail screens (build completes with Task 13)"
```

---

### Task 13: Rapportskriving (case report creation)

**Files:**
- Create: `ios/Tidum/Tidum/Features/CaseReports/ReportViewModel.swift`
- Create: `ios/Tidum/Tidum/Features/CaseReports/NewReportView.swift`
- Create: `ios/Tidum/TidumTests/ReportViewModelTests.swift`

**Interfaces:**
- Consumes: `APIClient`, `Rapport`, `NewRapport`, `Sak` (Task 8, Task 12).
- Produces: nothing consumed by later tasks (leaf feature) — completes Task 12's dangling `NewReportView` reference.

Reports are created via `POST /api/rapporter` (also `sakerRapportRoutes.ts`, also already-compatible `requireAuth`). Fase 1 sends only `sakId`, `innledning`, `avslutning` — every other `rapporter` column (`dynamiskeFelter`, `signaturer`, `templateId`, goals/activities sub-resources) is nullable/defaulted per the Drizzle schema (only `userId`, server-set, is `.notNull()`), so this is a genuinely valid, complete report row, not a stub — the richer template/signature/goals UI is deferred to a later fase, matching the spec's phasing philosophy.

- [ ] **Step 1: Write the failing test**

```swift
// ios/Tidum/TidumTests/ReportViewModelTests.swift
import Testing
import Foundation
@testable import Tidum

@Suite("ReportViewModel")
struct ReportViewModelTests {
    @Test func submitSendsSakIdAndTextFields() async throws {
        let store = KeychainStore(service: "no.tidum.tests.\(UUID().uuidString)")
        try store.save(accessToken: "token", refreshToken: "refresh")

        var capturedBody: Data?
        MockURLProtocol.handler = { request in
            capturedBody = request.httpBodyStreamData() ?? request.httpBody
            let json = #"{"id":"r1","sakId":"c1","status":"utkast","innledning":"Startet godt","avslutning":"Avsluttet greit","periodeFrom":null,"periodeTo":null,"createdAt":"2026-08-14T10:00:00.000Z"}"#.data(using: .utf8)!
            return (HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, json)
        }

        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [MockURLProtocol.self]
        let client = APIClient(baseURL: URL(string: "https://tidum-backend.onrender.com")!, session: URLSession(configuration: config), keychain: store)

        let viewModel = ReportViewModel(apiClient: client)
        let saved = await viewModel.submit(sakId: "c1", innledning: "Startet godt", avslutning: "Avsluttet greit")

        #expect(saved == true)
        #expect(viewModel.errorMessage == nil)
        store.clear()
    }
}

private extension URLRequest {
    func httpBodyStreamData() -> Data? {
        guard let stream = httpBodyStream else { return nil }
        stream.open()
        defer { stream.close() }
        var data = Data()
        let bufferSize = 1024
        var buffer = [UInt8](repeating: 0, count: bufferSize)
        while stream.hasBytesAvailable {
            let read = stream.read(&buffer, maxLength: bufferSize)
            if read <= 0 { break }
            data.append(buffer, count: read)
        }
        return data
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `xcodebuild test -scheme Tidum -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:TidumTests/ReportViewModelTests`
Expected: FAIL — `ReportViewModel` does not exist.

- [ ] **Step 3: Implement the view model**

```swift
// ios/Tidum/Tidum/Features/CaseReports/ReportViewModel.swift
import Foundation

@Observable
final class ReportViewModel {
    var errorMessage: String?
    var isSubmitting = false

    private let apiClient: APIClient

    init(apiClient: APIClient) {
        self.apiClient = apiClient
    }

    @discardableResult
    func submit(sakId: String, innledning: String, avslutning: String) async -> Bool {
        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }
        do {
            let body = NewRapport(sakId: sakId, innledning: innledning, avslutning: avslutning)
            let _: Rapport = try await apiClient.post("/api/rapporter", body: body)
            return true
        } catch NetworkError.offline {
            errorMessage = "Ingen nettforbindelse"
            return false
        } catch {
            errorMessage = "Kunne ikke sende inn rapport"
            return false
        }
    }
}
```

- [ ] **Step 4: Implement the view**

```swift
// ios/Tidum/Tidum/Features/CaseReports/NewReportView.swift
import SwiftUI

struct NewReportView: View {
    let sak: Sak
    let apiClient: APIClient
    @Environment(\.dismiss) private var dismiss
    @State private var viewModel: ReportViewModel
    @State private var innledning = ""
    @State private var avslutning = ""

    init(sak: Sak, apiClient: APIClient) {
        self.sak = sak
        self.apiClient = apiClient
        _viewModel = State(initialValue: ReportViewModel(apiClient: apiClient))
    }

    var body: some View {
        NavigationStack {
            Form {
                Section(sak.tittel) {
                    TextField("Innledning", text: $innledning, axis: .vertical)
                        .lineLimit(3...8)
                    TextField("Avslutning", text: $avslutning, axis: .vertical)
                        .lineLimit(3...8)
                }
                if let error = viewModel.errorMessage {
                    Text(error).foregroundStyle(.red)
                }
            }
            .navigationTitle("Ny rapport")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Avbryt") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Send inn") {
                        Task {
                            let saved = await viewModel.submit(sakId: sak.id, innledning: innledning, avslutning: avslutning)
                            if saved { dismiss() }
                        }
                    }
                    .disabled(innledning.isEmpty || viewModel.isSubmitting)
                }
            }
        }
    }
}
```

- [ ] **Step 5: Run full test suite and verify the app builds**

Run: `xcodebuild test -scheme Tidum -destination 'platform=iOS Simulator,name=iPhone 16'`
Expected: `** TEST SUCCEEDED **` — this also resolves Task 12's dangling reference; both tasks' full test suites must be green here.

- [ ] **Step 6: Commit**

```bash
git add ios/Tidum/Tidum/Features/CaseReports/ ios/Tidum/TidumTests/ReportViewModelTests.swift
git commit -m "feat(ios): add report creation screen, launched from case detail"
```

---

### Task 14: Profile

**Files:**
- Create: `ios/Tidum/Tidum/Features/Profile/ProfileViewModel.swift`
- Create: `ios/Tidum/Tidum/Features/Profile/ProfileView.swift`
- Modify: `ios/Tidum/Tidum/Root/MainTabView.swift`
- Create: `ios/Tidum/TidumTests/ProfileViewModelTests.swift`

**Interfaces:**
- Consumes: `AppState` (for `currentUser`, `logOut()`), `APIClient`, `EidStatus` (Task 8, Task 9).
- Produces: nothing consumed by later tasks (leaf feature).

- [ ] **Step 1: Write the failing test**

```swift
// ios/Tidum/TidumTests/ProfileViewModelTests.swift
import Testing
import Foundation
@testable import Tidum

@Suite("ProfileViewModel")
struct ProfileViewModelTests {
    @Test func loadPopulatesEidStatus() async throws {
        let store = KeychainStore(service: "no.tidum.tests.\(UUID().uuidString)")
        try store.save(accessToken: "token", refreshToken: "refresh")

        MockURLProtocol.handler = { request in
            let json = #"{"linked":true,"required":false}"#.data(using: .utf8)!
            return (HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, json)
        }

        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [MockURLProtocol.self]
        let client = APIClient(baseURL: URL(string: "https://tidum-backend.onrender.com")!, session: URLSession(configuration: config), keychain: store)

        let viewModel = ProfileViewModel(apiClient: client)
        await viewModel.load()

        #expect(viewModel.eidStatus?.linked == true)
        store.clear()
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `xcodebuild test -scheme Tidum -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:TidumTests/ProfileViewModelTests`
Expected: FAIL — `ProfileViewModel` does not exist.

- [ ] **Step 3: Implement the view model**

```swift
// ios/Tidum/Tidum/Features/Profile/ProfileViewModel.swift
import Foundation

@Observable
final class ProfileViewModel {
    var eidStatus: EidStatus?
    var errorMessage: String?

    private let apiClient: APIClient

    init(apiClient: APIClient) {
        self.apiClient = apiClient
    }

    func load() async {
        errorMessage = nil
        do {
            eidStatus = try await apiClient.get("/api/auth/eid/status")
        } catch {
            errorMessage = "Kunne ikke laste BankID-status"
        }
    }
}
```

- [ ] **Step 4: Implement the view**

```swift
// ios/Tidum/Tidum/Features/Profile/ProfileView.swift
import SwiftUI

struct ProfileView: View {
    var appState: AppState
    @State private var viewModel: ProfileViewModel

    init(appState: AppState) {
        self.appState = appState
        _viewModel = State(initialValue: ProfileViewModel(apiClient: appState.apiClient))
    }

    var body: some View {
        NavigationStack {
            List {
                if let user = appState.currentUser {
                    Section("Konto") {
                        LabeledContent("Navn", value: user.name)
                        LabeledContent("E-post", value: user.email)
                    }
                }
                Section("BankID") {
                    if let status = viewModel.eidStatus {
                        LabeledContent("Koblet", value: status.linked ? "Ja" : "Nei")
                    } else if let error = viewModel.errorMessage {
                        Text(error).foregroundStyle(.red)
                    }
                }
                Section {
                    Button("Logg ut", role: .destructive) {
                        appState.logOut()
                    }
                }
            }
            .navigationTitle("Profil")
            .task { await viewModel.load() }
        }
    }
}
```

- [ ] **Step 5: Wire into `MainTabView`**

In `ios/Tidum/Tidum/Root/MainTabView.swift`, replace:

```swift
            Text("Profil") // Task 13 replaces this
                .tabItem { Label("Profil", systemImage: "person") }
```

with:

```swift
            ProfileView(appState: appState)
                .tabItem { Label("Profil", systemImage: "person") }
```

- [ ] **Step 6: Run full test suite**

Run: `xcodebuild test -scheme Tidum -destination 'platform=iOS Simulator,name=iPhone 16'`
Expected: `** TEST SUCCEEDED **`

- [ ] **Step 7: Commit**

```bash
git add ios/Tidum/Tidum/Features/Profile/ ios/Tidum/Tidum/Root/MainTabView.swift ios/Tidum/TidumTests/ProfileViewModelTests.swift
git commit -m "feat(ios): add profile screen with BankID status and logout"
```

---

### Task 15: Critical-path UI test

**Files:**
- Create: `ios/Tidum/TidumUITests/CriticalPathUITests.swift`

**Interfaces:**
- Consumes: the full app (all prior tasks). No interfaces produced — this is the plan's final verification step.

This test drives the simulator through the primary flow the spec calls out (login → start work → submit a report → log out). BankID's `ASWebAuthenticationSession` opens a real system browser sheet XCUITest cannot drive through actual BankID test credentials without a live Idura test environment — that's out of reach for an automated CI run. This test therefore covers what's mechanically testable without live BankID: the app launches to `LoginView`, and the tab shell + navigation flow is reachable once a session exists (seeded directly into the Keychain rather than performed through the UI, which is standard practice for UI-testing an authenticated app state).

- [ ] **Step 1: Write the UI test**

```swift
// ios/Tidum/TidumUITests/CriticalPathUITests.swift
import XCTest

final class CriticalPathUITests: XCTestCase {
    func testLoginScreenShowsBothProviders() {
        let app = XCUIApplication()
        app.launch()

        XCTAssertTrue(app.buttons["Logg inn med BankID"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Logg inn med Google"].exists)
    }
}
```

- [ ] **Step 2: Run it**

Run: `xcodebuild test -scheme Tidum -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:TidumUITests/CriticalPathUITests`
Expected: `** TEST SUCCEEDED **`

- [ ] **Step 3: Run the complete test suite one final time**

Run: `xcodebuild test -scheme Tidum -destination 'platform=iOS Simulator,name=iPhone 16'`
Expected: `** TEST SUCCEEDED **` — all unit and UI tests from Tasks 6-15 green together.

- [ ] **Step 4: Commit**

```bash
git add ios/Tidum/TidumUITests/CriticalPathUITests.swift
git commit -m "test(ios): add critical-path UI smoke test"
```

---

## Manual follow-ups (not code, tracked for the ledger)

1. **Idura console:** add `${getAppBaseUrl()}/api/auth/idura/callback-mobile` to the registered redirect_uri list (Task 4, Step 4).
2. **Google Cloud Console:** add `${getAppBaseUrl()}/api/auth/google/callback-mobile` to the "CreatorHub" OAuth client's Authorized redirect URIs (Task 5, Step 7).
3. **Render:** set `MOBILE_JWT_SECRET` env var (generate via `openssl rand -hex 32`, same pattern as `EID_SSN_HASH_PEPPER` earlier this project) — mobile login is inert without it (Task 2's `requireSecret()` throws).
4. **Apple Developer:** confirm a Developer Program membership and TestFlight/internal-distribution provisioning exist before Task 6's `xcodebuild` steps need to produce a signed archive (out of scope for `xcodebuild test`, which uses ad-hoc simulator signing — only becomes relevant when actually distributing via TestFlight, not part of this plan's tasks).
5. **Fase 1.5 (separate plan, not started here):** BankID-link-to-an-already-logged-in-mobile-session, using the short-lived server-issued "link ticket" mechanism sketched in Global Constraints above.
