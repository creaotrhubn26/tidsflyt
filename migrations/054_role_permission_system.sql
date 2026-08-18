CREATE TABLE IF NOT EXISTS permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR NOT NULL UNIQUE,
  label TEXT NOT NULL,
  module VARCHAR NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR NOT NULL,
  scope VARCHAR NOT NULL,
  vendor_id INTEGER,
  is_system_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS roles_scope_vendor_name_key
  ON roles (scope, COALESCE(vendor_id, -1), name);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS role_permissions_role_permission_key
  ON role_permissions (role_id, permission_id);

ALTER TABLE users ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES roles(id);

-- Seed: tillatelseskatalogen (7 rader, se server/lib/permission-catalog.ts —
-- hold denne listen synkronisert manuelt, det er kun 7 rader).
INSERT INTO permissions (key, label, module) VALUES
  ('vendor.create', 'Opprette leverandør', 'leverandorer'),
  ('vendor.admin.create', 'Opprette leverandøradmin', 'leverandorer'),
  ('vendor.poweroffice_visibility.toggle', 'Skjule/vise PowerOffice for leverandør', 'leverandorer'),
  ('prototype_tester.invite', 'Invitere prototype-tester', 'prototype_testere'),
  ('prototype_tester.convert', 'Konvertere tester til leverandøradmin', 'prototype_testere'),
  ('user.expected_ssn.set', 'Forhåndsregistrere fødselsnummer på konto', 'eid'),
  ('role.manage', 'Administrere roller og tillatelser', 'systemadministrasjon')
ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label, module = EXCLUDED.module;

-- Seed: systemrollen super_admin får ALLE tillatelser
INSERT INTO roles (name, scope, is_system_default)
VALUES ('super_admin', 'global', TRUE)
ON CONFLICT (scope, COALESCE(vendor_id, -1), name) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'super_admin' AND r.scope = 'global'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Seed: systemrollen vendor_admin får kun leverandør-relaterte tillatelser
-- (IKKE vendor.create eller role.manage — matcher dagens super_admin-only-sjekker)
INSERT INTO roles (name, scope, is_system_default)
VALUES ('vendor_admin', 'global', TRUE)
ON CONFLICT (scope, COALESCE(vendor_id, -1), name) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'vendor_admin' AND r.scope = 'global'
  AND p.key IN ('vendor.admin.create', 'vendor.poweroffice_visibility.toggle')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Koble eksisterende kontoer til de migrerte rollene automatisk.
UPDATE users u
SET role_id = r.id
FROM roles r
WHERE r.scope = 'global' AND r.name = u.role AND u.role IN ('super_admin', 'vendor_admin')
  AND u.role_id IS NULL;
