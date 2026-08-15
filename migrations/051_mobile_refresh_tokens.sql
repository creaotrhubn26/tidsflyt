-- Migration 051: mobile_refresh_tokens
--
-- Refresh tokens for the native iOS app's JWT-over-Bearer auth path (see
-- server/lib/mobile-auth.ts). Only the SHA-256 hash of the token is stored —
-- the raw token is never persisted, so a leaked database row can't be
-- replayed. revoked_at lets a single stolen/lost device be cut off without
-- rotating the signing secret for everyone.

CREATE TABLE IF NOT EXISTS mobile_refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMP NOT NULL,
  revoked_at  TIMESTAMP,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mobile_refresh_tokens_user_idx
  ON mobile_refresh_tokens (user_id);
