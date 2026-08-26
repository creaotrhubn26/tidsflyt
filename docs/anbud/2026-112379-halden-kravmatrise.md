# Halden 2026-112379 – verifisert kravmatrise og gjenbruksoversikt

**Statusdato:** 26.08.2026 – revidert etter bred kode-, branch- og databasekontroll

**Leverandør:** Creatorhub AS / Tidum

**Formål:** Én sannhetskilde for hva som faktisk finnes, hva som bare ligger i en gren, og hva som må leveres for å kunne svare bindende i Bilag 2.

Denne matrisen er en intern leveranse- og tilbudskontroll. Den er ikke i seg selv Leverandørens besvarelse. «Delvis» betyr at det finnes reelle byggeklosser, men ikke at anskaffelseskravet er oppfylt som helhet.

## 1. Kontrollgrunnlag

Kontrollen er gjort mot:

- `main` på commit `2caed44`;
- PR #21, `origin/claude/integrasjoner-innhold` på commit `94f46c5`;
- den separate sikkerhetsgrenen `origin/claude/g10-sikkerhetsherding`;
- den separate eID-grenen `origin/claude/bankid-eid-innlogging`;
- den separate QA-grenen `origin/claude/dashboard-visual-qa-dbejmt`;
- `progress.md` i PR #21;
- konkurransegrunnlaget og alle mottatte bilag i `docs/runbooks/`;
- eksisterende compliance-, arkiv-, backup-, integrasjons- og anbudsdokumentasjon i repoet.

### Bevisnivå

| Nivå | Betydning |
|---|---|
| Produksjonsgrunnlag | Kode i `main`; må fortsatt bevises i Haldens målarkitektur og akseptansetest. |
| PR-kode | Implementert og pushet, men ikke merget eller produksjonssatt. |
| Separat gren | Finnes, men er ikke integrert med PR #21 og kan ikke regnes som levert. |
| Prototype/byggekloss | Reell kode som kan gjenbrukes, men dekker et annet domene eller bare en del av kravet. |
| Dokumentasjon | Plan, påstand eller mal; teller ikke som funksjon eller driftsbevis. |
| Mangler | Ingen relevant produksjonsklar implementasjon funnet. |

### Lokal integrasjonsstatus 26.08.2026

Det finnes nå en verifisert integrasjonsgren,
`codex/halden-krav-integrasjon`, med samlecommit `7562c5d`. Grenen er pushet,
men deployer ikke produksjon; `main` er urørt. Etter denne commiten er en
nye BOLA/IDOR-pakker ferdigstilt for eksport, faktura, saksrapporter,
rapportdesigner og ordinær e-postkomponering:

- PR #21 er portet inn, inkludert migrasjon 059–064. Lokal migrasjon 065
  stabiliserer rapportmaler, og migrasjon 066 etablerer en separat Tidum-eid
  `tidum_vendors` uten å endre den fremmed-eide `vendors`-tabellen. Alle filer som kunne
  sammenlignes direkte, har samme blobinnhold som PR-head `94f46c5`; konfliktene
  i rutefilene og migrasjonsrekkefølgen er løst mot dagens `main`.
- Første kritiske QA-pakke er portet: parameterisert oppdatering av rapportmal,
  autentisering/ruterekkefølge for CMS, autentisert opplasting og migrasjon 065
  med nødvendige rapportmalindekser.
- To kompatible G10-pakker er portet selektivt: dev-auth-bypass krever
  eksplisitt opt-in, bearer-, magic-link- og CSRF-token bruker separate
  påkrevde hemmeligheter, ekstern PostgreSQL krever gyldig TLS-sertifikat,
  produksjon svarer med Helmet/CSP/HSTS og sesjonsautentiserte mutasjoner har
  CSRF-vern. Bearer/mobile er eksplisitt unntatt; fetch, offline-kø, XHR og
  unload-sporing er dekket på klientsiden.
- Avhengighetspakken er lukket lokalt: direkte og transitive pakker er
  oppgradert, ubrukt `react-quill` er fjernet, Quill er låst til sikker 2.0.2,
  ExcelJS bruker sikker `uuid`, og Node-/Docker-baseline er løftet til Node 24.
  Full `npm audit --audit-level=low` rapporterer 0 funn etter ren `npm ci`.
- Bevis for pushet baseline: hele Vitest-suiten er grønn mot oppgitt
  Neon-utviklingsdatabase (**443/443 tester i 63/63 testfiler**), i tillegg til
  48/48 DB-uavhengige sikkerhetstester og 5/5 bibliotekrøykprøver.
  Før/etter-kontroll viste identiske radtall for `users`, roller,
  rettigheter, company-users, admin-users, Tidum-vendorer og frister, og ingen
  tilgangstest-rader ble stående. Åtte eksisterende `tidum_company_users`-rader
  var til stede før løpet og er ikke slettet uten en egen dataryddingsbeslutning.
  `npm run check` og produksjonsbygg er grønne. CI-endringen gjør dependency
  audit blokkerende. Den nye BOLA-pakken har 18/18 målrettede tester,
  inkludert ekte databaseflyt med to tenants. En full ny kjøring ga 454
  beståtte og tre DB-timeouter/ECONNRESET; alle tre berørte filer besto
  umiddelbart isolert (8/8, 7/7 og 13/13). Migrasjon 067/068 er varig anvendt
  og constraint-verifisert i utviklingsdatabasen. Fakturaflyten er testet
  ende-til-ende mot de nye tabellene med to tenants og opprydding av fiksurer.
