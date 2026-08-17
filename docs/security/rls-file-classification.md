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

## LES DETTE FØRST: alle tre eksportene fra `server/db.ts` er ALS-bevisste

| Eksport | Hva den er | RLS |
|---|---|---|
| `db` | Proxy → request-scopet drizzle (`tidum_app`) når ALS-kontekst finnes, ellers `systemDb` | Håndheves i request-kontekst |
| `pool` | Proxy → request-scopet `PoolClient` når ALS-kontekst finnes, ellers `systemPool` | Håndheves i request-kontekst |
| `dbPool` | Alias for `pool` — **samme proxy-objekt** | Som `pool` |

Fram til fix-runde 1 i Task 9 var `pool` eksportert som `systemPool` UTEN
proxy (`export { systemPool as pool }`). Alle 24 rå-SQL-forbrukere importerer
`pool`, ikke `dbPool`, så de kjørte i praksis på `tidum_system` (BYPASSRLS) og
RLS hadde ingen effekt for dem — uavhengig av `FORCE`, siden `FORCE` kun
binder tabelleieren og `tidum_system` har `BYPASSRLS`. Det er rettet: `pool`
er nå den samme proxyen som `dbPool`, og alle 24 filene ble RLS-bevisste uten
kodeendring i seg selv, slik designet opprinnelig var ment.

`(d!)`-radene under er derfor historikk, ikke en gjenstående mangel — de er
merket for å vise hvilke filer som gikk fra ufiltrerte til RLS-håndhevede i
fix-runde 1, og hvilke som derfor bør røykes ekstra godt ved første kjøring
mot en ekte `tidum_app`-tilkobling.

### `pool.connect()` er savepoint-oversatt

`pool.connect()` inne i en request kan ikke bare videresendes til
request-clienten: den er allerede tilkoblet, middlewaren eier `release()`, og
et rått `BEGIN`/`COMMIT` ville avsluttet middlewarens ytre transaksjon midt i
requesten og lydløst droppet `set_config`-verdiene (transaksjonslokale) for
resten av den. Proxyen oversetter derfor `BEGIN`/`COMMIT`/`ROLLBACK` til
`SAVEPOINT`/`RELEASE SAVEPOINT`/`ROLLBACK TO SAVEPOINT` og gjør `release()` til
en no-op — nøyaktig samme grep som `withSavepointTransaction` i
`server/middleware/vendor-scoped-db.ts` gjør for drizzles `db.transaction()`.
Eneste kallsteder i dag: `server/routes/employee-import-routes.ts` (to ruter,
begge med `BEGIN … COMMIT/ROLLBACK` + `client.release()`), som dermed ikke
trengte kodeendring.

## Kategorier

- **(a)** pre-auth / auth-infrastruktur — kjører før `req.user` finnes, må ha
  `tidum_system`.
- **(b)** bakgrunnsjobb / oppstart (cron, seed, migrasjon) — kjører aldri i
  request-kontekst.
- **(c)** ingen vendor-scopet tabell — RLS er irrelevant for filen.
- **(d)** ekte forretningslogikk mot vendor-scopet tabell via `db` — blir
  automatisk RLS-håndhevet, ingen kodeendring.
- **(d!)** forretningslogikk mot vendor-scopet tabell via rå `pool`. Var
  ubeskyttet før fix-runde 1; nå RLS-håndhevet på lik linje med (d) fordi
  `pool`-eksporten er gjort ALS-bevisst. Merkingen beholdes fordi disse
  spørringene aldri har kjørt under RLS før og bør verifiseres først.

De 26 vendor-scopede tabellene med policy er de i
`migrations/052_rls_roles_and_policies.sql` (22 i løkken + `users`,
`admin_users`, `access_requests`, `report_templates`).

## Klassifisering

