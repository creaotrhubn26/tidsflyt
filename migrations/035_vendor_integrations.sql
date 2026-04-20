-- Migration 035: Vendor external-system integrations registry
-- Stores per-tenant credentials for push integrations (PowerOffice Go,
-- later Tripletex, Visma etc). Currently scoped to PowerOffice v2,
-- which uses OAuth 2.0 client_credentials where the ClientKey is the
-- per-tenant secret the admin pastes in. Access tokens (20-min TTL)
-- are cached in memory, not persisted here.

CREATE TABLE IF NOT EXISTS vendor_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id INTEGER NOT NULL,
  provider TEXT NOT NULL,           -- 'poweroffice' | (future: 'tripletex' | 'visma')
  client_key TEXT NOT NULL,         -- per-tenant secret from the external system
  label TEXT,                       -- human-readable name ("Creatorhub AS - API Test Client")
  status TEXT DEFAULT 'active',     -- 'active' | 'disabled' | 'invalid'
  last_verified_at TIMESTAMP,       -- last successful token exchange
  last_used_at TIMESTAMP,           -- last successful API call
  last_error TEXT,                  -- most recent auth/API error message
  created_by TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (vendor_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_vendor_integrations_vendor ON vendor_integrations(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_integrations_provider ON vendor_integrations(provider);
