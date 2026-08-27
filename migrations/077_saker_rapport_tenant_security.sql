-- Align the legacy case/report domain with the current varchar/UUID user IDs,
-- then add the indexes and relational guardrails used by tenant-scoped access.
-- Integer values are preserved as their text representation.

DO $$
DECLARE
  target RECORD;
BEGIN
  FOR target IN
    SELECT * FROM (VALUES
      ('tidum_saker', 'tiltaksleder_id'),
      ('tidum_rapporter', 'user_id'),
      ('tidum_rapporter', 'tiltaksleder_id'),
      ('tidum_rapporter', 'reviewed_by'),
      ('tidum_sak_journal', 'user_id'),
      ('tidum_sak_journal_attachments', 'uploaded_by'),
      ('tidum_rapport_audit_log', 'user_id'),
      ('tidum_rapport_kommentarer', 'from_user_id'),
      ('tidum_aktivitet_maler', 'user_id'),
      ('tidum_user_drafts', 'user_id')
    ) AS required_columns(table_name, column_name)
  LOOP
    IF NOT EXISTS (
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = target.table_name
         AND column_name = target.column_name
    ) THEN
      RAISE EXCEPTION 'Mangler påkrevd kolonne %.%', target.table_name, target.column_name;
    END IF;

    IF EXISTS (
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = target.table_name
         AND column_name = target.column_name
         AND data_type <> 'text'
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ALTER COLUMN %I TYPE TEXT USING %I::text',
        target.table_name,
        target.column_name,
        target.column_name
      );
    END IF;
  END LOOP;
END $$;

UPDATE tidum_saker
   SET tildelte_user_id = COALESCE((
         SELECT jsonb_agg(to_jsonb(item #>> '{}'))
           FROM jsonb_array_elements(tildelte_user_id) AS item
       ), '[]'::jsonb)
 WHERE tildelte_user_id IS NOT NULL
   AND jsonb_typeof(tildelte_user_id) = 'array'
   AND EXISTS (
     SELECT 1
       FROM jsonb_array_elements(tildelte_user_id) AS item
      WHERE jsonb_typeof(item) <> 'string'
   );

UPDATE tidum_rapport_kommentarer
   SET lest_av = COALESCE((
         SELECT jsonb_agg(to_jsonb(item #>> '{}'))
           FROM jsonb_array_elements(lest_av) AS item
       ), '[]'::jsonb)
 WHERE lest_av IS NOT NULL
   AND jsonb_typeof(lest_av) = 'array'
   AND EXISTS (
     SELECT 1
       FROM jsonb_array_elements(lest_av) AS item
      WHERE jsonb_typeof(item) <> 'string'
   );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'tidum_saker'::regclass
       AND conname = 'tidum_saker_assignees_array_check'
  ) THEN
    ALTER TABLE tidum_saker
      ADD CONSTRAINT tidum_saker_assignees_array_check
      CHECK (tildelte_user_id IS NULL OR jsonb_typeof(tildelte_user_id) = 'array');
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM tidum_rapport_aktiviteter aktivitet
      JOIN tidum_rapport_maal maal ON maal.id = aktivitet.mal_id
     WHERE aktivitet.mal_id IS NOT NULL
       AND aktivitet.rapport_id <> maal.rapport_id
  ) THEN
    RAISE EXCEPTION 'Aktivitet peker på mål i en annen rapport';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tidum_saker_vendor_created
  ON tidum_saker (vendor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tidum_saker_leader_created
  ON tidum_saker (tiltaksleder_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tidum_saker_assignees_gin
  ON tidum_saker USING GIN (tildelte_user_id);

CREATE INDEX IF NOT EXISTS idx_tidum_rapporter_user_created
  ON tidum_rapporter (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tidum_rapporter_sak
  ON tidum_rapporter (sak_id);

CREATE INDEX IF NOT EXISTS idx_tidum_rapport_maal_rapport_nummer
  ON tidum_rapport_maal (rapport_id, nummer);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tidum_rapport_maal_id_rapport_unique
  ON tidum_rapport_maal (id, rapport_id);

CREATE INDEX IF NOT EXISTS idx_tidum_rapport_aktiviteter_rapport_dato
  ON tidum_rapport_aktiviteter (rapport_id, dato);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'tidum_rapport_aktiviteter'::regclass
       AND conname = 'tidum_rapport_aktiviteter_maal_same_rapport_fk'
  ) THEN
    ALTER TABLE tidum_rapport_aktiviteter
      ADD CONSTRAINT tidum_rapport_aktiviteter_maal_same_rapport_fk
      FOREIGN KEY (mal_id, rapport_id)
      REFERENCES tidum_rapport_maal (id, rapport_id);
  END IF;
END $$;
