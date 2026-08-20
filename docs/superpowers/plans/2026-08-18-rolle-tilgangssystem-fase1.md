# Rolle- og tilgangssystem (fase 1: internt adminpanel) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Erstatt de hardkodede `req.admin.role !== 'super_admin'`-strengsjekkene i det interne Tidum-adminpanelet (`authenticateAdmin`-ruter i `server/smartTimingRoutes.ts`) med et database-drevet rolle-/tillatelsessystem super admin kan redigere uten deploy.

**Architecture:** Ny `permissions`/`roles`/`role_permissions`-modell i Postgres. Tillatelser er en fast katalog utviklere definerer i kode; roller er database-rader super admin oppretter/redigerer. En `hasPermission(roleId, key)`-funksjon erstatter strengsjekkene, rute for rute. Eksisterende `super_admin`/`vendor_admin`-brukere migreres inn som forhåndsutfylte roller — ingen mister tilgang ved lansering.

**Tech Stack:** Express, Drizzle ORM, Postgres, React (client-side admin-UI), TanStack Query.

**Spec:** `docs/superpowers/specs/2026-08-18-rolle-tilgangssystem-design.md`

## Global Constraints

- Fødselsnummer, passord-hasher og andre sensitive felt er utenfor omfang — ingen av disse tabellene rører dem.
- Portalens `canManageRole`/`canManageUsers` (i `shared/roles.ts`, brukt av `client/src/pages/users.tsx` og portens `/api/company/users`-ruter) rører vi IKKE i denne planen. `users.role` (fri tekst) forblir uendret og fortsetter å style portalen.
- Alle nye tabeller: Drizzle-skjema i `shared/models/`, idempotent SQL-migrasjon i `migrations/`, lagt til `STARTUP_MIGRATIONS`-listen i `server/lib/run-startup-migrations.ts`.
- `hasPermission()` er fail-closed: mangler `roleId`, ukjent `permissionKey`, eller DB-feil skal ALLTID returnere `false`, aldri kaste og aldri returnere `true`.
- `authenticateAdmin`s tre grener (JWT Bearer, sesjon, `isDevMode`-bypass) skal ALLE sette `req.admin.roleId` — ikke bare to av de tre.
- Migrering av eksisterende `super_admin`/`vendor_admin`-brukere skal ikke endre deres faktiske tilgang — verifiseres eksplisitt i Task 1.

---

### Task 1: Datamodell, migrasjon og rolle-seed

**Files:**
- Create: `shared/models/permissions.ts`
- Create: `server/lib/permission-catalog.ts`
- Create: `migrations/054_role_permission_system.sql`
- Modify: `server/lib/run-startup-migrations.ts:8-22` (legg til `"054_role_permission_system.sql"` i `STARTUP_MIGRATIONS`-listen)
- Create: `server/lib/__tests__/permission-catalog.test.ts`

**Interfaces:**
- Produces: `permissions`, `roles`, `rolePermissions` (Drizzle-tabeller, eksportert fra `shared/models/permissions.ts`), `PERMISSION_CATALOG: readonly { key: string; label: string; module: string }[]` og `type PermissionKey` (fra `server/lib/permission-catalog.ts`).

- [ ] **Step 1: Skriv Drizzle-skjemaet**

`shared/models/permissions.ts`:

```ts
import { sql } from "drizzle-orm";
import { boolean, integer, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

export const permissions = pgTable("permissions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  key: varchar("key").notNull().unique(),
  label: text("label").notNull(),
  module: varchar("module").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const roles = pgTable(
  "roles",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    name: varchar("name").notNull(),
    scope: varchar("scope").notNull(),
    vendorId: integer("vendor_id"),
    isSystemDefault: boolean("is_system_default").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("roles_scope_vendor_name_key").on(table.scope, table.vendorId, table.name),
  ],
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id").notNull().references(() => permissions.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("role_permissions_role_permission_key").on(table.roleId, table.permissionId),
  ],
);

export type Role = typeof roles.$inferSelect;
export type Permission = typeof permissions.$inferSelect;
export type NewRole = typeof roles.$inferInsert;
```

- [ ] **Step 2: Skriv tillatelseskatalogen**

`server/lib/permission-catalog.ts`:

