# BOLA-sikkerhetsfikser — fremdriftsstatus

Branch: `codex/halden-krav-integrasjon` (første samlecommit `7562c5d`)
Sist oppdatert: 2026-08-26

## Oppsummering

De to opprinnelige BOLA-funnene og den etterfølgende database-, transaksjons-
og avhengighetsherdingen er samlet i commit `7562c5d` og pushet til den
ikke-deployerende integrasjonsgrenen. En ny bred BOLA/IDOR-runde har deretter
funnet og lukket objektlekkasjer i eksport, faktura, saksrapport,
rapportkommentar, rapportmal, rapportressurs og PDF-/historikkflyt. Migrasjon
067, 068 og 069 er varig brukt og verifisert på utviklingsdatabasen. Den
ordinære e-postkomponisten er nå også tenantskopet. Sensitive
barnevernsopplysninger er sperret fra ordinær e-post og manuelle e-postomveier.
Backendgrunnmuren og første operative brukerflyt for «Sikker sending» er nå
implementert og måltestet for både kommuneansatt og innbygger. Arkiv,
formell tilgjengelighetsverifikasjon, faktisk ClamAV-produksjonsprøving og
eID-produksjonsprøving gjenstår før funksjonen kan merkes produksjonsklar.

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

## 6. E-postkomponist — maler, utkast, historikk, vedlegg og planlagt sending

**Funn:** `/api/email/*` brukte globale maler og historikk, og objekt-ID-er for
maler og utkast manglet tenant-/eierskapskontroll. Klientstyrt `targetUserId`
kunne hente en annen brukers timelinjer. Vedlegg ble hentet fra vilkårlige
URL-er på serveren, som ga SSRF og ingen kontrollerbar fileier. Parallelle
appinstanser kunne sende samme planlagte utkast flere ganger. Uvalidert HTML,
malvariabler og e-posthoder ga dessuten injeksjonsrisiko, og rå feil ble sendt
til klienten.

**Fiks:**

- Migrasjon 069 etablerer egne Tidum-eide tabeller for komponistmaler,
  utsendingshistorikk og private vedleggsmetadata, samt obligatorisk
  `vendor_id` på utkast. CreatorHubs inkompatible `email_templates` er urørt.
- Alle komponistruter bruker serveravledet bruker og tenant. Private maler,
  utkast, historikk og vedlegg krever både `vendor_id` og `user_id`; globale
  systemmaler er lesbare, men ikke redigerbare av tenantbrukere.
- Rapportvedlegg er egenbruk som standard. Bare lederroller kan velge en annen
  bruker, og timelinjespørringen beholder alltid tenantvilkåret.
- Vilkårlige vedleggs-URL-er er fjernet. Opplasting går til privat katalog med
  tilfeldig lagringsnavn, MIME-/signaturkontroll, 10 MB per fil, døgnkvote og
  eierbundet UUID. Sending leser bare eide metadata/filer, uten nettverkskall.
- HTML og malvariabler saniteres/escapes, mottakere og emne normaliseres,
  Reply-To valideres og klienten får ikke rå database-/SMTP-feil.
- Planlagte utkast claim-es atomisk med `FOR UPDATE SKIP LOCKED`. En tvetydig
  SMTP-feil blir stående til manuell gjennomgang og auto-retryes ikke, slik at
  systemet ikke risikerer dobbel ekstern utsending.
- AI-utkast er avslått med mindre både nøkkel og eksplisitt
  `ALLOW_AI_EMAIL_DRAFTS=true` er satt. Resultatet saniteres før bruk.
- Migrasjon 067–069 er registrert i startup-rekkefølgen; dette lukker også et
  distribusjonshull der 067/068 tidligere bare var brukt manuelt i
  utviklingsdatabasen.

**Bevis:** Migrasjon 069 er først rollback-prøvd og deretter varig anvendt i én
transaksjon på Neon-utviklingsdatabasen. 15/15 målrettede tester består, hvor
to-tenant-testen dekker fremmede maler, utkast, historikk, teammedlemmer,
rapportmål, SSRF-input og vedleggs-ID-er. Etter testen var antall gjenværende
fiksurer og testfiler null. `tsc` og produksjonsbuild er grønne.
Hele Vitest-suiten besto deretter med **475/475 tester i 68/68 testfiler**.

