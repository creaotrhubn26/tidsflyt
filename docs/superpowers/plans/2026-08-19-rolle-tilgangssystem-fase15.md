# Fase 1.5: rolletildeling + systemrolle-redigering — Implementeringsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gjør fase 1s rolle-/tilgangssystem faktisk brukbart — en super admin
skal kunne tildele en rolle til en bruker (både `users`- og
`admin_users`-tabell-kontoer), og redigere systemrollenes tillatelser, uten
kodeendring eller deploy.

**Architecture:** Samle `admin_users` og `users` på én `role_id`-
sannhetskilde (paret på e-post) via en idempotent migrasjon + endring av tre
kontooprettings-ruter. Bygg et tildelings-API (`PATCH /api/admin/users/:id/role`)
og et selvlås-beskyttet system-rolle-redigerings-API. Utvid eksisterende
`admin-roller.tsx` med en medlemmer-seksjon.

**Tech Stack:** Express + raw `pg`/`pool.query` (samme konvensjon som
omkringliggende ruter i `server/smartTimingRoutes.ts` — IKKE Drizzle
query-builder for disse rutene, for konsistens med linje 1575-1684), React +
TanStack Query (samme mønster som `admin-roller.tsx` allerede bruker),
Vitest + Supertest for integrasjonstester mot ekte database.

**Spec:** `docs/superpowers/specs/2026-08-19-rolle-tilgangssystem-fase15-design.md`

## Global Constraints

- Kun det interne adminpanelet (`authenticateAdmin`-ruter). Portalens
  `canManageRole`/`canManageUsers` (`shared/roles.ts`) røres IKKE.
- Migreringen MÅ ikke endre noen eksisterende kontos faktiske tilgang.
- `role.manage`-tillatelsen dekker BÅDE rolleredigering OG tildeling — ingen
  ny tillatelse legges i katalogen.
- `public.users` (IKKE `legacy.users`, som er et separat, ubrukt skjema — se
  spec) er en tabell delt med et urelatert produkt og har to skjulte,
  `NOT NULL`-kolonner uten default som Tidums eget Drizzle-skjema ikke
  kjenner til: `username TEXT NOT NULL UNIQUE` og `password TEXT NOT NULL`.
  ENHVER `INSERT INTO users` i denne planen MÅ oppgi begge, ellers feiler
  innsettingen i produksjon. Bruk plassholderverdier som aldri leses av
  Tidums egen kode (se Task 1 og eksisterende
  `createDisposableUser()`-mønster i `role-management-routes.test.ts:73-82`).
- Alle nye ruter bruker `pool.query`/`pool.connect()` (raw SQL), IKKE
  Drizzle query-builder — matcher eksisterende konvensjon i
  `smartTimingRoutes.ts:1575-1684` (rollerutene fase 1 allerede bygde).
- Test-DB-tilgang: `DATABASE_URL` ligger i `.env` ved repo-roten, har et
  uescapet `&` som ødelegger literal `bash source .env` — konstruer
  miljøvariabelen på annen måte (Node-engangsskript eller
  `export DATABASE_URL='...'` med enkeltfnutter).
- Enhver DB-mutasjon i tester MÅ ryddes opp i `try/finally` — denne tabellen
  er delt med et urelatert produkt i produksjon, ingen tolerert risiko for
  gjenværende testrader.

---

### Task 1: Datamodell-unifisering — migrasjon 055 + parede kontooppretting

**Files:**
- Create: `migrations/055_admin_users_role_id_unification.sql`
- Modify: `server/smartTimingRoutes.ts:1687-1727` (`/api/admin/create-super`,
  `/api/admin/bootstrap`)
- Modify: `server/smartTimingRoutes.ts:2380-2393` (`/api/cms/setup`s
  default-admin-opprettelse)
- Modify: `server/lib/run-startup-migrations.ts` (registrer migrasjonen)
- Test: `server/lib/__tests__/admin-users-role-unification.test.ts`

**Interfaces:**
- Konsumerer: `tidum_roles`-tabellen (fra fase 1, migrasjon 054) —
  `WHERE name = ... AND scope = 'global' AND is_system_default = true`.
- Produserer: garantien at enhver `admin_users`-rad med
  `role IN ('super_admin', 'vendor_admin')` har en paret `users`-rad med
  `role_id` satt — Task 2 og Task 3 bygger videre på denne garantien uten å
  selv håndtere `admin_users`.

- [ ] **Step 1: Skriv migrasjonen**

Opprett `migrations/055_admin_users_role_id_unification.sql`:

```sql
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
```

- [ ] **Step 2: Registrer migrasjonen**

I `server/lib/run-startup-migrations.ts`, legg `"055_admin_users_role_id_unification.sql"`
til slutt i `STARTUP_MIGRATIONS`-listen (etter `"054_role_permission_system.sql"`).

- [ ] **Step 3: Skriv migreringstest**

