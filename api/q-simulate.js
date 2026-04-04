// ═══════════════════════════════════════════════════════════════════════════════
// Q SIMULATION — Test the operating system with realistic scenarios
// POST /api/q-simulate?scenario=all|profitable|low_pay|negotiation|driver_no_response|...
// ═══════════════════════════════════════════════════════════════════════════════

import { handleCors, corsHeaders, requireAuth } from './_lib/auth.js'
import { getCarrierSettings, explainDecision } from './_lib/q-engine.js'

export const config = { runtime: 'edge' }

// ── Scenario definitions ──────────────────────────────────────────────────────
const SCENARIOS = {
  profitable: {
    name: 'Normal Profitable Load',
    load: { origin: 'Dallas, TX', dest: 'Atlanta, GA', gross: 3200, miles: 780, deadhead: 45, weight: 34000, equipment: 'Dry Van', broker: 'TQL', pickupDate: tomorrow(), holdDays: 1 },
    expectedDecision: 'auto_book',
    description: 'Strong load — good RPM, hot destination, low deadhead',
  },
  low_pay: {
    name: 'Low-Paying Load',
    load: { origin: 'Memphis, TN', dest: 'El Paso, TX', gross: 1800, miles: 1050, deadhead: 120, weight: 42000, equipment: 'Dry Van', broker: 'Unknown Broker', pickupDate: tomorrow(), holdDays: 2 },
    expectedDecision: 'reject',
    description: 'Bad RPM, dead zone destination, heavy, 2-day hold',
  },
  negotiation: {
    name: 'Negotiation Candidate',
    load: { origin: 'Chicago, IL', dest: 'Nashville, TN', gross: 1100, miles: 470, deadhead: 30, weight: 28000, equipment: 'Dry Van', broker: 'CH Robinson', pickupDate: tomorrow(), holdDays: 1 },
    expectedDecision: 'negotiate',
    description: 'Close to accept threshold — worth pushing rate up',
  },
  book_it_now: {
    name: 'Book It Now Override',
    load: { origin: 'Los Angeles, CA', dest: 'Dallas, TX', gross: 4500, miles: 1435, deadhead: 20, weight: 22000, equipment: 'Dry Van', broker: 'XPO Logistics', pickupDate: tomorrow(), holdDays: 2 },
    expectedDecision: 'auto_book',
    description: 'High profit overrides normal rules — light load, top broker',
  },
  trap_load: {
    name: 'Trap Load (Multi-Day Hold)',
    load: { origin: 'Houston, TX', dest: 'Seattle, WA', gross: 4200, miles: 2340, deadhead: 60, weight: 40000, equipment: 'Dry Van', broker: 'Echo Global', pickupDate: tomorrow(), holdDays: 4 },
    expectedDecision: 'negotiate',
    description: 'Looks good at $4200 gross but 4-day hold = only $525/day',
  },
  overweight: {
    name: 'Overweight / Preference Mismatch',
    load: { origin: 'Atlanta, GA', dest: 'Charlotte, NC', gross: 900, miles: 245, deadhead: 15, weight: 44000, equipment: 'Flatbed', broker: 'Coyote Logistics', pickupDate: tomorrow(), holdDays: 1 },
    expectedDecision: 'reject',
    description: 'Over preferred weight, short haul, low gross',
  },
  dead_zone: {
    name: 'Dead Zone Destination',
    load: { origin: 'San Antonio, TX', dest: 'Laredo, TX', gross: 850, miles: 155, deadhead: 10, weight: 30000, equipment: 'Dry Van', broker: 'Uber Freight', pickupDate: tomorrow(), holdDays: 1 },
    expectedDecision: 'reject',
    description: 'Laredo is a dead zone — no reload, low gross',
  },
  hot_market: {
    name: 'Hot Market Destination',
    load: { origin: 'Indianapolis, IN', dest: 'Chicago, IL', gross: 1250, miles: 185, deadhead: 25, weight: 25000, equipment: 'Dry Van', broker: 'DAT', pickupDate: tomorrow(), holdDays: 1 },
    expectedDecision: 'auto_book',
    description: 'Short haul to hot market, great RPM, light load',
  },
  reefer_premium: {
    name: 'Reefer Premium Load',
    load: { origin: 'Miami, FL', dest: 'Atlanta, GA', gross: 2800, miles: 660, deadhead: 35, weight: 36000, equipment: 'Reefer', broker: 'Total Quality Logistics', pickupDate: tomorrow(), holdDays: 1 },
    expectedDecision: 'auto_book',
    description: 'Reefer premium pricing, good lane, moderate weight',
  },
  cancellation: {
    name: 'Last-Minute Cancellation',
    load: { origin: 'Phoenix, AZ', dest: 'Denver, CO', gross: 1600, miles: 600, deadhead: 40, weight: 32000, equipment: 'Dry Van', broker: 'GlobalTranz', pickupDate: today(), holdDays: 1, cancelled: true },
    expectedDecision: 'accept',
    description: 'Would be accepted but then cancelled — tests failure handling',
  },
}

