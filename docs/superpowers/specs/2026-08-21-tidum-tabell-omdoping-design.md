# Tidum-tabell-omdøping — egne navn for alt Tidum eier

## Bakgrunn og mål

Bekreftet gjennom hele denne økten: produksjonsdatabasen er en enorm,
delt Postgres-instans med **~3265 tabeller totalt**, hvorav Tidums egen
kode kun eier en liten brøkdel. Flere reelle navnekollisjoner er allerede
funnet og fikset ad-hoc (`tidum_permissions`/`tidum_roles`/
`tidum_role_permissions`/`tidum_admin_activity_log`/
`tidum_permission_seed_log` — se `.claude/skills/rolle-tilgangssystem/`).
Brukeren bekreftet tidligere denne økten at ALLE Tidums eksisterende
tabeller bør få samme behandling, som en egen, stor migrering — dette er
den migreringen.

**Kjernefunn som formet omfanget** (verifisert mot ekte database, ikke
antatt):

- `users` og `vendors` — de to tabellene Tidums kode bruker mest — er
  **ikke Tidums egne tabeller i det hele tatt**. 242 fremmed-eide foreign
  keys (198 mot `users`, 31 mot `vendors`) fra andre produkters tabeller
  beviser dette. Tidums egen `vendors`-migrasjon
  (`migrations/017_core_tables.sql`) var en stille no-op for årevis siden
  — et annet produkts `vendors`-tabell fantes allerede under det navnet.
  **Disse to tabellene er eksplisitt UTENFOR OMFANG** — brukerens
  beslutning, bekreftet: "La users/vendors være, omdøp resten."
- **126 tabeller** er bekreftet Tidum-eide og trygge å omdøpe: 117 funnet
  via `migrations/*.sql` (`CREATE TABLE`) og `shared/schema.ts`/
  `shared/models/*.ts` (`pgTable(`), pluss 9 funnet i en oppfølgende sweep
  for tabeller opprettet "lat" direkte i TypeScript-kode (samme mønster
  som `server/lib/log-row-audit.ts`s `ensureLogRowAuditTable()`) — disse
  var usynlige for det første søket siden de aldri står i en
  migrasjonsfil eller en `pgTable()`-erklæring.
- Ingen av de 126 har fremmed-eide foreign keys inn i seg (kun én
  selv-forventet FK: `users.role_id REFERENCES tidum_roles(id)`, fra
  fase 1, allerede riktig navngitt).
- **De aller fleste av de 126 har 0 rader i produksjon akkurat nå** og
  svært få kall-steder (1-9 filer) — lav praktisk risiko for de fleste
  enkelttabeller.
- Ingen `CREATE VIEW`/`CREATE FUNCTION`/`CREATE TRIGGER` funnet i
  `migrations/*.sql` som refererer noen av disse tabellene — men gitt at
  9 tabeller allerede var usynlige for et første søk, kan IKKE dette
  garanteres fullstendig (se «Verifiseringsstrategi»).
- Postgres' `ALTER TABLE ... RENAME TO` er ren katalog-metadata — foreign
  keys peker internt på tabell-OID, ikke navnestreng, og oppdateres
  automatisk. Krever en kort `ACCESS EXCLUSIVE`-lås (millisekunder for
  disse lav-trafikk-tabellene).

**Separat, allerede lukket funn fra samme kartlegging:** `npm run db:push`
diffet `shared/schema.ts` (kjenner kun ~115 av 3265 tabeller) mot den
samme levende databasen og kunne anvende ikke-destruktive endringer uten
bekreftelse. Allerede fikset (`--strict`-flagg + advarsel i
`drizzle.config.ts`), committet separat, ikke del av denne spec-en.

## Global Constraints

- `users` og `vendors` røres IKKE — verken omdøpes, endres eller
  migreres. De forblir delt infrastruktur.
- `legacy`-skjemaet røres IKKE — bekreftet inaktivt (appens `search_path`
  treffer kun `public`), ingen praktisk risiko der, ingen praktisk
  gevinst av å røre det.
- Alle 126 tabeller får `tidum_`-prefiks — samme konvensjon som allerede
  etablert (`tidum_permissions` osv.).
