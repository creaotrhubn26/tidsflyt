-- CMS-et styrer Tidums globale leverandørflate, ikke en kundes tenant.
-- Tilgang gis derfor som en eksplisitt global tillatelse og seedes kun én
-- gang til super_admin. Etterfølgende manuelle endringer skal ikke reverseres
-- av at oppstartsmigrasjonene kjøres idempotent på nytt.

CREATE TABLE IF NOT EXISTS tidum_permission_seed_log (
  permission_key VARCHAR PRIMARY KEY,
  seeded_at TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO tidum_permissions (key, label, module) VALUES
  ('cms.manage', 'Administrere globalt CMS', 'systemadministrasjon')
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  module = EXCLUDED.module;

INSERT INTO tidum_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM tidum_roles r, tidum_permissions p
WHERE r.name = 'super_admin'
  AND r.scope = 'global'
  AND r.is_system_default = true
  AND p.key = 'cms.manage'
  AND NOT EXISTS (
    SELECT 1 FROM tidum_permission_seed_log WHERE permission_key = 'cms.manage'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO tidum_permission_seed_log (permission_key)
SELECT 'cms.manage'
FROM tidum_roles r, tidum_permissions p
WHERE r.name = 'super_admin'
  AND r.scope = 'global'
  AND r.is_system_default = true
  AND p.key = 'cms.manage'
ON CONFLICT (permission_key) DO NOTHING;