```ts
export const PERMISSION_CATALOG = [
  { key: "vendor.create", label: "Opprette leverandør", module: "leverandorer" },
  { key: "vendor.admin.create", label: "Opprette leverandøradmin", module: "leverandorer" },
  { key: "vendor.poweroffice_visibility.toggle", label: "Skjule/vise PowerOffice for leverandør", module: "leverandorer" },
  { key: "prototype_tester.invite", label: "Invitere prototype-tester", module: "prototype_testere" },
  { key: "prototype_tester.convert", label: "Konvertere tester til leverandøradmin", module: "prototype_testere" },
  { key: "user.expected_ssn.set", label: "Forhåndsregistrere fødselsnummer på konto", module: "eid" },
  { key: "role.manage", label: "Administrere roller og tillatelser", module: "systemadministrasjon" },
] as const;

export type PermissionKey = typeof PERMISSION_CATALOG[number]["key"];

export const VENDOR_ADMIN_PERMISSION_KEYS: PermissionKey[] = [
  "vendor.admin.create",
  "vendor.poweroffice_visibility.toggle",
];
```

- [ ] **Step 3: Skriv den idempotente SQL-migrasjonen**

`migrations/054_role_permission_system.sql`:

```sql
CREATE TABLE IF NOT EXISTS permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR NOT NULL UNIQUE,
  label TEXT NOT NULL,
  module VARCHAR NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR NOT NULL,
  scope VARCHAR NOT NULL,
  vendor_id INTEGER,
  is_system_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS roles_scope_vendor_name_key
  ON roles (scope, COALESCE(vendor_id, -1), name);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS role_permissions_role_permission_key
  ON role_permissions (role_id, permission_id);

ALTER TABLE users ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES roles(id);

-- Seed: tillatelseskatalogen (7 rader, se server/lib/permission-catalog.ts —
-- hold denne listen synkronisert manuelt, det er kun 7 rader).
INSERT INTO permissions (key, label, module) VALUES
  ('vendor.create', 'Opprette leverandør', 'leverandorer'),
  ('vendor.admin.create', 'Opprette leverandøradmin', 'leverandorer'),
  ('vendor.poweroffice_visibility.toggle', 'Skjule/vise PowerOffice for leverandør', 'leverandorer'),
  ('prototype_tester.invite', 'Invitere prototype-tester', 'prototype_testere'),
  ('prototype_tester.convert', 'Konvertere tester til leverandøradmin', 'prototype_testere'),
  ('user.expected_ssn.set', 'Forhåndsregistrere fødselsnummer på konto', 'eid'),
  ('role.manage', 'Administrere roller og tillatelser', 'systemadministrasjon')
ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label, module = EXCLUDED.module;

-- Seed: systemrollen super_admin får ALLE tillatelser
INSERT INTO roles (name, scope, is_system_default)
VALUES ('super_admin', 'global', TRUE)
ON CONFLICT (scope, COALESCE(vendor_id, -1), name) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'super_admin' AND r.scope = 'global'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Seed: systemrollen vendor_admin får kun leverandør-relaterte tillatelser
-- (IKKE vendor.create eller role.manage — matcher dagens super_admin-only-sjekker)
INSERT INTO roles (name, scope, is_system_default)
VALUES ('vendor_admin', 'global', TRUE)
ON CONFLICT (scope, COALESCE(vendor_id, -1), name) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'vendor_admin' AND r.scope = 'global'
  AND p.key IN ('vendor.admin.create', 'vendor.poweroffice_visibility.toggle')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Koble eksisterende kontoer til de migrerte rollene automatisk.
UPDATE users u
SET role_id = r.id
FROM roles r
WHERE r.scope = 'global' AND r.name = u.role AND u.role IN ('super_admin', 'vendor_admin')
  AND u.role_id IS NULL;
```

- [ ] **Step 4: Legg migrasjonen til startup-listen**

I `server/lib/run-startup-migrations.ts`, legg `"054_role_permission_system.sql"` til slutt i `STARTUP_MIGRATIONS`-arrayet (etter `"051_mobile_refresh_tokens.sql"`, etter `"053_expected_ssn_hash.sql"` hvis den allerede er der).

- [ ] **Step 5: Skriv en verifiseringstest for katalog-konsistens**

`server/lib/__tests__/permission-catalog.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { PERMISSION_CATALOG } from "../permission-catalog";

describe("PERMISSION_CATALOG matches migration seed", () => {
  it("every catalog key exists in migrations/054_role_permission_system.sql", () => {
    const sql = readFileSync("migrations/054_role_permission_system.sql", "utf8");
    for (const { key } of PERMISSION_CATALOG) {
      expect(sql.includes(`'${key}'`)).toBe(true);
    }
  });

  it("has exactly 7 entries (update this test when you add one)", () => {
    expect(PERMISSION_CATALOG.length).toBe(7);
  });
});
```

