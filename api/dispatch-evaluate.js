import { handleCors, corsHeaders, requireAuth } from './_lib/auth.js'

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

function sbHeaders() {
  return {
    'apikey': SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  }
}

// ── Seasonality Module ────────────────────────────────────────────────────────

const SEASONAL_FACTORS = {
  midwest:   [0.88, 0.85, 0.95, 1.05, 1.10, 1.08, 1.05, 1.00, 1.02, 1.12, 1.15, 1.08],
  southeast: [0.90, 0.88, 0.95, 1.08, 1.12, 1.10, 1.06, 1.02, 1.00, 1.08, 1.10, 1.05],
  northeast: [0.92, 0.88, 0.98, 1.05, 1.08, 1.05, 1.00, 0.98, 1.02, 1.10, 1.12, 1.08],
  west:      [0.90, 0.88, 0.95, 1.10, 1.15, 1.12, 1.08, 1.05, 1.02, 1.08, 1.10, 1.05],
  south:     [0.88, 0.85, 0.92, 1.05, 1.10, 1.08, 1.05, 1.02, 1.00, 1.10, 1.12, 1.06],
}

const EQUIPMENT_MULTIPLIERS = {
  'reefer': 1.15,
  'refrigerated': 1.15,
  'flatbed': 1.08,
  'tanker': 1.12,
  'step deck': 1.10,
  'lowboy': 1.15,
  'dry van': 1.00,
  'van': 1.00,
  'power only': 0.95,
}

const REGION_MAP = {
  midwest:   ['IL','IN','OH','MI','WI','MN','IA','MO','KS','NE','SD','ND'],
  southeast: ['FL','GA','SC','NC','VA','AL','MS','TN','KY','WV','AR','LA'],
  northeast: ['NY','NJ','PA','CT','MA','RI','VT','NH','ME','MD','DE','DC'],
  west:      ['CA','WA','OR','NV','AZ','UT','CO','ID','MT','WY','NM'],
  south:     ['TX','OK'],
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
  // Try to extract state abbreviation from end
  const abbrev = last.replace(/[^A-Za-z]/g, '').toUpperCase()
  return abbrev.length === 2 ? abbrev : ''
}

function getSeasonalMultiplier(originState, month, equipment) {
  const region = getRegion(originState)
  const baseMult = SEASONAL_FACTORS[region][(month - 1)] || 1.0
  const equipKey = (equipment || '').toLowerCase()
  let equipMult = 1.0
  for (const [key, val] of Object.entries(EQUIPMENT_MULTIPLIERS)) {
    if (equipKey.includes(key)) { equipMult = val; break }
  }
  return baseMult * equipMult
}

// ── Core Evaluation Logic ─────────────────────────────────────────────────────

