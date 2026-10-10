CREATE TABLE IF NOT EXISTS evidence_assessments (
  id BIGSERIAL PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  prepared_by_user_id BIGINT NOT NULL REFERENCES app_users(id),
  verified_monthly_income NUMERIC(12,2) NOT NULL,
  income_variation_percent NUMERIC(5,2) NOT NULL,
  bank_statement_months INTEGER NOT NULL,
  utility_bills_reviewed INTEGER NOT NULL DEFAULT 0,
  utility_bills_on_time INTEGER NOT NULL DEFAULT 0,
  utility_bills_late INTEGER NOT NULL DEFAULT 0,
  utility_bills_missed INTEGER NOT NULL DEFAULT 0,
  verified_work_months INTEGER NOT NULL,
  monthly_obligations NUMERIC(12,2) NOT NULL DEFAULT 0,
  evidence_notes TEXT NOT NULL,
  score_version TEXT NOT NULL DEFAULT 'evidence-index-v1',
  trustcred_score INTEGER NOT NULL,
  bill_payment_score INTEGER,
  estimated_eligible_amount NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_evidence_assessment_preparer ON evidence_assessments(prepared_by_user_id);
CREATE INDEX IF NOT EXISTS idx_evidence_assessment_created_at ON evidence_assessments(created_at);
CREATE INDEX IF NOT EXISTS idx_evidence_assessment_app_created ON evidence_assessments(application_id, created_at DESC);