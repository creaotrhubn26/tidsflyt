# Fase 1.6: rangbasert erstatning for portalens canManageRole/canManageUsers — Implementeringsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Erstatte den hardkodede `MANAGEABLE_BY_ROLE`-tabellen (`shared/roles.ts`) med en databasedrevet rangordning på `tidum_roles`, uten å endre eksisterende hierarki-oppførsel eller røre `users.role`/`tidum_company_users.role`.

**Architecture:** Nytt `rank`-felt på `tidum_roles` (sås for alle 10 systemroller). To nye async funksjoner i `server/lib/permissions.ts` (`canManageRoleDynamic`, `canManageUsersDynamic`) slår opp rang på rollenavn og erstatter de 10 kallstedene i `server/smartTimingRoutes.ts`/`server/routes.ts`. Nytt `GET /api/company/users/manageable-roles`-endepunkt lar klienten hente tildelbare roller fra server i stedet for å regne ut selv.

**Tech Stack:** Express, Drizzle ORM, PostgreSQL (delt prod-database via Neon), Vitest, React Query (TanStack Query v5), Wouter.

**Spec:** `docs/superpowers/specs/2026-08-22-rolle-tilgangssystem-fase16-design.md`

## Global Constraints

- `users.role` og `tidum_company_users.role` er TEKST-kolonner og forblir det — ingen `role_id`-migrering for portal-/selskapsbrukere i denne planen.
- Dagens EKSAKTE hierarki-oppførsel fra `MANAGEABLE_BY_ROLE` (`shared/roles.ts:52-73`) skal bevares bit-for-bit. `tiltaksleder`/`teamleder`/`case_manager` er likestilte (samme rang) og skal IKKE kunne administrere hverandre.
- `resolveActorRoleForCompany()` (`server/smartTimingRoutes.ts:118-139`) endres ALDRI i denne planen — den returnerer fortsatt en rolle-streng. Kun det som gjøres MED strengen etterpå endres.
- Alle DB-endringer er idempotente `CREATE`/`ALTER ... IF NOT EXISTS` + `ON CONFLICT`-seeding (samme mønster som `migrations/054_role_permission_system.sql`) — migrasjonen kjører på HVERT oppstart (se `server/lib/run-startup-migrations.ts`).
- Denne planen rører IKKE `hasPermission()`, `PERMISSION_CATALOG`, eller `role.manage`-flyten i `admin-roller.tsx` — det er et separat system for et annet formål.
- `client/src/hooks/use-role-preview.tsx`s klient-only "preview som rolle X"-funksjon (kun `super_admin`/`hovedadmin`/`vendor_admin` er `canPreviewRoles`, aldri sendt til server i dag) må fortsette å virke identisk for invitasjons-rolle-dropdownen etter migreringen — se Task 3/4 for hvordan.

---

### Task 1: Rang-kolonne + seed-migrasjon + dynamiske funksjoner i server/lib/permissions.ts

**Files:**
- Create: `migrations/058_role_hierarchy_rank.sql`
- Modify: `shared/models/permissions.ts` (legg til `rank`-felt på `roles`-tabellen)
- Modify: `server/lib/permissions.ts` (legg til `getRoleRank`, `canManageRoleDynamic`, `canManageUsersDynamic`)
- Test: `server/lib/__tests__/role-hierarchy-rank.test.ts`

**Interfaces:**
- Produserer: `getRoleRank(roleName: string, cache?: Map<string, number>): Promise<number>`, `canManageRoleDynamic(actorRoleName: string, targetRoleName: string, cache?: Map<string, number>): Promise<boolean>`, `canManageUsersDynamic(actorRoleName: string, cache?: Map<string, number>): Promise<boolean>` — alle eksportert fra `server/lib/permissions.ts`. Task 2 og 3 importerer og bruker disse direkte, ingen andre grensesnitt.

- [ ] **Step 1: Skriv migrasjon 058**

`migrations/058_role_hierarchy_rank.sql`:

```sql
ALTER TABLE tidum_roles ADD COLUMN IF NOT EXISTS rank INTEGER NOT NULL DEFAULT 0;

-- Speiler shared/roles.ts sin MANAGEABLE_BY_ROLE-tabell eksakt (fase 1.6).
-- tiltaksleder/teamleder/case_manager har SAMME rang med hensikt — de er
-- likestilte og skal ikke kunne administrere hverandre (target.rank <
-- actor.rank er alltid usann når rangene er like).
INSERT INTO tidum_roles (name, scope, is_system_default, rank) VALUES
  ('super_admin', 'global', TRUE, 90),
  ('hovedadmin', 'global', TRUE, 80),
  ('vendor_admin', 'global', TRUE, 70),
  ('tiltaksleder', 'global', TRUE, 60),
  ('teamleder', 'global', TRUE, 60),
  ('case_manager', 'global', TRUE, 60),
  ('miljoarbeider', 'global', TRUE, 0),
  ('prototype_tester', 'global', TRUE, 0),
  ('member', 'global', TRUE, 0),
  ('user', 'global', TRUE, 0)
ON CONFLICT (scope, COALESCE(vendor_id, -1), name)
  DO UPDATE SET rank = EXCLUDED.rank;
```

`ON CONFLICT ... DO UPDATE SET rank` (ikke `DO NOTHING`) er bevisst — `super_admin`/`vendor_admin` finnes allerede fra migrasjon 054 uten `rank`-verdi (default 0 fra `ALTER TABLE` over); denne migrasjonen må sette deres rang selv om raden allerede finnes. Trygt å kjøre på hvert oppstart: samme rang settes hver gang.

- [ ] **Step 2: Registrer migrasjonen**

I `server/lib/run-startup-migrations.ts`, legg `"058_role_hierarchy_rank.sql"` til `STARTUP_MIGRATIONS`-arrayet — ETTER `"057_tidum_table_rename.sql"` (som må ligge først, se filens egen kommentarblokk), ellers hvor som helst i resten av listen (058 har ingen ordre-avhengighet til 036-056).

- [ ] **Step 3: Legg til rank-felt i Drizzle-skjemaet**

I `shared/models/permissions.ts`, legg til `rank`-kolonnen på `roles`-tabellen (linje 12-30):

```ts
export const roles = pgTable(
  "tidum_roles",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    name: varchar("name").notNull(),
    scope: varchar("scope").notNull(),
    vendorId: integer("vendor_id"),
    isSystemDefault: boolean("is_system_default").notNull().default(false),
    rank: integer("rank").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("tidum_roles_scope_vendor_name_key").on(table.scope, table.vendorId, table.name),
  ],
);
```

(kun `rank: integer("rank").notNull().default(0),` er nytt — resten av tabellen uendret).

- [ ] **Step 4: Skriv de tre dynamiske funksjonene**

I `server/lib/permissions.ts`, legg til under den eksisterende `getRoleById`:

```ts
export async function getRoleRank(roleName: string, cache?: Map<string, number>): Promise<number> {
  if (cache?.has(roleName)) return cache.get(roleName)!;

  try {
    const [row] = await db
      .select({ rank: roles.rank })
      .from(roles)
      .where(and(eq(roles.scope, "global"), eq(roles.name, roleName), eq(roles.isSystemDefault, true)))
      .limit(1);

    const result = row?.rank ?? -1;
    cache?.set(roleName, result);
    return result;
  } catch (err) {
    console.error("[permissions] getRoleRank query failed", roleName, err);
    return -1;
  }
}

export async function canManageRoleDynamic(
  actorRoleName: string,
  targetRoleName: string,
  cache?: Map<string, number>,
): Promise<boolean> {
  const [actorRank, targetRank] = await Promise.all([
    getRoleRank(actorRoleName, cache),
    getRoleRank(targetRoleName, cache),
  ]);
  // -1 betyr ukjent rolle (rekke ikke funnet, eller DB-feil) — en ukjent
  // rolle kan aldri administrere noe, og kan aldri bli administrert.
  // Uten denne guarden ville -1 < 0 (miljoarbeider) feilaktig gitt true.
  if (actorRank < 0 || targetRank < 0) return false;
  return targetRank < actorRank;
}

export async function canManageUsersDynamic(actorRoleName: string, cache?: Map<string, number>): Promise<boolean> {
  const actorRank = await getRoleRank(actorRoleName, cache);
  return actorRank > 0;
}
```

`roles` er allerede importert i denne filen (`import { roles, rolePermissions, permissions } from "@shared/models/permissions";`, linje 2) — ingen ny import nødvendig for `roles`. Legg til `and, eq` er allerede importert fra `drizzle-orm` (linje 3) — begge brukes allerede av `hasPermission`.

