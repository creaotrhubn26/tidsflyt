-- Migration 044: vendor_seat_log
--
-- Audit-spor for seat-overrun-hendelser utenfor import-konteksten. Når
-- en vendor passerer max_users (uavhengig av kilde — manuell invite,
-- daglig cron-sweep, API-kall), logger vi her med før/etter-tall og
-- Stripe-bump-resultat.
--
-- Brukes av:
--   - server/lib/seat-overrun.ts (processVendorSeatOverrun)
--   - server/routes/seat-overrun-cron.ts (daglig sweep 03:00)

CREATE TABLE IF NOT EXISTS vendor_seat_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id       INTEGER NOT NULL,
  occurred_at     TIMESTAMP DEFAULT now(),
  source          TEXT NOT NULL CHECK (source IN ('cron','import','manual_invite','api','approval')),

  -- Tilstand før bump
  prev_users      INTEGER NOT NULL,
  prev_max_users  INTEGER,
  prev_tier_slug  TEXT,

  -- Tilstand etter bump (null hvis ingen tier matchet eller ikke endret)
  new_users       INTEGER NOT NULL,
  new_max_users   INTEGER,
  new_tier_slug   TEXT,
  new_tier_id     INTEGER,

  -- Stripe-resultat fra bumpStripeSubscriptionToNewTier
  stripe_result   JSONB,

  -- Trigget av (hvis kjent — kun for non-cron)
  triggered_by    TEXT
);

CREATE INDEX IF NOT EXISTS idx_vendor_seat_log_vendor    ON vendor_seat_log(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_seat_log_occurred  ON vendor_seat_log(occurred_at DESC);
