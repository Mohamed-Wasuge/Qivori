-- ═══════════════════════════════════════════════════════════════
-- QIVORI AI — Q Intelligence Fee Tracking
-- Paste this into: Supabase Dashboard → SQL Editor → New Query → Run
-- ═══════════════════════════════════════════════════════════════

-- ─── Q AI FEES ────────────────────────────────────────────────
-- Tracks per-load AI fees (3% of load rate when Q is used)
-- Charged via Stripe and recorded here for billing visibility

CREATE TABLE IF NOT EXISTS q_ai_fees (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  load_id UUID REFERENCES loads(id) ON DELETE SET NULL,
  load_number TEXT,
  load_rate NUMERIC(10,2) NOT NULL DEFAULT 0,
  fee_percent NUMERIC(5,4) NOT NULL DEFAULT 0.03,
  fee_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  stripe_charge_id TEXT,
  stripe_status TEXT DEFAULT 'pending',  -- pending, succeeded, failed
  feature_used TEXT DEFAULT 'dispatch',  -- dispatch, negotiation, scoring, voice
  origin TEXT,
  destination TEXT,
  broker TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE q_ai_fees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "q_ai_fees_select" ON q_ai_fees FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY "q_ai_fees_insert" ON q_ai_fees FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "q_ai_fees_update" ON q_ai_fees FOR UPDATE USING (owner_id = auth.uid());
CREATE POLICY "q_ai_fees_delete" ON q_ai_fees FOR DELETE USING (owner_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_q_ai_fees_owner ON q_ai_fees(owner_id);
CREATE INDEX IF NOT EXISTS idx_q_ai_fees_load ON q_ai_fees(load_id);
CREATE INDEX IF NOT EXISTS idx_q_ai_fees_created ON q_ai_fees(created_at);
CREATE INDEX IF NOT EXISTS idx_q_ai_fees_status ON q_ai_fees(stripe_status);
