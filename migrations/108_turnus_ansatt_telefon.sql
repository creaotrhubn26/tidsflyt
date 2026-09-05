-- migrations/108_turnus_ansatt_telefon.sql
-- Adds an optional phone number to turnus employees so the publish step can
-- notify them by SMS (a paid, opt-in channel). Idempotent.
ALTER TABLE tidum_turnus_ansatte ADD COLUMN IF NOT EXISTS telefon TEXT;
