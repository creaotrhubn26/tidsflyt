# Aktivitetslogg for internt adminpanel — Implementeringsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** En super admin skal kunne se hva enhver internal-adminpanel-bruker
faktisk har gjort (mutasjoner) og vært inne på (sidevisninger), med 90 dagers
automatisk oppbevaring.

**Architecture:** Mutasjonslogging bygges inn i `authenticateAdmin` selv
(automatisk dekning av alle ~100 eksisterende ruter, null ruteendringer).
Sidevisning-logging er en ny, liten wouter-lyttende klientkomponent avgrenset
til `/admin`-stier. Retention er en ny node-cron-jobb, samme mønster som
`gdpr-routes.ts`.

**Tech Stack:** Express + raw `pg`/`pool.query` (samme konvensjon som resten
av `server/smartTimingRoutes.ts`), React + wouter + TanStack Query, node-cron.

**Spec:** `docs/superpowers/specs/2026-08-20-adminpanel-aktivitetslogg-design.md`

## Global Constraints

- Kun `authenticateAdmin`-ruter (internt adminpanel). Portalens
  autentiseringsvei røres IKKE.
- `server/lib/log-row-audit.ts` røres IKKE — helt separat system.
- Alle nye tabeller/ruter bruker `tidum_`-prefikset (verifisert mot ekte
  database før spec-en ble skrevet — over 50 kolliderende
  `activity`/`audit`-tabellnavn fra andre produkter i samme database).
- Ingen ny job-infrastruktur — gjenbruk `node-cron`-mønsteret fra
  `server/routes/gdpr-routes.ts:357-375` (`cronStarted`-vaktflagg,
  `cron.schedule(...)`).
- Alle nye ruter bruker `pool.query`/`pool.connect()` (raw SQL), IKKE
  Drizzle query-builder — matcher eksisterende konvensjon i
  `server/smartTimingRoutes.ts`.
- All logging er best-effort — en feilet loggskriving skal ALDRI kaste eller
  blokkere den faktiske handlingen brukeren utførte.
- Enhver DB-mutasjon i tester MÅ ryddes opp i `try/finally`, med cleanup-id
  fanget/pushet FØR enhver assertion som kan kaste — denne tabellen er delt
  med urelaterte produkter i produksjon.
- Test-DB-tilgang: `DATABASE_URL` ligger i `.env` ved repo-roten. Dette
  sandbox-miljøet blokkerer utgående nettverk for Node-prosesser som når den
  ekte databasen — enhver DB-berørende kommando trenger
  `dangerouslyDisableSandbox: true`, ellers henger den til en 600s-vakthund
  dreper agenten.
- `sessionStorage`-nøkkelen for admin-JWT er `cms_admin_token` (samme som
  `admin-roller.tsx` bruker).

---

### Task 1: Migrasjon + tillatelseskatalog

**Files:**
- Create: `migrations/056_admin_activity_log.sql`
- Modify: `server/lib/run-startup-migrations.ts` (registrer migrasjonen)
- Modify: `server/lib/permission-catalog.ts` (legg til `activity_log.view`)
- Test: `server/lib/__tests__/admin-activity-log-migration.test.ts`

**Interfaces:**
- Produserer: `tidum_admin_activity_log`-tabellen og `activity_log.view`-
  tillatelsen, som Task 2 (server-logging + ruter) og Task 4 (klient-UI)
  bygger videre på.

- [ ] **Step 1: Skriv migrasjonen**

Opprett `migrations/056_admin_activity_log.sql`:

```sql
CREATE TABLE IF NOT EXISTS tidum_admin_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL,
  event_type VARCHAR NOT NULL CHECK (event_type IN ('mutation', 'page_view')),
  method VARCHAR,
  path TEXT NOT NULL,
  status_code INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tidum_admin_activity_log_user_id
  ON tidum_admin_activity_log (user_id);
CREATE INDEX IF NOT EXISTS idx_tidum_admin_activity_log_created_at
  ON tidum_admin_activity_log (created_at DESC);

-- Engangs-frø-merke: se spec-ens "Datamodell"-seksjon for hvorfor dette IKKE
-- kan gjenbruke migrations/054s tabellbrede "er tom"-vakt (den tabellen er
-- aldri tom etter at 054 selv har kjørt — vakten ville aldri utløst for en
-- NY tillatelse lagt til her, og uten NOEN vakt ville denne migrasjonen
-- stille gjenopprettet activity_log.view for super_admin på hvert oppstart
-- etter at en admin eksplisitt fjernet den).
CREATE TABLE IF NOT EXISTS tidum_permission_seed_log (
  permission_key VARCHAR PRIMARY KEY,
  seeded_at TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO tidum_permissions (key, label, module) VALUES
  ('activity_log.view', 'Se aktivitetslogg', 'systemadministrasjon')
ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label, module = EXCLUDED.module;

INSERT INTO tidum_role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM tidum_roles r, tidum_permissions p
WHERE r.name = 'super_admin' AND r.scope = 'global' AND p.key = 'activity_log.view'
  AND NOT EXISTS (SELECT 1 FROM tidum_permission_seed_log WHERE permission_key = 'activity_log.view')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO tidum_permission_seed_log (permission_key) VALUES ('activity_log.view')
ON CONFLICT (permission_key) DO NOTHING;
```

- [ ] **Step 2: Registrer migrasjonen**

I `server/lib/run-startup-migrations.ts`, legg `"056_admin_activity_log.sql"`
til slutt i `STARTUP_MIGRATIONS`-listen (etter
`"055_admin_users_role_id_unification.sql"`).

- [ ] **Step 3: Oppdater tillatelseskatalogen**

I `server/lib/permission-catalog.ts`, legg til en ny rad i
`PERMISSION_CATALOG`-arrayen (etter `role.manage`-raden, før `] as const;`):

```ts
  { key: "activity_log.view", label: "Se aktivitetslogg", module: "systemadministrasjon" },
```

- [ ] **Step 4: Skriv migreringstest**

Opprett `server/lib/__tests__/admin-activity-log-migration.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { pool } from "../../db";
import { readFileSync } from "fs";
import { join } from "path";

describe("admin activity log migration (056)", () => {
  async function runMigration() {
    const sql = readFileSync(join(process.cwd(), "migrations", "056_admin_activity_log.sql"), "utf8");
    await pool.query(sql);
  }

  it("seeds activity_log.view to super_admin, not to vendor_admin", async () => {
    await runMigration();

    const { rows: superAdminRows } = await pool.query(`
      SELECT 1 FROM tidum_role_permissions rp
      JOIN tidum_roles r ON r.id = rp.role_id
      JOIN tidum_permissions p ON p.id = rp.permission_id
      WHERE r.name = 'super_admin' AND p.key = 'activity_log.view'
    `);
    expect(superAdminRows.length).toBe(1);

    const { rows: vendorAdminRows } = await pool.query(`
      SELECT 1 FROM tidum_role_permissions rp
      JOIN tidum_roles r ON r.id = rp.role_id
      JOIN tidum_permissions p ON p.id = rp.permission_id
      WHERE r.name = 'vendor_admin' AND p.key = 'activity_log.view'
    `);
    expect(vendorAdminRows.length).toBe(0);
  });

  it("does not re-grant activity_log.view to super_admin after it's explicitly removed", async () => {
    await runMigration();
    const { rows: permRows } = await pool.query(
      `SELECT id FROM tidum_permissions WHERE key = 'activity_log.view'`,
    );
    const { rows: roleRows } = await pool.query(
      `SELECT id FROM tidum_roles WHERE name = 'super_admin' AND scope = 'global'`,
    );
    const permissionId = permRows[0].id;
    const roleId = roleRows[0].id;

    try {
      // Simuler at en super admin fjernet tillatelsen via UI-et.
      await pool.query(
        `DELETE FROM tidum_role_permissions WHERE role_id = $1 AND permission_id = $2`,
        [roleId, permissionId],
      );

      // Simuler neste server-oppstart.
      await runMigration();

      const { rows: afterRows } = await pool.query(
        `SELECT 1 FROM tidum_role_permissions WHERE role_id = $1 AND permission_id = $2`,
        [roleId, permissionId],
      );
      expect(afterRows.length).toBe(0);
    } finally {
      // Gjenopprett — testen skal ikke etterlate super_admin uten denne
      // tillatelsen for resten av testsuiten/produksjon.
      await pool.query(
        `INSERT INTO tidum_role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT (role_id, permission_id) DO NOTHING`,
        [roleId, permissionId],
      );
    }
  });

  it("is idempotent — running twice produces no duplicates or errors", async () => {
    await runMigration();
    await runMigration();
  });
});
```