Opprett `server/lib/__tests__/admin-users-role-unification.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { pool } from "../../db";
import { readFileSync } from "fs";
import { join } from "path";

describe("admin_users/users role_id unification (migration 055)", () => {
  const createdUserIds: string[] = [];
  const createdAdminUserIds: number[] = [];

  afterEach(async () => {
    for (const id of createdUserIds.splice(0)) {
      await pool.query(`DELETE FROM users WHERE id = $1`, [id]);
    }
    for (const id of createdAdminUserIds.splice(0)) {
      await pool.query(`DELETE FROM admin_users WHERE id = $1`, [id]);
    }
  });

  async function runMigration() {
    const sql = readFileSync(
      join(process.cwd(), "migrations", "055_admin_users_role_id_unification.sql"),
      "utf8",
    );
    await pool.query(sql);
  }

  it("creates a paired users row for an admin_users row with no matching email, with role_id set", async () => {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const {
      rows: [adminUser],
    } = await pool.query(
      `INSERT INTO admin_users (username, email, password_hash, role, vendor_id)
       VALUES ($1, $2, 'x', 'super_admin', NULL) RETURNING id, email`,
      [`test_unif_admin_${suffix}`, `test-unif-${suffix}@example.com`],
    );
    createdAdminUserIds.push(adminUser.id);

    await runMigration();

    const {
      rows: [pairedUser],
    } = await pool.query(
      `SELECT u.id, u.role_id, r.name as role_name
       FROM users u JOIN tidum_roles r ON r.id = u.role_id
       WHERE u.email = $1`,
      [adminUser.email],
    );
    expect(pairedUser).toBeDefined();
    expect(pairedUser.role_name).toBe("super_admin");
    createdUserIds.push(pairedUser.id);
  });

  it("backfills role_id on an existing paired users row that lacks one, without duplicating", async () => {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const email = `test-unif-paired-${suffix}@example.com`;
    const {
      rows: [adminUser],
    } = await pool.query(
      `INSERT INTO admin_users (username, email, password_hash, role, vendor_id)
       VALUES ($1, $2, 'x', 'vendor_admin', NULL) RETURNING id`,
      [`test_unif_paired_admin_${suffix}`, email],
    );
    createdAdminUserIds.push(adminUser.id);
    const {
      rows: [existingUser],
    } = await pool.query(
      `INSERT INTO users (username, password, email, role, role_id)
       VALUES ($1, 'x', $2, 'vendor_admin', NULL) RETURNING id`,
      [`test_unif_paired_user_${suffix}`, email],
    );
    createdUserIds.push(existingUser.id);

    await runMigration();

    const { rows } = await pool.query(
      `SELECT u.id, r.name as role_name FROM users u JOIN tidum_roles r ON r.id = u.role_id WHERE u.email = $1`,
      [email],
    );
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe(existingUser.id);
    expect(rows[0].role_name).toBe("vendor_admin");
  });

  it("is idempotent — running twice produces no duplicates or errors", async () => {
    await runMigration();
    await runMigration();
  });
});
```

- [ ] **Step 4: Kjør migreringstesten, verifiser at den passerer**

Kjør: `DATABASE_URL='<verdi fra .env>' npx vitest run server/lib/__tests__/admin-users-role-unification.test.ts`
Forventet: alle 3 tester PASS. Hvis test 1 eller 2 feiler på
`username`/`password NOT NULL`-brudd, sjekk at migrasjonens `INSERT INTO users`
inkluderer begge kolonnene nøyaktig som i Step 1.

- [ ] **Step 5: Oppdater `/api/admin/create-super` og `/api/admin/bootstrap` til å pare `users`-rad**

I `server/smartTimingRoutes.ts`, `/api/admin/create-super` (linje 1687-1705),
legg til en `users`-upsert etter `admin_users`-innsettingen:

```ts
  app.post("/api/admin/create-super", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      if (req.admin.role !== 'super_admin') {
        return res.status(403).json({ error: 'Only super admin can create super admins' });
      }

      const { username, email, password } = req.body;
      const passwordHash = await bcrypt.hash(password, 10);

      const result = await pool.query(
        `INSERT INTO admin_users (username, email, password_hash, role, vendor_id)
         VALUES ($1, $2, $3, 'super_admin', NULL) RETURNING id, username, email, role, created_at`,
        [username, email, passwordHash]
      );

      // Pare med users-tabellen slik at role_id kan tildeles (fase 1.5) —
      // samme mønster som POST /api/vendors/:id/admins allerede bruker.
      // username/password er NOT NULL-kolonner fra et urelatert produkt
      // som deler public.users, aldri lest av Tidums egen kode.
      const superAdminRoleId = (await pool.query(
        `SELECT id FROM tidum_roles WHERE name = 'super_admin' AND scope = 'global' AND is_system_default = true`,
      )).rows[0]?.id ?? null;
      await pool.query(
        `INSERT INTO users (username, password, email, role, role_id)
         VALUES ($1, 'unused-admin-users-pairing', $2, 'super_admin', $3)
         ON CONFLICT (email) DO UPDATE SET role = 'super_admin', role_id = $3, updated_at = NOW()`,
        [username, email, superAdminRoleId],
      );

      res.status(201).json(result.rows[0]);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });
```

