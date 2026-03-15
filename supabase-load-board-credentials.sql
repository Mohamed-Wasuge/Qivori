-- Load Board Credentials table — stores encrypted per-user API credentials
-- Run this in your Supabase SQL editor

CREATE TABLE IF NOT EXISTS load_board_credentials (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('dat', '123loadboard', 'truckstop')),
  encrypted_credentials TEXT NOT NULL,
  encryption_iv TEXT DEFAULT '',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'connected', 'error')),
  connected_at TIMESTAMPTZ DEFAULT now(),
  last_tested TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),

  -- Each user can only have one connection per provider
  UNIQUE(user_id, provider)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_lbc_user_id ON load_board_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_lbc_user_provider ON load_board_credentials(user_id, provider);
CREATE INDEX IF NOT EXISTS idx_lbc_status ON load_board_credentials(status);

-- Row Level Security — users can only see their own credentials
ALTER TABLE load_board_credentials ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own credentials
CREATE POLICY "Users can read own credentials"
  ON load_board_credentials FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own credentials
CREATE POLICY "Users can insert own credentials"
  ON load_board_credentials FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own credentials
CREATE POLICY "Users can update own credentials"
  ON load_board_credentials FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy: Users can delete their own credentials
CREATE POLICY "Users can delete own credentials"
  ON load_board_credentials FOR DELETE
  USING (auth.uid() = user_id);

-- Service role can access all (for the API route using service key)
-- The service key bypasses RLS automatically in Supabase
