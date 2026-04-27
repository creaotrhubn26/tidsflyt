-- Migration 037: Revenue analytics + lead source attribution
--
-- Bygger inntektssporing:
--   1. UTM-felt + referrer på access_requests for å spore HVOR leadet kom fra
--   2. revenue_events — append-only logg over hver MRR-endring (signup,
--      upgrade, downgrade, churn, expansion). Brukes for ARR-historikk,
--      cohort-analyse og inntekts-attribusjon.
--
-- Idempotent: kjøres på hver server-startup.

ALTER TABLE access_requests
  ADD COLUMN IF NOT EXISTS source              TEXT,
  ADD COLUMN IF NOT EXISTS utm_source          TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium          TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign        TEXT,
  ADD COLUMN IF NOT EXISTS utm_content         TEXT,
  ADD COLUMN IF NOT EXISTS utm_term            TEXT,
  ADD COLUMN IF NOT EXISTS referrer            TEXT,
  ADD COLUMN IF NOT EXISTS landing_path        TEXT,
  ADD COLUMN IF NOT EXISTS signed_at           TIMESTAMP,
  ADD COLUMN IF NOT EXISTS first_payment_at    TIMESTAMP,
  ADD COLUMN IF NOT EXISTS mrr_ore_snapshot    INTEGER,
  ADD COLUMN IF NOT EXISTS arr_ore_snapshot    INTEGER;

CREATE INDEX IF NOT EXISTS idx_access_req_source
  ON access_requests(source);
CREATE INDEX IF NOT EXISTS idx_access_req_utm_source
  ON access_requests(utm_source);
CREATE INDEX IF NOT EXISTS idx_access_req_signed_at
  ON access_requests(signed_at);

CREATE TABLE IF NOT EXISTS revenue_events (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER REFERENCES access_requests(id) ON DELETE SET NULL,
  customer_email TEXT NOT NULL,
  customer_company TEXT,
  event_type TEXT NOT NULL,            -- 'signup' | 'upgrade' | 'downgrade' | 'churn' | 'expansion' | 'reactivation'
  delta_mrr_ore BIGINT NOT NULL,       -- positive for increase, negative for decrease
  mrr_after_ore BIGINT NOT NULL,       -- snapshot of customer MRR after event
  tier_id INTEGER REFERENCES pricing_tiers(id),
  source TEXT,                         -- copied from lead at signup for cohort attribution
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  occurred_at TIMESTAMP NOT NULL DEFAULT NOW(),
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_revenue_events_customer
  ON revenue_events(customer_email);
CREATE INDEX IF NOT EXISTS idx_revenue_events_occurred
  ON revenue_events(occurred_at);
CREATE INDEX IF NOT EXISTS idx_revenue_events_type
  ON revenue_events(event_type, occurred_at);
CREATE INDEX IF NOT EXISTS idx_revenue_events_lead
  ON revenue_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_revenue_events_source
  ON revenue_events(source);
