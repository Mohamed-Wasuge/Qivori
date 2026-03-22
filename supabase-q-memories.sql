-- Q AI Memory System — cross-session driver intelligence
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS q_memories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  memory_type TEXT NOT NULL CHECK (memory_type IN ('preference', 'pattern', 'fact', 'interaction', 'alert')),
  content TEXT NOT NULL,
  importance INTEGER DEFAULT 5 CHECK (importance BETWEEN 1 AND 10),
  metadata JSONB DEFAULT '{}'::jsonb,
  last_referenced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE q_memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "q_memories_select" ON q_memories FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY "q_memories_insert" ON q_memories FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "q_memories_update" ON q_memories FOR UPDATE USING (owner_id = auth.uid());
CREATE POLICY "q_memories_delete" ON q_memories FOR DELETE USING (owner_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_q_memories_owner ON q_memories(owner_id);
CREATE INDEX IF NOT EXISTS idx_q_memories_type ON q_memories(memory_type);
CREATE INDEX IF NOT EXISTS idx_q_memories_importance ON q_memories(importance DESC);
