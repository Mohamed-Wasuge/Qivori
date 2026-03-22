-- ═══════════════════════════════════════════════════════════════
-- QIVORI AI — Settlements Table + Driver Pay Columns
-- Paste into: Supabase Dashboard → SQL Editor → New Query → Run
-- ═══════════════════════════════════════════════════════════════

-- 1. Drop old settlements table if it exists (from previous migration)
DROP TABLE IF EXISTS settlements CASCADE;

-- 2. Settlements table — persist every settlement run
CREATE TABLE settlements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
  driver_name TEXT NOT NULL,
  period_start DATE,
  period_end DATE,
  loads JSONB DEFAULT '[]',
  load_count INT DEFAULT 0,
  gross_pay NUMERIC(10,2) DEFAULT 0,
  deductions JSONB DEFAULT '[]',
  total_deductions NUMERIC(10,2) DEFAULT 0,
  net_pay NUMERIC(10,2) DEFAULT 0,
  pay_model TEXT DEFAULT 'percent',
  pay_rate NUMERIC(10,2) DEFAULT 28,
  fuel_cost_per_mile NUMERIC(6,3) DEFAULT 0.22,
  status TEXT DEFAULT 'draft',
  paid_at TIMESTAMPTZ,
  payment_method TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE settlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can manage settlements" ON settlements
  FOR ALL USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE INDEX idx_settlements_owner ON settlements(owner_id);
CREATE INDEX idx_settlements_driver ON settlements(driver_id);
CREATE INDEX idx_settlements_status ON settlements(status);

-- 3. Add pay_model and pay_rate columns to drivers table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'drivers' AND column_name = 'pay_model'
  ) THEN
    ALTER TABLE drivers ADD COLUMN pay_model TEXT DEFAULT 'percent';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'drivers' AND column_name = 'pay_rate'
  ) THEN
    ALTER TABLE drivers ADD COLUMN pay_rate NUMERIC(10,2) DEFAULT 28;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- DONE!
-- ═══════════════════════════════════════════════════════════════
