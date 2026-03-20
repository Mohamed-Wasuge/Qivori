-- Negotiation Settings Table
-- Stores per-user AI negotiation preferences used by the call handler

CREATE TABLE IF NOT EXISTS negotiation_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) UNIQUE NOT NULL,
  min_rate_per_mile DECIMAL(6,2) DEFAULT 2.50,
  counter_offer_markup_pct INTEGER DEFAULT 10,
  max_counter_rounds INTEGER DEFAULT 2,
  auto_accept_above_minimum BOOLEAN DEFAULT false,
  notify_driver_on_offer BOOLEAN DEFAULT true,
  driver_response_timeout_minutes INTEGER DEFAULT 5,
  preferred_lanes JSONB DEFAULT '[]',
  avoid_states JSONB DEFAULT '[]',
  blacklisted_brokers JSONB DEFAULT '[]',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_negotiation_settings_user ON negotiation_settings(user_id);

-- RLS
ALTER TABLE negotiation_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own negotiation_settings" ON negotiation_settings
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Service role full access negotiation_settings" ON negotiation_settings
  FOR ALL USING (auth.role() = 'service_role');
