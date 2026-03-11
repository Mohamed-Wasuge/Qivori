-- ═══════════════════════════════════════════════════════════════
-- QIVORI AI — Full Supabase Database Schema
-- Run this in Supabase SQL Editor (SQL Editor → New Query)
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. PROFILES (extends auth.users) ───────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'carrier' CHECK (role IN ('admin', 'broker', 'carrier')),
  full_name TEXT,
  company_name TEXT,
  mc_number TEXT,
  dot_number TEXT,
  phone TEXT,
  city TEXT,
  state TEXT,
  equipment_type TEXT,
  plan TEXT DEFAULT 'trial',
  status TEXT DEFAULT 'pending' CHECK (status IN ('active', 'pending', 'suspended', 'trial')),
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Admins can view all profiles" ON profiles FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Admins can update all profiles" ON profiles FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ─── 2. COMPANY ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS companies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  mc_number TEXT,
  dot_number TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  ein TEXT,
  logo TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company" ON companies FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY "Users can insert own company" ON companies FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Users can update own company" ON companies FOR UPDATE USING (owner_id = auth.uid());
CREATE POLICY "Users can delete own company" ON companies FOR DELETE USING (owner_id = auth.uid());

-- ─── 3. VEHICLES (fleet) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS vehicles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  unit_number TEXT,
  type TEXT DEFAULT 'Truck' CHECK (type IN ('Truck', 'Trailer')),
  year INTEGER,
  make TEXT,
  model TEXT,
  vin TEXT,
  license_plate TEXT,
  license_state TEXT,
  status TEXT DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive', 'Maintenance', 'Out of Service')),
  current_miles INTEGER DEFAULT 0,
  next_service_miles INTEGER,
  insurance_expiry DATE,
  registration_expiry DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own vehicles" ON vehicles FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY "Users can insert own vehicles" ON vehicles FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Users can update own vehicles" ON vehicles FOR UPDATE USING (owner_id = auth.uid());
CREATE POLICY "Users can delete own vehicles" ON vehicles FOR DELETE USING (owner_id = auth.uid());

-- ─── 4. DRIVERS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS drivers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  license_number TEXT,
  license_state TEXT,
  license_expiry DATE,
  medical_card_expiry DATE,
  status TEXT DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive', 'On Leave')),
  hire_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own drivers" ON drivers FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY "Users can insert own drivers" ON drivers FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Users can update own drivers" ON drivers FOR UPDATE USING (owner_id = auth.uid());
CREATE POLICY "Users can delete own drivers" ON drivers FOR DELETE USING (owner_id = auth.uid());

-- ─── 5. LOADS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  load_number TEXT NOT NULL,
  broker TEXT,
  broker_phone TEXT,
  broker_email TEXT,
  origin TEXT NOT NULL,
  origin_address TEXT,
  origin_zip TEXT,
  destination TEXT NOT NULL,
  destination_address TEXT,
  destination_zip TEXT,
  shipper_name TEXT,
  consignee_name TEXT,
  miles INTEGER DEFAULT 0,
  rate_per_mile NUMERIC(10,2) DEFAULT 0,
  gross_pay NUMERIC(10,2) DEFAULT 0,
  weight TEXT,
  commodity TEXT,
  equipment TEXT DEFAULT 'Dry Van',
  load_type TEXT DEFAULT 'FTL' CHECK (load_type IN ('FTL', 'LTL', 'Partial')),
  pickup_date TIMESTAMPTZ,
  pickup_time TEXT,
  delivery_date TIMESTAMPTZ,
  delivery_time TEXT,
  driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
  driver_name TEXT,
  vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'Rate Con Received' CHECK (status IN (
    'Rate Con Received', 'Assigned to Driver', 'Dispatched',
    'In Transit', 'At Pickup', 'At Delivery', 'Delivered',
    'Invoiced', 'Cancelled'
  )),
  reference_number TEXT,
  po_number TEXT,
  special_instructions TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE loads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own loads" ON loads FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY "Users can insert own loads" ON loads FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Users can update own loads" ON loads FOR UPDATE USING (owner_id = auth.uid());
CREATE POLICY "Users can delete own loads" ON loads FOR DELETE USING (owner_id = auth.uid());
-- Admins can see all loads
CREATE POLICY "Admins can view all loads" ON loads FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ─── 6. LOAD STOPS (multi-stop support) ────────────────────
CREATE TABLE IF NOT EXISTS load_stops (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  load_id UUID REFERENCES loads(id) ON DELETE CASCADE NOT NULL,
  sequence INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('pickup', 'dropoff')),
  city TEXT,
  address TEXT,
  scheduled_time TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'current', 'complete')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE load_stops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own load stops" ON load_stops FOR SELECT USING (
  EXISTS (SELECT 1 FROM loads WHERE loads.id = load_stops.load_id AND loads.owner_id = auth.uid())
);
CREATE POLICY "Users can insert own load stops" ON load_stops FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM loads WHERE loads.id = load_stops.load_id AND loads.owner_id = auth.uid())
);
CREATE POLICY "Users can update own load stops" ON load_stops FOR UPDATE USING (
  EXISTS (SELECT 1 FROM loads WHERE loads.id = load_stops.load_id AND loads.owner_id = auth.uid())
);
CREATE POLICY "Users can delete own load stops" ON load_stops FOR DELETE USING (
  EXISTS (SELECT 1 FROM loads WHERE loads.id = load_stops.load_id AND loads.owner_id = auth.uid())
);

