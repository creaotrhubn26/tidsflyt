# Task 2: Generisk fristmotor — rapport

**Status:** DONE

**Commit:** (se `git log -1`)

## Gjennomførte steg

### 1. Test-fil opprettet
Opprettet `server/lib/__tests__/frist-engine.test.ts` med alle 5 testcaser fra brief-en, ordrett. Testen feilet som forventet (`Cannot find module '../frist-engine'`).

### 2. `server/lib/frist-engine.ts` implementert
Ordrett fra brief-en: `FRIST_TYPE_CONFIG`, `registerFrist` (UPSERT med `ON CONFLICT (entity_type, entity_id, frist_type)`, resetter `varslet_offsets`/`status` ved re-registrering), `cancelFrist` (setter `status = 'kansellert'` kun for aktive rader), `runFristEscalations` (leser aktive frister, beregner `daysDiff` mot `due_at`, sender eskalerende varsler for hver offset som er forfalt og ikke tidligere varslet, rører aldri `status`).

### 3. `server/routes/frist-escalation-cron.ts` opprettet
Speiler `task-escalation-cron.ts` sin struktur: daglig cron kl 08:00 + manuell trigger-rute for `super_admin` (`POST /api/admin/frist-escalation/run`), autorisasjon håndhevet server-side via `requireAuth` + rolle-sjekk.

### 4. Montert i `server/routes.ts`
Import rett under `task-escalation-cron`-importen (linje 16-17), `registerFristEscalationRoutes(app)` + `setupFristEscalationCron()` rett etter `registerNotificationRoutes(app)` (linje ~6670-6672).

### 5. Avvik fra brief — nødvendig testfiks (ikke skjema-endring)
Brief-testen bruker `notifyUserId: "test-user-1"` / `"test-user-2"` direkte. `tidum_frister.notify_user_id` har en reell FK til `users.id` (i motsetning til `tidum_dashboard_tasks.assigned_by_user_id`, som ikke har FK). De to fiktive bruker-id-ene fantes ikke i `users`-tabellen, så testen feilet på FK-brudd. Løst med `beforeAll`/`afterAll` i testfilen som oppretter/rydder disse to bruker-radene (samme mønster som brukes i andre eksisterende tester, f.eks. `role-assignment-routes.test.ts`: `INSERT INTO users (id, username, password) VALUES (...)` — `username`/`password` er NOT NULL uten default i live-skjemaet, et pre-eksisterende avvik fra `shared/models/auth.ts`, ikke noe jeg innførte). Ingen produksjonskode eller skjema ble endret for dette — kun testfixturen.

### 6. Testkjøring
`server/lib/__tests__/frist-engine.test.ts` (5/5) + `server/lib/__tests__/barnevern-meldingsmottak-schema.test.ts` (5/5) — alle 10 grønne, ingen regresjon.

### 7. Typecheck
`npx tsc --noEmit` for hele repoet — ingen feil.

## Filer endret
- `server/lib/frist-engine.ts` (ny)
- `server/routes/frist-escalation-cron.ts` (ny)
- `server/lib/__tests__/frist-engine.test.ts` (ny)
- `server/routes.ts` (import + montering)

## Oppfølging: cron-gate (etter tilbakemelding fra koordinator)
`server/routes.ts:6654-6665` har en etablert, håndhevet konvensjon: ALLE daglige cron-oppsett (inkl. `setupTaskEscalationCron()`) kjøres inni `if (process.env.RECURRING_CRON_DISABLED !== 'true') { ... }`. Første commit av denne oppgaven kalte `setupFristEscalationCron()` utenfor denne blokken, ved siden av rene rute-registreringer — brief-en nevnte ikke gaten eksplisitt.

Fikset: `setupFristEscalationCron();` flyttet inn i samme gate, rett etter `setupTaskEscalationCron();`. `registerFristEscalationRoutes(app);` (rute-registreringen) ble stående der den var — kun cron-starten ble flyttet. `npx tsc --noEmit` (hele repo) og begge testfiler (`frist-engine.test.ts` 5/5, `barnevern-meldingsmottak-schema.test.ts` 5/5) bekreftet grønt etter flyttingen.

## Oppfølging 2: claim-guard mot samtidige kjøringer (Important-funn fra task-review)

`runFristEscalations` gjorde SELECT-alle-aktive → loop → varsle → UPDATE `varslet_offsets` ETTER varslingen. To samtidige kjøringer (manuell admin-trigger som race'r 08:00-cronen, eller flere serverinstanser — `cronStarted`-guarden i `frist-escalation-cron.ts` beskytter kun én prosess) kunne begge lese samme rad før noen skrev tilbake og begge sende samme varsel til samme bruker. `task-escalation-cron.ts` (filen denne oppgaven speiler) har allerede løst det tilsvarende problemet med "claim-før-varsling"-mønsteret; `frist-engine.ts` manglet det.

**Fiks:** byttet rekkefølge — UPDATE-en som legger til `dueOffsets` i `varslet_offsets` kjøres nå FØR varslingsløkken, betinget på `WHERE id = $2 AND NOT (varslet_offsets && $1::integer[])` (Postgres array-overlapp-operator). Kun kjøringen som faktisk claimer raden (får `RETURNING id`-treff) fortsetter til å varsle; den andre `continue`r. Claimet er all-or-nothing per rad (samme `dueOffsets`-sett claimes atomisk sammen), ikke per enkelt-offset — det er tilstrekkelig siden begge samtidige kjøringer uansett beregner samme `dueOffsets` fra samme (stale) lesning.

**Ny test:** `to samtidige kjøringer av runFristEscalations varsler ikke dobbelt (claim-guard)` i `frist-engine.test.ts` — kjører `Promise.all([runFristEscalations(), runFristEscalations()])` mot samme 10-dager-oversittede frist (alle 4 offsets forfalt), bekrefter `createNotification` kalles nøyaktig 4 ganger, ikke 8. Verifisert stabil over 3 gjentatte kjøringer.

**Feil underveis (fanget selv, fikset i testen — ikke produksjonskoden):** første versjon av race-testen kalte `runFristEscalations(dueAt)` med fristens EGEN `due_at` som `now`-argument, som ga `daysDiff ≈ 0` i stedet for ≈10 (siden `now` og `due_at` da var nesten identiske), og dermed kun 2 av 4 offsets ble ansett forfalt. Rettet til `runFristEscalations()` uten argument (bruker reell systemtid), samme mønster som den eksisterende "alle 4 eskaleringsterskler"-testen.

`npx tsc --noEmit` (hele repo) og begge testfiler (`frist-engine.test.ts` 6/6 inkl. ny race-test, `barnevern-meldingsmottak-schema.test.ts` 5/5) grønt etter fiksen.
