# Databehandleravtale (DPA) — Tidum

**Avtale mellom Behandlingsansvarlig (Kunden) og Databehandler (Creatorhub AS)**

Denne databehandleravtalen («Avtalen») inngås mellom Kunden som behandlingsansvarlig og Creatorhub AS, org.nr. 937 518 684, heretter «Databehandler», som leverer tjenesten Tidum. Avtalen regulerer Databehandlerens behandling av personopplysninger på vegne av Kunden, i tråd med Europaparlamentets og rådets forordning (EU) 2016/679 (GDPR) og personopplysningsloven.

---

## 1. Definisjoner

I denne Avtalen gjelder følgende definisjoner:

- **GDPR**: Europaparlaments- og rådsforordning (EU) 2016/679 av 27. april 2016 (personvernforordningen)
- **Personopplysninger**: Enhver opplysning om en identifisert eller identifiserbar fysisk person
- **Behandling**: Enhver operasjon som utføres med personopplysninger
- **Behandlingsansvarlig**: Kunden som bruker Tidum til å behandle personopplysninger
- **Databehandler**: Creatorhub AS, som behandler personopplysninger på vegne av Behandlingsansvarlig
- **Underdatabehandler**: Tredjepartsleverandør som behandler personopplysninger på vegne av Databehandler
- **Tjenesten**: Tidum arbeidstids- og rapporteringsplattform

## 2. Formål og omfang

Databehandler skal behandle personopplysninger utelukkende for å levere Tjenesten til Behandlingsansvarlig, i henhold til:

1. Behandlingsansvarliges dokumenterte instruksjoner
2. Funksjonalitet i Tidum som Behandlingsansvarlig tar i bruk
3. Gjeldende norsk og europeisk personvernregulering

## 3. Kategorier av registrerte

Følgende kategorier av registrerte omfattes av behandlingen:

- Ansatte og innleide hos Behandlingsansvarlig (arbeidstakere)
- Ledere og administratorer hos Behandlingsansvarlig
- Personer som kontaktes i arbeidshverdagen (klienter, oppdragsgivere, eksterne kontakter registrert i rapporter)
- Prøvebrukere (prototype testers) om aktuelt

## 4. Kategorier av personopplysninger

| Kategori | Type opplysninger | Særlig kategori? |
|---|---|---|
| Identitetsinformasjon | Navn, e-post, telefon, stilling, rolle | Nei |
| Organisasjonstilknytning | Arbeidsgiver, avdeling, team, ansettelsesforhold | Nei |
| Tidsregistrering | Dato, start, slutt, pauser, vaktinformasjon | Nei |
| Geografiske opplysninger | Sted for vakter, reiserute (når relevant) | Nei |
| Rapportinnhold | Observasjoner, aktivitetslogg, mål, status | **Kan være sensitive**\* |
| Tekniske opplysninger | IP, enhet, nettleser, innloggingslogg | Nei |
| Godkjenninger | Hvem godkjente/returnerte rapport, når, kommentarer | Nei |

\* Rapportinnhold for barnevern, helse og tilsvarende kan inneholde særlige kategorier av personopplysninger etter GDPR art. 9. Behandlingsansvarlig har ansvar for å vurdere eget behandlingsgrunnlag for slike kategorier.

## 5. Underdatabehandlere

Databehandler bruker følgende underdatabehandlere. Behandlingsansvarlig samtykker til bruk av disse, og skal varsles minst 30 dager før endring.

| Underdatabehandler | Formål | Lokasjon |
|---|---|---|
| **Neon, Inc.** | Databaselagring (PostgreSQL) | EU/EØS (eu-west-2, London) |
| **Render Services, Inc.** | Applikasjonsdrift og logging | USA med SCC + kryptering |
| **Gmail / Google Workspace (SMTP)** | E-postutsendelse fra Tjenesten | EU/EØS + USA med SCC |
| **Cloudflare, Inc.** | DDoS-beskyttelse, Turnstile | Globalt nettverk |
| **SMS-leverandør** *(ved bruk)* | SMS-varsling | EU/EØS |

