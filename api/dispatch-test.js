// api/dispatch-test.js — Generate test loads and batch-evaluate through dispatch engine
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

// ── Realistic freight lane data ─────────────────────────────────────────────

const LANES = [
  { origin: 'Chicago, IL',        dest: 'Dallas, TX',          miles: 920 },
  { origin: 'Atlanta, GA',        dest: 'Miami, FL',           miles: 662 },
  { origin: 'Los Angeles, CA',    dest: 'Phoenix, AZ',         miles: 373 },
  { origin: 'Houston, TX',        dest: 'Memphis, TN',         miles: 586 },
  { origin: 'Detroit, MI',        dest: 'Nashville, TN',       miles: 533 },
  { origin: 'Charlotte, NC',      dest: 'Jacksonville, FL',    miles: 395 },
  { origin: 'Columbus, OH',       dest: 'Indianapolis, IN',    miles: 175 },
  { origin: 'Denver, CO',         dest: 'Salt Lake City, UT',  miles: 525 },
  { origin: 'Newark, NJ',         dest: 'Boston, MA',          miles: 215 },
  { origin: 'Kansas City, MO',    dest: 'St. Louis, MO',       miles: 248 },
  { origin: 'Seattle, WA',        dest: 'Portland, OR',        miles: 174 },
  { origin: 'Minneapolis, MN',    dest: 'Milwaukee, WI',       miles: 337 },
  { origin: 'Laredo, TX',         dest: 'San Antonio, TX',     miles: 157 },
  { origin: 'Savannah, GA',       dest: 'Raleigh, NC',         miles: 340 },
  { origin: 'Louisville, KY',     dest: 'Cincinnati, OH',      miles: 100 },
  { origin: 'Philadelphia, PA',   dest: 'Baltimore, MD',       miles: 101 },
  { origin: 'Fresno, CA',         dest: 'Sacramento, CA',      miles: 170 },
  { origin: 'El Paso, TX',        dest: 'Albuquerque, NM',     miles: 268 },
  { origin: 'Tampa, FL',          dest: 'Orlando, FL',         miles: 84  },
  { origin: 'Oklahoma City, OK',  dest: 'Little Rock, AR',     miles: 345 },
  { origin: 'Chicago, IL',        dest: 'New York, NY',        miles: 790 },
  { origin: 'Dallas, TX',         dest: 'Los Angeles, CA',     miles: 1435 },
  { origin: 'Atlanta, GA',        dest: 'Chicago, IL',         miles: 716 },
  { origin: 'Los Angeles, CA',    dest: 'Seattle, WA',         miles: 1135 },
]

const BROKERS = [
  'TQL', 'CH Robinson', 'XPO Logistics', 'Echo Global', 'Coyote Logistics',
  'Uber Freight', 'Convoy', 'DAT Direct', 'JB Hunt 360', 'Schneider FreightPower',
  'Amazon Relay', 'GlobalTranz', 'Transfix', 'FreightWaves', 'Landstar',
  'Werner Enterprises', 'Arrive Logistics', 'RXO', 'Total Quality Logistics', 'Nolan',
]

const EQUIPMENT = ['Dry Van', 'Reefer', 'Flatbed', 'Step Deck', 'Power Only']

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)] }

function futureDate(daysOut) {
  const d = new Date()
  d.setDate(d.getDate() + daysOut)
  return d.toISOString().split('T')[0]
}

// ── Load Generators by Category ─────────────────────────────────────────────

function generateLowProfit() {
  const lane = pick(LANES)
  // Low RPM: $1.20-$2.00/mi → will trigger reject or low-negotiate
  const rpm = 1.2 + Math.random() * 0.8
  const gross = Math.round(lane.miles * rpm)
  return {
    category: 'low_profit',
    load: {
      origin: lane.origin, dest: lane.dest, miles: lane.miles,
      gross, weight: rand(30000, 42000), equipment: pick(['Dry Van', 'Flatbed']),
      broker: pick(BROKERS), book_type: 'standard', instant_book: false,
      pickup_date: futureDate(rand(1, 3)), delivery_date: futureDate(rand(3, 5)),
    },
  }
}

function generateMediumProfit() {
  const lane = pick(LANES)
  // Medium RPM: $2.50-$3.80/mi → negotiate or borderline accept
  const rpm = 2.5 + Math.random() * 1.3
  const gross = Math.round(lane.miles * rpm)
  return {
    category: 'medium_profit',
    load: {
      origin: lane.origin, dest: lane.dest, miles: lane.miles,
      gross, weight: rand(28000, 38000), equipment: pick(['Dry Van', 'Reefer']),
      broker: pick(BROKERS), book_type: 'standard', instant_book: false,
      pickup_date: futureDate(rand(1, 4)), delivery_date: futureDate(rand(3, 6)),
    },
  }
}