| Fil | Kat. | Tilkobling | Begrunnelse |
|---|---|---|---|
| `server/api-middleware.ts` | (a) + unntak | `db` | API-nøkkel-autentisering: slår opp `api_keys` på nøkkelhash før noen vendor er etablert — må kjøre uscopet. Setter `req.vendorId`, ALDRI `req.user`. `logApiUsage` (`res.on("finish")`) er nå eksplisitt unntatt via `requestDbStorage.exit()` — se "Kjente, bevisste unntak". |
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
| `server/routes/analytics-routes.ts` | (d!) | `pool` | **Manuelt lest.** Aggregerer `access_requests`/`revenue_events` på tvers av ALLE vendorer med vilje (salgs-/CRM-analyse). Rutene har fått en ekstra `requirePlatformSuperAdmin`-vakt som krever rollen `super_admin` EKSAKT — se korreksjonen under. |
| `server/routes/avvik-routes.ts` | (d) | `db` | `rapport_avvik`, `saker`, `users`. |
| `server/routes/dashboard-kpis-routes.ts` | (d) | `db` | `log_row`, `saker`. |
| `server/routes/email-composer-routes.ts` | (d) | `db` + `pool` | `log_row`/`users` via `db`; rå `pool` kun mot `email_drafts` (ikke policy-dekket). |
| `server/routes/employee-import-routes.ts` | (d!) | `db` + `pool` | `company_users`, `imports`, `access_requests` via `db`. Bruker i tillegg `pool.connect()` + egen transaksjon på to ruter, med rå `INSERT INTO company_users`, `DELETE FROM company_users` og `UPDATE imports` — begge tabeller er policy-dekket. Krever ingen kodeendring (savepoint-shimmen i `server/db.ts` håndterer transaksjonen), men står på røyktest-listen. |
| `server/routes/export-routes.ts` | (d) | `db` | `log_row`. |
| `server/routes/forward-routes.ts` | (d) | `db` + `pool` | `log_row`/`users` via `db`; rå `pool` kun mot `forward_log`. |
| `server/routes/gdpr-routes.ts` | (d) | `db` | `log_row`, `users`. |
| `server/routes/institutions-routes.ts` | (d) | `db` | `vendor_institutions`, `saker`, `users`. |
| `server/routes/invite-link-routes.ts` | (d) | `db` | `vendor_invite_links`, `saker`, `users`. **Tvers-vendor-risiko ved innløsing — se advarsel under.** |
| `server/routes/invoice-routes.ts` | (d) | `db` | `log_row`. |
| `server/routes/leave-attachments-routes.ts` | (c) | `pool` | **Manuelt lest.** `leave_attachments` (lat opprettet) og `leave_requests` — ingen av dem har `vendor_id` eller policy. Tilgangskontroll er ren applikasjonslogikk (eier eller admin/tiltaksleder). |
| `server/routes/leave-rollover-cron.ts` | (b) + unntak | `db` | Nattlig rullering av feriesaldo på tvers av alle vendorer. Registrerer OGSÅ `POST /api/leave/rollover/run` (`requireAuth`), så batch-jobben kan kjøre i request-kontekst — `runLeaveRollover` er derfor unntatt via `requestDbStorage.exit()`. |
| `server/routes/leave-routes.ts` | (c) | `db` | `leave_requests`/`leave_types`/`leave_balances`, ingen `vendor_id`. |
| `server/routes/notification-routes.ts` | (d!) | `pool` | Rå `pool.query` mot `users`. |
| `server/routes/overtime-routes.ts` | (d) | `db` | `log_row`, `overtime_entries`. |
| `server/routes/payroll-export-routes.ts` | (d) | `db` | `log_row`, `users`. |
| `server/routes/poweroffice-routes.ts` | (d) | `db` | `vendor_integrations`, `users`. |
| `server/routes/pricing-routes.ts` | (d!) | `db` + `pool` | Rå `pool.query` mot `access_requests`. |
| `server/routes/rapport-reminder-cron.ts` | (b) + unntak | `db` | Leser `saker`/`users`/`vendor_institutions` på tvers av alle vendorer med vilje. Registrerer OGSÅ `POST /api/rapport-reminders/run` (`requireAuth`) — `runRapportReminders` er unntatt via `requestDbStorage.exit()`. |
| `server/routes/rapport-template-routes.ts` | (d) | `db` | `rapport_templates`. |
| `server/routes/recurring-routes.ts` | (d) + unntak | `db` | `log_row`, `recurring_entries`. `generateRecurringEntries` er en tvers-vendor-batch når den kalles uten `userIdFilter` — unntatt via `requestDbStorage.exit()`, se under. |
| `server/routes/stripe-routes.ts` | (d!) | `db` + `pool` | Rå `pool.query` mot `access_requests`. Webhook-ruten har uansett ingen `req.user` → `tidum_system`. |
| `server/routes/tester-feedback-routes.ts` | (c) | `db` | `tester_feedback`, ikke vendor-scopet. |
| `server/routes/tiltaksleder-dashboard-routes.ts` | (d) | `db` | `saker`, `users`, `rapport_templates`, `vendor_institutions`. |
| `server/routes/tiltaksleder-rates-routes.ts` | (d!) | `pool` | Rå `pool.query` mot `saker` og `company_users`. |
| `server/routes/timesheet-reminder-cron.ts` | (b) + unntak | `db` + `pool` | Batch mot `timesheet_submissions`/`users` på tvers av alle vendorer. Registrerer OGSÅ `POST /api/timesheet-reminders/run` og `PATCH /api/vendor/timesheet-deadline` (begge `requireAuth`) — `runTimesheetReminders` er unntatt via `requestDbStorage.exit()`. Deadline-ruten er IKKE unntatt: den er ordinær, vendor-scopet forretningslogikk. |
| `server/routes/totp-routes.ts` | (c) | `db` | `admin_totp_credentials`. |
| `server/sakerRapportRoutes.ts` | (d) | `db` | `saker`, `log_row`, `rapport_templates`, `vendor_templates`, `vendor_institutions`, `users`. |
| `server/seed/rapport-templates.ts` | (b) | `db` | Seed av standardmaler. |
| `server/seo-middleware.ts` | (c) | `pool` | `seo_pages`, `seo_global_settings`, `cms_posts`, `builder_pages` — offentlig innhold. |
| `server/smartTimingRoutes.ts` | (d!) | `pool` | **Størst eksponering.** Rå `pool.query` mot 13 policy-dekkede tabeller: `companies`, `company_users`, `project_info`, `log_row`, `case_reports`, `feedback_requests`, `feedback_responses`, `timesheet_submissions`, `users`, `admin_users`, `access_requests`, `report_templates`, `vendor_integrations`. |
| `server/storage.ts` | (d) | `db` + `pool` | `company_users`, `log_row`, `users` via `db`; rå `pool` kun mot `company_audit_log`. |
| `server/userStateRoutes.ts` | (c) | `db` | `user_settings`, `user_drafts`, `user_task_prefs`. |
| `server/vendor-api.ts` | (d) | `db` | Offentlig vendor-API (`/api/v1/vendor/*`, API-nøkkel): `company_users`, `project_info`, `log_row`, `api_keys`, `api_usage_log`, `case_reports`, `users`. **Fikk aldri ALS-kontekst før fix-runde 2** — `apiKeyAuth` setter `req.vendorId`, ikke `req.user`, så `withVendorScopedDb` hoppet over disse. Nå har alle 8 API-nøkkel-rutene `withApiKeyScopedDb` montert rett etter `apiKeyAuth`. `/health` (uten `apiKeyAuth`) er bevisst ikke scopet. |