- [ ] **Step 5: Skriv hierarki-parity-testen**

`server/lib/__tests__/role-hierarchy-rank.test.ts`:

```ts
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
```

Denne testen krever ekte database (migrasjon 058 må ha kjørt) — samme forutsetning som resten av `server/lib/__tests__/`s DB-avhengige tester i denne økten.

- [ ] **Step 6: Kjør testen, bekreft alle 100 + 10 + 3 tilfeller består**

Kjør: `DATABASE_URL='<ekte verdi>' npx vitest run server/lib/__tests__/role-hierarchy-rank.test.ts`
Forventet: 113/113 bestått (100 par-tester + 10 canManageUsers-tester + 3 fail-closed-tester).

- [ ] **Step 7: Commit**

```bash
git add migrations/058_role_hierarchy_rank.sql server/lib/run-startup-migrations.ts \
  shared/models/permissions.ts server/lib/permissions.ts \
  server/lib/__tests__/role-hierarchy-rank.test.ts
git commit -m "feat: rangbasert canManageRole/canManageUsers-erstatning (fase 1.6, Task 1)"
```

---

### Task 2: Erstatt kallstedene i server/smartTimingRoutes.ts og server/routes.ts

**Files:**
- Modify: `server/smartTimingRoutes.ts` (linje 9, 120, 2254, 2258, 2337, 2362, 2421, 2427, 2484)
- Modify: `server/routes.ts` (linje 59, 4367, 4380)
- Test: `server/lib/__tests__/company-user-role-hierarchy.test.ts`

**Interfaces:**
- Konsumerer fra `server/lib/permissions.ts` (Task 1, ENDELIG signatur — avvek fra opprinnelig planantagelse pga. en ruling under Task 1s fiks-runde 1, se plan-ledgeren):
  `canManageRoleDynamic(actorRoleName: string, targetRoleName: string, rankCache?: Map<string, number>, canManageOthersCache?: Map<string, boolean>): Promise<boolean>` (4 parametre, IKKE 3),
  `canManageUsersDynamic(actorRoleName: string, cache?: Map<string, boolean>): Promise<boolean>` (cache-typen er boolean, ikke number — samme cache som `canManageOthersCache` over kan gjenbrukes til dette kallet).
- Produserer: ingen nye grensesnitt — kun intern erstatning bak eksisterende ruter. Task 3 legger til et NYTT endepunkt i samme fil, uavhengig av denne oppgavens endringer.

- [ ] **Step 1: Bytt import i smartTimingRoutes.ts**

Linje 9, fra:
```ts
import { canManageRole, canManageUsers, normalizeRole } from "@shared/roles";
```
til:
```ts
import { normalizeRole } from "@shared/roles";
import { canManageRoleDynamic, canManageUsersDynamic } from "./lib/permissions";
```

- [ ] **Step 2: Erstatt kallstedet i resolveActorRoleForCompany (linje 118-139)**

```ts
async function resolveActorRoleForCompany(req: AuthRequest, companyId: number): Promise<string> {
  const normalizedAuthRole = normalizeRole((req.user as any)?.role || req.admin?.role);
  if (await canManageUsersDynamic(normalizedAuthRole)) {
    return normalizedAuthRole;
  }

  const actorEmail = getRequestUserEmail(req);
  if (!actorEmail) {
    return normalizedAuthRole;
  }

  const actorRoleResult = await pool.query(
    `SELECT role FROM tidum_company_users WHERE company_id = $1 AND user_email = $2 LIMIT 1`,
    [companyId, actorEmail]
  );

  if (actorRoleResult.rows.length === 0) {
    return normalizedAuthRole;
  }

  return normalizeRole(actorRoleResult.rows[0].role);
}
```

(kun `if (canManageUsers(normalizedAuthRole))` → `if (await canManageUsersDynamic(normalizedAuthRole))` endres — resten av funksjonen uendret, som Global Constraints krever).

- [ ] **Step 3: Erstatt kallstedene i POST /api/company/users (linje 2247-2262)**

