ALTER TABLE tidum_roles ADD COLUMN IF NOT EXISTS rank INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tidum_roles ADD COLUMN IF NOT EXISTS can_manage_others BOOLEAN NOT NULL DEFAULT FALSE;

-- Speiler shared/roles.ts sin MANAGEABLE_BY_ROLE-tabell eksakt (fase 1.6).
-- tiltaksleder/teamleder/case_manager har SAMME rang med hensikt — de er
-- likestilte og skal ikke kunne administrere hverandre (target.rank <
-- actor.rank er alltid usann når rangene er like).
--
-- prototype_tester får rank 85 (mellom hovedadmin=80 og super_admin=90) og
-- can_manage_others=FALSE: den asymmetrien — kun super_admin kan administrere
-- den, men den kan selv aldri administrere noen — kan IKKE uttrykkes med rank
-- alene (bevist under fixround 1, se task-1-report.md). rank styrer om rollen
-- KAN BLI administrert av noen med høyere rank; can_manage_others styrer om
-- rollen i det hele tatt har lov til å administrere andre.
INSERT INTO tidum_roles (name, scope, is_system_default, rank, can_manage_others) VALUES
  ('super_admin', 'global', TRUE, 90, TRUE),
  ('hovedadmin', 'global', TRUE, 80, TRUE),
  ('vendor_admin', 'global', TRUE, 70, TRUE),
  ('tiltaksleder', 'global', TRUE, 60, TRUE),
  ('teamleder', 'global', TRUE, 60, TRUE),
  ('case_manager', 'global', TRUE, 60, TRUE),
  ('prototype_tester', 'global', TRUE, 85, FALSE),
  ('miljoarbeider', 'global', TRUE, 0, FALSE),
  ('member', 'global', TRUE, 0, FALSE),
  ('user', 'global', TRUE, 0, FALSE)
ON CONFLICT (scope, COALESCE(vendor_id, -1), name)
  DO UPDATE SET rank = EXCLUDED.rank, can_manage_others = EXCLUDED.can_manage_others;
