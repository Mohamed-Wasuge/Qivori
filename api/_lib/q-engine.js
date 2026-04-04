// ═══════════════════════════════════════════════════════════════════════════════
// Q ENGINE — Core service library for the Qivori Operating System
// Shared by all dispatch API routes. Handles DB operations, event logging,
// failure tracking, and fleet state management.
// ═══════════════════════════════════════════════════════════════════════════════

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

// ── Supabase helpers ──────────────────────────────────────────────────────────

function sbHeaders() {
  return {
    'apikey': SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  }
}

/** Generic Supabase REST request with error handling */
export async function sbRequest(path, options = {}) {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new QError('system_error', 'Missing SUPABASE_URL or SERVICE_KEY env vars')
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: { ...sbHeaders(), ...(options.headers || {}) },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error')
    throw new QError('api_failure', `Supabase ${options.method || 'GET'} ${path} failed: ${res.status} ${text}`)
  }
  const contentType = res.headers.get('content-type') || ''
  if (contentType.includes('json')) return res.json()
  return null
}

/** Insert a row and return it */
export async function sbInsert(table, data) {
  return sbRequest(table, {
    method: 'POST',
    headers: { 'Prefer': 'return=representation' },
    body: JSON.stringify(data),
  })
}

/** Upsert a row */
export async function sbUpsert(table, data, onConflict) {
  return sbRequest(table, {
    method: 'POST',
    headers: { 'Prefer': `resolution=merge-duplicates${onConflict ? '' : ''},return=representation` },
    body: JSON.stringify(data),
  })
}

/** Update rows matching filter */
export async function sbUpdate(table, filter, data) {
  return sbRequest(`${table}?${filter}`, {
    method: 'PATCH',
    headers: { 'Prefer': 'return=representation' },
    body: JSON.stringify(data),
  })
}

/** Query rows */
export async function sbQuery(table, filter = '', select = '*') {
  const q = filter ? `${table}?select=${select}&${filter}` : `${table}?select=${select}`
  return sbRequest(q)
}


// ── Custom Error ──────────────────────────────────────────────────────────────

export class QError extends Error {
  constructor(type, message, details = {}) {
    super(message)
    this.type = type        // matches dispatch_failures.failure_type
    this.details = details
  }
}


// ── Dispatch Events (audit trail) ─────────────────────────────────────────────

/**
 * Log a dispatch event. Never throws — failures are logged to console.
 * @param {string} ownerId
 * @param {string} loadId
 * @param {string} eventType - from dispatch_events.event_type enum
 * @param {object} opts - { actor, actorId, oldValue, newValue, details, notes, sourceChannel, decisionId }
 */
export async function logEvent(ownerId, loadId, eventType, opts = {}) {
  try {
    await sbInsert('dispatch_events', {
      owner_id: ownerId,
      load_id: loadId,
      dispatch_decision_id: opts.decisionId || null,
      event_type: eventType,
      actor: opts.actor || 'system',
      actor_id: opts.actorId || null,
      old_value: opts.oldValue || null,
      new_value: opts.newValue || null,
      details: opts.details || {},
      notes: opts.notes || null,
      source_channel: opts.sourceChannel || 'system',
    })
  } catch (err) {
    console.error(`[Q] Failed to log event ${eventType} for load ${loadId}:`, err.message)
  }
}


// ── Dispatch Failures ─────────────────────────────────────────────────────────

/**
 * Record a failure. Returns the failure record.
 * @param {string} ownerId
 * @param {string} failureType - from dispatch_failures.failure_type enum
 * @param {string} description
 * @param {object} opts - { loadId, driverId, decisionId, severity, maxRetries, retryAfterMs, fallbackAction }
 */
