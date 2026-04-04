import { useMemo } from 'react'
import { useApp } from '../context/AppContext'

// Plan hierarchy for feature gating
// Tier 0 = TMS Pro (no AI), Tier 1 = AI Dispatch (AI assists), Tier 2 = Autonomous Fleet (fully hands-free)
const PLAN_TIERS = {
  tms_pro: 0,
  ai_dispatch: 1,
  autonomous_fleet: 2,
  autopilot_ai: 2,   // legacy — maps to autonomous
  autopilot: 1,       // legacy — maps to ai_dispatch
}

// Which plan tier is required for each gated feature
const FEATURE_GATES = {
  // Tier 0 — TMS Pro ($79/mo + $39/truck): manual management, no AI
  invoicing:     0,
  ifta:          0,
  fleet:         0,
  compliance:    0,
  expenses:      0,
  drivers:       0,
  // Tier 1 — AI Dispatch ($199/mo + $79/truck): AI assists, no voice, you approve
  load_board:    1,
  ai_dispatch:   1,
  ai_scoring:    1,
  rate_analysis: 1,
  lane_intel:    1,
  broker_risk:   1,
  // Tier 2 — Autonomous Fleet (3% per load): fully hands-free
  voice_ai:      2,
  auto_booking:  2,
  proactive_loads: 2,
  autonomous_calling: 2,
  auto_negotiation: 2,
  api_access:    2,
  custom_integrations: 2,
  priority_support: 2,
}

const PLAN_DISPLAY = {
  tms_pro:          { name: 'TMS Pro',           price: 79,  extraTruck: 39, color: '#4d8ef0' },
  ai_dispatch:      { name: 'Qivori AI Dispatch', price: 199, extraTruck: 79, color: '#f0a500' },
  autonomous_fleet: { name: 'Qivori AI Dispatch', price: 199, extraTruck: 79, color: '#00d4aa' },
  autopilot_ai:     { name: 'Qivori AI Dispatch', price: 199, extraTruck: 79, color: '#00d4aa' },  // legacy
  autopilot:        { name: 'Qivori AI Dispatch', price: 199, extraTruck: 79, color: '#f0a500' },  // legacy
}

export function useSubscription() {
  const { profile, subscription, demoMode } = useApp()

  return useMemo(() => {
    const plan = subscription?.plan || 'autonomous_fleet'
    const status = subscription?.status || null
    const isTrialing = subscription?.isTrial || false
    const isActive = subscription?.isActive || demoMode || false
    const trialEndsAt = subscription?.trialEndsAt || profile?.trial_ends_at || null
    const currentPeriodEnd = profile?.current_period_end || null
    const customerId = subscription?.customerId || profile?.stripe_customer_id || null

    // Calculate trial days remaining
    let trialDaysLeft = null
    if (isTrialing && trialEndsAt) {
      const msLeft = new Date(trialEndsAt).getTime() - Date.now()
      trialDaysLeft = Math.max(0, Math.ceil(msLeft / 86400000))
    }

    const isPaid = isActive && !isTrialing
    const tier = PLAN_TIERS[plan] ?? 0  // unknown plan defaults to basic (tier 0), not full access
    const planInfo = PLAN_DISPLAY[plan] || PLAN_DISPLAY.tms_pro

    // Feature access check
    const canAccess = (feature) => {
      if (demoMode) {
        // Demo mode: allow basic + AI dispatch features, block autonomous-only
        const requiredTier = FEATURE_GATES[feature]
        return requiredTier === undefined || requiredTier <= 1
      }
      if (!isActive) return false
      const requiredTier = FEATURE_GATES[feature]
      if (requiredTier === undefined) return true // unknown feature = allowed
      return tier >= requiredTier
    }

    // Get the minimum plan needed for a feature
    const requiredPlanFor = (feature) => {
      const requiredTier = FEATURE_GATES[feature]
      if (requiredTier === undefined) return null
      if (requiredTier <= 0) return 'tms_pro'
      if (requiredTier <= 1) return 'ai_dispatch'
      return 'autonomous_fleet'
    }

    return {
      plan,
      planName: planInfo.name,
      planColor: planInfo.color,
      planPrice: planInfo.price,
      planExtraTruck: planInfo.extraTruck,
      planAiFee: planInfo.aiFee || null,
      status,
      isActive,
      isTrialing,
      isPaid,
      trialDaysLeft,
      trialEndsAt,
      currentPeriodEnd,
      customerId,
      tier,
      canAccess,
      requiredPlanFor,
    }
  }, [profile, subscription, demoMode])
}

export { FEATURE_GATES, PLAN_TIERS, PLAN_DISPLAY }
