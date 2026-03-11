-- ═══════════════════════════════════════════════════════════════
-- QIVORI AI — Create MISSING tables only
-- (profiles and loads already exist — do NOT touch them)
-- Paste this into: Supabase Dashboard → SQL Editor → New Query → Run
-- ═══════════════════════════════════════════════════════════════

-- ─── COMPANIES ──────────────────────────────────────────────
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
CREATE POLICY "companies_select" ON companies FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY "companies_insert" ON companies FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "companies_update" ON companies FOR UPDATE USING (owner_id = auth.uid());
CREATE POLICY "companies_delete" ON companies FOR DELETE USING (owner_id = auth.uid());

-- ─── VEHICLES ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vehicles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  unit_number TEXT,
  type TEXT DEFAULT 'Truck',
  year INTEGER,
  make TEXT,
  model TEXT,
  vin TEXT,
  license_plate TEXT,
  license_state TEXT,
  status TEXT DEFAULT 'Active',
  current_miles INTEGER DEFAULT 0,
  next_service_miles INTEGER,
  insurance_expiry DATE,
  registration_expiry DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vehicles_select" ON vehicles FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY "vehicles_insert" ON vehicles FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "vehicles_update" ON vehicles FOR UPDATE USING (owner_id = auth.uid());
CREATE POLICY "vehicles_delete" ON vehicles FOR DELETE USING (owner_id = auth.uid());

-- ─── DRIVERS ────────────────────────────────────────────────
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
  status TEXT DEFAULT 'Active',
  hire_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "drivers_select" ON drivers FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY "drivers_insert" ON drivers FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "drivers_update" ON drivers FOR UPDATE USING (owner_id = auth.uid());
CREATE POLICY "drivers_delete" ON drivers FOR DELETE USING (owner_id = auth.uid());

-- ─── LOAD STOPS ─────────────────────────────────────────────
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
CREATE POLICY "load_stops_select" ON load_stops FOR SELECT USING (
  EXISTS (SELECT 1 FROM loads WHERE loads.id = load_stops.load_id)
);
CREATE POLICY "load_stops_insert" ON load_stops FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM loads WHERE loads.id = load_stops.load_id)
);
CREATE POLICY "load_stops_update" ON load_stops FOR UPDATE USING (
  EXISTS (SELECT 1 FROM loads WHERE loads.id = load_stops.load_id)
);
CREATE POLICY "load_stops_delete" ON load_stops FOR DELETE USING (
  EXISTS (SELECT 1 FROM loads WHERE loads.id = load_stops.load_id)
);

-- ─── CHECK CALLS ────────────────────────────────────────────
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
CREATE POLICY "check_calls_select" ON check_calls FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY "check_calls_insert" ON check_calls FOR INSERT WITH CHECK (owner_id = auth.uid());

-- ─── INVOICES ───────────────────────────────────────────────
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
  status TEXT DEFAULT 'Unpaid',
  driver_name TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoices_select" ON invoices FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY "invoices_insert" ON invoices FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "invoices_update" ON invoices FOR UPDATE USING (owner_id = auth.uid());
CREATE POLICY "invoices_delete" ON invoices FOR DELETE USING (owner_id = auth.uid());

-- ─── EXPENSES ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date DATE DEFAULT CURRENT_DATE,
  category TEXT NOT NULL,
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
CREATE POLICY "expenses_select" ON expenses FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY "expenses_insert" ON expenses FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "expenses_update" ON expenses FOR UPDATE USING (owner_id = auth.uid());
CREATE POLICY "expenses_delete" ON expenses FOR DELETE USING (owner_id = auth.uid());

-- ─── DOCUMENTS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  load_id UUID REFERENCES loads(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  type TEXT,
  file_url TEXT,
  file_size INTEGER,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "documents_select" ON documents FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY "documents_insert" ON documents FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "documents_update" ON documents FOR UPDATE USING (owner_id = auth.uid());
CREATE POLICY "documents_delete" ON documents FOR DELETE USING (owner_id = auth.uid());

-- ═══════════════════════════════════════════════════════════════
-- TRIGGERS & FUNCTIONS
-- ═══════════════════════════════════════════════════════════════

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'companies', 'vehicles', 'drivers', 'invoices', 'expenses'
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

-- Auto-generate invoice numbers
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
-- INDEXES
-- ═══════════════════════════════════════════════════════════════
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
-- ═══════════════════════════════════════════════════════════════
INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "storage_upload" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'documents' AND auth.uid() IS NOT NULL);
CREATE POLICY "storage_view" ON storage.objects
  FOR SELECT USING (bucket_id = 'documents');
CREATE POLICY "storage_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ═══════════════════════════════════════════════════════════════
-- DONE! All 8 missing tables created.
-- ═══════════════════════════════════════════════════════════════
