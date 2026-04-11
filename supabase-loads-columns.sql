-- ============================================================
-- QIVORI — ADD MISSING COLUMNS TO LOADS TABLE
-- These columns are referenced by the app but missing from production
-- ============================================================

-- Core identification
ALTER TABLE loads ADD COLUMN IF NOT EXISTS load_number TEXT;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS miles INTEGER;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS rate_per_mile NUMERIC(10,2);

-- Location details
ALTER TABLE loads ADD COLUMN IF NOT EXISTS origin_address TEXT;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS origin_zip TEXT;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS destination_address TEXT;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS destination_zip TEXT;

-- Timing
ALTER TABLE loads ADD COLUMN IF NOT EXISTS pickup_time TEXT;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS delivery_time TEXT;

-- Broker contact
ALTER TABLE loads ADD COLUMN IF NOT EXISTS broker_phone TEXT;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS broker_email TEXT;

-- Shipper
ALTER TABLE loads ADD COLUMN IF NOT EXISTS shipper_name TEXT;

-- References
ALTER TABLE loads ADD COLUMN IF NOT EXISTS reference_number TEXT;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS po_number TEXT;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS special_instructions TEXT;

-- Driver assignment
ALTER TABLE loads ADD COLUMN IF NOT EXISTS driver_name TEXT;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS driver_id UUID REFERENCES drivers(id);
ALTER TABLE loads ADD COLUMN IF NOT EXISTS vehicle_id UUID REFERENCES vehicles(id);

-- ============================================================
-- AUTO-GENERATE LOAD NUMBERS
-- ============================================================

-- Create sequence if not exists
CREATE SEQUENCE IF NOT EXISTS load_number_seq START WITH 5000;

-- Auto-generate load_number on insert
CREATE OR REPLACE FUNCTION generate_load_number()
RETURNS TRIGGER AS $fn$
BEGIN
    IF NEW.load_number IS NULL THEN
        NEW.load_number := 'QV-' || nextval('load_number_seq');
    END IF;
    RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

-- Drop existing trigger if any, then create
DROP TRIGGER IF EXISTS loads_auto_number ON loads;
CREATE TRIGGER loads_auto_number
    BEFORE INSERT ON loads
    FOR EACH ROW EXECUTE FUNCTION generate_load_number();

-- ============================================================
-- INDEXES FOR NEW COLUMNS
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_loads_load_number ON loads(load_number);
CREATE INDEX IF NOT EXISTS idx_loads_driver_id ON loads(driver_id);
CREATE INDEX IF NOT EXISTS idx_loads_vehicle_id ON loads(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_loads_miles ON loads(miles);
CREATE INDEX IF NOT EXISTS idx_loads_broker_name ON loads(broker_name);

-- ============================================================
-- BACKFILL: Set load_number for existing loads that don't have one
-- ============================================================

UPDATE loads SET load_number = 'QV-' || nextval('load_number_seq')
WHERE load_number IS NULL;
