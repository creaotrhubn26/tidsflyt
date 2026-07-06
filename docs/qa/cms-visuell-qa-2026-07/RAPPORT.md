# Visuell og funksjonell QA av CMS — juli 2026

> **Status:** Funnet under er rettet i denne branchen og verifisert
> programmatisk mot kjørende app.

Gjennomgang av hele CMS-flaten: den nye Visual Builder-en (`/cms`, ~3 400
linjer) og det eldre 23-fane admin-verktøyet (`/cms-legacy`, ~10 000 linjer:
Hero, Funksjoner, Referanser, Partnere, Seksjoner, Design, Media, SEO,
Skjemaer, Navigasjon, Blogg, GA4, E-post, Rapporter, Portal, Leverandører,
Sider, Hvorfor, Guide, Merkevare, Sidebar, Crawler, Aktivitet, Versjoner) —
begge kun tilgjengelig for admin-roller.

Metodikk denne runden var todelt:

1. **Baseline-sveip** (manuell, Playwright + kildekodegjennomgang): alle
   faner besøkt, grunnleggende opprett/rediger/slett-flyter testet. Fant 9
   reelle bugs før den dype gjennomgangen i det hele tatt startet —
   deriblant 7 tabeller som ble referert av fungerende serverkode, men
   aldri opprettet av noen migrasjon eller Drizzle-schema (Media Library,
   SEO, Skjemaer, Navigasjon og Portal-fanene var **100 % ødelagt** for
   absolutt alle brukere, i alle miljøer, ikke bare denne sandkassen).
2. **Dyp gjennomgang** (Workflow — 12 parallelle agenter, én per
   underområde): hver fikk kildekode- og server-endepunkt-gjennomgang
   kombinert med levende Playwright-interaksjon, etterfulgt av en
   uavhengig adversarial verifiseringsrunde per funn. **64 funn ble
   rapportert og bekreftet ekte (0 avvist)** — inkludert flere reelle
   sikkerhetshull. Alle 64 er rettet og verifisert på nytt direkte mot en
   kjørende dev-server, inkludert gjenoppretting av testdata som ble
   utilsiktet påvirket under verifisering.

CMS-flaten viste seg å være det klart mest ustabile området i denne
QA-serien: 100 % av admin-brukere hadde 5 hele faner som krasjet på enhver
interaksjon, tre genuine sikkerhetshull (én SQL-injection), og en betydelig
del av redigeringsfunksjonaliteten var enten koblet fra den faktiske
offentlige siden eller ren fasade uten backend.

---

## Sikkerhet

### 1. SQL-injection i `PUT /api/report-templates/:id`

Endepunktet bygde SQL SET-klausulen direkte fra
`Object.keys(req.body)` med **ingen whitelist** — siden kolonnenavnet ble
satt inn i spørringen via strenginterpolasjon (ikke en bundet parameter),
kunne en request-body-nøkkel som
`"name = 'x', description = (SELECT ...) --"` bli kjørt som vilkårlig SQL.

**Fiks:** innførte `REPORT_TEMPLATE_UPDATABLE_FIELDS`, et eksplisitt sett
med reelle kolonnenavn; kun nøkler i settet slipper gjennom til
SET-klausulen. Verifisert live: en ondsinnet nøkkel avvises nå med 400 i
stedet for å kjøre.

### 2. Upubliserte blogginnlegg og Visual Builder-sider lesbare uten autentisering

`GET /api/cms/posts` og `GET /api/cms/posts/:id` hadde ingen
auth-middleware i det hele tatt (i motsetning til søsken-endepunktene
POST/PUT/DELETE) — draft/scheduled/archived-innlegg var fullt lesbare for
hvem som helst. Tilsvarende for Visual Builder: `GET
/api/cms/builder-pages` og `GET .../builder-pages/slug/:slug` manglet både
autentisering og et `status = 'published'`-filter — upubliserte
kladde-sider ble servert direkte på den offentlige URL-en.

