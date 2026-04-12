-- Migration: Q Mobile app columns + IFTA records table
-- Run in Supabase SQL Editor

-- 1. profiles: Q online status + route intelligence
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS q_online BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_online BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS preferred_route TEXT,
  ADD COLUMN IF NOT EXISTS auto_intent TEXT;

-- 2. IFTA records table (quarterly fuel/mileage tracking)
CREATE TABLE IF NOT EXISTS ifta_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  quarter TEXT NOT NULL,        -- e.g. '2025-Q1'
  year INT NOT NULL,
  state TEXT NOT NULL,          -- 2-letter state code
  miles NUMERIC DEFAULT 0,
  gallons NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, quarter, state)
);

-- RLS for ifta_records
ALTER TABLE ifta_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own IFTA records"
  ON ifta_records FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins see all IFTA records"
  ON ifta_records FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'manager')
    )
  );

-- Index for fast quarterly queries
CREATE INDEX IF NOT EXISTS ifta_records_user_quarter ON ifta_records(user_id, quarter);

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_ifta_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ifta_updated_at ON ifta_records;
CREATE TRIGGER ifta_updated_at
  BEFORE UPDATE ON ifta_records
  FOR EACH ROW EXECUTE FUNCTION update_ifta_updated_at();