function generateHighProfit() {
  const lane = pick(LANES)
  // High RPM: $4.00-$6.50/mi → strong accept
  const rpm = 4.0 + Math.random() * 2.5
  const gross = Math.round(lane.miles * rpm)
  return {
    category: 'high_profit',
    load: {
      origin: lane.origin, dest: lane.dest, miles: lane.miles,
      gross, weight: rand(24000, 36000), equipment: pick(EQUIPMENT),
      broker: pick(BROKERS), book_type: Math.random() > 0.5 ? 'instant' : 'standard',
      instant_book: Math.random() > 0.5,
      pickup_date: futureDate(rand(1, 2)), delivery_date: futureDate(rand(2, 4)),
    },
  }
}

function generateHeavyLoad() {
  const lane = pick(LANES)
  // Heavy = 42000-45000 lbs, moderate rate
  const rpm = 2.8 + Math.random() * 1.5
  const gross = Math.round(lane.miles * rpm)
  return {
    category: 'heavy_load',
    load: {
      origin: lane.origin, dest: lane.dest, miles: lane.miles,
      gross, weight: rand(42000, 45000), equipment: pick(['Flatbed', 'Step Deck']),
      broker: pick(BROKERS), book_type: 'standard', instant_book: false,
      pickup_date: futureDate(rand(2, 5)), delivery_date: futureDate(rand(4, 7)),
    },
  }
}

function generateLightLoad() {
  const lane = pick(LANES)
  // Light = 12000-28000 lbs, decent rate → should get weight bonus
  const rpm = 3.0 + Math.random() * 2.0
  const gross = Math.round(lane.miles * rpm)
  return {
    category: 'light_load',
    load: {
      origin: lane.origin, dest: lane.dest, miles: lane.miles,
      gross, weight: rand(12000, 28000), equipment: pick(['Dry Van', 'Reefer', 'Power Only']),
      broker: pick(BROKERS), book_type: 'standard', instant_book: false,
      pickup_date: futureDate(rand(1, 3)), delivery_date: futureDate(rand(2, 5)),
    },
  }
}

function generateUrgentLoad() {
  const lane = pick(LANES)
  // Urgent: same-day or next-day, instant-book, higher rate
  const rpm = 3.5 + Math.random() * 3.0
  const gross = Math.round(lane.miles * rpm)
  return {
    category: 'urgent',
    load: {
      origin: lane.origin, dest: lane.dest, miles: lane.miles,
      gross, weight: rand(20000, 38000), equipment: pick(EQUIPMENT),
      broker: pick(BROKERS), book_type: 'instant', instant_book: true,
      pickup_date: futureDate(0), delivery_date: futureDate(rand(1, 2)),
    },
  }
}

const GENERATORS = {
  low_profit: generateLowProfit,
  medium_profit: generateMediumProfit,
  high_profit: generateHighProfit,
  heavy_load: generateHeavyLoad,
  light_load: generateLightLoad,
  urgent: generateUrgentLoad,
}

// ── Core evaluate logic (inlined to avoid cross-file import in Edge) ────────

const SEASONAL_FACTORS = {
  midwest:   [0.88, 0.85, 0.95, 1.05, 1.10, 1.08, 1.05, 1.00, 1.02, 1.12, 1.15, 1.08],
  southeast: [0.90, 0.88, 0.95, 1.08, 1.12, 1.10, 1.06, 1.02, 1.00, 1.08, 1.10, 1.05],
  northeast: [0.92, 0.88, 0.98, 1.05, 1.08, 1.05, 1.00, 0.98, 1.02, 1.10, 1.12, 1.08],
  west:      [0.90, 0.88, 0.95, 1.10, 1.15, 1.12, 1.08, 1.05, 1.02, 1.08, 1.10, 1.05],
  south:     [0.88, 0.85, 0.92, 1.05, 1.10, 1.08, 1.05, 1.02, 1.00, 1.10, 1.12, 1.06],
}

const EQUIPMENT_MULTIPLIERS = { 'reefer': 1.15, 'refrigerated': 1.15, 'flatbed': 1.08, 'step deck': 1.06, 'power only': 0.92, 'hotshot': 0.95 }

const STATE_REGIONS = {
  midwest: ['IL','IN','IA','KS','MI','MN','MO','NE','ND','OH','SD','WI'],
  southeast: ['AL','FL','GA','KY','MS','NC','SC','TN','VA','WV'],
  northeast: ['CT','DE','ME','MD','MA','NH','NJ','NY','PA','RI','VT','DC'],
  west: ['AZ','CA','CO','ID','MT','NV','NM','OR','UT','WA','WY'],
  south: ['AR','LA','OK','TX'],
}