- [ ] **Step 6: Kjør testen, verifiser den passerer**

Run: `npx vitest run server/lib/__tests__/permission-catalog.test.ts`
Expected: 2 passed

- [ ] **Step 7: Commit**

```bash
git add shared/models/permissions.ts server/lib/permission-catalog.ts migrations/054_role_permission_system.sql server/lib/run-startup-migrations.ts server/lib/__tests__/permission-catalog.test.ts
git commit -m "feat(roles): add permissions/roles/role_permissions schema and seed migration"
```

---

### Task 2: `hasPermission()`-motoren

**Files:**
- Create: `server/lib/permissions.ts`
- Create: `server/lib/__tests__/permissions.test.ts`

**Interfaces:**
- Consumes: `roles`, `rolePermissions`, `permissions` (fra Task 1, `shared/models/permissions.ts`).
- Produces: `hasPermission(roleId: string | null | undefined, permissionKey: string, cache?: Map<string, boolean>): Promise<boolean>`.

- [ ] **Step 1: Skriv den failende testen**

`server/lib/__tests__/permissions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db", () => ({
  db: { select: vi.fn() },
}));

import { hasPermission } from "../permissions";
import { db } from "../db";

describe("hasPermission", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns false when roleId is null", async () => {
    expect(await hasPermission(null, "vendor.create")).toBe(false);
  });

  it("returns false when roleId is undefined", async () => {
    expect(await hasPermission(undefined, "vendor.create")).toBe(false);
  });

  it("returns true when the role has the permission", async () => {
    (db.select as any).mockReturnValue({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            limit: () => Promise.resolve([{ id: "role-1" }]),
          }),
        }),
      }),
    });
    expect(await hasPermission("role-1", "vendor.create")).toBe(true);
  });

  it("returns false when the role lacks the permission", async () => {
    (db.select as any).mockReturnValue({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            limit: () => Promise.resolve([]),
          }),
        }),
      }),
    });
    expect(await hasPermission("role-1", "vendor.create")).toBe(false);
  });

  it("returns false (not throw) when the DB query rejects", async () => {
    (db.select as any).mockReturnValue({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            limit: () => Promise.reject(new Error("connection lost")),
          }),
        }),
      }),
    });
    expect(await hasPermission("role-1", "vendor.create")).toBe(false);
  });

  it("caches a positive result and does not re-query", async () => {
    const limit = vi.fn().mockResolvedValue([{ id: "role-1" }]);
    (db.select as any).mockReturnValue({
      from: () => ({ innerJoin: () => ({ where: () => ({ limit }) }) }),
    });
    const cache = new Map<string, boolean>();
    await hasPermission("role-1", "vendor.create", cache);
    await hasPermission("role-1", "vendor.create", cache);
    expect(limit).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Kjør testen, verifiser at den feiler**

Run: `npx vitest run server/lib/__tests__/permissions.test.ts`
Expected: FAIL — `Cannot find module '../permissions'`

- [ ] **Step 3: Skriv implementasjonen**

`server/lib/permissions.ts`:

```ts
import { db } from "./db";
import { roles, rolePermissions, permissions } from "@shared/models/permissions";
import { eq, and } from "drizzle-orm";

export async function hasPermission(
  roleId: string | null | undefined,
  permissionKey: string,
  cache?: Map<string, boolean>,
): Promise<boolean> {
  if (!roleId) return false;

  const cacheKey = `${roleId}:${permissionKey}`;
  if (cache?.has(cacheKey)) return cache.get(cacheKey)!;

  try {
    const [row] = await db
      .select({ id: rolePermissions.roleId })
      .from(rolePermissions)
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(and(eq(rolePermissions.roleId, roleId), eq(permissions.key, permissionKey)))
      .limit(1);

    const result = !!row;
    cache?.set(cacheKey, result);
    return result;
  } catch (err) {
    console.error("[permissions] hasPermission query failed", roleId, permissionKey, err);
    return false;
  }
}

