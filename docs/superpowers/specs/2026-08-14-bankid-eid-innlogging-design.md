# BankID/Buypass eID-innlogging — designspec

**Status:** Godkjent, klar for implementeringsplan
**Dato:** 2026-08-14
**Branch:** `claude/bankid-eid-innlogging`
**Kilde-ferdighet:** `bankid-oidc-norsk-eid` (lokal skill-pakke, se referanser nederst)

## Bakgrunn og formål

Tidum har i dag to innloggingsmetoder (`server/custom-auth.ts`): Google OAuth og
e-post-magisk-lenke. Begge er allowlist-baserte — de logger aldri inn en bruker
som ikke allerede finnes i `users`-tabellen eller har et admin-grant.

Roadmapen (`docs/compliance/roadmap.md`) har BankID som P0-punkt (`int-bankid`)
med leverandørvalg uavklart. Anbuds-gap-analysen for barnevernsvertikalen
(`docs/anbud/2026-112379-halden-barnevern-gap-analyse.md`, G-10) peker på at
Tidum i dag ikke har MFA — et gap som blir spesielt synlig når vi selger inn
mot sektorer med krav om sikkerhetsnivå høyt (helse, barnevern, offentlig
sektor).

Dette dokumentet spesifiserer BankID- og Buypass-innlogging for **ansatte**
(saksbehandlere, tiltaksledere, teamledere, miljøarbeidere — alle roller
utenfor admin-sjiktet), som erstatning for Google/e-post for disse rollene.
Admin-sjiktet (`super_admin`, `hovedadmin`, `vendor_admin`) beholder dagens
innlogging uendret.

Merk: anbudets eksplisitte innbygger-krav (G-4, sikker partsdialog for
foreldre/barn/advokater) er **ID-porten**, ikke BankID direkte, og dekkes ikke
av dette dokumentet — det er et eget spor i veikartets Fase 1/2.

## Scope

**I scope:**
- Innlogging med BankID og Buypass for eksisterende brukere.
- Kobling av BankID/Buypass til en allerede innlogget bruker (én gang, første
  gang rollen krever det).
- Tvungen bruk av eID for roller utenfor admin-sjiktet, etter at koblingen er
  gjort.
- Kostnadssporing per autentisering.

**Ikke i scope (bevisst utelatt, se `SKILL.md` for hvorfor de finnes i
generelt tilfelle):**
- Selvregistrering av ny bruker via eID — Tidum oppretter aldri bruker på
  ukjent fødselsnummer. Kontoer opprettes fortsatt av admin/vendor_admin eller
  via `vendorInviteLinks`, som i dag.
- Signering av dokumenter med eID (`eid_signatures`) — roadmapens
  "scope-valg: autentisering vs. signering" er avgjort til kun autentisering
  for denne leveransen. Kan legges til senere som eget dokument, samme
  provider-oppsett gjenbrukes.
- E-postverifisert kobling med passord (skillens fase 2-fallback) — Tidum har
  ingen passord. Eierskap til en konto bevises av en eksisterende
  Google/e-post-sesjon, ikke av et passord.
- ID-porten (innbyggerportal) — eget spor, se veikartets Fase 1/2.

## Arkitektur

Bygges med `openid-client` (allerede i `package.json`, brukt korrekt andre
steder i økosystemet for tilsvarende OIDC+Passport+Express-sesjon-oppsett).
Passport-sesjonen (samme `getSession()`-mønster som i `custom-auth.ts`) holder
allerede på PKCE/nonce/state internt via `openid-client`s Passport-strategi —
det trengs derfor **ingen egen `eid_auth_states`-tabell** slik den generiske
skillen (skrevet for stateless Supabase edge-functions) beskriver. Dette er en
bevisst forenkling fra skillens standardoppsett, ikke fra kravene: appen har
allerede server-side sesjon, som gjør formålet til den tabellen overflødig.

Signicat er valgt broker for begge leverandører (se "Provider-konfigurasjon").
Fordi Buypass går via Signicat som broker, håndterer Signicat
klientsertifikatet (.p12) som Buypass ellers krever ved direkte integrasjon —
Tidum trenger ikke eget Buypass-sertifikat.

Ny fil `server/eid-auth.ts` — egen modul, ikke en utvidelse av
`server/custom-auth.ts` (som allerede er 521 linjer). Eksporterer
`setupEidAuth(app)`, kalt fra `server/routes.ts` ved siden av
`setupCustomAuth(app)`, samt en delt `requiresEidLogin(role)`-sjekk som
`custom-auth.ts` importerer for håndhevingen (se under).

**Ingen avhengighet til `server/replit_integrations/`.** Den mappen er en
separat, ubrukt integrasjon og skal ikke importeres fra eller brukes som
grunnlag for denne funksjonaliteten.

## Datamodell

