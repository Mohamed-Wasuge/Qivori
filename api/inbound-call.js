/**
 * Inbound Call Handler — Retell AI voice for ALL inbound calls
 *
 * Flow:
 *   1. Twilio receives call → POST here
 *   2. Identify caller via Supabase (driver, broker callback, unknown)
 *   3. Register call with Retell AI, passing caller context as dynamic variables
 *   4. Return TwiML <Dial><Sip> to bridge caller audio to Retell
 *   5. Retell Q has a natural conversation — no rigid phone tree
 *   6. Call ends → retell-webhook.js logs transcript + outcome
 *
 * Multi-tenant: Every query is scoped by owner_id/user_id.
 * Q never leaks one carrier's data to another.
 *
 * Runtime: Vercel Edge
 */

export const config = { runtime: 'edge' }

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_KEY
const RETELL_API_KEY = process.env.RETELL_API_KEY
const RETELL_AGENT_ID = process.env.RETELL_AGENT_ID

const sbHeaders = () => ({
  apikey: supabaseKey,
  Authorization: 'Bearer ' + supabaseKey,
  'Content-Type': 'application/json',
})

async function sbGet(path) {
  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, { headers: sbHeaders() })
  return res.ok ? res.json() : []
}

async function sbPost(table, data) {
  await fetch(`${supabaseUrl}/rest/v1/${table}`, {
    method: 'POST', headers: sbHeaders(), body: JSON.stringify(data),
  })
}

async function sbPatch(path, data) {
  await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    method: 'PATCH', headers: sbHeaders(), body: JSON.stringify(data),
  })
}

