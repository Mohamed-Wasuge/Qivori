-- ============================================================
-- QIVORI — PREDICTIVE LANE PRICING ENGINE
-- Tables: lane_history, lane_predictions
-- ============================================================

-- Weekly aggregated rate data per origin_state → dest_state lane
CREATE TABLE IF NOT EXISTS lane_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    origin_state TEXT NOT NULL,
    dest_state TEXT NOT NULL,
    week_start DATE NOT NULL,
    load_count INTEGER DEFAULT 0,
    avg_rpm NUMERIC(8,2) DEFAULT 0,
    min_rpm NUMERIC(8,2) DEFAULT 0,
    max_rpm NUMERIC(8,2) DEFAULT 0,
    avg_gross NUMERIC(10,2) DEFAULT 0,
    avg_miles NUMERIC(8,1) DEFAULT 0,
    total_revenue NUMERIC(12,2) DEFAULT 0,
    equipment_breakdown JSONB DEFAULT '{}'::jsonb,
    broker_breakdown JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(owner_id, origin_state, dest_state, week_start)
);

-- Cached predictions per lane (refreshed by cron)
CREATE TABLE IF NOT EXISTS lane_predictions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    origin_state TEXT NOT NULL,
    dest_state TEXT NOT NULL,
    predicted_rpm NUMERIC(8,2) NOT NULL,
    trend TEXT CHECK (trend IN ('rising', 'falling', 'stable')) DEFAULT 'stable',
    trend_pct NUMERIC(6,2) DEFAULT 0,
    confidence INTEGER DEFAULT 50,
    week_count INTEGER DEFAULT 0,
    season_multiplier NUMERIC(4,2) DEFAULT 1.0,
    computed_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(owner_id, origin_state, dest_state)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_lane_history_owner ON lane_history(owner_id);
CREATE INDEX IF NOT EXISTS idx_lane_history_lane ON lane_history(origin_state, dest_state);
CREATE INDEX IF NOT EXISTS idx_lane_history_week ON lane_history(week_start DESC);
CREATE INDEX IF NOT EXISTS idx_lane_history_lookup ON lane_history(owner_id, origin_state, dest_state, week_start DESC);

CREATE INDEX IF NOT EXISTS idx_lane_pred_owner ON lane_predictions(owner_id);
CREATE INDEX IF NOT EXISTS idx_lane_pred_lookup ON lane_predictions(owner_id, origin_state, dest_state);

-- RLS
ALTER TABLE lane_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE lane_predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own lane history" ON lane_history FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Service role lane history" ON lane_history FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Users see own lane predictions" ON lane_predictions FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Service role lane predictions" ON lane_predictions FOR ALL USING (auth.role() = 'service_role');

-- Updated_at trigger
CREATE TRIGGER lane_history_updated_at
    BEFORE UPDATE ON lane_history
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
