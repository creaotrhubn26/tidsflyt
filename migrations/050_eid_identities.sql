-- Migration 050: eid_identities + auth_login_events
--
-- Datamodell for BankID/Buypass-innlogging via Signicat. ssn_hash er
-- kontonøkkelen — samme person skal matche samme rad uansett om hun logger
-- inn med BankID eller Buypass, forutsatt fnr-scope er hentet fra begge.
-- Fødselsnummer lagres aldri i klartekst, kun HMAC-SHA256-hash.

CREATE TABLE IF NOT EXISTS eid_identities (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider     VARCHAR NOT NULL,
  sub          TEXT NOT NULL,
  ssn_hash     TEXT NOT NULL,
  given_name   TEXT,
  family_name  TEXT,
  full_name    TEXT,
  raw_claims   JSONB,
  verified_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS eid_identities_user_provider_key
  ON eid_identities (user_id, provider);

CREATE UNIQUE INDEX IF NOT EXISTS eid_identities_ssn_provider_key
  ON eid_identities (ssn_hash, provider);

CREATE INDEX IF NOT EXISTS eid_identities_ssn_idx ON eid_identities (ssn_hash);

CREATE TABLE IF NOT EXISTS auth_login_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider    VARCHAR NOT NULL,
  user_id     VARCHAR REFERENCES users(id),
  session_id  TEXT,
  ip_address  TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS auth_login_events_user_idx
  ON auth_login_events (user_id, created_at DESC);
