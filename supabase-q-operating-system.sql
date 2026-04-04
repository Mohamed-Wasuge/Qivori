-- ═══════════════════════════════════════════════════════════════════════════════
-- QIVORI Q OPERATING SYSTEM — Schema for autonomous dispatch
-- Phase 1: Tables that don't exist yet. Columns added to existing tables.
-- Run in Supabase SQL Editor in order.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. TRUCK STATUS (fleet state engine) ───────────────────────────────────────
-- Real-time status for each truck. Q reads this before every dispatch decision.
CREATE TABLE IF NOT EXISTS truck_status (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  vehicle_id UUID REFERENCES vehicles(id) ON DELETE CASCADE NOT NULL,
  driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,

  -- Current state
  status TEXT NOT NULL DEFAULT 'EMPTY' CHECK (status IN (
    'READY_FOR_LOAD',
    'WAITING_DRIVER_RESPONSE',
    'NEGOTIATING',
    'BOOKED',
    'IN_TRANSIT_TO_PICKUP',
    'AT_PICKUP',
    'LOADED',
    'IN_TRANSIT',
    'AT_DELIVERY',
    'EMPTY',
    'UNAVAILABLE',
    'ISSUE_REPORTED'
  )),
  status_reason TEXT,                              -- why in this state ("breakdown", "home time", etc.)
  status_changed_at TIMESTAMPTZ DEFAULT NOW(),

  -- Location
  current_city TEXT,
  current_state TEXT,
  lat NUMERIC(9,6),
  lng NUMERIC(9,6),
  location_updated_at TIMESTAMPTZ,

  -- Current assignment
  current_load_id TEXT,
  current_load_origin TEXT,
  current_load_dest TEXT,
  pickup_eta TIMESTAMPTZ,
  delivery_eta TIMESTAMPTZ,

  -- Availability
  available_at TIMESTAMPTZ,                        -- when truck will be free (estimated)
  next_available_city TEXT,                         -- where truck will be free
  next_available_state TEXT,

  -- Equipment
  trailer_type TEXT,                                -- Dry Van, Reefer, Flatbed, etc.
  max_weight INTEGER DEFAULT 45000,
  preferred_max_weight INTEGER DEFAULT 37000,

  -- HOS snapshot
  hos_drive_remaining NUMERIC(4,1),                -- hours
  hos_duty_remaining NUMERIC(4,1),
  hos_cycle_remaining NUMERIC(4,1),
  hos_updated_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(owner_id, vehicle_id)
);

ALTER TABLE truck_status ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own truck_status" ON truck_status;
CREATE POLICY "Users manage own truck_status" ON truck_status FOR ALL
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS "Service role truck_status" ON truck_status;
CREATE POLICY "Service role truck_status" ON truck_status FOR ALL
  USING ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

