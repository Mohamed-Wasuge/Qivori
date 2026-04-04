-- ═══════════════════════════════════════════════════════════════════════════════
-- Q SELF-IMPROVEMENT LOOP — Schema for outcome tracking, mistake detection,
-- feedback engine, historical performance, and daily summaries.
-- Run in Supabase SQL Editor AFTER supabase-q-operating-system.sql
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. LOAD OUTCOMES — Track expected vs actual for every completed load ──────
CREATE TABLE IF NOT EXISTS load_outcomes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  load_id TEXT NOT NULL,
  dispatch_decision_id UUID,

  -- Decision snapshot (what Q decided at evaluation time)
  decision_type TEXT NOT NULL CHECK (decision_type IN ('auto_book', 'accept', 'negotiate', 'reject')),
  decision_confidence INTEGER,
  decision_at TIMESTAMPTZ,

  -- Expected (at decision time)
  expected_profit NUMERIC(10,2),
  expected_rpm NUMERIC(6,2),
  expected_profit_per_day NUMERIC(10,2),
  expected_fuel_cost NUMERIC(10,2),
  expected_deadhead_miles INTEGER,
  expected_lane_quality TEXT CHECK (expected_lane_quality IN ('hot_market', 'neutral', 'dead_zone')),
  expected_broker_reliability TEXT CHECK (expected_broker_reliability IN ('high', 'medium', 'low', 'unknown')),

  -- Actual (after load completes)
  actual_profit NUMERIC(10,2),
  actual_rpm NUMERIC(6,2),
  actual_fuel_cost NUMERIC(10,2),
  actual_deadhead_miles INTEGER,
  actual_days_held INTEGER,
  actual_broker_paid_on_time BOOLEAN,
  actual_broker_changed_rate BOOLEAN DEFAULT false,
  actual_detention_hours NUMERIC(6,1) DEFAULT 0,

  -- Negotiation outcome
  negotiation_attempted BOOLEAN DEFAULT false,
  negotiation_initial_offer NUMERIC(10,2),
  negotiation_target_rate NUMERIC(10,2),
  negotiation_final_rate NUMERIC(10,2),
  negotiation_rounds INTEGER DEFAULT 0,
  negotiation_success BOOLEAN,

  -- Result classification
  result TEXT CHECK (result IN ('good', 'acceptable', 'bad', 'missed_opportunity')),
  result_reason TEXT,
  profit_delta NUMERIC(10,2),          -- actual_profit - expected_profit
  rpm_delta NUMERIC(6,2),              -- actual_rpm - expected_rpm

  -- Lane & route
  origin TEXT,
  destination TEXT,
  origin_state TEXT,
  destination_state TEXT,
  lane TEXT,                            -- "Dallas TX → Atlanta GA"
  miles INTEGER,
  equipment_type TEXT,
  broker_name TEXT,
  driver_id UUID,
  vehicle_id UUID,

  -- Timestamps
  load_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE load_outcomes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own load_outcomes" ON load_outcomes;
CREATE POLICY "Users manage own load_outcomes" ON load_outcomes FOR ALL
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS "Service role load_outcomes" ON load_outcomes;
CREATE POLICY "Service role load_outcomes" ON load_outcomes FOR ALL
  USING ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

CREATE INDEX IF NOT EXISTS idx_load_outcomes_owner ON load_outcomes(owner_id);
CREATE INDEX IF NOT EXISTS idx_load_outcomes_load ON load_outcomes(load_id);
CREATE INDEX IF NOT EXISTS idx_load_outcomes_lane ON load_outcomes(lane);
CREATE INDEX IF NOT EXISTS idx_load_outcomes_broker ON load_outcomes(broker_name);
CREATE INDEX IF NOT EXISTS idx_load_outcomes_result ON load_outcomes(result);
CREATE INDEX IF NOT EXISTS idx_load_outcomes_date ON load_outcomes(load_completed_at DESC);


