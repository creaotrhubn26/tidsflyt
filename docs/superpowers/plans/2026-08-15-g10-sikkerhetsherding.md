# G-10 Sikkerhetsherding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lukke alle åtte G-10-funnene fra Halden-gap-analysen: to dev-mode auth-bypasser, to JWT-hemmeligheter med usikker fallback, TLS-validering, helmet/CSRF, Postgres Row-Level Security for vendor-isolasjon, kryptering av integrasjonshemmeligheter, og 2FA/TOTP for admin-roller.

**Architecture:** Ti oppgaver, sekvensert etter risiko og avhengighet. Oppgave 1-6 er isolerte, uavhengige fikser/delsystemer (kan i prinsippet kjøres i vilkårlig rekkefølge seg imellom). Oppgave 7-10 bygger RLS-fundamentet i strengt rekkefølge (roller/policies → AsyncLocalStorage-proxy → fil-klassifisering → FORCE-bryter), siden hver forutsetter at forrige er verifisert.

**Tech Stack:** Express, Drizzle ORM, node-postgres (`pg`), Node `AsyncLocalStorage`, `helmet`, `csrf-csrf`, `otplib`, Node `crypto` (AES-256-GCM), vitest.

**Spec:** [docs/superpowers/specs/2026-08-15-g10-sikkerhetsherding-design.md](../specs/2026-08-15-g10-sikkerhetsherding-design.md)

## Global Constraints

- Ingen av oppgavene skal endre eksisterende offentlige API-kontrakter (ruter, respons-shape) utover de nye feiltilstandene beskrevet i hver oppgave.
- Alle nye hemmeligheter (`SECRETS_ENCRYPTION_KEY`, `EMAIL_MAGIC_LINK_SECRET`, `AUTH_JWT_SECRET`) er PÅKREVDE ved oppstart i produksjon — kast en klar feil ved mangel, aldri stille fallback.
- Ingen klartekst-hemmelighet (SMTP-passord, PowerOffice-nøkkel, TOTP-secret, fnr) skal noensinne logges.
- `tidum_system`-databaserollen (oppgave 7) brukes KUN av: migrasjoner, seed, cron, og auth-oppslag som strukturelt kjører før `req.user` finnes. All annen kode skal automatisk RLS-håndheves via ALS-proxyen (oppgave 8) uten kodeendring.
- `FORCE ROW LEVEL SECURITY` (oppgave 10) slås aldri på før oppgave 9s klassifisering av alle 56 db/pool-konsumerende filer er verifisert komplett.
- Miljøbegrensning i denne sandboxen (ingen lokal Postgres-rolle): DB-berørende tester kan ikke kjøre fullt — verifiser da ved nøye lesing i stedet, samme akseptable mønster som resten av prosjektet. Kjør dem likevel — de skal fortsatt skrives og committes, og kjøres i CI/staging senere.

---

### Task 1: Dev-mode auth-bypass — eksplisitt opt-in

**Files:**
- Modify: `server/middleware/auth.ts:8-29`
- Modify: `server/custom-auth.ts:275,326-333`
- Test: `client/src/test/server/dev-auth-bypass.test.ts`

**Interfaces:**
- Produces: ingen nye eksporter — kun ny betingelse på eksisterende, allerede-lokale `isDevMode`/`isDev`-konstanter.

- [ ] **Step 1: Skriv de feilende testene**

```ts
// client/src/test/server/dev-auth-bypass.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";

describe("dev-mode auth-bypass krever eksplisitt opt-in", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalFlag = process.env.ALLOW_DEV_AUTH_BYPASS;

  beforeEach(() => {
    delete process.env.ALLOW_DEV_AUTH_BYPASS;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalFlag === undefined) {
      delete process.env.ALLOW_DEV_AUTH_BYPASS;
    } else {
      process.env.ALLOW_DEV_AUTH_BYPASS = originalFlag;
    }
  });

  it("middleware/auth.ts: isBypassAllowed er false uten ALLOW_DEV_AUTH_BYPASS, selv i dev", async () => {
    process.env.NODE_ENV = "development";
    const mod = await import(`../../../../server/middleware/auth.ts?t=${Date.now()}`);
    expect(mod.isDevAuthBypassAllowed()).toBe(false);
  });

  it("middleware/auth.ts: isBypassAllowed er true kun når BÅDE dev og flagget er satt", async () => {
    process.env.NODE_ENV = "development";
    process.env.ALLOW_DEV_AUTH_BYPASS = "true";
    const mod = await import(`../../../../server/middleware/auth.ts?t=${Date.now()}`);
    expect(mod.isDevAuthBypassAllowed()).toBe(true);
  });

  it("middleware/auth.ts: isBypassAllowed er false i produksjon selv med flagget satt", async () => {
    process.env.NODE_ENV = "production";
    process.env.ALLOW_DEV_AUTH_BYPASS = "true";
    const mod = await import(`../../../../server/middleware/auth.ts?t=${Date.now()}`);
    expect(mod.isDevAuthBypassAllowed()).toBe(false);
  });
});
```

- [ ] **Step 2: Kjør testene, verifiser at de feiler**

Run: `npx vitest run client/src/test/server/dev-auth-bypass.test.ts`
Expected: FAIL — `isDevAuthBypassAllowed is not a function` (funksjonen finnes ikke ennå).

- [ ] **Step 3: Fiks `server/middleware/auth.ts`**

Endre linje 8-9 og funksjonen `authenticate` (linje 26-29):

```ts
// server/middleware/auth.ts — erstatt linje 8-9
const JWT_SECRET = requireAuthJwtSecret(); // se Task 2 — denne endres der, ikke her

export function isDevAuthBypassAllowed(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.ALLOW_DEV_AUTH_BYPASS === "true";
}
```

```ts
// server/middleware/auth.ts — erstatt linje 26-29 (inni authenticate())
function authenticate(req: Request): boolean {
  if (isDevAuthBypassAllowed()) {
    (req as any).authUser = { id: '1', email: 'dev@tidum.no', role: 'super_admin' };
    return true;
  }
  // ... resten av funksjonen uendret
```

(`requireAuthJwtSecret()` defineres i Task 2 — hvis Task 2 ikke er gjort ennå når denne kjøres, behold `JWT_SECRET`-linjen som den er i dag inntil da; ikke dupliser logikk.)

- [ ] **Step 4: Fiks `server/custom-auth.ts`**

Endre linje 275 og 326-333:

```ts
// server/custom-auth.ts — erstatt linje 275
const isDev = process.env.NODE_ENV !== "production";

function isDevAuthBypassAllowed(): boolean {
  return isDev && process.env.ALLOW_DEV_AUTH_BYPASS === "true";
}
```

```ts
// server/custom-auth.ts — erstatt linje 326-333 (inni setupCustomAuth)
  // DEV MODE: inject a mock user so all API routes work without OAuth —
  // krever eksplisitt ALLOW_DEV_AUTH_BYPASS=true i tillegg til NODE_ENV,
  // slik at ingen utvikler kan bli logget inn som super_admin ved et uhell.
  if (isDevAuthBypassAllowed()) {
    app.use((req, _res, next) => {
      if (!req.user) {
        req.user = DEV_USER;
        (req as any).isAuthenticated = () => true;
      }
      next();
    });
  }
```

- [ ] **Step 5: Kjør testene, verifiser at de passerer**

Run: `npx vitest run client/src/test/server/dev-auth-bypass.test.ts`
Expected: PASS (3/3)

- [ ] **Step 6: Commit**

```bash
git add server/middleware/auth.ts server/custom-auth.ts client/src/test/server/dev-auth-bypass.test.ts
git commit -m "fix(auth): require explicit opt-in flag for dev-mode auth bypass"
```

---

### Task 2: To JWT-hemmeligheter uten trygg fallback

**Files:**
- Modify: `server/custom-auth.ts:46-53`
- Modify: `server/middleware/auth.ts:8`
- Test: `client/src/test/server/jwt-secrets-required.test.ts`

**Interfaces:**
- Produces: `requireAuthJwtSecret(): string` (eksportert fra `server/middleware/auth.ts`), kastes ved manglende `AUTH_JWT_SECRET`.
- Consumes: ingen fra tidligere tasks.

- [ ] **Step 1: Skriv de feilende testene**

```ts
// client/src/test/server/jwt-secrets-required.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";

describe("JWT-hemmeligheter krever eksplisitt konfigurasjon, ingen fallback", () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.EMAIL_MAGIC_LINK_SECRET;
    delete process.env.JWT_SECRET;
    delete process.env.SESSION_SECRET;
    delete process.env.AUTH_JWT_SECRET;
  });

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it("getEmailLoginSecret kaster når EMAIL_MAGIC_LINK_SECRET mangler", async () => {
    const mod = await import(`../../../../server/custom-auth.ts?t=${Date.now()}`);
    expect(() => mod.requireEmailLoginSecret()).toThrow(/EMAIL_MAGIC_LINK_SECRET/);
  });

  it("getEmailLoginSecret returnerer verdien når satt, uten å falle til JWT_SECRET/SESSION_SECRET", async () => {
    process.env.EMAIL_MAGIC_LINK_SECRET = "test-magic-link-secret";
    process.env.JWT_SECRET = "should-never-be-used";
    const mod = await import(`../../../../server/custom-auth.ts?t=${Date.now()}`);
    expect(mod.requireEmailLoginSecret()).toBe("test-magic-link-secret");
  });

  it("requireAuthJwtSecret kaster når AUTH_JWT_SECRET mangler, selv med JWT_SECRET/SESSION_SECRET satt", async () => {
    process.env.JWT_SECRET = "should-never-be-used";
    process.env.SESSION_SECRET = "should-never-be-used-either";
    const mod = await import(`../../../../server/middleware/auth.ts?t=${Date.now()}`);
    expect(() => mod.requireAuthJwtSecret()).toThrow(/AUTH_JWT_SECRET/);
  });

  it("requireAuthJwtSecret returnerer AUTH_JWT_SECRET når satt", async () => {
    process.env.AUTH_JWT_SECRET = "test-auth-jwt-secret";
    const mod = await import(`../../../../server/middleware/auth.ts?t=${Date.now()}`);
    expect(mod.requireAuthJwtSecret()).toBe("test-auth-jwt-secret");
  });
});
```

