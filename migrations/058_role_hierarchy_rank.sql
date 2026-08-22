ALTER TABLE tidum_roles ADD COLUMN IF NOT EXISTS rank INTEGER NOT NULL DEFAULT 0;

-- Speiler shared/roles.ts sin MANAGEABLE_BY_ROLE-tabell eksakt (fase 1.6).
-- tiltaksleder/teamleder/case_manager har SAMME rang med hensikt — de er
-- likestilte og skal ikke kunne administrere hverandre (target.rank <
-- actor.rank er alltid usann når rangene er like).
INSERT INTO tidum_roles (name, scope, is_system_default, rank) VALUES
  ('super_admin', 'global', TRUE, 90),
  ('hovedadmin', 'global', TRUE, 80),
  ('vendor_admin', 'global', TRUE, 70),
  ('tiltaksleder', 'global', TRUE, 60),
  ('teamleder', 'global', TRUE, 60),
  ('case_manager', 'global', TRUE, 60),
  ('miljoarbeider', 'global', TRUE, 0),
  ('prototype_tester', 'global', TRUE, 0),
  ('member', 'global', TRUE, 0),
  ('user', 'global', TRUE, 0)
ON CONFLICT (scope, COALESCE(vendor_id, -1), name)
  DO UPDATE SET rank = EXCLUDED.rank;
