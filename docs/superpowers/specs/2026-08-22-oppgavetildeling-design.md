# Oppgavetildeling — eier, frist, varsling, eskalering

## Bakgrunn og mål

Halden-gap-analysen (22.08.2026) markerte «Oppgavehåndtering med eier,
frist, varsling og eskalering» som Delvis: Tidum har et
notifikasjonssystem (`notifications`-tabellen, in-app, lest/ulest) og en
personlig gjøreliste («Mine oppgaver», `tidum_dashboard_tasks`,
`client/src/components/dashboard/dashboard-tasks.tsx`), men ingen måte å
tildele en oppgave til NOEN ANNEN, ingen ekte frist, og ingen eskalering.

Målet er å utvide den eksisterende «Mine oppgaver»-widgeten til også å
støtte tildeling til andre, med frist og automatisk eskalering ved
fristbrudd — uten å bygge en parallell, konkurrerende oppgavefunksjon.

## Global Constraints

- `tidum_dashboard_tasks` og dens eksisterende personlige bruk
  (selvopprettede oppgaver, snooze, prioritetsscoring,
  duplikat-deteksjon i `dashboard-tasks.tsx`) skal fortsette å virke
  UENDRET for en bruker som aldri tildeler/blir tildelt noe — dette er
  en utvidelse, ikke en omskriving.
- Tildeling til NOEN ANNET enn seg selv krever
  `canManageUsersDynamic(actorRole)` (fase 1.6s databasedrevne
  rangordning, `server/lib/permissions.ts`) — samme mønster som allerede
  gater portalens `canManageRole`-erstatning.
- Eskalering skjer NØYAKTIG ÉN GANG per oppgave (idempotent) — ikke
  gjentatt ved hver cron-kjøring. `rapport-reminder-cron.ts` sitt
  eksisterende mønster har eksplisitt INGEN slik vakt; denne
  funksjonen må bygge sin egen, ikke kopiere det mønsteret rått.
- Ikke navngi noe nytt bruker-vendt konsept «oppgave» på en måte som
  forveksles med «Faste oppgaver» (som faktisk er tilbakevendende
  timeføring, `client/src/pages/recurring.tsx` — urelatert, ikke rør).

## Datamodell

Utvider `tidum_dashboard_tasks` (`shared/schema.ts:1620-1630`, nåværende
felter: `id, userId, title, done, linkedUrl, linkedLabel, snoozedUntil,
createdAt, updatedAt`) med tre nye, alle nullable (bakoverkompatible —
en eksisterende rad med alle tre NULL oppfører seg identisk til i dag):

- `assignedByUserId` (text, nullable) — hvem som tildelte oppgaven. NULL
  = selvopprettet (dagens eneste tilfelle). Satt = tildelt av noen
  annen. `userId` forblir alltid EIER/MOTTAKER — ingen endring i hvordan
  oppgaver hentes for en bruker.
- `dueAt` (timestamp, nullable) — ekte frist. Adskilt fra `snoozedUntil`
  (som er «skjul til dette tidspunktet», en UI-bekvemmelighet, ikke en
  frist).
- `escalatedAt` (timestamp, nullable) — satt av eskalerings-cronen første
  (og eneste) gang en oppgave eskaleres. Idempotens-vakten.

## Tildeling og varsling

`POST /api/tasks` (`server/routes.ts:5429-5503`) utvides til å ta imot
valgfri `assigneeUserId` og `dueAt` i tillegg til dagens `title`/`linkedUrl`.

- Hvis `assigneeUserId` er utelatt eller lik den innloggede brukeren:
  oppfører seg nøyaktig som i dag (selvopprettet oppgave,
  `assignedByUserId` forblir NULL).
- Hvis `assigneeUserId` peker på en ANNEN bruker: sjekk
  `canManageUsersDynamic(actorRole)` for den innloggede brukerens
  rolle. Usann → 403. Sann → oppgaven opprettes med `userId =
  assigneeUserId`, `assignedByUserId = <innlogget brukers id>`.
- Ved vellykket tildeling til noen annet: `createNotification()`
  (`server/routes/notification-routes.ts:11-37`, eksisterende, ingen
  endring i selve funksjonen) til mottakeren — tittel «Ny oppgave
  tildelt», med lenke til oppgaven.

## Eskalering

