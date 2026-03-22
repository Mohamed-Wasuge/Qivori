-- ═══════════════════════════════════════════════════════════════════════
-- LTL & Partial Load Support Migration
-- Adds freight classification fields to loads + consolidation table
-- ═══════════════════════════════════════════════════════════════════════

-- ── LTL fields on loads table ────────────────────────────────────────
ALTER TABLE loads ADD COLUMN IF NOT EXISTS freight_class TEXT;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS pallet_count INTEGER;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS stackable BOOLEAN DEFAULT false;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS length_inches NUMERIC(8,2);
ALTER TABLE loads ADD COLUMN IF NOT EXISTS width_inches NUMERIC(8,2);
ALTER TABLE loads ADD COLUMN IF NOT EXISTS height_inches NUMERIC(8,2);
ALTER TABLE loads ADD COLUMN IF NOT EXISTS handling_unit TEXT DEFAULT 'pallet' CHECK (handling_unit IN ('pallet', 'crate', 'drum', 'box', 'roll', 'bundle', 'loose'));
ALTER TABLE loads ADD COLUMN IF NOT EXISTS consolidation_id UUID;

-- ── Consolidations table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS consolidations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  vehicle_id UUID,
  driver_id UUID,
  status TEXT DEFAULT 'planning' CHECK (status IN ('planning', 'loading', 'in_transit', 'delivered')),
  total_weight NUMERIC(10,2),
  total_pallets INTEGER,
  capacity_used_pct NUMERIC(5,2),
  departure_date TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── RLS policies ─────────────────────────────────────────────────────
ALTER TABLE consolidations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own consolidations"
  ON consolidations FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "Users can insert own consolidations"
  ON consolidations FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can update own consolidations"
  ON consolidations FOR UPDATE
  USING (owner_id = auth.uid());

CREATE POLICY "Users can delete own consolidations"
  ON consolidations FOR DELETE
  USING (owner_id = auth.uid());

-- ── Indexes ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_consolidations_owner ON consolidations(owner_id);
CREATE INDEX IF NOT EXISTS idx_consolidations_status ON consolidations(status);
CREATE INDEX IF NOT EXISTS idx_loads_consolidation ON loads(consolidation_id);
CREATE INDEX IF NOT EXISTS idx_loads_load_type ON loads(load_type);
