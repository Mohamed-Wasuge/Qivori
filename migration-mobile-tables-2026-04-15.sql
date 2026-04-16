-- ═══════════════════════════════════════════════════════════════════════════
-- QIVORI — Mobile Tables Migration  2026-04-15
-- Run in Supabase Dashboard → SQL Editor → New Query → Run All
-- Safe to re-run: all statements use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. PROFILES — missing columns for HomeTimePlannerScreen ─────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS home_city        TEXT,
  ADD COLUMN IF NOT EXISTS home_zip         TEXT,
  ADD COLUMN IF NOT EXISTS home_target_date DATE;

-- ─── 2. NOTIFICATIONS_LOG — add sent_at (NotificationsScreen orders by it) ───
ALTER TABLE notifications_log
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ DEFAULT NOW();

-- Back-fill existing rows so ordering works
UPDATE notifications_log SET sent_at = created_at WHERE sent_at IS NULL;

-- ─── 3. DETENTION_RECORDS ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS detention_records (
  id             UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id       UUID    REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  load_number    TEXT,
  location       TEXT,
  broker_name    TEXT,
  started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at       TIMESTAMPTZ,
  rate_per_hour  NUMERIC DEFAULT 50,
  hours          NUMERIC,
  amount         NUMERIC,
  notes          TEXT,
  invoiced       BOOLEAN DEFAULT false,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE detention_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "detention_own" ON detention_records;
CREATE POLICY "detention_own" ON detention_records FOR ALL USING (owner_id = auth.uid());
DROP POLICY IF EXISTS "detention_service" ON detention_records;
CREATE POLICY "detention_service" ON detention_records FOR ALL
  USING ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

CREATE INDEX IF NOT EXISTS idx_detention_owner  ON detention_records(owner_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_detention_active ON detention_records(owner_id, ended_at) WHERE ended_at IS NULL;

-- ─── 4. TRUCK_FINANCIALS ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS truck_financials (
  id                UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id          UUID    REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  truck_id          UUID    UNIQUE NOT NULL,
  purchase_price    NUMERIC,
  down_payment      NUMERIC,
  loan_balance      NUMERIC,
  monthly_payment   NUMERIC,
  interest_rate     NUMERIC,
  lender            TEXT,
  payoff_date       DATE,
  total_revenue     NUMERIC,
  total_expenses    NUMERIC,
  total_fuel        NUMERIC,
  total_maintenance NUMERIC,
  total_miles       INTEGER,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE truck_financials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "truck_fin_own" ON truck_financials;
CREATE POLICY "truck_fin_own" ON truck_financials FOR ALL USING (owner_id = auth.uid());
DROP POLICY IF EXISTS "truck_fin_service" ON truck_financials;
CREATE POLICY "truck_fin_service" ON truck_financials FOR ALL
  USING ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

CREATE INDEX IF NOT EXISTS idx_truck_fin_owner ON truck_financials(owner_id);

-- ─── 5. IFTA_TRIPS ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ifta_trips (
  id           UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id     UUID    REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  load_number  TEXT,
  quarter      TEXT    NOT NULL,  -- e.g. '2026-Q2'
  state        TEXT    NOT NULL,
  miles        NUMERIC NOT NULL DEFAULT 0,
  date         DATE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ifta_trips ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ifta_trips_own" ON ifta_trips;
CREATE POLICY "ifta_trips_own" ON ifta_trips FOR ALL USING (owner_id = auth.uid());
DROP POLICY IF EXISTS "ifta_trips_service" ON ifta_trips;
CREATE POLICY "ifta_trips_service" ON ifta_trips FOR ALL
  USING ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

CREATE INDEX IF NOT EXISTS idx_ifta_trips_owner   ON ifta_trips(owner_id, quarter);
CREATE INDEX IF NOT EXISTS idx_ifta_trips_quarter ON ifta_trips(quarter);

-- ─── 6. IFTA_RECORDS — gallons per state (read by DriverScorecardScreen) ─────
CREATE TABLE IF NOT EXISTS ifta_records (
  id         UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID    REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  state      TEXT,
  gallons    NUMERIC DEFAULT 0,
  miles      NUMERIC DEFAULT 0,
  quarter    TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ifta_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ifta_records_own" ON ifta_records;
CREATE POLICY "ifta_records_own" ON ifta_records FOR ALL USING (user_id = auth.uid());
DROP POLICY IF EXISTS "ifta_records_service" ON ifta_records;
CREATE POLICY "ifta_records_service" ON ifta_records FOR ALL
  USING ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

CREATE INDEX IF NOT EXISTS idx_ifta_records_user    ON ifta_records(user_id, quarter);

-- ─── 7. SETTLEMENTS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settlements (
  id                  UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id            UUID    REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  load_id             TEXT,
  load_number         TEXT,
  gross               NUMERIC DEFAULT 0,
  fee                 NUMERIC DEFAULT 0,
  net                 NUMERIC DEFAULT 0,
  fee_rate            NUMERIC DEFAULT 0.03,
  stripe_charge_id    TEXT,
  stripe_status       TEXT    DEFAULT 'pending',
  factoring_notified  BOOLEAN DEFAULT false,
  status              TEXT    DEFAULT 'pending',
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE settlements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "settlements_own" ON settlements;
CREATE POLICY "settlements_own" ON settlements FOR SELECT USING (owner_id = auth.uid());
DROP POLICY IF EXISTS "settlements_service" ON settlements;
CREATE POLICY "settlements_service" ON settlements FOR ALL
  USING ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

CREATE INDEX IF NOT EXISTS idx_settlements_owner ON settlements(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_settlements_load  ON settlements(load_number);

-- ─── 8. USER_DOCUMENTS ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_documents (
  id           UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id     UUID    REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name         TEXT,
  category     TEXT,
  mime_type    TEXT,
  size_bytes   INTEGER,
  storage_path TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_docs_own" ON user_documents;
CREATE POLICY "user_docs_own" ON user_documents FOR ALL USING (owner_id = auth.uid());
DROP POLICY IF EXISTS "user_docs_service" ON user_documents;
CREATE POLICY "user_docs_service" ON user_documents FOR ALL
  USING ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

CREATE INDEX IF NOT EXISTS idx_user_docs_owner ON user_documents(owner_id, created_at DESC);

-- ─── 9. FAMILY_CONTACTS ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS family_contacts (
  id                  UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id            UUID    REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name                TEXT    NOT NULL,
  phone               TEXT,
  email               TEXT,
  relationship        TEXT,
  notify_on_delivery  BOOLEAN DEFAULT true,
  notify_on_online    BOOLEAN DEFAULT false,
  notify_on_detention BOOLEAN DEFAULT false,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE family_contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "family_contacts_own" ON family_contacts;
CREATE POLICY "family_contacts_own" ON family_contacts FOR ALL USING (owner_id = auth.uid());
DROP POLICY IF EXISTS "family_contacts_service" ON family_contacts;
CREATE POLICY "family_contacts_service" ON family_contacts FOR ALL
  USING ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

CREATE INDEX IF NOT EXISTS idx_family_contacts_owner ON family_contacts(owner_id);

-- ─── 10. DRIVER_SCORECARDS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS driver_scorecards (
  id                UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id          UUID    REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  period_start      DATE    NOT NULL,
  period_end        DATE,
  loads_completed   INTEGER DEFAULT 0,
  loads_on_time     INTEGER DEFAULT 0,
  total_gross       NUMERIC DEFAULT 0,
  total_miles       NUMERIC DEFAULT 0,
  avg_rpm           NUMERIC DEFAULT 0,
  hos_violations    INTEGER DEFAULT 0,
  dvir_defects      INTEGER DEFAULT 0,
  mpg               NUMERIC,
  score             INTEGER,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE driver_scorecards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "scorecards_own" ON driver_scorecards;
CREATE POLICY "scorecards_own" ON driver_scorecards FOR ALL USING (owner_id = auth.uid());
DROP POLICY IF EXISTS "scorecards_service" ON driver_scorecards;
CREATE POLICY "scorecards_service" ON driver_scorecards FOR ALL
  USING ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

CREATE INDEX IF NOT EXISTS idx_scorecards_owner ON driver_scorecards(owner_id, period_start DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- DONE — Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════
