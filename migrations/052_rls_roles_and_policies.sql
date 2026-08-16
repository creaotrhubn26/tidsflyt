-- migrations/052_rls_roles_and_policies.sql
--
-- To Postgres-roller for vendor-isolasjon via Row-Level Security:
--   tidum_app    — all autentisert forretningslogikk, RLS håndheves ALLTID
--                  (FORCE, ikke bare ENABLE — selv tabelleieren omfattes)
--   tidum_system — BYPASSRLS. Kun migrasjoner, seed, cron, og auth-oppslag
--                  som kjører før req.user finnes (se server/lib/
--                  request-db-context.ts og spec §5.3/§5.6 for hvorfor).
--
-- FORCE ROW LEVEL SECURITY slås IKKE på her — kun ENABLE. Se migrasjon 054
-- (Task 10) for FORCE-bryteren, som først slås på når alle 56 db/pool-
-- konsumerende filer er klassifisert og verifisert (Task 9).
--
-- MANUELL KJØRING KAN VÆRE PÅKREVD — se Task 7 steg 1 i
-- docs/superpowers/plans/2026-08-15-g10-sikkerhetsherding.md. Hvis
-- migrasjonsrollen mangler CREATEROLE/superuser, kjør denne filen manuelt
-- mot produksjonsdatabasen via Neon/Render sitt administrasjonsgrensesnitt.
--
-- MANUAL ONLY: denne filen er bevisst IKKE lagt til i STARTUP_MIGRATIONS i
-- server/lib/run-startup-migrations.ts. En app-kjørt migrasjon har typisk
-- ikke CREATEROLE/superuser på en administrert Postgres (Neon/Render), og
-- det privilegiet kunne ikke verifiseres i denne sandboxen (ingen DB-
-- tilkobling tilgjengelig). Verifiser privilegiet før kjøring; kjør deretter
-- manuelt mot staging/produksjon via administrasjonsgrensesnittet.
--
-- IKKE TRYGG Å KJØRE PÅ NYTT: Postgres støtter ikke `CREATE POLICY IF NOT
-- EXISTS`. Rolle-opprettelsen (første DO $$-blokk) er idempotent, men den
-- andre DO $$-blokken (policy-løkken) vil feile på første CREATE POLICY
-- dersom filen kjøres en gang til. Kjør denne filen kun én gang per database.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'tidum_app') THEN
    CREATE ROLE tidum_app LOGIN PASSWORD NULL;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'tidum_system') THEN
    CREATE ROLE tidum_system LOGIN BYPASSRLS PASSWORD NULL;
  END IF;
END
$$;

-- tidum_app trenger vanlig lese/skrive-tilgang på alle tabeller (RLS
-- filtrerer RADENE, ikke tilgangen til tabellen som sådan).
GRANT USAGE ON SCHEMA public TO tidum_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO tidum_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO tidum_app;

GRANT USAGE ON SCHEMA public TO tidum_system;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO tidum_system;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO tidum_system;

-- Policy-mønsteret, ett per vendor-scopet tabell. fail-closed: en spørring
-- uten satt app.vendor_id matcher INGEN rader (current_setting(..., true)
-- returnerer NULL, og "vendor_id = NULL" er aldri sann i SQL).
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'companies', 'company_users', 'project_info', 'log_row', 'rapport_templates',
    'vendor_institutions', 'vendor_integrations', 'imports', 'vendor_seat_log',
    'api_keys', 'api_usage_log', 'case_reports', 'feedback_requests',
    'feedback_responses', 'timesheet_submissions', 'vendor_invite_links',
    'rapport_avvik', 'vendor_avvik_protokoller', 'vendor_templates', 'saker',
    'integration_interest_primary', 'integration_interest_signals'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY vendor_isolation ON %I USING (vendor_id = current_setting(''app.vendor_id'', true)::int OR current_setting(''app.is_super_admin'', true) = ''true'')',
      t
    );
  END LOOP;
END
$$;

-- users-tabellen: vendor_id er nullable (null for super_admin) — samme
-- policy-uttrykk dekker den korrekt (se spec §5.4).
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY vendor_isolation ON users
  USING (
    vendor_id = current_setting('app.vendor_id', true)::int
    OR current_setting('app.is_super_admin', true) = 'true'
  );

-- admin_users: vendor_id er nullable (null for super_admin, kommentar i
-- schema.ts). Samme mønster som users — en NULL-rad her betyr "ingen
-- vendor-tilknytning", ikke "global", så den skal KUN være synlig for
-- super_admin. Mest sensitive tabellen i listen (inneholder passwordHash).
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY vendor_isolation ON admin_users
  USING (
    vendor_id = current_setting('app.vendor_id', true)::int
    OR current_setting('app.is_super_admin', true) = 'true'
  );

-- access_requests: vendor_id er nullable ("assigned when approved" ifølge
-- schema.ts). Før godkjenning er raden ikke tildelt noen vendor ennå, så
-- samme users-mønster er korrekt: NULL skal kun være synlig for
-- super_admin, ikke for alle vendor_admins/brukere.
ALTER TABLE access_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY vendor_isolation ON access_requests
  USING (
    vendor_id = current_setting('app.vendor_id', true)::int
    OR current_setting('app.is_super_admin', true) = 'true'
  );

-- report_templates: vendor_id er nullable, men her betyr NULL "global
-- mal, synlig for alle" (schema.ts: "null = global template, otherwise
-- vendor-specific") — IKKE "utildelt" som i users/admin_users/
-- access_requests over. Policyen må derfor eksplisitt slippe gjennom
-- NULL-rader for alle, ikke bare super_admin, ellers blir globale maler
-- usynlige for vanlige vendor_admins/brukere.
ALTER TABLE report_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY vendor_isolation ON report_templates
  USING (
    vendor_id = current_setting('app.vendor_id', true)::int
    OR vendor_id IS NULL
    OR current_setting('app.is_super_admin', true) = 'true'
  );