```ts
  app.post("/api/company/users", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const { company_id, user_email, role, institution, case_title } = req.body;
      const companyId = Number(company_id) || 1;
      const targetRole = normalizeRole(role || 'member');
      const actorRole = await resolveActorRoleForCompany(req, companyId);

      if (!(await canManageUsersDynamic(actorRole))) {
        return res.status(403).json({ error: 'Du har ikke tilgang til å invitere brukere.' });
      }

      if (!(await canManageRoleDynamic(actorRole, targetRole))) {
        return res.status(403).json({
          error: `Rollen ${actorRole} kan ikke administrere ${targetRole}.`,
        });
      }
```
(resten av route-handleren, linje 2264 og nedover, uendret).

- [ ] **Step 4: Erstatt kallstedene i POST /api/company/users/bulk (linje 2331-2365)**

```ts
  app.post("/api/company/users/bulk", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const { company_id, users } = req.body;
      const companyId = Number(company_id) || 1;
      const actorRole = await resolveActorRoleForCompany(req, companyId);

      if (!(await canManageUsersDynamic(actorRole))) {
        return res.status(403).json({ error: 'Du har ikke tilgang til å invitere brukere.' });
      }

      if (!Array.isArray(users) || users.length === 0) {
        return res.status(400).json({ error: 'users må være et ikke-tomt array' });
      }
      if (users.length > 200) {
        return res.status(400).json({ error: 'Maks 200 brukere per import' });
      }

      const created: any[] = [];
      const skipped: { email: string; reason: string }[] = [];
      const failed: { email: string; error: string }[] = [];
      const inviterName = (req.user as any)?.firstName
        ? `${(req.user as any).firstName} ${(req.user as any).lastName || ''}`.trim()
        : undefined;
      const rankCache = new Map<string, number>();
      const canManageOthersCache = new Map<string, boolean>();

      for (const u of users) {
        const email = String(u.user_email || u.email || "").trim().toLowerCase();
        if (!email || !email.includes("@")) {
          failed.push({ email: email || "(tom)", error: "Ugyldig e-post" });
          continue;
        }
        const targetRole = normalizeRole(u.role || "miljoarbeider");
        if (!(await canManageRoleDynamic(actorRole, targetRole, rankCache, canManageOthersCache))) {
          skipped.push({ email, reason: `Kan ikke invitere som ${targetRole}` });
          continue;
        }
```

Legg merke til de to cachene (nye — `rankCache`/`canManageOthersCache`, hver opprettet én gang før løkken, sendt inn i hvert `canManageRoleDynamic`-kall i løkken — funksjonen tar 4 parametre, se Interfaces-blokken over) — bulk-import kan ha opptil 200 rader, og uten cache ville hver rad gjort flere DB-oppslag (aktørens `can_manage_others` + aktør- og mål-rang) selv om aktørens verdier er identiske på tvers av alle rader. Resten av løkken (linje 2366 og nedover, duplikat-sjekk osv.) uendret.

- [ ] **Step 5: Erstatt kallstedene i PATCH /api/company/users/:id (linje 2415-2432)**

```ts
  app.patch("/api/company/users/:id", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const { role, approved } = req.body;
      const companyId = Number(req.body.company_id || req.query.company_id) || 1;
      const actorRole = await resolveActorRoleForCompany(req, companyId);

      if (!(await canManageUsersDynamic(actorRole))) {
        return res.status(403).json({ error: 'Du har ikke tilgang til å endre brukere.' });
      }

      if (role != null) {
        const targetRole = normalizeRole(role);
        if (!(await canManageRoleDynamic(actorRole, targetRole))) {
          return res.status(403).json({
            error: `Rollen ${actorRole} kan ikke administrere ${targetRole}.`,
          });
        }
      }
```
(resten uendret).

- [ ] **Step 6: Erstatt kallstedet i DELETE /api/company/users/:id (linje 2480-2486)**

```ts
  app.delete("/api/company/users/:id", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const companyId = Number(req.body?.company_id || req.query.company_id) || 1;
      const actorRole = await resolveActorRoleForCompany(req, companyId);
      if (!(await canManageUsersDynamic(actorRole))) {
        return res.status(403).json({ error: 'Du har ikke tilgang til å fjerne brukere.' });
      }
```
(resten uendret).

- [ ] **Step 7: Bytt import og kallsted i server/routes.ts**