export async function recordFailure(ownerId, failureType, description, opts = {}) {
  try {
    const retryAfter = opts.retryAfterMs
      ? new Date(Date.now() + opts.retryAfterMs).toISOString()
      : null
    const rows = await sbInsert('dispatch_failures', {
      owner_id: ownerId,
      load_id: opts.loadId || null,
      driver_id: opts.driverId || null,
      dispatch_decision_id: opts.decisionId || null,
      failure_type: failureType,
      severity: opts.severity || 'medium',
      description,
      max_retries: opts.maxRetries ?? 3,
      retry_after: retryAfter,
      fallback_action: opts.fallbackAction || null,
    })
    return rows?.[0] || null
  } catch (err) {
    console.error(`[Q] Failed to record failure ${failureType}:`, err.message)
    return null
  }
}

/**
 * Mark a failure as resolved.
 */
export async function resolveFailure(failureId, resolvedBy, resolution) {
  try {
    await sbUpdate('dispatch_failures', `id=eq.${failureId}`, {
      resolved: true,
      resolved_at: new Date().toISOString(),
      resolved_by: resolvedBy,
      resolution,
    })
  } catch (err) {
    console.error(`[Q] Failed to resolve failure ${failureId}:`, err.message)
  }
}

/**
 * Get unresolved failures eligible for retry.
 */
export async function getRetryableFailures(ownerId) {
  try {
    return await sbQuery(
      'dispatch_failures',
      `owner_id=eq.${ownerId}&resolved=eq.false&retry_after=lte.${new Date().toISOString()}&retry_count=lt.max_retries&order=created_at.asc&limit=10`
    )
  } catch {
    return []
  }
}

/**
 * Increment retry count on a failure.
 */
export async function incrementRetry(failureId) {
  try {
    // Fetch current, increment, update
    const rows = await sbQuery('dispatch_failures', `id=eq.${failureId}`, 'retry_count')
    if (rows?.[0]) {
      await sbUpdate('dispatch_failures', `id=eq.${failureId}`, {
        retry_count: (rows[0].retry_count || 0) + 1,
        retry_after: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 min backoff
      })
    }
  } catch (err) {
    console.error(`[Q] Failed to increment retry for ${failureId}:`, err.message)
  }
}


// ── Truck Status (fleet state) ────────────────────────────────────────────────

/**
 * Get all truck statuses for a carrier.
 */
export async function getFleetStatus(ownerId) {
  return sbQuery('truck_status', `owner_id=eq.${ownerId}&order=status.asc`)
}

/**
 * Get available trucks (READY_FOR_LOAD or EMPTY).
 */
export async function getAvailableTrucks(ownerId) {
  return sbQuery(
    'truck_status',
    `owner_id=eq.${ownerId}&status=in.(READY_FOR_LOAD,EMPTY)&order=updated_at.asc`
  )
}

/**
 * Update truck status with audit logging.
 */
export async function updateTruckStatus(ownerId, vehicleId, newStatus, opts = {}) {
  try {
    // Get current status
    const existing = await sbQuery('truck_status', `owner_id=eq.${ownerId}&vehicle_id=eq.${vehicleId}`)
    const oldStatus = existing?.[0]?.status || 'UNKNOWN'

    const updateData = {
      status: newStatus,
      status_changed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...(opts.statusReason && { status_reason: opts.statusReason }),
      ...(opts.currentLoadId !== undefined && { current_load_id: opts.currentLoadId }),
      ...(opts.currentCity && { current_city: opts.currentCity }),
      ...(opts.currentState && { current_state: opts.currentState }),
      ...(opts.lat && { lat: opts.lat }),
      ...(opts.lng && { lng: opts.lng }),
      ...(opts.pickupEta && { pickup_eta: opts.pickupEta }),
      ...(opts.deliveryEta && { delivery_eta: opts.deliveryEta }),
      ...(opts.availableAt && { available_at: opts.availableAt }),
      ...(opts.nextAvailableCity && { next_available_city: opts.nextAvailableCity }),
      ...(opts.hosData && {
        hos_drive_remaining: opts.hosData.drive,
        hos_duty_remaining: opts.hosData.duty,
        hos_cycle_remaining: opts.hosData.cycle,
        hos_updated_at: new Date().toISOString(),
      }),
    }

    if (existing?.[0]) {
      await sbUpdate('truck_status', `owner_id=eq.${ownerId}&vehicle_id=eq.${vehicleId}`, updateData)
    } else {
      await sbInsert('truck_status', { owner_id: ownerId, vehicle_id: vehicleId, ...updateData })
    }

    // Log the state change
    if (opts.loadId) {
      await logEvent(ownerId, opts.loadId, 'status_change', {
        actor: 'ai',
        oldValue: oldStatus,
        newValue: newStatus,
        notes: opts.statusReason || `Truck status: ${oldStatus} → ${newStatus}`,
      })
    }

    return { oldStatus, newStatus }
  } catch (err) {
    console.error(`[Q] Failed to update truck status for vehicle ${vehicleId}:`, err.message)
    throw err
  }
}


