-- AI Caller System Tables Migration
-- Tables: load_matches, call_logs, call_transcripts, rate_confirmations
-- Also: carrier_documents, carrier_packets for Phase 2

-- ============================================
-- Phase 1: AI Broker Calling System Tables
-- ============================================

-- Load matches from autonomous load finder
CREATE TABLE IF NOT EXISTS load_matches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  load_id TEXT,
  source TEXT DEFAULT 'internal',
  origin TEXT,
  destination TEXT,
  rate DECIMAL(10,2),
  rate_per_mile DECIMAL(6,2),
  distance_miles INTEGER,
  weight INTEGER,
  equipment_type TEXT,
  broker_name TEXT,
  broker_phone TEXT,
  broker_email TEXT,
  pickup_date TIMESTAMPTZ,
  delivery_date TIMESTAMPTZ,
  score INTEGER DEFAULT 0,
  score_reasons JSONB DEFAULT '[]',
  status TEXT DEFAULT 'new',
  matched_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Call logs for AI broker calls
CREATE TABLE IF NOT EXISTS call_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  load_id TEXT,
  broker_phone TEXT NOT NULL,
  broker_name TEXT,
  twilio_call_sid TEXT UNIQUE,
  call_status TEXT DEFAULT 'initiated',
  call_duration INTEGER DEFAULT 0,
  recording_url TEXT,
  recording_duration INTEGER,
  outcome TEXT,
  agreed_rate DECIMAL(10,2),
  broker_email TEXT,
  notes TEXT,
  amd_result TEXT,
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Call transcripts for each turn of conversation
CREATE TABLE IF NOT EXISTS call_transcripts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  call_log_id UUID REFERENCES call_logs(id) ON DELETE CASCADE,
  call_sid TEXT,
  speaker TEXT NOT NULL CHECK (speaker IN ('ai_alex', 'broker', 'system')),
  message TEXT NOT NULL,
  stage TEXT,
  confidence DECIMAL(3,2),
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Rate confirmations sent to brokers
CREATE TABLE IF NOT EXISTS rate_confirmations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  load_id TEXT,
  call_log_id UUID REFERENCES call_logs(id),
  confirmation_number TEXT UNIQUE NOT NULL,
  broker_name TEXT,
  broker_email TEXT,
  carrier_name TEXT,
  mc_number TEXT,
  dot_number TEXT,
  origin TEXT,
  destination TEXT,
  agreed_rate DECIMAL(10,2),
  pickup_date TIMESTAMPTZ,
  delivery_date TIMESTAMPTZ,
  equipment_type TEXT,
  email_sent BOOLEAN DEFAULT false,
  email_sent_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Phase 2: Carrier Packet System Tables
-- ============================================

-- Carrier documents (insurance, W9, operating authority, etc.)
CREATE TABLE IF NOT EXISTS carrier_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  document_type TEXT NOT NULL CHECK (document_type IN ('insurance_certificate', 'w9_form', 'operating_authority', 'medical_card', 'other')),
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT DEFAULT 'application/pdf',
  storage_bucket TEXT DEFAULT 'carrier-documents',
  expiry_date DATE,
  is_expired BOOLEAN DEFAULT false,
  expiry_alert_30d_sent BOOLEAN DEFAULT false,
  expiry_alert_7d_sent BOOLEAN DEFAULT false,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Carrier profile info (MC/DOT numbers, company details)
CREATE TABLE IF NOT EXISTS carrier_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) UNIQUE NOT NULL,
  company_name TEXT,
  mc_number TEXT,
  dot_number TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  insurance_provider TEXT,
  insurance_policy_number TEXT,
  insurance_expiry DATE,
  medical_card_expiry DATE,
  packet_complete BOOLEAN DEFAULT false,
  packet_last_compiled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Carrier vetting integrations (MyCarrierPackets, Carrier411, RMIS)
