CREATE TABLE IF NOT EXISTS tidum_admin_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL,
  event_type VARCHAR NOT NULL CHECK (event_type IN ('mutation', 'page_view')),
  method VARCHAR,
  path TEXT NOT NULL,
  status_code INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tidum_admin_activity_log_user_id
  ON tidum_admin_activity_log (user_id);
CREATE INDEX IF NOT EXISTS idx_tidum_admin_activity_log_created_at
  ON tidum_admin_activity_log (created_at DESC);

-- Engangs-frø-merke: se spec-ens "Datamodell"-seksjon for hvorfor dette IKKE
-- kan gjenbruke migrations/054s tabellbrede "er tom"-vakt (den tabellen er
-- aldri tom etter at 054 selv har kjørt — vakten ville aldri utløst for en
-- NY tillatelse lagt til her, og uten NOEN vakt ville denne migrasjonen
-- stille gjenopprettet activity_log.view for super_admin på hvert oppstart
-- etter at en admin eksplisitt fjernet den).
-- Kjent begrensning: merket er kun nøkkelet på permission_key, ikke på
-- (role, permission_key) — hvis en fremtidig migrasjon noensinne vil seede
-- SAMME tillatelse til en ANDRE rolle etter at den første tildelingen
-- allerede har skjedd, vil dette merket feilaktig undertrykke det. Ikke et
-- problem i dag (kun én rolle seedes noensinne per tillatelse så langt),
-- bare en dokumentert grense for fremtidige lesere.
CREATE TABLE IF NOT EXISTS tidum_permission_seed_log (
  permission_key VARCHAR PRIMARY KEY,
  seeded_at TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO tidum_permissions (key, label, module) VALUES
  ('activity_log.view', 'Se aktivitetslogg', 'systemadministrasjon')
ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label, module = EXCLUDED.module;

INSERT INTO tidum_role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM tidum_roles r, tidum_permissions p
WHERE r.name = 'super_admin' AND r.scope = 'global' AND p.key = 'activity_log.view'
  AND NOT EXISTS (SELECT 1 FROM tidum_permission_seed_log WHERE permission_key = 'activity_log.view')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Merket skrives kun når tildelingen over faktisk hadde en rolle/tillatelse
-- å handle på (samme WHERE-match som tildelingen selv) — IKKE ubetinget.
-- Hvis tidum_roles mangler super_admin/global-raden i det øyeblikket denne
-- migrasjonen kjører (f.eks. fordi 054 feilet på et gitt miljø —
-- run-startup-migrations.ts fanger en feilet migrasjon og fortsetter til
-- neste i stedet for å stoppe), matcher SELECT-en null rader, ingenting
-- tildeles, og merket skal DA heller ikke skrives — ellers ville denne
-- tillatelsen aldri kunne tildeles på det miljøet igjen, selv etter at 054
-- er fikset og kjørt på nytt ved en senere oppstart.
INSERT INTO tidum_permission_seed_log (permission_key)
SELECT 'activity_log.view'
FROM tidum_roles r, tidum_permissions p
WHERE r.name = 'super_admin' AND r.scope = 'global' AND p.key = 'activity_log.view'
ON CONFLICT (permission_key) DO NOTHING;