- [ ] **Step 5: Kjør testen, verifiser at den passerer**

Kjør: `DATABASE_URL='<verdi fra .env>' npx vitest run server/lib/__tests__/admin-activity-log-migration.test.ts`
(husk `dangerouslyDisableSandbox: true` på Bash-kallet). Forventet: 3/3 PASS.

- [ ] **Step 6: Typecheck og commit**

```bash
npx tsc --noEmit
git add migrations/056_admin_activity_log.sql \
  server/lib/run-startup-migrations.ts \
  server/lib/permission-catalog.ts \
  server/lib/__tests__/admin-activity-log-migration.test.ts
git commit -m "feat: migrasjon + tillatelse for adminpanel-aktivitetslogg"
```

---

### Task 2: Mutasjonslogging + API-ruter

**Files:**
- Modify: `server/smartTimingRoutes.ts`
- Test: `server/lib/__tests__/admin-activity-log-routes.test.ts`

**Interfaces:**
- Konsumerer: Task 1s `tidum_admin_activity_log`-tabell og
  `activity_log.view`-tillatelse.
- Produserer: `POST /api/admin/activity/page-view`,
  `GET /api/admin/activity` — Task 4 (klient) kaller begge.

- [ ] **Step 1: Legg til `attachActivityLogging()`-hjelperen**

I `server/smartTimingRoutes.ts`, rett over `authenticateAdmin`-funksjonen
(linje 320), legg til:

```ts
// Skriver én rad per mutasjonsforsøk mot en authenticateAdmin-gated rute —
// kalt fra alle 3 suksess-grenene i authenticateAdmin, IKKE fra individuelle
// ruter (~100 av dem), samme "én delt funksjon fremfor tredobling"-lærdom
// som pairAdminUserWithUsersTable over. Logger også mislykkede forsøk
// (statuskoden lagres) — en 403 er like interessant som en 200 for "hva
// prøvde denne brukeren å gjøre". Best-effort: skriver aldri feil videre til
// den faktiske handlingen.
function attachActivityLogging(req: AuthRequest, res: Response): void {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return;
  const userId = req.admin?.id;
  if (!userId) return;
  res.on("finish", () => {
    pool
      .query(
        `INSERT INTO tidum_admin_activity_log (user_id, event_type, method, path, status_code)
         VALUES ($1, 'mutation', $2, $3, $4)`,
        [userId, req.method, req.path, res.statusCode],
      )
      .catch((err) => console.error("[activity-log] failed to write mutation entry", err));
  });
}
```

- [ ] **Step 2: Kall hjelperen fra alle 3 suksess-grenene i `authenticateAdmin`**

I samme fil, `authenticateAdmin`-funksjonen (linje 320-370), legg til
`attachActivityLogging(req, res);` rett før HVER av de 3 `return next();`-
linjene (linje 329 dev-mode, 349 JWT, 367 sesjon). Eksempel for dev-mode-
grenen:

```ts
  if (isDevMode) {
    req.admin = {
      id: '1',
      email: 'dev@tidum.no',
      role: 'super_admin',
      roleId: (await resolveSuperAdminRoleId()) ?? undefined,
    };
    attachActivityLogging(req, res);
    return next();
  }
```

