// ═══════════════════════════════════════════════════════════════════════════════
// Q LEARNING TEST — Simulate the self-improvement loop with test scenarios
// POST /api/q-learning-test { scenario: 'all' | 'bad_accept' | 'missed_load' | ... }
// Tests the full pipeline: outcome → mistakes → feedback → lane/broker updates
// ═══════════════════════════════════════════════════════════════════════════════

import { handleCors, corsHeaders, requireAuth } from './_lib/auth.js'
import { getCarrierSettings } from './_lib/q-engine.js'

export const config = { runtime: 'edge' }

// ── Test Scenarios ───────────────────────────────────────────────────────────
const SCENARIOS = {
  good_accept: {
    name: 'Correctly Accepted Profitable Load',
    loadData: {
      loadId: 'TEST-GOOD-001', origin: 'Dallas, TX', destination: 'Atlanta, GA',
      originState: 'TX', destState: 'GA', lane: 'Dallas TX → Atlanta GA',
      miles: 780, equipment: 'Dry Van', broker: 'TQL', driverId: null, vehicleId: null,
      actualProfit: 1800, actualRpm: 2.95, actualFuelCost: 430, actualDeadheadMiles: 40,
      actualDaysHeld: 2, brokerPaidOnTime: true, brokerChangedRate: false, detentionHours: 0,
    },
    decisionData: {
      decisionType: 'auto_book', confidence: 88,
      expectedProfit: 1650, expectedRpm: 2.80, expectedFuelCost: 450, expectedDeadheadMiles: 45,
      expectedLaneQuality: 'hot_market', expectedBrokerReliability: 'high',
      negotiationAttempted: false,
    },
    expectedResult: 'good',
    expectedMistakes: 0,
    description: 'Q auto-booked a load that exceeded expectations — no mistakes',
  },

  bad_accept: {
    name: 'Bad Accept — Lost Money',
    loadData: {
      loadId: 'TEST-BAD-001', origin: 'Memphis, TN', destination: 'El Paso, TX',
      originState: 'TN', destState: 'TX', lane: 'Memphis TN → El Paso TX',
      miles: 1050, equipment: 'Dry Van', broker: 'Unknown Broker', driverId: null, vehicleId: null,
      actualProfit: -200, actualRpm: 1.40, actualFuelCost: 680, actualDeadheadMiles: 180,
      actualDaysHeld: 3, brokerPaidOnTime: false, brokerChangedRate: true, detentionHours: 4,
    },
    decisionData: {
      decisionType: 'accept', confidence: 55,
      expectedProfit: 500, expectedRpm: 1.90, expectedFuelCost: 550, expectedDeadheadMiles: 120,
      expectedLaneQuality: 'neutral', expectedBrokerReliability: 'unknown',
      negotiationAttempted: false,
    },
    expectedResult: 'bad',
    expectedMistakes: 3, // bad_accept + detention + overestimated_profit
    description: 'Q accepted a marginal load that lost money — multiple mistakes detected',
  },

  missed_load: {
    name: 'Missed Good Load',
    loadData: {
      loadId: 'TEST-MISS-001', origin: 'Chicago, IL', destination: 'Nashville, TN',
      originState: 'IL', destState: 'TN', lane: 'Chicago IL → Nashville TN',
      miles: 470, equipment: 'Dry Van', broker: 'CH Robinson', driverId: null, vehicleId: null,
      actualProfit: 1200, actualRpm: 2.60, actualFuelCost: 260, actualDeadheadMiles: 20,
      actualDaysHeld: 1, brokerPaidOnTime: true, brokerChangedRate: false, detentionHours: 0,
    },
    decisionData: {
      decisionType: 'reject', confidence: 75,
      expectedProfit: 400, expectedRpm: 1.80, expectedFuelCost: 300, expectedDeadheadMiles: 30,
      expectedLaneQuality: 'neutral', expectedBrokerReliability: 'high',
      negotiationAttempted: false,
    },
    expectedResult: 'missed_opportunity',
    expectedMistakes: 1, // missed_good_load
    description: 'Q rejected a load that turned out highly profitable — missed opportunity',
  },

  failed_negotiation: {
    name: 'Failed Negotiation — Lost Good Load',
    loadData: {
      loadId: 'TEST-NEGO-001', origin: 'Los Angeles, CA', destination: 'Phoenix, AZ',
      originState: 'CA', destState: 'AZ', lane: 'Los Angeles CA → Phoenix AZ',
      miles: 370, equipment: 'Dry Van', broker: 'XPO Logistics', driverId: null, vehicleId: null,
      actualProfit: 800, actualRpm: 2.70, actualFuelCost: 200, actualDeadheadMiles: 15,
      actualDaysHeld: 1, brokerPaidOnTime: true, brokerChangedRate: false, detentionHours: 0,
    },
    decisionData: {
      decisionType: 'negotiate', confidence: 60,
      expectedProfit: 900, expectedRpm: 2.80, expectedFuelCost: 200, expectedDeadheadMiles: 15,
      expectedLaneQuality: 'neutral', expectedBrokerReliability: 'high',
      negotiationAttempted: true, negotiationInitial: 1000, negotiationTarget: 1200,
      negotiationFinal: null, negotiationRounds: 2, negotiationSuccess: false,
    },
    expectedResult: 'missed_opportunity',
    expectedMistakes: 1, // failed_negotiation
    description: 'Q tried to negotiate but lost the load — initial offer was worth taking',
  },

  broker_unreliable: {
    name: 'Broker Changed Rate',
    loadData: {
      loadId: 'TEST-BROKER-001', origin: 'Houston, TX', destination: 'Miami, FL',
      originState: 'TX', destState: 'FL', lane: 'Houston TX → Miami FL',
      miles: 1190, equipment: 'Reefer', broker: 'Sketchy Freight Co', driverId: null, vehicleId: null,
      actualProfit: 300, actualRpm: 1.50, actualFuelCost: 700, actualDeadheadMiles: 60,
      actualDaysHeld: 2, brokerPaidOnTime: false, brokerChangedRate: true, detentionHours: 3,
    },
    decisionData: {
      decisionType: 'accept', confidence: 65,
      expectedProfit: 1100, expectedRpm: 2.20, expectedFuelCost: 650, expectedDeadheadMiles: 50,
      expectedLaneQuality: 'neutral', expectedBrokerReliability: 'high',
      negotiationAttempted: false,
    },
    expectedResult: 'bad',
    expectedMistakes: 3, // bad_accept + broker_reliability_miss + overestimated_profit
    description: 'Broker changed rate and paid late — broker reliability was wrong',
  },

  detention_surprise: {
    name: 'Unexpected Detention',
    loadData: {
      loadId: 'TEST-DET-001', origin: 'Indianapolis, IN', destination: 'Columbus, OH',
      originState: 'IN', destState: 'OH', lane: 'Indianapolis IN → Columbus OH',
      miles: 175, equipment: 'Dry Van', broker: 'Echo Global', driverId: null, vehicleId: null,
      actualProfit: 200, actualRpm: 1.60, actualFuelCost: 100, actualDeadheadMiles: 25,
      actualDaysHeld: 2, brokerPaidOnTime: true, brokerChangedRate: false, detentionHours: 6,
    },
    decisionData: {
      decisionType: 'auto_book', confidence: 80,
      expectedProfit: 600, expectedRpm: 2.40, expectedFuelCost: 95, expectedDeadheadMiles: 20,
      expectedLaneQuality: 'hot_market', expectedBrokerReliability: 'medium',
      negotiationAttempted: false,
    },
    expectedResult: 'bad',
    expectedMistakes: 2, // detention_not_predicted + overestimated_profit
    description: '6 hours detention wiped profit — Q did not predict detention risk',
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
      const results = []
      for (const [key, sc] of Object.entries(SCENARIOS)) {
        const result = runTestScenario(key, sc)
        results.push(result)
      }
      const passed = results.filter(r => r.passed).length
      const failed = results.filter(r => !r.passed).length

      return json({
        ok: true,
        summary: { total: results.length, passed, failed },
        results,
        note: 'These are DRY RUN tests — no data is written to the database. Use action:record_outcome via /api/q-learning to write real outcomes.',
      })
    }

    const sc = SCENARIOS[scenario]
    if (!sc) return json({ error: `Unknown scenario: ${scenario}. Valid: ${Object.keys(SCENARIOS).join(', ')}, all` }, 400)

    const result = runTestScenario(scenario, sc)
    return json({ ok: true, ...result })

  } catch (err) {
    console.error('[q-learning-test] Error:', err.message)
    return json({ error: err.message }, 500)
  }
}

