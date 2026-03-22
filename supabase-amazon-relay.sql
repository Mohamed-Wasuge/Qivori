-- Amazon Relay Integration: add source tracking columns to loads table
-- Run this in Supabase SQL Editor

-- Add load_source column (broker, amazon_relay, direct, dat, 123loadboard, etc.)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='loads' AND column_name='load_source') THEN
    ALTER TABLE loads ADD COLUMN load_source TEXT DEFAULT NULL;
  END IF;
END $$;

-- Add amazon_block_id for Amazon Relay block reference
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='loads' AND column_name='amazon_block_id') THEN
    ALTER TABLE loads ADD COLUMN amazon_block_id TEXT DEFAULT NULL;
  END IF;
END $$;

-- Add payment_terms (biweekly for Amazon, net30, net45, etc.)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='loads' AND column_name='payment_terms') THEN
    ALTER TABLE loads ADD COLUMN payment_terms TEXT DEFAULT NULL;
  END IF;
END $$;

-- Index for filtering by source
CREATE INDEX IF NOT EXISTS idx_loads_source ON loads(load_source) WHERE load_source IS NOT NULL;
