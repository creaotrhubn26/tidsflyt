CREATE TABLE IF NOT EXISTS tidum_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR NOT NULL UNIQUE,
  label TEXT NOT NULL,
  module VARCHAR NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tidum_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR NOT NULL,
  scope VARCHAR NOT NULL,
  vendor_id INTEGER,
  is_system_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS tidum_roles_scope_vendor_name_key
  ON tidum_roles (scope, COALESCE(vendor_id, -1), name);

CREATE TABLE IF NOT EXISTS tidum_role_permissions (
  role_id UUID NOT NULL REFERENCES tidum_roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES tidum_permissions(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS tidum_role_permissions_role_permission_key
  ON tidum_role_permissions (role_id, permission_id);

ALTER TABLE users ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES tidum_roles(id);

-- Seed: tillatelseskatalogen (7 rader, se server/lib/permission-catalog.ts —
-- hold denne listen synkronisert manuelt, det er kun 7 rader).
INSERT INTO tidum_permissions (key, label, module) VALUES
  ('vendor.create', 'Opprette leverandør', 'leverandorer'),
  ('vendor.admin.create', 'Opprette leverandøradmin', 'leverandorer'),
  ('vendor.poweroffice_visibility.toggle', 'Skjule/vise PowerOffice for leverandør', 'leverandorer'),
  ('prototype_tester.invite', 'Invitere prototype-tester', 'prototype_testere'),
  ('prototype_tester.convert', 'Konvertere tester til leverandøradmin', 'prototype_testere'),
  ('user.expected_ssn.set', 'Forhåndsregistrere fødselsnummer på konto', 'eid'),
  ('role.manage', 'Administrere roller og tillatelser', 'systemadministrasjon')
ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label, module = EXCLUDED.module;

-- Seed: systemrollen super_admin får ALLE tillatelser
INSERT INTO tidum_roles (name, scope, is_system_default)
VALUES ('super_admin', 'global', TRUE)
ON CONFLICT (scope, COALESCE(vendor_id, -1), name) DO NOTHING;

-- NOT EXISTS-vakt: denne migrasjonen kjører på HVER oppstart (se
-- STARTUP_MIGRATIONS). Uten vakten ville en super_admin som fjerner en
-- tillatelse via UI-et (Task 3) fått den stille lagt tilbake på neste
-- deploy. Vakten gjør seedingen ren-installasjon-only: kjører kun når
-- rollen har NULL tillatelsesrader fra før (ekte fresh install), hopper
-- over enhver rolle som allerede er seedet/tilpasset.
INSERT INTO tidum_role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM tidum_roles r, tidum_permissions p
WHERE r.name = 'super_admin' AND r.scope = 'global'
  AND NOT EXISTS (
    SELECT 1 FROM tidum_role_permissions rp
    JOIN tidum_roles r2 ON r2.id = rp.role_id
    WHERE r2.name = 'super_admin' AND r2.scope = 'global'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Seed: systemrollen vendor_admin får kun leverandør-relaterte tillatelser
-- (IKKE vendor.create, vendor.admin.create eller role.manage — vendor.admin.create
-- er UNSCOPED (ingen vendor-sjekk), så å gi den til vendor_admin ville la enhver
-- vendor_admin opprette admin-brukere på ANDRE sine tenants og kortslutte
-- eierskaps-sjekken i POST /api/vendors/:id/admins. Kun super_admin skal ha den.)
INSERT INTO tidum_roles (name, scope, is_system_default)
VALUES ('vendor_admin', 'global', TRUE)
ON CONFLICT (scope, COALESCE(vendor_id, -1), name) DO NOTHING;

-- Samme NOT EXISTS-vakt som super_admin over — hopper over seeding når
-- vendor_admin allerede har tillatelsesrader (uansett hvilke).
INSERT INTO tidum_role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM tidum_roles r, tidum_permissions p
WHERE r.name = 'vendor_admin' AND r.scope = 'global'
  AND p.key IN ('vendor.poweroffice_visibility.toggle')
  AND NOT EXISTS (
    SELECT 1 FROM tidum_role_permissions rp
    JOIN tidum_roles r2 ON r2.id = rp.role_id
    WHERE r2.name = 'vendor_admin' AND r2.scope = 'global'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Denne migrasjonen kjørte allerede en gang mot prod med vendor.admin.create
-- feilaktig inkludert over (se commit-historikk) — CREATE TABLE IF NOT EXISTS +
-- ON CONFLICT DO NOTHING over gjør INSERT-fiksen alene utilstrekkelig for
-- installasjoner der raden allerede finnes. Fjern den eksplisitt (idempotent,
-- trygg å kjøre uansett om raden finnes eller ikke).
DELETE FROM tidum_role_permissions
WHERE role_id = (SELECT id FROM tidum_roles WHERE name = 'vendor_admin' AND is_system_default = true)
  AND permission_id = (SELECT id FROM tidum_permissions WHERE key = 'vendor.admin.create');

-- Koble eksisterende kontoer til de migrerte rollene automatisk.
UPDATE users u
SET role_id = r.id
FROM tidum_roles r
WHERE r.scope = 'global' AND r.name = u.role AND u.role IN ('super_admin', 'vendor_admin')
  AND u.role_id IS NULL;