Oppsummert, 59 filer: (a) 5 · (b) 7 (hvorav 3 med dokumentert tvers-vendor-unntak)
· (c) 14 · (d) 21 · (d!) 11 · 1 som er begge deler (`server/routes.ts`, som
bruker både `db` og rå `pool` mot policy-dekkede tabeller).

Sluttreviewen av branchen la til to unntak til, utenfor cron-kategorien:
`server/routes/recurring-routes.ts` (fjerde batch-jobb) og
`server/api-middleware.ts` (`logApiUsage`). Begge er dokumentert under
"Kjente, bevisste unntak".

## Filer som krevde manuell gjennomgang

Førstepasset i `scripts/audit-db-consumers.ts` flagget 10 filer for
manuell-gjennomgang. Alle 10 er lest i sin helhet og avklart — det står **null
uavklarte flagg igjen** i denne tabellen, som er forutsetningen Task 10s
gate-sjekk verifiserer. (Selve flagg-strengen skrives kun av skriptet; den
gjentas bevisst ikke i denne prosaen, slik at Task 10s `grep` kun treffer
eventuelle GJENVÆRENDE flagg.)

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
| `server/routes/analytics-routes.ts` | (d!) men bevisst global. Se korreksjonen under "Kjente, bevisste unntak" — den opprinnelige begrunnelsen («filen kjører uansett på `tidum_system`») var feil etter Task 9s fix-runde 1. |
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

