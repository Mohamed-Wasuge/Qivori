import { useMemo } from 'react'
import { useApp } from '../context/AppContext'

// Plan hierarchy for feature gating
const PLAN_TIERS = {
  autonomous_fleet: 2,
  autopilot_ai: 2,   // legacy — maps to same tier
  autopilot: 1,       // legacy
}

// Which plan tier is required for each gated feature
// With the single $399 plan, all features are tier 2 (full access)
const FEATURE_GATES = {
  load_board:    1,
  invoicing:     1,
  ifta:          1,
  ai_dispatch:   2,
  proactive_loads: 2,
  voice_ai:      2,
  auto_booking:  2,
  api_access:    2,
  custom_integrations: 2,
  priority_support: 2,
}

const PLAN_DISPLAY = {
  autonomous_fleet: { name: 'Autonomous Fleet AI', price: 399,  color: '#f0a500' },
  autopilot_ai:     { name: 'Autonomous Fleet AI', price: 399,  color: '#f0a500' },  // legacy mapping
  autopilot:        { name: 'Autonomous Fleet AI', price: 399,  color: '#f0a500' },  // legacy mapping
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
    const tier = PLAN_TIERS[plan] ?? 2  // default to full access
    const planInfo = PLAN_DISPLAY[plan] || PLAN_DISPLAY.autonomous_fleet

    // Feature access check
    const canAccess = (feature) => {
      if (demoMode) return true
      if (!isActive) return false
      const requiredTier = FEATURE_GATES[feature]
      if (requiredTier === undefined) return true // unknown feature = allowed
      return tier >= requiredTier
    }

    // Get the minimum plan needed for a feature
    const requiredPlanFor = (feature) => {
      const requiredTier = FEATURE_GATES[feature]
      if (requiredTier === undefined) return null
      return 'autonomous_fleet'
    }

    return {
      plan,
      planName: planInfo.name,
      planColor: planInfo.color,
      planPrice: planInfo.price,
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
