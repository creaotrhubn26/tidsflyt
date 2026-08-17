-- migrations/056_hardened_vendor_isolation_policy.sql
--
-- Herder `vendor_isolation`-policyene fra migrasjon 052 slik at den
-- dokumenterte fail-closed-oppførselen faktisk stemmer på en GJENBRUKT,
-- pooled tilkobling.
--
-- HVA SOM VAR GALT: 052s kommentar sier at en spørring uten satt
-- `app.vendor_id` gir `current_setting('app.vendor_id', true) = NULL`, og at
-- policyen dermed matcher null rader. Det gjelder KUN en tilkobling som ALDRI
-- har hatt GUC-en satt. Så snart `set_config('app.vendor_id', ..., true)` har
-- kjørt én gang i en transaksjon på tilkoblingen, tilbakestilles innstillingen
-- til TOM STRENG (ikke NULL) når transaksjonen avsluttes. Neste spørring på
-- den samme tilkoblingen uten aktiv scoping evaluerer da `''::int` og feiler
-- hardt med `invalid input syntax for type integer: ""` i stedet for å
-- returnere null rader.
--
-- Dette er ikke teoretisk: det er nøyaktig mekanismen bak funnet om
-- `api_usage_log`-skrivingen i `res.on("finish")` (server/api-middleware.ts),
-- som kjører inne i ALS-konteksten, men etter at request-transaksjonen har
-- committet.
--
-- FIKSEN: `NULLIF(current_setting('app.vendor_id', true), '')::int` gir ekte
-- NULL-semantikk i BEGGE tilfellene (aldri satt OG tilbakestilt til tom
-- streng), slik at `vendor_id = NULL` blir UNKNOWN → null rader → fail-closed
-- slik det alltid har vært dokumentert.
--
-- 052 er ikke redigert (migrasjoner er append-only) — kommentaren der er
-- korrigert til å beskrive den faktiske oppførselen og peke hit.
--
-- Tabellisten er de samme 26 tabellene som i 052/054 (22 i løkken + users,
-- admin_users, access_requests, report_templates). `report_templates` har et
-- eget policy-uttrykk (NULL = global mal, synlig for alle) og beholder det.
--
-- MANUELL KJØRING KAN VÆRE PÅKREVD — samme forbehold som 052 og 054:
-- `DROP POLICY`/`CREATE POLICY` krever eierskap av tabellene. Filen er
-- bevisst IKKE lagt til i STARTUP_MIGRATIONS i
-- server/lib/run-startup-migrations.ts.
--
-- TRYGG Å KJØRE PÅ NYTT: bruker `DROP POLICY IF EXISTS` før `CREATE POLICY`,
-- i motsetning til 052.

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
    -- de 3 av 052s individuelle blokker som deler samme uttrykk
    'users', 'admin_users', 'access_requests'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS vendor_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY vendor_isolation ON %I USING (vendor_id = NULLIF(current_setting(''app.vendor_id'', true), '''')::int OR current_setting(''app.is_super_admin'', true) = ''true'')',
      t
    );
  END LOOP;
END
$$;

-- report_templates: NULL betyr «global mal, synlig for alle» (se 052) — eget
-- uttrykk, samme NULLIF-herding.
DROP POLICY IF EXISTS vendor_isolation ON report_templates;
CREATE POLICY vendor_isolation ON report_templates
  USING (
    vendor_id = NULLIF(current_setting('app.vendor_id', true), '')::int
    OR vendor_id IS NULL
    OR current_setting('app.is_super_admin', true) = 'true'
  );