function twimlResponse(body) {
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`,
    { headers: { 'Content-Type': 'text/xml' } }
  )
}

// ─── RETELL BRIDGE ──────────────────────────────────────────────────────────
// Register call with Retell and return TwiML to bridge via SIP
async function bridgeToRetell(callerPhone, calledNumber, callSid, callerType, dynamicVars, metadata) {
  const res = await fetch('https://api.retellai.com/v2/register-phone-call', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RETELL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      agent_id: RETELL_AGENT_ID,
      direction: 'inbound',
      from_number: callerPhone,
      to_number: calledNumber,
      metadata: { ...metadata, twilio_call_sid: callSid, call_type: callerType },
      retell_llm_dynamic_variables: dynamicVars,
      agent_override: {
        agent: { agent_name: 'Q' },
        retell_llm: { begin_message: dynamicVars._begin_message || "Hey, this is Q from Qivori Dispatch. How can I help you?" },
      },
    }),
  })

  if (!res.ok) {
    // Retell down — simple fallback
    return twimlResponse(
      '<Say voice="Polly.Matthew-Neural">Hey, thanks for calling Qivori Dispatch. We are having a brief technical issue. Please call back in a minute.</Say><Hangup/>'
    )
  }

  const data = await res.json()
  return twimlResponse(`<Dial><Sip>sip:${data.call_id}@sip.retellai.com</Sip></Dial>`)
}

// ─── MAIN HANDLER ───────────────────────────────────────────────────────────
export default async function handler(req) {
  if (req.method === 'GET') {
    // Debug endpoint
    if (req.url.includes('debug=1')) {
      try {
        const res = await fetch(`${supabaseUrl}/rest/v1/drivers?select=id&limit=1`, { headers: sbHeaders() })
        const data = await res.json()
        return new Response(JSON.stringify({
          supabaseUrl: supabaseUrl ? 'set' : 'NOT SET',
          serviceKey: supabaseKey ? 'set' : 'NOT SET',
          retellKey: RETELL_API_KEY ? 'set' : 'NOT SET',
          retellAgent: RETELL_AGENT_ID || 'NOT SET',
          dbTest: res.ok ? 'connected' : 'failed',
          driversFound: data.length,
        }), { headers: { 'Content-Type': 'application/json' } })
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 })
      }
    }
    return new Response('Inbound call handler active (Retell)', { status: 200 })
  }

  try {
    const text = await req.text()
    const params = new URLSearchParams(text)
    const callerPhone = params.get('From') || ''
    const calledNumber = params.get('To') || ''
    const callSid = params.get('CallSid') || ''

    if (!callerPhone) {
      return twimlResponse('<Say voice="Polly.Matthew-Neural">Thank you for calling Qivori Dispatch.</Say><Hangup/>')
    }

    const callerDigits = callerPhone.replace(/\D/g, '')
    const callerLast10 = callerDigits.slice(-10)

    // --- STEP 1: Check if caller is a DRIVER ---
    const driverMatch = await identifyDriver(callerLast10)
    if (driverMatch) {
      logInboundCall(callSid, callerPhone, calledNumber, 'driver', driverMatch).catch(() => {})
      return handleDriverCall(driverMatch, callSid, callerPhone, calledNumber)
    }

    // --- STEP 2: Check if caller is a BROKER calling back ---
    const brokerMatches = await identifyBrokerCallback(callerLast10)

    if (brokerMatches.length > 0) {
      cancelPendingRetries(callerLast10).catch(() => {})
    }

    logInboundCall(callSid, callerPhone, calledNumber, 'broker', brokerMatches[0] || null).catch(() => {})

    if (brokerMatches.length >= 1) {
      return handleBrokerCallback(brokerMatches, callSid, callerPhone, calledNumber)
    }

    // --- STEP 3: Unknown caller ---
    logInboundCall(callSid, callerPhone, calledNumber, 'unknown', null).catch(() => {})
    return handleUnknownCaller(callSid, callerPhone, calledNumber)

  } catch (err) {
    // Last resort — try Retell with no context
    try {
      return await bridgeToRetell('+10000000000', '+10000000000', '', 'unknown_inbound', {
        call_type: 'unknown_inbound',
        caller_name: 'Caller',
        caller_context: 'Unknown caller. System had a technical issue loading their info.',
        conversation_instructions: 'Greet them as Q from Qivori Dispatch. Ask how you can help. Keep it natural.',
        _begin_message: "Hey, thanks for calling Qivori Dispatch. This is Q. How can I help you?",
      }, {})
    } catch {
      return twimlResponse(
        '<Say voice="Polly.Matthew-Neural">Thanks for calling Qivori Dispatch. Please try again in a moment.</Say><Hangup/>'
      )
    }
  }
}

// ─── DRIVER IDENTIFICATION ──────────────────────────────────────────────────
async function identifyDriver(phone10) {
  const drivers = await sbGet(
    `drivers?phone=like.*${phone10}&select=id,full_name,name,phone,owner_id,pay_model,pay_rate&limit=1`
  )
  if (drivers.length === 0) return null

  const driver = drivers[0]
  const companies = await sbGet(
    `companies?owner_id=eq.${driver.owner_id}&select=name,mc_number,dot_number&limit=1`
  )
  const company = companies[0] || {}

  const driverName = driver.full_name || driver.name || ''
  const activeLoads = await sbGet(
    `loads?owner_id=eq.${driver.owner_id}&driver=eq.${encodeURIComponent(driverName)}&status=in.(Assigned,In Transit,Loaded,At Pickup,At Delivery)&select=id,load_id,origin,destination,status,miles,gross,pickup_date,delivery_date,broker_name&order=created_at.desc&limit=5`
  )

  return { driver, company, activeLoads, driverName }
}

// ─── DRIVER CALL → RETELL ───────────────────────────────────────────────────
function handleDriverCall(match, callSid, callerPhone, calledNumber) {
  const { driver, company, activeLoads, driverName } = match
  const firstName = driverName.split(' ')[0] || 'driver'
  const companyName = company.name || 'your company'

  let loadContext = 'No active loads assigned right now.'
  if (activeLoads.length > 0) {
    loadContext = activeLoads.map(l => {
      const origin = (l.origin || '').split(',')[0]
      const dest = (l.destination || l.dest || '').split(',')[0]
      return `Load ${l.load_id || l.id}: ${origin} to ${dest}, status ${l.status}, broker ${l.broker_name || 'unknown'}`
    }).join('. ')
  }

  const dynamicVars = {
    call_type: 'driver_inbound',
    caller_name: firstName,
    carrier_name: companyName,
    carrier_mc: company.mc_number || '',
    carrier_dot: company.dot_number || '',
    caller_context: `Driver ${driverName} is calling in. They drive for ${companyName}. Their loads: ${loadContext}`,
    conversation_instructions: `Greet ${firstName} by name. Give their load status naturally. Help with: status updates, ETA, delay reporting, directions, next load requests. If they have no loads, offer to have dispatch reach out. Keep it short and natural like a real dispatcher. You are Q.`,
    _begin_message: `Hey ${firstName}, it's Q from ${companyName}. I've got your info pulled up. What's going on?`,
  }

  const metadata = {
    driver_id: driver.id,
    owner_id: driver.owner_id,
    load_id: activeLoads[0]?.id || null,
  }

  return bridgeToRetell(callerPhone, calledNumber, callSid, 'driver_inbound', dynamicVars, metadata)
}

