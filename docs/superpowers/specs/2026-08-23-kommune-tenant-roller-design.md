# Kommune-tenant og roller — bestiller-side fundament

## Bakgrunn og mål

Veikartet for barnevern-vertikalen (`docs/veikart-barnevern-vertikal.md`, Fase
3) beskriver en full saksbehandlingskjerne (melding → undersøkelse → vedtak
→ tiltak → oppfølging → avslutning) for kommunal barnevernstjeneste. Brukeren
har eksplisitt valgt full omfang av «Vedtak»-steget, men dette ble
dekomponert til fire uavhengige delprosjekter siden ingen av dem har noe
fundament å bygge på i dag — Tidums hele eksisterende datamodell er bygget
rundt *utfører*-siden (tiltaksbedrift/vendor), ikke *bestiller*-siden
(kommune).

Dette er delprosjekt 1 av 4: **kommune-tenant + saksbehandler/
barnevernsleder-roller + Entra ID SSO for kommuneansatte.** De tre neste
delprosjektene (meldingsmottak, undersøkelse, vedtak+ekspedering+arkivering)
bygger direkte på dette og spesifiseres i egne, senere spec-er.

## Global Constraints

- «Kommune» er en HELT EGEN tenant-type, parallell til `vendors` — ikke en
  utvidelse av vendor-tabellen. `vendors.institutionType` er hardt validert
  til kun `'privat'|'offentlig'|'nav'` og bærer vendor-spesifikke felter
  (`subscriptionPlan`, `maxUsers`, `apiAccessEnabled`) som ikke gir mening
  for en kommunal bestiller-tenant.
- Kommuneansatte (saksbehandler, barnevernsleder) logger inn via **Entra ID
  SSO** — ikke ID-porten (som er forbeholdt en senere, separat
  innbyggerportal-feature for foreldre/barn/fullmektiger, jf. veikartets
  eksplisitte skille mellom disse to mekanismene).
- Entra ID-integrasjonen skal skrives FERDIG nå, men markeres
  «deaktivert»-lignende (samme mønster som eksisterende leverandører i
  `server/eid-auth.ts:365-372`) helt til de nødvendige miljøvariablene
  (Tidums egen Azure AD multi-tenant app-registrering: `client_id`/
  `client_secret`) faktisk er satt. Dette er en selvbetjent Azure Portal-
  handling brukeren gjør parallelt — IKKE det samme som ID-portens
  virksomhetssertifikat-søknad (som har 3-5 ukers ekstern Digdir-
  godkjenning og IKKE er del av dette delprosjektet).
- Rangordning (barnevernsleder kan administrere saksbehandler) gjenbruker
  `canManageUsersDynamic`/`canManageRoleDynamic` (`server/lib/
  permissions.ts`, fase 1.6) UENDRET — denne mekanismen er global
  (`scope='global'`-filter i `getRoleRank`/`getRoleCanManageOthers`), ikke
  tenant-scopet i koden. Kommune-avgrensning (en barnevernsleder ser/
  administrerer kun EGEN kommunes saksbehandlere) håndheves separat i hver
  rute, med samme disiplin som eksisterende `vendorId`-scoping
  (`WHERE kommune_id = req.user.kommuneId`), ikke ved å endre
  permissions.ts.
- Nye roller (`saksbehandler`, `barnevernsleder`) må legges til på BEGGE
  steder som i dag holdes manuelt synkronisert (dokumentert i
  `migrations/058_role_hierarchy_rank.sql`s kommentar): `shared/roles.ts`
  (`TIDUM_ROLES`, `ROLE_LABELS`, `ROLE_ALIASES`, `MANAGEABLE_BY_ROLE`) OG en
  ny migrasjon som inserter tilsvarende rader i `tidum_roles`
  (`scope='global'`, `is_system_default=true`, med `rank`/
  `can_manage_others` konsistent med `MANAGEABLE_BY_ROLE`).
- Kun `super_admin` kan opprette en ny kommune-tenant — speiler
  vendor-opprettelsesmønsteret (`POST /api/vendors`,
  `server/smartTimingRoutes.ts:1279-1311`) nøyaktig, ikke selvbetjent
  signup.
- Brukere som hører til en kommune bruker den EKSISTERENDE `users`-tabellen
  (samme auth-/sesjonsinfrastruktur, samme integer-id-rom som
  `saker.tiltakslederId` osv.) — ikke en ny, parallell brukertabell. En
  bruker hører til ENTEN en vendor ELLER en kommune, aldri begge samtidig.

## Datamodell

