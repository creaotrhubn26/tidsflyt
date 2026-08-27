-- Database-level tenant isolation, phase 3B: deadlines and safe user binding.
--
-- A deadline belongs to exactly one municipality or vendor. A notification
-- recipient, when present, must belong to the same tenant. The shared users
-- registry remains outside RLS because it also serves global auth and eID
-- provisioning; only the impossible "both tenant types" shape is rejected.

BEGIN;

SELECT set_config('tidum.rls_mode', 'system', true),
       set_config('tidum.kommune_id', '', true),
       set_config('tidum.vendor_id', '', true),
       set_config('tidum.rls_system_operation', 'migration_086', true),
       set_config('tidum.rls_actor_user_id', '', true);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM users
     WHERE kommune_id IS NOT NULL AND vendor_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION '086 cannot bind users: user belongs to both tenant types';
  END IF;
  IF EXISTS (
    SELECT 1 FROM tidum_frister
     WHERE (kommune_id IS NULL) = (vendor_id IS NULL)
  ) THEN
    RAISE EXCEPTION '086 cannot enable RLS: deadline without exactly one tenant';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM tidum_frister deadline
      JOIN users recipient ON recipient.id = deadline.notify_user_id
     WHERE (deadline.kommune_id IS NOT NULL AND recipient.kommune_id IS DISTINCT FROM deadline.kommune_id)
        OR (deadline.vendor_id IS NOT NULL AND recipient.vendor_id IS DISTINCT FROM deadline.vendor_id)
  ) THEN
    RAISE EXCEPTION '086 cannot bind deadline recipient: tenant mismatch';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'users'::regclass
       AND conname = 'users_single_tenant_type_check'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_single_tenant_type_check
      CHECK (NOT (kommune_id IS NOT NULL AND vendor_id IS NOT NULL))
      NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'tidum_frister'::regclass
       AND conname = 'tidum_frister_exactly_one_tenant_check'
  ) THEN
    ALTER TABLE tidum_frister
      ADD CONSTRAINT tidum_frister_exactly_one_tenant_check
      CHECK ((vendor_id IS NOT NULL)::integer + (kommune_id IS NOT NULL)::integer = 1)
      NOT VALID;
  END IF;
END $$;

ALTER TABLE users VALIDATE CONSTRAINT users_single_tenant_type_check;
ALTER TABLE tidum_frister VALIDATE CONSTRAINT tidum_frister_exactly_one_tenant_check;

-- Composite keys let PostgreSQL prove that a recipient and deadline share
-- the same tenant. The vendor-side users index already exists from migration
-- 079; both declarations are idempotent for fresh and upgraded databases.
CREATE UNIQUE INDEX IF NOT EXISTS users_id_vendor_id_unique_idx
  ON users (id, vendor_id);
CREATE UNIQUE INDEX IF NOT EXISTS users_id_kommune_id_unique_idx
  ON users (id, kommune_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'tidum_frister'::regclass
       AND conname = 'tidum_frister_notify_user_vendor_fkey'
  ) THEN
    ALTER TABLE tidum_frister
      ADD CONSTRAINT tidum_frister_notify_user_vendor_fkey
      FOREIGN KEY (notify_user_id, vendor_id)
      REFERENCES users(id, vendor_id)
      NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'tidum_frister'::regclass
       AND conname = 'tidum_frister_notify_user_kommune_fkey'
  ) THEN
    ALTER TABLE tidum_frister
      ADD CONSTRAINT tidum_frister_notify_user_kommune_fkey
      FOREIGN KEY (notify_user_id, kommune_id)
      REFERENCES users(id, kommune_id)
      NOT VALID;
  END IF;
END $$;

ALTER TABLE tidum_frister VALIDATE CONSTRAINT tidum_frister_notify_user_vendor_fkey;
ALTER TABLE tidum_frister VALIDATE CONSTRAINT tidum_frister_notify_user_kommune_fkey;

CREATE INDEX IF NOT EXISTS tidum_frister_kommune_active_idx
  ON tidum_frister (kommune_id, status, due_at)
  WHERE kommune_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS tidum_frister_vendor_active_idx
  ON tidum_frister (vendor_id, status, due_at)
  WHERE vendor_id IS NOT NULL;

CREATE OR REPLACE FUNCTION tidum_rls_dual_tenant_allowed(
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

GRANT USAGE ON SCHEMA public TO pg_database_owner;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE tidum_frister TO pg_database_owner;
GRANT EXECUTE ON FUNCTION tidum_rls_dual_tenant_allowed(INTEGER, INTEGER)
TO pg_database_owner;

ALTER TABLE tidum_frister ENABLE ROW LEVEL SECURITY;
ALTER TABLE tidum_frister FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tidum_frist_tenant_isolation ON tidum_frister;
CREATE POLICY tidum_frist_tenant_isolation
  ON tidum_frister FOR ALL
  USING (tidum_rls_dual_tenant_allowed(vendor_id, kommune_id))
  WITH CHECK (tidum_rls_dual_tenant_allowed(vendor_id, kommune_id));

COMMIT;
