import { handleCors, corsHeaders, requireAuth } from './_lib/auth.js'
import { validateDispatch, createFetchers } from './_lib/compliance.js'

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

  // 9. Pickup urgency — same-day/next-day means broker is desperate
  let pickupUrgency = 0
  if (load.pickup_date) {
    const hoursUntil = (new Date(load.pickup_date) - new Date()) / (1000 * 60 * 60)
    if (hoursUntil <= 6) pickupUrgency = 100
    else if (hoursUntil <= 24) pickupUrgency = 80
    else if (hoursUntil <= 48) pickupUrgency = 40
  }

  // 10. Destination market quality
  const DEAD_ZONES = ['laredo','el paso','mcallen','brownsville','nogales','sweetwater','lubbock','amarillo','midland','odessa']
  const HOT_MARKETS = ['dallas','houston','atlanta','chicago','los angeles','memphis','indianapolis','columbus','nashville','charlotte']
  const destCity = (load.dest || load.destination || '').split(',')[0]?.toLowerCase().trim() || ''
  const isDeadZone = DEAD_ZONES.some(z => destCity.includes(z))
  const isHotMarket = HOT_MARKETS.some(m => destCity.includes(m))

  // 11. DECISION ENGINE
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
      metrics: { estProfit, profitPerMile: round2(profitPerMile), profitPerDay, fuelCost, driverPay, transitDays, laneRatio: round2(laneRatio), seasonMultiplier: round2(seasonMultiplier), weightBonus, brokerUrgency, pickupUrgency, isDeadZone, isHotMarket, rpm: round2(rpm) },
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
      metrics: { estProfit, profitPerMile: round2(profitPerMile), profitPerDay, fuelCost, driverPay, transitDays, laneRatio: round2(laneRatio), seasonMultiplier: round2(seasonMultiplier), weightBonus, brokerUrgency, pickupUrgency, isDeadZone, isHotMarket, rpm: round2(rpm) },
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

  // Pickup urgency — broker desperate, push for more
  if (pickupUrgency >= 80) {
    confidence += 5
    reasons.push('Urgent pickup — broker has limited options')
    if (decision === 'negotiate' && negotiation) {
      negotiation.targetRate = round2(negotiation.targetRate * 1.08)
      negotiation.script = `Pickup is ${pickupUrgency >= 100 ? 'today' : 'tomorrow'} — we need $${negotiation.targetRate}/mi to cover the short notice.`
    }
  }

  // Destination market quality
  if (isDeadZone) {
    if (decision === 'accept' && profitPerMile < 1.80) {
      decision = 'negotiate'
      reasons.push(`Dead zone destination (${destCity}) — charge premium for deadhead risk`)
    }
    confidence -= 5
  }
  if (isHotMarket) {
    confidence += 3
    reasons.push(`Hot market destination (${destCity}) — easy reloads`)
  }

  // ── Smart Dispatcher: Trap Load Detection ──
  // High gross that masks terrible per-day returns
  let isTrapLoad = false
  if (gross >= 2000 && transitDays >= 2.5 && profitPerDay < 350) {
    isTrapLoad = true
    if (decision === 'accept') decision = 'negotiate'
    reasons.push(`Trap load: $${gross.toLocaleString()} gross over ${transitDays} days = only $${profitPerDay}/day — blocks truck`)
  }
  if (gross >= 1500 && miles > 800 && rpm < 1.80 && profitPerMile < 0.80) {
    isTrapLoad = true
    if (decision === 'accept') decision = 'negotiate'
    reasons.push(`Cheap freight disguised as good: $${gross.toLocaleString()} across ${miles}mi = $${round2(rpm)}/mi`)
  }

  // ── Smart Dispatcher: Forward-Looking Strategic Analysis ──
  const RELOAD_HUBS = { 'dallas': 95, 'houston': 93, 'atlanta': 92, 'chicago': 94, 'los angeles': 90, 'memphis': 88, 'indianapolis': 85, 'columbus': 84, 'nashville': 87, 'charlotte': 83, 'jacksonville': 80, 'kansas city': 82, 'louisville': 78, 'detroit': 75, 'denver': 77, 'phoenix': 76 }
  const destCityLower = destCity
  const reloadProb = Object.entries(RELOAD_HUBS).find(([city]) => destCityLower.includes(city))?.[1] || 45
  const isStranding = reloadProb < 55

  if (isStranding && decision !== 'reject') {
    if (decision === 'accept' && profitPerMile < 1.50) {
      decision = 'negotiate'
      reasons.push(`Weak reload market at destination (${reloadProb}%) — charge premium for deadhead risk`)
    }
    confidence -= 8
  } else if (reloadProb >= 85) {
    confidence += 3
    reasons.push(`Strong reload market (${reloadProb}%) — truck stays productive`)
  }

  // ── Smart Dispatcher: Driver Burnout ──
  if (driver) {
    const weeklyHours = parseFloat(driver.weekly_hours) || 0
    const drivingUsed = parseFloat(driver.driving_hours_used) || 0
    if (weeklyHours > 50 && miles > 600) {
      if (decision === 'accept') decision = 'negotiate'
      reasons.push(`Driver fatigue risk: ${weeklyHours}h this week — prefer shorter load or premium for long haul`)
      confidence -= 5
    }
  }

  // Market rate comparison — use simulation engine
  const originSt = extractState(load.origin)
  const destSt = extractState(load.dest || load.destination || '')
  let marketComparison = null
  if (originSt && destSt && rpm > 0) {
    const mBase = { 'Dry Van': 2.35, 'Reefer': 2.75, 'Flatbed': 2.95, 'Step Deck': 3.15, 'Power Only': 1.95, 'Tanker': 3.20 }
    const mSeasonal = [0.90,0.91,0.98,1.02,1.12,1.14,1.03,1.04,1.12,1.13,1.08,1.06]
    const eqKey = (load.equipment || 'Dry Van')
    const base = mBase[eqKey] || 2.35
    const sm = mSeasonal[month - 1] || 1.0
    const marketAvg = Math.round(base * sm * 100) / 100
    const pctDiff = Math.round(((rpm - marketAvg) / marketAvg) * 100)
    marketComparison = { marketAvg, pctDiff }

    if (pctDiff < -15) {
      // Far below market — reject
      if (decision !== 'reject') {
        decision = 'reject'
        confidence = 92
      }
      reasons.push(`Rate $${round2(rpm)}/mi is ${Math.abs(pctDiff)}% below market avg $${marketAvg}/mi — not recommended`)
    } else if (pctDiff < -5) {
      // Below market — negotiate
      if (decision === 'accept') decision = 'negotiate'
      reasons.push(`Rate ${Math.abs(pctDiff)}% below market avg $${marketAvg}/mi — negotiate higher`)
      if (!negotiation) {
        const targetGross = Math.round(marketAvg * miles)
        negotiation = {
          currentRate: round2(rpm),
          targetRate: round2(marketAvg),
          minAcceptRate: round2(marketAvg * 0.95),
          script: `Current rate $${round2(rpm)}/mi is below market at $${marketAvg}/mi. We need at least $${round2(marketAvg * 0.95)}/mi.`
        }
      }
    } else if (pctDiff >= 8) {
      confidence += 5
      reasons.push(`Rate ${pctDiff}% above market avg $${marketAvg}/mi — strong load`)
    }
  }

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

  // ── Decision Clarity: Why this decision, why not others ──
  const decisionClarity = {}
  if (decision === 'accept' || decision === 'auto_book') {
    decisionClarity.chosen = `Accepted: profit $${estProfit} ($${round2(profitPerMile)}/mi, $${profitPerDay}/day) meets thresholds`
    decisionClarity.whyNotReject = estProfit >= 800 ? `Profit $${estProfit} exceeds $800 minimum` : `Backhaul or strategic value overrides low profit`
    decisionClarity.whyNotNegotiate = profitPerMile >= 1.00 ? `RPM $${round2(profitPerMile)} above $1.00 target` : `Market conditions or urgency favor immediate booking`
  } else if (decision === 'reject') {
    decisionClarity.chosen = `Rejected: ${reasons[0] || 'Does not meet minimum thresholds'}`
    decisionClarity.whyNotAccept = estProfit < 800 ? `Profit $${estProfit} below $800 minimum` : `Market rate, compliance, or strategic factors block acceptance`
    decisionClarity.whyNotNegotiate = estProfit < 200 ? `Too far below minimum — not worth negotiating` : `Rate too far below market to bridge the gap`
  } else if (decision === 'negotiate') {
    decisionClarity.chosen = `Negotiate: ${reasons[0] || 'Rate below optimal but worth pursuing'}`
    decisionClarity.whyNotAccept = `${profitPerMile < 1.00 ? `RPM $${round2(profitPerMile)} below $1.00 target` : 'Market or strategic factors require higher rate'}`
    decisionClarity.whyNotReject = `Profit $${estProfit} shows potential if rate improves ${negotiation ? `to $${negotiation.targetRate}/mi` : '5-12%'}`
  }

  return {
    decision,
    confidence,
    reasons,
    decisionClarity,
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
      pickupUrgency,
      isDeadZone,
      isHotMarket,
      rpm: round2(rpm),
      marketComparison,
      reloadProb,
      isTrapLoad,
    },
    negotiation: decision === 'negotiate' ? negotiation : null,
    auto_booked: autoBooked,
  }
}

