import { drizzle } from "drizzle-orm/node-postgres";
import pkg from "pg";
const { Pool } = pkg;
import * as schema from "@shared/schema";
import { requireDatabaseConnectionString } from "./database-config";
import { requestDbStorage } from "./lib/request-db-context";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PoolClient } from "pg";

const connectionString = requireDatabaseConnectionString();
const sslDisabled = process.env.DATABASE_SSL === "false" || process.env.PGSSLMODE === "disable";
const isLocal = connectionString
  ? /localhost|127\.0\.0\.1/.test(connectionString)
  : false;

export function buildSslConfig(): { rejectUnauthorized: true } | false {
  if (sslDisabled || isLocal) return false;
  return { rejectUnauthorized: true };
}

const systemPool = new Pool({
  connectionString,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: buildSslConfig(),
});

systemPool.on('error', (err) => {
  console.error('Database pool error:', err);
});

// systemDb/systemPool kobler som tidum_system (BYPASSRLS) — se Task 7.
// Selve tilkoblingsstrengens rolle avgjøres av hvilken bruker
// DATABASE_URL/TIDUM_APP_DATABASE_URL faktisk peker på; denne filen endrer
// ikke tilkoblingsstrengen, kun hvordan requests får sin egen RLS-scopede
// tilkobling via withVendorScopedDb (server/middleware/vendor-scoped-db.ts).
const systemDb = drizzle(systemPool, { schema });

export const db: NodePgDatabase<typeof schema> = new Proxy(systemDb, {
  get(target, prop, receiver) {
    const ctx = requestDbStorage.getStore();
    const actual = ctx ? ctx.db : target;
    return Reflect.get(actual as object, prop, receiver);
  },
}) as NodePgDatabase<typeof schema>;

// `pool.connect()` inne i en request kan IKKE bare videresendes til
// request-clienten: den er allerede tilkoblet (et nytt connect() ville forsøke
// å koble opp strømmen på nytt), middlewaren eier release()-en (et kall her
// ville gi dobbel release), og et rått BEGIN/COMMIT ville avslutte
// middlewarens ytre transaksjon midt i requesten og lydløst droppe
// set_config-verdiene (transaksjonslokale per definisjon) for resten av den.
// Samme problem, og samme løsning, som withSavepointTransaction i
// server/middleware/vendor-scoped-db.ts gjør for drizzles db.transaction():
// oversett BEGIN/COMMIT/ROLLBACK til SAVEPOINT og gjør release() til en no-op.
// Dermed trenger kallstedene (i dag server/routes/employee-import-routes.ts,
// to ruter) ingen kodeendring.
let savepointCounter = 0;
function scopedClient(client: PoolClient): PoolClient {
  let savepoint: string | null = null;
  return new Proxy(client, {
    get(target, prop) {
      if (prop === "release") return () => {};
      if (prop === "query") {
        return (...args: unknown[]) => {
          const verb = typeof args[0] === "string" ? args[0].trim().toUpperCase() : "";
          if (verb === "BEGIN") {
            savepoint = `sp_pool_${++savepointCounter}_${Date.now()}`;
            return target.query(`SAVEPOINT ${savepoint}`);
          }
          if (savepoint && (verb === "COMMIT" || verb === "ROLLBACK")) {
            const sp = savepoint;
            savepoint = null;
            return target.query(
              verb === "COMMIT" ? `RELEASE SAVEPOINT ${sp}` : `ROLLBACK TO SAVEPOINT ${sp}`,
            );
          }
          return (target.query as (...a: unknown[]) => unknown)(...args);
        };
      }
      const value = Reflect.get(target as object, prop);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as PoolClient;
}

// `pool` og `dbPool` er SAMME proxy-objekt (dbPool er kun et alias). Alle
// rå-SQL-forbrukere importerer `pool`, så det er den eksporten som må være
// ALS-bevisst — ellers kjører de på tidum_system (BYPASSRLS) og RLS får ingen
// effekt for dem, uansett FORCE. Se docs/security/rls-file-classification.md.
export const pool: InstanceType<typeof Pool> = new Proxy(systemPool, {
  get(target, prop, receiver) {
    const ctx = requestDbStorage.getStore();
    if (!ctx) return Reflect.get(target as object, prop, receiver);
    if (prop === "connect") return async () => scopedClient(ctx.client);
    return Reflect.get(ctx.client as object, prop, receiver);
  },
}) as unknown as InstanceType<typeof Pool>;

export const dbPool = pool;
