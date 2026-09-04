# Tidum Turnus A0 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Etablere det tenant-isolerte databasefundamentet for Tidum Turnus-vertikalen — org-tenant, full domenemodell, egen turnus-RLS-kontekst, actor-oppslag — slik at alle senere faser (regel-CRUD, generator, XAI, UI) bygger på et bevist isolert grunnlag.

**Architecture:** Ny `org_id`-tenant med egen transaksjonslokal RLS-kontekst (`tidum.turnus_org_id`), speilet på barnevern-mønsteret men isolert fra den herdede kommune-pathen. Alle turnus-tabeller får FORCE RLS med policy `USING (tidum_rls_turnus_org_allowed(org_id))`. Drizzle-schema i `shared/schema.ts`, migrasjon kjørt via startup-kjeden.

**Tech Stack:** PostgreSQL (Neon/lokal), Drizzle ORM, Express, TypeScript, Vitest. Rå SQL via `pool`/`client.query` (samme mønster som barnevern-rutene).

**Spec:** `docs/superpowers/specs/2026-09-04-tidum-turnus-vertikal-design.md`

## Global Constraints

- Tabellprefiks: `tidum_turnus_`. Tenant-kolonne: `org_id INTEGER NOT NULL` på alle unntatt `tidum_turnus_organisasjoner` (som har `id` + valgfri `kommune_id`).
- Alle turnus-tabeller: `FORCE ROW LEVEL SECURITY`, policy `USING (tidum_rls_turnus_org_allowed(org_id))`, grants til `pg_database_owner`.
- RLS-kontekst er alltid transaksjonslokal (`set_config(..., true)`), aldri session-global — pooled connection skal ikke lekke mellom requests.
- RLS-kontekst-nøkkel: `tidum.turnus_org_id`. Systemmodus gjenbruker `tidum.rls_mode='system'` + `tidum.rls_system_operation` (samme som barnevern) for migrasjoner/seed.
- Barnevern-RLS-pathen (`setLocalKommuneRlsContext`, `tidum_rls_kommune_allowed`) skal IKKE endres.
- Migrasjonsfil: `migrations/105_turnus_core.sql`. Idempotent (`IF NOT EXISTS`, `DO $$ ... duplicate_object`). Registreres i `server/lib/run-startup-migrations.ts`.
- Tester: Vitest mot lokal Postgres (samme oppsett som `server/lib/__tests__/barnevern-municipality-rls.test.ts`).

---

### Task 1: Migrasjon — turnus-RLS-funksjon, org-tabell, isolasjonsbevis

**Files:**
- Create: `migrations/105_turnus_core.sql`
- Test: `server/lib/__tests__/turnus-org-rls.test.ts`

**Interfaces:**
- Produces: SQL-funksjon `tidum_rls_turnus_org_allowed(target_org_id INTEGER) RETURNS BOOLEAN`; tabell `tidum_turnus_organisasjoner (id serial pk, navn text, kommune_id int?, orgnr text?, created_at)`; RLS-kontekstnøkkel `tidum.turnus_org_id`.

- [ ] **Step 1: Write the failing test**

`server/lib/__tests__/turnus-org-rls.test.ts`:

```typescript
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../../db";

async function setTurnusOrg(client: any, orgId: number | null) {
  await client.query(
    `SELECT set_config('tidum.rls_mode', $1, true),
            set_config('tidum.turnus_org_id', $2, true),
            set_config('tidum.rls_system_operation', '', true)`,
    [orgId == null ? "deny" : "turnus", orgId == null ? "" : String(orgId)],
  );
}

describe("turnus org RLS migration 105", () => {
  const nonce = randomUUID();
  let orgA = 0;
  let orgB = 0;

  beforeAll(async () => {
    const migration = readFileSync("migrations/105_turnus_core.sql", "utf8");
    await pool.query(migration);
    await pool.query(migration); // idempotent

    // Insert two orgs under system context.
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE pg_database_owner");
      await client.query(
        `SELECT set_config('tidum.rls_mode','system',true),
                set_config('tidum.rls_system_operation','test_105',true)`,
      );
      const { rows } = await client.query(
        `INSERT INTO tidum_turnus_organisasjoner (navn) VALUES ($1),($2) RETURNING id`,
        [`Org A ${nonce}`, `Org B ${nonce}`],
      );
      orgA = Number(rows[0].id);
      orgB = Number(rows[1].id);
      await client.query("COMMIT");
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await pool.query(
      `DELETE FROM tidum_turnus_organisasjoner WHERE id = ANY($1::int[])`,
      [[orgA, orgB]],
    );
  });

  it("org A context sees only org A", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE pg_database_owner");
      await setTurnusOrg(client, orgA);
      const { rows } = await client.query(
        `SELECT id FROM tidum_turnus_organisasjoner WHERE id = ANY($1::int[])`,
        [[orgA, orgB]],
      );
      await client.query("COMMIT");
      expect(rows.map((r) => Number(r.id))).toEqual([orgA]);
    } finally {
      client.release();
    }
  });

  it("deny context sees nothing", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE pg_database_owner");
      await setTurnusOrg(client, null);
      const { rows } = await client.query(
        `SELECT id FROM tidum_turnus_organisasjoner WHERE id = ANY($1::int[])`,
        [[orgA, orgB]],
      );
      await client.query("COMMIT");
      expect(rows).toHaveLength(0);
    } finally {
      client.release();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/lib/__tests__/turnus-org-rls.test.ts`
