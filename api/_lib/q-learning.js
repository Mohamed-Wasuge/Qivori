// ═══════════════════════════════════════════════════════════════════════════════
// Q LEARNING ENGINE — Self-improvement loop for the dispatch operating system
//
// Phase 1: Outcome tracking (expected vs actual for every load)
// Phase 2: Mistake detection (flag bad accepts, missed loads, etc.)
// Phase 3: Feedback engine (bounded parameter adjustments with guardrails)
// Phase 4: Historical performance (lane, broker, equipment, seasonal)
// Phase 5: Daily summary (accuracy, mistakes, adjustments, health score)
//
// SAFETY: All adjustments are bounded by guardrails. No parameter can change
// more than q_max_adjustment_pct per cycle. Min sample size enforced.
// Every change is audited in q_adjustments with full evidence.
// ═══════════════════════════════════════════════════════════════════════════════

import { sbInsert, sbUpsert, sbUpdate, sbQuery, QError, logEvent, getCarrierSettings } from './q-engine.js'

// ═══════════════════════════════════════════════════════════════════════════════
// GUARDRAILS — Hard limits that cannot be overridden
// ═══════════════════════════════════════════════════════════════════════════════
const GUARDRAILS = {
  // Absolute bounds for carrier settings (Q can never push past these)
  minRpm:            { min: 0.50,  max: 5.00 },
  autoAcceptAbove:   { min: 500,   max: 10000 },
  autoRejectBelow:   { min: 200,   max: 5000 },
  minProfit:         { min: 200,   max: 5000 },
  minProfitPerDay:   { min: 100,   max: 3000 },
  negotiationMarkupPct: { min: 3, max: 25 },

  // Per-cycle limits
  maxAdjustmentPct:  10,       // default max % change per cycle (overridable by carrier)
  minSampleSize:     5,        // minimum loads before any adjustment
  maxDailyAdjustments: 5,      // max adjustments per daily cycle
  cooldownHours:     24,       // minimum hours between adjustment cycles

  // Confidence & score bounds
  laneConfidence:    { min: 0,  max: 100 },
  brokerReliability: { min: 0,  max: 100 },
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 1 — OUTCOME TRACKING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Record the outcome of a completed load. Called when load reaches "Delivered" or "Paid".
 * Compares Q's prediction (at decision time) with actual results.
 */
export async function recordLoadOutcome(ownerId, loadData, decisionData) {
  const {
    loadId, origin, destination, originState, destState, lane,
    miles, equipment, broker, driverId, vehicleId,
    actualProfit, actualRpm, actualFuelCost, actualDeadheadMiles,
    actualDaysHeld, brokerPaidOnTime, brokerChangedRate, detentionHours,
    completedAt,
  } = loadData

  const {
    decisionType, confidence, expectedProfit, expectedRpm, expectedFuelCost,
    expectedDeadheadMiles, expectedLaneQuality, expectedBrokerReliability,
    decisionId, decidedAt,
    negotiationAttempted, negotiationInitial, negotiationTarget,
    negotiationFinal, negotiationRounds, negotiationSuccess,
  } = decisionData

  const profitDelta = (actualProfit || 0) - (expectedProfit || 0)
  const rpmDelta = (actualRpm || 0) - (expectedRpm || 0)

  // Classify result
  const result = classifyResult(decisionType, expectedProfit, actualProfit, profitDelta)
  const resultReason = explainResult(result, profitDelta, decisionType, brokerChangedRate, detentionHours)

  const outcome = await sbInsert('load_outcomes', {
    owner_id: ownerId,
    load_id: loadId,
    dispatch_decision_id: decisionId || null,
    decision_type: decisionType,
    decision_confidence: confidence,
    decision_at: decidedAt || null,
    expected_profit: expectedProfit,
    expected_rpm: expectedRpm,
    expected_profit_per_day: expectedProfit && actualDaysHeld ? expectedProfit / Math.max(actualDaysHeld, 1) : null,
    expected_fuel_cost: expectedFuelCost,
    expected_deadhead_miles: expectedDeadheadMiles,
    expected_lane_quality: expectedLaneQuality || null,
    expected_broker_reliability: expectedBrokerReliability || null,
    actual_profit: actualProfit,
    actual_rpm: actualRpm,
    actual_fuel_cost: actualFuelCost,
    actual_deadhead_miles: actualDeadheadMiles,
    actual_days_held: actualDaysHeld,
    actual_broker_paid_on_time: brokerPaidOnTime ?? null,
    actual_broker_changed_rate: brokerChangedRate || false,
    actual_detention_hours: detentionHours || 0,
    negotiation_attempted: negotiationAttempted || false,
    negotiation_initial_offer: negotiationInitial,
    negotiation_target_rate: negotiationTarget,
    negotiation_final_rate: negotiationFinal,
    negotiation_rounds: negotiationRounds || 0,
    negotiation_success: negotiationSuccess ?? null,
    result,
    result_reason: resultReason,
    profit_delta: profitDelta,
    rpm_delta: rpmDelta,
    origin, destination, origin_state: originState, destination_state: destState,
    lane: lane || `${origin} → ${destination}`,
    miles, equipment_type: equipment, broker_name: broker,
    driver_id: driverId || null, vehicle_id: vehicleId || null,
    load_completed_at: completedAt || new Date().toISOString(),
  })

  // Log the event
  await logEvent(ownerId, loadId, 'decision_made', {
    actor: 'ai', details: { type: 'outcome_recorded', result, profitDelta, resultReason },
  }).catch(() => {})

  return outcome?.[0] || outcome
}

function classifyResult(decisionType, expectedProfit, actualProfit, profitDelta) {
  if (decisionType === 'reject') {
    // If we rejected but it would have been profitable → missed opportunity
    if (actualProfit != null && actualProfit > 0) return 'missed_opportunity'
    return 'good'
  }
  // Accepted/negotiated/auto_booked loads
  if (actualProfit == null) return 'acceptable'  // no data yet
  if (actualProfit < 0) return 'bad'             // lost money
  // For negotiate decisions: also check if profit fell significantly below the target
  if (decisionType === 'negotiate' && expectedProfit > 0 && profitDelta < -(expectedProfit * 0.4)) return 'bad'
  if (expectedProfit > 0 && profitDelta < -(expectedProfit * 0.3)) return 'bad'  // actual 30%+ below expected
  if (profitDelta > (expectedProfit * 0.1)) return 'good'  // exceeded expectations
  return 'acceptable'
}

function explainResult(result, profitDelta, decisionType, brokerChangedRate, detentionHours) {
  if (result === 'good') return decisionType === 'reject' ? 'Correctly rejected unprofitable load' : `Load performed well, profit delta $${Math.round(profitDelta)}`
  if (result === 'missed_opportunity') return 'Rejected a load that turned out profitable — review thresholds'
  if (result === 'bad' && brokerChangedRate) return 'Broker changed rate after agreement — reliability issue'
  if (result === 'bad' && detentionHours > 2) return `Detention of ${detentionHours}h eroded profit`
  if (result === 'bad') return `Profit $${Math.round(profitDelta)} below expectation`
  return 'Load completed within acceptable range'
}


// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 2 — MISTAKE DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Analyze a load outcome and detect any mistakes Q made.
 * Returns array of detected mistakes.
 */
export async function detectMistakes(ownerId, outcome) {
  const mistakes = []

  // Bad accept: Q accepted but load lost money or significantly underperformed
  if (['auto_book', 'accept'].includes(outcome.decision_type) && outcome.result === 'bad') {
    mistakes.push({
      mistake_type: 'bad_accept',
      severity: outcome.actual_profit < 0 ? 'critical' : 'high',
      description: `Accepted ${outcome.lane} at $${outcome.expected_profit} expected, actual was $${outcome.actual_profit}`,
      expected_value: String(outcome.expected_profit),
      actual_value: String(outcome.actual_profit),
      impact_dollars: outcome.profit_delta,
    })
  }

  // Missed good load: Q rejected but it would have been good
  if (outcome.decision_type === 'reject' && outcome.result === 'missed_opportunity') {
    mistakes.push({
      mistake_type: 'missed_good_load',
      severity: 'medium',
      description: `Rejected ${outcome.lane} but actual profit would have been $${outcome.actual_profit}`,
      expected_value: 'reject',
      actual_value: String(outcome.actual_profit),
      impact_dollars: -(outcome.actual_profit || 0),
    })
  }

  // Failed negotiation: lost a load that was worth taking at initial offer
  if (outcome.negotiation_attempted && !outcome.negotiation_success && outcome.actual_profit > 0) {
    mistakes.push({
      mistake_type: 'failed_negotiation',
      severity: 'medium',
      description: `Lost negotiation on ${outcome.lane} — initial offer $${outcome.negotiation_initial_offer} was worth taking`,
      expected_value: String(outcome.negotiation_target_rate),
      actual_value: String(outcome.negotiation_initial_offer),
      impact_dollars: -(outcome.actual_profit || 0),
    })
  }

  // Broker reliability miss
  if (outcome.expected_broker_reliability === 'high' && (outcome.actual_broker_changed_rate || outcome.actual_broker_paid_on_time === false)) {
    mistakes.push({
      mistake_type: 'broker_reliability_miss',
      severity: outcome.actual_broker_changed_rate ? 'high' : 'medium',
      description: `${outcome.broker_name} rated "high reliability" but ${outcome.actual_broker_changed_rate ? 'changed rate' : 'paid late'}`,
      expected_value: 'high',
      actual_value: outcome.actual_broker_changed_rate ? 'rate_changed' : 'late_payment',
      impact_dollars: outcome.actual_broker_changed_rate ? outcome.profit_delta : 0,
    })
  }

  // Overestimated profit (>30% off)
  if (outcome.expected_profit > 0 && outcome.profit_delta < -(outcome.expected_profit * 0.3) && outcome.result !== 'bad') {
    mistakes.push({
      mistake_type: 'overestimated_profit',
      severity: 'medium',
      description: `Expected $${outcome.expected_profit} profit on ${outcome.lane}, got $${outcome.actual_profit} (${Math.round((outcome.profit_delta / outcome.expected_profit) * 100)}% off)`,
      expected_value: String(outcome.expected_profit),
      actual_value: String(outcome.actual_profit),
      impact_dollars: outcome.profit_delta,
    })
  }

  // Detention not predicted
  if (outcome.actual_detention_hours > 2 && outcome.profit_delta < 0) {
    mistakes.push({
      mistake_type: 'detention_not_predicted',
      severity: outcome.actual_detention_hours > 5 ? 'high' : 'medium',
      description: `${outcome.actual_detention_hours}h detention on ${outcome.lane} not factored into decision`,
      expected_value: '0',
      actual_value: String(outcome.actual_detention_hours),
      impact_dollars: outcome.profit_delta,
    })
  }

  // Incorrect lane confidence
  if (outcome.expected_lane_quality && outcome.result) {
    const wasHot = outcome.expected_lane_quality === 'hot_market'
    const wasDead = outcome.expected_lane_quality === 'dead_zone'
    if ((wasHot && outcome.result === 'bad') || (wasDead && outcome.result === 'good')) {
      mistakes.push({
        mistake_type: 'incorrect_lane_confidence',
        severity: 'medium',
        description: `Lane ${outcome.lane} rated "${outcome.expected_lane_quality}" but result was "${outcome.result}"`,
        expected_value: outcome.expected_lane_quality,
        actual_value: outcome.result === 'bad' ? 'underperforming' : 'outperforming',
        impact_dollars: outcome.profit_delta,
      })
    }
  }

  // Save detected mistakes
  const saved = []
  for (const m of mistakes) {
    const row = await sbInsert('q_mistakes', {
      owner_id: ownerId,
      load_outcome_id: outcome.id,
      load_id: outcome.load_id,
      ...m,
      lane: outcome.lane,
      broker_name: outcome.broker_name,
      equipment_type: outcome.equipment_type,
      decision_type: outcome.decision_type,
    }).catch(err => { console.error('[q-learning] Failed to save mistake:', err.message); return null })
    if (row) saved.push(row[0] || row)
  }

  return saved
}


// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 3 — FEEDBACK ENGINE (bounded adjustments with guardrails)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Analyze recent outcomes and propose/apply bounded adjustments.
 * Only runs if enough data exists (min sample size) and cooldown has passed.
 */
export async function runFeedbackCycle(ownerId) {
  const settings = await getCarrierSettings(ownerId)

  // Check if learning is enabled
  if (!settings.qLearningEnabled && settings.qLearningEnabled !== undefined) {
    return { skipped: true, reason: 'Q learning disabled in settings' }
  }

  // Check cooldown
  if (settings.qLastLearningAt) {
    const hoursSince = (Date.now() - new Date(settings.qLastLearningAt).getTime()) / 3600000
    if (hoursSince < GUARDRAILS.cooldownHours) {
      return { skipped: true, reason: `Cooldown: ${Math.round(GUARDRAILS.cooldownHours - hoursSince)}h remaining` }
    }
  }

  const maxAdjPct = Math.min(settings.qMaxAdjustmentPct || GUARDRAILS.maxAdjustmentPct, GUARDRAILS.maxAdjustmentPct)
  const minSamples = Math.max(settings.qMinSampleSize || GUARDRAILS.minSampleSize, GUARDRAILS.minSampleSize)
  const learningRate = Math.min(Math.max(settings.qLearningRate || 0.15, 0.05), 0.30)
  // SAFETY: Auto-apply is OFF by default. Carrier must explicitly enable it.
  // Even when enabled, all adjustments are bounded by guardrails.
  const autoApply = settings.qAutoAdjust === true

  // Fetch recent outcomes (last 30 days)
  const outcomes = await sbQuery('load_outcomes',
    `owner_id=eq.${ownerId}&load_completed_at=gte.${thirtyDaysAgo()}&order=load_completed_at.desc`
  ).catch(() => []) || []

  if (outcomes.length < minSamples) {
    return { skipped: true, reason: `Need ${minSamples} outcomes, have ${outcomes.length}` }
  }

  // Fetch unprocessed mistakes
  const mistakes = await sbQuery('q_mistakes',
    `owner_id=eq.${ownerId}&feedback_applied=eq.false&order=created_at.desc`
  ).catch(() => []) || []

  const adjustments = []
  let adjCount = 0

  // ── Analyze RPM accuracy ──
  const rpmOutcomes = outcomes.filter(o => o.expected_rpm && o.actual_rpm)
  if (rpmOutcomes.length >= minSamples) {
    const avgRpmDelta = rpmOutcomes.reduce((s, o) => s + (o.actual_rpm - o.expected_rpm), 0) / rpmOutcomes.length
    // If we're consistently overestimating RPM, we might need to raise minRpm
    if (Math.abs(avgRpmDelta) > 0.15 && adjCount < GUARDRAILS.maxDailyAdjustments) {
      const currentMinRpm = settings.minRpm || 1.0
      const rawDelta = -avgRpmDelta * learningRate  // if actual RPM lower, raise threshold slightly
      const adj = proposeAdjustment('minRpm', currentMinRpm, rawDelta, maxAdjPct, GUARDRAILS.minRpm)
      if (adj) {
        adj.reason = `Avg RPM delta ${avgRpmDelta > 0 ? '+' : ''}${avgRpmDelta.toFixed(2)} over ${rpmOutcomes.length} loads`
        adj.evidence = { sample_size: rpmOutcomes.length, avg_delta: avgRpmDelta }
        adj.trigger_type = 'outcome_feedback'
        adjustments.push(adj)
        adjCount++
      }
    }
  }

  // ── Analyze profit accuracy ──
  const profitOutcomes = outcomes.filter(o => o.expected_profit != null && o.actual_profit != null)
  if (profitOutcomes.length >= minSamples) {
    const avgProfitDelta = profitOutcomes.reduce((s, o) => s + o.profit_delta, 0) / profitOutcomes.length
    const avgExpected = profitOutcomes.reduce((s, o) => s + o.expected_profit, 0) / profitOutcomes.length
    const pctOff = avgExpected > 0 ? (avgProfitDelta / avgExpected) * 100 : 0

    // If consistently overestimating profit by >15%, raise auto-reject threshold
    if (pctOff < -15 && adjCount < GUARDRAILS.maxDailyAdjustments) {
      const rawDelta = Math.abs(avgProfitDelta) * learningRate * 0.5
      const adj = proposeAdjustment('autoRejectBelow', settings.autoRejectBelow || 800, rawDelta, maxAdjPct, GUARDRAILS.autoRejectBelow)
      if (adj) {
        adj.reason = `Avg profit ${pctOff.toFixed(1)}% below expected over ${profitOutcomes.length} loads — raising reject floor`
        adj.evidence = { sample_size: profitOutcomes.length, avg_profit_delta: avgProfitDelta, pct_off: pctOff }
        adj.trigger_type = 'outcome_feedback'
        adjustments.push(adj)
        adjCount++
      }
    }

    // If consistently underestimating profit by >20%, we might be rejecting good loads
    if (pctOff > 20 && adjCount < GUARDRAILS.maxDailyAdjustments) {
      const rawDelta = -(Math.abs(avgProfitDelta) * learningRate * 0.3)
      const adj = proposeAdjustment('autoRejectBelow', settings.autoRejectBelow || 800, rawDelta, maxAdjPct, GUARDRAILS.autoRejectBelow)
      if (adj) {
        adj.reason = `Avg profit ${pctOff.toFixed(1)}% above expected — may be rejecting good loads`
        adj.evidence = { sample_size: profitOutcomes.length, avg_profit_delta: avgProfitDelta, pct_off: pctOff }
        adj.trigger_type = 'outcome_feedback'
        adjustments.push(adj)
        adjCount++
      }
    }
  }

  // ── Analyze negotiation success rate ──
  const negoOutcomes = outcomes.filter(o => o.negotiation_attempted)
  if (negoOutcomes.length >= 3 && adjCount < GUARDRAILS.maxDailyAdjustments) {
    const successRate = negoOutcomes.filter(o => o.negotiation_success).length / negoOutcomes.length
    if (successRate < 0.3) {
      // Failing too many negotiations — lower markup
      const rawDelta = -1 * learningRate * 10
      const adj = proposeAdjustment('negotiationMarkupPct', settings.negotiationMarkupPct || 10, rawDelta, maxAdjPct, GUARDRAILS.negotiationMarkupPct)
      if (adj) {
        adj.reason = `Negotiation success rate ${(successRate * 100).toFixed(0)}% — reducing markup to close more deals`
        adj.evidence = { sample_size: negoOutcomes.length, success_rate: successRate }
        adj.trigger_type = 'outcome_feedback'
        adjustments.push(adj)
        adjCount++
      }
    } else if (successRate > 0.8) {
      // Winning too easily — try pushing rates higher
      const rawDelta = 1 * learningRate * 5
      const adj = proposeAdjustment('negotiationMarkupPct', settings.negotiationMarkupPct || 10, rawDelta, maxAdjPct, GUARDRAILS.negotiationMarkupPct)
      if (adj) {
        adj.reason = `Negotiation success rate ${(successRate * 100).toFixed(0)}% — room to push rates higher`
        adj.evidence = { sample_size: negoOutcomes.length, success_rate: successRate }
        adj.trigger_type = 'outcome_feedback'
        adjustments.push(adj)
        adjCount++
      }
    }
  }

  // ── Analyze lane confidence accuracy ──
  const laneOutcomes = {}
  for (const o of outcomes) {
    if (!o.lane) continue
    if (!laneOutcomes[o.lane]) laneOutcomes[o.lane] = { good: 0, bad: 0, total: 0 }
    laneOutcomes[o.lane].total++
    if (o.result === 'good' || o.result === 'acceptable') laneOutcomes[o.lane].good++
    if (o.result === 'bad') laneOutcomes[o.lane].bad++
  }
  for (const [lane, stats] of Object.entries(laneOutcomes)) {
    if (stats.total < 3 || adjCount >= GUARDRAILS.maxDailyAdjustments) continue
    // Check if lane confidence needs correction
    const laneRec = await sbQuery('lane_performance',
      `owner_id=eq.${ownerId}&lane=eq.${encodeURIComponent(lane)}&limit=1`
    ).catch(() => [])
    const laneData = laneRec?.[0]
    if (!laneData) continue
    const actualGoodRate = stats.good / stats.total
    const currentConfidence = laneData.confidence_score || 50
    // If lane is rated high but performing badly, or rated low but performing well
    if (currentConfidence > 70 && actualGoodRate < 0.4 && stats.total >= 3) {
      const rawDelta = -(currentConfidence - 50) * learningRate
      const adj = proposeAdjustment(`lane_confidence:${lane}`, currentConfidence, rawDelta, maxAdjPct, GUARDRAILS.laneConfidence)
      if (adj) {
        adj.reason = `Lane "${lane}" rated ${currentConfidence}% but only ${Math.round(actualGoodRate*100)}% good outcomes over ${stats.total} loads`
        adj.evidence = { lane, sample_size: stats.total, good_rate: actualGoodRate, current_confidence: currentConfidence }
        adj.trigger_type = 'outcome_feedback'
        adj._laneId = laneData.id
        adjustments.push(adj)
        adjCount++
      }
    } else if (currentConfidence < 40 && actualGoodRate > 0.7 && stats.total >= 3) {
      const rawDelta = (50 - currentConfidence) * learningRate
      const adj = proposeAdjustment(`lane_confidence:${lane}`, currentConfidence, rawDelta, maxAdjPct, GUARDRAILS.laneConfidence)
      if (adj) {
        adj.reason = `Lane "${lane}" rated ${currentConfidence}% but ${Math.round(actualGoodRate*100)}% good outcomes — underrated`
        adj.evidence = { lane, sample_size: stats.total, good_rate: actualGoodRate, current_confidence: currentConfidence }
        adj.trigger_type = 'outcome_feedback'
        adj._laneId = laneData.id
        adjustments.push(adj)
        adjCount++
      }
    }
  }

  // ── Analyze broker reliability accuracy ──
  const brokerOutcomes = {}
  for (const o of outcomes) {
    if (!o.broker_name) continue
    if (!brokerOutcomes[o.broker_name]) brokerOutcomes[o.broker_name] = { total: 0, issues: 0 }
    brokerOutcomes[o.broker_name].total++
    if (o.actual_broker_changed_rate || o.actual_broker_paid_on_time === false) brokerOutcomes[o.broker_name].issues++
  }
  for (const [broker, stats] of Object.entries(brokerOutcomes)) {
    if (stats.total < 2 || adjCount >= GUARDRAILS.maxDailyAdjustments) continue
    const brokerRec = await sbQuery('broker_performance',
      `owner_id=eq.${ownerId}&broker_name=eq.${encodeURIComponent(broker)}&limit=1`
    ).catch(() => [])
    const brokerData = brokerRec?.[0]
    if (!brokerData) continue
    const issueRate = stats.issues / stats.total
    const currentScore = brokerData.reliability_score || 50
    // Broker rated high but causing issues
    if (currentScore > 70 && issueRate > 0.3 && stats.total >= 2) {
      const rawDelta = -(currentScore - 50) * learningRate * 0.5
      const adj = proposeAdjustment(`broker_score:${broker}`, currentScore, rawDelta, maxAdjPct, GUARDRAILS.brokerReliability)
      if (adj) {
        adj.reason = `Broker "${broker}" scored ${currentScore} but ${Math.round(issueRate*100)}% issue rate over ${stats.total} loads`
        adj.evidence = { broker, sample_size: stats.total, issue_rate: issueRate, current_score: currentScore }
        adj.trigger_type = 'outcome_feedback'
        adj._brokerId = brokerData.id
        adjustments.push(adj)
        adjCount++
      }
    }
  }

  // ── Process mistake patterns ──
  if (mistakes.length > 0 && adjCount < GUARDRAILS.maxDailyAdjustments) {
    const badAccepts = mistakes.filter(m => m.mistake_type === 'bad_accept')
    if (badAccepts.length >= 2) {
      const avgImpact = badAccepts.reduce((s, m) => s + Math.abs(m.impact_dollars || 0), 0) / badAccepts.length
      const rawDelta = avgImpact * learningRate * 0.1
      const adj = proposeAdjustment('autoAcceptAbove', settings.autoAcceptAbove || 1200, rawDelta, maxAdjPct, GUARDRAILS.autoAcceptAbove)
      if (adj) {
        adj.reason = `${badAccepts.length} bad accepts averaging -$${avgImpact.toFixed(0)} impact — raising accept threshold`
        adj.evidence = { mistake_count: badAccepts.length, avg_impact: avgImpact, mistake_ids: badAccepts.map(m => m.id).slice(0, 5) }
        adj.trigger_type = 'mistake_correction'
        adjustments.push(adj)
        adjCount++
      }
    }
  }

  // Save adjustments and optionally apply
  const savedAdjs = []
  for (const adj of adjustments) {
    const row = await sbInsert('q_adjustments', {
      owner_id: ownerId,
      parameter: adj.parameter,
      old_value: adj.oldValue,
      new_value: adj.newValue,
      delta: adj.delta,
      reason: adj.reason,
      trigger_type: adj.trigger_type,
      evidence: adj.evidence || {},
      sample_size: adj.evidence?.sample_size || 0,
      confidence: adj.confidence || 50,
      bounded: adj.bounded,
      original_delta: adj.originalDelta,
      guardrail_hit: adj.guardrailHit || null,
      status: autoApply ? 'applied' : 'proposed',
    }).catch(err => { console.error('[q-learning] Failed to save adjustment:', err.message); return null })

    if (row && autoApply) {
      // Apply the adjustment to the appropriate table
      if (adj._laneId) {
        await sbUpdate('lane_performance', `id=eq.${adj._laneId}`, {
          confidence_score: adj.newValue,
          quality: adj.newValue >= 70 ? 'hot_market' : adj.newValue < 40 ? 'dead_zone' : 'neutral',
        }).catch(err => console.error('[q-learning] Failed to apply lane adjustment:', err.message))
      } else if (adj._brokerId) {
        const tier = adj.newValue >= 85 ? 'excellent' : adj.newValue >= 70 ? 'good' : adj.newValue >= 50 ? 'average' : adj.newValue >= 30 ? 'poor' : 'blacklist'
        await sbUpdate('broker_performance', `id=eq.${adj._brokerId}`, {
          reliability_score: adj.newValue,
          reliability_tier: tier,
        }).catch(err => console.error('[q-learning] Failed to apply broker adjustment:', err.message))
      } else {
        await applyAdjustment(ownerId, adj).catch(err =>
          console.error('[q-learning] Failed to apply adjustment:', err.message)
        )
      }
    }
    if (row) savedAdjs.push(row[0] || row)
  }

  // Mark processed mistakes
  for (const m of mistakes) {
    await sbUpdate('q_mistakes', `id=eq.${m.id}`, { feedback_applied: true }).catch(() => {})
  }

  // Update last learning timestamp
  await sbUpdate('carrier_settings', `owner_id=eq.${ownerId}`, {
    q_last_learning_at: new Date().toISOString(),
    q_total_adjustments: (settings.qTotalAdjustments || 0) + savedAdjs.length,
  }).catch(() => {})

  return {
    ok: true,
    outcomes_analyzed: outcomes.length,
    mistakes_processed: mistakes.length,
    adjustments: savedAdjs,
    auto_applied: autoApply,
  }
}

/**
 * Propose a bounded adjustment. Returns null if the change is too small to matter.
 */
function proposeAdjustment(parameter, currentValue, rawDelta, maxAdjPct, bounds) {
  if (Math.abs(rawDelta) < 0.01) return null

  const maxChange = currentValue * (maxAdjPct / 100)
  let boundedDelta = rawDelta
  let guardrailHit = null

  // Cap by max adjustment %
  if (Math.abs(boundedDelta) > maxChange) {
    boundedDelta = Math.sign(rawDelta) * maxChange
    guardrailHit = `max_adjustment_pct (${maxAdjPct}%)`
  }

  let newValue = currentValue + boundedDelta

  // Enforce absolute bounds
  if (bounds) {
    if (newValue < bounds.min) { newValue = bounds.min; guardrailHit = `min_bound (${bounds.min})` }
    if (newValue > bounds.max) { newValue = bounds.max; guardrailHit = `max_bound (${bounds.max})` }
  }

  // If barely changed, skip
  if (Math.abs(newValue - currentValue) < 0.01) return null

  return {
    parameter,
    oldValue: Math.round(currentValue * 100) / 100,
    newValue: Math.round(newValue * 100) / 100,
    delta: Math.round((newValue - currentValue) * 100) / 100,
    originalDelta: Math.round(rawDelta * 100) / 100,
    bounded: guardrailHit != null,
    guardrailHit,
    confidence: 50 + Math.min(30, Math.round(Math.abs(rawDelta) * 10)),
  }
}

/** Apply a single adjustment to carrier_settings */
async function applyAdjustment(ownerId, adj) {
  // Map parameter names to DB column names
  const paramToColumn = {
    minRpm: 'min_rpm',
    autoAcceptAbove: 'auto_accept_above',
    autoRejectBelow: 'auto_reject_below',
    minProfit: 'min_profit',
    minProfitPerDay: 'min_profit_per_day',
    negotiationMarkupPct: 'negotiation_markup_pct',
  }
  const col = paramToColumn[adj.parameter]
  if (!col) return
  await sbUpdate('carrier_settings', `owner_id=eq.${ownerId}`, { [col]: adj.newValue })
}


// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 4 — HISTORICAL PERFORMANCE
// ═══════════════════════════════════════════════════════════════════════════════

/** Update lane performance aggregates after a load outcome */
export async function updateLanePerformance(ownerId, outcome) {
  const lane = outcome.lane
  if (!lane) return null

  // Fetch existing lane record
  const existing = await sbQuery('lane_performance',
    `owner_id=eq.${ownerId}&lane=eq.${encodeURIComponent(lane)}`
  ).catch(() => [])

  const prev = existing?.[0]
  const totalLoads = (prev?.total_loads || 0) + 1
  const goodLoads = (prev?.good_loads || 0) + (outcome.result === 'good' ? 1 : 0)
  const badLoads = (prev?.bad_loads || 0) + (outcome.result === 'bad' ? 1 : 0)

  // Rolling averages
  const avgRpm = rollingAvg(prev?.avg_rpm, outcome.actual_rpm, totalLoads)
  const avgProfit = rollingAvg(prev?.avg_profit, outcome.actual_profit, totalLoads)
  const avgDeadhead = rollingAvg(prev?.avg_deadhead_miles, outcome.actual_deadhead_miles, totalLoads)
  const avgDetention = rollingAvg(prev?.avg_detention_hours, outcome.actual_detention_hours, totalLoads)
  const avgDaysHeld = rollingAvg(prev?.avg_days_held, outcome.actual_days_held, totalLoads)
  const avgProfitPerDay = avgProfit && avgDaysHeld ? avgProfit / Math.max(avgDaysHeld, 1) : null

  // Confidence score: weighted by good/bad ratio and sample size
  const goodRatio = totalLoads > 0 ? goodLoads / totalLoads : 0.5
  const badRatio = totalLoads > 0 ? badLoads / totalLoads : 0
  const sampleBonus = Math.min(20, totalLoads * 2)  // more data = more confidence
  let confidence = clamp(50 + (goodRatio * 30) - (badRatio * 40) + sampleBonus, 0, 100)

  // Quality classification
  let quality = 'neutral'
  if (confidence >= 70 && avgRpm > 2.0 && goodRatio > 0.6) quality = 'hot_market'
  if (confidence < 40 || (badRatio > 0.5 && totalLoads >= 3)) quality = 'dead_zone'

  // Best/worst tracking
  const bestRpm = Math.max(prev?.best_rpm || 0, outcome.actual_rpm || 0)
  const worstRpm = prev?.worst_rpm ? Math.min(prev.worst_rpm, outcome.actual_rpm || 999) : (outcome.actual_rpm || 0)
  const bestProfit = Math.max(prev?.best_profit || 0, outcome.actual_profit || 0)
  const worstProfit = prev?.worst_profit != null ? Math.min(prev.worst_profit, outcome.actual_profit || 0) : (outcome.actual_profit || 0)

  // Seasonal data
  const quarter = `Q${Math.ceil((new Date().getMonth() + 1) / 3)}`
  const seasonalData = prev?.seasonal_data || {}
  if (!seasonalData[quarter]) seasonalData[quarter] = { loads: 0, total_rpm: 0, total_profit: 0 }
  seasonalData[quarter].loads++
  seasonalData[quarter].total_rpm += (outcome.actual_rpm || 0)
  seasonalData[quarter].total_profit += (outcome.actual_profit || 0)

  // Equipment stats
  const equipStats = prev?.equipment_stats || {}
  const equip = outcome.equipment_type || 'Dry Van'
  if (!equipStats[equip]) equipStats[equip] = { loads: 0, total_rpm: 0 }
  equipStats[equip].loads++
  equipStats[equip].total_rpm += (outcome.actual_rpm || 0)

  const data = {
    owner_id: ownerId,
    lane,
    origin: outcome.origin,
    origin_state: outcome.origin_state,
    destination: outcome.destination,
    destination_state: outcome.destination_state,
    total_loads: totalLoads,
    good_loads: goodLoads,
    bad_loads: badLoads,
    avg_rpm: round2(avgRpm),
    avg_profit: round2(avgProfit),
    avg_profit_per_day: round2(avgProfitPerDay),
    avg_deadhead_miles: round2(avgDeadhead),
    avg_detention_hours: round2(avgDetention),
    avg_days_held: round2(avgDaysHeld),
    confidence_score: round2(confidence),
    quality,
    seasonal_data: seasonalData,
    best_rpm: round2(bestRpm),
    worst_rpm: round2(worstRpm),
    best_profit: round2(bestProfit),
    worst_profit: round2(worstProfit),
    equipment_stats: equipStats,
    last_load_at: outcome.load_completed_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  if (prev) {
    await sbUpdate('lane_performance', `id=eq.${prev.id}`, data)
  } else {
    await sbInsert('lane_performance', data)
  }

  return { lane, quality, confidence, totalLoads }
}

/** Update broker performance aggregates after a load outcome */
export async function updateBrokerPerformance(ownerId, outcome) {
  const broker = outcome.broker_name
  if (!broker) return null

  const existing = await sbQuery('broker_performance',
    `owner_id=eq.${ownerId}&broker_name=eq.${encodeURIComponent(broker)}`
  ).catch(() => [])

  const prev = existing?.[0]
  const totalLoads = (prev?.total_loads || 0) + 1
  const completedLoads = (prev?.completed_loads || 0) + 1
  const cancelledLoads = prev?.cancelled_loads || 0
  const rateChangedLoads = (prev?.rate_changed_loads || 0) + (outcome.actual_broker_changed_rate ? 1 : 0)
  const paidOnTime = (prev?.paid_on_time || 0) + (outcome.actual_broker_paid_on_time ? 1 : 0)
  const paidLate = (prev?.paid_late || 0) + (outcome.actual_broker_paid_on_time === false ? 1 : 0)
  const detentionInc = (prev?.detention_incidents || 0) + (outcome.actual_detention_hours > 1 ? 1 : 0)
  const avgDetention = rollingAvg(prev?.avg_detention_hours, outcome.actual_detention_hours, totalLoads)

  // Negotiation stats
  const totalNegos = (prev?.total_negotiations || 0) + (outcome.negotiation_attempted ? 1 : 0)
  const successNegos = (prev?.successful_negotiations || 0) + (outcome.negotiation_success ? 1 : 0)

  // Reliability score
  let reliability = 50
  if (totalLoads >= 2) {
    const payReliability = completedLoads > 0 ? (paidOnTime / completedLoads) * 40 : 20
    const rateStability = completedLoads > 0 ? ((completedLoads - rateChangedLoads) / completedLoads) * 30 : 15
    const cancelPenalty = totalLoads > 0 ? (cancelledLoads / totalLoads) * 20 : 0
    const detentionPenalty = completedLoads > 0 ? Math.min(10, (detentionInc / completedLoads) * 10) : 0
    reliability = clamp(payReliability + rateStability + 20 - cancelPenalty - detentionPenalty, 0, 100)
  }

  // Tier
  let tier = 'unknown'
  if (totalLoads >= 3) {
    if (reliability >= 85) tier = 'excellent'
    else if (reliability >= 70) tier = 'good'
    else if (reliability >= 50) tier = 'average'
    else if (reliability >= 30) tier = 'poor'
    else tier = 'blacklist'
  }

  const data = {
    owner_id: ownerId,
    broker_name: broker,
    total_loads: totalLoads,
    completed_loads: completedLoads,
    cancelled_loads: cancelledLoads,
    rate_changed_loads: rateChangedLoads,
    paid_on_time: paidOnTime,
    paid_late: paidLate,
    total_negotiations: totalNegos,
    successful_negotiations: successNegos,
    avg_detention_hours: round2(avgDetention),
    detention_incidents: detentionInc,
    reliability_score: round2(reliability),
    reliability_tier: tier,
    last_load_at: outcome.load_completed_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  if (prev) {
    await sbUpdate('broker_performance', `id=eq.${prev.id}`, data)
  } else {
    await sbInsert('broker_performance', data)
  }

  return { broker, reliability, tier, totalLoads }
}


// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 5 — DAILY SUMMARY
// ═══════════════════════════════════════════════════════════════════════════════

/** Generate daily summary for a carrier. Idempotent per day. */
export async function generateDailySummary(ownerId, date) {
  const summaryDate = date || new Date().toISOString().split('T')[0]
  const nextDate = new Date(new Date(summaryDate).getTime() + 86400000).toISOString().split('T')[0]

  // Fetch today's outcomes
  const outcomes = await sbQuery('load_outcomes',
    `owner_id=eq.${ownerId}&load_completed_at=gte.${summaryDate}&load_completed_at=lt.${nextDate}&order=load_completed_at.desc`
  ).catch(() => []) || []

  // Fetch today's mistakes
  const mistakes = await sbQuery('q_mistakes',
    `owner_id=eq.${ownerId}&created_at=gte.${summaryDate}&created_at=lt.${nextDate}&order=created_at.desc`
  ).catch(() => []) || []

  // Fetch today's adjustments
  const adjustments = await sbQuery('q_adjustments',
    `owner_id=eq.${ownerId}&created_at=gte.${summaryDate}&created_at=lt.${nextDate}&order=created_at.desc`
  ).catch(() => []) || []

  // Decision counts
  const autoBooked = outcomes.filter(o => o.decision_type === 'auto_book').length
  const negotiated = outcomes.filter(o => o.decision_type === 'negotiate').length
  const rejected = outcomes.filter(o => o.decision_type === 'reject').length

  // Accuracy — good/acceptable = correct, bad/missed_opportunity = incorrect
  const withOutcomes = outcomes.filter(o => o.result)
  const correct = withOutcomes.filter(o => o.result === 'good' || o.result === 'acceptable').length
  const incorrect = withOutcomes.filter(o => o.result === 'bad' || o.result === 'missed_opportunity').length
  const accuracy = withOutcomes.length > 0 ? (correct / withOutcomes.length) * 100 : null

  // Profit tracking
  const totalExpected = outcomes.reduce((s, o) => s + (Number(o.expected_profit) || 0), 0)
  const totalActual = outcomes.reduce((s, o) => s + (Number(o.actual_profit) || 0), 0)
  const profitDelta = totalActual - totalExpected
  const profitAccuracy = totalExpected > 0 ? (1 - Math.abs(profitDelta) / totalExpected) * 100 : null

  // Mistake analysis
  const mistakesByType = {}
  for (const m of mistakes) {
    if (!mistakesByType[m.mistake_type]) mistakesByType[m.mistake_type] = { count: 0, total_impact: 0 }
    mistakesByType[m.mistake_type].count++
    mistakesByType[m.mistake_type].total_impact += Math.abs(Number(m.impact_dollars) || 0)
  }
  const topMistakes = Object.entries(mistakesByType)
    .map(([type, d]) => ({ type, count: d.count, total_impact: round2(d.total_impact) }))
    .sort((a, b) => b.total_impact - a.total_impact)
    .slice(0, 5)

  // Repeated patterns (same mistake type 3+ times in 7 days)
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
  const weekMistakes = await sbQuery('q_mistakes',
    `owner_id=eq.${ownerId}&created_at=gte.${weekAgo}&order=created_at.desc`
  ).catch(() => []) || []
  const weekPatterns = {}
  for (const m of weekMistakes) {
    const key = `${m.mistake_type}:${m.lane || 'any'}`
    if (!weekPatterns[key]) weekPatterns[key] = { pattern: m.mistake_type, lane: m.lane, occurrences: 0 }
    weekPatterns[key].occurrences++
  }
  const repeatedPatterns = Object.values(weekPatterns)
    .filter(p => p.occurrences >= 3)
    .map(p => ({
      pattern: p.pattern.replace(/_/g, ' '),
      lane: p.lane,
      occurrences: p.occurrences,
      suggestion: suggestForPattern(p.pattern, p.occurrences),
    }))
    .slice(0, 5)

  // Adjustment details
  const adjDetail = adjustments.map(a => ({
    parameter: a.parameter,
    old: a.old_value,
    new: a.new_value,
    reason: a.reason,
    status: a.status,
  }))

  // Suggested adjustments (from feedback engine, status='proposed')
  const proposed = adjustments.filter(a => a.status === 'proposed').map(a => ({
    parameter: a.parameter,
    current: a.old_value,
    suggested: a.new_value,
    reason: a.reason,
    confidence: a.confidence,
  }))

  // Lane and broker breakdown
  const lanePerf = {}
  for (const o of outcomes) {
    if (!o.lane) continue
    if (!lanePerf[o.lane]) lanePerf[o.lane] = { loads: 0, profit: 0, correct: 0 }
    lanePerf[o.lane].loads++
    lanePerf[o.lane].profit += Number(o.actual_profit) || 0
    if (o.result === 'good' || o.result === 'acceptable') lanePerf[o.lane].correct++
  }
  const brokerPerf = {}
  for (const o of outcomes) {
    if (!o.broker_name) continue
    if (!brokerPerf[o.broker_name]) brokerPerf[o.broker_name] = { loads: 0, issues: 0 }
    brokerPerf[o.broker_name].loads++
    if (o.actual_broker_changed_rate || o.actual_broker_paid_on_time === false) brokerPerf[o.broker_name].issues++
  }

  // Q health score (composite)
  let health = 50
  if (accuracy != null) health = accuracy * 0.4
  if (profitAccuracy != null) health += profitAccuracy * 0.3
  health += Math.max(0, 30 - mistakes.length * 5) // penalty for mistakes
  health = clamp(health, 0, 100)

  const summaryData = {
    owner_id: ownerId,
    summary_date: summaryDate,
    total_decisions: outcomes.length,
    auto_booked: autoBooked,
    negotiated,
    rejected,
    decisions_with_outcomes: withOutcomes.length,
    correct_decisions: correct,
    decision_accuracy_pct: round2(accuracy),
    total_expected_profit: round2(totalExpected),
    total_actual_profit: round2(totalActual),
    profit_delta: round2(profitDelta),
    profit_accuracy_pct: round2(profitAccuracy),
    total_mistakes: mistakes.length,
    critical_mistakes: mistakes.filter(m => m.severity === 'critical').length,
    top_mistakes: topMistakes,
    repeated_patterns: repeatedPatterns,
    adjustments_proposed: adjustments.filter(a => a.status === 'proposed').length,
    adjustments_applied: adjustments.filter(a => a.status === 'applied').length,
    adjustments_detail: adjDetail,
    suggested_adjustments: proposed,
    lane_performance: lanePerf,
    broker_performance: brokerPerf,
    q_health_score: round2(health),
  }

  // Upsert (idempotent per day)
  await sbUpsert('q_daily_summaries', summaryData)
  return summaryData
}

function suggestForPattern(pattern, count) {
  const suggestions = {
    bad_accept: `${count} bad accepts this week — consider raising auto-accept threshold`,
    missed_good_load: `${count} missed loads — review reject threshold, may be too aggressive`,
    failed_negotiation: `${count} failed negotiations — consider lowering markup %`,
    broker_reliability_miss: `${count} broker issues — update broker scores`,
    overestimated_profit: `${count} profit overestimates — fuel/deadhead calculations may need calibration`,
    detention_not_predicted: `${count} detention surprises — factor detention risk into lane scoring`,
    incorrect_lane_confidence: `${count} lane confidence errors — lane data may need recalibration`,
    deadhead_miscalculation: `${count} deadhead errors — check deadhead estimation accuracy`,
    underestimated_profit: `${count} profit underestimates — Q may be too conservative`,
  }
  return suggestions[pattern] || `${count} occurrences this week — investigate root cause`
}


// ═══════════════════════════════════════════════════════════════════════════════
// FULL PIPELINE — Process outcome end-to-end
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Complete learning pipeline for a single load outcome:
 * 1. Record outcome
 * 2. Detect mistakes
 * 3. Update lane performance
 * 4. Update broker performance
 * Returns all results for the caller.
 */
export async function processLoadOutcome(ownerId, loadData, decisionData) {
  const outcome = await recordLoadOutcome(ownerId, loadData, decisionData)
  const mistakes = await detectMistakes(ownerId, outcome)
  const laneUpdate = await updateLanePerformance(ownerId, outcome).catch(() => null)
  const brokerUpdate = await updateBrokerPerformance(ownerId, outcome).catch(() => null)

  return {
    ok: true,
    outcome,
    mistakes,
    lane: laneUpdate,
    broker: brokerUpdate,
  }
}

/**
 * Get learning dashboard data for the Q Operations UI
 */
export async function getLearningDashboard(ownerId) {
  const [
    recentOutcomes,
    recentMistakes,
    recentAdjustments,
    topLanes,
    topBrokers,
    recentSummary,
  ] = await Promise.all([
    sbQuery('load_outcomes', `owner_id=eq.${ownerId}&order=load_completed_at.desc&limit=20`).catch(() => []),
    sbQuery('q_mistakes', `owner_id=eq.${ownerId}&order=created_at.desc&limit=20`).catch(() => []),
    sbQuery('q_adjustments', `owner_id=eq.${ownerId}&order=created_at.desc&limit=10`).catch(() => []),
    sbQuery('lane_performance', `owner_id=eq.${ownerId}&order=total_loads.desc&limit=10`).catch(() => []),
    sbQuery('broker_performance', `owner_id=eq.${ownerId}&order=total_loads.desc&limit=10`).catch(() => []),
    sbQuery('q_daily_summaries', `owner_id=eq.${ownerId}&order=summary_date.desc&limit=7`).catch(() => []),
  ])

  // Aggregate stats
  const totalOutcomes = recentOutcomes?.length || 0
  const goodOutcomes = (recentOutcomes || []).filter(o => o.result === 'good').length
  const badOutcomes = (recentOutcomes || []).filter(o => o.result === 'bad').length
  const accuracy = totalOutcomes > 0 ? Math.round((goodOutcomes / totalOutcomes) * 100) : null

  return {
    ok: true,
    stats: { totalOutcomes, goodOutcomes, badOutcomes, accuracy },
    recentOutcomes: recentOutcomes || [],
    recentMistakes: recentMistakes || [],
    recentAdjustments: recentAdjustments || [],
    topLanes: topLanes || [],
    topBrokers: topBrokers || [],
    dailySummaries: recentSummary || [],
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function rollingAvg(prev, newVal, count) {
  if (newVal == null) return prev
  if (prev == null) return newVal
  return ((prev * (count - 1)) + newVal) / count
}

function clamp(val, min, max) { return Math.max(min, Math.min(max, val)) }
function round2(val) { return val != null ? Math.round(val * 100) / 100 : null }
function thirtyDaysAgo() { return new Date(Date.now() - 30 * 86400000).toISOString() }
