-- ═══════════════════════════════════════════════════════════════
-- VEHICLE DOCUMENTS — Truck & Trailer Document Management
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- Vehicle Documents — like driver_dq_files but for trucks/trailers
CREATE TABLE IF NOT EXISTS vehicle_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  owner_id UUID REFERENCES auth.users(id),
  doc_type TEXT NOT NULL CHECK (doc_type IN (
    'registration',
    'insurance_certificate',
    'dot_inspection',
    'ifta_permit',
    'irp_cab_card',
    'title',
    'lease_agreement',
    'fuel_permit',
    'oversize_permit',
    'hazmat_permit',
    'eld_certificate',
    'apportioned_plate',
    'emission_test',
    'safety_inspection',
    'warranty',
    'purchase_receipt',
    'photos',
    'other'
  )),
  file_name TEXT NOT NULL,
  file_url TEXT,
  file_size INT,
  status TEXT NOT NULL DEFAULT 'valid' CHECK (status IN ('valid','expiring_soon','expired','pending','rejected')),
  issued_date DATE,
  expiry_date DATE,
  notes TEXT,
  verified_by TEXT,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_vehicle_docs_vehicle ON vehicle_documents (vehicle_id, doc_type);
CREATE INDEX idx_vehicle_docs_expiry ON vehicle_documents (expiry_date) WHERE expiry_date IS NOT NULL;
CREATE INDEX idx_vehicle_docs_status ON vehicle_documents (status);
CREATE INDEX idx_vehicle_docs_owner ON vehicle_documents (owner_id);

ALTER TABLE vehicle_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage their vehicle documents" ON vehicle_documents
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Service role full access on vehicle_documents" ON vehicle_documents
  FOR ALL USING (true) WITH CHECK (true);

-- Add DOT inspection date to vehicles table if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vehicles' AND column_name = 'dot_inspection_date') THEN
    ALTER TABLE vehicles ADD COLUMN dot_inspection_date DATE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vehicles' AND column_name = 'dot_inspection_expiry') THEN
    ALTER TABLE vehicles ADD COLUMN dot_inspection_expiry DATE;
  END IF;
END $$;
