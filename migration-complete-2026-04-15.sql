-- ═══════════════════════════════════════════════════════════════════════════
-- QIVORI — Complete Gap Migration  2026-04-15
-- Run in Supabase Dashboard → SQL Editor → New Query → Run All
-- Safe to re-run: all statements use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. PROFILES — add missing columns used by mobile app ───────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS home_base_state     TEXT,
  ADD COLUMN IF NOT EXISTS home_base_city      TEXT,
  ADD COLUMN IF NOT EXISTS equipment_type      TEXT DEFAULT 'Dry Van',
  ADD COLUMN IF NOT EXISTS expo_push_token     TEXT,
  ADD COLUMN IF NOT EXISTS market_alerts_enabled BOOLEAN DEFAULT true;

-- ─── 2. RETELL_CALLS — full table + new columns ─────────────────────────────
CREATE TABLE IF NOT EXISTS retell_calls (
  id                UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           UUID    REFERENCES auth.users(id) ON DELETE CASCADE,
  retell_call_id    TEXT    UNIQUE,
  load_id           TEXT,
  broker_name       TEXT,
  broker_phone      TEXT,
  broker_email      TEXT,
  carrier_name      TEXT,
  call_status       TEXT    DEFAULT 'initiating',
  call_type         TEXT    DEFAULT 'broker_outbound',
  outcome           TEXT,
  agreed_rate       NUMERIC,
  notes             TEXT,
  truck_id          UUID,
  driver_id         UUID,
  origin            TEXT,
  destination       TEXT,
  posted_rate       NUMERIC,
  equipment         TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Add columns that may be missing if table was created before this migration
ALTER TABLE retell_calls
  ADD COLUMN IF NOT EXISTS origin       TEXT,
  ADD COLUMN IF NOT EXISTS destination  TEXT,
  ADD COLUMN IF NOT EXISTS posted_rate  NUMERIC,
  ADD COLUMN IF NOT EXISTS equipment    TEXT,
  ADD COLUMN IF NOT EXISTS broker_email TEXT,
  ADD COLUMN IF NOT EXISTS truck_id     UUID,
  ADD COLUMN IF NOT EXISTS driver_id    UUID;

ALTER TABLE retell_calls ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_own_calls" ON retell_calls;
CREATE POLICY "users_own_calls" ON retell_calls FOR ALL USING (user_id = auth.uid());
DROP POLICY IF EXISTS "service_retell_calls" ON retell_calls;
CREATE POLICY "service_retell_calls" ON retell_calls FOR ALL
  USING ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

CREATE INDEX IF NOT EXISTS idx_retell_calls_user   ON retell_calls(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_retell_calls_status ON retell_calls(call_status);
CREATE INDEX IF NOT EXISTS idx_retell_calls_truck  ON retell_calls(truck_id);

-- ─── 3. Q_ACTIVITY — extend type constraint to include market_alert ──────────
-- Drop old constraint and re-add with market_alert included
ALTER TABLE q_activity DROP CONSTRAINT IF EXISTS q_activity_type_check;
ALTER TABLE q_activity ADD CONSTRAINT q_activity_type_check CHECK (
  type IN (
    'load_found','call_started','transcript','decision_needed',
    'requirement_check','booked','bol_uploaded','factoring_sent',
    'payment_received','load_cancelled','status_update','market_alert',
    'general'
  )
);

-- Also add missing index on driver_id for realtime filter performance
CREATE INDEX IF NOT EXISTS idx_q_activity_driver  ON q_activity(driver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_q_activity_truck   ON q_activity(truck_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_q_activity_type    ON q_activity(type);

-- ─── 4. NEGOTIATION_SETTINGS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS negotiation_settings (
  id                           UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                      UUID    REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  min_rate_per_mile            NUMERIC DEFAULT 2.50,
  counter_offer_markup_pct     NUMERIC DEFAULT 10,
  max_counter_rounds           INTEGER DEFAULT 2,
  auto_accept_above_minimum    BOOLEAN DEFAULT false,
  notify_driver_on_offer       BOOLEAN DEFAULT true,
  driver_response_timeout_minutes INTEGER DEFAULT 5,
  updated_at                   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE negotiation_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "neg_settings_own" ON negotiation_settings;
CREATE POLICY "neg_settings_own" ON negotiation_settings FOR ALL USING (user_id = auth.uid());
DROP POLICY IF EXISTS "neg_settings_service" ON negotiation_settings;
CREATE POLICY "neg_settings_service" ON negotiation_settings FOR ALL
  USING ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

-- ─── 5. NEGOTIATION_MESSAGES ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS negotiation_messages (
  id              UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID    REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  retell_call_id  TEXT    NOT NULL,
  load_id         UUID,
  broker_name     TEXT,
  message_type    TEXT    DEFAULT 'general',
  message         TEXT    NOT NULL,
  rate_value      NUMERIC,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE negotiation_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "negmsg_own" ON negotiation_messages;
CREATE POLICY "negmsg_own" ON negotiation_messages FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS "negmsg_service" ON negotiation_messages;
CREATE POLICY "negmsg_service" ON negotiation_messages FOR ALL
  USING ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

CREATE INDEX IF NOT EXISTS idx_negmsg_call ON negotiation_messages(retell_call_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_negmsg_user ON negotiation_messages(user_id, created_at DESC);

-- ─── 6. Q_DECISIONS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS q_decisions (
  id          UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id    UUID    REFERENCES auth.users(id) ON DELETE CASCADE,
  load_id     TEXT,
  type        TEXT,
  decision    TEXT,
  confidence  INTEGER,
  summary     TEXT,
  reasoning   JSONB   DEFAULT '[]',
  payload     JSONB   DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE q_decisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "q_decisions_own" ON q_decisions;
CREATE POLICY "q_decisions_own" ON q_decisions FOR SELECT USING (owner_id = auth.uid());
DROP POLICY IF EXISTS "q_decisions_service" ON q_decisions;
CREATE POLICY "q_decisions_service" ON q_decisions FOR ALL
  USING ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

CREATE INDEX IF NOT EXISTS idx_q_decisions_owner ON q_decisions(owner_id, created_at DESC);

-- ─── 7. RATE_INTELLIGENCE ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rate_intelligence (
  id              UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id        UUID    REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  origin          TEXT,
  destination     TEXT,
  rate            NUMERIC,
  rpm             NUMERIC,
  miles           NUMERIC,
  equipment_type  TEXT,
  broker_id       TEXT,
  broker_name     TEXT,
  booked_at       TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE rate_intelligence ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rate_intel_own" ON rate_intelligence;
CREATE POLICY "rate_intel_own" ON rate_intelligence FOR ALL USING (owner_id = auth.uid());
DROP POLICY IF EXISTS "rate_intel_service" ON rate_intelligence;
CREATE POLICY "rate_intel_service" ON rate_intelligence FOR ALL
  USING ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

CREATE INDEX IF NOT EXISTS idx_rate_intel_owner  ON rate_intelligence(owner_id, booked_at DESC);
CREATE INDEX IF NOT EXISTS idx_rate_intel_origin ON rate_intelligence(origin, destination);

-- ─── 8. INSURANCE_RECORDS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS insurance_records (
  id              UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id        UUID    REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  policy_number   TEXT,
  provider        TEXT,
  coverage_type   TEXT,
  coverage_amount NUMERIC,
  premium         NUMERIC,
  start_date      DATE,
  expiry_date     DATE,
  coi_url         TEXT,
  auto_attach     BOOLEAN DEFAULT false,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE insurance_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "insurance_own" ON insurance_records;
CREATE POLICY "insurance_own" ON insurance_records FOR ALL USING (owner_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_insurance_owner  ON insurance_records(owner_id);
CREATE INDEX IF NOT EXISTS idx_insurance_expiry ON insurance_records(expiry_date);

-- ─── 9. LOAD_BOARD_STATS ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS load_board_stats (
  id                    UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id              UUID    REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  provider              TEXT    NOT NULL,
  month                 DATE    NOT NULL,
  subscription_cost     NUMERIC DEFAULT 0,
  loads_found           INTEGER DEFAULT 0,
  loads_booked          INTEGER DEFAULT 0,
  total_gross           NUMERIC DEFAULT 0,
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(owner_id, provider, month)
);

ALTER TABLE load_board_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lb_stats_own" ON load_board_stats;
CREATE POLICY "lb_stats_own" ON load_board_stats FOR ALL USING (owner_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_lb_stats_owner ON load_board_stats(owner_id, month DESC);

-- ─── 10. NOTIFICATIONS_LOG ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications_log (
  id          UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID    REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title       TEXT    NOT NULL,
  body        TEXT,
  type        TEXT    DEFAULT 'general',
  deep_link   TEXT,
  read        BOOLEAN DEFAULT false,
  data        JSONB   DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE notifications_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notif_log_own" ON notifications_log;
CREATE POLICY "notif_log_own" ON notifications_log FOR ALL USING (user_id = auth.uid());
DROP POLICY IF EXISTS "notif_log_service" ON notifications_log;
CREATE POLICY "notif_log_service" ON notifications_log FOR ALL
  USING ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

CREATE INDEX IF NOT EXISTS idx_notif_log_user ON notifications_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_log_read ON notifications_log(user_id, read);

-- ─── 11. LOAD_BOARD_CREDENTIALS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS load_board_credentials (
  id          UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID    REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  provider    TEXT    NOT NULL,
  credentials JSONB   DEFAULT '{}',
  verified    BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, provider)
);

ALTER TABLE load_board_credentials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lb_creds_own" ON load_board_credentials;
CREATE POLICY "lb_creds_own" ON load_board_credentials FOR ALL USING (user_id = auth.uid());
DROP POLICY IF EXISTS "lb_creds_service" ON load_board_credentials;
CREATE POLICY "lb_creds_service" ON load_board_credentials FOR ALL
  USING ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

-- ─── 12. DIESEL_PRICES ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS diesel_prices (
  id          UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  region      TEXT    NOT NULL,
  price       NUMERIC NOT NULL,
  fetched_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE diesel_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "diesel_read" ON diesel_prices FOR SELECT USING (true);
DROP POLICY IF EXISTS "diesel_service" ON diesel_prices;
CREATE POLICY "diesel_service" ON diesel_prices FOR ALL
  USING ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

-- Seed a default US AVG diesel price so retell-broker-call.js doesn't return null
INSERT INTO diesel_prices (region, price) VALUES ('US AVG', 3.85)
ON CONFLICT DO NOTHING;

-- ─── 13. DRIVER DOCUMENTS STORAGE BUCKET ─────────────────────────────────────
INSERT INTO storage.buckets (id, name, public) VALUES ('driver-documents', 'driver-documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "driver_docs_upload"   ON storage.objects;
DROP POLICY IF EXISTS "driver_docs_view_own" ON storage.objects;
CREATE POLICY "driver_docs_upload" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'driver-documents' AND auth.uid() IS NOT NULL);
CREATE POLICY "driver_docs_view_own" ON storage.objects
  FOR SELECT USING (bucket_id = 'driver-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ═══════════════════════════════════════════════════════════════════════════
-- DONE — All tables, columns, indexes, and policies created.
-- ═══════════════════════════════════════════════════════════════════════════
