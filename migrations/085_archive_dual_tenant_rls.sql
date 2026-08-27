-- Database-level tenant isolation, phase 3A: archive integration.
--
-- Archive configuration, case links and outbox receipts are shared by two
-- mutually exclusive tenant types. Request and worker transactions must set
-- either tidum.kommune_id or tidum.vendor_id through database-rls-context.ts.

BEGIN;

SELECT set_config('tidum.rls_mode', 'system', true),
       set_config('tidum.kommune_id', '', true),
       set_config('tidum.vendor_id', '', true),
       set_config('tidum.rls_system_operation', 'migration_085', true),
       set_config('tidum.rls_actor_user_id', '', true);

CREATE OR REPLACE FUNCTION tidum_rls_archive_tenant_allowed(
  target_vendor_id INTEGER,
  target_kommune_id INTEGER
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN current_setting('tidum.rls_mode', true) = 'system'
      AND current_setting('tidum.rls_system_operation', true) ~ '^[a-z][a-z0-9_-]{2,63}$'
      THEN TRUE
    WHEN current_setting('tidum.rls_mode', true) = 'kommune'
      AND target_vendor_id IS NULL
      AND target_kommune_id IS NOT NULL
      AND current_setting('tidum.kommune_id', true) ~ '^[1-9][0-9]*$'
      THEN target_kommune_id = current_setting('tidum.kommune_id', true)::INTEGER
    WHEN current_setting('tidum.rls_mode', true) = 'vendor'
      AND target_kommune_id IS NULL
      AND target_vendor_id IS NOT NULL
      AND current_setting('tidum.vendor_id', true) ~ '^[1-9][0-9]*$'
      THEN target_vendor_id = current_setting('tidum.vendor_id', true)::INTEGER
    ELSE FALSE
  END
$$;

-- Managed Neon development compatibility role. Production uses the dedicated
-- NOLOGIN/NOBYPASSRLS role named by TIDUM_RLS_RUNTIME_ROLE and receives the
-- same narrow grants during environment provisioning.
GRANT USAGE ON SCHEMA public TO pg_database_owner;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  archive_configs,
  archive_case_links,
  archive_entries
TO pg_database_owner;
GRANT EXECUTE ON FUNCTION tidum_rls_archive_tenant_allowed(INTEGER, INTEGER)
TO pg_database_owner;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'archive_configs',
    'archive_case_links',
    'archive_entries'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS tidum_archive_tenant_isolation ON %I', table_name);
    EXECUTE format(
      'CREATE POLICY tidum_archive_tenant_isolation ON %I FOR ALL USING (tidum_rls_archive_tenant_allowed(vendor_id, kommune_id)) WITH CHECK (tidum_rls_archive_tenant_allowed(vendor_id, kommune_id))',
      table_name
    );
  END LOOP;
END $$;

COMMIT;
