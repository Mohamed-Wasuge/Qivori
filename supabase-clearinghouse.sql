-- Clearinghouse Queries: persistent storage for FMCSA Drug & Alcohol queries
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS clearinghouse_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  query_id TEXT NOT NULL,
  driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
  driver_name TEXT NOT NULL,
  cdl_number TEXT,
  query_type TEXT NOT NULL DEFAULT 'Pre-Employment',
  query_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'Processing',
  result TEXT DEFAULT 'Pending',
  cost NUMERIC(6,2) DEFAULT 1.25,
  consent_given BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ch_queries_owner ON clearinghouse_queries(owner_id);
CREATE INDEX IF NOT EXISTS idx_ch_queries_driver ON clearinghouse_queries(driver_id);

ALTER TABLE clearinghouse_queries ENABLE ROW LEVEL SECURITY;

-- Owner can manage their own queries
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='clearinghouse_queries' AND policyname='Owners manage clearinghouse queries') THEN
    CREATE POLICY "Owners manage clearinghouse queries" ON clearinghouse_queries
      FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
  END IF;
END $$;

-- Service role full access
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='clearinghouse_queries' AND policyname='Service role clearinghouse access') THEN
    CREATE POLICY "Service role clearinghouse access" ON clearinghouse_queries
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
