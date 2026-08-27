# Opsjon O1 – Elements arkivintegrasjon

**Anskaffelse:** 2026/3663 – Administrativt system for barnevernstjenesten

**Leverandør:** Creatorhub AS / Tidum

**Status:** Tilbudsutkast. Pris, leveringstid og utøvelsesfrist må fylles inn i
Bilag 6 før tilbudet signeres.

**Teknisk status:** Provider for Noark 5 tjenestegrensesnitt 1.1 er implementert
fail-closed og kan først aktiveres etter avtale og kundesandkassetest. En annen
Elements-kontrakt krever tilpasning av transportadapteren.

> **Tilbudsrisiko:** Krav 26 er et evalueringskrav og nevner både Elements og
> Documaster. En priset opsjon gir en konkret leveranseforpliktelse, men Halden
> kan fortsatt vurdere grunnleveransen som delvis dersom Elements ikke inngår
> uten opsjonsutøvelse. Tilbudsansvarlig må derfor ta stilling til hvordan O1
> inngår i evaluert pris og besvarelsen av krav 26.

## 1. Tilbudsformulering til Bilag 2, krav 26

> **JA – tilbys som priset opsjon O1.** Tidum leverer den implementerte
> Documaster-adapteren i grunnleveransen, med kundens testmiljø som
> akseptansepunkt. Dersom Halden skal bruke Elements gjennom en annen
> API-kontrakt, kan Kunden utløse opsjon O1 for en egen Elements-adapter mot
> Tidums eksisterende, leverandørnøytrale arkivgrensesnitt. Leveransen omfatter
> teknisk avklaring, sikker tilkobling, mapping, implementering,
> kontrakttesting, ende-til-ende-test og dokumentasjon. Produksjonssetting
> forutsetter at Halden og Elements-leverandøren stiller testmiljø,
> API-dokumentasjon, legitimasjon, kodelister og arkivfaglig godkjenner til
> rådighet innen avtalte frister.

Formuleringen er en leveranseforpliktelse bare dersom opsjonen får komplett
pris og tidsplan i Bilag 6 og senere utøves skriftlig av Halden.

## 2. Formål og forholdet til grunnleveransen

Grunnleveransen bruker én aktiv arkivprovider per kommune og inkluderer
Documaster-adapteren. Opsjon O1 gjør det mulig å bruke Elements som
**alternativt mål** dersom Elements har en annen kontrakt enn den implementerte
Documaster Noark 5-webtjenesten.

Opsjonen omfatter ikke samtidig levering til både Elements og Documaster.
Krav om dobbelarkivering, to uavhengige kvitteringer eller avstemming mellom to
arkivmål må beskrives og prises som en egen endring/opsjon fordi dagens
tenantkonfigurasjon har ett aktivt arkivmål.

## 3. Inkludert omfang

- avklaring av Elements-produkt, versjon, API-generasjon og målarkitektur;
- egen `ArchiveProvider`-adapter som gjenbruker Tidums Noark-domene,
  transaksjonelle outbox, retry, idempotens og arkivkvittering;
- autentisering og transport etter Elements-kontrakten, inkludert separat
  IDP, mTLS, virksomhetssertifikat eller annen avtalt mekanisme;
- konfigurasjon med serveravledet kommune-tenant og forseglet legitimasjon;
- mapping av arkivdel, administrativ enhet, klasse, skjerming,
  journalposttype, dokumenttype og variantformat;
- arkivering av godkjente rapporter, sakjournalnotater og avsluttede sikre
  dialoger, slik de er modellert i grunnleveransen;
- ekstern-ID/idempotens, kontrollert retry og dokumentert feilhåndtering;
- lokale transportkontrakttester og test mot kundens Elements-testmiljø;
- én ende-til-ende-akseptanse med syntetiske data, teknisk bevis og
  arkivfaglig kontroll;
- oppdatert norsk konfigurasjons-, drifts- og feilsøkingsdokumentasjon.

## 4. Ikke inkludert

- samtidig dobbeltskriving til Elements og Documaster;
- erstatning av Elements som kommunens komplette sak-/arkivsystem;
- generell saksbehandling inne i Elements utover avtalte arkivoperasjoner;
- migrering av historiske arkiver eller eksisterende Elements-data;
- nye Tidum-dokumentdomener som ikke finnes i grunnleveransen;
- lisenser, transaksjonsavgifter eller konsulentkostnader fra Elements-
  leverandøren;
- kundespesifikk integrasjonsplattform, VPN, proxy eller nettverksutstyr;
- endringer som skyldes en udokumentert eller vesentlig annen kontrakt etter
  at løsningsbeskrivelsen er godkjent.

Slike behov håndteres gjennom ny opsjon eller endringsprosedyren i SSA-L.

