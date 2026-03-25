-- Dispatch Engine: Tables for centralized AI dispatch decisions
-- Run this migration in your Supabase SQL editor

-- Dispatch decisions log
CREATE TABLE IF NOT EXISTS dispatch_decisions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) NOT NULL,
  load_id TEXT,
  driver_id UUID,
  driver_type TEXT CHECK (driver_type IN ('owner_operator', 'company_driver')),
  decision TEXT NOT NULL CHECK (decision IN ('reject', 'negotiate', 'accept', 'auto_book')),
  confidence INTEGER,
  reasons JSONB DEFAULT '[]',
  metrics JSONB DEFAULT '{}',
  negotiation JSONB,
  load_data JSONB DEFAULT '{}',
  auto_booked BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dispatch_dec_owner ON dispatch_decisions(owner_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_dec_decision ON dispatch_decisions(decision);
CREATE INDEX IF NOT EXISTS idx_dispatch_dec_created ON dispatch_decisions(created_at);

ALTER TABLE dispatch_decisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users see own dispatch decisions" ON dispatch_decisions;
CREATE POLICY "Users see own dispatch decisions" ON dispatch_decisions FOR SELECT USING (auth.uid() = owner_id);
DROP POLICY IF EXISTS "Service role dispatch decisions" ON dispatch_decisions;
CREATE POLICY "Service role dispatch decisions" ON dispatch_decisions FOR ALL USING ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

-- Broker urgency scores
CREATE TABLE IF NOT EXISTS broker_urgency_scores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) NOT NULL,
  broker_name TEXT NOT NULL,
  urgency_score INTEGER DEFAULT 50 CHECK (urgency_score >= 0 AND urgency_score <= 100),
  signals JSONB DEFAULT '[]',
  call_count INTEGER DEFAULT 0,
  last_call_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(owner_id, broker_name)
);

CREATE INDEX IF NOT EXISTS idx_broker_urgency_owner ON broker_urgency_scores(owner_id);
ALTER TABLE broker_urgency_scores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users see own broker urgency" ON broker_urgency_scores;
CREATE POLICY "Users see own broker urgency" ON broker_urgency_scores FOR SELECT USING (auth.uid() = owner_id);
DROP POLICY IF EXISTS "Service role broker urgency" ON broker_urgency_scores;
CREATE POLICY "Service role broker urgency" ON broker_urgency_scores FOR ALL USING ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

-- Add driver_type to drivers table
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='drivers' AND column_name='driver_type') THEN
    ALTER TABLE drivers ADD COLUMN driver_type TEXT DEFAULT 'company_driver' CHECK (driver_type IN ('owner_operator', 'company_driver'));
  END IF;
END $$;
