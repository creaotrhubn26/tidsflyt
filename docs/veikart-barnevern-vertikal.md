# Veikart: Barnevern som ny vertikal i Tidum

**Status:** Strategisk veikart · Vedtatt retning 03.08.2026
**Utløst av:** [Anbudsanalyse Doffin 2026-112379 — Halden kommune](anbud/2026-112379-halden-barnevern-gap-analyse.md)
**Henger sammen med:** [Compliance-roadmap](compliance/roadmap.md) (P0/P1/P2-listen gjelder fortsatt — dette veikartet sekvenserer den mot et konkret mål)

---

## 1. Hvorfor barnevern er en naturlig vertikal for Tidum

Tidum er i dag plattformen for **utførersiden** av velferdstjenestene: tiltaksbedrifter, institusjoner og miljøarbeidere som leverer tiltak, fører timer, skriver rapporter og sender dem til oppdragsgiver. Barnevernstjenesten i kommunen er **bestillersiden** av nøyaktig den samme verdikjeden.

Det betyr at vertikalen ikke er et sidesprang — den lukker sirkelen vi allerede opererer i:

```
KOMMUNAL BARNEVERNSTJENESTE (bestiller)          ← ny vertikal
  │  vedtak om tiltak, tiltaksplan (§ 8-1)
  ▼
TILTAKSBEDRIFT / INSTITUSJON / FOSTERHJEM (utfører)  ← Tidum i dag
  │  miljøarbeider fører timer og aktiviteter
  ▼
RAPPORT → godkjenning (tiltaksleder) → oppdragsgiver  ← Tidum i dag
```

Konkrete forankringspunkter som allerede ligger i produktet:

- `vendor_institutions` har **barnevern som institusjonstype** med auto-videresending av godkjente rapporter.
- Systemmalene inkluderer **tiltaksplan etter barnevernsloven § 6-3** med barnets medvirkning, samtykker og hjemler.
- GDPR-motoren hjemler allerede **barnevernsloven § 10-1 (25 års oppbevaring)** som retensjonsregel.
- PII-autodeteksjon/-maskering på norsk ble bygget nettopp fordi brukerne våre skriver om barn og sårbare personer.
- Hash-kjedet revisjonslogg, rollemodell med tiltaksleder/case_manager, avviksmodul med volds-/trusselkategorier.

**Markedet:** DigiBarnevern-programmet endte i praksis i et duopol (Visma Familia, Netcompany Modulus Barn). Kommuner i Haldens størrelse lyser ut kontrakter på ~0,8 MNOK/år og etterspør eksplisitt «innovativ leverandør som vil utvikle systemet inn i framtiden» og «den beste brukerdialogen». Det er en åpning for en moderne utfordrer som allerede kan utførersiden — og som kan tilby noe duopolet ikke har: **bestiller og utfører i samme samhandlingsflate**.

**Posisjonering:** Tidum Barnevern selges ikke som «enda et sakarkiv», men som samhandlingsplattformen der kommunens saksbehandling, tiltaksleverandørens rapportering og familiens innsyn møtes — med arkiv og register-integrasjoner som infrastruktur under.

## 2. Målbilde (24 måneder)

Om 24 måneder skal Tidum kunne levere et komplett tilbud på en kunngjøring som Haldens, uten forbehold:

1. Saksbehandlingskjerne for kommunal barnevernstjeneste (melding → undersøkelse → vedtak → tiltak → oppfølging → avslutning) med lovpålagt fristovervåking.
2. Sikker digital samhandling: ID-porten-innlogget partsinnsyn og meldingsdialog for foreldre, barn (15+) og fullmektiger.
3. Arkivering via **Documaster-integrasjon** (Noark 5), gradert dokumenthåndtering inkl. kode 6/7.
4. **Folkeregisteret**-oppslag («registrer barnet én gang») med manuell fallback.
5. KS Fiks: mottak fra Nasjonal portal for bekymringsmelding, SvarUt for ekspedering.
6. Offentlig sektor-grunnmur: EHF-faktura, DPIA, EU/EØS-datalokalisering, SLA, WCAG 2.1 AA, ISO 27001-løp igangsatt.

## 3. Faseplan

Fasene er sekvensert slik at **hver fase har selvstendig salgsverdi** — vi er ikke avhengige av å nå fase 4 før investeringen begynner å betale seg.

### Fase 0 — Grunnmur og opprydding (uke 1–6) · *forutsetning for alt*

Lukker G-9, G-10, G-11 fra gap-analysen. Ingen ny funksjonalitet — men uten dette stryker vi i enhver sikkerhets- og UU-gjennomgang, uansett vertikal.