## 5. Kundens og tredjepartens forutsetninger

T0 – starttidspunktet for opsjonen – inntrer først når følgende foreligger:

1. skriftlig utøvelse av opsjonen;
2. bekreftet Elements-produkt, versjon og API-/integrasjonsmønster;
3. testtenant og produksjonsbestillingsløp;
4. API-/IDP-adresser, dokumentasjon og nødvendige scopes/rettigheter;
5. testlegitimasjon levert i godkjent hemmelighetskanal;
6. kodelister, arkivdel, administrativ enhet og klassifikasjon;
7. avklarte krav til VPN, brannmur, IP-allowlisting, mTLS og sertifikater;
8. godkjente syntetiske testdata og navngitt arkivfaglig godkjenner;
9. tilgjengelig teknisk kontakt hos Elements-leverandøren.

Forsinkelse i disse leveransene flytter milepælene tilsvarende og regnes ikke
som leverandørforsinkelse.

## 6. Akseptansekriterier

Opsjon O1 er levert når:

- autentisering og minste nødvendige rettigheter er verifisert;
- ett syntetisk saks-/mappeobjekt og én journalpost med hoveddokument og
  vedlegg er registrert med avtalte metadata;
- avsluttet sikker dialog arkiveres med manifest, transkript, rene vedlegg og
  verifiserbare kontrollsummer;
- offentlig tittel, skjerming, klasse, administrativ enhet og dokumentstruktur
  er godkjent av Halden;
- replay etter tvetydig nettverksutfall ikke lager duplikat;
- midlertidig feil gir kontrollert retry og sporbar status;
- bruker fra annen kommune ikke kan lese eller påvirke Haldens config,
  arkivlogg eller retry;
- hemmeligheter ikke returneres til klient eller logg;
- Halden har mottatt og godkjent testprotokoll og driftsdokumentasjon.

Test mot mock eller lokal kontrakt alene er ikke kundens akseptansebevis.

## 7. Leveranseplan til Bilag 3

| Milepæl | Leveranse | Frist |
|---|---|---|
| O1.1 | Kontrakts-/løsningsavklaring og godkjent mapping | T0 + `[FYLL INN]` |
| O1.2 | Adapter og automatiserte kontrakttester | T0 + `[FYLL INN]` |
| O1.3 | Integrasjonstest i Elements-testtenant | T0 + `[FYLL INN]` |
| O1.4 | Ende-til-ende- og arkivfaglig akseptanse | T0 + `[FYLL INN]` |
| O1.5 | Produksjonssetting og stabiliseringsperiode | T0 + `[FYLL INN]` |

Tidene må fastsettes etter teknisk avklaring, men før tilbudet bindes dersom
opsjonen skal være ferdig priset og evaluerbar.

## 8. Prisstruktur til Bilag 6

| Priselement | Pris eks. mva. |
|---|---:|
| Fastpris – avklaring, mapping, adapter, test og dokumentasjon | `[FYLL INN]` |
| Fastpris – produksjonssetting og avtalt stabilisering | `[FYLL INN]` |
| Årlig forvaltning/vedlikehold av Elements-adapter | `[FYLL INN]` |
| Eventuelle tredjepartslisenser/-avgifter | `[SPESIFISER ELLER «IKKE INKLUDERT»]` |
| **Samlet opsjonspris første avtaleår** | **`[FYLL INN]`** |

Alle kostnader må fremgå av Bilag 6. Timepris alene er ikke tilstrekkelig for
en tydelig opsjon dersom Kunden forventer fastpris.

## 9. Utøvelse og varighet

- Opsjonen kan bare utøves skriftlig av Kundens bemyndigede representant.
- Utøvelsesfrist: `[FYLL INN DATO/PERIODE]`.
- Leveransen starter ved T0 som definert i punkt 5.
- Produksjonslegitimasjon, lisenser og tredjepartsavtaler skal være på plass før
  produksjonssetting.
- Dersom kontraktsavklaringen viser at Elements tilbyr samme kompatible
  kontrakt som grunnleveransen, skal partene først vurdere om ordinær
  konfigurasjon er tilstrekkelig og unngå unødvendig spesialutvikling.

## 10. Kommersiell beslutningsport

Opsjonen er ikke klar for innsending før tilbudsansvarlig har:

- [ ] fastsatt fastpris og årlig forvaltningspris;
- [ ] fastsatt T0-baserte frister og utøvelsesfrist;
- [ ] avklart om tredjepartskostnader inngår;
- [ ] lagt samme tekst og pris i Bilag 2, 3 og 6;
- [ ] kontrollert at «JA» på krav 26 samsvarer med finansiert kapasitet;
- [ ] kontrollert at Halden forstår at O1 er alternativt arkivmål, ikke
      samtidig dobbelarkivering.