-- ─── 7. CHECK CALLS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS check_calls (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  load_id UUID REFERENCES loads(id) ON DELETE CASCADE NOT NULL,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  location TEXT,
  status TEXT,
  eta TEXT,
  notes TEXT,
  called_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE check_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own check calls" ON check_calls FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY "Users can insert own check calls" ON check_calls FOR INSERT WITH CHECK (owner_id = auth.uid());

-- ─── 8. INVOICES ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  invoice_number TEXT NOT NULL,
  load_id UUID REFERENCES loads(id) ON DELETE SET NULL,
  load_number TEXT,
  broker TEXT,
  route TEXT,
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  invoice_date DATE DEFAULT CURRENT_DATE,
  due_date DATE,
  status TEXT DEFAULT 'Unpaid' CHECK (status IN ('Unpaid', 'Paid', 'Factored', 'Overdue', 'Disputed')),
  driver_name TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own invoices" ON invoices FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY "Users can insert own invoices" ON invoices FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Users can update own invoices" ON invoices FOR UPDATE USING (owner_id = auth.uid());
CREATE POLICY "Users can delete own invoices" ON invoices FOR DELETE USING (owner_id = auth.uid());

-- ─── 9. EXPENSES ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date DATE DEFAULT CURRENT_DATE,
  category TEXT NOT NULL CHECK (category IN (
    'Fuel', 'Maintenance', 'Tolls', 'Lumper', 'Permits',
    'Insurance', 'Parking', 'Food', 'Repairs', 'Other'
  )),
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  merchant TEXT,
  load_number TEXT,
  notes TEXT,
  driver_name TEXT,
  receipt_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own expenses" ON expenses FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY "Users can insert own expenses" ON expenses FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Users can update own expenses" ON expenses FOR UPDATE USING (owner_id = auth.uid());
CREATE POLICY "Users can delete own expenses" ON expenses FOR DELETE USING (owner_id = auth.uid());

-- ─── 10. DOCUMENTS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  load_id UUID REFERENCES loads(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  type TEXT CHECK (type IN ('Rate Con', 'BOL', 'POD', 'Invoice', 'Insurance', 'Registration', 'License', 'Other')),
  file_url TEXT,
  file_size INTEGER,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own documents" ON documents FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY "Users can insert own documents" ON documents FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Users can update own documents" ON documents FOR UPDATE USING (owner_id = auth.uid());
CREATE POLICY "Users can delete own documents" ON documents FOR DELETE USING (owner_id = auth.uid());

-- ═══════════════════════════════════════════════════════════════
-- TRIGGERS
-- ═══════════════════════════════════════════════════════════════

-- Auto-update updated_at on any table
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to all relevant tables
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'profiles', 'companies', 'vehicles', 'drivers',
    'loads', 'invoices', 'expenses'
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

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, role, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'carrier'),
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Auto-generate load_number sequence
CREATE SEQUENCE IF NOT EXISTS load_number_seq START 5000;

CREATE OR REPLACE FUNCTION generate_load_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.load_number IS NULL OR NEW.load_number = '' THEN
    NEW.load_number = 'QV-' || nextval('load_number_seq');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS loads_auto_number ON loads;
CREATE TRIGGER loads_auto_number
  BEFORE INSERT ON loads
  FOR EACH ROW EXECUTE FUNCTION generate_load_number();

-- Auto-generate invoice_number sequence
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START 100;

CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
    NEW.invoice_number = 'INV-' || LPAD(nextval('invoice_number_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS invoices_auto_number ON invoices;
CREATE TRIGGER invoices_auto_number
  BEFORE INSERT ON invoices
  FOR EACH ROW EXECUTE FUNCTION generate_invoice_number();

-- ═══════════════════════════════════════════════════════════════
-- INDEXES (performance)
-- ═══════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_loads_owner ON loads(owner_id);
CREATE INDEX IF NOT EXISTS idx_loads_status ON loads(status);
CREATE INDEX IF NOT EXISTS idx_invoices_owner ON invoices(owner_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_expenses_owner ON expenses(owner_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_vehicles_owner ON vehicles(owner_id);
CREATE INDEX IF NOT EXISTS idx_drivers_owner ON drivers(owner_id);
CREATE INDEX IF NOT EXISTS idx_documents_owner ON documents(owner_id);
CREATE INDEX IF NOT EXISTS idx_check_calls_load ON check_calls(load_id);
CREATE INDEX IF NOT EXISTS idx_load_stops_load ON load_stops(load_id);

-- ═══════════════════════════════════════════════════════════════
-- STORAGE BUCKET
-- Run this OR create the bucket manually in Supabase Dashboard → Storage
-- ═══════════════════════════════════════════════════════════════
INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: users can upload/view/delete their own files
CREATE POLICY "Users can upload documents" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'documents' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can view documents" ON storage.objects
  FOR SELECT USING (bucket_id = 'documents');

CREATE POLICY "Users can delete own documents" ON storage.objects
  FOR DELETE USING (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ═══════════════════════════════════════════════════════════════
-- DONE — Now set up your admin account:
-- 1. Go to Authentication → Users → Add User
-- 2. Email: mwasuge@qivori.com, Password: (your choice)
-- 3. Run: UPDATE profiles SET role = 'admin', status = 'active' WHERE email = 'mwasuge@qivori.com';
-- ═══════════════════════════════════════════════════════════════