### `server/routes/invite-link-routes.ts` — innløsing av invitasjonslenke

`GET /api/invite/:token` og `POST /api/invite/:token/accept` er tvers-vendor by
design: en invitasjon knytter en bruker til en ANNEN vendor enn den de
eventuelt allerede tilhører (koden håndterer eksplisitt vendorbytte,
`existing.vendorId !== link.vendorId`). Rutene krever ikke `requireAuth`, men
en allerede innlogget vendor-A-bruker som løser inn en vendor-B-lenke kjører
inni ALS-konteksten for vendor A: oppslaget mot `vendor_invite_links` ville
blitt filtrert bort (404), og `insert`/`update` av `users` med vendor B ville
blitt avvist av policyens implisitte `WITH CHECK`.

Hele handleren er unntatt, ikke ett enkelt kall — både lesingen (lenken,
brukeren, `saker`) og skrivingen (bruker-tilknytning, `used_count`) er
tvers-vendor. Grensen er en liten `crossVendor()`-wrapper rundt de to
offentlige rutene; admin-rutene (`/api/company/invite-links*`) er IKKE unntatt
— de er ordinær, vendor-scopet forretningslogikk. Autorisasjonen ligger i
selve token-hemmeligheten (24 tilfeldige bytes) pluss domene-, utløps- og
bruksbegrensningene.

Testet i `client/src/test/server/invite-cross-vendor-exemption.test.ts`, som
kjører de ekte, registrerte handlerne inni en aktiv ALS-kontekst og verifiserer
at spørringen faktisk utføres med tom kontekst.

### `server/custom-auth.ts` — innlogging med aktiv sesjon

`resolveAuthorizedUserByEmail` slår opp «hvilken bruker/admin eier denne
e-postadressen» — selve autentiseringssteget, der vendoren er svaret og ikke et
filter. En FERSK innlogging er upåvirket (`req.user` er usatt når
`withVendorScopedDb` kjører, så ingen kontekst settes), men middlewaren er
montert på linje 380, FØR Google-callbacken (458) og e-postverifiseringen
(573). En allerede innlogget bruker som treffer disse handlerne igjen
(re-autentisering, eller et gammelt magic-link-klikk) ville med FORCE fått
oppslaget for den NYE identiteten scopet til den GAMLE sesjonens vendor →
innlogging feiler. Funksjonen skriver dessuten `users` med en annen `vendorId`,
som ville brutt `WITH CHECK`.

Unntaket er lagt på funksjonen selv (én guard, tre kallsteder: Google via
`findOrCreateUser`, `/api/auth/email/request-link` og `/api/auth/email/verify`),
ikke på hvert kallsted.

### Tre batch-jobber som også er nåbare fra autentiserte ruter