**Fiks:** lagt til `authenticateAdmin` på de to blogg-GET-endepunktene;
lagt til `isAuthenticated, requireAdminRole` på builder-pages-listing, og
et eksplisitt `status = 'published'`-filter på slug-oppslaget som brukes
av den offentlige siden.

### 3. `POST /api/cms/upload` krevde ingen autentisering

Hvem som helst kunne laste opp vilkårlige bilder til serverens disk og få
tilbake en offentlig `/uploads/cms/...`-URL, uten innlogging.

**Fiks:** lagt til `isAuthenticated, requireAdminRole`.

---

## Tabeller og kolonner som aldri fantes (100 % ødelagt for alle brukere)

### 4. Fem manglende databasetabeller — hele faner krasjet på lasting

`cms_media`, `cms_media_folders`, `cms_seo_settings`, `cms_forms`,
`cms_form_submissions`, `cms_navigation` og `portal_settings` ble alle
referert av fungerende, ferdigskrevet serverkode (INSERT/UPDATE/SELECT i
`smartTimingRoutes.ts`) og matchende TypeScript-interfaces i klienten —
men fantes ikke i noen migrasjon eller i Drizzle-schemaet. Media Library,
SEO, Skjemaer, Navigasjon og Portal-fanene ga alle
`relation ... does not exist` på første lasting, for hver eneste bruker,
i hvert miljø.

**Fiks:** ny migrasjon (`052_cms_missing_tables.sql`) oppretter alle syv
tabellene med kolonner utledet direkte fra den eksisterende
server-/klientkoden, registrert i oppstarts-migrasjonslisten. To
constraint-detaljer krevde ekstra omtanke: `cms_seo_settings` bruker en
`page_id INTEGER NOT NULL DEFAULT 0`-sentinel (i stedet for en nullbar
kolonne) fordi rå SQL `ON CONFLICT` uten en `WHERE`-klausul ikke kan
matche en delvis indeks; `portal_settings` bruker `UNIQUE NULLS NOT
DISTINCT (vendor_id)` (Postgres 15+) slik at `ON CONFLICT (vendor_id)`
korrekt gjenkjenner den ene globale innstillings-raden (der `vendor_id`
er NULL) i stedet for å sette inn en ny duplikat-rad ved hver lagring.

### 5. Duplikat- og rekkefølge-bugs skjulte fungerende endepunkter

To varianter av samme Express-fallgruve: (a) `GET
/api/cms/activity-log` var registrert **to ganger** — den første
(feilaktig, joinet mot en ikke-eksisterende `admin_id`-kolonne) vant alltid
og skjulte en korrekt, allerede skrevet registrering lenger ned i filen; (b)
`GET/PUT /api/cms/seo/:pageType/:pageId?` var registrert *før* det mer
spesifikke `GET/PUT /api/cms/seo/pages`, så Express matchet `"pages"` som
`:pageType`-parameteren og ga feil rett SQL-feil for feil tabell.

**Fiks:** slettet den ødelagte duplikat-registreringen for aktivitetslogg;
lagt til `next()`-vakter (`if (req.params.pageType === "pages") return
next();`) som første linje i de tidligere-registrerte, mer generiske
rutene — billigere og tryggere enn å flytte store kodeblokker.

### 6. `tilgjengelighet` manglet fra sidetype-whitelisten

`/api/cms/pages/tilgjengelighet` ga 400 fordi sidetypen ikke var i
`validTypes`-listen (to separate inline-lister, nå konsolidert til én
delt `CMS_PAGE_TYPES`), og hadde ingen standardinnhold definert.

**Fiks:** lagt til i whitelisten og i `getPageDefaults()`.

### 7. Dobbel autentiseringsmekanisme ga permanent 404 på Leverandør-fanen