Gjør nøyaktig samme endring i `/api/admin/bootstrap` (linje 1708-1727) —
samme `users`-upsert-blokk, samme rolle `'super_admin'`, satt inn etter
`admin_users`-innsettingen der også.

- [ ] **Step 6: Oppdater `/api/cms/setup`s default-admin-opprettelse**

I `server/smartTimingRoutes.ts`, rundt linje 2380-2393, i `if`-grenen
(fersk innsetting, IKKE `else`-grenen som kun resetter passord):

```ts
      const adminCheck = await pool.query('SELECT COUNT(*) FROM admin_users WHERE username = $1', ['admin']);
      const passwordHash = await bcrypt.hash('admin123', 10);
      if (parseInt(adminCheck.rows[0].count) === 0) {
        await pool.query(
          `INSERT INTO admin_users (username, email, password_hash, role) VALUES ($1, $2, $3, $4)`,
          ['admin', 'admin@smarttiming.no', passwordHash, 'super_admin']
        );
        // Pare med users-tabellen, samme mønster som create-super/bootstrap.
        const superAdminRoleId = (await pool.query(
          `SELECT id FROM tidum_roles WHERE name = 'super_admin' AND scope = 'global' AND is_system_default = true`,
        )).rows[0]?.id ?? null;
        await pool.query(
          `INSERT INTO users (username, password, email, role, role_id)
           VALUES ('admin', 'unused-admin-users-pairing', 'admin@smarttiming.no', 'super_admin', $1)
           ON CONFLICT (email) DO UPDATE SET role = 'super_admin', role_id = $1, updated_at = NOW()`,
          [superAdminRoleId],
        );
      } else {
        await pool.query(
          `UPDATE admin_users SET password_hash = $1 WHERE username = $2`,
          [passwordHash, 'admin']
        );
      }
```

- [ ] **Step 7: Typecheck og commit**

Kjør: `npx tsc --noEmit` — forventet: rent.
Kjør migreringstesten på nytt (Step 4) for å bekrefte ingen regresjon.

```bash
git add migrations/055_admin_users_role_id_unification.sql \
  server/lib/run-startup-migrations.ts \
  server/smartTimingRoutes.ts \
  server/lib/__tests__/admin-users-role-unification.test.ts
git commit -m "feat: pare admin_users og users på role_id (fase 1.5)"
```

---

### Task 2: Tildelings-API

**Files:**
- Modify: `server/smartTimingRoutes.ts` (nye ruter, plassert like etter
  eksisterende rollerruter, linje ~1684, før `create-super` på linje 1686)
- Test: `server/lib/__tests__/role-assignment-routes.test.ts`

**Interfaces:**
- Konsumerer: Task 1s garanti om at `users.role_id` er eneste
  tildelings-sannhetskilde.
- Produserer: `PATCH /api/admin/users/:id/role` og
  `GET /api/admin/roles/:id/members` — Task 4 (UI) kaller begge direkte.

- [ ] **Step 1: Skriv `PATCH /api/admin/users/:id/role`**

Sett inn i `server/smartTimingRoutes.ts` like etter `DELETE /api/admin/roles/:id`
(linje 1684, før kommentaren `// Create super admin` på linje 1686):

```ts
  app.patch("/api/admin/users/:id/role", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      if (!(await hasPermission(req.admin.roleId, "role.manage"))) {
        return res.status(403).json({ error: "Ingen tilgang" });
      }
      const { roleId } = req.body as { roleId: string | null };
      if (roleId !== null && roleId !== undefined) {
        const roleCheck = await pool.query(`SELECT id FROM tidum_roles WHERE id = $1`, [roleId]);
        if (roleCheck.rows.length === 0) {
          return res.status(404).json({ error: "Rolle ikke funnet" });
        }
      }
      const result = await pool.query(
        `UPDATE users SET role_id = $1, updated_at = NOW() WHERE id = $2
         RETURNING id, email, role_id`,
        [roleId ?? null, req.params.id],
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Bruker ikke funnet" });
      }
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });
```

- [ ] **Step 2: Skriv `GET /api/admin/roles/:id/members`**

Rett under forrige rute:

```ts
  app.get("/api/admin/roles/:id/members", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      if (!(await hasPermission(req.admin.roleId, "role.manage"))) {
        return res.status(403).json({ error: "Ingen tilgang" });
      }
      const result = await pool.query(
        `SELECT id, email, first_name, last_name FROM users WHERE role_id = $1 ORDER BY email`,
        [req.params.id],
      );
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
```

