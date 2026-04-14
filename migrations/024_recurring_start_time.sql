-- Migration 024: Configurable start time on recurring entries
-- Previously hardcoded to "09:00" in the generator — now per-entry.

ALTER TABLE recurring_entries ADD COLUMN IF NOT EXISTS start_time TEXT DEFAULT '09:00';
