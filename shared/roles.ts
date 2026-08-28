export const TIDUM_ROLES = [
  "super_admin",
  "hovedadmin",
  "vendor_admin",
  "tiltaksleder",
  "teamleder",
  "case_manager",
  "miljoarbeider",
  "prototype_tester",
  "member",
  "user",
  "barnevernsleder",
  "kommune_saksbehandler",
  "kommune_admin",
  "innbygger",
] as const;

export type TidumRole = (typeof TIDUM_ROLES)[number];

const KOMMUNE_ROLES = new Set<TidumRole>(["barnevernsleder", "kommune_saksbehandler", "kommune_admin"]);

/** Fagroller med saksinnsyn. kommune_admin administrerer brukere og oppsett
 * men skal ALDRI ha tilgang til saksdata (admin ≠ fag — need-to-know). */
const KOMMUNE_FAG_ROLES = new Set<TidumRole>(["barnevernsleder", "kommune_saksbehandler"]);

export function isKommuneFagRolle(role: string | null | undefined): boolean {
  return KOMMUNE_FAG_ROLES.has(normalizeRole(role));
}
const PORTAL_ROLES = new Set<TidumRole>(["innbygger"]);

/** Kommune-roller skal ALDRI telle som gyldig aktør i vendor-side-administrasjon,
 * uansett rang — de to tenant-hierarkiene (kommune/vendor) deler samme globale
 * rank-navnerom i canManageRoleDynamic, som ikke kan uttrykke at de er disjunkte.
 * Se .superpowers/sdd/2026-08-23-kommune-tenant-roller/progress.md, "Final
 * whole-branch review" for den fulle hendelsen dette lukker. */
export function isKommuneRole(role: string | null | undefined): boolean {
  return KOMMUNE_ROLES.has(normalizeRole(role));
}

/** Portalroller provisjoneres bare gjennom partsflyten og kan aldri deles ut
 * fra de ordinære brukeradministrasjonsendepunktene. */
export function isPortalRole(role: string | null | undefined): boolean {
  return PORTAL_ROLES.has(normalizeRole(role));
}

export const ROLE_LABELS: Record<string, string> = {
  super_admin: "Systemadmin",
  hovedadmin: "Hovedadmin",
  admin: "Hovedadmin",
  vendor_admin: "Leverandøradmin",
  tiltaksleder: "Tiltaksleder",
  teamleder: "Teamleder",
  case_manager: "Saksbehandler",
  miljoarbeider: "Miljøarbeider",
  prototype_tester: "Prototype-tester",
  member: "Medlem",
  user: "Bruker",
  barnevernsleder: "Barnevernsleder",
  kommune_saksbehandler: "Saksbehandler",
  kommune_admin: "Kommuneadministrator",
  innbygger: "Innbygger",
};

const ROLE_ALIASES: Record<string, TidumRole> = {
  super_admin: "super_admin",
  hovedadmin: "hovedadmin",
  admin: "hovedadmin",
  vendor_admin: "vendor_admin",
  tiltaksleder: "tiltaksleder",
  teamleder: "teamleder",
  case_manager: "case_manager",
  miljoarbeider: "miljoarbeider",
  "miljøarbeider": "miljoarbeider",
  prototype_tester: "prototype_tester",
  "prototype-tester": "prototype_tester",
  member: "member",
  user: "user",
  barnevernsleder: "barnevernsleder",
  kommune_saksbehandler: "kommune_saksbehandler",
  kommune_admin: "kommune_admin",
  innbygger: "innbygger",
};

export function normalizeRole(role?: string | null): TidumRole {
  if (!role) return "member";
  const key = role.trim().toLowerCase();
  return ROLE_ALIASES[key] ?? "member";
}

const MANAGEABLE_BY_ROLE: Record<TidumRole, TidumRole[]> = {
  super_admin: [
    "hovedadmin",
    "vendor_admin",
    "tiltaksleder",
    "teamleder",
    "case_manager",
    "miljoarbeider",
    "prototype_tester",
    "member",
    "user",
    "barnevernsleder",
    "kommune_saksbehandler",
    "kommune_admin",
  ],
  hovedadmin: ["vendor_admin", "tiltaksleder", "teamleder", "case_manager", "miljoarbeider", "member", "user"],
  vendor_admin: ["tiltaksleder", "teamleder", "case_manager", "miljoarbeider", "member", "user"],
  tiltaksleder: ["miljoarbeider", "member", "user"],
  teamleder: ["miljoarbeider", "member", "user"],
  case_manager: ["miljoarbeider", "member", "user"],
  miljoarbeider: [],
  prototype_tester: [],
  member: [],
  user: [],
  barnevernsleder: ["kommune_saksbehandler"],
  kommune_saksbehandler: [],
  // Administrerer kommunens fagbrukere — har selv ikke saksinnsyn.
  kommune_admin: ["barnevernsleder", "kommune_saksbehandler"],
  innbygger: [],
};

export function canManageRole(managerRole: string | null | undefined, targetRole: string | null | undefined): boolean {
  const normalizedManagerRole = normalizeRole(managerRole);
  const normalizedTargetRole = normalizeRole(targetRole);
  return MANAGEABLE_BY_ROLE[normalizedManagerRole].includes(normalizedTargetRole);
}

export function canManageUsers(role: string | null | undefined): boolean {
  return MANAGEABLE_BY_ROLE[normalizeRole(role)].length > 0;
}

export function getRoleLabel(role: string | null | undefined): string {
  const normalizedRole = normalizeRole(role);
  return ROLE_LABELS[normalizedRole] ?? "Medlem";
}

export function isTopAdminRole(role: string | null | undefined): boolean {
  const normalizedRole = normalizeRole(role);
  return ["super_admin", "hovedadmin", "vendor_admin"].includes(normalizedRole);
}

export function isSuperAdminLikeRole(role: string | null | undefined): boolean {
  const normalizedRole = normalizeRole(role);
  return normalizedRole === "super_admin" || normalizedRole === "hovedadmin";
}

export function canAccessVendorApiAdmin(role: string | null | undefined): boolean {
  const normalizedRole = normalizeRole(role);
  return ["super_admin", "hovedadmin", "vendor_admin"].includes(normalizedRole);
}

/** Tenant-owned credentials and API keys must be managed by the customer's
 * own hovedadmin/vendor_admin. A global supplier admin may control whether an
 * integration is offered, but does not get implicit access to customer
 * credentials or data-plane API keys. */
export function canManageVendorCredentials(role: string | null | undefined): boolean {
  const normalizedRole = normalizeRole(role);
  return normalizedRole === "hovedadmin" || normalizedRole === "vendor_admin";
}

/** Arkivkonfigurasjon finnes i begge tenanthierarkier. Kommuneleder får bare
 * arkivkortet; dette utvider ikke vendor-API-, PowerOffice- eller brukeradmin. */
export function canConfigureArchiveIntegration(role: string | null | undefined): boolean {
  const normalizedRole = normalizeRole(role);
  return canAccessVendorApiAdmin(normalizedRole) || normalizedRole === "barnevernsleder";
}
