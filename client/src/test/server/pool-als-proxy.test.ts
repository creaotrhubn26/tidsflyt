import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import pkg from "pg";
const { Pool } = pkg;

// Task 9 fix-runde 2: den forrige versjonen av denne testen brukte en falsk
// client der `query` var en egen vi.fn()-property. Da er `this`-binding
// irrelevant, og testene passerte over en proxy som i praksis hang på HVER
// ekte spørring: `pg` sin Client muterer `this` (bl.a. `this.activeQuery`)
// under en spørring, og med `receiver` = proxy landet skrivingen på proxyens
// target (systemPool) i stedet for på clienten — spørringen forsvant fra
// clientens kø og promise-en løste aldri.
//
// Derfor kjører denne testen mot en EKTE lokal Postgres, med ekte pg-clienter,
// og hopper over seg selv (uten å feile) hvis instansen ikke er nåbar — samme
// mønster som vendor-scoped-db.test.ts.
const LOCAL_TEST_DB_URL = `postgres://${process.env.USER || process.env.LOGNAME || "postgres"}@localhost:5432/postgres`;

let dbReachable = false;
let appPool: InstanceType<typeof Pool> | null = null;
const savedEnv = { ...process.env };

beforeAll(async () => {
  appPool = new Pool({ connectionString: LOCAL_TEST_DB_URL, connectionTimeoutMillis: 2000 });
  try {
    const c = await appPool.connect();
    c.release();
    dbReachable = true;
  } catch {
    dbReachable = false;
  }
});

afterAll(async () => {
  await appPool?.end().catch(() => {});
  vi.resetModules();
  process.env = { ...savedEnv };
});

/** Laster server/db.ts mot den lokale testdatabasen, isolert per test. */
async function loadDb() {
  vi.resetModules();
  process.env.DATABASE_URL = LOCAL_TEST_DB_URL;
  process.env.TIDUM_APP_DATABASE_URL = LOCAL_TEST_DB_URL;
  const dbMod = await import("../../../../server/db");
  const ctxMod = await import("../../../../server/lib/request-db-context");
  return { pool: dbMod.pool, dbPool: dbMod.dbPool, requestDbStorage: ctxMod.requestDbStorage };
}

describe("pool-eksporten er ALS-bevisst (mot ekte Postgres)", () => {
  it("pool og dbPool er samme proxy-objekt", async () => {
    if (!dbReachable) return;
    const { pool, dbPool } = await loadDb();
    expect(dbPool).toBe(pool);
  });

  it("rå pool.query() inne i ALS-konteksten fullfører OG treffer request-clienten", async () => {
    if (!dbReachable) return;
    const { pool, requestDbStorage } = await loadDb();
    const client = await appPool!.connect();
    try {
      // Sesjonsmarkør som KUN finnes på denne ene tilkoblingen.
      await client.query("SELECT set_config('app.probe', 'request-client', false)");

      const result = await requestDbStorage.run({ db: {} as any, client }, async () => {
        // Uten riktig this-binding henger dette for alltid — derfor timeouten.
        return Promise.race([
          pool.query("SELECT current_setting('app.probe', true) AS probe"),
          new Promise((_, rej) => setTimeout(() => rej(new Error("HANG: pool.query fullførte aldri")), 3000)),
        ]) as Promise<{ rows: Array<{ probe: string }> }>;
      });

      expect(result.rows[0].probe).toBe("request-client");
    } finally {
      client.release();
    }
  }, 10000);

  it("uten ALS-kontekst går pool.query() til system-tilkoblingen, ikke til request-clienten", async () => {
    if (!dbReachable) return;
    const { pool, requestDbStorage } = await loadDb();
    const client = await appPool!.connect();
    try {
      await client.query("SELECT set_config('app.probe', 'request-client', false)");
      expect(requestDbStorage.getStore()).toBeUndefined();
      const { rows } = await pool.query("SELECT current_setting('app.probe', true) AS probe");
      // Systemtilkoblingen har aldri sett markøren.
      expect(rows[0].probe).not.toBe("request-client");
    } finally {
      client.release();
    }
  }, 10000);

  it("requestDbStorage.exit() sender pool tilbake til system-tilkoblingen", async () => {
    if (!dbReachable) return;
    const { pool, requestDbStorage } = await loadDb();
    const client = await appPool!.connect();
    try {
      await client.query("SELECT set_config('app.probe', 'request-client', false)");
      const probe = await requestDbStorage.run({ db: {} as any, client }, async () =>
        requestDbStorage.exit(async () => {
          const { rows } = await pool.query("SELECT current_setting('app.probe', true) AS probe");
          return rows[0].probe;
        }),
      );
      expect(probe).not.toBe("request-client");
    } finally {
      client.release();
    }
  }, 10000);

  it("DDL rutes til system-tilkoblingen selv inne i ALS-konteksten", async () => {
    if (!dbReachable) return;
    const { pool, requestDbStorage } = await loadDb();
    const client = await appPool!.connect();
    try {
      // Åpen transaksjon på request-clienten, som middlewaren ville hatt.
      await client.query("BEGIN");
      await requestDbStorage.run({ db: {} as any, client }, async () => {
        await pool.query("CREATE TABLE IF NOT EXISTS tidum_ddl_probe (id INT)");
      });
      // Rull tilbake request-transaksjonen: hadde DDL-en kjørt PÅ den, ville
      // tabellen forsvunnet her. Den skal overleve, fordi den gikk på systemet.
      await client.query("ROLLBACK");

      const { rows } = await pool.query("SELECT to_regclass('public.tidum_ddl_probe') AS t");
      expect(rows[0].t).toBe("tidum_ddl_probe");
    } finally {
      await pool.query("DROP TABLE IF EXISTS tidum_ddl_probe").catch(() => {});
      client.release();
    }
  }, 10000);
});

