# Tidum Turnus A0b — CRUD API + org-wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bygge API- og innloggingslaget oppå A0-fundamentet: reell org-tilhørighet (`requireTurnusActor` DB-resolvet), 4 CRUD-rutemoduler bak turnus-RLS, resterende Drizzle-speiling, og et typet klient-API-lag.

**Architecture:** Hver rute følger det etablerte barnevern-mønsteret: `const actor = await requireTurnusActor(req); if (!actor) return res.status(403); const data = await withTurnusOrgRlsContext(actor.orgId, async (client) => { ... }); res.json(...)`. Org-tilhørighet leses fra en ny `tidum_turnus_org_members`-tabell, slik `requireKommuneActor` leser kommune fra `users`. All spørring er RLS-scoped, aldri request-styrt org_id.

**Tech Stack:** Express, PostgreSQL (rå SQL via `client.query`), Drizzle, TypeScript, Vitest. Klient: React Query-stil fetch-lag.

**Spec:** `docs/superpowers/specs/2026-09-04-tidum-turnus-vertikal-design.md` (§6 API/UI, §2 tenant)
**Bygger på:** `docs/superpowers/plans/2026-09-04-tidum-turnus-a0-foundation.md` (A0, merget/PR #60)

## Global Constraints

- Alle turnus-tabeller er FORCE RLS med policy `tidum_rls_turnus_org_allowed(org_id)`. Hver DB-operasjon MÅ kjøres inne i `withTurnusOrgRlsContext(actor.orgId, cb)` — aldri rå `pool.query` for turnus-data.
- Aldri stol på request-oppgitt `org_id`: sett alltid `org_id = actor.orgId` fra serversiden ved INSERT; RLS `WITH CHECK` håndhever det, men koden skal også sende actor.orgId eksplisitt.
- Actor: `requireTurnusActor(req)` er `async`, leser `(req as any).user`, resolverer org via `tidum_turnus_org_members`, returnerer `null` uten å sende respons (kaller sender 403). Erstatter A0-stubben (som leste `user.turnusOrgId`).
- Rutene registreres i `server/routes.ts` (samme sted som `registerBarnevernInnsynRoutes(app)`, ~linje 6851).
- Validering: manuell (`typeof`/`!field`) som barnevern-rutene; returner `res.status(400).json({ error })` ved ugyldig input.
- Tester mot lokal Postgres: `DATABASE_URL=postgresql://localhost:5432/tidsflyt_test`. ALDRI *.neon.tech.
- Ny migrasjon `106_turnus_org_members.sql`, registrert i `server/lib/run-startup-migrations.ts` etter `105_turnus_core.sql`.

---

### Task 1: Org-medlemskap + reell `requireTurnusActor`

**Files:**
- Create: `migrations/106_turnus_org_members.sql`
- Modify: `server/routes/turnus-actor.ts`
- Modify: `server/lib/run-startup-migrations.ts`
- Test: `server/routes/__tests__/turnus-actor-resolve.test.ts`, `server/lib/__tests__/turnus-org-members-rls.test.ts`

**Interfaces:**
- Produces: table `tidum_turnus_org_members (id, org_id, user_id, rolle, created_at)` FORCE RLS; `requireTurnusActor(req): Promise<TurnusActor | null>` resolving org from DB.

- [ ] **Step 1: Write the failing RLS test**

`server/lib/__tests__/turnus-org-members-rls.test.ts`:

```typescript
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { pool } from "../../db";
import { withSystemRlsContext, withTurnusOrgRlsContext } from "../database-rls-context";

describe("turnus_org_members RLS 106", () => {
  const nonce = randomUUID();
  let orgA = 0, orgB = 0;
  beforeAll(async () => {
    await pool.query(readFileSync("migrations/105_turnus_core.sql", "utf8"));
    await pool.query(readFileSync("migrations/106_turnus_org_members.sql", "utf8"));
    await withSystemRlsContext("test_106", async (c) => {
      const o = await c.query(`INSERT INTO tidum_turnus_organisasjoner (navn) VALUES ($1),($2) RETURNING id`, [`A ${nonce}`, `B ${nonce}`]);
      orgA = Number(o.rows[0].id); orgB = Number(o.rows[1].id);
      await c.query(`INSERT INTO tidum_turnus_org_members (org_id, user_id, rolle) VALUES ($1,$2,'planlegger')`, [orgA, `u-${nonce}`]);
    });
  });
  it("org B context cannot see org A membership", async () => {
    const rows = await withTurnusOrgRlsContext(orgB, async (c) =>
      (await c.query(`SELECT id FROM tidum_turnus_org_members WHERE org_id = $1`, [orgA])).rows);
    expect(rows).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run — expect fail (106 missing)**

Run: `DATABASE_URL=postgresql://localhost:5432/tidsflyt_test npx vitest run server/lib/__tests__/turnus-org-members-rls.test.ts`
Expected: FAIL (relation/file missing).

- [ ] **Step 3: Write migration 106**

`migrations/106_turnus_org_members.sql`:

```sql
-- migrations/106_turnus_org_members.sql
-- Maps platform users to a Tidum Turnus organisasjon (tenant membership).
BEGIN;
SELECT set_config('tidum.rls_mode','system',true),
       set_config('tidum.turnus_org_id','',true),
       set_config('tidum.rls_system_operation','migration_106',true);

CREATE TABLE IF NOT EXISTS tidum_turnus_org_members (
  id         SERIAL PRIMARY KEY,
  org_id     INTEGER NOT NULL REFERENCES tidum_turnus_organisasjoner(id),
  user_id    VARCHAR NOT NULL,
  rolle      TEXT NOT NULL DEFAULT 'planlegger',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, user_id)
);
CREATE INDEX IF NOT EXISTS tidum_turnus_org_members_user_idx
  ON tidum_turnus_org_members (user_id);

ALTER TABLE tidum_turnus_org_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE tidum_turnus_org_members FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY tidum_turnus_org_members_isolation ON tidum_turnus_org_members
    USING (tidum_rls_turnus_org_allowed(org_id)) WITH CHECK (tidum_rls_turnus_org_allowed(org_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE tidum_turnus_org_members TO pg_database_owner;
GRANT USAGE, SELECT ON SEQUENCE tidum_turnus_org_members_id_seq TO pg_database_owner;
COMMIT;
```

Register in `server/lib/run-startup-migrations.ts` after `"105_turnus_core.sql"`:

```typescript
  "106_turnus_org_members.sql",
```

- [ ] **Step 4: Run RLS test — expect pass**

Run: `DATABASE_URL=postgresql://localhost:5432/tidsflyt_test npx vitest run server/lib/__tests__/turnus-org-members-rls.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing actor-resolve test**

`server/routes/__tests__/turnus-actor-resolve.test.ts`:

```typescript
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { pool } from "../../db";
import { withSystemRlsContext } from "../../lib/database-rls-context";
import { requireTurnusActor } from "../turnus-actor";

describe("requireTurnusActor DB resolution", () => {
  const nonce = randomUUID();
  const userId = `actor-${nonce}`;
  let orgId = 0;
  beforeAll(async () => {
    await pool.query(readFileSync("migrations/105_turnus_core.sql", "utf8"));
    await pool.query(readFileSync("migrations/106_turnus_org_members.sql", "utf8"));
    await withSystemRlsContext("test_actor_106", async (c) => {
      const o = await c.query(`INSERT INTO tidum_turnus_organisasjoner (navn) VALUES ($1) RETURNING id`, [`Org ${nonce}`]);
      orgId = Number(o.rows[0].id);
      await c.query(`INSERT INTO tidum_turnus_org_members (org_id, user_id, rolle) VALUES ($1,$2,'leder')`, [orgId, userId]);
    });
  });
  it("returns null without an authenticated user", async () => {
    expect(await requireTurnusActor({} as any)).toBeNull();
  });
  it("returns null for a user with no org membership", async () => {
    expect(await requireTurnusActor({ user: { id: `nobody-${nonce}` } } as any)).toBeNull();
  });
  it("resolves org + rolle from membership", async () => {
    const actor = await requireTurnusActor({ user: { id: userId } } as any);
    expect(actor).toEqual({ userId, orgId, role: "leder" });
  });
});
```

- [ ] **Step 6: Run — expect fail (still sync stub)**

Run: `DATABASE_URL=postgresql://localhost:5432/tidsflyt_test npx vitest run server/routes/__tests__/turnus-actor-resolve.test.ts`
Expected: FAIL.

- [ ] **Step 7: Rewrite `requireTurnusActor` to resolve from DB**

Replace the body of `server/routes/turnus-actor.ts` (keep the `TurnusActor` interface):

```typescript
import type { Request } from "express";
import { withTurnusOrgRlsContext } from "../lib/database-rls-context";
import { pool } from "../db";

export interface TurnusActor {
  userId: string;
  orgId: number;
  role: string;
}

/**
 * Resolves the turnus tenant actor from the authenticated user's org membership
 * (tidum_turnus_org_members). Mirrors requireKommuneActor: reads (req as any).user,
 * queries the DB, returns null on failure (caller sends the response). The lookup
 * runs under system RLS context because the member row's own org is what we are
 * resolving. A user with no membership row gets null (fail-closed).
 */
export async function requireTurnusActor(req: Request): Promise<TurnusActor | null> {
  const user = (req as any).user;
  if (!user?.id) return null;
  const { rows: [row] } = await pool.query(
    `SELECT m.org_id, m.rolle
       FROM tidum_turnus_org_members m
      WHERE m.user_id = $1
      ORDER BY m.created_at ASC
      LIMIT 1`,
    [String(user.id)],
  );
  if (!row) return null;
  return { userId: String(user.id), orgId: Number(row.org_id), role: String(row.rolle ?? "") };
}
```

> Note: the membership lookup uses `pool.query` (not RLS-scoped) intentionally — resolving *which* org the user belongs to is the pre-tenant step, keyed on the trusted server-side `user.id`, never on request input. All subsequent data access uses `withTurnusOrgRlsContext(actor.orgId, ...)`.

- [ ] **Step 8: Update the old A0 stub test**

The A0 test `server/routes/__tests__/turnus-actor.test.ts` asserted the sync stub. Delete it (superseded by `turnus-actor-resolve.test.ts`):

```bash
git rm server/routes/__tests__/turnus-actor.test.ts
```

- [ ] **Step 9: Run both new tests — expect pass**

Run: `DATABASE_URL=postgresql://localhost:5432/tidsflyt_test npx vitest run server/routes/__tests__/turnus-actor-resolve.test.ts server/lib/__tests__/turnus-org-members-rls.test.ts`
Expected: PASS (all).

- [ ] **Step 10: Commit**

```bash
git add migrations/106_turnus_org_members.sql server/routes/turnus-actor.ts server/lib/run-startup-migrations.ts server/routes/__tests__/turnus-actor-resolve.test.ts server/lib/__tests__/turnus-org-members-rls.test.ts
git rm --cached server/routes/__tests__/turnus-actor.test.ts 2>/dev/null || true
git commit -m "feat(turnus): org membership table + DB-resolved requireTurnusActor"
```

---

### Task 2: Resterende Drizzle-speiling (8 tabeller)

**Files:**
- Modify: `shared/schema.ts`
- Test: `shared/__tests__/turnus-schema-shape-rest.test.ts`

**Interfaces:**
- Produces: `turnusKompetanser, turnusAnsattKompetanser, turnusVaktlinjer, turnusLinjeVakter, turnusKalendervakter, turnusBemanningsbehov, turnusPrioriteringsprofil, turnusOrgMembers` pgTable exports.

- [ ] **Step 1: Write the failing test**

`shared/__tests__/turnus-schema-shape-rest.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  turnusKompetanser, turnusVaktlinjer, turnusKalendervakter,
  turnusBemanningsbehov, turnusPrioriteringsprofil, turnusOrgMembers,
} from "../schema";

it("rest of turnus tables map to migration names", () => {
  expect(getTableConfig(turnusKompetanser).name).toBe("tidum_turnus_kompetanser");
  expect(getTableConfig(turnusVaktlinjer).name).toBe("tidum_turnus_vaktlinjer");
  expect(getTableConfig(turnusKalendervakter).name).toBe("tidum_turnus_kalendervakter");
  expect(getTableConfig(turnusBemanningsbehov).name).toBe("tidum_turnus_bemanningsbehov");
  expect(getTableConfig(turnusPrioriteringsprofil).name).toBe("tidum_turnus_prioriteringsprofil");
  expect(getTableConfig(turnusOrgMembers).name).toBe("tidum_turnus_org_members");
});
```

- [ ] **Step 2: Run — expect fail**

Run: `DATABASE_URL=postgresql://localhost:5432/tidsflyt_test npx vitest run shared/__tests__/turnus-schema-shape-rest.test.ts`
Expected: FAIL (exports missing).

- [ ] **Step 3: Append the 8 pgTable exports to `shared/schema.ts`**

Column names/types must match migrations 105/106 exactly:

```typescript
export const turnusKompetanser = pgTable("tidum_turnus_kompetanser", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull(),
  navn: text("navn").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
export const turnusAnsattKompetanser = pgTable("tidum_turnus_ansatt_kompetanser", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull(),
  ansattId: integer("ansatt_id").notNull(),
  kompetanseId: integer("kompetanse_id").notNull(),
});
export const turnusVaktlinjer = pgTable("tidum_turnus_vaktlinjer", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull(),
  planId: integer("plan_id").notNull(),
  linjenr: integer("linjenr").notNull(),
  stillingsprosent: numeric("stillingsprosent", { precision: 5, scale: 2 }),
  tildeltAnsattId: integer("tildelt_ansatt_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
export const turnusLinjeVakter = pgTable("tidum_turnus_linje_vakter", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull(),
  vaktlinjeId: integer("vaktlinje_id").notNull(),
  uke: integer("uke").notNull(),
  ukedag: integer("ukedag").notNull(),
  vaktkodeId: integer("vaktkode_id"),
});
export const turnusKalendervakter = pgTable("tidum_turnus_kalendervakter", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull(),
  avdelingId: integer("avdeling_id").notNull(),
  dato: date("dato").notNull(),
  vaktkodeId: integer("vaktkode_id").notNull(),
  ansattId: integer("ansatt_id"),
  kilde: text("kilde").notNull().default("rotasjon"),
  erstatterLinjeId: integer("erstatter_linje_id"),
  genereringId: integer("generering_id"),
  status: text("status").notNull().default("foreslaatt"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
export const turnusBemanningsbehov = pgTable("tidum_turnus_bemanningsbehov", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull(),
  avdelingId: integer("avdeling_id").notNull(),
  ukedag: integer("ukedag"),
  dato: date("dato"),
  vaktkodeId: integer("vaktkode_id").notNull(),
  antallKrevd: integer("antall_krevd").notNull().default(1),
  kompetanseKravId: integer("kompetanse_krav_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
export const turnusPrioriteringsprofil = pgTable("tidum_turnus_prioriteringsprofil", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull(),
  planId: integer("plan_id"),
  vektOnsker: integer("vekt_onsker").notNull().default(5),
  vektHelgefrekvens: integer("vekt_helgefrekvens").notNull().default(5),
  vektRettferdighet: integer("vekt_rettferdighet").notNull().default(5),
  vektKontinuitet: integer("vekt_kontinuitet").notNull().default(5),
  vektKostnad: integer("vekt_kostnad").notNull().default(5),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
export const turnusOrgMembers = pgTable("tidum_turnus_org_members", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull(),
  userId: varchar("user_id").notNull(),
  rolle: text("rolle").notNull().default("planlegger"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
```

- [ ] **Step 4: Run — expect pass**

Run: `DATABASE_URL=postgresql://localhost:5432/tidsflyt_test npx vitest run shared/__tests__/turnus-schema-shape-rest.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/schema.ts shared/__tests__/turnus-schema-shape-rest.test.ts
git commit -m "feat(turnus): drizzle mirror for remaining 8 turnus tables"
```

---

### Task 3: `turnus-struktur-routes.ts` — org/avdeling/ansatt/kompetanse/vaktkode CRUD

**Files:**
- Create: `server/routes/turnus-struktur-routes.ts`
- Modify: `server/routes.ts` (import + register)
- Test: `server/routes/__tests__/turnus-struktur-routes.test.ts`

**Interfaces:**
- Consumes: `requireTurnusActor` (Task 1), `withTurnusOrgRlsContext`.
- Produces: `registerTurnusStrukturRoutes(app: Express): void`.

**Shared handler template** (every endpoint below uses this exact shape):

```typescript
app.<method>("<path>", async (req: Request, res: Response) => {
  const actor = await requireTurnusActor(req);
  if (!actor) return res.status(403).json({ error: "Ikke tilgang." });
  try {
    const result = await withTurnusOrgRlsContext(actor.orgId, async (client) => {
      // ... client.query with org_id = actor.orgId ...
    });
    res.json(result);
  } catch (err) {
    console.error("[turnus-struktur] <path> feilet", err);
    res.status(500).json({ error: "Serverfeil." });
  }
});
```

**Endpoints** (path, method, body → SQL):

| Path | Method | Behavior |
|------|--------|----------|
| `/api/turnus/avdelinger` | GET | `SELECT * FROM tidum_turnus_avdelinger WHERE org_id=$1 ORDER BY navn` → `[actor.orgId]` |
| `/api/turnus/avdelinger` | POST | validate `navn` string; `INSERT INTO tidum_turnus_avdelinger (org_id, navn, parent_id) VALUES ($1,$2,$3) RETURNING *` → `[actor.orgId, body.navn, body.parentId ?? null]` |
| `/api/turnus/ansatte` | GET | `SELECT * FROM tidum_turnus_ansatte WHERE org_id=$1 ORDER BY navn` |
| `/api/turnus/ansatte` | POST | validate `navn`; `INSERT INTO tidum_turnus_ansatte (org_id, primar_avdeling_id, navn, stillingsprosent, user_email) VALUES ($1,$2,$3,$4,$5) RETURNING *` → `[actor.orgId, body.primarAvdelingId ?? null, body.navn, body.stillingsprosent ?? 100, body.userEmail ?? null]` |
| `/api/turnus/kompetanser` | GET | `SELECT * FROM tidum_turnus_kompetanser WHERE org_id=$1 ORDER BY navn` |
| `/api/turnus/kompetanser` | POST | validate `navn`; `INSERT ... (org_id, navn) VALUES ($1,$2) RETURNING *` |
| `/api/turnus/vaktkoder` | GET | `SELECT * FROM tidum_turnus_vaktkoder WHERE org_id=$1 ORDER BY kode` |
| `/api/turnus/vaktkoder` | POST | validate `kode` string; `INSERT INTO tidum_turnus_vaktkoder (org_id, kode, navn, start_tid, slutt_tid, varighet_timer, type, teller_som_arbeid, farge) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *` → `[actor.orgId, body.kode, body.navn ?? null, body.startTid ?? null, body.sluttTid ?? null, body.varighetTimer ?? null, body.type ?? null, body.tellerSomArbeid ?? true, body.farge ?? null]` |

Validation helper (top of file): `function bad(res: Response, msg: string) { res.status(400).json({ error: msg }); return null; }` — for POST, if `!body.navn || typeof body.navn !== "string"` return `res.status(400).json({ error: "navn kreves." })`.

- [ ] **Step 1: Write the failing test** (round-trip create→list under one org, and isolation)

`server/routes/__tests__/turnus-struktur-routes.test.ts`:

```typescript
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import express from "express";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { pool } from "../../db";
import { withSystemRlsContext } from "../../lib/database-rls-context";
import { registerTurnusStrukturRoutes } from "../turnus-struktur-routes";

function appFor(userId: string) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as any).user = { id: userId }; next(); });
  registerTurnusStrukturRoutes(app);
  return app;
}

describe("turnus struktur routes", () => {
  const nonce = randomUUID();
  const userId = `struktur-${nonce}`;
  beforeAll(async () => {
    await pool.query(readFileSync("migrations/105_turnus_core.sql", "utf8"));
    await pool.query(readFileSync("migrations/106_turnus_org_members.sql", "utf8"));
    await withSystemRlsContext("test_struktur", async (c) => {
      const o = await c.query(`INSERT INTO tidum_turnus_organisasjoner (navn) VALUES ($1) RETURNING id`, [`Org ${nonce}`]);
      await c.query(`INSERT INTO tidum_turnus_org_members (org_id, user_id, rolle) VALUES ($1,$2,'leder')`, [Number(o.rows[0].id), userId]);
    });
  });
  it("creates and lists an avdeling scoped to the actor's org", async () => {
    const app = appFor(userId);
    const created = await request(app).post("/api/turnus/avdelinger").send({ navn: `Avd ${nonce}` });
    expect(created.status).toBe(200);
    expect(created.body.navn).toBe(`Avd ${nonce}`);
    const list = await request(app).get("/api/turnus/avdelinger");
    expect(list.status).toBe(200);
    expect(list.body.some((a: any) => a.navn === `Avd ${nonce}`)).toBe(true);
  });
  it("rejects an unauthenticated request with 403", async () => {
    const app = express();
    app.use(express.json());
    registerTurnusStrukturRoutes(app);
    const r = await request(app).get("/api/turnus/avdelinger");
    expect(r.status).toBe(403);
  });
});
```

> `supertest` and `express` are already devDependencies (used by other route tests) — confirm with `grep supertest package.json`; if absent, that is a NEEDS_CONTEXT escalation, do not add a dependency silently.

- [ ] **Step 2: Run — expect fail (module missing)**

Run: `DATABASE_URL=postgresql://localhost:5432/tidsflyt_test npx vitest run server/routes/__tests__/turnus-struktur-routes.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `turnus-struktur-routes.ts`**

Write `registerTurnusStrukturRoutes(app)` with all 8 endpoints from the table above, each using the shared handler template. Full example for the two `avdelinger` endpoints (transcribe the rest identically per the table):

```typescript
import type { Express, Request, Response } from "express";
import { withTurnusOrgRlsContext } from "../lib/database-rls-context";
import { requireTurnusActor } from "./turnus-actor";

export function registerTurnusStrukturRoutes(app: Express): void {
  app.get("/api/turnus/avdelinger", async (req: Request, res: Response) => {
    const actor = await requireTurnusActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });
    try {
      const rows = await withTurnusOrgRlsContext(actor.orgId, async (client) =>
        (await client.query(`SELECT * FROM tidum_turnus_avdelinger WHERE org_id = $1 ORDER BY navn`, [actor.orgId])).rows);
      res.json(rows);
    } catch (err) {
      console.error("[turnus-struktur] list avdelinger feilet", err);
      res.status(500).json({ error: "Serverfeil." });
    }
  });

  app.post("/api/turnus/avdelinger", async (req: Request, res: Response) => {
    const actor = await requireTurnusActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });
    const { navn, parentId } = req.body ?? {};
    if (!navn || typeof navn !== "string") return res.status(400).json({ error: "navn kreves." });
    try {
      const row = await withTurnusOrgRlsContext(actor.orgId, async (client) =>
        (await client.query(
          `INSERT INTO tidum_turnus_avdelinger (org_id, navn, parent_id) VALUES ($1,$2,$3) RETURNING *`,
          [actor.orgId, navn, parentId ?? null])).rows[0]);
      res.json(row);
    } catch (err) {
      console.error("[turnus-struktur] create avdeling feilet", err);
      res.status(500).json({ error: "Serverfeil." });
    }
  });

  // ... ansatte, kompetanser, vaktkoder — same shape, SQL per the endpoint table ...
}
```

- [ ] **Step 4: Register in `server/routes.ts`**

Add import near the other route imports and call it next to `registerBarnevernInnsynRoutes(app)`:

```typescript
import { registerTurnusStrukturRoutes } from "./routes/turnus-struktur-routes";
// ...
  registerTurnusStrukturRoutes(app);
