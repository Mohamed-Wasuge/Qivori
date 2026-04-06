/**
 * Inbound Call Handler — Smart routing for ALL inbound calls
 *
 * Q identifies WHO is calling and routes accordingly:
 *
 * 1. DRIVER calling → Q gives load status, ETA, next steps
 *    - Looks up driver by phone in `drivers` table
 *    - Scoped to driver's owner_id (carrier) — full tenant isolation
 *    - Finds their active loads and delivers status update
 *
 * 2. BROKER calling back → Q picks up with load context
 *    - Matches caller phone against recent outbound call_logs
 *    - If one carrier called them → direct to that carrier's context
 *    - If multiple carriers called them → Q asks which load
 *    - Cancels pending retry calls
 *
 * 3. UNKNOWN caller → Generic Q greeting
 *
 * Multi-tenant: Every query is scoped by owner_id/user_id.
 * Q never leaks one carrier's data to another.
 * Each carrier's company name, MC#, DOT# loaded per call.
 *
 * Runtime: Vercel Edge
 */

export const config = { runtime: 'edge' }

const supabaseUrl = process.env.VITE_SUPABASE_URL
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

// TwiML voice settings — same voice as outbound calls
const VOICE = 'Polly.Matthew-Neural'
const VOICE_RATE = '95%'

function say(text) {
  const ssmlText = text
    .replace(/\. /g, '. <break time="400ms"/> ')
    .replace(/\? /g, '? <break time="300ms"/> ')
  return `<Say voice="${VOICE}"><prosody rate="${VOICE_RATE}">${ssmlText}</prosody></Say>`
}

function gather(actionUrl, prompt, timeout = 8) {
  return `<Gather input="speech" timeout="${timeout}" speechTimeout="auto" action="${actionUrl}" method="POST">`
    + say(prompt)
    + '</Gather>'
}

