CREATE TABLE IF NOT EXISTS company_users (
  id SERIAL PRIMARY KEY,
  vendor_id INTEGER,
  company_id INTEGER NOT NULL,
  user_email TEXT NOT NULL,
  google_email TEXT,
  role TEXT DEFAULT 'member',
  approved BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_company_users_vendor_id ON company_users(vendor_id);
CREATE INDEX IF NOT EXISTS idx_company_users_company_id ON company_users(company_id);

CREATE TABLE IF NOT EXISTS user_cases (
  id SERIAL PRIMARY KEY,
  company_user_id INTEGER REFERENCES company_users(id) ON DELETE CASCADE,
  case_id TEXT,
  case_title TEXT,
  status TEXT DEFAULT 'active',
  assigned_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_cases_company_user_id ON user_cases(company_user_id);
CREATE INDEX IF NOT EXISTS idx_user_cases_case_id ON user_cases(case_id);
