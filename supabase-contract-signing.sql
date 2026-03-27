-- Driver Contracts: Add signing, PDF, expiry, and amendment columns
-- Run this in Supabase SQL Editor

-- Signing token for public driver signature page
ALTER TABLE driver_contracts ADD COLUMN IF NOT EXISTS signing_token UUID UNIQUE;
ALTER TABLE driver_contracts ADD COLUMN IF NOT EXISTS signing_token_expires_at TIMESTAMPTZ;

-- Driver signature fields
ALTER TABLE driver_contracts ADD COLUMN IF NOT EXISTS driver_signature TEXT;
ALTER TABLE driver_contracts ADD COLUMN IF NOT EXISTS driver_signed_date TIMESTAMPTZ;
ALTER TABLE driver_contracts ADD COLUMN IF NOT EXISTS driver_signed_ip TEXT;
ALTER TABLE driver_contracts ADD COLUMN IF NOT EXISTS driver_signed_user_agent TEXT;

-- Carrier signature metadata
ALTER TABLE driver_contracts ADD COLUMN IF NOT EXISTS carrier_signed_ip TEXT;
ALTER TABLE driver_contracts ADD COLUMN IF NOT EXISTS carrier_signed_user_agent TEXT;

-- PDF storage
ALTER TABLE driver_contracts ADD COLUMN IF NOT EXISTS pdf_url TEXT;
ALTER TABLE driver_contracts ADD COLUMN IF NOT EXISTS pdf_path TEXT;

-- Send tracking
ALTER TABLE driver_contracts ADD COLUMN IF NOT EXISTS sent_via TEXT; -- 'email', 'sms', 'both'
ALTER TABLE driver_contracts ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

-- Execution status
ALTER TABLE driver_contracts ADD COLUMN IF NOT EXISTS fully_executed BOOLEAN DEFAULT false;

-- Expiry alert flags
ALTER TABLE driver_contracts ADD COLUMN IF NOT EXISTS expiry_alert_30d_sent BOOLEAN DEFAULT false;
ALTER TABLE driver_contracts ADD COLUMN IF NOT EXISTS expiry_alert_7d_sent BOOLEAN DEFAULT false;

-- Amendment support
ALTER TABLE driver_contracts ADD COLUMN IF NOT EXISTS parent_contract_id UUID REFERENCES driver_contracts(id);
ALTER TABLE driver_contracts ADD COLUMN IF NOT EXISTS amendment_number INT DEFAULT 0;
ALTER TABLE driver_contracts ADD COLUMN IF NOT EXISTS amendment_reason TEXT;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_contracts_signing_token ON driver_contracts(signing_token) WHERE signing_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contracts_end_date ON driver_contracts(end_date) WHERE end_date IS NOT NULL AND status = 'active';
CREATE INDEX IF NOT EXISTS idx_contracts_parent ON driver_contracts(parent_contract_id) WHERE parent_contract_id IS NOT NULL;