Gjenta identisk mønster (kall rett før `return next();`, ikke noe annet
endret) for JWT-grenen og sesjon-grenen.

- [ ] **Step 3: Legg til `POST /api/admin/activity/page-view`**

Sett inn i `server/smartTimingRoutes.ts` like etter
`GET /api/admin/users/search`-ruten (fase 1.5s siste tildelings-rute):

```ts
  app.post("/api/admin/activity/page-view", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      const { path } = req.body as { path?: string };
      if (typeof path !== "string" || !path.startsWith("/admin")) {
        return res.status(400).json({ error: "path må starte med /admin" });
      }
      await pool.query(
        `INSERT INTO tidum_admin_activity_log (user_id, event_type, path)
         VALUES ($1, 'page_view', $2)`,
        [req.admin.id, path],
      );
      res.status(201).json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
```

Merk: ingen `hasPermission`-sjekk her — enhver gyldig admin kan logge sin
EGEN sidevisning, det er kun INNSYN i andres (neste steg) som krever
`activity_log.view`.

- [ ] **Step 4: Legg til `GET /api/admin/activity`**

Rett under forrige rute:

```ts
  app.get("/api/admin/activity", authenticateAdmin, async (req: AuthRequest, res) => {
    try {
      if (!(await hasPermission(req.admin.roleId, "activity_log.view"))) {
        return res.status(403).json({ error: "Ingen tilgang" });
      }
      const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10) || 50, 200);
      const offset = Math.max(parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);
      const conditions: string[] = [];
      const params: any[] = [];
      if (req.query.userId) {
        params.push(req.query.userId);
        conditions.push(`al.user_id = $${params.length}`);
      }
      if (req.query.since) {
        params.push(req.query.since);
        conditions.push(`al.created_at >= $${params.length}`);
      }
      if (req.query.until) {
        params.push(req.query.until);
        conditions.push(`al.created_at <= $${params.length}`);
      }
      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      params.push(limit, offset);
      const result = await pool.query(
        `SELECT al.id, al.user_id, u.email as user_email, al.event_type, al.method, al.path, al.status_code, al.created_at
         FROM tidum_admin_activity_log al
         LEFT JOIN users u ON u.id = al.user_id
         ${whereClause}
         ORDER BY al.created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
```

- [ ] **Step 5: Skriv tester**

Opprett `server/lib/__tests__/admin-activity-log-routes.test.ts`, samme
`NODE_ENV=production`+`vi.resetModules()`+delt-pool-mønster som
`server/lib/__tests__/role-assignment-routes.test.ts` (les den filen først
og kopier `beforeAll`/`afterAll`/`signSuperAdminToken`/`signVendorAdminToken`/
`createDisposableUser`-hjelperne ordrett — samme JWT_SECRET-fallback-kjede,
samme delte pool/app-oppsett):

```ts
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import jwt from "jsonwebtoken";
import type { db as DbType, pool as PoolType } from "../../db";
import { roles } from "@shared/models/permissions";
import { eq } from "drizzle-orm";

const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || "change-me-in-production";

