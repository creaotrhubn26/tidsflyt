-- migrations/102_barnevern_delegasjon_breakglass.sql
-- Krav 15-rest: kontrollerte unntak fra need-to-know.
--  * 'delegasjon': ved fravær ser stedfortreder (til_user) sakene til
--    fraværende saksbehandler (fra_user) i et tidsrom. Opprettes kun av
--    barnevernsleder, med obligatorisk begrunnelse.
--  * 'break_glass': nødtilgang til ÉN konkret sak (sak_id) i kort
--    tidsrom, selvbetjent med obligatorisk begrunnelse — høylytt
--    auditlogget og synlig i leders revisorflate.
-- Radene oppheves (opphevet_at), aldri slettes — de er tilgangsbevis.
-- I tillegg: skjermet adresse-markør på saken (krav 15/22) — opplysninger
-- om bosted skal ikke utleveres; håndheves som markør i uttrekk/utlevering.

BEGIN;

SELECT set_config('tidum.rls_mode', 'system', true),
       set_config('tidum.kommune_id', '', true),
       set_config('tidum.rls_system_operation', 'migration_102', true);

CREATE TABLE IF NOT EXISTS tidum_barnevern_tilgangsdelegasjoner (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kommune_id   INTEGER NOT NULL,
  type         TEXT NOT NULL CHECK (type IN ('delegasjon', 'break_glass')),
  fra_user_id  VARCHAR REFERENCES users(id),
  til_user_id  VARCHAR NOT NULL REFERENCES users(id),
  sak_id       UUID,
  begrunnelse  TEXT NOT NULL,
  fra_dato     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  til_dato     TIMESTAMPTZ NOT NULL,
  opprettet_av VARCHAR NOT NULL REFERENCES users(id),
  opphevet_av  VARCHAR REFERENCES users(id),
  opphevet_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tidum_bv_delegasjon_shape CHECK (
    (type = 'delegasjon' AND fra_user_id IS NOT NULL AND sak_id IS NULL)
    OR (type = 'break_glass' AND sak_id IS NOT NULL)
  ),
  CONSTRAINT tidum_bv_delegasjon_periode CHECK (til_dato > fra_dato),
  CONSTRAINT tidum_bv_delegasjon_sak_fk
    FOREIGN KEY (sak_id, kommune_id)
    REFERENCES tidum_barnevern_saker(id, kommune_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS tidum_bv_delegasjon_aktiv_idx
  ON tidum_barnevern_tilgangsdelegasjoner (kommune_id, til_user_id, til_dato)
  WHERE opphevet_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE tidum_barnevern_tilgangsdelegasjoner TO pg_database_owner;

ALTER TABLE tidum_barnevern_tilgangsdelegasjoner ENABLE ROW LEVEL SECURITY;
ALTER TABLE tidum_barnevern_tilgangsdelegasjoner FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tidum_kommune_isolation ON tidum_barnevern_tilgangsdelegasjoner;
CREATE POLICY tidum_kommune_isolation ON tidum_barnevern_tilgangsdelegasjoner
  FOR ALL
  USING (tidum_rls_kommune_allowed(kommune_id))
  WITH CHECK (tidum_rls_kommune_allowed(kommune_id));

-- Tilgangsloggen får handlingen 'endret' for delegasjon/break-glass/
-- skjermingshendelser (fortsatt append-only).
ALTER TABLE tidum_barnevern_tilgangslogg DROP CONSTRAINT IF EXISTS tidum_barnevern_tilgangslogg_handling_check;
ALTER TABLE tidum_barnevern_tilgangslogg ADD CONSTRAINT tidum_barnevern_tilgangslogg_handling_check
  CHECK (handling IN ('lest', 'nedlastet', 'endret'));

ALTER TABLE tidum_barnevern_saker ADD COLUMN IF NOT EXISTS adresse_skjermet BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tidum_barnevern_saker ADD COLUMN IF NOT EXISTS adresse_skjermet_merknad TEXT;

COMMIT;
