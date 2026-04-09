-- ─────────────────────────────────────────────────────────────────
-- Negotiation Messages — live broker chatter during a Q call
-- ─────────────────────────────────────────────────────────────────
-- Q (the Retell agent) calls a notify_driver function during the call
-- whenever the broker says something meaningful (quotes a rate, asks
-- for insurance, asks pickup time, etc). That function hits
-- /api/q-notify which writes a row here. The driver app subscribes
-- via Supabase realtime and renders messages on the dialing screen.
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS negotiation_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  retell_call_id TEXT NOT NULL,
  load_id UUID,
  broker_name TEXT,
  -- 'broker_quoted' | 'broker_asking' | 'broker_countered' |
  -- 'q_relaying' | 'broker_walked' | 'general'
  message_type TEXT DEFAULT 'general',
  message TEXT NOT NULL,
  rate_value NUMERIC,        -- when broker quotes/counters a number
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for the realtime filter (most recent messages per call)
CREATE INDEX IF NOT EXISTS idx_negmsg_call ON negotiation_messages(retell_call_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_negmsg_user ON negotiation_messages(user_id, created_at DESC);

-- RLS — users see only their own messages
ALTER TABLE negotiation_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see their own negotiation messages"
  ON negotiation_messages FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert"
  ON negotiation_messages FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
