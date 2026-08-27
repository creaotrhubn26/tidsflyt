import type { PoolClient } from "pg";
import { pool } from "../db";

type QueryClient = Pick<PoolClient, "query">;
export type DualTenantRlsContext =
  | { vendorId: number; kommuneId?: never }
  | { kommuneId: number; vendorId?: never };
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

function requireVendorId(vendorId: number): number {
  if (!Number.isInteger(vendorId) || vendorId <= 0) {
    throw new Error("INVALID_RLS_VENDOR_ID");
  }
  return vendorId;
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
            set_config('tidum.vendor_id', '', true),
            set_config('tidum.rls_system_operation', '', true),
            set_config('tidum.rls_actor_user_id', '', true)`,
    [String(scopedKommuneId)],
  );
}

/**
 * Sets a transaction-local vendor context for dual-tenant resources such as
 * the archive outbox. Municipality-only tables remain fail-closed because
 * their policies do not accept the vendor mode.
 */
export async function setLocalVendorRlsContext(
  client: QueryClient,
  vendorId: number,
): Promise<void> {
  const scopedVendorId = requireVendorId(vendorId);
  await assumeRlsRuntimeRole(client);
  await client.query(
    `SELECT set_config('tidum.rls_mode', 'vendor', true),
            set_config('tidum.kommune_id', '', true),
            set_config('tidum.vendor_id', $1, true),
            set_config('tidum.rls_system_operation', '', true),
            set_config('tidum.rls_actor_user_id', '', true)`,
    [String(scopedVendorId)],
  );
}

/**
 * Restricts secure-dialog access to the conversations an eID-authenticated
 * portal user actively participates in. The database policies, not request
 * parameters, resolve the user's permitted objects.
 */
export async function setLocalSecurePartyRlsContext(
  client: QueryClient,
  actorUserId: string,
): Promise<void> {
  const normalizedActorUserId = actorUserId.trim();
  if (!normalizedActorUserId || normalizedActorUserId.length > 128 || /[\u0000-\u001f\u007f]/.test(normalizedActorUserId)) {
    throw new Error("INVALID_RLS_ACTOR_USER_ID");
  }
  await assumeRlsRuntimeRole(client);
  await client.query(
    `SELECT set_config('tidum.rls_mode', 'secure_party', true),
            set_config('tidum.kommune_id', '', true),
            set_config('tidum.vendor_id', '', true),
            set_config('tidum.rls_system_operation', '', true),
            set_config('tidum.rls_actor_user_id', $1, true)`,
    [normalizedActorUserId],
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
            set_config('tidum.vendor_id', '', true),
            set_config('tidum.rls_system_operation', $1, true),
            set_config('tidum.rls_actor_user_id', '', true)`,
    [normalizedOperation],
  );
}

/**
 * Runs an object lookup through the runtime role without granting any RLS
 * scope. This preserves neutral not-found responses for unauthorised callers
 * without performing a privileged existence check first.
 */
export async function setLocalDeniedRlsContext(client: QueryClient): Promise<void> {
  await assumeRlsRuntimeRole(client);
  await client.query(
    `SELECT set_config('tidum.rls_mode', 'deny', true),
            set_config('tidum.kommune_id', '', true),
            set_config('tidum.vendor_id', '', true),
            set_config('tidum.rls_system_operation', '', true),
            set_config('tidum.rls_actor_user_id', '', true)`,
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

export function withVendorRlsContext<T>(
  vendorId: number,
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return withRlsTransaction(
    (client) => setLocalVendorRlsContext(client, vendorId),
    callback,
  );
}

export function withDualTenantRlsContext<T>(
  tenant: DualTenantRlsContext,
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return tenant.kommuneId != null
    ? withKommuneRlsContext(tenant.kommuneId, callback)
    : withVendorRlsContext(tenant.vendorId, callback);
}

export function withSecurePartyRlsContext<T>(
  actorUserId: string,
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return withRlsTransaction(
    (client) => setLocalSecurePartyRlsContext(client, actorUserId),
    callback,
  );
}

export function withDeniedRlsContext<T>(
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return withRlsTransaction(setLocalDeniedRlsContext, callback);
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