function evaluateLoad(load, driver, context) {
  const gross = parseFloat(load.gross) || 0
  const miles = parseFloat(load.miles) || 0
  const weight = parseFloat(load.weight) || 0
  const fuelCostPerMile = context.fuelCostPerMile || 0.55
  const driverType = context.driver_type || 'owner_operator'

  // 1. Fuel cost
  const fuelCost = Math.round(miles * fuelCostPerMile)

  // 2. Driver pay
  let driverPay = 0
  if (driverType === 'owner_operator') {
    const rate = parseFloat(driver?.pay_rate) || 50
    driverPay = Math.round(gross * (rate / 100))
  } else {
    const payModel = driver?.pay_model || 'percent'
    const payRate = parseFloat(driver?.pay_rate) || 28
    if (payModel === 'permile') driverPay = Math.round(miles * payRate)
    else if (payModel === 'flat') driverPay = Math.round(payRate)
    else driverPay = Math.round(gross * (payRate / 100))
  }

  // 3. Profit metrics
  const estProfit = Math.round(gross - driverPay - fuelCost)
  const profitPerMile = miles > 0 ? estProfit / miles : 0
  const rpm = miles > 0 ? gross / miles : 0

  // Transit days calculation
  let transitDays = Math.max(Math.ceil(miles / 500), 1)
  if (load.pickup_date && load.delivery_date) {
    const pickup = new Date(load.pickup_date)
    const delivery = new Date(load.delivery_date)
    const diff = Math.ceil((delivery - pickup) / (1000 * 60 * 60 * 24))
    if (diff > 0) transitDays = Math.max(transitDays, diff)
  }
  const profitPerDay = transitDays > 0 ? Math.round(estProfit / transitDays) : estProfit

  // 4. Seasonality
  const originState = extractState(load.origin)
  const month = new Date().getMonth() + 1
  const seasonMultiplier = getSeasonalMultiplier(originState, month, load.equipment)

  // 5. Lane rate comparison
  const laneAvgRate = context.laneAvgRate || 0
  const laneRatio = laneAvgRate > 0 && miles > 0 ? rpm / laneAvgRate : 1.0

  // 6. Weight preference
  const isLight = weight > 0 && weight <= 37000
  const weightBonus = isLight ? 0.03 : (weight > 42000 ? -0.05 : 0)

  // 7. Detection flags
  const isInstantBook = load.book_type === 'instant' || load.instant_book === true
  const isPowerOnly = (load.equipment || '').toLowerCase().includes('power only')
  const isMultiDay = transitDays > 1.5

  // 8. Broker urgency
  const brokerUrgency = context.brokerUrgency || 0

  // 9. DECISION ENGINE
  let confidence = 50
  let decision = 'negotiate'
  const reasons = []
  let negotiation = null

  // Hard reject: negative or near-zero profit
  if (estProfit < 200) {
    return {
      decision: 'reject',
      confidence: 95,
      reasons: [`Estimated profit $${estProfit} is below minimum threshold`],
      metrics: { estProfit, profitPerMile: round2(profitPerMile), profitPerDay, fuelCost, driverPay, transitDays, laneRatio: round2(laneRatio), seasonMultiplier: round2(seasonMultiplier), weightBonus, brokerUrgency, rpm: round2(rpm) },
      negotiation: null,
      auto_booked: false,
    }
  }

  // Reject: under $800 profit
  if (estProfit < 800) {
    return {
      decision: 'reject',
      confidence: 88,
      reasons: [`Estimated profit $${estProfit} below $800 minimum`],
      metrics: { estProfit, profitPerMile: round2(profitPerMile), profitPerDay, fuelCost, driverPay, transitDays, laneRatio: round2(laneRatio), seasonMultiplier: round2(seasonMultiplier), weightBonus, brokerUrgency, rpm: round2(rpm) },
      negotiation: null,
      auto_booked: false,
    }
  }

  // Negotiate zone: $800-$1200 profit
  if (estProfit >= 800 && estProfit < 1200) {
    decision = 'negotiate'
    // Scale markup: closer to $800 → higher markup
    const markupFactor = 1.10 + (1200 - estProfit) / (1200 - 800) * 0.05
    const targetGross = Math.round(gross * markupFactor)
    const targetRate = round2(miles > 0 ? targetGross / miles : 0)
    const currentRate = round2(rpm)
    const minAcceptGross = Math.round(gross * 1.05)
    const minAcceptRate = round2(miles > 0 ? minAcceptGross / miles : 0)

    reasons.push(`Profit marginal at $${estProfit} — counter at $${targetGross.toLocaleString()}`)
    negotiation = {
      currentRate,
      targetRate,
      minAcceptRate,
      script: `This load is at $${currentRate}/mi. Market shows $${targetRate} on this lane. Can you get closer to $${targetRate}?`
    }
  }

  // Weak per-mile
  if (profitPerMile < 1.00 && decision !== 'reject') {
    if (decision !== 'negotiate') decision = 'negotiate'
    reasons.push(`Profit/mile $${round2(profitPerMile)} below $1.00 target`)
  }

  // Weak per-day
  if (profitPerDay < 400 && decision !== 'reject') {
    if (decision !== 'negotiate') decision = 'negotiate'
    reasons.push(`Profit/day $${profitPerDay} below $400 target`)
  }

  // Accept zone: strong profit
  if (estProfit >= 1200 && profitPerMile >= 1.00 && profitPerDay >= 400) {
    decision = 'accept'
    confidence = 75
  }

  if (profitPerMile >= 1.50) {
    confidence += 10
    reasons.push(`Strong rate $${round2(profitPerMile)}/mi`)
  }

  if (profitPerMile >= 2.00) {
    confidence += 10
    reasons.push(`Excellent rate $${round2(profitPerMile)}/mi`)
  }

  // Lane comparison adjustments
  if (laneAvgRate > 0) {
    if (laneRatio < 0.85) {
      if (decision === 'accept') decision = 'negotiate'
      const pctBelow = Math.round((1 - laneRatio) * 100)
      reasons.push(`Below lane average by ${pctBelow}%`)
    }
    if (laneRatio >= 1.15) {
      confidence += 5
      const pctAbove = Math.round((laneRatio - 1) * 100)
      reasons.push(`Above lane average by ${pctAbove}%`)
    }
  }

  // Weight preference
  if (isLight) {
    confidence += 3
    reasons.push('Light load (under 37K lbs)')
  }
  if (weight > 42000) {
    confidence -= 5
    reasons.push('Heavy load — wear & tear')
  }

  // Multi-day hold warning
  if (isMultiDay && profitPerDay < 400) {
    if (decision === 'accept') decision = 'negotiate'
    reasons.push(`Multi-day hold: ${transitDays} days, only $${profitPerDay}/day`)
  }

  // Power-only bonus
  if (isPowerOnly) {
    confidence += 3
    reasons.push('Power-only — no trailer needed')
  }

  // Broker urgency boost
  if (brokerUrgency >= 70) {
    confidence += 5
    reasons.push('Broker shows urgency — room to negotiate higher')
  }

  // Seasonality notes
  if (seasonMultiplier > 1.1) reasons.push('Peak season — rates elevated')
  if (seasonMultiplier < 0.9) reasons.push('Slow season — rates depressed')

  // High-profit override
  if (estProfit >= 2000 && profitPerMile >= 1.50 && profitPerDay >= 500) {
    decision = 'accept'
    confidence = 95
    reasons.push('High-profit override — excellent load')
  }

  // Auto-book: instant-book + meets accept criteria
  let autoBooked = false
  if (isInstantBook && decision === 'accept' && confidence >= 75) {
    decision = 'auto_book'
    autoBooked = true
    reasons.push('Instant-book load — auto-booking')
  }

  // Build negotiation for negotiate decisions if not already set
  if (decision === 'negotiate' && !negotiation) {
    const targetGross = Math.round(gross * 1.12)
    const targetRate = round2(miles > 0 ? targetGross / miles : 0)
    const currentRate = round2(rpm)
    const minAcceptGross = Math.round(gross * 1.05)
    const minAcceptRate = round2(miles > 0 ? minAcceptGross / miles : 0)
    negotiation = {
      currentRate,
      targetRate,
      minAcceptRate,
      script: `This load is at $${currentRate}/mi. Market shows $${targetRate} on this lane. Can you get closer to $${targetRate}?`
    }
  }

  // Clamp confidence
  confidence = Math.max(0, Math.min(100, confidence))

  return {
    decision,
    confidence,
    reasons,
    metrics: {
      estProfit,
      profitPerMile: round2(profitPerMile),
      profitPerDay,
      fuelCost,
      driverPay,
      transitDays,
      laneRatio: round2(laneRatio),
      seasonMultiplier: round2(seasonMultiplier),
      weightBonus,
      brokerUrgency,
      rpm: round2(rpm),
    },
    negotiation: decision === 'negotiate' ? negotiation : null,
    auto_booked: autoBooked,
  }
}

