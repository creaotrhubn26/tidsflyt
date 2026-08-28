-- migrations/099_push_parity.sql
-- Frisk-database-paritet: en base etablert med `drizzle db:push` får
-- tabellene fra shared/schema.ts, som mangler kompositt-nøklene og
-- enkelte constraints som ellers bare finnes i migrasjonenes
-- CREATE TABLE (og dermed hoppes over av IF NOT EXISTS). Denne samler
-- alt appkoden faktisk avhenger av — idempotent, trygg på begge
-- etableringsveier.

BEGIN;

SELECT set_config('tidum.rls_mode', 'system', true),
       set_config('tidum.kommune_id', '', true),
       set_config('tidum.rls_system_operation', 'migration_099', true);

-- Arkiv-outboxens idempotensnøkkel (ON CONFLICT-mål i archive-service).
CREATE UNIQUE INDEX IF NOT EXISTS archive_entries_entity_uidx
  ON archive_entries (entity_type, entity_id);

-- Tenantbærende komposittnøkler som composite-FK-er og ON CONFLICT
-- refererer.
CREATE UNIQUE INDEX IF NOT EXISTS tidum_barnevern_saker_id_kommune_uidx
  ON tidum_barnevern_saker (id, kommune_id);
CREATE UNIQUE INDEX IF NOT EXISTS tidum_barnevern_sak_journal_id_kommune_uidx
  ON tidum_barnevern_sak_journal (id, kommune_id);
CREATE UNIQUE INDEX IF NOT EXISTS tidum_barnevern_planer_id_kommune_uidx
  ON tidum_barnevern_planer (id, kommune_id);
CREATE UNIQUE INDEX IF NOT EXISTS tidum_barnevern_forebyggende_id_kommune_uidx
  ON tidum_barnevern_forebyggende (id, kommune_id);
CREATE UNIQUE INDEX IF NOT EXISTS tidum_secure_parties_id_kommune_uidx
  ON tidum_secure_parties (id, kommune_id);
CREATE UNIQUE INDEX IF NOT EXISTS tidum_secure_case_access_id_kommune_uidx
  ON tidum_secure_case_access (id, kommune_id);

-- Én innsending per kommune per rapportdato (ON CONFLICT-mål i
-- barnevernsregister-motoren).
CREATE UNIQUE INDEX IF NOT EXISTS tidum_bvr_innsendinger_kommune_dato_uidx
  ON tidum_barnevernsregister_innsendinger (kommune_id, rapportdato);

-- Barnetabellene under saks-/meldings-/plangrafen skal ryddes via CASCADE
-- (append-only-tabellene har bevisst ingen DELETE-grant). Migrasjonene
-- definerer dette; push-bygde baser fikk drizzles enkle FK-er uten
-- cascade. Normaliser: dropp FK-er mot forelderen som mangler cascade og
-- legg migrasjonens kompositt-cascade-FK.
DO $$
DECLARE
  spec RECORD;
  fk RECORD;
BEGIN
  FOR spec IN SELECT * FROM (VALUES
    ('tidum_barnevern_sak_fase_historikk', 'tidum_barnevern_saker',   'sak_id'),
    ('tidum_barnevern_sak_journal',        'tidum_barnevern_saker',   'sak_id'),
    ('tidum_barnevern_planer',             'tidum_barnevern_saker',   'sak_id'),
    ('tidum_barnevern_dokumenter',         'tidum_barnevern_saker',   'sak_id'),
    ('tidum_barnevern_innsynskrav',        'tidum_barnevern_saker',   'sak_id'),
    ('tidum_barnevern_melding_revisjoner', 'tidum_barnevern_meldinger', 'melding_id'),
    ('tidum_barnevern_sak_journal_vedlegg','tidum_barnevern_sak_journal', 'journal_entry_id'),
    ('tidum_barnevern_plan_tiltak',        'tidum_barnevern_planer',  'plan_id'),
    ('tidum_barnevern_forebyggende_aktiviteter', 'tidum_barnevern_forebyggende', 'forebyggende_id')
  ) AS t(barn, forelder, kolonne)
  LOOP
    FOR fk IN
      SELECT conname FROM pg_constraint
       WHERE conrelid = spec.barn::regclass
         AND confrelid = spec.forelder::regclass
         AND contype = 'f'
         AND confdeltype <> 'c'
    LOOP
      EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', spec.barn, fk.conname);
    END LOOP;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conrelid = spec.barn::regclass
         AND confrelid = spec.forelder::regclass
         AND contype = 'f' AND confdeltype = 'c'
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I, kommune_id) REFERENCES %I (id, kommune_id) ON DELETE CASCADE',
        spec.barn, spec.barn || '_parity_fk', spec.kolonne, spec.forelder
      );
    END IF;
  END LOOP;
END $$;

COMMIT;