- E-postkomponisten bruker nå egne Tidum-eide tabeller og serveravledet tenant
  og eier for maler, utkast, historikk og private vedlegg. SSRF via
  vedleggs-URL er fjernet, rapportmål er rolle-/tenantkontrollert og planlagt
  sending claim-es atomisk. Migrasjon 069 er varig anvendt; 15/15 tester er
  grønne og alle testfiksurer/-filer ble ryddet. Dette endrer ikke at SMTP ikke
  er en sikker kanal for sensitive barnevernsopplysninger.
  Hele Vitest-suiten besto deretter med 475/475 tester i 68/68 testfiler.

Dette endrer ikke statusen til den offisielle `main`-grenen før grenen er
reviewet, merget og CI-verifisert. Den grønne DB-kjøringen er et
lokalt verifikasjonsbevis, ikke en erstatning for isolert CI-testdatabase,
akseptansetest eller produksjonsbevis.

## 2. Kort konklusjon

Av de 31 kravene er status ved kontrollen:

| Status | Antall | Krav |
|---|---:|---|
| Dokumentert fullstendig oppfylt i dagens samlede løsning | 0 | – |
| Delvis – reelle byggeklosser finnes | 22 | 1, 3–6, 8, 11–20, 22, 24, 26, 27, 29, 31 |
| Mangler / ikke oppfylt / kun tilbudsdokument | 9 | 2, 7, 9, 10, 21, 23, 25, 28, 30 |

Dette betyr ikke at alle 31 må være ferdig kodet 28.08. Det betyr at hvert «JA» i tilbudet må være støttet enten av verifisert eksisterende leveranse eller av en uttrykkelig, finansiert og realistisk forpliktelse til å levere før avtalt akseptanse/produksjonsstart. Et `Skal` som verken er ferdig eller kan forpliktes troverdig, er et stoppkriterium.

## 3. Hva Tidum faktisk har i dag

### 3.1 I `main`

Følgende er reelle, gjenbrukbare produktkomponenter:

- generell saksmodell med saksnummer, klientreferanse, oppdragsgiver, tildeling og lokasjoner i `shared/schema.ts`, `server/sakerRapportRoutes.ts` og `client/src/pages/cases.tsx`;
- rapport- og dokumentflyt med maler, dynamiske felt, godkjenning/retur, kommentarer, PDF-generering og rapport-audit i `server/sakerRapportRoutes.ts`, `server/rapportGenerator.ts`, `server/routes/rapport-template-routes.ts` og rapportflatene i klienten;
- ni systemmaler i kildekoden, herunder barnevernstandard, tiltaksplan etter barnevernsloven § 6-3 og periodisk evaluering. Planmalene dekker blant annet formål, innhold, start/slutt/evaluering, oppfølging, mål, medvirkning, aktiviteter og videre plan;
- egne rapportmål med status/fremdrift og aktivitetslogg med dato, tid, type, sted og internnotat, samt rapportperioder, signaturfelt og ledergodkjenning;
- rapportbygger, analysevisning og eksportkomponenter i `client/src/components/cms/advanced-case-report-builder.tsx`, `case-analytics-dashboard.tsx` og `case-report-export.tsx`;
- CSV-/Excel-eksport og dokumentgenerering, primært for tids- og rapportdata, i `server/lib/export-service.ts` og tilhørende ruter;
- interne personlige oppgaver, varsler, fristpåminnelser, rapportpåminnelser og eskalering av forfalte timelister;
- flere audit-spor for rapporter, timelinjer, adminaktivitet og virksomhetshendelser;
- GDPR-funksjoner for brukerdataeksport, anonymisering/sletting og retensjon i `server/routes/gdpr-routes.ts` og `server/lib/gdpr.ts`;
- Documaster/Noark-adapter med outbox, retry og idempotens for rapportarkivering i `server/lib/archive/` og `server/routes/archive-routes.ts`;
- generell multi-tenant RBAC og rollehierarki;
- direkte BankID- og Buypass ID-innlogging i `main`, med OIDC, PKCE/state/nonce, FNR-hash, forhåndskobling av forventet identitet og web-/mobilløp;
- PowerOffice-integrasjon for godkjente timelister, leverandørspesifikk ansattmapping og automatisk/manuell push;
- vendor-avgrenset lønnseksport til CSV-formater for Tripletex, Visma Lønn, PowerOffice og Fiken;
- ansattimport med forhåndsvisning, validering, bekreftelse og rollback, samt
  en fakturaprototype. BOLA-pakken samstemmer klient/API, skiller ut
  Tidum-eide fakturatabeller, tenantskoper alle operasjoner og produserer reell
  PDF. Migrasjon og DB-ende-til-ende-test er gjennomført, men dette er fortsatt
  en smal leverandørfakturaflyt og ikke full klientøkonomi;
- e-postmaler, eierbundne private vedlegg, utkast, atomisk claim av planlagt
  utsendelse og tenantavgrenset historikk. Dette er ordinær SMTP, ikke sikker
  ekstern barnevernsdialog eller Outlook-integrasjon;
- avviksmodul med alvorlighetsgrad, kategori, oppfølging, ledervarsling og valgfri navnemaskering;
- BRREG-oppslag for leverandører, institusjoner og oppdragsgivere. Dette er Enhetsregisteret, ikke Folkeregisteret/FREG;
- database-healthcheck, klient-Sentry med maskert replay, backup-/restore-skript og driftsdokumentasjon. Det foreligger ikke bevis for at backupjobben, alarmer eller Sentry faktisk er konfigurert i produksjon;
- norsk webflate, responsive komponenter og eksisterende tilgjengelighetsarbeid.

Begrensningen er vesentlig: kjernen i `main` er laget for tiltaksbedrift/utfører, tidsføring og tiltaksrapportering. Den er ikke en komplett kommunal barnevernsløsning for myndighetsutøvelse.

### 3.2 I PR #21 og lokal integrasjonsarbeidsflate, men ikke i `main`