CREATE INDEX IF NOT EXISTS idx_truck_status_owner ON truck_status(owner_id);
CREATE INDEX IF NOT EXISTS idx_truck_status_status ON truck_status(status);
CREATE INDEX IF NOT EXISTS idx_truck_status_vehicle ON truck_status(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_truck_status_available ON truck_status(available_at);


-- ── 2. NEGOTIATION SESSIONS ────────────────────────────────────────────────────
-- Every broker negotiation tracked end-to-end
CREATE TABLE IF NOT EXISTS negotiation_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  load_id TEXT,
  dispatch_decision_id UUID REFERENCES dispatch_decisions(id) ON DELETE SET NULL,
  broker_name TEXT,
  broker_phone TEXT,
  broker_email TEXT,

  -- State machine
  status TEXT NOT NULL DEFAULT 'NOT_STARTED' CHECK (status IN (
    'NOT_STARTED',
    'CONTACT_ATTEMPTED',
    'BROKER_RESPONDED',
    'COUNTER_SENT',
    'FINAL_OFFER_RECEIVED',
    'ACCEPTED',
    'LOST',
    'NO_RESPONSE',
    'EXPIRED'
  )),

  -- Rates
  initial_offer NUMERIC(10,2),                     -- broker's first offer
  target_rate NUMERIC(10,2),                        -- Q's calculated target
  min_accept_rate NUMERIC(10,2),                    -- lowest Q will accept
  counter_offer NUMERIC(10,2),                      -- Q's counter
  final_rate NUMERIC(10,2),                         -- agreed rate (if accepted)
  counter_rounds INTEGER DEFAULT 0,
  max_rounds INTEGER DEFAULT 3,

  -- Context
  urgency_score INTEGER DEFAULT 50,
  lane TEXT,                                        -- "Dallas TX → Atlanta GA"
  miles INTEGER,
  equipment_type TEXT,
  pickup_date DATE,

  -- Timing
  started_at TIMESTAMPTZ DEFAULT NOW(),
  last_contact_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  timeout_at TIMESTAMPTZ,                           -- auto-expire after this

  -- Communication
  channel TEXT DEFAULT 'system' CHECK (channel IN ('phone', 'sms', 'email', 'system', 'app')),
  transcript JSONB DEFAULT '[]',                    -- [{timestamp, actor, message}]

  -- Outcome
  outcome_reason TEXT,                              -- "accepted at target", "broker firm, below minimum", etc.

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE negotiation_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own negotiations" ON negotiation_sessions;
CREATE POLICY "Users manage own negotiations" ON negotiation_sessions FOR ALL
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS "Service role negotiations" ON negotiation_sessions;
CREATE POLICY "Service role negotiations" ON negotiation_sessions FOR ALL
  USING ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

CREATE INDEX IF NOT EXISTS idx_neg_sessions_owner ON negotiation_sessions(owner_id);
CREATE INDEX IF NOT EXISTS idx_neg_sessions_status ON negotiation_sessions(status);
CREATE INDEX IF NOT EXISTS idx_neg_sessions_load ON negotiation_sessions(load_id);


-- ── 3. DRIVER COMMUNICATION LOG ────────────────────────────────────────────────
-- Every message sent to/from drivers with parsed responses
CREATE TABLE IF NOT EXISTS driver_comms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  driver_id UUID REFERENCES drivers(id) ON DELETE CASCADE NOT NULL,
  load_id TEXT,

  -- Message
  direction TEXT NOT NULL CHECK (direction IN ('outbound', 'inbound')),
  channel TEXT NOT NULL CHECK (channel IN ('sms', 'call', 'app', 'system')),
  message_type TEXT NOT NULL CHECK (message_type IN (
    'morning_check',
    'load_offer',
    'load_accepted',
    'load_declined',
    'status_update',
    'exception_report',
    'eta_request',
    'eta_response',
    'confirmation',
    'general'
  )),

  -- Content
  body TEXT NOT NULL,
  parsed_intent TEXT,                               -- AI-parsed: "ready", "not_available", "accepted", "declined", etc.
  parsed_data JSONB DEFAULT '{}',                   -- structured data from parsing

  -- Delivery
  external_id TEXT,                                 -- Twilio SID or similar
  delivery_status TEXT DEFAULT 'sent' CHECK (delivery_status IN (
    'queued', 'sent', 'delivered', 'failed', 'read'
  )),

  -- Response tracking
  requires_response BOOLEAN DEFAULT false,
  response_deadline TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  response_id UUID,                                 -- links to the inbound response row

  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE driver_comms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own driver_comms" ON driver_comms;
CREATE POLICY "Users manage own driver_comms" ON driver_comms FOR ALL
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS "Service role driver_comms" ON driver_comms;
CREATE POLICY "Service role driver_comms" ON driver_comms FOR ALL
  USING ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

CREATE INDEX IF NOT EXISTS idx_driver_comms_owner ON driver_comms(owner_id);
CREATE INDEX IF NOT EXISTS idx_driver_comms_driver ON driver_comms(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_comms_load ON driver_comms(load_id);
CREATE INDEX IF NOT EXISTS idx_driver_comms_type ON driver_comms(message_type);
CREATE INDEX IF NOT EXISTS idx_driver_comms_pending ON driver_comms(requires_response, responded_at)
  WHERE requires_response = true AND responded_at IS NULL;


-- ── 4. DISPATCH EVENTS (trip milestones) ───────────────────────────────────────
-- Every event in a load's lifecycle. The single timeline for a load.
CREATE TABLE IF NOT EXISTS dispatch_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  load_id TEXT NOT NULL,
  dispatch_decision_id UUID REFERENCES dispatch_decisions(id) ON DELETE SET NULL,

  -- Event
  event_type TEXT NOT NULL CHECK (event_type IN (
    'load_received',
    'evaluation_started',
    'decision_made',
    'driver_contacted',
    'driver_accepted',
    'driver_declined',
    'driver_no_response',
    'negotiation_started',
    'counter_sent',
    'negotiation_accepted',
    'negotiation_lost',
    'broker_no_response',
    'load_booked',
    'dispatched',
    'en_route_pickup',
    'arrived_pickup',
    'loaded',
    'in_transit',
    'arrived_delivery',
    'delivered',
    'pod_uploaded',
    'invoice_created',
    'invoice_sent',
    'payment_received',
    'exception',
    'cancelled',
    'reassigned',
    'status_change',
    'manual_override',
    'system_error',
    'retry_attempted'
  )),

  -- Actor
  actor TEXT NOT NULL DEFAULT 'system' CHECK (actor IN ('ai', 'driver', 'broker', 'dispatcher', 'system', 'admin')),
  actor_id TEXT,                                    -- user/driver ID

  -- Data
  old_value TEXT,
  new_value TEXT,
  details JSONB DEFAULT '{}',
  notes TEXT,

  -- Source
  source_channel TEXT CHECK (source_channel IN ('sms', 'call', 'app', 'system', 'email', 'api')),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE dispatch_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users see own dispatch_events" ON dispatch_events;
CREATE POLICY "Users see own dispatch_events" ON dispatch_events FOR ALL
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS "Service role dispatch_events" ON dispatch_events;
CREATE POLICY "Service role dispatch_events" ON dispatch_events FOR ALL
  USING ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

CREATE INDEX IF NOT EXISTS idx_dispatch_events_owner ON dispatch_events(owner_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_events_load ON dispatch_events(load_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_events_type ON dispatch_events(event_type);
CREATE INDEX IF NOT EXISTS idx_dispatch_events_date ON dispatch_events(created_at DESC);


-- ── 5. DISPATCH FAILURES ───────────────────────────────────────────────────────
-- Every failure logged with retry state
CREATE TABLE IF NOT EXISTS dispatch_failures (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  load_id TEXT,
  driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
  dispatch_decision_id UUID REFERENCES dispatch_decisions(id) ON DELETE SET NULL,

  -- Failure
  failure_type TEXT NOT NULL CHECK (failure_type IN (
    'driver_no_response',
    'broker_no_response',
    'broker_changed_rate',
    'load_cancelled',
    'duplicate_load',
    'truck_unavailable',
    'weight_exceeded',
    'pickup_missed',
    'detention_delay',
    'document_missing',
    'api_failure',
    'sms_failed',
    'call_failed',
    'status_conflict',
    'compliance_block',
    'system_error'
  )),
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  description TEXT NOT NULL,

  -- Recovery
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  retry_after TIMESTAMPTZ,
  fallback_action TEXT,                             -- what Q did instead
  resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,                                 -- 'ai', 'admin', 'auto_timeout'
  resolution TEXT,                                  -- what fixed it

  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE dispatch_failures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own dispatch_failures" ON dispatch_failures;
CREATE POLICY "Users manage own dispatch_failures" ON dispatch_failures FOR ALL
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS "Service role dispatch_failures" ON dispatch_failures;
CREATE POLICY "Service role dispatch_failures" ON dispatch_failures FOR ALL
  USING ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

CREATE INDEX IF NOT EXISTS idx_dispatch_failures_owner ON dispatch_failures(owner_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_failures_load ON dispatch_failures(load_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_failures_type ON dispatch_failures(failure_type);
CREATE INDEX IF NOT EXISTS idx_dispatch_failures_unresolved ON dispatch_failures(resolved, created_at)
  WHERE resolved = false;


-- ── 6. ADD COLUMNS TO EXISTING TABLES ──────────────────────────────────────────

-- Loads: add dispatch workflow columns
ALTER TABLE loads
  ADD COLUMN IF NOT EXISTS dispatch_decision_id UUID,
  ADD COLUMN IF NOT EXISTS negotiation_session_id UUID,
  ADD COLUMN IF NOT EXISTS truck_status_id UUID,
  ADD COLUMN IF NOT EXISTS dispatch_method TEXT DEFAULT 'manual' CHECK (dispatch_method IN ('manual', 'ai_assisted', 'auto_booked')),
  ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS picked_up_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invoiced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

-- Drivers: add communication preferences
ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS preferred_contact TEXT DEFAULT 'sms' CHECK (preferred_contact IN ('sms', 'call', 'app')),
  ADD COLUMN IF NOT EXISTS morning_check_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS morning_check_time TIME DEFAULT '06:00',
  ADD COLUMN IF NOT EXISTS auto_accept_loads BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_deadhead_miles INTEGER DEFAULT 150,
  ADD COLUMN IF NOT EXISTS preferred_regions TEXT[],
  ADD COLUMN IF NOT EXISTS avoid_states TEXT[];

-- Carrier settings: add Q operating system settings
ALTER TABLE carrier_settings
  ADD COLUMN IF NOT EXISTS q_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS morning_check_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS morning_check_time TIME DEFAULT '06:00',
  ADD COLUMN IF NOT EXISTS driver_response_timeout INTEGER DEFAULT 15,      -- minutes
  ADD COLUMN IF NOT EXISTS broker_response_timeout INTEGER DEFAULT 60,      -- minutes
  ADD COLUMN IF NOT EXISTS max_negotiation_rounds INTEGER DEFAULT 3,
  ADD COLUMN IF NOT EXISTS negotiation_markup_pct INTEGER DEFAULT 10,
  ADD COLUMN IF NOT EXISTS auto_reject_below INTEGER DEFAULT 800,
  ADD COLUMN IF NOT EXISTS auto_accept_above INTEGER DEFAULT 1200,
  ADD COLUMN IF NOT EXISTS light_load_threshold INTEGER DEFAULT 37000,
  ADD COLUMN IF NOT EXISTS max_hold_days INTEGER DEFAULT 2,
  ADD COLUMN IF NOT EXISTS preferred_equipment TEXT[],
  ADD COLUMN IF NOT EXISTS avoid_dead_zones BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS high_profit_override BOOLEAN DEFAULT true;


-- ═══════════════════════════════════════════════════════════════════════════════
-- PHASE 1 COMPLETE
-- New tables: truck_status, negotiation_sessions, driver_comms, dispatch_events, dispatch_failures
-- Updated tables: loads, drivers, carrier_settings
-- All tables have RLS + owner_id + indexes
-- ═══════════════════════════════════════════════════════════════════════════════