function round2(n) {
  return Math.round(n * 100) / 100
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────

async function fetchLaneAvgRate(ownerId, originCity, destCity) {
  if (!originCity || !destCity || !SUPABASE_URL || !SERVICE_KEY) return 0

  // Try lane_predictions first (pre-computed by cron, fast)
  const originState = extractState(originCity)
  const destState = extractState(destCity)
  if (originState && destState) {
    try {
      const predRes = await fetch(
        `${SUPABASE_URL}/rest/v1/lane_predictions?owner_id=eq.${ownerId}&origin_state=eq.${originState}&dest_state=eq.${destState}&select=predicted_rpm,trend,trend_pct,confidence&limit=1`,
        { headers: sbHeaders(), signal: AbortSignal.timeout(5000) }
      )
      if (predRes.ok) {
        const rows = await predRes.json()
        if (rows?.[0]?.predicted_rpm > 0) return parseFloat(rows[0].predicted_rpm)
      }
    } catch {}
  }

  // Fallback: on-the-fly calculation from recent loads
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/loads?owner_id=eq.${ownerId}&select=rate,miles&limit=50`,
      { headers: sbHeaders(), signal: AbortSignal.timeout(5000) }
    )
    if (!res.ok) return 0
    const loads = await res.json()
    if (!loads || loads.length === 0) return 0
    const rates = loads.filter(l => l.rate > 0 && l.miles > 0).map(l => l.rate / l.miles)
    if (rates.length === 0) return 0
    return rates.reduce((s, r) => s + r, 0) / rates.length
  } catch { return 0 }
}

async function fetchBrokerUrgency(ownerId, brokerName) {
  if (!brokerName || !SUPABASE_URL || !SERVICE_KEY) return 0
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/broker_urgency_scores?owner_id=eq.${ownerId}&broker_name=eq.${encodeURIComponent(brokerName)}&select=urgency_score&limit=1`,
      { headers: sbHeaders(), signal: AbortSignal.timeout(5000) }
    )
    if (!res.ok) return 0
    const rows = await res.json()
    return rows?.[0]?.urgency_score || 0
  } catch { return 0 }
}