PR #21 tilfører:

- egen kommunetenant `tidum_kommuner` og rollene `barnevernsleder` og `kommune_saksbehandler`;
- Entra ID OIDC/PKCE for forhåndsinviterte kommuneansatte;
- manuell registrering, liste/visning, tildeling, henleggelse og videresending av bekymringsmeldinger;
- syvdagers avklaringsfrist, mottakervarsling og fristmotor;
- autentisert vedleggsopplasting og kommuneavgrenset nedlasting for bekymringsmeldinger;
- uforanderlig journal på den eksisterende saksmodellen, med korreksjonslenke, vedlegg og kø mot arkiv;
- tildelbare oppgaver med eier, frist og eskalering;
- Maskinporten-tokenklient og kryptert rålogg for FIKS-payload;
- de dokumenterte BOLA-fiksene for virksomhetslogger/audit, vendor-admin-invitasjon og access-request-godkjenning.
- lokal sikkerhetsrunde 5 for access-request-godkjenning: kontroll av alle tre
  identitetstabeller, atomisk tenant-betinget UPSERT og samtidighetstest;
- fungerende, transaksjonell auto-opprettelse av Tidum-vendor gjennom migrasjon
  066, kryptografisk tilfeldig legacy-passord og fjerning av hardkodet
  `admin123`-reset fra CMS-oppsettet.
- etterfølgende BOLA/IDOR-pakke for tenantavgrenset generisk eksport,
  faktura, saksrapport, kommentarer, rapportmaler/-ressurser,
  PDF-generering og genereringshistorikk. 18/18 målrettede tester er grønne;
  migrasjon 067/068 er varig anvendt og verifisert i utviklingsdatabasen.
- etterfølgende e-postpakke for tenant-/eierskopede maler, utkast, historikk,
  rapportvalg og private vedlegg, uten server-side URL-henting. Migrasjon 069
  og 15/15 målrettede tester er gjennomført i utviklingsdatabasen.

Viktige begrensninger i PR #21:

- det finnes ingen ferdig brukerflate for bekymringsmeldingsmottaket; implementasjonen er i hovedsak API, database og tester;
- FIKS IO-mottakeren er eksplisitt inert/stubbet; AMQP, konvolutt, dekryptering, validering, parsing og kvittering mangler;
- bekymringsmeldingen mangler blant annet prioritet, ufødt barn, tilleggsopplysninger, søskenkopi og generell redigering/endringshistorikk;
- «send til undersøkelse» endrer status, men oppretter ikke en reell undersøkelsessak eller videre faseflyt;
- barnevernsjournalen er koblet til eksisterende vendor-/tiltakssak, ikke til en ferdig kommunal barnevernssak;
- journalvedlegg bruker S3-objektlagring i `eu-central-1`, men uten eksplisitt KMS/SSE-konfigurasjon i koden og uten Norge-krav. Vedlegg til bekymringsmeldinger lagres derimot på lokal disk under `private-uploads/barnevern-meldinger`;
- PR-en er ikke produksjonssatt. Koden er portet og kontrollert lokalt, men
  `render.yaml` deployer fortsatt bare den offisielle `main`-grenen.

### 3.3 I andre grener

`origin/claude/g10-sikkerhetsherding` inneholder viktig, bred sikkerhetsherding:
fjerning av dev-bypass og fallback-hemmeligheter, TLS-validering,
Helmet/CSP/HSTS, CSRF, hemmelighetskryptering, TOTP/MFA og PostgreSQL RLS.
Dev-bypass, separate tokenhemmeligheter og database-TLS er nå portet og
regresjonstestet lokalt sammen med PR #21. Det samme gjelder Helmet/CSP/HSTS
og sesjonsbasert CSRF-vern, med eksplisitt transportdekning i klienten.
Hemmelighetskryptering, TOTP/MFA og en tilpasset RLS-migrasjon gjenstår.

`origin/claude/bankid-eid-innlogging` inneholder en eldre, parallell Buypass-implementasjon. Den nyere direkte BankID-/Buypass-løsningen ligger allerede i `main` gjennom blant annet commitene `03130c7`, `be33be9` og `c0a99e0`; den separate grenen skal derfor ikke flettes ukritisk. Direkte eID er likevel ikke automatisk det samme som den uttrykkelig etterspurte ID-porten-integrasjonen for foresatte og andre eksterne.

`origin/claude/dashboard-visual-qa-dbejmt` er 156 commits bak `main`, men har 54 egne QA-/fikscommits som aldri ble merget. Den dokumenterer og retter blant annet en SQL-injection i rapportmaloppdatering, uautentiserte CMS-oppslag og filopplasting, manglende CMS-tabeller, systemmaler som ikke seedes riktig på frisk database, mobilfeil og rene mockup-paneler som rapporterer falsk lagring. Første selektive port-kandidater er `fb10c27` (SQL-injection), `a549f99` (CMS-auth/opplasting), `0ed4a82` + `3f3d446` (malindekser/seeding), `47112e1` (manglende CMS-tabeller/ruterekkefølge), `fd5eb2` (e-postfeil/falsk suksess) og `bc72609` (ærlige mockupvarsler). Grenen skal ikke flettes samlet; migrasjoner må renummereres og alle endringer testes mot dagens kode.

### 3.4 Dokumenter og tester som ikke må overvurderes

- `progress.md` dokumenterer de to opprinnelige BOLA-funnene og første brede
  eksport-/faktura-/saksrapportpakke, men er ikke en full sikkerhetsattest for
  løsningen.
- PR #21 har grønne type-, design- og byggekontroller. Den lokale CI-endringen
  blokkerer nå på dependency audit og kjører bibliotekrøykprøven, men enhets-,
  DB-integrasjons- og E2E-suitene er fortsatt ikke generelt blokkerende.