`runRapportReminders`, `runTimesheetReminders` og `runLeaveRollover` skanner
ALLE vendorer med vilje. De kjører normalt fra cron (ingen ALS-kontekst), men
hver av dem har også en manuell trigger-rute bak `requireAuth`
(`POST /api/rapport-reminders/run`, `POST /api/timesheet-reminders/run`,
`POST /api/leave/rollover/run`). Uten unntak ville en admin som trigger dem
manuelt stille fått behandlet KUN sin egen vendor, uten feilmelding — en
lukket, men usynlig feil. Guarden ligger på selve batch-funksjonen, slik at den
dekker begge kallveiene.

`PATCH /api/vendor/timesheet-deadline` i samme fil er bevisst IKKE unntatt —
den er ordinær, vendor-scopet forretningslogikk.

### En fjerde batch-jobb: `generateRecurringEntries` (recurring-routes.ts)

Funnet i sluttreviewen av branchen. Strukturelt identisk med de tre over, men
oversett fordi cron-triggeren ligger INNE i rutefilen (`setupRecurringEntriesCron`
i `server/routes/recurring-routes.ts`) og ikke i en egen `*-cron.ts`-fil, så
sveipet etter cron-navngitte filer traff den ikke.

`POST /api/recurring/generate` setter `forUserId = null` for alle admin-roller
(`isAdmin(req)` → `ADMIN_ROLES`, altså også `tiltaksleder`/`teamleder`), og
`generateRecurringEntries(null)` skanner da ALLE vendorers `recurring_entries`
og skriver `log_row` for hver av dem. Samme behandling som de tre søsknene:
guarden ligger på batch-funksjonen (`generateRecurringEntries` →
`requestDbStorage.exit(() => generateRecurringEntriesUnscoped(...))`), ikke på
ruten, slik at både cron-veien og den manuelle ruten dekkes.

Merk at unntaket er ubetinget, også når `userIdFilter` er satt (en vanlig
bruker som genererer for seg selv). Det er bevisst — samme form som søsknene,
ett kodepunkt å resonnere om — og ufarlig, siden spørringen da uansett er
filtrert på `user_id`.

### `server/api-middleware.ts` — `logApiUsage` i `res.on("finish")`

**Korreksjon av tidligere begrunnelse.** Denne tabellraden sa før at loggingen
var trygg fordi lytteren «registreres før scopingen». Det stemmer ikke:
rekkefølgen lytteren REGISTRERES i er irrelevant. `finish` fyrer synkront inne
i `res.end()`, altså INNE i den ALS-scopede konteksten — men ETTER at
request-middlewarens egen `COMMIT` allerede har kjørt. INSERT-en havnet dermed
på requestens `tidum_app`-client i autocommit, med den transaksjonslokale
`app.vendor_id` tilbakestilt (til tom streng, ikke NULL — se migrasjon 056).
Resultatet var enten en hard SQL-feil (`invalid input syntax for type integer:
""`) eller null rader skrevet under FORCE — i begge tilfeller svelget av
`try/catch`-en i `logApiUsage`, altså et STILLE, totalt tap av API-bruksloggen.

Fikset ved å kjøre selve skrivingen via `requestDbStorage.exit()`, samme
mønster som `eid-auth.ts`, `invite-link-routes.ts` og de tre cron-unntakene.
Det gjør den opprinnelig uttalte intensjonen — «loggen skal skrives selv om
requestens transaksjon rulles tilbake» — faktisk sann.

### `server/routes/analytics-routes.ts` — korreksjon, og innstramming i stedet for unntak

**Den tidligere begrunnelsen var faktisk feil.** Den sa at filen «kjører uansett
på `tidum_system`». Det var sant før Task 9s fix-runde 1, men ikke etterpå:
`pool`-eksporten i `server/db.ts` er nå den ALS-bevisste proxyen, så filen
kjører på `tidum_app` inne i en autentisert request.

