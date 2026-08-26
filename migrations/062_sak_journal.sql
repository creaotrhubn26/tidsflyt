-- 062_sak_journal.sql
-- Uforanderlig, saks-tilknyttet journalføring (fritekst + vedlegg).
-- Ingen UPDATE/DELETE-rute finnes noensinne for disse tabellene i
-- applikasjonskoden — en feilskrevet oppføring rettes med en ny rad
-- (corrects_entry_id), aldri ved å endre originalen.

CREATE TABLE IF NOT EXISTS tidum_sak_journal (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sak_id             uuid NOT NULL,
  user_id            integer NOT NULL,
  content            text NOT NULL,
  corrects_entry_id  uuid,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sak_journal_sak_id ON tidum_sak_journal(sak_id);
CREATE INDEX IF NOT EXISTS idx_sak_journal_corrects ON tidum_sak_journal(corrects_entry_id) WHERE corrects_entry_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS tidum_sak_journal_attachments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id  uuid NOT NULL,
  filename          text NOT NULL,
  original_name     text NOT NULL,
  mime_type         text NOT NULL,
  size_bytes        integer NOT NULL,
  uploaded_by       integer NOT NULL,
  uploaded_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sak_journal_attachments_entry ON tidum_sak_journal_attachments(journal_entry_id);