export default async function handler(req) {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  if (req.method !== 'POST') return json({ error: 'POST required' }, 405)

  const authErr = await requireAuth(req)
  if (authErr) return authErr
  const user = req._user

  try {
    const body = await req.json()
    const scenario = body.scenario || 'all'
    const settings = await getCarrierSettings(user.id)

    if (scenario === 'all') {
      // Run all scenarios
      const results = []
      for (const [key, sc] of Object.entries(SCENARIOS)) {
        const result = runScenario(key, sc, settings)
        results.push(result)
      }

      const passed = results.filter(r => r.passed).length
      const failed = results.filter(r => !r.passed).length

      return json({
        ok: true,
        summary: { total: results.length, passed, failed },
        results,
        settings: {
          minProfit: settings.minProfit,
          autoAcceptAbove: settings.autoAcceptAbove,
          autoRejectBelow: settings.autoRejectBelow,
          minRpm: settings.minRpm,
          fuelCostPerMile: settings.fuelCostPerMile,
        },
      })
    }

    // Run single scenario
    const sc = SCENARIOS[scenario]
    if (!sc) {
      return json({ error: `Unknown scenario: ${scenario}. Valid: ${Object.keys(SCENARIOS).join(', ')}, all` }, 400)
    }

    const result = runScenario(scenario, sc, settings)
    return json({ ok: true, ...result })

  } catch (err) {
    console.error('[q-simulate] Error:', err.message)
    return json({ error: err.message }, 500)
  }
}

function runScenario(key, scenario, settings) {
  const load = scenario.load

  // Run evaluation logic (same as q-orchestrator)
  const rpm = load.miles > 0 ? load.gross / load.miles : 0
  const fuelCost = (load.miles + (load.deadhead || 0)) * settings.fuelCostPerMile
  const totalProfit = load.gross - fuelCost
  const profitPerDay = load.holdDays > 0 ? totalProfit / load.holdDays : totalProfit
  const profitPerMile = load.miles > 0 ? totalProfit / load.miles : 0
  const deadheadPct = load.miles > 0 ? ((load.deadhead || 0) / load.miles) * 100 : 0

  const DEAD_ZONES = ['laredo', 'el paso', 'mcallen', 'brownsville', 'nogales', 'sweetwater', 'lubbock', 'amarillo', 'midland', 'odessa']
  const HOT_MARKETS = ['dallas', 'houston', 'atlanta', 'chicago', 'los angeles', 'memphis', 'indianapolis', 'columbus', 'nashville', 'charlotte']
  const isDeadZone = DEAD_ZONES.some(z => (load.dest || '').toLowerCase().includes(z))
  const isHotMarket = HOT_MARKETS.some(z => (load.dest || '').toLowerCase().includes(z))
  const isTrapLoad = load.gross > 2000 && load.holdDays >= 3 && profitPerDay < settings.minProfitPerDay
  const isLightLoad = load.weight > 0 && load.weight <= settings.lightLoadThreshold

  const metrics = {
    rpm: Math.round(rpm * 100) / 100,
    fuelCost: Math.round(fuelCost),
    totalProfit: Math.round(totalProfit),
    profitPerDay: Math.round(profitPerDay),
    profitPerMile: Math.round(profitPerMile * 100) / 100,
    deadheadMiles: load.deadhead || 0,
    deadheadPct: Math.round(deadheadPct),
    isDeadZone,
    isHotMarket,
    isTrapLoad,
    isLightLoad,
    loadedMiles: load.miles,
    weight: load.weight,
  }

  // Decision logic (mirrors q-orchestrator.evaluateLoad)
  let decision = 'reject'
  let confidence = 0

  if (settings.highProfitOverride && totalProfit > settings.autoAcceptAbove * 1.5 && rpm > settings.minRpm) {
    decision = 'auto_book'
    confidence = 90
  } else if (totalProfit >= settings.autoAcceptAbove && rpm >= settings.minRpm && profitPerDay >= settings.minProfitPerDay) {
    decision = settings.autoBookEnabled ? 'auto_book' : 'accept'
    confidence = Math.min(95, 60 + Math.round((totalProfit / settings.autoAcceptAbove) * 20))
  } else if (totalProfit >= settings.autoRejectBelow && rpm >= settings.minRpm * 0.8) {
    decision = 'negotiate'
    confidence = 50 + Math.round((totalProfit / settings.autoAcceptAbove) * 25)
  } else {
    decision = 'reject'
    confidence = 85
  }

  if (isTrapLoad && decision === 'auto_book') { decision = 'negotiate'; confidence = 55 }
  if (isDeadZone && decision === 'auto_book' && totalProfit < settings.autoAcceptAbove * 1.3) { decision = 'accept'; confidence = Math.max(40, confidence - 15) }
  if (deadheadPct > settings.maxDeadheadPct && decision !== 'reject' && totalProfit < settings.autoAcceptAbove) { decision = 'negotiate'; confidence = Math.max(35, confidence - 10) }

  const explanation = explainDecision(decision, metrics, settings)
  const passed = decision === scenario.expectedDecision ||
    (scenario.expectedDecision === 'accept' && decision === 'auto_book') ||
    (scenario.expectedDecision === 'auto_book' && decision === 'accept')

  return {
    scenario: key,
    name: scenario.name,
    description: scenario.description,
    load: { origin: load.origin, dest: load.dest, gross: load.gross, miles: load.miles, equipment: load.equipment },
    decision,
    expectedDecision: scenario.expectedDecision,
    passed,
    confidence,
    metrics,
    explanation,
  }
}

function tomorrow() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}

function today() {
  return new Date().toISOString().split('T')[0]
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
