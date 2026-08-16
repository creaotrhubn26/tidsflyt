import type { Request, Response, NextFunction } from "express";
import pkg from "pg";
const { Pool } = pkg;
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";
import { requestDbStorage } from "../lib/request-db-context";
import { buildSslConfig } from "../db";
import type { AuthUser } from "../lib/auth-types";

// Egen pool, koblet som tidum_app (se Task 7) — ikke samme pool som
// tidum_system-tilkoblingen i server/db.ts. Tilkoblingsstrengen må peke på
// tidum_app-rollen; separat env-variabel TIDUM_APP_DATABASE_URL, faller
// tilbake til DATABASE_URL hvis ikke satt (samme vertsnavn, ulik rolle i
// selve connection-stringen — dette avklares ved faktisk utrulling, se
// Task 7s operasjonelle forbehold).
const appPool = new Pool({
  connectionString: process.env.TIDUM_APP_DATABASE_URL || process.env.DATABASE_URL,
  max: 20,
  ssl: buildSslConfig(),
});

export async function withVendorScopedDb(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return next(); // ingen etablert bruker ennå -> proxy faller til tidum_system
  const user = req.user as AuthUser;
  const client = await appPool.connect();
  let settled = false;
  const finish = async (commit: boolean) => {
    if (settled) return;
    settled = true;
    try {
      await client.query(commit ? "COMMIT" : "ROLLBACK");
    } finally {
      client.release();
    }
  };
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL app.vendor_id = $1", [user.vendorId ?? -1]);
    await client.query("SET LOCAL app.is_super_admin = $1", [
      user.role === "super_admin" ? "true" : "false",
    ]);
    const scopedDb = drizzle(client, { schema });
    res.on("finish", () => finish(true));
    res.on("close", () => finish(false));
    requestDbStorage.run({ db: scopedDb, client }, next);
  } catch (err) {
    await finish(false);
    next(err);
  }
}