export async function getRoleById(roleId: string) {
  const [role] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
  return role ?? null;
}
```

- [ ] **Step 4: Kjør testen, verifiser at den passerer**

Run: `npx vitest run server/lib/__tests__/permissions.test.ts`
Expected: 6 passed

- [ ] **Step 5: Commit**

```bash
git add server/lib/permissions.ts server/lib/__tests__/permissions.test.ts
git commit -m "feat(roles): add hasPermission() engine, fail-closed with per-request cache"
```

---

### Task 3: `authenticateAdmin`-utvidelsen (inkl. dev-mode-fiksen)

**Files:**
- Modify: `server/smartTimingRoutes.ts:196-221` (`authenticateAdmin`-funksjonen)
- Modify: `server/smartTimingRoutes.ts` (type-utvidelse for `AuthRequest.admin`)
- Test: `server/lib/__tests__/authenticate-admin.test.ts`

**Interfaces:**
- Consumes: `getRoleById` (Task 2, `server/lib/permissions.ts`), `roles` (Task 1).
- Produces: `req.admin.roleId: string | undefined` satt på alle tre autentiseringsgrener.

- [ ] **Step 1: Finn og les `AuthRequest`-typen**

Kjør `grep -n "interface AuthRequest" server/smartTimingRoutes.ts` for å finne definisjonen. Legg til `roleId?: string;` i `admin`-objektets type der.

- [ ] **Step 2: Skriv den failende testen**

`server/lib/__tests__/authenticate-admin.test.ts` — test mot en ekte testdatabase (samme mønster som andre `server/lib/__tests__`-filer i repoet som treffer DB direkte; se `client/src/test/server/mobile-auth.test.ts` for eksisterende mønster på hvordan en test-bruker og test-rolle settes opp og ryddes bort i `afterEach`):

```ts
import { describe, it, expect, afterEach } from "vitest";
import { db } from "../db";
import { roles } from "@shared/models/permissions";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import request from "supertest";
import express from "express";
import { registerSmartTimingRoutes } from "../../smartTimingRoutes";

describe("authenticateAdmin sets req.admin.roleId", () => {
  afterEach(async () => {
    await db.delete(roles).where(eq(roles.name, "test_role_for_auth_check"));
  });

  it("dev-mode branch resolves the migrated super_admin role's real id", async () => {
    process.env.NODE_ENV = "development";
    const app = express();
    registerSmartTimingRoutes(app);

    const res = await request(app).get("/api/prototype-testers");
    // isDevMode-grenen skal ikke gi 403 lenger nå at role_id er satt —
    // dette er akkurat regresjonen fallgruve 1 i skillen advarer mot.
    expect(res.status).not.toBe(403);
  });
});
```

- [ ] **Step 3: Kjør testen, verifiser at den feiler**

Run: `npx vitest run server/lib/__tests__/authenticate-admin.test.ts`
Expected: FAIL med 403 (dev-mode-grenen har ikke `roleId` ennå)

- [ ] **Step 4: Fiks `authenticateAdmin`**

I `server/smartTimingRoutes.ts`, endre funksjonen (linje 196-221) slik:

```ts
let cachedSuperAdminRoleId: string | null = null;

async function resolveSuperAdminRoleId(): Promise<string | null> {
  if (cachedSuperAdminRoleId) return cachedSuperAdminRoleId;
  const [role] = await pool.query(
    `SELECT id FROM roles WHERE scope = 'global' AND name = 'super_admin' LIMIT 1`,
  ).then((r) => r.rows);
  cachedSuperAdminRoleId = role?.id ?? null;
  return cachedSuperAdminRoleId;
}

