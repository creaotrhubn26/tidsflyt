# RLS-klassifisering av db/pool-konsumerende filer

Generert/verifisert: 2026-08-16 (Task 9 i
`docs/superpowers/plans/2026-08-15-g10-sikkerhetsherding.md`).
Kandidatlisten er regenerert mot branchen `claude/g10-sikkerhetsherding`:

```bash
grep -rl "from ['\"].*/db['\"]" server/ | grep -v "\.test\.\|database-config\|/db\.ts$" | sort
# 59 filer (spec §5.1 hadde 56 — Task 8 la til server/middleware/vendor-scoped-db.ts,
# resten er nye ruter/lib-filer lagt til siden spec ble skrevet)
```

Det mekaniske førstepasset ligger i `scripts/audit-db-consumers.ts`.
Kjør:

```bash
grep -rl "from ['\"].*/db['\"]" server/ | grep -v "\.test\.\|database-config\|/db\.ts$" | sort > /tmp/db-consumers.txt
npx tsx scripts/audit-db-consumers.ts /tmp/db-consumers.txt
```

Med AsyncLocalStorage-proxyen (Task 8) trenger de FLESTE filene under INGEN
kodeendring — klassifiseringen avgjør kun om filen FORVENTES å kjøre inni
eller utenfor `withVendorScopedDb` sin ALS-kontekst, og om det stemmer.

## LES DETTE FØRST: `db` er proxyet, `pool` er det IKKE

`server/db.ts` eksporterer tre ting:

| Eksport | Hva den er | RLS |
|---|---|---|
| `db` | Proxy → request-scopet drizzle (`tidum_app`) når ALS-kontekst finnes, ellers `systemDb` | Håndheves i request-kontekst |
| `dbPool` | Proxy → request-scopet `PoolClient` når ALS-kontekst finnes | Håndheves i request-kontekst — **null konsumenter i dag** |
| `pool` | `systemPool` **uendret, uten proxy** — alltid `tidum_system` (BYPASSRLS) | Håndheves ALDRI |

