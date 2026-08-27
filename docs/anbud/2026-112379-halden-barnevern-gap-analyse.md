# Anbudsanalyse: Halden kommune — Administrativt system for barnevernstjenesten

**Doffin-referanse:** [2026-112379](https://doffin.no/notices/2026-112379) · TED: [502088-2026](https://ted.europa.eu/en/notice/-/detail/502088-2026)
**Status:** Analyse ferdigstilt · Sist oppdatert 03.08.2026
**Oppfølging:** Gap-listen er omsatt til strategisk plan i [Veikart: Barnevern som ny vertikal](../veikart-barnevern-vertikal.md)

---

## 1. Nøkkelfakta om anskaffelsen

| Felt | Verdi |
|---|---|
| Oppdragsgiver | Halden kommune (org.nr. 959 159 092) |
| Kontaktperson | Helge Stølan, helge.stolan@halden.kommune.no, +47 69 17 45 00 |
| Tittel | Administrativt system for barnevernstjenesten |
| Intern referanse | 2026/3663 |
| Prosedyre | Åpen anbudskonkurranse (direktiv 2014/24/EU, anskaffelsesforskriften) |
| Kunngjort | 21.07.2026 |
| Frist tilleggsspørsmål | 21.08.2026 kl. 12:00 |
| **Tilbudsfrist** | **28.08.2026 kl. 12:00** (offentlig åpning samme tidspunkt) |
| Vedståelsesfrist | 3 måneder |
| Estimert verdi | 3 200 000 NOK eks. mva. |
| Kontraktsvarighet | 48 måneder |
| Rammeavtale | Nei |
| Innlevering | Elektronisk, obligatorisk, via [Mercell](https://permalink.mercell.com/283784436.aspx) |
| Språk | Norsk (dokumenter og tilbud) |
| Varianter / flere tilbud | Ikke tillatt |
| eFaktura | **Obligatorisk** (i praksis EHF/PEPPOL) |
| Karensfrist | 10 dager etter tildeling |
| Klageinstans | Søndre Østfold tingrett |
| Krav om personell-CV | Ja — «Navn og faglige kvalifikasjoner til personalet som er tildelt å utføre kontrakten, må oppgis» |

**CPV-koder:** 72230000 (kundespesifisert programvareutvikling, hovedklassifisering), 48311100 (dokumenthåndteringssystem), 48333000 (kontakthåndtering), 48510000 (kommunikasjonsprogramvare), 72200000, 72211000, 72268000.

Merk: Hovedklassifiseringen er *utvikling av kundespesifisert programvare* — Halden er eksplisitt åpne for en leverandør «som er innovativ og som vil utvikle systemet inn i framtiden». Dette er ikke en ren hyllevare-anskaffelse, og det senker terskelen for en utfordrer mot etablerte fagsystemer.

## 2. Hva Halden kommune faktisk ber om

Fra kunngjøringens beskrivelse og hovedtrekk:

1. **Hele verdikjeden i barnevernstjenesten** — saksbehandling fra bekymringsmelding til avsluttet sak.
2. **All kommunikasjon mellom partene i en sak** — digital samhandling med brukerne i **sikre kanaler**.
3. **Arkiv:** egen arkivkjerne **eller integrasjon mot Documaster** (kommunens arkivsystem). Systemet må oppfylle «alle krav og lover ved arkivering av alle typer dokumenter uansett grad av sensitivitet» → Noark 5-krav og arkivloven.
4. **Folkeregisterintegrasjon (DSF/Freg):** «Barn registreres én gang i løpet av saksgangen. Registreringen av barnets navn etc. skal hentes fra DSF», med mulighet for manuell registrering.
5. **Gjenbruk av data** og forenkling av arbeidsoppgaver — moderne system med «den beste brukerdialogen».
6. Optimalisert, samordnet og forenklet administrasjon av tjenesten.

Listen er ikke uttømmende — den fulle kravspesifikasjonen ligger i konkurransedokumentene på Mercell og må hentes derfra.

## 3. Kravnedbryting — hva et barnevernsfagsystem må inneholde

Basert på kunngjøringen, barnevernsloven (LOV-2021-06-18-97), arkivloven/Noark 5, og etablert funksjonalitet i konkurrerende systemer (Visma Familia / Visma Flyt Barnevern, Netcompany Modulus Barn fra DigiBarnevern-programmet):

### 3.1 Saksbehandling (kjernen)
- Mottak og vurdering av **bekymringsmeldinger** (frist 1 uke for gjennomgang, bvl. § 2-1), inkl. mottak fra Nasjonal portal for bekymringsmelding (KS Fiks).
- **Undersøkelsessak** med lovpålagte frister (3 mnd, utvidbart til 6 mnd, bvl. § 2-2) og fristovervåking.
- **Vedtak** (hjelpetiltak, akuttvedtak, omsorgsovertakelse) med hjemmelsreferanser, maler og godkjenningsflyt.
- **Tiltaksplaner og omsorgsplaner** (bvl. §§ 8-1, 8-3) med evaluering og frister.
- Oppfølging av **fosterhjem og institusjon**, tilsynsansvar, oppfølgingsbesøk.
- Saksflyt mot **barneverns- og helsenemnda** (oversendelser, prosesskriv) og domstol.
- **Barnets medvirkning** dokumentert gjennom hele saksgangen (bvl. § 1-4) — også et av de fem punktene i Tidums eksisterende barnevernsmal.
- Journalføring/løpende journal per barn, aktivitetslogg, fristkontroll på tvers av saker.
- **Rapportering:** halvårsrapportering til statsforvalteren, KOSTRA/SSB-uttrekk.

### 3.2 Kommunikasjon og samhandling (eksplisitt vektlagt)
- Sikker digital dialog med **parter i saken** (foreldre, barn over 15, fullmektiger/advokater): innsyn, meldinger, dokumentdeling i sikre kanaler.
- **ID-porten**-pålogging for innbyggere (nivå høyt), evt. digital postkasse / SvarUt (KS Fiks) for utgående ekspedering.
- Samtykkehåndtering og partsinnsyn etter forvaltningsloven/personopplysningsloven.

### 3.3 Arkiv og dokumenthåndtering
- **Noark 5**-kompatibel arkivkjerne *eller* dyp integrasjon mot **Documaster** (Halden nevner Documaster eksplisitt — integrasjonssporet er langt billigere enn å bygge egen godkjent kjerne).
- Journalposter, skjerming, gradering («uansett grad av sensitivitet»), avlevering.

### 3.4 Integrasjoner
- **Folkeregisteret (DSF/Freg)** — via Skatteetatens FREG-API eller KS Fiks Folkeregister. Krever håndtering av **adressegradering kode 6/7** (strengt fortrolig/fortrolig adresse) — kritisk i barnevern.
- Documaster (arkiv), KS Fiks-plattformen (bekymringsmelding, SvarUt), eFaktura/EHF mot kommunens økonomisystem.

### 3.5 Sikkerhet og personvern
- Barnevernsdata er **GDPR art. 9 særlige kategorier** + taushetsplikt etter bvl. § 13-1: streng tilgangsstyring per sak, «need to know», sporbar audit-logg, DPIA obligatorisk.
- Norsk/EØS datalagring i praksis et krav for kommunale barnevernsdata; databehandleravtale (SCC alene er svakt kort her — se gap G-9).
- Universell utforming: WCAG 2.1 AA (forskrift om universell utforming av IKT) — gjelder både saksbehandlerflate og innbyggerflate.

### 3.6 Leveranse og drift
- Norskspråklig system og dokumentasjon, opplæring, migrering fra eksisterende system (sannsynligvis Familia eller Modulus Barn — avklares i konkurransegrunnlaget), SLA/drift i 48 mnd, eFaktura (EHF), navngitt personell med CV.

## 4. Hva Tidum/plattformen allerede har (gjenbrukbart)

Basert på full kartlegging av kodebasen (server, klient, mobil, dokumentasjon) per 03.08.2026:

### 4.1 Direkte relevant for dette anbudet

| Kapabilitet | Hvor | Relevans |
|---|---|---|
| **Saksmodell** (`saker`): saksnummer, klientreferanse, oppdragsgiver, institusjon, tiltakstype, tildelte brukere, lokasjoner | `shared/schema.ts:1918`, `server/sakerRapportRoutes.ts` | Fundament for saksbegrepet — men modellert som *tiltakssak*, ikke *barnevernssak* |
| **Rapportmodul med godkjenningsflyt**: utkast → til godkjenning → returnert → godkjent → arkivert, per-seksjon-kommentarer, signaturer, PDF-generering med branding | `server/sakerRapportRoutes.ts`, `server/rapportGenerator.ts` | Gjenbrukbar dokument-/godkjenningsflyt |
| **Barnevern-maler**: systemmal for barnevernsrapport + **tiltaksplan etter barnevernsloven § 6-3** (formål, hovedmål/delmål, barnets medvirkning, foreldres medvirkning, samtykker og hjemler, evalueringsdato) | `server/seed/rapport-templates.ts` | Viser reell domeneforståelse — sterkt kort i tilbudet |
| **Revisjonslogging i tre lag**, inkl. **hash-kjedet** (tamper-evident) audit-logg med IP/user-agent/request-ID | `shared/schema.ts:938` (`company_audit_log`), `server/lib/log-row-audit.ts`, `rapport_audit_log` | Sporbarhetskrav for sensitiv saksbehandling |
| **GDPR-maskineri**: art. 15/17/20-endepunkter, retensjons-cron med hjemmelsreferanser — inkl. **barnevernsloven § 10-1 (25 års oppbevaring)** som per-vendor-overstyring, PII-autodeteksjon/-maskering på norsk | `server/lib/gdpr.ts`, `server/routes/gdpr-routes.ts`, `server/smartTimingRoutes.ts:272-400` | Direkte relevant for art. 9-data |
| **Avvik/HMS-modul** med alvorlighet, kategorier (vold/trusler), GDPR-auto-erstatning, eskaleringsregler per vendor | `server/routes/avvik-routes.ts`, `shared/schema.ts:2051` | Gjenbrukbar for hendelser i saker |
| **Multi-tenant RBAC** med 10 roller (bl.a. tiltaksleder, case_manager), delegeringsmatrise, rollevisning | `shared/roles.ts` | Tilgangsstyring-fundament |
| **Compliance-dokumentasjon**: signaturklar databehandleravtale, art. 30-behandlingsprotokoll (nevner eksplisitt barn og barnevern som datakategorier), tilgjengelighetserklæring | `docs/compliance/` , `client/src/pages/tilgjengelighet.tsx` | Kan vedlegges tilbudet |
| **BRREG-integrasjon**, e-posttjeneste, varsler, PDF/Excel/CSV-eksport, ansattimport, offline-kø for feltarbeid | diverse | Plattformbyggeklosser |
| **E2E-testrigg** (19 Playwright-spec, 4 664 linjer inkl. full forretningsflyt), CI, drift på Vercel+Render+Neon | `tests/`, `.github/workflows/` | Leveransekvalitet |

### 4.2 Viktig å være ærlig på internt

Tidum er i dag et **timeføring- og rapporteringssystem for tiltaksbedrifter/institusjoner** — ikke et saksbehandlingssystem for kommunal barnevernstjeneste. Rapportmodulen dokumenterer *tiltaksarbeid rundt* et barn (miljøarbeider → tiltaksleder → institusjon); den dekker ikke myndighetsutøvelsen (meldingsavklaring, undersøkelse, vedtak, nemnd). I tillegg har kartleggingen avdekket tekniske forhold som må ryddes uansett (se G-10).

## 5. Gap-analyse — hva vi mangler mot kravene

Sortert etter alvorlighet for dette anbudet. «Roadmap-status» refererer til `docs/compliance/roadmap.md`.

| # | Gap | Kravgrunnlag | Status i dag | Estimat |
|---|---|---|---|---|
| **G-1** | **Barnevernfaglig saksbehandling**: mottak/avklaring av bekymringsmeldinger (1-ukesfrist), undersøkelsessak med 3/6-mnd fristovervåking, vedtak med hjemler, akuttvedtak, omsorgs-/tiltaksplaner med evaluering, fosterhjems-/institusjonsoppfølging, nemnd-/domstolsflyt, journal per barn, halvårsrapportering statsforvalter, KOSTRA/SSB | «Hele verdikjeden innenfor barneverntjenesten» | Kun tiltaksrapportering + §6-3-mal finnes | **Det store byggeprosjektet** — 6–12 mnd kjerneutvikling |
| **G-2** | **Arkiv: Noark 5-kjerne eller Documaster-integrasjon** | Eksplisitt krav i kunngjøringen | Ingenting (kun `arkivert`-status på rapporter) | Documaster har dokumentert API — integrasjonssporet er realistisk (uker), egen godkjent kjerne er det ikke |
| **G-3** | **Folkeregisteret (DSF/Freg)**: oppslag ved registrering av barn, «registrer én gang», manuell fallback, **adressegradering kode 6/7** | Eksplisitt krav | Ingenting | Freg via Skatteetaten/KS Fiks Folkeregister; krav om behandlingsgrunnlag + virksomhetssertifikat |
| **G-4** | **Sikker innbyggerdialog**: partsinnsyn, meldinger og dokumentdeling med foreldre/barn/advokater i sikker kanal, **ID-porten**-pålogging | «All kommunikasjon … mellom partene i en sak», «sikre kanaler» | Ingen innbyggerflate; ID-porten er P0 i roadmap, ikke påbegynt | ID-porten 3–5 uker (iht. egen pipeline-plan) + innbyggerportal som ny app-flate |
| **G-5** | **KS Fiks**: Nasjonal portal for bekymringsmelding, SvarUt/SvarInn for utgående ekspedering | Implisitt (standard i kommunal barnevern) | P1 i roadmap, ingen kode | Per-tjeneste integrasjon, moderat |
| **G-6** | **eFaktura (EHF/PEPPOL)** | **Obligatorisk** iht. kunngjøringen | P1 i roadmap, ingen kode | Kan løses via aksesspunkt-leverandør (f.eks. Unimicro/Logiq) raskt |
| **G-7** | **DPIA for barnevernsdata + sikkerhetsdokumentasjon** (ISO 27001, pentest, incident response) | Forventet i kravspec for art. 9-data | DPIA «trenger advokat» (P0), ISO 27001 6–12 mnd, pentest budsjettert men ikke utført | DPIA må uansett gjøres før kontrakt |
| **G-8** | **Datalokalisering**: Render (USA + SCC), Neon (London), OpenAI-kall, GA4/Stripe i dataflyten | Kommunal barnevernsdata krever i praksis EU/EØS (helst Norge) og streng underdatabehandlerliste | DPA finnes, men arkitekturen er ikke tilpasset | Flytt til EU/EØS-region (Render EU/Hetzner/Azure Norge); ingen skytjeneste utenfor EØS i saksflaten; AI-funksjoner må ut eller over på EØS-hostet modell |
| **G-9** | **WCAG 2.1 AA reell etterlevelse**: axe-testen kan ikke kjøre (`@axe-core/playwright` ikke installert), Quill-editor tastaturproblemer, tynn ARIA utenfor UI-kittet, `lang` oppdateres ikke, ingen `prefers-reduced-motion` | Forskrift om universell utforming av IKT | Delvis samsvar (ærlig erklæring finnes) | Kjente avvik er allerede listet i erklæringen — lukk dem |
| **G-10** | **Sikkerhetsherding** (uavhengig av anbudet): historisk dev-mode auth-bypass, fallback-hemmeligheter, uforseglet PowerOffice ClientKey, manglende helmet/CSP/HSTS og CSRF, ingen tilpasset RLS, inkonsistent vendor-scoping og ingen 2FA/MFA | Vil bli funnet i enhver sikkerhetsrevisjon | Integrasjonsgrenen har lukket dev-bypass/fallback, transportkontroller, brede BOLA-flater, forseglet/roterbar PowerOffice ClientKey og RLS fase 1–3A for bekymringsmeldingskjernen, sikker dialog og arkivdomenet; produksjonshvelv, frist-/brukerbinding, resten av RLS-matrisen, MFA, ekstern test og resterende endepunktsmatrise gjenstår | Resten må ryddes og kontrollene produksjonsbevises før tilbud på sensitiv sektor er troverdig |
| **G-11** | **SLA/driftsavtale**: ingen SLA-dokument, oppetidsmåling, statusside eller incident-runbook | 48 mnd tjenestekontrakt | «99,9 %» finnes kun som markedsføringstekst | Skriv reell SLA + etabler måling |
| **G-12** | **Migrering** fra kommunens eksisterende fagsystem (sannsynligvis Visma Familia eller Modulus Barn — bekreftes i konkurransegrunnlaget) | Standard krav | Ansattimport finnes; saksdata-migrering finnes ikke | Avhenger av eksportformat fra dagens system |

## 6. Vurdering og anbefaling

### 6.1 Realistisk lesning av konkurransen

- **For oss:** Hovedklassifiseringen er *kundespesifisert programvareutvikling*, og Halden sier eksplisitt at de ønsker en innovativ leverandør som «vil utvikle systemet inn i framtiden». De ber ikke om ferdig hyllevare — det åpner døren for en utfordrer. Verdien (3,2 MNOK / 48 mnd ≈ 800 k/år) er dessuten for lav til å være attraktiv for de store (Visma/Netcompany) som primærfokus.
- **Mot oss:** Tilbudsfristen er **28.08.2026 — ca. 3,5 uker unna**. Kjernen i kravet (saksbehandling for myndighetsutøvelse i barnevern) er en ny produktvertikal, ikke en utvidelse. Krav om navngitt personell med kvalifikasjoner betyr at team-CV-er må vise barnevernsfaglig/arkivfaglig kompetanse. Sikkerhets- og lokaliseringsgapene (G-8, G-10) er reelle og vil bli ettergått.

### 6.2 Anbefalte steg (i rekkefølge)

1. **Hent konkurransegrunnlaget fra Mercell nå** ([permalink](https://permalink.mercell.com/283784436.aspx)) — kravspesifikasjon, tildelingskriterier med vekting og kontraktsvilkår avgjør go/no-go. Frist for spørsmål: 21.08 kl. 12:00 — bruk den aktivt (f.eks. om Documaster-integrasjon vs. egen kjerne, dagens fagsystem, migreringsomfang, drift/skyløsning).
2. **Go/no-go-beslutning** basert på kravspec: Hvis kravene er formulert som funksjonelle mål (ikke «skal ha i dag»-sjekklister), kan vi by med utviklingsplan forankret i eksisterende plattform. Hvis det kreves ferdig Noark 5-godkjent system med referanser fra barnevern ved levering, er dette et no-go som primærleverandør — vurder da partnerskap (f.eks. med Documaster på arkiv, eller som underleverandør på bruker-/rapporteringsflaten).
3. **Ved go — tilbudsstrategi:**
   - Bygg tilbudet rundt det vi beviselig har: moderne norsk plattform, §6-3-tiltaksplanmal, hash-kjedet sporbarhet, GDPR-maskineri med barnevernshjemler, godkjenningsflyter, universell utforming-erklæring, DPA/art. 30-protokoll.
   - Arkiv: **Documaster-integrasjon**, ikke egen kjerne. Folkeregister: **KS Fiks Folkeregister**. Innbygger: **ID-porten** (allerede P0 i roadmapen).
   - Forplikt en faseplan over 48-månederskontrakten; prioriter G-6 (EHF — obligatorisk), G-4 og G-2 tidlig.
   - Avklar ESPD/egenerklæring (avvisningsgrunnene i kunngjøringen håndteres via ESPD-skjema i Mercell), skatteattest, og personell-CV-er.
4. **Uansett utfall:** G-10 (sikkerhetsherding) og G-9 (WCAG-avvikene) bør lukkes — de er forutsetninger for alt salg til offentlig sektor og står allerede i vår egen compliance-roadmap.

### 6.3 Frister å legge i kalenderen

| Dato | Hva |
|---|---|
| Snarest | Last ned konkurransegrunnlag fra Mercell, registrer interesse |
| ~08.08.2026 | Intern go/no-go |
| 21.08.2026 kl. 12:00 | Siste frist for tilleggsspørsmål |
| **28.08.2026 kl. 12:00** | **Tilbudsfrist (elektronisk via Mercell)** |
| Tildeling + 10 dager | Karensfrist |
