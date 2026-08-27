# Fullføringsplan – Halden barnevernssystem

**Anskaffelse:** 2026/3663 – Administrativt system for barnevernstjenesten

**Leverandør:** Creatorhub AS / Tidum

**Planlagt tilbudsfrist:** 28.08.2026

**Kontraktsmilepæler:** tjenesten tilgjengelig 01.10.2026, migrering ferdig før 01.11.2026, produksjonsstart 15.11.2026

**Planstatus:** Revidert styrende versjon etter bred kode- og branchkontroll, 26.08.2026

## 1. Formål og styringsprinsipper

Denne planen beskriver hvordan Tidum, i rollen som **systemleverandør**, skal:

1. levere et bindende og dokumentert tilbud;
2. ferdigstille systemfunksjonaliteten og integrasjonene;
3. oppfylle sikkerhets-, personvern-, drifts- og leverandørkravene;
4. migrere Halden fra Modulus Barn og Mobilt barnevern;
5. dokumentere hvert krav med etterprøvbare akseptansebevis.

Planen skiller mellom:

- **Systemkrav:** funksjonalitet, integrasjoner, sikkerhet og drift som Tidum skal levere.
- **Leverandørkrav:** dokumentasjon, økonomisk kapasitet, HMS, etikk, arbeidsvilkår og kontraktsoppfølging.
- **Kundens ansvar:** Halden er behandlingsansvarlig, eier myndighetsutøvelsen, fastsetter behandlingsgrunnlag og godkjenner DPIA, integrasjonstilganger, migrering og produksjonssetting.

Følgende regler gjelder uten unntak:

- Et svar «JA» i Bilag 2 er en bindende leveranseforpliktelse. Det skal ikke gis «JA» uten finansiert plan, navngitt eier, dato og akseptansebevis.
- Alle `Skal`-krav må ha et forsvarlig `JA` ved tilbudets beslutningsport: enten grønn nå-status eller en gul, bindende og finansiert leveranseplan. Et rødt `Skal`-krav utløser stopp, partnerskap eller et eksplisitt bid/no-bid-vedtak. Alle `Skal`-krav skal være grønne før produksjonssetting.
- `E-krav` kan besvares gradert og ærlig, men er sentrale fordi kvalitet teller 60 prosent.
- Offisielle konkurransedokumenter går foran denne planen, repoets eldre gap-analyse og intern produktdokumentasjon.
- Ingen krav lukkes med bare kode eller tekst. Det må finnes test, driftsbevis, kontraktsbevis eller signert ansvarsoverføring.

## 2. Nå-situasjon og beslutning

### 2.1 Dokumentert ferdig eller vesentlig påbegynt

- PR #21 og den etterfølgende herdingen er samlet i
  `codex/halden-krav-integrasjon` commit `7562c5d`, pushet uten å berøre den
  produksjonsdeployende `main`-grenen.
- Samlecommiten lukker bulkimport-/samtidighetsrestene i access-request-flyten
  og etablerer separat Tidum-eid leverandørskjema.
- En ny BOLA/IDOR-pakke tenantskoper eksport, faktura, saksrapport,
  kommentarer, rapportmaler/-ressurser, PDF og historikk. 18/18 målrettede
  tester er grønne; migrasjon 067/068 er varig anvendt og verifisert i
  utviklingsdatabasen, inkludert faktura-E2E med to tenants.
- Neste BOLA/IDOR-pakke tenantskoper den ordinære e-postkomponisten: maler,
  utkast, historikk, rapportvalg og private vedleggs-ID-er. URL-henting er
  fjernet, planlagt sending claim-es atomisk, og 15/15 tester er grønne.
  Migrasjon 069 er varig anvendt i utviklingsdatabasen. Dette er fortsatt
  ordinær SMTP, ikke en godkjent kanal for sensitiv barnevernsdialog.
  Hele Vitest-suiten er etter denne pakken grønn med 475/475 tester i 68/68
  testfiler.
- Generisk oppgavetildeling, frister, varsling og eskalering er påbegynt.
- Uforanderlig sakjournal med vedlegg og arkiveringskø er påbegynt.
- Kommune-tenant, kommune-roller og Entra ID-grunnmur er påbegynt.
- Manuelt mottak og avklaring av bekymringsmeldinger er påbegynt.
- Documaster-adapter og Maskinporten-tokenklient finnes, men er ikke produksjonsverifisert.
- Sikker dialog har leverandørklar arkivpakke, transaksjonell kommune-outbox,
  arkiv-før-sletting, juridisk sperring og versjonert datanøkkelrotasjon.
  Kundens Documaster/Elements-oppsett, retensjonsvedtak og KMS er fortsatt
  eksterne akseptansepunkter.
- Direkte BankID og Buypass ID er implementert i `main` for web/mobil og identitetskobling.
- Ni rapport-/planmaler finnes i kildekoden, herunder § 6-3-tiltaksplan og periodisk evaluering, sammen med mål, fremdrift, aktivitetslogg, godkjenning og PDF.
- GDPR-selvbetjening for dataeksport og anonymisering/sletting, PII-sjekk/maskering og retensjonsjobb finnes.
- PowerOffice-push av godkjente timelister, ansattmapping og vendor-skopet CSV-lønnseksport for Tripletex, Visma Lønn, PowerOffice og Fiken finnes.
- E-postmaler, eierbundne private vedlegg, utkast, duplikatsikret planlagt
  utsendelse og tenantavgrenset historikk finnes, men er ikke sikker ekstern
  barnevernsdialog eller Outlook-integrasjon.
- Generelle saker, rapporter, mål/aktiviteter, avvik, BRREG-oppslag, PDF/CSV/Excel, varsler og flere audit-komponenter finnes i dagens plattform.
- Healthcheck, klient-Sentry, backup-/restore-skript og driftsrunbook finnes som teknisk grunnlag, uten verifisert produksjonsoppsett.

### 2.2 Kritiske avvik ved planstart

- Integrasjonsgrunnmuren er committet og pushet som `7562c5d`, men ikke
  reviewet, merget eller produksjonsdeployet. Render-secrets må etableres før
  en eventuell produksjonsmerge.
- To G10-pakker er integrert lokalt med PR #21: eksplisitt dev-bypass,
  separate påkrevde tokenhemmeligheter, database-TLS, Helmet/CSP/HSTS og
  sesjonsbasert CSRF-vern med klientdekning for fetch, offline-kø, XHR og
  unload-sporing. Hemmelighetskryptering, TOTP/MFA og tilpasset RLS gjenstår.
