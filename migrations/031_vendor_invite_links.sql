-- Migration 031: Shared invite links
-- Vendor_admin generates one URL per role and shares it. Recipients land on
-- /invite/<token>, enter their email, and we provision them into the vendor
-- with the pre-set role. Optional: lock to email-domain, expiry, max uses.

CREATE TABLE IF NOT EXISTS vendor_invite_links (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id    INTEGER NOT NULL,
  token        TEXT NOT NULL UNIQUE,
  role         TEXT NOT NULL,
  domain       TEXT,
  expires_at   TIMESTAMP,
  max_uses     INTEGER,
  used_count   INTEGER NOT NULL DEFAULT 0,
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  note         TEXT,
  created_by   TEXT,
  created_at   TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendor_invite_links_vendor ON vendor_invite_links(vendor_id, active);
CREATE INDEX IF NOT EXISTS idx_vendor_invite_links_token  ON vendor_invite_links(token) WHERE active = TRUE;
