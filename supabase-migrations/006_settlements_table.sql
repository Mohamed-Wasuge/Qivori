-- Migration 006: settlements table
-- Tracks per-load fee collection and driver take-home

CREATE TABLE IF NOT EXISTS settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  load_id TEXT,
  load_number TEXT,
  gross NUMERIC NOT NULL,
  fee NUMERIC NOT NULL,
  net NUMERIC NOT NULL,
  fee_rate NUMERIC DEFAULT 0.03,
  stripe_charge_id TEXT,
  stripe_status TEXT DEFAULT 'pending',
  factoring_notified BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'settled' CHECK (status IN ('settled', 'pending', 'failed')),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE settlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own settlements"
  ON settlements FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own settlements"
  ON settlements FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins manage all settlements"
  ON settlements FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager'))
  );

CREATE INDEX IF NOT EXISTS settlements_user_id ON settlements(user_id, created_at DESC);
