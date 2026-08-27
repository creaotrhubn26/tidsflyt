-- Documaster kan bruke en separat identitetsleverandør for OAuth2-token.
-- Feltet er valgfritt: uten verdi brukes standardstien under base_url.
-- URL-en valideres mot samme HTTPS-/vertsallowlist som arkiv-API-et før
-- lagring og hver gang den brukes.

ALTER TABLE archive_configs
  ADD COLUMN IF NOT EXISTS token_url TEXT;
