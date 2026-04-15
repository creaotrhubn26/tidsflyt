# Behandlingsprotokoll — Tidum

**Artikkel 30-protokoll for Creatorhub AS som databehandler (på vegne av kunder) og som behandlingsansvarlig (for egen markedsføring og drift).**

*Versjon 1.0 — 15. april 2026*

---

## Del A — Creatorhub AS som Databehandler

*(Behandling av personopplysninger på vegne av kundene som bruker Tidum)*

### A.1 Kontaktinformasjon

- **Databehandler**: Creatorhub AS, org.nr. 937 518 684
- **Kontaktperson personvern**: privacy@tidum.no
- **Sikkerhetsansvarlig**: security@tidum.no

### A.2 Navn og kontaktinformasjon for behandlingsansvarlige

Behandlingsansvarlig er hver kunde som bruker Tidum, registrert i systemet som "vendor" (tiltaksbedrift, institusjon, kommune osv.). Kontaktperson registreres ved onboarding.

### A.3 Kategorier av behandling

| Aktivitet | Beskrivelse | Behandlingsgrunnlag (kundens) |
|---|---|---|
| Brukeradministrasjon | Registrering, invitasjon, rolle-tildeling, innlogging | Avtale (art. 6 (1) b) |
| Tidsregistrering | Føring av arbeidstid, pauser, overtid, vaktinformasjon | Rettslig forpliktelse (art. 6 (1) c) — aml § 10-7 |
| Rapportering | Skriving og godkjenning av månedsrapporter om tiltak/klient | Avtale / Rettslig forpliktelse |
| Saksforvaltning | Knytte ansatte til saker, pre-tildeling via invitasjonslenke | Avtale |
| Oppdragsgiver-rapportering | Auto-forward av godkjent rapport til institusjon | Avtale |
| Fravær og ferie | Søknader, godkjenning, saldi | Avtale / Rettslig forpliktelse |
| Overtid | Beregning og oppfølging av overtidstimer | Rettslig forpliktelse |
| Varsling | E-post, SMS, push om rapport-status, godkjenning, påminnelse | Avtale |
| Audit-log | Sporing av endringer i rapporter og tidsregistrering | Rettslig forpliktelse |

### A.4 Kategorier av registrerte

- Ansatte og innleide hos kunden (arbeidstakere, miljøarbeidere, konsulenter)
- Ledere hos kunden (tiltaksledere, teamledere, vendor-admins)
- Klienter/oppdragsgivere referert i rapportinnhold (indirekte)
- Prototype-testers (begrenset pilotgruppe)

### A.5 Kategorier av personopplysninger

**Vanlige personopplysninger:**
- Identitetsinformasjon: navn, e-post, telefon
- Stillingsinformasjon: rolle, avdeling, arbeidsgiver
- Tidsdata: datoer, klokkeslett, steder, timer
- Tekniske data: IP, enhet, nettleser, sesjonslogg

**Særlige kategorier (art. 9) — kun når kunden aktivt bruker rapportfunksjonalitet:**
- Helse-relaterte observasjoner i barnevern-/helserapporter
- Opplysninger om sårbar gruppetilhørighet (barn, brukere av NAV-tiltak, beboere i institusjon)

*Tidum tilbyr GDPR-auto-replace-funksjonalitet som maskerer navn og sensitiv info før lagring, for å støtte dataminimering.*

### A.6 Mottakere

Behandlede data deles med:

- Kundens egne brukere (basert på rolle og tildeling)
- Oppdragsgiver-institusjoner via auto-forward (når kunden har konfigurert dette)
- Underdatabehandlere (se liste i databehandleravtalen)
- Myndigheter på lovlig forespørsel (f.eks. Arbeidstilsynet, Datatilsynet, politi med fullmakt)

### A.7 Overføring til tredjeland

