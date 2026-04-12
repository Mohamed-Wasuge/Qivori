/**
 * /api/q-notify — Retell tool: broker offer → driver mobile feed
 *
 * Called by the Retell agent (notify_driver tool) whenever the broker
 * quotes or counters a rate. Pushes a decision_needed card to q_activity
 * so the driver sees it live in the mobile app and can tap Accept/Counter/Decline.
 *
 * Retell sends tool calls as:
 *   { name, args: { call_id, user_id, message, ... }, call: { call_id, metadata } }
 */
import { handleCors, corsHeaders } from './_lib/auth.js'
import { sendPush, getPushToken, buildQActivityPush } from './_lib/push.js'

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY

const sbHeaders = () => ({
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
})

async function sbGet(path) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders() })
    return res.ok ? res.json() : []
  } catch { return [] }
}

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })
  }

  try {
    const body = await req.json().catch(() => ({}))

    // Retell sends args nested under body.args — fall back to top-level for direct calls
    const args = body.args || body
    const callContext = body.call || {}

    // call_id: from args first, then from call context
    const callId = args.call_id || callContext.call_id || ''
    // user_id: from args (dynamic variable {{user_id}}), then call metadata
    const userId = args.user_id || callContext.metadata?.userId || ''
    const message = args.message || ''

    console.log('[q-notify] callId:', callId, 'userId:', userId, 'message:', message?.slice(0, 60))

    if (!message) {
      return Response.json({ error: 'message is required' }, { status: 400, headers: corsHeaders(req) })
    }

    const brokerName = args.broker_name || callContext.metadata?.brokerName || 'Broker'
    const messageType = args.message_type || 'general'
    const rateValue = args.rate_value ? Number(args.rate_value) : null
    const loadId = args.load_id || callContext.metadata?.loadId || null

    // Resolve truckId + driverId from retell_calls row (set when call was created)
    let truckId = callContext.metadata?.truckId || ''
    let driverId = callContext.metadata?.driverId || userId || ''

    if (!truckId && callId) {
      const rows = await sbGet(`retell_calls?retell_call_id=eq.${encodeURIComponent(callId)}&select=truck_id,driver_id&limit=1`)
      if (rows[0]) {
        truckId = rows[0].truck_id || truckId
        driverId = rows[0].driver_id || driverId
      }
    }

    console.log('[q-notify] truckId:', truckId, 'driverId:', driverId, 'rate:', rateValue)

    // 1. Write to negotiation_messages (web AutoNegotiation overlay)
    if (callId && userId) {
      await fetch(`${SUPABASE_URL}/rest/v1/negotiation_messages`, {
        method: 'POST',
        headers: { ...sbHeaders(), Prefer: 'return=minimal' },
        body: JSON.stringify({
          user_id: userId,
          retell_call_id: callId,
          load_id: loadId,
          broker_name: brokerName,
          message_type: messageType,
          message,
          rate_value: rateValue,
        }),
      }).catch(() => {})
    }

    // 2. Push decision card to q_activity so mobile feed shows the offer
    if (truckId && driverId) {
      const isOffer = rateValue && (messageType === 'broker_quoted' || messageType === 'broker_countered')
      await fetch(`${SUPABASE_URL}/rest/v1/q_activity`, {
        method: 'POST',
        headers: { ...sbHeaders(), Prefer: 'return=minimal' },
        body: JSON.stringify({
          truck_id: truckId,
          driver_id: driverId,
          type: isOffer ? 'decision_needed' : 'transcript',
          content: isOffer ? {
            message: `${brokerName} offered $${rateValue.toLocaleString()}. Accept this load?`,
            rate: rateValue,
            brokerName,
            options: [
              { label: `Accept $${rateValue.toLocaleString()}`, value: 'accept' },
              { label: 'Counter', value: 'counter' },
              { label: 'Pass', value: 'decline' },
            ],
          } : {
            brokerName,
            brokerText: message,
            qText: '',
          },
          requires_action: isOffer,
        }),
      })
    }

    // 3. Push notification — driver may be backgrounded
    if (driverId) {
      const pushToken = await getPushToken(driverId, SUPABASE_URL, SUPABASE_KEY)
      if (pushToken) {
        const isOffer = rateValue && (messageType === 'broker_quoted' || messageType === 'broker_countered')
        const p = buildQActivityPush(
          isOffer ? 'decision_needed' : 'load_found',
          { brokerName, rate: rateValue, origin: callContext.metadata?.origin, destination: callContext.metadata?.destination }
        )
        if (p) sendPush(pushToken, p.title, p.body, p.data).catch(() => {})
      }
    }

    return Response.json({ ok: true }, { headers: corsHeaders(req) })
  } catch (err) {
    console.error('[q-notify] error:', err.message)
    return Response.json({ error: err.message }, { status: 500, headers: corsHeaders(req) })
  }
}