- [ ] **Step 2: Kjør testene, verifiser at de feiler**

Run: `npx vitest run client/src/test/server/jwt-secrets-required.test.ts`
Expected: FAIL — `requireEmailLoginSecret`/`requireAuthJwtSecret` finnes ikke ennå (funksjonene er ikke eksportert/omdøpt).

- [ ] **Step 3: Fiks `server/custom-auth.ts`**

Erstatt linje 46-53 (`getEmailLoginSecret`):

```ts
// Egen hemmelighet for magic-link-tokens, ikke delt med mobil-JWT (se
// server/lib/mobile-auth.ts) eller Bearer-JWT-verifisering (se
// server/middleware/auth.ts) — samme isolasjonsprinsipp: en kompromittert
// hemmelighet av én tokentype skal aldri kunne forfalske en annen.
export function requireEmailLoginSecret(): string {
  const secret = process.env.EMAIL_MAGIC_LINK_SECRET;
  if (!secret) {
    throw new Error("EMAIL_MAGIC_LINK_SECRET er ikke konfigurert");
  }
  return secret;
}
```

Oppdater de to kallstedene (linje 84 og 501) fra `getEmailLoginSecret()` til `requireEmailLoginSecret()` (samme antall parametere, samme returtype — ren omdøping).

- [ ] **Step 4: Fiks `server/middleware/auth.ts`**

Erstatt linje 8 (`const JWT_SECRET = ...`) med:

```ts
// Egen hemmelighet for Bearer-token-verifisering i denne filen, ikke delt
// med magic-link (custom-auth.ts) eller mobil-JWT (lib/mobile-auth.ts).
export function requireAuthJwtSecret(): string {
  const secret = process.env.AUTH_JWT_SECRET;
  if (!secret) {
    throw new Error("AUTH_JWT_SECRET er ikke konfigurert");
  }
  return secret;
}
```

Fjern den gamle modul-nivå `JWT_SECRET`-konstanten helt. Oppdater linje 42 (`jwt.verify(authHeader.split(' ')[1], JWT_SECRET)`) til `jwt.verify(authHeader.split(' ')[1], requireAuthJwtSecret())`.

- [ ] **Step 5: Kjør testene, verifiser at de passerer**

Run: `npx vitest run client/src/test/server/jwt-secrets-required.test.ts`
Expected: PASS (4/4)

- [ ] **Step 6: Verifiser at Task 1s bruk av `requireAuthJwtSecret` fortsatt gir mening**

Hvis Task 1 ble gjort før denne: bekreft at `server/middleware/auth.ts`s modul-nivå-linje nå faktisk kaller `requireAuthJwtSecret()` importert/definert riktig — ingen dobbel definisjon av samme funksjon.

- [ ] **Step 7: Commit**

```bash
git add server/custom-auth.ts server/middleware/auth.ts client/src/test/server/jwt-secrets-required.test.ts
git commit -m "fix(auth): require explicit AUTH_JWT_SECRET/EMAIL_MAGIC_LINK_SECRET, no fallback"
```

---

### Task 3: Databasetilkobling — valider TLS-sertifikat

**Files:**
- Modify: `server/db.ts:19`
- Test: `client/src/test/server/db-ssl-config.test.ts`

**Interfaces:** ingen — ren konfigurasjonsendring, ingen nye eksporter.

- [ ] **Step 1: Skriv den feilende testen**

```ts
// client/src/test/server/db-ssl-config.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";

describe("databasetilkoblingens SSL-konfigurasjon", () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    process.env.DATABASE_URL = "postgres://user:pass@some-remote-host.neon.tech/db";
    delete process.env.DATABASE_SSL;
    delete process.env.PGSSLMODE;
  });

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it("krever gyldig sertifikat (rejectUnauthorized: true) mot en ikke-lokal tilkobling", async () => {
    const { buildSslConfig } = await import(`../../../../server/db.ts?t=${Date.now()}`);
    expect(buildSslConfig()).toEqual({ rejectUnauthorized: true });
  });

  it("bruker ingen SSL mot en lokal tilkobling", async () => {
    process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/db";
    const { buildSslConfig } = await import(`../../../../server/db.ts?t=${Date.now()}`);
    expect(buildSslConfig()).toBe(false);
  });
});
```

- [ ] **Step 2: Kjør testen, verifiser at den feiler**

Run: `npx vitest run client/src/test/server/db-ssl-config.test.ts`
Expected: FAIL — `buildSslConfig` er ikke eksportert (logikken er i dag inline, ikke en egen funksjon).

- [ ] **Step 3: Fiks `server/db.ts`**

Erstatt linje 8-19 (fra `const sslDisabled = ...` til `const pool = new Pool({...})`) med:

```ts
const sslDisabled = process.env.DATABASE_SSL === "false" || process.env.PGSSLMODE === "disable";
const isLocal = connectionString
  ? /localhost|127\.0\.0\.1/.test(connectionString)
  : false;

export function buildSslConfig(): { rejectUnauthorized: true } | false {
  if (sslDisabled || isLocal) return false;
  return { rejectUnauthorized: true };
}

const pool = new Pool({
  connectionString,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: buildSslConfig(),
});
```

- [ ] **Step 4: Kjør testen, verifiser at den passerer**

Run: `npx vitest run client/src/test/server/db-ssl-config.test.ts`
Expected: PASS (2/2)

- [ ] **Step 5: Manuell verifikasjon mot ekte Neon/Render (kan ikke automatiseres i denne sandboxen)**

Deploy til et staging-miljø med ekte `DATABASE_URL` og bekreft at appen starter og kobler til uten `certificate verify failed`-feil. Hvis den feiler: sjekk om `NODE_EXTRA_CA_CERTS` må settes for å peke på en eventuell mellomliggende CA (usannsynlig for Neon/Render, men verifiser).

- [ ] **Step 6: Commit**

```bash
git add server/db.ts client/src/test/server/db-ssl-config.test.ts
git commit -m "fix(db): validate TLS certificate on non-local Postgres connections"
```

---

### Task 4: helmet + CSRF

**Files:**
- Modify: `server/index.ts` (etter linje 29, før ruteregistrering)
- Modify: `server/custom-auth.ts` (CSRF-middleware montert rett etter passport-oppsettet, kun på sesjons-ruter)
- Create: `server/lib/csrf.ts`
- Test: `client/src/test/server/csrf.test.ts`

**Interfaces:**
- Produces: `csrfProtection` (RequestHandler, eksportert fra `server/lib/csrf.ts`) — montert av `setupCustomAuth` på tilstandsendrende sesjons-ruter.
- Consumes: ingen fra tidligere tasks.

- [ ] **Step 1: Installer avhengigheter**

```bash
npm install helmet csrf-csrf
```

- [ ] **Step 2: Skriv den feilende testen**

```ts
// client/src/test/server/csrf.test.ts
import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { csrfProtection, generateCsrfToken } from "../../../../server/lib/csrf";

describe("CSRF-vern", () => {
  function buildApp() {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      // simulerer en innlogget sesjon (det csrf-csrf sitt double-submit-cookie-mønster krever)
      (req as any).session = {};
      next();
    });
    app.get("/csrf-token", (req, res) => res.json({ token: generateCsrfToken(req, res) }));
    app.post("/state-changing", csrfProtection, (req, res) => res.json({ ok: true }));
    return app;
  }

  it("avviser POST uten gyldig CSRF-token", async () => {
    const app = buildApp();
    const res = await request(app).post("/state-changing").send({});
    expect(res.status).toBe(403);
  });

  it("godtar POST med gyldig token hentet fra /csrf-token", async () => {
    const app = buildApp();
    const agent = request.agent(app);
    const tokenRes = await agent.get("/csrf-token");
    const res = await agent
      .post("/state-changing")
      .set("x-csrf-token", tokenRes.body.token)
      .send({});
    expect(res.status).toBe(200);
  });
});
```

Sjekk om `supertest` allerede er en avhengighet (`grep supertest package.json`); hvis ikke, legg til: `npm install -D supertest`.

- [ ] **Step 3: Kjør testen, verifiser at den feiler**

Run: `npx vitest run client/src/test/server/csrf.test.ts`
Expected: FAIL — `server/lib/csrf.ts` finnes ikke ennå.

- [ ] **Step 4: Opprett `server/lib/csrf.ts`**

```ts
import { doubleCsrf } from "csrf-csrf";
import { requireAuthJwtSecret } from "../middleware/auth"; // gjenbruker Task 2s hemmelighet-krav-mønster? nei — se under

// CSRF-tokens signeres med sin egen hemmelighet — ikke delt med noen annen
// tokentype (samme isolasjonsprinsipp som resten av G-10-arbeidet).
function requireCsrfSecret(): string {
  const secret = process.env.CSRF_SECRET;
  if (!secret) {
    throw new Error("CSRF_SECRET er ikke konfigurert");
  }
  return secret;
}

const { doubleCsrfProtection, generateCsrfToken: generate } = doubleCsrf({
  getSecret: () => requireCsrfSecret(),
  cookieName: "__Host-tidum.csrf",
  cookieOptions: {
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  },
  getSessionIdentifier: (req) => (req as any).sessionID || "no-session",
});

export const csrfProtection = doubleCsrfProtection;
export const generateCsrfToken = generate;
```

(Fjern den feilaktige importen av `requireAuthJwtSecret` — CSRF-hemmeligheten er sin egen, ikke gjenbruk av Bearer-JWT-hemmeligheten. Rett kommentaren over til å reflektere `requireCsrfSecret` som den faktisk brukte funksjonen.)

- [ ] **Step 5: Legg til ny env-variabel-dokumentasjon**

Hvis `.env.example` finnes: legg til `CSRF_SECRET=` med en kort kommentar. Hvis filen ikke finnes, hopp over dette steget (ikke opprett filen som en del av denne oppgaven — utenfor scope).

