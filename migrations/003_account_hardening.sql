ALTER TABLE applications ALTER COLUMN customer_user_id SET NOT NULL;
ALTER TABLE documents ALTER COLUMN uploaded_by SET DEFAULT 'Account user';
CREATE INDEX IF NOT EXISTS idx_applications_assigned_lender ON applications(assigned_lender_user_id);
CREATE INDEX IF NOT EXISTS idx_applications_recommender ON applications(recommended_by_user_id);
CREATE INDEX IF NOT EXISTS idx_applications_decider ON applications(decided_by_user_id);
CREATE INDEX IF NOT EXISTS idx_verification_expiry ON verification_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_audit_actor_user ON audit_events(actor_user_id);