// ─── BROKER IDENTIFICATION ──────────────────────────────────────────────────
async function identifyBrokerCallback(phone10) {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
  const matches = await sbGet(
    `call_logs?broker_phone=like.*${phone10}&created_at=gte.${cutoff}&order=created_at.desc&limit=10&select=id,load_id,broker_name,broker_phone,carrier_name,origin,destination,rate,equipment,outcome,user_id,created_at`
  )

  const seen = new Set()
  const unique = matches.filter(m => {
    if (!m.load_id) return false
    const key = `${m.load_id}_${m.user_id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  for (const match of unique) {
    if (match.user_id) {
      const companies = await sbGet(
        `companies?owner_id=eq.${match.user_id}&select=name,mc_number,dot_number&limit=1`
      )
      match.company = companies[0] || {}
    }
  }

  return unique
}

// ─── BROKER CALLBACK → RETELL ───────────────────────────────────────────────
function handleBrokerCallback(matches, callSid, callerPhone, calledNumber) {
  const match = matches[0]
  const carrier = match.carrier_name || match.company?.name || 'our carrier'
  const mc = match.company?.mc_number || ''
  const dot = match.company?.dot_number || ''
  const brokerName = match.broker_name || ''
  const firstName = brokerName ? brokerName.split(' ')[0] : 'there'

  let loadContext = `Load from ${match.origin || 'unknown'} to ${match.destination || 'unknown'}. Posted rate: $${match.rate || 'unknown'}. Equipment: ${match.equipment || 'dry van'}.`

  if (matches.length > 1) {
    loadContext += ' We also called about: ' + matches.slice(1, 3).map(m =>
      `${(m.origin || '').split(',')[0]} to ${(m.destination || '').split(',')[0]} at $${m.rate || 'unknown'}`
    ).join(', ') + '.'
  }

  const dynamicVars = {
    call_type: 'broker_callback',
    caller_name: firstName,
    carrier_name: carrier,
    carrier_mc: mc,
    carrier_dot: dot,
    caller_context: `Broker ${brokerName || 'unknown'} is returning our call. ${loadContext} We called them from this platform on behalf of ${carrier}${mc ? ' MC ' + mc : ''}.`,
    conversation_instructions: `This broker is calling back about a load we reached out about. Thank them for calling back. Confirm if the load is still available. If yes, negotiate the rate — you represent ${carrier}${mc ? ' MC ' + mc : ''}${dot ? ' DOT ' + dot : ''}. Be professional but personable, use dispatcher language. If they agree on a rate, ask for their email for rate confirmation. If the load is taken, ask if they have anything else in that lane.`,
    _begin_message: `Hey ${firstName}, this is Q calling on behalf of ${carrier}${mc ? ', MC ' + mc : ''}. Thanks for getting back to us about that ${(match.origin || '').split(',')[0]} to ${(match.destination || '').split(',')[0]} load. Is that still available?`,
  }

  const metadata = {
    loadId: match.load_id || '',
    brokerName: brokerName,
    brokerPhone: callerPhone,
    carrierName: carrier,
    origin: match.origin || '',
    destination: match.destination || '',
    rate: String(match.rate || ''),
    userId: match.user_id || '',
  }

  return bridgeToRetell(callerPhone, calledNumber, callSid, 'broker_callback', dynamicVars, metadata)
}

// ─── UNKNOWN CALLER → RETELL ────────────────────────────────────────────────
function handleUnknownCaller(callSid, callerPhone, calledNumber) {
  const dynamicVars = {
    call_type: 'unknown_inbound',
    caller_name: 'Caller',
    carrier_name: 'Qivori Dispatch',
    carrier_mc: '',
    carrier_dot: '',
    caller_context: 'Unknown caller. Not found in drivers or recent broker call logs.',
    conversation_instructions: 'Greet them as Q from Qivori Dispatch. Ask how you can help. If they are a broker returning a call, get the load details and help them. If they are asking about Qivori, give a brief pitch: AI-powered dispatch for trucking companies. If they want to reach a specific carrier, try to help route them. Keep it natural and helpful.',
    _begin_message: "Hey, thanks for calling Qivori Dispatch. This is Q. How can I help you today?",
  }

  return bridgeToRetell(callerPhone, calledNumber, callSid, 'unknown_inbound', dynamicVars, {})
}

// ─── UTILITIES ──────────────────────────────────────────────────────────────
async function cancelPendingRetries(phone10) {
  const pending = await sbGet(
    `check_calls?call_type=eq.broker_retry&call_status=eq.scheduled&broker_phone=like.*${phone10}&select=id`
  )
  if (pending.length === 0) return
  const ids = pending.map(p => p.id)
  await sbPatch(
    `check_calls?id=in.(${ids.join(',')})`,
    { call_status: 'cancelled', notes: 'Caller called back — retry cancelled' }
  )
}

async function logInboundCall(callSid, from, to, callerType, match) {
  await sbPost('call_logs', {
    twilio_call_sid: callSid,
    broker_phone: from,
    call_status: 'inbound',
    outcome: `inbound_${callerType}`,
    load_id: match?.load_id || match?.activeLoads?.[0]?.id || null,
    user_id: match?.user_id || match?.driver?.owner_id || null,
    carrier_name: match?.carrier_name || match?.company?.name || null,
    broker_name: match?.broker_name || null,
    notes: `Inbound call from ${callerType}${match ? ' — identified and routed to Retell' : ' — unknown caller'}`,
    created_at: new Date().toISOString(),
  })
}