**Avgrensning:** Dette gjør ordinær SMTP-komponering til en sikrere intern og
administrativ byggekloss. Det gjør ikke SMTP til sikker ekstern
barnevernsdialog. Sensitive opplysninger skal fortsatt bruke en godkjent kanal
med partsmodell, tilgangs-/oppslagslogg, sikker dokumentdeling og avtalt
lagrings-/retensjonsarkitektur. CreatorHub/CMS-rutene under `/api/cms/email/*`
bruker en separat global modell og gjenstår i CMS/admin-pakken.

## 7. Sikker sending — ordinær e-post sperret for barnevernsinnhold

**Mål:** En barnevernsbruker skal ikke måtte forstå SMTP, SvarUt eller teknisk
kanalvalg. Brukerflaten skal etter hvert bare ha handlingen **«Send sikkert»**;
Tidum velger leveringsmåten i bakgrunnen. Før sikker dialog er ferdig koblet
opp, skal systemet feile lukket uten å tilby manuell e-post som omvei.

**Gjennomført i denne pakken:**

- Migrasjon 070 legger til en varig `sensitive_smtp_blocked`-sperre på tenant
  og en egen policyhendelseslogg. Sperren aktiveres automatisk når tenant får
  en barnevernsinstitusjon, og blir stående selv om institusjonen senere
  deaktiveres eller omklassifiseres.
- E-postkomponisten sperrer fri tekst, malbasert sending, utkast, planlagte
  sendinger, AI-utkast og vedleggsopplasting for barnevernstenants. Rapport- og
  saksdokumentkategorier sperres også for andre tenants.
- Rapportvideresending sperrer både direkte e-post og den tidligere manuelle
  kombinasjonen av nedlasting og `mailto`. Automatisk videresending av godkjent
  saksrapport er fjernet fra e-postløpet.
- E-posttjenesten krever eksplisitt formål på alle kall. Saksinnhold og den
  eldre timeliste-med-vedlegg-funksjonen feiler lukket. Manglende eller ukjent
  klassifisering feiler også lukket.
- E-postvarsler om rapport, timegodkjenning, fravær, avvik og rapportfrist er
  gjort nøytrale: de ber mottakeren logge inn og inneholder ikke navn,
  saksdetaljer, perioder, kommentarer eller vedlegg. Den fremtidige sikre
  dialogen har en låst varselmal som ikke kan fylles med fri tekst.
- Policyloggen lagrer bare en eksplisitt liste med ufølsomme tekniske felter;
  mottaker, emne, melding og dokumentinnhold lagres ikke der.
- Brukerflaten viser nå «Bruk Sikker sending» og forklarer at funksjonen er
  under oppsett. Tekniske kanalnavn er fjernet fra meldingen til
  barnevernsbrukeren.
- Tilgrensende herding i rapportflyten lukker kryss-tenant-eksport, validerer
  mottaker/periode/rapporttype og krever autentisert fileier for midlertidige
  rapportnedlastinger.

**Verifikasjon:** Migrasjon 070 er anvendt idempotent på
Neon-utviklingsdatabasen. 21/21 målrettede tester og hele Vitest-suiten på
**485/485 tester i 70/70 testfiler** består mot databasen. `tsc`, designkontroll
og produksjonsbuild er grønne. Bygget har kun kjente, ikke-blokkerende varsler
om nettleserdata, én eksisterende Tailwind-verdi og store chunks.

**Videre før produksjonsåpning:** Handlingen «Sikker sending» er nå koblet til
parts-/mottakermodell, sikker dialog, innbyggerinnboks, kryptert lagring,
autorisasjon, oppslagslogg, nøytralt varsel og lesekvittering. Retensjon,
arkiv, malwarekarantene, formell WCAG-verifikasjon og ende-til-ende-prøving mot
produksjonstenantene for BankID/Buypass gjenstår. Kommunal ekspedering kan
kobles til samme brukerhandling senere; kanalvalget skal ikke skyves ut til
brukeren.

**Status:** Første sikker-sending-pakke er teknisk ferdig og feiler lukket.
Kravet om faktisk sikker ekstern dialog er **ikke** ferdig før punktene over er
implementert og verifisert.

