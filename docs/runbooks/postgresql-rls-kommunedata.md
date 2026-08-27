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

Migrasjon 084 innfører fase 2 for hele sikker-dialoggrafen:

- parter, sakstilganger, samtaler og deltakere;
- meldinger, vedlegg, lesekvitteringer og append-only audit;
- varslingskø og skadevarekarantene;
- oppbevaringspolicy og juridisk sperring.

Alle de tolv tabellene har `ENABLE` + `FORCE RLS`. Kommunalt ansatte ser bare
egen kommune. En BankID-/Buypass-autentisert part får en egen
`secure_party`-kontekst og kan bare følge sin egen aktive kjede fra part via
sakstilgang og deltaker til samtale, melding og vedlegg. En annen part i samme
kommune er dermed også skjult på databasenivå. Uten sterk eID brukes en
eksplisitt `deny`-kontekst som returnerer null rader og bevarer nøytrale
404-svar uten et privilegert eksistensoppslag.

Migrasjon 085 innfører fase 3A for det delte arkivdomenet:

- `archive_configs` med krypterte provider-credentials;
- `archive_case_links` mellom intern sak/melding og ekstern arkivmappe;
- `archive_entries` med outbox, status, kvittering og arkivbevis.

Arkivtabellene eies av enten én kommune eller én vendor, aldri begge. Alle tre
har `ENABLE` + `FORCE RLS`, og policyen kontrollerer både tenanttype og ID.
Arkivkøen bruker systemkontekst bare til å finne forfalte rader. Hver rad
claim-es, leses og oppdateres videre i sin egen kommune- eller vendorkontekst.

Dette er fase 1, 2 og 3A, ikke en påstand om full systemomfattende RLS.
Frister, brukerbinding, resten av vendor-domenet og øvrige saksobjekter skal
føres inn i en kontrollert tabell-/endepunktsmatrise før RLS kan beskrives som
komplett. Den delte `users`-tabellen skal ikke få generell kommune-RLS før
global innlogging, vendorinnlogging, portalbrukere og BankID/Buypass er bevist
kompatible.

## Transaksjonslokal kontekst

Beskyttede operasjoner går gjennom
`server/lib/database-rls-context.ts`. Hjelperen:

1. starter en eksplisitt transaksjon;
2. bytter lokalt til en rolle uten `BYPASSRLS`;
3. setter modus og nødvendig kommune-, vendor-, parts- eller systemkontekst med
   `set_config(..., true)`;
4. utfører operasjonen;
5. committer eller ruller tilbake og frigir tilkoblingen.

`true` gjør verdiene transaksjonslokale. En tilkobling som går tilbake i
poolen kan derfor ikke arve forrige kommunes kontekst. Manglende, ugyldig eller
utløpt kontekst gir ingen rader og avviser nye rader.

Manuelle ansatteforespørsler bruker alltid kommunekontekst avledet fra fersk
`users.kommune_id`. Vendorforespørsler bruker tilsvarende fersk
`users.vendor_id`. Innbyggerkontekst bruker fersk bruker-ID etter sterk eID;
policyene beviser aktivt parts-/samtalemedlemskap og stoler ikke på kommune-ID
fra requesten. Systemkontekst er avgrenset til navngitte interne jobber, som
varslingskø, karantenerydding, retensjon, arkivering og
hemmelighetsinventory/-rotasjon, og skal aldri bygges fra request-data.

## Databaseeier og produksjonsrolle

Den delte Neon-utviklingsdatabasen bruker en administrert eierkonto som kan
omgå RLS. Neon tillater ikke denne kontoen å opprette eller endre roller.
Migrasjon 083–085 bruker derfor PostgreSQLs innebygde `pg_database_owner`
transaksjonslokalt. Rollen er `NOLOGIN`, `NOSUPERUSER` og `NOBYPASSRLS`, og
migrasjonene gir bare eksplisitte rettigheter på fase-1/-2-tabellene og
nødvendige avhengigheter. Brukeropprettelse er begrenset til kolonnene som
trengs for en eID-only portalidentitet. Det gis ingen standardrettigheter på
fremtidige objekter.

I produksjon skal plattformteamet opprette en separat applikasjonslogin uten
eier-, DDL- eller `BYPASSRLS`-rettigheter, en dedikert `NOLOGIN
NOBYPASSRLS`-runtime-rolle og en separat migrasjonsidentitet. Sett
`TIDUM_RLS_RUNTIME_ROLE` til runtime-rollen og gi applikasjonsloginen rett til
å `SET ROLE` til den. Rollen skal få samme eksplisitte objektrettigheter som i
migrasjon 083–085, ikke generelle rettigheter på alle eller fremtidige
tabeller.
Tilkoblingshemmelighetene skal ligge i godkjent hvelv. `pg_database_owner` er
en kompatibilitetsgrense for dagens administrerte utviklingsdatabase, ikke
erstatning for minste privilegium i produksjon. Produksjonsoppstart feiler
lukket dersom variabelen mangler eller peker på `pg_database_owner`.

## Verifikasjon og utrulling

Før deploy:

1. ta verifisert databasebackup og registrer endrings-ID;
2. kjør migrasjon 083, 084 og 085 idempotent med migrasjonsidentiteten;
3. bekreft `relrowsecurity=true` og `relforcerowsecurity=true` på alle 18
   tabellene i fase 1, 2 og 3A;
4. bekreft at runtime-rollen ikke kan logge inn, ikke er superbruker og ikke
   har `BYPASSRLS`;
5. kjør to-kommunetesten og kontroller at A aldri ser eller endrer B;
6. kjør to-partstesten og kontroller at en part ikke ser en annen parts
   samtale i samme kommune;
7. test opprettelse, tildeling, vedlegg, sikker dialog, varsling, karantene,
   retensjon, rått FIKS-inntak, kommune-/vendorarkivering og nøkkelrotasjon;
8. kontroller at en tilkobling uten kontekst ser null beskyttede rader etter
   commit.

Utviklingsbevis 27.08.2026: migrasjon 083–085 er kjørt idempotent mot Neon.
Den siste samlede, berørte pakken besto 9 testfiler og 48/48 tester. Testene
dekker fail-closed uten kontekst, to kommuner, to vendors, to parter i samme
kommune, kryssoppdatering, eierforfalskning, sammensatte bindinger, pool-reset,
nøytral anti-enumerering, krysskommunal tildeling samt regresjon for sikker
dialog, varsling, karantene, retensjon, arkiv, frister og nøkkelrotasjon.
Typekontroll, designkontroll og produksjonsbygg er grønne; bygget har bare de
allerede kjente Browserslist-, Tailwind- og chunkstørrelsesvarslene.

## Gjenstående akseptanse

- egen produksjonslogin og separat migrasjonsidentitet;
- fase 3B for frister og en trygg bruker-/tenantmodell, deretter resten av
  kommunedomenet og relevante vendorflater;
- overvåking av policyfeil og periodisk rettighetsreview;
- last-/pooltest i valgt produksjonsplattform;
- uavhengig sikkerhetsgjennomgang og penetrasjonstest.
