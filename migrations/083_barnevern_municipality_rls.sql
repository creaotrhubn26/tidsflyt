-- Database-level tenant isolation, phase 1: the municipality's intake core.
-- Context is always transaction-local (see server/lib/database-rls-context.ts)
-- so a pooled connection cannot leak access from one request to the next.

BEGIN;

-- Makes this migration idempotent after FORCE RLS has already been enabled.
SELECT set_config('tidum.rls_mode', 'system', true),
       set_config('tidum.kommune_id', '', true),
       set_config('tidum.rls_system_operation', 'migration_083', true);

-- Attachments previously inherited tenant scope only through melding_id.
-- Persist the municipality binding and enforce that it matches the parent.
ALTER TABLE tidum_barnevern_melding_vedlegg
  ADD COLUMN IF NOT EXISTS kommune_id INTEGER;

UPDATE tidum_barnevern_melding_vedlegg attachment
   SET kommune_id = melding.kommune_id
  FROM tidum_barnevern_meldinger melding
 WHERE attachment.melding_id = melding.id
   AND attachment.kommune_id IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM tidum_barnevern_melding_vedlegg WHERE kommune_id IS NULL
  ) THEN
    RAISE EXCEPTION '083 cannot enable RLS: attachment without municipality binding';
  END IF;
END $$;

ALTER TABLE tidum_barnevern_melding_vedlegg
  ALTER COLUMN kommune_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS tidum_barnevern_melding_vedlegg_kommune_idx
  ON tidum_barnevern_melding_vedlegg (kommune_id, melding_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'tidum_barnevern_melding_vedlegg'::regclass
       AND conname = 'tidum_barnevern_melding_vedlegg_melding_kommune_fkey'
  ) THEN
    ALTER TABLE tidum_barnevern_melding_vedlegg
      ADD CONSTRAINT tidum_barnevern_melding_vedlegg_melding_kommune_fkey
      FOREIGN KEY (melding_id, kommune_id)
      REFERENCES tidum_barnevern_meldinger (id, kommune_id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END $$;

ALTER TABLE tidum_barnevern_melding_vedlegg
  VALIDATE CONSTRAINT tidum_barnevern_melding_vedlegg_melding_kommune_fkey;

CREATE OR REPLACE FUNCTION tidum_rls_kommune_allowed(target_kommune_id INTEGER)
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
      AND current_setting('tidum.kommune_id', true) ~ '^[1-9][0-9]*$'
      THEN target_kommune_id = current_setting('tidum.kommune_id', true)::INTEGER
    ELSE FALSE
  END
$$;

-- Managed database owners commonly bypass RLS and Neon does not allow them to
-- create/alter roles. pg_database_owner is PostgreSQL-provided, NOLOGIN and
-- NOBYPASSRLS; the current database owner is its only implicit member. The
-- protected application transactions SET LOCAL ROLE to it and receive only
-- the explicit privileges below.
GRANT USAGE ON SCHEMA public TO pg_database_owner;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  tidum_barnevern_meldinger,
  tidum_barnevern_melding_vedlegg,
  tidum_fiks_raw_intake_log,
  tidum_frister
TO pg_database_owner;
GRANT SELECT ON TABLE tidum_kommuner, users TO pg_database_owner;
GRANT USAGE, SELECT, UPDATE ON SEQUENCE tidum_barnevern_meldingsnummer_seq TO pg_database_owner;
GRANT EXECUTE ON FUNCTION tidum_rls_kommune_allowed(INTEGER) TO pg_database_owner;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'tidum_barnevern_meldinger',
    'tidum_barnevern_melding_vedlegg',
    'tidum_fiks_raw_intake_log'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS tidum_kommune_isolation ON %I', table_name);
    EXECUTE format(
      'CREATE POLICY tidum_kommune_isolation ON %I FOR ALL USING (tidum_rls_kommune_allowed(kommune_id)) WITH CHECK (tidum_rls_kommune_allowed(kommune_id))',
      table_name
    );
  END LOOP;
END $$;

COMMIT;
