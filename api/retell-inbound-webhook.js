/**
 * Retell Inbound Call Webhook — Q Voice Intelligence Layer
 *
 * Architecture:
 *   Dashboard prompt = Q's personality + decision logic (uses {{dynamic_variables}})
 *   This webhook    = data layer (parallel DB reads → pack into dynamic_variables)
 *   Post-call hook  = feedback loop (retell-webhook.js updates urgency, memories, status)
 *
 * Retell fires this BEFORE answering. Must respond in <10s (3 retries on failure).
 * All dynamic_variable values MUST be strings — Retell requirement.
 *
 * Caller resolution order:
 *   1. Owner/admin (profiles table — the carrier themselves)
 *   2. Driver (drivers table — driver calling their dispatch)
 *   3. Broker callback (call_logs — broker returning our outbound call)
 *   4. Unknown (new lead, shipper, or wrong number)
 *
 * Multi-tenant: every query scoped by owner_id.
 * Fail-open: on any error, Q answers with unknown-caller defaults.
 *
 * Runtime: Vercel Edge
 */

export const config = { runtime: 'edge' }

// ─── ENVIRONMENT ───────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY

// ─── SUPABASE CLIENT (edge-compatible, no SDK) ────────────────────────────

const headers = () => ({
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
})

async function sbGet(path) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: headers() })
    return res.ok ? res.json() : []
  } catch { return [] }
}

async function sbPost(table, data) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST', headers: headers(), body: JSON.stringify(data),
    })
  } catch {}
}

async function sbPatch(path, data) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method: 'PATCH', headers: headers(), body: JSON.stringify(data),
    })
  } catch {}
}

