-- Tidum's historical `vendors` CREATE TABLE collided with an existing,
-- CreatorHub-owned table of the same name. That table has text ids and a
-- completely different set of required columns. Never alter or reuse it.
--
-- This is the canonical, Tidum-owned tenant table expected by shared/schema.ts
-- and the /api/vendors routes.
CREATE TABLE IF NOT EXISTS tidum_vendors (
  id                     SERIAL PRIMARY KEY,
  name                   TEXT NOT NULL,
  slug                   TEXT NOT NULL UNIQUE,
  org_number             TEXT,
  institution_type       TEXT,
  email                  TEXT,
  phone                  TEXT,
  address                TEXT,
  logo_url               TEXT,
  status                 TEXT DEFAULT 'active',
  settings               JSONB DEFAULT '{}',
  max_users              INTEGER DEFAULT 50,
  subscription_plan      TEXT DEFAULT 'standard',
  api_access_enabled     BOOLEAN DEFAULT FALSE,
  api_subscription_start TIMESTAMP,
  api_subscription_end   TIMESTAMP,
  api_monthly_price      NUMERIC(10,2) DEFAULT 99.00,
  created_at             TIMESTAMP DEFAULT NOW(),
  updated_at             TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS tidum_vendors_org_number_unique_idx
  ON tidum_vendors (org_number)
  WHERE org_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS tidum_vendors_status_idx
  ON tidum_vendors (status);

-- These two Tidum-owned columns were created as varchar because the earlier
-- migrations accidentally referenced CreatorHub's text-id `vendors` table.
-- Refuse to coerce non-numeric values; a failed migration is safer than silent
-- tenant reassignment.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tidum_admin_users'
      AND column_name = 'vendor_id'
      AND data_type IN ('character varying', 'text')
  ) THEN
    IF EXISTS (
      SELECT 1 FROM tidum_admin_users
      WHERE vendor_id IS NOT NULL AND vendor_id !~ '^[0-9]+$'
    ) THEN
      RAISE EXCEPTION 'tidum_admin_users.vendor_id contains non-numeric values; refusing automatic conversion';
    END IF;

    ALTER TABLE tidum_admin_users
      ALTER COLUMN vendor_id TYPE INTEGER
      USING NULLIF(vendor_id, '')::INTEGER;
  END IF;
END $$;

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tidum_frister'
      AND column_name = 'vendor_id'
      AND data_type IN ('character varying', 'text')
  ) THEN
    IF EXISTS (
      SELECT 1 FROM tidum_frister
      WHERE vendor_id IS NOT NULL AND vendor_id !~ '^[0-9]+$'
    ) THEN
      RAISE EXCEPTION 'tidum_frister.vendor_id contains non-numeric values; refusing automatic conversion';
    END IF;

    FOR constraint_name IN
      SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace ns ON ns.oid = rel.relnamespace
      JOIN unnest(con.conkey) AS key(attnum) ON TRUE
      JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = key.attnum
      WHERE ns.nspname = 'public'
        AND rel.relname = 'tidum_frister'
        AND con.contype = 'f'
        AND att.attname = 'vendor_id'
    LOOP
      EXECUTE format('ALTER TABLE tidum_frister DROP CONSTRAINT %I', constraint_name);
    END LOOP;

    ALTER TABLE tidum_frister
      ALTER COLUMN vendor_id TYPE INTEGER
      USING NULLIF(vendor_id, '')::INTEGER;
  END IF;

  -- Existing installations previously pointed this column at the unrelated
  -- CreatorHub `vendors` table. Re-establish the Tidum-owned relationship
  -- after conversion. Add it as NOT VALID first so PostgreSQL starts
  -- enforcing new writes before the separate validation pass checks all
  -- existing rows.
  IF to_regclass('public.tidum_frister') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint con
       JOIN pg_class rel ON rel.oid = con.conrelid
       JOIN pg_namespace ns ON ns.oid = rel.relnamespace
       WHERE ns.nspname = 'public'
         AND rel.relname = 'tidum_frister'
         AND con.contype = 'f'
         AND con.conname = 'tidum_frister_vendor_id_fkey'
     ) THEN
    ALTER TABLE tidum_frister
      ADD CONSTRAINT tidum_frister_vendor_id_fkey
      FOREIGN KEY (vendor_id) REFERENCES tidum_vendors(id)
      NOT VALID;
  END IF;

  IF to_regclass('public.tidum_frister') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM pg_constraint con
       JOIN pg_class rel ON rel.oid = con.conrelid
       JOIN pg_namespace ns ON ns.oid = rel.relnamespace
       WHERE ns.nspname = 'public'
         AND rel.relname = 'tidum_frister'
         AND con.contype = 'f'
         AND con.conname = 'tidum_frister_vendor_id_fkey'
         AND NOT con.convalidated
     ) THEN
    ALTER TABLE tidum_frister
      VALIDATE CONSTRAINT tidum_frister_vendor_id_fkey;
  END IF;
END $$;
