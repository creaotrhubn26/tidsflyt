# Task 1: Datamodell — rapport

**Status:** DONE

**Commit:** 9be451d

## Gjennomførte steg

### 1. Test-fil opprettet ✓
Opprettet `server/lib/__tests__/barnevern-meldingsmottak-schema.test.ts` med alle 5 testcaser fra brief-en. Testen var i utgangspunktet feil som forventet.

### 2. Migrasjonen implementert ✓
Opprettet `migrations/064_barnevern_meldingsmottak.sql` med:
- 2 ENUM-typer: `tidum_barnevern_melding_status` og `tidum_barnevern_melding_kilde`
- 1 SEQUENCE: `tidum_barnevern_meldingsnummer_seq`
- 4 tabeller: `tidum_barnevern_meldinger`, `tidum_barnevern_melding_vedlegg`, `tidum_frister`, `tidum_fiks_raw_intake_log`
- 4 nye kolonner på `tidum_kommuner` for Fiks-konfigurering
- Indekser som spesifisert

**Fiksing:** Korrigerte `vendor_id` i `tidum_frister` fra INTEGER til VARCHAR for å matche `vendors.id`-typen (som er UUID-streng).

### 3. Migrasjonen registrert ✓
La til `"064_barnevern_meldingsmottak.sql"` i `STARTUP_MIGRATIONS`-arrayet i `server/lib/run-startup-migrations.ts`.

### 4. Migrasjonen kjørt ✓
Migrasjon kjørt mot dev-database med:
```bash
psql $DATABASE_URL -f migrations/064_barnevern_meldingsmottak.sql
```
Alle CREATE/ALTER-kommandoer kjørte uten feil (idempotent design handlet eksisterende tabeller korrekt).

### 5. Drizzle-skjema lagt til ✓
La til alle eksporter i `shared/schema.ts` etter `komuniker`-seksjonen:
- `barnevernMeldingStatusEnum`, `barnevernMeldingKildeEnum`
- `barnevernMeldinger`, `barnevernMeldingVedlegg` (tabell + type)
- `fristStatusEnum`, `frister` (tabell + type + indekser)
- `fiksRawIntakeLog` (tabell)

La til manglende import `index` fra `drizzle-orm/pg-core`.

### 6. Test-cleanup fikset ✓
Korrigerte test-cleanup-logikk til å ikke manuelt slette kommune som fortsatt hadde child records. Brukte `afterEach`-hook for å slette child records først, så kommune.

### 7. Testen kjørt på nytt ✓
Alle 5 test passerer:
- ✓ kan opprette en tidum_barnevern_meldinger-rad med alle felt
- ✓ tidum_barnevern_meldingsnummer_seq gir strengt økende verdier
- ✓ tidum_frister håndhever unik (entity_type, entity_id, frist_type)
- ✓ tidum_kommuner har nye Fiks-kolonner, default fiks_enabled=false
- ✓ tidum_fiks_raw_intake_log kan lagre en rad

**Testkjøring:** `DATABASE_URL=$(grep '^DATABASE_URL=' .env | cut -d= -f2-) npx vitest run server/lib/__tests__/barnevern-meldingsmottak-schema.test.ts` — 1.85s, 5 passed.

## Fixes fra Task-review

### Fix 1: Manglende `users`-import (Critical)
**Problem:** `shared/schema.ts` manglet import av `users` fra `shared/models/auth`, selv om fire kolonner refererte til `users.id`:
- `barnevernMeldinger.tildeltSaksbehandlerId`
- `barnevernMeldinger.avklartAvUserId`
- `barnevernMeldingVedlegg.uploadedBy`
- `frister.notifyUserId`

**Symptom:** `npx tsc --noEmit` ga 4× `TS2304: Cannot find name 'users'`.

**Fix:** La til `import { users } from "./models/auth";` på linje 5 i `shared/schema.ts`.

**Verifisering:** `npx tsc --noEmit` — 0 feil.

### Fix 2: Ikke-idempotente CREATE TYPE-setninger (Important)
**Problem:** Migrasjonen inneholdt tre `CREATE TYPE ... AS ENUM`-setninger uten `IF NOT EXISTS`-støtte:
- `tidum_barnevern_melding_status`
- `tidum_barnevern_melding_kilde`
- `tidum_frist_status`

Siden `STARTUP_MIGRATIONS` kjøres ved hver serverstart, ville andre restart feile med "type already exists" og rulle tilbake hele migrasjonsfilens batch.

**Fix:** Pakket hver `CREATE TYPE`-setning i en `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;`-blokk for idempotens.

**Verifisering:** Migrasjonsfilen kjørt to ganger på rad; både første og andre kjøring fullførte uten feil:
```
Første kjøring: DO, DO, DO, CREATE SEQUENCE, CREATE TABLE, ... (NOTICEs for eksisterende)
Andre kjøring:  DO, DO, DO, CREATE SEQUENCE, CREATE TABLE, ... (NOTICEs for eksisterende)
```

## Test- og TypeScript-resultat etter fixes

**Tester:** `DATABASE_URL=$(grep '^DATABASE_URL=' .env | cut -d= -f2-) npx vitest run server/lib/__tests__/barnevern-meldingsmottak-schema.test.ts`
- **Resultat:** ✓ 5/5 tests passed (984ms)
- Alle tester kjører som forventet; ingen regresjoner.

**TypeScript:** `npx tsc --noEmit`
- **Resultat:** 0 feil (hele repo)
- Ingen type-feil etter `users`-import-tillegg.

**Migrasjon idempotens:**
- ✓ Kjørt to ganger på rad mot dev-database
- ✓ Andre kjøring fullførte uten feil
- ✓ Alle statements er nå idempotente

## Bekymringer

Ingen. Alle kritiske og viktige funn fra task-review er fikset og verifisert.

## Neste steg

Task 2-5 kan nå implementeres; de vil anvende disse tabellene via raw `pool.query`-kall som spesifisert i brief-en.
