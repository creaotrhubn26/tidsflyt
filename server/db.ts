import { drizzle } from "drizzle-orm/node-postgres";
import pkg from "pg";
const { Pool } = pkg;
import * as schema from "@shared/schema";
import { requireDatabaseConnectionString } from "./database-config";
import { requestDbStorage } from "./lib/request-db-context";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

const connectionString = requireDatabaseConnectionString();
const sslDisabled = process.env.DATABASE_SSL === "false" || process.env.PGSSLMODE === "disable";
const isLocal = connectionString
  ? /localhost|127\.0\.0\.1/.test(connectionString)
  : false;

export function buildSslConfig(): { rejectUnauthorized: true } | false {
  if (sslDisabled || isLocal) return false;
  return { rejectUnauthorized: true };
}

const pool = new Pool({
  connectionString,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: buildSslConfig(),
});

pool.on('error', (err) => {
  console.error('Database pool error:', err);
});

// systemDb/systemPool kobler som tidum_system (BYPASSRLS) — se Task 7.
// Selve tilkoblingsstrengens rolle avgjøres av hvilken bruker
// DATABASE_URL/TIDUM_APP_DATABASE_URL faktisk peker på; denne filen endrer
// ikke tilkoblingsstrengen, kun hvordan requests får sin egen RLS-scopede
// tilkobling via withVendorScopedDb (server/middleware/vendor-scoped-db.ts).
const systemDb = drizzle(pool, { schema });
const systemPool = pool;

export const db: NodePgDatabase<typeof schema> = new Proxy(systemDb, {
  get(target, prop, receiver) {
    const ctx = requestDbStorage.getStore();
    const actual = ctx ? ctx.db : target;
    return Reflect.get(actual as object, prop, receiver);
  },
}) as NodePgDatabase<typeof schema>;

export const dbPool: InstanceType<typeof Pool> = new Proxy(systemPool, {
  get(target, prop, receiver) {
    const ctx = requestDbStorage.getStore();
    const actual = ctx ? ctx.client : target;
    return Reflect.get(actual as object, prop, receiver);
  },
}) as unknown as InstanceType<typeof Pool>;

export { systemPool as pool }; // rå system-tilkoblingen, brukt KUN til å opprette nye tidum_app-klienter (se middleware)
