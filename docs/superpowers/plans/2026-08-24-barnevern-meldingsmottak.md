# Barnevern: Meldingsmottak Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bygg mottak og avklaring av bekymringsmeldinger til kommunal barneverntjeneste — manuell registrering, tildeling, 1-ukes avklaringsfrist med eskalerende varsler (bvl. § 2-1), henleggelse/videresending til undersøkelse — pluss en generisk, gjenbrukbar fristmotor og et bevisst begrenset Fiks IO-transportlag.

**Architecture:** Ny, dedikert `tidum_barnevern_meldinger`-tabell (ikke gjenbruk av `tidum_saker`, som er utfører-side-bundet). En generisk `tidum_frister`-tabell + `server/lib/frist-engine.ts` som verken vet noe om meldinger eller barnevern — domenekoden registrerer/kansellerer frister, motoren eskalerer varsler. Ruter i en ny, selvstendig fil (`server/routes/barnevern-melding-routes.ts`), montert via det etablerte `registerXRoutes(app)`-mønsteret. Fiks IO bygges KUN mot offentlig dokumenterte deler (Maskinporten); alt annet logges råtekst til en egen tabell i stedet for å gjettes.

**Tech Stack:** Express, Drizzle ORM (schema-definisjoner) + rå `pool.query` (samme blandingsstil som resten av `server/`), Postgres, Vitest + Supertest, `node-cron`, `multer` (disk-lagring, samme mønster som `leave-attachments-routes.ts`).

**Spec:** [docs/superpowers/specs/2026-08-23-barnevern-meldingsmottak-design.md](../specs/2026-08-23-barnevern-meldingsmottak-design.md)

## Global Constraints

- Ny, dedikert tabell for meldinger — ALDRI gjenbruk av `tidum_saker`.
- All lesing/skriving av en melding håndhever `req.user.kommuneId === melding.kommuneId`. Ingen global kommune-admin-rolle finnes som kan bypasse dette — streng match, ingen unntak.
- Fristmotoren (`server/lib/frist-engine.ts`) er generisk — kjenner ALDRI til "melding" eller "barnevern". Domenekoden (meldings-rutene) eier all statuslogikk; motoren eier kun eskalerings-varsling.
- Fiks IO-koden gjetter ALDRI protokolldetaljer som ikke er offentlig dokumentert (AMQP-legitimasjonsutveksling, meldingskonvolutt-felt, bekymringsmeldingens innholdsskjema). Ukjente deler logges råtekst, aldri parses.
- Alle nye hemmeligheter (Fiks IO-privatnøkkel) krypteres med `sealSecret`/`openSecret` fra `server/lib/secret-box.ts` — aldri klartekst.
- Alle nye tabeller får `tidum_`-prefiks.
- PII (barnets fødselsnummer/navn, melders identitet) lagres som vanlige, tilgangskontrollerte kolonner — IKKE hashet (det er saksinnhold, ikke en autentiseringshemmelighet).
- Alle nye ruter: 404 (ikke 403) når en rad finnes men tilhører en annen `kommuneId` — unngår å bekrefte at ID-en eksisterer i en annen kommune.
- Ingen ny, delt rolle-sjekk-middleware denne runden — følg etablert konvensjon (lokal inline-helper per rutefil, som `isSuperAdmin`/`isAdminOrTiltaksleder` i eksisterende filer).

---

### Task 1: Datamodell — meldinger, vedlegg, frister, Fiks-konfig

**Files:**
- Create: `migrations/064_barnevern_meldingsmottak.sql`
- Modify: `shared/schema.ts` (append nye eksporter etter `kommuner`-seksjonen)
- Modify: `server/lib/run-startup-migrations.ts:49` (legg til `"064_barnevern_meldingsmottak.sql"` som ny linje rett før `];`)
- Test: `server/lib/__tests__/barnevern-meldingsmottak-schema.test.ts`

**Interfaces:**
- Produces: DB-tabellene `tidum_barnevern_meldinger`, `tidum_barnevern_melding_vedlegg`, `tidum_frister`, `tidum_fiks_raw_intake_log`, sekvensen `tidum_barnevern_meldingsnummer_seq`, og de 4 nye kolonnene på `tidum_kommuner` (`fiks_konto_id`, `fiks_private_key_encrypted`, `fiks_certificate_pem`, `fiks_enabled`) — Task 2-5 leser/skriver disse via rå `pool.query` (samme stil som resten av `server/`, IKKE via Drizzle-objektene). Drizzle-eksportene i `shared/schema.ts` (`barnevernMeldinger`, `frister`, osv.) finnes for type-generering og fremtidig bruk, men er ikke et krav for senere tasks å importere.

- [ ] **Step 1: Skriv en test som feiler fordi tabellene ikke finnes ennå**

```ts
// server/lib/__tests__/barnevern-meldingsmottak-schema.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { pool } from "../../db";

describe("Barnevern meldingsmottak: datamodell", () => {
  const cleanupIds: { table: string; id: string }[] = [];
  let testKommuneId: number;

  afterEach(async () => {
    for (const { table, id } of cleanupIds.splice(0)) {
      await pool.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
    }
  });

  async function insertTestKommune(): Promise<number> {
    const { rows: [row] } = await pool.query(
      `INSERT INTO tidum_kommuner (navn, org_nummer) VALUES ($1, $2) RETURNING id`,
      [`Testkommune ${Date.now()}`, `${900000000 + Math.floor(Math.random() * 99999999)}`],
    );
    return row.id;
  }

  it("kan opprette en tidum_barnevern_meldinger-rad med alle felt", async () => {
    testKommuneId = await insertTestKommune();
    const { rows: [row] } = await pool.query(
      `INSERT INTO tidum_barnevern_meldinger
         (kommune_id, meldingsnummer, kilde, mottatt_dato, melder_kategori, beskrivelse, avklaringsfrist)
       VALUES ($1, $2, 'manuell', NOW(), 'skole', 'Test-beskrivelse', NOW() + interval '7 days')
       RETURNING id, status, kilde`,
      [testKommuneId, `BVM-TEST-${Date.now()}`],
    );
    cleanupIds.push({ table: "tidum_barnevern_meldinger", id: row.id });
    expect(row.status).toBe("mottatt");
    expect(row.kilde).toBe("manuell");
    await pool.query(`DELETE FROM tidum_kommuner WHERE id = $1`, [testKommuneId]);
  });

  it("tidum_barnevern_meldingsnummer_seq gir strengt økende verdier", async () => {
    const { rows: [a] } = await pool.query(`SELECT nextval('tidum_barnevern_meldingsnummer_seq') AS n`);
    const { rows: [b] } = await pool.query(`SELECT nextval('tidum_barnevern_meldingsnummer_seq') AS n`);
    expect(Number(b.n)).toBe(Number(a.n) + 1);
  });

  it("tidum_frister håndhever unik (entity_type, entity_id, frist_type)", async () => {
    const { rows: [row] } = await pool.query(
      `INSERT INTO tidum_frister (entity_type, entity_id, kommune_id, frist_type, due_at)
       VALUES ('test_entity', 'abc-123', NULL, 'avklaring', NOW() + interval '7 days')
       RETURNING id`,
    );
    cleanupIds.push({ table: "tidum_frister", id: row.id });
    await expect(
      pool.query(
        `INSERT INTO tidum_frister (entity_type, entity_id, kommune_id, frist_type, due_at)
         VALUES ('test_entity', 'abc-123', NULL, 'avklaring', NOW())`,
      ),
    ).rejects.toThrow();
  });

  it("tidum_kommuner har nye Fiks-kolonner, default fiks_enabled=false", async () => {
    const kommuneId = await insertTestKommune();
    const { rows: [row] } = await pool.query(
      `SELECT fiks_konto_id, fiks_enabled FROM tidum_kommuner WHERE id = $1`,
      [kommuneId],
    );
    expect(row.fiks_konto_id).toBeNull();
    expect(row.fiks_enabled).toBe(false);
    await pool.query(`DELETE FROM tidum_kommuner WHERE id = $1`, [kommuneId]);
  });

  it("tidum_fiks_raw_intake_log kan lagre en rad", async () => {
    const kommuneId = await insertTestKommune();
    const { rows: [row] } = await pool.query(
      `INSERT INTO tidum_fiks_raw_intake_log (kommune_id, raw_payload_encrypted) VALUES ($1, 'enc:v1:test') RETURNING id`,
      [kommuneId],
    );
    cleanupIds.push({ table: "tidum_fiks_raw_intake_log", id: row.id });
    expect(row.id).toBeDefined();
    await pool.query(`DELETE FROM tidum_kommuner WHERE id = $1`, [kommuneId]);
  });
});
```

- [ ] **Step 2: Kjør testen, bekreft at den feiler**

