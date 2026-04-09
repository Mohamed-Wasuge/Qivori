/**
 * /api/check-driver-decision — Retell tool: pull the driver's latest decision
 *
 * Q (the Retell agent) calls this endpoint mid-call whenever it needs to know
 * whether the driver has accepted the broker's current offer. The agent prompt
 * instructs Q to call this BEFORE committing to any rate, and AFTER any broker
 * counter-offer that was relayed via the notify_driver tool.
 *
 * Architecture context:
 *   1. Driver sees broker's counter via the AutoNegotiation overlay (live
 *      feed from negotiation_messages).
 *   2. Driver taps Accept → frontend calls /api/negotiation?action=driver_response
 *      with decision='accept' + offeredRate. That endpoint PATCHes
 *      retell_calls.outcome='accepted', agreed_rate=X.
 *   3. Q's next tool call to THIS endpoint reads the row and returns the
 *      decision. Q follows its prompt instructions: confirm the rate to the
 *      broker, ask for rate con email, then invoke its built-in end_call.
 *
 * NOTE on why we don't use Retell's PATCH /v2/update-call/{id} with
 * override_dynamic_variables: dynamic variables are templated into the system
 * prompt at call creation. Retell agents do NOT re-evaluate them mid-call, so
 * pushing a value via update_call is a no-op for the live conversation. The
 * pull-based custom-function pattern is the documented way to feed mid-call
 * state to a Retell agent.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * RETELL DASHBOARD CONFIGURATION (copy-paste into the agent settings)
 * ─────────────────────────────────────────────────────────────────────────
 *
 * 1. Tool definition — add to the agent's "Functions" / "Custom Functions":
 *
 *    Name:        check_driver_decision
 *    Description: Check if the owner-operator driver has accepted, declined,
 *                 or is still deciding on the broker's most recent offer.
 *                 Call this BEFORE committing to any rate. Call this again
 *                 AFTER relaying a broker counter-offer via notify_driver,
 *                 then wait 3 seconds and call once more to check for an
 *                 update. If the response says decision='accept', confirm
 *                 the agreed_rate to the broker and end the call. If
 *                 decision='decline', politely walk away and end the call.
 *                 If decision='waiting', keep negotiating per your normal
 *                 strategy — propose a counter at the target_rate.
 *    URL:         https://qivori.com/api/check-driver-decision
 *    Method:      POST
 *    Headers:     (none — Retell auto-attaches X-Retell-Signature)
 *    Parameters (JSON schema):
 *      {
 *        "type": "object",
 *        "required": ["call_id"],
 *        "properties": {
 *          "call_id": {
 *            "type": "string",
 *            "description": "The current Retell call ID. Always pass {{call_id}}."
 *          }
 *        }
 *      }
 *    Speak during execution: yes — "Let me check with the driver real quick."
 *    Speak after execution:  no  (the agent reads the response and decides)
 *    Timeout: 3000ms
 *
 * 2. Agent prompt addition — append to the negotiation section of the prompt:
 *
 *    """
 *    DRIVER DECISION POLLING:
 *
 *    The driver is watching this call live in their app. After every broker
 *    rate quote or counter, you MUST:
 *
 *      a) Call notify_driver with the broker's exact words and rate_value
 *         so the driver sees the offer in their app.
 *      b) Wait 2-3 seconds (use small talk: "Let me see what I can do" or
 *         "Hold on one sec while I run those numbers").
 *      c) Call check_driver_decision with call_id={{call_id}}.
 *      d) Read the response. It will be one of:
 *           - { decision: "accept", agreed_rate: NUMBER }
 *           - { decision: "decline" }
 *           - { decision: "waiting" }
 *      e) Branch:
 *           - accept  → say "Great, my driver confirmed $AGREED_RATE works.
 *                       Can you send the rate con to dispatch@qivori.com?"
 *                       After confirming the email, invoke end_call.
 *           - decline → say "I appreciate the offer but my driver passed on
 *                       this one. Have a great day." Invoke end_call.
 *           - waiting → keep negotiating. Counter at target_rate or hold
 *                       firm at floor_rate. Try one more round.
 *
 *    NEVER commit to a rate without first checking the driver's decision.
 *    NEVER end the call with end_call until you've confirmed accept or decline.
 *    """
 *
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Request body (sent by Retell):
 *   {
 *     "name": "check_driver_decision",
 *     "args": { "call_id": "call_xyz..." },
 *     "call": { ...full call context... }
 *   }
 *
 * Response:
 *   { decision: "accept" | "decline" | "waiting",
 *     agreed_rate: number | null,
 *     broker_name: string | null }
 *
 * Auth: X-Retell-Signature (HMAC-SHA256 of rawBody+timestamp using RETELL_API_KEY)
 */

