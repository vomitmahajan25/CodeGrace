ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_role_check;
DROP INDEX IF EXISTS idx_app_users_single_admin;
UPDATE app_users SET role='loanofficer' WHERE role='admin';
ALTER TABLE app_users ADD CONSTRAINT app_users_role_check CHECK (role IN ('customer','lender','loanofficer'));
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_single_loanofficer ON app_users (role) WHERE role='loanofficer';

ALTER TABLE applications ADD COLUMN IF NOT EXISTS funding_lender_user_id BIGINT REFERENCES app_users(id) ON DELETE SET NULL;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS funding_status TEXT NOT NULL DEFAULT 'not_assigned';
ALTER TABLE applications ADD COLUMN IF NOT EXISTS funded_amount NUMERIC(12,2);
ALTER TABLE applications ADD COLUMN IF NOT EXISTS funded_at TIMESTAMPTZ;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS funding_reference TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS funding_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE evidence_assessments ADD COLUMN IF NOT EXISTS shap_explanation JSONB;
ALTER TABLE evidence_assessments ADD COLUMN IF NOT EXISTS model_version TEXT NOT NULL DEFAULT 'evidence-linear-v2';
CREATE INDEX IF NOT EXISTS idx_applications_funding_lender ON applications(funding_lender_user_id);
UPDATE applications SET status='loanofficer_review' WHERE status='admin_review';
UPDATE applications SET funding_status='assigned' WHERE status='approved' AND funding_lender_user_id IS NOT NULL AND funding_status='not_assigned';