describe("admin activity log routes", () => {
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
    return jwt.sign({ id: "test-activity-super-admin", email: "sa@example.com", role: "super_admin", roleId: role.id }, JWT_SECRET);
  }

  async function signVendorAdminToken() {
    const [role] = await db.select().from(roles).where(eq(roles.name, "vendor_admin")).limit(1);
    return jwt.sign({ id: "test-activity-vendor-admin", email: "va@example.com", role: "vendor_admin", roleId: role.id }, JWT_SECRET);
  }

  afterEach(async () => {
    await pool.query(`DELETE FROM tidum_admin_activity_log WHERE user_id LIKE 'test-activity-%'`);
  });

  it("POST /api/admin/activity/page-view logs a page_view row", async () => {
    const token = await signSuperAdminToken();
    const res = await request(app)
      .post("/api/admin/activity/page-view")
      .set("Authorization", `Bearer ${token}`)
      .send({ path: "/admin/roller" });

    expect(res.status).toBe(201);
    const { rows } = await pool.query(
      `SELECT event_type, path FROM tidum_admin_activity_log WHERE user_id = 'test-activity-super-admin'`,
    );
    expect(rows.length).toBe(1);
    expect(rows[0].event_type).toBe("page_view");
    expect(rows[0].path).toBe("/admin/roller");
  });

  it("POST /api/admin/activity/page-view rejects a path that doesn't start with /admin", async () => {
    const token = await signSuperAdminToken();
    const res = await request(app)
      .post("/api/admin/activity/page-view")
      .set("Authorization", `Bearer ${token}`)
      .send({ path: "/not-admin" });

    expect(res.status).toBe(400);
  });

  it("a mutation through an unrelated authenticateAdmin route logs a mutation row with the real status code", async () => {
    const token = await signVendorAdminToken();
    // vendor_admin has no role.manage, so this 403s — the log should still
    // record the attempt, with status_code 403, not just successes.
    const res = await request(app)
      .post("/api/admin/roles")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "should_not_be_created", scope: "global" });
    expect(res.status).toBe(403);

    // res.on('finish') fires asynchronously after the response is sent —
    // give it a moment before querying.
    await new Promise((resolve) => setTimeout(resolve, 200));
    const { rows } = await pool.query(
      `SELECT event_type, method, path, status_code FROM tidum_admin_activity_log WHERE user_id = 'test-activity-vendor-admin'`,
    );
    expect(rows.length).toBe(1);
    expect(rows[0].event_type).toBe("mutation");
    expect(rows[0].method).toBe("POST");
    expect(rows[0].path).toBe("/api/admin/roles");
    expect(rows[0].status_code).toBe(403);
  });

  it("a GET request does not log a mutation row", async () => {
    const token = await signSuperAdminToken();
    await request(app)
      .get("/api/admin/permissions")
      .set("Authorization", `Bearer ${token}`);

    await new Promise((resolve) => setTimeout(resolve, 200));
    const { rows } = await pool.query(
      `SELECT 1 FROM tidum_admin_activity_log WHERE user_id = 'test-activity-super-admin' AND event_type = 'mutation'`,
    );
    expect(rows.length).toBe(0);
  });

  it("GET /api/admin/activity rejects a caller without activity_log.view", async () => {
    const token = await signVendorAdminToken();
    const res = await request(app)
      .get("/api/admin/activity")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("GET /api/admin/activity returns entries, filterable by userId", async () => {
    const token = await signSuperAdminToken();
    await request(app)
      .post("/api/admin/activity/page-view")
      .set("Authorization", `Bearer ${token}`)
      .send({ path: "/admin/roller" });

    const res = await request(app)
      .get("/api/admin/activity")
      .query({ userId: "test-activity-super-admin" })
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.every((r: any) => r.user_id === "test-activity-super-admin")).toBe(true);
  });
});
```

- [ ] **Step 6: Kjør testene, verifiser at alle passerer**

Kjør: `DATABASE_URL='<verdi fra .env>' npx vitest run server/lib/__tests__/admin-activity-log-routes.test.ts`
(husk `dangerouslyDisableSandbox: true`). Forventet: alle 6 tester PASS.

- [ ] **Step 7: Typecheck og commit**

```bash
npx tsc --noEmit
git add server/smartTimingRoutes.ts server/lib/__tests__/admin-activity-log-routes.test.ts
git commit -m "feat: mutasjonslogging + aktivitetslogg-API"
```

---

### Task 3: Oppbevaring — 90 dagers automatisk sletting

**Files:**
- Create: `server/routes/activity-log-cron.ts`
- Modify: `server/routes.ts` (registrer cron-jobben)
- Test: `server/lib/__tests__/activity-log-cron.test.ts`

**Interfaces:**
- Konsumerer: Task 1s `tidum_admin_activity_log`-tabell.
- Produserer: ingen — ingen senere oppgave er avhengig av denne.

- [ ] **Step 1: Skriv cron-jobben**

Opprett `server/routes/activity-log-cron.ts`, modellert direkte på
`server/routes/gdpr-routes.ts:357-375` (les den filen først for eksakt
stil):

```ts
import cron from "node-cron";
import { pool } from "../db";

