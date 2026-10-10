CREATE TABLE IF NOT EXISTS demo_sessions (
  token TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  display_name TEXT NOT NULL,
  customer_key TEXT NOT NULL DEFAULT 'seed-demo',
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_key TEXT NOT NULL DEFAULT 'seed-demo',
  consent_alt_data BOOLEAN NOT NULL DEFAULT false,
  phone TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  work_type TEXT NOT NULL DEFAULT 'Gig worker',
  business_name TEXT NOT NULL DEFAULT '',
  monthly_income NUMERIC(12,2) NOT NULL DEFAULT 0,
  vintage_months INTEGER NOT NULL DEFAULT 0,
  requested_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  tenure_months INTEGER NOT NULL DEFAULT 12,
  purpose TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  trustcred_score INTEGER,
  bill_payment_score INTEGER,
  eligible_amount NUMERIC(12,2),
  lender_recommendation TEXT,
  recommendation_reason TEXT,
  recommended_amount NUMERIC(12,2),
  recommended_by TEXT,
  recommended_at TIMESTAMPTZ,
  admin_decision TEXT,
  admin_reason TEXT,
  approved_amount NUMERIC(12,2),
  decided_by TEXT,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS documents (
  id BIGSERIAL PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  storage_key TEXT,
  byte_size BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  review_reason TEXT NOT NULL DEFAULT '',
  sample_description TEXT NOT NULL DEFAULT '',
  uploaded_by TEXT NOT NULL DEFAULT 'Demo customer',
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS lenders (
  id BIGSERIAL PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_events (
  id BIGSERIAL PRIMARY KEY,
  application_id TEXT,
  actor_role TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_documents_application ON documents(application_id);
CREATE INDEX IF NOT EXISTS idx_audit_application ON audit_events(application_id);