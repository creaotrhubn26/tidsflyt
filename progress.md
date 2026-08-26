# BOLA-sikkerhetsfikser — fremdriftsstatus

Branch: `codex/halden-krav-integrasjon` (første samlecommit `7562c5d`)
Sist oppdatert: 2026-08-26

## Oppsummering

De to opprinnelige BOLA-funnene og den etterfølgende database-, transaksjons-
og avhengighetsherdingen er samlet i commit `7562c5d` og pushet til den
ikke-deployerende integrasjonsgrenen. En ny bred BOLA/IDOR-runde har deretter
funnet og lukket objektlekkasjer i eksport, faktura, saksrapport,
rapportkommentar, rapportmal, rapportressurs og PDF-/historikkflyt. Migrasjon
067 og 068 er varig brukt og verifisert på utviklingsdatabasen.

## 1. `server/smartTimingRoutes.ts` — company logs/audit + vendor-admin-invite

**Funn:**
- `GET /api/company/logs` og `GET /api/company/audit` manglet tenant-scoping — enhver innlogget admin kunne lese en annen virksomhets logger.
- `POST /api/vendors/:id/admins` tillot kontoovertakelse: en angriper kunne invitere en e-post som allerede tilhørte en annen virksomhet, og UPDATE-en overskrev offerets `vendor_id`/rolle ubetinget.

**Fiksrunder (commits `0ff6779` → `9ff5798` → `570ceb9`):**
1. La til `vendorId` i `authenticate()`s sesjonsgren + tenant-sjekk på de to GET-rutene + første TENANT_MISMATCH-vakt på invite-ruten (kun `users`-tabellen).
2. Utvidet vakten til også å sjekke `tidum_company_users` og `tidum_admin_users`.
3. Kollapset de tre separate oppslagene til én `UNION ALL`-spørring med `::text`-cast (løste `tidum_admin_users.vendor_id` varchar-vs-number-mismatch og en `LIMIT 1`-uten-`ORDER BY`-bypass).

**Status:** Lukket, verifisert (26/26 tester, `tsc` rent), pushet.

## 2. `server/routes.ts` — access-request-godkjenning (confused deputy → kontoovertakelse)

**Funn:** `POST /api/access-requests` lar en angriper oppgi en vilkårlig e-post (`alt_hovedadmin_email`). Når en super_admin godkjenner forespørselen, skrev `ensureHovedadminForAccessRequest`/`syncApprovedPortalUser` ubetinget offerets `tidum_admin_users`/`users`-rad med angriperens `vendorId` og et passord angriperen kontrollerte.

**Fiksrunder:**
1. (`bacfc79`) TENANT_MISMATCH-vakter i begge hjelpefunksjonene + kompensernde revert av `access_requests`-raden i en manuell try/catch.
2. (`890df42`, runde 4) Uavhengig gjennomgang av runde 1 fant: delvis skriving kunne overleve en 409 (en foreldreløs `tidum_admin_users`-rad ble stående og kunne senere kapres via det ubeskyttede `POST /api/auth/email/request-link`-endepunktet), en case-sensitivitets-bypass i én av vaktene, og en brukket INSERT-gren (manglet NOT NULL `username`/`password`, som også hindret kompenserende revert fra å trigge). Løst ved å:
   - Pakke hele skrivesekvensen (`accessRequests`-oppdatering + begge hjelpefunksjoner) i én `db.transaction(...)` — enhver feil ruller nå automatisk tilbake ALT, ikke bare navngitte feilstrenger.
   - Normalisere e-post til lowercase én gang i `applyAccessRequestDecision`, og gjøre `syncApprovedPortalUser`s oppslag case-insensitivt.
   - Fikse INSERT-grenen til å speile det etablerte mønsteret i `smartTimingRoutes.ts` (username/password-placeholder for `users`-tabellens legacy NOT NULL-kolonner).
   - Fjerne rå SQL/feilmeldinger fra 500-responser i begge kallende ruter.
3. (lokal runde 5) Ny gjennomgang fant at bulkimporterte identiteter som kun fantes i `tidum_company_users` ikke ble kontrollert, og at SELECT-deretter-UPSERT kunne omgås av to samtidige godkjenninger. Løst ved å:
   - behandle tenant-eierskap i alle tre identitetstabeller som autoritativt;
   - avvise dersom **noen** case-insensitiv e-postmatch tilhører en annen tenant;
   - gjøre `tidum_admin_users`-UPSERT-en atomisk med tenant-vilkår og kontroll av `RETURNING`;
   - validere leverandør-ID og teste to samtidige godkjenninger av samme e-post.