function getRegion(st) {
  const s = (st || '').toUpperCase()
  for (const [r, states] of Object.entries(STATE_REGIONS)) { if (states.includes(s)) return r }
  return 'midwest'
}
function extractState(loc) {
  if (!loc) return ''
  const parts = loc.split(',').map(p => p.trim())
  const last = parts[parts.length - 1]
  const abbrev = last.replace(/[^A-Za-z]/g, '').toUpperCase()
  return abbrev.length === 2 ? abbrev : ''
}
function round2(n) { return Math.round(n * 100) / 100 }

function evaluateLoad(load, driver, context) {
  const gross = parseFloat(load.gross) || 0
  const miles = parseFloat(load.miles) || 0
  const weight = parseFloat(load.weight) || 0
  const fuelCostPerMile = context.fuelCostPerMile || 0.55
  const driverType = context.driver_type || 'owner_operator'

  const fuelCost = Math.round(miles * fuelCostPerMile)
  let driverPay = 0
  if (driverType === 'owner_operator') {
    driverPay = Math.round(gross * ((parseFloat(driver?.pay_rate) || 50) / 100))
  } else {
    const payModel = driver?.pay_model || 'percent'
    const payRate = parseFloat(driver?.pay_rate) || 28
    if (payModel === 'permile') driverPay = Math.round(miles * payRate)
    else if (payModel === 'flat') driverPay = Math.round(payRate)
    else driverPay = Math.round(gross * (payRate / 100))
  }

  const estProfit = Math.round(gross - driverPay - fuelCost)
  const profitPerMile = miles > 0 ? estProfit / miles : 0
  const rpm = miles > 0 ? gross / miles : 0

  let transitDays = Math.max(Math.ceil(miles / 500), 1)
  if (load.pickup_date && load.delivery_date) {
    const diff = Math.ceil((new Date(load.delivery_date) - new Date(load.pickup_date)) / 86400000)
    if (diff > 0) transitDays = Math.max(transitDays, diff)
  }
  const profitPerDay = transitDays > 0 ? Math.round(estProfit / transitDays) : estProfit

  const originState = extractState(load.origin)
  const month = new Date().getMonth() + 1
  const region = getRegion(originState)
  const baseMult = SEASONAL_FACTORS[region][(month - 1)] || 1.0
  const equipKey = (load.equipment || '').toLowerCase()
  let equipMult = 1.0
  for (const [key, val] of Object.entries(EQUIPMENT_MULTIPLIERS)) { if (equipKey.includes(key)) { equipMult = val; break } }
  const seasonMultiplier = baseMult * equipMult

  const laneAvgRate = context.laneAvgRate || 0
  const laneRatio = laneAvgRate > 0 && miles > 0 ? rpm / laneAvgRate : 1.0
  const isLight = weight > 0 && weight <= 37000
  const weightBonus = isLight ? 0.03 : (weight > 42000 ? -0.05 : 0)
  const isInstantBook = load.book_type === 'instant' || load.instant_book === true
  const brokerUrgency = context.brokerUrgency || 0

  let confidence = 50
  let decision = 'negotiate'
  const reasons = []
  let negotiation = null

  if (estProfit < 200) return { decision: 'reject', confidence: 95, reasons: [`Estimated profit $${estProfit} is below minimum threshold`], metrics: { estProfit, profitPerMile: round2(profitPerMile), profitPerDay, fuelCost, driverPay, transitDays, laneRatio: round2(laneRatio), seasonMultiplier: round2(seasonMultiplier), weightBonus, brokerUrgency, rpm: round2(rpm) }, negotiation: null, auto_booked: false }
  if (estProfit < 800) return { decision: 'reject', confidence: 88, reasons: [`Estimated profit $${estProfit} below $800 minimum`], metrics: { estProfit, profitPerMile: round2(profitPerMile), profitPerDay, fuelCost, driverPay, transitDays, laneRatio: round2(laneRatio), seasonMultiplier: round2(seasonMultiplier), weightBonus, brokerUrgency, rpm: round2(rpm) }, negotiation: null, auto_booked: false }

  if (estProfit >= 800 && estProfit < 1200) {
    decision = 'negotiate'
    const markupFactor = 1.10 + (1200 - estProfit) / 400 * 0.05
    const targetGross = Math.round(gross * markupFactor)
    const targetRate = round2(miles > 0 ? targetGross / miles : 0)
    const minAcceptGross = Math.round(gross * 1.05)
    const minAcceptRate = round2(miles > 0 ? minAcceptGross / miles : 0)
    reasons.push(`Profit marginal at $${estProfit} — counter at $${targetGross.toLocaleString()}`)
    negotiation = { currentRate: round2(rpm), targetRate, minAcceptRate, minAccept: minAcceptGross, targetGross }
  }
  if (profitPerMile < 1.00 && decision !== 'reject') { if (decision !== 'negotiate') decision = 'negotiate'; reasons.push(`Profit/mile $${round2(profitPerMile)} below $1.00 target`) }
  if (profitPerDay < 400 && decision !== 'reject') { if (decision !== 'negotiate') decision = 'negotiate'; reasons.push(`Profit/day $${profitPerDay} below $400 target`) }

  if (estProfit >= 1200 && profitPerMile >= 1.00 && profitPerDay >= 400) { decision = 'accept'; confidence = 75 }
  if (profitPerMile >= 1.50) { confidence += 10; reasons.push(`Strong rate $${round2(profitPerMile)}/mi`) }
  if (profitPerMile >= 2.00) { confidence += 10; reasons.push(`Excellent rate $${round2(profitPerMile)}/mi`) }
  if (isLight) { confidence += 3; reasons.push('Light load (under 37K lbs)') }
  if (weight > 42000) { confidence -= 5; reasons.push('Heavy load — increased wear (42K+ lbs)') }

  if (isInstantBook && decision === 'accept') {
    decision = 'auto_book'
    confidence = Math.min(confidence + 5, 99)
    reasons.push('Instant-book available — auto-booked')
  }

  if (estProfit >= 2000 && profitPerMile >= 1.50 && profitPerDay >= 500) { confidence = 95; reasons.push(`High-profit load — $${estProfit} est. profit`) }

  confidence = Math.max(20, Math.min(99, confidence))

  return {
    decision, confidence, reasons,
    metrics: { estProfit, profitPerMile: round2(profitPerMile), profitPerDay, fuelCost, driverPay, transitDays, laneRatio: round2(laneRatio), seasonMultiplier: round2(seasonMultiplier), weightBonus, brokerUrgency, rpm: round2(rpm) },
    negotiation, auto_booked: decision === 'auto_book',
  }
}

