-- ═══════════════════════════════════════════════════════════════
-- Add provider API keys column to companies table
-- Each carrier stores their own API credentials (encrypted by RLS)
-- Paste into: Supabase Dashboard → SQL Editor → Run
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE companies ADD COLUMN IF NOT EXISTS provider_keys JSONB DEFAULT '{}'::jsonb;

-- provider_keys structure:
-- {
--   "checkr_api_key": "...",
--   "sambasafety_api_key": "...",
--   "sambasafety_account_id": "...",
--   "fmcsa_api_key": "...",
--   "fmcsa_webkey": "...",
--   "fadv_client_id": "...",
--   "fadv_client_secret": "...",
--   "resend_api_key": "..."
-- }
--
-- RLS already protects this — only the owner can read/update their own company row.
-- ═══════════════════════════════════════════════════════════════