- Hele den lokale Vitest-suiten er verifisert grønn mot oppgitt
  utviklingsdatabase (443/443), med uendrede før/etter-radtall i de fulgte
  tabellene og uten nye testfiksurer. De åtte pre-eksisterende
  `tidum_company_users`-radene ble ikke slettet. Dette er et øyeblikksbevis; CI må fortsatt få en
  isolert testdatabase og gjøre suiten blokkerende.
- Lokal full `npm audit --audit-level=low` rapporterer 0 funn etter ren
  `npm ci`. Dette lukker det konkrete avhengighetsavviket på 29 funn, men er
  ikke alene en sikkerhetsattest; authz/BOLA, RLS, MFA, secrets, SAST og
  uavhengig pentest gjenstår fortsatt.
- Den offisielle `main`-grenen har fortsatt den SQL-injection-sårbare dynamiske
  `PUT /api/report-templates/:id`-spørringen og flere CMS-ruter som QA-grenen
  dokumenterer som uautentiserte. Begge er rettet og testet i
  integrasjonsarbeidsflate, men er fortsatt et sikkerhetsstopp før endringene er
  reviewet og merget til `main`.
- De ni systemmalene finnes i kildekoden, men `main` mangler startup-migrasjonen/indeksen som gjør `ON CONFLICT (vendor_id, slug)` gyldig på en frisk database. Funksjonen må derfor beskrives som implementert kildekode med kjent provisjoneringsfeil, ikke som stabil produksjonsfunksjon.
- Documaster-koden og dokumentasjonen viser en sterk adapter, men ikke godkjent test mot Haldens/Documasters sandkasse. Den offentlige integrasjonssiden sier samtidig «Testet mot en ekte Documaster-instans»; påstanden motsies av `docs/integrations/documaster.md` og må fjernes eller bevises.
- Fakturaflyten i `main` sender andre feltnavn enn API-et krever, presenterer
  HTML som PDF og mangler eierskaps-/tenantfilter. Integrasjonsgrenen retter
  dette med egne tabeller og DB-test, men er fortsatt en smal
  leverandørfakturaflyt, ikke en komplett klientøkonomimodul.
- Generisk eksport, faktura, den eldre saksrapport-/rapportdesignerflyten og
  den ordinære e-postkomponisten er herdet i integrasjonsgrenen. Øvrige saker,
  mål, aktiviteter, CreatorHub/CMS-e-post, andre filer, søk, bakgrunnsjobber og
  CMS/admin må fortsatt gjennom den samlede BOLA/IDOR-matrisen før gjenbruk i
  kommunal løsning.
- eksisterende DPA oppgir blant annet Render i USA og globale/USA-baserte underdatabehandlere; dette samsvarer ikke med Haldens norske standardkrav.
- `BACKUP_RESTORE.md` oppgir RPO 24 timer for sentrale scenarier, mens konkurransebilaget krever maksimalt to timers datatap.
- Backup-/restore-skript og sikkerhetsdokumentasjon finnes, men det er ikke funnet produksjonsbevis for planlagt kjøring, kryptert objektkopi, alarm eller gjennomført restore-test. Dokumentene har dessuten motstridende retensjonsperioder.
- gammel gap-analyse fra 03.08 er nyttig historikk, men har flere utdaterte forutsetninger og skal ikke brukes som kravfasit.

### 3.5 Andre implementasjoner som nå er verifisert

| Komponent | Faktisk nivå | Kravverdi | Må ikke påstås før dette er lukket |
|---|---|---|---|
| Tiltaksplan og evaluering | Detaljerte § 6-3-maler, mål, fremdrift, aktiviteter, perioder, godkjenning og PDF | Stor gjenbruk for 5, 6, 18 og 29 | Stabil seeding, eget planobjekt, faglig validering og objektsikring |
| GDPR-selvbetjening | Eksport av egne data, anonymisering/sletting, adminfunksjoner og retensjonsjobb | Gjenbruk for 16, 17 og 22 | Saksrettet partsinnsyn, arkivunntak, BOLA-test og komplett utleveringspakke |
| Lønn/PowerOffice | Fire CSV-formater; PowerOffice-token, mapping, test, godkjent timeliste og push | Gjenbruk for 27 og demo 31 | Ekte leverandørtest, idempotens/avstemming og Visma Enterprise Plus; dette er ikke klientøkonomi |
| Fakturautkast | Tabeller, side, generering, linjer og HTML-utskrift | Prototype for 27/31 | Rett klient/API-kontrakt, tenant/eierskap, MVA/KID/EHF, ekte PDF og tester |
| E-postmotor | Tenant-/eierskopede maler, variabler, private vedleggs-ID-er, utkast, atomisk planlagt sending og historikk | Intern/administrativ byggekloss for 8 og 29 | Sikker kanal, Outlook/Graph, norsk/avtalt vedleggslagring og retensjon; separat CreatorHub/CMS-e-post må herdes |
| Avvik | Registrering, alvorlighet/kategori, oppfølging, varsling og maskering | Gjenbruk for oppfølging og deler av 22/29 | Barnevernsfaglig hendelsesmodell, tilgang, vedleggsvern og arkivkobling |
| BRREG | Søk/import av virksomheter og institusjoner | Nyttig masterdata for sak/økonomi | Skal ikke omtales som Folkeregisteret/FREG |
| Drift | Healthcheck, Render-probe, klient-Sentry, backup/restore-skript og hendelses-e-post | Teknisk startpunkt for 25 | Produksjonskonfigurasjon, serverobservability, 24/7-vakt, RPO ≤ 2 t og testbevis |
| Native iOS | Innlogging/eID, saker, rapporter, tid og profil med Swift-tester | Mobil byggekloss og relevant for 20/31 | Ikke full funksjonsparitet; Intune gjelder dersom appen tilbys til Halden |

