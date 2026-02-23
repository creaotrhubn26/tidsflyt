-- 012: Add role and vendor_id to the users table so the Drizzle
-- @shared/models/auth.ts schema matches the actual DB.
ALTER TABLE users ADD COLUMN IF NOT EXISTS role       varchar(64) NOT NULL DEFAULT 'user';
ALTER TABLE users ADD COLUMN IF NOT EXISTS vendor_id  integer;