Run: `DATABASE_URL=$(grep '^DATABASE_URL=' .env | cut -d= -f2-) npx vitest run server/lib/__tests__/barnevern-meldingsmottak-schema.test.ts`
Expected: FAIL — `relation "tidum_barnevern_meldinger" does not exist` (eller tilsvarende for de andre tabellene).

- [ ] **Step 3: Skriv migrasjonen**

```sql
-- migrations/064_barnevern_meldingsmottak.sql
-- Delprosjekt 2: meldingsmottak (bekymringsmelding). Ny, dedikert
-- tabell — IKKE gjenbruk av tidum_saker (den er utfører-side/
-- tiltaksbedrift-bundet, NOT NULL vendor_id/tiltaksleder_id).
-- Se docs/superpowers/specs/2026-08-23-barnevern-meldingsmottak-design.md.

CREATE TYPE tidum_barnevern_melding_status AS ENUM (
  'mottatt', 'under_avklaring', 'henlagt', 'sendt_til_undersokelse'
);

CREATE TYPE tidum_barnevern_melding_kilde AS ENUM ('manuell', 'fiks_io');

-- Én delt sekvens (ikke per-kommune) — antall aktive kommuner er lite nok
-- denne runden at dynamisk CREATE SEQUENCE ved runtime ville vært
-- overingeniørkunst. meldingsnummer bygges som BVM-<kommunenummer>-<n>.
CREATE SEQUENCE IF NOT EXISTS tidum_barnevern_meldingsnummer_seq;

CREATE TABLE IF NOT EXISTS tidum_barnevern_meldinger (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kommune_id                INTEGER NOT NULL REFERENCES tidum_kommuner(id),
  meldingsnummer            TEXT NOT NULL UNIQUE,
  kilde                     tidum_barnevern_melding_kilde NOT NULL DEFAULT 'manuell',
  mottatt_dato              TIMESTAMPTZ NOT NULL,
  melder_kategori           TEXT NOT NULL,
  melder_navn               TEXT,
  melder_kontakt            TEXT,
  barn_fodselsnummer        TEXT,
  barn_navn                 TEXT,
  beskrivelse               TEXT NOT NULL,
  status                    tidum_barnevern_melding_status NOT NULL DEFAULT 'mottatt',
  tildelt_saksbehandler_id  VARCHAR REFERENCES users(id),
  avklaringsfrist           TIMESTAMPTZ NOT NULL,
  avklart_dato              TIMESTAMPTZ,
  avklart_av_user_id        VARCHAR REFERENCES users(id),
  henleggelse_begrunnelse   TEXT,
  fiks_melding_id           TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tidum_barnevern_meldinger_kommune_idx
  ON tidum_barnevern_meldinger (kommune_id, status);

CREATE TABLE IF NOT EXISTS tidum_barnevern_melding_vedlegg (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  melding_id     UUID NOT NULL REFERENCES tidum_barnevern_meldinger(id) ON DELETE CASCADE,
  filename       TEXT NOT NULL,
  original_name  TEXT NOT NULL,
  mime_type      TEXT NOT NULL,
  size_bytes     INTEGER NOT NULL,
  uploaded_by    VARCHAR NOT NULL REFERENCES users(id),
  uploaded_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TYPE tidum_frist_status AS ENUM ('aktiv', 'oppfylt', 'brutt', 'kansellert');

CREATE TABLE IF NOT EXISTS tidum_frister (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type       TEXT NOT NULL,
  entity_id         TEXT NOT NULL,
  kommune_id        INTEGER REFERENCES tidum_kommuner(id),
  vendor_id         VARCHAR REFERENCES vendors(id), -- vendors.id er varchar/UUID i live DB, se ledger
  frist_type        TEXT NOT NULL,
  due_at            TIMESTAMPTZ NOT NULL,
  status            tidum_frist_status NOT NULL DEFAULT 'aktiv',
  varslet_offsets   INTEGER[] NOT NULL DEFAULT '{}',
  notify_user_id    VARCHAR REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (entity_type, entity_id, frist_type)
);

CREATE INDEX IF NOT EXISTS tidum_frister_active_idx ON tidum_frister (status, due_at);

CREATE TABLE IF NOT EXISTS tidum_fiks_raw_intake_log (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kommune_id             INTEGER NOT NULL REFERENCES tidum_kommuner(id),
  raw_payload_encrypted  TEXT NOT NULL,
  received_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at           TIMESTAMPTZ,
  processing_error       TEXT
);

ALTER TABLE tidum_kommuner ADD COLUMN IF NOT EXISTS fiks_konto_id TEXT;
ALTER TABLE tidum_kommuner ADD COLUMN IF NOT EXISTS fiks_private_key_encrypted TEXT;
ALTER TABLE tidum_kommuner ADD COLUMN IF NOT EXISTS fiks_certificate_pem TEXT;
ALTER TABLE tidum_kommuner ADD COLUMN IF NOT EXISTS fiks_enabled BOOLEAN NOT NULL DEFAULT FALSE;
```

- [ ] **Step 4: Registrer migrasjonen i STARTUP_MIGRATIONS**

I `server/lib/run-startup-migrations.ts`, finn arrayet `STARTUP_MIGRATIONS` (slutter med `"063_kommuner.sql",` rett før `];`). Legg til rett etter:

```ts
  "063_kommuner.sql",
  "064_barnevern_meldingsmottak.sql",
];
```

- [ ] **Step 5: Kjør migrasjonen mot dev-databasen**

Restart dev-serveren (eller kjør migrasjonsrunneren direkte om det finnes et eget script — sjekk `package.json` for et `db:migrate`-lignende script; ellers restart serveren, som kjører `runStartupMigrations()` ved oppstart).

- [ ] **Step 6: Legg til Drizzle-skjemaet i `shared/schema.ts`**

Legg til rett etter `kommuner`-eksporten (samme seksjon som `insertKommuneSchema`):

```ts
export const barnevernMeldingStatusEnum = pgEnum("tidum_barnevern_melding_status", [
  "mottatt",
  "under_avklaring",
  "henlagt",
  "sendt_til_undersokelse",
]);

export const barnevernMeldingKildeEnum = pgEnum("tidum_barnevern_melding_kilde", [
  "manuell",
  "fiks_io",
]);

export const barnevernMeldinger = pgTable("tidum_barnevern_meldinger", {
  id: uuid("id").defaultRandom().primaryKey(),
  kommuneId: integer("kommune_id").notNull().references(() => kommuner.id),
  meldingsnummer: text("meldingsnummer").notNull().unique(),
  kilde: barnevernMeldingKildeEnum("kilde").notNull().default("manuell"),
  mottattDato: timestamp("mottatt_dato", { withTimezone: true }).notNull(),
  melderKategori: text("melder_kategori").notNull(),
  melderNavn: text("melder_navn"),
  melderKontakt: text("melder_kontakt"),
  barnFodselsnummer: text("barn_fodselsnummer"),
  barnNavn: text("barn_navn"),
  beskrivelse: text("beskrivelse").notNull(),
  status: barnevernMeldingStatusEnum("status").notNull().default("mottatt"),
  tildeltSaksbehandlerId: varchar("tildelt_saksbehandler_id").references(() => users.id),
  avklaringsfrist: timestamp("avklaringsfrist", { withTimezone: true }).notNull(),
  avklartDato: timestamp("avklart_dato", { withTimezone: true }),
  avklartAvUserId: varchar("avklart_av_user_id").references(() => users.id),
  henleggelseBegrunnelse: text("henleggelse_begrunnelse"),
  fiksMeldingId: text("fiks_melding_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("tidum_barnevern_meldinger_kommune_idx").on(table.kommuneId, table.status),
]);

export type BarnevernMelding = typeof barnevernMeldinger.$inferSelect;

export const barnevernMeldingVedlegg = pgTable("tidum_barnevern_melding_vedlegg", {
  id: uuid("id").defaultRandom().primaryKey(),
  meldingId: uuid("melding_id").notNull().references(() => barnevernMeldinger.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  uploadedBy: varchar("uploaded_by").notNull().references(() => users.id),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
});

export const fristStatusEnum = pgEnum("tidum_frist_status", [
  "aktiv",
  "oppfylt",
  "brutt",
  "kansellert",
]);

export const frister = pgTable("tidum_frister", {
  id: uuid("id").defaultRandom().primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  kommuneId: integer("kommune_id").references(() => kommuner.id),
  vendorId: varchar("vendor_id").references(() => vendors.id), // vendors.id er varchar/UUID i live DB, IKKE integer (avvik fra shared/schema.ts:474 sin serial()-erklæring — verifisert av Task 1-implementøren, se ledger)
  fristType: text("frist_type").notNull(),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  status: fristStatusEnum("status").notNull().default("aktiv"),
  varsletOffsets: integer("varslet_offsets").array().notNull().default(sql`'{}'::integer[]`),
  notifyUserId: varchar("notify_user_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("tidum_frister_active_idx").on(table.status, table.dueAt),
  uniqueIndex("tidum_frister_entity_type_key").on(table.entityType, table.entityId, table.fristType),
]);

export type Frist = typeof frister.$inferSelect;

export const fiksRawIntakeLog = pgTable("tidum_fiks_raw_intake_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  kommuneId: integer("kommune_id").notNull().references(() => kommuner.id),
  rawPayloadEncrypted: text("raw_payload_encrypted").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  processingError: text("processing_error"),
});
```

