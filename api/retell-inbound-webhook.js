/**
 * Retell Inbound Call Webhook
 *
 * Retell fires this BEFORE answering an inbound call.
 * We identify the caller and return context so Q knows who's calling
 * from the very first word. No Twilio middleman, no SIP bridges.
 *
 * Flow:
 *   1. Retell receives inbound call → fires webhook with from_number
 *   2. We lookup caller in Supabase (driver? broker callback? unknown?)
 *   3. Return dynamic_variables + agent_override with custom prompt + begin_message
 *   4. Retell Q starts talking immediately with full context
 *
 * Response time budget: <5 seconds (Retell timeout is 10s)
 * Multi-tenant: all queries scoped by owner_id
 *
 * Runtime: Vercel Edge
 */

export const config = { runtime: 'edge' }

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_KEY

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

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// ─── MAIN HANDLER ───────────────────────────────────────────────────────────
export default async function handler(req) {
  if (req.method === 'GET') {
    return new Response('Retell inbound webhook active', { status: 200 })
  }

  if (req.method !== 'POST') {
    return json({ error: 'POST only' }, 405)
  }

  try {
    const body = await req.json()
    const { event, call_inbound } = body

    // Only handle inbound call events
    if (event !== 'call_inbound' || !call_inbound) {
      return json({ call_inbound: {} })
    }

    const fromNumber = call_inbound.from_number || ''
    const toNumber = call_inbound.to_number || ''
    const callerDigits = fromNumber.replace(/\D/g, '')
    const callerLast10 = callerDigits.slice(-10)

    if (!callerLast10) {
      return json(buildResponse('unknown', {}, 'Caller', 'Unknown caller — no phone number.'))
    }

    // --- STEP 1: Check if caller is a DRIVER ---
    const driverMatch = await identifyDriver(callerLast10)
    if (driverMatch) {
      logInboundCall(fromNumber, toNumber, 'driver', driverMatch).catch(() => {})
      return json(buildDriverResponse(driverMatch))
    }

    // --- STEP 2: Check if caller is a BROKER calling back ---
    const brokerMatches = await identifyBrokerCallback(callerLast10)

    if (brokerMatches.length > 0) {
      cancelPendingRetries(callerLast10).catch(() => {})
      logInboundCall(fromNumber, toNumber, 'broker', brokerMatches[0]).catch(() => {})
      return json(buildBrokerResponse(brokerMatches))
    }

    // --- STEP 3: Unknown caller ---
    logInboundCall(fromNumber, toNumber, 'unknown', null).catch(() => {})
    return json(buildUnknownResponse())

  } catch (err) {
    // On error, still answer — Q will wing it
    return json(buildUnknownResponse())
  }
}

// ─── RESPONSE BUILDERS ─────────────────────────────────────────────────────

function buildDriverResponse(match) {
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

  return {
    call_inbound: {
      dynamic_variables: {
        driver_name: firstName,
        context: `Driver ${driverName} calling. Drives for ${companyName}. Loads: ${loadContext}`,
      },
      metadata: {
        call_type: 'driver_inbound',
        driver_id: driver.id,
        owner_id: driver.owner_id,
        load_id: activeLoads[0]?.id || null,
      },
      agent_override: {
        agent: { agent_name: 'Q' },
        retell_llm: {
          begin_message: `Hey ${firstName}, it's Q from ${companyName}. I've got your info pulled up. What's going on?`,
          general_prompt: `You are Q, an elite AI freight dispatcher at ${companyName}. 15 years in freight. A driver named ${driverName} is calling you.

THEIR LOADS: ${loadContext}

RULES:
- 2-3 sentences max. Driver is on the road, often hands-free.
- Sound human: contractions, real talk, no corporate speak.
- Never say "I am an AI" — you are Q, their dispatcher.
- Use real dispatcher language: "solid", "light", "crushed it", "that lane is trash"
- Help with: load status, ETA, delays, directions, next load requests, invoicing, fuel/IFTA, HOS.
- If they have no loads, offer to have dispatch reach out with available loads.
- Numbers matter more than explanations. Show the math, skip the essay.
- Keep the call under 60 seconds.`,
        },
      },
    },
  }
}