// ── Driver Communication ──────────────────────────────────────────────────────

/**
 * Log a driver communication (outbound or inbound).
 * Returns the created record.
 */
export async function logDriverComm(ownerId, driverId, messageType, body, opts = {}) {
  try {
    const rows = await sbInsert('driver_comms', {
      owner_id: ownerId,
      driver_id: driverId,
      load_id: opts.loadId || null,
      direction: opts.direction || 'outbound',
      channel: opts.channel || 'sms',
      message_type: messageType,
      body,
      parsed_intent: opts.parsedIntent || null,
      parsed_data: opts.parsedData || {},
      external_id: opts.externalId || null,
      delivery_status: opts.deliveryStatus || 'sent',
      requires_response: opts.requiresResponse || false,
      response_deadline: opts.responseDeadline || null,
    })
    return rows?.[0] || null
  } catch (err) {
    console.error(`[Q] Failed to log driver comm:`, err.message)
    return null
  }
}

/**
 * Get pending responses (messages awaiting driver reply).
 */
export async function getPendingResponses(ownerId) {
  return sbQuery(
    'driver_comms',
    `owner_id=eq.${ownerId}&requires_response=eq.true&responded_at=is.null&direction=eq.outbound&order=created_at.asc`
  )
}


// ── Negotiation Sessions ──────────────────────────────────────────────────────

/**
 * Create a new negotiation session.
 */
export async function createNegotiation(ownerId, data) {
  const rows = await sbInsert('negotiation_sessions', {
    owner_id: ownerId,
    load_id: data.loadId,
    dispatch_decision_id: data.decisionId || null,
    broker_name: data.brokerName || null,
    broker_phone: data.brokerPhone || null,
    broker_email: data.brokerEmail || null,
    status: 'NOT_STARTED',
    initial_offer: data.initialOffer || null,
    target_rate: data.targetRate || null,
    min_accept_rate: data.minAcceptRate || null,
    lane: data.lane || null,
    miles: data.miles || null,
    equipment_type: data.equipmentType || null,
    pickup_date: data.pickupDate || null,
    max_rounds: data.maxRounds || 3,
    timeout_at: data.timeoutAt || new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1h default
  })
  return rows?.[0] || null
}

/**
 * Update negotiation status with transcript entry.
 */
export async function updateNegotiation(sessionId, updates, transcriptEntry = null) {
  const data = { ...updates, updated_at: new Date().toISOString() }

  if (transcriptEntry) {
    // Append to transcript array
    const existing = await sbQuery('negotiation_sessions', `id=eq.${sessionId}`, 'transcript')
    const transcript = existing?.[0]?.transcript || []
    transcript.push({
      timestamp: new Date().toISOString(),
      ...transcriptEntry,
    })
    data.transcript = transcript
  }

  if (updates.status === 'ACCEPTED' || updates.status === 'LOST' || updates.status === 'NO_RESPONSE' || updates.status === 'EXPIRED') {
    data.resolved_at = new Date().toISOString()
  }
  if (updates.status === 'CONTACT_ATTEMPTED' && !updates.last_contact_at) {
    data.last_contact_at = new Date().toISOString()
  }

  await sbUpdate('negotiation_sessions', `id=eq.${sessionId}`, data)
}

/**
 * Get active negotiations for a carrier.
 */