Sjekk toppen av `shared/schema.ts` for eksisterende imports fra `drizzle-orm/pg-core` — `pgEnum`, `uuid`, `uniqueIndex`, `index` er allerede i bruk andre steder i filen (se `sakerStatusEnum`/`rapportStatusEnum`, `kommuner`); legg kun til import for typer som faktisk mangler.

- [ ] **Step 7: Kjør testen på nytt, bekreft at den passerer**

Run: `DATABASE_URL=$(grep '^DATABASE_URL=' .env | cut -d= -f2-) npx vitest run server/lib/__tests__/barnevern-meldingsmottak-schema.test.ts`
Expected: PASS, alle 5 tester grønne.

- [ ] **Step 8: Commit**

```bash
git add migrations/064_barnevern_meldingsmottak.sql shared/schema.ts server/lib/run-startup-migrations.ts server/lib/__tests__/barnevern-meldingsmottak-schema.test.ts
git commit -m "feat: datamodell for barnevern meldingsmottak (delprosjekt 2, task 1)"
```

---

### Task 2: Generisk fristmotor

**Files:**
- Create: `server/lib/frist-engine.ts`
- Create: `server/routes/frist-escalation-cron.ts`
- Modify: `server/routes.ts` (monter cron-rutene + start cron)
- Test: `server/lib/__tests__/frist-engine.test.ts`

**Interfaces:**
- Consumes: `frister`-tabellen fra Task 1 (`shared/schema.ts`), `createNotification` fra `server/routes/notification-routes.ts` (signatur: `{ userId, type, title, message, link?, metadata?, createdBy? } => Promise<void>`, svelger ALDRI feil internt).
- Produces: `registerFrist(params): Promise<void>`, `cancelFrist(entityType, entityId, fristType): Promise<void>`, `runFristEscalations(now?): Promise<{ notified: number; expired: number }>`, `FRIST_TYPE_CONFIG: Record<string, { escalationOffsetDays: number[] }>` fra `server/lib/frist-engine.ts` — Task 3 importerer `registerFrist`/`cancelFrist`.

- [ ] **Step 1: Skriv failende tester for `frist-engine.ts`**

```ts
// server/lib/__tests__/frist-engine.test.ts
import { describe, it, expect, afterEach, vi } from "vitest";
import { pool } from "../../db";
import { registerFrist, cancelFrist, runFristEscalations } from "../frist-engine";
import * as notificationRoutes from "../../routes/notification-routes";

describe("frist-engine", () => {
  const cleanupEntityIds: string[] = [];

  afterEach(async () => {
    for (const id of cleanupEntityIds.splice(0)) {
      await pool.query(`DELETE FROM tidum_frister WHERE entity_id = $1`, [id]);
    }
    vi.restoreAllMocks();
  });

  it("registerFrist oppretter en aktiv rad", async () => {
    const entityId = `test-${Date.now()}`;
    cleanupEntityIds.push(entityId);
    await registerFrist({
      entityType: "test_entity",
      entityId,
      kommuneId: undefined,
      fristType: "avklaring",
      dueAt: new Date(Date.now() + 7 * 86400000),
    });
    const { rows } = await pool.query(
      `SELECT status FROM tidum_frister WHERE entity_type = 'test_entity' AND entity_id = $1`,
      [entityId],
    );
    expect(rows[0].status).toBe("aktiv");
  });

  it("cancelFrist setter status til kansellert", async () => {
    const entityId = `test-${Date.now()}`;
    cleanupEntityIds.push(entityId);
    await registerFrist({ entityType: "test_entity", entityId, fristType: "avklaring", dueAt: new Date() });
    await cancelFrist("test_entity", entityId, "avklaring");
    const { rows } = await pool.query(
      `SELECT status FROM tidum_frister WHERE entity_type = 'test_entity' AND entity_id = $1`,
      [entityId],
    );
    expect(rows[0].status).toBe("kansellert");
  });

  it("runFristEscalations varsler ved offset 0 (på forfallsdagen) for fristType 'avklaring', ikke to ganger", async () => {
    const entityId = `test-${Date.now()}`;
    cleanupEntityIds.push(entityId);
    const createSpy = vi.spyOn(notificationRoutes, "createNotification").mockResolvedValue(undefined);
    const dueAt = new Date();
    await registerFrist({
      entityType: "test_entity",
      entityId,
      fristType: "avklaring",
      dueAt,
      notifyUserId: "test-user-1",
    });

    const first = await runFristEscalations(dueAt);
    expect(first.notified).toBeGreaterThanOrEqual(1);
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "test-user-1", type: "frist_eskalering" }),
    );

    const callCountAfterFirst = createSpy.mock.calls.length;
    await runFristEscalations(dueAt);
    expect(createSpy.mock.calls.length).toBe(callCountAfterFirst); // ingen ny varsling samme offset
  });

  it("runFristEscalations rører ALDRI status (kun domenekoden avgjør oppfylt/brutt)", async () => {
    const entityId = `test-${Date.now()}`;
    cleanupEntityIds.push(entityId);
    vi.spyOn(notificationRoutes, "createNotification").mockResolvedValue(undefined);
    const overdue = new Date(Date.now() - 10 * 86400000);
    await registerFrist({ entityType: "test_entity", entityId, fristType: "avklaring", dueAt: overdue });
    await runFristEscalations();
    const { rows } = await pool.query(
      `SELECT status FROM tidum_frister WHERE entity_type = 'test_entity' AND entity_id = $1`,
      [entityId],
    );
    expect(rows[0].status).toBe("aktiv");
  });

  it("en sterkt oversittet frist får ALLE 4 eskaleringsterskler i én kjøring (-2, 0, 1, 3)", async () => {
    const entityId = `test-${Date.now()}`;
    cleanupEntityIds.push(entityId);
    const createSpy = vi.spyOn(notificationRoutes, "createNotification").mockResolvedValue(undefined);
    const dueAt = new Date(Date.now() - 10 * 86400000); // 10 dager oversittet — alle 4 offsets ligger i fortiden
    await registerFrist({
      entityType: "test_entity",
      entityId,
      fristType: "avklaring",
      dueAt,
      notifyUserId: "test-user-2",
    });

    const result = await runFristEscalations();
    expect(result.notified).toBeGreaterThanOrEqual(4);
    expect(createSpy).toHaveBeenCalledTimes(4);

    const { rows } = await pool.query(
      `SELECT varslet_offsets FROM tidum_frister WHERE entity_type = 'test_entity' AND entity_id = $1`,
      [entityId],
    );
    expect(rows[0].varslet_offsets.sort((a: number, b: number) => a - b)).toEqual([-2, 0, 1, 3]);
  });
});
```

- [ ] **Step 2: Kjør testen, bekreft at den feiler**

Run: `DATABASE_URL=$(grep '^DATABASE_URL=' .env | cut -d= -f2-) npx vitest run server/lib/__tests__/frist-engine.test.ts`
Expected: FAIL — `Cannot find module '../frist-engine'`.

- [ ] **Step 3: Implementer `server/lib/frist-engine.ts`**

```ts
import { pool } from "../db";
import { createNotification } from "../routes/notification-routes";

export const FRIST_TYPE_CONFIG: Record<string, { escalationOffsetDays: number[] }> = {
  avklaring: { escalationOffsetDays: [-2, 0, 1, 3] },
};

export async function registerFrist(params: {
  entityType: string;
  entityId: string;
  kommuneId?: number;
  vendorId?: string; // vendors.id er varchar/UUID i live DB (avvik fra shared/schema.ts:474 sin serial()-erklæring — se Task 1-ruling i ledger), IKKE number
  fristType: string;
  dueAt: Date;
  notifyUserId?: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO tidum_frister (entity_type, entity_id, kommune_id, vendor_id, frist_type, due_at, notify_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (entity_type, entity_id, frist_type)
     DO UPDATE SET due_at = EXCLUDED.due_at, notify_user_id = EXCLUDED.notify_user_id,
       status = 'aktiv', varslet_offsets = '{}', updated_at = NOW()`,
    [
      params.entityType,
      params.entityId,
      params.kommuneId ?? null,
      params.vendorId ?? null,
      params.fristType,
      params.dueAt,
      params.notifyUserId ?? null,
    ],
  );
}

