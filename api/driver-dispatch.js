// ═══════════════════════════════════════════════════════════════════════════════
// DRIVER DISPATCH LOOP — AI-driven driver communication
// Handles: morning checks, load offers, exception reports
// POST /api/driver-dispatch?action=morning_check|offer_load|parse_response
// ═══════════════════════════════════════════════════════════════════════════════

import { handleCors, corsHeaders, requireAuth } from './_lib/auth.js'
import {
  sbQuery, sbUpdate,
  logDriverComm, getPendingResponses,
  updateTruckStatus, logEvent, recordFailure,
  getCarrierSettings, withRetry, QError,
} from './_lib/q-engine.js'

export const config = { runtime: 'edge' }

const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID
const TWILIO_AUTH = process.env.TWILIO_AUTH_TOKEN
const TWILIO_FROM = process.env.TWILIO_PHONE_NUMBER

export default async function handler(req) {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  if (req.method !== 'POST') {
    return json({ error: 'POST required' }, 405)
  }

  const authErr = await requireAuth(req)
  if (authErr) return authErr
  const user = req._user

  try {
    const body = await req.json()
    const action = body.action

    switch (action) {
      case 'morning_check':
        return await morningCheck(user, body)
      case 'offer_load':
        return await offerLoad(user, body)
      case 'parse_response':
        return await parseResponse(user, body)
      case 'exception':
        return await handleException(user, body)
      case 'check_pending':
        return await checkPending(user)
      default:
        return json({ error: `Unknown action: ${action}. Valid: morning_check, offer_load, parse_response, exception, check_pending` }, 400)
    }
  } catch (err) {
    console.error('[driver-dispatch] Error:', err.message)
    return json({ error: err.message }, 500)
  }
}


// ── Morning Readiness Check ───────────────────────────────────────────────────
// Texts each driver: "Good morning, are you ready for work today?"
// Records outbound message, waits for response
async function morningCheck(user, body) {
  const { driverId } = body
  const settings = await getCarrierSettings(user.id)

  if (!settings.morningCheckEnabled) {
    return json({ ok: true, skipped: true, reason: 'Morning check disabled in settings' })
  }

  // Get drivers to check (specific or all)
  let drivers
  if (driverId) {
    drivers = await sbQuery('drivers', `owner_id=eq.${user.id}&id=eq.${driverId}`)
  } else {
    drivers = await sbQuery('drivers', `owner_id=eq.${user.id}&morning_check_enabled=eq.true&status=eq.Active`)
  }

  if (!drivers?.length) {
    return json({ ok: true, skipped: true, reason: 'No drivers eligible for morning check' })
  }

  const results = []

  for (const driver of drivers) {
    const phone = driver.phone || driver.phone_number
    if (!phone) {
      results.push({ driverId: driver.id, name: driver.name, status: 'skipped', reason: 'No phone number' })
      continue
    }

    const driverName = (driver.name || driver.full_name || 'Driver').split(' ')[0]
    const message = `Good morning ${driverName}, this is Q from ${user.company_name || 'Qivori'}. Are you ready for work today? Reply YES or what time you'll be available.`

    const deadline = new Date(Date.now() + (settings.driverResponseTimeout || 15) * 60 * 1000)

    // Send SMS
    const smsResult = await sendSMS(phone, message)

    // Log communication
    const comm = await logDriverComm(user.id, driver.id, 'morning_check', message, {
      direction: 'outbound',
      channel: 'sms',
      externalId: smsResult?.sid || null,
      deliveryStatus: smsResult?.ok ? 'sent' : 'failed',
      requiresResponse: true,
      responseDeadline: deadline.toISOString(),
    })

    if (!smsResult?.ok) {
      await recordFailure(user.id, 'sms_failed', `Morning check SMS failed for ${driverName}: ${smsResult?.error}`, {
        driverId: driver.id,
        severity: 'medium',
        fallbackAction: 'retry_in_10_min',
        retryAfterMs: 10 * 60 * 1000,
      })
      results.push({ driverId: driver.id, name: driverName, status: 'failed', error: smsResult?.error })
    } else {
      // Set truck status to waiting for response
      const trucks = await sbQuery('truck_status', `owner_id=eq.${user.id}&driver_id=eq.${driver.id}`)
      if (trucks?.[0]) {
        await updateTruckStatus(user.id, trucks[0].vehicle_id, 'WAITING_DRIVER_RESPONSE', {
          statusReason: 'Morning check sent, awaiting response',
        })
      }
      results.push({ driverId: driver.id, name: driverName, status: 'sent', commId: comm?.id })
    }
  }

  return json({ ok: true, results })
}


