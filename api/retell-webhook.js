export const config = { runtime: 'edge' }

import { sendPush, getPushTokenByTruck, getPushToken, buildQActivityPush } from './_lib/push.js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
const RESEND_API_KEY = process.env.RESEND_API_KEY
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN
const TWILIO_FROM = process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_FROM_NUMBER

function json(data, s = 200) { return new Response(JSON.stringify(data), { status: s, headers: { 'Content-Type': 'application/json' } }) }
const sbHeaders = () => ({ apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' })

async function verifyRetellSignature(rawBody, signature) {
  try {
    const apiKey = process.env.RETELL_API_KEY
    if (!apiKey || !signature) return false
    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey('raw', encoder.encode(apiKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const sigBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody))
    const expected = Array.from(new Uint8Array(sigBytes)).map(b => b.toString(16).padStart(2, '0')).join('')
    if (expected.length !== signature.length) return false
    let diff = 0
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
    return diff === 0
  } catch {
    return false
  }
}

export default async function handler(req) {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return json({ error: 'Server not configured' }, 500)
  }
  try {
    const rawBody = await req.text()
    const signature = req.headers.get('x-retell-signature')

    let bodyPreview = {}
    try { bodyPreview = JSON.parse(rawBody) } catch {}

    // Spec Fix 1 — diagnostic log at very top so we can confirm truckId is arriving
    console.log('[webhook]', JSON.stringify({
      event: bodyPreview.event,
      callId: bodyPreview.call?.call_id,
      truckId: bodyPreview.call?.metadata?.truckId,
      driverId: bodyPreview.call?.metadata?.driverId,
      userId: bodyPreview.call?.metadata?.userId,
      sig: signature ? signature.slice(0, 16) + '...' : 'MISSING',
    }))

    const sigValid = await verifyRetellSignature(rawBody, signature)
    if (!sigValid) {
      // Log but don't block — Retell v2 may use a different sig format.
      // We'll re-enable hard reject once we confirm events are arriving.
      console.warn('[retell-webhook] Signature invalid or missing — proceeding anyway for diagnostics')
    }

    const body = bodyPreview
    const { event, call } = body
    const callId = call?.call_id || body.call_id
    const metadata = call?.metadata || body.metadata || {}

    if (!callId) return json({ error: 'Missing call_id' }, 400)

    // Determine call type from metadata or DB lookup
    const callType = metadata.call_type || 'broker_outbound'
    const table = callType === 'check_call' ? 'check_calls' : 'retell_calls'
    const idField = callType === 'check_call' ? 'call_id' : 'retell_call_id'

    // Q mobile feed targets
    const truckId = metadata.truckId || null
    const driverId = metadata.driverId || metadata.userId || null

    // Update call record based on event
    if (event === 'call_started') {
      await fetch(SUPABASE_URL + '/rest/v1/' + table + '?' + idField + '=eq.' + callId, {
        method: 'PATCH', headers: sbHeaders(),
        body: JSON.stringify({ call_status: 'in_progress', started_at: new Date().toISOString() })
      })
      if (truckId && driverId) {
        await fetch(SUPABASE_URL + '/rest/v1/q_activity', {
          method: 'POST', headers: sbHeaders(),
          body: JSON.stringify({
            truck_id: truckId,
            driver_id: driverId,
            type: 'call_started',
            content: {
              brokerName: metadata.brokerName || 'Broker',
              message: 'Calling broker now, negotiating your rate...',
            },
            requires_action: false,
          })
        })
        // Push notification — app may be backgrounded
        const pushToken = await getPushToken(driverId, SUPABASE_URL, SUPABASE_KEY)
        if (pushToken) {
          const p = buildQActivityPush('call_started', { brokerName: metadata.brokerName })
          if (p) sendPush(pushToken, p.title, p.body, p.data).catch(() => {})
        }
      }
    }

    if (event === 'transcript') {
      const transcript = call?.transcript
      const lastTwo = Array.isArray(transcript) ? transcript.slice(-2) : []
      if (truckId && driverId && lastTwo.length > 0) {
        // In Retell outbound calls: role='agent' = Q speaking, role='user' = broker speaking
        const qLine = lastTwo.find(t => t.role === 'agent')?.content || ''
        const brokerLine = lastTwo.find(t => t.role === 'user')?.content || ''
        if (qLine || brokerLine) {
          await fetch(SUPABASE_URL + '/rest/v1/q_activity', {
            method: 'POST', headers: sbHeaders(),
            body: JSON.stringify({
              truck_id: truckId,
              driver_id: driverId,
              type: 'transcript',
              content: {
                brokerName: metadata.brokerName || 'Broker',
                brokerText: brokerLine,
                qText: qLine,
              },
              requires_action: false,
            })
          })
        }
      }
    }

    if (event === 'call_ended') {
      const duration = call?.duration_ms ? Math.round(call.duration_ms / 1000) : 0
      const recording = call?.recording_url || null
      const transcript = call?.transcript || null
      const disconnectReason = call?.disconnection_reason || ''
      // agreed_rate flows in via Retell post-call analysis (custom_analysis_data).
      // The agent NEVER commits during the call — it just brings back the broker's
      // best offer, and Retell's post-call analyzer extracts the number from the
      // transcript and writes it to call.call_analysis.custom_analysis_data.agreed_rate.
      // Falls back to metadata.agreed_rate (legacy) so existing tests don't break.
      const customRate = call?.call_analysis?.custom_analysis_data?.agreed_rate
      const agreedRate = customRate
        ? parseFloat(customRate)
        : (metadata.agreed_rate ? parseFloat(metadata.agreed_rate) : null)

      // Smart outcome detection based on call signals
      let outcome = metadata.outcome || 'completed'
      let callStatus = 'completed'
      let notes = ''

      // Voicemail detection: very short call + no meaningful transcript
      const transcriptText = typeof transcript === 'string' ? transcript : ''
      const hasConversation = transcriptText.length > 50

      if (disconnectReason === 'voicemail_reached' || disconnectReason === 'machine_detected') {
        // Retell explicitly detected voicemail
        outcome = 'voicemail'
        callStatus = 'voicemail'
        notes = 'Voicemail detected by Retell — auto-retry scheduled'
      } else if (duration < 8 && !hasConversation) {
        // Call under 8 seconds with no real conversation = likely voicemail/no-answer
        outcome = 'no_answer'
        callStatus = 'no_answer'
        notes = 'Call too short (' + duration + 's) — no conversation detected'
      } else if (disconnectReason === 'dial_busy' || disconnectReason === 'line_busy') {
        outcome = 'busy'
        callStatus = 'busy'
        notes = 'Broker line was busy'
      } else if (disconnectReason === 'dial_no_answer') {
        outcome = 'no_answer'
        callStatus = 'no_answer'
        notes = 'No answer after ringing'
      } else if (disconnectReason === 'call_transfer' || disconnectReason === 'user_hangup') {
        // Broker hung up — check if it was mid-negotiation or after resolution
        if (duration < 30 && !hasConversation) {
          outcome = 'hung_up_early'
          callStatus = 'hung_up'
          notes = 'Broker hung up within ' + duration + 's — may not have been interested'
        } else if (!agreedRate && outcome === 'completed') {
          outcome = 'hung_up_no_deal'
          callStatus = 'completed'
          notes = 'Broker disconnected without agreement — no rate confirmed'
        }
      } else if (disconnectReason === 'error_inbound_webhook' || disconnectReason === 'error_llm_websocket_open') {
        outcome = 'error'
        callStatus = 'failed'
        notes = 'Technical error: ' + disconnectReason
      }

      // Use call_analysis summary if available and no explicit outcome
      if (outcome === 'completed' && call?.call_analysis?.call_summary) {
        const summary = call.call_analysis.call_summary.toLowerCase()
        if (summary.includes('voicemail') || summary.includes('answering machine')) {
          outcome = 'voicemail'
          callStatus = 'voicemail'
          notes = 'AI analysis detected voicemail'
        } else if (summary.includes('booked') || summary.includes('confirmed') || summary.includes('accepted')) {
          outcome = 'booked'
        } else if (summary.includes('declined') || summary.includes('rejected') || summary.includes('not available')) {
          outcome = 'load_unavailable'
        } else if (summary.includes('counter') || summary.includes('negotiate')) {
          outcome = 'counter_offer'
        }
      }

      await fetch(SUPABASE_URL + '/rest/v1/' + table + '?' + idField + '=eq.' + callId, {
        method: 'PATCH', headers: sbHeaders(),
        body: JSON.stringify({
          call_status: callStatus, duration_seconds: duration, recording_url: recording,
          transcript: transcript, outcome: outcome, agreed_rate: agreedRate,
          ended_at: new Date().toISOString(),
          notes: notes || (call?.call_analysis?.call_summary || '')
        })
      })

      if (truckId && driverId) {
        const origin = metadata.origin || ''
        const dest = metadata.destination || ''
        const routeStr = origin && dest ? `${origin} → ${dest}` : ''

        if (outcome === 'booked' && agreedRate) {
          // Load is booked — show confirmation card
          const bookedContent = {
            message: `Load booked at $${agreedRate.toLocaleString()}${routeStr ? ` — ${routeStr}` : ''}. Rate con incoming.`,
            rate: agreedRate, brokerName: metadata.brokerName || 'Broker',
            origin, destination: dest,
          }
          await fetch(SUPABASE_URL + '/rest/v1/q_activity', {
            method: 'POST', headers: sbHeaders(),
            body: JSON.stringify({
              truck_id: truckId, driver_id: driverId, type: 'booked',
              content: bookedContent, requires_action: false,
            })
          })
          // Push: "Load booked"
          const pushToken = await getPushToken(driverId, SUPABASE_URL, SUPABASE_KEY)
          if (pushToken) {
            const p = buildQActivityPush('booked', bookedContent)
            if (p) sendPush(pushToken, p.title, p.body, p.data).catch(() => {})
          }
        } else if (agreedRate && outcome !== 'load_unavailable') {
          // Q got a rate — driver needs to decide
          const decisionContent = {
            message: `Broker ${metadata.brokerName || ''} offered $${agreedRate.toLocaleString()}${routeStr ? ` for ${routeStr}` : ''}. Accept this load?`,
            rate: agreedRate, brokerName: metadata.brokerName || 'Broker',
            originCity: origin, destinationCity: dest,
            options: [
              { label: `Accept $${agreedRate.toLocaleString()}`, value: 'accept' },
              { label: 'Pass', value: 'decline' },
            ],
          }
          await fetch(SUPABASE_URL + '/rest/v1/q_activity', {
            method: 'POST', headers: sbHeaders(),
            body: JSON.stringify({
              truck_id: truckId, driver_id: driverId, type: 'decision_needed',
              content: decisionContent, requires_action: true,
            })
          })
          // Push: "Q needs your call" — high priority, driver must act
          const pushToken = await getPushToken(driverId, SUPABASE_URL, SUPABASE_KEY)
          if (pushToken) {
            const p = buildQActivityPush('decision_needed', decisionContent)
            if (p) sendPush(pushToken, p.title, p.body, p.data).catch(() => {})
          }
        } else {
          // No rate — show summary
          const summaryMsg = outcome === 'voicemail' ? 'Voicemail — Q will retry in 30 min.'
            : outcome === 'no_answer' ? 'No answer — Q will retry.'
            : outcome === 'load_unavailable' ? 'Load already taken.'
            : call?.call_analysis?.call_summary || 'Call complete.'
          await fetch(SUPABASE_URL + '/rest/v1/q_activity', {
            method: 'POST', headers: sbHeaders(),
            body: JSON.stringify({
              truck_id: truckId, driver_id: driverId, type: 'status_update',
              content: { message: summaryMsg, icon: '📞' },
              requires_action: false,
            })
          })
        }
      }

      // ── AutoShell calls handle their own post-call flow ──
      // The driver app subscribes to retell_calls realtime, sees the
      // agreed_rate when post-call analysis writes it, and the driver
      // decides accept/pass themselves. We skip ALL legacy TMS handlers
      // for these calls — no auto-book, no email rate con, no auto-retry.
      const isAutoShellCall = metadata.experience === 'auto'

      // ── Broker intelligence: track all booked loads ──────────────────────────
      // Runs for ALL call types (auto + legacy) so BrokerIntelScreen has real data.
      if (outcome === 'booked' && agreedRate && metadata.userId && metadata.brokerName) {
        updateBrokerIntelligence(metadata, agreedRate).catch(() => {})
        // Rate intelligence: record lane + rate for pattern tracking
        recordRateIntelligence(metadata, agreedRate).catch(() => {})
      }

      if (!isAutoShellCall) {
        // Legacy TMS post-call flow (carriers on $79/$199 plans)

        // If booked, trigger post-booking flow
        if (outcome === 'booked' && metadata.loadId) {
          await handleBookedLoad(metadata)
        }

        // If negotiation needed, notify driver
        if (outcome === 'counter_offer' && metadata.loadId) {
          await notifyDriverOfOffer(metadata)
        }

        // Auto-retry for voicemail, no-answer, busy (max 3 attempts)
        if (['voicemail', 'no_answer', 'busy', 'hung_up_early'].includes(outcome) && metadata.loadId) {
          await scheduleRetryCall(metadata, callId)
        }
      }
    }

    if (event === 'call_analyzed') {
      const sentiment = call?.call_analysis?.user_sentiment || 'neutral'
      const summary = call?.call_analysis?.call_summary || ''
      await fetch(SUPABASE_URL + '/rest/v1/' + table + '?' + idField + '=eq.' + callId, {
        method: 'PATCH', headers: sbHeaders(),
        body: JSON.stringify({ notes: summary })
      })

      // ── Intelligence feedback loop ──────────────────────────────────
      // Update broker urgency scores based on call outcomes
      if (metadata.brokerName && metadata.userId) {
        updateBrokerUrgency(metadata, outcome, duration, sentiment).catch(() => {})
      }
    }

    return json({ received: true })
  } catch (error) {
    return json({ error: 'Webhook processing failed: ' + error.message }, 500)
  }
}

async function handleBookedLoad(meta) {
  const { loadId, brokerName, brokerEmail, agreed_rate, userId } = meta
  // Update load status to booked
  await fetch(SUPABASE_URL + '/rest/v1/load_matches?id=eq.' + loadId, {
    method: 'PATCH', headers: sbHeaders(),
    body: JSON.stringify({ status: 'booked' })
  })

  // ── Look up carrier identity from companies table ──
  // The rate-con email MUST come from the carrier, never from Qivori. We
  // refuse to send if we can't resolve a real From identity — better to
  // skip the email than to leak Qivori-Dispatch into a broker's inbox.
  let carrierName = meta.carrierName || null
  let carrierEmail = null
  if (userId) {
    try {
      const cRes = await fetch(
        SUPABASE_URL + '/rest/v1/companies?owner_id=eq.' + userId + '&select=name,email&limit=1',
        { headers: sbHeaders() }
      )
      if (cRes.ok) {
        const rows = await cRes.json()
        if (rows[0]) {
          carrierName = rows[0].name || carrierName
          carrierEmail = rows[0].email || null
        }
      }
    } catch {}
  }

  // Send rate confirmation email via Resend
  if (brokerEmail && RESEND_API_KEY && carrierName && carrierEmail) {
    const confirmNum = 'RC-' + Date.now().toString(36).toUpperCase()
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: carrierName + ' <' + carrierEmail + '>',
        reply_to: carrierEmail,
        to: [brokerEmail],
        subject: 'Rate Confirmation ' + confirmNum + ' - ' + carrierName,
        html: '<h2>Rate Confirmation</h2><p>Carrier: ' + carrierName + '</p><p>Rate: $' + (agreed_rate || 'TBD') + '</p><p>Confirmation: ' + confirmNum + '</p><p>Thanks,<br/>' + carrierName + '</p>'
      })
    })
  } else if (brokerEmail && RESEND_API_KEY) {
    console.warn('handleBookedLoad: skipping rate-con email — missing carrier identity (name=' + carrierName + ', email=' + carrierEmail + ')')
  }

  // Schedule check calls (2hr after pickup, 2hr before delivery)
  const now = new Date()
  const pickupCheck = new Date(now.getTime() + 2 * 60 * 60 * 1000)
  await fetch(SUPABASE_URL + '/rest/v1/check_calls', {
    method: 'POST', headers: sbHeaders(),
    body: JSON.stringify({ load_id: loadId, call_type: 'pickup_check', broker_name: brokerName, carrier_name: carrierName, call_status: 'scheduled', scheduled_at: pickupCheck.toISOString() })
  })
}

