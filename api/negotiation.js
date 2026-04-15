import { handleCors, corsHeaders, requireAuth } from './_lib/auth.js'
import { sendPush, getPushToken, buildQActivityPush } from './_lib/push.js'

export const config = { runtime: 'edge' }
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
function json(d, s=200) { return new Response(JSON.stringify(d), { status: s, headers: {'Content-Type':'application/json'} }) }
const sb = () => ({ apikey: SUPABASE_KEY, Authorization: 'Bearer '+SUPABASE_KEY, 'Content-Type': 'application/json' })

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  const authErr = await requireAuth(req)
  if (authErr) return authErr
  const user = req._user

  const url = new URL(req.url)
  const action = url.searchParams.get('action')

  // GET: Return negotiation settings
  if (req.method === 'GET') {
    const res = await fetch(SUPABASE_URL + '/rest/v1/negotiation_settings?user_id=eq.' + user.id + '&limit=1', { headers: sb() })
    const data = await res.json()
    if (data.length === 0) {
      return json({ min_rate_per_mile: 2.50, counter_offer_markup_pct: 10, max_counter_rounds: 2, auto_accept_above_minimum: false, notify_driver_on_offer: true, driver_response_timeout_minutes: 5 })
    }
    return json(data[0])
  }

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const body = await req.json()

    // POST update_settings: Save negotiation preferences
    if (action === 'update_settings') {
      const settings = {
        user_id: user.id,
        min_rate_per_mile: body.min_rate_per_mile || 2.50,
        counter_offer_markup_pct: body.counter_offer_markup_pct || 10,
        max_counter_rounds: body.max_counter_rounds || 2,
        auto_accept_above_minimum: body.auto_accept_above_minimum || false,
        notify_driver_on_offer: body.notify_driver_on_offer !== false,
        driver_response_timeout_minutes: body.driver_response_timeout_minutes || 5,
        updated_at: new Date().toISOString()
      }
      await fetch(SUPABASE_URL + '/rest/v1/negotiation_settings', {
        method: 'POST', headers: { ...sb(), Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify(settings)
      })
      return json({ ok: true, settings })
    }

    // POST driver_response: Driver responds to rate offer
    if (action === 'driver_response') {
      const { callId, decision, counterRate } = body
      if (!callId || !decision) return json({ error: 'Missing callId or decision' }, 400)
      const validDecisions = ['accept', 'counter', 'decline']
      if (!validDecisions.includes(decision)) return json({ error: 'Invalid decision' }, 400)

      let outcome = decision
      let agreedRate = null
      if (decision === 'accept') { outcome = 'accepted'; agreedRate = body.offeredRate }
      if (decision === 'counter') { outcome = 'counter_offer'; agreedRate = counterRate }
      if (decision === 'decline') { outcome = 'declined' }

      // Update retell_calls with driver decision
      await fetch(SUPABASE_URL + '/rest/v1/retell_calls?retell_call_id=eq.' + callId, {
        method: 'PATCH', headers: sb(),
        body: JSON.stringify({ outcome, agreed_rate: agreedRate, notes: 'Driver decision: ' + decision + (counterRate ? ' at $' + counterRate : '') })
      })

      // ── When driver accepts: create load + send rate confirmation ──
      if (decision === 'accept' && agreedRate) {
        try {
          // Fetch the retell_calls row to get broker/route context
          const callRes = await fetch(
            SUPABASE_URL + '/rest/v1/retell_calls?retell_call_id=eq.' + encodeURIComponent(callId) +
            '&select=user_id,broker_name,broker_phone,broker_email,carrier_name,origin,destination,posted_rate,equipment&limit=1',
            { headers: sb() }
          )
          const callRows = callRes.ok ? await callRes.json() : []
          const call = callRows[0] || {}

          // Also get the latest negotiated rate from negotiation_messages if available
          const msgRes = await fetch(
            SUPABASE_URL + '/rest/v1/negotiation_messages?retell_call_id=eq.' + encodeURIComponent(callId) +
            '&rate_value=gt.0&order=created_at.desc&limit=1&select=rate_value',
            { headers: sb() }
          )
          const msgRows = msgRes.ok ? await msgRes.json() : []
          const finalRate = agreedRate || msgRows[0]?.rate_value || call.posted_rate || 0

          const userId = call.user_id || user.id
          const now = new Date()

          // 1. Create load in loads table
          const loadNum = 'QV-' + now.getFullYear().toString().slice(-2) + String(now.getMonth()+1).padStart(2,'0') + String(now.getDate()).padStart(2,'0') + '-' + Math.floor(Math.random()*9000+1000)
          await fetch(SUPABASE_URL + '/rest/v1/loads', {
            method: 'POST',
            headers: { ...sb(), Prefer: 'return=minimal' },
            body: JSON.stringify({
              owner_id: userId,
              load_number: loadNum,
              status: 'Rate Con Received',
              broker: call.broker_name || 'Broker',
              broker_phone: call.broker_phone || null,
              broker_email: call.broker_email || null,
              origin: call.origin || '',
              destination: call.destination || '',
              gross_pay: finalRate,
              equipment: call.equipment || 'Dry Van',
              created_at: now.toISOString(),
              updated_at: now.toISOString(),
            })
          }).catch(() => {})

          // 2. Fetch carrier identity for rate con email
          let carrierName = call.carrier_name || null
          let carrierEmail = null
          const compRes = await fetch(
            SUPABASE_URL + '/rest/v1/companies?owner_id=eq.' + userId + '&select=name,email&limit=1',
            { headers: sb() }
          )
          if (compRes.ok) {
            const comp = await compRes.json()
            if (comp[0]) { carrierName = comp[0].name || carrierName; carrierEmail = comp[0].email || null }
          }

          // 3. Send rate confirmation email to broker
          const RESEND_KEY = process.env.RESEND_API_KEY
          if (RESEND_KEY && call.broker_email && carrierName && carrierEmail) {
            const rcNum = 'RC-' + Date.now().toString(36).toUpperCase()
            await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: { Authorization: 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                from: `${carrierName} <${carrierEmail}>`,
                reply_to: carrierEmail,
                to: [call.broker_email],
                subject: `Rate Confirmation ${rcNum} — ${call.origin || ''} → ${call.destination || ''} — $${Number(finalRate).toLocaleString()}`,
                html: `<h2>Rate Confirmation</h2><p><strong>Carrier:</strong> ${carrierName}</p><p><strong>Route:</strong> ${call.origin || '—'} → ${call.destination || '—'}</p><p><strong>Rate:</strong> $${Number(finalRate).toLocaleString()}</p><p><strong>Equipment:</strong> ${call.equipment || 'Dry Van'}</p><p><strong>Confirmation #:</strong> ${rcNum}</p><p>Please send the rate con to ${carrierEmail}. Thank you!</p><p>— ${carrierName}</p>`,
              })
            }).catch(() => {})
          }

          // 4. Push q_activity: load booked confirmation
          const truckRes = await fetch(
            SUPABASE_URL + '/rest/v1/profiles?id=eq.' + userId + '&select=truck_id&limit=1',
            { headers: sb() }
          )
          const truckRows = truckRes.ok ? await truckRes.json() : []
          const truckId = truckRows[0]?.truck_id || null
          if (truckId) {
            await fetch(SUPABASE_URL + '/rest/v1/q_activity', {
              method: 'POST',
              headers: { ...sb(), Prefer: 'return=minimal' },
              body: JSON.stringify({
                truck_id: truckId,
                driver_id: userId,
                type: 'booked',
                content: {
                  message: `Load booked! ${call.origin || ''} → ${call.destination || ''} · $${Number(finalRate).toLocaleString()}. Rate con sent to ${call.broker_name || 'broker'}.`,
                  rate: finalRate,
                  loadNumber: loadNum,
                },
                requires_action: false,
              })
            }).catch(() => {})
          }

          // Push notification — driver may be backgrounded
          const pushToken = await getPushToken(userId, SUPABASE_URL, SUPABASE_KEY)
          if (pushToken) {
            const p = buildQActivityPush('booked', {
              origin: call.origin || '',
              destination: call.destination || '',
              rate: finalRate,
            })
            if (p) sendPush(pushToken, p.title, p.body, p.data).catch(() => {})
          }
        } catch (e) {
          console.error('[negotiation] post-accept error:', e.message)
          // Non-fatal — driver decision was already saved
        }
      }

      return json({ ok: true, decision, outcome, agreedRate })
    }

    return json({ error: 'Unknown action. Use ?action=update_settings or ?action=driver_response' }, 400)
  } catch (error) {
    return json({ error: 'Failed: ' + error.message }, 500)
  }
}