// ── Load Offer ────────────────────────────────────────────────────────────────
// Sends driver a short load summary, asks to accept/decline
async function offerLoad(user, body) {
  const { driverId, loadId, loadSummary } = body
  if (!driverId || !loadId) return json({ error: 'driverId and loadId required' }, 400)

  const drivers = await sbQuery('drivers', `owner_id=eq.${user.id}&id=eq.${driverId}`)
  const driver = drivers?.[0]
  if (!driver) return json({ error: 'Driver not found' }, 404)

  const phone = driver.phone || driver.phone_number
  if (!phone) return json({ error: 'Driver has no phone number' }, 400)

  const settings = await getCarrierSettings(user.id)
  const driverName = (driver.name || driver.full_name || 'Driver').split(' ')[0]

  // Build load summary
  const ls = loadSummary || {}
  const origin = ls.origin || 'pickup'
  const dest = ls.dest || 'delivery'
  const gross = ls.gross ? `$${ls.gross.toLocaleString()}` : 'TBD'
  const miles = ls.miles ? `${ls.miles}mi` : ''
  const pickup = ls.pickupDate || 'ASAP'

  const message = `Q Load Offer for ${driverName}:\n${origin} → ${dest}\n${gross} ${miles}\nPickup: ${pickup}\n\nReply ACCEPT or DECLINE`

  const deadline = new Date(Date.now() + (settings.driverResponseTimeout || 15) * 60 * 1000)

  const smsResult = await sendSMS(phone, message)

  const comm = await logDriverComm(user.id, driver.id, 'load_offer', message, {
    direction: 'outbound',
    channel: 'sms',
    loadId,
    externalId: smsResult?.sid || null,
    deliveryStatus: smsResult?.ok ? 'sent' : 'failed',
    requiresResponse: true,
    responseDeadline: deadline.toISOString(),
  })

  if (!smsResult?.ok) {
    await recordFailure(user.id, 'sms_failed', `Load offer SMS failed for ${driverName}`, {
      loadId, driverId: driver.id, severity: 'high',
      fallbackAction: 'try_next_driver',
    })

    await logEvent(user.id, loadId, 'system_error', {
      actor: 'system',
      notes: `Failed to send load offer to ${driverName}: ${smsResult?.error}`,
    })

    return json({ ok: false, error: 'SMS failed', details: smsResult?.error }, 500)
  }

  // Update truck status
  const trucks = await sbQuery('truck_status', `owner_id=eq.${user.id}&driver_id=eq.${driver.id}`)
  if (trucks?.[0]) {
    await updateTruckStatus(user.id, trucks[0].vehicle_id, 'WAITING_DRIVER_RESPONSE', {
      statusReason: `Load offer sent: ${origin} → ${dest}`,
      currentLoadId: loadId,
    })
  }

  await logEvent(user.id, loadId, 'driver_contacted', {
    actor: 'ai',
    actorId: driver.id,
    notes: `Load offer sent to ${driverName} via SMS`,
    details: { gross: ls.gross, origin, dest },
  })

  return json({ ok: true, status: 'offer_sent', commId: comm?.id, deadline: deadline.toISOString() })
}


// ── Parse Driver Response ─────────────────────────────────────────────────────
// Called by SMS webhook when driver replies
async function parseResponse(user, body) {
  const { driverId, message, fromPhone } = body
  if (!message) return json({ error: 'message required' }, 400)

  // Find driver by ID or phone
  let drivers
  if (driverId) {
    drivers = await sbQuery('drivers', `owner_id=eq.${user.id}&id=eq.${driverId}`)
  } else if (fromPhone) {
    const cleaned = fromPhone.replace(/\D/g, '').slice(-10)
    drivers = await sbQuery('drivers', `owner_id=eq.${user.id}`)
    drivers = (drivers || []).filter(d => {
      const dp = (d.phone || d.phone_number || '').replace(/\D/g, '').slice(-10)
      return dp === cleaned
    })
  }

  const driver = drivers?.[0]
  if (!driver) return json({ error: 'Driver not found' }, 404)

  // Parse intent
  const intent = parseIntent(message)

  // Find the pending message this responds to
  const pending = await sbQuery(
    'driver_comms',
    `owner_id=eq.${user.id}&driver_id=eq.${driver.id}&requires_response=eq.true&responded_at=is.null&direction=eq.outbound&order=created_at.desc&limit=1`
  )
  const pendingComm = pending?.[0]

  // Log inbound message
  const comm = await logDriverComm(user.id, driver.id, pendingComm?.message_type || 'general', message, {
    direction: 'inbound',
    channel: 'sms',
    loadId: pendingComm?.load_id,
    parsedIntent: intent.intent,
    parsedData: intent,
  })

  // Mark pending message as responded
  if (pendingComm) {
    await sbUpdate('driver_comms', `id=eq.${pendingComm.id}`, {
      responded_at: new Date().toISOString(),
      response_id: comm?.id,
    })
  }

  // Act on intent based on message type
  const messageType = pendingComm?.message_type

  if (messageType === 'morning_check') {
    return await handleMorningResponse(user, driver, intent, pendingComm)
  } else if (messageType === 'load_offer') {
    return await handleLoadOfferResponse(user, driver, intent, pendingComm)
  }

  return json({ ok: true, intent: intent.intent, parsed: intent })
}


// ── Handle morning check response ─────────────────────────────────────────────
async function handleMorningResponse(user, driver, intent, pendingComm) {
  const trucks = await sbQuery('truck_status', `owner_id=eq.${user.id}&driver_id=eq.${driver.id}`)
  const truck = trucks?.[0]

  if (intent.intent === 'ready' || intent.intent === 'yes') {
    // Driver is ready — mark truck available
    if (truck) {
      await updateTruckStatus(user.id, truck.vehicle_id, 'READY_FOR_LOAD', {
        statusReason: 'Driver confirmed ready via morning check',
      })
    }
    await sbUpdate('drivers', `id=eq.${driver.id}`, {
      is_available: true,
      availability_status: 'ready',
    }).catch(() => {})

    return json({ ok: true, intent: 'ready', action: 'truck_marked_available' })

  } else if (intent.intent === 'not_available' || intent.intent === 'no') {
    if (truck) {
      await updateTruckStatus(user.id, truck.vehicle_id, 'UNAVAILABLE', {
        statusReason: `Driver not available: ${intent.reason || 'declined'}`,
      })
    }
    await sbUpdate('drivers', `id=eq.${driver.id}`, {
      is_available: false,
      availability_status: 'off_duty',
    }).catch(() => {})

    return json({ ok: true, intent: 'not_available', action: 'truck_marked_unavailable' })

  } else if (intent.intent === 'time_given') {
    // Driver gave a time — schedule availability
    if (truck) {
      await updateTruckStatus(user.id, truck.vehicle_id, 'UNAVAILABLE', {
        statusReason: `Driver available at ${intent.time}`,
        availableAt: intent.availableAt,
      })
    }
    return json({ ok: true, intent: 'time_given', time: intent.time, action: 'availability_scheduled' })
  }

  return json({ ok: true, intent: intent.intent, action: 'no_action_taken' })
}


// ── Handle load offer response ────────────────────────────────────────────────
async function handleLoadOfferResponse(user, driver, intent, pendingComm) {
  const loadId = pendingComm?.load_id
  const trucks = await sbQuery('truck_status', `owner_id=eq.${user.id}&driver_id=eq.${driver.id}`)
  const truck = trucks?.[0]

  if (intent.intent === 'accepted') {
    // Driver accepted — update statuses
    if (truck) {
      await updateTruckStatus(user.id, truck.vehicle_id, 'BOOKED', {
        statusReason: 'Driver accepted load offer',
        currentLoadId: loadId,
      })
    }

    // Update load status
    if (loadId) {
      await sbUpdate('loads', `owner_id=eq.${user.id}&load_number=eq.${loadId}`, {
        status: 'Assigned to Driver',
        driver: driver.name || driver.full_name,
      }).catch(() => {})

      await logEvent(user.id, loadId, 'driver_accepted', {
        actor: 'driver',
        actorId: driver.id,
        notes: `${driver.name || 'Driver'} accepted load via SMS`,
      })
    }

    // Confirm to driver
    const driverName = (driver.name || driver.full_name || 'Driver').split(' ')[0]
    const phone = driver.phone || driver.phone_number
    if (phone) {
      await sendSMS(phone, `Confirmed! ${driverName}, you're assigned to load ${loadId}. Q will send pickup details shortly.`)
      await logDriverComm(user.id, driver.id, 'confirmation', `Load ${loadId} confirmed`, {
        direction: 'outbound', channel: 'sms', loadId,
      })
    }

    return json({ ok: true, intent: 'accepted', action: 'load_assigned', loadId })

  } else if (intent.intent === 'declined') {
    if (truck) {
      await updateTruckStatus(user.id, truck.vehicle_id, 'READY_FOR_LOAD', {
        statusReason: 'Driver declined load offer',
        currentLoadId: null,
      })
    }

    if (loadId) {
      await logEvent(user.id, loadId, 'driver_declined', {
        actor: 'driver',
        actorId: driver.id,
        notes: `${driver.name || 'Driver'} declined load via SMS: ${intent.reason || 'no reason given'}`,
      })
    }

    return json({ ok: true, intent: 'declined', action: 'find_next_driver', loadId })
  }

  return json({ ok: true, intent: intent.intent, action: 'no_action_taken' })
}


