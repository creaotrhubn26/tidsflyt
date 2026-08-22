# Tidum-tabell-omdøping — Implementeringsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gi alle 120 bekreftet Tidum-eide tabeller `tidum_`-prefiks, uten å
røre `users`/`vendors` (bevisst utenfor omfang) eller bryte noen
eksisterende funksjonalitet.

**Architecture:** Én idempotent migrasjon (`057_tidum_table_rename.sql`)
som omdøper alle 120 tabeller. All kode som refererer til de gamle navnene
— Drizzle `pgTable()`-erklæringer, rå SQL-strenger, 9 lat-init
`CREATE TABLE`-steder, 2 session-store-konfigurasjoner — oppdateres i
SAMME endring, siden kode og database ALDRI kan være ute av synk (en
hvilken som helst mellomtilstand der de er det, er en ødelagt app).
Migrasjonen registreres og kjøres mot ekte database FØRST i Task 2, etter
at Task 1s kode er ferdig skrevet og gjennomgått — gir en reell
gjennomgangsport FØR databasen faktisk endres.

**Tech Stack:** Rå SQL-migrasjon (samme mønster som `migrations/054-056`),
Drizzle `pgTable()`-erklæringer (kun SQL-navn-strengen endres, ikke
TS-bindingsnavn).

**Spec:** `docs/superpowers/specs/2026-08-21-tidum-tabell-omdoping-design.md`

## Global Constraints

- `users` og `vendors` røres IKKE — verken kode eller database.
- `legacy`-skjemaet røres IKKE.
- Alle 120 tabeller får `tidum_`-prefiks. Drizzle TS-eksportnavn
  (bindingene) endres IKKE — kun SQL-navn-strengen i `pgTable(...)`.
- Migrasjon 057 registreres IKKE i `server/lib/run-startup-migrations.ts`
  før Task 2 — Task 1 skriver KUN filen og all kodeoppdatering, uten å
  faktisk trigge kjøring mot ekte database. Dette er bevisst: så snart
  migrasjonen er registrert, kjører den på NESTE serveroppstart (inkludert
  enhver test som importerer `server/db.ts`), så registrering må skje
  ETTER at all kode allerede forventer de nye navnene.
- `sessions`-tabellen krever spesiell håndtering: `connect-pg-simple`s
  `tableName: "sessions"`-konfigurasjon i BÅDE
  `server/replit_integrations/auth/replitAuth.ts:29` OG
  `server/custom-auth.ts:246` MÅ oppdateres til `tableName: "tidum_sessions"`
  i SAMME endring som selve tabellomdøpingen — glemmes disse, mister ALLE
  innloggede brukere sesjonen sin umiddelbart når migrasjonen kjører.
- Enhver DB-mutasjon i tester MÅ ryddes opp i try/finally.
- Test-DB-tilgang: `DATABASE_URL` i `.env`, bruk `dangerouslyDisableSandbox: true`
  på Bash-kall som treffer databasen (dette sandbox-miljøet blokkerer
  ellers utgående nettverk til databasen, med en 600s vakthund-timeout).
- `npx tsc --noEmit` må være rent etter hver oppgave.
- De 9 lat-init-tabellene trenger IKKE en RENAME-linje i migrasjon 057
  (deres egen `CREATE TABLE IF NOT EXISTS` oppretter dem direkte under det
  nye navnet neste gang de kjører) MED ETT UNNTAK: verifiser rett før
  utførelse (Task 2, Step 1) at ingen av de 9 har fått data siden spec-en
  ble skrevet — hvis én har det, må den ha en eksplisitt RENAME-linje i
  stedet, ikke IF-NOT-EXISTS-veien (som ville opprettet en TOM tabell
  under nytt navn og latt den gamle, med data, stå urørt).

---

### Task 1: Migrasjon + all kodeoppdatering (IKKE registrert/kjørt ennå)

**Files:**
- Create: `migrations/057_tidum_table_rename.sql`
- Modify: `shared/schema.ts`, `shared/models/*.ts` (111 `pgTable()`-erklæringer)
- Modify: 9 filer med lat-init `CREATE TABLE IF NOT EXISTS` (se liste under)
- Modify: alle filer i `server/` (hovedsakelig `server/smartTimingRoutes.ts`
  og `server/routes/*.ts`) med rå SQL-referanser til noen av de 120 gamle
  navnene
- Modify: `server/replit_integrations/auth/replitAuth.ts:29`,
  `server/custom-auth.ts:246` (`tableName: "sessions"` → `"tidum_sessions"`)
- Test: `server/lib/__tests__/tidum-table-rename-mechanism.test.ts`

**Interfaces:**
- Produserer: en komplett, konsistent kodebase som forventer alle 120
  tabeller under sine `tidum_`-navn — Task 2 registrerer migrasjonen og
  kjører den mot ekte database, og forventer at DENNE oppgavens kode
  allerede er 100 % klar for det øyeblikket.

- [ ] **Step 1: Skriv migrasjonsfilen**

Opprett `migrations/057_tidum_table_rename.sql` med én `DO $$ ... END $$;`-
blokk per tabell (idempotent — `IF EXISTS` + `EXCEPTION WHEN duplicate_table`
gjør hver linje trygg å kjøre om igjen fra et hvilket som helst delvis
fullført punkt):

