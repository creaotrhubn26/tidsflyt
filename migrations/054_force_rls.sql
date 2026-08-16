-- migrations/054_force_rls.sql
--
-- Cutover: slår på FORCE ROW LEVEL SECURITY på alle vendor-scopede tabeller
-- fra migrasjon 052 (ENABLE ROW LEVEL SECURITY der). Forutsetter:
--   - docs/security/rls-file-classification.md er komplett og verifisert
--     (Task 9) — ingen "MANUELL GJENNOMGANG"-rader gjenstår.
--   - withVendorScopedDb (Task 8) er utrullet og stabil i produksjon i
--     minst [X dager — sett en reell verdi ved faktisk utrulling, ikke
--     skrevet her siden den avhenger av når Task 8 faktisk deployes].
--
-- Tabellisten under er hentet PROGRAMMATISK fra migrations/052_rls_roles_and_policies.sql
-- (ikke håndkopiert): de 22 tabellene i policy-løkken pluss de 4 tabellene
-- med egne ALTER TABLE-blokker (users, admin_users, access_requests,
-- report_templates) = 26 tabeller totalt. Se
-- docs/security/rls-file-classification.md, linje "De 26 vendor-scopede
-- tabellene med policy er de i migrations/052_rls_roles_and_policies.sql",
-- som bekrefter samme tall uavhengig.
--
-- MERK — tabeller som IKKE er med her, med vilje: Task 9s klassifisering
-- fant vendor-scopede tabeller UTEN policy i 052 (poweroffice_employee_mappings
-- har vendor_id men mangler policy; log_row_audit/leave_attachments/travel_legs/
-- company_audit_log/rapport_audit_log har ikke vendor_id og kan ikke få den
-- generiske policyen uten en subquery). De kan ikke FORCE's her — det finnes
-- ingen policy å håndheve, og det er utenfor dette tasket å skrive nye
-- policyer. Se "Gjenstående funn og risiko for Task 10" i
-- docs/security/rls-file-classification.md.
--
-- MANUELL KJØRING KAN VÆRE PÅKREVD — samme forbehold som migrasjon 052: en
-- app-kjørt migrasjonsrolle har typisk ikke eierskap/superuser på en
-- administrert Postgres (Neon/Render). ALTER DEFAULT PRIVILEGES må i
-- tillegg kjøres av SAMME rolle som kjørte migrasjon 052 (den rollen som
-- oppretter tabellene) — se forklaring under. Denne filen er bevisst IKKE
-- lagt til i STARTUP_MIGRATIONS i server/lib/run-startup-migrations.ts, av
-- samme grunn som 052.
--
-- IKKE TRYGG Å KJØRE PÅ NYTT UTEN ETTERTANKE for policy-delen i seg selv er
-- den trygg (FORCE/ENABLE er idempotente, GRANT og ALTER DEFAULT PRIVILEGES
-- er idempotente) — denne filen kan kjøres flere ganger uten feil, i
-- motsetning til 052.

-- =====================================================================
-- Del 1: ALTER DEFAULT PRIVILEGES (blokkerende forutsetning, oppdaget
-- under Task 9 — se docs/security/rls-file-classification.md, seksjon
-- "BLOKKERENDE FOR TASK 10: tidum_app mangler grants på nyere tabeller")
-- =====================================================================
--
-- Migrasjon 052s "GRANT ... ON ALL TABLES IN SCHEMA public" er et
-- øyeblikksbilde tatt da 052 kjørte. Enhver tabell opprettet ETTER det
-- (alle ~66 late "CREATE TABLE IF NOT EXISTS"-setningene i server/routes.ts,
-- server/smartTimingRoutes.ts m.fl., og enhver framtidig migrasjon) har
-- INGEN grant til tidum_app eller tidum_system, og får "permission denied"
-- så snart en av dem faktisk brukes. Før fix-runde 1 i Task 9 var dette
-- ufarlig fordi rå pool alltid kjørte som tidum_system (BYPASSRLS, men
-- fortsatt underlagt vanlige GRANT-er) via en ikke-ALS-bevisst eksport; nå
-- som både pool og dbPool er ALS-bevisste proxyer inn i en tidum_app-
-- transaksjon i request-kontekst, rammer det alle rå-SQL-stier i en
-- autentisert request.
--
-- To deler: (a) ALTER DEFAULT PRIVILEGES dekker FRAMTIDIGE CREATE TABLE
-- gjort av samme rolle, (b) et nytt GRANT ON ALL TABLES tar igjen tabeller
-- som allerede ble opprettet lat i tidsrommet mellom 052 og denne filen.
-- Grant-listen speiler nøyaktig hva 052 ga tidum_app/tidum_system (linje
-- 44-50 i 052): SELECT/INSERT/UPDATE/DELETE på tabeller, USAGE/SELECT på
-- sekvenser.

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO tidum_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO tidum_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO tidum_system;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO tidum_system;

-- Ta igjen tabeller/sekvenser opprettet lat mellom 052 og nå (samme
-- setninger som 052 selv, trygt å kjøre på nytt — GRANT er idempotent).
GRANT USAGE ON SCHEMA public TO tidum_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO tidum_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO tidum_app;

GRANT USAGE ON SCHEMA public TO tidum_system;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO tidum_system;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO tidum_system;

-- =====================================================================
-- Del 2: FORCE ROW LEVEL SECURITY — selve cutover-bryteren
-- =====================================================================
--
-- FORCE utvider RLS-håndhevelsen til å gjelde tabelleieren også (ENABLE
-- alene unntar eieren). Alle 26 tabeller under har allerede
-- "vendor_isolation"-policyen fra migrasjon 052.

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    -- de 22 tabellene fra 052s policy-løkke
    'companies', 'company_users', 'project_info', 'log_row', 'rapport_templates',
    'vendor_institutions', 'vendor_integrations', 'imports', 'vendor_seat_log',
    'api_keys', 'api_usage_log', 'case_reports', 'feedback_requests',
    'feedback_responses', 'timesheet_submissions', 'vendor_invite_links',
    'rapport_avvik', 'vendor_avvik_protokoller', 'vendor_templates', 'saker',
    'integration_interest_primary', 'integration_interest_signals',
    -- de 4 tabellene fra 052s individuelle ALTER TABLE-blokker
    'users', 'admin_users', 'access_requests', 'report_templates'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END
$$;

-- Minste privilegium (tidum_system-innstramming): UT AV SCOPE for denne
-- migrasjonen med vilje. tidum_system er BYPASSRLS og brukes fortsatt av
-- pre-auth-oppslag, cron/seed/migrasjoner, DDL-ruting (systemPool i
-- server/db.ts) og de dokumenterte requestDbStorage.exit()-unntakene (se
-- docs/security/rls-file-classification.md, "Kjente, bevisste unntak").
-- REVOKE-innstrammingen skrives i en egen, separat migrasjon (055) ETTER at
-- Task 9s klassifisering har vært i produksjon minst én uke uten
-- feilmeldinger om manglende tilgang — se brief for Task 10. Ikke gjort her.