CMS-adminet har to parallelle auth-systemer: hoved-appens sesjon
(`isAuthenticated`) og et separat JWT-basert admin-oppsett
(`authenticateAdmin`, mintet via `/api/admin/session-token`). `GET
/api/admin/profile` slo opp brukeren i en helt egen `admin_users`-tabell
(kun populert via en manuell brukernavn/passord-innlogging) ved bruk av
`req.admin.id` — som for JWT-mintede sesjoner faktisk er en `users.id`,
ikke en `admin_users.id`. Enhver ekte bruker fikk dermed permanent 404, og
«Leverandører»-fanen (som er betinget av en vellykket profil-lasting)
vistes aldri.

**Fiks:** faller nå tilbake til JWT-claims (rolle, vendorId, brukernavn)
når ingen `admin_users`-rad finnes. Verifisert: Leverandører-fanen vises nå
korrekt i fanelisten.

---

## Hero — 18 av 26 felt forkastet stille ved lagring

`PUT /api/cms/hero` destrukturerte og lagret kun 8 av de 26 kolonnene
`landing_hero` faktisk har — badges, bakgrunn, layout og alle tre
statistikk-par (stat1–stat3) ble stille forkastet ved hver lagring, uansett
hva admin fylte inn i de tilsvarende feltene i UI-et.

**Fiks:** full omskriving av handleren til å destrukturere, lagre og
returnere alle 26 kolonner.

## CMS-seksjoner koblet fra reell side (6 steder)

Funksjoner, Seksjoner, Design (tokens), Navigasjon, Portal Design Studio
og Partnere (i Visual Builder) lagrer alle endringer i databasen uten
feil — men ingenting på den faktiske landingssiden eller portal-chrome
(`portal-layout.tsx`) leser noen gang disse dataene. Endringer har null
synlig effekt, mens UI-et rapporterer suksess. Å bygge ut den manglende
rendrings-koblingen for seks separate seksjoner er stort, spekulativt
arbeid utenfor omfanget av en QA-runde.

**Fiks:** lagt til en tydelig `NotYetLiveWarning`-banner i hver
editor-fane i stedet, slik at admin ikke villedes til å tro endringer har
effekt de faktisk ikke har.

## Design-preset "Bruk" — SQL-injection-tilstøtende krasj

`POST /api/cms/design-presets/:id/apply` bygde SQL SET-klausuler direkte
fra nøklene i en JSONB-kolonne (`tokens`/`section_settings`) — en ukjent
eller ondsinnet nøkkel ga enten en rå Postgres-feil til admin-UI, eller
injiserte vilkårlig SQL som kolonnenavn.

**Fiks:** whitelist av faktiske `design_tokens`/`section_design_settings`-
kolonner bygget direkte fra Drizzle-schemaet (`getTableColumns`); ukjente
nøkler ignoreres nå stille i stedet for å krasje.

## Visual Builder: duplikat-slug lekket rå SQL

`POST/PUT /api/cms/builder-pages` sjekket `error.code === '23505'` for en
pen 409 ved duplikat slug — men Drizzles `.returning()`-kall kaster en
`DrizzleQueryError`-wrapper der den faktiske Postgres-feilen (med `.code`)
ligger på `error.cause`, ikke direkte på `error`. Sjekken traff derfor
aldri, og en duplikat slug endte som en rå «Failed query: insert into
...»-SQL-streng med 400 rett til klienten. Samme mønster gjentok seg for
blogginnlegg (`cms_posts.slug`).

**Fiks:** sjekker nå både `error.code` og `error.cause?.code`, på begge
steder. Lagt til samme 400/409-mønster for tom tittel/slug på
builder-sider og blogginnlegg (begge NOT NULL i databasen, ingen
validering fantes).

## Media Library: manglet opplasting, sletting oppdaterte ikke UI, mapper uten CRUD

Tre separate bugs:

1. **Ingen opplastings-UI i det hele tatt** — fanen viste kun en
   instruksjonstekst om URL-opplasting som ikke fantes. Lagt til en reell
   "Last opp"-knapp koblet til det (nå sikrede) `/api/cms/upload`.