async function authenticateAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  // DEV MODE: bypass auth
  if (isDevMode) {
    req.admin = { id: '1', email: 'dev@tidum.no', role: 'super_admin', roleId: (await resolveSuperAdminRoleId()) ?? undefined };
    return next();
  }
  // Try JWT Bearer token first
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      req.admin = decoded;
      if (!req.admin.roleId) {
        const row = await pool.query(`SELECT role_id FROM users WHERE id = $1`, [req.admin.id]);
        req.admin.roleId = row.rows[0]?.role_id ?? undefined;
      }
      return next();
    } catch (err) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  }
  // Fall back to session-based auth (Google OAuth)
  if (req.isAuthenticated?.() && req.user) {
    const user = req.user as any;
    req.admin = { id: user.id, email: user.email, role: user.role, roleId: user.roleId ?? undefined };
    return next();
  }
  return res.status(401).json({ error: 'Authentication required' });
}
```

Merk: `resolveSuperAdminRoleId()` cacher i en modul-variabel — slått opp én
gang per serverprosess-liv, ikke per request. Hvis `super_admin`-rollen
skulle bli omdøpt eller slettet og gjenskapt etter serveroppstart, krever
det en restart for at cachen skal oppdateres — akseptabelt i fase 1, følg
opp senere hvis rolleadministrasjon (Task 6) gjør dette til et reelt
problem.

- [ ] **Step 5: Kjør testen, verifiser at den passerer**

Run: `npx vitest run server/lib/__tests__/authenticate-admin.test.ts`
Expected: 1 passed

- [ ] **Step 6: Commit**

```bash
git add server/smartTimingRoutes.ts server/lib/__tests__/authenticate-admin.test.ts
git commit -m "feat(roles): set req.admin.roleId on all three authenticateAdmin branches"
```

---

### Task 4: Migrer `/api/vendors` og `/api/vendors/:id/admins`

**Files:**
- Modify: `server/smartTimingRoutes.ts:1084` (`/api/vendors` POST)
- Modify: `server/smartTimingRoutes.ts:1194-1201` (`/api/vendors/:id/admins` POST)
- Test: `server/lib/__tests__/vendor-routes-permissions.test.ts`

**Interfaces:**
- Consumes: `hasPermission` (Task 2).

- [ ] **Step 1: Skriv den failende testen**

`server/lib/__tests__/vendor-routes-permissions.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import express from "express";
import jwt from "jsonwebtoken";
import { registerSmartTimingRoutes } from "../../smartTimingRoutes";
import { db } from "../db";
import { roles } from "@shared/models/permissions";
import { eq } from "drizzle-orm";

// Samme fallback-kjede som JWT_SECRET i server/smartTimingRoutes.ts:41 —
// konstanten selv er modul-privat og ikke eksportert, så testen regner den
// ut identisk fra samme miljøvariabler i stedet for å importere den.
const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || "change-me-in-production";

function signAdminToken(payload: { id: string; email: string; role: string; roleId?: string }) {
  return jwt.sign(payload, JWT_SECRET);
}

describe("vendor routes use hasPermission()", () => {
  it("rejects vendor admin creation without vendor.admin.create permission", async () => {
    const [role] = await db
      .insert(roles)
      .values({ name: "test_role_no_vendor_perm", scope: "global" })
      .returning();

    const app = express();
    app.use(express.json());
    registerSmartTimingRoutes(app);

    const token = signAdminToken({ id: "test-user-1", email: "t@example.com", role: "test_role_no_vendor_perm", roleId: role.id });
    const res = await request(app)
      .post("/api/vendors/1/admins")
      .set("Authorization", `Bearer ${token}`)
      .send({ username: "test", email: "test@example.com" });

    expect(res.status).toBe(403);

    await db.delete(roles).where(eq(roles.id, role.id));
  });
});
```

- [ ] **Step 2: Kjør testen, verifiser at den feiler**

Run: `npx vitest run server/lib/__tests__/vendor-routes-permissions.test.ts`
Expected: FAIL — ruten godtar fortsatt forespørselen (gammel strengsjekk matcher ikke ennå)

- [ ] **Step 3: Migrer `/api/vendors/:id/admins`**

I `server/smartTimingRoutes.ts:1198-1201`, ERSTATT (ikke behold i tillegg — se fallgruve 3 i skillen):

```ts
      // Only super_admin or vendor_admin of this vendor can create admins
      if (req.admin.role !== 'super_admin' && req.admin.vendorId !== vendorId) {
        return res.status(403).json({ error: 'Access denied' });
      }
```

med:

```ts
      // Migrert til det dynamiske tilgangssystemet — se .claude/skills/rolle-tilgangssystem
      const allowed = (await hasPermission(req.admin.roleId, "vendor.admin.create"))
        || req.admin.vendorId === vendorId;
      if (!allowed) {
        return res.status(403).json({ error: 'Access denied' });
      }