QA-grenen bekrefter også at deler av CMS/Visual Builder er rene visuelle forhåndsvisninger med hardkodede eksempeldata og «Lagre»-knapper uten backend. Slike paneler teller ikke som implementasjon i denne matrisen.

## 4. Krav 1–31

| # | Type | Kort krav | Verifisert beholdning | Status nå | Restanse før kravet kan aksepteres |
|---:|---|---|---|---|---|
| 1 | Skal | Elektronisk/manuelt meldingsmottak, ufødt, tillegg, søskenkopi og redigering | PR #21 har manuelt API, mottakstid/kilde/kontakt, tenant-scope, vedlegg og avklaringsfrist. Maskinporten og kryptert rålogg finnes. | Delvis – PR | Bygg UI; prioritet; ufødt; tillegg; søskenkopi; kontrollert redigering med historikk; ekte FIKS IO-mottak, schema, kvittering og E2E-bevis. |
| 2 | Skal | Tilpassbar faseflyt fra mottak til avslutning | Eksisterende rapporter har statusflyt. PR #21 kan markere melding «sendt til undersøkelse». | Mangler fagflyt | Egen barnevernssak, faser, overgangsregler, vedtak/godkjenning, konfigurasjon, historikk og full prosesstest. |
| 3 | Skal | Oppgave med eier, frist, varsel og eskalering | `main` har oppgaver/varsler. PR #21 legger til tildeling, frist, UI og eskaleringscron; fristmotor brukes for meldinger. | Delvis – sterk PR-byggekloss | Knytt til alle relevante barnevernsobjekter; rolle-/tenanttest; eskaleringsmatrise; driftsalarm og E2E-test. |
| 4 | Skal | Strukturert journal, fritekst, tid/forfatter og dokumenter | PR #21 har append-only journal, tid/forfatter, korreksjon, vedlegg og Documaster-kø på eksisterende saker. Journalvedlegg bruker S3 i EU; meldingsvedlegg bruker lokal disk. | Delvis – PR | Knytt til kommunal barnevernssak; metadata/kategorier; norsk objektlager med dokumentert kryptering/nøkler; tilgangs- og oppslaglogging; sandkassebevis mot arkiv. |
| 5 | Skal | Tiltak-/planmodul med ansvar, dato, status og rapportering | `main` har § 6-3-tiltaksplan og evalueringsmal, saksperioder/status, rapportperioder, mål med status/fremdrift, aktivitetslogg, godkjenning og rapportering. Systemmal-seeding har en kjent feil på frisk database. | Delvis – betydelig gjenbruk | Fiks migrasjon/seeding og BOLA; løft malinnhold til eget versjonert planobjekt med plandeltakere/ansvar, evalueringsfrister, vedtaks-/samtykkekobling og faglig godkjenning. |
| 6 | Skal | Malstyrte standardbrev/vedtak med forhåndsutfylling | Ni rapport-/planmaler, dynamiske felt, godkjenningsflyt, signaturfelt og PDF finnes i kildekoden. Frisk-database-seeding og enkelte malruter har åpne feil/sikkerhetsfunn. | Delvis – main | Fiks seeding og SQL-injection; skill brev/vedtak fra rapport; hjemmel/kodeverk; versjonerte maler; saksdatafletting; godkjenning, ekspedering og arkivering. |
| 7 | E | Elektronisk signering eller godkjent integrasjon | PDF-signaturfelt og eID-autentisering er ikke juridisk e-signering. Egen designspec sier signering er utenfor eID-scope. | Mangler | Velg signaturleverandør, avtal databehandling, implementer signeringsoppdrag/webhook/bevispakke og arkiver signert dokument. |
| 8 | Skal | Interne varsler og sikker melding med eksterne | Ordinær SMTP er sperret for sensitivt innhold. Migrasjon 071 og API-et har kommune-/saksbundet part, eID-only portalidentitet, kryptert toveis dialog, private vedlegg, lesekvittering, tilbakekalling, append-only audit og nøytralt e-postvarsel. Første scope er bekymringsmelding; ingen ferdig innbygger-/ansattflate, arkivkobling eller SvarUt/SvarInn. | Delvis – backendgrunnmur | Bygg og WCAG-test begge brukerflater; malwarekarantene; arkiv/retensjon/nøkkelrotasjon; fullmakt/samtykke; utvid til full sak; produksjonsprøv eID og koble SvarUt/SvarInn der Halden krever det. |
| 9 | E | Kundens egen, leverandørnøytrale SMS-gateway | Tekst og telefonfelt finnes, men ingen SMS-gatewayimplementasjon ble funnet. | Mangler | Definer adaptergrensesnitt; konfigurer Halden-gateway; kø, levering/feil, reservasjon og personvernbevis. |
| 10 | Skal | Standardrapporter til ledelse, Bufdir/Statsforvalter og SSB; planlegging | Generiske rapporter og dashboards finnes. Ingen identifisert myndighetsrapportpakke eller planlagt innrapportering. | Mangler barnevernsrapportering | Datakatalog, autoritative skjema/kodeverk, standardrapporter, scheduler, validering, kvittering og avstemming. |
| 11 | E | Egne rapporter | Avansert rapportbygger, malredigering, filtre/visninger og analyse finnes. BOLA-pakken tenantskoper saksrapporter, kommentarer, maler, ressurser, PDF og historikk med anvendt migrasjon og DB-test, men gjelder den eldre rapportflyten. | Delvis – sterkere, fortsatt ikke barnevernsferdig | Porter øvrige QA-fikser; koble til kommunale barnevernsdata; felt-/rolle-/saksscope; lagrede versjoner; store datamengder; demo og sikkerhetstest. |
| 12 | E | Ad hoc, CSV/Excel og rapporterings-API | CSV/Excel og flere API-er finnes, primært for tids-/rapportdata. Fiksen gjør egenbruk til standard og leder-`all` eksplisitt tenantavgrenset, samt nøytraliserer regnearkformler og HTML. | Delvis – objektkontroll styrket | Barnevernsdatasett; sak/rolle/formålsfilter; masking; audit; tidsbegrenset eksport og komplett systemomfattende BOLA-test. |
| 13 | E | Beskriv hvordan nøkkeltall hentes | Analysekomponenter og dashboards finnes for eksisterende domene. | Delvis – byggekloss | Definer barneverns-KPI-er, kilde/formel/eier/frekvens, datakvalitet, tilgang og demonstrer sporbar beregning. |
| 14 | E | RBAC og juridisk avgrenset innsyn; minst tre roller | `main` har omfattende RBAC. PR #21 har kommune-tenant og to kommuneroller med DB-oppslag. G10-grenen har RLS. | Delvis – flere grener | Integrer grenene; legg administrator; saksnivå «need-to-know», delegasjon/fravær, nødtilgang, skjermet adresse og komplett authz/BOLA-matrise. |
| 15 | Skal | Alle saksendringer og dokumentoppslag logges søkbart | Flere append-/auditlogger finnes; PR #21 journal er append-only og BOLA på company audit er fikset. | Delvis | Ett dekningskart for alle saksobjekter; logg alle lesinger/nedlastinger; søk/revisorrapport; integritet, retensjon, tenant-scope og testbevis. |
| 16 | E | Innsynsbegjæring, utskrift, journalkopi og klagedokumentasjon | Brukeren kan laste ned egne persondata; admin-eksport, anonymisering/sletting, PDF-generering og PII-maskering finnes. Ingen saksrettet innsyns-/klageprosess. | Delvis – teknisk grunnlag | Workflow for mottak, partsstatus, unntak/sladding, godkjenning, frist, utskrift/journalkopi, utlevering og klage; sikkerhetsherd GDPR-/eksport-rutene. |
| 17 | E | Enkelt komplett saksuttrekk til bruker/klient | GDPR-eksport samler flere brukerrelaterte tabeller; generiske CSV/Excel/PDF/JSON-eksporter og rapport-PDF finnes. Ingen komplett barnevernsmappe eller kontrollert partsutlevering. | Delvis – eksportgrunnlag | Saksmanifest med journal, dokumenter, vedlegg, vedtak, metadata og kontrollert utlevering med audit og verifisert tilgangskontroll. |
| 18 | E | Dokumentere og arkivere forebyggende arbeid | Generelle saker har type/status/start/slutt/tildeling; rapporter har mål, aktiviteter og maler; godkjente rapporter kan køes til Documaster. Ingen egen klassifikasjon eller arbeidsflyt for forebyggende arbeid. | Delvis – gjenbrukbar sak/rapport | Etabler forebyggende sak/prosjekt, aktivitet, samarbeidspart, aggregering, tilgang, dokumenter, arkivmetadata og faglig UI. |
| 19 | E | TLS og kryptering i hvile | TLS-/providerkryptering, secret-box, S3-journalvedlegg og backup-skript finnes delvis. Meldings-/andre vedlegg ligger lokalt; G10 TLS/hemmelighetsherding ligger separat; ingen produksjonsbevis for backupkryptering. | Delvis | Norsk arkitekturbevis; kryptert DB, objektlager, logger og backup; KMS/nøkkelrotasjon; ingen klartekstfiler/fallback; transport- og restore-test. |
| 20 | Skal | Sentral identitet/SSO og MFA | Direkte BankID og Buypass ID er implementert for web/mobil. Sikker-dialoggrunnmuren forhåndsregistrerer en eID-only part uten e-postlogin og kobler BankID og Buypass til samme portalbruker; portalrollen er skilt fra ansatt-/leverandøradministrasjon. Entra for ansatte ligger i PR #21; TOTP ligger i G10-grenen. Ingen ID-porten. | Delvis – sterkere eID-grunnlag | Produksjonsbevis for BankID/Buypass; integrer Entra og MFA; avklar skriftlig om Halden krever ID-porten for eksterne; livssyklus/SCIM ved behov; test mot kundetenanter. |
| 21 | E | ISO 27001 eller annen sikkerhetsvurdering | To målrettede BOLA-funn er gjennomgått. Ingen sertifisering eller bred, uavhengig vurderingsrapport funnet. | Mangler bevis | Etabler ISMS-gap, kontrollbevis og risikoregister; integrer G10; bestill uavhengig arkitektur-/kode-/penetrasjonstest og retest. |
| 22 | Skal | Personvern, minimering, tilgang, anonymisering og DPIA-bistand | DPA, behandlingsprotokoll, selvbetjent eksport/sletting, retensjonsjobb, PII-søk/blokkering, navnemaskering og anonymisert klientreferanse finnes. Dokumentene og kontrollene gjelder hovedsakelig dagens utførerprodukt og har inkonsistenser. | Delvis – flere reelle kontroller | Barnevernsdataflyt/RoPA, behandlingsformål, skjermede data, sletting/arkiv, underdatabehandlere, DPIA-underlag og kontrollbevis; verifiser GDPR-rutenes tenant-/objektscope. Halden godkjenner DPIA. |
| 23 | Skal | EU/EØS, Norge dersom tilgjengelig | Nåværende dokumentasjon angir Neon London, Render USA, Google EU/USA og Cloudflare globalt. | Ikke oppfylt | Velg og etabler norsk produksjonsplattform for app, DB, objekt, logger og backup; kontraktsfest supporttilgang og fremlegg lokasjonsbevis. |
| 24 | Skal | Sikker loggforvaltning og definerte oppbevaringsperioder | Flere logger, noe retensjonskode og audit-UI finnes. Retensjon er inkonsistent og ingen samlet SIEM-/tilgangsmodell er bevist. | Delvis | Loggklassifisering, formål, retention, manipulasjonsvern, tilgang/review, alarm/SIEM, slettetest og samsvar med arkiv/DPA. |
| 25 | Skal | SLA i Bilag 4 | Database-healthcheck, Render-healthprobe, maskert klient-Sentry, operasjonelle driftsmailer, backup-/restore-skript og runbook finnes. Det er ikke funnet produksjonsbevis for aktiv overvåking/backup/restore, og RPO står som 24 timer. | Mangler / motstrid | Fyll Bilag 4; 99,5 %, 500 ms, RPO ≤2 t, utilgjengelighet ≤24 t, supportmål, kreditt; målbar monitorering, vakt, DR-, backup- og lasttest. |
| 26 | E | Elements, Documaster, Visma, KS FIKS, Entra, ID-porten, ev. Intune | Documaster-adapter og direkte BankID/Buypass i `main`; Entra og Maskinporten i PR #21; BRREG-/PowerOffice-byggeklosser. FIKS-receiver er stub. | Delvis – stor restanse | Sandkasse/kontraktstest for Elements, Documaster, Visma Enterprise Plus og full FIKS-portefølje; uttrykkelig ID-porten eller skriftlig akseptert eID-alternativ; Entra; FREG; Intune-avklaring og E2E-avstemming. |
| 27 | E | Full klientøkonomi, bank, lønn, EHF, avstemming og Visma | Vendor-skopet CSV-lønnseksport for fire systemer og PowerOffice-push av godkjente timelister med ansattmapping er reell kode. Integrasjonsgrenen har nå en tenantsikret, DB-testet leverandørfakturaflyt med reell PDF. Ingen reskontro, remittering, EHF, bank eller Visma Enterprise Plus-klientøkonomi. | Delvis – smal økonomikjerne | Stabiliser og test eksisterende lønns-/PowerOffice-flyt. Lever via partner eller eget økonomisubsystem: fire-øyne, bank, norsk/utenlandsk konto, fosterhjemslønn, EHF, skann, avvik og Visma-avstemming. |
| 28 | Skal | Nasjonal portal, BFK og rapporteringsbank | Maskinporten-token og rålogg i PR #21. Receiver er uttrykkelig inert; BFK og Barnevernsregister/rapporteringsbank mangler. | Mangler | KS-avtaler/sertifikat; full portaltransport; BFK-versjonering; gjeldende rapporteringsskjema, daglig innsending, kvittering, feilretting og avstemming. |
| 29 | E | Ønsket KI, KS-tjenester, e-sign, Outlook, huskelister, kart, prosjekt/generell sak, barnevernvakt, video og vedlegg/anonymisering | Reelt: huskelister/oppgaver, generell sak, rapportmål/-aktiviteter, avvik, vedlegg, PII-søk/maskering, intern kalenderflate, e-postmaler/planlagt SMTP og enkel KI-tekstassistanse. Ikke funnet: transkripsjon, Microsoft Graph/Outlook, nettverkskart, barnevernvakt, videomøte, KS innbyggertjenester eller godkjent e-sign. | Delvis | Besvar hvert underpunkt separat, og skill intern kalender/SMTP/KI-tekst fra de uttrykkelig etterspurte integrasjonene. Ikke presenter planer eller Visual Builder-mockups som ferdig. |
| 30 | Skal | Implementering, migrering og opplæring i Bilag 3 | Fullføringsplan og gammel intern gap-/veikartdokumentasjon finnes. Ingen ferdig tilbudsbesvarelse eller Modulus-migreringsbevis. | Mangler tilbudsdokument/bevis | Fyll Bilag 3 med ansvar, bemanning, pilot, to prøvemigreringer, avstemming, rollback, opplæring, leverings-/produksjonsdato og kundens avhengigheter. |
| 31 | E | To timers demo med vekt på økonomi, dokumenter/vedlegg og integrasjoner | Dagens produkt kan vise BankID/Buypass, generell sak, § 6-3-planmal/evaluering, mål/aktiviteter, rapportgodkjenning, GDPR-funksjoner, lønnseksport, PowerOffice, vedlegg/arkivkonfigurasjon, eksport, varsler og oppgaver. Flere flater har kjente feil, og PR-funksjoner krever previewmiljø. | Delvis | Før demo: porter kritiske QA-fikser, stabiliser mal-seeding/faktura/BOLA, fjern ubevist Documaster-påstand; lag manus med tydelig «live», «simulert» og «planlagt», norsk demodata, tidtaking og reserveopptak. |