function round2(n) {
  return Math.round(n * 100) / 100
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────

async function fetchDriver(driverId) {
  if (!driverId || !SUPABASE_URL || !SERVICE_KEY) return null
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/drivers?id=eq.${driverId}&select=id,pay_model,pay_rate,driver_type,full_name&limit=1`,
      { headers: sbHeaders() }
    )
    if (!res.ok) return null
    const rows = await res.json()
    return rows?.[0] || null
  } catch { return null }
}

async function fetchLaneAvgRate(ownerId, originCity, destCity) {
  if (!originCity || !destCity || !SUPABASE_URL || !SERVICE_KEY) return 0
  try {
    // Query historical loads on this lane
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/loads?owner_id=eq.${ownerId}&select=gross,miles&limit=50`,
      { headers: sbHeaders() }
    )
    if (!res.ok) return 0
    const loads = await res.json()
    if (!loads || loads.length === 0) return 0

    // Calculate average RPM from all historical loads as baseline
    const rates = loads
      .filter(l => l.gross > 0 && l.miles > 0)
      .map(l => l.gross / l.miles)
    if (rates.length === 0) return 0
    return rates.reduce((s, r) => s + r, 0) / rates.length
  } catch { return 0 }
}

async function fetchBrokerUrgency(ownerId, brokerName) {
  if (!brokerName || !SUPABASE_URL || !SERVICE_KEY) return 0
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/broker_urgency_scores?owner_id=eq.${ownerId}&broker_name=eq.${encodeURIComponent(brokerName)}&select=urgency_score&limit=1`,
      { headers: sbHeaders() }
    )
    if (!res.ok) return 0
    const rows = await res.json()
    return rows?.[0]?.urgency_score || 0
  } catch { return 0 }
}

async function fetchCarrierSettings(ownerId) {
  if (!SUPABASE_URL || !SERVICE_KEY) return {}
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/carrier_settings?owner_id=eq.${ownerId}&select=*&limit=1`,
      { headers: sbHeaders() }
    )
    if (!res.ok) return {}
    const rows = await res.json()
    return rows?.[0] || {}
  } catch { return {} }
}

