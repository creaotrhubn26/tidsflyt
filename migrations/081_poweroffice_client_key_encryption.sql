-- PowerOffice ClientKey is a tenant-owned credential. Existing installations
-- may contain legacy plaintext rows, so the format constraint is introduced
-- NOT VALID: it blocks every new/updated plaintext value immediately while the
-- application rotation job converts existing rows in controlled batches.

CREATE TABLE IF NOT EXISTS tidum_vendor_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id INTEGER NOT NULL,
  provider TEXT NOT NULL,
  client_key TEXT NOT NULL,
  label TEXT,
  status TEXT DEFAULT 'active',
  last_verified_at TIMESTAMP,
  last_used_at TIMESTAMP,
  last_error TEXT,
  created_by TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (vendor_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_vendor_integrations_vendor
  ON tidum_vendor_integrations(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_integrations_provider
  ON tidum_vendor_integrations(provider);

CREATE TABLE IF NOT EXISTS tidum_integration_secret_rotation_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL,
  vendor_id INTEGER NOT NULL,
  provider TEXT NOT NULL,
  from_key_id VARCHAR(64) NOT NULL,
  to_key_id VARCHAR(64) NOT NULL,
  rotation_source VARCHAR(32) NOT NULL,
  rotated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'tidum_integration_secret_rotation_provider_check'
  ) THEN
    ALTER TABLE tidum_integration_secret_rotation_audit
      ADD CONSTRAINT tidum_integration_secret_rotation_provider_check
      CHECK (provider = 'poweroffice') NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'tidum_integration_secret_rotation_source_check'
  ) THEN
    ALTER TABLE tidum_integration_secret_rotation_audit
      ADD CONSTRAINT tidum_integration_secret_rotation_source_check
      CHECK (rotation_source IN ('lazy-read', 'scheduled', 'manual')) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'tidum_vendor_integrations_poweroffice_client_key_sealed'
  ) THEN
    ALTER TABLE tidum_vendor_integrations
      ADD CONSTRAINT tidum_vendor_integrations_poweroffice_client_key_sealed
      CHECK (
        provider <> 'poweroffice'
        OR client_key ~ '^enc:v2:[A-Za-z0-9._-]{1,64}:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$'
      ) NOT VALID;
  END IF;
END $$;

-- En installasjon uten legacy-rest kan få fullvalidert constraint straks. Har
-- den eldre rader, beholdes NOT VALID til batchrotasjonen har konvertert dem;
-- neste idempotente startup validerer automatisk når resttellingen er null.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM tidum_vendor_integrations
     WHERE provider = 'poweroffice'
       AND client_key !~ '^enc:v2:[A-Za-z0-9._-]{1,64}:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$'
  ) THEN
    ALTER TABLE tidum_vendor_integrations
      VALIDATE CONSTRAINT tidum_vendor_integrations_poweroffice_client_key_sealed;
  END IF;
END $$;

ALTER TABLE tidum_integration_secret_rotation_audit
  VALIDATE CONSTRAINT tidum_integration_secret_rotation_provider_check;
ALTER TABLE tidum_integration_secret_rotation_audit
  VALIDATE CONSTRAINT tidum_integration_secret_rotation_source_check;

CREATE INDEX IF NOT EXISTS tidum_integration_secret_rotation_vendor_idx
  ON tidum_integration_secret_rotation_audit (vendor_id, rotated_at DESC);
CREATE INDEX IF NOT EXISTS tidum_integration_secret_rotation_integration_idx
  ON tidum_integration_secret_rotation_audit (integration_id, rotated_at DESC);
