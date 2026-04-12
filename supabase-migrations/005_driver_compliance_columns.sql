-- Migration: Driver compliance columns + storage bucket for mobile app
-- Run in Supabase SQL Editor

-- 1. profiles: CDL, drug test, factoring fields
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS cdl_number TEXT,
  ADD COLUMN IF NOT EXISTS cdl_state TEXT,
  ADD COLUMN IF NOT EXISTS cdl_expiry DATE,
  ADD COLUMN IF NOT EXISTS drug_test_date DATE,
  ADD COLUMN IF NOT EXISTS cdl_doc_path TEXT,
  ADD COLUMN IF NOT EXISTS medical_doc_path TEXT,
  ADD COLUMN IF NOT EXISTS drug_test_doc_path TEXT,
  ADD COLUMN IF NOT EXISTS factoring_company TEXT,
  ADD COLUMN IF NOT EXISTS factoring_status TEXT DEFAULT 'not_connected' CHECK (factoring_status IN ('connected', 'not_connected')),
  ADD COLUMN IF NOT EXISTS factoring_contact_url TEXT,
  ADD COLUMN IF NOT EXISTS subscription_plan TEXT,
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS eld_provider TEXT,
  ADD COLUMN IF NOT EXISTS eld_token TEXT;

-- 2. negotiation_settings table (Q uses this when calling brokers)
CREATE TABLE IF NOT EXISTS negotiation_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL UNIQUE,
  min_rate_per_mile NUMERIC DEFAULT 2.50,
  counter_offer_markup_pct NUMERIC DEFAULT 12,
  max_counter_rounds INT DEFAULT 3,
  auto_accept_above_minimum BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE negotiation_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own negotiation settings"
  ON negotiation_settings FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3. subscriptions table (Stripe billing)
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL UNIQUE,
  stripe_subscription_id TEXT,
  stripe_customer_id TEXT,
  plan_name TEXT,
  price_usd NUMERIC,
  billing_cycle TEXT DEFAULT 'monthly',
  status TEXT DEFAULT 'active',
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own subscription"
  ON subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins manage all subscriptions"
  ON subscriptions FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager'))
  );

-- 4. updated_at triggers
CREATE OR REPLACE FUNCTION update_negotiation_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS neg_updated_at ON negotiation_settings;
CREATE TRIGGER neg_updated_at
  BEFORE UPDATE ON negotiation_settings
  FOR EACH ROW EXECUTE FUNCTION update_negotiation_updated_at();

-- 5. Storage bucket: driver-documents (private, per-user uploads)
-- Run this in Supabase Dashboard → Storage → New bucket if it doesn't exist:
-- Name: driver-documents, Public: false
-- Or via SQL:
INSERT INTO storage.buckets (id, name, public)
VALUES ('driver-documents', 'driver-documents', false)
ON CONFLICT (id) DO NOTHING;

-- RLS for driver-documents bucket
CREATE POLICY "Users upload own driver docs"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'driver-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users read own driver docs"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'driver-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own driver docs"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'driver-documents' AND auth.uid()::text = (storage.foldername(name))[1]);
