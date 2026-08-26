# Sak-journalføring — strukturert, uforanderlig journalføring med vedlegg

## Bakgrunn og mål

Halden-gap-analysen (22.08.2026) markerte «Strukturert journalføring, fritekst,
tidsstempel/forfatter, vedlegg» som Delvis: Tidum har log-row/saksrapport-
infrastruktur med tidsstempel og forfatter (`rapporter`, `rapportAktiviteter`,
`tidum_log_row`), men ingen ekte journal — noe som juridisk sett krever at en
oppføring, når den er skrevet, aldri kan endres eller slettes i ettertid.

Målet er en ny, egen journal knyttet direkte til en sak (`saker`), uavhengig
av rapport-arbeidsflyten (utkast/godkjenning/arkivering) — løpende, ikke
periodisk — med write-once-garanti og vedlegg, og en kobling videre til
Documaster/Noark 5 (PR #3, merget til main 22.08.2026) slik at journalførte
oppføringer automatisk havner i det lovpålagte arkivet.

## Global Constraints

- En journaloppføring, når lagret, kan ALDRI endres eller slettes — verken
  via API, database-constraint, eller UI. Ingen `PATCH`/`DELETE`-rute skal
  finnes for journaloppføringer i det hele tatt (ikke bare blokkert av en
  sjekk i koden — ruten eksisterer ikke). En feilskrivning rettes med en ny,
  lenket korreksjons-rad; originalen står urørt.
- `sakId` er PÅKREVD (ikke nullable) på en journaloppføring — i motsetning
  til `rapporter.sakId`, som er valgfri. En journal ER saksdokumentasjon.
- Tilgang til en saks journal følger NØYAKTIG samme rad-nivå-modell som
  rapporter i dag (`server/sakerRapportRoutes.ts:491-505`): kun
  `journalEntry.userId === req.user.id` (forfatteren selv), saken sin
  `tiltakslederId === req.user.id`, eller `req.user.role === "super_admin"`.
  Ikke «hele vendoren ser alt».
- Vedlegg lagres i S3-kompatibel objektlagring i SAMME EU-region som
  databasen (Neon, `eu-central-1`/Frankfurt) — ikke lokal disk (dagens
  `leave-attachments-routes.ts`-mønster er bevisst IKKE gjenbrukt for denne
  featuren, siden lokal disk ikke gir kryptering-at-rest-kontroll eller
  versjonering uavhengig av appserverens egen region). Norge-spesifikk
  lagring (f.eks. Azure Norway) bygges IKKE i denne runden — kun ved en
  konkret fremtidig kontrakt som eksplisitt krever det (som Halden gjorde).
  Se `docs/anbud/2026-112379-halden-barnevern-gap-analyse.md` og
  research-notatet i denne spec-ens historikk for hvorfor EU/EØS er det
  juridiske gulvet, ikke Norge spesifikt.
- Journalføring skal IKKE bygges som en utvidelse av `rapportAktiviteter`
  eller noen annen rapport-tilknyttet tabell — egen, ny tabell, uavhengig av
  rapportenes livssyklus (utkast/godkjent/arkivert).
- Ikke navngi noe på en måte som forveksles med «Faste oppgaver»
  (tilbakevendende timeføring, urelatert) eller med selve rapport-systemet
  (`rapporter`) — bruk konsekvent «journal»/«journalføring» i kode, UI og
  API-stier, aldri «rapport».

## Datamodell

Ny tabell `sakJournal` (SQL-navn: `tidum_sak_journal`, følger etablert
`tidum_`-prefikskonvensjon):

- `id` (uuid, primary key, `gen_random_uuid()` — matcher `saker`/`rapporter`)
- `sakId` (uuid, NOT NULL — ingen `.references()`-håndhevelse i Drizzle,
  konsistent med eksisterende praksis for `rapporter.sakId`/`logRow.sakId`)
- `userId` (text, NOT NULL) — forfatteren. Aldri endret etter opprettelse.
- `content` (text, NOT NULL) — fritekst journalnotat.
- `correctsEntryId` (uuid, nullable) — hvis satt: denne oppføringen er en
  korreksjon av en tidligere, feilskrevet oppføring. Peker til den
  opprinnelige radens `id`. Originalen slettes/endres ALDRI — den nye raden
  legges bare til, med en tydelig markering i UI om at den korrigerer en
  tidligere oppføring.
- `createdAt` (timestamp, `defaultNow()`) — satt av databasen, ikke klienten.
  Dette ER tidsstempelet journalen juridisk hviler på.

Ingen `updatedAt`-kolonne i det hele tatt — en rad som aldri kan endres
trenger ingen "sist endret"-tidsstempel; dets fravær er selve garantien
gjort synlig i skjemaet.

Ny tabell `sakJournalAttachments` (SQL-navn: `tidum_sak_journal_attachments`):

- `id` (uuid, primary key)
- `journalEntryId` (uuid, NOT NULL) — hvilken journaloppføring vedlegget
  hører til
- `filename` (text, NOT NULL) — det lagrede objektets nøkkel/navn i
  objektlagringen (generert, ikke brukerens opprinnelige filnavn)
- `originalName` (text, NOT NULL) — filnavnet brukeren lastet opp
- `mimeType` (text, NOT NULL)
- `sizeBytes` (integer, NOT NULL)
- `uploadedBy` (text, NOT NULL)
- `uploadedAt` (timestamp, `defaultNow()`)

Migrasjonsfil: `062_sak_journal.sql` (neste ledige nummer etter 061),
registrert sist i `STARTUP_MIGRATIONS`. Rent additivt — ingen eksisterende
tabell røres.

## Objektlagring for vedlegg

Ny avhengighet: `@aws-sdk/client-s3` (offisiell AWS SDK v3) — ingen
eksisterende S3-kapabel klient finnes i repoet i dag (`leave-attachments-
routes.ts` bruker kun lokal disk via `multer`). Bucket opprettes i AWS
`eu-central-1` (samme region som Neon-databasen allerede kjører i — ingen ny
skyleverandør-relasjon, kun en ny AWS-tjeneste i en region appen allerede har
data i).

- Server-side encryption (SSE-S3 eller SSE-KMS) på bucketen.
- Bucket-versjonering PÅ — selv om appen aldri overskriver et objekt (hver
  opplasting får en unik generert nøkkel), gir versjonering et siste
  sikkerhetsnett mot utilsiktet sletting utenfra (f.eks. en feilkonfigurert
  AWS-policy) og er billig forsikring for en juridisk journal.
- Opplasting skjer server-side (klienten laster ikke opp direkte til S3) —
  samme tillitsgrense-mønster som `leave-attachments-routes.ts` (`multer`
  memory-storage i stedet for disk-storage denne gangen, siden filen skal
  videre til S3, ikke bli liggende lokalt).
- Miljøvariabler: `SAK_JOURNAL_S3_BUCKET`, `SAK_JOURNAL_S3_REGION` (default
  `eu-central-1`), pluss standard AWS-credential-oppløsning (IAM-rolle på
  Render hvis mulig, ellers `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` i
  miljøet — samme mønster som andre hemmeligheter i denne appen).

## API

- `POST /api/saker/:sakId/journal` — oppretter en ny journaloppføring.
  Body: `{ content: string, correctsEntryId?: string }`. Tilgang: samme
  rad-nivå-sjekk som `POST /api/rapporter` (bruker må være
  `tildelteUserId`/tiltaksleder på saken, eller super_admin). Ved suksess:
  legges automatisk i arkiv-outboxen (se under).
- `GET /api/saker/:sakId/journal` — lister alle journaloppføringer for
  saken, kronologisk, inkludert `correctsEntryId`-kjeder synlig i responsen
  slik at UI-et kan vise en korreksjon koblet til originalen.
- `POST /api/saker/:sakId/journal/:entryId/attachments` — laster opp ett
  eller flere vedlegg til en EKSISTERENDE journaloppføring (vedlegg kan
  legges til i etterkant av at teksten er skrevet, men selve
  journaltekst-raden er uansett allerede uforanderlig — å legge til et
  vedlegg endrer ikke `content`/`createdAt`).
- `GET /api/saker/:sakId/journal/:entryId/attachments/:attachmentId` —
  laster ned ett vedlegg (server proxier fra S3, samme tilgangssjekk som
  over — ingen direkte, signerte S3-URL-er distribuert til klienten i denne
  runden, for å holde all tilgangskontroll på serveren).
- INGEN `PATCH`/`DELETE`-rute for `/api/saker/:sakId/journal/:entryId` eller
  for enkeltvedlegg — bevisst fravær, se Global Constraints.

## Documaster-arkivering

Utvider den eksisterende arkiv-outboxen (`archive_entries`,
`server/lib/archive/archive-service.ts`, fra PR #3) med en ny
`entityType: "journal"` ved siden av dagens `"rapport"`:

- Ny funksjon `queueJournalEntryArchiving(journalEntryId: string):
  Promise<{queued: boolean; reason?: string; entryId?: string}>`, som
  speiler `queueRapportArchiving()` sin struktur, men uten `trigger`-
  parameteren (rapporter arkiveres ved godkjenning ELLER manuelt;
  journaloppføringer arkiveres alltid umiddelbart ved opprettelse, siden de
  ikke har noen godkjenningsflyt å vente på).
- Kalles direkte fra `POST /api/saker/:sakId/journal` sin suksess-gren,
  betingelse: `archiveConfigs` finnes og er `active` for sakens vendor
  (samme sjekk som rapport-arkivering) — hvis ikke konfigurert, opprettes
  journaloppføringen likevel (arkivering er best-effort/outbox-basert, ikke
  en forutsetning for å skrive journalen — konsistent med hvordan
  `queueRapportArchiving` allerede fungerer).
- Ny Noark-mapper `buildJournalJournalpost()` i `server/lib/archive/noark.ts`,
  som speiler `buildRapportJournalpost()`, men med journalens `content` som
  brødtekst og eventuelle vedlegg som Noark-dokumentversjoner.
- Samme `archiveCaseLinks`-gjenbruk som rapporter — én saksmappe per sak,
  delt mellom rapporter og journaloppføringer arkivert på samme sak.

## Feilhåndtering

- Arkiverings-kø-feil (`queueJournalEntryArchiving`) stopper ALDRI selve
  journalopprettelsen — samme prinsipp som rapportenes arkivering
  (best-effort, cron tar retry).
- S3-opplastingsfeil ved `POST .../attachments` gir en tydelig feilmelding
  til klienten (opplasting er en egen, separat handling fra selve
  journalteksten — teksten er allerede lagret uforanderlig før vedlegg
  eventuelt legges til).
- Manglende `content` eller `sakId` på opprettelse: 400. Manglende
  tilgang: 403 (fail-closed, samme mønster som resten av appen).

## UI

Ny seksjon på saksdetaljsiden (`client/src/pages/cases.tsx` eller en ny
underside/fane) — kronologisk journalliste per sak:

- Hver oppføring viser forfatter, tidsstempel, fritekst, og eventuelle
  vedlegg (nedlastbare).
- En korreksjon (`correctsEntryId` satt) vises tydelig koblet til og RETT
  ETTER originalen i den kronologiske listen, med en visuell markør
  («Korrigerer oppføring fra {dato}») — aldri erstatter eller skjuler
  originalen.
- Nytt-notat-skjema: fritekst-tekstområde + valgfri fil-drop/velger for
  vedlegg, «Lagre»-knapp. Ingen «rediger»-knapp noe sted i UI-et for en
  eksisterende oppføring — kun en «Korriger»-handling som åpner et nytt
  skjema forhåndsutfylt med referanse til originalen.

## Testing

- Regresjon: eksisterende rapport-/aktivitetslogg-funksjonalitet er
  fullstendig urørt (ny, egen tabell — ingen delt kode utover
  tilgangssjekk-mønsteret, som kopieres, ikke refaktoreres inn i en delt
  helper i denne runden).
- Write-once: et forsøk på `PATCH`/`DELETE` mot en journaloppføring gir 404
  (ruten finnes ikke) — testes ved å bekrefte at Express ikke har noen
  matchende rute, ikke ved å teste en 403/405 fra en eksisterende handler.
- Tilgang: en bruker som ikke er tildelt saken/tiltaksleder/super_admin får
  403 på både lesing og skriving.
- Korreksjon: en oppføring med `correctsEntryId` satt endrer ikke
  originalens `content`/`createdAt`; `GET`-responsen inneholder begge radene
  med korreksjonskoblingen synlig.
- Arkivering: `queueJournalEntryArchiving()` legger en rad i
  `archive_entries` med `entityType: "journal"` når `archiveConfigs` er
  aktiv for vendoren; oppretter journaloppføringen uendret selv om
  arkivkonfigurasjon mangler.
- Vedlegg: opplasting lagrer objektet i S3 (mocket i test, ikke ekte AWS-
  kall) og en rad i `sakJournalAttachments`; nedlasting proxier korrekt
  gjennom samme tilgangssjekk som journaloppføringen selv.

## Ikke i omfang

- Redigering eller sletting av journaloppføringer i NOEN form — dette er
  selve poenget med featuren, ikke en fremtidig utvidelse.
- Direkte, signerte S3-URL-er til klienten (all nedlasting proxies via
  serveren i denne runden — kan revurderes senere av ytelseshensyn).
- Norge-spesifikk (fysisk) datalagring — kun EU/EØS i denne runden, se
  Global Constraints.
- Fritekstsøk i journalinnhold på tvers av saker — kun kronologisk liste
  per sak i denne runden.
- Varsling ved ny journaloppføring (i motsetning til oppgavetildeling, som
  eksplisitt varsler) — en journal er dokumentasjon, ikke en oppgave noen må
  handle på; ingen `createNotification()`-kobling i denne runden.
