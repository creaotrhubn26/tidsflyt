# Sikker dialog: arkiv, oppbevaring og nøkkelrotasjon

## Formål og sikker standard

En sikker dialog køes for arkivering i samme PostgreSQL-transaksjon som
samtalen lukkes. Lokal dialogtekst og vedlegg kan ikke slettes før alle disse
vilkårene er oppfylt:

1. kommunen har aktivert en eksplisitt oppbevaringspolicy;
2. samtalen er avsluttet og fristen er passert;
3. `archive_entries.status = 'archived'` for akkurat samme kommune og samtale;
4. ingen aktiv juridisk sperring finnes;
5. private objektlagerfiler er slettet eller slettingen kan prøves idempotent.

Migrasjonen velger ingen juridisk oppbevaringsperiode. Standard er
`enabled=false`, slik at manglende kundebeslutning aldri utløser sletting.
Halden er behandlingsansvarlig og må godkjenne periode, arkivunntak og
henvisning til vedtak/policy før aktivering.

## Arkivpakken

Ved lukking opprettes én kommune-bundet `secure_dialog`-oppføring i den
eksisterende arkiv-outboxen. Arbeideren produserer:

- JSON-manifest med kilde-ID-er, meldingshash, dokumentkontrollsummer og hash
  av auditprojeksjonen;
- UTF-8-transkript av sendte meldinger;
- alle rene vedlegg etter ny SHA-256-kontroll mot lagringsmetadata;
- Noark-ekstern-ID `tidum:secure-dialog:<uuid>` for idempotens;
- arkivkvittering med mappe, journalpost, dokumentantall og payload-hash.

Utkast arkiveres ikke. Offentlig tittel inneholder ikke navn eller emne.
Kundesatt skjerming, arkivdel, administrativ enhet og klasse brukes fra samme
Documaster-konfigurasjon som øvrig arkivering.

I produksjon må både Documaster-API-verten og eventuell separat IDP-vert stå
eksakt i `ARCHIVE_ALLOWED_HOSTS`. Dette gjør både tilkoblingstesten og
bakgrunnsarbeideren fail-closed mot SSRF. Private arkivverter kan brukes, men
bare når de er uttrykkelig allowlistet av drift.

Arkivarbeideren claimer en oppføring atomisk som `processing`. En claim som
har stått i 15 minutter blir frigitt for retry. Documaster-adapteren slår også
opp ekstern-ID før opprettelse, slik at et tvetydig nettverksutfall kan spilles
av på nytt uten en ny journalpost.

## Roller og API

- `barnevernsleder` kan koble kommunens arkiv, endre oppbevaringspolicy og
  legge på/frigi juridisk sperring.
- `kommune_saksbehandler` kan lese arkivstatus og arkivlogg, men ikke endre
  policy eller sperring.
- Tenant og rolle leses på nytt fra `users` i databasen; klientstyrt kommune-ID
  brukes ikke.

Aktuelle endepunkter:

- `GET/PATCH /api/secure-dialog/governance/retention`
- `POST /api/secure-dialog/governance/retention/run`
- `GET /api/secure-dialog/conversations/:id/governance`
- `POST /api/secure-dialog/conversations/:id/legal-holds`
- `DELETE /api/secure-dialog/conversations/:id/legal-holds/:holdId`
- `GET /api/integrations/arkiv/entries`
- `POST /api/integrations/arkiv/entries/:id/retry`

Eksempel på aktivering etter skriftlig kundebeslutning:

```json
{
  "enabled": true,
  "retentionDays": 3650,
  "policyReference": "Halden policy/vedtak <referanse>"
}
```

Tallet over er bare et API-eksempel, ikke Tidums juridiske anbefaling.

## Retensjonsjobb og juridisk sperring

Retensjonsjobben kjører daglig 02:37. Først markeres én kvalifisert samtale
som `purging`, slik at den ikke lenger eksponeres i portalene. Objektlagerfiler
slettes idempotent. Deretter slettes meldingstekst, vedlegg, kvitteringer,
varslingsrader og deltakerrader i én transaksjon. Samtaleraden, arkivkvittering
og append-only audit beholdes som bevis, med `subject = NULL` og
`retention_state = 'purged'`.

Ved lagrings- eller databasefeil forblir samtalen `purging`, teknisk feiltekst
lagres nøytralt og jobben prøver igjen med backoff. En juridisk sperring kan
bare settes før sletting har startet og blokkerer både automatisk og manuell
kjøring.

## Nøkkelrotasjon uten tap av dialoginnhold

Sikker dialog bruker datanøkkelkonvolutter (`sdc:v1`). Hvert emne og hver
melding har en tilfeldig AES-256-GCM-datanøkkel. Servernøkkelen krypterer bare
datanøkkelen. Ved rotasjon pakkes datanøkkelen om; innholdets IV, tag og
chiffertekst forblir byte-identiske, noe databasevakten kontrollerer for
sendte meldinger.

Miljøkontrakt:

```dotenv
TIDUM_SECRET_KEY=<legacy-nøkkel-beholdes-under-overgang>
TIDUM_SECRET_KEYRING={"2026-08":"<gammel>","2026-11":"<ny>"}
TIDUM_SECRET_ACTIVE_KEY_ID=2026-11
```

Rotasjonsprosedyre:

1. legg gammel og ny nøkkel i hemmelighetshvelvet og deploy med gammel som
   aktiv; behold `TIDUM_SECRET_KEY` for uversjonerte `enc:v1`-rader;
2. bytt `TIDUM_SECRET_ACTIVE_KEY_ID` til ny ID og deploy;
3. timejobben pakker om samtaler, meldinger, arkivhemmeligheter,
   FIKS-privatnøkler, kryptert FIKS-rålogg og PowerOffice ClientKeys i
   avgrensede batcher;
4. kontroller at ingen relevant rad peker på gammel/uversjonert nøkkel;
5. ta en kontrollert backup og gjennomfør lesetest av dialog, arkivkobling,
   FIKS-konfigurasjon og PowerOffice-tilkobling;
6. fjern gammel nøkkel først etter dokumentert nullrest og godkjent rollback-
   vindu.

Den samlede, leverandørstyrte prosedyren, mounted-secret-kontrakten,
superadmin-endepunktet og append-only kjøringsbeviset er beskrevet i
`docs/runbooks/hemmelighetshvelv-og-nokkelrotasjonsovelse.md`.

Hvis en gammel nøkkel fjernes for tidlig, feiler dekryptering lukket. Legg den
tilbake i nøkkelringen og la rotasjonsjobben fullføre; ikke omskriv data
manuelt.

## Produksjonsakseptanse som fortsatt krever eksterne parter

- Documaster/Elements testtenant, API-legitimasjon og godkjente kodelister;
- administrativ enhet, arkivdel, klasse og skjermingskoder fra Halden;
- feil/retry/duplikat og avstemming mot faktisk arkivkjerne;
- godkjent oppbevaringsperiode, arkivunntak og juridisk-sperreprosedyre;
- norsk/avtalt hemmelighetshvelv/KMS, tilgangsreview og dokumentert rotasjon;
- restore-test som verifiserer at arkivbevis og aktive dialoger kan leses.

Applikasjonstestene bruker kontrollert Noark-transportmock. Dette er bevis på
leverandørflyten, ikke på at Haldens Documaster-instans er godkjent eller
produksjonsverifisert.