Linje 59, fra:
```ts
import { canAccessVendorApiAdmin, canManageUsers, isTopAdminRole, normalizeRole } from "@shared/roles";
```
til:
```ts
import { canAccessVendorApiAdmin, isTopAdminRole, normalizeRole } from "@shared/roles";
import { canManageUsersDynamic } from "./lib/permissions";
```

Linje 4364-4375 og 4377-4390 (begge `canManageUsers(userRole)` → `await canManageUsersDynamic(userRole)`):
```ts
  app.get("/api/suggestion-team-defaults", isAuthenticated, async (req, res) => {
    try {
      const userRole = (req.user as any)?.role;
      if (!(await canManageUsersDynamic(userRole))) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const defaults = await readSuggestionTeamDefaults();
      res.json({ defaults });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/suggestion-team-defaults", isAuthenticated, async (req, res) => {
    try {
      const userRole = (req.user as any)?.role;
      if (!(await canManageUsersDynamic(userRole))) {
        return res.status(403).json({ error: "Forbidden" });
      }
```
(resten av begge handlers uendret).

- [ ] **Step 8: Skriv regresjonstest for company-user-rutene**

`server/lib/__tests__/company-user-role-hierarchy.test.ts` — verifiser at minst 3 av de erstattede rutene fortsatt gir riktig 403/200-oppførsel med den nye mekanismen bak. Bruk samme mønster som `server/lib/__tests__/vendor-routes-permissions.test.ts` (disponibel rolle via `db.insert(roles)`, JWT-signering med `roleId`, `pool`-opprydding i `finally`). Konkret:

```ts
import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import jwt from "jsonwebtoken";
import { pool } from "../../db";

const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || "change-me-in-production";

describe("company-user routes bruker canManageRoleDynamic/canManageUsersDynamic", () => {
  const cleanupEmails: string[] = [];
  afterEach(async () => {
    for (const email of cleanupEmails.splice(0)) {
      await pool.query(`DELETE FROM tidum_company_users WHERE user_email = $1`, [email]);
    }
  });

  it("tiltaksleder kan invitere miljoarbeider (POST /api/company/users)", async () => {
    process.env.NODE_ENV = "production";
    const { registerSmartTimingRoutes } = await import("../../smartTimingRoutes");
    const app = express();
    app.use(express.json());
    registerSmartTimingRoutes(app);

    const token = jwt.sign({ id: "test-tiltaksleder", email: "t@example.com", role: "tiltaksleder" }, JWT_SECRET);
    const email = `test_f16_${Date.now()}@example.com`;
    cleanupEmails.push(email);

    const res = await request(app)
      .post("/api/company/users")
      .set("Authorization", `Bearer ${token}`)
      .send({ company_id: 1, user_email: email, role: "miljoarbeider", sendInvite: false });

    expect(res.status).toBe(201);
  });

  it("tiltaksleder kan IKKE invitere vendor_admin (POST /api/company/users)", async () => {
    process.env.NODE_ENV = "production";
    const { registerSmartTimingRoutes } = await import("../../smartTimingRoutes");
    const app = express();
    app.use(express.json());
    registerSmartTimingRoutes(app);

    const token = jwt.sign({ id: "test-tiltaksleder-2", email: "t2@example.com", role: "tiltaksleder" }, JWT_SECRET);
    const email = `test_f16_denied_${Date.now()}@example.com`;

    const res = await request(app)
      .post("/api/company/users")
      .set("Authorization", `Bearer ${token}`)
      .send({ company_id: 1, user_email: email, role: "vendor_admin", sendInvite: false });

    expect(res.status).toBe(403);
  });

  it("member kan ikke gjøre noe (canManageUsersDynamic-gaten alene stopper POST)", async () => {
    process.env.NODE_ENV = "production";
    const { registerSmartTimingRoutes } = await import("../../smartTimingRoutes");
    const app = express();
    app.use(express.json());
    registerSmartTimingRoutes(app);

    const token = jwt.sign({ id: "test-member", email: "m@example.com", role: "member" }, JWT_SECRET);

    const res = await request(app)
      .post("/api/company/users")
      .set("Authorization", `Bearer ${token}`)
      .send({ company_id: 1, user_email: `test_f16_member_${Date.now()}@example.com`, role: "member", sendInvite: false });

    expect(res.status).toBe(403);
  });

  it("resolveActorRoleForCompanys tidum_company_users-gren: en aktør med member som sesjonsrolle, men tiltaksleder i tidum_company_users for DENNE company_id, kan invitere miljoarbeider", async () => {
    process.env.NODE_ENV = "production";
    const { registerSmartTimingRoutes } = await import("../../smartTimingRoutes");
    const app = express();
    app.use(express.json());
    registerSmartTimingRoutes(app);

    const actorEmail = `test_f16_actor_branch2_${Date.now()}@example.com`;
    cleanupEmails.push(actorEmail);
    // Selve aktøren registrert som tiltaksleder for company_id 1 — dette
    // er raden resolveActorRoleForCompany finner når sesjonens EGEN rolle
    // (member, under) ikke alene kvalifiserer til canManageUsersDynamic.
    await pool.query(
      `INSERT INTO tidum_company_users (vendor_id, company_id, user_email, role, approved) VALUES (1, 1, $1, 'tiltaksleder', true)`,
      [actorEmail],
    );

    // JWT-payloadens "role" er bevisst 'member' — normalizeRole(req.user.role)
    // alene ville feilet canManageUsersDynamic, og tvinger dermed
    // resolveActorRoleForCompany til å slå opp raden over via e-post+company_id.
    const token = jwt.sign({ id: "test-actor-branch2", email: actorEmail, role: "member" }, JWT_SECRET);
    const targetEmail = `test_f16_target_branch2_${Date.now()}@example.com`;
    cleanupEmails.push(targetEmail);

    const res = await request(app)
      .post("/api/company/users")
      .set("Authorization", `Bearer ${token}`)
      .send({ company_id: 1, user_email: targetEmail, role: "miljoarbeider", sendInvite: false });

    expect(res.status).toBe(201);
  });
});
```