```

- [ ] **Step 5: Run — expect pass**

Run: `DATABASE_URL=postgresql://localhost:5432/tidsflyt_test npx vitest run server/routes/__tests__/turnus-struktur-routes.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/routes/turnus-struktur-routes.ts server/routes.ts server/routes/__tests__/turnus-struktur-routes.test.ts
git commit -m "feat(turnus): struktur CRUD routes (avdeling/ansatt/kompetanse/vaktkode)"
```

---

### Task 4: `turnus-regler-routes.ts` — regler/prioritering/ønsker CRUD

**Files:**
- Create: `server/routes/turnus-regler-routes.ts`
- Modify: `server/routes.ts`
- Test: `server/routes/__tests__/turnus-regler-routes.test.ts`

**Interfaces:**
- Produces: `registerTurnusReglerRoutes(app: Express): void`.

**Endpoints** (same shared handler template as Task 3):

| Path | Method | Behavior |
|------|--------|----------|
| `/api/turnus/regler` | GET | `SELECT * FROM tidum_turnus_regler WHERE org_id=$1 AND aktiv ORDER BY created_at DESC` |
| `/api/turnus/regler` | POST | validate `regeltype` string; `INSERT INTO tidum_turnus_regler (org_id, avdeling_id, ansatt_id, regeltype, parametre, haard, vekt, kilde, gyldig_fra, gyldig_til, opprettet_av) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *` → `[actor.orgId, body.avdelingId ?? null, body.ansattId ?? null, body.regeltype, JSON.stringify(body.parametre ?? {}), body.haard ?? true, body.vekt ?? 0, body.kilde ?? 'lov', body.gyldigFra ?? null, body.gyldigTil ?? null, actor.userId]` |
| `/api/turnus/regler/:id` | DELETE | `UPDATE tidum_turnus_regler SET aktiv=false WHERE id=$1 AND org_id=$2 RETURNING id` → 404 if no row |
| `/api/turnus/onsker` | GET | `SELECT * FROM tidum_turnus_onsker WHERE org_id=$1 ORDER BY created_at DESC` |
| `/api/turnus/onsker` | POST | validate `ansattId` number + `type` string; `INSERT INTO tidum_turnus_onsker (org_id, ansatt_id, plan_id, type, dato, ukedag, periode_fra, periode_til, vaktkode_id, prioritet, begrunnelse) VALUES ($1..$11) RETURNING *` |
| `/api/turnus/prioritering` | GET | `SELECT * FROM tidum_turnus_prioriteringsprofil WHERE org_id=$1 ORDER BY created_at DESC LIMIT 1` |
| `/api/turnus/prioritering` | POST | upsert: `INSERT INTO tidum_turnus_prioriteringsprofil (org_id, plan_id, vekt_onsker, vekt_helgefrekvens, vekt_rettferdighet, vekt_kontinuitet, vekt_kostnad) VALUES ($1..$7) RETURNING *` (all vekt default 5 when absent) |

- [ ] **Step 1: Write the failing test**

`server/routes/__tests__/turnus-regler-routes.test.ts` — mirror Task 3's test harness (`appFor(userId)` injecting `req.user`, org+member seeded in beforeAll). Assert:
- POST `/api/turnus/regler` with `{ regeltype: "aml_daglig_hvile_11t", haard: true }` → 200, body.regeltype matches, body.org_id equals the seeded org.
- GET `/api/turnus/regler` includes it.
- DELETE `/api/turnus/regler/:id` → 200; subsequent GET excludes it (aktiv=false filter).
- POST `/api/turnus/regler` with no `regeltype` → 400.

```typescript
// Harness identical to turnus-struktur-routes.test.ts (appFor, beforeAll seeding org+member).
// Then:
it("creates, lists, and soft-deletes a regel", async () => {
  const app = appFor(userId);
  const c = await request(app).post("/api/turnus/regler").send({ regeltype: "aml_daglig_hvile_11t", haard: true });
  expect(c.status).toBe(200);
  expect(c.body.regeltype).toBe("aml_daglig_hvile_11t");
  const list = await request(app).get("/api/turnus/regler");
  expect(list.body.some((r: any) => r.id === c.body.id)).toBe(true);
  const del = await request(app).delete(`/api/turnus/regler/${c.body.id}`);
  expect(del.status).toBe(200);
  const after = await request(app).get("/api/turnus/regler");
  expect(after.body.some((r: any) => r.id === c.body.id)).toBe(false);
});
it("rejects a regel without regeltype", async () => {
  const app = appFor(userId);
  const r = await request(app).post("/api/turnus/regler").send({ haard: true });
  expect(r.status).toBe(400);
});
```

- [ ] **Step 2: Run — expect fail**

Run: `DATABASE_URL=postgresql://localhost:5432/tidsflyt_test npx vitest run server/routes/__tests__/turnus-regler-routes.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `turnus-regler-routes.ts`** using the shared handler template and the endpoint table above; register in `server/routes.ts` with `registerTurnusReglerRoutes(app)`.

