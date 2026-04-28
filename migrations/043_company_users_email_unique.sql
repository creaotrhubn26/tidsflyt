-- Migration 043: UNIQUE-constraint på (vendor_id, user_email) i company_users
--
-- Forhindrer duplikat-konti per leverandør, både ved samtidig import og ved
-- manuell innsetting. Importeren (planlagt i 042) er avhengig av denne for å
-- kunne stole på idempotency uten race conditions.
--
-- Daniel (super_admin) bekreftet 2026-04-28 at det ikke finnes viktige
-- brukere utover ham selv, så aggressiv rydding er trygg her.

-- Steg 1: Rydd eventuelle duplikater (behold raden med lavest id per
-- vendor_id + user_email — typisk den eldste).
DELETE FROM company_users a
USING company_users b
WHERE a.id > b.id
  AND a.vendor_id IS NOT DISTINCT FROM b.vendor_id
  AND a.user_email = b.user_email;

-- Steg 2: Legg til UNIQUE-constraint. Bruker COALESCE-trick for å håndtere
-- vendor_id IS NULL — uten det vil PostgreSQL behandle to NULL-rader som
-- forskjellige og slippe gjennom duplikater.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_company_users_email_per_vendor
  ON company_users(COALESCE(vendor_id, 0), lower(user_email));
