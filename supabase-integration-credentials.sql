-- Integration credentials table — stores encrypted OAuth tokens & API keys
-- All credentials are AES-256-GCM encrypted before storage
CREATE TABLE IF NOT EXISTS integration_credentials (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  encrypted_credentials text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(owner_id, provider)
);

-- RLS: carriers can only see their own credentials
ALTER TABLE integration_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own integration credentials"
  ON integration_credentials FOR ALL
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_integration_credentials_lookup
  ON integration_credentials (owner_id, provider);