export async function cancelFrist(entityType: string, entityId: string, fristType: string): Promise<void> {
  await pool.query(
    `UPDATE tidum_frister SET status = 'kansellert', updated_at = NOW()
     WHERE entity_type = $1 AND entity_id = $2 AND frist_type = $3 AND status = 'aktiv'`,
    [entityType, entityId, fristType],
  );
}

export async function runFristEscalations(now: Date = new Date()): Promise<{ notified: number; expired: number }> {
  const { rows } = await pool.query(
    `SELECT id, entity_type, entity_id, frist_type, due_at, varslet_offsets, notify_user_id
     FROM tidum_frister WHERE status = 'aktiv'`,
  );

  let notified = 0;
  let expired = 0;

  for (const row of rows) {
    const config = FRIST_TYPE_CONFIG[row.frist_type];
    if (!config) continue;
    if (!row.notify_user_id) continue;

    const daysDiff = Math.floor((now.getTime() - new Date(row.due_at).getTime()) / 86400000);
    const alreadySent: number[] = row.varslet_offsets || [];
    const dueOffsets = config.escalationOffsetDays.filter(
      (offset) => offset <= daysDiff && !alreadySent.includes(offset),
    );
    if (dueOffsets.length === 0) continue;

    for (const offset of dueOffsets) {
      await createNotification({
        userId: row.notify_user_id,
        type: "frist_eskalering",
        title: `Frist nærmer seg eller er oversittet (${row.frist_type})`,
        message: `Frist for ${row.entity_type} ${row.entity_id} har passert offset ${offset} dager fra forfall.`,
        metadata: { entityType: row.entity_type, entityId: row.entity_id, fristType: row.frist_type, offset },
      });
      notified += 1;
    }

    await pool.query(
      `UPDATE tidum_frister SET varslet_offsets = varslet_offsets || $1::integer[], updated_at = NOW() WHERE id = $2`,
      [dueOffsets, row.id],
    );
    if (daysDiff > 0) expired += 1;
  }

  return { notified, expired };
}
```

- [ ] **Step 4: Kjør testen på nytt, bekreft at den passerer**

Run: `DATABASE_URL=$(grep '^DATABASE_URL=' .env | cut -d= -f2-) npx vitest run server/lib/__tests__/frist-engine.test.ts`
Expected: PASS, alle 5 tester grønne.

- [ ] **Step 5: Skriv `server/routes/frist-escalation-cron.ts`, speiler `server/routes/task-escalation-cron.ts` sin struktur**

```ts
import type { Express, Request, Response } from "express";
import cron from "node-cron";
import { requireAuth } from "../middleware/auth";
import { runFristEscalations } from "../lib/frist-engine";

function isSuperAdmin(req: Request): boolean {
  const user = (req as any).authUser ?? (req as any).user;
  return user?.role === "super_admin";
}

let cronStarted = false;

export function setupFristEscalationCron(): void {
  if (cronStarted) return;
  cronStarted = true;
  cron.schedule("0 8 * * *", async () => {
    try {
      const result = await runFristEscalations();
      console.log(`[frist-escalation-cron] notified=${result.notified} expired=${result.expired}`);
    } catch (err) {
      console.error("[frist-escalation-cron] feilet:", err);
    }
  });
}

