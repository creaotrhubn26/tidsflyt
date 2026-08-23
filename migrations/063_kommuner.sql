-- 063_kommuner.sql
-- Bestiller-side tenant-type (kommunal barnevernstjeneste), parallell til
-- vendors (utfører-siden). Egen tabell, ikke en utvidelse av vendors —
-- vendors bærer utfører-spesifikke felter (subscription_plan, max_users,
-- api_access_enabled) som ikke gir mening for en kommunal bestiller.

CREATE TABLE IF NOT EXISTS tidum_kommuner (
  id                 SERIAL PRIMARY KEY,
  navn               TEXT NOT NULL,
  org_nummer         TEXT NOT NULL UNIQUE,
  kommunenummer      TEXT,
  entra_id_tenant_id TEXT,
  status             TEXT NOT NULL DEFAULT 'active',
  created_at         TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Parallell til users.vendor_id — en bruker hører til ENTEN en vendor
-- ELLER en kommune, aldri begge (håndheves i applikasjonskoden, ikke som
-- en DB-constraint, samme løse konvensjon som resten av kodebasen).
ALTER TABLE users ADD COLUMN IF NOT EXISTS kommune_id INTEGER;

-- Nye roller — speiler shared/roles.ts sin MANAGEABLE_BY_ROLE-tabell
-- eksakt (samme mønster som migrations/058). rank 70/60 (samme nivå som
-- vendor_admin / tiltaksleder-teamleder-case_manager) kolliderte med
-- vendor-side rangene: canManageRoleDynamic er en global, tenant-blind
-- targetRank<actorRank-sjekk, så en vendor_admin/hovedadmin ville dermed
-- kunne administrere disse kommune-rollene på tvers av tenant-grensen.
-- Løftet til samme mønster som prototype_tester (migrations/058): rang
-- MELLOM hovedadmin (80) og super_admin (90), slik at kun super_admin
-- kan nå dem via rangsammenligningen. barnevernsleder > kommune_saksbehandler
-- bevarer det interne kommune-hierarkiet (82 < 85).
INSERT INTO tidum_roles (name, scope, is_system_default, rank, can_manage_others) VALUES
  ('barnevernsleder', 'global', TRUE, 85, TRUE),
  ('kommune_saksbehandler', 'global', TRUE, 82, FALSE)
ON CONFLICT (scope, COALESCE(vendor_id, -1), name)
  DO UPDATE SET rank = EXCLUDED.rank, can_manage_others = EXCLUDED.can_manage_others;