CREATE TABLE IF NOT EXISTS carrier_integrations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('mycarrierpackets', 'carrier411', 'rmis')),
  api_key TEXT,
  is_connected BOOLEAN DEFAULT false,
  last_sync_at TIMESTAMPTZ,
  status TEXT DEFAULT 'disconnected',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, provider)
);

-- Carrier packet submissions to brokers
CREATE TABLE IF NOT EXISTS carrier_packet_submissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  broker_name TEXT,
  broker_email TEXT,
  load_id TEXT,
  rate_confirmation_id UUID REFERENCES rate_confirmations(id),
  documents_included JSONB DEFAULT '[]',
  packet_pdf_path TEXT,
  submitted_via TEXT DEFAULT 'email',
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'sent',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Indexes
-- ============================================

CREATE INDEX IF NOT EXISTS idx_load_matches_user ON load_matches(user_id);
CREATE INDEX IF NOT EXISTS idx_load_matches_status ON load_matches(status);
CREATE INDEX IF NOT EXISTS idx_load_matches_score ON load_matches(score DESC);

CREATE INDEX IF NOT EXISTS idx_call_logs_user ON call_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_call_sid ON call_logs(twilio_call_sid);
CREATE INDEX IF NOT EXISTS idx_call_logs_status ON call_logs(call_status);

CREATE INDEX IF NOT EXISTS idx_call_transcripts_call ON call_transcripts(call_log_id);
CREATE INDEX IF NOT EXISTS idx_call_transcripts_sid ON call_transcripts(call_sid);

CREATE INDEX IF NOT EXISTS idx_rate_confirmations_user ON rate_confirmations(user_id);
CREATE INDEX IF NOT EXISTS idx_rate_confirmations_number ON rate_confirmations(confirmation_number);

CREATE INDEX IF NOT EXISTS idx_carrier_documents_user ON carrier_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_carrier_documents_type ON carrier_documents(user_id, document_type);
CREATE INDEX IF NOT EXISTS idx_carrier_documents_expiry ON carrier_documents(expiry_date) WHERE expiry_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_carrier_profiles_user ON carrier_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_carrier_profiles_mc ON carrier_profiles(mc_number);

CREATE INDEX IF NOT EXISTS idx_carrier_integrations_user ON carrier_integrations(user_id);

CREATE INDEX IF NOT EXISTS idx_carrier_packet_submissions_user ON carrier_packet_submissions(user_id);

-- ============================================
-- RLS Policies
-- ============================================

ALTER TABLE load_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE carrier_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE carrier_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE carrier_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE carrier_packet_submissions ENABLE ROW LEVEL SECURITY;

-- Users can only see their own data
CREATE POLICY "Users view own load_matches" ON load_matches FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users view own call_logs" ON call_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users view own call_transcripts" ON call_transcripts FOR SELECT USING (
  call_log_id IN (SELECT id FROM call_logs WHERE user_id = auth.uid())
);
CREATE POLICY "Users view own rate_confirmations" ON rate_confirmations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users manage own carrier_documents" ON carrier_documents FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own carrier_profiles" ON carrier_profiles FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own carrier_integrations" ON carrier_integrations FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users view own packet_submissions" ON carrier_packet_submissions FOR SELECT USING (auth.uid() = user_id);

-- Service role can do everything (for API endpoints)
CREATE POLICY "Service role full access load_matches" ON load_matches FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access call_logs" ON call_logs FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access call_transcripts" ON call_transcripts FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access rate_confirmations" ON rate_confirmations FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access carrier_documents" ON carrier_documents FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access carrier_profiles" ON carrier_profiles FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access carrier_integrations" ON carrier_integrations FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access carrier_packet_submissions" ON carrier_packet_submissions FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- Storage bucket for carrier documents
-- ============================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'carrier-documents',
  'carrier-documents',
  false,
  10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policy: users can upload/view their own documents
CREATE POLICY "Users upload own carrier docs" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'carrier-documents' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users view own carrier docs" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'carrier-documents' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users delete own carrier docs" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'carrier-documents' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );
