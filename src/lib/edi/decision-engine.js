/**
 * Qivori EDI — AI Decision Engine
 * Accepts ONLY canonical load model as input.
 * Returns: ACCEPT, REJECT, or NEGOTIATE with full profit analysis.
 *
 * This is the client-side evaluation used for UI previews.
 * The server-side version (api/edi/receive-204.js) calls the existing
 * dispatch-evaluate endpoint for the full compliance + lane rate logic.
 */

import { computeMetrics, EQUIPMENT_MAP } from './canonical.js'

// ── Region Detection ─────────────────────────────────────────────────────────

const REGION_MAP = {
  midwest:   ['IL','IN','OH','MI','WI','MN','IA','MO','KS','NE','SD','ND'],
  southeast: ['FL','GA','SC','NC','VA','AL','MS','TN','KY','WV','AR','LA'],
  northeast: ['NY','NJ','PA','CT','MA','RI','VT','NH','ME','MD','DE','DC'],
  west:      ['CA','WA','OR','NV','AZ','UT','CO','ID','MT','WY','NM'],
  south:     ['TX','OK'],
}

const SEASONAL_FACTORS = {
  midwest:   [0.88, 0.85, 0.95, 1.05, 1.10, 1.08, 1.05, 1.00, 1.02, 1.12, 1.15, 1.08],
  southeast: [0.90, 0.88, 0.95, 1.08, 1.12, 1.10, 1.06, 1.02, 1.00, 1.08, 1.10, 1.05],
  northeast: [0.92, 0.88, 0.98, 1.05, 1.08, 1.05, 1.00, 0.98, 1.02, 1.10, 1.12, 1.08],
  west:      [0.90, 0.88, 0.95, 1.10, 1.15, 1.12, 1.08, 1.05, 1.02, 1.08, 1.10, 1.05],
  south:     [0.88, 0.85, 0.92, 1.05, 1.10, 1.08, 1.05, 1.02, 1.00, 1.10, 1.12, 1.06],
}

const EQUIPMENT_MULTIPLIERS = {
  'reefer': 1.15, 'refrigerated': 1.15, 'flatbed': 1.08,
  'tanker': 1.12, 'step deck': 1.10, 'lowboy': 1.15,
  'dry van': 1.00, 'van': 1.00, 'power only': 0.95,
}

function getRegion(state) {
  if (!state) return 'midwest'
  const s = state.toUpperCase().trim()
  for (const [region, states] of Object.entries(REGION_MAP)) {
    if (states.includes(s)) return region
  }
  return 'midwest'
}

function extractState(location) {
  if (!location) return ''
  const parts = location.split(',')
  const last = (parts[parts.length - 1] || '').trim()
  const match = last.match(/^([A-Z]{2})$/i)
  if (match) return match[1].toUpperCase()
  const abbrev = last.replace(/[^A-Za-z]/g, '').toUpperCase()
  return abbrev.length === 2 ? abbrev : ''
}

// ── Decision Thresholds (configurable per carrier) ───────────────────────────

const DEFAULT_THRESHOLDS = {
  min_profit:           800,    // Reject below this
  negotiate_max_profit: 1200,   // Negotiate between min_profit and this
  min_rpm:              1.00,   // Minimum rate per mile
  min_profit_per_day:   400,    // Minimum profit per transit day
  max_weight:           43000,  // Hard reject above this weight
  preferred_max_weight: 37000,  // Light load bonus threshold
  heavy_weight:         42000,  // Heavy load penalty threshold
  auto_book_confidence: 75,     // Min confidence for auto-book
  high_profit_override: 2000,   // Auto-accept if profit exceeds this
  high_rpm_override:    1.50,   // ...and RPM exceeds this
  high_ppd_override:    500,    // ...and profit/day exceeds this
}

// ── Core Decision Function ───────────────────────────────────────────────────

/**
 * Evaluate a canonical load and return a decision.
 *
 * @param {Object} canonicalLoad - Must be a canonical load (from createCanonicalLoad)
 * @param {Object} driver - Driver object { pay_model, pay_rate, driver_type, full_name }
 * @param {Object} context - { fuelCostPerMile, laneAvgRate, brokerUrgency, thresholds }
 * @returns {{ decision, confidence, reasons, metrics, negotiation }}
 */
export function evaluateCanonicalLoad(canonicalLoad, driver = null, context = {}) {
  const load = canonicalLoad
  const thresholds = { ...DEFAULT_THRESHOLDS, ...(context.thresholds || {}) }
  const fuelCostPerMile = context.fuelCostPerMile || 0.55
  const laneAvgRate = context.laneAvgRate || 0
  const brokerUrgency = context.brokerUrgency || 0

  const gross = load.rate || 0
  const miles = load.miles || 0
  const weight = parseFloat(load.weight) || 0

  // ── 1. Calculate costs ──
  const fuelCost = Math.round(miles * fuelCostPerMile)

  let driverPay = 0
  const driverType = context.driver_type || driver?.driver_type || 'owner_operator'
  if (driver) {
    if (driverType === 'owner_operator') {
      driverPay = Math.round(gross * ((parseFloat(driver.pay_rate) || 50) / 100))
    } else {
      const payModel = driver.pay_model || 'percent'
      const payRate = parseFloat(driver.pay_rate) || 28
      if (payModel === 'permile') driverPay = Math.round(miles * payRate)
      else if (payModel === 'flat') driverPay = Math.round(payRate)
      else driverPay = Math.round(gross * (payRate / 100))
    }
  }

  const estProfit = Math.round(gross - driverPay - fuelCost)
  const profitPerMile = miles > 0 ? estProfit / miles : 0
  const rpm = miles > 0 ? gross / miles : 0

  // Transit days
  let transitDays = Math.max(Math.ceil(miles / 500), 1)
  if (load.pickup_date && load.delivery_date) {
    const diff = Math.ceil(
      (new Date(load.delivery_date) - new Date(load.pickup_date)) / (1000 * 60 * 60 * 24)
    )
    if (diff > 0) transitDays = Math.max(transitDays, diff)
  }
  const profitPerDay = transitDays > 0 ? Math.round(estProfit / transitDays) : estProfit

  // ── 2. Seasonality ──
  const originState = extractState(load.origin) || load.origin_state || ''
  const month = new Date().getMonth() + 1
  const region = getRegion(originState)
  const baseMult = SEASONAL_FACTORS[region][(month - 1)] || 1.0
  const equipKey = (load.equipment || '').toLowerCase()
  let equipMult = 1.0
  for (const [key, val] of Object.entries(EQUIPMENT_MULTIPLIERS)) {
    if (equipKey.includes(key)) { equipMult = val; break }
  }
  const seasonMultiplier = round2(baseMult * equipMult)

  // Lane comparison
  const laneRatio = laneAvgRate > 0 && miles > 0 ? rpm / laneAvgRate : 1.0

  // Weight flags
  const isLight = weight > 0 && weight <= thresholds.preferred_max_weight
  const isHeavy = weight > thresholds.heavy_weight
  const isMultiDay = transitDays > 1.5
  const isPowerOnly = equipKey.includes('power only')

  // ── 3. Decision Engine ──
  let confidence = 50
  let decision = 'negotiate'
  const reasons = []
  let negotiation = null

  // Hard reject: negative / near-zero
  if (estProfit < 200) {
    return buildResult('reject', 95,
      [`Estimated profit $${estProfit} below minimum threshold`],
      buildMetrics(), null)
  }

  // Reject below min_profit
  if (estProfit < thresholds.min_profit) {
    return buildResult('reject', 88,
      [`Estimated profit $${estProfit} below $${thresholds.min_profit} minimum`],
      buildMetrics(), null)
  }

  // Negotiate zone
  if (estProfit >= thresholds.min_profit && estProfit < thresholds.negotiate_max_profit) {
    decision = 'negotiate'
    const markupFactor = 1.10 + (thresholds.negotiate_max_profit - estProfit) /
      (thresholds.negotiate_max_profit - thresholds.min_profit) * 0.05
    const targetGross = Math.round(gross * markupFactor)
    const targetRate = round2(miles > 0 ? targetGross / miles : 0)
    const currentRate = round2(rpm)
    const minAcceptGross = Math.round(gross * 1.05)
    const minAcceptRate = round2(miles > 0 ? minAcceptGross / miles : 0)

    reasons.push(`Profit marginal at $${estProfit} — counter at $${targetGross.toLocaleString()}`)
    negotiation = { currentRate, targetRate, minAcceptRate,
      script: `This load is at $${currentRate}/mi. Market shows $${targetRate} on this lane. Can you get closer to $${targetRate}?` }
  }

  // Weak per-mile
  if (profitPerMile < thresholds.min_rpm && decision !== 'reject') {
    if (decision !== 'negotiate') decision = 'negotiate'
    reasons.push(`Profit/mile $${round2(profitPerMile)} below $${thresholds.min_rpm} target`)
  }

  // Weak per-day
  if (profitPerDay < thresholds.min_profit_per_day && decision !== 'reject') {
    if (decision !== 'negotiate') decision = 'negotiate'
    reasons.push(`Profit/day $${profitPerDay} below $${thresholds.min_profit_per_day} target`)
  }

  // Accept zone
  if (estProfit >= thresholds.negotiate_max_profit &&
      profitPerMile >= thresholds.min_rpm &&
      profitPerDay >= thresholds.min_profit_per_day) {
    decision = 'accept'
    confidence = 75
  }

  // RPM bonuses
  if (profitPerMile >= 1.50) { confidence += 10; reasons.push(`Strong rate $${round2(profitPerMile)}/mi`) }
  if (profitPerMile >= 2.00) { confidence += 10; reasons.push(`Excellent rate $${round2(profitPerMile)}/mi`) }

  // Lane comparison
  if (laneAvgRate > 0) {
    if (laneRatio < 0.85) {
      if (decision === 'accept') decision = 'negotiate'
      reasons.push(`Below lane average by ${Math.round((1 - laneRatio) * 100)}%`)
    }
    if (laneRatio >= 1.15) {
      confidence += 5
      reasons.push(`Above lane average by ${Math.round((laneRatio - 1) * 100)}%`)
    }
  }

  // Weight
  if (isLight) { confidence += 3; reasons.push('Light load (under 37K lbs)') }
  if (isHeavy) { confidence -= 5; reasons.push('Heavy load — wear & tear') }
  if (weight > thresholds.max_weight && rpm < 1.20) {
    return buildResult('reject', 90,
      [`Weight ${weight} lbs exceeds ${thresholds.max_weight} and RPM too low`],
      buildMetrics(), null)
  }

  // Multi-day hold
  if (isMultiDay && profitPerDay < thresholds.min_profit_per_day) {
    if (decision === 'accept') decision = 'negotiate'
    reasons.push(`Multi-day hold: ${transitDays} days, only $${profitPerDay}/day`)
  }

  // Power only
  if (isPowerOnly) { confidence += 3; reasons.push('Power-only — no trailer needed') }

  // Broker urgency
  if (brokerUrgency >= 70) { confidence += 5; reasons.push('Broker shows urgency — room to negotiate higher') }

  // Seasonality
  if (seasonMultiplier > 1.1) reasons.push('Peak season — rates elevated')
  if (seasonMultiplier < 0.9) reasons.push('Slow season — rates depressed')

  // High-profit override
  if (estProfit >= thresholds.high_profit_override &&
      profitPerMile >= thresholds.high_rpm_override &&
      profitPerDay >= thresholds.high_ppd_override) {
    decision = 'accept'
    confidence = 95
    reasons.push('High-profit override — excellent load')
  }

  confidence = Math.max(0, Math.min(100, confidence))

  // Build negotiate if not yet set
  if (decision === 'negotiate' && !negotiation) {
    const targetGross = Math.round(gross * 1.12)
    const targetRate = round2(miles > 0 ? targetGross / miles : 0)
    const currentRate = round2(rpm)
    const minAcceptGross = Math.round(gross * 1.05)
    const minAcceptRate = round2(miles > 0 ? minAcceptGross / miles : 0)
    negotiation = { currentRate, targetRate, minAcceptRate,
      script: `This load is at $${currentRate}/mi. Market shows $${targetRate} on this lane. Can you get closer to $${targetRate}?` }
  }

  return buildResult(decision, confidence, reasons, buildMetrics(), negotiation)

  // ── Local helpers ──
  function buildMetrics() {
    return {
      estProfit, profitPerMile: round2(profitPerMile), profitPerDay,
      fuelCost, driverPay, transitDays, rpm: round2(rpm),
      laneRatio: round2(laneRatio), seasonMultiplier,
      weightBonus: isLight ? 0.03 : (isHeavy ? -0.05 : 0),
      brokerUrgency, gross, miles,
    }
  }
}

function buildResult(decision, confidence, reasons, metrics, negotiation) {
  return {
    decision,
    confidence,
    reasons,
    metrics,
    negotiation: decision === 'negotiate' ? negotiation : null,
    auto_booked: false,
    timestamp: new Date().toISOString(),
  }
}

function round2(n) {
  return Math.round(n * 100) / 100
}

export { DEFAULT_THRESHOLDS }