Ny tabell `kommuner` (SQL-navn: `tidum_kommuner`, følger etablert prefiks):

- `id` (serial/integer — speiler `vendors.id`, som `users.vendorId`
  allerede refererer til som `integer`. Kommune-brukere autentiseres via en
  helt ny vei (Entra ID) og skriver KUN til `users`-tabellen — ikke de
  eldre `tidum_admin_users`/`tidum_company_users`-tabellene, som har sitt
  eget, separate integer-id-rom brukt av `saker.tiltakslederId`/
  `rapporter.userId`. Ingen sammenblanding av disse to id-rommene i dette
  delprosjektet.)
- `navn` (text, NOT NULL)
- `orgNummer` (text, NOT NULL, unique — norsk organisasjonsnummer, 9 sifre)
- `kommunenummer` (text, nullable — det offisielle 4-sifrede
  kommunenummeret, nyttig for fremtidig KS Fiks/Freg-integrasjon, men ikke
  påkrevd i denne runden)
- `entraIdTenantId` (text, nullable — Azure AD-katalog-ID for DENNE
  kommunens Entra-tenant; satt av super_admin når kommunen onboardes, kan
  være null før Entra ID-oppsettet er fullført på kommunens side)
- `status` (text, default `'active'` — samme enkle mønster som
  `archiveConfigs.status`, ikke en full enum i denne runden)
- `createdAt`, `updatedAt` (timestamp, `defaultNow()`)

Utvidelse av eksisterende `users`-tabell (`shared/models/auth.ts`):

- `kommuneId` (integer, nullable) — parallell til eksisterende
  `vendorId: integer("vendor_id")`. Ingen DB-constraint som håndhever
  gjensidig eksklusjon med `vendorId` i denne runden (matcher kodebasens
  etablerte, løse FK-konvensjon) — håndheves i applikasjonskoden ved
  bruker-opprettelse.

Nye roller i `shared/roles.ts` sin `TIDUM_ROLES`/`ROLE_LABELS`/
`ROLE_ALIASES`/`MANAGEABLE_BY_ROLE`, og tilsvarende rader i `tidum_roles`
via ny migrasjon:

- `saksbehandler` — rang tilsvarende dagens `tiltaksleder`/`teamleder`/
  `case_manager`-nivå (60), `can_manage_others = false`.
- `barnevernsleder` — rang tilsvarende dagens `vendor_admin`-nivå (70),
  `can_manage_others = true`, kan administrere `saksbehandler`.

`MANAGEABLE_BY_ROLE`-tillegg: `barnevernsleder: ["saksbehandler"]`.

## Entra ID SSO

Ny modul `server/lib/entra-id-client.ts` — standard OAuth2/OIDC
autorisasjonskode-flyt mot Microsoft identity platform (`login.
microsoftonline.com/{tenant}/oauth2/v2.0/{authorize|token}`), IKKE
Buypass-mønsterets private-key-JWT-client-assertion (Entra ID støtter
enklere `client_secret`-basert autentisering for denne typen integrasjon).

- Miljøvariabler (globale, Tidums EGEN Azure-app — ikke per kommune):
  `ENTRA_ID_CLIENT_ID`, `ENTRA_ID_CLIENT_SECRET`. Mangler disse: Entra
  ID-innloggingsknappen vises ikke noe sted (samme «stille deaktivert»-
  mønster som eksisterende leverandører).
- Per-kommune-parameter: `kommuner.entraIdTenantId` avgjør HVILKEN Azure
  AD-katalog en gitt innloggingsforsøk skal autentisere mot (multi-tenant
  Azure AD-app-mønster — Microsoft-standard for SaaS-leverandører som
  betjener flere kunde-organisasjoner med én app-registrering).
- Ruter: `GET /api/auth/entra-id/login?kommuneSlug=<slug>` (redirect til
  Microsoft) og `GET /api/auth/entra-id/callback` (token exchange, slår opp
  eller oppretter bruker i `users` med `kommuneId` satt fra callback-
  staten, samme `authLoginEvents`-logging som eksisterende eID-leverandører
  bruker).