## 8. Sikker dialog — backendgrunnmur for part, eID og dokumentdeling

**Avgrensning:** Første konkrete saksobjekt er kommunens
`tidum_barnevern_meldinger`. Dette er ikke en påstand om at full
undersøkelses-/vedtaks-/klagesak er ferdig. API-et er grunnmuren som senere kan
kobles til disse objektene uten at ordinær e-post blir transport for innholdet.

**Gjennomført:**

- Migrasjon 071 etablerer kommunebundne parter, tidsbegrenset sakstilgang,
  samtaler, deltakere, meldinger, private vedlegg, lesekvitteringer,
  append-only audit og transaksjonell varslings-outbox. Sammensatte
  fremmednøkler binder alle saksobjekter til samme kommune.
- Portalbrukere har rollen `innbygger`, ingen e-postinnlogging og ingen
  tenant-/ansattrolle. Fødselsnummer HMAC-es umiddelbart og lagres aldri i
  klartekst. Portalrollen kan ikke tildeles fra ordinær brukeradministrasjon.
- Første verifiserte BankID- eller Buypass-innlogging fullfører den
  forhåndsregistrerte identiteten. Senere bruk av den andre leverandøren
  kobles til samme bruker. Mobil BankID bruker samme oppløsningslogikk.
- Partstilgang krever både aktiv sakstildeling, aktiv samtaledeltakelse og en
  aktuell BankID-/Buypass-autentisert sesjon med tilsvarende eID-rad. E-post-
  eller Google-sesjon alene gir ikke partsinnsyn. Ansattinnsyn hentes fra
  brukerens kommune og rolle i databasen; klientens tenantdata brukes ikke.
- Samtaleemne og meldingstekst lagres AES-256-GCM-forseglet og feiler lukket
  uten `TIDUM_SECRET_KEY`. Vedlegg lagres privat i objektlager med tilfeldig
  nøkkel, størrelse-/MIME-/signaturkontroll, SHA-256-verifikasjon og
  server-side-kryptering.
- Utkast kan bare endres av forfatteren. Sendte meldinger, sendte vedlegg og
  auditposter er uforanderlige med database-triggere, også ved direkte SQL.
  Tilgangstilbakekalling fjerner innsyn umiddelbart og logges i hver berørt
  samtale.
- SMTP brukes bare til en låst, nøytral «du har en ny melding»-mal. Mottaker,
  sak, part, emne, fritekst og vedlegg sendes ikke i e-posten eller audit-
  metadataene.
- Migrasjon 072 legger til indeks for tenantavgrenset partsoppslag og en egen
  append-only `party_listed`-hendelse. Ansatt-API-et lister bare aktive parter
  fra serveravledet kommune, verifiserer valgt melding i samme kommune og
  returnerer aldri fødselsnummer eller fødselsnummerhash.
- Kommuneansatte med rollen `barnevernsleder` eller `kommune_saksbehandler`
  har nå en responsiv «Sikker sending»-flate. De velger bekymringsmelding,
  registrerer eller velger part, gir sakstilgang og sender kryptert melding og
  eventuelt privat vedlegg uten å velge SMTP eller sende `kommuneId` fra
  klienten.
- Innbyggere har en separat `/innbygger`-portal for å lese og svare i aktive
  samtaler, laste ned autoriserte vedlegg og få enkel BankID-/Buypass-
  veiledning ved avvist tilgang. Leverandørmenyer og offentlig analyse er
  fjernet fra både innbyggerflaten og kommuneportalens desktop-/mobilmeny.

**Verifikasjon:** Migrasjon 071 og 072 er anvendt og kjørt idempotent mot
Neon-utviklingsdatabasen. API-ende-til-ende-testen dekker samme portalbruker med
BankID og Buypass, fravær av rått fødselsnummer, kryptert innhold, privat
vedlegg, nøytralt varsel, lesekvittering, audit, direkte SQL-uforanderlighet,
kommune B, part uten tildeling, e-postsesjon og umiddelbar tilbakekalling.
Nye Playwright-scenarier dekker ansattsending, innbyggersvar, avvist innboks og
rolleisolert mobilnavigasjon med **4/4 bestått**; testen bekrefter også at
klienten ikke sender tenant-ID. Hele
Vitest-suiten består med **514/514 tester i 71/71 testfiler** mot
utviklingsdatabasen. `tsc`, designkontroll, produksjonsbuild og
`npm audit --audit-level=moderate` er grønne; audit rapporterer 0 sårbarheter.
Builden har kun kjente, ikke-blokkerende varsler om nettleserdata, én
eksisterende Tailwind-verdi, store chunks og Node sin `module.register`-
deprecation.