async function notifyDriverOfOffer(meta) {
  const { loadId, brokerName, offered_rate, min_rate } = meta
  if (!TWILIO_SID || !TWILIO_TOKEN) return
  // In production, look up driver phone from load record
  // For now, log the offer
  console.log('Driver notification needed for load ' + loadId + ': Broker ' + brokerName + ' offered $' + offered_rate + ' (min: $' + min_rate + ')')
}

// ── Intelligence Feedback Loop ──────────────────────────────────────────────
// After each call, update the broker's urgency score so future calls are smarter.
// Signals: multiple callbacks = high urgency, quick hangups = low interest, etc.
async function updateBrokerUrgency(meta, outcome, duration, sentiment) {
  const { brokerName, userId } = meta
  if (!brokerName || !userId) return

  try {
    // Get existing urgency record
    const existing = await fetch(
      SUPABASE_URL + '/rest/v1/broker_urgency_scores?owner_id=eq.' + userId + '&broker_name=eq.' + encodeURIComponent(brokerName) + '&limit=1',
      { headers: sbHeaders() }
    )
    const rows = existing.ok ? await existing.json() : []
    const current = rows[0] || { urgency_score: 50, signals: [], call_count: 0 }

    // Calculate score adjustment based on call outcome
    let delta = 0
    const signals = current.signals || []

    if (outcome === 'booked') { delta = 20; signals.push('booked_load') }
    else if (outcome === 'counter_offer') { delta = 10; signals.push('counter_offered') }
    else if (outcome === 'voicemail' || outcome === 'no_answer') { delta = -5; signals.push('no_answer') }
    else if (outcome === 'hung_up_early') { delta = -15; signals.push('hung_up_early') }
    else if (outcome === 'load_unavailable') { delta = -10; signals.push('load_taken') }
    else if (sentiment === 'positive') { delta = 5; signals.push('positive_sentiment') }
    else if (sentiment === 'negative') { delta = -10; signals.push('negative_sentiment') }

    // Callback from broker = strong urgency signal
    if (meta.call_type === 'broker_callback' || meta.call_type === 'broker_inbound') {
      delta += 15
      signals.push('called_back')
    }

    const newScore = Math.max(0, Math.min(100, (current.urgency_score || 50) + delta))
    const newCount = (current.call_count || 0) + 1

    // Keep only last 10 signals
    const trimmedSignals = signals.slice(-10)

    if (rows.length > 0) {
      await fetch(
        SUPABASE_URL + '/rest/v1/broker_urgency_scores?id=eq.' + current.id,
        { method: 'PATCH', headers: sbHeaders(), body: JSON.stringify({ urgency_score: newScore, call_count: newCount, signals: trimmedSignals, updated_at: new Date().toISOString() }) }
      )
    } else {
      await fetch(
        SUPABASE_URL + '/rest/v1/broker_urgency_scores',
        { method: 'POST', headers: sbHeaders(), body: JSON.stringify({ owner_id: userId, broker_name: brokerName, urgency_score: newScore, call_count: newCount, signals: trimmedSignals }) }
      )
    }
  } catch {}
}

