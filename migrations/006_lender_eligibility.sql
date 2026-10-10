ALTER TABLE lenders ADD COLUMN IF NOT EXISTS organization_name TEXT NOT NULL DEFAULT '';
ALTER TABLE lenders ADD COLUMN IF NOT EXISTS institution_type TEXT NOT NULL DEFAULT '';
ALTER TABLE lenders ADD COLUMN IF NOT EXISTS registration_number TEXT NOT NULL DEFAULT '';
ALTER TABLE lenders ADD COLUMN IF NOT EXISTS business_address TEXT NOT NULL DEFAULT '';
ALTER TABLE lenders ADD COLUMN IF NOT EXISTS years_experience INTEGER NOT NULL DEFAULT 0;
ALTER TABLE lenders ADD COLUMN IF NOT EXISTS annual_lending_capacity NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE lenders ADD COLUMN IF NOT EXISTS eligibility_status TEXT NOT NULL DEFAULT 'unassessed';
ALTER TABLE lenders ADD COLUMN IF NOT EXISTS eligibility_notes TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS lender_eligibility_checks (
  id BIGSERIAL PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  organization_name TEXT NOT NULL,
  institution_type TEXT NOT NULL,
  registration_number TEXT NOT NULL,
  business_address TEXT NOT NULL,
  business_phone TEXT NOT NULL,
  years_experience INTEGER NOT NULL,
  annual_lending_capacity NUMERIC(14,2) NOT NULL,
  eligible BOOLEAN NOT NULL,
  result_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  registered_user_id BIGINT REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lender_eligibility_email ON lender_eligibility_checks(lower(email), created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lender_eligibility_result ON lender_eligibility_checks(eligible, created_at DESC);