-- ELD Integration Tables
-- Tables for storing ELD provider connections and synced data
-- Providers: Samsara, Motive (KeepTruckin)

-- ============================================================
-- 1. eld_connections — stores provider credentials & status
-- ============================================================
CREATE TABLE IF NOT EXISTS eld_connections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('samsara', 'motive')),
  api_key TEXT,
  status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected', 'error')),
  connected_at TIMESTAMPTZ,
  last_sync TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, provider)
);

CREATE INDEX idx_eld_connections_user ON eld_connections(user_id);
CREATE INDEX idx_eld_connections_status ON eld_connections(status);

ALTER TABLE eld_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own ELD connections"
  ON eld_connections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own ELD connections"
  ON eld_connections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own ELD connections"
  ON eld_connections FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own ELD connections"
  ON eld_connections FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access on eld_connections"
  ON eld_connections FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- 2. eld_hos_logs — Hours of Service log entries
-- ============================================================
CREATE TABLE IF NOT EXISTS eld_hos_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  driver_name TEXT NOT NULL DEFAULT 'Unknown',
  driver_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('driving', 'on_duty', 'sleeper', 'off_duty')),
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  duration_hours NUMERIC(6,2) DEFAULT 0,
  vehicle_id TEXT,
  location TEXT,
  violations JSONB,
  source_provider TEXT NOT NULL CHECK (source_provider IN ('samsara', 'motive')),
  synced_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_eld_hos_user ON eld_hos_logs(user_id);
CREATE INDEX idx_eld_hos_driver ON eld_hos_logs(driver_id);
CREATE INDEX idx_eld_hos_status ON eld_hos_logs(status);
CREATE INDEX idx_eld_hos_start ON eld_hos_logs(start_time DESC);
CREATE INDEX idx_eld_hos_provider ON eld_hos_logs(source_provider);

ALTER TABLE eld_hos_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own HOS logs"
  ON eld_hos_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own HOS logs"
  ON eld_hos_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access on eld_hos_logs"
  ON eld_hos_logs FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- 3. eld_vehicles — Vehicle data with GPS location
-- ============================================================
CREATE TABLE IF NOT EXISTS eld_vehicles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vehicle_name TEXT,
  vehicle_id TEXT,
  vin TEXT,
  make TEXT,
  model TEXT,
  year INTEGER,
  current_lat NUMERIC(10,7),
  current_lng NUMERIC(10,7),
  current_speed NUMERIC(6,1),
  odometer NUMERIC(10,1),
  fuel_pct NUMERIC(5,2),
  engine_hours NUMERIC(10,1),
  source_provider TEXT NOT NULL CHECK (source_provider IN ('samsara', 'motive')),
  synced_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, vehicle_id, source_provider)
);

CREATE INDEX idx_eld_vehicles_user ON eld_vehicles(user_id);
CREATE INDEX idx_eld_vehicles_vid ON eld_vehicles(vehicle_id);
CREATE INDEX idx_eld_vehicles_provider ON eld_vehicles(source_provider);

ALTER TABLE eld_vehicles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own vehicles"
  ON eld_vehicles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own vehicles"
  ON eld_vehicles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own vehicles"
  ON eld_vehicles FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access on eld_vehicles"
  ON eld_vehicles FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- 4. eld_dvirs — Driver Vehicle Inspection Reports
-- ============================================================
CREATE TABLE IF NOT EXISTS eld_dvirs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  driver_name TEXT NOT NULL DEFAULT 'Unknown',
  vehicle_name TEXT,
  inspection_type TEXT NOT NULL CHECK (inspection_type IN ('pre_trip', 'post_trip')),
  status TEXT NOT NULL CHECK (status IN ('safe', 'defects_found')),
  defects JSONB DEFAULT '[]'::jsonb,
  submitted_at TIMESTAMPTZ,
  source_provider TEXT NOT NULL CHECK (source_provider IN ('samsara', 'motive')),
  synced_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_eld_dvirs_user ON eld_dvirs(user_id);
CREATE INDEX idx_eld_dvirs_status ON eld_dvirs(status);
CREATE INDEX idx_eld_dvirs_submitted ON eld_dvirs(submitted_at DESC);
CREATE INDEX idx_eld_dvirs_provider ON eld_dvirs(source_provider);

ALTER TABLE eld_dvirs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own DVIRs"
  ON eld_dvirs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own DVIRs"
  ON eld_dvirs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access on eld_dvirs"
  ON eld_dvirs FOR ALL
  USING (auth.role() = 'service_role');
