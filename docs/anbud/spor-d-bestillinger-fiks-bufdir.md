# Spor D — bestillinger for Barnevernsregister-integrasjonen (krav 10/28)

Status 28.08.2026. Koden er ferdig og merget (PR #26 innsendingsmotor,
PR #27 FIKS Protokoll-transport). Dette dokumentet er bestillingslisten
for de eksterne avhengighetene som skrur den på, med ansvarlig part,
portal, nødvendige opplysninger og hvordan svaret mappes til
miljøkonfigurasjonen vår.

Rollemodell: **Fiks IO-kontoen eies av Halden kommune** (kommunen er
avsender juridisk); **integrasjonen og Maskinporten-klienten eies av
Tidum** som systemleverandør/databehandler. Halden autoriserer vår
integrasjon på sin konto og kan trekke autorisasjonen.

---

## Bestilling 1 — Maskinporten-klient (Tidum → Digdir)

| | |
|---|---|
| Ansvarlig | Tidum |
| Hvor | Digdirs selvbetjening: sjolvbetjening.samarbeid.digdir.no (test: sjolvbetjening.test.samarbeid.digdir.no) |
| Forutsetning | **Virksomhetssertifikat** (Buypass eller Commfides) på Tidums org.nr. — bestilles først, leveringstid noen dager |
| Scope | `ks:fiks` (KS er scope-eier; tilgang innvilges av KS, se bestilling 2) |

Opplysninger som trengs: Tidums org.nr., kontaktperson, virksomhets-
sertifikat eller egengenerert nøkkelpar registrert på klienten.

Svar → miljøkonfig:
- klient-id → `FIKS_MASKINPORTEN_KLIENT_ID`
- privatnøkkel forsegles med secret-box → `FIKS_MASKINPORTEN_PRIVATE_KEY_SEALED`

## Bestilling 2 — Fiks-integrasjon og konto (Tidum + Halden → KS)

| | |
|---|---|
| Ansvarlig | Tidum (integrasjon) + Halden IT (konto og autorisasjon) |
| Hvor | Fiks-konfigurasjon: forvaltning.fiks.ks.no (test: forvaltning.fiks.test.ks.no) |
| Kontakt | KS Fiks brukerstøtte / bestilling@ks.no ved behov for organisasjonsoppsett |

Trinn:
1. **Tidum** registrerer integrasjon i Fiks-konfigurasjon (knyttes til
   Maskinporten-klienten fra bestilling 1). Gir integrasjons-id + passord.
2. **Halden** oppretter/utpeker Fiks IO-konto for barnevernstjenesten
   under sin Fiks-organisasjon (kontoens nøkkelpar genereres i portalen;
   offentlig nøkkel lastes opp).
3. **Halden** autoriserer Tidums integrasjon på kontoen.
4. Gjenta i testmiljøet først — sandkassetesten (bestilling 3) kjøres der.

Svar → miljøkonfig:
- integrasjons-id → `FIKS_IO_INTEGRASJON_ID`
- integrasjonspassord → `FIKS_IO_INTEGRASJON_PASSORD`
- Haldens konto-id → `FIKS_IO_KONTO_ID`
- (test: `FIKS_IO_HOST=https://api.fiks.test.ks.no` — default utenfor produksjon)

## Bestilling 3 — Barnevernsregisteret (Tidum + Halden → Bufdir)

| | |
|---|---|
| Ansvarlig | Halden barnevernstjeneste (melder overgang) + Tidum (teknisk) |
| Hvor | bufdir.no/fagstotte/barnevern-oppvekst/barnevernsregisteret (kontaktskjema/-adresse på siden); XSD på data.bufdir.no |

Be om:
1. **Barnevernsregister-XSD** (gjeldende versjon) — payload-mappingen vår
   justeres mot den i én isolert funksjon (`bvr-fiks-transport.ts`).
2. **Avtalt meldingstype** for FIKS-protokollen → `BVR_FIKS_MELDINGSTYPE`.
3. **Barnevernsregisterets Fiks-kontoid** (mottaker) → `BVR_FIKS_MOTTAKER_KONTO_ID`.
4. Plan for **datakvalitetstesten**: validering, statistiske kontroller og
   godkjenningskriterier før produksjonsaktivering.
5. Bufdirs krav ved **overgang fra gammelt fagsystem** (Visma Familia):
   hvilke historiske data som må migreres, format, og kravet om at
   migreringsrapport deles med barnevernstjenesten.

## Aktiveringssjekkliste (når svarene foreligger)

1. Sett de seks miljøvariablene i testmiljøet; verifiser at
   `getFiksProtokollTransport()` aktiveres (innsendinger går fra `koet`).
2. Juster payload-mapping mot XSD; bekreft konvoluttformatet
   (`krypterFiksPayload`) mot KS' spesifikasjon i sandkassen.
3. Kjør manuell innsending (`POST /api/barnevern/innrapportering/kjor`)
   mot testmottaket; verifiser kvittering i lederloggen.
4. Gjennomfør Bufdirs datakvalitetstest til godkjenning.
5. Sett variablene i produksjon (uten `FIKS_IO_HOST` — prod er default).
   Daglig 06:00-cron tar over; KOSTRA-/halvårsfristene bortfaller for
   Halden.

Merk for flere kommuner senere: avsenderkonto-id flyttes da fra miljø til
per-kommune-konfig (kommunetabellen); integrasjon og Maskinporten-klient
forblir felles leverandøroppsett.

## Kilder

- https://www.bufdir.no/fagstotte/barnevern-oppvekst/barnevernsregisteret/
- https://developers.fiks.ks.no/tjenester/fiksprotokoll/fiksio/
- https://developers.fiks.ks.no/tjenester/fiksprotokoll/veiledning_3_opprette_system/
- https://developers.fiks.ks.no/tjenester/fiksprotokoll/veiledning_4_opprette_konto/
- https://ksdigital.no/tjenestene/fiks-protokoll/