- [ ] **Step 4: Run — expect pass**

Run: `DATABASE_URL=postgresql://localhost:5432/tidsflyt_test npx vitest run server/routes/__tests__/turnus-regler-routes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/routes/turnus-regler-routes.ts server/routes.ts server/routes/__tests__/turnus-regler-routes.test.ts
git commit -m "feat(turnus): regler/prioritering/onsker CRUD routes"
```

---

### Task 5: `turnus-plan-routes.ts` — plan/bemanningsbehov/vaktlinjer + gating

**Files:**
- Create: `server/routes/turnus-plan-routes.ts`
- Modify: `server/routes.ts`
- Test: `server/routes/__tests__/turnus-plan-routes.test.ts`

**Interfaces:**
- Produces: `registerTurnusPlanRoutes(app: Express): void`.

**Endpoints:**

| Path | Method | Behavior |
|------|--------|----------|
| `/api/turnus/planer` | GET | `SELECT * FROM tidum_turnus_planer WHERE org_id=$1 ORDER BY created_at DESC` |
| `/api/turnus/planer` | POST | validate `navn` + `avdelingId`; `INSERT INTO tidum_turnus_planer (org_id, avdeling_id, navn, rotasjon_uker, start_dato) VALUES ($1..$5) RETURNING *` |
| `/api/turnus/planer/:id/behov` | GET | `SELECT b.* FROM tidum_turnus_bemanningsbehov b JOIN tidum_turnus_planer p ON p.avdeling_id=b.avdeling_id WHERE p.id=$1 AND b.org_id=$2` |
| `/api/turnus/bemanningsbehov` | POST | validate `avdelingId` + `vaktkodeId`; `INSERT INTO tidum_turnus_bemanningsbehov (org_id, avdeling_id, ukedag, dato, vaktkode_id, antall_krevd, kompetanse_krav_id) VALUES ($1..$7) RETURNING *` |
| `/api/turnus/planer/:id/vaktlinjer` | GET | `SELECT * FROM tidum_turnus_vaktlinjer WHERE plan_id=$1 AND org_id=$2 ORDER BY linjenr` |
| `/api/turnus/planer/:id/vaktlinjer` | POST | validate `linjenr`; `INSERT INTO tidum_turnus_vaktlinjer (org_id, plan_id, linjenr, stillingsprosent, tildelt_ansatt_id) VALUES ($1..$5) RETURNING *` |
| `/api/turnus/planer/:id/readiness` | GET | Gating (K-06/07): return `{ ready: boolean, mangler: string[] }` — ready when the plan's org has ≥1 vaktkode, the plan's avdeling has ≥1 bemanningsbehov, the org has ≥1 ansatt, and ≥1 aktiv regel. Build `mangler` from whichever counts are 0. |