- [ ] **Step 6: Monter helmet i `server/index.ts`**

Rett etter linje 29 (`app.use((_req, res, next) => { ... Private-Network ... })`), legg til:

```ts
import helmet from "helmet";

// ... (etter Private-Network-middlewaren)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // Vite/React-buildet bruker i dag inline <style>/<script> enkelte
        // steder — dette unntaket er kjent og midlertidig, strammes inn når
        // de er kartlagt og fjernet (egen oppfølgingsoppgave, ikke del av
        // G-10). Fjern IKKE dette unntaket uten å verifisere at appen
        // fortsatt fungerer i en nettleser først.
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    hsts: { maxAge: 31536000, includeSubDomains: true },
  }),
);
```

- [ ] **Step 7: Monter CSRF-vern i `server/custom-auth.ts`**

I `setupCustomAuth`, rett etter `app.use(resolveBearerUser);` (linje 323), legg til en ny rute for å hente token og monter beskyttelsen KUN på sesjons-autentiserte, tilstandsendrende ruter — ikke globalt (Bearer-ruter skal ikke kreve det):

```ts
import { csrfProtection, generateCsrfToken } from "./lib/csrf";

// ... i setupCustomAuth, etter app.use(resolveBearerUser):
app.get("/api/csrf-token", (req, res) => {
  res.json({ token: generateCsrfToken(req, res) });
});

// Montert som en betinget middleware: kun håndhevet når requesten faktisk
// er sesjons-cookie-autentisert (req.isAuthenticated()), aldri på
// Bearer-token-ruter (mobilappen sender aldri denne cookien/dette
// headeret) og aldri på GET (kun tilstandsendrende metoder).
app.use((req, res, next) => {
  const isStateChanging = ["POST", "PUT", "PATCH", "DELETE"].includes(req.method);
  const isSessionAuthed = req.isAuthenticated?.() === true;
  if (isStateChanging && isSessionAuthed) {
    return csrfProtection(req, res, next);
  }
  next();
});
```

- [ ] **Step 8: Kjør testen, verifiser at den passerer**

Run: `npx vitest run client/src/test/server/csrf.test.ts`
Expected: PASS (2/2)

Sett en midlertidig `CSRF_SECRET=test-secret-for-vitest` i testens `beforeEach`/miljø hvis testen feiler på manglende variabel — legg til i test-setup-filen (`vitest.config.ts`s `env`-felt eller en `beforeAll` i testen selv) fremfor å hardkode i produksjonskode.

- [ ] **Step 9: Verifiser at hele appen fortsatt bygger og lastes i nettleser**

Run: `npm run check && npm run build`
Expected: begge exit 0. Deretter (hvis mulig i denne sandboxen): start dev-serveren og bekrefte i en nettleser at landingssiden og innlogging fortsatt fungerer med CSP-headeren aktiv (ingen konsoll-feil om blokkerte ressurser utover de kjente, dokumenterte unntakene).

- [ ] **Step 10: Commit**

```bash
git add server/index.ts server/custom-auth.ts server/lib/csrf.ts client/src/test/server/csrf.test.ts package.json package-lock.json
git commit -m "feat(security): add helmet CSP/HSTS and CSRF protection on session routes"
```

---

### Task 5: Kryptering av integrasjonshemmeligheter

**Files:**
- Create: `server/lib/secret-crypto.ts`
- Create: `scripts/encrypt-existing-secrets.ts`
- Modify: filene som skriver `vendorIntegrations.clientKey` (finn med `grep -rln "clientKey" server/routes/ server/lib/`) og `userSettings.smtpAppPassword` (finn med `grep -rln "smtpAppPassword" server/`)
- Test: `client/src/test/server/secret-crypto.test.ts`

**Interfaces:**
- Produces: `encryptSecret(plaintext: string): string`, `decryptSecret(ciphertext: string): string`, `isEncryptedSecret(value: string): boolean` — alle eksportert fra `server/lib/secret-crypto.ts`.
- Consumes: ingen fra tidligere tasks.

- [ ] **Step 1: Skriv de feilende testene**

```ts
// client/src/test/server/secret-crypto.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomBytes } from "crypto";

describe("secret-crypto", () => {
  const originalKey = process.env.SECRETS_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.SECRETS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  });

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.SECRETS_ENCRYPTION_KEY;
    } else {
      process.env.SECRETS_ENCRYPTION_KEY = originalKey;
    }
  });

  it("krypterer og dekrypterer til samme verdi (rundtur)", async () => {
    const { encryptSecret, decryptSecret } = await import(`../../../../server/lib/secret-crypto.ts?t=${Date.now()}`);
    const plaintext = "super-hemmelig-poweroffice-nokkel";
    const ciphertext = encryptSecret(plaintext);
    expect(ciphertext).not.toBe(plaintext);
    expect(decryptSecret(ciphertext)).toBe(plaintext);
  });

  it("produserer ulik ciphertext for samme plaintext ved to kall (tilfeldig IV)", async () => {
    const { encryptSecret } = await import(`../../../../server/lib/secret-crypto.ts?t=${Date.now()}`);
    expect(encryptSecret("samme-verdi")).not.toBe(encryptSecret("samme-verdi"));
  });

  it("isEncryptedSecret kjenner igjen kryptert format, ikke klartekst", async () => {
    const { encryptSecret, isEncryptedSecret } = await import(`../../../../server/lib/secret-crypto.ts?t=${Date.now()}`);
    expect(isEncryptedSecret(encryptSecret("verdi"))).toBe(true);
    expect(isEncryptedSecret("ren-klartekst-uten-kolon")).toBe(false);
  });

  it("kaster ved manipulert ciphertext (auth-tag feiler)", async () => {
    const { encryptSecret, decryptSecret } = await import(`../../../../server/lib/secret-crypto.ts?t=${Date.now()}`);
    const ciphertext = encryptSecret("verdi");
    const tampered = ciphertext.slice(0, -4) + "abcd";
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("krever SECRETS_ENCRYPTION_KEY", async () => {
    delete process.env.SECRETS_ENCRYPTION_KEY;
    const mod = await import(`../../../../server/lib/secret-crypto.ts?t=${Date.now()}`);
    expect(() => mod.encryptSecret("x")).toThrow(/SECRETS_ENCRYPTION_KEY/);
  });
});
```

- [ ] **Step 2: Kjør testene, verifiser at de feiler**

Run: `npx vitest run client/src/test/server/secret-crypto.test.ts`
Expected: FAIL — `server/lib/secret-crypto.ts` finnes ikke ennå.

- [ ] **Step 3: Opprett `server/lib/secret-crypto.ts`**

```ts
import { randomBytes, createCipheriv, createDecipheriv } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM anbefalt IV-lengde

function requireKey(): Buffer {
  const key = process.env.SECRETS_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("SECRETS_ENCRYPTION_KEY er ikke konfigurert");
  }
  const buf = Buffer.from(key, "base64");
  if (buf.length !== 32) {
    throw new Error("SECRETS_ENCRYPTION_KEY må være 32 byte (base64-kodet)");
  }
  return buf;
}

export function encryptSecret(plaintext: string): string {
  const key = requireKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${ciphertext.toString("base64")}`;
}

export function decryptSecret(value: string): string {
  const key = requireKey();
  const [ivB64, authTagB64, ciphertextB64] = value.split(":");
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error("Ugyldig kryptert format — forventet iv:authTag:ciphertext");
  }
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

export function isEncryptedSecret(value: string): boolean {
  const parts = value.split(":");
  if (parts.length !== 3) return false;
  return parts.every((p) => /^[A-Za-z0-9+/]+=*$/.test(p) && p.length > 0);
}
```

- [ ] **Step 4: Kjør testene, verifiser at de passerer**

Run: `npx vitest run client/src/test/server/secret-crypto.test.ts`
Expected: PASS (5/5)

- [ ] **Step 5: Finn og les de faktiske skrive-/lesestedene**

```bash
grep -rln "clientKey" server/routes/ server/lib/
grep -rln "smtpAppPassword" server/
```

Les hvert treff. For hvert sted som SKRIVER `vendorIntegrations.clientKey` eller `userSettings.smtpAppPassword` til databasen: wrap verdien i `encryptSecret(...)` før `.insert()`/`.update()`. For hvert sted som LESER verdien for faktisk BRUK (PowerOffice-klienten som bygger en HTTP-request, e-postutsendingskoden som autentiserer mot SMTP): wrap i `decryptSecret(...)` etter `.select()`. Steder som kun VISER om en nøkkel er satt (f.eks. en boolsk `hasClientKey`-status i en admin-UI) trenger ingen dekryptering — ikke dekrypter unødvendig.

- [ ] **Step 6: Opprett migreringsscriptet**

```ts
// scripts/encrypt-existing-secrets.ts
import { db } from "../server/db";
import { vendorIntegrations, userSettings } from "@shared/schema";
import { encryptSecret, isEncryptedSecret } from "../server/lib/secret-crypto";
import { eq } from "drizzle-orm";

async function run() {
  const integrations = await db.select().from(vendorIntegrations);
  let integrationsEncrypted = 0;
  for (const row of integrations) {
    if (!row.clientKey || isEncryptedSecret(row.clientKey)) continue;
    await db
      .update(vendorIntegrations)
      .set({ clientKey: encryptSecret(row.clientKey) })
      .where(eq(vendorIntegrations.id, row.id));
    integrationsEncrypted++;
  }

  const settings = await db.select().from(userSettings);
  let smtpEncrypted = 0;
  for (const row of settings) {
    if (!row.smtpAppPassword || isEncryptedSecret(row.smtpAppPassword)) continue;
    await db
      .update(userSettings)
      .set({ smtpAppPassword: encryptSecret(row.smtpAppPassword) })
      .where(eq(userSettings.id, row.id));
    smtpEncrypted++;
  }

  console.log(
    `Kryptert ${integrationsEncrypted} vendor_integrations.client_key og ${smtpEncrypted} user_settings.smtp_app_password rader.`,
  );
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migrering feilet:", err);
    process.exit(1);
  });
