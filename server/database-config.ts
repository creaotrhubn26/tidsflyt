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