- Avhengighetspakken er lukket lokalt: 29 audit-funn er redusert til 0 etter
  direkte/transitive oppgraderinger, Node 24-baseline og ren `npm ci`.
  `npm audit --audit-level=moderate` er gjort blokkerende i lokal CI-endring;
  48/48 sikkerhetstester, 5/5 bibliotekrøykprøver, typesjekk og build er grønne.
  Baselinesuiten er verifisert mot oppgitt Neon-utviklingsdatabase:
  443/443 tester i 63/63 testfiler besto. Før/etter-kontroll viste identiske
  radtall i de fulgte bruker-, rolle-, tenant- og fristtabellene; ingen nye
  testfiksurer ble stående. Åtte pre-eksisterende company-user-rader ble
  bevisst ikke slettet uten egen dataryddingsbeslutning. Isolert,
  blokkerende DB-suite i CI gjenstår fortsatt. Etter siste BOLA-pakke
  består 18/18 nye tester. En full suite fikk tre forbindelses-timeouter etter
  454 beståtte tester; alle berørte filer besto isolert 8/8, 7/7 og 13/13.
- QA-grenen `dashboard-visual-qa-dbejmt` er 156 commits bak `main`, men inneholder
  54 umergede fikscommits. SQL-injection, CMS-auth/opplasting og
  systemmal-seeding er rettet lokalt; flere falske/mockede CMS-paneler og øvrige
  relevante fikscommits gjenstår å vurdere selektivt.
- FIKS IO-mottaket er en stub; full meldingstransport og innholdsparser mangler.
- Full barnevernssaksgang, autoritativt/versjonert planobjekt, vedtak, oppfølging og myndighetsrapportering mangler. Dagens § 6-3-planmal og mål-/aktivitetsmodell skal gjenbrukes, men er ikke en ferdig kommunal planmodul.
- ID-porten, FREG, Elements, Visma Enterprise Plus, full Documaster og DigiBarnevern er ikke produksjonsklare.
- Journalvedlegg i PR #21 bruker S3 i EU, mens bekymringsmeldingsvedlegg bruker lokal disk; ingen av løsningene dokumenterer Haldens norske målarkitektur eller eksplisitt KMS-oppsett.
- Fakturaflyten i `main` er en prototype. Integrasjonspakken samstemmer
  klient/API, skiller data fra CreatorHub-tabellen, tenantskoper alle
  operasjoner og leverer reell PDF. Migrasjon og faktura-E2E er verifisert;
  full klientøkonomi er fortsatt ikke levert.
- Generisk eksport og eldre saksrapport-/rapportdesignerruter er herdet i
  integrasjonsarbeidsflaten.
  Den ordinære e-postkomponisten er også herdet. Øvrige saker,
  rapportmål/-aktiviteter, CreatorHub/CMS-e-post, andre filer, søk,
  bakgrunnsjobber og CMS/admin har fortsatt åpne objekt-/tenantkontroller og kan
  ikke brukes med ekte eksterne data før hele endepunktsmatrisen er lukket.
- Den tidligere offentlige påstanden om test mot ekte Documaster-instans er
  rettet i integrasjonsgrenen. Kundesandkasse er fortsatt et eksplisitt
  akseptansepunkt og skal ikke beskrives som gjennomført før bevis foreligger.
- Dagens underdatabehandleroppsett omfatter USA/Storbritannia og oppfyller ikke Norges-utgangspunktet i Haldens databehandleravtale.
- Dagens backup-plan har RPO 24 timer; kontrakten krever maksimalt 2 timers datatap.
- SLA, supportberedskap, statusside, ytelsesbevis, DPIA-underlag, ISMS-bevis og full sikkerhetsbesvarelse mangler.
- Bilag 2, 3, 4, 5, 6 og 10 samt kvalifikasjons- og egenerklæringsdokumentene er ikke ferdigstilt.

### 2.3 Realitetskrav til bemanning

Leveranse innen 15.11.2026 er et høyrisiko hurtigløp. Minimum dedikert kapasitet fra 25.08 til 15.11 er:

| Rolle | Minimum |
|---|---:|
| Program-/tilbudsleder | 1 |
| Barnevernsfaglig produkteier | 1–2 |
| Teknisk løsningsarkitekt | 1 |
| Backendutviklere | 4 |
| Frontendutviklere | 3 |
| Integrasjonsutviklere | 3 |
| Plattform/SRE | 1–2 |
| QA/testautomatisering | 2 |
| Sikkerhet/personvern | 1 |
| Migrering/data | 1–2 |
| UX/universell utforming | 1 |
| Opplæring/support | 1 |
| Juridisk/kommersiell støtte | 0,5–1 |

Dette tilsvarer om lag **19–22 dedikerte heltidskapasiteter (FTE) i leveranseperioden**, inkludert innleide spesialister. Dersom kapasiteten eller nødvendige partneravtaler ikke kan sikres, må omfanget løses gjennom en hoved-/underleverandørmodell eller tilbudet stoppes.

## 3. Styringsmodell

Den verifiserte beholdningen og status per krav ved planstart finnes i
[kravmatrisen](./2026-112379-halden-kravmatrise.md). Matrisen er operativ
sannhetskilde for Bilag 2 og skal oppdateres når kode, testbevis eller eksterne
avhengigheter endrer status.

### 3.1 Roller

| Rolle | Ansvar |
|---|---|
| Programleder | Total fremdrift, budsjett, risiko, rapportering og beslutningsporter |
| Tilbudsleder | Bilag, Mercell, kvalifikasjonsbevis, signaturer og sladding |
| Barnevernsfaglig produkteier | Lov-/prosesskrav, faglig akseptanse, demo og opplæring |
| Teknisk leder | Arkitektur, kodeintegrasjon, teknisk kvalitet og release |
| Sikkerhets-/personvernleder | DPA, DPIA-underlag, sikkerhetskontroller, revisjon og hendelser |
| Integrasjonsleder | Entra, ID-porten/eID, FIKS, FREG, arkiv, ERP og EHF |
| Migreringsleder | Kildekartlegging, transformasjon, prøvemigrering, avstemming og cutover |
| SRE/supportleder | Norsk drift, SLA, overvåking, backup, beredskap og support |
| Halden produkteier | Kravavklaringer, prioritering, tilgang til kildesystemer og akseptanse |
| Halden personvernombud | DPIA, behandlingsgrunnlag, databehandler- og overføringsgodkjenning |

