-- ═══════════════════════════════════════════════════════════════
-- AUTONOMOUS AGENT SYSTEM — Database Tables
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- 1. Agent Decisions — every analysis the AI performs
CREATE TABLE IF NOT EXISTS agent_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('revenue','customer','load_ops','security','technical','general')),
  priority TEXT NOT NULL CHECK (priority IN ('critical','high','medium','low')),
  title TEXT NOT NULL,
  analysis TEXT NOT NULL,
  recommendation TEXT,
  confidence NUMERIC(3,2) CHECK (confidence >= 0 AND confidence <= 1),
  auto_actionable BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_agent_decisions_run ON agent_decisions (run_id);
CREATE INDEX idx_agent_decisions_priority ON agent_decisions (priority, created_at DESC);
CREATE INDEX idx_agent_decisions_category ON agent_decisions (category, created_at DESC);

ALTER TABLE agent_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on agent_decisions" ON agent_decisions
  FOR ALL USING (true) WITH CHECK (true);

-- 2. Agent Actions — every autonomous action taken
CREATE TABLE IF NOT EXISTS agent_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id UUID REFERENCES agent_decisions(id) ON DELETE SET NULL,
  run_id TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN (
    'email_sent','sms_sent','push_sent','status_update','ip_blocked',
    'service_restart','load_assigned','user_outreach','cache_refresh',
    'alert_sent','report_generated','escalated','other'
  )),
  target TEXT,
  description TEXT NOT NULL,
  reasoning TEXT NOT NULL,
  result TEXT,
  success BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_agent_actions_run ON agent_actions (run_id);
CREATE INDEX idx_agent_actions_type ON agent_actions (action_type, created_at DESC);
CREATE INDEX idx_agent_actions_decision ON agent_actions (decision_id);

ALTER TABLE agent_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on agent_actions" ON agent_actions
  FOR ALL USING (true) WITH CHECK (true);

-- 3. Agent Escalations — items waiting for Mohamed's approval
CREATE TABLE IF NOT EXISTS agent_escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id UUID REFERENCES agent_decisions(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('critical','high')),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  recommended_action TEXT NOT NULL,
  confidence NUMERIC(3,2),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','expired')),
  admin_notes TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_agent_escalations_status ON agent_escalations (status, created_at DESC);
CREATE INDEX idx_agent_escalations_priority ON agent_escalations (priority, status);

ALTER TABLE agent_escalations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on agent_escalations" ON agent_escalations
  FOR ALL USING (true) WITH CHECK (true);

-- 4. Agent Runs — tracks each hourly execution
CREATE TABLE IF NOT EXISTS agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id TEXT UNIQUE NOT NULL,
  trigger TEXT NOT NULL DEFAULT 'cron' CHECK (trigger IN ('cron','manual','webhook')),
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  decisions_count INT DEFAULT 0,
  actions_count INT DEFAULT 0,
  escalations_count INT DEFAULT 0,
  modules_run TEXT[] DEFAULT '{}',
  summary TEXT,
  error TEXT,
  duration_ms INT
);

CREATE INDEX idx_agent_runs_started ON agent_runs (started_at DESC);

ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on agent_runs" ON agent_runs
  FOR ALL USING (true) WITH CHECK (true);

-- 5. Agent Blocked IPs — security intelligence
CREATE TABLE IF NOT EXISTS agent_blocked_ips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address TEXT NOT NULL,
  reason TEXT NOT NULL,
  blocked_by TEXT DEFAULT 'agent',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_agent_blocked_ips_ip ON agent_blocked_ips (ip_address);

ALTER TABLE agent_blocked_ips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on agent_blocked_ips" ON agent_blocked_ips
  FOR ALL USING (true) WITH CHECK (true);