- Drizzle TS-eksportnavn (bindingsnavnene, f.eks. `export const users`)
  endres IKKE — kun SQL-nivå-tabellnavnet i `pgTable("gammelt_navn", ...)`
  → `pgTable("tidum_gammelt_navn", ...)`. Samme mønster som
  `shared/models/permissions.ts` allerede etablerte.
- Ingen ny migrasjons-/skjema-mekanisme — bruk eksisterende
  `migrations/*.sql` + `server/lib/run-startup-migrations.ts`-mønsteret.
- All omdøping skjer i ÉN koordinert migrasjon (ikke 126 separate) —
  Postgres-omdøping er billig nok til at dette er trygt i ett steg, og én
  migrasjon er lettere å verifisere fullstendig enn 126.
- Kodeoppdateringen (rå SQL-strenger + `pgTable()`-kall + de 9 lat-init
  `CREATE TABLE IF NOT EXISTS`-setningene) skjer samlet, ikke tabell for
  tabell — men VERIFISERES eksplisitt fullstendig (se under) før den
  regnes som ferdig.

## De 126 tabellene

**117 funnet via migrations/schema.ts:**

```
access_requests, admin_users, aktivitet_maler, analytics_settings, api_keys,
api_usage_log, auth_login_events, blog_comments, builder_pages, case_reports,
cms_activity_log, cms_categories, cms_content_entries,
cms_content_entry_versions, cms_content_fields, cms_content_types, cms_posts,
companies, company_audit_log, company_users, content_versions, crawler_jobs,
crawler_results, crawler_schedules, dashboard_tasks, design_presets,
design_tokens, eid_identities, email_send_history, email_settings,
email_templates, feedback_requests, feedback_responses, form_submissions,
forward_log, import_rows, imports, integration_catalog,
integration_interest_primary, integration_interest_signals,
integration_roadmap, integration_roadmap_history, invoice_line_items,
invoices, landing_cta, landing_features, landing_hero, landing_testimonials,
lead_pipeline_stages, leave_balances, leave_requests, leave_types, log_row,
mobile_refresh_tokens, notifications, overtime_entries, overtime_settings,
page_analytics, page_versions, pricing_inclusions, pricing_tier_inclusions,
pricing_tiers, project_info, quick_templates, rapport_aktiviteter,
rapport_audit_log, rapport_avvik, rapport_kommentarer, rapport_maal,
rapport_templates, rapporter, recurring_entries, report_assets,
report_block_types, report_comments, report_generated, report_templates,
revenue_events, sak_locations, saker, sales_routing_rules,
sales_script_blocks, salg_contract_templates, salg_email_templates,
salg_settings, section_design_settings, section_templates,
seo_global_settings, seo_pages, sessions, site_settings, stripe_events,
tester_feedback, timer_sessions, timesheet_submissions, user_cases,
user_drafts, user_goal_categories, user_settings, user_task_prefs,
vendor_avvik_protokoller, vendor_institutions, vendor_integrations,
vendor_invite_links, vendor_seat_log, vendor_templates, why_page_benefits,
why_page_content, why_page_features, why_page_hero, why_page_stats
```

**9 funnet via sweep for lat-opprettede tabeller** (opprettet direkte i
TypeScript-kode, ikke i noen migrasjonsfil eller `pgTable()`-erklæring):

| Tabell | Opprettes i |
|---|---|
| `log_row_audit` | `server/lib/log-row-audit.ts` (`ensureLogRowAuditTable()`) |
| `travel_legs` | `server/lib/travel-legs.ts:29` |
| `cms_pages` | `server/smartTimingRoutes.ts:2639` OG `:3735` (duplisert — se «Ikke i omfang») |
| `email_drafts` | `server/routes/email-composer-routes.ts:431` |
| `landing_partners` | `server/smartTimingRoutes.ts:2618` OG `:8599` (duplisert) |
| `leave_attachments` | `server/routes/leave-attachments-routes.ts:55` |
| `poweroffice_employee_mappings` | `server/lib/poweroffice-mappings.ts:24` |
| `stuck_events` | `server/smartTimingRoutes.ts:3167` |
| `user_onboarding_state` | `server/routes.ts:1655` |

Allerede omdøpt tidligere denne økten (uendret, ikke del av denne
migrasjonen): `tidum_permissions`, `tidum_roles`, `tidum_role_permissions`,
`tidum_admin_activity_log`, `tidum_permission_seed_log`.

