import { execFileSync } from "node:child_process";
import process from "node:process";
import pg from "pg";

const { Pool } = pg;

function getConnectionString() {
  const value = process.env.DATABASE_URL || process.env.EXTERNAL_DATABASE_URL;
  if (!value) {
    throw new Error("Set DATABASE_URL or EXTERNAL_DATABASE_URL before running this script.");
  }
  return value;
}

function exportSchemaSql() {
  return execFileSync(
    "npx",
    ["drizzle-kit", "export", "--sql", "--dialect", "postgresql", "--schema", "./shared"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
}

function parseCreateTables(sqlText) {
  const tables = new Map();
  const regex = /CREATE TABLE "([^"]+)" \(([\s\S]*?)\n\);/g;
  let match;

  while ((match = regex.exec(sqlText))) {
    const [, tableName, body] = match;
    const columns = [];

    for (const rawLine of body.split("\n")) {
      const line = rawLine.trim();
      if (!line.startsWith('"')) continue;

      const columnMatch = /^"([^"]+)"\s+(.+?)(?:,)?$/.exec(line);
      if (!columnMatch) continue;

      columns.push({
        name: columnMatch[1],
        definition: columnMatch[2].trim(),
      });
    }

    tables.set(tableName, {
      createSql: match[0].replace(/^CREATE TABLE /, "CREATE TABLE IF NOT EXISTS "),
      columns,
    });
  }

  return tables;
}

function parseTrailingStatements(sqlText) {
  return sqlText
    .split(/;\s*\n/)
    .map((statement) => statement.trim())
    .filter(Boolean)
    .filter((statement) =>
      statement.startsWith("ALTER TABLE ") ||
      statement.startsWith("CREATE INDEX ") ||
      statement.startsWith("CREATE UNIQUE INDEX "),
    );
}

function buildDiffs(tableDefinitions, actualColumnsByTable) {
  const diffs = [];

  for (const [tableName, tableDefinition] of tableDefinitions.entries()) {
    const actualColumns = actualColumnsByTable.get(tableName) ?? new Set();
    const expectedColumns = tableDefinition.columns.map((column) => column.name);
    const missing = expectedColumns.filter((column) => !actualColumns.has(column));
    const extra = [...actualColumns].filter(
      (column) => !expectedColumns.includes(column),
    );

    if (missing.length || extra.length) {
      diffs.push({ tableName, missing, extra });
    }
  }

  return diffs;
}

function relaxColumnDefinition(definition) {
  return definition
    .replace(/\s+PRIMARY KEY\b/gi, "")
    .replace(/\s+UNIQUE\b/gi, "")
    .replace(/\s+NOT NULL\b/gi, "")
    .trim();
}

async function fetchExistingState(pool) {
  const tablesResult = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
  `);

  const columnsResult = await pool.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
  `);

  const tables = new Set(tablesResult.rows.map((row) => row.table_name));
  const columns = new Map();

  for (const row of columnsResult.rows) {
    const tableName = row.table_name;
    const columnSet = columns.get(tableName) ?? new Set();
    columnSet.add(row.column_name);
    columns.set(tableName, columnSet);
  }

  return { tables, columns };
}