let cronStarted = false;
export function setupActivityLogCron() {
  if (cronStarted) return;
  // Daglig 02:30 — samme lav-trafikk-vindu som GDPR-jobben (02:00),
  // forskjøvet 30 minutter for å unngå at begge treffer databasen samtidig.
  cron.schedule("30 2 * * *", async () => {
    console.log("🗑️  Running admin activity log retention purge…");
    try {
      const result = await pool.query(
        `DELETE FROM tidum_admin_activity_log WHERE created_at < NOW() - INTERVAL '90 days'`,
      );
      console.log(`[activity-log] purged ${result.rowCount} row(s) older than 90 days`);
    } catch (err: any) {
      console.error("[activity-log] retention purge failed:", err);
    }
  });
  cronStarted = true;
  console.log("✅ Admin activity log retention cron scheduled (daily 02:30)");
}

/** Exported separately from the cron schedule for direct testing. */
export async function purgeOldActivityLogEntries(): Promise<number> {
  const result = await pool.query(
    `DELETE FROM tidum_admin_activity_log WHERE created_at < NOW() - INTERVAL '90 days'`,
  );
  return result.rowCount ?? 0;
}
```

- [ ] **Step 2: Registrer cron-jobben**

I `server/routes.ts`:
1. Legg til `import { setupActivityLogCron } from "./routes/activity-log-cron";`
   ved siden av den eksisterende `import { registerGdprRoutes, setupGdprCron } from "./routes/gdpr-routes";`-linjen (linje 28).
2. Legg til `setupActivityLogCron();` i cron-oppsettsblokken
   (`server/routes.ts:6559-6566`), rett etter `setupGdprCron();`, innenfor
   samme `if (process.env.RECURRING_CRON_DISABLED !== 'true') { ... }`-blokk.

- [ ] **Step 3: Skriv testen**

Opprett `server/lib/__tests__/activity-log-cron.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { pool } from "../../db";
import { purgeOldActivityLogEntries } from "../../routes/activity-log-cron";

describe("admin activity log retention purge", () => {
  afterEach(async () => {
    await pool.query(`DELETE FROM tidum_admin_activity_log WHERE user_id = 'test-activity-cron'`);
  });

  it("deletes rows older than 90 days, keeps newer ones", async () => {
    await pool.query(
      `INSERT INTO tidum_admin_activity_log (user_id, event_type, path, created_at)
       VALUES ('test-activity-cron', 'page_view', '/admin/old', NOW() - INTERVAL '91 days')`,
    );
    await pool.query(
      `INSERT INTO tidum_admin_activity_log (user_id, event_type, path, created_at)
       VALUES ('test-activity-cron', 'page_view', '/admin/new', NOW() - INTERVAL '1 day')`,
    );

    const purgedCount = await purgeOldActivityLogEntries();
    expect(purgedCount).toBeGreaterThanOrEqual(1);

    const { rows } = await pool.query(
      `SELECT path FROM tidum_admin_activity_log WHERE user_id = 'test-activity-cron'`,
    );
    expect(rows.length).toBe(1);
    expect(rows[0].path).toBe("/admin/new");
  });
});
```

- [ ] **Step 4: Kjør testen, verifiser at den passerer**

Kjør: `DATABASE_URL='<verdi fra .env>' npx vitest run server/lib/__tests__/activity-log-cron.test.ts`
(husk `dangerouslyDisableSandbox: true`). Forventet: PASS.

- [ ] **Step 5: Typecheck og commit**

```bash
npx tsc --noEmit
git add server/routes/activity-log-cron.ts server/routes.ts server/lib/__tests__/activity-log-cron.test.ts
git commit -m "feat: 90 dagers automatisk opprydding av aktivitetsloggen"
```

---

### Task 4: Klient — sidevisning-sporing + innsyns-UI

**Files:**
- Create: `client/src/components/admin-activity-tracker.tsx`
- Create: `client/src/pages/admin-aktivitetslogg.tsx`
- Modify: `client/src/App.tsx`

**Interfaces:**
- Konsumerer: Task 2s `POST /api/admin/activity/page-view` og
  `GET /api/admin/activity`.
- Produserer: ingen — siste oppgave i planen.

- [ ] **Step 1: Skriv `AdminActivityTracker`**

Opprett `client/src/components/admin-activity-tracker.tsx`:

```tsx
import { useEffect, useRef } from "react";
import { useLocation } from "wouter";