## 5. Tilbudsmessig beslutning per gruppe

### 5.1 Kan bygges videre fra sterk eksisterende kjerne

Krav 3–6, 11–19, 22, 24, deler av 27 og deler av 29 har relevant gjenbruk. Særlig tiltaksplan-/evalueringsmalene, mål/aktivitetslogg, GDPR-eksport, lønnseksport og PowerOffice ble undervurdert i første gjennomgang. Tilbudet bør beskrive konkret videreføring av disse komponentene, samtidig som kjent seeding, BOLA og integrasjonsverifisering oppgis.

### 5.2 Krever ny barnevernsfaglig funksjonalitet

Krav 1, 2, 10, den faglige delen av 16–18 og store deler av 29 krever ny kommunal domenemodell og brukerflate. Krav 5 har vesentlig mer gjenbruk enn først antatt, men dagens rapportbaserte tiltaksplan må fortsatt løftes til et autoritativt, versjonert planobjekt. Eksisterende utførersak skal brukes som byggekloss, men må ikke omtales som en ferdig myndighetssak.

### 5.3 Krever eksterne avtaler, tilganger eller partner

Krav 7–9, 20, 26–28 kan ikke ferdigstilles troverdig bare med intern kode. KS/Digdir, Documaster, Elements, Visma, signatur, SMS, bank/EHF og Halden må inngå i avhengighetsplanen med siste sikre dato og testmiljø.

