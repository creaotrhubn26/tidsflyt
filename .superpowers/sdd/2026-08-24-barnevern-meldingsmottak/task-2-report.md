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
