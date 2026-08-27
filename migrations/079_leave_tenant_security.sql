-- Fravær og sykmeldingsvedlegg er tenantbundet person-/helsedata.
-- Tidligere lå tenant bare implisitt i users.user_id, og rutene lot enhver
-- lederrolle hoppe over eierskap. Gjør tenant til en eksplisitt del av hele
-- objektgrafen og la databasen avvise kryss-tenant-relasjoner.

CREATE TABLE IF NOT EXISTS tidum_leave_types (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT,
  requires_approval BOOLEAN DEFAULT TRUE,
  is_paid BOOLEAN DEFAULT TRUE,
  pay_percent NUMERIC(5,2) DEFAULT 100,
  color TEXT,
  icon TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  display_order INTEGER DEFAULT 0,
  max_days_per_year INTEGER
);

CREATE TABLE IF NOT EXISTS tidum_leave_requests (
  id SERIAL PRIMARY KEY,
  vendor_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  leave_type_id INTEGER NOT NULL REFERENCES tidum_leave_types(id),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  days TEXT DEFAULT '0',
  reason TEXT,
  status TEXT DEFAULT 'pending',
  reviewed_by TEXT,
  reviewed_at TIMESTAMP,
  review_comment TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tidum_leave_balances (
  id SERIAL PRIMARY KEY,
  vendor_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  leave_type_id INTEGER NOT NULL REFERENCES tidum_leave_types(id),
  year INTEGER NOT NULL,
  total_days TEXT DEFAULT '0',
  used_days TEXT DEFAULT '0',
  pending_days TEXT DEFAULT '0',
  remaining_days TEXT DEFAULT '0'
);

CREATE TABLE IF NOT EXISTS tidum_leave_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id INTEGER NOT NULL,
  leave_request_id INTEGER NOT NULL,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  uploaded_by TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE tidum_leave_requests ADD COLUMN IF NOT EXISTS vendor_id INTEGER;
ALTER TABLE tidum_leave_balances ADD COLUMN IF NOT EXISTS vendor_id INTEGER;
ALTER TABLE tidum_leave_attachments ADD COLUMN IF NOT EXISTS vendor_id INTEGER;

-- Eksisterende rader kan bare backfilles når users-raden gir én eksplisitt
-- vendor. Ukjente/default/global-brukere stoppes under i stedet for å bli
-- gjettet inn i feil kunde.
UPDATE tidum_leave_requests lr
   SET vendor_id = u.vendor_id
  FROM users u
 WHERE lr.vendor_id IS NULL
   AND u.id = lr.user_id
   AND u.vendor_id IS NOT NULL
   AND u.kommune_id IS NULL;

UPDATE tidum_leave_balances lb
   SET vendor_id = u.vendor_id
  FROM users u
 WHERE lb.vendor_id IS NULL
   AND u.id = lb.user_id
   AND u.vendor_id IS NOT NULL
   AND u.kommune_id IS NULL;

UPDATE tidum_leave_attachments la
   SET vendor_id = lr.vendor_id
  FROM tidum_leave_requests lr
 WHERE la.vendor_id IS NULL
   AND lr.id = la.leave_request_id
   AND lr.vendor_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM tidum_leave_requests WHERE vendor_id IS NULL) THEN
    RAISE EXCEPTION '079: leave requests without an unambiguous vendor; refusing tenant backfill';
  END IF;
  IF EXISTS (SELECT 1 FROM tidum_leave_balances WHERE vendor_id IS NULL) THEN
    RAISE EXCEPTION '079: leave balances without an unambiguous vendor; refusing tenant backfill';
  END IF;
  IF EXISTS (SELECT 1 FROM tidum_leave_attachments WHERE vendor_id IS NULL) THEN
    RAISE EXCEPTION '079: leave attachments without an unambiguous vendor; refusing tenant backfill';
  END IF;
END $$;

ALTER TABLE tidum_leave_requests ALTER COLUMN vendor_id SET NOT NULL;
ALTER TABLE tidum_leave_balances ALTER COLUMN vendor_id SET NOT NULL;
ALTER TABLE tidum_leave_attachments ALTER COLUMN vendor_id SET NOT NULL;
ALTER TABLE tidum_leave_requests ALTER COLUMN user_id DROP DEFAULT;
ALTER TABLE tidum_leave_balances ALTER COLUMN user_id DROP DEFAULT;