// ── Store decisions ─────────────────────────────────────────────────────────

async function storeDecisions(ownerId, results) {
  if (!SUPABASE_URL || !SERVICE_KEY || results.length === 0) return
  try {
    const records = results.map(r => ({
      owner_id: ownerId,
      load_id: r.load_id || null,
      driver_id: null,
      driver_type: r.driver_type || 'owner_operator',
      decision: r.result.decision,
      confidence: r.result.confidence,
      reasons: r.result.reasons,
      metrics: r.result.metrics,
      negotiation: r.result.negotiation,
      load_data: r.load,
      auto_booked: r.result.auto_booked || false,
      created_at: new Date().toISOString(),
    }))
    await fetch(`${SUPABASE_URL}/rest/v1/dispatch_decisions`, {
      method: 'POST',
      headers: { ...sbHeaders(), 'Prefer': 'return=minimal' },
      body: JSON.stringify(records),
    })
  } catch {}
}

// ── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })
  }

  const authErr = await requireAuth(req)
  if (authErr) return authErr
  const user = req._user

  try {
    const body = await req.json()
    const { categories, count_per_category, driver_type, save } = body

    const cats = categories || ['low_profit', 'medium_profit', 'high_profit', 'heavy_load', 'light_load', 'urgent']
    const countPer = Math.min(count_per_category || 3, 20)
    const dType = driver_type || 'owner_operator'

    const results = []
    for (const cat of cats) {
      const gen = GENERATORS[cat]
      if (!gen) continue
      for (let i = 0; i < countPer; i++) {
        const { category, load } = gen()
        const context = { driver_type: dType, fuelCostPerMile: 0.55, laneAvgRate: 0, brokerUrgency: cat === 'urgent' ? rand(60, 90) : 0 }
        const result = evaluateLoad(load, null, context)
        results.push({
          category,
          load,
          driver_type: dType,
          result,
          load_id: `TEST-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        })
      }
    }

    // Optionally store to database
    if (save !== false) {
      await storeDecisions(user.id, results)
    }

    // Summary stats
    const summary = {
      total: results.length,
      accept: results.filter(r => r.result.decision === 'accept').length,
      reject: results.filter(r => r.result.decision === 'reject').length,
      negotiate: results.filter(r => r.result.decision === 'negotiate').length,
      auto_book: results.filter(r => r.result.decision === 'auto_book').length,
      avgProfit: Math.round(results.reduce((s, r) => s + (r.result.metrics.estProfit || 0), 0) / results.length),
      avgConfidence: Math.round(results.reduce((s, r) => s + (r.result.confidence || 0), 0) / results.length),
    }

    return Response.json({ results, summary, saved: save !== false }, { headers: corsHeaders(req) })
  } catch (err) {
    return Response.json({ error: err.message || 'Test failed' }, { status: 500, headers: corsHeaders(req) })
  }
}
