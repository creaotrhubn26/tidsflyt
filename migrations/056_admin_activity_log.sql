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

INSERT INTO tidum_permission_seed_log (permission_key) VALUES ('activity_log.view')
ON CONFLICT (permission_key) DO NOTHING;