- [ ] **Step 3: Skriv `GET /api/admin/users/search`**

Rett under forrige rute:

```ts
  app.get("/api/admin/users/search", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      if (!(await hasPermission(req.admin.roleId, "role.manage"))) {
        return res.status(403).json({ error: "Ingen tilgang" });
      }
      const q = String(req.query.q || "").trim();
      if (q.length < 2) {
        return res.json([]);
      }
      const result = await pool.query(
        `SELECT id, email, first_name, last_name, role_id
         FROM users WHERE email ILIKE $1 ORDER BY email LIMIT 20`,
        [`%${q}%`],
      );
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
```

- [ ] **Step 4: Skriv tester**

Opprett `server/lib/__tests__/role-assignment-routes.test.ts`, samme
`NODE_ENV=production`+`vi.resetModules()`+delt-pool-mønster som
`server/lib/__tests__/role-management-routes.test.ts` (les den filen først
og kopier `beforeAll`/`afterAll`/`signSuperAdminToken`/`signVendorAdminToken`/
`createDisposableUser`-hjelperne ordrett):

```ts
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import jwt from "jsonwebtoken";
import type { db as DbType, pool as PoolType } from "../../db";
import { roles } from "@shared/models/permissions";
import { eq } from "drizzle-orm";

const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || "change-me-in-production";

describe("role assignment routes", () => {
  let app: express.Express;
  let db: typeof DbType;
  let pool: typeof PoolType;

  beforeAll(async () => {
    const prevNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    vi.resetModules();
    const { registerSmartTimingRoutes } = await import("../../smartTimingRoutes");
    ({ db, pool } = await import("../../db"));
    process.env.NODE_ENV = prevNodeEnv;

    app = express();
    app.use(express.json());
    registerSmartTimingRoutes(app);
  });

  afterAll(async () => {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await pool.end();
  });

  async function signSuperAdminToken() {
    const [role] = await db.select().from(roles).where(eq(roles.name, "super_admin")).limit(1);
    return jwt.sign({ id: "test-super-admin", email: "sa@example.com", role: "super_admin", roleId: role.id }, JWT_SECRET);
  }

  async function signVendorAdminToken() {
    const [role] = await db.select().from(roles).where(eq(roles.name, "vendor_admin")).limit(1);
    return jwt.sign({ id: "test-vendor-admin", email: "va@example.com", role: "vendor_admin", roleId: role.id }, JWT_SECRET);
  }

  async function createDisposableUser(): Promise<string> {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const {
      rows: [row],
    } = await pool.query(
      `INSERT INTO users (username, password, email) VALUES ($1, 'x', $2) RETURNING id`,
      [`test_assign_user_${suffix}`, `test-assign-${suffix}@example.com`],
    );
    return row.id;
  }

  const createdRoleIds: string[] = [];
  const createdUserIds: string[] = [];

  afterEach(async () => {
    for (const id of createdUserIds.splice(0)) {
      await pool.query(`DELETE FROM users WHERE id = $1`, [id]);
    }
    for (const id of createdRoleIds.splice(0)) {
      await pool.query(`DELETE FROM tidum_roles WHERE id = $1`, [id]);
    }
  });

  it("PATCH /api/admin/users/:id/role assigns a role to a user", async () => {
    const [role] = await db.insert(roles).values({ name: "test_assign_role", scope: "global" }).returning();
    createdRoleIds.push(role.id);
    const userId = await createDisposableUser();
    createdUserIds.push(userId);

    const token = await signSuperAdminToken();
    const res = await request(app)
      .patch(`/api/admin/users/${userId}/role`)
      .set("Authorization", `Bearer ${token}`)
      .send({ roleId: role.id });

    expect(res.status).toBe(200);
    expect(res.body.role_id).toBe(role.id);
  });

  it("PATCH /api/admin/users/:id/role with roleId: null unassigns", async () => {
    const [role] = await db.insert(roles).values({ name: "test_assign_role2", scope: "global" }).returning();
    createdRoleIds.push(role.id);
    const userId = await createDisposableUser();
    createdUserIds.push(userId);
    await pool.query(`UPDATE users SET role_id = $1 WHERE id = $2`, [role.id, userId]);

    const token = await signSuperAdminToken();
    const res = await request(app)
      .patch(`/api/admin/users/${userId}/role`)
      .set("Authorization", `Bearer ${token}`)
      .send({ roleId: null });

    expect(res.status).toBe(200);
    expect(res.body.role_id).toBeNull();
  });

  it("PATCH /api/admin/users/:id/role returns 404 for unknown roleId", async () => {
    const userId = await createDisposableUser();
    createdUserIds.push(userId);

    const token = await signSuperAdminToken();
    const res = await request(app)
      .patch(`/api/admin/users/${userId}/role`)
      .set("Authorization", `Bearer ${token}`)
      .send({ roleId: "00000000-0000-0000-0000-000000000000" });

    expect(res.status).toBe(404);
  });

  it("PATCH /api/admin/users/:id/role returns 404 for unknown user", async () => {
    const [role] = await db.insert(roles).values({ name: "test_assign_role3", scope: "global" }).returning();
    createdRoleIds.push(role.id);

    const token = await signSuperAdminToken();
    const res = await request(app)
      .patch(`/api/admin/users/00000000-0000-0000-0000-000000000000/role`)
      .set("Authorization", `Bearer ${token}`)
      .send({ roleId: role.id });

    expect(res.status).toBe(404);
  });

  it("PATCH /api/admin/users/:id/role rejects a caller without role.manage", async () => {
    const userId = await createDisposableUser();
    createdUserIds.push(userId);

    const token = await signVendorAdminToken();
    const res = await request(app)
      .patch(`/api/admin/users/${userId}/role`)
      .set("Authorization", `Bearer ${token}`)
      .send({ roleId: null });

    expect(res.status).toBe(403);
  });

  it("GET /api/admin/roles/:id/members lists assigned users", async () => {
    const [role] = await db.insert(roles).values({ name: "test_assign_role4", scope: "global" }).returning();
    createdRoleIds.push(role.id);
    const userId = await createDisposableUser();
    createdUserIds.push(userId);
    await pool.query(`UPDATE users SET role_id = $1 WHERE id = $2`, [role.id, userId]);

    const token = await signSuperAdminToken();
    const res = await request(app)
      .get(`/api/admin/roles/${role.id}/members`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.map((u: any) => u.id)).toContain(userId);
  });

  it("GET /api/admin/users/search finds a user by partial email", async () => {
    const userId = await createDisposableUser();
    createdUserIds.push(userId);
    const {
      rows: [{ email }],
    } = await pool.query(`SELECT email FROM users WHERE id = $1`, [userId]);
    const searchTerm = email.split("@")[0].slice(0, 10);

    const token = await signSuperAdminToken();
    const res = await request(app)
      .get(`/api/admin/users/search`)
      .query({ q: searchTerm })
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.map((u: any) => u.id)).toContain(userId);
  });

  it("GET /api/admin/users/search returns empty for a query under 2 chars", async () => {
    const token = await signSuperAdminToken();
    const res = await request(app)
      .get(`/api/admin/users/search`)
      .query({ q: "a" })
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
```

