-- migrations/089_barnevern_sak_journal.sql
-- Krav 4: uforanderlig journal på den kommunale barnevernssaken.
-- Egen tabell — IKKE gjenbruk av tidum_sak_journal (utfører-side, integer
-- user_id, ingen tenantkolonne). Rettelser skjer med ny rad som peker på
-- originalen (corrects_entry_id); UPDATE/DELETE finnes aldri i app-koden
-- og er heller ikke gitt som grant.

BEGIN;

SELECT set_config('tidum.rls_mode', 'system', true),
       set_config('tidum.kommune_id', '', true),
       set_config('tidum.rls_system_operation', 'migration_089', true);

CREATE TABLE IF NOT EXISTS tidum_barnevern_sak_journal (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sak_id             UUID NOT NULL,
  kommune_id         INTEGER NOT NULL,
  kategori           TEXT NOT NULL,
  innhold            TEXT NOT NULL,
  corrects_entry_id  UUID,
  forfatter_user_id  VARCHAR NOT NULL REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tidum_barnevern_sak_journal_id_kommune_unique UNIQUE (id, kommune_id),
  CONSTRAINT tidum_barnevern_sak_journal_sak_fk
    FOREIGN KEY (sak_id, kommune_id)
    REFERENCES tidum_barnevern_saker (id, kommune_id)
    ON DELETE CASCADE,
  CONSTRAINT tidum_barnevern_sak_journal_corrects_fk
    FOREIGN KEY (corrects_entry_id, kommune_id)
    REFERENCES tidum_barnevern_sak_journal (id, kommune_id)
);

CREATE INDEX IF NOT EXISTS tidum_barnevern_sak_journal_sak_idx
  ON tidum_barnevern_sak_journal (kommune_id, sak_id, created_at);

-- Vedlegg til journaloppføringer. Lokal privat disk som meldingsvedlegg;
-- byttes til norsk/EU-objektlager i krav 4/23-restansen.
CREATE TABLE IF NOT EXISTS tidum_barnevern_sak_journal_vedlegg (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id  UUID NOT NULL,
  kommune_id        INTEGER NOT NULL,
  filename          TEXT NOT NULL,
  original_name     TEXT NOT NULL,
  mime_type         TEXT NOT NULL,
  size_bytes        INTEGER NOT NULL,
  uploaded_by       VARCHAR NOT NULL REFERENCES users(id),
  uploaded_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tidum_barnevern_sak_journal_vedlegg_entry_fk
    FOREIGN KEY (journal_entry_id, kommune_id)
    REFERENCES tidum_barnevern_sak_journal (id, kommune_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS tidum_barnevern_sak_journal_vedlegg_entry_idx
  ON tidum_barnevern_sak_journal_vedlegg (kommune_id, journal_entry_id);

-- Append-only for begge: kun SELECT og INSERT.
GRANT SELECT, INSERT ON TABLE
  tidum_barnevern_sak_journal,
  tidum_barnevern_sak_journal_vedlegg
TO pg_database_owner;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'tidum_barnevern_sak_journal',
    'tidum_barnevern_sak_journal_vedlegg'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS tidum_kommune_isolation ON %I', table_name);
    EXECUTE format(
      'CREATE POLICY tidum_kommune_isolation ON %I FOR ALL USING (tidum_rls_kommune_allowed(kommune_id)) WITH CHECK (tidum_rls_kommune_allowed(kommune_id))',
      table_name
    );
  END LOOP;
END $$;

COMMIT;