async function runComplianceCheck(ownerId, driverId, vehicleId) {
  // Call the compliance-check endpoint internally via Supabase
  // We replicate the core logic inline for speed (avoid HTTP round-trip)
  if (!driverId || !SUPABASE_URL || !SERVICE_KEY) return { overall: 'unchecked', checks: {}, failing: [] }

  const failing = []
  const checks = {}

  try {
    // Fetch driver
    const dRes = await fetch(
      `${SUPABASE_URL}/rest/v1/drivers?id=eq.${driverId}&select=full_name,name,cdl_expiry,license_expiry,medical_card_expiry,med_card_expiry,is_available,availability_status&limit=1`,
      { headers: sbHeaders() }
    )
    if (!dRes.ok) return { overall: 'unchecked', checks: {}, failing: [] }
    const driver = (await dRes.json())?.[0]
    if (!driver) return { overall: 'unchecked', checks: {}, failing: [] }

    const daysUntil = (d) => { if (!d) return null; const diff = Math.round((new Date(d) - new Date()) / 86400000); return diff }

    // CDL
    const cdlDays = daysUntil(driver.cdl_expiry || driver.license_expiry)
    if (cdlDays !== null && cdlDays < 0) {
      checks.cdl_valid = { status: 'fail', detail: `Expired ${Math.abs(cdlDays)}d ago` }
      failing.push('cdl_valid')
    } else {
      checks.cdl_valid = { status: 'pass', detail: cdlDays !== null ? `${cdlDays}d left` : 'OK' }
    }

    // Medical card
    const medDays = daysUntil(driver.medical_card_expiry || driver.med_card_expiry)
    if (medDays !== null && medDays < 0) {
      checks.medical_card = { status: 'fail', detail: `Expired ${Math.abs(medDays)}d ago` }
      failing.push('medical_card')
    } else {
      checks.medical_card = { status: 'pass', detail: medDays !== null ? `${medDays}d left` : 'OK' }
    }

    // Availability
    if (driver.is_available === false) {
      checks.driver_available = { status: 'fail', detail: driver.availability_status || 'unavailable' }
      failing.push('driver_available')
    } else {
      checks.driver_available = { status: 'pass', detail: 'Available' }
    }

    // Drug test (quick check)
    const chRes = await fetch(
      `${SUPABASE_URL}/rest/v1/clearinghouse_queries?owner_id=eq.${ownerId}&driver_name=eq.${encodeURIComponent(driver.full_name || driver.name || '')}&order=created_at.desc&limit=1`,
      { headers: sbHeaders() }
    ).catch(() => null)
    if (chRes?.ok) {
      const ch = (await chRes.json())?.[0]
      if (ch && (ch.result === 'Positive' || ch.result === 'Refused')) {
        checks.drug_test = { status: 'fail', detail: `${ch.result} result` }
        failing.push('drug_test')
      } else {
        checks.drug_test = { status: 'pass', detail: 'Clear' }
      }
    }

    const overall = failing.length > 0 ? 'fail' : 'pass'
    return { overall, checks, failing }
  } catch {
    return { overall: 'unchecked', checks: {}, failing: [] }
  }
}