**Status:** Lukket og pushet i `7562c5d`. Runde 4s live probe bekreftet den
opprinnelige kjeden død. Runde 5 har 8/8 dedikerte integrasjonstester,
inkludert bulkimport og samtidighet. Baselinesuiten var grønn 443/443,
`tsc` var rent og produksjonsbuild var grønn før push.

## 3. Avhengighetsherding etter `94f46c5` (pushet i `7562c5d`)

- Oppgradert sikkerhetsberørte direkte og transitive avhengigheter, blant annet
  Express, Multer, DOMPurify, Nodemailer, Sharp, WebSocket, Vite og Vitest.
- Fjernet ubrukt `react-quill`; `react-quill-new` bruker eksplisitt Quill 2.0.2.
  ExcelJS bruker `uuid` 11.1.1 gjennom en avgrenset override.
- Løftet deklarert runtime og begge Docker-steg fra Node 20 til Node 24.
- Gjort `npm audit --audit-level=moderate` blokkerende i CI og lagt til en fast
  kompatibilitetsprøve for Nodemailer, Sharp, ExcelJS, Quill og Puppeteer.

**Status:** Lokal arbeidsflate har 0 funn i full `npm audit --audit-level=low`
etter ren `npm ci`; 48/48 DB-uavhengige sikkerhetstester og 5/5
bibliotekrøykprøver er grønne. Etter de siste sikkerhetsendringene er hele
Vitest-suiten kjørt på nytt mot Neon-utviklingsdatabasen: **443/443 tester i
63/63 testfiler besto**. Før/etter-kontroll var identisk for de fulgte
tabellene (`users=5`, `tidum_roles=12`, `tidum_role_permissions=9`,
`tidum_company_users=8`, `tidum_admin_users=0`, `tidum_vendors=0`,
`tidum_frister=0`) og ingen tilgangstest-rader ble stående. `tsc` er rent og
produksjonsbuild er grønn. Testharnesset har i tillegg fått test-only
`SESSION_SECRET`, eksplisitt auth-bypass i testene som trenger det, og vern mot
at midlertidige testapper starter cronjobber eller seedere, også når en test
midlertidig endrer `NODE_ENV`. Endringene er pushet i `7562c5d`.

## 4. Leverandørskjema og tilgrensende herding (pushet i `7562c5d`)

- Migrasjon `066_tidum_vendors.sql` oppretter den kanoniske, Tidum-eide
  `tidum_vendors`-tabellen. Den eksisterende CreatorHub-eide `vendors`-tabellen
  er bevisst urørt (`vendors.id` er fortsatt `varchar`; `tidum_vendors.id` er
  `integer`).
- `tidum_admin_users.vendor_id` og `tidum_frister.vendor_id` er konvertert til
  `integer`. `tidum_frister_vendor_id_fkey` peker til `tidum_vendors(id)` og er
  fullt validert i utviklingsdatabasen.
- `ensureVendorForAccessRequest` bruker nå det faktiske skjemaet og kjører i
  samme transaksjon som forespørselsstatus og identitetsprovisjonering. En
  senere 409/feil ruller derfor også tilbake en ny tenant.
- Det predikerbare legacy-passordet er erstattet av 32 kryptografisk tilfeldige
  byte før bcrypt. Magisk lenke er fortsatt den reelle inviteringsmekanismen.
- `POST /api/cms/setup` oppretter eller nullstiller ikke lenger en konto med
  hardkodet `admin123`.
- JWT-er med streng-ID sendes ikke lenger til PostgreSQLs integer-cast for
  `tidum_admin_users.id`; riktig ID-rom velges uten forventede databasefeil.

**Databasebevis:** migrasjon 066 er anvendt idempotent mot utviklingsdatabasen;
skjematestene bekrefter tabellseparasjon, typer, unik organisasjonsnummerindeks
og validert fremmednøkkel.

## 5. Bred BOLA/IDOR-runde — eksport, faktura og saksrapport

**Funn:**

- `GET /api/export/{excel,csv,pdf}` godtok vilkårlig `userId`; `all` fjernet
  alle bruker- og tenantvilkår og ga enhver innlogget bruker global eksport.