### 3.2 Kravregister

Det etableres ett autoritativt kravregister med disse feltene:

- kravnummer og ordlyd;
- `Skal` eller `E-krav`;
- svar `JA/NEI` og tilbudstekst;
- nå-status: grønn, gul eller rød;
- produkteier og teknisk eier;
- kildekode/migrasjon/dokumentasjon;
- test-ID og akseptansebevis;
- ekstern avhengighet;
- mål- og faktisk dato;
- avvik, beslutning og godkjenner.

Statusdefinisjon:

- **Grønn:** levert, testet, dokumentert og godkjent.
- **Gul:** bindende finansiert leveranse med ansvarlig, dato og håndtert avhengighet.
- **Rød:** mangler løsning, kapasitet, tilgang eller godkjent plan.

### 3.3 Møtestruktur

- Daglig leveransemøte, 20 minutter, frem til produksjonsstart.
- Krav- og risikoråd mandag/onsdag/fredag.
- Ukentlig styringsgruppe med beslutninger, kostnad og kritisk sti.
- Ukentlig sikkerhets-/personvernforum.
- Ukentlig integrasjonsforum med Halden og berørte tredjeparter etter tildeling.
- Go-live-forum daglig fra 26.10 til 20.11.

## 4. Beslutningsporter

| Port | Frist | Må være oppfylt |
|---|---|---|
| G0 – mobilisering | 25.08 | Programleder, kravregister, eiere, budsjett og partnerkontakt etablert |
| G1 – tilbudsevne | 26.08 kl. 12 | Alle `Skal` klassifisert; ingen røde uten besluttet løsning; realistisk pris og bemanning |
| G2 – tilbudsgodkjenning | 27.08 kl. 15 | Bilag, kvalifikasjonsbevis, risiko, datalokaliseringsplan og juridisk signoff |
| G3 – innsending | Minst 2 timer før Mercell-fristen | Opplastet, åpnet og kontrollert tilbud samt én sikker sladdet fil |
| G4 – arkitekturfrys | 04.09 | Norsk dataplattform, identitetsmodell og integrasjonskontrakter besluttet |
| G5 – sikker grunnmur | 11.09 | PR #21 + G-10 integrert; kritiske QA-fikser portert; obligatoriske CI-/sikkerhetsporter grønne |
| G6 – tjeneste tilgjengelig | 01.10 | Halden kan logge inn, konfigurere tenant og gjennomføre avtalt akseptansetest |
| G7 – funksjonell komplett | 16.10 | Alle `Skal`-funksjoner kodekomplette; kun feilretting og integrasjonsverifisering gjenstår |
| G8 – migreringsklar | 23.10 | To prøvemigreringer bestått med signert avstemming |
| G9 – produksjonsmigrering | Senest 31.10 | Produksjonsdata migrert, validert, sikret og godkjent |
| G10 – driftsgodkjenning | 06.11 | SLA-, sikkerhets-, ytelses-, DR-, integrasjons- og pentestbevis godkjent |
| G11 – go-live | 15.11 | Ingen åpne kritiske/alvorlige feil; opplæring, beredskap og rollback godkjent |

## 5. Tilbudsløpet 25.–28. august

### 5.1 25. august – etabler sannheten

- Lås offisiell dokumentpakke og lag SHA-256-kontrollsummer.
- Opprett kravregister for krav 1–31, Bilag 10 og de 37 sikkerhetsspørsmålene.
- Merk hver påstand som `nå`, `før 01.10`, `før 01.11` eller `før 15.11`.
- Bekreft team, underleverandører, barnevernsfaglig kompetanse og navngitte nøkkelpersoner.
- Start formelle spor mot Documaster, KS Digital/FIKS, Digdir, EHF-aksesspunkt, norsk driftsplattform og sikkerhetstester.
- Avklar at ID-porten må etableres som Halden-eid/-autorisert integrasjon eller erstattes av direkte eID etter skriftlig aksept. Private systemleverandører kan ikke uten videre være ID-porten-kunde.
- Bestill firmaattest, skatte-/MVA-attester og kredittvurdering.

### 5.2 26. august – ferdig første tilbudsutkast

- Fyll Bilag 2 med JA/NEI, kort redegjørelse og nøyaktige bevisreferanser.
- Fyll Bilag 3 med denne planen, milepæler, roller, godkjenningsprøve og migrering.
- Fyll Bilag 4 med åpningstider, klassifisering, responstider, overvåking og kompensasjon.
- Fyll Bilag 5 med representanter, nøkkelpersonell, møtestruktur og underleverandører.
- Fyll Bilag 6 med alle etablerings-, migrerings-, integrasjons-, opplærings-, drifts- og avslutningskostnader.
- Fyll Bilag 10 med reelle datakategorier, registrerte, behandlinger, norsk lokasjon og underdatabehandlere.
- Besvar alle 37 sikkerhetskontroller med `Ja/Nei/IR`, forklaring og bevis.
- Ferdigstill ESPD og leverandørdokumentasjon.
- Utarbeid demo-manus for de evaluerte kravene.

### 5.3 27. august – kvalitetssikring

- Faglig kontroll mot barnevernprosessene.
- Teknisk kontroll mot faktisk kode og leveranseplan.
- Juridisk kontroll av forbehold, databehandleravtale og kontraktsrisiko.
- Kommersiell kontroll av pris, valuta, indeks, support og avslutningskostnader.
- Kontroller at alle kostnader er i Bilag 6 og at ingen vesentlige forutsetninger skjules i vedlegg.
- Generer norsk PDF/A-versjon av hele tilbudet.
- Lag én konsolidert, sikkert svart-sladdet PDF/A med sladdingslogg først i dokumentet.
- Verifiser sladdingen med tekstuttrekk, kopiering, søk, metadata- og lagkontroll.
- Gjennomfør uavhengig «red team»-lesing: Finn hvert sted en evaluator kan forstå som uklarhet, avvik eller udokumentert påstand.

### 5.4 28. august – kontrollert innsending

- Last opp i Mercell minst to timer før portalens faktiske frist.
- Last ned/åpne alle opplastede dokumenter og kontroller sidetall, signaturer og lesbarhet.
- Kontroller at sladdet versjon er én fil og ikke inneholder skjulte data.
- Arkiver innsendingkvittering, eksakt tilbudspakke og kontrollsummer.
- Frys tilbudsbaseline. Endringer etter fristen krever formell kontrakts-/anskaffelsesrettslig vurdering.

