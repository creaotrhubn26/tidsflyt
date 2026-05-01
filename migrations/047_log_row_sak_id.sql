-- Migration 047: log_row.sak_id FK
--
-- Pre-T18 var koblingen mellom timer (log_row) og saker (saker) løs —
-- bare en tekst-kolonne `project` med saksnummer. Det gjorde at billing-
-- regnestykket "X timer × Y kr/t på sak Z" ikke kunne stole på data.
--
-- Denne migrasjonen legger til en hard FK fra log_row til saker. Nullable
-- for backward compatibility med eksisterende rader (backfilles av
-- migrasjon 047b basert på project-tekstmatch).

ALTER TABLE log_row
  ADD COLUMN IF NOT EXISTS sak_id UUID;

CREATE INDEX IF NOT EXISTS idx_log_row_sak_id ON log_row(sak_id);

-- Backfill basert på project-tekstmatch mot saker.saksnummer.
-- Idempotent: bare oppdaterer rader der sak_id IS NULL og det finnes
-- nøyaktig én sak med matchende saksnummer.

UPDATE log_row lr
SET sak_id = sub.id
FROM (
  SELECT DISTINCT ON (saksnummer) id, saksnummer
  FROM saker
  ORDER BY saksnummer, created_at ASC
) sub
WHERE lr.sak_id IS NULL
  AND lr.project IS NOT NULL
  AND TRIM(lr.project) = sub.saksnummer;