Readiness query (one round-trip):

```sql
SELECT
  (SELECT count(*) FROM tidum_turnus_vaktkoder WHERE org_id=$2) AS vaktkoder,
  (SELECT count(*) FROM tidum_turnus_bemanningsbehov b JOIN tidum_turnus_planer p ON p.avdeling_id=b.avdeling_id WHERE p.id=$1 AND b.org_id=$2) AS behov,
  (SELECT count(*) FROM tidum_turnus_ansatte WHERE org_id=$2) AS ansatte,
  (SELECT count(*) FROM tidum_turnus_regler WHERE org_id=$2 AND aktiv) AS regler
```

Map each 0 count to a `mangler` string: `"vaktkoder"`, `"bemanningsbehov"`, `"ansatte"`, `"aktive regler"`. `ready = mangler.length === 0`.

- [ ] **Step 1: Write the failing test**

`server/routes/__tests__/turnus-plan-routes.test.ts` — same harness. Assert:
- POST `/api/turnus/planer` with `{ navn, avdelingId }` (seed an avdeling first via SQL in beforeAll) → 200.
- GET `/api/turnus/planer/:id/readiness` on a bare plan → `{ ready: false, mangler: [...] }` containing at least `"vaktkoder"` and `"ansatte"`.
- After seeding a vaktkode, ansatt, bemanningsbehov, and an aktiv regel, readiness → `{ ready: true, mangler: [] }`.

