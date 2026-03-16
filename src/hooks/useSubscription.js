import { useMemo } from 'react'
import { useApp } from '../context/AppContext'

// Plan hierarchy for feature gating
const PLAN_TIERS = {
  starter: 0,
  autopilot: 1,
  pro: 1,         // alias
  autopilot_ai: 2,
  fleet: 3,
}

// Which plan tier is required for each gated feature
const FEATURE_GATES = {
  load_board:    1,  // Pro / Autopilot+
  invoicing:     1,
  ifta:          1,
  ai_dispatch:   2,  // Autopilot AI+
  proactive_loads: 2,
  voice_ai:      2,
  auto_booking:  2,
  api_access:    3,  // Fleet only
  custom_integrations: 3,
  priority_support: 3,
}

const PLAN_DISPLAY = {
  starter:      { name: 'Starter',      price: 0,    color: '#8a8a9a' },
  autopilot:    { name: 'Autopilot',    price: 99,   color: '#f0a500' },
  pro:          { name: 'Pro',          price: 49,   color: '#4d8ef0' },
  autopilot_ai: { name: 'Autopilot AI', price: 799,  color: '#f0a500' },
  fleet:        { name: 'Fleet',        price: 799,  color: '#a78bfa' },
}

export function useSubscription() {
  const { profile, subscription, demoMode } = useApp()

  return useMemo(() => {
    const plan = subscription?.plan || 'starter'
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
    const tier = PLAN_TIERS[plan] ?? 0
    const planInfo = PLAN_DISPLAY[plan] || PLAN_DISPLAY.starter

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
      const entry = Object.entries(PLAN_TIERS).find(([, t]) => t === requiredTier)
      return entry ? entry[0] : null
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
