import { useMemo } from 'react'
import { useApp } from '../context/AppContext'

// Per-plan feature sets — explicit is better than a linear tier for PAYG
// which has Q dispatch but not accounting tools, while TMS Pro is the reverse.
const PLAN_FEATURES = {
  pay_as_you_go: new Set([
    'load_tracking',   // up to 10 loads/month
    'invoicing',       // basic invoicing
    'factoring',       // factoring integration
    'fleet',           // fleet & maintenance
    'dvir',            // DVIR
    'hos',             // HOS
    'fuel',            // fuel prices
    'load_board',      // Q finds loads
    'ai_dispatch',     // Q calls brokers
    'ai_scoring',      // AI load scoring
    'rate_analysis',   // rate analysis
    'voice_ai',        // broker voice calls
    'auto_booking',    // Q books loads
    'auto_negotiation',
  ]),
  tms_pro: new Set([
    'load_tracking', 'unlimited_loads',
    'invoicing', 'factoring',
    'fleet', 'dvir', 'hos', 'fuel',
    'ifta', 'compliance', 'csa', 'dot', 'insurance',
    'expenses', 'profit', 'tax_report', 'cash_flow',
    'drivers', 'payroll', 'driver_pay',
    'documents', 'document_vault',
    'rate_patterns', 'broker_risk', 'lane_intel',
  ]),
  ai_dispatch: new Set([
    'load_tracking', 'unlimited_loads',
    'invoicing', 'factoring',
    'fleet', 'dvir', 'hos', 'fuel',
    'ifta', 'compliance', 'csa', 'dot', 'insurance',
    'expenses', 'profit', 'tax_report', 'cash_flow',
    'drivers', 'payroll', 'driver_pay',
    'documents', 'document_vault',
    'rate_patterns', 'broker_risk', 'lane_intel',
    'load_board', 'ai_dispatch', 'ai_scoring', 'rate_analysis',
    'voice_ai', 'auto_booking', 'auto_negotiation',
    'proactive_loads',
  ]),
  autonomous_fleet: new Set([
    'load_tracking', 'unlimited_loads',
    'invoicing', 'factoring',
    'fleet', 'dvir', 'hos', 'fuel',
    'ifta', 'compliance', 'csa', 'dot', 'insurance',
    'expenses', 'profit', 'tax_report', 'cash_flow',
    'drivers', 'payroll', 'driver_pay',
    'documents', 'document_vault',
    'rate_patterns', 'broker_risk', 'lane_intel',
    'load_board', 'ai_dispatch', 'ai_scoring', 'rate_analysis',
    'voice_ai', 'auto_booking', 'auto_negotiation',
    'proactive_loads', 'multi_truck', 'api_access',
    'custom_integrations', 'priority_support',
  ]),
}

// Legacy plan aliases
PLAN_FEATURES.autopilot_ai = PLAN_FEATURES.autonomous_fleet
PLAN_FEATURES.autopilot    = PLAN_FEATURES.ai_dispatch

// Which plan to upgrade to for a locked feature
const UPGRADE_PATH = {
  ifta:          'tms_pro',
  compliance:    'tms_pro',
  csa:           'tms_pro',
  dot:           'tms_pro',
  insurance:     'tms_pro',
  expenses:      'tms_pro',
  profit:        'tms_pro',
  tax_report:    'tms_pro',
  cash_flow:     'tms_pro',
  drivers:       'tms_pro',
  payroll:       'tms_pro',
  driver_pay:    'tms_pro',
  documents:     'tms_pro',
  document_vault:'tms_pro',
  unlimited_loads:'tms_pro',
  load_board:    'ai_dispatch',
  ai_dispatch:   'ai_dispatch',
  voice_ai:      'ai_dispatch',
  auto_booking:  'ai_dispatch',
  multi_truck:   'autonomous_fleet',
  api_access:    'autonomous_fleet',
  priority_support: 'autonomous_fleet',
}