2. **Sletting virket server-side, men UI oppdaterte seg aldri** —
   `authenticatedApiRequest()` (finnes i to kopier, brukt av 15+
   slette-endepunkter i CMS-adminet) kalte alltid `response.json()`, også
   på et 204 No Content-svar uten body, som kaster en parse-feil og
   forhindrer `onSuccess` (refetch) fra å kjøre. En systemisk feil, ikke
   unik for media. Fikset med en tidlig return på status 204.
3. **Mappenavn kunne være tomt, og det fantes ingen omdøp/slett** — lagt
   til trim-validering (klient og server) og nye
   `PUT/DELETE /api/cms/media/folders/:id`-endepunkter med tilhørende
   UI-knapper.

## SEO-innstillinger: stille reversering, korrupt sitemap, NaN

- `PUT /api/cms/seo/global` brukte `site_name || 'Tidum'` — et tømt felt
  ble stille overskrevet til den hardkodede standarden i stedet for en
  feilmelding.
- `POST/PUT /api/cms/seo/pages` tillot tom `page_path`, som rendres i
  `sitemap.xml` som `<loc>{baseUrl}</loc>` — samme URL som forsiden,
  dupliserer/forvirrer sitemapen.
- "Prioritet"-feltet gjorde `parseFloat()` uten NaN-sjekk, som satte NaN
  som `value` på et kontrollert input (Reacts "received NaN"-advarsel).

**Fiks:** avviser nå tomt nettstedsnavn/sidesti med 400; faller tilbake
til 0 i stedet for NaN på prioritetsfeltet.

## Skjemaer: select-felt uten valg-editor, manglende validering

"Nedtrekksliste"-felttypen hadde ingen måte å definere valgene på i det
hele tatt — verken ved oppretting eller redigering, feltet ble alltid
lagret med `options: undefined`. Skjemanavn kunne også lagres tomt/
whitespace. Skjemabygger er dessuten ikke koblet til noen reell side — de
offentlige sidene bruker sine egne hardkodede kontaktskjemaer mot et helt
annet endepunkt.

**Fiks:** lagt til en valg-editor (legg til/rediger/fjern) for select-felt
med advarsel når listen er tom; trim-validering av skjemanavn (klient og
server); `NotYetLiveWarning` for frakoblingen fra reell side.

## Navigasjon: 500-krasj uten "name"

`PUT /api/cms/navigation/:location` sendte `name` rett inn i en NOT
NULL-kolonne uten å sjekke at den fantes — et kall uten `name` ga en rå
constraint-feil og 500.

**Fiks:** avviser nå tomt/manglende navn med en ren 400.

## GA4/GTM: lagret uten formatvalidering

`ga4_measurement_id`/`gtm_container_id` ble lagret uansett innhold — en
feilskrevet ID lagres "vellykket", men sporingen ville aldri fungere,
uten noen synlig feil.

**Fiks:** validerer nå mot Googles faktiske ID-format (`G-XXXXXXXXXX` /
`GTM-XXXXXXX`) før lagring.

## E-post: falsk suksessmelding, variables-krasj, frakoblet SMTP

- `POST /api/cms/email/test` sjekket aldri returverdien fra
  `emailService.sendEmail()` — funksjonen kaster aldri ved feil, den
  returnerer bare `false`. Testutsendelse rapporterte alltid suksess (og
  loggførte "sent") selv når SMTP ikke er konfigurert eller sending
  faktisk feilet.
- `POST/PUT /api/cms/email/templates` krasjet med 500 hver gang
  "variables" ble sendt, fordi verdien ble satt rett inn i en
  jsonb-kolonne uten `JSON.stringify()`.
- SMTP-innstillingene i CMS har null effekt på reell utsendelse — den
  faktiske e-posttjenesten er konfigurert fra miljøvariabler på serveren,
  ikke fra databasetabellen admin redigerer.

**Fiks:** sjekker nå `sendEmail()`s returverdi og svarer ærlig 502 (logger
'failed' i historikken) ved reell feil; `JSON.stringify()` på variables
før lagring, pluss 409 for duplikat slug og 400 for tomt navn/slug;
`NotYetLiveWarning` på SMTP-innstillingene.

