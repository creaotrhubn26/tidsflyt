# Tidum Native iOS/iPadOS App — Fase 1 Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to turn this spec into an implementation plan, then superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement it task-by-task.

**Mål:** Bygge en fullstendig nativ SwiftUI-app for iPhone/iPad som dekker miljøarbeider-hverdagen i Tidum (dashboard, timeføring, klientsaker, rapportskriving), med BankID/Google-innlogging og Face ID, distribuert via TestFlight. Dette er fase 1 av en flerfaset plan mot full paritet med web-appen (71 ruter/60 sider) — senere faser dekker godkjenning/tiltaksleder-flyt og admin/leverandør-sider, hver med egen spec.

**Arkitektur:** Native SwiftUI-app (iOS/iPadOS 17+) i egen mappe i samme repo, MVVM med `@Observable`-ViewModels og Swift Concurrency — ingen Combine, ingen tredjeparts state-bibliotek. Appen snakker med den eksisterende Express-backenden over dagens JSON-REST-kontrakt, uendret for alle forretningsruter. Eneste backend-endring: en ny auth-vei (JWT via Bearer-header) som lever side om side med dagens sesjons-cookie-auth for web, pluss ett nytt endepunkt-sett for mobil-token-utstedelse.

**Tech Stack:** Swift 6, SwiftUI, Swift Concurrency (async/await), Swift Testing (ikke XCTest), `LocalAuthentication` (Face ID/Touch ID), `AuthenticationServices` (`ASWebAuthenticationSession`), Keychain Services. Backend: Express (eksisterende), `jsonwebtoken` (ny avhengighet, samme mønster som resten av Node-økosystemet i repoet).

**Spec:** Dette dokumentet. Bygger videre på den nylig fikset BankID/Idura-integrasjonen dokumentert i `2026-08-14-bankid-eid-innlogging-design.md` — samme Idura-klient og Google OAuth-klient gjenbrukes uendret, kun en ny callback-vei legges til for mobil.

## Global Constraints

- Minimum iOS/iPadOS-versjon: **17.0** (påkrevd for `@Observable`-makroen).
- Ingen ny UI-avhengighet (ingen tredjeparts nettverks-/state-bibliotek) — kun Apples egne rammeverk.
- Alle 71 eksisterende `/api/*`-ruter forblir funksjonelt uendret. Kun auth-middlewaren utvides til å akseptere to legitimasjonsformer.
- Access-token og refresh-token lagres **kun** i Keychain, aldri UserDefaults eller på disk i klartekst.
- Ingen lokal offline-database eller sync-motor i fase 1 (online-only, jf. bekreftet designvalg).
- Distribusjon: TestFlight/intern enterprise, ikke offentlig App Store i fase 1.
- Fase 1 dekker KUN: innlogging (BankID + Google), dashboard, timeføring, klientsaker, rapportskriving, profil. Godkjenning/tiltaksleder-visning, admin-sider og leverandør-sider er eksplisitt utenfor omfang — egne spec-er senere.

---

## 1. Bakgrunn og omfang

Tidum er i dag en Vite/React-webapp (Netlify) mot en Express-backend (Render), med Passport-sesjonscookies og BankID (Idura)/Google OAuth. Appen har 71 ruter/60 sider på tvers av roller (miljøarbeider, tiltaksleder, admin, super_admin). En full nativ speiling av alt dette i én omgang er for stort til å spesifisere og bygge trygt i én runde — derfor er dette dokumentet avgrenset til **fase 1: miljøarbeider-hverdagen**, den daglig mest brukte og enkleste rollen, som samtidig validerer hele auth- og API-arkitekturen resten av appen bygger videre på.

**Fase 1 leverer:**
- Innlogging med BankID og Google, inkl. Face ID-lås av påfølgende sesjoner.
- Dashboard (dagens/ukens oversikt, "neste handling"-kort).
- Timeføring (start/stopp-klokke, ukeoversikt, manuell registrering).
- Klientsaker (liste over tildelte saker + sakdetalj).
- Rapportskriving (fra klientsak, tekstbasert innsending).
- Profil (brukerinfo, Face ID av/på, BankID-koblingsstatus, logg ut).