export async function getActiveNegotiations(ownerId) {
  return sbQuery(
    'negotiation_sessions',
    `owner_id=eq.${ownerId}&status=not.in.(ACCEPTED,LOST,NO_RESPONSE,EXPIRED)&order=created_at.desc`
  )
}


// ── Carrier Settings ──────────────────────────────────────────────────────────

/**
 * Get carrier dispatch settings (with defaults).
 */
export async function getCarrierSettings(ownerId) {
  const rows = await sbQuery('carrier_settings', `owner_id=eq.${ownerId}`)
  const s = rows?.[0] || {}
  return {
    minProfit: s.min_profit ?? 800,
    minRpm: parseFloat(s.min_rpm) || 1.00,
    minProfitPerDay: s.min_profit_per_day ?? 400,
    maxDeadheadMiles: s.max_deadhead_miles ?? 150,
    maxDeadheadPct: parseFloat(s.max_deadhead_pct) || 15.0,
    preferredMaxWeight: s.preferred_max_weight ?? 37000,
    autoBookConfidence: s.auto_book_confidence ?? 75,
    autoBookEnabled: s.auto_book_enabled ?? true,
    fuelCostPerMile: parseFloat(s.fuel_cost_per_mile) || 0.55,
    enforceCompliance: s.enforce_compliance ?? true,
    hosMinHours: parseFloat(s.hos_min_hours) || 6.0,
    autoInvoiceOnDelivery: s.auto_invoice_on_delivery ?? true,
    qEnabled: s.q_enabled ?? true,
    morningCheckEnabled: s.morning_check_enabled ?? true,
    morningCheckTime: s.morning_check_time || '06:00',
    driverResponseTimeout: s.driver_response_timeout ?? 15,
    brokerResponseTimeout: s.broker_response_timeout ?? 60,
    maxNegotiationRounds: s.max_negotiation_rounds ?? 3,
    negotiationMarkupPct: s.negotiation_markup_pct ?? 10,
    autoRejectBelow: s.auto_reject_below ?? 800,
    autoAcceptAbove: s.auto_accept_above ?? 1200,
    lightLoadThreshold: s.light_load_threshold ?? 37000,
    maxHoldDays: s.max_hold_days ?? 2,
    preferredEquipment: s.preferred_equipment || [],
    avoidDeadZones: s.avoid_dead_zones ?? true,
    highProfitOverride: s.high_profit_override ?? true,
    defaultPaymentTerms: s.default_payment_terms || 'NET 30',
    factoringCompany: s.factoring_company || null,
    factoringRate: parseFloat(s.factoring_rate) || 2.5,
  }
}


// ── Explanation Layer ─────────────────────────────────────────────────────────

/**
 * Generate a human-readable explanation for a dispatch decision.
 * @param {string} decision - 'reject', 'negotiate', 'accept', 'auto_book'
 * @param {object} metrics - calculated metrics from decision engine
 * @param {object} settings - carrier settings
 * @returns {object} { summary, reasons[], clarity }
 */