Den gjenværende avhengigheten var altså `app.is_super_admin = 'true'`-grenen i
policyen. Men `server/middleware/vendor-scoped-db.ts` setter
`isSuperAdmin: user.role === "super_admin"` (eksakt match), mens
`requireSuperAdmin`/`isSuperAdminLikeRole` i `shared/roles.ts` slipper inn BÅDE
`super_admin` OG `hovedadmin`. En `hovedadmin` kom altså gjennom autorisasjonen,
men ble stille vendor-scopet i RLS-konteksten — og fikk dermed feil
(vendor-filtrerte) tall ut av en plattformomspennende salgsrapport.

Valget er å STRAMME INN ruten, ikke utvide RLS-scopet: `hovedadmin` er en
per-vendor-rolle (opprettes ved godkjenning av en tilgangsforespørsel), og
plattformomspennende salgs-/omsetningstall skal uansett ikke være synlige for
den. Alle ni endepunktene har fått en ekstra `requirePlatformSuperAdmin`-vakt
som krever rollen `super_admin` eksakt. `hovedadmin` får nå 403 i stedet for
stille feil tall, og de gjenværende kallerne er nøyaktig de som FÅR
`is_super_admin = 'true'` i RLS-konteksten. Ingen `.exit()` er nødvendig.

## Gjenstående funn og risiko for Task 10

### 1. Policyene mangler eksplisitt `WITH CHECK`

Migrasjon 052 definerer policyene med kun `USING`. Postgres gjenbruker da
`USING`-uttrykket som `WITH CHECK` for `INSERT`/`UPDATE`, altså kan ingen rad
skrives med en annen `vendor_id` enn den aktive. Det er riktig for ordinær
forretningslogikk, men det er nettopp derfor invite-innløsning og innlogging
(som med vilje skriver en rad tilhørende en ANNEN vendor) måtte unntas via
`requestDbStorage.exit()`. Task 10 bør bevisst bestemme om `WITH CHECK (true)`
skal legges til for å skille lese- fra skrivehåndheving, eller om
`.exit()`-unntakene er den ønskede modellen (anbefalt — de er få og eksplisitte).

### 2. Vendor-scopede tabeller uten policy

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

### 3. BLOKKERENDE FOR TASK 10: `tidum_app` mangler grants på nyere tabeller

Migrasjon 052 kjører `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN
SCHEMA public TO tidum_app` — et **øyeblikksbilde**. Tabeller som opprettes
etter at 052 har kjørt får ingen grant, og `tidum_app` får `permission denied`
på dem. Før fix-runde 1 var det ufarlig fordi rå `pool` alltid var
`tidum_system`; nå som `pool` er ALS-bevisst gjelder det alle rå-SQL-stier
inne i en autentisert request.

Dette må håndteres FØR Task 10 slår på FORCE (eller egentlig før `tidum_app`
i det hele tatt tas i bruk mot produksjon):

```sql
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO tidum_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO tidum_app;
-- pluss en ny GRANT ... ON ALL TABLES for tabeller som allerede er opprettet
-- etter at 052 kjørte.
```

`ALTER DEFAULT PRIVILEGES` gjelder kun tabeller opprettet av den rollen som
kjører kommandoen, så den må kjøres som samme rolle som migrasjonene bruker.
En lokal Postgres ER tilgjengelig i utviklingsmiljøet og brukes av flere av
testene i denne oppgaven (`vendor-scoped-db.test.ts`, `pool-als-proxy.test.ts`).
Det som IKKE er verifiserbart her, er `tidum_app`-rollens faktiske
RLS-håndhevelse: Task 7s roller og policyer er ikke rullet ut mot noen
database ennå, så både denne GRANT-en og selve policy-oppførselen må
verifiseres mot staging når rollene faktisk finnes.