### 5.4 Krever ledelsesbeslutning og driftsinvestering

Krav 19, 21, 23 og 25 krever norsk målplattform, sikkerhetsprogram, ekstern vurdering, bemanning og målbar drift. Dette er leverandøransvar og kan ikke skyves over på Halden.

## 6. Første arbeidspakke

### Spor A – tilbudssannhet, ferdig 26.08

1. Overfør denne matrisen til Bilag 2 med ett svar per krav.
2. For hvert `Skal`: velg `JA – eksisterende`, `JA – bindende leveranse før akseptanse`, eller stopp/no-bid/partner.
3. Få daglig leder, teknisk ansvarlig og leveranseansvarlig til å godkjenne alle fremtidige forpliktelser.
4. Pris alle nødvendige integrasjoner, norsk drift, migrering, sikkerhetsvurdering, opplæring og support.

### Spor B – sikker, integrert kodegrunnmur

1. **Utført lokalt:** porter PR #21 kontrollert på dagens `main`; opprett og
   push integrasjonsgren etter review.
2. **Pågår:** integrer resterende G10-herding uten å miste BOLA-fiksene.
   Dev-bypass, tokenhemmeligheter, database-TLS, Helmet/CSP/HSTS og CSRF er
   ferdige lokalt; hemmelighetskryptering, TOTP/MFA og tilpasset RLS gjenstår.