```sql
-- Tidum-tabell-omdøping — se docs/superpowers/specs/2026-08-21-tidum-tabell-omdoping-design.md
-- Én blokk per tabell. IF EXISTS + EXCEPTION WHEN duplicate_table gjør
-- hver linje trygg å kjøre om igjen uansett hvor en tidligere, avbrutt
-- kjøring stoppet.

DO $$ BEGIN ALTER TABLE IF EXISTS access_requests RENAME TO tidum_access_requests; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS admin_users RENAME TO tidum_admin_users; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS aktivitet_maler RENAME TO tidum_aktivitet_maler; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS analytics_settings RENAME TO tidum_analytics_settings; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS api_keys RENAME TO tidum_api_keys; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS api_usage_log RENAME TO tidum_api_usage_log; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS auth_login_events RENAME TO tidum_auth_login_events; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS blog_comments RENAME TO tidum_blog_comments; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS builder_pages RENAME TO tidum_builder_pages; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS case_reports RENAME TO tidum_case_reports; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS cms_activity_log RENAME TO tidum_cms_activity_log; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS cms_categories RENAME TO tidum_cms_categories; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS cms_content_entries RENAME TO tidum_cms_content_entries; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS cms_content_entry_versions RENAME TO tidum_cms_content_entry_versions; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS cms_content_fields RENAME TO tidum_cms_content_fields; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS cms_content_types RENAME TO tidum_cms_content_types; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS cms_posts RENAME TO tidum_cms_posts; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS companies RENAME TO tidum_companies; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS company_audit_log RENAME TO tidum_company_audit_log; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS company_users RENAME TO tidum_company_users; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS content_versions RENAME TO tidum_content_versions; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS crawler_jobs RENAME TO tidum_crawler_jobs; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS crawler_results RENAME TO tidum_crawler_results; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS crawler_schedules RENAME TO tidum_crawler_schedules; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS dashboard_tasks RENAME TO tidum_dashboard_tasks; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS design_presets RENAME TO tidum_design_presets; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS design_tokens RENAME TO tidum_design_tokens; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS eid_identities RENAME TO tidum_eid_identities; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS email_send_history RENAME TO tidum_email_send_history; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS email_settings RENAME TO tidum_email_settings; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS email_templates RENAME TO tidum_email_templates; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS feedback_requests RENAME TO tidum_feedback_requests; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS feedback_responses RENAME TO tidum_feedback_responses; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS form_submissions RENAME TO tidum_form_submissions; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS forward_log RENAME TO tidum_forward_log; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS import_rows RENAME TO tidum_import_rows; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS imports RENAME TO tidum_imports; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS integration_catalog RENAME TO tidum_integration_catalog; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS integration_interest_primary RENAME TO tidum_integration_interest_primary; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS integration_interest_signals RENAME TO tidum_integration_interest_signals; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS integration_roadmap RENAME TO tidum_integration_roadmap; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS integration_roadmap_history RENAME TO tidum_integration_roadmap_history; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS invoice_line_items RENAME TO tidum_invoice_line_items; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS invoices RENAME TO tidum_invoices; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS landing_cta RENAME TO tidum_landing_cta; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS landing_features RENAME TO tidum_landing_features; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS landing_hero RENAME TO tidum_landing_hero; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS landing_testimonials RENAME TO tidum_landing_testimonials; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS lead_pipeline_stages RENAME TO tidum_lead_pipeline_stages; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS leave_balances RENAME TO tidum_leave_balances; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS leave_requests RENAME TO tidum_leave_requests; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS leave_types RENAME TO tidum_leave_types; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS log_row RENAME TO tidum_log_row; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS mobile_refresh_tokens RENAME TO tidum_mobile_refresh_tokens; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS notifications RENAME TO tidum_notifications; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS overtime_entries RENAME TO tidum_overtime_entries; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS overtime_settings RENAME TO tidum_overtime_settings; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS page_analytics RENAME TO tidum_page_analytics; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS page_versions RENAME TO tidum_page_versions; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS pricing_inclusions RENAME TO tidum_pricing_inclusions; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS pricing_tier_inclusions RENAME TO tidum_pricing_tier_inclusions; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS pricing_tiers RENAME TO tidum_pricing_tiers; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS project_info RENAME TO tidum_project_info; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS quick_templates RENAME TO tidum_quick_templates; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS rapport_aktiviteter RENAME TO tidum_rapport_aktiviteter; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS rapport_audit_log RENAME TO tidum_rapport_audit_log; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS rapport_avvik RENAME TO tidum_rapport_avvik; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS rapport_kommentarer RENAME TO tidum_rapport_kommentarer; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS rapport_maal RENAME TO tidum_rapport_maal; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS rapport_templates RENAME TO tidum_rapport_templates; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS rapporter RENAME TO tidum_rapporter; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS recurring_entries RENAME TO tidum_recurring_entries; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS report_assets RENAME TO tidum_report_assets; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS report_block_types RENAME TO tidum_report_block_types; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS report_comments RENAME TO tidum_report_comments; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS report_generated RENAME TO tidum_report_generated; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS report_templates RENAME TO tidum_report_templates; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS revenue_events RENAME TO tidum_revenue_events; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS sak_locations RENAME TO tidum_sak_locations; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS saker RENAME TO tidum_saker; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS sales_routing_rules RENAME TO tidum_sales_routing_rules; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS sales_script_blocks RENAME TO tidum_sales_script_blocks; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS salg_contract_templates RENAME TO tidum_salg_contract_templates; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS salg_email_templates RENAME TO tidum_salg_email_templates; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS salg_settings RENAME TO tidum_salg_settings; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS section_design_settings RENAME TO tidum_section_design_settings; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS section_templates RENAME TO tidum_section_templates; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS seo_global_settings RENAME TO tidum_seo_global_settings; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS seo_pages RENAME TO tidum_seo_pages; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS sessions RENAME TO tidum_sessions; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS site_settings RENAME TO tidum_site_settings; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS stripe_events RENAME TO tidum_stripe_events; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS tester_feedback RENAME TO tidum_tester_feedback; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS timer_sessions RENAME TO tidum_timer_sessions; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS timesheet_submissions RENAME TO tidum_timesheet_submissions; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS user_cases RENAME TO tidum_user_cases; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS user_drafts RENAME TO tidum_user_drafts; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS user_goal_categories RENAME TO tidum_user_goal_categories; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS user_settings RENAME TO tidum_user_settings; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS user_task_prefs RENAME TO tidum_user_task_prefs; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS vendor_avvik_protokoller RENAME TO tidum_vendor_avvik_protokoller; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS vendor_institutions RENAME TO tidum_vendor_institutions; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS vendor_integrations RENAME TO tidum_vendor_integrations; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS vendor_invite_links RENAME TO tidum_vendor_invite_links; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS vendor_seat_log RENAME TO tidum_vendor_seat_log; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS vendor_templates RENAME TO tidum_vendor_templates; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS why_page_benefits RENAME TO tidum_why_page_benefits; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS why_page_content RENAME TO tidum_why_page_content; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS why_page_features RENAME TO tidum_why_page_features; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS why_page_hero RENAME TO tidum_why_page_hero; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS why_page_stats RENAME TO tidum_why_page_stats; EXCEPTION WHEN duplicate_table THEN NULL; END $$;

-- De 9 lat-init-tabellene (opprettet direkte i TypeScript-kode, ikke i
-- noen tidligere migrasjon) — inkludert her i tilfelle de allerede finnes
-- under gammelt navn i et miljø der koden allerede har kjørt. Trygt
-- no-op hvis de aldri ble opprettet ennå (IF EXISTS).
DO $$ BEGIN ALTER TABLE IF EXISTS log_row_audit RENAME TO tidum_log_row_audit; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS travel_legs RENAME TO tidum_travel_legs; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS cms_pages RENAME TO tidum_cms_pages; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS email_drafts RENAME TO tidum_email_drafts; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS landing_partners RENAME TO tidum_landing_partners; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS leave_attachments RENAME TO tidum_leave_attachments; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS poweroffice_employee_mappings RENAME TO tidum_poweroffice_employee_mappings; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS stuck_events RENAME TO tidum_stuck_events; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE IF EXISTS user_onboarding_state RENAME TO tidum_user_onboarding_state; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
```

