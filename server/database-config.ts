const databaseConnectionString =
  process.env.EXTERNAL_DATABASE_URL || process.env.DATABASE_URL || "";

export function getDatabaseConnectionString(): string {
  return databaseConnectionString;
}

export function hasDatabaseConnectionString(): boolean {
  return databaseConnectionString.length > 0;
}

export function requireDatabaseConnectionString(): string {
  if (!databaseConnectionString) {
    throw new Error(
      "Database configuration missing. Set DATABASE_URL or EXTERNAL_DATABASE_URL.",
    );
  }

  return databaseConnectionString;
}

/**
 * Connection used by the application pool at runtime.
 *
 * Splitting this from DATABASE_URL lets the app connect as a role that cannot
 * run DDL and does not bypass RLS, while migrations keep the privileged
 * connection. On Neon that is the only way to make `SET LOCAL ROLE
 * <runtime-role>` work: role membership granted by Neon's cloud_admin comes
 * with SET FALSE, so a role can only assume itself.
 *
 * Unset ⇒ same string as migrations, i.e. unchanged behaviour.
 */
const runtimeConnectionString =
  process.env.RUNTIME_DATABASE_URL || databaseConnectionString;

export function requireRuntimeConnectionString(): string {
  if (!runtimeConnectionString) {
    throw new Error(
      "Database configuration missing. Set DATABASE_URL or EXTERNAL_DATABASE_URL.",
    );
  }

  return runtimeConnectionString;
}

/** True when runtime and migrations use different roles. */
export function hasSeparateRuntimeConnection(): boolean {
  return Boolean(process.env.RUNTIME_DATABASE_URL);
}
