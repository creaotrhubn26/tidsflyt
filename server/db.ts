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
          if (verb === "COMMIT" || verb === "ROLLBACK") {
            // Umatchet COMMIT/ROLLBACK må ALDRI falle gjennom til den ekte
            // clienten — det er nøyaktig feilmodusen shimmen finnes for å
            // hindre (den ville avsluttet middlewarens ytre transaksjon og
            // droppet set_config-verdiene for resten av requesten).
            if (!savepoint) {
              throw new Error(
                `${verb} uten forutgående BEGIN på en request-scopet pool.connect()-client. ` +
                  `Dette ville avsluttet den RLS-scopede transaksjonen for hele requesten.`,
              );
            }
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
// Metodene MÅ bindes til objektet de faktisk hører til, og Reflect.get må få
// det objektet som receiver — ikke proxyen. `pg` sin Client MUTERER `this`
// under en spørring (bl.a. `this.activeQuery`). Med receiver = proxy ville
// LESING av slike felt gå via get-trappen til riktig client, mens SKRIVING
// gikk via proxyens standard [[Set]] og landet på proxyens target
// (systemPool). Spørringen forsvinner da fra clientens kø og promise-en løses
// aldri — altså en stille hengning på HVER rå spørring inne i en autentisert
// request. Verifisert mot ekte pg 8.16.3: uten bindingen henger
// `pool.query("SELECT 42")` inne i en ALS-kontekst.
// DDL må ALDRI kjøre på request-tilkoblingen: tidum_app har kun USAGE, ikke
// CREATE, på schema public (migrasjon 052), så et lat `CREATE TABLE IF NOT
// EXISTS` inne i en autentisert request ville feilet. Kodebasen har ~66 slike
// lat-opprettende DDL-setninger spredt over server/routes.ts,
// server/smartTimingRoutes.ts og fem lib-/rutefiler, og de kalles fra vanlige
// forretningsruter, ikke bare fra oppsett. Å wrappe hvert kallsted for seg er
// både 66 endringer og noe neste utvikler garantert glemmer — regelen hører
// hjemme her, i det ene punktet alle går gjennom. Schemaendringer hører uansett
// hjemme på system-tilkoblingen, og disse setningene er idempotente
// (IF NOT EXISTS), så det er riktig at de ikke rulles tilbake med requesten.
const DDL = /^\s*(CREATE|ALTER|DROP)\s/i;
function isDdl(args: unknown[]): boolean {
  const text = typeof args[0] === "string" ? args[0] : (args[0] as { text?: string } | undefined)?.text;
  return typeof text === "string" && DDL.test(text);
}

export const pool: InstanceType<typeof Pool> = new Proxy(systemPool, {
  get(target, prop) {
    const ctx = requestDbStorage.getStore();
    if (!ctx) {
      const value = Reflect.get(target as object, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    }
    if (prop === "connect") return async () => scopedClient(ctx.client);
    if (prop === "query") {
      return (...args: unknown[]) =>
        isDdl(args)
          ? (target.query as (...a: unknown[]) => unknown)(...args)
          : (ctx.client.query as (...a: unknown[]) => unknown)(...args);
    }
    const value = Reflect.get(ctx.client as object, prop, ctx.client);
    return typeof value === "function" ? value.bind(ctx.client) : value;
  },
}) as unknown as InstanceType<typeof Pool>;

export const dbPool = pool;
