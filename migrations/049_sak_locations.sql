-- Migration 049: sak_locations + log_row.sak_location_id
--
-- Per-sak fysiske lokasjoner — typisk en tiltaksbolig der døgnsats gjelder
-- istedenfor timesats. En sak kan ha flere lokasjoner (hovedkontor +
-- felt-bolig). Lokasjonens rate_mode/hourly_rate/day_rate overstyrer
-- user_cases sin sats når brukeren registrerer tid med sak_location_id.
--
-- Sats-prioritet (mest til minst spesifikk):
--   1. sak_locations.day_rate / hourly_rate (avhengig av rate_mode)
--   2. user_cases.day_rate / hourly_rate
--   3. vendor_settings.enforced_hourly_rate

CREATE TABLE IF NOT EXISTS sak_locations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sak_id        UUID NOT NULL REFERENCES saker(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  address       TEXT,
  rate_mode     TEXT NOT NULL DEFAULT 'hour',
  hourly_rate   NUMERIC(10, 2),
  day_rate      NUMERIC(10, 2),
  active        BOOLEAN DEFAULT true,
  created_by    TEXT,
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW(),
  CONSTRAINT sak_locations_rate_mode_check
    CHECK (rate_mode IN ('hour', 'day'))
);

CREATE INDEX IF NOT EXISTS idx_sak_locations_sak_id ON sak_locations(sak_id);
CREATE INDEX IF NOT EXISTS idx_sak_locations_active ON sak_locations(active);

ALTER TABLE log_row
  ADD COLUMN IF NOT EXISTS sak_location_id UUID;

CREATE INDEX IF NOT EXISTS idx_log_row_sak_location ON log_row(sak_location_id);