**Eksplisitt utenfor fase 1:** godkjenningsflyt for tiltaksledere, admin/CMS/leverandør-sider, AI-forslag (`time-entries/suggestions`, `case-reports/suggestions`), push-varsler, offline-modus.

## 2. Backend-endringer

### 2.1 Ny auth-middleware: `isAuthenticatedOrBearer`

I `server/custom-auth.ts`, ved siden av eksisterende `isAuthenticated`:

```typescript
export const isAuthenticatedOrBearer: RequestHandler = async (req, res, next) => {
  if (isDev) return next();

  const authHeader = req.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length);
    try {
      const payload = jwt.verify(token, process.env.MOBILE_JWT_SECRET!) as { sub: string };
      const [user] = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
      if (!user) return res.status(401).json({ message: "Ikke autentisert" });
      req.user = toAuthUser(user);
      return next();
    } catch {
      return res.status(401).json({ message: "Ugyldig eller utløpt token" });
    }
  }

  if (req.isAuthenticated() && req.user) {
    return next();
  }
  res.status(401).json({ message: "Ikke autentisert" });
};
```

Fase 1s ruter (`/api/auth/user`, `/api/profile`, `/api/stats`, `/api/time-entries*`, `/api/worker/summary`, `/api/company/me/assigned-cases`, `/api/case-reports*`, `/api/time-tracking/*`) bytter fra `isAuthenticated` til `isAuthenticatedOrBearer`. Alle andre ruter forblir uendret (kun sesjonscookie), siden fase 1 ikke rører dem fra mobil.

### 2.2 Nytt mobil-callback for Idura/BankID

I `server/eid-auth.ts`: en tredje rute, `IDURA_MOBILE_CALLBACK_PATH = "/api/auth/idura/callback-mobile"`, som deler `handleIduraCallback`-logikken frem til punktet der web-varianten kaller `req.logIn()` / `res.redirect("/dashboard")`. Mobil-varianten:

1. Kjører samme fnr-oppslag/`resolveUserByEidIdentity` som i dag.
2. Ved treff: utsteder access+refresh-token (se 2.4) i stedet for `req.logIn()`.
3. Redirecter til `tidum://auth-callback?access_token=...&refresh_token=...` i stedet for `/dashboard`.
4. Feilstier (`eid_not_linked`, `eid_missing_ssn` osv.) redirecter til `tidum://auth-callback?error=...` med samme feilkoder som web bruker i dag.

`ASWebAuthenticationSession` trigges mot **eksisterende** `IDURA_LOGIN_PATH`, med `callbackURLScheme: "tidum"` — Idura-klientens registrerte redirect_uri-liste utvides med denne mobile callback-URL-en (samme mønster som da `tidum-backend.onrender.com` ble lagt til tidligere i denne økten).

### 2.3 Nytt mobil-callback for Google

Tilsvarende: `GET /api/auth/google/callback-mobile`, delt Passport-strategi-logikk med web-varianten, men utsteder token+redirect til `tidum://auth-callback` i stedet for `req.logIn()`+web-redirect. Google Cloud Console-klienten (samme "CreatorHub"-klient som web bruker) får denne URL-en lagt til i Authorized redirect URIs.

### 2.4 Token-utstedelse og refresh

Callback-rutene i 2.2/2.3 utsteder access+refresh-token direkte i redirect-URL-en til `tidum://auth-callback` — ingen separat token-exchange-kall trengs for førstegangsinnlogging. Det eneste nye token-endepunktet er refresh:

```
POST /api/auth/mobile/refresh
  Body: { refreshToken: string }
  → { accessToken: string, expiresIn: number }
  → 401 hvis refresh-token er utløpt/tilbakekalt — appen logger da ut lokalt.
```

