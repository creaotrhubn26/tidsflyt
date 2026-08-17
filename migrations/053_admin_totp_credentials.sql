-- migrations/053_admin_totp_credentials.sql
--
-- TOTP-hemmelighet og gjenopprettingskoder for admin-roller (super_admin,
-- hovedadmin, vendor_admin — se shared/roles.ts canAccessVendorApiAdmin()).
-- Hemmeligheten lagres kryptert (server/lib/secret-crypto.ts, samme mønster
-- som vendor_integrations.client_key) — like sensitiv som et passord.
-- Gjenopprettingskodene lagres KUN som hash (aldri i klartekst, aldri
-- gjenopprettbare — kun sammenlignbare ved bruk).

CREATE TABLE IF NOT EXISTS admin_totp_credentials (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               VARCHAR NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  totp_secret_encrypted TEXT NOT NULL,
  recovery_codes_hashed JSONB NOT NULL DEFAULT '[]',
  enrolled_at           TIMESTAMP NOT NULL DEFAULT NOW(),
  last_used_at          TIMESTAMP
);
