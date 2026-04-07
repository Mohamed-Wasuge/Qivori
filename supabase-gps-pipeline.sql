-- ============================================================
-- GPS PIPELINE — driver_positions + q_alerts
-- ============================================================
-- Connects driver mobile app to TMS carrier dashboard.
-- Driver app writes GPS every 60s when on a load.
-- Carrier TMS subscribes via realtime to render moving truck pins.
-- Geofence events (arrive, depart, detention, off-route) are written
-- to q_alerts and surfaced on both sides.
-- ============================================================

-- ============================================================
-- 1. driver_positions — live GPS stream from mobile drivers
-- ============================================================
CREATE TABLE IF NOT EXISTS driver_positions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES drivers(id) ON DELETE CASCADE,
  load_id UUID REFERENCES loads(id) ON DELETE SET NULL,
  lat NUMERIC(10,7) NOT NULL,
  lng NUMERIC(10,7) NOT NULL,
  speed NUMERIC(6,2),          -- mph
  heading NUMERIC(6,2),        -- degrees 0-360
  accuracy NUMERIC(8,2),       -- meters
  battery NUMERIC(5,2),        -- 0-100
  ts TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_driver_positions_owner ON driver_positions(owner_id);
CREATE INDEX IF NOT EXISTS idx_driver_positions_driver ON driver_positions(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_positions_load ON driver_positions(load_id);
CREATE INDEX IF NOT EXISTS idx_driver_positions_ts ON driver_positions(ts DESC);
CREATE INDEX IF NOT EXISTS idx_driver_positions_driver_ts ON driver_positions(driver_id, ts DESC);

ALTER TABLE driver_positions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners can view own driver positions" ON driver_positions;
CREATE POLICY "Owners can view own driver positions"
  ON driver_positions FOR SELECT
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owners can insert own driver positions" ON driver_positions;
CREATE POLICY "Owners can insert own driver positions"
  ON driver_positions FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owners can delete own driver positions" ON driver_positions;
CREATE POLICY "Owners can delete own driver positions"
  ON driver_positions FOR DELETE
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Service role full access on driver_positions" ON driver_positions;
CREATE POLICY "Service role full access on driver_positions"
  ON driver_positions FOR ALL
  USING (auth.role() = 'service_role');

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE driver_positions;

-- ============================================================
-- 2. q_alerts — geofence + Q events surfaced both sides
-- ============================================================
-- Types: arrive_pickup, depart_pickup, arrive_delivery, depart_delivery,
--        detention_start, detention_end, off_route, hos_warning,
--        broker_callback, load_booked, load_cancelled
-- ============================================================
CREATE TABLE IF NOT EXISTS q_alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
  load_id UUID REFERENCES loads(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'success', 'warning', 'error')),
  title TEXT NOT NULL,
  message TEXT,
  payload JSONB DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_q_alerts_owner ON q_alerts(owner_id);
CREATE INDEX IF NOT EXISTS idx_q_alerts_driver ON q_alerts(driver_id);
CREATE INDEX IF NOT EXISTS idx_q_alerts_load ON q_alerts(load_id);
CREATE INDEX IF NOT EXISTS idx_q_alerts_type ON q_alerts(type);
CREATE INDEX IF NOT EXISTS idx_q_alerts_created ON q_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_q_alerts_unread ON q_alerts(owner_id, dismissed_at) WHERE dismissed_at IS NULL;

ALTER TABLE q_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners can view own alerts" ON q_alerts;
CREATE POLICY "Owners can view own alerts"
  ON q_alerts FOR SELECT
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owners can insert own alerts" ON q_alerts;
CREATE POLICY "Owners can insert own alerts"
  ON q_alerts FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owners can update own alerts" ON q_alerts;
CREATE POLICY "Owners can update own alerts"
  ON q_alerts FOR UPDATE
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owners can delete own alerts" ON q_alerts;
CREATE POLICY "Owners can delete own alerts"
  ON q_alerts FOR DELETE
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Service role full access on q_alerts" ON q_alerts;
CREATE POLICY "Service role full access on q_alerts"
  ON q_alerts FOR ALL
  USING (auth.role() = 'service_role');

ALTER PUBLICATION supabase_realtime ADD TABLE q_alerts;

-- ============================================================
-- 3. q_decisions — every Q decision (used by AI Activity feed)
-- ============================================================
-- Types: load_scored, load_accepted, load_passed, broker_called,
--        rate_negotiated, lane_watched, market_scan
-- ============================================================
CREATE TABLE IF NOT EXISTS q_decisions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
  load_id UUID REFERENCES loads(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  decision TEXT,                  -- accept | negotiate | reject | watch | scan
  confidence INTEGER,             -- 0-100
  summary TEXT NOT NULL,
  reasoning JSONB DEFAULT '[]'::jsonb,  -- array of reason strings
  payload JSONB DEFAULT '{}'::jsonb,    -- profit, rpm, lane data, etc.
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_q_decisions_owner ON q_decisions(owner_id);
CREATE INDEX IF NOT EXISTS idx_q_decisions_load ON q_decisions(load_id);
CREATE INDEX IF NOT EXISTS idx_q_decisions_type ON q_decisions(type);
CREATE INDEX IF NOT EXISTS idx_q_decisions_created ON q_decisions(created_at DESC);

ALTER TABLE q_decisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners can view own decisions" ON q_decisions;
CREATE POLICY "Owners can view own decisions"
  ON q_decisions FOR SELECT
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owners can insert own decisions" ON q_decisions;
CREATE POLICY "Owners can insert own decisions"
  ON q_decisions FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Service role full access on q_decisions" ON q_decisions;
CREATE POLICY "Service role full access on q_decisions"
  ON q_decisions FOR ALL
  USING (auth.role() = 'service_role');

ALTER PUBLICATION supabase_realtime ADD TABLE q_decisions;

-- ============================================================
-- 4. Cleanup helper — keep only last 7 days of positions
-- ============================================================
-- Run this from a cron / edge function periodically
-- DELETE FROM driver_positions WHERE ts < now() - interval '7 days';