Oppdatert liste ligger alltid på [tidum.no/personvern#underdatabehandlere](https://tidum.no/personvern).

## 6. Varighet

Avtalen gjelder så lenge Databehandler behandler personopplysninger for Behandlingsansvarlig gjennom Tjenesten. Ved opphør gjelder punkt 12.

## 7. Sikkerhet (GDPR art. 32)

Databehandler har iverksatt følgende tekniske og organisatoriske tiltak:

### 7.1 Tekniske tiltak
- **Kryptering i transitt**: TLS 1.2+ for alle forbindelser
- **Kryptering i ro**: AES-256 for database-storage (via Neon)
- **Autentisering**: Magic-link-innlogging + passord (bcrypt). SSO via OIDC støttes
- **Tilgangskontroll**: Rollebasert (RBAC) med minimumstilgang per prinsipp
- **Vendor-isolering**: Logisk adskilt data mellom kunder
- **Audit-log**: Alle endringer på rapporter og brukere logges med aktør og tidspunkt
- **Backup**: Daglig automatisk backup med 7 dagers retensjon
- **Penetrasjonstest**: Årlig gjennomføring (fra og med 2026)
- **Sårbarhetsoppdatering**: Automatisert skanning; kritiske patches innen 7 dager

### 7.2 Organisatoriske tiltak
- Skriftlig taushetsplikt for alle ansatte som har tilgang til personopplysninger
- Tilgang til produksjonsdata er begrenset til driftsansvarlige etter "need-to-know"
- Skriftlige prosedyrer for hendelseshåndtering og avviksvarsling
- Jevnlig opplæring i informasjonssikkerhet og personvern
- Ekstern e-post og prosedyre ved mottak av sikkerhetsrapporter

## 8. Bistand til Behandlingsansvarlig

Databehandler skal bistå Behandlingsansvarlig med å oppfylle pliktene etter GDPR art. 32–36, inkludert:

- Svare på henvendelser fra registrerte om innsyn, retting, sletting (innen 30 dager)
- Levere nødvendig dokumentasjon ved tilsyn fra Datatilsynet
- Varsle Behandlingsansvarlig uten ugrunnet opphold, senest **innen 48 timer** etter å ha oppdaget brudd på personopplysningssikkerheten

## 9. Brudd på personopplysningssikkerheten

Ved brudd skal Databehandler:

1. Varsle Behandlingsansvarliges kontaktpunkt umiddelbart
2. Gi informasjon om arten av bruddet, omtrent antall berørte, sannsynlige konsekvenser og iverksatte tiltak
3. Bistå Behandlingsansvarlig med varsling til Datatilsynet (art. 33) hvis aktuelt
4. Levere skriftlig hendelsesrapport senest 14 dager etter bruddet

Kontakt for varsling: **security@tidum.no**

## 10. Revisjon

Behandlingsansvarlig har rett til å gjennomføre revisjon (egen eller via uavhengig tredjepart) av Databehandlers overholdelse av denne Avtalen. Revisjon:

- Skal varsles minst 30 dager i forveien
- Kan gjennomføres maksimalt én gang per kalenderår (unntatt ved konkret mistanke om brudd)
- Databehandler kan alternativt levere gyldig ISO 27001-sertifikat eller likeverdig rapport som dokumentasjon

## 11. Overføring til tredjeland

Personopplysninger behandles primært innenfor EU/EØS. Ved overføring til tredjeland (USA m.fl.) gjelder:

- Europakommisjonens standardkontraktsbestemmelser (SCC 2021/914)
- Tekniske sikringstiltak (kryptering, pseudonymisering)
- Supplerende tiltak etter Schrems II-vurdering

## 12. Opphør og sletting

Ved opphør av hovedavtalen, eller etter Behandlingsansvarliges skriftlige instruksjon:

- **Sletting** av alle personopplysninger innen **30 dager** etter opphør, eller
- **Tilbakelevering** av alle personopplysninger i strukturert, vanlig brukt og maskinlesbart format (JSON) før sletting

Dokumentasjon som er lovpålagt å beholde (typisk bokføringsdokumentasjon etter bokføringsloven § 13) beholdes i minst 5 år etter utgangen av regnskapsåret, i anonymisert form der mulig.

## 13. Taushetsplikt

Databehandler og alle personer som har tilgang til personopplysninger gjennom Tjenesten, har taushetsplikt. Taushetsplikten gjelder også etter opphør av arbeidsforhold eller kontrakt.

## 14. Ansvar

Databehandler er ansvarlig overfor Behandlingsansvarlig for skade som skyldes Databehandlers eller underdatabehandlers brudd på denne Avtalen. Ansvar er begrenset til direkte tap og inntil beløp tilsvarende tolv (12) månedligers abonnementsavgift fra Behandlingsansvarlig for Tjenesten, med mindre skaden er forårsaket av grov uaktsomhet eller forsett.

## 15. Tvister

Avtalen reguleres av norsk rett. Tvister løses ved de alminnelige domstolene med Oslo tingrett som verneting.

## 16. Endringer

Endringer i Avtalen krever skriftlig samtykke fra begge parter. Databehandler kan likevel foreta endringer som følger av endringer i regelverket med rimelig varsel.

---

## Signatur

**Behandlingsansvarlig (Kunden)**
Navn: _____________________
Stilling: _____________________
Signatur: _____________________
Dato: _____________________

**Databehandler (Creatorhub AS)**
Navn: _____________________
Stilling: _____________________
Signatur: _____________________
Dato: _____________________

---

*Versjon 1.0 — gyldig fra 15. april 2026. Denne malen publiseres i repo og oppdateres ved vesentlige endringer; kunder får e-postvarsel med minst 30 dagers varsel.*