```

- [ ] **Step 7: Skriv en test som bekrefter idempotens**

```ts
// legg til i client/src/test/server/secret-crypto.test.ts, egen describe-blokk
describe("isEncryptedSecret hindrer dobbel-kryptering", () => {
  it("en allerede kryptert verdi krypteres ikke på nytt av et idempotent script-mønster", async () => {
    process.env.SECRETS_ENCRYPTION_KEY = require("crypto").randomBytes(32).toString("base64");
    const { encryptSecret, isEncryptedSecret } = await import(`../../../../server/lib/secret-crypto.ts?t=${Date.now()}`);
    const once = encryptSecret("original-verdi");
    // simulerer scriptets "hopp over hvis allerede kryptert"-sjekk
    const shouldSkip = isEncryptedSecret(once);
    expect(shouldSkip).toBe(true);
  });
});
```

Run: `npx vitest run client/src/test/server/secret-crypto.test.ts`
Expected: PASS (6/6)

- [ ] **Step 8: Dokumenter kjøring i deploy-notatene**

Legg til én linje i denne oppgavens commit-melding om at `SECRETS_ENCRYPTION_KEY` må settes i produksjonsmiljøet FØR deploy, og at `npx tsx scripts/encrypt-existing-secrets.ts` må kjøres én gang etter første deploy av denne oppgaven (idempotent, trygt å kjøre flere ganger).

- [ ] **Step 9: Commit**

```bash
git add server/lib/secret-crypto.ts scripts/encrypt-existing-secrets.ts client/src/test/server/secret-crypto.test.ts
git commit -m "feat(security): encrypt vendor integration secrets and SMTP passwords at rest"
```

(Legg til en separat commit for de faktiske lese-/skrivested-endringene fra Step 5, siden filene der varierer og ikke er kjent før `grep`-søket kjøres — samme prinsipp, egen commit: `git commit -m "feat(security): read/write PowerOffice and SMTP secrets through secret-crypto"`.)

---

### Task 6: 2FA/TOTP for admin-roller

**Files:**
- Create: migration `053_admin_totp_credentials.sql`
- Modify: `shared/models/auth.ts` (ny tabell)
- Create: `server/lib/totp.ts`
- Create: `server/routes/totp-routes.ts`
- Modify: `server/routes.ts` (registrer nye ruter)
- Modify: `server/custom-auth.ts` (håndhevelse ved innlogging for admin-roller)
- Create: `client/src/pages/totp-setup.tsx`
- Test: `client/src/test/server/totp.test.ts`

**Interfaces:**
- Consumes: `encryptSecret`/`decryptSecret` fra Task 5 (`server/lib/secret-crypto.ts`).
- Produces: `isAdminRole(role: string): boolean` (gjenbruker `canAccessVendorApiAdmin` fra `shared/roles.ts` — ikke en ny funksjon), `hasTotpEnrolled(userId: string): Promise<boolean>`, `verifyTotpOrRecoveryCode(userId: string, code: string): Promise<boolean>` — begge eksportert fra `server/lib/totp.ts`.

- [ ] **Step 1: Installer avhengigheter**

```bash
npm install otplib qrcode
npm install -D @types/qrcode
```

- [ ] **Step 2: Opprett migrasjonen**

```sql
-- migrations/053_admin_totp_credentials.sql
--
-- TOTP-hemmelighet og gjenopprettingskoder for admin-roller (super_admin,
-- hovedadmin, vendor_admin — se shared/roles.ts canAccessVendorApiAdmin()).
-- Hemmeligheten lagres kryptert (server/lib/secret-crypto.ts, samme mønster
-- som vendor_integrations.client_key) — like sensitiv som et passord.
-- Gjenopprettingskodene lagres KUN som hash (aldri i klartekst, aldri
-- gjenopprettbare — kun sammenlignbare ved bruk).

CREATE TABLE IF NOT EXISTS admin_totp_credentials (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               VARCHAR NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  totp_secret_encrypted TEXT NOT NULL,
  recovery_codes_hashed JSONB NOT NULL DEFAULT '[]',
  enrolled_at           TIMESTAMP NOT NULL DEFAULT NOW(),
  last_used_at          TIMESTAMP
);
```

Registrer den i `server/lib/run-startup-migrations.ts` (samme mønster som `051_mobile_refresh_tokens.sql` og `052_...` fra Task 7 — legg den til i den samme ordnede listen, i nummerrekkefølge).

- [ ] **Step 3: Legg til Drizzle-tabellen i `shared/models/auth.ts`**

```ts
export const adminTotpCredentials = pgTable("admin_totp_credentials", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  totpSecretEncrypted: text("totp_secret_encrypted").notNull(),
  recoveryCodesHashed: jsonb("recovery_codes_hashed").notNull().default([]),
  enrolledAt: timestamp("enrolled_at").notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at"),
});

export type AdminTotpCredential = typeof adminTotpCredentials.$inferSelect;
```

- [ ] **Step 4: Skriv de feilende testene for `server/lib/totp.ts`**

```ts
// client/src/test/server/totp.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomBytes } from "crypto";
import { authenticator } from "otplib";

describe("totp", () => {
  beforeEach(() => {
    process.env.SECRETS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  });

  it("genererer 10 unike gjenopprettingskoder, returnert i klartekst kun ved oppsett", async () => {
    const { generateRecoveryCodes } = await import(`../../../../server/lib/totp.ts?t=${Date.now()}`);
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
  });

  it("hashTotpRecoveryCode er deterministisk (samme kode -> samme hash, for oppslag)", async () => {
    const { hashTotpRecoveryCode } = await import(`../../../../server/lib/totp.ts?t=${Date.now()}`);
    expect(hashTotpRecoveryCode("ABCD-1234")).toBe(hashTotpRecoveryCode("ABCD-1234"));
    expect(hashTotpRecoveryCode("ABCD-1234")).not.toBe(hashTotpRecoveryCode("ABCD-5678"));
  });

  it("en gyldig otplib-generert TOTP-kode verifiseres riktig mot en kryptert secret", async () => {
    const { encryptSecret } = await import(`../../../../server/lib/secret-crypto.ts?t=${Date.now()}`);
    const { verifyTotpCode } = await import(`../../../../server/lib/totp.ts?t=${Date.now()}`);
    const secret = authenticator.generateSecret();
    const code = authenticator.generate(secret);
    expect(verifyTotpCode(encryptSecret(secret), code)).toBe(true);
  });

  it("en feil kode avvises", async () => {
    const { encryptSecret } = await import(`../../../../server/lib/secret-crypto.ts?t=${Date.now()}`);
    const { verifyTotpCode } = await import(`../../../../server/lib/totp.ts?t=${Date.now()}`);
    const secret = authenticator.generateSecret();
    expect(verifyTotpCode(encryptSecret(secret), "000000")).toBe(false);
  });
});
```

- [ ] **Step 5: Kjør testene, verifiser at de feiler**

Run: `npx vitest run client/src/test/server/totp.test.ts`
Expected: FAIL — `server/lib/totp.ts` finnes ikke ennå.

- [ ] **Step 6: Opprett `server/lib/totp.ts`**

```ts
import { authenticator } from "otplib";
import { randomBytes, createHash } from "crypto";
import { encryptSecret, decryptSecret } from "./secret-crypto";
import { db } from "../db";
import { adminTotpCredentials } from "@shared/schema";
import { eq } from "drizzle-orm";

export function generateRecoveryCodes(): string[] {
  return Array.from({ length: 10 }, () => {
    const raw = randomBytes(5).toString("hex").toUpperCase();
    return `${raw.slice(0, 5)}-${raw.slice(5, 10)}`;
  });
}

export function hashTotpRecoveryCode(code: string): string {
  return createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
}

export function verifyTotpCode(encryptedSecret: string, code: string): boolean {
  const secret = decryptSecret(encryptedSecret);
  return authenticator.verify({ token: code, secret });
}

export async function hasTotpEnrolled(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: adminTotpCredentials.id })
    .from(adminTotpCredentials)
    .where(eq(adminTotpCredentials.userId, userId))
    .limit(1);
  return Boolean(row);
}

export async function verifyTotpOrRecoveryCode(userId: string, code: string): Promise<boolean> {
  const [row] = await db
    .select()
    .from(adminTotpCredentials)
    .where(eq(adminTotpCredentials.userId, userId))
    .limit(1);
  if (!row) return false;

  if (verifyTotpCode(row.totpSecretEncrypted, code)) {
    await db
      .update(adminTotpCredentials)
      .set({ lastUsedAt: new Date() })
      .where(eq(adminTotpCredentials.userId, userId));
    return true;
  }

  const hashedInput = hashTotpRecoveryCode(code);
  const remaining = (row.recoveryCodesHashed as string[]).filter((h) => h !== hashedInput);
  if (remaining.length < (row.recoveryCodesHashed as string[]).length) {
    await db
      .update(adminTotpCredentials)
      .set({ recoveryCodesHashed: remaining, lastUsedAt: new Date() })
      .where(eq(adminTotpCredentials.userId, userId));
    return true;
  }

  return false;
}

export { encryptSecret as encryptTotpSecret };
export { authenticator };
```

- [ ] **Step 7: Kjør testene, verifiser at de passerer**

Run: `npx vitest run client/src/test/server/totp.test.ts`
Expected: PASS (4/4)

- [ ] **Step 8: Opprett API-rutene**

```ts
// server/routes/totp-routes.ts
import type { Express, Request, Response } from "express";
import QRCode from "qrcode";
import { authenticator, generateRecoveryCodes, hashTotpRecoveryCode, hasTotpEnrolled, verifyTotpOrRecoveryCode, encryptTotpSecret } from "../lib/totp";
import { db } from "../db";
import { adminTotpCredentials } from "@shared/schema";
import { requireAuth } from "../middleware/auth";
import { canAccessVendorApiAdmin } from "@shared/roles";