// ── Broker Intelligence: track loads booked per broker ─────────────────────────
// Upserts into broker_intelligence table so BrokerIntelScreen has real data.
// Called on every successful booking regardless of call type (auto or legacy).
async function updateBrokerIntelligence(meta, agreedRate) {
  const { brokerName, userId } = meta
  if (!brokerName || !userId) return

  try {
    // Fetch existing record
    const existing = await fetch(
      SUPABASE_URL + '/rest/v1/broker_intelligence?owner_id=eq.' + userId + '&broker_name=eq.' + encodeURIComponent(brokerName) + '&limit=1',
      { headers: sbHeaders() }
    )
    const rows = existing.ok ? await existing.json() : []
    const current = rows[0] || null

    const today = new Date().toISOString().split('T')[0]
    const rate = parseFloat(agreedRate) || 0

    if (current) {
      // Update existing record: increment loads_booked, recalculate avg_rate_final
      const prevTotal = (current.avg_rate_final || 0) * (current.loads_booked || 0)
      const newCount = (current.loads_booked || 0) + 1
      const newAvg = rate > 0 ? (prevTotal + rate) / newCount : (current.avg_rate_final || 0)

      await fetch(
        SUPABASE_URL + '/rest/v1/broker_intelligence?id=eq.' + current.id,
        {
          method: 'PATCH', headers: sbHeaders(),
          body: JSON.stringify({
            loads_booked: newCount,
            avg_rate_final: Math.round(newAvg * 100) / 100,
            last_load_date: today,
            updated_at: new Date().toISOString(),
          })
        }
      )
    } else {
      // Insert new record
      await fetch(
        SUPABASE_URL + '/rest/v1/broker_intelligence',
        {
          method: 'POST', headers: sbHeaders(),
          body: JSON.stringify({
            owner_id: userId,
            broker_name: brokerName,
            broker_mc: meta.brokerMC || null,
            loads_booked: 1,
            avg_rate_final: rate,
            last_load_date: today,
          })
        }
      )
    }
  } catch (err) {
    console.error('[retell-webhook] updateBrokerIntelligence error:', err)
  }
}