## Rapporter: "Standardmal"-duplisering

`POST /api/report-templates/seed-default` brukte `ON CONFLICT DO
NOTHING` uten noe konflikt-mål — `report_templates` har ingen unique
constraint på `name`, så det fantes ingen faktisk konflikt å oppdage.
Hvert klikk på "Standardmal"-knappen satte inn en helt ny duplikat-rad
(bekreftet: 3 duplikate rader hadde samlet seg opp i databasen fra
tidligere testing). Malnavn kunne også lagres tomt.

**Fiks:** sjekker nå eksplisitt om en standardmal allerede finnes før
insert; ryddet opp duplikat-radene; avviser tomt navn med 400.

## Portal: feil dra-og-slipp-mål, 500 på første lagring

- Forhåndsvisnings-listen for nav-elementer filtrerte til kun aktiverte
  elementer, men brukte deretter *posisjonen i den filtrerte listen* som
  drag-ID og oppslagsindeks i den fulle arrayen. Så snart et tidligere
  element ble deaktivert, hoppet indeksene ut av synk — dra-og-slipp og
  "velg for redigering" begynte å treffe feil element.
- `PUT /api/portal/settings` sin UPDATE-gren er COALESCE-beskyttet mot at
  et utelatt felt nuller ut en eksisterende verdi, men INSERT-grenen
  (brukt ved aller første lagring) manglet denne beskyttelsen for
  `show_branding` (NOT NULL) — krasjet med 500 på første lagring hvis
  feltet ikke ble sendt.

**Fiks:** beholder nå elementets opprinnelige array-indeks gjennom
filteret; `COALESCE($13, true)` kun i INSERT-grenens VALUES-klausul (uten
å påvirke UPDATE-grenens eksisterende COALESCE-beskyttelse).

## Leverandører: falsy-bug, manglende validering, uventet dialog-lukking

- `POST /api/vendors` brukte `maxUsers || 50` — siden `0` er falsy i
  JavaScript, ble en admin som eksplisitt satte maks brukere til 0 stille
  overskrevet til 50. PUT hadde ikke denne bugen.
- Ingen validering hindret negativt `maxUsers` på verken POST eller PUT.
- Å opprette en administrator for en leverandør lukket hele
  "Administratorer for {leverandør}"-dialogen umiddelbart, selv om
  "Legg til administrator"-skjemaet er en integrert del av samme dialog.

**Fiks:** sjekker nå eksplisitt for undefined/null i stedet for falsy;
avviser negative verdier med 400; dialogen lukkes ikke lenger automatisk
ved vellykket opprettelse.

## Sider: Personvern/Vilkår/Tilgjengelighet ignorerte CMS-innhold

- `privacy.tsx`/`terms.tsx` krevde at CMS-innholdet var over **800
  tegn** før det ble vist i det hele tatt — ellers falt siden tilbake til
  hardkodet standardtekst, uten feilmelding. Et gyldig, men kortere,
  redigert innhold ble dermed stille ignorert (selv serverens egen
  standard-seed er godt under 800 tegn).
- `tilgjengelighet.tsx` leser og viser CMS-innhold korrekt, men tittel,
  undertekst og "sist oppdatert" var hardkodet i JSX og leste aldri fra
  CMS-svaret, selv om samme generiske editor lar admin redigere nettopp
  disse feltene for denne sidetypen.

**Fiks:** byttet til en enkel "finnes det innhold i det hele tatt"-sjekk;
`tilgjengelighet.tsx` leser nå title/subtitle/last_updated fra CMS med de
tidligere hardkodede verdiene som fallback.

## Hvorfor-siden: CTA-fanen kunne aldri lagres

