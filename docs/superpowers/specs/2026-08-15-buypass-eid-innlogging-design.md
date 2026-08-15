# Buypass eID-innlogging — Design

**Mål:** Legge til Buypass som en egen, uavhengig eID-innloggingsmetode i Tidum — i tillegg til, ikke i stedet for, den eksisterende Idura/BankID-integrasjonen — for både web og den native iOS-appen, med kontobinding som gjenkjenner samme fysiske person uansett hvilken av de to metodene de bruker.

**Bakgrunn:** Buypass ble fjernet fra kodebasen under pivoten fra Signicat til Idura tidligere denne økten, fordi Idura (Criipto) ikke støtter Buypass. Buypass tilbyr egen, direkte OIDC-integrasjon (ikke via en tredjeparts-broker), dokumentert i Buypass Developer Space. Detaljene under er hentet direkte fra Buypass' offentlige dokumentasjon (https://buypassdev.atlassian.net/wiki/spaces/DEVSPACE/), ikke antatt.

## Kjente fakta (fra Buypass' dokumentasjon)

- **Test-issuer:** `https://auth.test.buypass.no/auth/realms/SECURITYDOMAIN`
- **Produksjon-issuer:** `https://auth.buypass.no/auth/realms/SECURITYDOMAIN`
- `SECURITYDOMAIN` = realm-navn, gitt ut-of-band når man blir Buypass-kunde. Issueren følger et standard OIDC discovery-dokument (`{issuer}/.well-known/openid-configuration`) — ingen manuell endepunkt-konfigurasjon nødvendig utover selve issuer-URLen.
- Keycloak-basert identity provider. Authorization Code Flow er anbefalt flyt (Implicit støttes også, men brukes ikke).
- Standard scopes bekreftet: `openid`, `offline_access`.
- **Ukjent, kun avklarbart med ekte kundeavtale:** navnet på claimen som bærer fødselsnummer. Standard `claims_supported`-listen i den offentlige dokumentasjonen viser kun `sub, iss, auth_time, name, given_name, family_name, preferred_username, email` — ingen dedikert fnr-claim er offentlig dokumentert. Realm-spesifikk claim-mapping er sannsynlig. Håndteres via konfigurerbar env-var (se §2.1).

## Global Constraints

- Ingen ny npm-avhengighet for backend — `openid-client` (`^6.8.1`) er allerede installert (sannsynlig rest fra Signicat-æraen) og brukes til Buypass-integrasjonen. Bruker pakkens funksjonelle v6-API (`discovery`, `buildAuthorizationUrl`, `authorizationCodeGrant` osv.), verifisert direkte mot `node_modules/openid-client/build/index.d.ts` — ikke antatt fra eldre v5-dokumentasjon.
- `hashSsn()` fra `server/lib/eid-hash.ts` gjenbrukes uendret for Buypass — samme `EID_SSN_HASH_PEPPER`-hemmelighet, samme HMAC-SHA256, slik at samme fysiske person alltid gir samme `ssn_hash` uansett provider.
- Web: full link+login-gren (identisk mønster som BankID). Mobil: kun frittstående innlogging — kobling til allerede innlogget mobilsesjon er utenfor omfang (samme grense som ble satt for BankID-mobil, av samme grunn: `ASWebAuthenticationSession` kan ikke bære en Bearer-header på sin første, nettleserstyrte navigasjon).
- Fødselsnummer lagres aldri i klartekst — kun `ssn_hash`, samme som BankID.
- Opprett ALDRI ny bruker fra en Buypass-innlogging — kun kobling/gjenkjenning mot eksisterende `users`-rader, samme regel som gjelder for BankID gjennom hele dette prosjektet.

## 1. Kontobinding — provider-uavhengig gjenkjenning

**Endring i `server/eid-auth.ts`:** `resolveUserByEidIdentity(ssnHash)` sin SQL-spørring fjerner `AND eq(eidIdentities.provider, "bankid")`-filteret:

```typescript
// Før:
.where(and(eq(eidIdentities.provider, "bankid"), eq(eidIdentities.ssnHash, ssnHash)))

// Etter:
.where(eq(eidIdentities.ssnHash, ssnHash))
```

Dette betyr: en bruker som kun har koblet BankID kan logge inn med Buypass umiddelbart (og omvendt) — så lenge fnr-hashen matcher en eksisterende rad i `eid_identities`, uansett hvilken `provider`-verdi den raden har. Ingen separat "koble Buypass"-steg er nødvendig i tillegg til "koble BankID", eller omvendt.

`upsertEidIdentity` (kalt fra LINK-grenen) fortsetter å skrive den faktiske provideren som ble brukt (`"buypass"` eller `"bankid"`) — audit-sporet i `auth_login_events` vet fortsatt nøyaktig hvilken metode som ble brukt ved hvert innloggingsforsøk, selv om GJENKJENNING nå er provider-uavhengig. `eid_identities`' eksisterende unike indeks (`[userId, provider]` og `[ssnHash, provider]`, fra migrasjon 050) er allerede riktig utformet for dette — en person kan ha to rader (én per provider), begge med samme `ssn_hash`.