// Compliance data fetching + carrier settings now handled by shared _lib/compliance.js

async function storeDecision(ownerId, loadId, driverId, driverType, result, loadData) {
  if (!SUPABASE_URL || !SERVICE_KEY) return
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/dispatch_decisions`, {
      method: 'POST',
      headers: { ...sbHeaders(), 'Prefer': 'return=minimal' },
      signal: AbortSignal.timeout(5000),
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

    // Initialize shared compliance fetchers
    const cf = createFetchers(SUPABASE_URL, SERVICE_KEY)

    // Phase 1: Fetch independent data in parallel
    const [driver, laneAvgRate, brokerUrgency, carrierSettings, complianceVehicle, dvirResult] = await Promise.all([
      driver_id ? cf.fetchDriver(driver_id) : Promise.resolve(null),
      fetchLaneAvgRate(user.id, (load.origin || '').split(',')[0], (load.dest || '').split(',')[0]),
      fetchBrokerUrgency(user.id, load.broker),
      cf.fetchSettings(user.id),
      truck_id ? cf.fetchVehicle(truck_id) : Promise.resolve(null),
      truck_id ? cf.fetchDVIRDefects(user.id, truck_id) : Promise.resolve(null),
    ])

    // Phase 2: Fetch driver-dependent compliance data (needs driver name)
    const driverName = driver?.full_name || driver?.name || ''
    const [clearinghouseResult, hosHoursLeft] = driver ? await Promise.all([
      cf.fetchClearinghouse(user.id, driverName),
      cf.fetchHOSHoursLeft(user.id, driverName),
    ]) : [null, 11]

    const fuelCostPerMile = carrierSettings.fuel_cost_per_mile || 0.55
    const context = {
      driver_type: driver_type || driver?.driver_type || 'owner_operator',
      fuelCostPerMile,
      laneAvgRate,
      brokerUrgency,
    }

    // ── STEP 1: Evaluate profit/feasibility ──
    const result = evaluateLoad(load, driver, context)

    // Apply carrier threshold overrides
    const minProfit = carrierSettings.min_profit || 800
    const minRpm = carrierSettings.min_rpm || 1.00

    if (result.decision !== 'reject' && result.metrics.estProfit < minProfit) {
      result.decision = 'reject'
      result.confidence = 90
      result.reasons.push(`Below your min profit threshold of $${minProfit}`)
    }
    if (result.decision !== 'reject' && result.metrics.rpm < minRpm) {
      if (result.decision === 'accept') result.decision = 'negotiate'
      result.reasons.push(`RPM $${result.metrics.rpm} below your $${minRpm} threshold`)
    }

    // ── STEP 2: Run compliance validation (shared service) ──
    const compliance = validateDispatch({
      driver,
      vehicle: complianceVehicle,
      clearinghouseResult,
      hosHoursLeft,
      dvirResult,
      settings: carrierSettings,
      load,
    })

    // Attach compliance data to every decision record
    result.compliance_status = compliance.compliance_status
    result.compliance_checks = compliance.checks
    result.failing_compliance = compliance.failing

    // ── STEP 3: Apply compliance gate to decision ──
    if (compliance.compliance_status === 'BLOCKED') {
      // Force hold — load may be profitable but cannot be dispatched
      if (result.decision !== 'reject') {
        result.decision = 'hold'
        result.hold_reason = `Compliance blocked: ${compliance.failing.join(', ')}`
        result.auto_booked = false
      }
      // Append all compliance block reasons
      compliance.reasons.forEach(r => result.reasons.push(r))
    } else if (compliance.compliance_status === 'RISK') {
      // Allow decision but flag as risky
      compliance.reasons.forEach(r => result.reasons.push(r))
    }
    // OK = no compliance issues, no modifications needed

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
    // Alert admin on dispatch evaluation failure
    if (SUPABASE_URL && SERVICE_KEY) {
      fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
        method: 'POST',
        headers: { ...sbHeaders(), 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          title: '[CRITICAL] Dispatch Evaluation Failed',
          body: `Load evaluation crashed: ${err.message || 'Unknown error'}. The AI dispatch engine needs attention.`,
          user_id: 'system',
          read: false,
        }),
      }).catch(() => {})
    }
    return Response.json({ error: 'Evaluation failed: ' + (err.message || 'unknown') }, { status: 500, headers: corsHeaders(req) })
  }
}