-- ── 2. Q MISTAKES — Automatically flagged errors in Q's judgment ─────────────
CREATE TABLE IF NOT EXISTS q_mistakes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  load_outcome_id UUID REFERENCES load_outcomes(id) ON DELETE CASCADE,
  load_id TEXT,

  -- Mistake classification
  mistake_type TEXT NOT NULL CHECK (mistake_type IN (
    'bad_accept',              -- accepted a load that lost money or underperformed
    'missed_good_load',        -- rejected/passed on a load that would have been profitable
    'failed_negotiation',      -- negotiated but lost a load that was worth taking at initial offer
    'incorrect_lane_confidence', -- lane rated as hot but was dead, or vice versa
    'broker_reliability_miss', -- broker rated reliable but didn't pay on time / changed rate
    'overestimated_profit',    -- expected much higher profit than actual
    'underestimated_profit',   -- expected much lower profit than actual (missed upside)
    'detention_not_predicted', -- load had significant detention that wasn't factored
    'deadhead_miscalculation'  -- actual deadhead significantly different from expected
  )),
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),

  -- Details
  description TEXT NOT NULL,
  expected_value TEXT,                  -- what Q predicted
  actual_value TEXT,                    -- what actually happened
  impact_dollars NUMERIC(10,2),        -- dollar impact of the mistake

  -- Context
  lane TEXT,
  broker_name TEXT,
  equipment_type TEXT,
  decision_type TEXT,

  -- Whether feedback engine has processed this
  feedback_applied BOOLEAN DEFAULT false,
  feedback_adjustment_id UUID,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE q_mistakes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own q_mistakes" ON q_mistakes;
CREATE POLICY "Users manage own q_mistakes" ON q_mistakes FOR ALL
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS "Service role q_mistakes" ON q_mistakes;
CREATE POLICY "Service role q_mistakes" ON q_mistakes FOR ALL
  USING ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

CREATE INDEX IF NOT EXISTS idx_q_mistakes_owner ON q_mistakes(owner_id);
CREATE INDEX IF NOT EXISTS idx_q_mistakes_type ON q_mistakes(mistake_type);
CREATE INDEX IF NOT EXISTS idx_q_mistakes_severity ON q_mistakes(severity);
CREATE INDEX IF NOT EXISTS idx_q_mistakes_date ON q_mistakes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_q_mistakes_unprocessed ON q_mistakes(feedback_applied)
  WHERE feedback_applied = false;


-- ── 3. Q ADJUSTMENTS — Audit log for every parameter change Q makes ──────────
CREATE TABLE IF NOT EXISTS q_adjustments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- What changed
  parameter TEXT NOT NULL,              -- 'lane_confidence:Dallas_TX:Atlanta_GA', 'broker_score:TQL', 'min_rpm', etc.
  old_value NUMERIC(10,4),
  new_value NUMERIC(10,4),
  delta NUMERIC(10,4),                  -- new_value - old_value

  -- Why
  reason TEXT NOT NULL,                 -- human-readable explanation
  trigger_type TEXT NOT NULL CHECK (trigger_type IN (
    'outcome_feedback',        -- triggered by load outcome analysis
    'mistake_correction',      -- triggered by mistake detection
    'daily_summary',           -- triggered by daily analysis
    'manual_override',         -- carrier changed it manually
    'seasonal_adjustment',     -- time-based adjustment
    'pattern_detection'        -- repeated pattern detected
  )),

  -- Evidence
  evidence JSONB DEFAULT '{}',          -- { outcomes: [...ids], mistakes: [...ids], sample_size, confidence }
  sample_size INTEGER DEFAULT 0,        -- how many data points informed this
  confidence NUMERIC(5,2),              -- 0-100, how confident Q is in this adjustment

  -- Guardrails
  bounded BOOLEAN DEFAULT true,         -- was this adjustment bounded by guardrails?
  original_delta NUMERIC(10,4),         -- what Q wanted before guardrails capped it
  guardrail_hit TEXT,                   -- which guardrail limited it (if any)

  -- Status
  status TEXT NOT NULL DEFAULT 'applied' CHECK (status IN ('proposed', 'applied', 'reverted', 'rejected')),
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  reverted_at TIMESTAMPTZ,
  reverted_reason TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE q_adjustments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own q_adjustments" ON q_adjustments;
CREATE POLICY "Users manage own q_adjustments" ON q_adjustments FOR ALL
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS "Service role q_adjustments" ON q_adjustments;
CREATE POLICY "Service role q_adjustments" ON q_adjustments FOR ALL
  USING ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

CREATE INDEX IF NOT EXISTS idx_q_adjustments_owner ON q_adjustments(owner_id);
CREATE INDEX IF NOT EXISTS idx_q_adjustments_param ON q_adjustments(parameter);
CREATE INDEX IF NOT EXISTS idx_q_adjustments_trigger ON q_adjustments(trigger_type);
CREATE INDEX IF NOT EXISTS idx_q_adjustments_date ON q_adjustments(created_at DESC);