- [ ] **Step 5: Kjør testene, verifiser at alle passerer**

Kjør: `DATABASE_URL='<verdi fra .env>' npx vitest run server/lib/__tests__/role-assignment-routes.test.ts`
Forventet: alle 8 tester PASS.

- [ ] **Step 6: Typecheck og commit**

```bash
npx tsc --noEmit
git add server/smartTimingRoutes.ts server/lib/__tests__/role-assignment-routes.test.ts
git commit -m "feat: tildelings-API for roller (PATCH .../role, GET .../members, GET .../search)"
```

---

### Task 3: Systemrolle-redigering + selvlås-guard

**Files:**
- Modify: `server/smartTimingRoutes.ts:1629-1659` (`PUT /api/admin/roles/:id/permissions`)
- Test: `server/lib/__tests__/role-management-routes.test.ts` (utvid
  eksisterende fil — den har allerede en test som forventer 409 på
  systemrolle-redigering, som denne oppgaven gjør foreldet og må oppdatere)

**Interfaces:**
- Konsumerer: Task 2s `PATCH /api/admin/users/:id/role` (brukes til å sette
  opp testfixturer med tildelte brukere for selvlås-guarden).
- Produserer: ingen nye grensesnitt for senere oppgaver — dette er siste
  server-endring før UI (Task 4).

- [ ] **Step 1: Oppdater den eksisterende testen som forventer 409 på systemrolle-redigering**

I `server/lib/__tests__/role-management-routes.test.ts`, testen
`"PUT /api/admin/roles/:id/permissions blocks editing a system role's permissions"`
(linje 145-155) tester nå utdatert oppførsel — systemroller SKAL kunne
redigeres etter denne oppgaven. Erstatt hele testen med:

```ts
  it("PUT /api/admin/roles/:id/permissions allows editing a system role's permissions when it doesn't remove the last role.manage", async () => {
    const [vendorAdminRole] = await db.select().from(roles).where(eq(roles.name, "vendor_admin")).limit(1);
    const before = await pool.query(
      `SELECT permission_id FROM tidum_role_permissions WHERE role_id = $1`,
      [vendorAdminRole.id],
    );
    const originalPermissionIds = before.rows.map((r) => r.permission_id);

    try {
      const token = await signSuperAdminToken();
      const res = await request(app)
        .put(`/api/admin/roles/${vendorAdminRole.id}/permissions`)
        .set("Authorization", `Bearer ${token}`)
        .send({ permissionIds: [] });

      // vendor_admin never had role.manage (only super_admin does), so
      // removing everything from it can never trip the self-lockout guard.
      expect(res.status).toBe(200);
    } finally {
      await pool.query(`DELETE FROM tidum_role_permissions WHERE role_id = $1`, [vendorAdminRole.id]);
      for (const permissionId of originalPermissionIds) {
        await pool.query(
          `INSERT INTO tidum_role_permissions (role_id, permission_id) VALUES ($1, $2)`,
          [vendorAdminRole.id, permissionId],
        );
      }
    }
  });
```

