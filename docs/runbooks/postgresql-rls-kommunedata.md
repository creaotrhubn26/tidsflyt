# PostgreSQL RLS for kommunedata

## Formål og avgrensning

Tidum er systemleverandør og skal håndheve kommuneskillet både i API-et og i
databasen. Migrasjon 083 innfører første RLS-fase for den mest sensitive
mottakskjernen:

- `tidum_barnevern_meldinger`;
- `tidum_barnevern_melding_vedlegg`;
- `tidum_fiks_raw_intake_log`.

Alle tre tabellene har `ENABLE ROW LEVEL SECURITY` og `FORCE ROW LEVEL
SECURITY`. Vedlegg har fått egen `kommune_id`, indeks og sammensatt
fremmednøkkel mot `(melding_id, kommune_id)`. En vedleggsrad kan dermed ikke
peke på en melding i en annen kommune, heller ikke fra intern systemkode.

Dette er fase 1, ikke en påstand om full systemomfattende RLS. Sikker dialog,
arkiv, frister, brukere, vendor-domenet og øvrige saksobjekter skal føres inn i
en kontrollert tabell-/endepunktsmatrise før RLS kan beskrives som komplett.

## Transaksjonslokal kontekst

Beskyttede operasjoner går gjennom
`server/lib/database-rls-context.ts`. Hjelperen:

1. starter en eksplisitt transaksjon;
2. bytter lokalt til en rolle uten `BYPASSRLS`;
3. setter `tidum.rls_mode` og `tidum.kommune_id` med `set_config(..., true)`;
4. utfører operasjonen;
5. committer eller ruller tilbake og frigir tilkoblingen.

`true` gjør verdiene transaksjonslokale. En tilkobling som går tilbake i
poolen kan derfor ikke arve forrige kommunes kontekst. Manglende, ugyldig eller
utløpt kontekst gir ingen rader og avviser nye rader.

Manuelle forespørsler bruker alltid kommunekontekst avledet fra fersk
`users.kommune_id`. Systemkontekst er avgrenset til navngitte interne jobber,
som hemmelighetsinventory/-rotasjon, og skal aldri bygges fra request-data.

## Databaseeier og produksjonsrolle

Den delte Neon-utviklingsdatabasen bruker en administrert eierkonto som kan
omgå RLS. Neon tillater ikke denne kontoen å opprette eller endre roller.
Migrasjon 083 bruker derfor PostgreSQLs innebygde `pg_database_owner`
transaksjonslokalt. Rollen er `NOLOGIN`, `NOSUPERUSER` og `NOBYPASSRLS`, og
migrasjonen gir bare eksplisitte tabellrettigheter på fase-1-tabellene samt nødvendige
avhengigheter (`users`, `tidum_kommuner`, `tidum_frister` og
meldingsnummersekvensen). Det gis ingen standardrettigheter på fremtidige
objekter.

I produksjon skal plattformteamet opprette en separat applikasjonslogin uten
eier-, DDL- eller `BYPASSRLS`-rettigheter, en dedikert `NOLOGIN
NOBYPASSRLS`-runtime-rolle og en separat migrasjonsidentitet. Sett
`TIDUM_RLS_RUNTIME_ROLE` til runtime-rollen og gi applikasjonsloginen rett til
å `SET ROLE` til den. Rollen skal få samme eksplisitte objektrettigheter som i
migrasjon 083, ikke generelle rettigheter på alle eller fremtidige tabeller.
Tilkoblingshemmelighetene skal ligge i godkjent hvelv. `pg_database_owner` er
en kompatibilitetsgrense for dagens administrerte utviklingsdatabase, ikke
erstatning for minste privilegium i produksjon. Produksjonsoppstart feiler
lukket dersom variabelen mangler eller peker på `pg_database_owner`.

## Verifikasjon og utrulling

Før deploy:

1. ta verifisert databasebackup og registrer endrings-ID;
2. kjør migrasjon 083 idempotent med migrasjonsidentiteten;
3. bekreft `relrowsecurity=true` og `relforcerowsecurity=true` på alle tre
   tabellene;
4. bekreft at runtime-rollen ikke kan logge inn, ikke er superbruker og ikke
   har `BYPASSRLS`;
5. kjør to-kommunetesten og kontroller at A aldri ser eller endrer B;
6. test opprettelse, tildeling, vedlegg, sikker dialogreferanse, rått FIKS-
   inntak, arkivering og nøkkelrotasjon;
7. kontroller at en tilkobling uten kontekst ser null beskyttede rader etter
   commit.

Utviklingsbevis 27.08.2026: migrasjonen ble kjørt to ganger mot Neon, og ni
berørte testfiler besto 49/49 tester. Testene dekker fail-closed uten kontekst,
to kommuner, kryssoppdatering, sammensatt vedleggsbinding, pool-reset,
krysskommunal tildeling samt regresjon for sikker dialog, arkiv, FIKS og
nøkkelrotasjon.

## Gjenstående akseptanse

- egen produksjonslogin og separat migrasjonsidentitet;
- utvidelse av RLS-matrisen til hele kommunedomenet og relevante vendorflater;
- overvåking av policyfeil og periodisk rettighetsreview;
- last-/pooltest i valgt produksjonsplattform;
- uavhengig sikkerhetsgjennomgang og penetrasjonstest.
