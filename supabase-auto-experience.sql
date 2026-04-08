-- ─────────────────────────────────────────────────────────────────
-- Auto Experience — Autonomous Fleet (3% plan) mobile app shell
-- ─────────────────────────────────────────────────────────────────
-- Adds the `experience` flag to profiles so the React app can fork
-- between the existing TMS shell (CarrierLayout / MobileShell) and
-- the new AutoShell purpose-built for solo OOs on the 3% plan.
--
-- experience = 'tms'  → existing TMS dashboard (default for all current users)
-- experience = 'auto' → new AutoShell — Q-only, no TMS surfaces
--
-- Safe to run multiple times (idempotent).
-- ─────────────────────────────────────────────────────────────────

-- 1. Add experience column (defaults to 'tms' so existing users are untouched)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS experience TEXT
  CHECK (experience IN ('tms', 'auto'))
  DEFAULT 'tms';

-- 2. Add online status (Uber-style toggle — Q only hunts when ONLINE)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS auto_online BOOLEAN DEFAULT false;

-- 3. Add destination intent (set every time OO goes online)
--    'anywhere' | 'home'    | 'specific'
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS auto_intent TEXT
  CHECK (auto_intent IN ('anywhere', 'home', 'specific'))
  DEFAULT 'anywhere';

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS auto_intent_destination TEXT;  -- city when intent='specific'

-- 4. Home base (set in onboarding, used when auto_intent='home')
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS home_base_city TEXT;
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS home_base_state TEXT;

-- 5. Current location (last known GPS, refreshed when going online)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS current_lat NUMERIC;
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS current_lng NUMERIC;
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS current_city TEXT;
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS current_state TEXT;
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMPTZ;

-- 6. Commission tracking on loads (3% per load when plan = autonomous_fleet)
ALTER TABLE loads
  ADD COLUMN IF NOT EXISTS commission_amount NUMERIC DEFAULT 0;
ALTER TABLE loads
  ADD COLUMN IF NOT EXISTS commission_status TEXT
  CHECK (commission_status IN ('pending', 'collected', 'waived'))
  DEFAULT 'pending';
ALTER TABLE loads
  ADD COLUMN IF NOT EXISTS commission_collected_at TIMESTAMPTZ;

-- 7. Index for AutoEarnings queries (this week / month aggregations)
CREATE INDEX IF NOT EXISTS idx_loads_owner_commission_status
  ON loads(owner_id, commission_status, delivered_at);

-- 8. Helper: auto-calc commission_amount when status flips to delivered
--    Only for users on autonomous_fleet plan
CREATE OR REPLACE FUNCTION calc_load_commission()
RETURNS TRIGGER AS $$
DECLARE
  user_plan TEXT;
BEGIN
  -- Only calculate when load is delivered and commission not yet set
  IF NEW.status IN ('delivered', 'paid') AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    SELECT subscription_plan INTO user_plan
    FROM profiles
    WHERE id = NEW.owner_id;

    IF user_plan = 'autonomous_fleet' AND NEW.commission_amount = 0 THEN
      NEW.commission_amount = COALESCE(NEW.gross_pay, NEW.rate, 0) * 0.03;
      NEW.commission_status = 'pending';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_calc_load_commission ON loads;
CREATE TRIGGER trg_calc_load_commission
  BEFORE UPDATE ON loads
  FOR EACH ROW
  EXECUTE FUNCTION calc_load_commission();

-- ─────────────────────────────────────────────────────────────────
-- DONE. Existing users unaffected (experience defaults to 'tms').
-- To test the auto shell on your own account:
--   UPDATE profiles SET experience = 'auto' WHERE email = 'mwasuge@qivori.com';
-- ─────────────────────────────────────────────────────────────────