- [ ] **Step 2: Kjør den oppdaterte testen, verifiser at den FEILER (fortsatt gammel kode)**

Kjør: `DATABASE_URL='<verdi fra .env>' npx vitest run server/lib/__tests__/role-management-routes.test.ts -t "allows editing a system role"`
Forventet: FAIL med status 409 (gammel `is_system_default`-sperre kjører fortsatt).

- [ ] **Step 3: Skriv selvlås-guard-testene**

I samme fil, legg til to nye tester (etter testen fra Step 1):

```ts
  it("PUT .../permissions blocks removing role.manage from the only role with assigned members that has it", async () => {
    const [superAdminRole] = await db.select().from(roles).where(eq(roles.name, "super_admin")).limit(1);
    const userId = await createDisposableUser();

    try {
      await pool.query(`UPDATE users SET role_id = $1 WHERE id = $2`, [superAdminRole.id, userId]);

      const token = await signSuperAdminToken();
      const res = await request(app)
        .put(`/api/admin/roles/${superAdminRole.id}/permissions`)
        .set("Authorization", `Bearer ${token}`)
        // Empty set — removes ALL permissions from super_admin, including
        // role.manage, which is exactly what the self-lockout guard exists
        // to catch (super_admin is the only role with an assigned member
        // that has role.manage at this point in the test).
        .send({ permissionIds: [] });

      expect(res.status).toBe(409);
    } finally {
      await pool.query(`UPDATE users SET role_id = NULL WHERE id = $1`, [userId]);
      await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
    }
  });

  it("PUT .../permissions allows removing role.manage from a role when another role with assigned members still has it", async () => {
    const [superAdminRole] = await db.select().from(roles).where(eq(roles.name, "super_admin")).limit(1);
    const [roleManagePermission] = await pool
      .query(`SELECT id FROM tidum_permissions WHERE key = 'role.manage'`)
      .then((r) => r.rows);
    const [newRole] = await db.insert(roles).values({ name: "test_lockout_guard_role", scope: "global" }).returning();
    const userOnNewRole = await createDisposableUser();
    const userOnSuperAdmin = await createDisposableUser();

    try {
      await pool.query(
        `INSERT INTO tidum_role_permissions (role_id, permission_id) VALUES ($1, $2)`,
        [newRole.id, roleManagePermission.id],
      );
      await pool.query(`UPDATE users SET role_id = $1 WHERE id = $2`, [newRole.id, userOnNewRole]);
      await pool.query(`UPDATE users SET role_id = $1 WHERE id = $2`, [superAdminRole.id, userOnSuperAdmin]);

      const token = await signSuperAdminToken();
      const res = await request(app)
        .put(`/api/admin/roles/${superAdminRole.id}/permissions`)
        .set("Authorization", `Bearer ${token}`)
        .send({ permissionIds: [] });

      expect(res.status).toBe(200);
    } finally {
      await pool.query(`UPDATE users SET role_id = NULL WHERE id IN ($1, $2)`, [userOnNewRole, userOnSuperAdmin]);
      await pool.query(`DELETE FROM users WHERE id IN ($1, $2)`, [userOnNewRole, userOnSuperAdmin]);
      await pool.query(`DELETE FROM tidum_role_permissions WHERE role_id = $1`, [superAdminRole.id]);
      // Gjenopprett super_admins fulle tillatelsessett (alle 7) — testen fjernet dem.
      await pool.query(
        `INSERT INTO tidum_role_permissions (role_id, permission_id) SELECT $1, id FROM tidum_permissions`,
        [superAdminRole.id],
      );
      await pool.query(`DELETE FROM tidum_role_permissions WHERE role_id = $1`, [newRole.id]);
      await db.delete(roles).where(eq(roles.id, newRole.id));
    }
  });

  it("PUT .../permissions never runs the self-lockout check for a role with 0 assigned members", async () => {
    const [role] = await db.insert(roles).values({ name: "test_no_members_role", scope: "global" }).returning();
    const [roleManagePermission] = await pool
      .query(`SELECT id FROM tidum_permissions WHERE key = 'role.manage'`)
      .then((r) => r.rows);
    await pool.query(
      `INSERT INTO tidum_role_permissions (role_id, permission_id) VALUES ($1, $2)`,
      [role.id, roleManagePermission.id],
    );

    const token = await signSuperAdminToken();
    const res = await request(app)
      .put(`/api/admin/roles/${role.id}/permissions`)
      .set("Authorization", `Bearer ${token}`)
      .send({ permissionIds: [] });

    expect(res.status).toBe(200);

    await db.delete(roles).where(eq(roles.id, role.id));
  });
```

