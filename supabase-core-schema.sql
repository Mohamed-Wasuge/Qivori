-- ═══════════════════════════════════════════════════════════════════════════════
-- QIVORI AI — Core Schema Extension (Phase 1)
-- Audit logs + Carrier dispatch settings + Compliance checks + Maintenance
-- Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. AUDIT LOGS ────────────────────────────────────────────────────────────
-- Tracks every critical change: load status, driver assignment, compliance override, etc.
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  actor_id UUID REFERENCES auth.users(id),        -- who performed the action
  actor_role TEXT,                                  -- owner | admin | dispatcher | driver
  action TEXT NOT NULL,                             -- e.g. 'load.status_change', 'dispatch.override', 'compliance.override'
  entity_type TEXT NOT NULL,                        -- 'load', 'driver', 'vehicle', 'invoice', 'dispatch_decision'
  entity_id TEXT,                                   -- the ID of the affected record
  old_value JSONB,                                  -- previous state (relevant fields)
  new_value JSONB,                                  -- new state (relevant fields)
  reason TEXT,                                      -- why the change was made (required for overrides)
  metadata JSONB DEFAULT '{}',                      -- extra context (IP, user-agent, etc.)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own audit logs"
  ON audit_logs FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "Service can insert audit logs"
  ON audit_logs FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE INDEX idx_audit_logs_owner ON audit_logs(owner_id);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_date ON audit_logs(created_at DESC);