// ── Exception Handling ────────────────────────────────────────────────────────
async function handleException(user, body) {
  const { driverId, loadId, exceptionType, description } = body
  if (!driverId || !exceptionType) return json({ error: 'driverId and exceptionType required' }, 400)

  const validExceptions = [
    'late_to_pickup', 'problem_at_shipper', 'detention',
    'breakdown', 'route_change', 'unable_to_deliver', 'other',
  ]
  if (!validExceptions.includes(exceptionType)) {
    return json({ error: `Invalid exceptionType. Valid: ${validExceptions.join(', ')}` }, 400)
  }

  // Log exception event
  if (loadId) {
    await logEvent(user.id, loadId, 'exception', {
      actor: 'driver',
      actorId: driverId,
      notes: description || exceptionType,
      details: { exceptionType },
    })
  }

  // Update truck status based on exception
  const trucks = await sbQuery('truck_status', `owner_id=eq.${user.id}&driver_id=eq.${driverId}`)
  if (trucks?.[0]) {
    const newStatus = exceptionType === 'breakdown' ? 'ISSUE_REPORTED' : trucks[0].status
    if (newStatus !== trucks[0].status) {
      await updateTruckStatus(user.id, trucks[0].vehicle_id, newStatus, {
        statusReason: `Exception: ${exceptionType} — ${description || ''}`,
        loadId,
      })
    }
  }

  // Record failure for tracking
  await recordFailure(user.id, mapExceptionToFailure(exceptionType), description || exceptionType, {
    loadId, driverId,
    severity: exceptionType === 'breakdown' ? 'critical' : 'medium',
    fallbackAction: exceptionType === 'breakdown' ? 'reassign_load' : 'monitor',
  })

  // Log driver comm
  await logDriverComm(user.id, driverId, 'exception_report', description || exceptionType, {
    direction: 'inbound',
    channel: body.channel || 'app',
    loadId,
    parsedIntent: exceptionType,
  })

  return json({ ok: true, exceptionType, logged: true })
}

function mapExceptionToFailure(exceptionType) {
  const map = {
    'late_to_pickup': 'pickup_missed',
    'problem_at_shipper': 'detention_delay',
    'detention': 'detention_delay',
    'breakdown': 'truck_unavailable',
    'route_change': 'status_conflict',
    'unable_to_deliver': 'status_conflict',
    'other': 'system_error',
  }
  return map[exceptionType] || 'system_error'
}


// ── Check Pending Responses ───────────────────────────────────────────────────
async function checkPending(user) {
  const pending = await getPendingResponses(user.id)
  const now = new Date()
  const results = []

  for (const comm of (pending || [])) {
    const isExpired = comm.response_deadline && new Date(comm.response_deadline) < now

    if (isExpired) {
      // Mark as timed out
      await sbUpdate('driver_comms', `id=eq.${comm.id}`, {
        delivery_status: 'failed',
        parsed_intent: 'no_response',
      })

      // Record failure
      await recordFailure(user.id, 'driver_no_response', `No response to ${comm.message_type} after timeout`, {
        driverId: comm.driver_id,
        loadId: comm.load_id,
        severity: comm.message_type === 'load_offer' ? 'high' : 'medium',
        fallbackAction: comm.message_type === 'load_offer' ? 'try_next_driver' : 'skip',
      })

      // Log event
      if (comm.load_id) {
        await logEvent(user.id, comm.load_id, 'driver_no_response', {
          actor: 'system',
          actorId: comm.driver_id,
          notes: `Driver did not respond to ${comm.message_type} within deadline`,
        })
      }

      // Reset truck status
      const trucks = await sbQuery('truck_status', `owner_id=eq.${user.id}&driver_id=eq.${comm.driver_id}`)
      if (trucks?.[0] && trucks[0].status === 'WAITING_DRIVER_RESPONSE') {
        await updateTruckStatus(user.id, trucks[0].vehicle_id, 'EMPTY', {
          statusReason: 'Driver did not respond — reset to available',
          currentLoadId: null,
        })
      }

      results.push({ commId: comm.id, driverId: comm.driver_id, type: comm.message_type, status: 'expired' })
    } else {
      results.push({ commId: comm.id, driverId: comm.driver_id, type: comm.message_type, status: 'waiting', deadline: comm.response_deadline })
    }
  }

  return json({ ok: true, pending: results })
}