Dette er bevisst fra Task 8 ("`pool`: re-exported unchanged … these stay on
`tidum_system` until Task 9's classification pass moves them"), men det betyr
at **24 av de 59 filene importerer `pool` og dermed omgår RLS fullstendig** —
uavhengig av om `FORCE ROW LEVEL SECURITY` slås på i Task 10. `FORCE` påvirker
kun tabelleieren; `tidum_system` har `BYPASSRLS` og berøres ikke av noen av
delene.

Konsekvens for Task 10: å slå på `FORCE` gir ekte vendor-isolasjon for
`db`-baserte spørringer, men de rå `pool.query`-spørringene under (§ "Rå
pool.query mot RLS-dekkede tabeller") er fortsatt ufiltrerte. Det er ingen
regresjon (det er dagens tilstand), men det må ikke fremstilles som «RLS
dekker hele applikasjonen» i anbudsdokumentasjon før disse er migrert til
`dbPool`.

## Kategorier

- **(a)** pre-auth / auth-infrastruktur — kjører før `req.user` finnes, må ha
  `tidum_system`.
- **(b)** bakgrunnsjobb / oppstart (cron, seed, migrasjon) — kjører aldri i
  request-kontekst.
- **(c)** ingen vendor-scopet tabell — RLS er irrelevant for filen.
- **(d)** ekte forretningslogikk mot vendor-scopet tabell via `db` — blir
  automatisk RLS-håndhevet, ingen kodeendring.
- **(d!)** forretningslogikk mot vendor-scopet tabell, men via rå `pool` —
  **RLS gir ingen beskyttelse**. Ingen kodeendring i denne oppgaven; se
  gjenstående arbeid nederst.

De 26 vendor-scopede tabellene med policy er de i
`migrations/052_rls_roles_and_policies.sql` (22 i løkken + `users`,
`admin_users`, `access_requests`, `report_templates`).

## Klassifisering

| Fil | Kat. | Tilkobling | Begrunnelse |
|---|---|---|---|
| `server/api-middleware.ts` | (a) | `db` | API-nøkkel-autentisering: slår opp `api_keys` på nøkkelhash før noen bruker er etablert. API-nøkkel-requests har aldri sesjon, og `resolveBearerUser` avviser nøkkelen som JWT, så `req.user` forblir usatt → `tidum_system`. Skriver `api_usage_log` i samme kontekst. |
| `server/crawler-engine.ts` | (c) | `pool` | Kun `crawler_jobs`/`crawler_results` (SEO-crawler). Jobben fortsetter å kjøre etter at responsen er sendt — MÅ bli på rå `pool`, den ALS-scopede transaksjonen commit-es på `res.finish`. |
| `server/custom-auth.ts` | (a) | `db` | `resolveAuthorizedUserByEmail` slår opp `users`/`admin_users` på e-post ved innlogging. Se advarsel om re-innlogging under. |
| `server/eid-auth.ts` | (a) | `db` | BankID-innlogging/-kobling. `resolveUserByEidIdentity` er nå eksplisitt kjørt via `requestDbStorage.exit()` — se "Kjente, bevisste unntak". |
| `server/lib/arbeidstidsloven.ts` | (d!) | `pool` | `SELECT … FROM log_row WHERE user_id = $1` (SQL bygget i en variabel — usynlig for et naivt tabellnavn-søk i selve `pool.query(`-kallet). Kalles fra autentiserte timeregistreringsruter. |
| `server/lib/default-blog-seed.ts` | (b) | `pool` | Idempotent seed av `cms_categories`/`cms_posts` ved oppstart. |
| `server/lib/email-template-renderer.ts` | (c) | `db` | `email_templates`, ikke vendor-scopet. |
| `server/lib/gdpr.ts` | (d!) | `pool` + `db` | Sletter/eksporterer persondata; rå `pool.query` mot `users` og `log_row`. |
| `server/lib/log-row-audit.ts` | (c) | `pool` | **Manuelt lest.** Skriver kun til `log_row_audit` — en lat opprettet tabell UTEN `vendor_id`, ikke i policy-listen. (Planen antok `company_audit_log`/`rapport_audit_log`; det stemmer ikke — se funn under.) |
| `server/lib/mobile-auth.ts` | (a) | `db` | `mobile_refresh_tokens`, token-utstedelse før bruker er etablert. |
| `server/lib/poweroffice-mappings.ts` | (c) | `pool` | **Manuelt lest.** `poweroffice_employee_mappings` — lat opprettet tabell som HAR `vendor_id`, men som ikke er dekket av migrasjon 052. Se funn under. |
| `server/lib/poweroffice-push.ts` | (d!) | `pool` + `db` | Rå `pool.query` mot `log_row` og `timesheet_submissions`; `vendor_integrations` via `db`. |
| `server/lib/poweroffice-visibility.ts` | (c) | `db` | Kun feature-flagg/oppsett. |
| `server/lib/pricing-service.ts` | (c) | `db` | `pricing_tiers`/`pricing_inclusions`, globale. |
| `server/lib/run-startup-migrations.ts` | (b) | `pool` | Kjører DDL ved oppstart. Må ha `tidum_system`. |
| `server/lib/seat-overrun.ts` | (d) | `db` | `company_users`, `vendor_seat_log`, `access_requests`. |
| `server/lib/stripe-service.ts` | (d) | `db` | `access_requests` (lead/abonnement). |
| `server/lib/tier-bump.ts` | (d) | `db` | `imports`, `access_requests`. |
| `server/lib/timesheet-lock.ts` | (d!) | `pool` | **Manuelt lest.** `SELECT status FROM timesheet_submissions WHERE user_id = $1 AND month = $2` via rå `pool`. Ekte vendor-scopet lesing, men på `tidum_system`. |
| `server/lib/totp.ts` | (c) | `db` | `admin_totp_credentials`, ikke i policy-listen. |
| `server/lib/travel-legs.ts` | (c) | `pool` | **Manuelt lest.** Kun `travel_legs` (egen tabell, ikke policy-dekket). `saker`/`log_row`-treffene i førstepasset kom fra kommentarer/`db`-kall, ikke fra `pool.query`. |
| `server/middleware/vendor-scoped-db.ts` | (b) | egen `appPool` | Selve mekanismen: åpner `tidum_app`-transaksjonen og setter `app.vendor_id`/`app.is_super_admin`. |
| `server/replit_integrations/auth/storage.ts` | (a) | `db` | Sesjons-/brukeroppslag i auth-laget. |
| `server/routes.ts` | (d) + (d!) | `db` + `pool` | Hovedrutefilen. `db`-delen RLS-håndheves. Rå `pool.query` treffer `users`, `admin_users`, `company_users`, `saker`, `case_reports`, `integration_interest_primary`, `integration_interest_signals`. |
| `server/routes/analytics-routes.ts` | (d!) | `pool` | **Manuelt lest.** Alle endepunkter er `requireSuperAdmin` og aggregerer `access_requests`/`revenue_events` på tvers av ALLE vendorer med vilje (salgs-/CRM-analyse). Trenger IKKE `.exit()`: policyen slipper `app.is_super_admin = 'true'` gjennom, og filen kjører uansett på `tidum_system`. |
| `server/routes/avvik-routes.ts` | (d) | `db` | `rapport_avvik`, `saker`, `users`. |
| `server/routes/dashboard-kpis-routes.ts` | (d) | `db` | `log_row`, `saker`. |
| `server/routes/email-composer-routes.ts` | (d) | `db` + `pool` | `log_row`/`users` via `db`; rå `pool` kun mot `email_drafts` (ikke policy-dekket). |
| `server/routes/employee-import-routes.ts` | (d) | `db` + `pool` | `company_users`, `imports`, `access_requests` via `db`; rå `pool` treffer ingen policy-dekket tabell. |
| `server/routes/export-routes.ts` | (d) | `db` | `log_row`. |
| `server/routes/forward-routes.ts` | (d) | `db` + `pool` | `log_row`/`users` via `db`; rå `pool` kun mot `forward_log`. |
| `server/routes/gdpr-routes.ts` | (d) | `db` | `log_row`, `users`. |
| `server/routes/institutions-routes.ts` | (d) | `db` | `vendor_institutions`, `saker`, `users`. |
| `server/routes/invite-link-routes.ts` | (d) | `db` | `vendor_invite_links`, `saker`, `users`. **Tvers-vendor-risiko ved innløsing — se advarsel under.** |
| `server/routes/invoice-routes.ts` | (d) | `db` | `log_row`. |
| `server/routes/leave-attachments-routes.ts` | (c) | `pool` | **Manuelt lest.** `leave_attachments` (lat opprettet) og `leave_requests` — ingen av dem har `vendor_id` eller policy. Tilgangskontroll er ren applikasjonslogikk (eier eller admin/tiltaksleder). |
| `server/routes/leave-rollover-cron.ts` | (b) | `db` | Nattlig rullering av feriesaldo. |
| `server/routes/leave-routes.ts` | (c) | `db` | `leave_requests`/`leave_types`/`leave_balances`, ingen `vendor_id`. |
| `server/routes/notification-routes.ts` | (d!) | `pool` | Rå `pool.query` mot `users`. |
| `server/routes/overtime-routes.ts` | (d) | `db` | `log_row`, `overtime_entries`. |
| `server/routes/payroll-export-routes.ts` | (d) | `db` | `log_row`, `users`. |
| `server/routes/poweroffice-routes.ts` | (d) | `db` | `vendor_integrations`, `users`. |
| `server/routes/pricing-routes.ts` | (d!) | `db` + `pool` | Rå `pool.query` mot `access_requests`. |
| `server/routes/rapport-reminder-cron.ts` | (b) | `db` | Cron; leser `saker`/`users`/`vendor_institutions` på tvers av vendorer med vilje. |
| `server/routes/rapport-template-routes.ts` | (d) | `db` | `rapport_templates`. |
| `server/routes/recurring-routes.ts` | (d) | `db` | `log_row`, `recurring_entries`. |
| `server/routes/stripe-routes.ts` | (d!) | `db` + `pool` | Rå `pool.query` mot `access_requests`. Webhook-ruten har uansett ingen `req.user` → `tidum_system`. |
| `server/routes/tester-feedback-routes.ts` | (c) | `db` | `tester_feedback`, ikke vendor-scopet. |
| `server/routes/tiltaksleder-dashboard-routes.ts` | (d) | `db` | `saker`, `users`, `rapport_templates`, `vendor_institutions`. |
| `server/routes/tiltaksleder-rates-routes.ts` | (d!) | `pool` | Rå `pool.query` mot `saker` og `company_users`. |
| `server/routes/timesheet-reminder-cron.ts` | (b) | `db` + `pool` | Cron mot `timesheet_submissions`/`users` på tvers av vendorer med vilje. |
| `server/routes/totp-routes.ts` | (c) | `db` | `admin_totp_credentials`. |
| `server/sakerRapportRoutes.ts` | (d) | `db` | `saker`, `log_row`, `rapport_templates`, `vendor_templates`, `vendor_institutions`, `users`. |
| `server/seed/rapport-templates.ts` | (b) | `db` | Seed av standardmaler. |
| `server/seo-middleware.ts` | (c) | `pool` | `seo_pages`, `seo_global_settings`, `cms_posts`, `builder_pages` — offentlig innhold. |
| `server/smartTimingRoutes.ts` | (d!) | `pool` | **Størst eksponering.** Rå `pool.query` mot 13 policy-dekkede tabeller: `companies`, `company_users`, `project_info`, `log_row`, `case_reports`, `feedback_requests`, `feedback_responses`, `timesheet_submissions`, `users`, `admin_users`, `access_requests`, `report_templates`, `vendor_integrations`. |
| `server/storage.ts` | (d) | `db` + `pool` | `company_users`, `log_row`, `users` via `db`; rå `pool` kun mot `company_audit_log`. |
| `server/userStateRoutes.ts` | (c) | `db` | `user_settings`, `user_drafts`, `user_task_prefs`. |
| `server/vendor-api.ts` | (d) | `db` | Offentlig vendor-API: `company_users`, `project_info`, `log_row`, `api_keys`, `api_usage_log`, `case_reports`, `users`. |

Oppsummert: (a) 5 · (b) 8 · (c) 14 · (d) 20 · (d!) 12.

## Filer som krevde manuell gjennomgang

Førstepasset flagget 10 filer «MANUELL GJENNOMGANG PÅKREVD». Alle er lest i
sin helhet:

| Fil | Konklusjon |
|---|---|
| `server/crawler-engine.ts` | (c). Kun `crawler_jobs`/`crawler_results`. Merk: crawlen fortsetter etter respons — må bli på rå `pool`. |
| `server/lib/arbeidstidsloven.ts` | **(d!)**. SQL-strengen bygges i en variabel før `pool.query(sql, params)`, så tabellnavnet `log_row` står ikke i selve kallet. Dette er nøyaktig mønsteret planen advarte mot. |
| `server/lib/default-blog-seed.ts` | (b)/(c). Idempotent CMS-seed. |
| `server/lib/log-row-audit.ts` | (c). Skriver kun `log_row_audit` (ingen `vendor_id`). Planens antakelse om `company_audit_log`/`rapport_audit_log` var feil. |
| `server/lib/poweroffice-mappings.ts` | (c) i dag, men tabellen HAR `vendor_id` → gap, se under. |
| `server/lib/run-startup-migrations.ts` | (b). DDL ved oppstart. |
| `server/lib/timesheet-lock.ts` | **(d!)**. Rå `pool.query` mot `timesheet_submissions`. |
| `server/middleware/vendor-scoped-db.ts` | (b)/infrastruktur. Selve RLS-mekanismen. |
| `server/routes/analytics-routes.ts` | (d!) men bevisst global; `requireSuperAdmin` + `app.is_super_admin`-grenen i policyen dekker den. Ingen `.exit()` nødvendig. |
| `server/routes/leave-attachments-routes.ts` | (c). `leave_attachments`/`leave_requests` har ingen `vendor_id`. |

## Kjente, bevisste unntak (krevde faktisk kodeendring)

### `server/eid-auth.ts` — `resolveUserByEidIdentity` via `requestDbStorage.exit()`

Planens steg 4 beskriver et kall til `findConflictingEidUser(ssnHash, currentUser.id)`
i lenke-grenen. **Den funksjonen finnes ikke på denne branchen** — den kom fra
Buypass-planen, og `server/buypass-auth.ts` er ikke merget hit ennå
(`git log --oneline -- server/buypass-auth.ts` er tom). Lenke-grenen her
oppdager i stedet en konflikt via unikhetsindeksen
`eid_identities_ssn_provider_key` (migrasjon 050) og fanger `23505`.
Det er RLS-immunt i seg selv: unikhetsindekser håndheves på tvers av rader
kalleren ikke kan SE, og `eid_identities` er dessuten ikke policy-dekket.

Den reelle tvers-vendor-spørringen i denne filen er
`resolveUserByEidIdentity(ssnHash)` — «hvilken bruker eier denne fnr-hashen».
Den er per definisjon vendor-agnostisk (identiteten avgjør hvem som logger
inn, så vi kan ikke vite vendoren først), og den leser `users`, som ER
policy-dekket. Normalt kjører den uten ALS-kontekst, men ikke alltid: en
mobil-request med gyldig Bearer-token får `req.user` satt av
`resolveBearerUser` (`server/custom-auth.ts:378`) FØR `withVendorScopedDb`
(`:379`), så BankID-innlogging fra en app som allerede er innlogget kjører
inni en RLS-scopet transaksjon mot den forrige brukerens vendor. Med `FORCE`
ville en ekte kobling i en annen vendor da se ut som «ingen kobling» →
feilaktig `eid_not_linked`.

Fiksen wrapper hele funksjonskroppen (dekker begge kallstedene: web-callback
og mobil-callback) i `requestDbStorage.exit()`. Testet i
`client/src/test/server/eid-auth-rls-exemption.test.ts`, som verifiserer at
konteksten er tom gjennom HELE den asynkrone kjeden inne i `exit()` — ikke
bare det første synkrone steget — og at den gjenopprettes etterpå.

Samme fiks må gjøres i `server/buypass-auth.ts` når den branchen merges.

## Gjenstående funn og risiko for Task 10

### 1. Rå `pool.query` mot RLS-dekkede tabeller (12 filer)

Disse kjører på `tidum_system` (BYPASSRLS) og påvirkes ikke av `FORCE`:

`server/smartTimingRoutes.ts` (13 tabeller), `server/routes.ts` (7),
`server/lib/gdpr.ts`, `server/lib/poweroffice-push.ts`,
`server/lib/arbeidstidsloven.ts`, `server/lib/timesheet-lock.ts`,
`server/routes/tiltaksleder-rates-routes.ts`,
`server/routes/notification-routes.ts`, `server/routes/pricing-routes.ts`,
`server/routes/stripe-routes.ts`, `server/routes/analytics-routes.ts`
(bevisst global), `server/routes/timesheet-reminder-cron.ts` (cron, forventet).

Ingen regresjon — dette er dagens tilstand — men RLS-dekningen er delvis
inntil de bytter `pool` → `dbPool`.

### 2. Tvers-vendor-mønstre som `FORCE` kan brekke funksjonelt

Begge feiler lukket (nekter tilgang), ikke åpent, men de er reelle
funksjonsbrudd som bør verifiseres før/ved Task 10. Ingen av dem er endret i
denne oppgaven (utenfor Task 9s filomfang).

- **`server/routes/invite-link-routes.ts` — innløsing av invitasjonslenke.**
  `/api/invite/:token` og `/api/invite/:token/accept` krever ikke `requireAuth`,
  men en allerede innlogget bruker (vendor A) som innløser en lenke til vendor
  B kjører med ALS-kontekst satt til vendor A. Oppslaget mot
  `vendor_invite_links` ville da bli filtrert bort (404), og
  `INSERT`/`UPDATE` av `users` med `vendorId: link.vendorId` ville brytes av
  policyens `WITH CHECK` (policyer uten eksplisitt `WITH CHECK` bruker
  `USING`-uttrykket også for skriving). Koden håndterer eksplisitt
  vendorbytte (`existing.vendorId !== link.vendorId`), så mønsteret er
  tilsiktet. Trenger `requestDbStorage.exit()` rundt token-oppslaget og
  bruker-opprettelsen/-oppdateringen.
- **`server/custom-auth.ts` — re-innlogging med aktiv sesjon.**
  `app.use(withVendorScopedDb)` står på linje 379, FØR alle innloggingsruter
  (Google-callback linje 457, e-postverifisering linje 572). Innlogging som en
  konto i en annen vendor mens man er innlogget gir ALS-kontekst fra den
  GAMLE brukeren, og `resolveAuthorizedUserByEmail`s oppslag mot
  `users`/`admin_users` på e-post ville bli filtrert til gammel vendor →
  innlogging feiler. `db.update(users).set({ vendorId: … })` og
  `db.insert(users)` med en annen `vendorId` ville i tillegg brytes av
  `WITH CHECK`. Samme fiks (`.exit()`) gjelder. `super_admin` er upåvirket
  (`app.is_super_admin = 'true'`).

### 3. Vendor-scopede tabeller uten policy

- `poweroffice_employee_mappings` (`server/lib/poweroffice-mappings.ts`) har
  `vendor_id NOT NULL` og er ekte vendor-data, men mangler policy i migrasjon
  052. Opprettes lat ved kjøretid, så en `GRANT … ON ALL TABLES` fra 052
  dekker den ikke automatisk.
- `eid_identities` og `auth_login_events` (migrasjon 050) har ingen
  `vendor_id` og er derfor ikke policy-kandidater, men inneholder
  identitetsdata som i dag er lesbar på tvers for enhver rolle.

`company_audit_log` og `rapport_audit_log`, som planen ba om å sjekke, har
**ingen `vendor_id`** (kun `company_id` hhv. `rapport_id`) og kan ikke få den
generiske `vendor_isolation`-policyen uten en subquery. `log_row_audit`,
`leave_attachments` og `travel_legs` er i samme kategori. Ingen endring i
migrasjon 052 er gjort i denne oppgaven.

### 4. Lat opprettede tabeller vs. `tidum_app`-privilegier

`log-row-audit.ts`, `poweroffice-mappings.ts` og `leave-attachments-routes.ts`
kjører `CREATE TABLE IF NOT EXISTS` ved kjøretid. Migrasjon 052 gir
`tidum_app` kun `USAGE` på schema `public` (ikke `CREATE`), og
`GRANT … ON ALL TABLES` dekker bare tabeller som fantes da migrasjonen kjørte.
Alle tre bruker rå `pool` (`tidum_system`) i dag, så det går bra — men de kan
ikke migreres til `dbPool` uten enten en `ALTER DEFAULT PRIVILEGES` eller at
tabellene flyttes inn i en ordinær migrasjonsfil.
