-- migrations/088_barnevern_melding_komplett.sql
-- Krav 1: komplett meldingsmottak — prioritet, ufødt barn, tilleggsmelding,
-- søskenkopi og kontrollert redigering med append-only revisjonshistorikk.

BEGIN;

SELECT set_config('tidum.rls_mode', 'system', true),
       set_config('tidum.kommune_id', '', true),
       set_config('tidum.rls_system_operation', 'migration_088', true);

DO $$ BEGIN
  CREATE TYPE tidum_barnevern_melding_prioritet AS ENUM ('akutt', 'normal');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE tidum_barnevern_meldinger
  ADD COLUMN IF NOT EXISTS prioritet tidum_barnevern_melding_prioritet NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS ufodt_barn BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS termindato DATE,
  ADD COLUMN IF NOT EXISTS forelder_melding_id UUID,
  ADD COLUMN IF NOT EXISTS soskenkopi_av_melding_id UUID;

-- Ufødt barn har termindato, ikke fødselsnummer.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'tidum_barnevern_meldinger'::regclass
       AND conname = 'tidum_barnevern_meldinger_ufodt_check'
  ) THEN
    ALTER TABLE tidum_barnevern_meldinger
      ADD CONSTRAINT tidum_barnevern_meldinger_ufodt_check
      CHECK (NOT (ufodt_barn AND barn_fodselsnummer IS NOT NULL));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'tidum_barnevern_meldinger'::regclass
       AND conname = 'tidum_barnevern_meldinger_forelder_kommune_fkey'
  ) THEN
    ALTER TABLE tidum_barnevern_meldinger
      ADD CONSTRAINT tidum_barnevern_meldinger_forelder_kommune_fkey
      FOREIGN KEY (forelder_melding_id, kommune_id)
      REFERENCES tidum_barnevern_meldinger (id, kommune_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'tidum_barnevern_meldinger'::regclass
       AND conname = 'tidum_barnevern_meldinger_soskenkopi_kommune_fkey'
  ) THEN
    ALTER TABLE tidum_barnevern_meldinger
      ADD CONSTRAINT tidum_barnevern_meldinger_soskenkopi_kommune_fkey
      FOREIGN KEY (soskenkopi_av_melding_id, kommune_id)
      REFERENCES tidum_barnevern_meldinger (id, kommune_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS tidum_barnevern_meldinger_forelder_idx
  ON tidum_barnevern_meldinger (kommune_id, forelder_melding_id)
  WHERE forelder_melding_id IS NOT NULL;

-- Append-only revisjonslogg for kontrollert redigering: hvem endret hva,
-- når og hvorfor, med før-/etterverdier per felt.
CREATE TABLE IF NOT EXISTS tidum_barnevern_melding_revisjoner (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  melding_id        UUID NOT NULL,
  kommune_id        INTEGER NOT NULL,
  begrunnelse       TEXT NOT NULL,
  felt_endringer    JSONB NOT NULL,
  endret_av_user_id VARCHAR NOT NULL REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tidum_barnevern_melding_revisjoner_melding_fk
    FOREIGN KEY (melding_id, kommune_id)
    REFERENCES tidum_barnevern_meldinger (id, kommune_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS tidum_barnevern_melding_revisjoner_melding_idx
  ON tidum_barnevern_melding_revisjoner (kommune_id, melding_id, created_at);

-- Append-only: kun SELECT og INSERT for app-rollen.
GRANT SELECT, INSERT ON TABLE tidum_barnevern_melding_revisjoner TO pg_database_owner;

ALTER TABLE tidum_barnevern_melding_revisjoner ENABLE ROW LEVEL SECURITY;
ALTER TABLE tidum_barnevern_melding_revisjoner FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tidum_kommune_isolation ON tidum_barnevern_melding_revisjoner;
CREATE POLICY tidum_kommune_isolation ON tidum_barnevern_melding_revisjoner
  FOR ALL
  USING (tidum_rls_kommune_allowed(kommune_id))
  WITH CHECK (tidum_rls_kommune_allowed(kommune_id));

COMMIT;
