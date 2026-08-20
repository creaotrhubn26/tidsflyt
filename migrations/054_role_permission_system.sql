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

-- Fanger "er dette en ekte fresh install" (hele tidum_role_permissions
-- tabellen tom) FØR noen av seedingen under kjører, i en
-- transaksjonslokal innstilling (set_config med is_local=true — hele
-- denne migrasjonsfilen kjører som én multi-statement-streng på én
-- tilkobling, implisitt én transaksjon). Nødvendig fordi super_admins
-- INSERT under ellers ville gjort vendor_admins tabellbrede NOT
-- EXISTS-sjekk falsk innad i SAMME skriptkjøring (vendor_admins sjekk
-- ville sett super_admins nylig innsatte rader og trodd tabellen ikke
-- lenger var tom, og feilaktig hoppet over en ekte fresh install).
SELECT set_config('tidum.fresh_install_054', (NOT EXISTS (SELECT 1 FROM tidum_role_permissions))::text, true);

-- Seed: systemrollen super_admin får ALLE tillatelser
INSERT INTO tidum_roles (name, scope, is_system_default)
VALUES ('super_admin', 'global', TRUE)
ON CONFLICT (scope, COALESCE(vendor_id, -1), name) DO NOTHING;

-- NOT EXISTS-vakt: denne migrasjonen kjører på HVER oppstart (se
-- STARTUP_MIGRATIONS). Uten vakten ville en super_admin som fjerner en
-- tillatelse via UI-et (Task 3) fått den stille lagt tilbake på neste
-- deploy. Vakten gjør seedingen ren-installasjon-only.
--
-- Bevisst TABELLBRED sjekk (ikke per-rolle, via snapshotten over) —
-- fase 1.5s sluttgjennomgang fant at en per-rolle NOT EXISTS ikke kan
-- skille "ekte fresh install" fra "en super admin tømte akkurat DENNE
-- ene rollen for tillatelser via UI-et" (0 rader igjen ser identisk ut i
-- begge tilfeller for én rolle alene). Siden en ekte fresh install har 0
-- rader i HELE tabellen, mens en tømt enkeltrolle alltid etterlater den
-- andre rollens rader urørt, er tabellbred eksistens riktig skille.
INSERT INTO tidum_role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM tidum_roles r, tidum_permissions p
WHERE r.name = 'super_admin' AND r.scope = 'global'
  AND current_setting('tidum.fresh_install_054')::boolean
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Seed: systemrollen vendor_admin får kun leverandør-relaterte tillatelser
-- (IKKE vendor.create, vendor.admin.create eller role.manage — vendor.admin.create
-- er UNSCOPED (ingen vendor-sjekk), så å gi den til vendor_admin ville la enhver
-- vendor_admin opprette admin-brukere på ANDRE sine tenants og kortslutte
-- eierskaps-sjekken i POST /api/vendors/:id/admins. Kun super_admin skal ha den.)
INSERT INTO tidum_roles (name, scope, is_system_default)
VALUES ('vendor_admin', 'global', TRUE)
ON CONFLICT (scope, COALESCE(vendor_id, -1), name) DO NOTHING;

-- Samme snapshottede tabellbrede vakt som super_admin over (samme
-- transaksjonslokale innstilling, satt FØR super_admins INSERT over —
-- speiler ikke tabellens live-tilstand nå, som allerede inneholder
-- super_admins nettopp innsatte rader på en ekte fresh install).
INSERT INTO tidum_role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM tidum_roles r, tidum_permissions p
WHERE r.name = 'vendor_admin' AND r.scope = 'global'
  AND p.key IN ('vendor.poweroffice_visibility.toggle')
  AND current_setting('tidum.fresh_install_054')::boolean
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Denne migrasjonen kjørte allerede en gang mot prod med vendor.admin.create
-- feilaktig inkludert over (se commit-historikk) — CREATE TABLE IF NOT EXISTS +
-- ON CONFLICT DO NOTHING over gjør INSERT-fiksen alene utilstrekkelig for
-- installasjoner der raden allerede finnes. Fjern den eksplisitt (idempotent,
-- trygg å kjøre uansett om raden finnes eller ikke).
DELETE FROM tidum_role_permissions
WHERE role_id = (SELECT id FROM tidum_roles WHERE name = 'vendor_admin' AND is_system_default = true)
  AND permission_id = (SELECT id FROM tidum_permissions WHERE key = 'vendor.admin.create');

-- Koble eksisterende kontoer til de migrerte rollene automatisk. Kun
-- meningsfullt som engangs-bootstrap ved lansering (verifisert: null
-- gjenværende NULL-rader etter migrering 055 kjørte for første gang) —
-- fjernet permanent kjøring her fordi den, som skrevet
-- (`u.role_id IS NULL`), kjørte på HVERT oppstart og dermed re-tildelte
-- role_id til enhver konto en super admin bevisst hadde fjernet rollen
-- fra via PATCH /api/admin/users/:id/role (fase 1.5) — role_id blir NULL
-- ved bevisst fjerning, users.role-strengen røres bevisst ikke (se
-- migrations/055 sin kommentar), så denne WHERE-klausulen kunne ikke
-- skille "aldri tildelt" fra "bevisst fjernet". Funnet i fase 1.5s
-- sluttgjennomgang, fikset direkte siden fjerning er den eneste korrekte
-- oppførselen nå som Task 1s ruter alltid setter role_id ved opprettelse.