- Gjenbruker `eidIdentities`-tabellen (`tidum_eid_identities`, migrasjon
  050) med en tredje `provider`-verdi (`"entra_id"`) — ingen skjemaendring
  nødvendig. Tabellens `sub` (`text NOT NULL`) er allerede eksakt feltet
  for en ekstern leverandørs subjekt-identifikator — lagre Entra ID sin
  `oid`-claim (stabil, unik per bruker per Azure-tenant) der, akkurat som
  feltet er tiltenkt.
  `ssn_hash` er derimot `NOT NULL` med en unik indeks `(ssn_hash,
  provider)`, og Entra ID gir aldri fødselsnummer. Siden feltet her kun
  fungerer som en per-provider dedup-/matchenøkkel (ikke et krav om et
  ekte fødselsnummer), fyll det med en hash av `{entraIdTenantId}:{oid}`
  (samme HMAC-SHA256-hashing som `hashSsn()` allerede bruker, bare med et
  annet inputformat) — tilfredsstiller NOT NULL og gir en reell, unik
  nøkkel per Entra-bruker uten å late som det er et fødselsnummer.

## API

- `POST /api/kommuner` — kun `super_admin`. Body: `{navn, orgNummer,
  kommunenummer?}`. Speiler `POST /api/vendors` sin validering (orgNummer
  9 sifre) og feilhåndtering (409 ved unique-constraint-konflikt).
- `PATCH /api/kommuner/:id` — kun `super_admin`. Kan sette
  `entraIdTenantId` når kommunen har fullført sitt Azure-oppsett.
- `POST /api/kommuner/:id/admins` — kun `super_admin` ELLER en eksisterende
  `barnevernsleder` på akkurat den kommunen (speiler
  `POST /api/vendors/:id/admins` sin tilgangssjekk). Oppretter/inviterer
  den første `barnevernsleder`-brukeren: upsert i `users` med `kommuneId`
  satt og `role_id` slått opp mot den nye `barnevernsleder`-raden i
  `tidum_roles`, samme magic-link-e-post-invitasjon som vendor-flyten
  bruker.
- `GET /api/auth/entra-id/login`, `GET /api/auth/entra-id/callback` — se
  Entra ID SSO-seksjonen over.

## Feilhåndtering

- Manglende `ENTRA_ID_CLIENT_ID`/`ENTRA_ID_CLIENT_SECRET`: Entra
  ID-innlogging er usynlig/inaktiv, ingen feil kastes til sluttbruker —
  samme mønster som andre eID-leverandører når de mangler konfigurasjon.
- Manglende `kommuner.entraIdTenantId` for en gitt kommune: login-ruten for
  den kommunen returnerer en tydelig feilmelding («Entra ID er ikke
  konfigurert for denne kommunen ennå») i stedet for å forsøke en
  ugyldig redirect.
- Rang-/kommune-tilgangssjekker feiler lukket (fail-closed), samme
  prinsipp som resten av fase 1.6/1.7-arbeidet denne økten.

## Testing

- Regresjon: eksisterende vendor-opprettelse, vendor-admin-invitasjon, og
  alle eksisterende roller/rangordning er upåvirket (ny kode, ingen
  eksisterende rute endres).
- Kommune-opprettelse: kun `super_admin` kan opprette; `orgNummer`-
  validering og unique-constraint-konflikt gir riktig feilrespons.
- Rollehierarki: `canManageUsersDynamic("barnevernsleder")` tillater
  administrasjon av `saksbehandler`; en `saksbehandler` kan IKKE
  administrere en annen `saksbehandler` eller en `barnevernsleder`.
- Kommune-scoping: en `barnevernsleder` i kommune A kan IKKE administrere
  eller se brukere i kommune B (samme type test som vendor-tenant-
  isolasjons-testene denne økten allerede har etablert mønsteret for).
- Entra ID-klient: rene enhetstester av token-exchange-logikken (mocket
  HTTP, ingen ekte Azure-kall — samme mønster som `archive-noark.test.ts`
  tester Noark-byggerne uten ekte Documaster-kall), pluss én test som
  bekrefter at login-ruten er inaktiv/gir tydelig feil uten konfigurasjon.

## Ikke i omfang

- Meldingsmottak, undersøkelse, vedtak — egne, senere delprosjekter (2-4).
- ID-porten (innbyggerportal/partsinnsyn) — annen mekanisme, annen
  brukergruppe, egen fremtidig feature.
- Selvbetjent kommune-signup — kun super_admin-onboarding i denne runden.
- Faktisk anskaffelse av Azure AD-app-registrering — brukerens egen,
  parallelle handling; koden skrives klar til å plugges inn.
- Migrering av rangordning til å bli genuint tenant-scopet i
  `permissions.ts` (den strukturelle DB-støtten finnes allerede via
  `roles.vendorId`/`roles.scope`, men å faktisk bruke den er en separat,
  større endring som ville påvirke ALL eksisterende rolle-logikk, ikke bare
  kommune — ikke gjør denne endringen som en bivirkning av dette
  delprosjektet).