Ny migrasjon `migrations/050_eid_identities.sql` (neste ledige nummer på
`main`). Documaster-arkiv-branchen (`claude/anbudskrav-analyse-k52s1q`,
PR #3) bruker også `050` på sin egen migrasjon — de kolliderer ikke nå siden
ingen av dem er merget ennå, men den som merges sist av de to må
omnummereres til `051` på merge-tidspunktet.

Tilsvarende Drizzle-tabeller legges i `shared/models/auth.ts` (samme fil som
`users`/`sessions` i dag).

```sql
create table eid_identities (
  id          uuid primary key default gen_random_uuid(),
  user_id     varchar not null references users(id) on delete cascade,
  provider    varchar not null,              -- 'bankid' | 'buypass'
  sub         text not null,                 -- leverandørens id, metadata, aldri nøkkel
  ssn_hash    text not null,                 -- hmac-sha256(fnr, EID_SSN_HASH_PEPPER)
  given_name  text,
  family_name text,
  full_name   text,
  raw_claims  jsonb,                         -- claims uten fødselsnummer i klartekst
  verified_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index eid_identities_user_provider_key
  on eid_identities (user_id, provider);

create unique index eid_identities_ssn_provider_key
  on eid_identities (ssn_hash, provider);

create index eid_identities_ssn_idx on eid_identities (ssn_hash);

create table auth_login_events (
  id          uuid primary key default gen_random_uuid(),
  provider    varchar not null,              -- 'bankid' | 'buypass' | 'google' | 'email'
  user_id     varchar references users(id),
  session_id  text,                          -- req.sessionID; satt kun når autentiseringen FØDTE økten
  ip_address  text,
  user_agent  text,
  created_at  timestamptz not null default now()
);

create index auth_login_events_user_idx on auth_login_events (user_id, created_at desc);
```

`ssn_hash` er alltid `not null` fordi vi ikke støtter registrering — en
innloggingsforsøk uten fnr-claim har ingenting å slå opp mot og feiler rent
(ingen fallback-hash på fødselsdato, se "Sikkerhet").

## Provider-konfigurasjon

Nye miljøvariabler:

| Variabel | Formål |
|---|---|
| `SIGNICAT_ISSUER_URL` | Discovery-endepunkt hos Signicat |
| `SIGNICAT_BANKID_CLIENT_ID` / `_SECRET` | Klient for BankID-scope (`ssn`) |
| `SIGNICAT_BUYPASS_CLIENT_ID` / `_SECRET` | Klient for Buypass-scope (`bpnnin`) |
| `EID_SSN_HASH_PEPPER` | Dedikert hemmelighet for HMAC av fødselsnummer — egen fra `SESSION_SECRET`/`TIDUM_SECRET_KEY`, slik at kompromittering av sesjonshemmeligheten ikke også svekker fnr-hashen |

`EID_SSN_HASH_PEPPER` må settes før første deploy av denne funksjonaliteten;
uten den skal `setupEidAuth` kaste ved oppstart (samme mønster som
`requireDatabaseConnectionString`).

## Endepunkter

| Metode | Sti | Krever sesjon | Beskrivelse |
|---|---|---|---|
| GET | `/api/auth/bankid/login` | Nei | Start, intent=login |
| GET | `/api/auth/bankid/callback` | Nei | Slår opp `ssn_hash`, logger inn eller feiler |
| GET | `/api/auth/buypass/login` | Nei | Som over, Buypass |
| GET | `/api/auth/buypass/callback` | Nei | Som over, Buypass |
| GET | `/api/auth/eid/link/:provider` | Ja | Starter kobling av eID til innlogget bruker |
| GET | `/api/auth/eid/status` | Ja | `{ linked: boolean, required: boolean }` — grunnlag for frontend-gaten |

`:provider` valideres mot `['bankid', 'buypass']`.

## Autentiserings- og koblingsflyt

**Innlogging (`/callback`):**
1. Hent claims fra token. Mangler fnr-claim → avvis med
   `redirect("/?error=eid_missing_ssn")`, ikke opprett noe.
2. Hash fnr → slå opp `eid_identities` på `(ssn_hash, provider)`.
3. Funnet → hent `users`-raden på `user_id`, bygg samme `AuthUser`-form som
   Google/e-post-flyten bruker (rolle/vendorId uendret av eID — eID er kun
   autentiseringsmetode, ikke autorisasjonskilde).
4. Ikke funnet → **opprett ikke bruker**. Redirect til
   `/?error=eid_not_linked` med en forklarende melding om å logge inn med
   eksisterende metode og koble BankID derfra.
5. Uansett utfall: skriv rad i `auth_login_events` med `session_id` satt kun
   ved vellykket innlogging (regel 5 i skillen — kostnadssporing og bevis på
   at økten ble født av eID).

**Kobling (`/eid/link/:provider`, krever eksisterende sesjon):**
1. Bruker er allerede innlogget via Google/e-post — det ER eierskapsbeviset.
2. Etter callback: upsert `eid_identities` på `(user_id, provider)` med
   `onConflictDoUpdate` — target må matche den unike indeksen nøyaktig
   (`user_id, provider`), ellers Postgres-feil 42P10 (kjent fallgruve).
3. Logg returverdien fra skrivingen eksplisitt; stille feil her er den verste
   kategorien siden brukeren likevel kommer "inn" og feilen først viser seg
   som gjentatt fakturering senere.

**Håndhevingsgate (roller utenfor `canAccessVendorApiAdmin`):**
- Gjenbruker eksisterende `canAccessVendorApiAdmin(role)` fra
  `shared/roles.ts` til å avgjøre hvem som er unntatt (super_admin,
  hovedadmin, vendor_admin beholder Google/e-post uendret).
- For alle andre roller: `custom-auth.ts` sine Google- og
  e-post-innloggingshandlere kaller `requiresEidLogin(user)` etter at bruker
  er resolvet. Har brukeren allerede en rad i `eid_identities` → avvis
  innlogging med `redirect("/?error=eid_required")`. Har brukeren **ingen**
  rad ennå → slipp gjennom denne ene gangen (bootstrapper koblingen).
- Selv-utløpende: gaten stenger seg selv i det koblingen er gjort, uten
  tidsbegrenset unntakstabell.
- Frontend sjekker `/api/auth/eid/status` etter innlogging. `required &&
  !linked` → tvungen redirect til `/logg-inn/koble-bankid` før resten av
  appen vises.

## Frontend

- Innloggingssiden: BankID- og Buypass-knapper (Signicat/BankID sin
  designmanual for knappestil), Google/e-post-alternativene beholdes synlige
  (admin trenger dem fortsatt; enforcement skjer server-side etter
  rolleoppslag, ikke ved å skjule knapper).
- Ny side `/logg-inn/koble-bankid`: forklarer hvorfor, knapp som går til
  `/api/auth/eid/link/bankid` (evt. `buypass`).
- Ingen egen callback-side i frontend — som i dagens Google-flyt gjør
  server-callback-ruten hele token-utvekslingen og redirecter direkte til
  `getPostAuthRedirect()`.

## Sikkerhet — fallgruver fra skillen anvendt direkte

- Ved oppsett mot Signicat: logg `Object.keys(claims)` fra første token,
  aldri verdiene, for å bekrefte at fnr-scope faktisk er aktivert i
  Signicat-dashbordet (scope alene aktiverer det ofte ikke).
- Bind alltid på `ssn_hash`, aldri på leverandørens `sub` — forhindrer
  duplikatkonto når en ansatt bytter mellom BankID og Buypass.
- Ingen fallback-hash på fødselsdato — siden registrering er utelatt fra
  scope, er det ingen situasjon der en svakere nøkkel er et akseptabelt
  alternativ; manglende fnr feiler rent (se innloggingsflyt, steg 1).
- Eksplisitt feilhåndtering og logging på enhver skriving i
  identitets-/koblingsflyten — stille feil her blir usynlige inntil de dukker
  opp som gjentatt fakturering fra Signicat.
- `onConflict`-target i Drizzle-upsert må være nøyaktig `(user_id, provider)`
  — matcher den unike indeksen, ikke en delmengde av den.

## Byggerekkefølge

1. Verifiser mot Signicat sandkasse at fnr-claim faktisk kommer med riktig
   scope, før noe annet kodes (skillens regel — dette er stedet folk taper
   mest tid).
2. Migrasjon `050_eid_identities.sql` + Drizzle-skjema.
3. `server/eid-auth.ts`: login+callback for BankID (kun innlogging mot
   eksisterende kobling, ingen håndheving ennå).
4. Kobling: `/eid/link/:provider` + frontend-side.
5. Håndhevingsgate i `custom-auth.ts` (`requiresEidLogin`).
6. Buypass — samme modul, annet scope/klient.
7. `auth_login_events`-visning et sted admin kan se uvanlige tall (gjenbruk av
   mønster fra arkiv-modulens `entries`-logg om mulig).

## Åpne punkter (eksterne avhengigheter, blokkerer ikke spec-arbeidet)

- Signicat-avtale + `client_id`/`client_secret` for BankID og Buypass —
  Daniel må skaffe.
- Aktivering av fnr-scope (`ssn`/`bpnnin`) i Signicat-dashbordet — separat
  steg fra selve scope-forespørselen, kjent fallgruve.
- `EID_SSN_HASH_PEPPER` må genereres og settes i alle miljøer før deploy.

## Referanser

- Skill: `/Users/danielqazi/Documents/bankid-oidc-norsk-eid.skill`
  (`bankid-oidc-norsk-eid/SKILL.md`, `references/fallgruver.md`,
  `references/datamodell.sql`, `references/edge-functions.md`,
  `references/frontend.md`)
- `server/custom-auth.ts` — eksisterende innloggingsmønster som gjenbrukes
- `shared/roles.ts` — `canAccessVendorApiAdmin`
- `docs/compliance/roadmap.md` — `int-bankid` (P0)
- `docs/anbud/2026-112379-halden-barnevern-gap-analyse.md` — G-10 (MFA-gap),
  G-4 (ID-porten, separat spor)