`PUT /api/cms/why-page/content/:sectionId` er en delt handler for alle
Hvorfor-side-seksjonene, men bare noen av dem sender et generisk
"title"-felt — CTA-fanen sender kun `cta_title`/`cta_subtitle`/osv.
`why_page_content.title` er NOT NULL, og ingen rad fantes fra før for
`section_id='cta'`, så enhver lagring traff INSERT-grenen med
`title=undefined` og krasjet med 500. Samtidig manglet samtlige
Hvorfor-side-mutations `onError`-håndtering, så selv andre feil ville
vært usynlige for admin.

**Fiks:** faller tilbake til seksjons-IDen som title når feltet mangler;
lagt til `onError`-toast konsekvent på alle mutations.

## Guide-editor: manglende terskel-validering, JSON-datatap

- De fire terskelfeltene for "sitter-fast"-hjelperen hadde ingen nedre
  grense — 0 eller negativt ville utløst hjelpe-popupen nesten
  øyeblikkelig for alle brukere.
- A/B-variantenes "vekt"-felt hadde `min={0}` kun som HTML-attributt
  (hindrer ikke direkte tastatur-inntasting av negative tall).
- Kategori-seksjonen deler state mellom en "Visuell editor"- og en "Rå
  JSON"-fane. Enhver endring i den visuelle editoren skrev umiddelbart
  den sist *gyldige* JSON-en tilbake — hvis admin hadde ugyldig, uferdig
  JSON i den rå fanen og gjorde en hvilken som helst endring i den
  visuelle fanen, ble det uferdige utkastet stille overskrevet og tapt.

**Fiks:** klemmer nå terskelverdier til minimum 1 og vekt til minimum 0;
deaktiverer den visuelle editoren med en tydelig forklaring når JSON-en
er ugyldig, i stedet for å risikere å overskrive den.

## Merkevare: stille datareversering, manglende e-postvalidering

`PUT /api/cms/brand` lagret ethvert felt uten validering, inkludert tomme
strenger. GET-handleren bruker `parsed?.field || <hardkodet standard>`
for hvert felt — en lagret tom verdi ble derfor stille erstattet med den
gamle hardkodede standarden ved neste sidelasting, mens admin fikk en
"lagret"-bekreftelse. Verifisert live: satte `supportEmail` til `""`, fikk
200 tilbake, men påfølgende GET viste fortsatt den gamle e-posten.

**Fiks:** firmanavn, support-e-post og juridisk e-post avvises nå med 400
hvis tomme; de to e-postfeltene valideres mot et enkelt e-postformat.

## Sidebar-editor manglet to reelle elementer

`SIDEBAR_PATHS` i nav-editor.tsx manglet "/admin/salg" (Salg & Priser) og
"/admin/leads" (Leads) — begge reelle sidebar-elementer som dermed ikke
kunne omdøpes, skjules eller flyttes via CMS.

**Fiks:** lagt til begge i den statiske listen.

## Crawler: tomt-felt-500, manglende React-key, tidsplaner uten effekt

- `POST /api/cms/crawler/jobs` brukte destructuring-standardverdier, som
  kun slår inn for `undefined` — ikke `null`. Et tomt "Maks
  sider"/"Maks dybde"-felt sendte `null` og krasjet med 500 mot en NOT
  NULL-kolonne.
- `Object.entries(...).map(...)` returnerte en snarveis-fragment
  (`<>...</>`) per rad — disse kan ikke ta en `key`-prop, så React fikk
  aldri en nøkkel på selve listeelementet.
- "Tidsplaner" er ren CRUD uten noen bakgrunnsjobb som faktisk starter en
  planlagt crawl; "Kun lenker"/"Fra sitemap" crawl-typer lagres, men
  motoren har ingen egen logikk for dem og kjører alltid full crawl.

**Fiks:** eksplisitt null/undefined-validering med 400 ved ugyldig verdi;
`<Fragment key={k}>` i stedet for snarveisfragment; tydelige advarsler i
UI for de to funksjonene som ikke er implementert.

## Aktivitetslogg: sidekrasj, "Ukjent"-bruker, publish-500