async function ensureLegacyVendorColumns(pool) {
  await pool.query(`ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "name" text`);
  await pool.query(`
    UPDATE "vendors"
    SET "name" = COALESCE("name", "business_name", "email", "id"::text)
    WHERE "name" IS NULL
  `);

  await pool.query(`ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "slug" text`);
  await pool.query(`
    UPDATE "vendors"
    SET "slug" = COALESCE(
      "slug",
      NULLIF(TRIM(BOTH '-' FROM LOWER(REGEXP_REPLACE(COALESCE("business_name", ''), '[^a-zA-Z0-9]+', '-', 'g'))), ''),
      NULLIF(TRIM(BOTH '-' FROM LOWER(REGEXP_REPLACE(COALESCE(SPLIT_PART("email", '@', 1), ''), '[^a-zA-Z0-9]+', '-', 'g'))), ''),
      'vendor-' || SUBSTRING(MD5("id"::text), 1, 12)
    )
    WHERE "slug" IS NULL
  `);
  await pool.query(`
    WITH duplicate_slugs AS (
      SELECT id, slug, ROW_NUMBER() OVER (PARTITION BY slug ORDER BY id) AS row_number
      FROM "vendors"
      WHERE slug IS NOT NULL
    )
    UPDATE "vendors" AS vendors
    SET "slug" = vendors.slug || '-' || SUBSTRING(MD5(vendors.id::text), 1, 6)
    FROM duplicate_slugs
    WHERE vendors.id = duplicate_slugs.id
      AND duplicate_slugs.row_number > 1
  `);

  await pool.query(`ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "address" text`);
  await pool.query(`
    UPDATE "vendors"
    SET "address" = COALESCE("address", "location")
    WHERE "address" IS NULL
  `);

  await pool.query(`ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "logo_url" text`);
  await pool.query(`
    UPDATE "vendors"
    SET "logo_url" = COALESCE("logo_url", "image_url")
    WHERE "logo_url" IS NULL
  `);

  await pool.query(`
    ALTER TABLE "vendors"
    ADD COLUMN IF NOT EXISTS "settings" jsonb DEFAULT '{}'::jsonb
  `);
  await pool.query(`
    ALTER TABLE "vendors"
    ADD COLUMN IF NOT EXISTS "max_users" integer DEFAULT 50
  `);
  await pool.query(`
    ALTER TABLE "vendors"
    ADD COLUMN IF NOT EXISTS "subscription_plan" text DEFAULT 'standard'
  `);
  await pool.query(`
    ALTER TABLE "vendors"
    ADD COLUMN IF NOT EXISTS "api_access_enabled" boolean DEFAULT false
  `);
  await pool.query(`
    ALTER TABLE "vendors"
    ADD COLUMN IF NOT EXISTS "api_subscription_start" timestamp
  `);
  await pool.query(`
    ALTER TABLE "vendors"
    ADD COLUMN IF NOT EXISTS "api_subscription_end" timestamp
  `);
  await pool.query(`
    ALTER TABLE "vendors"
    ADD COLUMN IF NOT EXISTS "api_monthly_price" numeric(10, 2) DEFAULT '99.00'
  `);

  await pool.query(`ALTER TABLE "vendors" ALTER COLUMN "name" SET NOT NULL`);
  await pool.query(`ALTER TABLE "vendors" ALTER COLUMN "slug" SET NOT NULL`);
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS "vendors_slug_unique" ON "vendors" USING btree ("slug")`,
  );
}

async function ensureTrailingStatement(pool, statement) {
  if (statement.startsWith('CREATE UNIQUE INDEX "')) {
    const withIfNotExists = statement.replace(
      /^CREATE UNIQUE INDEX /,
      "CREATE UNIQUE INDEX IF NOT EXISTS ",
    );
    await pool.query(withIfNotExists);
    return;
  }

  if (statement.startsWith('CREATE INDEX "')) {
    const withIfNotExists = statement.replace(/^CREATE INDEX /, "CREATE INDEX IF NOT EXISTS ");
    await pool.query(withIfNotExists);
    return;
  }

  if (statement.startsWith('ALTER TABLE "email_send_history" ADD CONSTRAINT "')) {
    const constraintMatch = /ADD CONSTRAINT "([^"]+)"/.exec(statement);
    if (!constraintMatch) {
      await pool.query(statement);
      return;
    }

    const constraintName = constraintMatch[1];
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = '${constraintName}'
        ) THEN
          ${statement};
        END IF;
      END $$;
    `);
    return;
  }

  await pool.query(statement);
}

async function main() {
  const connectionString = getConnectionString();
  const reportOnly = process.argv.includes("--report-only");
  const sslDisabled =
    process.env.DATABASE_SSL === "false" || process.env.PGSSLMODE === "disable";
  const isLocal = /localhost|127\.0\.0\.1/.test(connectionString);
  const pool = new Pool({
    connectionString,
    ssl: !sslDisabled && !isLocal ? { rejectUnauthorized: false } : false,
  });

  try {
    const sqlText = exportSchemaSql();
    const tableDefinitions = parseCreateTables(sqlText);
    const trailingStatements = parseTrailingStatements(sqlText);
    const existingState = await fetchExistingState(pool);
    const initialDiffs = buildDiffs(tableDefinitions, existingState.columns);

    const createdTables = [];
    const addedColumns = [];

    if (!reportOnly) {
      for (const [tableName, tableDefinition] of tableDefinitions.entries()) {
        const tableExists = existingState.tables.has(tableName);

        if (!tableExists) {
          await pool.query(tableDefinition.createSql);
          createdTables.push(tableName);
          existingState.tables.add(tableName);
          existingState.columns.set(
            tableName,
            new Set(tableDefinition.columns.map((column) => column.name)),
          );
          continue;
        }

        const existingColumns = existingState.columns.get(tableName) ?? new Set();

        for (const column of tableDefinition.columns) {
          if (existingColumns.has(column.name)) continue;

          if (tableName === "vendors") {
            await ensureLegacyVendorColumns(pool);
            const vendorColumns = await pool.query(`
              SELECT column_name
              FROM information_schema.columns
              WHERE table_schema = 'public'
                AND table_name = 'vendors'
            `);
            existingState.columns.set(
              "vendors",
              new Set(vendorColumns.rows.map((row) => row.column_name)),
            );
            break;
          }

          await pool.query(
            `ALTER TABLE "${tableName}" ADD COLUMN IF NOT EXISTS "${column.name}" ${relaxColumnDefinition(column.definition)};`,
          );
          existingColumns.add(column.name);
          addedColumns.push(`${tableName}.${column.name}`);
        }

        existingState.columns.set(tableName, existingColumns);
      }

      for (const statement of trailingStatements) {
        try {
          await ensureTrailingStatement(pool, statement);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.warn(`[sync-schema] Skipped statement: ${message}`);
        }
      }
    }

    const finalState = await fetchExistingState(pool);
    const finalDiffs = buildDiffs(tableDefinitions, finalState.columns);

    console.log(
      JSON.stringify(
        {
          reportOnly,
          initialDiffCount: initialDiffs.length,
          initialDiffs,
          createdTables,
          addedColumns,
          createdTableCount: createdTables.length,
          addedColumnCount: addedColumns.length,
          finalDiffCount: finalDiffs.length,
          finalDiffs,
        },
        null,
        2,
      ),
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[sync-schema] Failed:", error);
  process.exit(1);
});