- [ ] **Step 2: Oppdater de 111 `pgTable()`-erklæringene**

I `shared/schema.ts` og `shared/models/*.ts`: for hver av de 111
tabellene fra Step 1s første liste, finn `pgTable("gammelt_navn", ...)`
og endre KUN SQL-navn-strengen til `pgTable("tidum_gammelt_navn", ...)`.
TS-eksport-/bindingsnavnet (variabelnavnet) endres IKKE — samme mønster
som `shared/models/permissions.ts` allerede etablerte for
`tidum_permissions`/`tidum_roles`/`tidum_role_permissions`.

Eksempel (`shared/models/auth.ts`, allerede kjent fra tidligere denne
økten):
```ts
export const users = pgTable("users", { ... });  // UENDRET — users er utenfor omfang
export const eidIdentities = pgTable("eid_identities", { ... });
// blir:
export const eidIdentities = pgTable("tidum_eid_identities", { ... });
```

Gå metodisk gjennom `shared/schema.ts` (de aller fleste av de 111) og
hver fil i `shared/models/` én etter én.

- [ ] **Step 3: Oppdater de 9 lat-init-tabellene**

For hver av de 9 filene fra Step 1s andre liste: endre selve
`CREATE TABLE IF NOT EXISTS gammelt_navn (...)`-setningen til
`CREATE TABLE IF NOT EXISTS tidum_gammelt_navn (...)`, OG oppdater alle
andre rå SQL-spørringer i SAMME fil som refererer til det gamle navnet
(disse funksjonene gjør typisk både opprettelse og etterfølgende
INSERT/SELECT/UPDATE mot samme tabell i samme fil).

Merk duplisert kode: `cms_pages` opprettes to steder
(`server/smartTimingRoutes.ts:2639` OG `:3735`) og `landing_partners`
opprettes to steder (`server/smartTimingRoutes.ts:2618` OG `:8599`) —
oppdater BEGGE stedene for begge tabellene, ikke bare det første treffet.
(Konsolidering av duplikatene er bevisst utenfor omfang — se spec-ens
«Ikke i omfang».)

- [ ] **Step 4: Oppdater `sessions`-relaterte konfigurasjoner**

