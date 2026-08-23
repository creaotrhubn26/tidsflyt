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
] as const;

export type TidumRole = (typeof TIDUM_ROLES)[number];

const KOMMUNE_ROLES = new Set<TidumRole>(["barnevernsleder", "kommune_saksbehandler"]);

/** Kommune-roller skal ALDRI telle som gyldig aktør i vendor-side-administrasjon,
 * uansett rang — de to tenant-hierarkiene (kommune/vendor) deler samme globale
 * rank-navnerom i canManageRoleDynamic, som ikke kan uttrykke at de er disjunkte.
 * Se .superpowers/sdd/2026-08-23-kommune-tenant-roller/progress.md, "Final
 * whole-branch review" for den fulle hendelsen dette lukker. */
export function isKommuneRole(role: string | null | undefined): boolean {
  return KOMMUNE_ROLES.has(normalizeRole(role));
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
