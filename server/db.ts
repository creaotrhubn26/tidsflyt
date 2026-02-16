import { drizzle } from "drizzle-orm/node-postgres";
import pkg from "pg";
const { Pool } = pkg;
import * as schema from "@shared/schema";

const connectionString = process.env.EXTERNAL_DATABASE_URL || process.env.DATABASE_URL;
const sslDisabled = process.env.DATABASE_SSL === "false" || process.env.PGSSLMODE === "disable";
const isLocal = connectionString
  ? /localhost|127\.0\.0\.1/.test(connectionString)
  : false;
const useSsl = !sslDisabled && !isLocal;

const pool = new Pool({
  connectionString,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  console.error('Database pool error:', err);
});

export const db = drizzle(pool, { schema });
export { pool };