Expected: FAIL — `migrations/105_turnus_core.sql` does not exist (ENOENT).

- [ ] **Step 3: Write the migration (org table + RLS function + policy)**

`migrations/105_turnus_core.sql` (this task adds only the org table + function; later tasks in this plan append the remaining tables to the same file):

```sql
-- migrations/105_turnus_core.sql
-- Tidum Turnus vertical — tenant-isolated core schema.
-- Own RLS context key (tidum.turnus_org_id); barnevern's kommune path is untouched.
-- See docs/superpowers/specs/2026-09-04-tidum-turnus-vertikal-design.md.

BEGIN;

SELECT set_config('tidum.rls_mode', 'system', true),
       set_config('tidum.turnus_org_id', '', true),
       set_config('tidum.rls_system_operation', 'migration_105', true);

CREATE OR REPLACE FUNCTION tidum_rls_turnus_org_allowed(target_org_id INTEGER)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN current_setting('tidum.rls_mode', true) = 'system'
      AND current_setting('tidum.rls_system_operation', true) ~ '^[a-z][a-z0-9_-]{2,63}$'
      THEN TRUE
    WHEN current_setting('tidum.rls_mode', true) = 'turnus'
      AND current_setting('tidum.turnus_org_id', true) ~ '^[1-9][0-9]*$'
      THEN target_org_id = current_setting('tidum.turnus_org_id', true)::INTEGER
    ELSE FALSE
  END
$$;

CREATE TABLE IF NOT EXISTS tidum_turnus_organisasjoner (
  id          SERIAL PRIMARY KEY,
  navn        TEXT NOT NULL,
  kommune_id  INTEGER REFERENCES tidum_kommuner(id),
  orgnr       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE tidum_turnus_organisasjoner ENABLE ROW LEVEL SECURITY;
ALTER TABLE tidum_turnus_organisasjoner FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY tidum_turnus_organisasjoner_isolation ON tidum_turnus_organisasjoner
    USING (tidum_rls_turnus_org_allowed(id))
    WITH CHECK (tidum_rls_turnus_org_allowed(id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

GRANT USAGE ON SCHEMA public TO pg_database_owner;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE tidum_turnus_organisasjoner TO pg_database_owner;
GRANT USAGE, SELECT ON SEQUENCE tidum_turnus_organisasjoner_id_seq TO pg_database_owner;

COMMIT;
```

> Note: `tidum_turnus_organisasjoner` is the one table whose policy checks `id` (it *is* the tenant); every later table checks `org_id`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/lib/__tests__/turnus-org-rls.test.ts`
Expected: PASS (both isolation cases).

- [ ] **Step 5: Commit**

```bash
git add migrations/105_turnus_core.sql server/lib/__tests__/turnus-org-rls.test.ts
git commit -m "feat(turnus): org tenant table + turnus RLS function with isolation test"
```

---

### Task 2: Migrasjon — resten av domenemodellen (struktur, ressurser, rotasjon, kalender, behov, regler, ønsker, prioritering)

**Files:**
- Modify: `migrations/105_turnus_core.sql` (append tables before the final `COMMIT`? No — add a second `BEGIN/COMMIT` block appended to the file)
- Test: `server/lib/__tests__/turnus-schema-rls.test.ts`

**Interfaces:**
- Consumes: `tidum_rls_turnus_org_allowed`, `tidum_turnus_organisasjoner` (Task 1).
- Produces: all remaining tables per spec §3–§4 with FORCE RLS + org-policy + grants.

- [ ] **Step 1: Write the failing test** (proves a child table is org-isolated)

`server/lib/__tests__/turnus-schema-rls.test.ts`:

```typescript
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../../db";

