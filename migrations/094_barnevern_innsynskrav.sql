-- migrations/094_barnevern_innsynskrav.sql
-- Krav 16: innsynsbegjæring på kommunal barnevernssak — mottak,
-- partsstatus, unntak/sladding (fvl. § 19), lederbeslutning med
-- begrunnelse, behandlingsfrist i fristmotoren, kontrollert utlevering
-- og klageflyt til statsforvalteren.

BEGIN;

SELECT set_config('tidum.rls_mode', 'system', true),
       set_config('tidum.kommune_id', '', true),
       set_config('tidum.rls_system_operation', 'migration_094', true);

CREATE TABLE IF NOT EXISTS tidum_barnevern_innsynskrav (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kommune_id            INTEGER NOT NULL,
  sak_id                UUID NOT NULL,
  part_navn             TEXT NOT NULL,
  part_relasjon         TEXT NOT NULL CHECK (part_relasjon IN ('forelder', 'barn', 'verge', 'fullmektig', 'annet')),
  mottatt_dato          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  behandlingsfrist      TIMESTAMPTZ NOT NULL,
  status                TEXT NOT NULL DEFAULT 'mottatt' CHECK (status IN (
                          'mottatt', 'innvilget', 'delvis_innvilget', 'avslatt',
                          'utlevert', 'klage_mottatt', 'oversendt_klageinstans'
                        )),
  -- [{hjemmel, beskrivelse}] — dokumenter/opplysninger unntatt fra innsyn.
  unntak                JSONB NOT NULL DEFAULT '[]',
  beslutning_begrunnelse TEXT,
  besluttet_av          VARCHAR REFERENCES users(id),
  besluttet_dato        TIMESTAMPTZ,
  utlevert_dato         TIMESTAMPTZ,
  utlevert_via          TEXT CHECK (utlevert_via IN ('sikker_dialog', 'utskrift', 'manuell')),
  klage_mottatt_dato    TIMESTAMPTZ,
  klage_oversendt_dato  TIMESTAMPTZ,
  klage_notat           TEXT,
  opprettet_av          VARCHAR NOT NULL REFERENCES users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tidum_barnevern_innsynskrav_sak_fk
    FOREIGN KEY (sak_id, kommune_id)
    REFERENCES tidum_barnevern_saker (id, kommune_id)
    ON DELETE CASCADE,
  CONSTRAINT tidum_barnevern_innsynskrav_beslutning_check CHECK (
    (status = 'mottatt') = (besluttet_av IS NULL AND besluttet_dato IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS tidum_barnevern_innsynskrav_sak_idx
  ON tidum_barnevern_innsynskrav (kommune_id, sak_id, created_at);

GRANT SELECT, INSERT, UPDATE ON TABLE tidum_barnevern_innsynskrav TO pg_database_owner;

ALTER TABLE tidum_barnevern_innsynskrav ENABLE ROW LEVEL SECURITY;
ALTER TABLE tidum_barnevern_innsynskrav FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tidum_kommune_isolation ON tidum_barnevern_innsynskrav;
CREATE POLICY tidum_kommune_isolation ON tidum_barnevern_innsynskrav
  FOR ALL
  USING (tidum_rls_kommune_allowed(kommune_id))
  WITH CHECK (tidum_rls_kommune_allowed(kommune_id));

COMMIT;