| Tiltak | Referanse |
|---|---|
| Fjern dev-mode auth-bypass; krev eksplisitt opt-in-flagg | `server/middleware/auth.ts:26-29`, `server/custom-auth.ts:262-270` |
| Krypter integrasjonshemmeligheter i DB (PowerOffice client keys, SMTP-passord) | `vendor_integrations`, `user_settings` |
| Innfør helmet (CSP/HSTS), CSRF-vern, fjern JWT-fallback-hemmelighet, `rejectUnauthorized: true` | `server/index.ts`, `server/db.ts:19` |
| Konsistent vendor-scoping i alle ruter (start: eksportrutene) + vurder RLS i Postgres | `server/routes/export-routes.ts:23-33` |
| 2FA (TOTP) for admin-roller | ny |
| WCAG: installer `@axe-core/playwright` og få a11y-testen inn i CI; lukk de fire kjente avvikene i tilgjengelighetserklæringen (Quill-tastatur, ARIA-tabellroller, fargeavhengige heatmaps, PDF-tagging); global focus-visible + `prefers-reduced-motion`; `document.documentElement.lang` ved språkbytte | `tests/a11y-public-pages.spec.ts`, `client/src/pages/tilgjengelighet.tsx` |
| SLA-dokument + oppetidsmåling/statusside + incident-runbook | nytt, jf. `docs/compliance/roadmap.md` |
| Samle retensjonsreglene til én autoritativ kilde (i dag tre ulike svar i `BACKUP_RESTORE.md` / `behandlingsprotokoll.md` / `SECURITY.md`) | docs |

### Fase 1 — Offentlig sektor-klar (uke 4–12, delvis parallelt med fase 0)

Tilsvarer P0-listen i compliance-roadmapen, nå med barnevern som styrende prioritet.

| Tiltak | Merknad |
|---|---|
| **ID-porten** (Digdir OIDC, nivå høyt) | 3–5 uker inkl. virksomhetssertifikat (Buypass/Commfides) iht. `docs/implementation-pipeline.md`. Sertifikatet gjenbrukes mot Freg og KS Fiks |
| **EHF/PEPPOL-faktura** via aksesspunkt | Obligatorisk i alle kommunale kontrakter — raskest via aksesspunkt-leverandør |
| **DPIA for barnevernsdata** (med advokat) | Må foreligge før vi kan behandle reelle barnevernssaker |
| **Datalokalisering EU/EØS**: flytt backend fra Render US-region; fjern OpenAI/GA4/ikke-EØS-tjenester fra saksbehandlingsflaten; oppdater underdatabehandlerliste i DPA | AI-assistanse i sensitiv flate krever EØS-hostet modell eller utgår |
| Entra ID SSO | For kommuneansatte (saksbehandlerne logger inn med kommunens Entra ID, innbyggere med ID-porten) |

**Milepæl M1:** Tidum kan selges til kommunale virksomheter som i dag — med ID-porten, EHF og DPIA på plass. Dette løfter også eksisterende produkt.

### Fase 2 — Samhandlingsvertikalen (mnd 3–8) · *nærmest dagens produkt, først til verdi*

Bygger det Halden kalte «digital samhandling med brukerne i sikre kanaler» — som utvidelse av flyten vi allerede har (rapport → godkjenning → videresending).

| Tiltak | Bygger på |
|---|---|
| **Innbyggerportal** (partsinnsyn): part logger inn med ID-porten, ser dokumenter delt med seg, mottar og sender meldinger i sikker kanal, signerer samtykker | Ny app-flate; gjenbruker rapport-/dokumentmodell, varsler, e-postmotor |
| **Documaster-integrasjon**: godkjente rapporter, vedtak og dialog arkiveres som journalposter (Noark 5) med gradering | Documaster har åpent API; `arkivert`-status finnes allerede i rapportflyten |
| **Freg/DSF-oppslag** (KS Fiks Folkeregister): person registreres én gang, hentes ved saksopprettelse, manuell fallback; håndtering av adressegradering kode 6/7 i hele flaten (skjerming i UI, logger, eksport) | `saker`-modellen; virksomhetssertifikat fra fase 1 |
| **KS Fiks SvarUt** for utgående ekspedering til parter uten digital dialog | e-postmotor/forward-flyt |
| Samtykke- og fullmaktsmodell (hvem er part i saken, hvem ser hva) | rollemodell + `user_cases` |

**Milepæl M2:** «Tidum Samhandling» kan selges til barnevernstjenester og institusjoner som *supplement* til Familia/Modulus — sikker dialog + tiltaksrapportering + arkivering, uten å kreve bytte av fagsystem. Dette er brohodet inn i kommunene og gir referansekunder i sektoren.

### Fase 3 — Saksbehandlingskjernen (mnd 6–18)

Den nye modulen som gjør Tidum til fullverdig fagsystem (G-1). Bygges som egen modul («Tidum Sak») oppå eksisterende saks-/rapportmodell.

