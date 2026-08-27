-- Dormant Elements-provider for Noark 5 tjenestegrensesnitt 1.1.
-- Existing Documaster rows retain their current transport contract. Elements
-- rows are only valid when the idempotency key and required connection fields
-- are explicit; application-level verification still has to succeed before
-- status can be set to active.

ALTER TABLE archive_configs
  ADD COLUMN IF NOT EXISTS contract_profile TEXT NOT NULL
    DEFAULT 'documaster-noark5-ws-v1';

ALTER TABLE archive_configs
  ADD COLUMN IF NOT EXISTS external_id_metadata_key TEXT;

UPDATE archive_configs
   SET contract_profile = 'documaster-noark5-ws-v1'
 WHERE provider = 'documaster'
   AND contract_profile IS DISTINCT FROM 'documaster-noark5-ws-v1';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'archive_configs'::regclass
       AND conname = 'archive_configs_elements_contract_check'
  ) THEN
    ALTER TABLE archive_configs
      ADD CONSTRAINT archive_configs_elements_contract_check
      CHECK (
        provider <> 'elements'
        OR (
          contract_profile = 'elements-noark5-tg-1.1'
          AND token_url IS NOT NULL
          AND arkivdel_id IS NOT NULL
          AND external_id_metadata_key IS NOT NULL
          AND external_id_metadata_key ~ '^vnd-[a-z0-9-]+-v[0-9]+:[a-z0-9]+$'
        )
      );
  END IF;
END $$;
