-- ─────────────────────────────────────────────────────────────────
-- Q PROFIT LOOPS — multi-leg route bundling
-- ─────────────────────────────────────────────────────────────────
-- Q chains multiple loads into a route that ends back near home base
-- (or wherever the OO wants to be at end of week). Maximizes profit per
-- mile across the whole loop, not just one load.
--
-- Example loop:
--   Leg 1: ATL → DFW  $2,400 · 925mi · van
--   Leg 2: DFW → PHX  $2,800 · 1,065mi · van
--   Leg 3: PHX → ATL  $3,100 · 1,810mi · van
--   Total: 3,800mi · $8,300 gross · $7,499 net (after 3% Q fee)
--
-- Each leg is a regular `loads` row. The loop is the parent that ties
-- them together with sequence + profit math.
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS loops (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  loop_name TEXT,                     -- "ATL → DFW → PHX → ATL"
  origin_city TEXT NOT NULL,          -- where the OO starts
  end_city TEXT NOT NULL,             -- where the OO ends (often home)
  leg_count INTEGER NOT NULL DEFAULT 0,
  total_miles INTEGER DEFAULT 0,
  total_gross NUMERIC(10,2) DEFAULT 0,
  total_fee NUMERIC(10,2) DEFAULT 0,  -- Q's 3% across all legs
  total_net NUMERIC(10,2) DEFAULT 0,  -- what the OO keeps
  fuel_cost NUMERIC(10,2) DEFAULT 0,  -- estimated based on fuelCostPerMile
  estimated_profit NUMERIC(10,2) DEFAULT 0, -- net minus fuel
  avg_rpm NUMERIC(6,2) DEFAULT 0,
  estimated_hos_hours NUMERIC(6,2) DEFAULT 0,  -- driving + on-duty
  loop_confidence INTEGER DEFAULT 70,  -- 0-100, Q's verdict on the loop holding together
  -- 'proposed'  → Q built it, awaiting OO acceptance
  -- 'active'    → OO accepted, legs are being booked / driven
  -- 'completed' → all legs delivered
  -- 'cancelled' → OO passed or one leg fell through
  status TEXT DEFAULT 'proposed' CHECK (status IN ('proposed', 'active', 'completed', 'cancelled')),
  current_leg_index INTEGER DEFAULT 0, -- which leg the driver is on (0-indexed)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Each leg is a load with sequence + linkage to the parent loop
CREATE TABLE IF NOT EXISTS loop_legs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  loop_id UUID REFERENCES loops(id) ON DELETE CASCADE NOT NULL,
  load_id UUID REFERENCES loads(id) ON DELETE SET NULL,
  sequence INTEGER NOT NULL,            -- 0, 1, 2 (leg order in the loop)
  origin_city TEXT NOT NULL,
  destination_city TEXT NOT NULL,
  miles INTEGER DEFAULT 0,
  rate NUMERIC(10,2) DEFAULT 0,
  rpm NUMERIC(6,2) DEFAULT 0,
  broker_name TEXT,
  broker_phone TEXT,
  equipment TEXT,
  -- 'queued'    → not yet booked
  -- 'booking'   → Q is calling broker for this leg
  -- 'booked'    → broker confirmed
  -- 'failed'    → broker walked or no answer
  -- 'in_transit' → driver is on this leg
  -- 'delivered' → leg complete
  leg_status TEXT DEFAULT 'queued' CHECK (leg_status IN (
    'queued', 'booking', 'booked', 'failed', 'in_transit', 'delivered'
  )),
  pickup_date TIMESTAMPTZ,
  delivery_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loops_owner_status ON loops(owner_id, status);
CREATE INDEX IF NOT EXISTS idx_loop_legs_loop_seq ON loop_legs(loop_id, sequence);

-- RLS — users see only their own loops
ALTER TABLE loops ENABLE ROW LEVEL SECURITY;
ALTER TABLE loop_legs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see their own loops"
  ON loops FOR ALL
  USING (auth.uid() = owner_id);

CREATE POLICY "Users see legs of their own loops"
  ON loop_legs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM loops
      WHERE loops.id = loop_legs.loop_id
      AND loops.owner_id = auth.uid()
    )
  );

CREATE POLICY "Service role full access loops"
  ON loops FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access loop_legs"
  ON loop_legs FOR ALL
  USING (auth.role() = 'service_role');
