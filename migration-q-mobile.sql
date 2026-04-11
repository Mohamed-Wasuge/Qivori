-- Q Mobile Migration
-- Run after migration-all-parts.sql

-- 1. Add role/mode columns to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS role text DEFAULT 'driver' CHECK (role IN ('driver', 'owner_op', 'carrier')),
  ADD COLUMN IF NOT EXISTS mode text DEFAULT 'single_truck' CHECK (mode IN ('single_truck', 'fleet')),
  ADD COLUMN IF NOT EXISTS assigned_truck_id uuid REFERENCES vehicles(id);

-- 2. Add status columns to vehicles
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'available' CHECK (status IN ('available', 'searching', 'negotiating', 'covered', 'in_transit', 'delivered')),
  ADD COLUMN IF NOT EXISTS active_load_id uuid REFERENCES loads(id),
  ADD COLUMN IF NOT EXISTS assigned_driver_id uuid REFERENCES profiles(id);

-- 3. Create q_activity table
CREATE TABLE IF NOT EXISTS q_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  truck_id uuid REFERENCES vehicles(id),
  driver_id uuid REFERENCES profiles(id),
  owner_op_id uuid REFERENCES profiles(id),
  type text CHECK (type IN ('load_found','call_started','transcript','decision_needed','requirement_check','booked','bol_uploaded','factoring_sent','payment_received','load_cancelled','status_update')),
  content jsonb NOT NULL DEFAULT '{}',
  requires_action boolean DEFAULT false,
  action_taken text,
  action_taken_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- 4. Enable RLS
ALTER TABLE q_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "drivers_own_activity" ON q_activity
  FOR ALL USING (driver_id = auth.uid());

CREATE POLICY "owner_ops_fleet_activity" ON q_activity
  FOR ALL USING (owner_op_id = auth.uid());