**Gjenstår før produksjonsåpning:**

- formell WCAG 2.2-verifikasjon med tastatur, skjermleser og dokumentert
  akseptanse hos fagbrukere/innbyggere;
- arkivering av dialog og dokumenter til kundens arkivkjerne, retensjon,
  juridisk sperring og nøkkelrotasjon;
- produksjonsbevis mot BankID/Buypass-tenanter og avklaring med Halden dersom
  anskaffelsen krever ID-porten i stedet;
- utvidelse fra bekymringsmelding til full barnevernssak, innsyn, klage,
  fullmakt/samtykke og eventuell SvarUt/SvarInn-ekspedering.

**Status:** De seks backenddelene og begge første brukerflater er implementert
og måltestet. Løsningen er fortsatt ikke merket produksjonsklar eller
presentert som full oppfyllelse av krav 8 før punktene over er levert og
akseptert.

## 9. Sikre vedlegg — fail-closed malwarekontroll og karantene

**Gjennomført:**

- Migrasjon 073 merker eksisterende vedlegg som `pending`, legger skannebevis
  på rene vedlegg og etablerer en separat, kommunebundet karantenetabell med
  tilfeldig privat lagringsnøkkel, utløp, slettestatus og retry.
- En intern adapter bruker ClamAVs binære `INSTREAM`-protokoll direkte over
  privat TCP, uten shell-kall eller ny npm-avhengighet. Bare eksplisitt `OK`
  godtas som rent; `FOUND`, feil, timeout og tvetydige svar feiler lukket.
- Rene filer beholder eksisterende MIME-, signatur-, størrelse- og SHA-256-
  kontroll før privat lagring. Et rent skannebevis kreves både ved sending og
  nedlasting. Eldre/uskannede vedlegg kan derfor ikke passere etter migrasjon.
- Detekterte filer lagres under `secure-dialog-quarantine/`, eksponeres aldri
  gjennom API-et og returnerer kun en nøytral 422 til brukeren. Signaturen
  lagres i karanteneposten, men returneres eller auditlogges ikke.
- Manglende/utilgjengelig skanner gir 503, ingen fillagring og en ufølsom
  audit-hendelse. En timejobb sletter utløpt karantene og prøver lagringsfeil
  på nytt uten filnavn eller innhold i logger.
- Render-konfigurasjon, `.env.example` og
  `docs/runbooks/sikre-vedlegg-malware-og-karantene.md` dokumenterer privat
  nettverk, miljøvariabler, EICAR-akseptanse, signaturoppdatering og alarmkrav.

**Verifikasjon:** Migrasjon 073 er kjørt idempotent mot
Neon-utviklingsdatabasen. **12/12 målrettede tester** dekker ClamAV-svar,
rent vedlegg, EICAR-karantene, skjult signatur, skannerutfall, blokkert
`pending`-vedlegg, manglende nedlasting, audit og utløpt karantenesletting.
Hele Vitest-suiten består med **518/518 tester i 72/72 testfiler** mot
utviklingsdatabasen. De fire sikre-dialog-scenariene i Playwright er grønne,
inkludert at saksbehandleren kan fjerne et vedlegg før sending. `tsc`,
designkontroll, produksjonsbuild og `npm audit --audit-level=moderate` er
grønne; audit rapporterer 0 sårbarheter.

**Avgrensning:** Testene bruker en kontrollert skannermock for
applikasjonsflyten. Før produksjonsåpning må en privat ClamAV-tjeneste
deployes, signatur-/helseovervåkes og bestå samme EICAR-test i faktisk
produksjonsarkitektur. Dette er et driftsakseptansepunkt, ikke manglende
fail-closed applikasjonskontroll.

## 10. Sikker dialog — arkiv, retensjon, juridisk sperring og nøkkelrotasjon

**Gjennomført:**

