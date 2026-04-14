-- Migration 026: Vendor institutions registry
-- Institutions are external organisations a vendor (leverandør) works with —
-- e.g. barnevernstjenester, NAV-kontor, kommuner, private oppdragsgivere.
-- Shared across all users in a vendor so miljøarbeidere can pick from the list.

CREATE TABLE IF NOT EXISTS vendor_institutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id INTEGER NOT NULL,
  org_number TEXT,
  name TEXT NOT NULL,
  institution_type TEXT,        -- 'barnevern' | 'nav' | 'kommune' | 'privat' | 'helsevesen' | 'annet'
  contact_person TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  address TEXT,

  -- Automations (per-institution rules)
  auto_forward_rapport BOOLEAN DEFAULT false,
  forward_email TEXT,
  overtime_applicable BOOLEAN DEFAULT true,

  notes TEXT,
  active BOOLEAN DEFAULT true,
  brreg_verified BOOLEAN DEFAULT false,

  created_by TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Prevent duplicate institutions per vendor (null org_nr still dedup'd by name)
  UNIQUE (vendor_id, org_number)
);

CREATE INDEX IF NOT EXISTS idx_vendor_institutions_vendor ON vendor_institutions(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_institutions_active ON vendor_institutions(vendor_id, active);

-- Link saker → institution (optional — existing saker keep working without)
ALTER TABLE saker ADD COLUMN IF NOT EXISTS institution_id UUID REFERENCES vendor_institutions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_saker_institution ON saker(institution_id);

-- Onboarding state on user_settings (which steps the user completed)
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS onboarding_steps JSONB DEFAULT '{}'::jsonb;
