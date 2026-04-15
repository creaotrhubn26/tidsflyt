-- Migration 033: Avvik / HMS-rapportering
-- Miljøarbeidere registrerer avvik (hendelser, skader, rutinebrudd) direkte i rapport-flyten
-- eller som standalone. Tiltaksleder følger opp, dokumenterer og lukker.
-- GDPR-auto-replace markeres per avvik.

CREATE TABLE IF NOT EXISTS rapport_avvik (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id                  INTEGER NOT NULL,
  user_id                    TEXT NOT NULL,            -- rapportør
  rapport_id                 UUID,                     -- nullable — kan stå alene
  sak_id                     UUID,
  institution_id             UUID,

  date_occurred              DATE NOT NULL,
  time_occurred              TIME,
  location                   TEXT,

  severity                   TEXT NOT NULL,            -- 'lav' | 'middels' | 'hoy' | 'kritisk'
  category                   TEXT NOT NULL,            -- 'vold_trusler' | 'egen_skade' | 'andre_skade' | 'rutinebrudd' | 'klientrelatert' | 'arbeidsmiljo' | 'annet'

  description                TEXT NOT NULL,
  immediate_action           TEXT,                     -- hva ble gjort i øyeblikket
  follow_up_needed           BOOLEAN NOT NULL DEFAULT false,
  witnesses                  JSONB DEFAULT '[]'::jsonb, -- [{name, role}]
  persons_involved           JSONB DEFAULT '[]'::jsonb, -- [{name, role, redacted}]
  attachments                JSONB DEFAULT '[]'::jsonb,

  -- GDPR
  gdpr_auto_replaced         BOOLEAN NOT NULL DEFAULT false,
  original_description       TEXT,                     -- hvis auto-replace er kjørt

  -- Status og oppfølging
  status                     TEXT NOT NULL DEFAULT 'rapportert', -- 'rapportert' | 'under_behandling' | 'lukket'
  tiltaksleder_kommentar     TEXT,
  tiltaksleder_lukket_av     TEXT,
  tiltaksleder_lukket_at     TIMESTAMP,

  -- Varsling
  notified_at                TIMESTAMP,                -- når tiltaksleder sist ble varslet

  created_at                 TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rapport_avvik_vendor_status ON rapport_avvik(vendor_id, status) WHERE status != 'lukket';
CREATE INDEX IF NOT EXISTS idx_rapport_avvik_user ON rapport_avvik(user_id);
CREATE INDEX IF NOT EXISTS idx_rapport_avvik_rapport ON rapport_avvik(rapport_id) WHERE rapport_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rapport_avvik_sak ON rapport_avvik(sak_id) WHERE sak_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rapport_avvik_date ON rapport_avvik(vendor_id, date_occurred DESC);
CREATE INDEX IF NOT EXISTS idx_rapport_avvik_severity ON rapport_avvik(vendor_id, severity)
  WHERE severity IN ('hoy', 'kritisk');

-- Protokoll-maler per vendor (valgfritt — kan brukes senere for kundetilpassede spørsmål)
CREATE TABLE IF NOT EXISTS vendor_avvik_protokoller (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id           INTEGER NOT NULL,
  institution_id      UUID,                      -- nullable — per institusjon eller vendor-wide
  name                TEXT NOT NULL,
  categories          JSONB NOT NULL DEFAULT '[]'::jsonb, -- kategorier og spørsmål per kategori
  additional_fields   JSONB DEFAULT '[]'::jsonb, -- ekstra felter å spørre om
  require_witness     BOOLEAN DEFAULT false,
  escalation_email    TEXT,                      -- direkte varsling ved 'kritisk'
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_by          TEXT,
  created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendor_avvik_protokoller_vendor ON vendor_avvik_protokoller(vendor_id) WHERE is_active = true;
