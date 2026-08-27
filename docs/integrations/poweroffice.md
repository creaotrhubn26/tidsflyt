# PowerOffice Go – sikker aktivering og nøkkelrotasjon

## Leveransegrense

Tidum er systemleverandør. Leverandørens globale systemadministrator styrer om
PowerOffice tilbys for en virksomhet og gjennomfører plattformens
krypteringsnøkkelrotasjon. Kundens egen `hovedadmin` eller kanoniske
`vendor_admin` oppretter ClientKey i sin PowerOffice-klient, limer den inn i
Tidum og administrerer ansattmapping. Global systemadministrator får ikke lese
eller bruke kundens ClientKey.

Dette dokumentet beskriver den tekniske aktiveringen. Det er ikke bevis på en
godkjent ende-til-ende-test mot Haldens eller PowerOffice sin sandkasse.

## Lagringsmodell

- ClientKey mottas bare over den autentiserte, CSRF-beskyttede adminruten.
- Nøkkelen verifiseres mot PowerOffice før tilkoblingen lagres.
- Databasen lagrer bare en versjonert `enc:v2`-konvolutt produsert med
  AES-256-GCM. IV er tilfeldig per skriving; autentiseringstaggen oppdager
  endring eller feil nøkkel.
- Den komplette ClientKey returneres aldri fra API-et og logges ikke.
- Access token ligger bare i prosessminne med omtrent 19 minutters TTL;
  tokenbufferen indekseres med en SHA-256-digest, ikke ClientKey.
- `tidum_vendor_integrations_poweroffice_client_key_sealed` avviser nye eller
  oppdaterte PowerOffice-rader som ikke har gyldig konvoluttformat.
- Rotasjon lagrer bare integration-/vendorreferanse, gammel/ny nøkkel-ID,
  kilde og tidspunkt i `tidum_integration_secret_rotation_audit`. Auditsporet
  inneholder ingen nøkkelverdi.

## Hemmeligheter som skal komme fra nøkkelhvelv

Produksjonsplattformen injiserer disse som runtime-miljøvariabler. De skal ikke
ligge i repo, Docker-image, vanlig `.env`-fil eller supportsak.

```dotenv
POWEROFFICE_APPLICATION_KEY=<leverandørens applikasjonsnøkkel>
POWEROFFICE_SUBSCRIPTION_KEY=<aktiv abonnementsnøkkel>
POWEROFFICE_SUBSCRIPTION_KEY_SECONDARY=<sekundær nøkkel under rotasjon>
TIDUM_SECRET_KEYRING={"2026-08":"<gammel minst 32 bytes>","2026-11":"<ny minst 32 bytes>"}
TIDUM_SECRET_ACTIVE_KEY_ID=2026-11
```

`TIDUM_SECRET_KEY` beholdes bare dersom eldre uversjonerte `enc:v1`-verdier må
åpnes under overgang. Hvelvet må ha tilgangslogging, minste privilegium,
versjonshistorikk og en dokumentert break-glass-prosedyre. Ingen faktisk
nøkkelverdi skal kopieres inn i rotasjonsbeviset.

## Aktivering

1. Plattformansvarlig oppretter leverandørnøklene og nøkkelringen i godkjent
   norsk/avtalt hemmelighetshvelv.
2. Deploy. PowerOffice-kortet viser utilgjengelig dersom enten leverandørnøkler
   eller sikker ClientKey-lagring mangler.
3. Kundens administrator oppretter ClientKey i PowerOffice og limer den inn i
   Tidum. Nettleseren viser bare passordfeltet; API-et verifiserer nøkkelen og
   lagrer konvolutten.
4. Kontroller at status viser tilkoblet uten at responsen inneholder
   `clientKey`.
5. Opprett samme-tenant ansattmapping og kjør tilkoblingstest.
6. Kjør en kontrollert timeliste i sandkasse og avstem antall, timer,
   ansattkode, dato, prosjekt og returstatus før produksjonsåpning.

## Rotasjon uten nedetid

1. Legg gammel og ny krypteringsnøkkel i `TIDUM_SECRET_KEYRING`; deploy med
   gammel aktiv.
2. Sett `TIDUM_SECRET_ACTIVE_KEY_ID` til ny ID og deploy.
3. Den globale timejobben konverterer opptil 200 rader per kjøring. Første
   bruk av en eldre rad konverterer den også atomisk før utgående API-kall.
4. Systemadministrator kan starte en avgrenset batch med
   `POST /api/admin/integrations/poweroffice/rotate-secrets` og body
   `{ "confirm": "ROTATE", "limit": 100 }`.
5. Gjenta til responsen viser `remaining: 0`. Kontroller auditsporet og kjør
   idempotent migrasjon 081 på nytt; formatconstrainten fullvalideres
   automatisk når ingen legacy-rad gjenstår.
6. Test lesing og PowerOffice token exchange for representative tenants, ta
   kontrollert backup og vent ut godkjent rollback-vindu.
7. Fjern gammel nøkkel fra hvelvet først etter dokumentert nullrest.

Hvis gammel nøkkel fjernes for tidlig, feiler PowerOffice lukket med 503 eller
en intern bakgrunnsfeil; ClientKey sendes ikke som klartekstfallback. Legg den
gamle nøkkelversjonen tilbake og fullfør rotasjonen. Ikke omskriv konvolutter
manuelt.

## Akseptanse som gjenstår

- ekte PowerOffice-sandkasse med leverandør-/kundekonto;
- idempotens og duplikathåndtering for `HourRegistrations`;
- avstemming og operativ feil-/retry-prosedyre;
- produksjonsbevis for norsk/avtalt hvelv, tilgangsreview, alarm og rotasjon;
- ekstern sikkerhetstest og Halden-godkjent testprotokoll.