I `server/replit_integrations/auth/replitAuth.ts:29` og
`server/custom-auth.ts:246`, endre `tableName: "sessions"` til
`tableName: "tidum_sessions"`.

- [ ] **Step 5: Oppdater alle gjenværende rå SQL-referanser**

For HVER av de 120 gamle tabellnavnene: grep `server/` (og `shared/`,
`client/` for sikkerhets skyld) for navnet som RÅ ORD (`\bgammeltnavn\b`)
i SQL-strengkontekst (`FROM x`, `INTO x`, `JOIN x`, `UPDATE x`,
`DELETE FROM x`, og ethvert annet sted navnet opptrer inni en
`pool.query()`-backtick-streng). Erstatt med `tidum_gammeltnavn`.

Metodikk: gå tabell for tabell (ikke fil for fil) — for hvert av de 120
navnene, kjør ett grep-søk, se ALLE treff, oppdater dem, gå videre til
neste navn. Dette er mer pålitelig enn å gå fil for fil siden en enkelt
fil (særlig `server/smartTimingRoutes.ts`, ~9000 linjer) kan referere
dusinvis av forskjellige tabeller.

**Rekkefølge-forsiktighet:** ordboks-grensen (`\b`) i grep skiller
korrekt mellom f.eks. `log_row` og `log_row_audit` (ingen ordgrense
mellom `w` og `_`, siden understrek er et ordtegn) — men gå likevel
gjennom navnene fra LENGST til KORTEST som en ekstra sikkerhetsmargin,
og verifiser visuelt ethvert treff som ser uventet ut før du erstatter.

- [ ] **Step 6: Grep-verifiseringssveip (selvsjekk, rapporter resultatet)**

Etter Step 2-5: grep hele `server/`, `shared/`, `client/` for HVERT av de
120 gamle navnene som rått ord på nytt. Forventet: ZERO treff utenfor
`migrations/057_tidum_table_rename.sql` selv (som naturlig nok nevner de
gamle navnene i `RENAME`-setningene) og eventuelle kommentarer som
eksplisitt refererer til det gamle navnet historisk (f.eks. denne planens
egen tekst, ikke kjørende kode). Ethvert annet treff er enten en glemt
referanse (FIKS DEN) eller en reell falsk positiv du må dokumentere
eksplisitt i rapporten din (med begrunnelse for hvorfor det IKKE er en
glemt referanse).

- [ ] **Step 7: Skriv mekanisme-testen (rører IKKE ekte Tidum-tabeller)**

Opprett `server/lib/__tests__/tidum-table-rename-mechanism.test.ts` — 
tester at DO-blokk-mønsteret fra Step 1 faktisk er idempotent og
korrekt, mot EGNE, disponible dummy-tabeller (IKKE noen av de 120 ekte
Tidum-tabellene — migrasjon 057 registreres og kjøres først i Task 2):

