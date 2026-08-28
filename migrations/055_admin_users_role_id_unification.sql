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

-- Frisk-DB-guard: parringen er kun meningsfull der både admin-tabellen og
-- username-kolonnen finnes; en nyetablert database har ingen legacy å pare.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'users' AND column_name = 'username'
  ) AND to_regclass('tidum_admin_users') IS NOT NULL THEN
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
    FROM tidum_admin_users a
    WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.email = a.email)
      AND NOT EXISTS (SELECT 1 FROM users u2 WHERE u2.username = a.username)
      AND a.role IN ('super_admin', 'vendor_admin');
  END IF;
END $$;

-- Backfill role_id på users-rader som allerede er paret på e-post men
-- mangler role_id — kun meningsfullt som engangs-bootstrap. Fjernet
-- permanent kjøring her (samme grunn som i migrations/054, se dens
-- kommentar): som skrevet kjørte dette på HVERT oppstart og re-tildelte
-- role_id til enhver konto en super admin bevisst hadde fjernet rollen
-- fra via fase 1.5s tildelings-API, siden WHERE u.role_id IS NULL ikke
-- kan skille "aldri paret" fra "bevisst fjernet". Funnet i fase 1.5s
-- sluttgjennomgang. Ingen gjenværende NULL-rader å bootstrap'e — Task 1s
-- egen verifisering mot ekte prod (før denne migreringen først kjørte)
-- fant null parede rader med role_id NULL.