// ── Intent Parser ─────────────────────────────────────────────────────────────
function parseIntent(message) {
  const lower = (message || '').toLowerCase().trim()

  // Acceptance patterns
  if (/^(yes|yeah|yep|yup|ready|accept|ok|sure|let'?s go|i'?m ready|good to go|10-4|copy|confirmed)$/i.test(lower) ||
      /^(accept|yes)\b/i.test(lower)) {
    return { intent: 'accepted', confidence: 0.95 }
  }

  // Ready patterns (for morning check)
  if (/ready|available|good to go|let'?s roll|on my way/i.test(lower)) {
    return { intent: 'ready', confidence: 0.90 }
  }

  // Decline patterns
  if (/^(no|nah|nope|decline|pass|can'?t|not today|off|unavailable)$/i.test(lower) ||
      /^(decline|no)\b/i.test(lower) || /not available|can'?t work|taking off|sick|day off/i.test(lower)) {
    return { intent: 'declined', reason: lower, confidence: 0.90 }
  }

  // Not available with reason
  if (/home time|personal|appointment|family|maintenance|repair/i.test(lower)) {
    return { intent: 'not_available', reason: lower, confidence: 0.85 }
  }

  // Time given patterns
  const timeMatch = lower.match(/(\d{1,2})\s*(?::?\s*(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/i)
  if (timeMatch && /available|ready|start|be there|can go/i.test(lower)) {
    let hour = parseInt(timeMatch[1])
    const min = timeMatch[2] ? parseInt(timeMatch[2]) : 0
    const ampm = (timeMatch[3] || '').toLowerCase().replace(/\./g, '')
    if (ampm === 'pm' && hour < 12) hour += 12
    if (ampm === 'am' && hour === 12) hour = 0

    const availableAt = new Date()
    availableAt.setHours(hour, min, 0, 0)
    if (availableAt < new Date()) availableAt.setDate(availableAt.getDate() + 1) // next day

    return {
      intent: 'time_given',
      time: `${hour}:${String(min).padStart(2, '0')}`,
      availableAt: availableAt.toISOString(),
      confidence: 0.80,
    }
  }

  // Exception patterns
  if (/broke|breakdown|flat tire|accident|stuck|mechanical/i.test(lower)) {
    return { intent: 'exception', exceptionType: 'breakdown', confidence: 0.85 }
  }
  if (/delay|wait|detention|backed up|can'?t load|shipper/i.test(lower)) {
    return { intent: 'exception', exceptionType: 'detention', confidence: 0.80 }
  }
  if (/late|running behind|traffic|weather/i.test(lower)) {
    return { intent: 'exception', exceptionType: 'late_to_pickup', confidence: 0.75 }
  }

  // Unknown — needs human review
  return { intent: 'unknown', raw: lower, confidence: 0.30 }
}


// ── SMS Sender ────────────────────────────────────────────────────────────────
async function sendSMS(to, body) {
  if (!TWILIO_SID || !TWILIO_AUTH || !TWILIO_FROM) {
    console.error('[driver-dispatch] Twilio credentials missing')
    return { ok: false, error: 'Twilio not configured' }
  }

  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${TWILIO_SID}:${TWILIO_AUTH}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: TWILIO_FROM, Body: body }),
    })

    if (res.ok) {
      const data = await res.json()
      return { ok: true, sid: data.sid }
    } else {
      const errText = await res.text()
      console.error('[driver-dispatch] Twilio error:', errText)
      return { ok: false, error: errText }
    }
  } catch (err) {
    console.error('[driver-dispatch] SMS send failed:', err.message)
    return { ok: false, error: err.message }
  }
}


function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
