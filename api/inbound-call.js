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
      retell_llm_dynamic_variables: {
        driver_name: dynamicVars.caller_name || 'Caller',
        context: dynamicVars.caller_context || '',
        language: 'english',
      },
      agent_override: {
        agent: { agent_name: 'Q' },
        retell_llm: Object.assign(
          { begin_message: dynamicVars._begin_message || "Hey, this is Q from Qivori Dispatch. How can I help you?" },
          dynamicVars._prompt ? { general_prompt: dynamicVars._prompt } : {}
        ),
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
  // Log the Retell response for debugging
  console.log('Retell register response:', JSON.stringify(data))
  // Bridge to Retell via SIP — add action URL to catch SIP failures
  const sipUri = `sip:${data.call_id}@sip.retellai.com;transport=tls`
  return twimlResponse(
    `<Dial timeout="30" action="https://www.qivori.com/api/inbound-call?stage=sip_fallback"><Sip>${sipUri}</Sip></Dial>`
  )
}

// ─── MAIN HANDLER ───────────────────────────────────────────────────────────
export default async function handler(req) {
  if (req.method === 'GET') {
    // Debug endpoint
    if (req.url.includes('debug=1')) {
      try {
        const dbRes = await fetch(`${supabaseUrl}/rest/v1/drivers?select=id&limit=1`, { headers: sbHeaders() })
        const dbData = await dbRes.json()

        // Test Retell register-phone-call to see full response
        const retellRes = await fetch('https://api.retellai.com/v2/register-phone-call', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${RETELL_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agent_id: RETELL_AGENT_ID,
            direction: 'inbound',
            from_number: '+13134748674',
            to_number: '+10000000000',
          }),
        })
        const retellData = await retellRes.json()

        return new Response(JSON.stringify({
          supabaseUrl: supabaseUrl ? 'set' : 'NOT SET',
          serviceKey: supabaseKey ? 'set' : 'NOT SET',
          retellKey: RETELL_API_KEY ? 'set' : 'NOT SET',
          retellAgent: RETELL_AGENT_ID || 'NOT SET',
          dbTest: dbRes.ok ? 'connected' : 'failed',
          driversFound: dbData.length,
          retellStatus: retellRes.status,
          retellFullResponse: retellData,
        }), { headers: { 'Content-Type': 'application/json' } })
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 })
      }
    }
    return new Response('Inbound call handler active (Retell)', { status: 200 })
  }

  try {
    const reqUrl = new URL(req.url)

    // SIP fallback — Twilio calls this when <Dial><Sip> fails
    if (reqUrl.searchParams.get('stage') === 'sip_fallback') {
      const form = await req.text()
      const fp = new URLSearchParams(form)
      const dialStatus = fp.get('DialCallStatus') || fp.get('DialSipResponseCode') || 'unknown'
      const sipCode = fp.get('DialSipResponseCode') || 'none'
      // Log the SIP failure so we can diagnose
      console.log('SIP FALLBACK:', JSON.stringify({ dialStatus, sipCode, allParams: Object.fromEntries(fp) }))
      sbPost('call_logs', {
        twilio_call_sid: fp.get('CallSid') || '',
        call_status: 'sip_failed',
        outcome: 'sip_error',
        notes: `SIP dial failed: status=${dialStatus}, sipCode=${sipCode}`,
        created_at: new Date().toISOString(),
      }).catch(() => {})
      return twimlResponse(
        '<Say voice="Polly.Matthew-Neural">Hey, thanks for calling Qivori Dispatch. This is Q. Our voice system is briefly updating. Please call back in one minute and I will be ready for you.</Say><Hangup/>'
      )
    }

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
        caller_name: 'Caller',
        caller_context: 'Unknown caller. System had a technical issue.',
        _begin_message: "Hey, thanks for calling Qivori Dispatch. This is Q. How can I help you?",
        _prompt: 'You are Q, an AI freight dispatcher at Qivori Dispatch. Someone is calling. Find out who they are and what they need. Be short, natural, helpful. Never say you are AI.',
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
    caller_name: firstName,
    caller_context: `Driver ${driverName} is calling in. They drive for ${companyName}. Their loads: ${loadContext}`,
    _begin_message: `Hey ${firstName}, it's Q from ${companyName}. I've got your info pulled up. What's going on?`,
    _prompt: `You are Q, an elite AI freight dispatcher at ${companyName}. 15 years in freight. A driver named ${driverName} is calling you.

THEIR LOADS: ${loadContext}

RULES:
- 2-3 sentences max. Driver is on the road, often hands-free.
- Sound human: contractions, real talk, no corporate speak.
- Never say "I am an AI" — you are Q, their dispatcher.
- Use real dispatcher language: "solid", "light", "crushed it", "that lane is trash"
- You can help with: load status, ETA, delays, directions, next load requests, invoicing, fuel/IFTA, HOS.
- If they have no loads, offer to have dispatch reach out with available loads.
- Numbers matter more than explanations. Show the math, skip the essay.
- Keep the call under 60 seconds.`,
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
    caller_name: firstName,
    caller_context: `Broker ${brokerName || 'unknown'} is returning our call. ${loadContext}`,
    _begin_message: `Hey ${firstName}, this is Q on behalf of ${carrier}${mc ? ', MC ' + mc : ''}. Thanks for getting back to us about that ${(match.origin || '').split(',')[0]} to ${(match.destination || '').split(',')[0]} load. Is that still available?`,
    _prompt: `You are Q, an elite AI freight dispatcher representing ${carrier}${mc ? ', MC ' + mc : ''}${dot ? ', DOT ' + dot : ''}. A broker is calling you back about a load.

LOAD DETAILS: ${loadContext}

YOUR JOB:
- This broker is returning our call. Thank them for calling back.
- Confirm if the load is still available.
- If available, negotiate the rate. Our target rate is $${match.rate || 'market rate'}. You can flex 5-10% but push for the posted rate first.
- Be professional but personable. Use dispatcher language — "bet", "solid", "what can you do on the rate?"
- If they agree on a rate, ask for their email so we can send a rate confirmation.
- If the load is taken, ask: "You got anything else in that lane?"
- Never say you are AI. You are Q, the dispatcher.
- Keep responses short — 2-3 sentences max. This is a phone call, not an email.
- If they ask about our carrier: ${carrier}${mc ? ', MC ' + mc : ''}${dot ? ', DOT ' + dot : ''}, clean safety record, on-time delivery.`,
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
    caller_name: 'Caller',
    caller_context: 'Unknown caller. Not found in our system.',
    _begin_message: "Hey, thanks for calling Qivori Dispatch. This is Q. How can I help you today?",
    _prompt: `You are Q, an AI freight dispatcher at Qivori Dispatch. Someone is calling in and we don't have their info in our system yet.

YOUR JOB:
- Find out who they are and what they need.
- If they're a broker returning a call about a load, get the details: origin, destination, rate. Help them.
- If they're a driver looking for loads or dispatch help, tell them about Qivori — AI-powered dispatch for owner-operators and small fleets.
- If they're asking about Qivori services, give a brief pitch: "We're an AI dispatch platform for trucking companies. Q handles broker calls, load matching, invoicing, compliance — the whole nine. Your drivers can even talk to me hands-free."
- If they want to reach a specific person or carrier, ask for details and offer to help route them.
- Never say you are AI. You are Q, the dispatcher.
- Keep it short, natural, friendly. 2-3 sentences max per response.
- Sound like a real dispatcher: contractions, casual, confident.`,
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
