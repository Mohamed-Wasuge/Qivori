-- ═══════════════════════════════════════════════════════════════
-- QIVORI AI — Add missing driver columns + auto-book support
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- ═══════════════════════════════════════════════════════════════

-- ─── DRIVER COLUMNS (for seed + auto-book scoring) ──────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='drivers' AND column_name='license_class') THEN
    ALTER TABLE drivers ADD COLUMN license_class TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='drivers' AND column_name='endorsements') THEN
    ALTER TABLE drivers ADD COLUMN endorsements TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='drivers' AND column_name='equipment_experience') THEN
    ALTER TABLE drivers ADD COLUMN equipment_experience TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='drivers' AND column_name='years_experience') THEN
    ALTER TABLE drivers ADD COLUMN years_experience INTEGER;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='drivers' AND column_name='address') THEN
    ALTER TABLE drivers ADD COLUMN address TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='drivers' AND column_name='emergency_contact_name') THEN
    ALTER TABLE drivers ADD COLUMN emergency_contact_name TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='drivers' AND column_name='emergency_contact_phone') THEN
    ALTER TABLE drivers ADD COLUMN emergency_contact_phone TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='drivers' AND column_name='current_load_id') THEN
    ALTER TABLE drivers ADD COLUMN current_load_id UUID;
  END IF;
END $$;

-- ─── LOADS: Add 'Booked' and 'Paid' to status CHECK ────────
-- Drop old constraint and recreate with new values
ALTER TABLE loads DROP CONSTRAINT IF EXISTS loads_status_check;
ALTER TABLE loads ADD CONSTRAINT loads_status_check CHECK (status IN (
  'Rate Con Received', 'Booked', 'Assigned to Driver', 'Dispatched',
  'In Transit', 'At Pickup', 'At Delivery', 'Delivered',
  'Invoiced', 'Paid', 'Cancelled'
));

-- ─── INDEX for driver scoring queries ───────────────────────
CREATE INDEX IF NOT EXISTS idx_drivers_owner_status ON drivers(owner_id, status);
CREATE INDEX IF NOT EXISTS idx_drivers_current_load ON drivers(current_load_id) WHERE current_load_id IS NOT NULL;
