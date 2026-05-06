-- Add driver pay configuration columns to drivers table
-- Run in Supabase SQL Editor

ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS pay_model TEXT NOT NULL DEFAULT 'percent'
    CHECK (pay_model IN ('percent', 'permile', 'flat')),
  ADD COLUMN IF NOT EXISTS pay_rate NUMERIC(8,2) DEFAULT 28;
