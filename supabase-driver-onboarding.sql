-- Driver self-service onboarding submissions
-- Stores data submitted by drivers via the public onboarding form

CREATE TABLE IF NOT EXISTS driver_onboarding_submissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  invite_token TEXT NOT NULL,
  company_id UUID,
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT,
  onboarding_data JSONB DEFAULT '{}',
  completed_steps TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'reviewed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_driver_onboard_token ON driver_onboarding_submissions(invite_token);
CREATE INDEX IF NOT EXISTS idx_driver_onboard_company ON driver_onboarding_submissions(company_id);
CREATE INDEX IF NOT EXISTS idx_driver_onboard_status ON driver_onboarding_submissions(status);

ALTER TABLE driver_onboarding_submissions ENABLE ROW LEVEL SECURITY;

-- Service role needs full access (API uses service key)
DROP POLICY IF EXISTS "Service role full access on driver_onboarding" ON driver_onboarding_submissions;
CREATE POLICY "Service role full access on driver_onboarding"
  ON driver_onboarding_submissions FOR ALL
  USING (true)
  WITH CHECK (true);

-- Carriers can view submissions for their company
DROP POLICY IF EXISTS "Users can view own company onboarding" ON driver_onboarding_submissions;
CREATE POLICY "Users can view own company onboarding"
  ON driver_onboarding_submissions FOR SELECT
  USING (invited_by = auth.uid());