- [ ] **Step 2: Run — expect fail.** `DATABASE_URL=postgresql://localhost:5432/tidsflyt_test npx vitest run server/routes/__tests__/turnus-plan-routes.test.ts` → FAIL.

- [ ] **Step 3: Implement `turnus-plan-routes.ts`** (shared handler template + endpoint table + readiness query); register in `server/routes.ts`.

- [ ] **Step 4: Run — expect pass.**

- [ ] **Step 5: Commit**

```bash
git add server/routes/turnus-plan-routes.ts server/routes.ts server/routes/__tests__/turnus-plan-routes.test.ts
git commit -m "feat(turnus): plan/behov/vaktlinjer routes + generation readiness gating"
```

---

### Task 6: Klient-API-lag `turnus-api.ts`

**Files:**
- Create: `client/src/lib/turnus-api.ts`
- Test: `client/src/lib/__tests__/turnus-api.test.ts`

**Interfaces:**
- Consumes: the endpoints from Tasks 3–5.
- Produces: typed fetch functions: `listAvdelinger, opprettAvdeling, listAnsatte, opprettAnsatt, listVaktkoder, opprettVaktkode, listRegler, opprettRegel, slettRegel, listOnsker, opprettOnske, getPrioritering, lagrePrioritering, listPlaner, opprettPlan, getReadiness, listVaktlinjer`.