Access-token: JWT, 1 times levetid, `sub` = `users.id`, signert med `MOBILE_JWT_SECRET` (ny env-var, generert samme måte som `EID_SSN_HASH_PEPPER` tidligere i denne økten). Refresh-token: opaque random token (ikke JWT), 30 dagers levetid, lagret hashet i en ny tabell `mobile_refresh_tokens (id, user_id, token_hash, expires_at, created_at, revoked_at)` — slik at et tapt/stjålet token kan tilbakekalles uten å rotere hemmeligheten for alle brukere.

### 2.5 Datamodell-tillegg

Én ny migrasjon: `mobile_refresh_tokens`-tabellen over. Ingen endring i eksisterende tabeller.

## 3. iOS-app-struktur

```
ios/Tidum/
  Tidum.xcodeproj
  Tidum/
    App/              — TidumApp.swift (entry), AppState (@Observable, innlogget-status)
    Auth/              — AuthSession (ASWebAuthenticationSession-wrapper), KeychainStore, BiometricLock
    Networking/        — APIClient (actor), Endpoint-definisjoner, DTO-er (speiler backend-JSON)
    Features/
      Dashboard/
      TimeTracking/
      Cases/
      CaseReports/
      Profile/
    Shared/            — design-tokens (farger/typografi speiler web sin Tailwind-config), gjenbrukbare views
  TidumTests/          — Swift Testing, ViewModel + APIClient-tester mot mocket URLProtocol
  TidumUITests/        — XCUITest, kun kritisk-sti-flyten
```

**Navigasjon:** `TabView` med 4 faner (Dashboard, Timeføring, Klientsaker, Profil), hver med egen `NavigationStack`. Rapportskriving nås via push fra en klientsak, ikke egen fane.

**AppState** (`@Observable`, injisert via `@Environment`) holder innlogget bruker + auth-status (`loggedOut` / `locked` (bak Face ID) / `unlocked`), og styrer rot-view: innloggingsskjerm, Face ID-lås-skjerm, eller `TabView`.

## 4. Auth-flyt i detalj

1. **Første innlogging:** Innloggingsskjerm med "Logg inn med BankID" / "Logg inn med Google". Trykk åpner `ASWebAuthenticationSession` mot backendens eksisterende `/api/auth/idura/login` hhv. `/api/auth/google`, med `callbackURLScheme: "tidum"`.
2. Bruker fullfører BankID/Google i systemets innebygde nettleser-sheet (samme flyt som web, isolert cookie-sesjon — påvirker ikke appens egen `URLSession`).
3. Backendens mobil-callback (2.2/2.3) redirecter til `tidum://auth-callback?access_token=...&refresh_token=...&user=...`. `ASWebAuthenticationSession` fanger denne URL-en og lukker seg selv — **ingen egen URL-scheme-handler i appens `Info.plist` kreves** utover det ASWebAuthenticationSession selv bruker.
4. `AuthSession` parser tokenene, lagrer i Keychain via `KeychainStore` (med `kSecAttrAccessControl` biometry-gate på refresh-token), setter `AppState` til `unlocked`.
5. **Påfølgende appstart:** `AppState` finner token i Keychain → viser Face ID-lås-skjerm → `LAContext.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics)` → suksess henter token ut og setter `unlocked`; feil/avbrutt → tilbake til innloggingsskjerm (BankID/Google på nytt) eller "prøv Face ID igjen".
6. **Access-token utløper (1t):** `APIClient` fanger 401, kaller `/api/auth/mobile/refresh` automatisk, replayer det opprinnelige kallet. Refresh feiler → logg ut, tilbake til innloggingsskjerm.
7. **BankID-kobling til eksisterende konto** (link-flyten): samme skjerm/knapp som web sin `/logg-inn/koble-bankid`, samme `ASWebAuthenticationSession`-mønster mot `IDURA_LOGIN_PATH` — trigges når `req.user` (via Bearer-token) allerede er satt server-side, akkurat som web-varianten skiller link vs. login på `req.isAuthenticated()`.

## 5. Data flow / API-kontrakt

`APIClient` er en `actor` som wrapper `URLSession`, injiserer `Authorization: Bearer <accessToken>` på hvert kall, og håndterer 401→refresh→retry automatisk (étt sted, ikke per-ViewModel). DTO-er speiler eksisterende JSON-respons fra:

- `GET /api/auth/user`, `GET /api/profile` — brukerinfo (profil-fane).
- `GET /api/stats` — dashboard-tall (samme datakilde som web, nylig ryddet for "godkjenning venter"-feilen).
- `GET /api/worker/summary` — miljøarbeiders dag/uke-sammendrag.
- `GET /api/time-entries`, `POST /api/time-entries`, `PATCH /api/time-entries/:id`, `DELETE /api/time-entries/:id` — timeføring.
- `GET /api/time-tracking/work-types` — arbeidstype-liste for timer-registrering.
- `GET /api/company/me/assigned-cases` — klientsak-liste.
- `POST /api/case-reports`, tilhørende GET for sakdetalj/historikk — rapportskriving.
- `GET /api/auth/eid/status` — BankID-koblingsstatus (profil-fane).

Ingen av disse endepunktene endrer skjema — kun auth-middlewaren foran dem endres (2.1). DTO-feltnavn hentes 1:1 fra faktisk backend-respons ved implementeringstidspunktet (task-nivå i planen), ikke gjettet her.

## 6. Feilhåndtering

- **Nettverksfeil (ingen dekning):** `APIClient` returnerer en typed `NetworkError`-enum (`.offline`, `.timeout`, `.serverError(Int)`, `.decoding`). UI viser et fast banner ("Ingen nettforbindelse") fremfor stille feil eller krasj.
- **Retry:** automatisk for GET-kall (idempotente), eksponentiell backoff, maks 3 forsøk. POST/PATCH/DELETE retries **ikke** automatisk (unngå duplikate innsendinger) — feil vises med manuell "Prøv igjen"-knapp.
- **Optimistisk UI:** kun timer start/stopp (lokal klokke går umiddelbart, synces mot `/api/time-entries` i bakgrunnen; feiler synk → varsel + mulighet til å prøve på nytt uten å miste den lokale registreringen).
- **401 håndtering:** beskrevet i 4.6 — automatisk refresh, deretter utlogging.
- **Feilkoder fra BankID-flyten** (`eid_not_linked`, `eid_missing_ssn`, `eid_already_linked`, `eid_failed`): samme koder som web, vist som norske feilmeldinger i innloggingsskjermen — ingen ny feilkode-liste å vedlikeholde separat fra web.

## 7. Testing

- **Swift Testing** (ikke XCTest) for ViewModels og `APIClient` — sistnevnte mot en mocket `URLProtocol` som simulerer backend-responser inkl. 401→refresh-sekvensen.
- **XCUITest**, ett scenario: logg inn (BankID test-bruker) → start timer → stopp timer → skriv og send inn rapport → logg ut. Ikke skjerm-for-skjerm-dekning i fase 1.
- **Backend:** `isAuthenticatedOrBearer`, `/api/auth/mobile/token`, `/api/auth/mobile/refresh` får vitest-dekning i samme stil som eksisterende `server/**/*.test.ts`.
- **Bygg/CI:** `xcodebuild test -scheme Tidum -destination 'platform=iOS Simulator,name=iPhone 16'` kjørbart fra terminal uten Xcode-GUI.

## 8. Distribusjon

TestFlight via App Store Connect (internal/enterprise-gruppe, ikke offentlig utgivelse i fase 1). Krever et Apple Developer-konto-medlemskap (antatt allerede tilgjengelig eller anskaffes separat — ikke en del av denne spec-en) og et signerings-sertifikat/provisioning-profil satt opp i Xcode.

## 9. Senere faser (kun til orientering, ikke spesifisert her)

- **Fase 2:** Godkjenning/tiltaksleder-flyt (rapportgodkjenning, "Godkjenn nå"-affordances — nå korrekt datakildet på web etter dagens opprydning).
- **Fase 3:** Admin/leverandør/CMS-sider.
- **Senere, om behov viser seg:** offline-first m/ lokal SwiftData-database og sync-motor, push-varsler (APNs) for godkjenning/nye tildelinger, AI-forslag (`suggestions`-endepunktene).

Hver fase får egen spec + implementeringsplan når den startes.
