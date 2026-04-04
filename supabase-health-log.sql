-- ═══════════════════════════════════════════════════════════════
-- QIVORI AI — System Health Log Table
-- Used by: auto-rollback.js, health-monitor.js
-- Paste into: Supabase Dashboard → SQL Editor → New Query → Run
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS system_health_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  overall_status TEXT NOT NULL DEFAULT 'green',       -- green, yellow, red
  status TEXT,                                         -- alternate status field for health-monitor
  checks_snapshot JSONB,                              -- full health check results
  checks JSONB,                                       -- health-monitor detailed results
  action TEXT DEFAULT 'none',                         -- none, rollback, alert, cooldown_skip, rollback_failed
  action_detail TEXT,                                 -- human-readable description
  consecutive_red_count INTEGER DEFAULT 0,
  latency_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- No RLS — system-level table, accessed only via service key
-- Auto-rollback and health-monitor use SUPABASE_SERVICE_KEY

-- Index for efficient time-ordered queries (auto-rollback checks last N rows)
CREATE INDEX IF NOT EXISTS idx_health_log_created ON system_health_log(created_at DESC);
-- Index for rollback cooldown check
CREATE INDEX IF NOT EXISTS idx_health_log_action ON system_health_log(action, created_at DESC);

-- Auto-cleanup: keep only last 30 days of logs
-- Run this manually or via pg_cron:
-- DELETE FROM system_health_log WHERE created_at < NOW() - INTERVAL '30 days';
