import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { EventEmitter } from "node:events";
import pkg from "pg";
const { Pool } = pkg;

// Disse testene verifiserer to av de kritiske funnene fra formell
// task-review av Task 8:
//
// 1. `SET LOCAL ... = $1` er ugyldig Postgres-syntaks (bind-parametre er
//    ikke tillatt i SET/SET LOCAL) — set_config() må brukes i stedet.
// 2. Et nøstet `db.transaction()`-kall inni en withVendorScopedDb-request
//    (slik server/routes/leave-routes.ts gjør 4 steder) må bruke et ekte
//    SAVEPOINT, ikke et reelt COMMIT som lydløst avslutter den ytre
//    RLS-transaksjonen og dropper set_config-verdiene for resten av
//    requesten.
//
// Begge krever en ekte Postgres-tilkobling for å verifisere fullt ut (SQL
// syntax-feil og transaksjons-/savepoint-semantikk kan ikke mockes
// meningsfullt). Denne sandboxen har en ekte lokal Postgres 16 tilgjengelig
// (bekreftet: `psql -h localhost -U <os-bruker> -d postgres` kobler til med
// tillit/peer-autentisering, ingen passord). Testene kobler til DENNE
// databasen direkte via en egen, dedikert tilkoblingsstreng — IKKE via
// prosjektets DATABASE_URL (som i vitest.config.ts peker på en bevisst
// uoppnåelig placeholder-URL for resten av testpakken) — og hopper over
// seg selv (uten å feile) hvis den reelle lokale Postgres-instansen av en
// eller annen grunn ikke skulle være nåbar i miljøet testen kjører i.
const LOCAL_TEST_DB_URL = `postgres://${process.env.USER || process.env.LOGNAME || "postgres"}@localhost:5432/postgres`;

let dbReachable = false;
let probePool: InstanceType<typeof Pool> | null = null;
const savedEnv = { ...process.env };

beforeAll(async () => {
  probePool = new Pool({ connectionString: LOCAL_TEST_DB_URL, connectionTimeoutMillis: 2000 });
  try {
    const client = await probePool.connect();
    client.release();
    dbReachable = true;
  } catch {
    dbReachable = false;
  }
});

afterAll(async () => {
  await probePool?.end().catch(() => {});
  vi.resetModules();
  process.env = { ...savedEnv };
});

describe("set_config() vs. SET LOCAL (bind-parametre)", () => {
  it("SET LOCAL med bind-parameter kaster syntax error mot ekte Postgres", async () => {
    if (!dbReachable) return;
    const client = await probePool!.connect();
    try {
      await client.query("BEGIN");
      await expect(client.query("SET LOCAL app.vendor_id = $1", ["42"])).rejects.toThrow(
        /syntax error/i,
      );
    } finally {
      await client.query("ROLLBACK").catch(() => {});
      client.release();
    }
  });

  it("set_config() med bind-parameter setter en transaksjonslokal verdi korrekt", async () => {
    if (!dbReachable) return;
    const client = await probePool!.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.vendor_id', $1, true)", ["42"]);
      const { rows } = await client.query("SELECT current_setting('app.vendor_id', true) AS v");
      expect(rows[0].v).toBe("42");
    } finally {
      await client.query("ROLLBACK").catch(() => {});
      client.release();
    }
  });
});

describe("withVendorScopedDb: nøstet db.transaction() bruker SAVEPOINT", () => {
  it("bevarer den ytre transaksjonen og set_config-verdien gjennom et nøstet db.transaction()-kall", async () => {
    if (!dbReachable) return;

    vi.resetModules();
    process.env.DATABASE_URL = LOCAL_TEST_DB_URL;
    process.env.TIDUM_APP_DATABASE_URL = LOCAL_TEST_DB_URL;
    delete process.env.DATABASE_SSL;
    delete process.env.PGSSLMODE;

    const { withVendorScopedDb } = await import("../../../../server/middleware/vendor-scoped-db");
    const { db } = await import("../../../../server/db");
    const { sql } = await import("drizzle-orm");

    const req = { user: { id: "u1", vendorId: 42, role: "member" } } as any;
    const res = new EventEmitter() as any;

    let vendorIdBeforeNested: string | undefined;
    let vendorIdAfterNested: string | undefined;
    let nestedRanOnSameConnection = false;

    await new Promise<void>((resolve, reject) => {
      withVendorScopedDb(req, res, async () => {
        try {
          const before: any = await db.execute(sql`select current_setting('app.vendor_id', true) as v`);
          vendorIdBeforeNested = before.rows[0].v;

          // Nøstet db.transaction() — akkurat det server/routes/leave-routes.ts
          // gjør 4 steder i dag. Hvis dette feilaktig issuer et ekte COMMIT
          // (bugen reviewer fant), ville den ytre BEGIN-transaksjonen være
          // avsluttet her, og set_config-verdien ville enten være borte
          // (auto-commit-modus, ny implisitt transaksjon) eller lese-kallet
          // under ville feile fordi tilkoblingen havnet i en uklar tilstand.
          await db.transaction(async (tx) => {
            const inner: any = await tx.execute(sql`select current_setting('app.vendor_id', true) as v`);
            nestedRanOnSameConnection = inner.rows[0].v === "42";
          });

          const after: any = await db.execute(sql`select current_setting('app.vendor_id', true) as v`);
          vendorIdAfterNested = after.rows[0].v;

          resolve();
        } catch (err) {
          reject(err);
        } finally {
          res.emit("finish");
        }
      }).catch(reject);
    });

    expect(vendorIdBeforeNested).toBe("42");
    expect(nestedRanOnSameConnection).toBe(true);
    expect(vendorIdAfterNested).toBe("42");
  });

  it("en feilende nøstet db.transaction() ruller kun tilbake til savepointet, ikke hele den ytre transaksjonen", async () => {
    if (!dbReachable) return;

    vi.resetModules();
    process.env.DATABASE_URL = LOCAL_TEST_DB_URL;
    process.env.TIDUM_APP_DATABASE_URL = LOCAL_TEST_DB_URL;
    delete process.env.DATABASE_SSL;
    delete process.env.PGSSLMODE;

    const { withVendorScopedDb } = await import("../../../../server/middleware/vendor-scoped-db");
    const { db } = await import("../../../../server/db");
    const { sql } = await import("drizzle-orm");

    const req = { user: { id: "u2", vendorId: 7, role: "member" } } as any;
    const res = new EventEmitter() as any;

    let threw = false;
    let outerStillAliveAfterNestedFailure = false;

    await new Promise<void>((resolve, reject) => {
      withVendorScopedDb(req, res, async () => {
        try {
          try {
            await db.transaction(async () => {
              throw new Error("intentional nested failure");
            });
          } catch {
            threw = true;
          }

          // Den ytre transaksjonen/tilkoblingen skal fortsatt være i live og
          // brukbar etter at ROLLBACK TO SAVEPOINT ble kjørt for den
          // mislykkede nøstede transaksjonen.
          const after: any = await db.execute(sql`select current_setting('app.vendor_id', true) as v`);
          outerStillAliveAfterNestedFailure = after.rows[0].v === "7";
          resolve();
        } catch (err) {
          reject(err);
        } finally {
          res.emit("finish");
        }
      }).catch(reject);
    });

    expect(threw).toBe(true);
    expect(outerStillAliveAfterNestedFailure).toBe(true);
  });
});