## 6. Teknisk gjennomføringsplan

### Arbeidsstrøm A – sikker kodegrunnmur

**Krav:** 14, 15, 19–24 og Bilag 10.

Tiltak:

1. **Delvis utført lokalt:** PR #21 er portet på dagens `main`; de to første
   kompatible G10-pakkene er integrert. Resterende G10 må porteres selektivt fordi
   grenens gamle migrasjonsnummer og RLS-dekning kolliderer med PR #21.
2. **Delvis utført lokalt:** SQL-injection-whitelist, CMS-auth/opplasting og
   systemmalindekser/seeding er portet som migrasjon 065. Manglende tabeller og
   funksjonelle rapportfikser vurderes videre selektivt; ikke merge hele den
   gamle QA-grenen.
3. **Utført lokalt:** fjern ubevoktede dev-auth-bypasser og fallback-hemmeligheter.
4. **Utført lokalt:** innfør Helmet/CSP/HSTS, CSRF-vern, sikker CSRF-cookie og
   blokkert oppstart dersom `CSRF_SECRET` mangler. Nettlesersmoke mot reelt miljø
   og videre fjerning av det dokumenterte CSP-unntaket `'unsafe-inline'` gjenstår.
5. **Utført lokalt:** oppgrader sårbare runtime-/dev-avhengigheter, fjern ubrukt
   legacy-editor, verifiser Nodemailer/Sharp/ExcelJS/Quill/Puppeteer, løft Node
   og Docker til Node 24 og gjør dependency audit blokkerende. Full audit: 0.
6. Innfør TOTP/MFA for administrative roller og Entra MFA-krav via kundens policy.
7. Gjennomfør RLS/tenant-isolering i database og applikasjon; alle request-paths må få tenant-kontekst.
8. **Utført i denne avgrensningen:** rapportmaler, generisk eksport, faktura,
   eldre saksrapporter/kommentarer og ordinær e-postkomponist er herdet med
   to-tenant-tester. Migrasjon 067–069, faktura-E2E og e-posttesten er
   gjennomført; fortsett med saker, rapportmål/-aktiviteter,
   CreatorHub/CMS-e-post, andre filer, søk, logger, bakgrunnsjobber og
   administrasjon.
9. Gjør alle fler-tabell-identitets- og invitasjonsoperasjoner atomiske og bruk kryptografisk tilfeldige hemmeligheter.
10. Fullfør blokkert CI for generell Vitest, DB-integrasjonstest, E2E,
    authz-matrise, secret scan og SAST; typecheck, build og dependency audit er
    allerede etablert eller gjort blokkerende lokalt.
11. Gjennomfør uavhengig kodegjennomgang og ekstern pentest før G10.

Akseptanse:

- Ingen åpne kritiske/høye sikkerhetsfunn.
- Tenant-isolering testet for alle persondataobjekter og dokumentendepunkter.
- CI kan ikke bli grønn dersom test eller `npm audit --audit-level=moderate` feiler.
- Alle admininnlogginger har MFA eller kundestyrt Entra MFA.
- Komplett bevismappe for sikkerhetsspørsmål 1–37.

### Arbeidsstrøm B – norsk dataplattform og drift

**Krav:** 19, 23–25, SSA-L 6, Bilag 10.

Målarkitektur:

- Egen produksjonslanding zone for Halden i norsk region.
- Backend, PostgreSQL, objektlagring, sikkerhetskopier, logger, kø, nøkkelhvelv og SIEM lagres i Norge.
- Failover utenfor Norge brukes bare etter skriftlig godkjenning fra Halden.
- Ingen GA4/GTM, OpenAI eller andre ikke-godkjente tredjeparter på autentiserte saksflater.
- E-post inneholder aldri barnevernsdata; sikker kommunikasjon skjer i portal/FIKS.
- Supporttilgang er tidsbegrenset, MFA-beskyttet, godkjent og audit-logget.

Tiltak:

1. Velg norsk sky-/driftsplattform etter tjeneste-for-tjeneste-lokasjonskontroll.
2. Terraform/Bicep eller tilsvarende for reproduserbar infrastruktur.
3. Privat database-/lagringstilkobling, administrert nøkkelhvelv og rotasjon.
4. Punkt-i-tid-gjenoppretting og backupintervall som gir **RPO ≤ 2 timer**.
5. DR-test som dokumenterer **RTO ≤ 24 timer** og kontrollert gjenoppretting.
6. Overvåking av tilgjengelighet, p95/p99, kø, integrasjoner, sikkerhet og backup.
7. Offentlig statusside uten persondata.
8. Databehandler- og underleverandøroversikt oppdateres før første produksjonsdata.

### Arbeidsstrøm C – identitet, roller og partsmodell

**Krav:** 14, 20, 22, 26.

Tiltak:

- Produksjonsherd Entra OIDC med tenant-allowlist, issuer-/audience-validering og admin-consent.
- Halden oppretter eller autoriserer ID-porten-integrasjonen; Tidum implementerer OIDC som teknisk leverandør.
- Direkte BankID og Buypass ID finnes allerede i `main`. Dersom disse skal brukes i stedet for ID-porten, må avviket aksepteres skriftlig av Halden før tilbudet bindes.
- Etabler kobling mellom ekstern identitet og én person/ett tenant-forhold uten e-postbasert kontokollisjon.
- Etabler roller minst for saksbehandler, barnevernsleder og systemadministrator.
- Etabler saksspesifikk «need to know», stedfortreder, midlertidig tilgang, sperret sak og begrunnet nødtilgang.
- Etabler part/fullmektig/foresatt/barn 15+ som eget autorisasjonsdomene.
- Logg alle innlogginger, tilgangstildelinger, oppslag og avslag.

### Arbeidsstrøm D – barnevernsfaglig kjerne

**Krav:** 1–6, 16–18, 29.

Gjenbruksstrategi: behold den eksisterende saksmodellen, § 6-3-tiltaksplanen, evalueringsmalen, rapportmål, aktivitetslogg, godkjenningsflyt, PDF og arkiv-outbox som kildekomponenter. Før faglig utvidelse må systemmal-seeding og objekt-/tenantautorisasjon rettes. Planen skal deretter bli et eget autoritativt, versjonert domeneobjekt; den skal ikke fortsatt bare være rapportinnhold.

Leveranser:

1. **Person og familie:** barn, ufødt barn, foresatte, søsken, nettverk, fullmektig, kontaktopplysninger, kode 6/7 og relasjoner.
2. **Bekymringsmelding:** elektronisk/manuell mottak, kilde, tidspunkt, prioritet, kontaktfelt, tillegg, redigering med historikk og kopiering til søsken.
3. **Avklaring:** lovfrist, oppgaver, vurdering, henleggelse eller opprettelse av undersøkelse.
4. **Undersøkelse:** konfigurerbar plan, 3/6-månedersfrister, aktiviteter, samtaler, vurdering og beslutning.
5. **Vedtak:** hjemmel, begrunnelse, fire-øyne-godkjenning, e-signering, ekspedering og arkivering.
6. **Tiltaks-/omsorgsplan:** mål, delmål, ansvar, start/slutt, status, evalueringsfrist og resultat.
7. **Oppfølging:** fosterhjem, institusjon, besøk, avtaler, avvik og evaluering.
8. **Journal:** uforanderlig løpende journal med korreksjon, vedlegg, dokumentkobling og komplett audit.
9. **Innsyn/klage:** partsinnsyn, journalkopi, saksuttrekk, klage og dokumentert utlevering.
10. **Forebyggende arbeid:** tidlig innsats, generell sak, prosjektområde og arkivering.
11. **Beredskap:** barnevernvakt, akuttfunksjon, nettverkskart og mobil/responsiv arbeidsflate.
12. **Dokumenter:** malstyring, forhåndsutfylling, vedleggsvalg, sikker sladding/anonymisering og signering.

Akseptanse:

- Ende-til-ende-test fra melding til avsluttet/arkivert sak.
- Fristtester for alle lov- og kontraktsfrister.
- Faglig godkjenning av barnevernsfaglig produkteier og Halden.
- Ingen direkte sletting av historikk; korreksjoner og tilgang er sporbare.

### Arbeidsstrøm E – kommunikasjon og innbyggerflate

**Krav:** 7–9, 16–17, 20, 29.

Status 26.08.2026: Første operative flyt for krav 8 er levert for
bekymringsmelding. Kommuneansatte kan bruke én «Sikker sending»-handling, og
innbyggeren leser/svarer i en separat BankID-/Buypass-beskyttet portal.
Innhold og vedlegg sendes ikke i e-post. Vedlegg har en fail-closed ClamAV-
gate, separat privat karantene og tidsstyrt sletting; faktisk privat
ClamAV-tjeneste og EICAR-produksjonsbevis er fortsatt en driftsakseptanse.
Dette dekker ikke de øvrige punktene i arbeidsstrømmen eller
produksjonsakseptansen nedenfor.

- ID-porten-/eID-innlogget portal for foresatte, barn og fullmektiger.
- Sikker toveis melding og dokumentdeling med varsel uten sensitivt innhold.
- Samtykke, fullmakt, lest-status, tidsstempel og komplett audit.
- E-signering via godkjent leverandørabstraksjon.
- SMS-adapter der Halden kan konfigurere egen gateway uten leverandørlåsing.
- Videomøte som lenke-/leverandørintegrasjon uten automatisk opptak.
- Microsoft Graph-integrasjon for Outlook/kalender/e-post der Halden godkjenner scopes.
- Huskelister og oppgaver knyttet til sak, frist og ansvarlig.

### Arbeidsstrøm F – arkiv og dokumenthåndtering

**Krav:** 4, 6, 15–17, 24, 26, 29.

1. Følg `docs/runbooks/documaster-implementeringsoppstart.md`, inngå
   partner-/API-avtale og få Documaster-testtenant.
2. Verifiser separat IDP/token-URL, kodelister, skjerming, administrativ enhet,
   mapper, journalposter, dokumentversjoner og idempotens.
3. Utvid arkivering fra rapport/journal til melding, undersøkelse, vedtak, plan, dialog, innsyn og klage.
4. Bygg Elements-kobling for sak-/arkivflyt der Halden krever begge systemer.
5. Støtt PDF/A, metadata, klassifikasjon, hjemmel, avlevering og avslutningsuttrekk.
6. Gjennomfør feil-/retry-test, duplikattest og avstemming mellom Tidum og arkivkjerne.

### Arbeidsstrøm G – DigiBarnevern og øvrige integrasjoner

**Krav:** 26 og 28.

- **FIKS IO/Nasjonal portal:** kundeeid FIKS-integrasjon, transport, signatur-/sertifikatvalidering, dekryptering, schema-validering, idempotens, kvittering og dead-letter-kø.
- **FREG via FIKS:** Halden oppretter rolle og dataminimering; oppslag registrerer barn én gang, har manuell fallback og håndterer skjermede adresser.
- **BFK:** importer og versjoner Bufdirs datasett, vis kilde/versjon, støtte hele saksforløpet og håndtere løpende oppdateringer.
- **Barnevernsregisteret:** implementer gjeldende XSD, daglig automatisk innsending, validering, kvitteringer, feilretting og avstemming.
- **SvarUt/SvarInn:** sikker ekspedering, status, retur og arkivering.
- **Visma Enterprise Plus:** klientøkonomi, lønn, regnskap, leverandør/reskontro og returstatus.
- **Microsoft Intune:** dokumenter at webklienten ikke krever lokal installasjon; dersom mobil/native brukes, lever managed app configuration og test mot Haldens MDM-policy.

Eksterne avhengigheter skal ha kontaktperson, bestillingsdato, testtilgang, produksjonstilgang og siste forsvarlige dato i kravregisteret.

### Arbeidsstrøm H – klientøkonomi

**Krav:** 27.

Gjenbruksstrategi: stabiliser først den eksisterende PowerOffice-flyten og lønnseksportene, og dokumenter eksakt hvilke data som sendes. Fakturaprototypen kan gjenbruke skjema/visning, men må få én konsistent API-kontrakt, tenant-/objektscope, reell PDF og tester. Dette dekker bare et smalt delområde; full klientøkonomi krever fortsatt ERP-/bank-/EHF-partner eller en vesentlig ny modul.

- Reskontro per barn/sak og leverandør/oppdragstaker.
- Avtaler og fast/variabel godtgjøring for fosterhjem, støttekontakter og besøkshjem.
- Attestasjon, anvisning og fire-øyne-kontroll.
- Norske kontonumre og utenlandsbetaling med IBAN/BIC.
- Remittering/bankintegrasjon med kvittering og retur.
- Inn-/utbetaling, automatisk avstemming og avviksbehandling.
- EHF-faktura, skann/import, attestasjon og anvisning.
- Overføring til Visma Enterprise Plus og full avstemming mot regnskap/lønn.
- Rapporter, statistikk og audit på alle økonomihendelser.