async function postPageView(path: string): Promise<void> {
  const token = sessionStorage.getItem("cms_admin_token");
  try {
    await fetch("/api/admin/activity/page-view", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ path }),
    });
  } catch {
    // Best-effort — en tapt sidevisning skal aldri påvirke brukeropplevelsen.
  }
}

export function AdminActivityTracker() {
  const [location] = useLocation();
  const lastTrackedPath = useRef<string | null>(null);

  useEffect(() => {
    if (!location.startsWith("/admin")) return;
    if (lastTrackedPath.current === location) return;
    lastTrackedPath.current = location;
    postPageView(location);
  }, [location]);

  return null;
}
```

- [ ] **Step 2: Monter komponenten i `App.tsx`**

I `client/src/App.tsx`:
1. Legg til `import { AdminActivityTracker } from "@/components/admin-activity-tracker";`
   ved siden av `import { AnalyticsRuntime } from "@/components/analytics-runtime";` (linje 15).
2. Legg til `<AdminActivityTracker />` rett etter `<AnalyticsRuntime />`
   (linje 248), som en søsken-linje.

- [ ] **Step 3: Skriv `admin-aktivitetslogg.tsx`**

Opprett `client/src/pages/admin-aktivitetslogg.tsx`, mønster hentet fra
`client/src/pages/admin-roller.tsx` (les den filen først — samme
`getOrMintAdminToken`/`authenticatedApiRequest`-hjelpere, samme
`PortalLayout`/`Card`-struktur):

```tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PortalLayout } from "@/components/portal/portal-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Activity } from "lucide-react";

interface ActivityRow {
  id: string;
  user_id: string;
  user_email: string | null;
  event_type: "mutation" | "page_view";
  method: string | null;
  path: string;
  status_code: number | null;
  created_at: string;
}

async function getOrMintAdminToken(): Promise<string | null> {
  const existing = sessionStorage.getItem('cms_admin_token');
  if (existing) return existing;
  try {
    const res = await fetch('/api/admin/session-token', { credentials: 'include' });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (data?.token) {
      sessionStorage.setItem('cms_admin_token', data.token);
      return data.token;
    }
  } catch {}
  return null;
}

async function authenticatedApiRequest(url: string, options: RequestInit = {}) {
  const send = async (token: string | null) =>
    fetch(url, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });

  let token = await getOrMintAdminToken();
  let res = await send(token);
  if (res.status === 401) {
    sessionStorage.removeItem('cms_admin_token');
    token = await getOrMintAdminToken();
    if (token) res = await send(token);
  }
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
  }
  return res.json();
}