`process.env.NODE_ENV = "production"` + `vi.resetModules()`-mønsteret fra tidligere tester i denne filen er IKKE nødvendig her siden testen ikke krysser dev-mode-bypass-grensen på samme måte som `authenticateAdmin`s egne tester — men verifiser dette stemmer ved å kjøre testen; hvis dev-mode-bypass slår inn (alle requests logges inn som super_admin uansett JWT), legg til samme `vi.resetModules()`-oppsett som `vendor-routes-permissions.test.ts` bruker.

- [ ] **Step 9: Kjør testen + hele den eksisterende testsuiten, bekreft ingen regresjon**

Kjør: `DATABASE_URL='<ekte verdi>' npx vitest run`
Forventet: alle tidligere bestående tester består fortsatt (samme antall som før denne oppgaven), pluss de nye testene fra Step 8/Task 1s Step 6.

- [ ] **Step 10: Commit**

```bash
git add server/smartTimingRoutes.ts server/routes.ts \
  server/lib/__tests__/company-user-role-hierarchy.test.ts
git commit -m "feat: erstatt canManageRole/canManageUsers med rangbasert versjon (fase 1.6, Task 2)"
```

---

### Task 3: Nytt endepunkt GET /api/company/users/manageable-roles

**Files:**
- Modify: `server/smartTimingRoutes.ts` (nytt endepunkt, sett inn etter linje 2493, før `// ========== COMPANY LOGS ==========`)
- Test: `server/lib/__tests__/manageable-roles-endpoint.test.ts`

**Interfaces:**
- Konsumerer: `canManageRoleDynamic`, `getRoleRank` (Task 1), `resolveActorRoleForCompany` (uendret, eksisterende), `normalizeRole` (`@shared/roles`).
- Produserer: `GET /api/company/users/manageable-roles?company_id=<id>&preview_role=<rolle>` → `{ roles: string[] }`. Task 4 (klient) konsumerer dette endepunktet direkte.

- [ ] **Step 1: Skriv endepunktet**

Sett inn i `server/smartTimingRoutes.ts` rett etter DELETE-routen (linje 2493, før `// ========== COMPANY LOGS ==========`):