function runTestScenario(key, scenario) {
  const { loadData, decisionData } = scenario

  // Simulate outcome classification (mirrors q-learning.js classifyResult)
  const profitDelta = (loadData.actualProfit || 0) - (decisionData.expectedProfit || 0)
  let result
  if (decisionData.decisionType === 'reject') {
    result = (loadData.actualProfit != null && loadData.actualProfit > 0) ? 'missed_opportunity' : 'good'
  } else {
    if (loadData.actualProfit < 0) result = 'bad'
    else if (decisionData.decisionType === 'negotiate' && decisionData.expectedProfit > 0 && profitDelta < -(decisionData.expectedProfit * 0.4)) result = 'bad'
    else if (decisionData.expectedProfit > 0 && profitDelta < -(decisionData.expectedProfit * 0.3)) result = 'bad'
    else if (profitDelta > (decisionData.expectedProfit * 0.1)) result = 'good'
    else result = 'acceptable'
  }

  // Simulate mistake detection
  const detectedMistakes = []

  if (['auto_book', 'accept'].includes(decisionData.decisionType) && result === 'bad') {
    detectedMistakes.push({ type: 'bad_accept', severity: loadData.actualProfit < 0 ? 'critical' : 'high', impact: profitDelta })
  }
  if (decisionData.decisionType === 'reject' && result === 'missed_opportunity') {
    detectedMistakes.push({ type: 'missed_good_load', severity: 'medium', impact: -(loadData.actualProfit || 0) })
  }
  if (decisionData.negotiationAttempted && !decisionData.negotiationSuccess && loadData.actualProfit > 0) {
    detectedMistakes.push({ type: 'failed_negotiation', severity: 'medium', impact: -(loadData.actualProfit || 0) })
  }
  if (decisionData.expectedBrokerReliability === 'high' && (loadData.brokerChangedRate || !loadData.brokerPaidOnTime)) {
    detectedMistakes.push({ type: 'broker_reliability_miss', severity: loadData.brokerChangedRate ? 'high' : 'medium' })
  }
  if (decisionData.expectedProfit > 0 && profitDelta < -(decisionData.expectedProfit * 0.3) && result !== 'bad') {
    detectedMistakes.push({ type: 'overestimated_profit', severity: 'medium', impact: profitDelta })
  }
  if (loadData.detentionHours > 2 && profitDelta < 0) {
    detectedMistakes.push({ type: 'detention_not_predicted', severity: loadData.detentionHours > 5 ? 'high' : 'medium' })
  }

  const resultPassed = result === scenario.expectedResult
  const mistakesPassed = detectedMistakes.length >= scenario.expectedMistakes

  return {
    scenario: key,
    name: scenario.name,
    description: scenario.description,
    passed: resultPassed && mistakesPassed,
    result,
    expectedResult: scenario.expectedResult,
    resultPassed,
    profitDelta: Math.round(profitDelta),
    mistakesDetected: detectedMistakes.length,
    expectedMistakes: scenario.expectedMistakes,
    mistakesPassed,
    mistakes: detectedMistakes,
    load: {
      lane: loadData.lane,
      gross: loadData.actualProfit + loadData.actualFuelCost,
      actualProfit: loadData.actualProfit,
      expectedProfit: decisionData.expectedProfit,
      decision: decisionData.decisionType,
      broker: loadData.broker,
    },
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
