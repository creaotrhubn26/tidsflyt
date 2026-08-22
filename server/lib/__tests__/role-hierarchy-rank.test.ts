import { describe, it, expect } from "vitest";
import { canManageRoleDynamic, canManageUsersDynamic } from "../permissions";

// Speiler shared/roles.ts sin MANAGEABLE_BY_ROLE eksakt — denne testen
// er selve garantien for at migreringen ikke endrer oppførsel.
const TIDUM_ROLES = [
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
] as const;

const MANAGEABLE_BY_ROLE: Record<string, string[]> = {
  super_admin: ["hovedadmin", "vendor_admin", "tiltaksleder", "teamleder", "case_manager", "miljoarbeider", "prototype_tester", "member", "user"],
  hovedadmin: ["vendor_admin", "tiltaksleder", "teamleder", "case_manager", "miljoarbeider", "member", "user"],
  vendor_admin: ["tiltaksleder", "teamleder", "case_manager", "miljoarbeider", "member", "user"],
  tiltaksleder: ["miljoarbeider", "member", "user"],
  teamleder: ["miljoarbeider", "member", "user"],
  case_manager: ["miljoarbeider", "member", "user"],
  miljoarbeider: [],
  prototype_tester: [],
  member: [],
  user: [],
};

describe("canManageRoleDynamic matcher shared/roles.ts sin MANAGEABLE_BY_ROLE eksakt", () => {
  const pairs = TIDUM_ROLES.flatMap((actor) =>
    TIDUM_ROLES.map((target) => ({ actor, target, expected: MANAGEABLE_BY_ROLE[actor].includes(target) })),
  );

  it.each(pairs)("$actor kan${expected ? '' : ' IKKE'} administrere $target", async ({ actor, target, expected }) => {
    expect(await canManageRoleDynamic(actor, target)).toBe(expected);
  });
});

describe("canManageUsersDynamic matcher shared/roles.ts sin canManageUsers eksakt", () => {
  const cases = TIDUM_ROLES.map((role) => ({ role, expected: MANAGEABLE_BY_ROLE[role].length > 0 }));

  it.each(cases)("$role kan${expected ? '' : ' IKKE'} administrere brukere i det hele tatt", async ({ role, expected }) => {
    expect(await canManageUsersDynamic(role)).toBe(expected);
  });
});

describe("ukjent rolle er fail-closed", () => {
  it("canManageRoleDynamic returnerer false for ukjent aktør-rolle", async () => {
    expect(await canManageRoleDynamic("ikke_en_rolle", "member")).toBe(false);
  });

  it("canManageRoleDynamic returnerer false for ukjent mål-rolle", async () => {
    expect(await canManageRoleDynamic("super_admin", "ikke_en_rolle")).toBe(false);
  });

  it("canManageUsersDynamic returnerer false for ukjent rolle", async () => {
    expect(await canManageUsersDynamic("ikke_en_rolle")).toBe(false);
  });
});
