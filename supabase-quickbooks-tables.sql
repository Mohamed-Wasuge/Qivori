-- ─── QuickBooks Online Integration Tables ───────────────────────────────────
-- Run this in your Supabase SQL editor

-- QuickBooks OAuth connections (one per user)
CREATE TABLE IF NOT EXISTS quickbooks_connections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  realm_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  company_name TEXT,
  connected_at TIMESTAMPTZ DEFAULT now(),
  last_sync TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_qb_connections_user_id ON quickbooks_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_qb_connections_realm_id ON quickbooks_connections(realm_id);

ALTER TABLE quickbooks_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can read own QB connection"
  ON quickbooks_connections FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY IF NOT EXISTS "Service role full access on qb_connections"
  ON quickbooks_connections FOR ALL
  USING (true)
  WITH CHECK (true);

-- QuickBooks sync log (audit trail for every sync operation)
CREATE TABLE IF NOT EXISTS quickbooks_sync_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  connection_id UUID REFERENCES quickbooks_connections(id) ON DELETE CASCADE NOT NULL,
  sync_type TEXT NOT NULL CHECK (sync_type IN ('invoice', 'expense', 'payment', 'full')),
  direction TEXT NOT NULL DEFAULT 'push' CHECK (direction IN ('push', 'pull')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'error', 'partial')),
  records_synced INTEGER DEFAULT 0,
  records_failed INTEGER DEFAULT 0,
  error_message TEXT,
  details JSONB DEFAULT '{}',
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qb_sync_log_user_id ON quickbooks_sync_log(user_id);
CREATE INDEX IF NOT EXISTS idx_qb_sync_log_connection_id ON quickbooks_sync_log(connection_id);
CREATE INDEX IF NOT EXISTS idx_qb_sync_log_status ON quickbooks_sync_log(status);
CREATE INDEX IF NOT EXISTS idx_qb_sync_log_created_at ON quickbooks_sync_log(created_at DESC);

ALTER TABLE quickbooks_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can read own QB sync logs"
  ON quickbooks_sync_log FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY IF NOT EXISTS "Service role full access on qb_sync_log"
  ON quickbooks_sync_log FOR ALL
  USING (true)
  WITH CHECK (true);

-- Updated_at trigger for connections
CREATE OR REPLACE FUNCTION update_qb_connection_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS qb_connections_updated_at ON quickbooks_connections;
CREATE TRIGGER qb_connections_updated_at
  BEFORE UPDATE ON quickbooks_connections
  FOR EACH ROW
  EXECUTE FUNCTION update_qb_connection_updated_at();