3. **Delvis utført lokalt:** SQL-injection-fiks, CMS-auth/opplasting og
   systemmalindekser/seeding er portet som migrasjon 065. Resterende relevante
   QA-fikser og manglende tabeller må vurderes selektivt; ikke merge den 156
   commits gamle grenen samlet.
4. **Utført i denne avgrensningen:** generisk eksport, faktura, eldre
   saksrapport-/rapportdesignerruter og ordinær e-postkomponist er
   tenant-/eierskopet. Migrasjon 067–069, 18/18 rapport-/fakturatester og 15/15
   e-posttester er gjennomført; fortsett med saker, rapportmål/-aktiviteter,
   CreatorHub/CMS-e-post, andre filer, søk og øvrig CMS/admin.
5. **Delvis utført lokalt:** dependency audit er blokkerende på moderat nivå og
   har 0 funn; full lokal Vitest-suite er grønn 443/443 mot utviklingsdatabase.
   Gjør deretter enhets-, DB-integrasjons-, BOLA- og E2E-tester generelt
   blokkerende i CI med isolert testdatabase.
6. **Utført lokalt:** de tre reelle oppfølgingspunktene i `progress.md` er
   rettet (riktig vendors-skjema, samme transaksjon og tilfeldig passord);
   `syncApprovedPortalUsers` er dokumentert som «ingen handling». Migrasjon 066
   er anvendt og FK-en er fullt validert i utviklingsdatabasen.
7. Kjør ny uavhengig gjennomgang av den samlede grenen.

### Spor C – første demonstrerbare barnevernsflyt

Bygg én full vertikal flyt før flere isolerte API-er:

1. mottak av bekymringsmelding i norsk UI;
2. prioritet, ufødt barn, kontaktfelter, tillegg, søskenkopi og versjonert retting;
3. tildeling, frist, varsel og eskalering;
4. beslutning om henleggelse eller opprettelse av undersøkelsessak;
5. journalføring og sikkert vedlegg;
6. arkiv-outbox;
7. komplett tenant-/saksautorisasjon og audit;
8. E2E-test mot ekte PostgreSQL.

Denne flyten gjenbruker det sterkeste i PR #21 og gir samtidig bevis for krav 1, 2, 3, 4, 14 og 15.

### Spor D – eksterne avhengigheter, start samme dag

- Send bestillinger/avklaringer til KS FIKS/Digdir, Documaster, Elements, Visma og norsk driftsleverandør.
- Avklar skriftlig ID-porten-modellen med Halden.
- Innhent Modulus Barn-eksportspesifikasjon og realistisk datavolum.
- Velg strategi/partner for klientøkonomi, EHF/bank, e-sign og SMS.
- Reserver ekstern sikkerhetsvurdering og penetrasjonstest.

## 7. Definisjon av «ferdig»

Et krav flyttes først til grønt når alle disse finnes:

1. godkjent tilbudstekst uten forbehold som strider mot konkurransegrunnlaget;
2. kode og migrasjoner i integrert hovedlinje;
3. rolle-, tenant-, negativ- og normalflyt-test;
4. dokumentert akseptansetest i relevant miljø;
5. driftsmåling, logging, backup og support der kravet berører drift;
6. ekstern leverandørbekreftelse når integrasjon inngår;
7. norsk dokumentasjon og demonstrerbar brukerflate;
8. navngitt eier og signert akseptanse.

## 8. Relaterte dokumenter

- [Fullføringsplan](./2026-112379-halden-fullforingsplan.md)
- [Tidligere gap-analyse](./2026-112379-halden-barnevern-gap-analyse.md) – historikk, ikke kravfasit
- `progress.md` på `origin/claude/integrasjoner-innhold` – avgrenset status for de to BOLA-funnene
- `docs/compliance/databehandleravtale.md`
- `BACKUP_RESTORE.md`
- `docs/integrations/documaster.md`
- `docs/archive-sandbox-testing.md`
