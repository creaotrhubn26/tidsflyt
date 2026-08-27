import type { PoolClient } from "pg";
import { pool } from "../db";

type QueryClient = Pick<PoolClient, "query">;
const requestedRuntimeRole = process.env.TIDUM_RLS_RUNTIME_ROLE?.trim() || "";
if (process.env.NODE_ENV === "production" && (!requestedRuntimeRole || requestedRuntimeRole === "pg_database_owner")) {
  throw new Error("DEDICATED_RLS_RUNTIME_ROLE_REQUIRED");
}
const configuredRuntimeRole = requestedRuntimeRole || "pg_database_owner";
if (!/^[a-z_][a-z0-9_]{0,62}$/.test(configuredRuntimeRole)) {
  throw new Error("INVALID_RLS_RUNTIME_ROLE");
}
const RLS_RUNTIME_ROLE = configuredRuntimeRole;

async function assumeRlsRuntimeRole(client: QueryClient): Promise<void> {
  // Strictly validated identifier. Never interpolate unvalidated input here.
  await client.query(`SET LOCAL ROLE ${RLS_RUNTIME_ROLE}`);
}

function requireKommuneId(kommuneId: number): number {
  if (!Number.isInteger(kommuneId) || kommuneId <= 0) {
    throw new Error("INVALID_RLS_KOMMUNE_ID");
  }
  return kommuneId;
}

/**
 * Sets a transaction-local municipality context. This must only be called
 * after BEGIN; PostgreSQL resets the values automatically on COMMIT/ROLLBACK.
 */
export async function setLocalKommuneRlsContext(
  client: QueryClient,
  kommuneId: number,
): Promise<void> {
  const scopedKommuneId = requireKommuneId(kommuneId);
  await assumeRlsRuntimeRole(client);
  await client.query(
    `SELECT set_config('tidum.rls_mode', 'kommune', true),
            set_config('tidum.kommune_id', $1, true),
            set_config('tidum.rls_system_operation', '', true)`,
    [String(scopedKommuneId)],
  );
}

/**
 * Explicit unrestricted context for internal maintenance and test cleanup.
 * Runtime request handlers must use withKommuneRlsContext instead.
 */
export async function setLocalSystemRlsContext(
  client: QueryClient,
  operation: string,
): Promise<void> {
  const normalizedOperation = operation.trim();
  if (!/^[a-z][a-z0-9_-]{2,63}$/.test(normalizedOperation)) {
    throw new Error("INVALID_RLS_SYSTEM_OPERATION");
  }
  await assumeRlsRuntimeRole(client);
  await client.query(
    `SELECT set_config('tidum.rls_mode', 'system', true),
            set_config('tidum.kommune_id', '', true),
            set_config('tidum.rls_system_operation', $1, true)`,
    [normalizedOperation],
  );
}

async function withRlsTransaction<T>(
  configure: (client: PoolClient) => Promise<void>,
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await configure(client);
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export function withKommuneRlsContext<T>(
  kommuneId: number,
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return withRlsTransaction(
    (client) => setLocalKommuneRlsContext(client, kommuneId),
    callback,
  );
}

export function withSystemRlsContext<T>(
  operation: string,
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return withRlsTransaction(
    (client) => setLocalSystemRlsContext(client, operation),
    callback,
  );
}
