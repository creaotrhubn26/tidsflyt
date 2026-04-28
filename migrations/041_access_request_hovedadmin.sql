-- Migration 041: Hovedadmin-felter på access_requests
--
-- Lar forespørrer angi om de selv blir hovedadmin for sin Tidum-konto,
-- eller hvem som skal være det. super_admin (Daniel) bruker dette under
-- godkjenning til å sende invitasjonen til riktig adresse.
--
-- Default is_hovedadmin = TRUE — eksisterende rader (forespørsler innsendt
-- før dette feltet eksisterte) antas å være sin egen hovedadmin.

ALTER TABLE access_requests
  ADD COLUMN IF NOT EXISTS is_hovedadmin BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS alt_hovedadmin_name TEXT,
  ADD COLUMN IF NOT EXISTS alt_hovedadmin_email TEXT;