describe("pool.connect() inne i en request ødelegger ikke den ytre transaksjonen", () => {
  it("oversetter BEGIN/COMMIT til SAVEPOINT og lar den ytre transaksjonen leve videre", async () => {
    if (!dbReachable) return;
    const { pool, requestDbStorage } = await loadDb();
    const client = await appPool!.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.vendor_id', '42', true)"); // transaksjonslokal!

      await requestDbStorage.run({ db: {} as any, client }, async () => {
        const c = await pool.connect();
        await c.query("BEGIN");
        await c.query("SELECT 1");
        await c.query("COMMIT");
        c.release();
      });

      // Et ekte COMMIT ville avsluttet den ytre transaksjonen og dermed
      // nullstilt den transaksjonslokale vendor_id-en. Den skal fortsatt stå.
      const { rows } = await client.query("SELECT current_setting('app.vendor_id', true) AS v");
      expect(rows[0].v).toBe("42");
    } finally {
      await client.query("ROLLBACK").catch(() => {});
      client.release();
    }
  }, 10000);

  it("ROLLBACK ruller kun tilbake til savepointet, ikke hele requesten", async () => {
    if (!dbReachable) return;
    const { pool, requestDbStorage } = await loadDb();
    const client = await appPool!.connect();
    try {
      await client.query("BEGIN");
      await client.query("CREATE TEMP TABLE t_sp (n INT) ON COMMIT DROP");
      await client.query("INSERT INTO t_sp VALUES (1)");

      await requestDbStorage.run({ db: {} as any, client }, async () => {
        const c = await pool.connect();
        await c.query("BEGIN");
        await c.query("INSERT INTO t_sp VALUES (2)");
        await c.query("ROLLBACK");
      });

      const { rows } = await client.query("SELECT n FROM t_sp ORDER BY n");
      expect(rows.map((r: any) => r.n)).toEqual([1]); // rad 2 rullet tilbake, rad 1 overlevde
    } finally {
      await client.query("ROLLBACK").catch(() => {});
      client.release();
    }
  }, 10000);

  it("kaster på COMMIT uten forutgående BEGIN i stedet for å avslutte den ytre transaksjonen", async () => {
    if (!dbReachable) return;
    const { pool, requestDbStorage } = await loadDb();
    const client = await appPool!.connect();
    try {
      await client.query("BEGIN");
      await requestDbStorage.run({ db: {} as any, client }, async () => {
        const c = await pool.connect();
        expect(() => c.query("COMMIT")).toThrow(/uten forutgående BEGIN/);
      });
    } finally {
      await client.query("ROLLBACK").catch(() => {});
      client.release();
    }
  }, 10000);
});
