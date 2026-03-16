-- AI Email Threads table — stores all inbound emails and AI auto-replies
CREATE TABLE IF NOT EXISTS ai_email_threads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_email TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  subject TEXT,
  sender_message TEXT,
  ai_reply TEXT,
  status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'escalated', 'human_replied')),
  inbound_email_id TEXT,
  escalated BOOLEAN DEFAULT FALSE,
  admin_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_ai_email_threads_sender ON ai_email_threads(sender_email);
CREATE INDEX IF NOT EXISTS idx_ai_email_threads_created ON ai_email_threads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_email_threads_status ON ai_email_threads(status);
CREATE INDEX IF NOT EXISTS idx_ai_email_threads_escalated ON ai_email_threads(escalated) WHERE escalated = TRUE;

-- RLS: only service role can read/write (API routes use service key)
ALTER TABLE ai_email_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON ai_email_threads
  FOR ALL USING (auth.role() = 'service_role');