function respond(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// ─── MAIN HANDLER ──────────────────────────────────────────────────────────

export default async function handler(req) {
  if (req.method === 'GET') {
    return new Response('Retell inbound webhook active', { status: 200 })
  }
  if (req.method !== 'POST') {
    return respond({ error: 'POST only' }, 405)
  }

  try {
    const body = await req.json()
    const { event, call_inbound: inbound } = body

    if (event !== 'call_inbound' || !inbound) {
      return respond({ call_inbound: {} })
    }

    const fromNumber = inbound.from_number || ''
    const toNumber = inbound.to_number || ''
    const phone10 = fromNumber.replace(/\D/g, '').slice(-10)

    if (!phone10 || phone10.length < 10) {
      return respond(buildResponse('unknown'))
    }

    // ── Parallel caller identification ──────────────────────────────────
    // Run all lookups simultaneously. First match wins (owner > driver > broker > unknown).
    const [ownerMatch, driverMatch, brokerMatch] = await Promise.all([
      findOwner(phone10),
      findDriver(phone10),
      findBrokerCallback(phone10),
    ])

    if (ownerMatch) {
      logCall(fromNumber, toNumber, 'owner', ownerMatch).catch(() => {})
      return respond(buildResponse('owner', ownerMatch))
    }

    if (driverMatch) {
      logCall(fromNumber, toNumber, 'driver', driverMatch).catch(() => {})
      return respond(buildResponse('driver', driverMatch))
    }

    if (brokerMatch) {
      cancelRetries(phone10).catch(() => {})
      logCall(fromNumber, toNumber, 'broker', brokerMatch).catch(() => {})
      return respond(buildResponse('broker', brokerMatch))
    }

    logCall(fromNumber, toNumber, 'unknown', null).catch(() => {})
    return respond(buildResponse('unknown'))

  } catch (err) {
    console.error('[Q Inbound] Fatal:', err.message || err)
    return respond(buildResponse('unknown'))
  }
}

// ─── CALLER IDENTIFICATION ─────────────────────────────────────────────────
//
// Each function returns null (not found) or a structured object with all
// context needed for response building. All enrichment queries run in
// parallel within each function.

async function findOwner(phone10) {
  const profiles = await sbGet(
    `profiles?phone=like.*${phone10}&select=id,full_name,email,phone,plan,subscription_status&limit=1`
  )
  if (!profiles.length) return null

  const owner = profiles[0]
  const [companies, recentLoads, memories, drivers] = await Promise.all([
    sbGet(`companies?owner_id=eq.${owner.id}&select=name,mc_number,dot_number&limit=1`),
    sbGet(`loads?owner_id=eq.${owner.id}&status=in.(Assigned,In Transit,Loaded,At Pickup,At Delivery)&select=id,load_id,origin,destination,status,miles,gross,driver,broker_name&order=created_at.desc&limit=5`),
    sbGet(`q_memories?owner_id=eq.${owner.id}&order=importance.desc,updated_at.desc&limit=10`),
    sbGet(`drivers?owner_id=eq.${owner.id}&select=id,full_name,name,phone,status&limit=10`),
  ])

  return {
    owner,
    company: companies[0] || {},
    activeLoads: recentLoads,
    memories,
    drivers,
    name: owner.full_name || 'Boss',
  }
}

async function findDriver(phone10) {
  const drivers = await sbGet(
    `drivers?phone=like.*${phone10}&select=id,full_name,name,phone,owner_id,pay_model,pay_rate,hos_drive_remaining,equipment,home_base&limit=1`
  )
  if (!drivers.length) return null

  const driver = drivers[0]
  const driverName = driver.full_name || driver.name || ''

  const [companies, activeLoads, recentLoads, memories] = await Promise.all([
    sbGet(`companies?owner_id=eq.${driver.owner_id}&select=name,mc_number,dot_number&limit=1`),
    sbGet(`loads?owner_id=eq.${driver.owner_id}&driver=eq.${encodeURIComponent(driverName)}&status=in.(Assigned,In Transit,Loaded,At Pickup,At Delivery)&select=id,load_id,origin,destination,status,miles,gross,pickup_date,delivery_date,broker_name&order=created_at.desc&limit=5`),
    sbGet(`loads?owner_id=eq.${driver.owner_id}&driver=eq.${encodeURIComponent(driverName)}&status=eq.Delivered&select=id,origin,destination,gross,miles&order=created_at.desc&limit=5`),
    sbGet(`q_memories?owner_id=eq.${driver.owner_id}&order=importance.desc,updated_at.desc&limit=10`),
  ])

  return {
    driver,
    company: companies[0] || {},
    activeLoads,
    recentLoads,
    memories,
    name: driverName,
  }
}

async function findBrokerCallback(phone10) {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
  const logs = await sbGet(
    `call_logs?broker_phone=like.*${phone10}&created_at=gte.${cutoff}&call_status=neq.inbound&outcome=not.like.inbound_*&order=created_at.desc&limit=10&select=id,load_id,broker_name,broker_phone,carrier_name,origin,destination,rate,miles,equipment,outcome,user_id,created_at`
  )

  // Deduplicate by load_id + user_id — keep most recent
  const seen = new Set()
  const unique = logs.filter(m => {
    if (!m.load_id) return false
    const key = `${m.load_id}_${m.user_id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  if (!unique.length) return null

  const match = unique[0]

  // Enrich only the primary match with negotiation intelligence
  if (match.user_id) {
    const [companies, negSettings, urgencyRows, dieselRows] = await Promise.all([
      sbGet(`companies?owner_id=eq.${match.user_id}&select=name,mc_number,dot_number&limit=1`),
      sbGet(`negotiation_settings?user_id=eq.${match.user_id}&select=min_rate_per_mile,counter_offer_markup_pct,max_counter_rounds,auto_accept_above_minimum&limit=1`),
      match.broker_name
        ? sbGet(`broker_urgency_scores?owner_id=eq.${match.user_id}&broker_name=eq.${encodeURIComponent(match.broker_name)}&select=urgency_score,signals,call_count&limit=1`)
        : [],
      sbGet(`diesel_prices?region=eq.US AVG&order=fetched_at.desc&limit=1`),
    ])
    match.company = companies[0] || {}
    match.negSettings = negSettings[0] || { min_rate_per_mile: 2.50, counter_offer_markup_pct: 10, max_counter_rounds: 2 }
    match.urgency = urgencyRows[0] || null
    match.dieselPrice = dieselRows[0]?.price || null
  }

  return { match, otherLoads: unique.slice(1, 3) }
}

// ─── RESPONSE BUILDER ──────────────────────────────────────────────────────
//
// Single entry point. Routes to the correct variable packer by caller type.
// Returns the exact Retell webhook response shape.
//
// Key constraint: ALL dynamic_variable values MUST be strings.

function buildResponse(callerType, data = null) {
  const vars = { caller_type: callerType }
  let beginMessage = "Hey, thanks for calling Qivori Dispatch. This is Q. How can I help you today?"

  switch (callerType) {
    case 'owner':
      Object.assign(vars, packOwnerVars(data))
      beginMessage = `Hey ${vars.caller_name}, it's Q. What do you need?`
      break

    case 'driver':
      Object.assign(vars, packDriverVars(data))
      beginMessage = `Hey ${vars.caller_name}, it's Q from ${vars.company_name}. I've got your info pulled up. What's going on?`
      break

    case 'broker':
      Object.assign(vars, packBrokerVars(data))
      beginMessage = `Hey ${vars.caller_name}, this is Q on behalf of ${vars.carrier_name}${vars.carrier_mc ? ', MC ' + vars.carrier_mc : ''}. Thanks for getting back to us about that ${vars.origin_city} to ${vars.destination_city} load. Is that still available?`
      break

    default:
      vars.caller_name = ''
      vars.company_name = 'Qivori Dispatch'
  }

  return {
    call_inbound: {
      dynamic_variables: vars,
      metadata: buildMetadata(callerType, data),
      agent_override: {
        retell_llm: { begin_message: beginMessage },
      },
    },
  }
}

// ─── VARIABLE PACKERS ──────────────────────────────────────────────────────
//
// Each packer transforms raw DB data into flat string key-value pairs
// that the Retell dashboard prompt references as {{variable_name}}.

function packOwnerVars(data) {
  const { owner, company, activeLoads, memories, drivers, name } = data
  const firstName = name.split(' ')[0] || 'Boss'

  // Fleet summary
  const activeDrivers = drivers.filter(d => d.status !== 'inactive')
  const fleetSummary = activeDrivers.length > 0
    ? activeDrivers.map(d => d.full_name || d.name).join(', ')
    : 'No drivers on file.'

  // Active loads summary
  let loadSummary = 'No active loads right now.'
  if (activeLoads.length > 0) {
    loadSummary = activeLoads.map(l => {
      const o = (l.origin || '').split(',')[0]
      const d = (l.destination || '').split(',')[0]
      return `${o} → ${d} (${l.status}, driver: ${l.driver || 'unassigned'})`
    }).join('. ')
  }

  return {
    caller_name: firstName,
    company_name: company.name || 'your company',
    carrier_mc: company.mc_number || '',
    carrier_dot: company.dot_number || '',
    fleet_drivers: fleetSummary,
    fleet_driver_count: String(activeDrivers.length),
    active_loads: loadSummary,
    active_load_count: String(activeLoads.length),
    plan_status: owner.subscription_status || 'unknown',
    q_memories: packMemories(memories),
  }
}

function packDriverVars(data) {
  const { driver, company, activeLoads, recentLoads, memories, name } = data
  const firstName = name.split(' ')[0] || 'driver'

  // Active loads
  let loadContext = 'No active loads assigned right now.'
  if (activeLoads.length > 0) {
    loadContext = activeLoads.map(l => {
      const o = (l.origin || '').split(',')[0]
      const d = (l.destination || l.dest || '').split(',')[0]
      const rpm = l.miles > 0 ? (Number(l.gross) / l.miles).toFixed(2) : '?'
      return `Load ${l.load_id || l.id}: ${o} → ${d}, ${l.miles}mi, $${l.gross} ($${rpm}/mi), status: ${l.status}, pickup: ${l.pickup_date || 'TBD'}, broker: ${l.broker_name || 'unknown'}`
    }).join('. ')
  }

  // Recent delivery history — avg RPM tells Q how this driver typically earns
  let recentHistory = 'No recent delivery history.'
  if (recentLoads && recentLoads.length > 0) {
    const totalMiles = recentLoads.reduce((s, l) => s + (l.miles || 0), 0)
    const totalGross = recentLoads.reduce((s, l) => s + Number(l.gross || 0), 0)
    const avgRpm = totalMiles > 0 ? (totalGross / totalMiles).toFixed(2) : '?'
    recentHistory = `Last ${recentLoads.length} delivered: ${totalMiles} total mi, $${totalGross} gross, $${avgRpm}/mi avg.`
  }

  // Driver profile fields
  const profile = [
    driver.equipment ? `Equipment: ${driver.equipment}` : '',
    driver.home_base ? `Home base: ${driver.home_base}` : '',
    driver.pay_model && driver.pay_rate
      ? `Pay: ${driver.pay_model === 'percent' ? driver.pay_rate + '% of gross' : '$' + driver.pay_rate + '/' + driver.pay_model}`
      : '',
    driver.hos_drive_remaining ? `HOS: ${driver.hos_drive_remaining}hrs drive remaining` : '',
  ].filter(Boolean).join('. ')

  // Pay info (separate variable for quick math reference)
  let payInfo = 'Not set'
  if (driver.pay_model === 'percent') payInfo = `${driver.pay_rate}% of gross`
  else if (driver.pay_model && driver.pay_rate) payInfo = `$${driver.pay_rate}/${driver.pay_model}`

  return {
    caller_name: firstName,
    full_name: name,
    company_name: company.name || 'your company',
    carrier_mc: company.mc_number || '',
    driver_profile: profile || 'No profile details on file.',
    active_loads: loadContext,
    active_load_count: String(activeLoads.length),
    recent_history: recentHistory,
    driver_pay_info: payInfo,
    driver_equipment: driver.equipment || 'Not specified',
    driver_home_base: driver.home_base || 'Not specified',
    driver_hos: driver.hos_drive_remaining ? `${driver.hos_drive_remaining} hours` : 'Unknown',
    q_memories: packMemories(memories),
  }
}

function packBrokerVars(data) {
  const { match, otherLoads } = data
  const carrier = match.carrier_name || match.company?.name || 'our carrier'
  const mc = match.company?.mc_number || ''
  const dot = match.company?.dot_number || ''
  const brokerName = match.broker_name || ''
  const firstName = brokerName ? brokerName.split(' ')[0] : 'there'
  const originShort = (match.origin || '').split(',')[0]
  const destShort = (match.destination || '').split(',')[0]
  const rate = Number(match.rate || 0)
  const miles = Number(match.miles || 0)

  // ── Rate analysis ──
  const neg = match.negSettings || {}
  const minRpm = neg.min_rate_per_mile || 2.50
  const counterMarkup = neg.counter_offer_markup_pct || 10
  const maxRounds = neg.max_counter_rounds || 2

  const rpm = miles > 0 ? (rate / miles).toFixed(2) : '0'
  const targetRate = Math.round(rate * (1 + counterMarkup / 100))
  const floorRate = Math.round(minRpm * (miles || 500))

  // Diesel-based operating cost
  const dieselPrice = match.dieselPrice || 4.00
  const fuelCpm = (dieselPrice / 6.5).toFixed(2)  // ~6.5 mpg avg semi
  const opCost = (Number(fuelCpm) + 0.51).toFixed(2)  // fuel + insurance/maintenance/fixed

  // Rate verdict — tells Q whether to accept, push, or walk
  let verdict = 'No rate analysis available.'
  if (Number(rpm) > 0) {
    if (Number(rpm) >= 3.00) verdict = 'EXCELLENT rate — accept quickly if load is available.'
    else if (Number(rpm) >= 2.50) verdict = 'GOOD rate — solid, worth taking.'
    else if (Number(rpm) >= minRpm) verdict = 'FAIR rate — acceptable but push for more.'
    else verdict = `BELOW MINIMUM ($${minRpm}/mi floor) — negotiate up or walk away.`
  }

  // Broker urgency
  const urgency = match.urgency
  let urgencyText = 'No urgency data — standard negotiation.'
  let strategyText = 'Be flexible but protect your floor rate.'
  if (urgency) {
    const level = urgency.urgency_score >= 70 ? 'HIGH' : urgency.urgency_score >= 40 ? 'MEDIUM' : 'LOW'
    urgencyText = `${level} urgency (${urgency.urgency_score}/100). Called us ${urgency.call_count || 1} time(s).`
    if (urgency.signals?.length > 0) {
      urgencyText += ` Signals: ${urgency.signals.slice(0, 3).join(', ')}.`
    }
    if (urgency.urgency_score >= 70) {
      strategyText = 'Broker is DESPERATE — hold firm on target rate, they will come up. Do not drop below target.'
    } else if (urgency.urgency_score >= 40) {
      strategyText = 'Broker is motivated — push for target but be willing to settle above floor.'
    }
  }

  // Load details — primary + any other loads we called about
  let loadDetails = `${match.origin || 'Unknown'} → ${match.destination || 'Unknown'}. Rate: $${rate}${miles ? ` (${miles}mi, $${rpm}/mi)` : ''}. Equipment: ${match.equipment || 'dry van'}.`
  if (otherLoads && otherLoads.length > 0) {
    loadDetails += ' Also called about: ' + otherLoads.map(m =>
      `${(m.origin || '').split(',')[0]} → ${(m.destination || '').split(',')[0]} at $${m.rate || '?'}`
    ).join(', ') + '.'
  }

  return {
    caller_name: firstName,
    broker_name: brokerName || 'Unknown broker',
    carrier_name: carrier,
    carrier_mc: mc,
    carrier_dot: dot,
    origin_city: originShort,
    destination_city: destShort,
    load_details: loadDetails,
    posted_rate: `$${rate}`,
    rate_per_mile: `$${rpm}/mi`,
    target_rate: `$${targetRate}`,
    target_rpm: `$${(targetRate / (miles || 500)).toFixed(2)}/mi`,
    floor_rate: `$${floorRate}`,
    floor_rpm: `$${minRpm}/mi`,
    operating_cost: `$${opCost}/mi`,
    diesel_price: `$${dieselPrice}/gal`,
    rate_verdict: verdict,
    broker_urgency: urgencyText,
    negotiation_strategy: strategyText,
    max_counter_rounds: String(maxRounds),
    miles: String(miles),
  }
}

// ─── HELPERS ───────────────────────────────────────────────────────────────

function packMemories(memories) {
  if (!memories || !memories.length) return 'No memories stored yet.'
  const relevant = memories
    .filter(m => m.content && m.importance >= 5)
    .slice(0, 5)
    .map(m => `- ${m.content}`)
    .join('\n')
  return relevant || 'No high-priority memories.'
}

function buildMetadata(callerType, data) {
  const meta = { call_type: `${callerType}_inbound` }
  if (!data) return meta

  switch (callerType) {
    case 'owner':
      meta.owner_id = data.owner?.id || ''
      break
    case 'driver':
      meta.driver_id = data.driver?.id || ''
      meta.owner_id = data.driver?.owner_id || ''
      meta.load_id = data.activeLoads?.[0]?.id || ''
      break
    case 'broker':
      meta.load_id = data.match?.load_id || ''
      meta.broker_name = data.match?.broker_name || ''
      meta.carrier_name = data.match?.carrier_name || ''
      meta.origin = data.match?.origin || ''
      meta.destination = data.match?.destination || ''
      meta.rate = String(data.match?.rate || '')
      meta.user_id = data.match?.user_id || ''
      break
  }
  return meta
}

// ─── SIDE EFFECTS (fire-and-forget) ────────────────────────────────────────

async function cancelRetries(phone10) {
  const pending = await sbGet(
    `check_calls?call_type=eq.broker_retry&call_status=eq.scheduled&broker_phone=like.*${phone10}&select=id`
  )
  if (!pending.length) return
  await sbPatch(
    `check_calls?id=in.(${pending.map(p => p.id).join(',')})`,
    { call_status: 'cancelled', notes: 'Broker called back — retry cancelled' }
  )
}

async function logCall(from, to, callerType, data) {
  await sbPost('call_logs', {
    broker_phone: from,
    call_status: 'inbound',
    outcome: `inbound_${callerType}`,
    load_id: data?.match?.load_id || data?.activeLoads?.[0]?.id || null,
    user_id: data?.match?.user_id || data?.driver?.owner_id || data?.owner?.id || null,
    carrier_name: data?.match?.carrier_name || data?.company?.name || null,
    broker_name: data?.match?.broker_name || null,
    notes: `Inbound ${callerType} call — identified via Retell webhook`,
    created_at: new Date().toISOString(),
  })
}