**LUKKET i migrations/054_force_rls.sql (Task 10, fix-runde 1.)** Den
enkle `ALTER DEFAULT PRIVILEGES IN SCHEMA public ... TO tidum_app` skissert
over (uten `FOR ROLE`) viste seg utilstrekkelig ved formell review: den
dekker kun objekter opprettet av DEN UTFØRENDE rollen, mens `server/db.ts`
kobler `systemPool`/`pool` som `tidum_system` utenfor request-kontekst — så
BÅDE `server/lib/run-startup-migrations.ts`s ordinære migrasjoner OG denne
oppgavens egen DDL-ruting av lat `CREATE TABLE IF NOT EXISTS` kjører faktisk
SOM `tidum_system`, ikke som migrasjonsrollen. 054 bruker derfor
`ALTER DEFAULT PRIVILEGES FOR ROLE tidum_system ...`, pluss
`GRANT CREATE ON SCHEMA public TO tidum_system` (manglet helt — `tidum_system`
kunne i praksis ikke utføre den late DDL-en den er ment å utføre, siden
Postgres 15+ ikke lenger gir `PUBLIC` automatisk `CREATE` på `public`).
Begge reprodusert og verifisert løst mot lokal Postgres med riktig
rolle-simulering (`SET ROLE tidum_system; CREATE TABLE ...`, deretter
`SET ROLE tidum_app`-lesing/skriving) — se migrations/054_force_rls.sql og
`.superpowers/sdd/2026-08-15-g10-sikkerhetsherding/task-10-report.md`.

Relatert, og løst: kodebasen har **~66 lat-opprettende DDL-setninger**
(`CREATE TABLE IF NOT EXISTS` / `ALTER TABLE … ADD COLUMN IF NOT EXISTS`),
fordelt på `server/routes.ts` (24), `server/smartTimingRoutes.ts` (42) og fem
lib-/rutefiler — og de kalles fra vanlige forretningsruter, ikke bare fra
oppsettsruter. `tidum_app` har kun `USAGE`, ikke `CREATE`, på schema `public`,
så alle ville feilet inne i en autentisert request.

Fikset i det ene punktet de alle går gjennom i stedet for på 66 kallsteder:
`pool`-proxyen i `server/db.ts` kjenner igjen DDL (`/^\s*(CREATE|ALTER|DROP)\s/i`)
og ruter den til system-tilkoblingen selv når det finnes en ALS-kontekst.
Setningene er idempotente, så det er også riktig at de ikke rulles tilbake med
requestens transaksjon. Dekker både dagens 66 og alle framtidige.

**Forbehold — dette er dempet, ikke eliminert.** Fordi DDL-en nå kjører på en
ANNEN backend enn requestens egen åpne transaksjon, kan den havne i en
låskonflikt med requesten selv. Konkret eksempel som ligger i koden:
`POST /api/company/users` (`server/smartTimingRoutes.ts`) gjør
`INSERT INTO company_users` på request-clienten (`ROW EXCLUSIVE`) og deretter
`ALTER TABLE company_users ADD COLUMN IF NOT EXISTS institution`
(`ACCESS EXCLUSIVE`). System-tilkoblingen venter på requestens transaksjon,
som ikke kan committe før DDL-kallet returnerer. Postgres oppdager det ikke
som en deadlock — det finnes ingen sirkel i låsegrafen; den ene backenden er
`idle in transaction` og venter på applikasjonen. (`ADD COLUMN IF NOT EXISTS`
tar låsen FØR den sjekker om kolonnen finnes, så dette gjelder også når
kolonnen for lengst er lagt til.)

`systemPool` har derfor `lock_timeout = 3000` (satt i en `connect`-lytter i
`server/db.ts`). Det gjør scenariet til en tydelig feil etter ~3 sekunder —
`canceling statement due to lock timeout` — som kallstedene allerede fanger i
sine `try { … } catch (_) {}`-blokker, i stedet for en request som henger for
alltid. Verifisert mot ekte Postgres i begge retninger.

Den varige løsningen er å flytte den late DDL-en ut av forretningsrutene og
inn i ordinære migrasjonsfiler; da forsvinner både låskonflikten og
CREATE-privilegie-problemet. Det er utenfor Task 9s omfang.