## Migrasjon

Ny fil `migrations/057_tidum_table_rename.sql`. Idempotent — bruk
`DO $$ BEGIN ... EXCEPTION WHEN duplicate_table THEN NULL; END $$;`-
mønster PER tabell (ikke ett kjempeblokk), slik at én tabell som av en
eller annen grunn allerede er omdøpt (f.eks. delvis kjørt migrasjon fra
et avbrutt forsøk) ikke stopper resten:

```sql
DO $$ BEGIN
  ALTER TABLE IF EXISTS access_requests RENAME TO tidum_access_requests;
EXCEPTION WHEN duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE IF EXISTS admin_users RENAME TO tidum_admin_users;
EXCEPTION WHEN duplicate_table THEN NULL; END $$;

-- ... (én blokk per tabell, alle 126, i implementeringsplanen skrevet ut
-- fullstendig — denne spec-en viser mønsteret, ikke alle 126 gjentatt)
```

`IF EXISTS` gjør hver enkeltlinje trygg mot at en tabell allerede ble
omdøpt av et tidligere (delvis) kjøreforsøk — kombinert med
`EXCEPTION WHEN duplicate_table` (i tilfelle en tabell med det NYE navnet
av en eller annen grunn allerede finnes) gjør hele migrasjonen sikker å
kjøre om igjen fra hvilket som helst delvis fullført punkt, samme
idempotens-prinsipp som resten av `migrations/*.sql`.

Registreres i `server/lib/run-startup-migrations.ts` som vanlig, etter
`"056_admin_activity_log.sql"`.

## Kodeoppdatering

**A) `pgTable()`-erklæringer** (`shared/schema.ts`, `shared/models/*.ts`):
for hver av de 117 schema-erklærte tabellene, endre kun SQL-navn-
strengen: `pgTable("gammelt_navn", {...})` → `pgTable("tidum_gammelt_navn", {...})`.
TS-eksportnavnet (variabelnavnet/bindingen) endres IKKE.

**B) Rå SQL-referanser** (`server/`, hovedsakelig `smartTimingRoutes.ts`
og `server/routes/*.ts`): hver `FROM x`, `INTO x`, `JOIN x`,
`UPDATE x`, `DELETE FROM x` der `x` er ett av de 126 gamle navnene,
endres til `tidum_x`. Dette er det STØRSTE, mest risikofylte steget —
se «Verifiseringsstrategi».

**C) De 9 lat-init `CREATE TABLE IF NOT EXISTS`-setningene**: selve
`CREATE TABLE`-setningen i hver av de 9 filene (se tabell over) endres
til å bruke det nye `tidum_`-navnet direkte — disse trenger IKKE en
`RENAME`-linje i migrasjon 057 (de kjører først ved neste `ensureXTable()`-
kall og oppretter tabellen med det nye navnet direkte, IF NOT EXISTS gjør
resten idempotent som vanlig) MED ÉN UNNTAK: hvis noen av disse 9 allerede
har rader i produksjon (ingen gjorde ved forrige sjekk, men verifiser
på nytt rett før utførelse, se under), må den ha en eksplisitt
`RENAME`-linje i 057 i stedet for å stole på at IF NOT EXISTS-veien
gjenoppretter tom tabell under nytt navn (som ville mistet dataene).

## Verifiseringsstrategi (avgjørende, gitt at metoden allerede har bommet én gang)

Sweepen som fant de 9 lat-opprettede tabellene beviser at et rent
tekst-søk kan ha blindsoner. Før noen kode regnes som ferdig endret:

1. **Etter kodeoppdateringen**: grep hele `server/`, `shared/`, `client/`
   for HVERT av de 126 gamle tabellnavnene som RÅ ORD (`\btabellnavn\b`,
   ikke som delstreng av et annet ord — f.eks. `saker` er delstreng av
   `sakerLocations` som IKKE skal treffes). Forventet resultat: NULL
   treff for et gammelt navn utenfor migrasjonsfilen selv og
   kommentarer/historikk. Ethvert gjenværende treff er enten en glemt
   referanse (må fikses) eller en reell falsk positiv (dokumenter
   hvorfor).