-- ── 4. LANE PERFORMANCE — Historical lane-level intelligence ─────────────────
CREATE TABLE IF NOT EXISTS lane_performance (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Lane identity
  lane TEXT NOT NULL,                   -- "Dallas TX → Atlanta GA"
  origin TEXT NOT NULL,
  origin_state TEXT,
  destination TEXT NOT NULL,
  destination_state TEXT,

  -- Aggregate metrics (rolling)
  total_loads INTEGER DEFAULT 0,
  good_loads INTEGER DEFAULT 0,
  bad_loads INTEGER DEFAULT 0,
  avg_rpm NUMERIC(6,2),
  avg_profit NUMERIC(10,2),
  avg_profit_per_day NUMERIC(10,2),
  avg_deadhead_miles NUMERIC(8,1),
  avg_detention_hours NUMERIC(6,1) DEFAULT 0,
  avg_days_held NUMERIC(4,1),

  -- Confidence score (0-100, Q's learned confidence in this lane)
  confidence_score NUMERIC(5,2) DEFAULT 50.0,
  quality TEXT DEFAULT 'neutral' CHECK (quality IN ('hot_market', 'neutral', 'dead_zone')),

  -- Seasonal patterns (JSON: { "Q1": { avg_rpm, loads }, "Q2": ... })
  seasonal_data JSONB DEFAULT '{}',

  -- Best/worst
  best_rpm NUMERIC(6,2),
  worst_rpm NUMERIC(6,2),
  best_profit NUMERIC(10,2),
  worst_profit NUMERIC(10,2),

  -- Equipment breakdown
  equipment_stats JSONB DEFAULT '{}',   -- { "Dry Van": { loads, avg_rpm }, "Reefer": ... }

  last_load_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(owner_id, lane)
);

ALTER TABLE lane_performance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own lane_performance" ON lane_performance;
CREATE POLICY "Users manage own lane_performance" ON lane_performance FOR ALL
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS "Service role lane_performance" ON lane_performance;
CREATE POLICY "Service role lane_performance" ON lane_performance FOR ALL
  USING ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

CREATE INDEX IF NOT EXISTS idx_lane_perf_owner ON lane_performance(owner_id);
CREATE INDEX IF NOT EXISTS idx_lane_perf_lane ON lane_performance(lane);
CREATE INDEX IF NOT EXISTS idx_lane_perf_quality ON lane_performance(quality);
CREATE INDEX IF NOT EXISTS idx_lane_perf_confidence ON lane_performance(confidence_score DESC);


-- ── 5. BROKER PERFORMANCE — Learned broker reliability ───────────────────────
CREATE TABLE IF NOT EXISTS broker_performance (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Broker identity
  broker_name TEXT NOT NULL,

  -- Aggregate metrics
  total_loads INTEGER DEFAULT 0,
  completed_loads INTEGER DEFAULT 0,
  cancelled_loads INTEGER DEFAULT 0,
  rate_changed_loads INTEGER DEFAULT 0,  -- broker changed rate after agreement

  -- Payment
  paid_on_time INTEGER DEFAULT 0,
  paid_late INTEGER DEFAULT 0,
  avg_days_to_pay NUMERIC(6,1),

  -- Negotiation
  total_negotiations INTEGER DEFAULT 0,
  successful_negotiations INTEGER DEFAULT 0,
  avg_negotiation_lift_pct NUMERIC(5,2), -- avg % increase from initial to final

  -- Reliability score (0-100)
  reliability_score NUMERIC(5,2) DEFAULT 50.0,
  reliability_tier TEXT DEFAULT 'unknown' CHECK (reliability_tier IN ('excellent', 'good', 'average', 'poor', 'blacklist', 'unknown')),

  -- Detention
  avg_detention_hours NUMERIC(6,1) DEFAULT 0,
  detention_incidents INTEGER DEFAULT 0,

  last_load_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(owner_id, broker_name)
);

ALTER TABLE broker_performance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own broker_performance" ON broker_performance;
CREATE POLICY "Users manage own broker_performance" ON broker_performance FOR ALL
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS "Service role broker_performance" ON broker_performance;
CREATE POLICY "Service role broker_performance" ON broker_performance FOR ALL
  USING ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

CREATE INDEX IF NOT EXISTS idx_broker_perf_owner ON broker_performance(owner_id);
CREATE INDEX IF NOT EXISTS idx_broker_perf_name ON broker_performance(broker_name);
CREATE INDEX IF NOT EXISTS idx_broker_perf_score ON broker_performance(reliability_score DESC);


-- ── 6. DAILY SUMMARIES — Q's daily self-assessment ───────────────────────────
CREATE TABLE IF NOT EXISTS q_daily_summaries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  summary_date DATE NOT NULL,

  -- Decision metrics
  total_decisions INTEGER DEFAULT 0,
  auto_booked INTEGER DEFAULT 0,
  negotiated INTEGER DEFAULT 0,
  rejected INTEGER DEFAULT 0,

  -- Accuracy
  decisions_with_outcomes INTEGER DEFAULT 0,
  correct_decisions INTEGER DEFAULT 0,
  decision_accuracy_pct NUMERIC(5,2),

  -- Profit tracking
  total_expected_profit NUMERIC(12,2) DEFAULT 0,
  total_actual_profit NUMERIC(12,2) DEFAULT 0,
  profit_delta NUMERIC(12,2) DEFAULT 0, -- actual - expected
  profit_accuracy_pct NUMERIC(5,2),     -- how close expected was to actual

  -- Mistakes
  total_mistakes INTEGER DEFAULT 0,
  critical_mistakes INTEGER DEFAULT 0,
  top_mistakes JSONB DEFAULT '[]',       -- [{type, count, total_impact}]
  repeated_patterns JSONB DEFAULT '[]',  -- [{pattern, occurrences, suggestion}]

  -- Adjustments
  adjustments_proposed INTEGER DEFAULT 0,
  adjustments_applied INTEGER DEFAULT 0,
  adjustments_detail JSONB DEFAULT '[]', -- [{parameter, old, new, reason}]

  -- Rule suggestions (proposed but not auto-applied)
  suggested_adjustments JSONB DEFAULT '[]', -- [{parameter, current, suggested, reason, confidence}]

  -- Performance by category
  lane_performance JSONB DEFAULT '{}',   -- {lane: {loads, profit, accuracy}}
  broker_performance JSONB DEFAULT '{}', -- {broker: {loads, reliability, issues}}
  equipment_performance JSONB DEFAULT '{}',

  -- Overall health
  q_health_score NUMERIC(5,2),          -- 0-100, overall system performance

  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(owner_id, summary_date)
);

