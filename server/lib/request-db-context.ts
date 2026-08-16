import { AsyncLocalStorage } from "node:async_hooks";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PoolClient } from "pg";
import * as schema from "@shared/schema";

export interface RequestDbContext {
  db: NodePgDatabase<typeof schema>;
  client: PoolClient;
}

// Tom (ingen kontekst) betyr: kall til db/pool faller tilbake til
// tidum_system-tilkoblingen (se server/db.ts). Dette er tilfellet for
// bakgrunnsjobber (cron, migrasjon) OG for enhver request som kjører før
// withVendorScopedDb-middlewaren (auth-ruter uten etablert req.user) —
// begge kategorier er ment å IKKE ha en satt kontekst, ikke en feiltilstand.
export const requestDbStorage = new AsyncLocalStorage<RequestDbContext>();
