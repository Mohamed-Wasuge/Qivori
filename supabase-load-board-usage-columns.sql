-- ─────────────────────────────────────────────────────────────────────────────
-- 123Loadboard API usage tracking (compliance with 123LB API Usage Agreement)
-- ─────────────────────────────────────────────────────────────────────────────
-- The 123Loadboard API Usage Agreement enforces these per-user limits:
--   • 100 searches per user per hour
--   • 300 searches per user per day
--   • 2000 searches per user per month
--
-- We track actual API calls (not cache hits) in a single JSONB column on
-- the existing load_board_credentials row, which avoids a new table and an
-- extra round trip per request.
--
-- Shape:
--   {
--     "hour":  { "start": "2026-04-07T13:00:00.000Z", "count": 4 },
--     "day":   { "start": "2026-04-07T00:00:00.000Z", "count": 27 },
--     "month": { "start": "2026-04-01T00:00:00.000Z", "count": 412 }
--   }
--
-- This same column can be reused for DAT and Truckstop usage tracking later
-- by namespacing the keys (e.g. add a `provider` discriminator).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE load_board_credentials
  ADD COLUMN IF NOT EXISTS api_usage JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN load_board_credentials.api_usage IS
  'Per-provider API call counters for compliance with load board API rate limits. Resets per bucket (hour/day/month). Tracks REAL API calls only — cache hits are not counted.';