Akseptanse skal dekke normalbetaling, retur, duplikat, feil konto, utenlandsbetaling, reversering, avstemming og tilgangsseparasjon.

### Arbeidsstrøm I – rapportering og styringsinformasjon

**Krav:** 10–13 og 28.

- Standardrapporter for ledelse, Statsforvalter, Bufdir og SSB/KOSTRA.
- Automatisk Barnevernsregister-rapportering og kontrollpanel for avviste poster.
- Egen rapportbygger med felt-/rollebegrensning.
- Ad hoc-uttrekk i CSV/Excel og dokumentert API.
- Nøkkeltall med datadefinisjon, kilde, oppdateringsfrekvens og tilgang.
- Planlagte kjøringer og leveringskvittering.
- Alle uttrekk tenant-, rolle- og saksskopet; sensitive eksporter logges og tidsbegrenses.

### Arbeidsstrøm J – personvern, ISMS og kontraktsbevis

**Krav:** 19, 21–24, Bilag 10 og sikkerhetsspørsmål 1–37.

- Oppdater behandlingsprotokoll for barn, foreldre, meldere, fullmektiger, helse-/sosialdata, straffbare forhold, fødselsnummer og skjermede adresser.
- Lever behandlingsflyt, dataflytdiagram, formål, instruks, retensjon og sletting.
- Utarbeid DPIA-underlag; Halden eier og godkjenner DPIA.
- Etabler ISMS med policy, mål, roller, risikometode, hendelsesprosess, leverandøroppfølging, revisjon og ledelsens gjennomgang.
- Signer taushetserklæringer og dokumenter sikkerhetsopplæring.
- Etabler underdatabehandlerstyring, risikovurdering og endringsvarsel.
- Gjennomfør uavhengig sikkerhetsvurdering/pentest; ISO 27001 kan være langsiktig spor, men skal ikke påstås før sertifisering.
- Etabler loggeretensjon, SIEM-eksport, tilgangsreview og dokumentert avvikslukking.

### Arbeidsstrøm K – SLA, support og beredskap

**Krav:** 25 og Bilag 4–5.

- Månedsmålt tilgjengelighet minst 99,5 prosent.
- Overvåket responstid mot kontraktens 500 ms-krav med avtalte testscenarier og lastprofil.
- RPO maksimalt 2 timer og tjenesten gjenopprettet innen 24 timer.
- Kapasitets-/lasttest med samtlige avtalte samtidige brukere uten ytelsesforringelse.
- Telefon, e-post og chat med utfylte åpningstider og navngitte brukere.
- Bemanning slik at 80 prosent av samtaler besvares innen 60 sekunder, e-post senest neste virkedag og chat senest 5 minutter.
- Hendelsesklassifisering, eskalering, varslingsmaler, statusoppdatering og post-mortem.
- Planlagt vedlikehold varsles minst 14 dager før når kontrakten krever det.
- Servicekreditt beregnes og rapporteres automatisk.
- Årlig statusmøte, SLA-rapport og sikkerhets-/oppetidsrapport på forespørsel.

### Arbeidsstrøm L – migrering fra Modulus Barn

**Krav:** 30, Bilag 3 og avslutningskravene.

1. Innhent komplett eksportspesifikasjon, datavolum, vedleggsformat, historikk og kodeverk.
2. Klassifiser hvilke data som skal migreres, arkiveres separat eller utgå.
3. Lag kilde-til-mål-kartlegging med transformasjonsregler og datakvalitetsregler.
4. Bygg re-kjørbar, idempotent og auditert migreringspipeline.
5. Prøvemigrering 1: teknisk dekning og feilklassifisering.
6. Prøvemigrering 2: fullskala ytelse, dokumenter, relasjoner og avstemming.
7. Halden godkjenner rapport for antall saker, personer, journalposter, dokumenter, økonomiposter og avvik.
8. Produksjonscutover med skrivefrys, deltaimport, backup, rollback og signert godkjenning.
9. Kildedata slettes ikke før Halden har godkjent migrering og arkiv.

### Arbeidsstrøm M – opplæring og innføring

- Rollekartlegging og superbrukernettverk.
- Norsk administrator-, leder- og saksbehandlerdokumentasjon.
- Opplæring i alle moduler og integrasjoner før produksjonsbruk.
- Scenarioøvelser: melding, undersøkelse, vedtak, plan, innsyn, økonomi, avvik og arkiv.
- Tilgjengelige e-læringsressurser, hurtigveiledninger og release notes.
- Kontor-/hypercare-plan første fire uker etter go-live.

## 7. Krav 1–31 – leveranse- og akseptanseplan

