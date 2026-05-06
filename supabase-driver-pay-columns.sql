-- Driver pay configuration — separate table (avoids ALTER TABLE permission issue)
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS driver_pay_config (
  driver_id UUID PRIMARY KEY REFERENCES drivers(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pay_model TEXT NOT NULL DEFAULT 'percent' CHECK (pay_model IN ('percent', 'permile', 'flat')),
  pay_rate NUMERIC(8,2) NOT NULL DEFAULT 28,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE driver_pay_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_pay_config" ON driver_pay_config
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