- [ ] **Step 1: Read the existing client API pattern**

Open `client/src/lib/barnevern-api.ts` and match its fetch/error-handling/credentials + CSRF-header convention exactly (GET vs mutating requests). Do NOT invent a new fetch wrapper.

- [ ] **Step 2: Write the failing test**

`client/src/lib/__tests__/turnus-api.test.ts` — mock `fetch` (vitest `vi.fn`), assert:
- `listAvdelinger()` issues `GET /api/turnus/avdelinger` with credentials and returns parsed JSON.
- `opprettRegel({ regeltype: "x" })` issues `POST /api/turnus/regler` with the CSRF header the barnevern client uses and a JSON body.

```typescript
import { afterEach, describe, expect, it, vi } from "vitest";
import { listAvdelinger, opprettRegel } from "../turnus-api";

afterEach(() => vi.restoreAllMocks());

it("listAvdelinger GETs the endpoint", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch" as any).mockResolvedValue({
    ok: true, json: async () => [{ id: 1, navn: "A" }],
  } as any);
  const rows = await listAvdelinger();
  expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/turnus/avdelinger"), expect.objectContaining({ credentials: "include" }));
  expect(rows[0].navn).toBe("A");
});
```

> If the barnevern client fetches CSRF tokens for mutations via a helper, reuse that helper in the POST test's assertion rather than hardcoding a header name.