Rekkefølge etter saksgangens egen kronologi:

1. **Meldingsmottak**: bekymringsmeldinger fra Nasjonal portal (KS Fiks) + manuell registrering; avklaring med 1-ukesfrist (bvl. § 2-1); henleggelse med begrunnelse.
2. **Undersøkelse** (bvl. § 2-2): undersøkelsesplan, aktivitetslogg, 3/6-mnd fristovervåking med eskalerende varsler (fristmotor bygges generisk — gjenbrukes overalt).
3. **Vedtak**: malbaserte vedtak med hjemmelsreferanser, godkjenningsflyt (saksbehandler → barnevernsleder), ekspedering via portal/SvarUt, arkivering.
4. **Planer**: tiltaksplan (§ 8-1) og omsorgsplan (§ 8-3) med evalueringsfrister — § 6-3-malen vår er startpunktet.
5. **Journal per barn**: løpende journalføring, dokumentinnsyn med skjermingsregler, «registrert én gang»-prinsippet gjennomført.
6. **Oppfølging**: fosterhjems- og institusjonsoppfølging med lovpålagt besøksfrekvens — her kobles utførersiden (dagens Tidum) direkte på: institusjonens rapporter lander i kommunens sak.
7. **Nemnd og domstol**: saksoversendelse, prosesskriv, akuttvedtak (§§ 4-1 flg.) med klokkefrister.
8. **Styringsrapportering**: halvårsrapport til statsforvalteren, KOSTRA/SSB-uttrekk, internkontroll-dashboard for barnevernsleder.

**Milepæl M3:** Pilotkommune kjører hele saksgangen i Tidum. (Strategi: rekrutter en liten kommune eller interkommunalt samarbeid som utviklingspartner — Halden-anbudets 48-månedersmodell viser at kommuner aksepterer utviklingsløp.)

### Fase 4 — Sertifisering og anbudsklar (mnd 12–24, parallelt)

| Tiltak | Merknad |
|---|---|
| ISO/IEC 27001-sertifisering | 6–12 mnd løp (DNV/Bureau Veritas/Nemko) — start ved M1 |
| Årlig pentest | Budsjettert 80–150 kNOK i compliance-roadmapen — første gjennomføring etter fase 0 |
| Normen (helse- og omsorg) egenerklæring | Kreves av mange kommuner |
| Migreringsverktøy fra Familia/Modulus Barn | Bygg ved første reelle kontrakt; gjenbruk import-rammeverket (`server/lib/import-parsers/`) |
| Anbudsbibliotek: ferdige svar på standard kravspec-punkter, ESPD-rutine, team-CV-er, referanser | Gjør neste Doffin-frist til utfylling, ikke krise |

## 4. Hva vi bevisst IKKE gjør

- **Egen Noark 5-kjerne.** Integrasjonssporet (Documaster, ev. andre arkivkjerner via Fiks Arkiv senere) er raskere, billigere og eksplisitt akseptert i markedet — Halden ba selv om det.
- **Kopiere Familia/Modulus funksjon for funksjon.** Differensiatoren er samhandlingen (bestiller ↔ utfører ↔ familie) og brukeropplevelsen — ikke featureparitet i år én.
- **AI-funksjoner i saksflaten** før EØS-hostet modell og DPIA-dekning er på plass.
- **Nye vertikaler utenfor velferdssektoren** mens dette pågår — fokus er kjeden barnevern/NAV/kommune/helse som allerede ligger i rapportmalene.

## 5. Styring og neste steg

| # | Neste steg | Eier | Når |
|---|---|---|---|
| 1 | Hent konkurransegrunnlaget for 2026-112379 fra Mercell — selv ved no-bid er kravspesifikasjonen gratis markedsinnsikt som skal inn i backloggen for fase 2–3 | Daniel | Uke 32 |
| 2 | Beslutt bid/no-bid på Halden (ev. som underleverandør/partner) | Daniel | Uke 33 |
| 3 | Start fase 0 (sikkerhetsherding + WCAG) — egen epic, uavhengig av anbudsbeslutning | dev | Uke 32 |
| 4 | Bestill virksomhetssertifikat + start ID-porten-onboarding (lengste ledetid i fase 1) | Daniel | Uke 33 |
| 5 | Kontakt Documaster om partner-/integrasjonsavtale | Daniel | Uke 34 |
| 6 | Overvåk Doffin for tilsvarende kunngjøringer (barnevern, sosialtjeneste, «fagsystem») — hver kunngjøring kalibrerer veikartet | løpende | — |

Suksesskriterium per fase er salgbarhet, ikke ferdigstillelse: M1 = kan selge til kommuner, M2 = referansekunde i barnevernssektoren, M3 = pilotkommune på full saksgang, M4 = leverer komplett anbudssvar uten forbehold.
