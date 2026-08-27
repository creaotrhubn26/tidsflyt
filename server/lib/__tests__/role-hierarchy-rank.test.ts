import { describe, it, expect } from "vitest";
import { canManageRoleDynamic, canManageUsersDynamic, getRoleRank, getRoleCanManageOthers } from "../permissions";
import { canManageRole, canManageUsers } from "@shared/roles";

// Sammenlignes mot den ekte shared/roles.ts sin canManageRole/canManageUsers —
// denne testen er selve garantien for at migreringen ikke endrer oppførsel.
// (Ikke en hardkodet kopi av MANAGEABLE_BY_ROLE — se final-fixwave-brief
// finding 2: en duplisert konstant kan ikke garantere noe om den EKTE
// tabellen hvis shared/roles.ts endres senere uten at kopien oppdateres.)
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
  "innbygger",
] as const;

describe("canManageRoleDynamic matcher shared/roles.ts sin ekte canManageRole", () => {
  const pairs = TIDUM_ROLES.flatMap((actor) =>
    TIDUM_ROLES.map((target) => ({ actor, target, expected: canManageRole(actor, target) })),
  );

  it.each(pairs)("$actor kan${expected ? '' : ' IKKE'} administrere $target", async ({ actor, target, expected }) => {
    expect(await canManageRoleDynamic(actor, target)).toBe(expected);
  });
});

describe("canManageUsersDynamic matcher shared/roles.ts sin ekte canManageUsers", () => {
  const cases = TIDUM_ROLES.map((role) => ({ role, expected: canManageUsers(role) }));

  it.each(cases)("$role kan${expected ? '' : ' IKKE'} administrere brukere i det hele tatt", async ({ role, expected }) => {
    expect(await canManageUsersDynamic(role)).toBe(expected);
  });
});

describe("ukjent rolle er fail-closed", () => {
  it("canManageRoleDynamic returnerer false for ukjent aktør-rolle", async () => {
    expect(await canManageRoleDynamic("ikke_en_rolle", "member")).toBe(false);
  });

  // NB: dette er IKKE lenger en "fail-closed" case (avvik fra
  // final-fixwave-brief sin ordlyd, se final-fixwave-report.md). Etter
  // finding 1-fiksen normaliserer getRoleRank/getRoleCanManageOthers INNI
  // funksjonen, og normalizeRole() sitt fallback for en ukjent streng er
  // "member" (shared/roles.ts) — akkurat som i den gamle canManageRole. En
  // ukjent MÅL-rolle blir dermed behandlet som "member", og super_admin kan
  // administrere member (migrations/058: rank 90 > rank 0, can_manage_others
  // true) — så resultatet er reelt og korrekt TRUE, ikke false. Dette
  // speiler ekte canManageRole 1:1 (se assertion pa linjen under).
  it("canManageRoleDynamic normaliserer ukjent mål-rolle til 'member' (matcher ekte canManageRole, ikke lenger false)", async () => {
    expect(await canManageRoleDynamic("super_admin", "ikke_en_rolle")).toBe(canManageRole("super_admin", "ikke_en_rolle"));
    expect(await canManageRoleDynamic("super_admin", "ikke_en_rolle")).toBe(true);
  });

  it("canManageUsersDynamic returnerer false for ukjent rolle", async () => {
    expect(await canManageUsersDynamic("ikke_en_rolle")).toBe(false);
  });
});

// Regresjonstest for finding 1: server/routes.ts sine
// suggestion-team-defaults-ruter sendte rå, ikke-normaliserte rollestrenger
// (f.eks. "admin") rett inn i canManageUsersDynamic/canManageRoleDynamic, som
// gjorde et eksakt DB-oppslag uten normalisering — "admin" (som
// shared/roles.ts sin ROLE_ALIASES mapper til "hovedadmin") matchet dermed
// ingen rad og ble feilaktig behandlet som ukjent rolle (403). Fikset ved å
// normalisere INNI getRoleRank/getRoleCanManageOthers, som denne testen
// verifiserer direkte.
describe("normaliserer alias-rollestreng før DB-oppslag (regresjon, finding 1)", () => {
  it("getRoleRank gir samme rang for alias 'admin' som for kanonisk 'hovedadmin'", async () => {
    expect(await getRoleRank("admin")).toBe(await getRoleRank("hovedadmin"));
  });

  it("getRoleCanManageOthers gir samme svar for alias 'admin' som for kanonisk 'hovedadmin'", async () => {
    expect(await getRoleCanManageOthers("admin")).toBe(await getRoleCanManageOthers("hovedadmin"));
  });

  it("canManageUsersDynamic gir samme svar for alias 'admin' som for kanonisk 'hovedadmin'", async () => {
    expect(await canManageUsersDynamic("admin")).toBe(await canManageUsersDynamic("hovedadmin"));
    expect(await canManageUsersDynamic("admin")).toBe(true);
  });

  it("canManageRoleDynamic gir samme svar for alias 'admin' som for kanonisk 'hovedadmin'", async () => {
    expect(await canManageRoleDynamic("admin", "member")).toBe(await canManageRoleDynamic("hovedadmin", "member"));
    expect(await canManageRoleDynamic("admin", "member")).toBe(true);
  });
});
