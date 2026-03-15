-- ═══════════════════════════════════════════════════════════════
-- QIVORI AI — Load Board Cache Table
-- Paste into: Supabase Dashboard → SQL Editor → New Query → Run
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS load_board_cache (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  load_data JSONB NOT NULL,           -- Full normalized load object
  source TEXT NOT NULL,                -- 'dat', '123loadboard', 'truckstop'
  origin TEXT,
  destination TEXT,
  equipment TEXT,
  rate_per_mile NUMERIC(6,2),
  gross_pay NUMERIC(10,2),
  ai_score INTEGER DEFAULT 50,
  cached_at TIMESTAMPTZ DEFAULT NOW()
);

-- No RLS — system-level cache, accessed only via service key
CREATE INDEX IF NOT EXISTS idx_lbc_cached ON load_board_cache(cached_at DESC);
CREATE INDEX IF NOT EXISTS idx_lbc_score ON load_board_cache(ai_score DESC);
CREATE INDEX IF NOT EXISTS idx_lbc_origin ON load_board_cache(origin);
CREATE INDEX IF NOT EXISTS idx_lbc_dest ON load_board_cache(destination);

-- ═══════════════════════════════════════════════════════════════
-- DONE! Table created. Add API keys to Vercel env vars:
--   DAT_CLIENT_ID, DAT_CLIENT_SECRET
--   LB123_API_KEY
--   TRUCKSTOP_CLIENT_ID, TRUCKSTOP_CLIENT_SECRET
-- ═══════════════════════════════════════════════════════════════