-- ── 2. CARRIER SETTINGS (dispatch thresholds + compliance rules) ─────────────
-- One row per carrier — configurable dispatch rules that the AI engine reads
CREATE TABLE IF NOT EXISTS carrier_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,

  -- Dispatch thresholds
  min_profit INTEGER DEFAULT 800,                   -- hard reject below this ($)
  min_rpm NUMERIC(6,2) DEFAULT 1.00,                -- minimum revenue per mile
  min_profit_per_day INTEGER DEFAULT 400,            -- minimum profit per day ($)
  max_deadhead_miles INTEGER DEFAULT 150,            -- max empty miles to pickup
  max_deadhead_pct NUMERIC(4,2) DEFAULT 15.0,       -- max deadhead as % of loaded miles
  preferred_max_weight INTEGER DEFAULT 37000,        -- preferred max weight (lbs)
  auto_book_confidence INTEGER DEFAULT 75,           -- min confidence to auto-book (0-100)
  auto_book_enabled BOOLEAN DEFAULT true,            -- master switch for auto-booking

  -- Fuel
  fuel_cost_per_mile NUMERIC(6,4) DEFAULT 0.55,     -- $/mile fuel cost

  -- Compliance enforcement
  enforce_compliance BOOLEAN DEFAULT true,           -- block dispatch if compliance fails
  hos_min_hours NUMERIC(4,1) DEFAULT 6.0,            -- min HOS hours required to dispatch
  block_expired_cdl BOOLEAN DEFAULT true,
  block_expired_medical BOOLEAN DEFAULT true,
  block_active_defects BOOLEAN DEFAULT true,         -- block if unresolved DVIR defects
  block_failed_drug_test BOOLEAN DEFAULT true,
  block_expired_insurance BOOLEAN DEFAULT true,

  -- Financial rules
  default_payment_terms TEXT DEFAULT 'NET 30',
  auto_invoice_on_delivery BOOLEAN DEFAULT true,
  factoring_company TEXT,
  factoring_rate NUMERIC(4,2) DEFAULT 2.50,

  -- Driver preferences
  preferred_regions TEXT[],                          -- e.g. {'midwest','southeast'}
  preferred_equipment TEXT[],                        -- e.g. {'Dry Van','Reefer'}
  home_time_days INTEGER DEFAULT 14,                -- days out before home time

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE carrier_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own settings"
  ON carrier_settings FOR ALL
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- ── 3. VEHICLE MAINTENANCE RECORDS ───────────────────────────────────────────
-- PM schedules, repairs, annual inspections
CREATE TABLE IF NOT EXISTS vehicle_maintenance (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  vehicle_id UUID REFERENCES vehicles(id) ON DELETE CASCADE,
  maintenance_type TEXT NOT NULL,                    -- 'pm', 'repair', 'annual_inspection', 'tire', 'brake', 'oil_change'
  description TEXT,
  vendor TEXT,
  cost NUMERIC(10,2) DEFAULT 0,
  odometer_at_service INTEGER,                      -- miles at time of service
  next_due_miles INTEGER,                           -- next PM due at this mileage
  next_due_date DATE,                               -- or by this date
  status TEXT DEFAULT 'completed',                  -- 'scheduled', 'in_progress', 'completed', 'overdue'
  documents JSONB DEFAULT '[]',                     -- [{url, name}]
  performed_by TEXT,                                -- mechanic name
  notes TEXT,
  service_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE vehicle_maintenance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own maintenance"
  ON vehicle_maintenance FOR ALL
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE INDEX idx_maintenance_vehicle ON vehicle_maintenance(vehicle_id);
CREATE INDEX idx_maintenance_date ON vehicle_maintenance(service_date DESC);
CREATE INDEX idx_maintenance_next_due ON vehicle_maintenance(next_due_date);

-- ── 4. COMPLIANCE CHECKS LOG ─────────────────────────────────────────────────
-- Every pre-dispatch compliance check is recorded for audit purposes
CREATE TABLE IF NOT EXISTS compliance_checks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  driver_id UUID REFERENCES drivers(id),
  vehicle_id UUID REFERENCES vehicles(id),
  load_id TEXT,                                     -- load being dispatched
  dispatch_decision_id UUID,                        -- linked dispatch decision
  check_type TEXT NOT NULL,                         -- 'pre_dispatch', 'periodic', 'manual'
  overall_status TEXT NOT NULL,                     -- 'pass', 'fail', 'warn'

  -- Individual check results
  checks JSONB NOT NULL DEFAULT '{}',
  -- Example:
  -- {
  --   "cdl_valid": { "status": "pass", "detail": "Expires 2027-03-15" },
  --   "medical_card": { "status": "fail", "detail": "Expired 2026-01-20" },
  --   "hos_available": { "status": "pass", "detail": "8.5h remaining" },
  --   "dvir_clear": { "status": "warn", "detail": "Minor defect: tire wear" },
  --   "drug_test": { "status": "pass", "detail": "Last test: Clear (2026-02-10)" },
  --   "insurance": { "status": "pass", "detail": "Expires 2026-12-31" },
  --   "annual_inspection": { "status": "pass", "detail": "Last: 2026-01-15" }
  -- }

  failing_checks TEXT[],                            -- list of check names that failed
  override_by UUID REFERENCES auth.users(id),       -- who overrode the block (if any)
  override_reason TEXT,                             -- why it was overridden

  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE compliance_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own compliance checks"
  ON compliance_checks FOR ALL
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE INDEX idx_compliance_checks_driver ON compliance_checks(driver_id);
CREATE INDEX idx_compliance_checks_load ON compliance_checks(load_id);
CREATE INDEX idx_compliance_checks_date ON compliance_checks(created_at DESC);

-- ── 5. ADD COLUMNS TO EXISTING TABLES ────────────────────────────────────────

-- Add compliance_status and override fields to dispatch_decisions
ALTER TABLE dispatch_decisions
  ADD COLUMN IF NOT EXISTS compliance_status TEXT DEFAULT 'unchecked',  -- 'pass', 'fail', 'warn', 'overridden', 'unchecked'
  ADD COLUMN IF NOT EXISTS compliance_checks JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS failing_compliance TEXT[],
  ADD COLUMN IF NOT EXISTS override_by UUID,
  ADD COLUMN IF NOT EXISTS override_reason TEXT,
  ADD COLUMN IF NOT EXISTS next_best_option JSONB,                      -- alternative load/driver suggestion
  ADD COLUMN IF NOT EXISTS hold_reason TEXT;                             -- reason if decision = 'hold'

-- Add availability + last_location to drivers
ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS is_available BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS availability_status TEXT DEFAULT 'ready',     -- 'ready', 'driving', 'rest', 'off_duty', 'home_time'
  ADD COLUMN IF NOT EXISTS last_location TEXT,
  ADD COLUMN IF NOT EXISTS last_location_lat NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS last_location_lng NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS last_location_updated TIMESTAMPTZ;

-- Add maintenance tracking to vehicles
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS last_pm_date DATE,
  ADD COLUMN IF NOT EXISTS last_pm_miles INTEGER,
  ADD COLUMN IF NOT EXISTS next_pm_due_miles INTEGER,
  ADD COLUMN IF NOT EXISTS next_pm_due_date DATE,
  ADD COLUMN IF NOT EXISTS annual_inspection_date DATE,
  ADD COLUMN IF NOT EXISTS annual_inspection_due DATE,
  ADD COLUMN IF NOT EXISTS out_of_service BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS out_of_service_reason TEXT;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Done. Run in order. All tables have RLS + owner_id.
-- ═══════════════════════════════════════════════════════════════════════════════
