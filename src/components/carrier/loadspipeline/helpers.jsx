import React from 'react'
import { CheckCircle, XCircle, MessageSquare } from 'lucide-react'
import { compareToMarket } from '../../../lib/marketRates'
import { Ic } from '../shared'

// Inline RateBadge to avoid importing entire LoadBoard chunk
export function RateBadge({ rpm, equipment, onClick, compact }) {
  const mktAvg = { 'Dry Van': 2.50, 'Reefer': 2.90, 'Flatbed': 3.10, 'Step Deck': 3.30, 'Power Only': 2.10, 'Tanker': 3.30 }
  const avg = mktAvg[equipment] || 2.50
  const rpmNum = Number(rpm) || 0
  if (rpmNum <= 0) return null
  let color, label, emoji
  if (rpmNum >= avg * 1.1) { color = 'var(--success)'; label = 'Good'; emoji = '\u{1F7E2}' }
  else if (rpmNum >= avg * 0.92) { color = 'var(--accent)'; label = 'Fair'; emoji = '\u{1F7E1}' }
  else { color = 'var(--danger)'; label = 'Below'; emoji = '\u{1F534}' }
  if (compact) return <span onClick={onClick} title={label + ' rate'} style={{ fontSize: 10, cursor: onClick ? 'pointer' : 'default', display: 'inline-flex', alignItems: 'center', gap: 2 }}>{emoji}</span>
  return (<div onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 8px', borderRadius: 6, background: color + '12', border: '1px solid ' + color + '25', cursor: onClick ? 'pointer' : 'default', fontSize: 10, fontWeight: 700, color }}>{emoji} {label} &middot; ${rpmNum.toFixed(2)}/mi{onClick && <span style={{ fontSize: 9, opacity: 0.7 }}> Analyze</span>}</div>)
}

// ── Q Load Intelligence Engine ───────────────────────────────────────────────
// Evaluates loads using real trucking profit logic — not just top-line rate.
export function qEvaluateLoad(load, { fuelCostPerMile, drivers, brokerStats, allLoads }) {
  const gross = load.gross || load.gross_pay || load.rate_total || 0
  const miles = parseFloat(load.miles) || 0
  const weight = parseFloat(load.weight) || 0
  const rpm = miles > 0 ? gross / miles : 0
  const fuelRate = fuelCostPerMile // from CarrierContext (EIA diesel price / MPG)

  // Estimate driver pay (use assigned driver's rate or default 50%)
  const driverRec = (drivers || []).find(d => (d.full_name || d.name) === load.driver)
  const payModel = driverRec?.pay_model || 'percent'
  const payRate = parseFloat(driverRec?.pay_rate) || 0
  const driverPay = payModel === 'permile' ? miles * payRate : payModel === 'flat' ? payRate : gross * (payRate / 100)

  // Fuel cost
  const fuelCost = miles * fuelRate

  // Estimated profit
  const estProfit = gross - driverPay - fuelCost
  const profitPerMile = miles > 0 ? estProfit / miles : 0

  // Profit per day (assume 500 mi/day for transit, + 0.5 day for pickup/delivery)
  const transitDays = miles > 0 ? Math.max(miles / 500, 0.5) + 0.5 : 1
  const profitPerDay = estProfit / transitDays

  // Broker score (from brokerStats or heuristic)
  const brokerName = load.broker || load.broker_name || ''
  const brokerData = brokerStats?.[brokerName]
  let brokerScore = 'B' // default
  let brokerReliability = 'Unknown'
  if (brokerData) {
    const payRate = brokerData.onTimePay || 0.8
    const loadCount = brokerData.totalLoads || 0
    if (payRate >= 0.9 && loadCount >= 5) { brokerScore = 'A'; brokerReliability = 'Reliable' }
    else if (payRate >= 0.75) { brokerScore = 'B'; brokerReliability = 'Average' }
    else { brokerScore = 'C'; brokerReliability = 'Risky' }
  } else {
    // Heuristic: known large brokers
    const knownGood = ['ch robinson','tql','schneider','jb hunt','xpo','echo','coyote','landstar']
    if (knownGood.some(b => brokerName.toLowerCase().includes(b))) { brokerScore = 'A'; brokerReliability = 'Major Broker' }
  }

  // Lane quality — check historical loads on this lane
  const origin3 = (load.origin || '').split(',')[0]?.substring(0,3)?.toUpperCase() || ''
  const dest3 = (load.dest || load.destination || '').split(',')[0]?.substring(0,3)?.toUpperCase() || ''
  const lanePrev = (allLoads || []).filter(l => {
    const lo = (l.origin || '').split(',')[0]?.substring(0,3)?.toUpperCase() || ''
    const ld = (l.dest || l.destination || '').split(',')[0]?.substring(0,3)?.toUpperCase() || ''
    return lo === origin3 && ld === dest3 && l.loadId !== load.loadId
  })
  const laneHistory = lanePrev.length
  const laneAvgRPM = lanePrev.length > 0 ? lanePrev.reduce((s,l) => s + ((l.gross || 0) / Math.max(l.miles || 1, 1)), 0) / lanePrev.length : 0

  // Fuel surcharge modeling — dynamic based on real EIA diesel price
  const baseDiesel = 3.50 // baseline $/gal (DOE national avg reference)
  const currentDiesel = fuelRate * 7 // back-calculate from per-mile cost (assumes ~7 MPG)
  const fuelSurcharge = currentDiesel > baseDiesel ? ((currentDiesel - baseDiesel) / 7) * miles : 0
  const hasHighFuel = currentDiesel > baseDiesel * 1.15 // 15%+ above baseline

  // Backhaul / deadhead detection — check if this load's origin is near a recent delivery
  const recentDelivered = (allLoads || []).filter(l =>
    (l.status === 'Delivered' || l.status === 'Invoiced') &&
    l.loadId !== load.loadId
  )
  const loadOrigin = (load.origin || '').toLowerCase().trim()
  let isBackhaul = false
  let deadheadNote = ''
  for (const prev of recentDelivered) {
    const prevDest = (prev.dest || prev.destination || '').toLowerCase().trim()
    // Simple match: same city or first 3 chars match
    if (prevDest && loadOrigin && (
      prevDest === loadOrigin ||
      (prevDest.split(',')[0]?.substring(0,3) === loadOrigin.split(',')[0]?.substring(0,3))
    )) {
      isBackhaul = true
      deadheadNote = `Backhaul from ${prev.loadId || 'recent'} delivery`
      break
    }
  }

  // Weight analysis
  const isHeavy = weight > 37000
  const isLight = weight > 0 && weight <= 37000
  const weightNote = weight === 0 ? 'Weight not specified' : isHeavy ? 'Heavy load (>37K lbs)' : 'Light load'

  // Equipment/type detection
  const isPowerOnly = (load.equipment || '').toLowerCase().includes('power only')
  const isDropHook = (load.commodity || '').toLowerCase().includes('drop') || (load.notes || '').toLowerCase().includes('drop & hook')

  // Pickup urgency — same-day/next-day means broker is desperate
  let pickupUrgency = 'normal' // normal | soon | urgent
  let urgencyNote = ''
  if (load.pickup_date) {
    const pickupDate = new Date(load.pickup_date)
    const now = new Date()
    const hoursUntilPickup = (pickupDate - now) / (1000 * 60 * 60)
    if (hoursUntilPickup <= 6) { pickupUrgency = 'urgent'; urgencyNote = 'Same-day pickup — broker likely flexible on rate' }
    else if (hoursUntilPickup <= 24) { pickupUrgency = 'urgent'; urgencyNote = 'Next-day pickup — negotiate higher' }
    else if (hoursUntilPickup <= 48) { pickupUrgency = 'soon'; urgencyNote = 'Pickup in 2 days' }
  }

  // Destination market quality — known dead zones vs hot reload markets
  const DEAD_ZONES = ['laredo','el paso','mcallen','brownsville','nogales','sweetwater','lubbock','amarillo','midland','odessa']
  const HOT_MARKETS = ['dallas','houston','atlanta','chicago','los angeles','memphis','indianapolis','columbus','nashville','charlotte','jacksonville']
  const destCity = (load.dest || load.destination || '').split(',')[0]?.toLowerCase().trim() || ''
  const isDeadZone = DEAD_ZONES.some(z => destCity.includes(z))
  const isHotMarket = HOT_MARKETS.some(m => destCity.includes(m))
  let marketNote = ''
  if (isDeadZone) marketNote = `${destCity} is a dead zone — limited reload options`
  else if (isHotMarket) marketNote = `${destCity} is a hot market — easy reloads`

  // Payment terms impact
  const paymentTerms = load.payment_terms || ''
  const isQuickPay = paymentTerms.toLowerCase().includes('quick') || paymentTerms.toLowerCase().includes('same day')
  const payTermsNote = isQuickPay ? 'Quick Pay — faster cash flow' : paymentTerms ? `Payment: ${paymentTerms}` : ''

  // ── "Cheap Freight Disguised as Good" Trap Detection ──────────────────────
  // High gross can mask terrible per-day returns on multi-day loads
  let isTrapLoad = false
  let trapNote = ''
  if (gross >= 2000 && transitDays >= 2.5 && profitPerDay < 350) {
    isTrapLoad = true
    trapNote = `Trap load: $${gross.toLocaleString()} gross looks good but only $${Math.round(profitPerDay)}/day over ${transitDays.toFixed(1)} days — blocks truck for ${Math.ceil(transitDays)} days`
  }
  // Low RPM hidden by long miles
  if (gross >= 1500 && miles > 800 && rpm < 1.80 && profitPerMile < 0.80) {
    isTrapLoad = true
    trapNote = trapNote || `Trap load: $${gross.toLocaleString()} gross across ${miles}mi = only $${rpm.toFixed(2)}/mi — cheap freight disguised as good`
  }

  // ── Forward-Looking Strategic Analysis — Where Does This Truck End Up? ────
  // Check destination reload probability based on market quality
  const RELOAD_HUBS = { 'dallas': 95, 'houston': 93, 'atlanta': 92, 'chicago': 94, 'los angeles': 90, 'memphis': 88, 'indianapolis': 85, 'columbus': 84, 'nashville': 87, 'charlotte': 83, 'jacksonville': 80, 'kansas city': 82, 'louisville': 78, 'detroit': 75, 'denver': 77, 'phoenix': 76, 'orlando': 74, 'miami': 72, 'san antonio': 70, 'sacramento': 73, 'little rock': 55, 'pittsburgh': 68, 'las vegas': 60 }
  const destCityKey = (load.dest || load.destination || '').split(',')[0]?.toLowerCase().trim() || ''
  const reloadProb = Object.entries(RELOAD_HUBS).find(([city]) => destCityKey.includes(city))?.[1] || 45
  let strategicNote = ''
  if (reloadProb >= 85) strategicNote = `Destination has ${reloadProb}% reload probability — truck stays productive`
  else if (reloadProb >= 65) strategicNote = `Moderate reload market (${reloadProb}%) — may need to deadhead for next load`
  else strategicNote = `Weak reload market (${reloadProb}%) — risk of stranding truck 1-2 days`
  const isStranding = reloadProb < 55 && !isBackhaul

  // ── Consistency Scoring — Penalize One-Off High Pay That Strands Truck ────
  let consistencyPenalty = 0
  let consistencyNote = ''
  if (estProfit > 1500 && isStranding) {
    consistencyPenalty = -10
    consistencyNote = `High pay ($${Math.round(estProfit)}) but ${reloadProb}% reload probability — one-off that may strand truck`
  }
  // Reward loads that keep truck in productive corridors
  if (reloadProb >= 85 && profitPerDay >= 350) {
    consistencyPenalty = 5
    consistencyNote = `Consistent lane: good pay + ${reloadProb}% reload — keeps truck earning`
  }

  // ── Driver Burnout Detection ─────────────────────────────────────────────
  // Check recent loads for consecutive long hauls
  const recentCompleted = (allLoads || []).filter(l =>
    (l.status === 'Delivered' || l.status === 'Invoiced' || l.status === 'In Transit') &&
    l.loadId !== load.loadId
  ).slice(-5) // last 5 loads
  const recentLongHauls = recentCompleted.filter(l => (parseFloat(l.miles) || 0) > 600).length
  let burnoutRisk = 'low'
  let burnoutNote = ''
  if (recentLongHauls >= 3 && miles > 600) {
    burnoutRisk = 'high'
    burnoutNote = `${recentLongHauls} consecutive long hauls — driver fatigue risk. Consider shorter load.`
  } else if (recentLongHauls >= 2 && miles > 800) {
    burnoutRisk = 'medium'
    burnoutNote = `Back-to-back long hauls — monitor driver fatigue`
  }

  // ── Broker Negotiation Style ─────────────────────────────────────────────
  let brokerStyle = 'standard' // standard | aggressive | patient | walkaway
  let brokerTactic = ''
  if (brokerScore === 'C' && pickupUrgency === 'urgent') {
    brokerStyle = 'aggressive'
    brokerTactic = 'Risky broker + urgent pickup = maximum leverage. Push 15-20% above ask.'
  } else if (brokerScore === 'A' && pickupUrgency === 'urgent') {
    brokerStyle = 'patient'
    brokerTactic = 'Good broker under time pressure — counter 8-10% above, they will likely meet.'
  } else if (brokerScore === 'C') {
    brokerStyle = 'walkaway'
    brokerTactic = 'Low-reliability broker — demand premium or walk. Not worth the risk at market rate.'
  } else if (pickupUrgency === 'urgent') {
    brokerStyle = 'aggressive'
    brokerTactic = 'Time pressure gives you leverage — push for 10-15% above posted rate.'
  }

  // ── Market Rate Comparison ──────────────────────────────────────────────────
  const originState = (load.origin || '').split(',').pop()?.trim().replace(/[^A-Za-z]/g, '').toUpperCase().substring(0, 2) || ''
  const destState = (load.dest || load.destination || '').split(',').pop()?.trim().replace(/[^A-Za-z]/g, '').toUpperCase().substring(0, 2) || ''
  let marketData = null
  if (originState.length === 2 && destState.length === 2 && rpm > 0) {
    try {
      marketData = compareToMarket({ offeredRpm: rpm, originState, destState, equipment: load.equipment, miles, fuelCostPerMile: fuelRate })
    } catch { /* market rate unavailable */ }
  }

  // Build decision
  let decision = 'ACCEPT'
  let confidence = 85
  const reasons = []
  const risks = []
  const advantages = []
  let targetRate = null

  // Profit thresholds
  if (estProfit <= 0) {
    decision = 'REJECT'
    confidence = 95
    reasons.push('Negative or zero estimated profit')
    risks.push('Operating at a loss')
  } else if (profitPerMile < 0.50) {
    decision = 'REJECT'
    confidence = 88
    reasons.push('Profit per mile below $0.50 threshold')
    risks.push('Inefficient use of equipment time')
  } else if (profitPerMile < 1.00 && profitPerDay < 400) {
    decision = 'NEGOTIATE'
    confidence = 80
    const targetPPM = 1.20
    targetRate = Math.round(gross + (targetPPM - profitPerMile) * miles)
    reasons.push('Profit per mile below target — counteroffer recommended')
  } else if (profitPerMile >= 1.50) {
    decision = 'ACCEPT'
    confidence = 92
    reasons.push('Strong profit margin')
    advantages.push('High profit per mile')
  }

  // Market rate gate — override decisions based on market comparison
  if (marketData) {
    if (marketData.vsMarket === 'above') {
      advantages.push(`${marketData.pctDiff}% above market avg ($${marketData.marketAvg.toFixed(2)}/mi)`)
      if (decision === 'ACCEPT') confidence = Math.min(confidence + 5, 98)
    } else if (marketData.vsMarket === 'at') {
      reasons.push(`At market rate ($${marketData.marketAvg.toFixed(2)}/mi)`)
    } else if (marketData.vsMarket === 'below') {
      if (decision === 'ACCEPT') decision = 'NEGOTIATE'
      targetRate = targetRate || Math.round(marketData.marketAvg * miles)
      risks.push(`${Math.abs(marketData.pctDiff)}% below market avg ($${marketData.marketAvg.toFixed(2)}/mi)`)
      reasons.push('Rate below market — negotiate to at least market average')
    } else if (marketData.vsMarket === 'far_below') {
      decision = 'REJECT'
      confidence = 92
      risks.push(`${Math.abs(marketData.pctDiff)}% below market avg ($${marketData.marketAvg.toFixed(2)}/mi)`)
      reasons.push('Rate significantly below market — not recommended')
    }
  }

  // Weight factor
  if (isHeavy) {
    if (decision === 'ACCEPT' && profitPerMile < 1.50) {
      decision = 'NEGOTIATE'
      confidence = Math.min(confidence, 78)
      targetRate = targetRate || Math.round(gross * 1.15)
      reasons.push('Heavy load requires higher rate to justify wear')
      risks.push('Increased fuel consumption and equipment wear')
    }
  } else if (isLight) {
    advantages.push('Light weight — less fuel, less wear')
    if (decision === 'ACCEPT') confidence = Math.min(confidence + 3, 98)
  }

  // Broker risk
  if (brokerScore === 'C') {
    if (decision === 'ACCEPT') decision = 'NEGOTIATE'
    risks.push('Low broker reliability score')
    confidence = Math.min(confidence, 75)
  } else if (brokerScore === 'A') {
    advantages.push(`${brokerReliability} — consistent payments`)
    if (decision === 'ACCEPT') confidence = Math.min(confidence + 5, 98)
  }

  // Lane quality
  if (laneHistory > 0) {
    if (rpm > laneAvgRPM * 1.1) advantages.push(`Above lane average ($${laneAvgRPM.toFixed(2)}/mi)`)
    else if (rpm < laneAvgRPM * 0.85 && decision !== 'REJECT') {
      if (decision === 'ACCEPT') decision = 'NEGOTIATE'
      targetRate = targetRate || Math.round(laneAvgRPM * miles)
      reasons.push(`Below lane average RPM ($${laneAvgRPM.toFixed(2)}/mi)`)
    }
  }

  // Power-only detection
  if (isPowerOnly) {
    advantages.push('Power-only — no trailer needed')
  }

  // Drop & hook
  if (isDropHook) {
    advantages.push('Drop & hook — faster turnaround')
    if (decision === 'ACCEPT') confidence = Math.min(confidence + 2, 98)
  }

  // Backhaul bonus — reduces deadhead, worth taking at lower margins
  if (isBackhaul) {
    advantages.push(deadheadNote || 'Backhaul — eliminates deadhead miles')
    if (decision === 'NEGOTIATE' && profitPerMile >= 0.60) {
      decision = 'ACCEPT'
      confidence = Math.min(confidence + 5, 90)
      reasons.push('Backhaul reduces deadhead — lower margin acceptable')
    }
    if (decision === 'ACCEPT') confidence = Math.min(confidence + 3, 98)
  }

  // Fuel surcharge alert
  if (hasHighFuel) {
    risks.push(`Diesel ${((currentDiesel - baseDiesel) / baseDiesel * 100).toFixed(0)}% above baseline — fuel surcharge: $${Math.round(fuelSurcharge)}`)
    if (decision === 'ACCEPT' && profitPerMile < 1.20) {
      decision = 'NEGOTIATE'
      targetRate = targetRate || Math.round(gross + fuelSurcharge)
      reasons.push('High diesel prices erode margin — request fuel surcharge')
    }
  }

  // Pickup urgency — broker desperate = leverage for negotiation
  if (pickupUrgency === 'urgent') {
    advantages.push(urgencyNote)
    if (decision === 'NEGOTIATE') {
      targetRate = targetRate ? Math.round(targetRate * 1.08) : Math.round(gross * 1.12)
      reasons.push('Urgent pickup — broker has limited options, push for premium')
    }
    confidence = Math.min(confidence + 4, 98)
  }

  // Destination market quality
  if (isDeadZone) {
    risks.push(marketNote)
    if (decision === 'ACCEPT' && profitPerMile < 1.80) {
      decision = 'NEGOTIATE'
      targetRate = targetRate || Math.round(gross * 1.20)
      reasons.push('Dead zone destination — charge premium for deadhead risk')
    }
  } else if (isHotMarket) {
    advantages.push(marketNote)
    if (decision === 'ACCEPT') confidence = Math.min(confidence + 3, 98)
  }

  // Quick Pay advantage
  if (isQuickPay) {
    advantages.push(payTermsNote)
    if (decision === 'ACCEPT') confidence = Math.min(confidence + 2, 98)
  }

  // ── Smart Dispatcher: Trap Load Detection ──
  if (isTrapLoad) {
    risks.push(trapNote)
    if (decision === 'ACCEPT') {
      decision = 'NEGOTIATE'
      confidence = Math.min(confidence, 72)
      targetRate = targetRate || Math.round(gross * 1.18) // need 18% more to justify the hold
      reasons.push('Trap load detected — high gross masks poor daily return')
    }
  }

  // ── Smart Dispatcher: Strategic Positioning ──
  if (isStranding && decision !== 'REJECT') {
    risks.push(strategicNote)
    if (decision === 'ACCEPT' && profitPerMile < 1.50) {
      decision = 'NEGOTIATE'
      targetRate = targetRate || Math.round(gross * 1.15)
      reasons.push(`Truck ends up in weak market (${reloadProb}% reload) — charge premium for deadhead risk`)
    }
    confidence = Math.max(confidence - 8, 30)
  } else if (reloadProb >= 85) {
    advantages.push(strategicNote)
    if (decision === 'ACCEPT') confidence = Math.min(confidence + 3, 98)
  }

  // ── Smart Dispatcher: Consistency Scoring ──
  if (consistencyPenalty !== 0) {
    confidence = Math.max(Math.min(confidence + consistencyPenalty, 98), 30)
    if (consistencyNote) {
      if (consistencyPenalty > 0) advantages.push(consistencyNote)
      else risks.push(consistencyNote)
    }
  }

  // ── Smart Dispatcher: Driver Burnout ──
  if (burnoutRisk === 'high') {
    risks.push(burnoutNote)
    if (decision === 'ACCEPT' && miles > 600) {
      decision = 'NEGOTIATE'
      reasons.push('Driver fatigue risk — prefer shorter load or negotiate premium for long haul')
      confidence = Math.min(confidence, 70)
    }
  } else if (burnoutRisk === 'medium') {
    risks.push(burnoutNote)
    confidence = Math.max(confidence - 3, 30)
  }

  // ── Smart Dispatcher: Broker Negotiation Style ──
  if (brokerTactic) {
    if (brokerStyle === 'walkaway' && decision === 'ACCEPT' && brokerScore === 'C') {
      decision = 'NEGOTIATE'
      targetRate = targetRate || Math.round(gross * 1.15)
      reasons.push(brokerTactic)
    } else if (decision === 'NEGOTIATE' && brokerStyle === 'aggressive') {
      targetRate = targetRate ? Math.round(targetRate * 1.10) : Math.round(gross * 1.15)
    }
  }

  // ── Decision Clarity — Why this decision AND why not the alternatives ──
  const decisionClarity = {}
  if (decision === 'ACCEPT') {
    decisionClarity.chosen = `Accept: $${Math.round(estProfit)} profit ($${profitPerMile.toFixed(2)}/mi, $${Math.round(profitPerDay)}/day)`
    decisionClarity.whyNotReject = `Profit $${Math.round(estProfit)} exceeds minimums`
    decisionClarity.whyNotNegotiate = profitPerMile >= 1.00 ? `$${profitPerMile.toFixed(2)}/mi above target — no need to push` : `Strategic value (backhaul/market/urgency) favors booking now`
  } else if (decision === 'REJECT') {
    decisionClarity.chosen = reasons[0] || 'Below minimum thresholds'
    decisionClarity.whyNotAccept = risks.slice(0, 2).join('. ') || 'Unacceptable profit or market position'
    decisionClarity.whyNotNegotiate = estProfit < 200 ? 'Too far below break-even — not worth the conversation' : 'Gap too large to bridge through negotiation'
  } else {
    decisionClarity.chosen = `Negotiate: ${reasons[0] || 'Rate has potential but needs improvement'}`
    decisionClarity.whyNotAccept = risks.slice(0, 2).join('. ') || 'Rate below optimal thresholds'
    decisionClarity.whyNotReject = `Profit $${Math.round(estProfit)} shows potential if rate improves to ${targetRate ? '$' + targetRate.toLocaleString() : '5-12% higher'}`
  }

  // Build summary reason
  let summaryReason = ''
  if (decision === 'ACCEPT') {
    summaryReason = advantages.length > 0 ? advantages.slice(0,2).join(', ') + '.' : 'Meets profit thresholds.'
    if (reasons.length > 0) summaryReason += ' ' + reasons[0]
  } else if (decision === 'REJECT') {
    summaryReason = reasons[0] || 'Does not meet minimum profit requirements.'
    if (risks.length > 0) summaryReason += ' ' + risks[0] + '.'
  } else {
    summaryReason = reasons[0] || 'Rate below optimal — broker likely flexible.'
    if (advantages.length > 0) summaryReason += ' ' + advantages[0] + '.'
  }

  return {
    decision, confidence, summaryReason, targetRate, decisionClarity,
    estProfit: Math.round(estProfit), profitPerMile: profitPerMile.toFixed(2),
    profitPerDay: Math.round(profitPerDay), transitDays: transitDays.toFixed(1),
    fuelCost: Math.round(fuelCost), driverPay: Math.round(driverPay),
    brokerScore, brokerReliability, weightNote, isHeavy, isLight,
    laneHistory, laneAvgRPM: laneAvgRPM.toFixed(2),
    risks, advantages, rpm: rpm.toFixed(2),
    isPowerOnly, isDropHook, isBackhaul, deadheadNote,
    fuelSurcharge: Math.round(fuelSurcharge), hasHighFuel,
    pickupUrgency, urgencyNote, isDeadZone, isHotMarket, marketNote,
    isQuickPay, payTermsNote,
    marketData,
    // Smart Dispatcher intelligence
    isTrapLoad, trapNote,
    reloadProb, strategicNote, isStranding,
    consistencyNote,
    burnoutRisk, burnoutNote,
    brokerStyle, brokerTactic,
  }
}

export const Q_DECISION_COLORS = {
  ACCEPT: { bg:'rgba(52,176,104,0.08)', border:'rgba(52,176,104,0.25)', color:'var(--success)', icon: CheckCircle },
  REJECT: { bg:'rgba(239,68,68,0.08)', border:'rgba(239,68,68,0.25)', color:'var(--danger)', icon: XCircle },
  NEGOTIATE: { bg:'rgba(240,165,0,0.08)', border:'rgba(240,165,0,0.25)', color:'var(--accent)', icon: MessageSquare },
}

export function QDecisionBadge({ decision, compact }) {
  const d = Q_DECISION_COLORS[decision] || Q_DECISION_COLORS.ACCEPT
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:compact ? 3 : 4, fontSize: compact ? 8 : 10, fontWeight:800,
      padding: compact ? '1px 5px' : '2px 8px', borderRadius: compact ? 4 : 6,
      background:d.bg, color:d.color, border:`1px solid ${d.border}`, letterSpacing:0.5, whiteSpace:'nowrap' }}>
      <Ic icon={d.icon} size={compact ? 8 : 10} color={d.color} />
      {decision}
    </span>
  )
}
