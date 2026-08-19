-- Fase 1.5: samle admin_users og users på users.role_id som eneste
-- sannhetskilde. Verifisert mot ekte produksjonsdata før denne ble
-- skrevet: 0 admin_users-rader manglet paret users-rad, 0 username-
-- kollisjoner, 0 parede rader med role_id NULL — denne migreringen er et
-- sikkerhetsnett for fremtidig drift, ikke en reell datamigrering i dag.
--
-- public.users (IKKE legacy.users, et separat ubrukt skjema) deles med et
-- urelatert produkt og har to skjulte NOT NULL-kolonner uten default:
-- username (UNIQUE) og password. Begge må oppgis eller INSERT feiler.
-- Verdiene leses aldri av Tidums egen kode.

INSERT INTO users (id, email, username, password, role, role_id, created_at, updated_at)
SELECT
  gen_random_uuid(),
  a.email,
  a.username,
  'unused-admin-users-pairing',
  a.role,
  (SELECT id FROM tidum_roles WHERE name = a.role AND scope = 'global' AND is_system_default = true),
  a.created_at,
  now()
FROM admin_users a
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.email = a.email)
  AND NOT EXISTS (SELECT 1 FROM users u2 WHERE u2.username = a.username)
  AND a.role IN ('super_admin', 'vendor_admin');

-- Backfill role_id på users-rader som allerede er paret på e-post men mangler role_id
UPDATE users u
SET role_id = (SELECT id FROM tidum_roles WHERE name = a.role AND scope = 'global' AND is_system_default = true)
FROM admin_users a
WHERE u.email = a.email
  AND u.role_id IS NULL
  AND a.role IN ('super_admin', 'vendor_admin');
