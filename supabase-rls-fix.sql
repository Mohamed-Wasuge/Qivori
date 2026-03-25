-- ═══════════════════════════════════════════════════════════════
-- CRITICAL RLS FIX — Run in Supabase SQL Editor immediately
-- Fixes tables flagged by Supabase security scan (2026-03-23)
-- ═══════════════════════════════════════════════════════════════

-- 1. push_subscriptions — missing RLS entirely
ALTER TABLE IF EXISTS push_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own push subs" ON push_subscriptions;
CREATE POLICY "Users manage own push subs" ON push_subscriptions
  FOR ALL USING (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "Service role push subs" ON push_subscriptions;
CREATE POLICY "Service role push subs" ON push_subscriptions
  FOR ALL USING ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

-- 2. notifications — RLS enabled but no policies (table is locked out)
DROP POLICY IF EXISTS "Users read own notifications" ON notifications;
CREATE POLICY "Users read own notifications" ON notifications
  FOR SELECT USING (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "Users update own notifications" ON notifications;
CREATE POLICY "Users update own notifications" ON notifications
  FOR UPDATE USING (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "Service role notifications" ON notifications;
CREATE POLICY "Service role notifications" ON notifications
  FOR ALL USING ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

-- 3. diesel_prices — system cache, enable RLS with service-only access
ALTER TABLE IF EXISTS diesel_prices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role diesel prices" ON diesel_prices;
CREATE POLICY "Service role diesel prices" ON diesel_prices
  FOR ALL USING ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');
-- Allow authenticated users to read (needed for fuel ticker)
DROP POLICY IF EXISTS "Authenticated read diesel prices" ON diesel_prices;
CREATE POLICY "Authenticated read diesel prices" ON diesel_prices
  FOR SELECT USING (auth.role() = 'authenticated');

-- 4. load_board_cache — system cache, enable RLS with service-only access
ALTER TABLE IF EXISTS load_board_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role load board cache" ON load_board_cache;
CREATE POLICY "Service role load board cache" ON load_board_cache
  FOR ALL USING ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

-- 5. demo_requests — tighten overly permissive policy
DROP POLICY IF EXISTS "Service key full access" ON demo_requests;
CREATE POLICY "Service role demo requests" ON demo_requests
  FOR ALL USING ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');
-- Allow anon INSERT only (landing page form submissions)
DROP POLICY IF EXISTS "Anon insert demo requests" ON demo_requests;
CREATE POLICY "Anon insert demo requests" ON demo_requests
  FOR INSERT WITH CHECK (true);

-- Done. Verify with:
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = false;