Denne endringen er bakoverkompatibel: siden kun `"bankid"` finnes som provider i produksjon i dag, gir det fjernede filteret identisk resultat som før inntil Buypass faktisk finnes som en andre provider.

## 2. Backend — `server/buypass-auth.ts`

Ny fil, strukturelt speilet av `eid-auth.ts`, men med `openid-client` i stedet for `@criipto/verify-express` (som er Criipto-spesifikk og ikke passer mot en generisk Keycloak-OIDC-provider som Buypass).

### 2.1 Konfigurasjon

```typescript
const BUYPASS_ISSUER_URL = process.env.BUYPASS_ISSUER_URL; // f.eks. https://auth.test.buypass.no/auth/realms/tidum
const BUYPASS_CLIENT_ID = process.env.BUYPASS_CLIENT_ID;
const BUYPASS_CLIENT_SECRET = process.env.BUYPASS_CLIENT_SECRET;
// Ukjent før ekte realm-tilgang (se "Kjente fakta" over) — konfigurerbar, ikke hardkodet
// slik IDURA_SSN_CLAIM_KEY = "socialno" er for Idura.
const BUYPASS_SSN_CLAIM_KEY = process.env.BUYPASS_SSN_CLAIM_KEY || "national_identity_number";
```

Samme "manglende credentials deaktiverer kun denne innloggingsmetoden"-filosofi som Idura- og Google-oppsettet: hvis `BUYPASS_ISSUER_URL`/`BUYPASS_CLIENT_ID`/`BUYPASS_CLIENT_SECRET` ikke er satt, logger `setupBuypassAuth` en advarsel og returnerer tidlig — resten av appen (Idura, Google, e-post) fortsetter uendret.

### 2.2 OIDC-oppsett (én gang ved oppstart)

```typescript
import { discovery, buildAuthorizationUrl, authorizationCodeGrant, randomState, randomPKCECodeVerifier, calculatePKCECodeChallenge } from "openid-client";

export async function setupBuypassAuth(app: Express): Promise<void> {
  if (!process.env.EID_SSN_HASH_PEPPER) {
    console.warn("[buypass] EID_SSN_HASH_PEPPER er ikke satt — Buypass er deaktivert");
    return;
  }
  if (!BUYPASS_ISSUER_URL || !BUYPASS_CLIENT_ID || !BUYPASS_CLIENT_SECRET) {
    console.warn("[buypass] BUYPASS_ISSUER_URL/BUYPASS_CLIENT_ID/BUYPASS_CLIENT_SECRET er ikke konfigurert — Buypass er deaktivert");
    return;
  }

  const config = await discovery(
    new URL(BUYPASS_ISSUER_URL),
    BUYPASS_CLIENT_ID,
    { client_secret: BUYPASS_CLIENT_SECRET },
  );

  // ... ruter registreres her, se §2.3
}
```

`discovery()` henter og cacher OIDC-metadata (`authorization_endpoint`, `token_endpoint`, `jwks_uri` osv.) automatisk fra issuer-URLens `.well-known/openid-configuration` — ingen manuell endepunkt-konfigurasjon.

### 2.3 Web-ruter — trigger, callback, status

Samme to-rute-mønster som Idura (unngår enhver risiko for en `returnTo`-parameter-kollisjon slik den som ble funnet og fikset for Idura tidligere denne økten):

```typescript
const BUYPASS_LOGIN_PATH = "/api/auth/buypass/login";
const BUYPASS_CALLBACK_PATH = "/api/auth/buypass/callback";

app.get(BUYPASS_LOGIN_PATH, async (req, res, next) => {
  try {
    const state = randomState();
    const codeVerifier = randomPKCECodeVerifier();
    const codeChallenge = await calculatePKCECodeChallenge(codeVerifier);
    req.session.buypassState = state;
    req.session.buypassCodeVerifier = codeVerifier;

    const redirectUri = `${getAppBaseUrl()}${BUYPASS_CALLBACK_PATH}`;
    const authUrl = buildAuthorizationUrl(config, {
      redirect_uri: redirectUri,
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

app.get(BUYPASS_CALLBACK_PATH, async (req, res, next) => {
  try {
    const expectedState = req.session.buypassState as string | undefined;
    const pkceCodeVerifier = req.session.buypassCodeVerifier as string | undefined;
    if (!expectedState || !pkceCodeVerifier) {
      return res.redirect("/?error=eid_failed");
    }

    const currentUrl = new URL(req.originalUrl, getAppBaseUrl());
    const tokens = await authorizationCodeGrant(config, currentUrl, {
      expectedState,
      pkceCodeVerifier,
    });
    const claims = tokens.claims();
    if (!claims) return res.redirect("/?error=eid_failed");

    const fnr = claims[BUYPASS_SSN_CLAIM_KEY];
    if (typeof fnr !== "string" || !fnr) {
      await logAuthEvent({ userId: null, sessionId: null, ipAddress: req.ip, userAgent: req.get("user-agent") || undefined, provider: "buypass" });
      return res.redirect("/?error=eid_missing_ssn");
    }

    const ssnHash = hashSsn(fnr);
    // ... resten identisk til handleIduraCallback: link-gren hvis hasSessionAuth(req),
    // ellers login-gren via resolveUserByEidIdentity(ssnHash) (nå provider-uavhengig, §1)
  } catch (err) {
    next(err);
  }
});
```

