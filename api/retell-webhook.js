export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
const RESEND_API_KEY = process.env.RESEND_API_KEY
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN
const TWILIO_FROM = process.env.TWILIO_FROM_NUMBER

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
      const outcome = metadata.outcome || call?.call_analysis?.call_summary || 'completed'
      const agreedRate = metadata.agreed_rate ? parseFloat(metadata.agreed_rate) : null

      await fetch(SUPABASE_URL + '/rest/v1/' + table + '?' + idField + '=eq.' + callId, {
        method: 'PATCH', headers: sbHeaders(),
        body: JSON.stringify({
          call_status: 'completed', duration_seconds: duration, recording_url: recording,
          transcript: transcript, outcome: outcome, agreed_rate: agreedRate,
          ended_at: new Date().toISOString()
        })
      })

      // If booked, trigger post-booking flow
      if (outcome === 'booked' && metadata.loadId) {
        await handleBookedLoad(metadata)
      }

      // If negotiation needed, notify driver
      if (outcome === 'counter_offer' && metadata.loadId) {
        await notifyDriverOfOffer(metadata)
      }
    }

    if (event === 'call_analyzed') {
      const sentiment = call?.call_analysis?.user_sentiment || 'neutral'
      const summary = call?.call_analysis?.call_summary || ''
      await fetch(SUPABASE_URL + '/rest/v1/' + table + '?' + idField + '=eq.' + callId, {
        method: 'PATCH', headers: sbHeaders(),
        body: JSON.stringify({ notes: summary })
      })
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
