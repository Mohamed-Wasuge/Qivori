-- Migration 007: Never Leave Qivori feature tables
-- broker_intelligence, maintenance_records, truck_financials,
-- insurance_records, driver_scorecards, load_board_stats

-- ── Broker Intelligence ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS broker_intelligence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  truck_id UUID,
  broker_name TEXT NOT NULL,
  broker_email TEXT,
  broker_phone TEXT,
  mc_number TEXT,
  loads_booked INTEGER DEFAULT 0,
  loads_cancelled INTEGER DEFAULT 0,
  loads_rejected INTEGER DEFAULT 0,
  total_gross NUMERIC DEFAULT 0,
  avg_rate NUMERIC DEFAULT 0,
  avg_miles NUMERIC DEFAULT 0,
  avg_rpm NUMERIC DEFAULT 0,
  days_to_pay_avg NUMERIC DEFAULT 0,
  last_load_at TIMESTAMPTZ,
  blacklisted BOOLEAN DEFAULT false,
  blacklisted_at TIMESTAMPTZ,
  blacklist_reason TEXT,
  tags TEXT[] DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE broker_intelligence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own broker intel" ON broker_intelligence FOR ALL
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Admins manage all broker intel" ON broker_intelligence FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager')));
CREATE INDEX IF NOT EXISTS broker_intel_owner ON broker_intelligence(owner_id, blacklisted, last_load_at DESC);

-- ── Maintenance Records ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS maintenance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  truck_id UUID NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('oil_change','tire_rotation','brake_inspection','dot_annual','pm_service','repair','other')),
  description TEXT,
  cost NUMERIC DEFAULT 0,
  mileage_at_service INTEGER,
  next_service_mileage INTEGER,
  next_service_date DATE,
  vendor TEXT,
  status TEXT DEFAULT 'completed' CHECK (status IN ('completed','scheduled','overdue')),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE maintenance_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own maintenance" ON maintenance_records FOR ALL
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE INDEX IF NOT EXISTS maintenance_owner ON maintenance_records(owner_id, truck_id, created_at DESC);

-- ── Truck Financials ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS truck_financials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  truck_id UUID NOT NULL UNIQUE,
  purchase_price NUMERIC DEFAULT 0,
  purchase_date DATE,
  down_payment NUMERIC DEFAULT 0,
  loan_balance NUMERIC DEFAULT 0,
  monthly_payment NUMERIC DEFAULT 0,
  interest_rate NUMERIC DEFAULT 0,
  lender TEXT,
  payoff_date DATE,
  total_revenue NUMERIC DEFAULT 0,
  total_expenses NUMERIC DEFAULT 0,
  total_fuel NUMERIC DEFAULT 0,
  total_maintenance NUMERIC DEFAULT 0,
  total_miles INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE truck_financials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own truck financials" ON truck_financials FOR ALL
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE INDEX IF NOT EXISTS truck_financials_owner ON truck_financials(owner_id);

-- ── Insurance Records ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS insurance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('primary_liability','cargo','physical_damage','bobtail','workers_comp','umbrella','other')),
  carrier_name TEXT NOT NULL,
  policy_number TEXT,
  coverage_amount NUMERIC,
  deductible NUMERIC,
  premium_monthly NUMERIC,
  effective_date DATE,
  expiry_date DATE NOT NULL,
  agent_name TEXT,
  agent_phone TEXT,
  agent_email TEXT,
  document_url TEXT,
  auto_attach_to_packet BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','expired','cancelled')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE insurance_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own insurance" ON insurance_records FOR ALL
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE INDEX IF NOT EXISTS insurance_owner ON insurance_records(owner_id, expiry_date);

-- ── Driver Scorecards ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS driver_scorecards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  driver_id UUID REFERENCES profiles(id),
  truck_id UUID,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  loads_completed INTEGER DEFAULT 0,
  loads_on_time INTEGER DEFAULT 0,
  total_miles INTEGER DEFAULT 0,
  total_gross NUMERIC DEFAULT 0,
  avg_rpm NUMERIC DEFAULT 0,
  hos_violations INTEGER DEFAULT 0,
  dvir_defects INTEGER DEFAULT 0,
  fuel_efficiency NUMERIC DEFAULT 0,
  score INTEGER DEFAULT 0,
  badge TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE driver_scorecards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own scorecards" ON driver_scorecards FOR ALL
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE INDEX IF NOT EXISTS scorecards_owner ON driver_scorecards(owner_id, period_start DESC);

-- ── Load Board Stats ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS load_board_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  board TEXT NOT NULL CHECK (board IN ('dat','123loadboard','truckstop','direct','other')),
  period DATE NOT NULL,
  loads_viewed INTEGER DEFAULT 0,
  loads_booked INTEGER DEFAULT 0,
  total_gross NUMERIC DEFAULT 0,
  total_miles NUMERIC DEFAULT 0,
  avg_rpm NUMERIC DEFAULT 0,
  conversion_rate NUMERIC DEFAULT 0,
  subscription_cost NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(owner_id, board, period)
);

ALTER TABLE load_board_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own board stats" ON load_board_stats FOR ALL
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE INDEX IF NOT EXISTS board_stats_owner ON load_board_stats(owner_id, board, period DESC);
