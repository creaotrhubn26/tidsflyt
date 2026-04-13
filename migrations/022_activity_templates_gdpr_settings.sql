-- Migration 022: Activity templates + GDPR auto-replace setting
-- Adds personal activity template library and gdpr_auto_replace toggle

-- Activity templates: saved favorites per user
CREATE TABLE IF NOT EXISTS aktivitet_maler (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL,
  navn TEXT NOT NULL,
  type TEXT DEFAULT 'aktivitet',
  beskrivelse TEXT NOT NULL,
  sted TEXT,
  klient_ref TEXT,
  varighet_min INTEGER,
  bruk_antall INTEGER DEFAULT 0,
  sist_brukt TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aktivitet_maler_user ON aktivitet_maler(user_id);

-- GDPR auto-replace toggle on user_settings
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS gdpr_auto_replace BOOLEAN DEFAULT false;