describe("turnus child-table RLS (avdelinger)", () => {
  const nonce = randomUUID();
  let orgA = 0;
  let orgB = 0;
  let avdA = 0;

  async function sys(client: any) {
    await client.query(
      `SELECT set_config('tidum.rls_mode','system',true),
              set_config('tidum.rls_system_operation','test_schema_105',true)`,
    );
  }

  beforeAll(async () => {
    const migration = readFileSync("migrations/105_turnus_core.sql", "utf8");
    await pool.query(migration);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE pg_database_owner");
      await sys(client);
      const orgs = await client.query(
        `INSERT INTO tidum_turnus_organisasjoner (navn) VALUES ($1),($2) RETURNING id`,
        [`Org A ${nonce}`, `Org B ${nonce}`],
      );
      orgA = Number(orgs.rows[0].id);
      orgB = Number(orgs.rows[1].id);
      const avd = await client.query(
        `INSERT INTO tidum_turnus_avdelinger (org_id, navn) VALUES ($1,$2) RETURNING id`,
        [orgA, `Avd A ${nonce}`],
      );
      avdA = Number(avd.rows[0].id);
      await client.query("COMMIT");
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM tidum_turnus_avdelinger WHERE id = $1`, [avdA]);
    await pool.query(`DELETE FROM tidum_turnus_organisasjoner WHERE id = ANY($1::int[])`, [[orgA, orgB]]);
  });

  it("org B context cannot see org A's avdeling", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE pg_database_owner");
      await client.query(
        `SELECT set_config('tidum.rls_mode','turnus',true),
                set_config('tidum.turnus_org_id',$1,true)`,
        [String(orgB)],
      );
      const { rows } = await client.query(
        `SELECT id FROM tidum_turnus_avdelinger WHERE id = $1`,
        [avdA],
      );
      await client.query("COMMIT");
      expect(rows).toHaveLength(0);
    } finally {
      client.release();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/lib/__tests__/turnus-schema-rls.test.ts`
Expected: FAIL — relation `tidum_turnus_avdelinger` does not exist.

- [ ] **Step 3: Append the remaining schema to the migration**

Append to `migrations/105_turnus_core.sql` (new transaction block after Task 1's `COMMIT`):

```sql
BEGIN;

SELECT set_config('tidum.rls_mode', 'system', true),
       set_config('tidum.turnus_org_id', '', true),
       set_config('tidum.rls_system_operation', 'migration_105b', true);

-- Enums
DO $$ BEGIN CREATE TYPE tidum_turnus_plan_status AS ENUM
  ('utkast','generert','godkjent','aktiv'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE tidum_turnus_vakt_kilde AS ENUM
  ('rotasjon','manuell','vikar'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE tidum_turnus_regel_kilde AS ENUM
  ('lov','lokal_avtale','saeravtale','dispensasjon'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE tidum_turnus_onske_prioritet AS ENUM
  ('maa','bor','kan'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE tidum_turnus_onske_status AS ENUM
  ('registrert','vurdert','innfridd','avslaatt'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Struktur
CREATE TABLE IF NOT EXISTS tidum_turnus_avdelinger (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES tidum_turnus_organisasjoner(id),
  navn TEXT NOT NULL,
  parent_id INTEGER REFERENCES tidum_turnus_avdelinger(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ressurser
CREATE TABLE IF NOT EXISTS tidum_turnus_ansatte (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES tidum_turnus_organisasjoner(id),
  primar_avdeling_id INTEGER REFERENCES tidum_turnus_avdelinger(id),
  navn TEXT NOT NULL,
  stillingsprosent NUMERIC(5,2) NOT NULL DEFAULT 100,
  user_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS tidum_turnus_kompetanser (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES tidum_turnus_organisasjoner(id),
  navn TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS tidum_turnus_ansatt_kompetanser (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES tidum_turnus_organisasjoner(id),
  ansatt_id INTEGER NOT NULL REFERENCES tidum_turnus_ansatte(id) ON DELETE CASCADE,
  kompetanse_id INTEGER NOT NULL REFERENCES tidum_turnus_kompetanser(id) ON DELETE CASCADE,
  UNIQUE (ansatt_id, kompetanse_id)
);
CREATE TABLE IF NOT EXISTS tidum_turnus_vaktkoder (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES tidum_turnus_organisasjoner(id),
  kode TEXT NOT NULL,
  navn TEXT,
  start_tid TIME,
  slutt_tid TIME,
  varighet_timer NUMERIC(4,2),
  type TEXT,
  teller_som_arbeid BOOLEAN NOT NULL DEFAULT TRUE,
  farge TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, kode)
);

-- Turnus (rotasjon)
CREATE TABLE IF NOT EXISTS tidum_turnus_planer (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES tidum_turnus_organisasjoner(id),
  avdeling_id INTEGER NOT NULL REFERENCES tidum_turnus_avdelinger(id),
  navn TEXT NOT NULL,
  rotasjon_uker INTEGER NOT NULL DEFAULT 6,
  start_dato DATE,
  status tidum_turnus_plan_status NOT NULL DEFAULT 'utkast',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS tidum_turnus_vaktlinjer (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES tidum_turnus_organisasjoner(id),
  plan_id INTEGER NOT NULL REFERENCES tidum_turnus_planer(id) ON DELETE CASCADE,
  linjenr INTEGER NOT NULL,
  stillingsprosent NUMERIC(5,2) NOT NULL DEFAULT 100,
  tildelt_ansatt_id INTEGER REFERENCES tidum_turnus_ansatte(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (plan_id, linjenr)
);
CREATE TABLE IF NOT EXISTS tidum_turnus_linje_vakter (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES tidum_turnus_organisasjoner(id),
  vaktlinje_id INTEGER NOT NULL REFERENCES tidum_turnus_vaktlinjer(id) ON DELETE CASCADE,
  uke INTEGER NOT NULL,
  ukedag INTEGER NOT NULL CHECK (ukedag BETWEEN 1 AND 7),
  vaktkode_id INTEGER REFERENCES tidum_turnus_vaktkoder(id),
  UNIQUE (vaktlinje_id, uke, ukedag)
);

-- Kalender (hybrid)
CREATE TABLE IF NOT EXISTS tidum_turnus_kalendervakter (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES tidum_turnus_organisasjoner(id),
  avdeling_id INTEGER NOT NULL REFERENCES tidum_turnus_avdelinger(id),
  dato DATE NOT NULL,
  vaktkode_id INTEGER NOT NULL REFERENCES tidum_turnus_vaktkoder(id),
  ansatt_id INTEGER REFERENCES tidum_turnus_ansatte(id),
  kilde tidum_turnus_vakt_kilde NOT NULL DEFAULT 'rotasjon',
  erstatter_linje_id INTEGER REFERENCES tidum_turnus_vaktlinjer(id),
  generering_id INTEGER,
  status TEXT NOT NULL DEFAULT 'foreslaatt',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS tidum_turnus_kalendervakter_org_dato_idx
  ON tidum_turnus_kalendervakter (org_id, dato);

-- Behov
CREATE TABLE IF NOT EXISTS tidum_turnus_bemanningsbehov (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES tidum_turnus_organisasjoner(id),
  avdeling_id INTEGER NOT NULL REFERENCES tidum_turnus_avdelinger(id),
  ukedag INTEGER CHECK (ukedag BETWEEN 1 AND 7),
  dato DATE,
  vaktkode_id INTEGER NOT NULL REFERENCES tidum_turnus_vaktkoder(id),
  antall_krevd INTEGER NOT NULL DEFAULT 1,
  kompetanse_krav_id INTEGER REFERENCES tidum_turnus_kompetanser(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Regler + ønsker + prioritering
CREATE TABLE IF NOT EXISTS tidum_turnus_regler (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES tidum_turnus_organisasjoner(id),
  avdeling_id INTEGER REFERENCES tidum_turnus_avdelinger(id),
  ansatt_id INTEGER REFERENCES tidum_turnus_ansatte(id),
  regeltype TEXT NOT NULL,
  parametre JSONB NOT NULL DEFAULT '{}'::jsonb,
  haard BOOLEAN NOT NULL DEFAULT TRUE,
  vekt INTEGER NOT NULL DEFAULT 0,
  kilde tidum_turnus_regel_kilde NOT NULL DEFAULT 'lov',
  gyldig_fra DATE,
  gyldig_til DATE,
  aktiv BOOLEAN NOT NULL DEFAULT TRUE,
  opprettet_av VARCHAR REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS tidum_turnus_onsker (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES tidum_turnus_organisasjoner(id),
  ansatt_id INTEGER NOT NULL REFERENCES tidum_turnus_ansatte(id) ON DELETE CASCADE,
  plan_id INTEGER REFERENCES tidum_turnus_planer(id),
  type TEXT NOT NULL,
  dato DATE,
  ukedag INTEGER CHECK (ukedag BETWEEN 1 AND 7),
  periode_fra DATE,
  periode_til DATE,
  vaktkode_id INTEGER REFERENCES tidum_turnus_vaktkoder(id),
  prioritet tidum_turnus_onske_prioritet NOT NULL DEFAULT 'bor',
  begrunnelse TEXT,
  status tidum_turnus_onske_status NOT NULL DEFAULT 'registrert',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS tidum_turnus_prioriteringsprofil (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES tidum_turnus_organisasjoner(id),
  plan_id INTEGER REFERENCES tidum_turnus_planer(id),
  vekt_onsker INTEGER NOT NULL DEFAULT 5,
  vekt_helgefrekvens INTEGER NOT NULL DEFAULT 5,
  vekt_rettferdighet INTEGER NOT NULL DEFAULT 5,
  vekt_kontinuitet INTEGER NOT NULL DEFAULT 5,
  vekt_kostnad INTEGER NOT NULL DEFAULT 5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable + FORCE RLS + org-policy + grants for every turnus child table.
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'tidum_turnus_avdelinger','tidum_turnus_ansatte','tidum_turnus_kompetanser',
    'tidum_turnus_ansatt_kompetanser','tidum_turnus_vaktkoder','tidum_turnus_planer',
    'tidum_turnus_vaktlinjer','tidum_turnus_linje_vakter','tidum_turnus_kalendervakter',
    'tidum_turnus_bemanningsbehov','tidum_turnus_regler','tidum_turnus_onsker',
    'tidum_turnus_prioriteringsprofil'
  ])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (tidum_rls_turnus_org_allowed(org_id)) WITH CHECK (tidum_rls_turnus_org_allowed(org_id))',
      t || '_isolation', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I TO pg_database_owner', t);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %I TO pg_database_owner', t || '_id_seq');
  END LOOP;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/lib/__tests__/turnus-schema-rls.test.ts`
Expected: PASS (org B cannot see org A's avdeling).

- [ ] **Step 5: Commit**

```bash
git add migrations/105_turnus_core.sql server/lib/__tests__/turnus-schema-rls.test.ts
git commit -m "feat(turnus): full domain schema with FORCE RLS org isolation"
```

---

### Task 3: RLS-kontekst — `setLocalTurnusOrgRlsContext` + `withTurnusOrgRlsContext`

**Files:**
- Modify: `server/lib/database-rls-context.ts`
- Test: `server/lib/__tests__/turnus-rls-context.test.ts`

**Interfaces:**
- Consumes: `assumeRlsRuntimeRole`, `withTransaction`-mønster (eksisterende private helpers i fila).
- Produces:
  - `setLocalTurnusOrgRlsContext(client: QueryClient, orgId: number): Promise<void>`
  - `withTurnusOrgRlsContext<T>(orgId: number, callback: (client: QueryClient) => Promise<T>): Promise<T>`

- [ ] **Step 1: Write the failing test**

`server/lib/__tests__/turnus-rls-context.test.ts`:

```typescript
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { pool } from "../../db";
import { withTurnusOrgRlsContext, withSystemRlsContext } from "../database-rls-context";

describe("withTurnusOrgRlsContext", () => {
  const nonce = randomUUID();
  let orgA = 0;
  let orgB = 0;

  beforeAll(async () => {
    await pool.query(readFileSync("migrations/105_turnus_core.sql", "utf8"));
    await withSystemRlsContext("test_ctx_105", async (client) => {
      const { rows } = await client.query(
        `INSERT INTO tidum_turnus_organisasjoner (navn) VALUES ($1),($2) RETURNING id`,
        [`Ctx A ${nonce}`, `Ctx B ${nonce}`],
      );
      orgA = Number(rows[0].id);
      orgB = Number(rows[1].id);
    });
  });

  it("scopes reads to the given org", async () => {
    const visible = await withTurnusOrgRlsContext(orgA, async (client) => {
      const { rows } = await client.query(
        `SELECT id FROM tidum_turnus_organisasjoner WHERE id = ANY($1::int[])`,
        [[orgA, orgB]],
      );
      return rows.map((r) => Number(r.id));
    });
    expect(visible).toEqual([orgA]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/lib/__tests__/turnus-rls-context.test.ts`
Expected: FAIL — `withTurnusOrgRlsContext` is not exported.

- [ ] **Step 3: Add the context functions**

In `server/lib/database-rls-context.ts`, after `setLocalVendorRlsContext`, add:

```typescript
/**
 * Transaction-local tenant context for the Tidum Turnus vertical. Uses its own
 * config key (tidum.turnus_org_id) so it never touches the hardened kommune path.
 */
export async function setLocalTurnusOrgRlsContext(
  client: QueryClient,
  orgId: number,
): Promise<void> {
  if (!Number.isInteger(orgId) || orgId <= 0) {
    throw new Error(`Invalid turnus org id: ${orgId}`);
  }
  await assumeRlsRuntimeRole(client);
  await client.query(
    `SELECT set_config('tidum.rls_mode', 'turnus', true),
            set_config('tidum.turnus_org_id', $1, true),
            set_config('tidum.kommune_id', '', true),
            set_config('tidum.vendor_id', '', true),
            set_config('tidum.rls_system_operation', '', true),
            set_config('tidum.rls_actor_user_id', '', true)`,
    [String(orgId)],
  );
}
```

Then, next to `withKommuneRlsContext`, add (mirror its exact body, swapping the setter):

```typescript
export function withTurnusOrgRlsContext<T>(
  orgId: number,
  callback: (client: QueryClient) => Promise<T>,
): Promise<T> {
  return withRlsTransaction(
    (client) => setLocalTurnusOrgRlsContext(client, orgId),
    callback,
  );
}
```

> Read `withKommuneRlsContext`'s implementation first and reuse the same private transaction helper it calls (named `withRlsTransaction` above — use whatever the file actually names it). Do not invent a new transaction wrapper.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/lib/__tests__/turnus-rls-context.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/lib/database-rls-context.ts server/lib/__tests__/turnus-rls-context.test.ts
git commit -m "feat(turnus): withTurnusOrgRlsContext transaction-local tenant context"
```

---

### Task 4: Registrer migrasjon i startup-kjeden

**Files:**
- Modify: `server/lib/run-startup-migrations.ts`
- Test: `server/lib/__tests__/turnus-migration-registered.test.ts`

**Interfaces:**
- Consumes: `STARTUP_MIGRATIONS` array (eksisterende).
- Produces: `"105_turnus_core.sql"` registrert etter `"104_barnevern_dokumentmaler.sql"`.

- [ ] **Step 1: Write the failing test**

`server/lib/__tests__/turnus-migration-registered.test.ts`:

```typescript
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("startup migration registration", () => {
  it("registers 105_turnus_core.sql after 104", () => {
    const src = readFileSync("server/lib/run-startup-migrations.ts", "utf8");
    const i104 = src.indexOf("104_barnevern_dokumentmaler.sql");
    const i105 = src.indexOf("105_turnus_core.sql");
    expect(i104).toBeGreaterThan(-1);
    expect(i105).toBeGreaterThan(i104);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/lib/__tests__/turnus-migration-registered.test.ts`
Expected: FAIL — `105_turnus_core.sql` not found in source.

- [ ] **Step 3: Register the migration**

In `server/lib/run-startup-migrations.ts`, add to `STARTUP_MIGRATIONS` immediately after `"104_barnevern_dokumentmaler.sql"`:

```typescript
  "105_turnus_core.sql",
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/lib/__tests__/turnus-migration-registered.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/lib/run-startup-migrations.ts server/lib/__tests__/turnus-migration-registered.test.ts
git commit -m "feat(turnus): register 105_turnus_core in startup migration chain"
```

---

### Task 5: `requireTurnusActor` — auth-oppslag som resolver org fra bruker

**Files:**
- Create: `server/routes/turnus-actor.ts`
- Test: `server/routes/__tests__/turnus-actor.test.ts`

**Interfaces:**
- Consumes: `req.session`/auth-mønsteret fra `requireKommuneActor` (les den først for eksakt session-form).
- Produces: `requireTurnusActor(req, res): TurnusActor | null` der `TurnusActor = { userId: string; orgId: number; role: string }`. Returnerer `null` og har allerede sendt 401/403 når uautorisert.

- [ ] **Step 1: Write the failing test**

`server/routes/__tests__/turnus-actor.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { requireTurnusActor } from "../turnus-actor";

function mockRes() {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

describe("requireTurnusActor", () => {
  it("returns 401 when no session user", () => {
    const res = mockRes();
    const actor = requireTurnusActor({ session: {} } as any, res);
    expect(actor).toBeNull();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("returns 403 when user has no turnus org", () => {
    const res = mockRes();
    const actor = requireTurnusActor(
      { session: { user: { id: "u1", role: "planlegger" } } } as any,
      res,
    );
    expect(actor).toBeNull();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("returns actor when session carries turnusOrgId", () => {
    const res = mockRes();
    const actor = requireTurnusActor(
      { session: { user: { id: "u1", role: "planlegger", turnusOrgId: 7 } } } as any,
      res,
    );
    expect(actor).toEqual({ userId: "u1", orgId: 7, role: "planlegger" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/routes/__tests__/turnus-actor.test.ts`
Expected: FAIL — module `../turnus-actor` not found.

- [ ] **Step 3: Implement the actor helper**

`server/routes/turnus-actor.ts`:

```typescript
import type { Request, Response } from "express";

export interface TurnusActor {
  userId: string;
  orgId: number;
  role: string;
}

/**
 * Resolves the turnus tenant actor from the session. Returns null (and sends the
 * response) when unauthenticated (401) or when the user has no turnus org (403).
 * NOTE: `turnusOrgId` on the session user is populated at login; see Task in the
 * A0b plan that wires org membership. Until then, tests inject it directly.
 */
export function requireTurnusActor(req: Request, res: Response): TurnusActor | null {
  const user = (req.session as any)?.user;
  if (!user?.id) {
    res.status(401).json({ error: "Ikke innlogget" });
    return null;
  }
  const orgId = Number(user.turnusOrgId);
  if (!Number.isInteger(orgId) || orgId <= 0) {
    res.status(403).json({ error: "Ingen turnus-organisasjon for bruker" });
    return null;
  }
  return { userId: String(user.id), orgId, role: String(user.role ?? "") };
}
```

> Before writing, open `requireKommuneActor` (in `server/routes/barnevern-melding-routes.ts`) and match the real session shape — if the session user object is accessed differently, mirror that access, keeping the 401/403 contract above.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/routes/__tests__/turnus-actor.test.ts`
Expected: PASS (all three cases).

- [ ] **Step 5: Commit**

```bash
git add server/routes/turnus-actor.ts server/routes/__tests__/turnus-actor.test.ts
git commit -m "feat(turnus): requireTurnusActor session-to-org resolver"
```

---

### Task 6: Drizzle-schema-speiling i `shared/schema.ts`

**Files:**
- Modify: `shared/schema.ts`
- Test: `shared/__tests__/turnus-schema-shape.test.ts`

**Interfaces:**
- Produces: Drizzle `pgTable`-eksporter for turnus-tabellene (`turnusOrganisasjoner`, `turnusAvdelinger`, `turnusAnsatte`, `turnusVaktkoder`, `turnusPlaner`, `turnusRegler`, `turnusOnsker`, m.fl.) med kolonner som matcher migrasjon 105. Brukes av senere CRUD-planer for typet spørring.

- [ ] **Step 1: Write the failing test**

`shared/__tests__/turnus-schema-shape.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { turnusOrganisasjoner, turnusAvdelinger } from "../schema";

describe("turnus drizzle schema", () => {
  it("maps to the migration table names", () => {
    expect(getTableConfig(turnusOrganisasjoner).name).toBe("tidum_turnus_organisasjoner");
    expect(getTableConfig(turnusAvdelinger).name).toBe("tidum_turnus_avdelinger");
  });

  it("avdelinger carries org_id", () => {
    const cols = getTableConfig(turnusAvdelinger).columns.map((c) => c.name);
    expect(cols).toContain("org_id");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run shared/__tests__/turnus-schema-shape.test.ts`
Expected: FAIL — `turnusOrganisasjoner` not exported from `../schema`.

- [ ] **Step 3: Add the Drizzle tables**

In `shared/schema.ts`, append (mirror the migration columns; only the two proven-by-test tables plus the others used downstream — add the full set, one `pgTable` each):

```typescript
export const turnusOrganisasjoner = pgTable("tidum_turnus_organisasjoner", {
  id: serial("id").primaryKey(),
  navn: text("navn").notNull(),
  kommuneId: integer("kommune_id"),
  orgnr: text("orgnr"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const turnusAvdelinger = pgTable("tidum_turnus_avdelinger", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull(),
  navn: text("navn").notNull(),
  parentId: integer("parent_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const turnusAnsatte = pgTable("tidum_turnus_ansatte", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull(),
  primarAvdelingId: integer("primar_avdeling_id"),
  navn: text("navn").notNull(),
  stillingsprosent: numeric("stillingsprosent", { precision: 5, scale: 2 }),
  userEmail: text("user_email"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const turnusVaktkoder = pgTable("tidum_turnus_vaktkoder", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull(),
  kode: text("kode").notNull(),
  navn: text("navn"),
  startTid: time("start_tid"),
  sluttTid: time("slutt_tid"),
  varighetTimer: numeric("varighet_timer", { precision: 4, scale: 2 }),
  type: text("type"),
  tellerSomArbeid: boolean("teller_som_arbeid").default(true),
  farge: text("farge"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const turnusPlaner = pgTable("tidum_turnus_planer", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull(),
  avdelingId: integer("avdeling_id").notNull(),
  navn: text("navn").notNull(),
  rotasjonUker: integer("rotasjon_uker").default(6),
  startDato: date("start_dato"),
  status: text("status").default("utkast"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const turnusRegler = pgTable("tidum_turnus_regler", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull(),
  avdelingId: integer("avdeling_id"),
  ansattId: integer("ansatt_id"),
  regeltype: text("regeltype").notNull(),
  parametre: jsonb("parametre").default({}),
  haard: boolean("haard").default(true),
  vekt: integer("vekt").default(0),
  kilde: text("kilde").default("lov"),
  gyldigFra: date("gyldig_fra"),
  gyldigTil: date("gyldig_til"),
  aktiv: boolean("aktiv").default(true),
  opprettetAv: varchar("opprettet_av"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const turnusOnsker = pgTable("tidum_turnus_onsker", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull(),
  ansattId: integer("ansatt_id").notNull(),
  planId: integer("plan_id"),
  type: text("type").notNull(),
  dato: date("dato"),
  ukedag: integer("ukedag"),
  periodeFra: date("periode_fra"),
  periodeTil: date("periode_til"),
  vaktkodeId: integer("vaktkode_id"),
  prioritet: text("prioritet").default("bor"),
  begrunnelse: text("begrunnelse"),
  status: text("status").default("registrert"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
```

> `time` and `date` are already imported at the top of `shared/schema.ts` (see line 2). If any used helper is missing from the import, add it there.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run shared/__tests__/turnus-schema-shape.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/schema.ts shared/__tests__/turnus-schema-shape.test.ts
git commit -m "feat(turnus): drizzle schema mirror for turnus core tables"
```

---

## Self-Review

**1. Spec coverage (A0 scope only — foundation):**
- §2 Tenant/RLS → Task 1 (function + org table), Task 3 (context). ✔
- §3 Domenemodell (alle tabeller) → Task 2 (schema) + Task 6 (Drizzle). ✔
- §4 Regler/ønsker/prioritering-tabeller → Task 2. ✔ (CRUD-logikken er A0b, ikke dette planet.)
- §9 Migrasjonsregistrering → Task 4. ✔
- Actor-fundament for §6 API → Task 5. ✔
- Generator/XAI/UI (§5, §6.2) → utenfor A0; egne planer A1–A4.

**2. Placeholder scan:** Ingen «TBD/TODO/handle edge cases». To bevisste «les eksisterende X først»-noter (Task 3 transaksjonshelper, Task 5 session-form) er presise instruksjoner, ikke placeholders — de peker på navngitt eksisterende kode implementeren må matche.

**3. Type consistency:** `TurnusActor { userId, orgId, role }` brukes likt i Task 5. `withTurnusOrgRlsContext(orgId, cb)` signatur lik i Task 3 og referert konsistent. Tabellnavn identiske mellom migrasjon (Task 1/2) og Drizzle (Task 6). `tidum.turnus_org_id` / `rls_mode='turnus'` identisk i migrasjon-funksjon (Task 1) og kontekst (Task 3).

---

## Neste planer (utenfor dette A0-fundamentet)
- **A0b — CRUD-API + login-org-wiring:** 4 rutemoduler (struktur/regler/plan/generering-stubs), Zod-validering, `turnusOrgId` satt ved login, `client/src/lib/turnus-api.ts`.
- **A1 — solver-sidecar:** `turnus-solver/` (Python OR-Tools), kontrakt `shared/turnus-solver-contract.ts`, harde constraints + AML full-turnus-utvidelse av `arbeidstidsloven.ts`, golden tests.
- **A2 — myke mål + prioritering.**
- **A3 — XAI + overstyring m/konsekvens.**
- **A4 — UI (`client/src/pages/turnus.tsx`) + demo-video-pipeline.**

## Execution Handoff

Se separat handoff-melding for kjøringsvalg.