export function explainDecision(decision, metrics, settings) {
  const m = metrics || {}
  const reasons = []
  let summary = ''

  const profit = m.totalProfit || 0
  const rpm = m.rpm || 0
  const profitPerDay = m.profitPerDay || 0
  const deadhead = m.deadheadMiles || 0
  const weight = m.weight || 0
  const reloadProb = m.reloadProbability || 0

  if (decision === 'reject') {
    summary = `Rejected: ${profit < (settings.minProfit || 800) ? 'low profit' : rpm < (settings.minRpm || 1.0) ? 'poor rate per mile' : 'does not meet thresholds'}.`
    if (profit < (settings.minProfit || 800)) reasons.push(`Net profit $${profit} below $${settings.minProfit || 800} minimum`)
    if (rpm < (settings.minRpm || 1.0)) reasons.push(`RPM $${rpm.toFixed(2)} below $${(settings.minRpm || 1.0).toFixed(2)} target`)
    if (profitPerDay < (settings.minProfitPerDay || 400)) reasons.push(`$${profitPerDay}/day below $${settings.minProfitPerDay || 400}/day target`)
    if (deadhead > (settings.maxDeadheadMiles || 150)) reasons.push(`${deadhead}mi deadhead exceeds ${settings.maxDeadheadMiles || 150}mi limit`)
    if (m.isDeadZone) reasons.push(`Destination is a dead zone — low reload probability`)
    if (m.isTrapLoad) reasons.push(`Trap load: high gross masks poor per-day return`)
  } else if (decision === 'negotiate') {
    summary = `Negotiating: rate is close but needs increase to meet target profit.`
    reasons.push(`Current profit $${profit} — target $${settings.autoAcceptAbove || 1200}+`)
    reasons.push(`RPM $${rpm.toFixed(2)} — pushing for $${((settings.autoAcceptAbove || 1200) / (m.loadedMiles || 1)).toFixed(2)}+`)
    if (m.brokerUrgency > 60) reasons.push(`Broker urgency ${m.brokerUrgency}/100 — leverage for higher rate`)
    if (m.pickupUrgency > 50) reasons.push(`Pickup urgency high — broker may flex on rate`)
  } else if (decision === 'accept' || decision === 'auto_book') {
    summary = `${decision === 'auto_book' ? 'Auto-booked' : 'Accepted'}: strong profit${reloadProb > 70 ? ', high reload chance' : ''}.`
    reasons.push(`Net profit $${profit} ($${rpm.toFixed(2)}/mi, $${profitPerDay}/day)`)
    if (weight > 0 && weight <= (settings.lightLoadThreshold || 37000)) reasons.push(`Light load (${(weight / 1000).toFixed(0)}K lbs) — preferred`)
    if (reloadProb > 70) reasons.push(`${reloadProb}% reload probability at destination`)
    if (deadhead < 50) reasons.push(`Low deadhead: only ${deadhead}mi to pickup`)
    if (m.isHotMarket) reasons.push(`Destination is a hot market`)
  }

  if (reasons.length === 0) reasons.push('Standard evaluation criteria applied')

  return {
    summary,
    reasons,
    clarity: {
      chosen: summary,
      whyNotReject: decision !== 'reject' ? `Profit $${profit} exceeds $${settings.minProfit || 800} minimum` : null,
      whyNotAccept: decision !== 'accept' && decision !== 'auto_book' ? `Does not meet auto-accept threshold of $${settings.autoAcceptAbove || 1200}` : null,
      whyNotNegotiate: decision !== 'negotiate' ? (decision === 'reject' ? 'Below negotiation floor' : 'Already meets accept criteria') : null,
    },
  }
}


// ── Retry Wrapper ─────────────────────────────────────────────────────────────

/**
 * Execute a function with retry logic. On final failure, records a dispatch_failure.
 * @param {Function} fn - async function to execute
 * @param {object} context - { ownerId, loadId, driverId, decisionId, failureType, description }
 * @param {object} opts - { maxRetries: 3, backoffMs: 2000 }
 */
export async function withRetry(fn, context, opts = {}) {
  const maxRetries = opts.maxRetries ?? 3
  const backoffMs = opts.backoffMs ?? 2000
  let lastError = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn(attempt)
    } catch (err) {
      lastError = err
      console.error(`[Q] Attempt ${attempt + 1}/${maxRetries + 1} failed for ${context.failureType || 'unknown'}:`, err.message)
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, backoffMs * Math.pow(2, attempt)))
      }
    }
  }

  // All retries exhausted — record failure
  await recordFailure(
    context.ownerId,
    context.failureType || 'system_error',
    context.description || lastError?.message || 'Unknown failure after retries',
    {
      loadId: context.loadId,
      driverId: context.driverId,
      decisionId: context.decisionId,
      severity: context.severity || 'high',
      maxRetries,
      fallbackAction: context.fallbackAction || 'escalate_to_admin',
    }
  )

  // Also log event
  if (context.loadId) {
    await logEvent(context.ownerId, context.loadId, 'system_error', {
      actor: 'system',
      notes: `Failed after ${maxRetries + 1} attempts: ${lastError?.message}`,
      details: { failureType: context.failureType, attempts: maxRetries + 1 },
    })
  }

  throw lastError
}
