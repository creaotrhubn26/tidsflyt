import { defineConfig } from "drizzle-kit";

// ⚠️ DATABASE_URL points at a LIVE PRODUCTION database SHARED with dozens
// of completely unrelated products (confirmed 2026-08-21: ~3265 tables
// total, Tidum's own migrations/schema account for ~115 of them). `db:push`
// (package.json) diffs shared/schema.ts against the REAL live database and
// can apply changes automatically for anything it doesn't classify as data
// loss — always run it with `--strict` (already the default in
// package.json's db:push script; do not remove that flag) so EVERY
// proposed change requires explicit confirmation, not just the ones
// drizzle-kit itself flags as destructive.
//
// `users` and `vendors` in particular are NOT Tidum's own tables — they
// are borrowed/shared tables another product actually owns (verified:
// 242 foreign-owned FKs point into them, and Tidum's own `vendors` INSERT
// in migrations/017 silently no-op'd against a `vendors` table that
// already existed under another product's ownership). Both carry columns
// Tidum's schema.ts does NOT declare (e.g. users.username, users.password).
// NEVER accept a db:push prompt that proposes dropping or altering a
// column on `users` or `vendors` that this schema file doesn't itself
// define — it almost certainly belongs to another product's live data.
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
