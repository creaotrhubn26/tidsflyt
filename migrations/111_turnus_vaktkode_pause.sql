-- migrations/111_turnus_vaktkode_pause.sql
--
-- Gives a shift code a break length, so AML §10-9 can be evaluated against
-- something real.
--
-- The bug this closes: TurnusShift.pauseTimer has existed in the contract since
-- the start and turnus-aml.ts:105 reads it, but nothing ever stored a break —
-- neither the shift code nor the generated shift had a column for one. The value
-- was therefore always 0, and `missing_break_over_5_5h` fired on every shift
-- longer than 5.5 hours. In practice that is every shift a care ward runs, so
-- every employee in every generated roster carried a warning per shift.
--
-- That is worse than a missing feature. A warning that always fires is noise,
-- and a planner who sees 35 of them beside every name learns to ignore the
-- badge — which is exactly the signal that is supposed to make AML deviations
-- visible (K-04).
--
-- Minutes, not hours: breaks are agreed in minutes ("30 minutters pause"), and
-- an integer column cannot drift the way a float would. The API converts to
-- hours at the contract boundary, where pauseTimer is defined.
--
-- Default 0 is deliberate. Existing shift codes keep their current behaviour
-- until someone states the break, so this migration changes no evaluation on
-- its own — it only makes the correct answer expressible.
--
-- Idempotent.
ALTER TABLE tidum_turnus_vaktkoder
  ADD COLUMN IF NOT EXISTS pause_min INTEGER NOT NULL DEFAULT 0;

ALTER TABLE tidum_turnus_vaktkoder
  DROP CONSTRAINT IF EXISTS tidum_turnus_vaktkoder_pause_min_check;
ALTER TABLE tidum_turnus_vaktkoder
  ADD CONSTRAINT tidum_turnus_vaktkoder_pause_min_check
  CHECK (pause_min >= 0 AND pause_min <= 240);

COMMENT ON COLUMN tidum_turnus_vaktkoder.pause_min IS
  'Break in minutes for this shift code, subtracted from worked hours by turnus-aml.ts. 0 means no break is registered, which makes §10-9 fire for shifts over 5.5h — correct, but only once the value is actually maintained.';