2. **Mot ekte database, FØR migrasjonen kjøres i implementeringsplanen**:
   kjør et siste, ferskt søk etter `CREATE TABLE`/`ensureTable`-mønstre
   på nytt (samme metode som denne spec-ens sweep) for å fange opp
   eventuelle NYE lat-opprettede tabeller lagt til av annet arbeid i
   mellomtiden — denne økten har allerede vist at kodebasen endres
   raskt.
3. **Etter migrasjonen kjører mot ekte database**: for hver av de 126,
   bekreft (a) det gamle navnet IKKE lenger eksisterer i
   `information_schema.tables`, (b) det nye `tidum_`-navnet GJØR det, (c)
   radantallet er uendret (RENAME flytter ikke data, men bekreft likevel
   — reell paranoia gitt hvor mye denne økten har funnet feil i antakelser
   om denne databasen).
4. **Full testsuite** (100/100 er ny baseline etter denne øktens tidligere
   arbeid) må fortsatt vise 100/100 etter omdøpingen — enhver test som nå
   feiler avslører en glemt referanse testene faktisk dekket.
5. **Manuell stikkprøve i nettleser** av minst de tabellene med faktisk
   data (`cms_posts`, `sessions`, `pricing_tier_inclusions`, `salg_settings`)
   — automatiserte tester dekker ikke nødvendigvis alt UI-et som leser
   disse.

## Feilhåndtering

- Migrasjonen er idempotent per tabell (se over) — et avbrutt forsøk kan
  trygt kjøres på nytt.
- Hvis ett av de 9 lat-init-stedene mot formodning HAR data ved
  utførelsestidspunkt (endret siden denne spec-en ble skrevet), stopp og
  behandle den ene tabellen som en eksplisitt `RENAME`-linje i stedet for
  IF-NOT-EXISTS-veien — ikke fortsett blindt med resten av planen uten å
  løse dette spesifikt.
- Ingen automatisk rollback-mekanisme utover at hver `RENAME` individuelt
  er reverserbar (`ALTER TABLE tidum_x RENAME TO x`) hvis noe skulle vise
  seg galt — implementeringsplanen bør ha denne reverserings-SQL-en klar,
  ikke skrevet fra scratch under en hendelse.

## Testing

- Migreringstest (samme mønster som `migrations/054`-`056` sine
  tester): kjør migrasjon 057 mot ekte database (les-før/les-etter,
  bekreft gammelt navn borte / nytt navn til stede / radantall uendret)
  for et representativt utvalg av de 126 (ikke praktisk å teste alle 126
  individuelt — velg minst: én tabell med reelt innhold, én helt tom, én
  av de 9 lat-init-tabellene, én med den doble lat-init-koden).
  begge kjør IF-EXISTS-veien (frisk tabell) OG bekreft idempotens (kjør
  migrasjonen to ganger).
- Full regresjonstest: hele eksisterende testsuiten (100 reelle tester)
  MÅ fortsatt passere etter både kodeoppdateringen og migrasjonen.
- Grep-basert verifisering (se «Verifiseringsstrategi» punkt 1) er i seg
  selv en test-artefakt implementeringsplanen skal kjøre og rapportere
  resultatet av, ikke bare en anbefaling.

## Ikke i omfang (denne fasen)

- `users`, `vendors` — bevisst utenfor omfang, brukerens beslutning.
- `legacy`-skjemaet — inaktivt, ingen praktisk grunn til å røre det.
- Opprydding av den dupliserte lat-init-koden for `cms_pages` og
  `landing_partners` (samme `CREATE TABLE IF NOT EXISTS` to steder hver i
  `smartTimingRoutes.ts`) — en reell kodekvalitets-observasjon fra
  sweepen, men et selvstendig, urelatert opprydningsarbeid. Denne
  migrasjonen oppdaterer BEGGE duplikatene til å bruke det nye navnet
  (siden begge må endres uansett for at omdøpingen skal være korrekt),
  men konsoliderer dem ikke til ett sted.
- Enhver videre konsolidering av de nå 6 parallelle
  revisjonslogg-/aktivitetstabell-mønstrene i kodebasen
  (`log_row_audit`, `company_audit_log`, `cms_activity_log`,
  `rapport_audit_log`, `tidum_admin_activity_log`, og trolig flere blant
  de 126) — observert tidligere denne økten, ikke adressert her.
