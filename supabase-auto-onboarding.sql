-- ─────────────────────────────────────────────────────────────────
-- Auto Onboarding — fields collected by AutoOnboarding.jsx
-- ─────────────────────────────────────────────────────────────────
-- Adds the columns the 4-step onboarding overlay writes to.
-- Safe to run multiple times.
-- ─────────────────────────────────────────────────────────────────

-- Equipment type — what the OO hauls (filters Q's load search)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS equipment TEXT
  CHECK (equipment IN ('Dry Van', 'Reefer', 'Flatbed') OR equipment IS NULL);

-- Factoring company — who the OO uses for payouts
-- Q sends rate cons + BOLs to this factor's email/API
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS factoring_company TEXT;

-- Onboarding completion timestamp — gates the AutoOnboarding overlay
-- NULL = never onboarded → show overlay on first AutoShell load
-- timestamp = onboarded → skip overlay
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS auto_onboarded_at TIMESTAMPTZ;

-- Card on file (Phase 1 stub — last 4 + brand only, no real card data)
-- Phase 2: replace with Stripe customer_id + payment_method_id
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS payment_method_last4 TEXT;
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS payment_method_brand TEXT;
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS payment_method_added_at TIMESTAMPTZ;

-- ─────────────────────────────────────────────────────────────────
-- DONE.
-- ─────────────────────────────────────────────────────────────────