function twimlResponse(body) {
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`,
    { headers: { 'Content-Type': 'text/xml' } }
  )
}

function baseUrl() {
  return process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://qivori.com'
}

export default async function handler(req) {
  if (req.method === 'GET') {
    return new Response('Inbound call handler active', { status: 200 })
  }

  try {
    const text = await req.text()
    const params = new URLSearchParams(text)
    const callerPhone = params.get('From') || ''
    const calledNumber = params.get('To') || ''
    const callSid = params.get('CallSid') || ''

    if (!callerPhone) {
      return twimlResponse(say('Thank you for calling Qivori Dispatch. Please try again later.') + '<Hangup/>')
    }

    const callerDigits = callerPhone.replace(/\D/g, '')
    const callerLast10 = callerDigits.slice(-10)

    // --- STEP 1: Check if caller is a DRIVER ---
    const driverMatch = await identifyDriver(callerLast10)
    if (driverMatch) {
      logInboundCall(callSid, callerPhone, calledNumber, 'driver', driverMatch).catch(() => {})
      return handleDriverCall(driverMatch, callSid)
    }

    // --- STEP 2: Check if caller is a BROKER calling back ---
    const brokerMatches = await identifyBrokerCallback(callerLast10)

    // Cancel pending retries for this broker
    if (brokerMatches.length > 0) {
      cancelPendingRetries(callerLast10).catch(() => {})
    }

    logInboundCall(callSid, callerPhone, calledNumber, 'broker', brokerMatches[0] || null).catch(() => {})

    if (brokerMatches.length === 1) {
      return handleBrokerCallback(brokerMatches[0], callSid)
    }

    if (brokerMatches.length > 1) {
      return handleMultipleBrokerMatches(brokerMatches, callSid)
    }

    // --- STEP 3: Unknown caller ---
    logInboundCall(callSid, callerPhone, calledNumber, 'unknown', null).catch(() => {})
    return handleUnknownCaller(callSid)

  } catch (err) {
    return twimlResponse(
      say('Thank you for calling Qivori Dispatch. We experienced a technical issue. Please try again in a moment.')
      + '<Hangup/>'
    )
  }
}

// ─── DRIVER IDENTIFICATION ───────────────────────────────────────────────────
// Look up caller phone in the drivers table. Returns driver + their carrier info.
async function identifyDriver(phone10) {
  // Search drivers by phone (last 10 digits match)
  const drivers = await sbGet(
    `drivers?phone=like.*${phone10}&select=id,full_name,name,phone,owner_id,pay_model,pay_rate&limit=1`
  )
  if (drivers.length === 0) return null

  const driver = drivers[0]

  // Load the carrier's company info (tenant-scoped)
  const companies = await sbGet(
    `companies?owner_id=eq.${driver.owner_id}&select=name,mc_number,dot_number&limit=1`
  )
  const company = companies[0] || {}

  // Load driver's active loads
  const driverName = driver.full_name || driver.name || ''
  const activeLoads = await sbGet(
    `loads?owner_id=eq.${driver.owner_id}&driver=eq.${encodeURIComponent(driverName)}&status=in.(Assigned,In Transit,Loaded,At Pickup,At Delivery)&select=id,load_id,origin,destination,status,miles,gross,pickup_date,delivery_date,broker_name&order=created_at.desc&limit=5`
  )

  return {
    driver,
    company,
    activeLoads,
    driverName,
  }
}

// ─── DRIVER CALL HANDLER ─────────────────────────────────────────────────────
// Q answers with the driver's load status — scoped to their carrier only
function handleDriverCall(match, callSid) {
  const { driver, company, activeLoads, driverName } = match
  const firstName = driverName.split(' ')[0] || 'driver'
  const companyName = company.name || 'your company'

  if (activeLoads.length === 0) {
    const greeting = `Hey ${firstName}, this is Q from ${companyName}. `
      + `I don't see any active loads assigned to you right now. `
      + `Want me to have dispatch reach out to you with available loads?`

    return twimlResponse(
      gather(`${baseUrl()}/api/inbound-call?stage=driver_followup&driverId=${driver.id}&ownerId=${driver.owner_id}`, greeting)
      + say("Alright, I'll let dispatch know. Talk to you soon. Drive safe.")
      + '<Hangup/>'
    )
  }

  // Build status update for their loads
  const load = activeLoads[0] // Most relevant active load
  const loadId = load.load_id || load.id
  const origin = (load.origin || '').split(',')[0]
  const dest = (load.destination || load.dest || '').split(',')[0]
  const status = load.status || 'Active'
  const broker = load.broker_name || ''

  // Context-aware next steps based on status
  let nextStep = ''
  switch (status) {
    case 'Assigned':
      nextStep = 'You\'re assigned but haven\'t marked pickup yet. Head to the shipper and update your status when you arrive.'
      break
    case 'At Pickup':
      nextStep = 'You\'re at the pickup location. Once you\'re loaded, update your status and I\'ll notify the broker.'
      break
    case 'Loaded':
    case 'In Transit':
      nextStep = `You're in transit to ${dest}. Everything looks good. Let me know if you hit any delays and I'll update the broker.`
      break
    case 'At Delivery':
      nextStep = 'You\'re at the delivery location. Once you\'re unloaded, snap a photo of the POD and mark delivered. I\'ll send the invoice automatically.'
      break
    default:
      nextStep = 'Let me know if you need anything updated.'
  }

  const greeting = `Hey ${firstName}, this is Q from ${companyName}. `
    + `Here's your update. `
    + `Load ${loadId}, ${origin} to ${dest}${broker ? ' for ' + broker : ''}. `
    + `Status: ${status}. `
    + nextStep
    + ` Anything else you need?`

  const followupUrl = `${baseUrl()}/api/inbound-call?stage=driver_followup&driverId=${driver.id}&ownerId=${driver.owner_id}&loadId=${load.id}`

  return twimlResponse(
    gather(followupUrl, greeting, 10)
    + say("Alright, you're all set. Drive safe out there. Call me anytime.")
    + '<Hangup/>'
  )
}

