// ═══════════════════════════════════════════════════════════════════════════════
// Q ORCHESTRATOR — End-to-end dispatch workflow
// POST /api/q-orchestrator
//
// Takes a load from entry to completion:
// 1. Normalize load → 2. Evaluate → 3. Match truck → 4. Contact driver
// → 5. Negotiate broker → 6. Book → 7. Track → 8. Invoice
//
// Every step either completes, retries, or fails with a logged reason.
// ═══════════════════════════════════════════════════════════════════════════════

import { handleCors, corsHeaders, requireAuth } from './_lib/auth.js'
import {
  sbQuery, sbInsert, sbUpdate,
  logEvent, recordFailure, resolveFailure,
  getAvailableTrucks, updateTruckStatus,
  logDriverComm, createNegotiation, updateNegotiation,
  getCarrierSettings, explainDecision,
  withRetry, QError,
} from './_lib/q-engine.js'
import { processLoadOutcome } from './_lib/q-learning.js'

export const config = { runtime: 'edge' }

export default async function handler(req) {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  if (req.method !== 'POST') return json({ error: 'POST required' }, 405)

  const authErr = await requireAuth(req)
  if (authErr) return authErr
  const user = req._user

  try {
    const body = await req.json()
    const action = body.action || 'process_load'

    switch (action) {
      case 'process_load':
        return await processLoad(user, body)
      case 'advance_status':
        return await advanceStatus(user, body)
      case 'retry_failures':
        return await retryFailures(user)
      case 'ops_dashboard':
        return await opsDashboard(user)
      default:
        return json({ error: `Unknown action: ${action}` }, 400)
    }
  } catch (err) {
    console.error('[q-orchestrator] Error:', err.message)
    return json({ error: err.message }, 500)
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
// PROCESS LOAD — Full dispatch pipeline
// ═══════════════════════════════════════════════════════════════════════════════
async function processLoad(user, body) {
  const { load } = body
  if (!load) return json({ error: 'load object required' }, 400)

  const settings = await getCarrierSettings(user.id)
  const loadId = load.loadId || load.load_number || load.id || `Q-${Date.now()}`
  const timeline = []
  const log = (step, detail) => timeline.push({ step, detail, at: new Date().toISOString() })

  try {
    // ── Step 1: Normalize load ────────────────────────────────────────────
    log('normalize', 'Normalizing load data')
    const normalized = normalizeLoad(load)
    await logEvent(user.id, loadId, 'load_received', {
      actor: 'system',
      details: { origin: normalized.origin, dest: normalized.dest, gross: normalized.gross },
      notes: `Load received: ${normalized.origin} → ${normalized.dest} $${normalized.gross}`,
    })

    // ── Step 2: Evaluate with decision engine ─────────────────────────────
    log('evaluate', 'Running decision engine with learned intelligence')
    const evaluation = await evaluateLoadWithIntel(normalized, settings, user.id)
    const explanation = explainDecision(evaluation.decision, evaluation.metrics, settings)

    // Store decision
    const decisionRows = await withRetry(
      async () => sbInsert('dispatch_decisions', {
        owner_id: user.id,
        load_id: loadId,
        decision: evaluation.decision,
        confidence: evaluation.confidence,
        reasons: explanation.reasons,
        metrics: evaluation.metrics,
        negotiation: evaluation.negotiation || null,
        load_data: normalized,
        compliance_status: 'unchecked',
      }),
      { ownerId: user.id, loadId, failureType: 'api_failure', description: 'Failed to store dispatch decision' },
      { maxRetries: 2, backoffMs: 1000 }
    )
    const decision = decisionRows?.[0]

    await logEvent(user.id, loadId, 'decision_made', {
      actor: 'ai',
      newValue: evaluation.decision,
      details: { confidence: evaluation.confidence, explanation: explanation.summary },
      notes: explanation.summary,
    })
    log('decision', { decision: evaluation.decision, confidence: evaluation.confidence, summary: explanation.summary })

    // ── Step 3: Act on decision ───────────────────────────────────────────

    if (evaluation.decision === 'reject') {
      log('rejected', explanation.summary)
      return json({
        ok: true,
        loadId,
        decision: 'reject',
        explanation,
        timeline,
      })
    }

    if (evaluation.decision === 'negotiate') {
      // Create negotiation session
      const session = await createNegotiation(user.id, {
        loadId,
        decisionId: decision?.id,
        brokerName: normalized.broker,
        initialOffer: normalized.gross,
        targetRate: evaluation.negotiation?.targetRate,
        minAcceptRate: evaluation.negotiation?.minAcceptRate,
        lane: `${normalized.origin} → ${normalized.dest}`,
        miles: normalized.miles,
        equipmentType: normalized.equipment,
        pickupDate: normalized.pickupDate,
        maxRounds: settings.maxNegotiationRounds,
      })

      await logEvent(user.id, loadId, 'negotiation_started', {
        actor: 'ai',
        details: {
          initialOffer: normalized.gross,
          targetRate: evaluation.negotiation?.targetRate,
          minAcceptRate: evaluation.negotiation?.minAcceptRate,
        },
        notes: `Negotiation started — target: $${evaluation.negotiation?.targetRate}, min: $${evaluation.negotiation?.minAcceptRate}`,
      })

      log('negotiation_started', {
        sessionId: session?.id,
        target: evaluation.negotiation?.targetRate,
        min: evaluation.negotiation?.minAcceptRate,
      })

      return json({
        ok: true,
        loadId,
        decision: 'negotiate',
        negotiationId: session?.id,
        explanation,
        negotiation: evaluation.negotiation,
        timeline,
      })
    }

    // Decision is 'accept' or 'auto_book'
    // ── Step 4: Find best truck/driver ────────────────────────────────────
    log('match_truck', 'Finding best available truck')
    const available = await getAvailableTrucks(user.id)

    if (!available?.length) {
      log('no_trucks', 'No trucks available')
      await recordFailure(user.id, 'truck_unavailable', 'No trucks available for dispatch', {
        loadId, decisionId: decision?.id, severity: 'high',
        fallbackAction: 'hold_for_availability',
      })
      await logEvent(user.id, loadId, 'system_error', {
        actor: 'system',
        notes: 'No trucks available — load held for next availability',
      })
      return json({
        ok: true,
        loadId,
        decision: evaluation.decision,
        status: 'held',
        reason: 'No trucks available',
        explanation,
        timeline,
      })
    }

    // Score trucks: prefer matching equipment, close location, driver preference
    const scoredTrucks = available.map(t => {
      let score = 50
      if (t.trailer_type && normalized.equipment &&
          t.trailer_type.toLowerCase() === normalized.equipment.toLowerCase()) score += 30
      if (t.preferred_max_weight >= (normalized.weight || 0)) score += 10
      if (t.hos_drive_remaining && t.hos_drive_remaining >= (settings.hosMinHours || 6)) score += 10
      return { ...t, matchScore: score }
    }).sort((a, b) => b.matchScore - a.matchScore)

    const bestTruck = scoredTrucks[0]
    log('truck_matched', { vehicleId: bestTruck.vehicle_id, driverId: bestTruck.driver_id, score: bestTruck.matchScore })

    // ── Step 5: Contact driver ────────────────────────────────────────────
    if (bestTruck.driver_id) {
      const drivers = await sbQuery('drivers', `id=eq.${bestTruck.driver_id}`)
      const driver = drivers?.[0]

      if (driver?.auto_accept_loads) {
        // Auto-accept — skip driver confirmation
        log('driver_auto_accept', `${driver.name} has auto-accept enabled`)
      } else if (driver) {
        // Send load offer and wait
        await updateTruckStatus(user.id, bestTruck.vehicle_id, 'WAITING_DRIVER_RESPONSE', {
          statusReason: `Load offer pending: ${normalized.origin} → ${normalized.dest}`,
          currentLoadId: loadId,
        })

        log('driver_contacted', `Offer sent to ${driver.name}`)
        // Note: actual SMS sending would be done via driver-dispatch.js
        // This returns early — driver response triggers continuation
        return json({
          ok: true,
          loadId,
          decision: evaluation.decision,
          status: 'waiting_driver',
          truckId: bestTruck.vehicle_id,
          driverId: bestTruck.driver_id,
          driverName: driver.name,
          explanation,
          timeline,
          nextAction: 'Call POST /api/driver-dispatch with action=offer_load',
        })
      }
    }

    // ── Step 6: Book load ─────────────────────────────────────────────────
    log('booking', 'Creating load record')
    const bookResult = await bookLoad(user, normalized, loadId, bestTruck, decision, settings)
    log('booked', bookResult)

    return json({
      ok: true,
      loadId,
      decision: evaluation.decision,
      status: 'booked',
      explanation,
      booking: bookResult,
      timeline,
    })

  } catch (err) {
    console.error('[q-orchestrator] processLoad error:', err.message)
    await logEvent(user.id, loadId, 'system_error', {
      actor: 'system',
      notes: `Orchestrator failed: ${err.message}`,
    }).catch(() => {})

    return json({
      ok: false,
      loadId,
      error: err.message,
      timeline,
    }, 500)
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
// ADVANCE STATUS — Move a load to the next lifecycle stage
// ═══════════════════════════════════════════════════════════════════════════════
async function advanceStatus(user, body) {
  const { loadId, newStatus, notes } = body
  if (!loadId || !newStatus) return json({ error: 'loadId and newStatus required' }, 400)

  const statusFlow = {
    'Rate Con Received': 'Assigned to Driver',
    'Assigned to Driver': 'En Route to Pickup',
    'En Route to Pickup': 'At Pickup',
    'At Pickup': 'Loaded',
    'Loaded': 'In Transit',
    'In Transit': 'Delivered',
    'Delivered': 'Invoiced',
    'Invoiced': 'Paid',
  }

  // Get current load
  const loads = await sbQuery('loads', `owner_id=eq.${user.id}&load_number=eq.${loadId}`)
  const load = loads?.[0]
  if (!load) return json({ error: 'Load not found' }, 404)

  const oldStatus = load.status

  // Update load
  const updates = { status: newStatus }
  if (newStatus === 'Delivered') updates.delivered_at = new Date().toISOString()
  if (newStatus === 'Invoiced') updates.invoiced_at = new Date().toISOString()
  if (newStatus === 'Paid') updates.paid_at = new Date().toISOString()

  await sbUpdate('loads', `owner_id=eq.${user.id}&load_number=eq.${loadId}`, updates)

  // Log event
  const eventType = newStatus === 'Delivered' ? 'delivered' :
                     newStatus === 'Invoiced' ? 'invoice_created' :
                     newStatus === 'Paid' ? 'payment_received' : 'status_change'
  await logEvent(user.id, loadId, eventType, {
    actor: 'system',
    oldValue: oldStatus,
    newValue: newStatus,
    notes: notes || `Status advanced: ${oldStatus} → ${newStatus}`,
  })

  // Update truck status based on load status
  if (load.driver) {
    const drivers = await sbQuery('drivers', `owner_id=eq.${user.id}&name=eq.${load.driver}`)
    if (drivers?.[0]) {
      const trucks = await sbQuery('truck_status', `owner_id=eq.${user.id}&driver_id=eq.${drivers[0].id}`)
      if (trucks?.[0]) {
        const truckStatusMap = {
          'En Route to Pickup': 'IN_TRANSIT_TO_PICKUP',
          'At Pickup': 'AT_PICKUP',
          'Loaded': 'LOADED',
          'In Transit': 'IN_TRANSIT',
          'Delivered': 'AT_DELIVERY',
          'Invoiced': 'EMPTY',
          'Paid': 'EMPTY',
        }
        const newTruckStatus = truckStatusMap[newStatus]
        if (newTruckStatus) {
          await updateTruckStatus(user.id, trucks[0].vehicle_id, newTruckStatus, {
            statusReason: `Load ${loadId}: ${newStatus}`,
            currentLoadId: newTruckStatus === 'EMPTY' ? null : loadId,
            loadId,
          })
        }
      }
    }
  }

  // Auto-invoice on delivery
  if (newStatus === 'Delivered') {
    const settings = await getCarrierSettings(user.id)
    if (settings.autoInvoiceOnDelivery) {
      await logEvent(user.id, loadId, 'invoice_created', {
        actor: 'ai',
        notes: 'Auto-invoice triggered on delivery',
      })
    }

    // ── Q Learning: Record outcome when load is delivered ──
    await recordOutcomeFromLoad(user.id, load, settings).catch(err =>
      console.error('[q-orchestrator] Outcome recording failed (non-blocking):', err.message)
    )
  }

  // Also record outcome on Paid if not already recorded on Delivered
  if (newStatus === 'Paid') {
    const settings = await getCarrierSettings(user.id)
    await recordOutcomeFromLoad(user.id, load, settings).catch(err =>
      console.error('[q-orchestrator] Outcome recording on Paid failed (non-blocking):', err.message)
    )
  }

  return json({ ok: true, loadId, oldStatus, newStatus })
}


// ═══════════════════════════════════════════════════════════════════════════════
// RETRY FAILURES — Process unresolved failures
// ═══════════════════════════════════════════════════════════════════════════════
async function retryFailures(user) {
  const failures = await sbQuery(
    'dispatch_failures',
    `owner_id=eq.${user.id}&resolved=eq.false&order=created_at.asc&limit=10`
  )

  if (!failures?.length) return json({ ok: true, message: 'No pending failures' })

  const results = []
  for (const f of failures) {
    // Check if retry limit reached
    if (f.retry_count >= f.max_retries) {
      await resolveFailure(f.id, 'auto_timeout', `Max retries (${f.max_retries}) reached — auto-resolved`)
      results.push({ id: f.id, type: f.failure_type, action: 'auto_resolved_max_retries' })
      continue
    }

    // Check if retry_after has passed
    if (f.retry_after && new Date(f.retry_after) > new Date()) {
      results.push({ id: f.id, type: f.failure_type, action: 'waiting_retry_window' })
      continue
    }

    // Attempt retry based on failure type
    let retryAction = 'no_retry_handler'
    if (f.failure_type === 'sms_failed' && f.fallback_action === 'retry_in_10_min') {
      retryAction = 'retry_sms'
      // Would re-trigger the SMS send here
    } else if (f.failure_type === 'driver_no_response' && f.fallback_action === 'try_next_driver') {
      retryAction = 'escalated_to_next_driver'
    } else if (f.failure_type === 'api_failure') {
      retryAction = 'retry_api_call'
    }

    // Increment retry counter
    await sbUpdate('dispatch_failures', `id=eq.${f.id}`, {
      retry_count: (f.retry_count || 0) + 1,
      retry_after: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    })

    results.push({ id: f.id, type: f.failure_type, action: retryAction, retryCount: (f.retry_count || 0) + 1 })
  }

  return json({ ok: true, processed: results.length, results })
}


// ═══════════════════════════════════════════════════════════════════════════════
// OPS DASHBOARD — Backend data for Q operations dashboard
// ═══════════════════════════════════════════════════════════════════════════════
async function opsDashboard(user) {
  const today = new Date().toISOString().split('T')[0]

  const [fleet, decisions, negotiations, failures, pendingComms] = await Promise.all([
    sbQuery('truck_status', `owner_id=eq.${user.id}`),
    sbQuery('dispatch_decisions', `owner_id=eq.${user.id}&created_at=gte.${today}T00:00:00Z&order=created_at.desc`),
    sbQuery('negotiation_sessions', `owner_id=eq.${user.id}&status=not.in.(ACCEPTED,LOST,NO_RESPONSE,EXPIRED)&order=created_at.desc`),
    sbQuery('dispatch_failures', `owner_id=eq.${user.id}&resolved=eq.false&order=created_at.desc&limit=20`),
    sbQuery('driver_comms', `owner_id=eq.${user.id}&requires_response=eq.true&responded_at=is.null&direction=eq.outbound&order=created_at.desc`),
  ])

  const todayDecisions = decisions || []
  const accepted = todayDecisions.filter(d => d.decision === 'accept' || d.decision === 'auto_book')
  const rejected = todayDecisions.filter(d => d.decision === 'reject')
  const negotiating = todayDecisions.filter(d => d.decision === 'negotiate')

  const fleetArr = fleet || []
  const availableTrucks = fleetArr.filter(t => t.status === 'READY_FOR_LOAD' || t.status === 'EMPTY')
  const waitingDriver = fleetArr.filter(t => t.status === 'WAITING_DRIVER_RESPONSE')
  const inTransit = fleetArr.filter(t => ['IN_TRANSIT_TO_PICKUP', 'IN_TRANSIT', 'LOADED', 'AT_PICKUP', 'AT_DELIVERY'].includes(t.status))

  const highProfitWins = accepted.filter(d => {
    const metrics = d.metrics || {}
    return (metrics.totalProfit || 0) > 1500
  })

  const needsReview = todayDecisions.filter(d => (d.confidence || 0) < 60)

  return json({
    ok: true,
    dashboard: {
      fleet: {
        total: fleetArr.length,
        available: availableTrucks.length,
        inTransit: inTransit.length,
        waitingDriver: waitingDriver.length,
        unavailable: fleetArr.filter(t => t.status === 'UNAVAILABLE' || t.status === 'ISSUE_REPORTED').length,
      },
      today: {
        totalEvaluated: todayDecisions.length,
        accepted: accepted.length,
        rejected: rejected.length,
        negotiating: negotiating.length,
        highProfitWins: highProfitWins.length,
        needsHumanReview: needsReview.length,
      },
      activeNegotiations: (negotiations || []).length,
      unresolvedFailures: (failures || []).length,
      pendingDriverResponses: (pendingComms || []).length,
      alerts: (failures || []).filter(f => f.severity === 'critical' || f.severity === 'high'),
    },
  })
}


// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function normalizeLoad(raw) {
  return {
    origin: raw.origin || raw.pickup_city || '',
    dest: raw.dest || raw.destination || raw.delivery_city || '',
    originState: raw.origin_state || extractState(raw.origin),
    destState: raw.dest_state || extractState(raw.dest),
    gross: parseFloat(raw.gross || raw.rate || raw.total_rate || 0),
    miles: parseInt(raw.miles || raw.loaded_miles || raw.distance || 0),
    deadheadMiles: parseInt(raw.deadhead || raw.deadhead_miles || 0),
    weight: parseInt(raw.weight || 0),
    equipment: raw.equipment || raw.equipment_type || raw.trailer_type || 'Dry Van',
    broker: raw.broker || raw.broker_name || '',
    brokerPhone: raw.broker_phone || '',
    brokerEmail: raw.broker_email || '',
    pickupDate: raw.pickup_date || raw.pickupDate || null,
    deliveryDate: raw.delivery_date || raw.deliveryDate || null,
    holdDays: parseInt(raw.hold_days || 1),
    notes: raw.notes || '',
    source: raw.source || 'manual',
  }
}

function extractState(location) {
  if (!location) return ''
  const parts = location.split(',').map(s => s.trim())
  const last = parts[parts.length - 1] || ''
  const stateMatch = last.match(/([A-Z]{2})/)
  return stateMatch ? stateMatch[1] : ''
}

async function evaluateLoadWithIntel(load, settings, ownerId) {
  // Fetch learned lane and broker data (non-blocking — falls back to static logic)
  let laneIntel = null
  let brokerIntel = null
  try {
    const lane = `${load.origin} → ${load.dest}`
    const [lanes, brokers] = await Promise.all([
      sbQuery('lane_performance', `owner_id=eq.${ownerId}&lane=eq.${encodeURIComponent(lane)}&limit=1`).catch(() => []),
      load.broker ? sbQuery('broker_performance', `owner_id=eq.${ownerId}&broker_name=eq.${encodeURIComponent(load.broker)}&limit=1`).catch(() => []) : Promise.resolve([]),
    ])
    laneIntel = lanes?.[0] || null
    brokerIntel = brokers?.[0] || null
  } catch { /* proceed without intel */ }

  return evaluateLoad(load, settings, laneIntel, brokerIntel)
}

function evaluateLoad(load, settings, laneIntel, brokerIntel) {
  const rpm = load.miles > 0 ? load.gross / load.miles : 0
  const fuelCost = (load.miles + load.deadheadMiles) * settings.fuelCostPerMile
  const totalProfit = load.gross - fuelCost
  const profitPerDay = load.holdDays > 0 ? totalProfit / load.holdDays : totalProfit
  const profitPerMile = load.miles > 0 ? totalProfit / load.miles : 0
  const deadheadPct = load.miles > 0 ? (load.deadheadMiles / load.miles) * 100 : 0

  // Dead zone check — use learned data if available, fall back to static list
  const DEAD_ZONES = ['laredo', 'el paso', 'mcallen', 'brownsville', 'nogales', 'sweetwater', 'lubbock', 'amarillo', 'midland', 'odessa']
  let isDeadZone = DEAD_ZONES.some(z => (load.dest || '').toLowerCase().includes(z))

  // Hot market check — use learned data if available, fall back to static list
  const HOT_MARKETS = ['dallas', 'houston', 'atlanta', 'chicago', 'los angeles', 'memphis', 'indianapolis', 'columbus', 'nashville', 'charlotte']
  let isHotMarket = HOT_MARKETS.some(z => (load.dest || '').toLowerCase().includes(z))

  // Override with learned lane intelligence (if we have enough data)
  let laneConfidence = null
  if (laneIntel && laneIntel.total_loads >= 3) {
    laneConfidence = laneIntel.confidence_score
    if (laneIntel.quality === 'dead_zone') isDeadZone = true
    if (laneIntel.quality === 'hot_market') isHotMarket = true
    // If lane was learned as neutral but static says dead/hot, lane intel wins with enough data
    if (laneIntel.total_loads >= 5 && laneIntel.quality === 'neutral') {
      isDeadZone = false
      isHotMarket = false
    }
  }

  // Broker reliability check
  let brokerReliability = 'unknown'
  let brokerPenalty = 0
  if (brokerIntel && brokerIntel.total_loads >= 2) {
    brokerReliability = brokerIntel.reliability_tier
    // Penalize unreliable brokers
    if (brokerIntel.reliability_tier === 'poor') brokerPenalty = 10
    if (brokerIntel.reliability_tier === 'blacklist') brokerPenalty = 25
    // Reward reliable brokers
    if (brokerIntel.reliability_tier === 'excellent') brokerPenalty = -5
  }

  // Reload probability
  const RELOAD_HUBS = { dallas: 95, houston: 93, atlanta: 92, chicago: 94, memphis: 88, indianapolis: 85, columbus: 82, nashville: 80, charlotte: 78 }
  const destLower = (load.dest || '').toLowerCase()
  const reloadProbability = Object.entries(RELOAD_HUBS).find(([city]) => destLower.includes(city))?.[1] || (isDeadZone ? 20 : 50)

  // Trap load detection (high gross masks poor per-day)
  const isTrapLoad = load.gross > 2000 && load.holdDays >= 3 && profitPerDay < settings.minProfitPerDay

  // Light load bonus
  const isLightLoad = load.weight > 0 && load.weight <= settings.lightLoadThreshold

  const metrics = {
    rpm: Math.round(rpm * 100) / 100,
    fuelCost: Math.round(fuelCost),
    totalProfit: Math.round(totalProfit),
    profitPerDay: Math.round(profitPerDay),
    profitPerMile: Math.round(profitPerMile * 100) / 100,
    deadheadMiles: load.deadheadMiles,
    deadheadPct: Math.round(deadheadPct),
    loadedMiles: load.miles,
    weight: load.weight,
    holdDays: load.holdDays,
    isDeadZone,
    isHotMarket,
    reloadProbability,
    isTrapLoad,
    isLightLoad,
    laneConfidence,
    brokerReliability,
    brokerPenalty,
  }

  // ── Decision logic ──────────────────────────────────────────────────────
  let decision = 'reject'
  let confidence = 0

  // High-profit override — even if some rules fail
  if (settings.highProfitOverride && totalProfit > settings.autoAcceptAbove * 1.5 && rpm > settings.minRpm) {
    decision = 'auto_book'
    confidence = 90
  }
  // Standard accept
  else if (totalProfit >= settings.autoAcceptAbove && rpm >= settings.minRpm && profitPerDay >= settings.minProfitPerDay) {
    decision = settings.autoBookEnabled ? 'auto_book' : 'accept'
    confidence = Math.min(95, 60 + Math.round((totalProfit / settings.autoAcceptAbove) * 20))
    if (isHotMarket) confidence = Math.min(95, confidence + 5)
    if (isLightLoad) confidence = Math.min(95, confidence + 3)
    // Boost from learned lane confidence
    if (laneConfidence && laneConfidence >= 75) confidence = Math.min(95, confidence + 3)
  }
  // Negotiate zone
  else if (totalProfit >= settings.autoRejectBelow && rpm >= settings.minRpm * 0.8) {
    decision = 'negotiate'
    confidence = 50 + Math.round((totalProfit / settings.autoAcceptAbove) * 25)
  }
  // Reject
  else {
    decision = 'reject'
    confidence = 85
  }

  // Override: trap loads always get rejected or negotiated
  if (isTrapLoad && decision === 'auto_book') {
    decision = 'negotiate'
    confidence = 55
  }

  // Override: dead zone penalty
  if (isDeadZone && decision === 'auto_book' && totalProfit < settings.autoAcceptAbove * 1.3) {
    decision = 'accept' // downgrade from auto_book, needs human confirm
    confidence = Math.max(40, confidence - 15)
  }

  // Override: excessive deadhead
  if (deadheadPct > settings.maxDeadheadPct && decision !== 'reject') {
    if (totalProfit < settings.autoAcceptAbove) {
      decision = 'negotiate'
      confidence = Math.max(35, confidence - 10)
    }
  }

  // Override: broker reliability penalty (learned)
  if (brokerPenalty > 0 && decision !== 'reject') {
    confidence = Math.max(30, confidence - brokerPenalty)
    // Blacklisted brokers force downgrade
    if (brokerReliability === 'blacklist' && decision === 'auto_book') {
      decision = 'negotiate'
    }
  }

  // Negotiation details
  let negotiation = null
  if (decision === 'negotiate') {
    const markupPct = settings.negotiationMarkupPct / 100
    negotiation = {
      targetRate: Math.round(load.gross * (1 + markupPct)),
      minAcceptRate: Math.round(load.gross * 1.02), // at least 2% above current
      counterScript: `We can do this load at $${Math.round(load.gross * (1 + markupPct))}. The rate needs to reflect ${load.miles}mi and current market conditions.`,
      maxRounds: settings.maxNegotiationRounds,
    }
  }

  return { decision, confidence, metrics, negotiation }
}


async function bookLoad(user, load, loadId, truck, decision, settings) {
  // Create load record
  const loadData = {
    owner_id: user.id,
    load_number: loadId,
    origin: load.origin,
    dest: load.dest,
    gross: load.gross,
    miles: load.miles,
    equipment_type: load.equipment,
    broker: load.broker,
    weight: load.weight || null,
    pickup_date: load.pickupDate || null,
    delivery_date: load.deliveryDate || null,
    status: truck.driver_id ? 'Assigned to Driver' : 'Rate Con Received',
    dispatch_method: 'auto_booked',
    dispatch_decision_id: decision?.id || null,
    dispatched_at: new Date().toISOString(),
  }

  // Get driver name if assigned
  if (truck.driver_id) {
    const drivers = await sbQuery('drivers', `id=eq.${truck.driver_id}`)
    if (drivers?.[0]) {
      loadData.driver = drivers[0].name || drivers[0].full_name
    }
  }

  await sbInsert('loads', loadData)

  // Update truck status
  await updateTruckStatus(user.id, truck.vehicle_id, 'BOOKED', {
    statusReason: `Auto-booked: ${load.origin} → ${load.dest}`,
    currentLoadId: loadId,
    loadId,
  })

  // Update decision
  if (decision?.id) {
    await sbUpdate('dispatch_decisions', `id=eq.${decision.id}`, {
      auto_booked: true,
      driver_id: truck.driver_id,
    }).catch(() => {})
  }

  await logEvent(user.id, loadId, 'load_booked', {
    actor: 'ai',
    notes: `Auto-booked: ${load.origin} → ${load.dest} $${load.gross}`,
    details: { vehicleId: truck.vehicle_id, driverId: truck.driver_id },
  })

  return {
    loadId,
    status: loadData.status,
    vehicleId: truck.vehicle_id,
    driverId: truck.driver_id,
    driver: loadData.driver,
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
// Q LEARNING INTEGRATION — Auto-record outcome from load data
// ═══════════════════════════════════════════════════════════════════════════════
async function recordOutcomeFromLoad(ownerId, load, settings) {
  const loadId = load.load_number || load.id

  // Check if outcome already recorded for this load
  const existing = await sbQuery('load_outcomes', `owner_id=eq.${ownerId}&load_id=eq.${loadId}&limit=1`).catch(() => [])
  if (existing?.length > 0) return // already recorded

  // Get the dispatch decision if one exists
  let decision = null
  if (load.dispatch_decision_id) {
    const decisions = await sbQuery('dispatch_decisions', `id=eq.${load.dispatch_decision_id}`).catch(() => [])
    decision = decisions?.[0]
  } else {
    // Try to find by load_id
    const decisions = await sbQuery('dispatch_decisions', `owner_id=eq.${ownerId}&load_id=eq.${loadId}&order=created_at.desc&limit=1`).catch(() => [])
    decision = decisions?.[0]
  }

  // Calculate actual metrics from load data
  const gross = parseFloat(load.gross || load.total_rate || load.rate || 0)
  const miles = parseInt(load.miles || load.loaded_miles || 0)
  const deadhead = parseInt(load.deadhead_miles || load.deadhead || 0)
  const fuelCost = (miles + deadhead) * (settings.fuelCostPerMile || 0.55)
  const actualProfit = gross - fuelCost
  const actualRpm = miles > 0 ? gross / miles : 0

  // Calculate days held
  const pickupDate = load.pickup_date || load.picked_up_at || load.dispatched_at
  const deliveryDate = load.delivered_at || new Date().toISOString()
  let daysHeld = 1
  if (pickupDate && deliveryDate) {
    daysHeld = Math.max(1, Math.ceil((new Date(deliveryDate) - new Date(pickupDate)) / 86400000))
  }

  // Extract expected values from decision if available
  const metrics = decision?.metrics || {}
  const expectedProfit = metrics.totalProfit || null
  const expectedRpm = metrics.rpm || null
  const expectedFuelCost = metrics.fuelCost || null
  const expectedDeadhead = metrics.deadheadMiles || null

  // Determine lane quality from decision metrics
  let expectedLaneQuality = null
  if (metrics.isHotMarket) expectedLaneQuality = 'hot_market'
  else if (metrics.isDeadZone) expectedLaneQuality = 'dead_zone'
  else expectedLaneQuality = 'neutral'

  // Get negotiation data if exists
  let negoData = {}
  if (load.negotiation_session_id) {
    const sessions = await sbQuery('negotiation_sessions', `id=eq.${load.negotiation_session_id}`).catch(() => [])
    const session = sessions?.[0]
    if (session) {
      negoData = {
        negotiationAttempted: true,
        negotiationInitial: session.initial_offer,
        negotiationTarget: session.target_rate,
        negotiationFinal: session.final_rate,
        negotiationRounds: session.counter_rounds,
        negotiationSuccess: session.status === 'ACCEPTED',
      }
    }
  }

  const origin = load.origin || load.pickup_city || ''
  const dest = load.dest || load.destination || load.delivery_city || ''

  await processLoadOutcome(ownerId, {
    loadId,
    origin, destination: dest,
    originState: extractState(origin), destState: extractState(dest),
    lane: `${origin} → ${dest}`,
    miles, equipment: load.equipment_type || load.equipment || 'Dry Van',
    broker: load.broker || load.broker_name || '',
    driverId: load.driver_id || null,
    vehicleId: load.vehicle_id || null,
    actualProfit: Math.round(actualProfit),
    actualRpm: Math.round(actualRpm * 100) / 100,
    actualFuelCost: Math.round(fuelCost),
    actualDeadheadMiles: deadhead,
    actualDaysHeld: daysHeld,
    brokerPaidOnTime: load.paid_at ? true : null, // will be null until Paid status
    brokerChangedRate: false, // can be updated later
    detentionHours: parseFloat(load.detention_hours || 0),
    completedAt: deliveryDate,
    ...negoData,
  }, {
    decisionType: decision?.decision || (load.dispatch_method === 'auto_booked' ? 'auto_book' : 'accept'),
    confidence: decision?.confidence || 50,
    expectedProfit, expectedRpm, expectedFuelCost,
    expectedDeadheadMiles: expectedDeadhead,
    expectedLaneQuality,
    expectedBrokerReliability: null, // will improve as broker_performance fills
    decisionId: decision?.id || null,
    decidedAt: decision?.created_at || null,
    ...negoData,
  })
}


function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
