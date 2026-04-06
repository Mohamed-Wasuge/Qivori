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
  const { driver, company, activeLoads, recentLoads, memories, driverName } = match
  const firstName = driverName.split(' ')[0] || 'driver'
  const companyName = company.name || 'your company'

  let loadContext = 'No active loads assigned right now.'
  if (activeLoads.length > 0) {
    loadContext = activeLoads.map(l => {
      const origin = (l.origin || '').split(',')[0]
      const dest = (l.destination || l.dest || '').split(',')[0]
      const rpm = l.miles > 0 ? (Number(l.gross) / l.miles).toFixed(2) : '?'
      return `Load ${l.load_id || l.id}: ${origin} to ${dest}, ${l.miles}mi, $${l.gross} ($${rpm}/mi), status ${l.status}, pickup ${l.pickup_date || 'TBD'}, broker ${l.broker_name || 'unknown'}`
    }).join('. ')
  }

  // Recent delivery history
  let recentContext = ''
  if (recentLoads && recentLoads.length > 0) {
    const totalMiles = recentLoads.reduce((s, l) => s + (l.miles || 0), 0)
    const totalGross = recentLoads.reduce((s, l) => s + Number(l.gross || 0), 0)
    const avgRpm = totalMiles > 0 ? (totalGross / totalMiles).toFixed(2) : '?'
    recentContext = `Last ${recentLoads.length} delivered loads: ${totalMiles} total miles, $${totalGross} gross, $${avgRpm}/mi avg.`
  }

  // Driver details
  const payInfo = driver.pay_model && driver.pay_rate
    ? `Pay: ${driver.pay_model === 'percent' ? driver.pay_rate + '%' : '$' + driver.pay_rate + '/' + driver.pay_model}`
    : ''
  const hosInfo = driver.hos_drive_remaining ? `HOS: ${driver.hos_drive_remaining}hrs drive remaining.` : ''
  const equipInfo = driver.equipment ? `Equipment: ${driver.equipment}.` : ''
  const homeBase = driver.home_base ? `Home base: ${driver.home_base}.` : ''

  // Q's memories about this driver/company
  let memoryContext = ''
  if (memories && memories.length > 0) {
    const relevant = memories
      .filter(m => m.content && m.importance >= 5)
      .slice(0, 5)
      .map(m => `- ${m.content}`)
      .join('\n')
    if (relevant) memoryContext = `\nTHINGS Q REMEMBERS:\n${relevant}`
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
          general_prompt: `You are Q, an elite AI freight dispatcher at ${companyName}. 15 years in freight, sharp with numbers, no BS. A driver named ${driverName} is calling you.

DRIVER PROFILE:
${equipInfo} ${homeBase} ${payInfo} ${hosInfo}

ACTIVE LOADS: ${loadContext}

${recentContext ? 'RECENT HISTORY: ' + recentContext : ''}
${memoryContext}

WHAT Q DOES:
- Know their loads cold — status, ETA, pickup/delivery times, broker name, rate.
- If they ask about money: calculate their cut instantly. ${driver.pay_model === 'percent' ? `They get ${driver.pay_rate}% of gross.` : payInfo}
- If they report delays/issues: acknowledge it, ask if they need dispatch to call the broker.
- If they need next load: tell them you'll find something in their lane and text them options.
- If they ask about fuel: reference nearby truck stops on their route.
- If HOS is tight, factor that into any load suggestions.

VOICE RULES:
- 2-3 sentences max. They're driving, often hands-free.
- Sound human: contractions, real talk, no corporate speak.
- Never say "I am an AI" — you are Q, their dispatcher.
- Dispatcher language: "solid", "light", "crushed it", "that lane is trash", "you're sitting pretty"
- Numbers over explanations. Show the math, skip the essay.
- Keep the call under 60 seconds. Be the dispatcher they brag about to other drivers.`,
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
  const rate = Number(match.rate || 0)

  // Negotiation intelligence
  const neg = match.negSettings || {}
  const minRpm = neg.min_rate_per_mile || 2.50
  const counterMarkup = neg.counter_offer_markup_pct || 10
  const maxRounds = neg.max_counter_rounds || 2
  const autoAccept = neg.auto_accept_above_minimum || false

  // Rate analysis
  const miles = Number(match.miles || 0)
  const rpm = miles > 0 ? (rate / miles).toFixed(2) : 0
  const targetRate = Math.round(rate * (1 + counterMarkup / 100))
  const floorRate = Math.round(minRpm * (miles || 500))
  const floorRpm = minRpm

  // Diesel cost context
  const dieselPrice = match.dieselPrice || 4.00
  const fuelCostPerMile = (dieselPrice / 6.5).toFixed(2) // ~6.5 mpg avg
  const operatingCost = (Number(fuelCostPerMile) + 0.51).toFixed(2) // fuel + fixed costs

  // Broker urgency
  const urgency = match.urgency
  let urgencyContext = ''
  if (urgency) {
    const level = urgency.urgency_score >= 70 ? 'HIGH' : urgency.urgency_score >= 40 ? 'MEDIUM' : 'LOW'
    urgencyContext = `\nBROKER URGENCY: ${level} (${urgency.urgency_score}/100). Called us ${urgency.call_count || 1} times.`
    if (urgency.signals?.length > 0) {
      urgencyContext += ` Signals: ${urgency.signals.slice(0, 3).join(', ')}.`
    }
    if (urgency.urgency_score >= 70) {
      urgencyContext += ' → They need this covered badly. Push for top rate.'
    }
  }

  let loadContext = `Load from ${match.origin || 'unknown'} to ${match.destination || 'unknown'}. Posted rate: $${rate}${miles ? ` (${miles}mi, $${rpm}/mi)` : ''}. Equipment: ${match.equipment || 'dry van'}.`

  if (matches.length > 1) {
    loadContext += ' We also called about: ' + matches.slice(1, 3).map(m =>
      `${(m.origin || '').split(',')[0]} to ${(m.destination || '').split(',')[0]} at $${m.rate || 'unknown'}`
    ).join(', ') + '.'
  }

  // Rate verdict
  let rateVerdict = ''
  if (rpm > 0) {
    if (rpm >= 3.00) rateVerdict = 'EXCELLENT rate — accept if available.'
    else if (rpm >= 2.50) rateVerdict = 'GOOD rate — solid, worth taking.'
    else if (rpm >= minRpm) rateVerdict = 'FAIR rate — push for more but acceptable.'
    else rateVerdict = `BELOW MINIMUM ($${minRpm}/mi floor) — must negotiate up or walk.`
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
        rate: String(rate),
        userId: match.user_id || '',
      },
      agent_override: {
        agent: { agent_name: 'Q' },
        retell_llm: {
          begin_message: `Hey ${firstName}, this is Q on behalf of ${carrier}${mc ? ', MC ' + mc : ''}. Thanks for getting back to us about that ${originShort} to ${destShort} load. Is that still available?`,
          general_prompt: `You are Q, an elite AI freight dispatcher representing ${carrier}${mc ? ', MC ' + mc : ''}${dot ? ', DOT ' + dot : ''}. 15 years in freight. A broker is calling you back about a load.

LOAD DETAILS: ${loadContext}

RATE INTELLIGENCE:
- Posted: $${rate} ($${rpm}/mi)
- Your target: $${targetRate} ($${(targetRate / (miles || 500)).toFixed(2)}/mi) — push for this first
- Your floor: $${floorRate} ($${floorRpm}/mi) — NEVER go below this
- Operating cost: $${operatingCost}/mi (diesel at $${dieselPrice}/gal)
- ${rateVerdict}
${urgencyContext}

NEGOTIATION STRATEGY:
1. First confirm the load is still available.
2. If available and rate is at/above target ($${targetRate}): "That works, let's lock it in. What email should I send the rate con to?"
3. If rate is between floor and target: Counter with "What can you do on the rate? We're looking at $${targetRate} on that lane." If they counter back above floor, take it.
4. If rate is below floor ($${floorRate}): "I appreciate it but that doesn't cover our costs on that lane. We'd need at least $${floorRate} to make it work."
5. ${urgency && urgency.urgency_score >= 60 ? 'This broker is eager — hold firm on your target rate, they will likely come up.' : 'Standard negotiation — be flexible but protect your floor.'}
6. Max ${maxRounds} counter rounds. After that: take it or walk.
7. If they agree: "Solid. What's your email? I'll shoot over the rate con right now."
8. If load is taken: "No worries. You got anything else in that lane? We run ${originShort} to ${destShort} regularly."

VOICE RULES:
- 2-3 sentences max. This is a phone call, not an essay.
- Sound like a real dispatcher: "bet", "solid", "what can you do on the rate?", "we run that lane heavy"
- Never say you are AI. You are Q, the dispatcher.
- Know your numbers cold. RPM, gross, operating cost — instant answers.
- Carrier info: ${carrier}${mc ? ', MC ' + mc : ''}${dot ? ', DOT ' + dot : ''}, clean safety record, on-time delivery, no double-brokering.`,
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
    `drivers?phone=like.*${phone10}&select=id,full_name,name,phone,owner_id,pay_model,pay_rate,hos_drive_remaining,equipment,home_base&limit=1`
  )
  if (drivers.length === 0) return null

  const driver = drivers[0]

  // Parallel fetches for speed (budget: <5s total)
  const [companies, activeLoads, recentLoads, memories] = await Promise.all([
    sbGet(`companies?owner_id=eq.${driver.owner_id}&select=name,mc_number,dot_number&limit=1`),
    sbGet(`loads?owner_id=eq.${driver.owner_id}&driver=eq.${encodeURIComponent(driver.full_name || driver.name || '')}&status=in.(Assigned,In Transit,Loaded,At Pickup,At Delivery)&select=id,load_id,origin,destination,status,miles,gross,pickup_date,delivery_date,broker_name&order=created_at.desc&limit=5`),
    sbGet(`loads?owner_id=eq.${driver.owner_id}&driver=eq.${encodeURIComponent(driver.full_name || driver.name || '')}&status=eq.Delivered&select=id,origin,destination,gross,miles&order=created_at.desc&limit=5`),
    sbGet(`q_memories?owner_id=eq.${driver.owner_id}&order=importance.desc,updated_at.desc&limit=10`),
  ])

  const company = companies[0] || {}
  const driverName = driver.full_name || driver.name || ''

  return { driver, company, activeLoads, recentLoads, memories, driverName }
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
      // Parallel: company, negotiation settings, broker urgency, diesel prices
      const [companies, negSettings, urgencyRows, dieselRows] = await Promise.all([
        sbGet(`companies?owner_id=eq.${match.user_id}&select=name,mc_number,dot_number&limit=1`),
        sbGet(`negotiation_settings?user_id=eq.${match.user_id}&select=min_rate_per_mile,counter_offer_markup_pct,max_counter_rounds,auto_accept_above_minimum&limit=1`),
        match.broker_name ? sbGet(`broker_urgency_scores?owner_id=eq.${match.user_id}&broker_name=eq.${encodeURIComponent(match.broker_name)}&select=urgency_score,signals,call_count&limit=1`) : [],
        sbGet(`diesel_prices?region=eq.US AVG&order=fetched_at.desc&limit=1`),
      ])
      match.company = companies[0] || {}
      match.negSettings = negSettings[0] || { min_rate_per_mile: 2.50, counter_offer_markup_pct: 10, max_counter_rounds: 2 }
      match.urgency = urgencyRows[0] || null
      match.dieselPrice = dieselRows[0]?.price || null
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
