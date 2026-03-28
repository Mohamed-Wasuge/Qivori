-- ═══════════════════════════════════════════════════════════════
-- PAYROLL EXTRAS — Escrow, Fuel Cards, Advances
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- 1. Escrow / Reserve Fund ledger
CREATE TABLE IF NOT EXISTS driver_escrow (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  owner_id UUID REFERENCES auth.users(id),
  type TEXT NOT NULL CHECK (type IN ('hold','release','adjustment')),
  amount NUMERIC(10,2) NOT NULL,
  description TEXT,
  payroll_id UUID REFERENCES driver_payroll(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_escrow_driver ON driver_escrow (driver_id, created_at DESC);
ALTER TABLE driver_escrow ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage escrow" ON driver_escrow
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Service role full access on driver_escrow" ON driver_escrow
  FOR ALL USING (true) WITH CHECK (true);

-- 2. Fuel Card transactions
CREATE TABLE IF NOT EXISTS driver_fuel_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  owner_id UUID REFERENCES auth.users(id),
  transaction_date DATE NOT NULL,
  station TEXT,
  city TEXT,
  state TEXT,
  gallons NUMERIC(8,3),
  amount NUMERIC(10,2) NOT NULL,
  card_last4 TEXT,
  deducted_in_payroll_id UUID REFERENCES driver_payroll(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fuel_cards_driver ON driver_fuel_cards (driver_id, transaction_date DESC);
ALTER TABLE driver_fuel_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage fuel cards" ON driver_fuel_cards
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Service role full access on driver_fuel_cards" ON driver_fuel_cards
  FOR ALL USING (true) WITH CHECK (true);

-- 3. Advances / Draws
CREATE TABLE IF NOT EXISTS driver_advances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  owner_id UUID REFERENCES auth.users(id),
  amount NUMERIC(10,2) NOT NULL,
  type TEXT NOT NULL DEFAULT 'advance' CHECK (type IN ('advance','repayment')),
  description TEXT,
  advance_date DATE NOT NULL DEFAULT CURRENT_DATE,
  deducted_in_payroll_id UUID REFERENCES driver_payroll(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_advances_driver ON driver_advances (driver_id, advance_date DESC);
ALTER TABLE driver_advances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage advances" ON driver_advances
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Service role full access on driver_advances" ON driver_advances
  FOR ALL USING (true) WITH CHECK (true);

-- 4. Add address and tax ID fields to drivers (for 1099-NEC)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'address') THEN
    ALTER TABLE drivers ADD COLUMN address TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'tax_id_last4') THEN
    ALTER TABLE drivers ADD COLUMN tax_id_last4 TEXT;
  END IF;
END $$;