- Migrasjon 074 utvider den eksisterende Documaster/Noark-outboxen fra ren
  leverandør-tenant til gjensidig utelukkende leverandør eller kommune, med
  sammensatte fremmednøkler til bekymringsmeldingen og tenantformkontroller.
- Lukking av en sikker dialog oppretter/reaktiverer `secure_dialog`-oppføringen
  i samme databasetransaksjon som statusendringen og append-only audit.
- Arkivarbeideren claimer rader atomisk, frigir foreldede claims og bruker
  providerens ekstern-ID for replay. Dialogpakken inneholder deterministisk
  JSON-manifest, transkript, audit-hash, dokumentkontrollsummer og alle rene
  vedlegg etter ny SHA-256-kontroll. Arkivkvitteringen lagrer mappe,
  journalpost, dokumentantall og payload-hash.
- Kommune-arkivstatus, logg og retry leser rolle og tenant på nytt fra
  databasen. To-kommune-testen avviser både fremmed logginnsyn og fremmed retry.
- Retensjon er avslått som standard og har ingen innebygd juridisk periode.
  Bare `barnevernsleder` kan aktivere en eksplisitt kommune-policy eller
  legge på/frigi juridisk sperring. Lokal sletting krever avsluttet samtale,
  forfalt policy, vellykket arkivkvittering og fravær av aktiv sperring.
- Retensjonsjobben skjuler samtalen som `purging`, sletter private filer
  idempotent og fjerner lokal tekst/vedlegg/kvitteringer i én transaksjon.
  Samtaletombstone, arkivkvittering og audit beholdes; feil retries med backoff.
- Nye sikker-dialogverdier bruker tilfeldig datanøkkel i en `sdc:v1`-
  konvolutt. Den versjonerte nøkkelringen pakker bare om datanøkkelen, mens
  databasevakten krever byte-identisk innholdschiffer for sendte meldinger.
  Samme timejobb roterer også arkivhemmeligheter, FIKS-privatnøkkel og
  kryptert FIKS-rålogg før en gammel servernøkkel kan tas ut.
- `.env.example`, Render-kontrakten, Documaster-dokumentasjonen og
  `docs/runbooks/sikker-dialog-arkiv-retensjon-og-nokkelrotasjon.md` beskriver
  sikker aktivering, nullrestkontroll, rollback og kundens beslutningspunkter.

**Verifikasjon:** Migrasjon 074 er rollback-validert, varig anvendt og kjørt
idempotent mot Neon-utviklingsdatabasen. 28/28 målrettede tester dekker
nøkkelring/ompakking, uendret innholdschiffer, Noark-byggere, deterministisk
manifest, transaksjonell kø, kontrollsum, tre dokumentopplastinger, arkivbevis,
idempotent replay, to-kommune-BOLA, arkiv-før-sletting, juridisk sperring,
vellykket purge og produksjonskrav til eksplisitt arkivvertliste. Hele
Vitest-suiten består med **527/527 tester i 72/72 testfiler**, og den eksisterende
sikker-dialogflyten består med **8/8 Playwright-tester** på desktop og mobil.
Testfiksurer for arkiv/policy/sperring er kontrollert til null. `tsc`,
designkontroll og produksjonsbuild er grønne, og `npm audit` rapporterer
0 sårbarheter.

**Avgrensning:** Noark-flyten er testet mot kontrollert transportmock, ikke
Haldens faktiske Documaster/Elements-tenant. Ingen retensjonsperiode er aktivert
for Halden. Produksjonsakseptanse krever kundens kodelister, administrative
enhet, testlegitimasjon, retensjonsvedtak og godkjent KMS/hvelv.

## 11. Documaster — implementeringsoppstart uten kundetenant

**Gjennomført:**

- Migrasjon 075 og Drizzle-kontrakten legger til en valgfri, tenantbundet
  `token_url`, slik at Documaster-IDP kan ligge på en annen vert enn arkiv-API.
- Token-URL følger UI → API → kryptert config → tilkoblingstest → arkivworker.
  Både API- og IDP-vert må være eksplisitt allowlistet i produksjon, URL-er med
  query/legitimasjon avvises og transporten følger ikke HTTP-redirects.
- Token-cachen skiller nå på faktisk token-endepunkt, client ID og hash av
  secret; endret IDP kan derfor ikke maskeres av et tidligere token.