`getAppBaseUrl()` (samme delte hjelpefunksjon som Google og Idura bruker) sikrer at `redirect_uri` alltid er en absolutt URL basert på `APP_BASE_URL`/produksjons-fallback — **ikke** utledet fra `req.get('host')`, som var rot-årsaken til den nylig fiksede sesjonstap-buggen i Idura-integrasjonen bak Netlify-proxyen. Buypass arver denne fiksen fra starten, gjetter den aldri feil.

`logAuthEvent`/`upsertEidIdentity`-hjelperne i `eid-auth.ts` hardkoder i dag `provider: "bankid"` — disse generaliseres til å ta `provider` som parameter, brukt av både Idura- og Buypass-callbacken (delt fil, ikke duplisert logikk).

`GET /api/auth/eid/status` (allerede provider-agnostisk i dag — kaller `hasLinkedEid(user.id)`, som sjekker om NOEN rad finnes for brukeren) endres ikke.

### 2.4 Mobil-ruter

Samme mønster som Idura fikk (`/login-mobile`, `/callback-mobile`, egen `redirectUri` siden verken Criipto- eller openid-client-biblioteket støtter callbackURL-override per request på samme måte som passport-oauth2 gjorde for Google — hver mobil-variant får sin egen konfigurasjon), redirect til `tidum://auth-callback` med JWT fra `issueMobileTokens()` (gjenbrukt uendret fra `server/lib/mobile-auth.ts`) i stedet for `req.logIn()`. Kun frittstående innlogging, ingen link-gren (§ Global Constraints).

## 3. Frontend

### 3.1 Web

`client/src/lib/auth-utils.ts`: ny konstant `BUYPASS_LOGIN_URL = "/api/auth/buypass/login"`, samme mønster som `IDURA_LOGIN_URL`.

`client/src/pages/landing.tsx`: den deaktiverte "Buypass (Kommer snart)"-knappen (lagt til tidligere denne økten) erstattes med en fungerende knapp, identisk struktur som BankID-knappen ved siden av:

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

`client/src/pages/koble-bankid.tsx` (eller en generalisert "koble eID"-side, gitt at den nå dekker to metoder — navnevalg avklares i implementeringsplanen) får tilsvarende en Buypass-kobling-knapp ved siden av BankID.

### 3.2 iOS

`ios/Tidum/Tidum/Auth/AuthSession.swift`: `Provider`-enumet utvides med `.buypass`, med `loginPath: "/api/auth/buypass/login-mobile"`.

`ios/Tidum/Tidum/Features/Login/LoginView.swift`: ny "Logg inn med Buypass"-knapp ved siden av BankID/Google.

## 4. Feilhåndtering

Samme feilkode-sett som Idura allerede bruker og som mobilappens `AppState.errorMessage(for:)` allerede kjenner: `eid_failed`, `eid_missing_ssn`, `eid_not_linked`, `eid_already_linked`. Ingen nye feilkoder nødvendig — Buypass-callbacken gjenbruker de eksisterende.

## 5. Testing

- Enhetstester for den provider-uavhengige `resolveUserByEidIdentity`-endringen: bekreft at en bruker koblet KUN via `"bankid"` gjenkjennes av et Buypass-login-forsøk med samme `ssn_hash` (og omvendt).
- `openid-client`s `discovery()`/`buildAuthorizationUrl()`/`authorizationCodeGrant()` mockes ikke i enhetstester (samme filosofi som Idura — reell verifisering skjer mot Buypass' faktiske test-miljø når credentials finnes, ikke via mocket OIDC-bibliotek-atferd).
- iOS: samme mønster som BankID/Google-testene i `AuthSessionTests`-familien (om de finnes) — ellers dekkes Buypass av samme `LoginView`-knapp-eksistens-test som `CriticalPathUITests` allerede har for BankID/Google.

## 6. Det som IKKE kan fullføres uten ekte Buypass-kundeavtale

- Faktisk `BUYPASS_ISSUER_URL` (realm-navn) og `BUYPASS_CLIENT_ID`/`BUYPASS_CLIENT_SECRET` — gis av Buypass ved kundeavtale.
- Verifisering av `BUYPASS_SSN_CLAIM_KEY`s faktiske verdi — kun synlig i et ekte utstedt token fra realet.
- Registrering av `redirect_uri` (web + mobil-variant) hos Buypass — manuelt steg, samme mønster som Idura/Google-registreringen tidligere denne økten.
- Live-testing av hele flyten — kan først skje når ovenstående er på plass.

Koden bygges og committes uavhengig av dette (matcher hvordan BankID-mobil ble bygget ferdig før Idura-dashbordet var registrert) — disse punktene blir "Manual follow-ups" i implementeringsplanen, ikke blokkerende for selve koding.