export function registerFristEscalationRoutes(app: Express): void {
  app.post("/api/admin/frist-escalation/run", requireAuth, async (req: Request, res: Response) => {
    if (!isSuperAdmin(req)) {
      return res.status(403).json({ error: "Kun super_admin kan trigge manuelt." });
    }
    try {
      const result = await runFristEscalations();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}
```

- [ ] **Step 6: Monter cron-rutene i `server/routes.ts`**

Følg det eksakte importmønsteret fra `task-escalation-cron.ts` (`server/routes.ts:16`). Legg til rett under den linjen:

```ts
import { registerFristEscalationRoutes, setupFristEscalationCron } from "./routes/frist-escalation-cron";
```

Finn stedet hvor `setupTaskEscalationCron()` og tilhørende `registerTaskEscalationRoutes(app)` kalles (samme mønster som `registerNotificationRoutes(app)` ved `server/routes.ts:6670`), legg til rett etter:

```ts
registerFristEscalationRoutes(app);
setupFristEscalationCron();
```

- [ ] **Step 7: Kjør hele testsuiten for filene denne oppgaven rørte, bekreft ingen regresjon**

Run: `DATABASE_URL=$(grep '^DATABASE_URL=' .env | cut -d= -f2-) npx vitest run server/lib/__tests__/frist-engine.test.ts server/lib/__tests__/barnevern-meldingsmottak-schema.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add server/lib/frist-engine.ts server/routes/frist-escalation-cron.ts server/routes.ts server/lib/__tests__/frist-engine.test.ts
git commit -m "feat: generisk fristmotor med eskalerende varsler (delprosjekt 2, task 2)"
```

---

### Task 3: Meldingsmottak-ruter — opprett, liste, detalj, tildel, henlegg, send-til-undersøkelse

**Files:**
- Create: `server/routes/barnevern-melding-routes.ts`
- Modify: `server/routes.ts` (monter ruten)
- Test: `server/lib/__tests__/barnevern-melding-routes.test.ts`

**Interfaces:**
- Consumes: `barnevernMeldinger` fra `shared/schema.ts` (Task 1), `registerFrist`/`cancelFrist` fra `server/lib/frist-engine.ts` (Task 2), `isKommuneRole`/`normalizeRole` fra `shared/roles.ts` (delprosjekt 1, allerede finnes).
- Produces: `registerBarnevernMeldingRoutes(app: Express): void` — Task 4 utvider SAMME fil med vedleggsruter.

- [ ] **Step 1: Skriv failende ruter-tester**

```ts
// server/lib/__tests__/barnevern-melding-routes.test.ts
import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import http from "http";
import { pool } from "../../db";

describe("Barnevern meldingsmottak-ruter", () => {
  const cleanupKommuneIds: number[] = [];
  const cleanupMeldingIds: string[] = [];

  afterEach(async () => {
    for (const id of cleanupMeldingIds.splice(0)) {
      await pool.query(`DELETE FROM tidum_frister WHERE entity_id = $1`, [id]);
      await pool.query(`DELETE FROM tidum_barnevern_meldinger WHERE id = $1`, [id]);
    }
    for (const id of cleanupKommuneIds.splice(0)) {
      await pool.query(`DELETE FROM tidum_kommuner WHERE id = $1`, [id]);
    }
  });

  async function insertTestKommune(): Promise<number> {
    const { rows: [row] } = await pool.query(
      `INSERT INTO tidum_kommuner (navn, org_nummer, kommunenummer) VALUES ($1, $2, '9999') RETURNING id`,
      [`Testkommune ${Date.now()}`, `${900000000 + Math.floor(Math.random() * 99999999)}`],
    );
    cleanupKommuneIds.push(row.id);
    return row.id;
  }

  async function appWithUser(user: { id: string; role: string; kommuneId?: number }) {
    const { registerRoutes } = await import("../../routes");
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.user = user;
      req.isAuthenticated = () => true;
      next();
    });
    await registerRoutes(http.createServer(), app);
    return app;
  }

  it("kommune_saksbehandler kan opprette en manuell melding, avklaringsfrist beregnes til +7 dager", async () => {
    const kommuneId = await insertTestKommune();
    const app = await appWithUser({ id: "test-saksbehandler-1", role: "kommune_saksbehandler", kommuneId });

    const res = await request(app).post("/api/barnevern/meldinger").send({
      melderKategori: "skole",
      beskrivelse: "Bekymring for barnets skolefravær.",
    });

    expect(res.status).toBe(201);
    cleanupMeldingIds.push(res.body.id);
    expect(res.body.status).toBe("mottatt");
    expect(res.body.meldingsnummer).toMatch(/^BVM-9999-/);
    const dueAt = new Date(res.body.avklaringsfrist).getTime();
    const expected = Date.now() + 7 * 86400000;
    expect(Math.abs(dueAt - expected)).toBeLessThan(60_000);
  });

  it("aktør i kommune A kan IKKE se en melding i kommune B (404, ikke 403)", async () => {
    const kommuneA = await insertTestKommune();
    const kommuneB = await insertTestKommune();
    const appA = await appWithUser({ id: "user-a", role: "kommune_saksbehandler", kommuneId: kommuneA });
    const created = await request(appA).post("/api/barnevern/meldinger").send({
      melderKategori: "anonym",
      beskrivelse: "Test på tvers av kommuner.",
    });
    cleanupMeldingIds.push(created.body.id);

    const appB = await appWithUser({ id: "user-b", role: "kommune_saksbehandler", kommuneId: kommuneB });
    const res = await request(appB).get(`/api/barnevern/meldinger/${created.body.id}`);
    expect(res.status).toBe(404);
  });

  it("GET /api/barnevern/meldinger lister kun egen kommunes meldinger", async () => {
    const kommuneA = await insertTestKommune();
    const kommuneB = await insertTestKommune();
    const appA = await appWithUser({ id: "user-a2", role: "kommune_saksbehandler", kommuneId: kommuneA });
    const appB = await appWithUser({ id: "user-b2", role: "kommune_saksbehandler", kommuneId: kommuneB });
    const inA = await request(appA).post("/api/barnevern/meldinger").send({ melderKategori: "politi", beskrivelse: "A" });
    const inB = await request(appB).post("/api/barnevern/meldinger").send({ melderKategori: "politi", beskrivelse: "B" });
    cleanupMeldingIds.push(inA.body.id, inB.body.id);

    const listA = await request(appA).get("/api/barnevern/meldinger");
    expect(listA.body.find((m: any) => m.id === inA.body.id)).toBeDefined();
    expect(listA.body.find((m: any) => m.id === inB.body.id)).toBeUndefined();
  });

  it("PATCH .../tildel: barnevernsleder kan tildele, status går fra mottatt til under_avklaring", async () => {
    const kommuneId = await insertTestKommune();
    const saksbehandlerApp = await appWithUser({ id: "sb-1", role: "kommune_saksbehandler", kommuneId });
    const created = await request(saksbehandlerApp).post("/api/barnevern/meldinger").send({
      melderKategori: "lege", beskrivelse: "Test tildeling",
    });
    cleanupMeldingIds.push(created.body.id);

    const lederApp = await appWithUser({ id: "leder-1", role: "barnevernsleder", kommuneId });
    const res = await request(lederApp)
      .patch(`/api/barnevern/meldinger/${created.body.id}/tildel`)
      .send({ tildeltSaksbehandlerId: "sb-1" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("under_avklaring");
    expect(res.body.tildeltSaksbehandlerId).toBe("sb-1");
  });

  it("kommune_saksbehandler kan IKKE tildele (kun barnevernsleder)", async () => {
    const kommuneId = await insertTestKommune();
    const app = await appWithUser({ id: "sb-2", role: "kommune_saksbehandler", kommuneId });
    const created = await request(app).post("/api/barnevern/meldinger").send({
      melderKategori: "nav", beskrivelse: "Test",
    });
    cleanupMeldingIds.push(created.body.id);

    const res = await request(app)
      .patch(`/api/barnevern/meldinger/${created.body.id}/tildel`)
      .send({ tildeltSaksbehandlerId: "sb-2" });
    expect(res.status).toBe(403);
  });

  it("henlegg krever begrunnelse (400 uten), setter status+avklartDato ved suksess, kansellerer fristen", async () => {
    const kommuneId = await insertTestKommune();
    const app = await appWithUser({ id: "sb-3", role: "kommune_saksbehandler", kommuneId });
    const created = await request(app).post("/api/barnevern/meldinger").send({
      melderKategori: "familie_nabo", beskrivelse: "Test henleggelse",
    });
    cleanupMeldingIds.push(created.body.id);

    const missing = await request(app).post(`/api/barnevern/meldinger/${created.body.id}/henlegg`).send({});
    expect(missing.status).toBe(400);

    const res = await request(app)
      .post(`/api/barnevern/meldinger/${created.body.id}/henlegg`)
      .send({ begrunnelse: "Ikke grunnlag for videre oppfølging." });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("henlagt");
    expect(res.body.avklartDato).toBeDefined();

    const { rows } = await pool.query(
      `SELECT status FROM tidum_frister WHERE entity_type = 'barnevern_melding' AND entity_id = $1`,
      [created.body.id],
    );
    expect(rows[0].status).toBe("kansellert");
  });

  it("avviser opprettelse med ugyldig melderKategori (400)", async () => {
    const kommuneId = await insertTestKommune();
    const app = await appWithUser({ id: "sb-5", role: "kommune_saksbehandler", kommuneId });
    const res = await request(app).post("/api/barnevern/meldinger").send({
      melderKategori: "ikke-en-gyldig-kategori",
      beskrivelse: "Test",
    });
    expect(res.status).toBe(400);
  });

  it("avviser opprettelse med ugyldig barnFodselsnummer-format (400)", async () => {
    const kommuneId = await insertTestKommune();
    const app = await appWithUser({ id: "sb-6", role: "kommune_saksbehandler", kommuneId });
    const res = await request(app).post("/api/barnevern/meldinger").send({
      melderKategori: "skole",
      beskrivelse: "Test",
      barnFodselsnummer: "123", // ikke 11 siffer
    });
    expect(res.status).toBe(400);
  });

  it("send-til-undersokelse setter riktig status og kansellerer fristen", async () => {
    const kommuneId = await insertTestKommune();
    const app = await appWithUser({ id: "sb-4", role: "kommune_saksbehandler", kommuneId });
    const created = await request(app).post("/api/barnevern/meldinger").send({
      melderKategori: "helsepersonell", beskrivelse: "Test videresending",
    });
    cleanupMeldingIds.push(created.body.id);

    const res = await request(app).post(`/api/barnevern/meldinger/${created.body.id}/send-til-undersokelse`).send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("sendt_til_undersokelse");
  });
});
```

- [ ] **Step 2: Kjør testen, bekreft at den feiler**

Run: `DATABASE_URL=$(grep '^DATABASE_URL=' .env | cut -d= -f2-) npx vitest run server/lib/__tests__/barnevern-melding-routes.test.ts`
Expected: FAIL — 404 på alle ruter (ikke registrert ennå) eller import-feil.

- [ ] **Step 3: Implementer `server/routes/barnevern-melding-routes.ts`**

```ts
import type { Express, Request, Response } from "express";
import { pool } from "../db";
import { isKommuneRole, normalizeRole } from "../../shared/roles";
import { registerFrist, cancelFrist } from "../lib/frist-engine";

const MELDER_KATEGORIER = new Set([
  "skole", "barnehage", "helsepersonell", "politi", "nav", "familie_nabo", "anonym", "annet",
]);

interface KommuneActor {
  userId: string;
  role: string;
  kommuneId: number;
}

function requireKommuneActor(req: Request): KommuneActor | null {
  const user = (req as any).user;
  const role = normalizeRole(user?.role);
  const kommuneId = user?.kommuneId;
  if (!user?.id || !isKommuneRole(role) || kommuneId == null) return null;
  return { userId: user.id, role, kommuneId };
}

async function nextMeldingsnummer(kommunenummer: string | null): Promise<string> {
  const { rows: [row] } = await pool.query(`SELECT nextval('tidum_barnevern_meldingsnummer_seq') AS n`);
  return `BVM-${kommunenummer ?? "UKJENT"}-${row.n}`;
}

async function loadMeldingScoped(id: string, kommuneId: number) {
  const { rows } = await pool.query(
    `SELECT * FROM tidum_barnevern_meldinger WHERE id = $1 AND kommune_id = $2`,
    [id, kommuneId],
  );
  return rows[0] ?? null;
}

function toApiShape(row: any) {
  return {
    id: row.id,
    kommuneId: row.kommune_id,
    meldingsnummer: row.meldingsnummer,
    kilde: row.kilde,
    mottattDato: row.mottatt_dato,
    melderKategori: row.melder_kategori,
    melderNavn: row.melder_navn,
    melderKontakt: row.melder_kontakt,
    barnFodselsnummer: row.barn_fodselsnummer,
    barnNavn: row.barn_navn,
    beskrivelse: row.beskrivelse,
    status: row.status,
    tildeltSaksbehandlerId: row.tildelt_saksbehandler_id,
    avklaringsfrist: row.avklaringsfrist,
    avklartDato: row.avklart_dato,
    avklartAvUserId: row.avklart_av_user_id,
    henleggelseBegrunnelse: row.henleggelse_begrunnelse,
  };
}

export function registerBarnevernMeldingRoutes(app: Express): void {
  app.post("/api/barnevern/meldinger", async (req: Request, res: Response) => {
    const actor = requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });

    const { melderKategori, melderNavn, melderKontakt, barnFodselsnummer, barnNavn, beskrivelse } = req.body;
    if (!melderKategori || !MELDER_KATEGORIER.has(melderKategori)) {
      return res.status(400).json({ error: "Ugyldig melderKategori." });
    }
    if (!beskrivelse || typeof beskrivelse !== "string") {
      return res.status(400).json({ error: "beskrivelse er påkrevd." });
    }
    if (barnFodselsnummer && !/^\d{11}$/.test(barnFodselsnummer)) {
      return res.status(400).json({ error: "barnFodselsnummer må være 11 siffer." });
    }

    try {
      const { rows: [kommune] } = await pool.query(
        `SELECT kommunenummer FROM tidum_kommuner WHERE id = $1`,
        [actor.kommuneId],
      );
      const meldingsnummer = await nextMeldingsnummer(kommune?.kommunenummer ?? null);
      const mottattDato = new Date();
      const avklaringsfrist = new Date(mottattDato.getTime() + 7 * 86400000);

      const { rows: [row] } = await pool.query(
        `INSERT INTO tidum_barnevern_meldinger
           (kommune_id, meldingsnummer, kilde, mottatt_dato, melder_kategori, melder_navn, melder_kontakt,
            barn_fodselsnummer, barn_navn, beskrivelse, avklaringsfrist)
         VALUES ($1, $2, 'manuell', $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          actor.kommuneId, meldingsnummer, mottattDato, melderKategori,
          melderNavn ?? null, melderKontakt ?? null, barnFodselsnummer ?? null, barnNavn ?? null,
          beskrivelse, avklaringsfrist,
        ],
      );

      await registerFrist({
        entityType: "barnevern_melding",
        entityId: row.id,
        kommuneId: actor.kommuneId,
        fristType: "avklaring",
        dueAt: avklaringsfrist,
      });

      res.status(201).json(toApiShape(row));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/barnevern/meldinger", async (req: Request, res: Response) => {
    const actor = requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });

    try {
      const status = typeof req.query.status === "string" ? req.query.status : null;
      const { rows } = status
        ? await pool.query(
            `SELECT * FROM tidum_barnevern_meldinger WHERE kommune_id = $1 AND status = $2 ORDER BY created_at DESC`,
            [actor.kommuneId, status],
          )
        : await pool.query(
            `SELECT * FROM tidum_barnevern_meldinger WHERE kommune_id = $1 ORDER BY created_at DESC`,
            [actor.kommuneId],
          );
      res.json(rows.map(toApiShape));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/barnevern/meldinger/:id", async (req: Request, res: Response) => {
    const actor = requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });

    const row = await loadMeldingScoped(req.params.id, actor.kommuneId);
    if (!row) return res.status(404).json({ error: "Melding ikke funnet." });
    res.json(toApiShape(row));
  });

  app.patch("/api/barnevern/meldinger/:id/tildel", async (req: Request, res: Response) => {
    const actor = requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });
    if (actor.role !== "barnevernsleder") {
      return res.status(403).json({ error: "Kun barnevernsleder kan tildele." });
    }

    const existing = await loadMeldingScoped(req.params.id, actor.kommuneId);
    if (!existing) return res.status(404).json({ error: "Melding ikke funnet." });

    const { tildeltSaksbehandlerId } = req.body;
    if (!tildeltSaksbehandlerId) return res.status(400).json({ error: "tildeltSaksbehandlerId er påkrevd." });

    const newStatus = existing.status === "mottatt" ? "under_avklaring" : existing.status;
    try {
      const { rows: [row] } = await pool.query(
        `UPDATE tidum_barnevern_meldinger SET tildelt_saksbehandler_id = $1, status = $2, updated_at = NOW()
         WHERE id = $3 AND kommune_id = $4 RETURNING *`,
        [tildeltSaksbehandlerId, newStatus, req.params.id, actor.kommuneId],
      );
      await pool.query(
        `UPDATE tidum_frister SET notify_user_id = $1, updated_at = NOW()
         WHERE entity_type = 'barnevern_melding' AND entity_id = $2 AND status = 'aktiv'`,
        [tildeltSaksbehandlerId, req.params.id],
      );
      res.json(toApiShape(row));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/barnevern/meldinger/:id/henlegg", async (req: Request, res: Response) => {
    const actor = requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });

    const existing = await loadMeldingScoped(req.params.id, actor.kommuneId);
    if (!existing) return res.status(404).json({ error: "Melding ikke funnet." });

    const { begrunnelse } = req.body;
    if (!begrunnelse || typeof begrunnelse !== "string" || begrunnelse.trim().length === 0) {
      return res.status(400).json({ error: "begrunnelse er påkrevd for henleggelse." });
    }

    try {
      const { rows: [row] } = await pool.query(
        `UPDATE tidum_barnevern_meldinger
         SET status = 'henlagt', henleggelse_begrunnelse = $1, avklart_dato = NOW(), avklart_av_user_id = $2, updated_at = NOW()
         WHERE id = $3 AND kommune_id = $4 RETURNING *`,
        [begrunnelse, actor.userId, req.params.id, actor.kommuneId],
      );
      await cancelFrist("barnevern_melding", req.params.id, "avklaring");
      res.json(toApiShape(row));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/barnevern/meldinger/:id/send-til-undersokelse", async (req: Request, res: Response) => {
    const actor = requireKommuneActor(req);
    if (!actor) return res.status(403).json({ error: "Ikke tilgang." });

    const existing = await loadMeldingScoped(req.params.id, actor.kommuneId);
    if (!existing) return res.status(404).json({ error: "Melding ikke funnet." });

    try {
      const { rows: [row] } = await pool.query(
        `UPDATE tidum_barnevern_meldinger
         SET status = 'sendt_til_undersokelse', avklart_dato = NOW(), avklart_av_user_id = $1, updated_at = NOW()
         WHERE id = $2 AND kommune_id = $3 RETURNING *`,
        [actor.userId, req.params.id, actor.kommuneId],
      );
      await cancelFrist("barnevern_melding", req.params.id, "avklaring");
      res.json(toApiShape(row));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}
```

- [ ] **Step 4: Monter ruten i `server/routes.ts`**

Legg til import rett under `frist-escalation-cron`-importen fra Task 2:

```ts
import { registerBarnevernMeldingRoutes } from "./routes/barnevern-melding-routes";
```

Legg til kallet rett etter `registerFristEscalationRoutes(app);`:

```ts
registerBarnevernMeldingRoutes(app);
```

- [ ] **Step 5: Kjør testen på nytt, bekreft at den passerer**

Run: `DATABASE_URL=$(grep '^DATABASE_URL=' .env | cut -d= -f2-) npx vitest run server/lib/__tests__/barnevern-melding-routes.test.ts`
Expected: PASS, alle 9 tester grønne.

- [ ] **Step 6: Commit**

```bash
git add server/routes/barnevern-melding-routes.ts server/routes.ts server/lib/__tests__/barnevern-melding-routes.test.ts
git commit -m "feat: meldingsmottak-ruter (opprett/liste/detalj/tildel/henlegg/send-til-undersokelse) (delprosjekt 2, task 3)"
```

---

### Task 4: Vedlegg — opplasting og nedlasting

**Files:**
- Modify: `server/routes/barnevern-melding-routes.ts` (legg til vedleggsruter i samme fil, samme `registerBarnevernMeldingRoutes`-funksjon)
- Test: `server/lib/__tests__/barnevern-melding-vedlegg-routes.test.ts`

**Interfaces:**
- Consumes: `loadMeldingScoped`, `requireKommuneActor` (interne helpers fra Task 3, samme fil — ingen endring i signatur).
- Produces: ingen nye eksporter (rutene er interne til `registerBarnevernMeldingRoutes`).

- [ ] **Step 1: Skriv failende tester**

```ts
// server/lib/__tests__/barnevern-melding-vedlegg-routes.test.ts
import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import http from "http";
import fs from "fs";
import path from "path";
import { pool } from "../../db";

describe("Barnevern melding-vedlegg", () => {
  const cleanupKommuneIds: number[] = [];
  const cleanupMeldingIds: string[] = [];
  const cleanupFilePaths: string[] = [];

  afterEach(async () => {
    for (const filePath of cleanupFilePaths.splice(0)) {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    for (const id of cleanupMeldingIds.splice(0)) {
      await pool.query(`DELETE FROM tidum_barnevern_melding_vedlegg WHERE melding_id = $1`, [id]);
      await pool.query(`DELETE FROM tidum_frister WHERE entity_id = $1`, [id]);
      await pool.query(`DELETE FROM tidum_barnevern_meldinger WHERE id = $1`, [id]);
    }
    for (const id of cleanupKommuneIds.splice(0)) {
      await pool.query(`DELETE FROM tidum_kommuner WHERE id = $1`, [id]);
    }
  });

  async function insertTestKommune(): Promise<number> {
    const { rows: [row] } = await pool.query(
      `INSERT INTO tidum_kommuner (navn, org_nummer, kommunenummer) VALUES ($1, $2, '9998') RETURNING id`,
      [`Testkommune ${Date.now()}`, `${900000000 + Math.floor(Math.random() * 99999999)}`],
    );
    cleanupKommuneIds.push(row.id);
    return row.id;
  }

  async function appWithUser(user: { id: string; role: string; kommuneId?: number }) {
    const { registerRoutes } = await import("../../routes");
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.user = user;
      req.isAuthenticated = () => true;
      next();
    });
    await registerRoutes(http.createServer(), app);
    return app;
  }

  it("kan laste opp og laste ned et vedlegg på egen kommunes melding", async () => {
    const kommuneId = await insertTestKommune();
    const app = await appWithUser({ id: "sb-vedlegg-1", role: "kommune_saksbehandler", kommuneId });
    const created = await request(app).post("/api/barnevern/meldinger").send({
      melderKategori: "skole", beskrivelse: "Test vedlegg",
    });
    cleanupMeldingIds.push(created.body.id);

    const upload = await request(app)
      .post(`/api/barnevern/meldinger/${created.body.id}/vedlegg`)
      .attach("file", Buffer.from("test-innhold"), "notat.pdf");
    expect(upload.status).toBe(201);
    expect(upload.body.originalName).toBe("notat.pdf");

    const download = await request(app).get(
      `/api/barnevern/meldinger/${created.body.id}/vedlegg/${upload.body.id}`,
    );
    expect(download.status).toBe(200);
    expect(download.text).toBe("test-innhold");
  });

  it("aktør i kommune B kan IKKE laste ned vedlegg fra en melding i kommune A", async () => {
    const kommuneA = await insertTestKommune();
    const kommuneB = await insertTestKommune();
    const appA = await appWithUser({ id: "sb-vedlegg-a", role: "kommune_saksbehandler", kommuneId: kommuneA });
    const created = await request(appA).post("/api/barnevern/meldinger").send({
      melderKategori: "skole", beskrivelse: "Test tverr-kommune",
    });
    cleanupMeldingIds.push(created.body.id);
    const upload = await request(appA)
      .post(`/api/barnevern/meldinger/${created.body.id}/vedlegg`)
      .attach("file", Buffer.from("hemmelig"), "hemmelig.pdf");

    const appB = await appWithUser({ id: "sb-vedlegg-b", role: "kommune_saksbehandler", kommuneId: kommuneB });
    const res = await request(appB).get(
      `/api/barnevern/meldinger/${created.body.id}/vedlegg/${upload.body.id}`,
    );
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Kjør testen, bekreft at den feiler**

Run: `DATABASE_URL=$(grep '^DATABASE_URL=' .env | cut -d= -f2-) npx vitest run server/lib/__tests__/barnevern-melding-vedlegg-routes.test.ts`
Expected: FAIL — 404 (ruten finnes ikke ennå).

- [ ] **Step 3: Legg til vedleggsruter i `server/routes/barnevern-melding-routes.ts`**

Følg multer-mønsteret fra `server/routes/leave-attachments-routes.ts` (disk-lagring, 20MB-grense, MIME-whitelist). Legg til øverst i filen, etter eksisterende imports:

```ts
import multer from "multer";
import path from "path";
import fs from "fs";

const BARNEVERN_UPLOAD_DIR = path.join(process.cwd(), "uploads", "barnevern-meldinger");
if (!fs.existsSync(BARNEVERN_UPLOAD_DIR)) fs.mkdirSync(BARNEVERN_UPLOAD_DIR, { recursive: true });

const ALLOWED_VEDLEGG_MIME = new Set([
  "application/pdf", "image/jpeg", "image/png", "image/heic", "image/heif", "image/webp",
]);

const upload = multer({
  storage: multer.diskStorage({
    destination: BARNEVERN_UPLOAD_DIR,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_VEDLEGG_MIME.has(file.mimetype)) {
      return cb(new Error("Ikke tillatt filtype."));
    }
    cb(null, true);
  },
});
```

Legg til rutene inne i `registerBarnevernMeldingRoutes`, rett før den avsluttende `}`:

```ts
  app.post(
    "/api/barnevern/meldinger/:id/vedlegg",
    upload.single("file"),
    async (req: Request, res: Response) => {
      const actor = requireKommuneActor(req);
      if (!actor) {
        if (req.file) fs.unlink(req.file.path, () => {});
        return res.status(403).json({ error: "Ikke tilgang." });
      }

      const melding = await loadMeldingScoped(req.params.id, actor.kommuneId);
      if (!melding) {
        if (req.file) fs.unlink(req.file.path, () => {});
        return res.status(404).json({ error: "Melding ikke funnet." });
      }
      if (!req.file) return res.status(400).json({ error: "Ingen fil sendt." });

      try {
        const { rows: [row] } = await pool.query(
          `INSERT INTO tidum_barnevern_melding_vedlegg
             (melding_id, filename, original_name, mime_type, size_bytes, uploaded_by)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [
            req.params.id, req.file.filename, req.file.originalname,
            req.file.mimetype, req.file.size, actor.userId,
          ],
        );
        res.status(201).json({
          id: row.id,
          filename: row.filename,
          originalName: row.original_name,
          mimeType: row.mime_type,
          sizeBytes: row.size_bytes,
          uploadedAt: row.uploaded_at,
        });
      } catch (err: any) {
        fs.unlink(req.file.path, () => {});
        res.status(500).json({ error: err.message });
      }
    },
  );

  app.get(
    "/api/barnevern/meldinger/:id/vedlegg/:vedleggId",
    async (req: Request, res: Response) => {
      const actor = requireKommuneActor(req);
      if (!actor) return res.status(403).json({ error: "Ikke tilgang." });

      const melding = await loadMeldingScoped(req.params.id, actor.kommuneId);
      if (!melding) return res.status(404).json({ error: "Melding ikke funnet." });

      const { rows: [vedlegg] } = await pool.query(
        `SELECT * FROM tidum_barnevern_melding_vedlegg WHERE id = $1 AND melding_id = $2`,
        [req.params.vedleggId, req.params.id],
      );
      if (!vedlegg) return res.status(404).json({ error: "Vedlegg ikke funnet." });

      const filePath = path.join(BARNEVERN_UPLOAD_DIR, vedlegg.filename);
      if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Fil ikke funnet på disk." });

      res.setHeader("Content-Type", vedlegg.mime_type);
      res.setHeader("Content-Disposition", `attachment; filename="${vedlegg.original_name}"`);
      fs.createReadStream(filePath).pipe(res);
    },
  );
```

- [ ] **Step 4: Kjør testen på nytt, bekreft at den passerer**

Run: `DATABASE_URL=$(grep '^DATABASE_URL=' .env | cut -d= -f2-) npx vitest run server/lib/__tests__/barnevern-melding-vedlegg-routes.test.ts`
Expected: PASS, begge tester grønne.

- [ ] **Step 5: Kjør Task 3 sine tester på nytt for å bekrefte ingen regresjon i samme fil**

Run: `DATABASE_URL=$(grep '^DATABASE_URL=' .env | cut -d= -f2-) npx vitest run server/lib/__tests__/barnevern-melding-routes.test.ts server/lib/__tests__/barnevern-melding-vedlegg-routes.test.ts`
Expected: PASS, alle 11 tester grønne.

- [ ] **Step 6: Commit**

```bash
git add server/routes/barnevern-melding-routes.ts server/lib/__tests__/barnevern-melding-vedlegg-routes.test.ts
git commit -m "feat: vedlegg-opplasting/nedlasting for barnevern-meldinger (delprosjekt 2, task 4)"
```

---

### Task 5: Fiks IO-transportlag — kun dokumenterte deler, resten logges rått

**Files:**
- Create: `server/fiks-io/maskinporten-client.ts`
- Create: `server/fiks-io/receiver.ts`
- Modify: `server/routes.ts` (kall `setupFiksIoReceiver(app)`, inert med mindre konfigurert)
- Test: `server/lib/__tests__/fiks-io-maskinporten-client.test.ts`
- Test: `server/lib/__tests__/fiks-io-receiver.test.ts`

**Interfaces:**
- Consumes: `sealSecret`/`openSecret`/`isSecretBoxConfigured` fra `server/lib/secret-box.ts`, `fiksRawIntakeLog`-tabellen fra Task 1.
- Produces: `getMaskinportenToken(kommune: { fiksKontoId, fiksPrivateKeyEncrypted, fiksCertificatePem }): Promise<string>`, `onBekymringsmeldingRaw(kommuneId, rawPayload): Promise<void>`, `setupFiksIoReceiver(app: Express): void`.

- [ ] **Step 1: Skriv failende test for Maskinporten-token-utveksling (mocket fetch, siden ingen ekte tilgang finnes)**

```ts
// server/lib/__tests__/fiks-io-maskinporten-client.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { getMaskinportenToken } from "../../fiks-io/maskinporten-client";

describe("fiks-io/maskinporten-client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("henter token fra riktig test-endepunkt med scope ks:fiks og signert JWT-assertion", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "test-token-123", expires_in: 120 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const token = await getMaskinportenToken({
      fiksKontoId: "test-konto",
      fiksPrivateKeyEncrypted: "enc:v1:dummy",
      fiksCertificatePem: "-----BEGIN CERTIFICATE-----\ndummy\n-----END CERTIFICATE-----",
    }, { testMode: true });

    expect(token).toBe("test-token-123");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://test.maskinporten.no/token",
      expect.objectContaining({ method: "POST" }),
    );
    const [, options] = fetchMock.mock.calls[0];
    expect(String(options.body)).toContain("grant_type=");
  });

  it("kaster feil hvis Maskinporten svarer med feil", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => "unauthorized" }));
    await expect(
      getMaskinportenToken({
        fiksKontoId: "test-konto",
        fiksPrivateKeyEncrypted: "enc:v1:dummy",
        fiksCertificatePem: "dummy",
      }, { testMode: true }),
    ).rejects.toThrow();
  });
});
```

```ts
// server/lib/__tests__/fiks-io-receiver.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { pool } from "../../db";
import { onBekymringsmeldingRaw } from "../../fiks-io/receiver";

describe("fiks-io/receiver: onBekymringsmeldingRaw", () => {
  const cleanupKommuneIds: number[] = [];

  afterEach(async () => {
    for (const id of cleanupKommuneIds.splice(0)) {
      await pool.query(`DELETE FROM tidum_fiks_raw_intake_log WHERE kommune_id = $1`, [id]);
      await pool.query(`DELETE FROM tidum_kommuner WHERE id = $1`, [id]);
    }
  });

  it("lagrer rå payload kryptert, uendret innhold ved dekryptering", async () => {
    const { rows: [kommune] } = await pool.query(
      `INSERT INTO tidum_kommuner (navn, org_nummer) VALUES ($1, $2) RETURNING id`,
      [`Testkommune ${Date.now()}`, `${900000000 + Math.floor(Math.random() * 99999999)}`],
    );
    cleanupKommuneIds.push(kommune.id);

    const rawPayload = { ukjentFelt: "noe fra Fiks IO vi ikke forstår ennå", nested: { a: 1 } };
    await onBekymringsmeldingRaw(kommune.id, rawPayload);

    const { rows } = await pool.query(
      `SELECT raw_payload_encrypted, processed_at FROM tidum_fiks_raw_intake_log WHERE kommune_id = $1`,
      [kommune.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].processed_at).toBeNull();
    expect(rows[0].raw_payload_encrypted).not.toContain("ukjentFelt"); // kryptert, ikke klartekst
  });
});
```

- [ ] **Step 2: Kjør testene, bekreft at de feiler**

Run: `DATABASE_URL=$(grep '^DATABASE_URL=' .env | cut -d= -f2-) npx vitest run server/lib/__tests__/fiks-io-maskinporten-client.test.ts server/lib/__tests__/fiks-io-receiver.test.ts`
Expected: FAIL — `Cannot find module '../../fiks-io/maskinporten-client'` / `'../../fiks-io/receiver'`.

- [ ] **Step 3: Implementer `server/fiks-io/maskinporten-client.ts`**

Maskinporten JWT-grant er en offentlig, dokumentert Digdir-standard (samme familie som ID-porten) — implementeres med tillit, i motsetning til resten av Fiks IO-laget.

```ts
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { openSecret } from "../lib/secret-box";

interface KommuneFiksConfig {
  fiksKontoId: string;
  fiksPrivateKeyEncrypted: string;
  fiksCertificatePem: string;
}

const MASKINPORTEN_SCOPE = "ks:fiks";

function endpointFor(testMode: boolean): string {
  return testMode ? "https://test.maskinporten.no/token" : "https://maskinporten.no/token";
}

function issuerFor(testMode: boolean): string {
  return testMode ? "https://test.maskinporten.no/" : "https://maskinporten.no/";
}

export async function getMaskinportenToken(
  config: KommuneFiksConfig,
  opts: { testMode?: boolean } = {},
): Promise<string> {
  const testMode = opts.testMode ?? process.env.NODE_ENV !== "production";
  const privateKey = openSecret(config.fiksPrivateKeyEncrypted);

  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    {
      aud: issuerFor(testMode),
      scope: MASKINPORTEN_SCOPE,
      iss: config.fiksKontoId,
      exp: now + 120,
      iat: now,
      jti: crypto.randomUUID(),
    },
    privateKey,
    { algorithm: "RS256" },
  );

  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });

  const res = await fetch(endpointFor(testMode), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Maskinporten-tokenutveksling feilet (${res.status}): ${detail}`);
  }

  const data = await res.json();
  return data.access_token;
}
```

Sjekk om `jsonwebtoken` allerede er en avhengighet (`grep '"jsonwebtoken"' package.json`) — den brukes trolig allerede for eksisterende JWT-signering i `server/smartTimingRoutes.ts` (admin-login). Gjenbruk samme pakke, ikke legg til en ny.

- [ ] **Step 4: Implementer `server/fiks-io/receiver.ts`**

```ts
import type { Express } from "express";
import { pool } from "../db";
import { sealSecret } from "../lib/secret-box";

/**
 * STUB — bekymringsmeldingens innholdsskjema er IKKE offentlig dokumentert
 * (bekreftet mot developers.fiks.ks.no og ks-no sine offisielle klient-
 * biblioteker for Java/.NET — se docs/superpowers/specs/2026-08-23-
 * barnevern-meldingsmottak-design.md § 5.4). Denne funksjonen skal ALDRI
 * gjette feltnavn. Når KS-avtale + reelt skjema foreligger: implementer
 * parsing her, prosesser tidum_fiks_raw_intake_log-rader med
 * processed_at IS NULL (de er allerede trygt lagret og venter).
 */
export async function onBekymringsmeldingRaw(kommuneId: number, rawPayload: unknown): Promise<void> {
  await pool.query(
    `INSERT INTO tidum_fiks_raw_intake_log (kommune_id, raw_payload_encrypted) VALUES ($1, $2)`,
    [kommuneId, sealSecret(JSON.stringify(rawPayload))],
  );
}

/**
 * Inert med mindre FIKS_IO_ENABLED=true OG minst én kommune har
 * fiks_enabled=true med gyldig konfigurasjon. AMQP-legitimasjons-
 * utveksling og meldingskonvoluttens feltnavn er IKKE offentlig
 * dokumentert (se spec § 5.2) — denne funksjonen etablerer derfor
 * ingen AMQP-tilkobling ennå. Speiler setupEntraIdAuth sitt
 * inaktiveringsmønster fra delprosjekt 1.
 */
export function setupFiksIoReceiver(_app: Express): void {
  if (process.env.FIKS_IO_ENABLED !== "true") {
    return;
  }
  console.warn(
    "[fiks-io] FIKS_IO_ENABLED=true, men AMQP-tilkoblingslaget er ikke implementert " +
    "(legitimasjonsutveksling og meldingskonvolutt er ikke offentlig dokumentert, se " +
    "docs/superpowers/specs/2026-08-23-barnevern-meldingsmottak-design.md § 5.2). " +
    "Maskinporten-tokenutveksling er klar (server/fiks-io/maskinporten-client.ts); " +
    "resten venter på KS-avtale.",
  );
}
```

- [ ] **Step 5: Monter i `server/routes.ts`**

```ts
import { setupFiksIoReceiver } from "./fiks-io/receiver";
```

Legg til kallet rett etter `registerBarnevernMeldingRoutes(app);` fra Task 3:

```ts
setupFiksIoReceiver(app);
```

- [ ] **Step 6: Kjør testene på nytt, bekreft at de passerer**

Run: `DATABASE_URL=$(grep '^DATABASE_URL=' .env | cut -d= -f2-) npx vitest run server/lib/__tests__/fiks-io-maskinporten-client.test.ts server/lib/__tests__/fiks-io-receiver.test.ts`
Expected: PASS, alle 3 tester grønne.

- [ ] **Step 7: Kjør `npx tsc --noEmit` og hele `server/lib/__tests__/`-mappen, bekreft ingen regresjon**

Run: `npx tsc --noEmit`
Run: `DATABASE_URL=$(grep '^DATABASE_URL=' .env | cut -d= -f2-) npx vitest run server/lib/__tests__/`
Expected: begge rene/grønne (bortsett fra evt. allerede kjente, urelaterte flaky-filer).

- [ ] **Step 8: Commit**

```bash
git add server/fiks-io/ server/routes.ts server/lib/__tests__/fiks-io-maskinporten-client.test.ts server/lib/__tests__/fiks-io-receiver.test.ts
git commit -m "feat: Fiks IO-transportlag (Maskinporten + råpayload-logging, resten stub) (delprosjekt 2, task 5)"
```