function buildBrokerResponse(matches) {
  const match = matches[0]
  const carrier = match.carrier_name || match.company?.name || 'our carrier'
  const mc = match.company?.mc_number || ''
  const dot = match.company?.dot_number || ''
  const brokerName = match.broker_name || ''
  const firstName = brokerName ? brokerName.split(' ')[0] : 'there'
  const originShort = (match.origin || '').split(',')[0]
  const destShort = (match.destination || '').split(',')[0]

  let loadContext = `Load from ${match.origin || 'unknown'} to ${match.destination || 'unknown'}. Posted rate: $${match.rate || 'unknown'}. Equipment: ${match.equipment || 'dry van'}.`

  if (matches.length > 1) {
    loadContext += ' We also called about: ' + matches.slice(1, 3).map(m =>
      `${(m.origin || '').split(',')[0]} to ${(m.destination || '').split(',')[0]} at $${m.rate || 'unknown'}`
    ).join(', ') + '.'
  }

  return {
    call_inbound: {
      dynamic_variables: {
        driver_name: firstName,
        context: `Broker ${brokerName || 'unknown'} returning our call. ${loadContext}`,
      },
      metadata: {
        call_type: 'broker_callback',
        loadId: match.load_id || '',
        brokerName: brokerName,
        carrierName: carrier,
        origin: match.origin || '',
        destination: match.destination || '',
        rate: String(match.rate || ''),
        userId: match.user_id || '',
      },
      agent_override: {
        agent: { agent_name: 'Q' },
        retell_llm: {
          begin_message: `Hey ${firstName}, this is Q on behalf of ${carrier}${mc ? ', MC ' + mc : ''}. Thanks for getting back to us about that ${originShort} to ${destShort} load. Is that still available?`,
          general_prompt: `You are Q, an elite AI freight dispatcher representing ${carrier}${mc ? ', MC ' + mc : ''}${dot ? ', DOT ' + dot : ''}. A broker is calling you back about a load.

LOAD DETAILS: ${loadContext}

YOUR JOB:
- This broker is returning our call. Thank them for calling back.
- Confirm if the load is still available.
- If available, negotiate the rate. Target: $${match.rate || 'market rate'}. Flex 5-10% but push for posted rate first.
- Be professional but personable. Use dispatcher language — "bet", "solid", "what can you do on the rate?"
- If they agree on a rate, ask for their email so we can send a rate confirmation.
- If the load is taken, ask: "You got anything else in that lane?"
- Never say you are AI. You are Q, the dispatcher.
- Keep responses short — 2-3 sentences max. This is a phone call.
- Carrier info: ${carrier}${mc ? ', MC ' + mc : ''}${dot ? ', DOT ' + dot : ''}, clean safety record, on-time delivery.`,
        },
      },
    },
  }
}

function buildUnknownResponse() {
  return {
    call_inbound: {
      dynamic_variables: {
        driver_name: 'Caller',
        context: 'Unknown caller. Not in our system.',
      },
      metadata: {
        call_type: 'unknown_inbound',
      },
      agent_override: {
        agent: { agent_name: 'Q' },
        retell_llm: {
          begin_message: "Hey, thanks for calling Qivori Dispatch. This is Q. How can I help you today?",
          general_prompt: `You are Q, an AI freight dispatcher at Qivori Dispatch. Someone is calling and we don't have their info yet.

YOUR JOB:
- Find out who they are and what they need.
- If they're a broker returning a call about a load, get details: origin, destination, rate.
- If they're a driver looking for dispatch help, tell them about Qivori — AI-powered dispatch for owner-operators and small fleets.
- If they ask about Qivori: "We're an AI dispatch platform for trucking companies. Q handles broker calls, load matching, invoicing, compliance — the whole nine. Your drivers can even talk to me hands-free."
- Never say you are AI. You are Q, the dispatcher.
- Keep it short, natural, friendly. 2-3 sentences max.
- Sound like a real dispatcher: contractions, casual, confident.`,
        },
      },
    },
  }
}

// ─── CALLER IDENTIFICATION ──────────────────────────────────────────────────

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

async function identifyBrokerCallback(phone10) {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
  const matches = await sbGet(
    `call_logs?broker_phone=like.*${phone10}&created_at=gte.${cutoff}&call_status=neq.inbound&outcome=not.like.inbound_*&order=created_at.desc&limit=10&select=id,load_id,broker_name,broker_phone,carrier_name,origin,destination,rate,equipment,outcome,user_id,created_at`
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

async function logInboundCall(from, to, callerType, match) {
  await sbPost('call_logs', {
    broker_phone: from,
    call_status: 'inbound',
    outcome: `inbound_${callerType}`,
    load_id: match?.load_id || match?.activeLoads?.[0]?.id || null,
    user_id: match?.user_id || match?.driver?.owner_id || null,
    carrier_name: match?.carrier_name || match?.company?.name || null,
    broker_name: match?.broker_name || null,
    notes: `Inbound call from ${callerType}${match ? ' — identified via Retell webhook' : ' — unknown caller'}`,
    created_at: new Date().toISOString(),
  })
}
