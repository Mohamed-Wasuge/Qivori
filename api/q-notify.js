/**
 * /api/q-notify — Q reports broker chatter to the driver mid-call
 *
 * Called by the Retell agent via a custom function (`notify_driver`)
 * whenever the broker says something meaningful during a negotiation:
 *   - Quotes a rate
 *   - Asks for insurance, MC, equipment specs
 *   - Asks for pickup/delivery times
 *   - Counters
 *   - Walks away
 *
 * Body shape (from Retell tool call):
 * {
 *   call_id: "retell_call_xyz",
 *   user_id: "uuid",         (passed via dynamic variable)
 *   load_id: "uuid",
 *   broker_name: "Werner Enterprises",
 *   message_type: "broker_quoted" | "broker_asking" | "broker_countered" | "general",
 *   message: "Werner offered $2,400",
 *   rate_value: 2400         (optional, when there's a number)
 * }
 *
 * Inserts a row into negotiation_messages. The driver app subscribes
 * to that table via Supabase realtime and renders the message on the
 * dialing screen within ~1 second.
 *
 * IMPORTANT: this endpoint is called by Retell servers, not by the user's
 * browser. It uses the service key directly — no JWT auth. We trust the
 * call_id + user_id sent in the body (both came from the original
 * /api/retell-broker-call we initiated).
 */
import { handleCors, corsHeaders } from './_lib/auth.js'

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return Response.json({ error: 'Server misconfigured' }, { status: 500, headers: corsHeaders(req) })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const {
      call_id,
      user_id,
      load_id,
      broker_name,
      message_type,
      message,
      rate_value,
    } = body

    if (!call_id || !user_id || !message) {
      return Response.json(
        { error: 'Missing required fields: call_id, user_id, message' },
        { status: 400, headers: corsHeaders(req) }
      )
    }

    // Insert the message
    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/negotiation_messages`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        user_id,
        retell_call_id: call_id,
        load_id: load_id || null,
        broker_name: broker_name || null,
        message_type: message_type || 'general',
        message,
        rate_value: rate_value ? Number(rate_value) : null,
      }),
    })

    if (!insertRes.ok) {
      const err = await insertRes.text()
      return Response.json({ error: 'DB insert failed: ' + err }, { status: 500, headers: corsHeaders(req) })
    }

    return Response.json({ ok: true }, { headers: corsHeaders(req) })
  } catch (err) {
    return Response.json({ error: 'Server error: ' + err.message }, { status: 500, headers: corsHeaders(req) })
  }
}
