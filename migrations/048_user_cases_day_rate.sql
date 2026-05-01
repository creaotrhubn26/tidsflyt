-- Migration 048: user_cases.day_rate + rate_mode
--
-- Eksisterende rate-modell hadde bare hourly_rate. T18 legger til døgnsats
-- (day_rate) og en rate_mode-kolonne som styrer hvilken sats som er aktiv
-- for billing-utregning.
--
-- Begge satsene lagres samtidig — bytte mellom modus mister ikke data.

ALTER TABLE user_cases
  ADD COLUMN IF NOT EXISTS day_rate NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS rate_mode TEXT NOT NULL DEFAULT 'hour';

ALTER TABLE user_cases
  DROP CONSTRAINT IF EXISTS user_cases_rate_mode_check;

ALTER TABLE user_cases
  ADD CONSTRAINT user_cases_rate_mode_check
  CHECK (rate_mode IN ('hour', 'day'));