| Krav | Type | Nå | Leveranse og bevis | Mål |
|---:|---|---|---|---|
| 1 | Skal | Delvis | Full elektronisk/manuell melding inkl. ufødt, tillegg, søskenkopi og redigeringshistorikk; E2E-test | 25.09 |
| 2 | Skal | Mangler | Konfigurerbar faseflyt melding–avslutning; faglig prosess- og overgangstest | 09.10 |
| 3 | Skal | Delvis | Eier, frist, varsling og eskalering på alle relevante objekter; cron-/E2E-test | 11.09 |
| 4 | Skal | Delvis | Strukturert journal, forfatter/tid, vedlegg og korreksjon; audit-/filtest | 18.09 |
| 5 | Skal | Delvis | Stabiliser eksisterende § 6-3-mal, mål/aktiviteter og seeding; lever autoritativ tiltaks-/omsorgsplan med ansvar, dato, status, versjon og evaluering; E2E-test | 09.10 |
| 6 | Skal | Delvis | Brev-/vedtaksmaler med forhåndsutfylling og versjon; maltest | 25.09 |
| 7 | E | Mangler | E-sign-adapter og signert dokumentbevis | 16.10 |
| 8 | Skal | Delvis | Internt varsel + sikker ekstern portal/FIKS-dialog; sikkerhetstest | 16.10 |
| 9 | E | Mangler | Leverandørnøytral SMS-gateway konfigurert av Halden; testleveranse | 16.10 |
| 10 | Skal | Mangler | Standard Bufdir/Statsforvalter/SSB-rapporter og planlagt kjøring | 23.10 |
| 11 | E | Delvis | Rollebegrenset rapportbygger; demo og test | 23.10 |
| 12 | E | Delvis | Sikker CSV/Excel/API-eksport av barnevernsdata; BOLA-/audit-test | 23.10 |
| 13 | E | Delvis | Nøkkeltallskatalog og dashboard med datadefinisjoner | 23.10 |
| 14 | E | Delvis | Saks-/tenant-RBAC, tre minimumsroller og nødtilgang; authz-matrise | 18.09 |
| 15 | Skal | Delvis | Alle saksendringer og dokumentoppslag logges og kan søkes; dekningsrapport | 25.09 |
| 16 | E | Delvis | Gjenbruk GDPR-eksport/PDF/PII; lever partsinnsyn, utskrift, journalkopi og klageflyt; E2E-test | 16.10 |
| 17 | E | Delvis | Utvid eksisterende eksport til komplett, kontrollert saksuttrekk med utleveringslogg | 16.10 |
| 18 | E | Delvis | Klassifiser og utvid generell sak/rapport/arkiv til forebyggende arbeid | 16.10 |
| 19 | E | Delvis | TLS + kryptering i ro for DB, objekt, backup og logger; arkitekturbevis | 11.09 |
| 20 | Skal | Delvis | Produksjonsbevis for eksisterende BankID/Buypass; Entra for ansatte, Halden-eid ID-porten eller skriftlig akseptert eID-alternativ, MFA; OIDC-test | 01.10 |
| 21 | E | Mangler bevis | ISMS/gap-vurdering og uavhengig sikkerhetsrapport | 06.11 |
| 22 | Skal | Delvis | Personvernfunksjoner, dataflyt og komplett DPIA-underlag | 25.09 |
| 23 | Skal | Ikke oppfylt | Norsk produksjonsplattform og lokasjonsbevis | 18.09 |
| 24 | Skal | Delvis | Sikker loggforvaltning, retensjon, tilgang og SIEM-eksport | 25.09 |
| 25 | Skal | Mangler | Utfylt SLA, måling, support, DR og servicekreditt; driftsprøve | 06.11 |
| 26 | E | Delvis | Elements, Documaster, Visma, FIKS, Entra, ID-porten og Intune-bevis | 30.10 |
| 27 | E | Delvis | Stabiliser PowerOffice/lønnseksport og fakturaprototype; lever full klientøkonomi, bank, EHF, lønn og Visma-avstemming | 30.10 |
| 28 | Skal | Mangler | Nasjonal portal, BFK og Barnevernsregister; integrasjonstest | 30.10 |
| 29 | E | Delvis | Prioritert funksjonspakke og ærlig delkravsbesvarelse; demo | 30.10 |
| 30 | Skal | Mangler tilbudsbevis | Signert etablerings-, migrerings- og opplæringsplan | 27.08 |
| 31 | E | Delvis | To timers demonstrasjon med økonomi, dokumenter/vedlegg og integrasjoner | Før evaluering |

## 8. Test- og bevisstrategi

### 8.1 Obligatoriske testlag

1. Enhetstester for domeneregler, frister, rettigheter og transformasjon.
2. Integrasjonstester mot ekte PostgreSQL med isolert testdatabase.
3. Kontraktstester mot mock og leverandørsandkasser.
4. BOLA/IDOR-matrise for alle objektendepunkter og roller.
5. E2E-test av hele barnevernssaksgangen.
6. Migreringstest med telling, hash og relasjonskontroll.
7. WCAG 2.1 AA: axe, tastatur, skjermleser, zoom og manuell kontroll.
8. Ytelse: 500 ms-kontraktskrav, samtidighet, kø og store dokumenter.
9. DR: backup, punkt-i-tid-restore, tap av region/tjeneste og rollback.
10. Sikkerhet: SAST, dependency/secret scan, konfigurasjon, pentest og retest.

### 8.2 Bevispakke per krav

Hvert krav får en mappe eller sporbar referanse med:

- godkjent tilbudstekst;
- arkitektur-/prosessbeskrivelse;
- kode-/migrasjonsreferanse;
- testprotokoll og resultat;
- skjermbilder eller demoopptak uten persondata;
- drifts-/monitoreringsbevis;
- ekstern bekreftelse der relevant;
- signert akseptanse.

## 9. Leverandør- og tilbudsdokumenter

Følgende må være komplett før G2:

- Bilag 2, 3, 4, 5, 6 og 10.
- ESPD i Mercell.
- Firmaattest.
- Skatte- og MVA-attest, maksimalt seks måneder gammel.
- Kredittvurdering A eller tilsvarende, maksimalt tre måneder gammel.
- HMS-erklæring med nødvendige signaturer.
- Erklæring om lønns- og arbeidsvilkår.
- Etikkerklæring og plan for aktsomhetsvurderinger i leverandørkjeden.
- Nøkkelpersonell og CV-er.
- Underleverandøroversikt med tjeneste, sted, data, avtale og revisjonsrett.
- Prisark med alle kostnader, også migrering, integrasjoner, reise, opplæring, support og avslutning.
- Sladdet tilbud i én sikker fil med konkret sladdingsbegrunnelse.

## 10. Eksterne avhengigheter

| Avhengighet | Handling nå | Seneste sikre dato | Plan B |
|---|---|---|---|
| ID-porten | Avklar Halden-eid integrasjon og Digdir-vilkår | 28.08/ved tildeling | Direkte eID bare med skriftlig kravaksept |
| Virksomhetssertifikat | Bestill test og produksjon | 26.08 | Bruk godkjent partner med delegasjon |
| KS FIKS | Kontakt KS Digital, opprett testkonto/scopes | 25.08 | Ingen troverdig plan B for krav 28 – stoppkrav |
| FREG-rolle | Halden etablerer hjemmel, rolle og dataminimering | Umiddelbart etter tildeling | Manuell registrering er kun fallback |
| Documaster | Partneravtale og sandkasse | 26.08 | Annen godkjent arkivadapter bare etter Halden-godkjenning |
| Elements | API-/testtilgang via Halden | Etter tildeling + 3 dager | Avtalt fil-/Noark-grensesnitt |
| Visma Enterprise Plus | Partner-/kunde-API, format og testmiljø | Etter tildeling + 3 dager | Godkjent filutveksling med avstemming |
| EHF-aksesspunkt | Velg og inngå avtale | 04.09 | Eksisterende ERP med dokumentert EHF |
| Norsk drift | Tjenestekartlegging og avtale | 04.09 | Alternativ norsk leverandør; EØS kun etter skriftlig godkjenning |
| Ekstern pentest | Reserver testuke | 28.08 | Kvalifisert alternativ leverandør |
| Modulus-eksport | Halden/avgående leverandør gir eksport og datamodell | Etter tildeling + 3 dager | Eskaler kontraktsmessig; kan blokkere migrering |