import { handleCors, corsHeaders } from './_lib/auth.js'

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
const RETELL_API_KEY = process.env.RETELL_API_KEY

const sbHeaders = () => ({
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
})

// ── X-Retell-Signature verification ─────────────────────────────────────
// Format: "v=<unix_ms_timestamp>,d=<hex_hmac_sha256>"
// Hash:   HMAC-SHA256(rawBody + timestamp, RETELL_API_KEY)
// Window: 5 minutes (replay protection)
async function verifyRetellSignature(rawBody, header, apiKey) {
  if (!header || !apiKey) return false
  const match = /v=(\d+),d=([a-f0-9]+)/i.exec(header)
  if (!match) return false
  const timestamp = match[1]
  const provided = match[2]

  // Reject if timestamp is more than 5 minutes off
  const now = Date.now()
  const age = Math.abs(now - Number(timestamp))
  if (Number.isNaN(age) || age > 5 * 60 * 1000) return false

  // Compute HMAC-SHA256(rawBody + timestamp, apiKey)
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(apiKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody + timestamp))
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  // Constant-time compare
  if (expected.length !== provided.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i)
  }
  return diff === 0
}

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })
  }

  if (!SUPABASE_URL || !SUPABASE_KEY || !RETELL_API_KEY) {
    return Response.json({ error: 'Server not configured' }, { status: 500, headers: corsHeaders(req) })
  }

  // Read raw body ONCE — needed for signature verification AND for parsing.
  // Re-serializing parsed JSON would break the HMAC.
  const rawBody = await req.text()

  // Verify Retell signature
  const sigHeader = req.headers.get('x-retell-signature')
  const valid = await verifyRetellSignature(rawBody, sigHeader, RETELL_API_KEY)
  if (!valid) {
    return Response.json({ error: 'Invalid signature' }, { status: 401, headers: corsHeaders(req) })
  }

  let body
  try {
    body = JSON.parse(rawBody)
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400, headers: corsHeaders(req) })
  }

  // Retell sends { name, args: { call_id }, call: {...} }
  // Tolerate args-only mode where the body IS the args object.
  const callId = body?.args?.call_id || body?.call_id || body?.call?.call_id
  if (!callId) {
    return Response.json({ error: 'Missing call_id' }, { status: 400, headers: corsHeaders(req) })
  }

  // Read the latest decision from retell_calls
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/retell_calls?retell_call_id=eq.${encodeURIComponent(callId)}&select=outcome,agreed_rate,broker_name,call_status&limit=1`,
    { headers: sbHeaders() }
  )

  if (!res.ok) {
    return Response.json({ decision: 'waiting', agreed_rate: null, broker_name: null }, { headers: corsHeaders(req) })
  }

  const rows = await res.json()
  const row = Array.isArray(rows) ? rows[0] : null

  if (!row) {
    return Response.json({ decision: 'waiting', agreed_rate: null, broker_name: null }, { headers: corsHeaders(req) })
  }

  // Map outcome → decision the agent prompt expects
  // outcome 'accepted'   → decision 'accept'  (driver tapped Accept)
  // outcome 'declined'   → decision 'decline' (driver tapped Decline post-call)
  // anything else        → decision 'waiting' (driver hasn't responded yet)
  const outcome = (row.outcome || '').toLowerCase()
  let decision = 'waiting'
  if (outcome === 'accepted') decision = 'accept'
  else if (outcome === 'declined') decision = 'decline'

  return Response.json(
    {
      decision,
      agreed_rate: row.agreed_rate ? Number(row.agreed_rate) : null,
      broker_name: row.broker_name || null,
    },
    { headers: corsHeaders(req) }
  )
}