```ts
import { describe, it, expect, afterEach } from "vitest";
import { pool } from "../../db";

describe("tidum table rename mechanism (migrations/057's DO-block pattern)", () => {
  afterEach(async () => {
    await pool.query(`DROP TABLE IF EXISTS test_rename_mechanism_old`);
    await pool.query(`DROP TABLE IF EXISTS test_rename_mechanism_tidum_old`);
  });

  async function runRenameBlock() {
    await pool.query(`
      DO $$ BEGIN
        ALTER TABLE IF EXISTS test_rename_mechanism_old RENAME TO test_rename_mechanism_tidum_old;
      EXCEPTION WHEN duplicate_table THEN NULL; END $$;
    `);
  }

  it("renames a fresh table", async () => {
    await pool.query(`CREATE TABLE test_rename_mechanism_old (id SERIAL PRIMARY KEY, val TEXT)`);
    await pool.query(`INSERT INTO test_rename_mechanism_old (val) VALUES ('hello')`);

    await runRenameBlock();

    const { rows: oldRows } = await pool.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = 'test_rename_mechanism_old'`,
    );
    expect(oldRows.length).toBe(0);
    const { rows: newRows } = await pool.query(
      `SELECT val FROM test_rename_mechanism_tidum_old`,
    );
    expect(newRows.length).toBe(1);
    expect(newRows[0].val).toBe("hello");
  });

  it("is idempotent — running the block twice does not error, even after the table is already renamed", async () => {
    await pool.query(`CREATE TABLE test_rename_mechanism_old (id SERIAL PRIMARY KEY)`);
    await runRenameBlock();
    await runRenameBlock();
    // Second run: old table doesn't exist (IF EXISTS no-ops), new table
    // already exists — must not throw.
  });

  it("no-ops safely when the old table never existed at all", async () => {
    await runRenameBlock();
    const { rows } = await pool.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = 'test_rename_mechanism_tidum_old'`,
    );
    expect(rows.length).toBe(0);
  });
});
```

- [ ] **Step 8: Kjør mekanisme-testen, typecheck**

Kjør: `DATABASE_URL='<verdi fra .env>' npx vitest run server/lib/__tests__/tidum-table-rename-mechanism.test.ts`
(husk `dangerouslyDisableSandbox: true`). Forventet: 3/3 PASS.
Kjør: `npx tsc --noEmit`. Forventet: rent — dette er en reell test at
Step 2s `pgTable()`-endringer ikke har ødelagt noen TS-type et annet
sted (TS-typene avledes av forme, ikke av SQL-navn-strengen, så dette
BØR forbli rent, men verifiser).

**VIKTIG: ikke kjør den fulle testsuiten ennå.** Så lenge migrasjon 057
ikke er registrert i `run-startup-migrations.ts`, forventer koden (fra
Step 2-5) `tidum_`-navnene, men den ekte databasen har fortsatt de GAMLE
navnene — å kjøre appens vanlige testsuite nå ville feile i stort omfang
(forventet, ikke en reell regresjon — dette er den bevisste
mellomtilstanden Task 2 lukker).

- [ ] **Step 9: Commit (IKKE registrer migrasjonen ennå)**

```bash
git add migrations/057_tidum_table_rename.sql \
  shared/schema.ts shared/models/ \
  server/ \
  server/lib/__tests__/tidum-table-rename-mechanism.test.ts
git commit -m "feat: skriv Tidum-tabell-omdøping (migrasjon + all kode, ikke registrert ennå)"
```

Rapporter EKSPLISITT i din task-rapport: (a) grep-sveip-resultatet fra
Step 6 (null treff, eller dokumenterte falske positiver), (b) at
migrasjon 057 bevisst IKKE er lagt til `STARTUP_MIGRATIONS`-listen ennå,
(c) at den fulle testsuiten bevisst IKKE ble kjørt (forventet å feile i
denne mellomtilstanden).

---

### Task 2: Registrer + kjør migrasjonen mot ekte database + full verifisering

**Files:**
- Modify: `server/lib/run-startup-migrations.ts` (registrer migrasjon 057)
- Test: `server/lib/__tests__/tidum-table-rename-post-migration.test.ts`

**Interfaces:**
- Konsumerer: Task 1s ferdige, gjennomgåtte kode — denne oppgaven er der
  migrasjonen FAKTISK kjører mot den ekte, delte produksjonsdatabasen for
  første gang.
- Produserer: ingen — siste oppgave i planen.

- [ ] **Step 1: Fersk sveip FØR utførelse**

Før du registrerer noe: kjør et helt ferskt søk (samme metode som
spec-ens opprinnelige sweep — grep hele `server/` for `CREATE TABLE`,
`ensureTable`-mønstre) for å fange opp eventuelle NYE lat-opprettede
tabeller lagt til av annet arbeid siden Task 1 ble skrevet. Hvis noen nye
finnes: stopp, ikke fortsett blindt — ruling: enten er dette en reell ny
tabell som trenger samme behandling (legg til i migrasjon 057 og
tilhørende kode FØR du går videre), eller det er en falsk positiv du
dokumenterer.

Kjør også: for hver av de 9 lat-init-tabellene (Task 1s Step 3-liste),
sjekk radantall i den ekte databasen akkurat nå. Hvis noen har fått data
siden spec-en ble skrevet (alle hadde 0 da), MÅ den ha en eksplisitt
`RENAME`-linje lagt til migrasjon 057 (samme mønster som de andre 111) —
IF-NOT-EXISTS-veien ville ellers opprettet en tom tabell under nytt navn
og latt den gamle, med data, stå urørt og glemt.

- [ ] **Step 2: Registrer migrasjonen**

I `server/lib/run-startup-migrations.ts`, legg
`"057_tidum_table_rename.sql"` til slutt i `STARTUP_MIGRATIONS`-listen.

- [ ] **Step 3: Trigger migrasjonen mot ekte database**

Kjør ett enkelt, målrettet script (Node + pg, samme mønster som andre
engangs-DB-script denne økten) som leser og kjører
`migrations/057_tidum_table_rename.sql` direkte mot ekte `DATABASE_URL`
— dette ER øyeblikket alle 120 tabeller faktisk omdøpes i produksjon.
`dangerouslyDisableSandbox: true` påkrevd.

- [ ] **Step 4: Verifiser migrasjonsresultatet mot ekte database**

Skriv `server/lib/__tests__/tidum-table-rename-post-migration.test.ts`
som, for et representativt utvalg (minst 10 av de 120 — inkluder minst:
`tidum_sessions`, `tidum_cms_posts` (har reelt innhold), én helt tom
tabell, `tidum_log_row_audit` (lat-init), `tidum_cms_pages` (dupliserte
lat-init-steder), én til fra hver kategori), bekrefter: (a) det gamle
navnet finnes IKKE lenger i `information_schema.tables`, (b) det nye
`tidum_`-navnet GJØR det, (c) radantallet er identisk med det som ble
notert i spec-en/Step 1s ferske sjekk.

Kjør denne testen mot ekte database, rapporter resultatet.

- [ ] **Step 5: Full regresjonstest**

Kjør: `DATABASE_URL='<verdi fra .env>' npx vitest run`
(husk `dangerouslyDisableSandbox: true` — og at `fileParallelism: false`
allerede er satt i `vitest.config.ts`, så ikke legg til
`--no-file-parallelism` manuelt, det er nå unødvendig).
Forventet: 100/100 reelle tester (samme baseline som resten av denne
økten) — ETHVERT nytt avvik her betyr en glemt kodereferanse Task 1s
grep-sveip ikke fanget opp. Fiks umiddelbart hvis så, ikke lever videre
med en rød test.

- [ ] **Step 6: Manuell stikkprøve i nettleser**

Start dev-server, verifiser minst: CMS-innhold (`tidum_cms_posts`)
lastes riktig, innlogging fungerer fortsatt (verifiserer
`tidum_sessions`-omdøpingen + `tableName`-konfigurasjonsendringen faktisk
virker — dette er den mest kritiske enkeltsjekken i hele planen, siden en
feil her logger ut ALLE brukere), prissetting/salg-sider
(`tidum_pricing_tier_inclusions`, `tidum_salg_settings`) viser riktig
innhold.

Hvis `SESSION_SECRET` mangler i lokal `.env` og blokkerer dev-serveren
(kjent, forhåndseksisterende gap), noter dette eksplisitt og prioriter å
verifisere innloggingsflyten mot et miljø der den faktisk fungerer, eller
be kontrollsesjonen om hjelp til å løse dette FØR denne oppgaven regnes
som ferdig — sesjonsfunksjon er for kritisk til å hoppe over.

- [ ] **Step 7: Commit**

```bash
git add server/lib/run-startup-migrations.ts \
  server/lib/__tests__/tidum-table-rename-post-migration.test.ts
git commit -m "feat: registrer og kjør Tidum-tabell-omdøping mot ekte database"
```