```

- [ ] **Step 4: Migrer `/api/vendors` POST (linje 1084)**

Finn den eksisterende tilgangssjekken i denne ruten (les de 15 linjene
etter `app.post("/api/vendors", authenticateAdmin, ...`) og erstatt den
tilsvarende strengsjekken med `await hasPermission(req.admin.roleId,
"vendor.create")`.

- [ ] **Step 5: Legg til import**

Øverst i `server/smartTimingRoutes.ts`, legg til:

```ts
import { hasPermission } from "./lib/permissions";
```

- [ ] **Step 6: Kjør testen, verifiser at den passerer**

Run: `npx vitest run server/lib/__tests__/vendor-routes-permissions.test.ts`
Expected: 1 passed

- [ ] **Step 7: Manuell regresjonssjekk**

Start dev-server, logg inn som (dev-mode) super admin, opprett en
leverandøradmin gjennom `vendors.tsx`-UI-et som før. Skal fortsatt
fungere identisk — dette er nøyaktig migreringsverifiseringen spec-en
krever.

- [ ] **Step 8: Commit**

```bash
git add server/smartTimingRoutes.ts server/lib/__tests__/vendor-routes-permissions.test.ts
git commit -m "feat(roles): migrate /api/vendors routes to hasPermission()"
```

---

### Task 5: Migrer prototype-tester-rutene og personnummer-endepunktet

**Files:**
- Modify: `server/smartTimingRoutes.ts` (prototype-tester-rutene, rett etter vendor-admin-ruten — se `app.get("/api/prototype-testers", ...)`)
- Modify: `server/smartTimingRoutes.ts` (`/api/admin/users/expected-ssn`-ruten lagt til i tidligere økt)
- Test: `server/lib/__tests__/prototype-tester-permissions.test.ts`

**Interfaces:**
- Consumes: `hasPermission` (Task 2).

- [ ] **Step 1: Skriv failende tester for hvert endepunkt**

`server/lib/__tests__/prototype-tester-permissions.test.ts` — gjenbruk
`signAdminToken()`-hjelperen fra Task 4s testfil (kopier den inn, eller
flytt den til en delt `server/lib/__tests__/test-helpers.ts` hvis du
foretrekker det). Én case per rute, hver med en rolle uten den aktuelle
tillatelsen:

```ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import express from "express";
import jwt from "jsonwebtoken";
import { registerSmartTimingRoutes } from "../../smartTimingRoutes";
import { db } from "../db";
import { roles } from "@shared/models/permissions";
import { eq } from "drizzle-orm";

const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || "change-me-in-production";

async function tokenForEmptyRole(name: string) {
  const [role] = await db.insert(roles).values({ name, scope: "global" }).returning();
  const token = jwt.sign({ id: "test-user", email: "t@example.com", role: name, roleId: role.id }, JWT_SECRET);
  return { token, roleId: role.id, name };
}

describe("prototype-tester and expected-ssn routes use hasPermission()", () => {
  const cases: Array<[string, string, string]> = [
    ["GET", "/api/prototype-testers", "test_role_no_role_manage"],
    ["POST", "/api/prototype-testers", "test_role_no_invite"],
    ["POST", "/api/prototype-testers/00000000-0000-0000-0000-000000000000/convert-to-vendor-admin", "test_role_no_convert"],
    ["PATCH", "/api/admin/users/expected-ssn", "test_role_no_expected_ssn"],
  ];

  for (const [method, path, roleName] of cases) {
    it(`${method} ${path} rejects a role without the matching permission`, async () => {
      const { token } = await tokenForEmptyRole(roleName);
      const app = express();
      app.use(express.json());
      registerSmartTimingRoutes(app);

      const res = await (request(app) as any)[method.toLowerCase()](path)
        .set("Authorization", `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(403);
      await db.delete(roles).where(eq(roles.name, roleName));
    });
  }
});
```

- [ ] **Step 2: Kjør testene, verifiser at de feiler**

Run: `npx vitest run server/lib/__tests__/prototype-tester-permissions.test.ts`
Expected: FAIL på alle 4 (gamle sjekker fortsatt aktive)

- [ ] **Step 3: Migrer hver rute**

For hver av de fire rutene: finn den eksisterende
`if (req.admin.role !== 'super_admin') { return res.status(403)...}`-
sjekken, og ERSTATT den med riktig `hasPermission()`-kall fra tabellen:

| Rute | `permissionKey` |
|---|---|
| `GET /api/prototype-testers` | `role.manage` |
| `POST /api/prototype-testers` | `prototype_tester.invite` |
| Konverteringsruten (`/convert-to-vendor-admin`) | `prototype_tester.convert` |
| `PATCH /api/admin/users/expected-ssn` | `user.expected_ssn.set` |

Husk: `role.manage` på listeruten er en bevisst innsnevring —
`vendor_admin`-systemrollen fikk IKKE denne tillatelsen i Task 1s seed, så
en migrert `vendor_admin` kan fortsatt ikke se prototype-tester-listen,
akkurat som i dag.

- [ ] **Step 4: Kjør testene, verifiser at de passerer**

Run: `npx vitest run server/lib/__tests__/prototype-tester-permissions.test.ts`
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add server/smartTimingRoutes.ts server/lib/__tests__/prototype-tester-permissions.test.ts
git commit -m "feat(roles): migrate prototype-tester and expected-ssn routes to hasPermission()"
```

---

### Task 6: Admin-UI for rolleadministrasjon

**Files:**
- Modify: `server/smartTimingRoutes.ts` (nye ruter: `GET /api/admin/permissions`, `GET /api/admin/roles`, `POST /api/admin/roles`, `PUT /api/admin/roles/:id/permissions`, `DELETE /api/admin/roles/:id`)
- Create: `client/src/pages/admin-roller.tsx`
- Modify: `client/src/App.tsx` (rute-registrering, samme mønster som andre lazy-lastede admin-sider)
- Test: `server/lib/__tests__/role-management-routes.test.ts`

**Interfaces:**
- Consumes: `hasPermission`, `PERMISSION_CATALOG` (Task 1-2).
- Produces: ingen nye interfaces forbrukt av senere tasks — dette er siste task i fase 1.

- [ ] **Step 1: Skriv failende tester for rolleadministrasjons-rutene**

`server/lib/__tests__/role-management-routes.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import jwt from "jsonwebtoken";
import { registerSmartTimingRoutes } from "../../smartTimingRoutes";
import { db, pool } from "../db";
import { roles } from "@shared/models/permissions";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";

const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || "change-me-in-production";

async function signSuperAdminToken() {
  const [role] = await db.select().from(roles).where(eq(roles.name, "super_admin")).limit(1);
  return jwt.sign({ id: "test-super-admin", email: "sa@example.com", role: "super_admin", roleId: role.id }, JWT_SECRET);
}

describe("role management routes", () => {
  afterEach(async () => {
    await db.delete(roles).where(eq(roles.name, "test_role_task6"));
  });

  it("GET /api/admin/permissions returns the full catalog", async () => {
    const app = express();
    registerSmartTimingRoutes(app);
    const token = await signSuperAdminToken();
    const res = await request(app)
      .get("/api/admin/permissions")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(7);
  });

  it("POST /api/admin/roles creates a role with no permissions", async () => {
    const app = express();
    app.use(express.json());
    registerSmartTimingRoutes(app);
    const token = await signSuperAdminToken();
    const res = await request(app)
      .post("/api/admin/roles")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "test_role_task6", scope: "global" });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("test_role_task6");
  });

  it("DELETE /api/admin/roles/:id blocks deletion when users are attached", async () => {
    const [role] = await db.insert(roles).values({ name: "test_role_task6", scope: "global" }).returning();
    const [testUser] = await db.select().from(users).limit(1);
    await pool.query(`UPDATE users SET role_id = $1 WHERE id = $2`, [role.id, testUser.id]);

    const app = express();
    registerSmartTimingRoutes(app);
    const token = await signSuperAdminToken();
    const res = await request(app)
      .delete(`/api/admin/roles/${role.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(409);

    await pool.query(`UPDATE users SET role_id = NULL WHERE id = $1`, [testUser.id]);
  });
});
```

- [ ] **Step 2: Kjør testene, verifiser at de feiler**

Run: `npx vitest run server/lib/__tests__/role-management-routes.test.ts`
Expected: FAIL — rutene finnes ikke ennå (404)

- [ ] **Step 3: Skriv rolleadministrasjons-rutene**

I `server/smartTimingRoutes.ts`, etter Task 5s ruter, legg til:

```ts
app.get("/api/admin/permissions", authenticateAdmin, async (req: AuthRequest, res) => {
  if (!(await hasPermission(req.admin.roleId, "role.manage"))) {
    return res.status(403).json({ error: "Ingen tilgang" });
  }
  const result = await pool.query(`SELECT id, key, label, module FROM permissions ORDER BY module, key`);
  res.json(result.rows);
});

app.get("/api/admin/roles", authenticateAdmin, async (req: AuthRequest, res) => {
  if (!(await hasPermission(req.admin.roleId, "role.manage"))) {
    return res.status(403).json({ error: "Ingen tilgang" });
  }
  const result = await pool.query(`
    SELECT r.id, r.name, r.scope, r.is_system_default,
           COALESCE(array_agg(rp.permission_id) FILTER (WHERE rp.permission_id IS NOT NULL), '{}') AS permission_ids,
           (SELECT COUNT(*) FROM users u WHERE u.role_id = r.id) AS user_count
    FROM roles r
    LEFT JOIN role_permissions rp ON rp.role_id = r.id
    WHERE r.scope = 'global'
    GROUP BY r.id ORDER BY r.name
  `);
  res.json(result.rows);
});

app.post("/api/admin/roles", authenticateAdmin, async (req: AuthRequest, res) => {
  if (!(await hasPermission(req.admin.roleId, "role.manage"))) {
    return res.status(403).json({ error: "Ingen tilgang" });
  }
  const { name, scope } = req.body as { name?: string; scope?: string };
  if (!name?.trim() || scope !== "global") {
    return res.status(400).json({ error: "Navn er påkrevd. Kun 'global' scope støttes i fase 1." });
  }
  try {
    const result = await pool.query(
      `INSERT INTO roles (name, scope) VALUES ($1, 'global') RETURNING id, name, scope, is_system_default`,
      [name.trim()],
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    if (String(err?.code) === "23505") {
      return res.status(409).json({ error: "En rolle med dette navnet finnes allerede" });
    }
    res.status(400).json({ error: err.message });
  }
});

app.put("/api/admin/roles/:id/permissions", authenticateAdmin, async (req: AuthRequest, res) => {
  if (!(await hasPermission(req.admin.roleId, "role.manage"))) {
    return res.status(403).json({ error: "Ingen tilgang" });
  }
  const { permissionIds } = req.body as { permissionIds?: string[] };
  if (!Array.isArray(permissionIds)) {
    return res.status(400).json({ error: "permissionIds må være en liste" });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM role_permissions WHERE role_id = $1`, [req.params.id]);
    for (const permissionId of permissionIds) {
      await client.query(
        `INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)`,
        [req.params.id, permissionId],
      );
    }
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (err: any) {
    await client.query("ROLLBACK");
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.delete("/api/admin/roles/:id", authenticateAdmin, async (req: AuthRequest, res) => {
  if (!(await hasPermission(req.admin.roleId, "role.manage"))) {
    return res.status(403).json({ error: "Ingen tilgang" });
  }
  const userCount = await pool.query(`SELECT COUNT(*) FROM users WHERE role_id = $1`, [req.params.id]);
  if (Number(userCount.rows[0].count) > 0) {
    return res.status(409).json({
      error: `${userCount.rows[0].count} bruker(e) har denne rollen — flytt dem til en annen rolle først`,
    });
  }
  await pool.query(`DELETE FROM roles WHERE id = $1 AND is_system_default = FALSE`, [req.params.id]);
  res.json({ ok: true });
});
```

- [ ] **Step 4: Kjør testene, verifiser at de passerer**

Run: `npx vitest run server/lib/__tests__/role-management-routes.test.ts`
Expected: 3 passed

- [ ] **Step 5: Bygg admin-UI-siden**

`client/src/pages/admin-roller.tsx` — følg dialog-mønsteret fra
`client/src/pages/vendors.tsx` (samme `PortalLayout`, `Dialog`,
`useMutation`+`queryClient.invalidateQueries`-struktur): en liste over
roller med brukerantall og «systemrolle»-badge, en «Ny rolle»-knapp, og en
rediger-dialog per rolle med avkrysningsbokser gruppert per `module` (lest
fra `GET /api/admin/permissions`, gruppert klient-side med
`Object.groupBy` eller en enkel `reduce`).

- [ ] **Step 6: Registrer ruten**

I `client/src/App.tsx`, legg til (samme mønster som andre lazy-lastede
admin-sider):

```ts
const AdminRoller = lazy(() => import("@/pages/admin-roller"));
```

og

```tsx
<Route path="/admin/roller" component={AdminRoller} />
```

- [ ] **Step 7: Manuell test i nettleser**

Start dev-server, naviger til `/admin/roller` som (dev-mode) super admin.
Opprett en ny rolle, gi den én tillatelse, lagre, last siden på nytt,
verifiser tillatelsen er persistert. Forsøk å slette `super_admin`-
systemrollen — skal blokkeres av `is_system_default = FALSE`-betingelsen
i slette-spørringen.

- [ ] **Step 8: Kjør full typecheck og build**

Run: `npx tsc --noEmit && npm run build`
Expected: begge grønn, ingen feil

- [ ] **Step 9: Commit**

```bash
git add server/smartTimingRoutes.ts client/src/pages/admin-roller.tsx client/src/App.tsx server/lib/__tests__/role-management-routes.test.ts
git commit -m "feat(roles): add admin UI for role/permission management"
```
