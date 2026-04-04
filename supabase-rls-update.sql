-- ═══════════════════════════════════════════════════════════════
-- QIVORI AI — RLS Update: Create missing tables with RLS
-- Tables: driver_contracts, messages, payments, stripe_connect_accounts
-- Paste this into: Supabase Dashboard → SQL Editor → New Query → Run
-- ═══════════════════════════════════════════════════════════════

-- ─── DRIVER CONTRACTS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS driver_contracts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  driver_id UUID REFERENCES drivers(id) ON DELETE CASCADE,
  driver_name TEXT,
  contract_type TEXT,
  start_date DATE,
  end_date DATE,
  pay_model TEXT CHECK (pay_model IN ('percent', 'permile', 'flat')),
  pay_rate NUMERIC(10,2),
  status TEXT DEFAULT 'active',
  terms TEXT,
  file_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE driver_contracts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "driver_contracts_select" ON driver_contracts;
DROP POLICY IF EXISTS "driver_contracts_insert" ON driver_contracts;
DROP POLICY IF EXISTS "driver_contracts_update" ON driver_contracts;
DROP POLICY IF EXISTS "driver_contracts_delete" ON driver_contracts;
CREATE POLICY "driver_contracts_select" ON driver_contracts FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY "driver_contracts_insert" ON driver_contracts FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "driver_contracts_update" ON driver_contracts FOR UPDATE USING (owner_id = auth.uid());
CREATE POLICY "driver_contracts_delete" ON driver_contracts FOR DELETE USING (owner_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_driver_contracts_owner ON driver_contracts(owner_id);

-- ─── MESSAGES (load-level messaging) ──────────────────────────
-- Table may already exist — add owner_id if missing, then enable RLS
CREATE TABLE IF NOT EXISTS messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  load_id UUID REFERENCES loads(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_name TEXT,
  sender_role TEXT,
  content TEXT NOT NULL,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add owner_id column if table already existed without it
ALTER TABLE messages ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
-- Backfill owner_id from sender_id for existing rows
UPDATE messages SET owner_id = sender_id WHERE owner_id IS NULL AND sender_id IS NOT NULL;

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "messages_select" ON messages;
DROP POLICY IF EXISTS "messages_insert" ON messages;
DROP POLICY IF EXISTS "messages_update" ON messages;
DROP POLICY IF EXISTS "messages_delete" ON messages;
CREATE POLICY "messages_select" ON messages FOR SELECT USING (owner_id = auth.uid() OR sender_id = auth.uid());
CREATE POLICY "messages_insert" ON messages FOR INSERT WITH CHECK (sender_id = auth.uid());
CREATE POLICY "messages_update" ON messages FOR UPDATE USING (owner_id = auth.uid() OR sender_id = auth.uid());
CREATE POLICY "messages_delete" ON messages FOR DELETE USING (owner_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_messages_owner ON messages(owner_id);
CREATE INDEX IF NOT EXISTS idx_messages_load ON messages(load_id);

-- ─── PAYMENTS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'usd',
  method TEXT,
  status TEXT DEFAULT 'pending',
  stripe_payment_id TEXT,
  notes TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payments_select" ON payments;
DROP POLICY IF EXISTS "payments_insert" ON payments;
DROP POLICY IF EXISTS "payments_update" ON payments;
DROP POLICY IF EXISTS "payments_delete" ON payments;
CREATE POLICY "payments_select" ON payments FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY "payments_insert" ON payments FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "payments_update" ON payments FOR UPDATE USING (owner_id = auth.uid());
CREATE POLICY "payments_delete" ON payments FOR DELETE USING (owner_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_payments_owner ON payments(owner_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);

-- ─── STRIPE CONNECT ACCOUNTS ─────────────────────────────────
CREATE TABLE IF NOT EXISTS stripe_connect_accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  stripe_account_id TEXT,
  onboarding_complete BOOLEAN DEFAULT false,
  payouts_enabled BOOLEAN DEFAULT false,
  charges_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE stripe_connect_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "stripe_connect_select" ON stripe_connect_accounts;
DROP POLICY IF EXISTS "stripe_connect_insert" ON stripe_connect_accounts;
DROP POLICY IF EXISTS "stripe_connect_update" ON stripe_connect_accounts;
DROP POLICY IF EXISTS "stripe_connect_delete" ON stripe_connect_accounts;
CREATE POLICY "stripe_connect_select" ON stripe_connect_accounts FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY "stripe_connect_insert" ON stripe_connect_accounts FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "stripe_connect_update" ON stripe_connect_accounts FOR UPDATE USING (owner_id = auth.uid());
CREATE POLICY "stripe_connect_delete" ON stripe_connect_accounts FOR DELETE USING (owner_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_stripe_connect_owner ON stripe_connect_accounts(owner_id);

-- ─── updated_at triggers ──────────────────────────────────────
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'driver_contracts', 'payments', 'stripe_connect_accounts'
  ])
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', tbl || '_updated_at', tbl);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at()',
      tbl || '_updated_at', tbl
    );
  END LOOP;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- DONE! 4 tables created with full RLS.
-- ═══════════════════════════════════════════════════════════════