```ts
  // GET /api/company/users/manageable-roles?company_id=X&preview_role=Y
  // Returnerer hvilke av TIDUM_ROLES aktøren kan tildele — brukes av
  // inviter-dialogen (users.tsx) til å fylle rolle-dropdownen, i stedet
  // for at klienten regner ut selv fra en hardkodet tabell (fase 1.6).
  //
  // preview_role: klientens "forhåndsvis som rolle X"-funksjon
  // (use-role-preview.tsx) er en ren UI-simulering som ALDRI har vært
  // sendt til server før denne oppgaven — kun tilgjengelig for aktører
  // som selv kvalifiserer til forhåndsvisning (canManageUsersDynamic på
  // deres EGEN, ekte rolle). Når satt og aktøren kvalifiserer, beregnes
  // listen for preview_role i stedet for aktørens ekte rolle — kun for
  // DENNE listen, aldri for faktisk skriveautorisasjon (POST/PATCH/DELETE
  // over bruker fortsatt utelukkende den ekte aktør-rollen).
  app.get("/api/company/users/manageable-roles", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const companyId = Number(req.query.company_id) || 1;
      const actorRole = await resolveActorRoleForCompany(req, companyId);

      let roleForLookup = actorRole;
      const previewRoleRaw = req.query.preview_role;
      if (typeof previewRoleRaw === "string" && previewRoleRaw.length > 0) {
        const actorQualifiesToPreview = await canManageUsersDynamic(actorRole);
        if (actorQualifiesToPreview) {
          roleForLookup = normalizeRole(previewRoleRaw);
        }
      }

      const cache = new Map<string, number>();
      const results = await Promise.all(
        TIDUM_ROLES.map(async (candidate) => ({
          role: candidate,
          allowed: await canManageRoleDynamic(roleForLookup, candidate, cache),
        })),
      );

      res.json({ roles: results.filter((r) => r.allowed).map((r) => r.role) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

```

- [ ] **Step 2: Importer TIDUM_ROLES**

Task 2 Step 1 endret importen fra `@shared/roles` til
`import { normalizeRole } from "@shared/roles";`. Finn denne linjen (grep
etter `from "@shared/roles"` i toppen av filen — nøyaktig linjenummer kan
ha forskjøvet seg fra Task 2s edit) og legg til `TIDUM_ROLES`:

```ts
import { normalizeRole, TIDUM_ROLES } from "@shared/roles";
```

- [ ] **Step 3: Skriv testen**

`server/lib/__tests__/manageable-roles-endpoint.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import express from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || "change-me-in-production";

describe("GET /api/company/users/manageable-roles", () => {
  it("vendor_admin får tiltaksleder/teamleder/case_manager/miljoarbeider/member/user, ikke hovedadmin/super_admin", async () => {
    process.env.NODE_ENV = "production";
    const { registerSmartTimingRoutes } = await import("../../smartTimingRoutes");
    const app = express();
    registerSmartTimingRoutes(app);

    const token = jwt.sign({ id: "test-va", email: "va@example.com", role: "vendor_admin" }, JWT_SECRET);
    const res = await request(app)
      .get("/api/company/users/manageable-roles?company_id=1")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.roles.sort()).toEqual(
      ["case_manager", "member", "miljoarbeider", "teamleder", "tiltaksleder", "user"].sort(),
    );
  });

  it("member får tom liste", async () => {
    process.env.NODE_ENV = "production";
    const { registerSmartTimingRoutes } = await import("../../smartTimingRoutes");
    const app = express();
    registerSmartTimingRoutes(app);

    const token = jwt.sign({ id: "test-member-mr", email: "m@example.com", role: "member" }, JWT_SECRET);
    const res = await request(app)
      .get("/api/company/users/manageable-roles?company_id=1")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.roles).toEqual([]);
  });

  it("preview_role brukes kun når aktøren selv kvalifiserer til å forhåndsvise", async () => {
    process.env.NODE_ENV = "production";
    const { registerSmartTimingRoutes } = await import("../../smartTimingRoutes");
    const app = express();
    registerSmartTimingRoutes(app);

    // super_admin kvalifiserer (canManageUsersDynamic er sann for super_admin)
    // og forhåndsviser som tiltaksleder — skal få tiltaksleders liste, ikke sin egen.
    const superAdminToken = jwt.sign({ id: "test-sa-preview", email: "sa@example.com", role: "super_admin" }, JWT_SECRET);
    const previewRes = await request(app)
      .get("/api/company/users/manageable-roles?company_id=1&preview_role=tiltaksleder")
      .set("Authorization", `Bearer ${superAdminToken}`);

    expect(previewRes.status).toBe(200);
    expect(previewRes.body.roles.sort()).toEqual(["member", "miljoarbeider", "user"].sort());

    // member kvalifiserer IKKE (canManageUsersDynamic er usann) — preview_role
    // skal ignoreres, member får fortsatt sin egen (tomme) liste.
    const memberToken = jwt.sign({ id: "test-member-preview", email: "mp@example.com", role: "member" }, JWT_SECRET);
    const ignoredRes = await request(app)
      .get("/api/company/users/manageable-roles?company_id=1&preview_role=super_admin")
      .set("Authorization", `Bearer ${memberToken}`);

    expect(ignoredRes.status).toBe(200);
    expect(ignoredRes.body.roles).toEqual([]);
  });
});
```

