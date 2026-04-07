/**
 * qVerdict — client-side load verdict for instant UI feedback
 *
 * Mirrors the same thresholds + logic as api/dispatch-evaluate.js so the
 * mobile app and TMS can render Q's decision the moment a load is shown,
 * without an API round-trip. The server still re-evaluates on booking.
 *
 * Inputs:
 *   load     — { gross|rate, miles, weight, equipment, origin, destination, pickup_date }
 *   driver   — { pay_model, pay_rate, driver_type } (optional, falls back to context)
 *   context  — { fuelCostPerMile, laneAvgRate, brokerUrgency }
 *
 * Returns:
 *   {
 *     decision: 'accept' | 'negotiate' | 'reject',
 *     confidence: 0..100,
 *     gross, miles, rpm, fuelCost, driverPay, profit, profitPerMile, profitPerDay,
 *     reasons: string[],   // ordered by importance, top 2 used in compact UI
 *     targetRate, floorRate, // for negotiation
 *     verdict: 'ACCEPT' | 'NEGOTIATE' | 'REJECT',
 *     verdictColor: string,
 *     headline: string,    // one-line summary
 *   }
 */

const T = {
  MIN_PROFIT: 800,
  NEGOTIATE_MAX: 1200,
  MIN_RPM: 1.00,
  MIN_PPD: 400,
  MAX_WEIGHT: 43000,
  LIGHT_WEIGHT: 37000,
  HEAVY_WEIGHT: 42000,
  HIGH_PROFIT: 2000,
}