-- Sammensatte nøkler gjør det mulig å håndheve at både eier og barn tilhører
-- samme tenant, ikke bare at hver ID finnes et eller annet sted i databasen.
CREATE UNIQUE INDEX IF NOT EXISTS users_id_vendor_id_unique_idx
  ON users (id, vendor_id);
CREATE UNIQUE INDEX IF NOT EXISTS tidum_leave_requests_id_vendor_unique_idx
  ON tidum_leave_requests (id, vendor_id);
CREATE UNIQUE INDEX IF NOT EXISTS tidum_leave_balances_user_type_year_unique_idx
  ON tidum_leave_balances (vendor_id, user_id, leave_type_id, year);

CREATE INDEX IF NOT EXISTS tidum_leave_requests_vendor_status_idx
  ON tidum_leave_requests (vendor_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS tidum_leave_requests_vendor_user_idx
  ON tidum_leave_requests (vendor_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tidum_leave_attachments_vendor_request_idx
  ON tidum_leave_attachments (vendor_id, leave_request_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tidum_leave_requests_vendor_fkey') THEN
    ALTER TABLE tidum_leave_requests
      ADD CONSTRAINT tidum_leave_requests_vendor_fkey
      FOREIGN KEY (vendor_id) REFERENCES tidum_vendors(id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tidum_leave_requests_user_vendor_fkey') THEN
    ALTER TABLE tidum_leave_requests
      ADD CONSTRAINT tidum_leave_requests_user_vendor_fkey
      FOREIGN KEY (user_id, vendor_id) REFERENCES users(id, vendor_id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tidum_leave_balances_vendor_fkey') THEN
    ALTER TABLE tidum_leave_balances
      ADD CONSTRAINT tidum_leave_balances_vendor_fkey
      FOREIGN KEY (vendor_id) REFERENCES tidum_vendors(id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tidum_leave_balances_user_vendor_fkey') THEN
    ALTER TABLE tidum_leave_balances
      ADD CONSTRAINT tidum_leave_balances_user_vendor_fkey
      FOREIGN KEY (user_id, vendor_id) REFERENCES users(id, vendor_id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tidum_leave_attachments_vendor_fkey') THEN
    ALTER TABLE tidum_leave_attachments
      ADD CONSTRAINT tidum_leave_attachments_vendor_fkey
      FOREIGN KEY (vendor_id) REFERENCES tidum_vendors(id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tidum_leave_attachments_request_vendor_fkey') THEN
    ALTER TABLE tidum_leave_attachments
      ADD CONSTRAINT tidum_leave_attachments_request_vendor_fkey
      FOREIGN KEY (leave_request_id, vendor_id)
      REFERENCES tidum_leave_requests(id, vendor_id)
      ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tidum_leave_requests_status_check') THEN
    ALTER TABLE tidum_leave_requests
      ADD CONSTRAINT tidum_leave_requests_status_check
      CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tidum_leave_requests_date_check') THEN
    ALTER TABLE tidum_leave_requests
      ADD CONSTRAINT tidum_leave_requests_date_check
      CHECK (
        start_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        AND end_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        AND end_date >= start_date
      ) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tidum_leave_requests_days_check') THEN
    ALTER TABLE tidum_leave_requests
      ADD CONSTRAINT tidum_leave_requests_days_check
      CHECK (days ~ '^[0-9]+([.][0-9]{1,2})?$' AND days::numeric > 0 AND days::numeric <= 366)
      NOT VALID;
  END IF;
END $$;

ALTER TABLE tidum_leave_requests VALIDATE CONSTRAINT tidum_leave_requests_vendor_fkey;
ALTER TABLE tidum_leave_requests VALIDATE CONSTRAINT tidum_leave_requests_user_vendor_fkey;
ALTER TABLE tidum_leave_balances VALIDATE CONSTRAINT tidum_leave_balances_vendor_fkey;
ALTER TABLE tidum_leave_balances VALIDATE CONSTRAINT tidum_leave_balances_user_vendor_fkey;
ALTER TABLE tidum_leave_attachments VALIDATE CONSTRAINT tidum_leave_attachments_vendor_fkey;
ALTER TABLE tidum_leave_attachments VALIDATE CONSTRAINT tidum_leave_attachments_request_vendor_fkey;
ALTER TABLE tidum_leave_requests VALIDATE CONSTRAINT tidum_leave_requests_status_check;
ALTER TABLE tidum_leave_requests VALIDATE CONSTRAINT tidum_leave_requests_date_check;
ALTER TABLE tidum_leave_requests VALIDATE CONSTRAINT tidum_leave_requests_days_check;
