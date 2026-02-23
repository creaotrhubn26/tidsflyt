-- 011: Profile settings fields for the users table
-- Adds phone, language, and notification preference columns so the
-- Settings / Profile page can fully persist user preferences.

ALTER TABLE users ADD COLUMN IF NOT EXISTS phone        varchar(32);
ALTER TABLE users ADD COLUMN IF NOT EXISTS language     varchar(8)  NOT NULL DEFAULT 'no';
ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_email   boolean NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_push    boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_weekly  boolean NOT NULL DEFAULT true;
