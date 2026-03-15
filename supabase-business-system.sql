-- Business Operating System tables
-- Run this in your Supabase SQL editor

-- 1. Email logs — track all automated emails to avoid duplicates
CREATE TABLE IF NOT EXISTS email_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  template TEXT NOT NULL, -- 'welcome', 'day3', 'day7', 'day12', 'trial_expired', 'payment_failed', 'win_back_3', etc.
  sent_at TIMESTAMPTZ DEFAULT now(),
  metadata JSONB DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_email_logs_user ON email_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_template ON email_logs(template);
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_logs_unique ON email_logs(user_id, template);

-- 2. Referrals — track referral program
CREATE TABLE IF NOT EXISTS referrals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_email TEXT,
  referred_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  referral_code TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'signed_up', 'paid', 'rewarded')),
  reward_type TEXT DEFAULT 'free_month',
  reward_applied BOOLEAN DEFAULT false,
  clicks INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  converted_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_code ON referrals(referral_code);
CREATE INDEX IF NOT EXISTS idx_referrals_referred ON referrals(referred_email);
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own referrals" ON referrals FOR SELECT USING (auth.uid() = referrer_id);
CREATE POLICY "Users can insert own referrals" ON referrals FOR INSERT WITH CHECK (auth.uid() = referrer_id);

-- 3. User activity tracking for churn prevention
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_load_search TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS load_board_connected BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_code TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referred_by TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- Generate unique referral codes for existing users
-- UPDATE profiles SET referral_code = LOWER(SUBSTRING(MD5(id::text || 'qivori') FROM 1 FOR 8)) WHERE referral_code IS NULL;

-- 4. Revenue events — log all payment events for dashboard
CREATE TABLE IF NOT EXISTS revenue_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL, -- 'payment', 'refund', 'trial_start', 'trial_convert', 'churn', 'reactivation'
  amount_cents INTEGER DEFAULT 0,
  plan TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_revenue_events_type ON revenue_events(event_type);
CREATE INDEX IF NOT EXISTS idx_revenue_events_created ON revenue_events(created_at);
