# Visuell QA av Admin/vendor-administrasjon — juli 2026

> **Status:** Funnet under er rettet i denne branchen og verifisert
> programmatisk mot kjørende app.

Gjennomgang av admin-/leverandørsiden av appen: `/access-requests`
(tilgangsforespørsler), `/admin/case-reviews` (saksgodkjenning), `/vendor/api`
(API-administrasjon) og `/api-docs` (API-dokumentasjon) — for admin- og
super_admin-visning. Metodikk: tekst-/DOM-basert programmatisk verifisering
(innhold, overflow-sjekk, nettverksfeil) via Playwright, samt kildekode-
gjennomgang av server-endepunkt og feilhåndtering. Ingen nye skjermbilder i
denne runden, av hensyn til samtalens størrelse.

---

## Bugs

### 1. `/admin/case-reviews` krasjet fullstendig ved reelle data

`GET /api/admin/case-reports` brukte rå SQL (`pool.query('SELECT * FROM
case_reports ...')`), som returnerer kolonnenavn i `snake_case` (Postgres'
native format). Klienten forventer `camelCase`-felt (slik Drizzle ORM
returnerer dem), og kalte blant annet `.toLowerCase()` på et felt som dermed
var `undefined` — noe som krasjet hele siden så snart det fantes rader i
`case_reports`-tabellen.

**Fiks:** endepunktet er skrevet om til å bruke Drizzle
(`db.select().from(caseReports)...`) i `server/smartTimingRoutes.ts`, som
returnerer riktig `camelCase`-formaterte felt. Verifisert med `curl` og
Playwright mot en kjørende dev-server med testdata i `case_reports`.

Dette er den mest alvorlige bugen funnet i denne QA-runden, siden den rammer
enhver reell bruk av siden (ikke bare et kantetilfelle).

### 2. Feil topplinjetittel på `/admin/case-reviews`

Samme mønster som tidligere funnet på `/case-reports` og `/profile`:
`/admin/case-reviews` er ikke i den statiske `baseNavItems`-listen i
`portal-layout.tsx`, så topplinjen viste «Dashboard» i stedet for riktig
tittel.

**Fiks:** lagt til `/admin/case-reviews → "Saksgodkjenning"` i
`ORPHAN_ROUTE_LABELS`-oppslaget.

### 3. Skrivefeil i norske tegn (`Tilgangsforesporsler`)

`access-requests.tsx` hadde en overskrift uten riktig `ø`:
«Tilgangsforesporsler» i stedet for «Tilgangsforespørsler».

**Fiks:** rettet direkte i teksten.

### 4. Manglende norske tegn i `/api-docs` og `/vendor/api`

Begge sidene hadde omfattende mangler på æ/ø/å gjennom brødteksten
(«leverandor», «foresporsler», «nokkel»/«nokler», «folgende», «utlopt», «ma
autentiseres», «Kopier nokkelen na», «Du ma vaere innlogget», m.fl.) — et
tegnsett-problem fra forfatting uten UTF-8-håndtering av norske spesialtegn.

**Fiks:** 14 strenger rettet i `api-docs.tsx`, 17 strenger rettet i
`vendor-api-admin.tsx` (inkludert knappetekster, dialogtitler og feilmeldinger
knyttet til API-nøkkeladministrasjon).

### 5. Stille feil på `/vendor/api` for super_admin uten `vendorId`

`GET /api/vendor/api-status` og `GET /api/vendor/api-keys` returnerer 400
(«Super admin must specify vendorId») for enhver bruker der
`isVendorAdmin()`/super_admin-sjekken er sann, men brukeren mangler `vendorId`
— noe ekte super_admin-/hovedadmin-kontoer typisk gjør, siden de er
plattformnivå-roller uten tilknytning til én bestemt leverandør. Samme
rotårsak-mønster som ble funnet og rettet for invitasjonslenker i
Saker/institusjoner-QA-en.

Klientsiden hadde ingen feilhåndtering på disse spørringene — brukeren så
bare «API-tilgang er ikke aktivert», som ser ut som en normal deaktivert
tilstand og ikke en feil.

**Fiks:** viser nå en tydelig feilmelding øverst på siden når status- eller
nøkkel-spørringen feiler, konsistent med invitasjonslenke-fiksen.

---

## Observert, ikke rettet: `/admin/rapportmal` (Template Designer)

`AdminTemplatePage.tsx` (rute `/admin/rapportmal`) er en egen, eldre
malredigeringsside ved siden av den allerede QA-ede `/admin/rapport-maler`
(`AdminRapportTemplatesPage`). Den er heller ikke i `baseNavItems` (nås kun
via direkte URL). Koden henter eksisterende mal via
`/api/rapporter/templates/mine`, men initialiserer aldri lokal state fra
svaret — `fields`/`branding`/`tekster` starter alltid fra hardkodede
standardverdier, og «Publiser for alle» lagrer disse standardverdiene
tilbake, uavhengig av hva som allerede er lagret.

Dette er potensielt en reell databug (kan overskrive en tidligere tilpasset,
publisert mal), men er ikke rettet i denne runden — det er en større endring
enn en målrettet QA-fiks, og siden er uansett ikke lenket fra
navigasjonen. Anbefaling: vurder om siden bør fjernes/erstattes av
`/admin/rapport-maler`, eller få en hydrerings-fiks i en egen endring.

---

## Det som ser bra ut

- **Ingen JS- eller API-feil** (utover funnet over) på `/access-requests`,
  `/admin/case-reviews` (etter fiks) eller `/vendor/api` (etter fiks).
- **Rolle-/tilgangssjekker** på `/vendor/api` og `/access-requests` fungerer
  som forventet — uautoriserte roller vises en tydelig «Ingen tilgang»-side.
- **API-dokumentasjonen** (`/api-docs`) er ellers godt strukturert og
  komplett etter tegnsettfiksen.

## Skjermbilder

Ingen nye skjermbilder i denne runden — verifisering skjedde
tekst-/DOM-basert og via kildekodegjennomgang, av hensyn til samtalens
størrelse.