- UI/API-kontrakten er samstemt: `barnevernsleder` ser og kan konfigurere
  kommunens arkivkort, mens `kommune_saksbehandler` fortsatt får 403 og ingen
  vendor-/PowerOffice-administrasjon.
- En deterministisk transportkontrakttest dekker token, query, Noark-actions,
  saksmappe, dokument/dokumentversjon, upload og ekstern-ID-idempotens uten å
  utgi dette for kundesandkassebevis.
- `docs/runbooks/documaster-implementeringsoppstart.md` fordeler ansvar mellom
  Halden, arkivleverandøren og Tidum, beskriver beslutningsport, konfigurasjon,
  akseptanseløp, bevis, go/no-go og rollback. Sandkasse- og
  integrasjonsdokumentasjonen er korrigert tilsvarende.
- Den ubeviste offentlige formuleringen «Testet mot en ekte
  Documaster-instans» er erstattet med korrekt status i både integrasjonssiden
  og standard blogginnhold.

**Verifikasjon:** Migrasjon 075 er rollback-validert, varig anvendt og kjørt
idempotent mot Neon-utviklingsdatabasen. **40/40 målrettede tester i fem
testfiler** dekker transportkontrakt, IDP-cache, URL-policy, tenant-API,
rollegrense og startup-rekkefølge. Hele Vitest-suiten består med **539/539
tester i 74/74 testfiler**. Arkivkortet og separat IDP-konfigurasjon består med
**2/2 Playwright-tester** på desktop og mobil. Testbrukere, testkommuner,
arkivconfig og arkivoppføringer er kontrollert til null. `tsc`, designkontroll,
produksjonsbuild og `npm audit` er grønne; audit rapporterer 0 sårbarheter.

**Avgrensning:** Haldens faktiske API-generasjon, IDP, kodelister,
nettverkskrav og arkiv-UI kan ikke verifiseres uten kundens/leverandørens
testtilgang. Elements krever egen provider-adapter dersom Halden ikke tilbyr en
Documaster-kompatibel Noark-kontrakt.

## 12. Tilbudsopsjon O1 – Elements-adapter

Elements med avvikende kontrakt er skilt ut som en eksplisitt tilbudsopsjon i
`docs/anbud/2026-112379-halden-opsjon-elements-adapter.md`. Dette følger Bilag
1s føring om at spesialutvikling utover standardprodukt skal prises som
opsjon, samtidig som krav 26 fortsatt besvares ærlig som et E-krav.

Opsjonen gjenbruker Tidums `ArchiveProvider`, Noark-domene, outbox, retry,
idempotens, tenantkontroll og kvitteringer, men omfatter én alternativ
Elements-provider – ikke samtidig dobbelarkivering til Elements og Documaster.
Dokumentet angir inkludert/ekskludert omfang, kundens forutsetninger,
akseptansekriterier, T0-basert plan og prisstruktur for Bilag 2, 3 og 6.

**Kommersiell rest:** Fastpris, årlig forvaltningspris, leveringstid og
utøvelsesfrist er bevisst ikke oppdiktet. Disse feltene må besluttes og fylles i
Bilag 6 før tilbudet kan signeres eller krav 26 kan besvares bindende med
henvisning til O1.

## Kjent rest utenfor denne avgrensede fiksen

- De tre tidligere følge-buggene (feil vendors-skjema, vendor utenfor
  transaksjon og predikerbar passordentropi) er nå rettet.
- De åtte eksisterende radene i `tidum_company_users` var til stede før dette
  testløpet og ble ikke slettet uten uttrykkelig beslutning om datarydding.
- De brede BOLA/IDOR-pakkene er gjennomført for generisk eksport, faktura, den
  eldre saksrapport-/rapportdesignerflyten og den ordinære e-postkomponisten.
  Øvrige saker, rapportmål og aktiviteter, CreatorHub/CMS-e-post, andre filer,
  søk, bakgrunnsjobber og CMS/adminflater gjenstår i den systematiske
  endepunktsmatrisen.
- `syncApprovedPortalUser`s tvilling i `smartTimingRoutes.ts` har allerede
  korrekt username/password-håndtering; ingen handling er nødvendig for akkurat
  dette punktet.