async function storeDecision(ownerId, loadId, driverId, driverType, result, loadData) {
  if (!SUPABASE_URL || !SERVICE_KEY) return
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/dispatch_decisions`, {
      method: 'POST',
      headers: { ...sbHeaders(), 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        owner_id: ownerId,
        load_id: loadId || null,
        driver_id: driverId || null,
        driver_type: driverType || 'owner_operator',
        decision: result.decision,
        confidence: result.confidence,
        reasons: result.reasons,
        metrics: result.metrics,
        negotiation: result.negotiation,
        load_data: loadData || {},
        auto_booked: result.auto_booked || false,
        compliance_status: result.compliance_status || 'unchecked',
        compliance_checks: result.compliance_checks || {},
        failing_compliance: result.failing_compliance || [],
        hold_reason: result.hold_reason || null,
        created_at: new Date().toISOString(),
      }),
    })
  } catch {
    // Fire-and-forget — don't block response
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })
  }

  const authErr = await requireAuth(req)
  if (authErr) return authErr
  const user = req._user

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return Response.json({ error: 'Not configured' }, { status: 500, headers: corsHeaders(req) })
  }

  try {
    const body = await req.json()
    const { load_id, load, driver_id, driver_type, truck_id } = body

    if (!load) {
      return Response.json({ error: 'Missing load data' }, { status: 400, headers: corsHeaders(req) })
    }

    // Fetch context in parallel
    const [driver, laneAvgRate, brokerUrgency, carrierSettings, complianceResult] = await Promise.all([
      driver_id ? fetchDriver(driver_id) : Promise.resolve(null),
      fetchLaneAvgRate(user.id, (load.origin || '').split(',')[0], (load.dest || '').split(',')[0]),
      fetchBrokerUrgency(user.id, load.broker),
      fetchCarrierSettings(user.id),
      driver_id ? runComplianceCheck(user.id, driver_id, truck_id) : Promise.resolve({ overall: 'unchecked', checks: {}, failing: [] }),
    ])

    const fuelCostPerMile = carrierSettings.fuel_cost_per_mile || 0.55
    const context = {
      driver_type: driver_type || driver?.driver_type || 'owner_operator',
      fuelCostPerMile,
      laneAvgRate,
      brokerUrgency,
    }

    // Evaluate profit/feasibility
    const result = evaluateLoad(load, driver, context)

    // Apply carrier threshold overrides if configured
    const minProfit = carrierSettings.min_profit || 800
    const minRpm = carrierSettings.min_rpm || 1.00
    const minProfitPerDay = carrierSettings.min_profit_per_day || 400
    const maxDeadhead = carrierSettings.max_deadhead_miles || 150

    // Re-check with carrier-specific thresholds
    if (result.decision !== 'reject' && result.metrics.estProfit < minProfit) {
      result.decision = 'reject'
      result.confidence = 90
      result.reasons.push(`Below your min profit threshold of $${minProfit}`)
    }
    if (result.decision !== 'reject' && result.metrics.rpm < minRpm) {
      if (result.decision === 'accept') result.decision = 'negotiate'
      result.reasons.push(`RPM $${result.metrics.rpm} below your $${minRpm} threshold`)
    }

    // Compliance gate — block dispatch if compliance fails and enforcement is on
    result.compliance_status = complianceResult.overall
    result.compliance_checks = complianceResult.checks
    result.failing_compliance = complianceResult.failing

    if (complianceResult.overall === 'fail') {
      const enforce = carrierSettings.enforce_compliance !== false
      if (enforce && (result.decision === 'accept' || result.decision === 'auto_book')) {
        // Downgrade to hold — profitable but can't dispatch
        result.decision = 'hold'
        result.hold_reason = `Compliance blocked: ${complianceResult.failing.join(', ')}`
        result.reasons.push(`⚠️ COMPLIANCE BLOCK: ${complianceResult.failing.map(f => complianceResult.checks[f]?.detail || f).join('; ')}`)
        result.auto_booked = false
      } else if (!enforce) {
        result.reasons.push(`⚠️ Compliance warning (not enforced): ${complianceResult.failing.join(', ')}`)
      }
    }

    // Disable auto-book if carrier turned it off
    if (result.decision === 'auto_book' && carrierSettings.auto_book_enabled === false) {
      result.decision = 'accept'
      result.auto_booked = false
      result.reasons.push('Auto-book disabled in settings — manual confirmation required')
    }
    if (result.decision === 'auto_book' && result.confidence < (carrierSettings.auto_book_confidence || 75)) {
      result.decision = 'accept'
      result.auto_booked = false
      result.reasons.push(`Confidence ${result.confidence}% below auto-book threshold of ${carrierSettings.auto_book_confidence || 75}%`)
    }

    // Store decision with compliance data (fire-and-forget)
    storeDecision(user.id, load_id, driver_id, context.driver_type, result, load)

    return Response.json(result, { headers: corsHeaders(req) })
  } catch (err) {
    return Response.json({ error: 'Evaluation failed: ' + (err.message || 'unknown') }, { status: 500, headers: corsHeaders(req) })
  }
}