Legg til `createDisposableUser`-hjelperen i denne filen om den ikke
allerede finnes der (den gjør — se linje 73-82 i eksisterende fil).

- [ ] **Step 4: Kjør de nye testene, verifiser at de FEILER**

Kjør: `DATABASE_URL='<verdi fra .env>' npx vitest run server/lib/__tests__/role-management-routes.test.ts`
Forventet: de 3 nye testene fra Step 3 FEILER (guard finnes ikke ennå — alle
gir 409 fra den gamle systemrolle-sperren, eller feil av andre grunner).

- [ ] **Step 5: Implementer selvlås-guarden**

Erstatt hele `PUT /api/admin/roles/:id/permissions`-ruten
(`server/smartTimingRoutes.ts:1629-1659`) med:

```ts
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
      const roleCheck = await client.query(`SELECT id FROM tidum_roles WHERE id = $1`, [req.params.id]);
      if (roleCheck.rows.length === 0) {
        return res.status(404).json({ error: "Rollen finnes ikke" });
      }

      // Selvlås-guard: hindre at role.manage forsvinner fra ALLE roller
      // med tildelte brukere. Kjører kun når role.manage faktisk fjernes
      // OG denne rollen har ≥1 tildelt bruker — uendret rolle uten
      // medlemmer, eller endringer som ikke berører role.manage, er upåvirket.
      const roleManagePermission = await client.query(
        `SELECT id FROM tidum_permissions WHERE key = 'role.manage'`,
      );
      const roleManagePermissionId = roleManagePermission.rows[0]?.id;
      const removingRoleManage = roleManagePermissionId
        ? !permissionIds.includes(roleManagePermissionId)
        : false;

      if (removingRoleManage) {
        const memberCount = await client.query(
          `SELECT COUNT(*) FROM users WHERE role_id = $1`,
          [req.params.id],
        );
        if (Number(memberCount.rows[0].count) > 0) {
          const otherRoleWithRoleManage = await client.query(
            `SELECT DISTINCT u.role_id
             FROM users u
             JOIN tidum_role_permissions rp ON rp.role_id = u.role_id
             WHERE rp.permission_id = $1 AND u.role_id <> $2
             LIMIT 1`,
            [roleManagePermissionId, req.params.id],
          );
          if (otherRoleWithRoleManage.rows.length === 0) {
            return res.status(409).json({
              error: "Kan ikke fjerne role.manage — ingen andre roller med tildelte brukere har den. Tildel en annen bruker først.",
            });
          }
        }
      }

      await client.query("BEGIN");
      await client.query(`DELETE FROM tidum_role_permissions WHERE role_id = $1`, [req.params.id]);
      for (const permissionId of permissionIds) {
        await client.query(
          `INSERT INTO tidum_role_permissions (role_id, permission_id) VALUES ($1, $2)`,
          [req.params.id, permissionId],
        );
      }
      await client.query("COMMIT");
      res.json({ ok: true });
    } catch (err: any) {
      await client.query("ROLLBACK").catch(() => {});
      res.status(400).json({ error: err.message });
    } finally {
      client.release();
    }
  });
```

Merk: `is_system_default`-sperren er fjernet helt fra denne ruten —
systemroller kan nå redigeres som enhver annen rolle, beskyttet kun av
selvlås-guarden over. `DELETE /api/admin/roles/:id`s
`is_system_default`-sperre (linje 1670-1672) er UENDRET — systemroller kan
fortsatt ikke SLETTES, kun redigeres.

- [ ] **Step 6: Kjør alle testene i filen, verifiser at alle passerer**

Kjør: `DATABASE_URL='<verdi fra .env>' npx vitest run server/lib/__tests__/role-management-routes.test.ts`
Forventet: alle tester PASS (den oppdaterte fra Step 1, de 3 nye fra Step 3,
og alle uendrede eksisterende tester i filen).

- [ ] **Step 7: Typecheck og commit**

```bash
npx tsc --noEmit
git add server/smartTimingRoutes.ts server/lib/__tests__/role-management-routes.test.ts
git commit -m "feat: åpne systemrolle-redigering med selvlås-guard mot role.manage-tap"
```

---

### Task 4: UI — medlemmer-seksjon i admin-roller.tsx

**Files:**
- Modify: `client/src/pages/admin-roller.tsx`

**Interfaces:**
- Konsumerer: `GET /api/admin/roles/:id/members`,
  `PATCH /api/admin/users/:id/role`, `GET /api/admin/users/search` (Task 2).
- Produserer: ingen — siste oppgave i planen.

- [ ] **Step 1: Legg til typer og query for medlemmer**

I `client/src/pages/admin-roller.tsx`, etter `RoleRow`-interfacet (linje 22-29),
legg til:

```ts
interface UserRow {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role_id?: string | null;
}
```

Inne i `AdminRollerPage`-komponenten, etter `permissionsByModule`-`useMemo`
(linje 89-95), legg til state for medlemssøk og en query for
gjeldende rolles medlemmer:

```ts
  const [memberSearchQuery, setMemberSearchQuery] = useState("");

  const { data: members = [] } = useQuery<UserRow[]>({
    queryKey: ['/api/admin/roles', editingRole?.id, 'members'],
    queryFn: () => authenticatedApiRequest(`/api/admin/roles/${editingRole!.id}/members`),
    enabled: !!editingRole,
  });

  const { data: searchResults = [] } = useQuery<UserRow[]>({
    queryKey: ['/api/admin/users/search', memberSearchQuery],
    queryFn: () => authenticatedApiRequest(`/api/admin/users/search?q=${encodeURIComponent(memberSearchQuery)}`),
    enabled: memberSearchQuery.trim().length >= 2,
  });
```

- [ ] **Step 2: Legg til tildelings-mutasjon**

Etter `savePermissionsMutation` (linje 114-128), legg til:

```ts
  const assignRoleMutation = useMutation({
    mutationFn: ({ userId, roleId }: { userId: string; roleId: string | null }) =>
      authenticatedApiRequest(`/api/admin/users/${userId}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ roleId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/roles', editingRole?.id, 'members'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/roles'] });
      setMemberSearchQuery("");
    },
    onError: (error: any) => {
      toast({ title: 'Feil', description: error.message, variant: 'destructive' });
    },
  });
```

- [ ] **Step 3: Legg til Medlemmer-seksjonen i rediger-dialogen**

I rediger-tillatelser-dialogen (linje 257-307), sett inn en ny seksjon
mellom tillatelses-listen (`</div>` som lukker linje 288) og
lagre/avbryt-knappene (`<div className="flex justify-end gap-2 mt-4">` på
linje 289):

```tsx
              <div className="space-y-2 border-t pt-4">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Medlemmer
                </h4>
                <div className="space-y-1.5">
                  {members.length === 0 && (
                    <p className="text-sm text-muted-foreground">Ingen brukere har denne rollen ennå.</p>
                  )}
                  {members.map((member) => (
                    <div key={member.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
                      <span>{member.first_name || member.last_name ? `${member.first_name ?? ''} ${member.last_name ?? ''}`.trim() : member.email}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => assignRoleMutation.mutate({ userId: member.id, roleId: null })}
                        disabled={assignRoleMutation.isPending}
                        data-testid={`button-remove-member-${member.id}`}
                      >
                        Fjern
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="space-y-1.5 pt-2">
                  <Input
                    value={memberSearchQuery}
                    onChange={(e) => setMemberSearchQuery(e.target.value)}
                    placeholder="Søk e-post for å legge til medlem..."
                    data-testid="input-member-search"
                  />
                  {searchResults.length > 0 && (
                    <div className="space-y-1 rounded-md border p-1">
                      {searchResults.map((user) => (
                        <button
                          key={user.id}
                          type="button"
                          className="flex w-full items-center justify-between gap-2 rounded-sm p-1.5 text-left text-sm hover:bg-muted/60"
                          onClick={() => editingRole && assignRoleMutation.mutate({ userId: user.id, roleId: editingRole.id })}
                          disabled={assignRoleMutation.isPending}
                          data-testid={`button-add-member-${user.id}`}
                        >
                          <span>{user.email}</span>
                          {user.role_id === editingRole?.id && <Badge variant="secondary" className="text-xs">Allerede medlem</Badge>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
```

- [ ] **Step 4: Manuell verifisering i nettleser**

Start dev-server (`npm run dev` eller tilsvarende — sjekk `package.json`
for eksakt script). Logg inn som super_admin i det interne adminpanelet,
naviger til `/admin/roller`, åpne "Rediger tillatelser" på en rolle,
verifiser:
- Medlemmer-seksjonen vises med riktig liste.
- Søk etter en kjent e-post viser treff.
- Klikk på et søketreff legger til medlemmet (listen oppdateres).
- "Fjern" på et medlem fjerner det (listen oppdateres).
- Rediger tillatelser på `super_admin`-systemrollen fungerer nå (ikke lenger 409).

Hvis `SESSION_SECRET` mangler i lokal `.env` og blokkerer dev-serveren
(kjent, forhåndseksisterende gap fra fase 1 — se
`.claude/skills/rolle-tilgangssystem/references/fallgruver.md`), noter
dette i implementeringsrapporten som ikke-verifisert i nettleser, men
verifisert via API-testene i Task 2/3.

- [ ] **Step 5: Typecheck og commit**

```bash
npx tsc --noEmit
git add client/src/pages/admin-roller.tsx
git commit -m "feat: medlemmer-seksjon i admin-roller.tsx (tildeling + søk)"
```