- Fakturarutene brukte bare objekt-ID og stolte på klientstyrt `userId`.
  Liste, lesing, endring, sletting, generering og «PDF» kunne krysse brukere og
  tenants. PATCH var mass assignment, sletting var ikke eierskapskontrollert,
  og «PDF» var usanitert HTML. Koden pekte dessuten på CreatorHubs
  inkompatible `invoices`-tabell, slik at normal opprettelse var brukket.
- Saksrapporter kunne listes for vilkårlig `user_id` og leses, endres, slettes
  eller sendes inn ved å endre ID. Klienten kunne sette `approved` selv.
  Interne kommentarer kunne hentes med `include_internal=true`, og
  `authenticateAdmin`-rutene manglet både rollekontroll og tenant-filter.
  Samme mønster gjaldt rapportmaler, ressurser, PDF-generering og historikk.
- Oppstartsfunksjonen kunne droppe hele `tidum_case_reports` dersom den fant et
  eldre skjema.

**Fiks:**

- Eksport er egenbruk som standard. Bare lederroller med gyldig `vendor_id`
  kan velge annen bruker eller `all`, og databasespørringen beholder alltid
  tenantvilkåret. Datoer og periode valideres, rå databasefeil skjules,
  regnearkformler nøytraliseres og HTML-felt escapes.
- Migrasjon 067 oppretter egne `tidum_invoices`/`tidum_invoice_items` uten å
  endre CreatorHub-tabellen. Alle fakturaoperasjoner bruker serveravledet
  bruker + tenant, PATCH har feltliste, opprettelse er transaksjonell, FK-
  cascade gjør sletting atomisk, klient/API-kontrakten er samstemt og PDFKit
  produserer en reell PDF.
- Saksrapport- og kommentaroperasjoner bruker serveridentitet, eier og tenant.
  Status kan bare endres gjennom eksplisitte arbeidsflytruter. Adminruter
  krever leder/adminrolle og er tenantskopet; globale systemblokker kan bare
  seedes av global `super_admin`. Maler, ressurser, generering og historikk har
  samme scope. Destruktiv startup-drop er fjernet.
- Migrasjon 068 gjør `case_reports.vendor_id` obligatorisk etter entydig
  backfill og legger validerte cascade-FK-er fra kommentarer og historikk.

**Bevis:** 18/18 nye sikkerhetstester består. Saksrapporttestene bruker to
tenants i ekte Neon-utviklingsdatabase og dekker rapporter, kommentarer,
maler, ressurser, PDF-generering og historikk. Fire fakturatester verifiserer
liste/lese/endre/slette/PDF, avvist fremmed `userId`, serveravledet eierskap,
tenantavgrensede timelinjer, beløpsberegning, reell PDF og FK-cascade.
Migrasjon 067/068 er både rollback-prøvd og varig anvendt; `vendor_id` er
obligatorisk, fremmednøkler er validerte og CreatorHubs eldre fakturatabell er
urørt. Testfiksurer er ryddet. En full kjøring ga 454 beståtte og tre
timeout/ECONNRESET-feil under en treg delt DB-forbindelse; de tre berørte
filene besto deretter isolert 8/8, 7/7 og 13/13. `tsc` er rent.

Produksjonsbuild og `tsc` er grønne etter endringene.

**Status:** Denne avgrensede runden er lukket med migrasjon og
databaseintegrasjonstest. Full systemomfattende BOLA-matrise og ekstern
uavhengig pentest gjenstår som egne leveranseaktiviteter.

## Kjent rest utenfor denne avgrensede fiksen

- De tre tidligere følge-buggene (feil vendors-skjema, vendor utenfor
  transaksjon og predikerbar passordentropi) er nå rettet.
- De åtte eksisterende radene i `tidum_company_users` var til stede før dette
  testløpet og ble ikke slettet uten uttrykkelig beslutning om datarydding.
- Første brede BOLA/IDOR-pakke er gjennomført for generisk eksport, faktura og
  den eldre saksrapport-/rapportdesignerflyten. Øvrige saker, rapportmål og
  aktiviteter, e-postmaler, filer, søk, bakgrunnsjobber og CMS/adminflater
  gjenstår i den systematiske endepunktsmatrisen.
- `syncApprovedPortalUser`s tvilling i `smartTimingRoutes.ts` har allerede
  korrekt username/password-håndtering; ingen handling er nødvendig for akkurat
  dette punktet.