export const PLAN_DISPLAY = {
  pay_as_you_go:    { name: 'Pay As You Go',      price: 0,   aiFee: 0.03, extraTruck: 0,   color: '#22c55e' },
  tms_pro:          { name: 'TMS Pro',             price: 79,  aiFee: null, extraTruck: 39,  color: '#4d8ef0' },
  ai_dispatch:      { name: 'AI Dispatch',         price: 199, aiFee: 0.03, extraTruck: 99,  color: '#f0a500' },
  autonomous_fleet: { name: 'AI Dispatch',         price: 199, aiFee: 0.03, extraTruck: 99,  color: '#f0a500' },
  autopilot_ai:     { name: 'AI Dispatch',         price: 199, aiFee: 0.03, extraTruck: 99,  color: '#f0a500' },
  autopilot:        { name: 'AI Dispatch',         price: 199, aiFee: 0.03, extraTruck: 99,  color: '#f0a500' },
}

// Keep PLAN_TIERS for anything still referencing it (legacy)
export const PLAN_TIERS = {
  pay_as_you_go: 0,
  tms_pro:       0,
  ai_dispatch:   1,
  autonomous_fleet: 2,
  autopilot_ai:  2,
  autopilot:     1,
}

// Keep FEATURE_GATES for legacy references
export const FEATURE_GATES = {
  invoicing: 0, fleet: 0, expenses: 0,
  ifta: 0, compliance: 0, drivers: 0,
  load_board: 1, ai_dispatch: 1, ai_scoring: 1,
  rate_analysis: 1, lane_intel: 1, broker_risk: 1,
  voice_ai: 2, auto_booking: 2, proactive_loads: 2,
  autonomous_calling: 2, auto_negotiation: 2,
  api_access: 2, priority_support: 2,
}

export function useSubscription() {
  const { profile, subscription, demoMode } = useApp()

  return useMemo(() => {
    const plan = subscription?.plan || profile?.subscription_plan || 'pay_as_you_go'
    const status = subscription?.status || null
    const isTrialing = subscription?.isTrial || false
    const isActive = subscription?.isActive || demoMode || true // PAYG is always active
    const trialEndsAt = subscription?.trialEndsAt || profile?.trial_ends_at || null
    const currentPeriodEnd = profile?.current_period_end || null
    const customerId = subscription?.customerId || profile?.stripe_customer_id || null

    let trialDaysLeft = null
    if (isTrialing && trialEndsAt) {
      const msLeft = new Date(trialEndsAt).getTime() - Date.now()
      trialDaysLeft = Math.max(0, Math.ceil(msLeft / 86400000))
    }

    const isPaid = isActive && !isTrialing
    const planInfo = PLAN_DISPLAY[plan] || PLAN_DISPLAY.pay_as_you_go
    const features = PLAN_FEATURES[plan] || PLAN_FEATURES.pay_as_you_go
    const tier = PLAN_TIERS[plan] ?? 0

    const canAccess = (feature) => {
      if (demoMode) return feature !== 'api_access' && feature !== 'priority_support'
      if (!isActive) return false
      return features.has(feature)
    }

    const requiredPlanFor = (feature) => {
      if (features.has(feature)) return null
      return UPGRADE_PATH[feature] || null
    }

    const isPayAsYouGo = plan === 'pay_as_you_go'
    const hasQDispatch  = features.has('ai_dispatch')
    const hasFullTMS    = features.has('ifta')

    return {
      plan,
      planName: planInfo.name,
      planColor: planInfo.color,
      planPrice: planInfo.price,
      planExtraTruck: planInfo.extraTruck,
      planAiFee: planInfo.aiFee,
      status,
      isActive,
      isTrialing,
      isPaid,
      trialDaysLeft,
      trialEndsAt,
      currentPeriodEnd,
      customerId,
      tier,
      isPayAsYouGo,
      hasQDispatch,
      hasFullTMS,
      canAccess,
      requiredPlanFor,
    }
  }, [profile, subscription, demoMode])
}
