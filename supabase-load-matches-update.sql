-- Add missing columns to load_matches for load-finder integration
-- Run this AFTER the initial supabase-ai-caller-tables.sql migration

ALTER TABLE load_matches ADD COLUMN IF NOT EXISTS broker_phone TEXT;
ALTER TABLE load_matches ADD COLUMN IF NOT EXISTS distance_miles INTEGER;

-- Update score_reasons column type if it's not already JSONB
-- (original migration may have it as JSONB already)
ALTER TABLE load_matches ALTER COLUMN score_reasons SET DEFAULT '[]';