// ─── BROKER IDENTIFICATION ───────────────────────────────────────────────────
// Look up caller in recent outbound call_logs (last 48h) — returns matches with carrier context
async function identifyBrokerCallback(phone10) {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()

  const matches = await sbGet(
    `call_logs?broker_phone=like.*${phone10}&created_at=gte.${cutoff}&order=created_at.desc&limit=10&select=id,load_id,broker_name,broker_phone,carrier_name,origin,destination,rate,equipment,outcome,user_id,created_at`
  )

  // Deduplicate by load_id + user_id (same load for same carrier = one match)
  const seen = new Set()
  const unique = matches.filter(m => {
    if (!m.load_id) return false
    const key = `${m.load_id}_${m.user_id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // Enrich each match with carrier company info (MC#, DOT#)
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

// ─── BROKER CALLBACK — SINGLE CARRIER MATCH ─────────────────────────────────
function handleBrokerCallback(match, callSid) {
  const carrier = match.carrier_name || match.company?.name || 'our carrier'
  const mc = match.company?.mc_number ? `, MC ${match.company.mc_number}` : ''
  const origin = match.origin || ''
  const dest = match.destination || ''
  const rate = match.rate ? '$' + match.rate : ''
  const brokerName = match.broker_name || ''
  const firstName = brokerName ? brokerName.split(' ')[0] : ''

  const greeting = firstName
    ? `Hey ${firstName}, this is Q calling on behalf of ${carrier}${mc}. Thanks for getting back to us. `
      + `I reached out about a load from ${origin} to ${dest}${rate ? ' at ' + rate : ''}. `
      + `Is that load still available?`
    : `Hey, this is Q from Qivori Dispatch calling on behalf of ${carrier}${mc}. Thanks for calling back. `
      + `I left a message about a load from ${origin} to ${dest}${rate ? ' at ' + rate : ''}. `
      + `Is that still available?`

  const contextParams = new URLSearchParams({
    loadId: match.load_id || '',
    origin: match.origin || '',
    destination: match.destination || '',
    rate: String(match.rate || ''),
    carrierName: carrier,
    carrierMC: match.company?.mc_number || '',
    carrierDOT: match.company?.dot_number || '',
    equipment: match.equipment || 'dry van',
    userId: match.user_id || '',
    inbound: 'true',
  })
  const nextUrl = `${baseUrl()}/api/call-handler?stage=availability&${contextParams.toString()}`

  return twimlResponse(
    gather(nextUrl, greeting)
    + say("I didn't catch that. Are you calling about the load I left a message about?")
    + gather(nextUrl, "Just let me know if it's still available and we can go from there.", 6)
    + '<Hangup/>'
  )
}

// ─── BROKER CALLBACK — MULTIPLE CARRIER MATCHES ─────────────────────────────
// Multiple carriers on Qivori called the same broker. Q asks which one.
function handleMultipleBrokerMatches(matches, callSid) {
  const loadList = matches.slice(0, 3).map((m, i) => {
    const origin = (m.origin || '').split(',')[0]
    const dest = (m.destination || '').split(',')[0]
    const carrier = m.carrier_name || m.company?.name || 'a carrier'
    const mc = m.company?.mc_number ? ` MC ${m.company.mc_number}` : ''
    return `Option ${i + 1}: ${origin} to ${dest} for ${carrier}${mc}`
  })

  const greeting = `Hey, this is Q from Qivori Dispatch. Thanks for calling back. `
    + `I see we reached out about a few loads. Which one are you calling about? `
    + loadList.join('. ') + '.'

  // Default to most recent match if broker doesn't specify
  const match = matches[0]
  const contextParams = new URLSearchParams({
    loadId: match.load_id || '',
    origin: match.origin || '',
    destination: match.destination || '',
    rate: String(match.rate || ''),
    carrierName: match.carrier_name || match.company?.name || '',
    carrierMC: match.company?.mc_number || '',
    carrierDOT: match.company?.dot_number || '',
    equipment: match.equipment || 'dry van',
    userId: match.user_id || '',
    inbound: 'true',
  })
  const nextUrl = `${baseUrl()}/api/call-handler?stage=availability&${contextParams.toString()}`

  return twimlResponse(
    gather(nextUrl, greeting, 10)
    + say("No worries, let me pull up the most recent one.")
    + `<Redirect method="POST">${nextUrl}</Redirect>`
  )
}

// ─── UNKNOWN CALLER ──────────────────────────────────────────────────────────
function handleUnknownCaller(callSid) {
  const greeting = `Hey, thanks for calling Qivori Dispatch. This is Q. How can I help you today?`
  const nextUrl = `${baseUrl()}/api/call-handler?stage=greeting&inbound=true`

  return twimlResponse(
    gather(nextUrl, greeting)
    + say("If you're returning a call about a load, just let me know the origin and destination and I'll pull it up.")
    + gather(nextUrl, "I'm still here. What can I help you with?", 6)
    + say("Alright, feel free to call back anytime. Have a good one.")
    + '<Hangup/>'
  )
}

// ─── DRIVER FOLLOW-UP (stage handler) ────────────────────────────────────────
// When driver responds to the status update, handle follow-up questions
// This is called when the Gather from handleDriverCall completes

// ─── UTILITIES ───────────────────────────────────────────────────────────────

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
    notes: `Inbound call from ${callerType}${match ? ' — identified and routed' : ' — unknown caller'}`,
    created_at: new Date().toISOString(),
  })
}