export function qVerdict(load, driver = {}, context = {}) {
  const gross = Number(load?.gross ?? load?.rate ?? 0) || 0
  const miles = Number(load?.miles ?? 0) || 0
  const weight = Number(load?.weight ?? 0) || 0
  const fuelCostPerMile = Number(context.fuelCostPerMile) > 0 ? Number(context.fuelCostPerMile) : 0.55
  const laneAvgRate = Number(context.laneAvgRate) || 0

  const fuelCost = Math.round(miles * fuelCostPerMile)

  // Driver pay calc — same shape as backend
  const driverType = driver?.driver_type || context?.driver_type || 'owner_operator'
  const payModel = driver?.pay_model || 'percent'
  const payRate = Number(driver?.pay_rate) || (driverType === 'owner_operator' ? 50 : 28)
  let driverPay = 0
  if (driverType === 'owner_operator') {
    driverPay = Math.round(gross * (payRate / 100))
  } else if (payModel === 'permile') {
    driverPay = Math.round(miles * payRate)
  } else if (payModel === 'flat') {
    driverPay = Math.round(payRate)
  } else {
    driverPay = Math.round(gross * (payRate / 100))
  }

  const profit = gross - driverPay - fuelCost
  const rpm = miles > 0 ? gross / miles : 0
  const profitPerMile = miles > 0 ? profit / miles : 0
  // Transit days: pickup→delivery, fall back to miles/500
  let transitDays = Math.max(Math.ceil(miles / 500), 1)
  if (load?.pickup_date && load?.delivery_date) {
    const diff = Math.ceil((new Date(load.delivery_date) - new Date(load.pickup_date)) / (1000 * 60 * 60 * 24))
    if (diff > 0) transitDays = Math.max(transitDays, diff)
  }
  const profitPerDay = Math.round(profit / transitDays)
  const laneRatio = laneAvgRate > 0 && rpm > 0 ? rpm / laneAvgRate : 1.0

  let confidence = 50
  const reasons = []

  // Hard rejects first
  if (gross <= 0 || miles <= 0) {
    return makeResult('reject', 0, { gross, miles, rpm, fuelCost, driverPay, profit, profitPerMile, profitPerDay }, ['Missing rate or miles'])
  }
  if (weight > T.MAX_WEIGHT && rpm < 1.20) {
    reasons.push(`Overweight (${weight.toLocaleString()} lbs) and RPM under $1.20`)
    return makeResult('reject', 92, { gross, miles, rpm, fuelCost, driverPay, profit, profitPerMile, profitPerDay }, reasons)
  }
  if (profit < 200) {
    reasons.push(`Profit only ${fmt$(profit)} — burns money`)
    return makeResult('reject', 95, { gross, miles, rpm, fuelCost, driverPay, profit, profitPerMile, profitPerDay }, reasons)
  }
  if (profit < T.MIN_PROFIT) {
    reasons.push(`Profit ${fmt$(profit)} below ${fmt$(T.MIN_PROFIT)} floor`)
    if (rpm < T.MIN_RPM) reasons.push(`Rate ${money(rpm)}/mi under $${T.MIN_RPM.toFixed(2)} minimum`)
    return makeResult('reject', 88, { gross, miles, rpm, fuelCost, driverPay, profit, profitPerMile, profitPerDay }, reasons)
  }

  // Confidence build
  if (profitPerMile >= 1.50) { confidence += 10; reasons.push(`Strong margin: ${money(profitPerMile)}/mi profit`) }
  else if (profitPerMile >= 1.00) { confidence += 5; reasons.push(`Healthy margin: ${money(profitPerMile)}/mi profit`) }
  if (profitPerMile >= 2.00) confidence += 10

  if (laneRatio >= 1.15) { confidence += 5; reasons.push(`${Math.round((laneRatio - 1) * 100)}% above lane average`) }
  if (laneRatio < 0.85 && laneAvgRate > 0) reasons.push(`${Math.round((1 - laneRatio) * 100)}% below lane average`)

  if (weight > 0 && weight <= T.LIGHT_WEIGHT) { confidence += 3; reasons.push(`Light load (${(weight / 1000).toFixed(0)}k lbs) — easy on the truck`) }
  if (weight > T.HEAVY_WEIGHT) { confidence -= 5; reasons.push(`Heavy load (${(weight / 1000).toFixed(0)}k lbs) — wear & tear`) }

  if (context.brokerUrgency >= 70) { confidence += 5; reasons.push(`Broker is urgent (${context.brokerUrgency}/100) — leverage`) }

  // Negotiate zone
  if (profit < T.NEGOTIATE_MAX) {
    const markupFactor = 1.10 + ((T.NEGOTIATE_MAX - profit) / (T.NEGOTIATE_MAX - T.MIN_PROFIT)) * 0.05
    const targetGross = Math.round(gross * markupFactor)
    const targetRate = miles > 0 ? targetGross / miles : 0
    reasons.unshift(`Push for ${fmt$(targetGross)} (${money(targetRate)}/mi) — current ${money(rpm)}/mi is light`)
    return makeResult('negotiate', clamp(confidence + 5), {
      gross, miles, rpm, fuelCost, driverPay, profit, profitPerMile, profitPerDay,
      targetRate, targetGross,
    }, reasons)
  }

  // Accept zone
  if (profit >= T.NEGOTIATE_MAX && profitPerMile >= T.MIN_RPM && profitPerDay >= T.MIN_PPD) {
    reasons.unshift(`${fmt$(profit)} profit · ${money(profitPerMile)}/mi · ${fmt$(profitPerDay)}/day`)
    if (profit >= T.HIGH_PROFIT) confidence += 10
    return makeResult('accept', clamp(Math.max(confidence, 75)), {
      gross, miles, rpm, fuelCost, driverPay, profit, profitPerMile, profitPerDay,
    }, reasons)
  }

  // Falls through (low ppd or low rpm) — negotiate
  if (profitPerDay < T.MIN_PPD) reasons.unshift(`${fmt$(profitPerDay)}/day below ${fmt$(T.MIN_PPD)} target — too slow`)
  if (profitPerMile < T.MIN_RPM) reasons.unshift(`${money(profitPerMile)}/mi profit below $1.00 floor`)
  return makeResult('negotiate', clamp(confidence), { gross, miles, rpm, fuelCost, driverPay, profit, profitPerMile, profitPerDay }, reasons)
}

function makeResult(decision, confidence, m, reasons) {
  const verdict = decision.toUpperCase()
  const colors = { accept: '#22c55e', negotiate: '#f59e0b', reject: '#ef4444' }
  let headline = ''
  if (decision === 'accept')   headline = `${fmt$(m.profit)} profit · ${money(m.profitPerMile)}/mi`
  if (decision === 'negotiate') headline = m.targetGross ? `Push to ${fmt$(m.targetGross)}` : `Renegotiate — too light`
  if (decision === 'reject')   headline = `Walk — ${fmt$(m.profit)} profit`
  return {
    decision, verdict, verdictColor: colors[decision],
    confidence, headline,
    gross: m.gross, miles: m.miles, rpm: m.rpm,
    fuelCost: m.fuelCost, driverPay: m.driverPay,
    profit: m.profit, profitPerMile: m.profitPerMile, profitPerDay: m.profitPerDay,
    targetRate: m.targetRate || null, targetGross: m.targetGross || null,
    reasons: reasons.slice(0, 4),
  }
}

function clamp(n) { return Math.max(0, Math.min(100, Math.round(n))) }
function fmt$(n) { return '$' + Math.round(Number(n) || 0).toLocaleString() }
function money(n) { return '$' + (Number(n) || 0).toFixed(2) }
