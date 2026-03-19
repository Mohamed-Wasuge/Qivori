-- ═══════════════════════════════════════════════════════════════
-- TRUCKING HR MODULE — Database Tables
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- 1. Driver DQ Files — FMCSA-required Driver Qualification Files
CREATE TABLE IF NOT EXISTS driver_dq_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  owner_id UUID REFERENCES auth.users(id),
  doc_type TEXT NOT NULL CHECK (doc_type IN (
    'cdl','medical_card','mvr','employment_history','road_test',
    'annual_review','drug_pre_employment','drug_random','drug_post_accident',
    'background_check','ssp_certification','w9','direct_deposit',
    'insurance','hazmat_endorsement','twic_card','passport','social_security',
    'application','offer_letter','termination_letter','other'
  )),
  file_name TEXT NOT NULL,
  file_url TEXT,
  file_size INT,
  status TEXT NOT NULL DEFAULT 'valid' CHECK (status IN ('valid','expiring_soon','expired','pending','rejected')),
  issued_date DATE,
  expiry_date DATE,
  notes TEXT,
  verified_by TEXT,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_dq_files_driver ON driver_dq_files (driver_id, doc_type);
CREATE INDEX idx_dq_files_expiry ON driver_dq_files (expiry_date) WHERE expiry_date IS NOT NULL;
CREATE INDEX idx_dq_files_status ON driver_dq_files (status);

ALTER TABLE driver_dq_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage their driver DQ files" ON driver_dq_files
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Service role full access on driver_dq_files" ON driver_dq_files
  FOR ALL USING (true) WITH CHECK (true);

-- 2. Drug & Alcohol Tests — DOT/FMCSA compliance tracking
CREATE TABLE IF NOT EXISTS driver_drug_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  owner_id UUID REFERENCES auth.users(id),
  test_type TEXT NOT NULL CHECK (test_type IN (
    'pre_employment','random','post_accident','reasonable_suspicion',
    'return_to_duty','follow_up'
  )),
  substance TEXT NOT NULL DEFAULT 'both' CHECK (substance IN ('drug','alcohol','both')),
  test_date DATE NOT NULL,
  result TEXT CHECK (result IN ('negative','positive','refused','cancelled','pending')),
  lab_name TEXT,
  mro_name TEXT,
  collection_site TEXT,
  chain_of_custody_num TEXT,
  notes TEXT,
  clearinghouse_reported BOOLEAN DEFAULT false,
  clearinghouse_date DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_drug_tests_driver ON driver_drug_tests (driver_id, test_date DESC);
CREATE INDEX idx_drug_tests_type ON driver_drug_tests (test_type);

ALTER TABLE driver_drug_tests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage their drug tests" ON driver_drug_tests
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Service role full access on driver_drug_tests" ON driver_drug_tests
  FOR ALL USING (true) WITH CHECK (true);

-- 3. Driver Incidents — accidents, violations, disciplinary actions
CREATE TABLE IF NOT EXISTS driver_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  owner_id UUID REFERENCES auth.users(id),
  incident_type TEXT NOT NULL CHECK (incident_type IN (
    'accident','dot_inspection','traffic_violation','cargo_damage',
    'late_delivery','customer_complaint','policy_violation',
    'safety_violation','equipment_damage','other'
  )),
  severity TEXT NOT NULL DEFAULT 'minor' CHECK (severity IN ('critical','major','minor','info')),
  incident_date DATE NOT NULL,
  location TEXT,
  description TEXT NOT NULL,
  csa_points INT DEFAULT 0,
  dot_reportable BOOLEAN DEFAULT false,
  preventable BOOLEAN,
  corrective_action TEXT,
  resolution TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','resolved','closed')),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_incidents_driver ON driver_incidents (driver_id, incident_date DESC);
CREATE INDEX idx_incidents_type ON driver_incidents (incident_type);
CREATE INDEX idx_incidents_status ON driver_incidents (status);

ALTER TABLE driver_incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage their incidents" ON driver_incidents
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Service role full access on driver_incidents" ON driver_incidents
  FOR ALL USING (true) WITH CHECK (true);

-- 4. Driver Payroll — 1099 tracking, per diem, direct deposit
CREATE TABLE IF NOT EXISTS driver_payroll (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  owner_id UUID REFERENCES auth.users(id),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  gross_pay NUMERIC(10,2) DEFAULT 0,
  deductions NUMERIC(10,2) DEFAULT 0,
  per_diem NUMERIC(10,2) DEFAULT 0,
  fuel_advance NUMERIC(10,2) DEFAULT 0,
  net_pay NUMERIC(10,2) DEFAULT 0,
  miles_driven INT DEFAULT 0,
  loads_completed INT DEFAULT 0,
  pay_method TEXT DEFAULT 'ach' CHECK (pay_method IN ('ach','check','zelle','wire','cash')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','paid','void')),
  paid_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_payroll_driver ON driver_payroll (driver_id, period_start DESC);
CREATE INDEX idx_payroll_status ON driver_payroll (status);

ALTER TABLE driver_payroll ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage their payroll" ON driver_payroll
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Service role full access on driver_payroll" ON driver_payroll
  FOR ALL USING (true) WITH CHECK (true);
