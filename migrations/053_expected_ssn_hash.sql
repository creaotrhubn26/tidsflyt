-- Lar en super admin forhåndsregistrere hvilket fødselsnummer en konto
-- forventes koblet til, FØR personen noensinne har logget inn med eID.
-- Samme HMAC-SHA256-hash (EID_SSN_HASH_PEPPER) som eid_identities.ssn_hash
-- bruker, aldri fødselsnummeret i klartekst.
--
-- Når personen første gang logger inn med BankID eller Buypass, matcher
-- innloggingen denne hashen direkte hvis ingen eid_identities-rad finnes
-- ennå — se resolveUserByEidIdentity() i server/eid-auth.ts.

ALTER TABLE users ADD COLUMN IF NOT EXISTS expected_ssn_hash TEXT;

-- Delvis unik: tillater vilkårlig mange NULL-rader (de fleste brukere har
-- ingen forhåndsregistrert fnr), men hindrer at samme fødselsnummer
-- forhåndsregistreres på to forskjellige kontoer ved en feil.
CREATE UNIQUE INDEX IF NOT EXISTS users_expected_ssn_hash_key
  ON users (expected_ssn_hash)
  WHERE expected_ssn_hash IS NOT NULL;