- [ ] **Step 4: Kjør testen**

Kjør: `DATABASE_URL='<ekte verdi>' npx vitest run server/lib/__tests__/manageable-roles-endpoint.test.ts`
Forventet: 3/3 bestått.

- [ ] **Step 5: Commit**

```bash
git add server/smartTimingRoutes.ts server/lib/__tests__/manageable-roles-endpoint.test.ts
git commit -m "feat: GET /api/company/users/manageable-roles endepunkt (fase 1.6, Task 3)"
```

---

### Task 4: Klient — bytt users.tsx til å bruke det nye endepunktet

**Files:**
- Modify: `client/src/pages/users.tsx` (linje 60, 291-292)

**Interfaces:**
- Konsumerer: `GET /api/company/users/manageable-roles` (Task 3).
- Produserer: ingen — siste oppgave i planen.

- [ ] **Step 1: Fjern canManageRole-importen, behold resten**

Linje 60, fra:
```ts
import { canManageRole, getRoleLabel, normalizeRole } from "@shared/roles";
```
til:
```ts
import { getRoleLabel, normalizeRole } from "@shared/roles";
```

- [ ] **Step 2: Bytt allowedInviteRoles til å hente fra det nye endepunktet**

Linje 291-292, fra:
```ts
  const actorRole = effectiveRole;
  const allowedInviteRoles = inviteRoleOptions.filter((role) => canManageRole(actorRole, role));
```
til:
```ts
  const { data: manageableRolesData } = useQuery<{ roles: string[] }>({
    queryKey: [
      "/api/company/users/manageable-roles",
      {
        company_id: companyId,
        // isPreviewActive er kun sann når canPreviewRoles er sann (se
        // use-role-preview.tsx) — serveren re-verifiserer likevel selv om
        // aktøren kvalifiserer til forhåndsvisning før den bruker denne
        // parameteren, se Task 3s endepunkt.
        preview_role: isPreviewActive ? effectiveRole : undefined,
      },
    ],
    enabled: companyId != null,
  });
  const manageableRoleSet = new Set(manageableRolesData?.roles ?? []);
  const allowedInviteRoles = inviteRoleOptions.filter((role) => manageableRoleSet.has(role));
```

`isPreviewActive` hentes fra `useRolePreview()` — legg til i destruktureringen på linje 142 (`const { effectiveRole } = useRolePreview();` → `const { effectiveRole, isPreviewActive } = useRolePreview();`).

- [ ] **Step 3: Verifiser query-nøkkel-mønsteret**

`client/src/lib/queryClient.ts`s `getQueryFn` (linje 77-111) konverterer `queryKey[1]` automatisk til URL-query-parametre når det er et objekt (samme mønster brukes allerede andre steder i kodebasen) — ingen egen fetch-kode nødvendig utover selve `useQuery`-kallet over.

- [ ] **Step 4: Manuell verifisering i nettleser**

Start dev-server, logg inn som en rolle med invitasjonsrett (f.eks. `vendor_admin`), åpne inviter-dialogen på `/users`, bekreft rolle-dropdownen viser samme rollesett som før migreringen. Test også forhåndsvisnings-modus (hvis innlogget som `super_admin`/`hovedadmin`/`vendor_admin`): bytt til "Institusjon"-visning (`tiltaksleder`), åpne inviter-dialogen, bekreft dropdownen nå viser `tiltaksleder`s tildelbare roller (`miljoarbeider`, `member`, `user`), ikke den ekte aktørens.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/users.tsx
git commit -m "feat: users.tsx henter tildelbare roller fra server (fase 1.6, Task 4)"
```