Klientkoden brukte feltnavn som aldri har eksistert i
`cms_activity_log`-tabellen (`admin_username`, `entity_type`,
`entity_id`) — de faktiske kolonnene heter `user_name`, `resource_type`,
`resource_id`. Brukernavnet var derfor alltid `undefined` (viste
"Ukjent" for alle), og `details` (jsonb, korrekt navngitt) ble rendret
direkte som `{entry.details}` i JSX — for "restore"-hendelser er dette et
objekt, ikke en streng, og å rendre et objekt direkte som React-barn
**krasjet hele CMS-siden**, ikke bare aktivitetslogg-fanen.
`POST /api/cms/publish` satte i tillegg inn med et helt annet sett
feilaktige kolonnenavn og feilet alltid med 500.

**Fiks:** rettet feltnavn til å matche faktisk databaseschema;
konverterer objekt-`details` til lesbar JSON-streng før visning i stedet
for å rendre rått; rettet publish-INSERT-en til de riktige kolonnene
(samme mønster som 7 andre fungerende innsettingssteder i samme fil).

## Versjoner: gjenoppretting manglet for 3 faktiske versjonstyper

`POST /api/cms/versions/:id/restore` har en switch over innholdstype som
utfører selve gjenopprettingen, men den manglet tre typer som allerede
logges andre steder i kodebasen: `portal_settings`, `cms_pages` og
`cms_publish`. Disse vises helt normalt som gjenopprettbare i
Versjoner-fanen, men et klikk feilet alltid med 400.

**Fiks:** lagt til ekte gjenoppretting for `portal_settings` og
`cms_pages`. `cms_publish` er en historisk logg-hendelse uten noen
levende rad å gjenopprette "til" — gir nå en tydelig, spesifikk
feilmelding i stedet for den generiske "kan ikke gjenopprette", og
gjenopprett-knappen deaktiveres i UI for slike rader.

## Visual Builder: seks "Verktøy"-paneler er rene mockups

Design System-, Skjemaer-, Blogg-, E-postmaler-, Portaldesign- og
Analyse-panelene i Visual Builder er alle rene fasader: hardkodede
eksempeldata og en "Lagre"-knapp som kun viser en suksess-toast, uten
noe nettverkskall i det hele tatt. Verre enn de øvrige frakoblede
seksjonene i denne runden — det finnes allerede ekte, fungerende
editorer for nøyaktig de samme tingene andre steder i CMS-adminet, som
denne runden allerede har fikset flere reelle bugs i. Å bygge de seks
panelene på nytt ville duplisere allerede fungerende funksjonalitet.

**Fiks:** lagt til en tydelig advarsel i alle seks panelene som forklarer
at de kun er forhåndsvisninger med eksempeldata, med henvisning til
riktig sted å redigere det som faktisk vises.

---

## Det som ser bra ut

- **Vendor-isolasjon og rollekontroll** i det underliggende
  `authenticateAdmin`/`isAuthenticated`-oppsettet er i bunn og grunn
  solid — problemet lå i to spesifikke GET-endepunkter som glemte
  middlewaren, ikke i selve mekanismen.
- **Migrasjonsdisiplinen** (idempotente `CREATE TABLE IF NOT EXISTS`,
  registrert i en eksplisitt oppstartsliste) gjorde det raskt å legge til
  de manglende tabellene uten risiko for eksisterende data.
- **Content-versjonering** (`content_versions`/`cms_activity_log`) er en
  godt gjennomtenkt arkitektur — de fleste hullene som ble funnet var
  mangler i hvilke typer som var *koblet til* systemet, ikke feil i
  systemet selv.
- **Markdown-/rich-text-rendring** (`LegalRichText` m.fl.) fungerte
  korrekt overalt den ble testet.

## Skjermbilder

Ingen skjermbilder i denne runden — verifisering skjedde utelukkende
tekst-/DOM-basert (Playwright) og via kildekodegjennomgang, av hensyn til
samtalens størrelse.
