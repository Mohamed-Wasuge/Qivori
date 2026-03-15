-- ═══════════════════════════════════════════════════════════════
-- QIVORI AI — Diesel Prices Cache Table
-- Paste into: Supabase Dashboard → SQL Editor → New Query → Run
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS diesel_prices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  region TEXT NOT NULL,
  price NUMERIC(5,3) NOT NULL,
  previous_price NUMERIC(5,3),
  price_change NUMERIC(5,3),
  period TEXT,                    -- EIA week period e.g. "2026-03-09"
  series_id TEXT,
  fetched_at TIMESTAMPTZ DEFAULT NOW()
);

-- No RLS needed — this is system-level cache, accessed only via service key
-- The API route uses SUPABASE_SERVICE_KEY (not anon key) to read/write

CREATE INDEX IF NOT EXISTS idx_diesel_prices_fetched ON diesel_prices(fetched_at DESC);

-- ═══════════════════════════════════════════════════════════════
-- DONE! Table created.
-- ═══════════════════════════════════════════════════════════════