Ny cron-fil `server/routes/task-escalation-cron.ts`, samme struktur som
`server/routes/rapport-reminder-cron.ts` (node-cron, en `runX()`-funksjon
+ en admin-gatet manuell trigger-rute), registrert i `server/routes.ts`
ved siden av de andre `setup*Cron()`-kallene.

Kjører daglig (foreslått 08:00, samme tidsrom som
timesheet-reminder-cronen). For hver rad i `tidum_dashboard_tasks` der:
`due_at < NOW()` OG `done = false` OG `escalated_at IS NULL` OG
`assigned_by_user_id IS NOT NULL` (kun tildelte oppgaver eskalerer — en
selvopprettet oppgave med frist som brytes varsler ingen, siden
tildeleren og mottakeren er samme person og allerede ser oppgaven i sin
egen liste):

1. `createNotification()` til `assignedByUserId` — tittel «Oppgave
   forfalt», nevner mottakerens navn og oppgavens tittel.
2. `UPDATE tidum_dashboard_tasks SET escalated_at = NOW() WHERE id = $1`
   — idempotens-vakten, hindrer gjentatt varsling ved neste kjøring.

## UI

`dashboard-tasks.tsx`:
- En oppgave med `assignedByUserId` satt viser «Tildelt av <navn>» +
  et fristmerke (samme `Badge`-stil-mønster som `cases.tsx`
  `statusBadgeClass`-kartet) i stedet for dagens rene tittel-rad.
- Ny «Tildel til»-velger i opprett-oppgave-skjemaet, kun synlig for
  brukere der `canManageUsersDynamic` er sann for deres rolle (samme
  klient-mønster som fase 1.6s `manageable-roles`-endepunkt — hent
  listen over roller/personer aktøren kan tildele til fra en tilsvarende
  ny, liten server-sjekk, ikke dupliser rang-logikken klientsidig).

## Feilhåndtering

- `canManageUsersDynamic`-sjekken feiler lukket (fail-closed, som resten
  av fase 1.6) — usikker/ukjent rolle kan aldri tildele til andre.
- `createNotification()` svelger allerede egne feil
  (`server/routes/notification-routes.ts:11-37`) — en varslingsfeil
  stopper aldri selve oppgave-opprettelsen eller eskaleringen.
- Eskalerings-cronen logger og fortsetter til neste rad ved feil på én
  oppgave (samme mønster som `rapport-reminder-cron.ts`), stopper ikke
  hele kjøringen.

## Testing

- Regresjon: en bruker som oppretter en oppgave UTEN `assigneeUserId`
  får identisk oppførsel som før denne endringen (alle eksisterende
  `dashboard-tasks`-relaterte tester må fortsatt bestå uendret).
- Tildeling: en bruker med `canManageUsersDynamic = true` kan tildele en
  oppgave til en annen bruker; mottakeren ser den i sin egen liste;
  mottakeren får en notifikasjon.
- Avvisning: en bruker med `canManageUsersDynamic = false` får 403 ved
  forsøk på å tildele til noen andre enn seg selv.
- Eskalering: en tildelt oppgave med `due_at` i fortiden og `done =
  false` trigger nøyaktig én notifikasjon til tildeleren ved cron-kjøring,
  og `escalated_at` settes. En andre kjøring av samme cron rett etter
  sender IKKE en ny notifikasjon (idempotens).
- En selvopprettet oppgave med forfalt frist eskalerer IKKE (siden
  `assigned_by_user_id IS NULL`).

## Ikke i omfang

- Eskalering oppover i rangordning (til noen med høyere rang enn både
  tildeler og mottaker) — eksplisitt valgt bort; eskalering går alltid
  til den som tildelte oppgaven.
- E-postvarsling for tildeling/eskalering — kun in-app-notifikasjon i
  denne omgang, samme leveringskanal `notifications`-tabellen allerede
  har (ingen ny e-post-logikk).
- Sak-kobling (`sakId` på en oppgave) — bevisst utelatt fra denne
  runden; oppgaven er generell, ikke tvunget gjennom en sak, selv om
  arkitekturen (nullable FK-mønster som `rapporter.sakId`) ikke er til
  hinder for å legge det til senere.
- Endring av `snoozedUntil`, prioritetsscoring, duplikat-deteksjon, eller
  noe annet av den eksisterende klientlogikken i `dashboard-tasks.tsx`
  utover det som trengs for å vise tildelte oppgaver og
  tildelings-velgeren.