export default function AdminAktivitetsloggPage() {
  const [userIdFilter, setUserIdFilter] = useState("");

  const { data: entries = [], isLoading, error } = useQuery<ActivityRow[]>({
    queryKey: ['/api/admin/activity', userIdFilter],
    queryFn: () =>
      authenticatedApiRequest(
        `/api/admin/activity${userIdFilter.trim() ? `?userId=${encodeURIComponent(userIdFilter.trim())}` : ''}`,
      ),
  });

  return (
    <PortalLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2" data-testid="text-page-title">
            <Activity className="h-6 w-6" />
            Aktivitetslogg
          </h1>
          <p className="text-muted-foreground">Hva adminpanel-brukere har gjort og vært inne på</p>
        </div>

        <Input
          value={userIdFilter}
          onChange={(e) => setUserIdFilter(e.target.value)}
          placeholder="Filtrer på bruker-id..."
          data-testid="input-activity-user-filter"
          className="max-w-sm"
        />

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">{(error as Error).message}</p>
        ) : (
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40">
                  <tr>
                    <th className="text-left p-3 font-medium">Bruker</th>
                    <th className="text-left p-3 font-medium">Type</th>
                    <th className="text-left p-3 font-medium">Sti</th>
                    <th className="text-left p-3 font-medium">Status</th>
                    <th className="text-left p-3 font-medium">Tidspunkt</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.id} className="border-b last:border-0" data-testid={`row-activity-${entry.id}`}>
                      <td className="p-3">{entry.user_email ?? entry.user_id}</td>
                      <td className="p-3">
                        <Badge variant={entry.event_type === "mutation" ? "default" : "secondary"}>
                          {entry.event_type === "mutation" ? "Handling" : "Sidevisning"}
                        </Badge>
                      </td>
                      <td className="p-3 font-mono text-xs">
                        {entry.method ? `${entry.method} ` : ""}
                        {entry.path}
                      </td>
                      <td className="p-3">{entry.status_code ?? "—"}</td>
                      <td className="p-3 text-muted-foreground">{new Date(entry.created_at).toLocaleString("no-NO")}</td>
                    </tr>
                  ))}
                  {entries.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-muted-foreground">
                        Ingen aktivitet funnet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </div>
    </PortalLayout>
  );
}
```

- [ ] **Step 4: Registrer siden i `App.tsx`**

I `client/src/App.tsx`:
1. Legg til `const AdminAktivitetslogg = lazy(() => import("@/pages/admin-aktivitetslogg"));`
   ved siden av `const AdminRoller = lazy(() => import("@/pages/admin-roller"));` (linje 37).
2. Legg til ruten rett etter `/admin/roller`-ruten (linje 194):

```tsx
        <Route path="/admin/aktivitetslogg">{() => <AuthGuard requiredRoles={["super_admin"]}><AdminAktivitetslogg /></AuthGuard>}</Route>
```

(Samme mønster/samme kjente avvik som `/admin/roller` allerede har — klient-
gaten bruker den gamle rollestrengen `super_admin`, ikke den nye
`activity_log.view`-tillatelsen; server-siden (`GET /api/admin/activity`)
håndhever korrekt uansett. Ikke en sikkerhetshull, kun en intensjons-
uoverensstemmelse — samme akseptable, allerede eksisterende mønster som
`admin-roller.tsx` sin egen side-gate.)

- [ ] **Step 5: Manuell verifisering i nettleser**

Start dev-server, logg inn som super_admin, naviger til
`/admin/aktivitetslogg`, verifiser:
- Siden viser en tabell (tom eller med data).
- Naviger til `/admin/roller` og tilbake — en ny `page_view`-rad dukker opp
  ved refresh av aktivitetsloggen.
- Utfør en handling (f.eks. opprett en rolle på `/admin/roller`) — en ny
  `mutation`-rad dukker opp.

Hvis `SESSION_SECRET` mangler i lokal `.env` og blokkerer dev-serveren
(kjent, forhåndseksisterende gap — se
`.claude/skills/rolle-tilgangssystem/references/fallgruver.md`), noter dette
i implementeringsrapporten som ikke-verifisert i nettleser, men verifisert
via API-testene i Task 2.

- [ ] **Step 6: Typecheck og commit**

```bash
npx tsc --noEmit
git add client/src/components/admin-activity-tracker.tsx \
  client/src/pages/admin-aktivitetslogg.tsx \
  client/src/App.tsx
git commit -m "feat: sidevisning-sporing + innsyns-UI for aktivitetsloggen"
```
