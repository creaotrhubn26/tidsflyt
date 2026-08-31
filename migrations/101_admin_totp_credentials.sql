-- migrations/101_admin_totp_credentials.sql
-- Krav 20 (G-10): TOTP-hemmelighet og gjenopprettingskoder for admin-roller
-- (super_admin, hovedadmin, vendor_admin — se canAccessVendorApiAdmin()).
-- Hemmeligheten lagres forseglet med secret-box (samme mønster som
-- PowerOffice client-key) — like sensitiv som et passord.
-- Gjenopprettingskodene lagres KUN som SHA-256-hash (aldri i klartekst,
-- aldri gjenopprettbare — kun sammenlignbare ved bruk).

BEGIN;

CREATE TABLE IF NOT EXISTS tidum_admin_totp_credentials (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               VARCHAR NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  totp_secret_encrypted TEXT NOT NULL,
  recovery_codes_hashed JSONB NOT NULL DEFAULT '[]',
  enrolled_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at          TIMESTAMPTZ
);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE tidum_admin_totp_credentials TO pg_database_owner;

COMMIT;
