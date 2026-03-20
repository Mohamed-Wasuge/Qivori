-- ═══════════════════════════════════════════════════════════════
-- QIVORI AI — SMS Load Alerts Tables
-- Stores SMS alerts sent for load matches and carrier SMS preferences
-- Paste this into: Supabase Dashboard → SQL Editor → New Query → Run
-- ═══════════════════════════════════════════════════════════════

-- ─── SMS LOAD ALERTS ──────────────────────────────────────────
-- Tracks every SMS load alert sent to a carrier/driver
CREATE TABLE IF NOT EXISTS sms_load_alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  load_id TEXT NOT NULL,
  phone TEXT NOT NULL,
  message_sid TEXT,
  load_data JSONB DEFAULT '{}'::jsonb,
  alert_code TEXT NOT NULL,            -- short code to match replies (e.g. "L1", "L2")
  status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'failed', 'expired')),
  replied BOOLEAN DEFAULT false,
  reply_text TEXT,
  booked BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE sms_load_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sms_load_alerts_select" ON sms_load_alerts
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "sms_load_alerts_service_insert" ON sms_load_alerts
  FOR INSERT WITH CHECK (true);
CREATE POLICY "sms_load_alerts_service_update" ON sms_load_alerts
  FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_sms_load_alerts_user ON sms_load_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_sms_load_alerts_phone ON sms_load_alerts(phone);
CREATE INDEX IF NOT EXISTS idx_sms_load_alerts_code ON sms_load_alerts(alert_code);
CREATE INDEX IF NOT EXISTS idx_sms_load_alerts_created ON sms_load_alerts(created_at DESC);

-- ─── SMS PREFERENCES ─────────────────────────────────────────
-- Per-user SMS alert preferences
CREATE TABLE IF NOT EXISTS sms_preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  phone TEXT,
  alerts_enabled BOOLEAN DEFAULT true,
  max_per_day INTEGER DEFAULT 10,
  min_score INTEGER DEFAULT 70,
  quiet_start TIME,                    -- e.g. '22:00' — no alerts after this
  quiet_end TIME,                      -- e.g. '07:00' — no alerts before this
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE sms_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sms_preferences_select" ON sms_preferences
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "sms_preferences_insert" ON sms_preferences
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "sms_preferences_update" ON sms_preferences
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "sms_preferences_service" ON sms_preferences
  FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_sms_preferences_user ON sms_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_sms_preferences_phone ON sms_preferences(phone);

-- Auto-update updated_at triggers
CREATE TRIGGER sms_load_alerts_updated_at
  BEFORE UPDATE ON sms_load_alerts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER sms_preferences_updated_at
  BEFORE UPDATE ON sms_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ═══════════════════════════════════════════════════════════════
-- DONE! SMS alert tables created.
-- ═══════════════════════════════════════════════════════════════
