import type { Request, Response, NextFunction } from "express";
import pkg from "pg";
const { Pool } = pkg;
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PoolClient } from "pg";
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
//
// connectionTimeoutMillis satt likt system-poolen i server/db.ts: hver
// autentisert request holder én client i hele sin levetid her (ikke bare
// per spørring), så uten en timeout ville pg sin standard (0 = vent
// uendelig) latt requests kø opp og henge under last i stedet for å feile
// raskt når poolen er tom.
const appPool = new Pool({
  connectionString: process.env.TIDUM_APP_DATABASE_URL || process.env.DATABASE_URL,
  max: 20,
  connectionTimeoutMillis: 10000,
  ssl: buildSslConfig(),
});

// Gir scopedDb.transaction() et ekte, nøstbart SAVEPOINT i stedet for
// drizzles standard node-postgres-oppførsel. drizzle-orm/node-postgres
// avgjør BEGIN/COMMIT (toppnivå) vs. SAVEPOINT (nøstet) ved å sjekke
// `this.client instanceof Pool` i NodePgSession.transaction — se
// node_modules/drizzle-orm/node-postgres/session.js. Siden scopedDb her er
// bygget fra én enkelt PoolClient (ikke en Pool, med vilje — det er
// nettopp poenget med den RLS-scopede per-request-transaksjonen), ville et
// nøstet `db.transaction()`-kall fra en rute (finnes i dag 4 steder i
// server/routes/leave-routes.ts) uten denne overridden feilaktig gå
// toppnivå-veien og issue en ekte COMMIT — som avslutter middlewarens
// ytre BEGIN-transaksjon midt i requesten og lydløst dropper
// set_config-verdiene (transaksjonslokale per definisjon) for resten av
// requesten. Denne overriden erstatter kun `.transaction` på DENNE
// spesifikke instansen (ett object literal per request), og krever ingen
// endring i noen av de 4 eksisterende kallstedene: de mottar fortsatt
// scopedDb selv (samme objekt) som `tx`-parameteret og kaller
// tx.select()/.insert()/.update() akkurat som før.
function withSavepointTransaction(scopedDb: NodePgDatabase<typeof schema>, client: PoolClient): void {
  let savepointCounter = 0;
  const savepointTransaction = (async (
    callback: (tx: NodePgDatabase<typeof schema>) => Promise<unknown>,
  ) => {
    const savepointName = `sp_${++savepointCounter}_${Date.now()}`;
    await client.query(`SAVEPOINT ${savepointName}`);
    try {
      const result = await callback(scopedDb);
      await client.query(`RELEASE SAVEPOINT ${savepointName}`);
      return result;
    } catch (err) {
      await client.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
      throw err;
    }
  }) as typeof scopedDb.transaction;
  scopedDb.transaction = savepointTransaction;
}

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
    // set_config(), IKKE `SET LOCAL ... = $1` — Postgres tillater ikke
    // bind-parametre i SET/SET LOCAL (kaster "syntax error at or near
    // $1"), kun literals. set_config()s tredje argument `true` betyr
    // transaksjonslokal, tilsvarer LOCAL-nøkkelordet. Andre argument må
    // være tekst — app.vendor_id leses senere med en ::int-cast i
    // RLS-policyen, så det er trygt å lagre den som tekst her.
    await client.query("SELECT set_config('app.vendor_id', $1, true)", [
      String(user.vendorId ?? -1),
    ]);
    await client.query("SELECT set_config('app.is_super_admin', $1, true)", [
      user.role === "super_admin" ? "true" : "false",
    ]);
    const scopedDb = drizzle(client, { schema });
    withSavepointTransaction(scopedDb, client);
    res.on("finish", () => finish(true));
    res.on("close", () => finish(false));
    requestDbStorage.run({ db: scopedDb, client }, next);
  } catch (err) {
    await finish(false);
    next(err);
  }
}
