export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
const RESEND_API_KEY = process.env.RESEND_API_KEY
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN
const TWILIO_FROM = process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_FROM_NUMBER

function json(data, s = 200) { return new Response(JSON.stringify(data), { status: s, headers: { 'Content-Type': 'application/json' } }) }
const sbHeaders = () => ({ apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' })

export default async function handler(req) {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  try {
    const body = await req.json()
    const { event, call } = body
    const callId = call?.call_id || body.call_id
    const metadata = call?.metadata || body.metadata || {}

    if (!callId) return json({ error: 'Missing call_id' }, 400)

    // Determine call type from metadata or DB lookup
    const callType = metadata.call_type || 'broker_outbound'
    const table = callType === 'check_call' ? 'check_calls' : 'retell_calls'
    const idField = callType === 'check_call' ? 'retell_call_id' : 'retell_call_id'

    // Update call record based on event
    if (event === 'call_started') {
      await fetch(SUPABASE_URL + '/rest/v1/' + table + '?' + idField + '=eq.' + callId, {
        method: 'PATCH', headers: sbHeaders(),
        body: JSON.stringify({ call_status: 'in_progress', started_at: new Date().toISOString() })
      })
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

      // ── AutoShell calls handle their own post-call flow ──
      // The driver app subscribes to retell_calls realtime, sees the
      // agreed_rate when post-call analysis writes it, and the driver
      // decides accept/pass themselves. We skip ALL legacy TMS handlers
      // for these calls — no auto-book, no email rate con, no auto-retry.
      const isAutoShellCall = metadata.experience === 'auto'

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
  const { loadId, brokerName, brokerEmail, carrierName, agreed_rate } = meta
  // Update load status to booked
  await fetch(SUPABASE_URL + '/rest/v1/load_matches?id=eq.' + loadId, {
    method: 'PATCH', headers: sbHeaders(),
    body: JSON.stringify({ status: 'booked' })
  })
  // Send rate confirmation email via Resend
  if (brokerEmail && RESEND_API_KEY) {
    const confirmNum = 'RC-' + Date.now().toString(36).toUpperCase()
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Qivori Dispatch <dispatch@qivori.com>',
        to: [brokerEmail],
        subject: 'Rate Confirmation ' + confirmNum + ' - ' + carrierName,
        html: '<h2>Rate Confirmation</h2><p>Carrier: ' + carrierName + '</p><p>Rate: $' + (agreed_rate || 'TBD') + '</p><p>Confirmation: ' + confirmNum + '</p>'
      })
    })
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