export function registerTotpRoutes(app: Express) {
  app.get("/api/totp/status", requireAuth, async (req: Request, res: Response) => {
    const user = req.user as any;
    const enrolled = await hasTotpEnrolled(user.id);
    res.json({ enrolled, required: canAccessVendorApiAdmin(user.role) });
  });

  app.post("/api/totp/setup/start", requireAuth, async (req: Request, res: Response) => {
    const user = req.user as any;
    const secret = authenticator.generateSecret();
    const otpauthUrl = authenticator.keyuri(user.email, "Tidum", secret);
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl);
    (req.session as any).pendingTotpSecret = secret;
    res.json({ qrDataUrl, secret });
  });

  app.post("/api/totp/setup/confirm", requireAuth, async (req: Request, res: Response) => {
    const user = req.user as any;
    const pendingSecret = (req.session as any).pendingTotpSecret as string | undefined;
    const { code } = req.body as { code?: string };
    if (!pendingSecret || !code || !authenticator.verify({ token: code, secret: pendingSecret })) {
      return res.status(400).json({ error: "Ugyldig kode" });
    }
    const recoveryCodes = generateRecoveryCodes();
    await db.insert(adminTotpCredentials).values({
      userId: user.id,
      totpSecretEncrypted: encryptTotpSecret(pendingSecret),
      recoveryCodesHashed: recoveryCodes.map(hashTotpRecoveryCode),
    });
    delete (req.session as any).pendingTotpSecret;
    res.json({ recoveryCodes }); // vist ÉN gang — hentbare aldri igjen
  });

  app.post("/api/totp/verify", requireAuth, async (req: Request, res: Response) => {
    const user = req.user as any;
    const { code } = req.body as { code?: string };
    if (!code || !(await verifyTotpOrRecoveryCode(user.id, code))) {
      return res.status(401).json({ error: "Ugyldig kode" });
    }
    (req.session as any).totpVerified = true;
    res.json({ ok: true });
  });
}
```

Registrer i `server/routes.ts` (samme mønster som `setupBuypassAuth`/`setupEidAuth`): legg til `import { registerTotpRoutes } from "./routes/totp-routes";` og `registerTotpRoutes(app);` i `registerRoutes`.

- [ ] **Step 9: Håndhev ved innlogging i `server/custom-auth.ts`**

Legg til en sjekk i den delen av login-flyten som setter opp den ferdige sesjonen (der `req.logIn` fullføres for admin-roller) — se eksisterende mønster i `handleIduraCallback`/tilsvarende for hvor "sesjon er etablert"-punktet er. Legg til rett etter en vellykket `req.logIn`:

```ts
import { canAccessVendorApiAdmin } from "@shared/roles";
import { hasTotpEnrolled } from "./lib/totp";

// Datoen G-10-utrullingen skjedde — 30-dagersvinduet regnes herfra.
const TOTP_ROLLOUT_DATE = new Date("2026-08-15T00:00:00Z");

async function checkTotpRequirement(user: AuthUser): Promise<"not_required" | "grace_period" | "required_missing" | "satisfied"> {
  if (!canAccessVendorApiAdmin(user.role)) return "not_required";
  const enrolled = await hasTotpEnrolled(user.id);
  if (enrolled) return "satisfied";
  const daysSinceRollout = (Date.now() - TOTP_ROLLOUT_DATE.getTime()) / (1000 * 60 * 60 * 24);
  return daysSinceRollout < 30 ? "grace_period" : "required_missing";
}
```

Kall `checkTotpRequirement` etter innlogging; ved `"required_missing"`, redirect til `/totp-setup` i stedet for dashbordet (sesjonen er opprettet, men klienten skal ikke vise dashbordet før TOTP er satt opp — håndheves i frontend-routing, ikke ved å nekte sesjonen, siden brukeren nettopp SKAL inn for å sette opp TOTP). Ved `"grace_period"`, sett et flagg klienten kan lese for å vise et varsel, men fortsett til dashbordet.

- [ ] **Step 10: Opprett `client/src/pages/totp-setup.tsx`**

Enkel side: kaller `/api/totp/setup/start`, viser QR-koden (`qrDataUrl`) + secret som tekst (for manuell inntasting), et 6-sifret input-felt, kaller `/api/totp/setup/confirm` ved innsending, viser deretter de 10 gjenopprettingskodene med en tydelig «disse vises kun én gang, lagre dem nå»-advarsel og en «Jeg har lagret kodene» ‑knapp som navigerer videre. Følg eksisterende sidestruktur/styling-mønster fra `client/src/pages/koble-bankid.tsx` (samme kortbaserte layout).

- [ ] **Step 11: Kjør full testpakke og build**

Run: `npx vitest run && npm run check && npm run build`
Expected: alle testene fra denne oppgaven PASS; `check`/`build` exit 0. DB-berørende deler av `totp.test.ts` som faktisk skriver til `adminTotpCredentials`-tabellen (hvis noen legges til senere) rammes av samme kjente sandbox-begrensning som resten av prosjektet.

- [ ] **Step 12: Commit**

```bash
git add migrations/053_admin_totp_credentials.sql shared/models/auth.ts server/lib/totp.ts server/routes/totp-routes.ts server/routes.ts server/custom-auth.ts server/lib/run-startup-migrations.ts client/src/pages/totp-setup.tsx client/src/test/server/totp.test.ts package.json package-lock.json
git commit -m "feat(security): add mandatory TOTP 2FA for admin roles with 30-day grace period"
```

---

### Task 7: Postgres-roller og RLS-policies (SQL-migrasjon)

**Files:**
- Create: migration `052_rls_roles_and_policies.sql`

**Interfaces:**
- Produces: databaserollene `tidum_app` og `tidum_system`; policyen `vendor_isolation` på hver av de 20 vendor-scopede tabellene (18 fra spec §5.6 + `saker` + `users`). `FORCE ROW LEVEL SECURITY` slås IKKE på i denne oppgaven (kun `ENABLE`) — det skjer først i Task 10.
- Consumes: ingen.

**VIKTIG operasjonelt forbehold:** `CREATE ROLE` krever et databasebruker-privilegium (`CREATEROLE`, eller superuser) som en app-kjørt migrasjon typisk IKKE har på en administrert Postgres (Neon/Render tildeler vanligvis en begrenset rolle til appens tilkoblingsstreng). Denne migrasjonen må mest sannsynlig kjøres MANUELT via Neon/Render sitt eget administrasjonsgrensesnitt (SQL-konsoll med den fulle admin-rollen), IKKE via `run-startup-migrations.ts` sin vanlige automatiske kjøring ved oppstart. Verifiser dette først (steg 1) før du antar den ene eller andre veien.

- [ ] **Step 1: Verifiser hvilket privilegium migrasjonsrollen faktisk har**

```bash
npx tsx -e "
import { pool } from './server/db';
pool.query('SELECT rolcreaterole, rolsuper FROM pg_roles WHERE rolname = current_user').then(r => {
  console.log(r.rows);
  process.exit(0);
});
"
```

Hvis `rolcreaterole` og `rolsuper` begge er `false`: denne migrasjonen kan IKKE kjøre gjennom den vanlige `run-startup-migrations.ts`-mekanismen. Skriv migrasjonsfilen likevel (steg 2), men marker den EKSPLISITT i `run-startup-migrations.ts`s liste som `-- MANUAL ONLY, se kommentar i filen` (ikke lagt til i den automatiske kjørelisten), og dokumenter i commit-meldingen at den må kjøres manuelt mot produksjonsdatabasen én gang, av noen med tilstrekkelig privilegium (typisk kontoeieren i Neon/Render-dashbordet).

- [ ] **Step 2: Skriv migrasjonen**

```sql
-- migrations/052_rls_roles_and_policies.sql
--
-- To Postgres-roller for vendor-isolasjon via Row-Level Security:
--   tidum_app    — all autentisert forretningslogikk, RLS håndheves ALLTID
--                  (FORCE, ikke bare ENABLE — selv tabelleieren omfattes)
--   tidum_system — BYPASSRLS. Kun migrasjoner, seed, cron, og auth-oppslag
--                  som kjører før req.user finnes (se server/lib/
--                  request-db-context.ts og spec §5.3/§5.6 for hvorfor).
--
-- FORCE ROW LEVEL SECURITY slås IKKE på her — kun ENABLE. Se migrasjon 054
-- (Task 10) for FORCE-bryteren, som først slås på når alle 56 db/pool-
-- konsumerende filer er klassifisert og verifisert (Task 9).
--
-- MANUELL KJØRING KAN VÆRE PÅKREVD — se Task 7 steg 1 i
-- docs/superpowers/plans/2026-08-15-g10-sikkerhetsherding.md. Hvis
-- migrasjonsrollen mangler CREATEROLE/superuser, kjør denne filen manuelt
-- mot produksjonsdatabasen via Neon/Render sitt administrasjonsgrensesnitt.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'tidum_app') THEN
    CREATE ROLE tidum_app LOGIN PASSWORD NULL;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'tidum_system') THEN
    CREATE ROLE tidum_system LOGIN BYPASSRLS PASSWORD NULL;
  END IF;
END
$$;

-- tidum_app trenger vanlig lese/skrive-tilgang på alle tabeller (RLS
-- filtrerer RADENE, ikke tilgangen til tabellen som sådan).
GRANT USAGE ON SCHEMA public TO tidum_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO tidum_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO tidum_app;

GRANT USAGE ON SCHEMA public TO tidum_system;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO tidum_system;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO tidum_system;

-- Policy-mønsteret, ett per vendor-scopet tabell. fail-closed: en spørring
-- uten satt app.vendor_id matcher INGEN rader (current_setting(..., true)
-- returnerer NULL, og "vendor_id = NULL" er aldri sann i SQL).
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'companies', 'company_users', 'project_info', 'log_row', 'rapport_templates',
    'vendor_institutions', 'vendor_integrations', 'imports', 'vendor_seat_log',
    'api_keys', 'api_usage_log', 'case_reports', 'feedback_requests',
    'feedback_responses', 'timesheet_submissions', 'vendor_invite_links',
    'rapport_avvik', 'vendor_avvik_protokoller', 'vendor_templates', 'saker'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY vendor_isolation ON %I USING (vendor_id = current_setting(''app.vendor_id'', true)::int OR current_setting(''app.is_super_admin'', true) = ''true'')',
      t
    );
  END LOOP;