## 11. Risikoregister

| Risiko | Konsekvens | Tiltak / stoppkriterium |
|---|---|---|
| For lite team eller budsjett | Urealistisk JA-svar | Dokumentert bemanning ved G1, ellers no-bid/partner |
| ID-porten kan ikke eies av Tidum | Krav 20/26 feiler | Halden-eid integrasjon eller skriftlig akseptert direkte eID |
| FIKS/DigiBarnevern-tilgang forsinkes | Krav 1/28 feiler | Bestill umiddelbart; manglende tilgang før avtalt siste dato er styringssak |
| BFK/Barnevernsregister-spesifikasjon endres | Feil rapportering/fagstøtte | Versjonert import, kontrakttest og løpende oppdateringsmekanisme |
| Norsk tjeneste mangler for en komponent | DPA-brudd | Bytt komponent eller innhent uttrykkelig skriftlig unntak før data |
| Modulus-eksport er ukjent/ufullstendig | Migreringsfrist ryker | Kildekartlegging straks etter tildeling, to fullskala prøver og avstemming |
| G-10 og PR #21 konflikter | Sikkerhetsregresjon | Integrasjonsbranch, full authz/E2E-regresjon og uavhengig review |
| Kritiske QA-fikser blir liggende i gammel gren | SQL-injection, uautentisert innhold/opplasting og ustabile maler | Selektiv port med konflikt-/migrasjonsgjennomgang før demo; ingen hel-merge av 156 commits gammel gren |
| Økonomimodulen undervurderes | Lav kvalitet/krav 27 feiler | Egen trepersoners strøm + Visma-/bankpartner; prioriter evalueringsdemo |
| Prototyper telles som ferdig funksjon | Feil Bilag 2-svar og demorisiko | Fakturagrunnlaget har API-/DB-/E2E-bevis, men skal fortsatt beskrives som smal leverandørfakturering; merk øvrige prototyper/mockflater og krev domenedekkende bevis før grønn status |
| Repo-dokumentasjon lover mer enn bevis | Avvisning/kontraktsbrudd | Påstandskontroll; fjern eller kvalifiser udokumenterte påstander |
| Drift oppfyller ikke 500 ms/RPO 2 t | SLA-brudd | Lasttest, PITR, norsk observability og DR-prøve før produksjon |
| Sladding kan reverseres | Forretningshemmeligheter lekker | Flatten/redaction-verktøy + uavhengig tekst-/metadata-kontroll |

## 12. Go-live og etterleveranse

### Før produksjonssetting

- Ingen åpne kritiske eller alvorlige feil.
- Alle `Skal`-krav grønne og signert av kravansvarlig.
- Alle integrasjoner har vellykket ende-til-ende-test og avstemming.
- Produksjonsmigrering er godkjent og rollback er testet.
- DPIA, DPA og underdatabehandlere er godkjent før behandling.
- RPO/RTO, tilgjengelighet, ytelse, sikkerhet og WCAG er testet.
- Supportvakt, kontaktpunkter, statusside og hendelsesmaler er aktive.
- Opplæring og administratoroverlevering er gjennomført.

### Hypercare 15.11–15.12

- Daglig operativ status første to uker, deretter tre ganger per uke.
- Tett overvåking av frister, integrasjoner, dataavvik, responstid og sikkerhet.
- Kritiske feil håndteres umiddelbart; rotårsaksanalyse innen fem virkedager.
- Første SLA-/sikkerhetsrapport innen 30 dager.
- Migrerings- og tilgangsavvik lukkes før ordinær forvaltning.

## 13. Første handlinger

Følgende skal startes umiddelbart:

1. Utnevn programleder, tilbudsleder og barnevernsfaglig produkteier.
2. Gjennomfør G1 og avgjør om bemanning/partnere gjør alle `Skal` realistiske.
3. Bruk den ferdige kravmatrisen til å skrive og godkjenne første Bilag 2-besvarelse.
4. Reserver norsk drift, sikkerhetsgjennomgang og pentest.
5. Kontakt KS Digital, Digdir, Documaster, EHF-aksesspunkt og integrasjonseiere.
6. Opprett integrasjonsbranch for PR #21 og G-10; porter kritiske QA-fikser selektivt; legg testene inn som blokkerende CI.
7. Behold den rettede, bevisbaserte Documaster-teksten, og merk øvrige
   demo-/CMS-flater som `live`, `simulert` eller `prototype`.
8. Ferdigstill Bilag 3–6 og 10, kvalifikasjonsbevis, signaturer og sladdingspakke.
9. Ta eksplisitt bid/no-bid-vedtak før tilbudet bindes.

## 14. Autoritative eksterne referanser

- [Digdir – Ta i bruk ID-porten](https://samarbeid.digdir.no/id-porten/ta-i-bruk-id-porten/94)
- [Digdir – ID-porten-krav mot private systemleverandører](https://samarbeid.digdir.no/id-porten/kan-offentlege-verksemder-kreve-innlogging-med-id-porten-i-alle-system/2809)
- [KS Fiks – Integrasjoner og produksjonstilgang](https://developers.fiks.ks.no/felles/integrasjoner/)
- [KS Fiks – Maskinporten](https://developers.fiks.ks.no/felles/difiidportenklient/)
- [KS Fiks – Folkeregister](https://developers.fiks.ks.no/tjenester/register/folkeregister/)
- [Bufdir – DigiBarnevern](https://www.bufdir.no/prosjekter/digibarnevern/)
- [Bufdir – Barnevernsfaglig kvalitetssystem](https://www.bufdir.no/fagstotte/barnevern-oppvekst/bfk/)
- [Bufdir – Barnevernsregisteret](https://www.bufdir.no/fagstotte/barnevern-oppvekst/barnevernsregisteret/)
- [Microsoft – Entra for flerleietaker-SaaS](https://learn.microsoft.com/en-us/entra/architecture/authenticate-applications-and-users)
- [Microsoft – Azure-regioner, Norge øst/vest](https://learn.microsoft.com/en-us/azure/reliability/regions-list)
- [Anskaffelser.no – EHF-fakturering og betaling](https://www.anskaffelser.no/kategorispesifik-veiledning/fagsystemer-digitale-anskaffelser/katalog-ordre-og-faktura-ehf/fakturering-og-betaling)