ALTER TABLE q_daily_summaries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own q_daily_summaries" ON q_daily_summaries;
CREATE POLICY "Users manage own q_daily_summaries" ON q_daily_summaries FOR ALL
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS "Service role q_daily_summaries" ON q_daily_summaries;
CREATE POLICY "Service role q_daily_summaries" ON q_daily_summaries FOR ALL
  USING ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

CREATE INDEX IF NOT EXISTS idx_daily_summary_owner ON q_daily_summaries(owner_id);
CREATE INDEX IF NOT EXISTS idx_daily_summary_date ON q_daily_summaries(summary_date DESC);


-- ── 7. ADD LEARNING COLUMNS TO CARRIER SETTINGS ─────────────────────────────
ALTER TABLE carrier_settings
  ADD COLUMN IF NOT EXISTS q_learning_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS q_auto_adjust BOOLEAN DEFAULT false,         -- false = propose only, true = auto-apply bounded adjustments
  ADD COLUMN IF NOT EXISTS q_max_adjustment_pct INTEGER DEFAULT 10,     -- max % change per adjustment cycle
  ADD COLUMN IF NOT EXISTS q_min_sample_size INTEGER DEFAULT 5,         -- min loads before making adjustments
  ADD COLUMN IF NOT EXISTS q_learning_rate NUMERIC(4,2) DEFAULT 0.15,  -- how aggressively to adjust (0.05=conservative, 0.30=aggressive)
  ADD COLUMN IF NOT EXISTS q_last_learning_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS q_total_adjustments INTEGER DEFAULT 0;


-- ═══════════════════════════════════════════════════════════════════════════════
-- Q LEARNING SCHEMA COMPLETE
-- New tables: load_outcomes, q_mistakes, q_adjustments, lane_performance,
--             broker_performance, q_daily_summaries
-- Updated: carrier_settings (learning config)
-- All tables have RLS + owner_id + indexes
-- ═══════════════════════════════════════════════════════════════════════════════