END
$$;

-- users-tabellen: vendor_id er nullable (null for super_admin) — samme
-- policy-uttrykk dekker den korrekt (se spec §5.4).
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY vendor_isolation ON users
  USING (
    vendor_id = current_setting('app.vendor_id', true)::int
    OR current_setting('app.is_super_admin', true) = 'true'
  );
```

- [ ] **Step 3: Verifiser at tabellnavnene i `ARRAY[...]` faktisk matcher databasens ekte tabellnavn**

```bash
grep -n 'pgTable("' shared/schema.ts shared/models/*.ts | grep -E "companies|company_users|project_info|log_row|rapport_templates|vendor_institutions|vendor_integrations|\"imports\"|vendor_seat_log|api_keys|api_usage_log|case_reports|feedback_requests|feedback_responses|timesheet_submissions|vendor_invite_links|rapport_avvik|vendor_avvik_protokoller|vendor_templates|\"saker\""
```

Bekreft at hvert `pgTable("...")`-strengnavn stemmer eksakt med listen i migrasjonen (drizzle bruker snake_case-strengen som faktisk databasetabellnavn, ikke variabelnavnet). Rett migrasjonen hvis noe avviker.

- [ ] **Step 4: Kjør migrasjonen mot en test-/staging-database (IKKE produksjon i denne oppgaven)**

Hvis en tilgjengelig staging-`DATABASE_URL` finnes: kjør `npx tsx server/lib/run-startup-migrations.ts` (eller motsvarende manuelt `psql`-kall hvis steg 1 avdekket at den må kjøres manuelt) og bekreft ingen feil. I DENNE sandboxen (ingen ekte Postgres) kan dette kun verifiseres ved nøye lesing av SQL-en — dokumenter det som gjenstående manuell verifikasjon i commit-meldingen.

- [ ] **Step 5: Commit**

```bash
git add migrations/052_rls_roles_and_policies.sql
git commit -m "feat(security): add tidum_app/tidum_system roles and RLS policies (ENABLE only, not FORCE)"
```

---

### Task 8: AsyncLocalStorage-proxy og per-request-transaksjon

**Files:**
- Create: `server/lib/request-db-context.ts`
- Modify: `server/db.ts` (gjør `db`/`pool`-eksportene om til Proxy-objekter)
- Create: `server/middleware/vendor-scoped-db.ts`
- Modify: `server/custom-auth.ts` (monter middlewaren)
- Test: `client/src/test/server/request-db-context.test.ts`

**Interfaces:**
- Consumes: `tidum_app`/`tidum_system`-rollene fra Task 7 (kun ved faktisk deploy mot ekte Postgres — koden i denne oppgaven er skrevet og testet uavhengig av at rollene faktisk finnes ennå).
- Produces: `requestDbStorage: AsyncLocalStorage<RequestDbContext>` (eksportert fra `server/lib/request-db-context.ts`), `withVendorScopedDb` (RequestHandler, eksportert fra `server/middleware/vendor-scoped-db.ts`).

- [ ] **Step 1: Skriv de feilende testene**

```ts
// client/src/test/server/request-db-context.test.ts
import { describe, it, expect } from "vitest";
import { requestDbStorage } from "../../../../server/lib/request-db-context";

describe("requestDbStorage (AsyncLocalStorage)", () => {
  it("er tom (undefined) utenfor en .run()-kontekst", () => {
    expect(requestDbStorage.getStore()).toBeUndefined();
  });

  it("returnerer den satte konteksten inni .run()", async () => {
    const fakeCtx = { db: {} as any, client: {} as any };
    await new Promise<void>((resolve) => {
      requestDbStorage.run(fakeCtx, () => {
        expect(requestDbStorage.getStore()).toBe(fakeCtx);
        resolve();
      });
    });
  });

  it("to samtidige kontekster lekker aldri inn i hverandre", async () => {
    const ctxA = { db: { tag: "A" } as any, client: {} as any };
    const ctxB = { db: { tag: "B" } as any, client: {} as any };

    const resultA = new Promise<string>((resolve) => {
      requestDbStorage.run(ctxA, async () => {
        await new Promise((r) => setTimeout(r, 10));
        resolve((requestDbStorage.getStore()?.db as any).tag);
      });
    });
    const resultB = new Promise<string>((resolve) => {
      requestDbStorage.run(ctxB, async () => {
        resolve((requestDbStorage.getStore()?.db as any).tag);
      });
    });

    expect(await resultB).toBe("B");
    expect(await resultA).toBe("A");
  });

  it("konteksten er tilgjengelig dypt nede i en kallkjede uten å bli sendt som parameter", async () => {
    const fakeCtx = { db: { marker: "deep" } as any, client: {} as any };
    async function deeplyNestedHelper(): Promise<string | undefined> {
      await Promise.resolve();
      return (requestDbStorage.getStore()?.db as any)?.marker;
    }
    await new Promise<void>((resolve) => {
      requestDbStorage.run(fakeCtx, async () => {
        expect(await deeplyNestedHelper()).toBe("deep");
        resolve();
      });
    });
  });
});
```

- [ ] **Step 2: Kjør testene, verifiser at de feiler**

Run: `npx vitest run client/src/test/server/request-db-context.test.ts`
Expected: FAIL — `server/lib/request-db-context.ts` finnes ikke ennå.

- [ ] **Step 3: Opprett `server/lib/request-db-context.ts`**

```ts
import { AsyncLocalStorage } from "node:async_hooks";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PoolClient } from "pg";
import * as schema from "@shared/schema";

export interface RequestDbContext {
  db: NodePgDatabase<typeof schema>;
  client: PoolClient;
}

// Tom (ingen kontekst) betyr: kall til db/pool faller tilbake til
// tidum_system-tilkoblingen (se server/db.ts). Dette er tilfellet for
// bakgrunnsjobber (cron, migrasjon) OG for enhver request som kjører før
// withVendorScopedDb-middlewaren (auth-ruter uten etablert req.user) —
// begge kategorier er ment å IKKE ha en satt kontekst, ikke en feiltilstand.
export const requestDbStorage = new AsyncLocalStorage<RequestDbContext>();
```

- [ ] **Step 4: Kjør testene, verifiser at de passerer**

Run: `npx vitest run client/src/test/server/request-db-context.test.ts`
Expected: PASS (4/4)

- [ ] **Step 5: Gjør `server/db.ts`s eksporter om til Proxy-objekter**

Les hele den nåværende `server/db.ts` (etter Task 3s endring) før du redigerer. Erstatt de avsluttende `export const db = ...`/`export const pool` (og legg til en separat `tidum_app`-pool ved siden av) med:

```ts
import { requestDbStorage } from "./lib/request-db-context";

// systemDb/systemPool kobler som tidum_system (BYPASSRLS) — se Task 7.
// Selve tilkoblingsstrengens rolle avgjøres av hvilken bruker
// DATABASE_URL/TIDUM_APP_DATABASE_URL faktisk peker på; denne filen endrer
// ikke tilkoblingsstrengen, kun hvordan requests får sin egen RLS-scopede
// tilkobling via withVendorScopedDb (server/middleware/vendor-scoped-db.ts).
const systemDb = drizzle(pool, { schema });
const systemPool = pool;

export const db: NodePgDatabase<typeof schema> = new Proxy(systemDb, {
  get(target, prop, receiver) {
    const ctx = requestDbStorage.getStore();
    const actual = ctx ? ctx.db : target;
    return Reflect.get(actual as object, prop, receiver);
  },
}) as NodePgDatabase<typeof schema>;

export const dbPool: Pool = new Proxy(systemPool, {
  get(target, prop, receiver) {
    const ctx = requestDbStorage.getStore();
    const actual = ctx ? ctx.client : target;
    return Reflect.get(actual as object, prop, receiver);
  },
}) as unknown as Pool;

export { systemPool as pool }; // rå system-tilkoblingen, brukt KUN til å opprette nye tidum_app-klienter (se middleware)
```

(`pool`-eksportens navn beholdes uendret for bakoverkompatibilitet med de ~15 filene som i dag importerer `pool` direkte for rå SQL — disse fortsetter på `tidum_system` frem til Task 9s klassifisering aktivt flytter dem, noe som er trygt: de var allerede unntatt kategori (a)/(b)/(c) i spec §5.6 for de fleste av disse tilfellene.)

- [ ] **Step 6: Opprett en egen `tidum_app`-pool og middlewaren i `server/middleware/vendor-scoped-db.ts`**

```ts
import type { Request, Response, NextFunction } from "express";
import pkg from "pg";
const { Pool } = pkg;
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";
import { requestDbStorage } from "../lib/request-db-context";
import { buildSslConfig } from "../db";
import type { AuthUser } from "../lib/auth-types";

// Egen pool, koblet som tidum_app (se Task 7) — ikke samme pool som
// tidum_system-tilkoblingen i server/db.ts. Tilkoblingsstrengen må peke på
// tidum_app-rollen; separat env-variabel TIDUM_APP_DATABASE_URL, faller
// tilbake til DATABASE_URL hvis ikke satt (samme vertsnavn, ulik rolle i
// selve connection-stringen — dette avklares ved faktisk utrulling, se
// Task 7s operasjonelle forbehold).
const appPool = new Pool({
  connectionString: process.env.TIDUM_APP_DATABASE_URL || process.env.DATABASE_URL,
  max: 20,
  ssl: buildSslConfig(),
});

export async function withVendorScopedDb(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return next(); // ingen etablert bruker ennå -> proxy faller til tidum_system
  const user = req.user as AuthUser;
  const client = await appPool.connect();
  let settled = false;
  const finish = async (commit: boolean) => {
    if (settled) return;
    settled = true;
    try {
      await client.query(commit ? "COMMIT" : "ROLLBACK");
    } finally {
      client.release();
    }
  };
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL app.vendor_id = $1", [user.vendorId ?? -1]);
    await client.query("SET LOCAL app.is_super_admin = $1", [
      user.role === "super_admin" ? "true" : "false",
    ]);
    const scopedDb = drizzle(client, { schema });
    res.on("finish", () => finish(true));
    res.on("close", () => finish(false));
    requestDbStorage.run({ db: scopedDb, client }, next);
  } catch (err) {
    await finish(false);
    next(err);
  }
}
```

- [ ] **Step 7: Monter middlewaren i `server/custom-auth.ts`**

Rett etter `app.use(resolveBearerUser);` (linje 323) — FØR CSRF-middlewaren fra Task 4 og FØR dev-mode-bypass-blokken fra Task 1, slik at `req.user` alltid er den endelige, autoritative verdien før RLS-konteksten settes:

```ts
import { withVendorScopedDb } from "./middleware/vendor-scoped-db";

// ... etter app.use(resolveBearerUser):
app.use(withVendorScopedDb);
```

- [ ] **Step 8: Kjør hele testpakken og build**

Run: `npx vitest run && npm run check && npm run build`
Expected: alle eksisterende tester fortsatt PASS (ingen regresjon fra Proxy-endringen i `db.ts` — Proxy videresender alle kall transparent til `systemDb` når ingen kontekst er satt, som er tilfellet for samtlige eksisterende, DB-berørende tester i denne sandboxen). `check`/`build` exit 0.

- [ ] **Step 9: Commit**

```bash
git add server/lib/request-db-context.ts server/db.ts server/middleware/vendor-scoped-db.ts server/custom-auth.ts client/src/test/server/request-db-context.test.ts
git commit -m "feat(security): add AsyncLocalStorage-scoped per-request DB transaction for RLS"
```

---

### Task 9: Klassifisering av alle 56 db/pool-konsumerende filer + kjente nødvendige unntak

**Files:**
- Create: `docs/security/rls-file-classification.md`
- Create: `scripts/audit-db-consumers.ts`
- Modify: `server/eid-auth.ts` (kjent nødvendig fiks — se steg 4)
- Modify: `server/buypass-auth.ts` (kjent nødvendig fiks — se steg 4; KUN hvis denne filen finnes på branchen planen kjøres fra — den kom inn via PR #12, som kan være merget til `main` innen denne oppgaven starter. Sjekk med `git log --oneline -- server/buypass-auth.ts` før du antar filen ikke finnes.)
- Test: `client/src/test/server/eid-auth-rls-exemption.test.ts`

**Interfaces:**
- Consumes: `requestDbStorage` fra Task 8.
- Produces: `docs/security/rls-file-classification.md` — den definitive, committede klassifiseringen som Task 10 leser før den slår på `FORCE ROW LEVEL SECURITY`.

**Hvorfor denne oppgaven ikke kunne skrives ferdig i planleggingsfasen:** to av de 56 filene bruker rå `pool.query(...)` med SQL-strenger i stedet for navngitte Drizzle-tabellobjekter (`server/lib/log-row-audit.ts`, `server/lib/timesheet-lock.ts`), noe et automatisk søk etter tabellnavn ikke fanger opp pålitelig — disse (og enhver fil med tilsvarende mønster) MÅ leses manuelt, ikke antas.

- [ ] **Step 1: Generer kandidatlisten på nytt (den kan ha endret seg siden spec ble skrevet)**

```bash
grep -rl "from ['\"].*\/db['\"]" server/ | grep -v "\.test\.\|database-config\|/db\.ts$" | sort > /tmp/db-consumers.txt
wc -l /tmp/db-consumers.txt
```

Sammenlign mot spec §5.1s liste på 56. Hvis tallet avviker: nye filer er lagt til siden spec ble skrevet (normalt over tid) — inkluder dem i klassifiseringen under, ikke ignorer avviket.

- [ ] **Step 2: Opprett `scripts/audit-db-consumers.ts` — det mekaniske første passet**

```ts
// scripts/audit-db-consumers.ts
//
// Første, mekaniske pass av klassifiseringen. Sjekker hver kandidatfil for
// (a) om den importerer noe fra server/lib/mobile-auth.ts, server/custom-auth.ts,
//     server/eid-auth.ts, server/replit_integrations/ (auth-infrastruktur-signal)
// (b) om filnavnet inneholder "cron", "seed", "migration" (bakgrunnsjobb-signal)
// (c) om den refererer til NOEN av de 20 vendor-scopede tabellnavnene
//     (companies, companyUsers, projectInfo, logRow, rapportTemplates,
//     vendorInstitutions, vendorIntegrations, imports, vendorSeatLog,
//     apiKeys, apiUsageLog, caseReports, feedbackRequests, feedbackResponses,
//     timesheetSubmissions, vendorInviteLinks, rapportAvvik,
//     vendorAvvikProtokoller, vendorTemplates, saker, users)
//
// Output er et FORSLAG, ikke en fasit — filer med rå pool.query(...) (ingen
// treff på (c) via navngitte tabellobjekter) merkes eksplisitt
// "MANUELL GJENNOMGANG PÅKREVD", ikke automatisk klassifisert som trygge.

import { readFileSync } from "fs";

const VENDOR_SCOPED_IDENTIFIERS = [
  "companies", "companyUsers", "projectInfo", "logRow", "rapportTemplates",
  "vendorInstitutions", "vendorIntegrations", "imports", "vendorSeatLog",
  "apiKeys", "apiUsageLog", "caseReports", "feedbackRequests",
  "feedbackResponses", "timesheetSubmissions", "vendorInviteLinks",
  "rapportAvvik", "vendorAvvikProtokoller", "vendorTemplates", "saker", "users",
];

const files = readFileSync("/tmp/db-consumers.txt", "utf8").trim().split("\n");

for (const file of files) {
  const content = readFileSync(file, "utf8");
  const usesPoolRaw = /\bpool\.query\(/.test(content);
  const touchesVendorTable = VENDOR_SCOPED_IDENTIFIERS.some((id) => new RegExp(`\\b${id}\\b`).test(content));
  const looksLikeAuthInfra = /mobile-auth|custom-auth|eid-auth|buypass-auth|replit_integrations\/auth/.test(file);
  const looksLikeBackgroundJob = /cron|seed|migration/.test(file);

  let verdict: string;
  if (usesPoolRaw && !touchesVendorTable) {
    verdict = "MANUELL GJENNOMGANG PÅKREVD (rå SQL, ingen navngitt tabell funnet)";
  } else if (looksLikeAuthInfra) {
    verdict = "FORVENTET: auth-infrastruktur (tidum_system)";
  } else if (looksLikeBackgroundJob) {
    verdict = "FORVENTET: bakgrunnsjobb (tidum_system, kjører aldri i request-kontekst)";
  } else if (!touchesVendorTable) {
    verdict = "FORVENTET: ingen vendor-scopet tabell (tidum_system er ufarlig, men RLS er uansett irrelevant)";
  } else {
    verdict = "FORVENTET: forretningslogikk mot vendor-scopet tabell (automatisk RLS-håndhevet, ingen kodeendring)";
  }

  console.log(`${file}\t${verdict}`);
}
```

Run: `npx tsx scripts/audit-db-consumers.ts > /tmp/db-consumers-classified.txt`

- [ ] **Step 3: Manuell gjennomgang — les HVER fil merket "MANUELL GJENNOMGANG PÅKREVD" i sin helhet**

For hver: les filen, avgjør hvilken av de fire kategoriene fra spec §5.6 den faktisk hører til ((a) pre-auth, (b) bakgrunnsjobb, (c) ingen vendor-tabell, (d) ekte forretningslogikk), og skriv begrunnelsen ned. To kjente eksempler fra planleggingen (bekreft disse selv, ikke bare kopier):

- `server/lib/log-row-audit.ts` — skriver til `company_audit_log`/`rapport_audit_log` via rå `pool.query`, tar `Request` som parameter, kalles fra autentiserte ruter. Dette ER en vendor-scopet skriving (audit-logg per vendor) — kategori (d), skal RLS-håndheves. Siden den bruker `pool` (ikke `db`), fungerer ALS-proxyen på `pool`-eksporten (Task 8 steg 5) automatisk — INGEN kodeendring nødvendig i selve filen, kun bekreftelse av at `company_audit_log`/`rapport_audit_log` faktisk er inkludert i policy-listen i Task 7 (de er IKKE i spec §5.6s 18-tabellers-liste — sjekk om de har en `vendor_id`-kolonne; hvis ja, legg dem til i Task 7s migrasjon FØR denne oppgaven avsluttes, som en oppfølgende migrasjonsfil `052b_...sql` eller en rettelse til `052_...sql` hvis Task 7 ikke er kjørt mot noen database ennå).
- `server/lib/timesheet-lock.ts` — samme rå-SQL-mønster, verifiser tilsvarende.

- [ ] **Step 4: Fiks den kjente, nødvendige unntaks-saken i eID-lenke-flytene**

`server/eid-auth.ts`s (og, hvis den finnes på denne branchen, `server/buypass-auth.ts`s) lenke-gren (`if (hasSessionAuth(req) && req.user) { ... }`) kaller `findConflictingEidUser(ssnHash, currentUser.id)` — en bevisst TVERS-VENDOR-spørring (sjekker om `ssn_hash` allerede er koblet til en ANNEN bruker, UANSETT hvilken vendor). Denne kjører INNI en autentisert request der `req.user` er satt — altså INNI `withVendorScopedDb`s ALS-kontekst. Med RLS aktiv ville denne spørringen feilaktig bli begrenset til KUN den innloggede brukerens egen vendor, og dermed ALDRI oppdage en konflikt i en annen vendor — nøyaktig den sikkerhetsegenskapen funksjonen finnes for å garantere (bygget og reviewet i Buypass-planen, se `.superpowers/sdd/2026-08-15-buypass-eid-innlogging/` hvis den fortsatt finnes, eller `server/eid-auth.ts`s kommentarer).

Fiks: kjør denne ene spørringen eksplisitt UTENFOR ALS-konteksten med `AsyncLocalStorage.exit()`:

```ts
// server/eid-auth.ts — i resolveUserByEidIdentity-nabolaget, ny import
import { requestDbStorage } from "./lib/request-db-context";

// I lenke-grenen, der findConflictingEidUser i dag kalles direkte:
const hasConflict = await requestDbStorage.exit(() => findConflictingEidUser(ssnHash, currentUser.id));
if (hasConflict) {
  return res.redirect("/?error=eid_already_linked");
}
```

`requestDbStorage.exit(callback)` kjører `callback` med IKKE-satt kontekst for varigheten av kallet — `db`-proxyen faller da tilbake til `tidum_system` (BYPASSRLS) nøyaktig for dette ene kallet, uten å påvirke resten av requesten (som fortsatt er RLS-scopet for alt annet). Gjenta samme fiks i `server/buypass-auth.ts` hvis filen finnes.

- [ ] **Step 5: Skriv en test som beviser denne konflikt-sjekken faktisk ser på tvers av kontekst**

```ts
// client/src/test/server/eid-auth-rls-exemption.test.ts
import { describe, it, expect, vi } from "vitest";
import { requestDbStorage } from "../../../../server/lib/request-db-context";

describe("findConflictingEidUser kjører utenfor ALS-konteksten", () => {
  it("requestDbStorage.exit() gjør konteksten tom for varigheten av kallet, deretter gjenopprettet", async () => {
    const fakeCtx = { db: { tag: "scoped" } as any, client: {} as any };
    await new Promise<void>((resolve) => {
      requestDbStorage.run(fakeCtx, () => {
        expect(requestDbStorage.getStore()).toBe(fakeCtx);
        requestDbStorage.exit(() => {
          expect(requestDbStorage.getStore()).toBeUndefined();
        });
        expect(requestDbStorage.getStore()).toBe(fakeCtx); // gjenopprettet etter exit()
        resolve();
      });
    });
  });
});
```

Run: `npx vitest run client/src/test/server/eid-auth-rls-exemption.test.ts`
Expected: PASS — dette tester selve ALS-mekanismens `.exit()`-oppførsel (den delen som er reelt testbar i denne sandboxen uten en ekte database); den fulle end-to-end-oppførselen til `findConflictingEidUser` under RLS kan først verifiseres mot en ekte Postgres med policyene faktisk aktive (Task 7 kjørt).

- [ ] **Step 6: Skriv den endelige klassifiseringen**

```markdown
<!-- docs/security/rls-file-classification.md -->
# RLS-klassifisering av db/pool-konsumerende filer

Generert/verifisert: [DATO]. Se Task 9 i docs/superpowers/plans/2026-08-15-g10-sikkerhetsherding.md.

Med AsyncLocalStorage-proxyen (Task 8) trenger de FLESTE filene under INGEN
kodeendring — klassifiseringen avgjør kun om filen FORVENTES å kjøre inni
eller utenfor withVendorScopedDb sin ALS-kontekst, og om det stemmer.

| Fil | Kategori | Begrunnelse |
|---|---|---|
| [full liste, én rad per fil fra steg 1s kandidatliste] | (a)/(b)/(c)/(d) | ... |

## Kjente, bevisste unntak (krevde faktisk kodeendring)

- `server/eid-auth.ts` (og `server/buypass-auth.ts` hvis til stede): `findConflictingEidUser`-kallet i lenke-grenen kjører via `requestDbStorage.exit()` — se Task 9 steg 4. Dette er det ENESTE stedet i hele kodebasen der en fil BÅDE kjører inni ALS-konteksten (fordi `req.user` er satt) OG trenger tvers-vendor-tilgang for én spesifikk spørring.

## Nye vendor-scopede tabeller oppdaget under gjennomgang (ikke i spec §5.6s opprinnelige 20)

[Fylles ut kun hvis steg 3 fant noe, f.eks. company_audit_log/rapport_audit_log — legg dem til Task 7s policy-liste hvis Task 7 ikke er utrullet mot en ekte database ennå, ellers som egen oppfølgende migrasjon.]
```

Fyll denne ut fullstendig basert på steg 1-4s faktiske funn — dette er selve leveransen til denne oppgaven, ikke et forslag.

- [ ] **Step 7: Kjør full testpakke**

Run: `npx vitest run && npm run check && npm run build`
Expected: alle PASS/exit 0.

- [ ] **Step 8: Commit**

```bash
git add docs/security/rls-file-classification.md scripts/audit-db-consumers.ts server/eid-auth.ts client/src/test/server/eid-auth-rls-exemption.test.ts
# legg til server/buypass-auth.ts her hvis den ble endret i steg 4
git commit -m "docs(security): classify all RLS-relevant files, fix cross-vendor eID conflict check"
```

---

### Task 10: Slå på FORCE ROW LEVEL SECURITY + minste privilegium

**Files:**
- Create: migration `054_force_rls.sql`
- Modify: Task 7s migrasjon-tilnærming (denne oppgaven er en OPPFØLGENDE migrasjon, ikke en endring av `052_...sql` i ettertid — migrasjoner er append-only)

**Interfaces:** ingen nye — dette er cutover-bryteren.

**Forutsetning, ufravikelig:** Task 9s `docs/security/rls-file-classification.md` må vise INGEN gjenstående "MANUELL GJENNOMGANG PÅKREVD"-rader, og alle kjente unntak (Task 9 steg 4) må være committet og verifisert. Ikke start denne oppgaven hvis Task 9 ikke er fullført.

- [ ] **Step 1: Verifiser Task 9s status på nytt**

```bash
grep "MANUELL GJENNOMGANG" docs/security/rls-file-classification.md
```

Expected: ingen treff. Hvis det finnes treff: STOPP, fullfør Task 9 først.

- [ ] **Step 2: Skriv migrasjonen**

```sql
-- migrations/054_force_rls.sql
--
-- Cutover: slår på FORCE ROW LEVEL SECURITY på alle 20 vendor-scopede
-- tabeller (og eventuelle nye oppdaget i Task 9, f.eks. audit-loggene).
-- Forutsetter: docs/security/rls-file-classification.md er komplett og
-- verifisert (Task 9), withVendorScopedDb er utrullet og stabil i
-- produksjon i minst [X dager — sett en reell verdi ved faktisk utrulling,
-- ikke skrevet her siden den avhenger av når Task 8 faktisk deployes].
--
-- MANUELL KJØRING KAN VÆRE PÅKREVD — samme forbehold som migrasjon 052.

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'companies', 'company_users', 'project_info', 'log_row', 'rapport_templates',
    'vendor_institutions', 'vendor_integrations', 'imports', 'vendor_seat_log',
    'api_keys', 'api_usage_log', 'case_reports', 'feedback_requests',
    'feedback_responses', 'timesheet_submissions', 'vendor_invite_links',
    'rapport_avvik', 'vendor_avvik_protokoller', 'vendor_templates', 'saker', 'users'
    -- legg til her enhver ekstra tabell Task 9 oppdaget (f.eks. company_audit_log)
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END
$$;

-- Minste privilegium: tidum_system trengte bred lesetilgang som
-- sikkerhetsnett under overgangen (migrasjon 052). Nå som FORCE er aktivt
-- og alt forretningslogikk-arbeid går via tidum_app, strammes tidum_system
-- inn til kun det auth-oppslag/cron faktisk bruker. Denne listen bekreftes
-- mot den faktiske bruken i docs/security/rls-file-classification.md
-- FØR denne delen kjøres — ikke kjør blindt.
-- REVOKE-setningene skrives ut i egen, separat migrasjon (055) ETTER at
-- Task 9s klassifisering har vært i produksjon minst én uke uten
-- feilmeldinger om manglende tilgang, slik at en for streng innstramming
-- oppdages og rulles tilbake trygt før den blir permanent antatt korrekt.
```

- [ ] **Step 3: Kjør migrasjonen mot staging/produksjon (manuell verifikasjon, samme forbehold som Task 7)**

Ikke automatiserbart i denne sandboxen. Etter kjøring mot et ekte miljø: kjør et sanity-smoke-test-sett manuelt (logg inn som to ulike vendors sine brukere, bekreft at hver kun ser sine egne saker/tidsregistreringer/etc., bekreft at super_admin ser på tvers, bekreft at innlogging/lenking av BankID og Buypass fortsatt fungerer).

- [ ] **Step 4: Commit**

```bash
git add migrations/054_force_rls.sql
git commit -m "feat(security): enable FORCE ROW LEVEL SECURITY — RLS cutover complete"
```

- [ ] **Step 5: Oppdater spec-dokumentet med faktisk utrullingsdato**

Legg til én linje øverst i `docs/superpowers/specs/2026-08-15-g10-sikkerhetsherding-design.md`s Status-felt: `**RLS cutover fullført:** [dato]`. Commit denne som en egen, liten commit.

---

## Selvgjennomgang (utført under planleggingen, ikke en gjenstående oppgave)

- **Spec-dekning:** §3 (A1-A3) → Task 1-3. §4 (B) → Task 4. §5 (C) → Task 7-10. §6 (D) → Task 5. §7 (E) → Task 6. Alle spec-seksjoner har en task.
- **Placeholder-skann:** ingen "TBD"/"TODO" i planen. Task 9s klassifiseringstabell er bevisst tom i PLANEN (fylles av oppgaven selv, som er dens leveranse) — dette er ikke en placeholder i forbudt forstand, siden steg 1-6 gir en fullstendig, kjørbar prosedyre for å fylle den, ikke en vag instruks.
- **Typekonsistens:** `requestDbStorage`/`RequestDbContext` (Task 8) brukes identisk i Task 9. `requireAuthJwtSecret`/`requireEmailLoginSecret` (Task 2) navngitt konsistent med `requireDatabaseConnectionString`/`requireSecret`-mønsteret som allerede fantes i kodebasen. `encryptSecret`/`decryptSecret`/`isEncryptedSecret` (Task 5) gjenbrukt uendret av Task 6 (`encryptTotpSecret`-alias).
