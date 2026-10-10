DELETE FROM audit_events WHERE application_id IN ('TC-2401','TC-2402','TC-2403') OR actor_name LIKE 'Demo %';
DELETE FROM applications WHERE id IN ('TC-2401','TC-2402','TC-2403') OR (customer_key = 'seed-demo' AND customer_email LIKE '%@example.com');
DELETE FROM lenders WHERE email LIKE '%@example.com';
DELETE FROM demo_sessions;
DROP TABLE IF EXISTS demo_sessions;

CREATE TABLE IF NOT EXISTS app_users (
  id BIGSERIAL PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('customer','lender','admin')),
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_iterations INTEGER NOT NULL DEFAULT 310000,
  email_verified BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_email ON app_users (lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_single_admin ON app_users (role) WHERE role = 'admin';
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS actor_user_id BIGINT REFERENCES app_users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry ON auth_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);

CREATE TABLE IF NOT EXISTS verification_codes (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('verify_email','password_reset')),
  code_hash TEXT NOT NULL,
  code_salt TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_verification_user_purpose ON verification_codes(user_id, purpose, created_at DESC);

CREATE TABLE IF NOT EXISTS lender_access_codes (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  code_salt TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  issued_by BIGINT NOT NULL REFERENCES app_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_lender_access_code_email ON lender_access_codes(lower(email));

CREATE TABLE IF NOT EXISTS login_attempts (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  succeeded BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_email_time ON login_attempts(lower(email), attempted_at DESC);

ALTER TABLE applications ADD COLUMN IF NOT EXISTS customer_user_id BIGINT REFERENCES app_users(id) ON DELETE CASCADE;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS assigned_lender_user_id BIGINT REFERENCES app_users(id) ON DELETE SET NULL;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS recommended_by_user_id BIGINT REFERENCES app_users(id) ON DELETE SET NULL;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS decided_by_user_id BIGINT REFERENCES app_users(id) ON DELETE SET NULL;
DELETE FROM applications WHERE customer_user_id IS NULL;
DELETE FROM audit_events WHERE application_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM applications a WHERE a.id=audit_events.application_id);
ALTER TABLE applications DROP COLUMN IF EXISTS customer_key;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS consented_at TIMESTAMPTZ;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS consent_version TEXT;
CREATE INDEX IF NOT EXISTS idx_applications_customer_user ON applications(customer_user_id);
ALTER TABLE lenders ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES app_users(id) ON DELETE SET NULL;
DELETE FROM lenders WHERE user_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_lenders_user_id ON lenders(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lender_access_active ON lender_access_codes(active);
CREATE UNIQUE INDEX IF NOT EXISTS idx_lenders_email_lower ON lenders(lower(email));