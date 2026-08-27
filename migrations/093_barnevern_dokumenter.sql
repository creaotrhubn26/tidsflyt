-- migrations/093_barnevern_dokumenter.sql
-- Krav 6: malstyrte brev og vedtak på den kommunale barnevernssaken.
-- Malinnholdet flettes og SNAPSHOTTES inn i dokumentet ved opprettelse —
-- senere malendringer rører aldri utstedte dokumenter. Ekspedering
-- journalfører dokumentet (kategori 'vedtak'/'notat'), som igjen går i
-- arkiv-outboxen (krav 4-mekanikken).

BEGIN;

SELECT set_config('tidum.rls_mode', 'system', true),
       set_config('tidum.kommune_id', '', true),
       set_config('tidum.rls_system_operation', 'migration_093', true);

CREATE TABLE IF NOT EXISTS tidum_barnevern_dokumenter (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kommune_id       INTEGER NOT NULL,
  sak_id           UUID NOT NULL,
  dokumenttype     TEXT NOT NULL CHECK (dokumenttype IN ('vedtak', 'brev')),
  mal_id           TEXT NOT NULL,
  tittel           TEXT NOT NULL,
  hjemmel          TEXT,
  innhold          TEXT NOT NULL,
  mottaker         JSONB,
  plan_id          UUID,
  status           TEXT NOT NULL DEFAULT 'utkast' CHECK (status IN ('utkast', 'godkjent', 'ekspedert')),
  godkjent_av      VARCHAR REFERENCES users(id),
  godkjent_dato    TIMESTAMPTZ,
  ekspedert_dato   TIMESTAMPTZ,
  ekspedert_via    TEXT CHECK (ekspedert_via IN ('sikker_dialog', 'manuell')),
  journal_entry_id UUID,
  opprettet_av     VARCHAR NOT NULL REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tidum_barnevern_dokumenter_sak_fk
    FOREIGN KEY (sak_id, kommune_id)
    REFERENCES tidum_barnevern_saker (id, kommune_id)
    ON DELETE CASCADE,
  CONSTRAINT tidum_barnevern_dokumenter_plan_fk
    FOREIGN KEY (plan_id, kommune_id)
    REFERENCES tidum_barnevern_planer (id, kommune_id),
  -- Vedtak skal alltid ha hjemmel.
  CONSTRAINT tidum_barnevern_dokumenter_hjemmel_check CHECK (
    dokumenttype <> 'vedtak' OR hjemmel IS NOT NULL
  ),
  CONSTRAINT tidum_barnevern_dokumenter_godkjent_check CHECK (
    (status IN ('godkjent', 'ekspedert') AND godkjent_av IS NOT NULL AND godkjent_dato IS NOT NULL)
    OR status = 'utkast'
  ),
  CONSTRAINT tidum_barnevern_dokumenter_ekspedert_check CHECK (
    (status = 'ekspedert' AND ekspedert_dato IS NOT NULL AND ekspedert_via IS NOT NULL)
    OR status <> 'ekspedert'
  )
);

CREATE INDEX IF NOT EXISTS tidum_barnevern_dokumenter_sak_idx
  ON tidum_barnevern_dokumenter (kommune_id, sak_id, created_at);

GRANT SELECT, INSERT, UPDATE ON TABLE tidum_barnevern_dokumenter TO pg_database_owner;

ALTER TABLE tidum_barnevern_dokumenter ENABLE ROW LEVEL SECURITY;
ALTER TABLE tidum_barnevern_dokumenter FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tidum_kommune_isolation ON tidum_barnevern_dokumenter;
CREATE POLICY tidum_kommune_isolation ON tidum_barnevern_dokumenter
  FOR ALL
  USING (tidum_rls_kommune_allowed(kommune_id))
  WITH CHECK (tidum_rls_kommune_allowed(kommune_id));

COMMIT;