| Land | Formål | Sikringsmekanisme |
|---|---|---|
| USA (Render) | Applikasjonsdrift | SCC 2021/914 + teknisk kryptering |
| USA (Google/Gmail) | SMTP for e-post | SCC 2021/914 |
| USA (Cloudflare) | Edge-nettverk, DDoS | SCC 2021/914 |
| UK (Neon — London) | Databaselagring | Adekvansbeslutning EU→UK (2021) |

### A.8 Lagringstid

| Datatype | Lagringstid | Hjemmel |
|---|---|---|
| Tidsregistrering | 5 år etter regnskapsårets utløp | Bokføringsloven § 13 |
| Rapporter | 5 år etter regnskapsårets utløp | Bokføringsloven / avtale |
| Fraværssøknader | 5 år | Bokføringsloven |
| Audit-log | 5 år | Bokføringsloven + aml. § 10-7 |
| Brukeropplysninger | Slettes/anonymiseres på forespørsel eller ved kundeopphør + 30 dager | Kundens instruksjon |
| Sesjonsdata | 30 dager | Driftsmessig nødvendighet |
| Backup | 7 dager rullerende | Sikkerhet |
| E-postvarsler (historikk) | 12 måneder | Driftsmessig nødvendighet |

### A.9 Tekniske og organisatoriske sikkerhetstiltak

Se databehandleravtale pkt. 7 for fullstendig liste. Hovedpunkter:

- TLS 1.2+ for all trafikk
- AES-256 for data-at-rest (via Neon)
- Bcrypt for passord
- RBAC + vendor-isolering
- Daglig backup, årlig penetrasjonstest
- 48-timers varslingsfrist ved sikkerhetsbrudd

---

## Del B — Creatorhub AS som Behandlingsansvarlig

*(For Tidums egen markedsføring, kundedialog og drift)*

### B.1 Kontaktinformasjon

- **Behandlingsansvarlig**: Creatorhub AS
- **Personvernkontakt**: privacy@tidum.no
- **Adresse**: [Creatorhub AS, gateadresse]

### B.2 Formål og behandlingsgrunnlag

| Formål | Behandlingsgrunnlag |
|---|---|
| Kontakt med potensielle kunder via kontaktskjema | Samtykke (art. 6 (1) a) |
| Tilgangsforespørsler til prøvetilgang | Avtale forberedelse (art. 6 (1) b) |
| Utsending av e-post om produktoppdateringer | Samtykke + berettiget interesse (art. 6 (1) f) |
| Støtte- og supporthenvendelser | Avtale (art. 6 (1) b) |
| Analyse av nettsidebruk (anonymisert) | Berettiget interesse |
| Fakturering | Rettslig forpliktelse (bokføring) |

### B.3 Kategorier av registrerte

- Potensielle kunder og brukere som kontakter Tidum
- Registrerte brukere av Tidum-produkter (sekundært)
- Ansatte hos Creatorhub AS
- Leverandører og samarbeidspartnere

### B.4 Personopplysninger

- Navn, e-post, telefon, bedrift, stilling
- Tekniske data fra besøk på tidum.no (IP, bruker-agent, referrer)
- Dialoghistorikk i support-system

### B.5 Mottakere

- Creatorhub AS-ansatte med berettiget behov
- CRM-system (hvis brukt): [navn på CRM — oppdateres]
- E-postleverandør: Google Workspace
- Analysesystem: (følges opp ved Analytics-aktivering)

### B.6 Overføring til tredjeland

Samme som Del A.

### B.7 Lagringstid

- Tilgangsforespørsler og kontakt: 24 måneder
- E-postdialog: 36 måneder
- Fakturadokumentasjon: 5 år (bokføringsloven)
- Cookie-data: 12 måneder (eller til samtykke trekkes tilbake)

---

## Endringslogg

| Versjon | Dato | Endring |
|---|---|---|
| 1.0 | 15.04.2026 | Første versjon publisert |

---

*Denne protokollen gjennomgås minst én gang i året og oppdateres ved vesentlige endringer i behandlingen. Ansvarlig: privacy@tidum.no.*