- [ ] **Step 3: Run — expect fail.** `npx vitest run client/src/lib/__tests__/turnus-api.test.ts` → FAIL.

- [ ] **Step 4: Implement `client/src/lib/turnus-api.ts`** mirroring `barnevern-api.ts`'s wrapper; export all functions listed in Interfaces. Type returns loosely (`any[]` / `Record<string, unknown>`) unless barnevern-api uses shared types — match its convention.

- [ ] **Step 5: Run — expect pass.**

- [ ] **Step 6: Commit**

```bash
git add client/src/lib/turnus-api.ts client/src/lib/__tests__/turnus-api.test.ts
git commit -m "feat(turnus): typed client API layer for turnus endpoints"
```

---

## Self-Review

**1. Spec coverage (A0b scope):**
- §6 API 4 modules → Task 3 (struktur), Task 4 (regler/ønsker/prioritering), Task 5 (plan/behov/vaktlinjer + gating). ✔ (The 4th module, `turnus-generering-routes`, needs the solver — deferred to A1, not A0b.)
- §6 org-wiring → Task 1 (membership + DB-resolved actor). ✔
- §3 remaining Drizzle mirrors → Task 2. ✔
- §6 client layer → Task 6. ✔
- Generering/XAI routes → A1+ (out of A0b scope).

**2. Placeholder scan:** Endpoint behavior is given as concrete SQL + the shared handler template written out in full once (Task 3 Step 3). "Transcribe the rest identically per the table" refers to a template whose full code is present — not a vague reference. No TODO/TBD.

**3. Type consistency:** `requireTurnusActor` returns `Promise<TurnusActor | null>` (Task 1) and every route `await`s it (Tasks 3–5). `registerTurnus*Routes(app: Express)` signatures match the barnevern register pattern. Drizzle column names (Task 2) match migrations 105/106.

---

## Notes for downstream (A1+)
- `turnus-generering-routes.ts` + solver sidecar + XAI = A1/A3.
- UI page `client/src/pages/turnus.tsx` consuming `turnus-api.ts` = A4.
- Deferred A0 minors still open: GRANT EXECUTE parity, FK cross-table org_id CHECK.

## Execution Handoff
See separate handoff message for execution choice.
