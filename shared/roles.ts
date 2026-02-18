export const TIDUM_ROLES = [
  "super_admin",
  "hovedadmin",
  "admin",
  "vendor_admin",
  "tiltaksleder",
  "teamleder",
  "case_manager",
  "miljoarbeider",
  "member",
  "user",
] as const;

export type TidumRole = (typeof TIDUM_ROLES)[number];

export const ROLE_LABELS: Record<string, string> = {
  super_admin: "Hovedadmin",
  hovedadmin: "Hovedadmin",
  admin: "Administrator",
  vendor_admin: "Leverandøradmin",
  tiltaksleder: "Tiltaksleder",
  teamleder: "Teamleder",
  case_manager: "Saksbehandler",
  miljoarbeider: "Miljøarbeider",
  member: "Medlem",
  user: "Bruker",
};

const ROLE_ALIASES: Record<string, TidumRole> = {
  super_admin: "super_admin",
  hovedadmin: "hovedadmin",
  admin: "admin",
  vendor_admin: "vendor_admin",
  tiltaksleder: "tiltaksleder",
  teamleder: "teamleder",
  case_manager: "case_manager",
  miljoarbeider: "miljoarbeider",
  "miljøarbeider": "miljoarbeider",
  member: "member",
  user: "user",
};

export function normalizeRole(role?: string | null): TidumRole {
  if (!role) return "member";
  const key = role.trim().toLowerCase();
  return ROLE_ALIASES[key] ?? "member";
}

const MANAGEABLE_BY_ROLE: Record<TidumRole, TidumRole[]> = {
  super_admin: [
    "hovedadmin",
    "admin",
    "vendor_admin",
    "tiltaksleder",
    "teamleder",
    "case_manager",
    "miljoarbeider",
    "member",
    "user",
  ],
  hovedadmin: ["tiltaksleder", "teamleder", "case_manager", "miljoarbeider", "member", "user"],
  admin: ["tiltaksleder", "teamleder", "case_manager", "miljoarbeider", "member", "user"],
  vendor_admin: ["tiltaksleder", "teamleder", "case_manager", "miljoarbeider", "member", "user"],
  tiltaksleder: ["miljoarbeider", "member", "user"],
  teamleder: ["miljoarbeider", "member", "user"],
  case_manager: ["miljoarbeider", "member", "user"],
  miljoarbeider: [],
  member: [],
  user: [],
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
  return ["super_admin", "hovedadmin", "admin", "vendor_admin"].includes(normalizedRole);
}

export function isSuperAdminLikeRole(role: string | null | undefined): boolean {
  const normalizedRole = normalizeRole(role);
  return normalizedRole === "super_admin" || normalizedRole === "hovedadmin";
}

export function canAccessVendorApiAdmin(role: string | null | undefined): boolean {
  const normalizedRole = normalizeRole(role);
  return ["super_admin", "hovedadmin", "admin", "vendor_admin"].includes(normalizedRole);
}
