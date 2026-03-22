-- Multi-Stop Loads Enhancement
-- Adds additional columns to load_stops for contact info, dates, and address details

-- Add new columns to load_stops
ALTER TABLE load_stops ADD COLUMN IF NOT EXISTS contact_name TEXT;
ALTER TABLE load_stops ADD COLUMN IF NOT EXISTS contact_phone TEXT;
ALTER TABLE load_stops ADD COLUMN IF NOT EXISTS reference_number TEXT;
ALTER TABLE load_stops ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE load_stops ADD COLUMN IF NOT EXISTS scheduled_date DATE;
ALTER TABLE load_stops ADD COLUMN IF NOT EXISTS actual_arrival TIMESTAMPTZ;
ALTER TABLE load_stops ADD COLUMN IF NOT EXISTS actual_departure TIMESTAMPTZ;
ALTER TABLE load_stops ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE load_stops ADD COLUMN IF NOT EXISTS zip_code TEXT;

-- Index for efficient load_stops lookups
CREATE INDEX IF NOT EXISTS idx_load_stops_load_id ON load_stops (load_id);

-- RLS policies for load_stops (owner_id based via loads join)
ALTER TABLE load_stops ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (idempotent)
DROP POLICY IF EXISTS "load_stops_select" ON load_stops;
DROP POLICY IF EXISTS "load_stops_insert" ON load_stops;
DROP POLICY IF EXISTS "load_stops_update" ON load_stops;
DROP POLICY IF EXISTS "load_stops_delete" ON load_stops;

-- Select: user can see stops for their own loads
CREATE POLICY "load_stops_select" ON load_stops
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM loads WHERE loads.id = load_stops.load_id AND loads.owner_id = auth.uid())
  );

-- Insert: user can add stops to their own loads
CREATE POLICY "load_stops_insert" ON load_stops
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM loads WHERE loads.id = load_stops.load_id AND loads.owner_id = auth.uid())
  );

-- Update: user can update stops on their own loads
CREATE POLICY "load_stops_update" ON load_stops
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM loads WHERE loads.id = load_stops.load_id AND loads.owner_id = auth.uid())
  );

-- Delete: user can delete stops on their own loads
CREATE POLICY "load_stops_delete" ON load_stops
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM loads WHERE loads.id = load_stops.load_id AND loads.owner_id = auth.uid())
  );
