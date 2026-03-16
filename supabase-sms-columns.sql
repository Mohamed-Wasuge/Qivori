-- Add SMS-related columns to the profiles table for opt-in/opt-out tracking
-- Run this against your Supabase database

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sms_opted_in BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sms_opted_out BOOLEAN DEFAULT false;

-- Add delivery tracking columns to sms_notifications if the table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sms_notifications') THEN
    ALTER TABLE sms_notifications ADD COLUMN IF NOT EXISTS delivery_status TEXT;
    ALTER TABLE sms_notifications ADD COLUMN IF NOT EXISTS delivery_updated_at TIMESTAMPTZ;
  END IF;
END $$;

-- Index on phone for fast opt-out lookups
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON profiles (phone) WHERE phone IS NOT NULL;