// Schedule a retry call in 30 min (max 3 per load+broker)
async function scheduleRetryCall(meta, originalCallId) {
  try {
    // Check existing retry count
    const checkRes = await fetch(
      SUPABASE_URL + '/rest/v1/retell_calls?load_id=eq.' + (meta.loadId || '') + '&outcome=in.(voicemail,no_answer,busy,hung_up_early)&select=id&limit=5',
      { headers: sbHeaders() }
    )
    const existing = checkRes.ok ? await checkRes.json() : []
    if (existing.length >= 3) return // Max 3 retries

    const retryAt = new Date(Date.now() + 30 * 60 * 1000)
    await fetch(SUPABASE_URL + '/rest/v1/check_calls', {
      method: 'POST', headers: sbHeaders(),
      body: JSON.stringify({
        load_id: meta.loadId,
        call_type: 'broker_retry',
        broker_name: meta.brokerName || '',
        broker_phone: meta.brokerPhone || '',
        carrier_name: meta.carrierName || '',
        call_status: 'scheduled',
        scheduled_at: retryAt.toISOString(),
        notes: 'Auto-retry #' + (existing.length + 1) + ' — original call ' + originalCallId
      })
    })
  } catch {}
}

// ── Rate intelligence: record booked lane + rate for pattern tracking ──────────
async function recordRateIntelligence(meta, agreedRate) {
  const { userId, brokerName } = meta
  if (!userId || !agreedRate) return
  try {
    // Pull load details for origin/destination/miles
    let origin = meta.origin || null
    let destination = meta.destination || null
    let miles = meta.miles ? parseFloat(meta.miles) : null
    if (!origin && meta.loadId) {
      const loadRes = await fetch(
        SUPABASE_URL + '/rest/v1/loads?id=eq.' + meta.loadId + '&select=origin,destination,miles&limit=1',
        { headers: sbHeaders() }
      )
      const loads = loadRes.ok ? await loadRes.json() : []
      if (loads[0]) { origin = loads[0].origin; destination = loads[0].destination; miles = parseFloat(loads[0].miles) || null }
    }
    if (!origin || !destination) return
    const rate = parseFloat(agreedRate)
    const rpm = miles && miles > 0 ? Math.round((rate / miles) * 100) / 100 : null
    await fetch(SUPABASE_URL + '/rest/v1/rate_intelligence', {
      method: 'POST', headers: sbHeaders(),
      body: JSON.stringify({ owner_id: userId, origin, destination, rate, miles, rpm, broker_name: brokerName || null, booked_at: new Date().toISOString() })
    })
  } catch {}
}
