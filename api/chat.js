import { handleCors, corsHeaders, verifyAuth, requireActiveSubscription } from './_lib/auth.js'
import { checkRateLimit, rateLimitResponse } from './_lib/rate-limit.js'
import { sanitizeString } from './_lib/sanitize.js'

export const config = { runtime: 'edge' }

// ── Tool Definitions for Claude ──────────────────────────────────────────────

const TOOLS = [
  {
    name: 'find_truck_stop',
    description: 'Find real truck stops, fuel stations, and rest areas near a location. Returns names, addresses, phone numbers, and distance.',
    input_schema: {
      type: 'object',
      properties: {
        lat: { type: 'number', description: 'Latitude' },
        lng: { type: 'number', description: 'Longitude' },
        radius_miles: { type: 'number', description: 'Search radius in miles (default 25)' },
      },
      required: ['lat', 'lng'],
    },
  },
  {
    name: 'find_roadside_service',
    description: 'Find roadside service providers for breakdowns. Returns provider names and tap-to-call phone numbers.',
    input_schema: {
      type: 'object',
      properties: {
        lat: { type: 'number', description: 'Latitude' },
        lng: { type: 'number', description: 'Longitude' },
        issue_type: { type: 'string', enum: ['tire', 'towing', 'fuel', 'mechanical'], description: 'Type of roadside issue' },
      },
      required: ['lat', 'lng', 'issue_type'],
    },
  },
  {
    name: 'get_fuel_prices',
    description: 'Get current diesel fuel prices near a location. Returns regional averages and nearby station estimates.',
    input_schema: {
      type: 'object',
      properties: {
        lat: { type: 'number', description: 'Latitude' },
        lng: { type: 'number', description: 'Longitude' },
      },
      required: ['lat', 'lng'],
    },
  },
  {
    name: 'check_weather',
    description: 'Get current weather conditions and 3-day forecast. Includes driver safety alerts for wind, ice, snow, fog, storms.',
    input_schema: {
      type: 'object',
      properties: {
        lat: { type: 'number', description: 'Latitude' },
        lng: { type: 'number', description: 'Longitude' },
        location: { type: 'string', description: 'Location name (e.g. "Dallas, TX")' },
      },
      required: ['lat', 'lng'],
    },
  },
  {
    name: 'get_load_status',
    description: 'Get the current status of a load from Supabase. Returns status, route, broker contact, and next action.',
    input_schema: {
      type: 'object',
      properties: {
        load_id: { type: 'string', description: 'Load number or load ID (e.g. QV-5001)' },
      },
      required: ['load_id'],
    },
  },
  {
    name: 'find_loads',
    description: 'Search for available loads by origin, destination, and equipment type.',
    input_schema: {
      type: 'object',
      properties: {
        origin: { type: 'string', description: 'Origin city/state (e.g. "Dallas, TX")' },
        destination: { type: 'string', description: 'Destination city/state (e.g. "Atlanta, GA")' },
        equipment_type: { type: 'string', description: 'Equipment type (Dry Van, Reefer, Flatbed)' },
      },
    },
  },
  {
    name: 'get_lane_intel',
    description: 'Get lane rate intelligence, trends, and predictions. Use when driver asks about a specific lane rate, trend, market conditions, or "how\'s that lane paying" between two states.',
    input_schema: {
      type: 'object',
      properties: {
        origin_state: { type: 'string', description: '2-letter origin state code (e.g. "TX")' },
        dest_state: { type: 'string', description: '2-letter destination state code (e.g. "GA")' },
      },
      required: ['origin_state', 'dest_state'],
    },
  },
  {
    name: 'web_search',
    description: 'Search the web for anything Q cannot answer from other tools. Use for regulations, trucking news, FMCSA rules, route info, etc.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
      },
      required: ['query'],
    },
  },
]

// ── System Prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(context, language) {
  return `You are Q — the AI engine inside Qivori, the most powerful freight-dispatch intelligence platform in trucking.

You ARE the driver's TMS. They're on their phone, on the road, often hands-free. Every command they give you — booking loads, logging expenses, marking delivered, sending invoices — you execute it IMMEDIATELY with real data. No fake responses. No "I'll help you with that." Just DO it.

PERSONALITY: You're Q. Sharp, minimal, efficient. Veteran dispatcher who's been in freight 15 years and has seen everything. You call drivers by first name (their name is in CARRIER DATA — NEVER ask for it). You get straight to the point. You celebrate wins — "Solid rate." You commiserate — "That lane's been trash all week."

CRITICAL: The driver's name is ALWAYS in the CARRIER DATA section below. NEVER ask "what's your name" — you already know them. When they say "hey", respond naturally: "Hey [name], what do you need?"

You are NOT an AI assistant. You never say "I'm an AI" or "As an AI". You're Q — the driver's dispatch engine.

HOW Q TALKS:
- "Got it. Booked." (not "I have successfully booked your load")
- "That's light. Counter at $2,800 — lane supports it." (not "Based on my analysis...")
- "Nice. $3.12/mi on that lane? You crushed it." (not "That is an excellent rate")
- "Fuel logged. 52 gal in TX — your IFTA's gonna thank you." (not "I have recorded your fuel expense")
- Use contractions: you're, don't, can't, won't, that's, here's
- Short sentences. 2-3 max. Driver's got one eye on the road.
- NEVER use emojis. NEVER use markdown headers or numbered lists for normal conversation.
- Use **bold** sparingly — only for key numbers like rates and load IDs.

TOOLS: You have real-time tools. USE THEM — don't guess:
- Driver asks about truck stops, fuel, parking, rest areas → call find_truck_stop or get_fuel_prices
- Driver asks about weather, storms, ice, wind → call check_weather
- Driver has a breakdown, flat tire, towing → call find_roadside_service
- Driver asks about a load status → call get_load_status
- Driver asks for loads, freight → call find_loads
- Driver asks about lane rates, trends, "how's that lane" → call get_lane_intel
- Anything you can't answer from tools → call web_search
- NEVER say "I don't have that info" — search instead
- NEVER give directions in text — tools provide map links
- After calling a tool, give 1-2 sentence summary. The cards show the data.

CARRIER DATA:
${context || 'No carrier data loaded.'}

DISPATCH THINKING — before every response, silently evaluate:
- Where is the truck now? When will it be empty?
- Is the destination market strong or weak for reload?
- Is the rate strong enough for the lane and timing?
- What's the deadhead risk? Same-day reload realistic?
- Think one move ahead — not just the current load.

MARKET INTELLIGENCE:
- Dry van spot: $2.20-$2.80/mi | Reefer: $2.60-$3.20/mi | Flatbed: $2.80-$3.40/mi
- Operating cost: $1.55-$1.85/mi (fuel, insurance, maintenance, tires, truck payment)
- Diesel: ~$3.80/gal | Factoring: 2-5% | Days to pay: Net 30-45 (brokers), Net 15-21 (factoring)
- Driver pay: 25-30% of gross | Deadhead: avg 15% of loaded miles
- IFTA deadlines: Q1 (Apr 30), Q2 (Jul 31), Q3 (Oct 31), Q4 (Jan 31)

RATE NEGOTIATION:
When a driver asks about a rate, think:
1. Is the rate above or below market for the lane?
2. What's the ideal ask, target, and floor?
3. What's the reload situation at delivery?
Give them a counter-offer script they can text the broker:
- "That's light for the lane. I'd push for $X."
- "Rate needs help. Counter at $X — that market supports it."

BROKER SCRIPTS (give exact words to text/say):
- "What's your best on it? I've got a truck delivering nearby."
- "That's light for the lane. We'd need $X to make it work."
- "Come up to $X and we'll lock it in right now."

TOLL AWARENESS:
NJ Turnpike: $40-80 | PA Turnpike: $50-110 | Ohio: $30-50 | Indiana: $20-40 | IL: $15-35

ACTIONS: Include action blocks for the frontend to execute:
\`\`\`action
{"type": "ACTION_TYPE", ...params}
\`\`\`

Available actions:
- {"type":"check_call","load_id":"...","location":"...","status":"On Time|Delayed|At Pickup|At Delivery|Loaded|Empty","notes":"..."}
- {"type":"add_expense","category":"Fuel|Tolls|Repairs|Insurance|Meals|Parking|Permits|Tires|DEF|Lumper|Scale|Other","amount":0,"merchant":"...","notes":"...","gallons":null,"price_per_gallon":null,"state":"XX"}
- {"type":"mark_invoice_paid","invoice_id":"..."}
- {"type":"update_load_status","load_id":"...","status":"Booked|Dispatched|At Pickup|Loaded|In Transit|At Delivery|Delivered|Invoiced|Paid"}
- {"type":"book_load","load_id":"...","origin":"...","destination":"...","miles":0,"rate":0,"gross":0,"broker":"...","equipment":"...","pickup":"...","delivery":"..."}
- {"type":"navigate","to":"loads|invoices|check-call|add-expense|home"}
- {"type":"send_invoice","to":"broker@email.com","invoiceNumber":"INV-001","amount":0}
- {"type":"search_nearby","query":"truck stop|rest area|gas station|repair shop","radius":25}
- {"type":"open_maps","query":"...","lat":0,"lng":0}
- {"type":"hos_check"} | {"type":"start_hos"} | {"type":"reset_hos"} | {"type":"stop_driving"}
- {"type":"weather_check","lat":0,"lng":0,"location":"City, ST"}
- {"type":"find_parking","lat":0,"lng":0,"radius":25}
- {"type":"rate_check","origin":"...","destination":"...","miles":0,"rate":0,"equipment":"Dry Van|Reefer|Flatbed"}
- {"type":"start_detention","location_type":"shipper|receiver","free_time_hours":2,"load_id":"..."}
- {"type":"check_detention"} | {"type":"stop_detention"}
- {"type":"trip_pnl","load_id":"..."} — per-trip P&L breakdown
- {"type":"reload_chain","destination":"Memphis, TN"} — find reloads from delivery city
- {"type":"find_backhaul","destination":"Atlanta, GA"} — find backhaul loads
- {"type":"smart_reposition"} — compare nearby markets for repositioning
- {"type":"broker_risk","broker":"XPO Logistics"} — check broker payment history
- {"type":"weekly_target","target":5000} — check weekly revenue vs target
- {"type":"pre_trip"} — open FMCSA pre-trip inspection
- {"type":"pickup_countdown"} — time until next pickup
- {"type":"snap_ratecon"} — open camera to scan rate con
- {"type":"upload_doc","doc_type":"bol|pod|lumper_receipt|scale_ticket","load_id":"..."}

FUEL + IFTA: When driver logs fuel, ALWAYS include gallons, price_per_gallon, and state (2-letter code). This auto-feeds IFTA.
"fuel $85 at Loves" → add_expense with gallons, state, amount
"fuel 52 gallons $3.89 Texas" → add_expense with gallons:52, price_per_gallon:3.89, state:"TX", amount:202.28

LOAD LIFECYCLE:
1. At Pickup → check_call "At Pickup" + ask for BOL photo
2. Loaded → check_call "Loaded" + update to "In Transit"
3. At Delivery → check_call "At Delivery" + start detention
4. Delivered → update_load_status + stop detention + "Want me to invoice the broker?" + search reloads

DETENTION: "start detention" / "I'm waiting" → start_detention. "How long" → check_detention. "I'm leaving" → stop_detention. $75/hr after 2hr free time.

HOS: "start driving" / "rolling" → start_hos. "stop driving" / "parked" → stop_driving. "how many hours" → hos_check. If HOS ≤2hrs, find parking.

SAFETY: Driver mentions tired/exhausted → find rest areas + remind HOS. NEVER encourage driving fatigued.

PARKING: "find parking" / "where can I park" / "need to stop" → find_parking. Uses real data from Overpass API.

WEATHER: Any mention of weather/storm/ice/snow/rain/wind → call check_weather tool. Give actionable safety advice.

PRE-TRIP: "starting shift" / "pre-trip" / "inspection" → pre_trip action. FMCSA §396.11 required before dispatch.

CHAIN ACTIONS: One driver command can trigger multiple actions. "Delivered" → update_load_status + check_call + "Want me to invoice?"

RULES:
- Keep responses SHORT — drivers are on the road
- Dollar amounts and numbers, not paragraphs
- ONE clarifying question max if info is missing — guess intelligently from context
- Be proactive: flag unpaid invoices >30 days, high expenses, low utilization
- AFTER DELIVERY: Always suggest next load, invoice the broker, and check if they need rest
${language && language !== 'en' ? `\nLANGUAGE: Respond in ${
  { es: 'Spanish', fr: 'French', pt: 'Portuguese', so: 'Somali', am: 'Amharic', ar: 'Arabic', hi: 'Hindi', zh: 'Chinese', ru: 'Russian', ko: 'Korean', vi: 'Vietnamese' }[language] || language
}. Keep industry terms (BOL, rate con, HOS, ELD, IFTA, RPM) in English.` : ''}`
}

// ── Main Handler ─────────────────────────────────────────────────────────────

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })
  }

  const { user, error: authError } = await verifyAuth(req)
  if (authError) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(req) })
  }
  const subErr = await requireActiveSubscription(req, user)
  if (subErr) return subErr

  const { limited, resetSeconds } = await checkRateLimit(user.id, 'chat', 30, 60)
  if (limited) return rateLimitResponse(req, corsHeaders, resetSeconds)

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return Response.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500, headers: corsHeaders(req) })
  }

  try {
    let body
    try { body = await req.json() } catch {
      return Response.json({ error: 'Invalid JSON' }, { status: 400, headers: corsHeaders(req) })
    }

    const { messages: rawMessages, context: rawContext, language: rawLanguage } = body
    const context = sanitizeString(rawContext, 10000)
    const language = sanitizeString(rawLanguage, 10)
    const messages = (rawMessages || []).map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: sanitizeString(m.content, 5000),
    }))

    const systemPrompt = buildSystemPrompt(context, language)

    // ── Call Claude with tools ──
    let claudeResponse = await callClaude(apiKey, systemPrompt, messages)
    if (!claudeResponse) {
      return Response.json({ error: 'AI unavailable' }, { status: 502, headers: corsHeaders(req) })
    }

    // ── Process tool calls ──
    const toolResults = []
    let textReply = ''
    let iterations = 0
    const maxIterations = 3

    while (iterations < maxIterations) {
      iterations++
      const content = claudeResponse.content || []

      // Collect text blocks
      for (const block of content) {
        if (block.type === 'text') {
          textReply += block.text
        }
      }

      // Check for tool use
      const toolUseBlocks = content.filter(b => b.type === 'tool_use')
      if (toolUseBlocks.length === 0 || claudeResponse.stop_reason !== 'tool_use') {
        break // No more tools to call
      }

      // Execute all tool calls
      const toolResultMessages = []
      for (const toolCall of toolUseBlocks) {
        const result = await executeToolCall(toolCall.name, toolCall.input, user, req)
        toolResults.push({ tool: toolCall.name, input: toolCall.input, result })
        toolResultMessages.push({
          type: 'tool_result',
          tool_use_id: toolCall.id,
          content: JSON.stringify(result),
        })
      }

      // Continue conversation with tool results
      const continuedMessages = [
        ...messages,
        { role: 'assistant', content },
        { role: 'user', content: toolResultMessages },
      ]

      textReply = '' // Reset — Claude will give a new summary
      claudeResponse = await callClaude(apiKey, systemPrompt, continuedMessages)
      if (!claudeResponse) break
    }

    // Extract final text
    if (claudeResponse?.content) {
      const finalText = claudeResponse.content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('')
      if (finalText) textReply = finalText
    }

    return Response.json({
      reply: textReply || 'No response.',
      tool_results: toolResults,
    }, { headers: corsHeaders(req) })

  } catch (err) {
    return Response.json({ error: 'Something went wrong' }, { status: 500, headers: corsHeaders(req) })
  }
}

// ── Claude API Call ──────────────────────────────────────────────────────────

async function callClaude(apiKey, systemPrompt, messages) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages,
      tools: TOOLS,
    }),
  })

  if (!res.ok) {
    // Fallback model
    const res2 = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        system: systemPrompt,
        messages,
        tools: TOOLS,
      }),
    })
    if (res2.ok) return await res2.json()
    return null
  }

  return await res.json()
}

// ── Tool Execution (calls /api/q-tools internally) ───────────────────────────

async function executeToolCall(toolName, input, user, req) {
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

  // Execute tools inline (same edge runtime, no extra HTTP call)
  switch (toolName) {
    case 'find_truck_stop':
      return await findTruckStopInline(input.lat, input.lng, input.radius_miles)
    case 'find_roadside_service':
      return findRoadsideServiceInline(input.lat, input.lng, input.issue_type)
    case 'get_fuel_prices':
      return await getFuelPricesInline(input.lat, input.lng)
    case 'check_weather':
      return await checkWeatherInline(input.lat, input.lng, input.location)
    case 'get_load_status':
      return await getLoadStatusInline(user.id, input.load_id, SUPABASE_URL, SERVICE_KEY)
    case 'find_loads':
      return await findLoadsInline(user.id, input.origin, input.destination, input.equipment_type, SUPABASE_URL, SERVICE_KEY)
    case 'get_lane_intel':
      return await getLaneIntelInline(user.id, input.origin_state, input.dest_state, SUPABASE_URL, SERVICE_KEY)
    case 'web_search':
      return await webSearchInline(input.query)
    default:
      return { error: `Unknown tool: ${toolName}` }
  }
}

// ── Inline Tool Implementations ──────────────────────────────────────────────

async function findTruckStopInline(lat, lng, radiusMiles) {
  const radiusM = Math.round((radiusMiles || 25) * 1609.34)
  const query = `[out:json][timeout:10];(node["amenity"="fuel"]["hgv"="yes"](around:${radiusM},${lat},${lng});node["amenity"="fuel"]["name"~"Pilot|Flying J|Love|TA |Petro|Buckys|Sapp Bros",i](around:${radiusM},${lat},${lng}););out body;`
  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
    })
    if (!res.ok) throw new Error()
    const data = await res.json()
    const stops = (data.elements || []).slice(0, 8).map(el => {
      const t = el.tags || {}
      return {
        type: 'truck_stop', name: t.name || t.brand || 'Truck Stop',
        address: [t['addr:street'], t['addr:city'], t['addr:state']].filter(Boolean).join(', ') || `${el.lat.toFixed(3)}, ${el.lon.toFixed(3)}`,
        phone: t.phone || t['contact:phone'] || null,
        miles_away: Math.round(haversine(lat, lng, el.lat, el.lon) * 10) / 10,
        lat: el.lat, lng: el.lon,
      }
    }).sort((a, b) => a.miles_away - b.miles_away).slice(0, 5)
    return { stops, count: stops.length }
  } catch {
    return { stops: [], fallback_url: `https://www.google.com/maps/search/truck+stop/@${lat},${lng},12z` }
  }
}

function findRoadsideServiceInline(lat, lng, issueType) {
  const services = {
    tire: [
      { name: "Love's Tire Care", phone: '1-800-388-0983', desc: '24/7 tire service' },
      { name: 'Goodyear Fleet HQ', phone: '1-866-574-5529', desc: '24/7 commercial tire' },
      { name: 'Michelin ONCall', phone: '1-800-847-3911', desc: '24/7 emergency tire' },
    ],
    towing: [
      { name: 'FleetNet America', phone: '1-800-438-8961', desc: '24/7 breakdown & towing' },
      { name: 'Truck Down', phone: '1-866-871-4273', desc: 'Commercial towing' },
    ],
    fuel: [
      { name: 'FleetNet America', phone: '1-800-438-8961', desc: 'Mobile fueling' },
      { name: "Love's Roadside", phone: '1-800-388-0983', desc: 'Fuel delivery + jump' },
    ],
    mechanical: [
      { name: 'FleetNet America', phone: '1-800-438-8961', desc: '24/7 mobile repair' },
      { name: 'Rush Truck Centers', phone: '1-866-965-7874', desc: 'Heavy repair' },
      { name: 'Penske Roadside', phone: '1-800-526-0798', desc: '24/7 roadside' },
    ],
  }
  const providers = services[(issueType || 'mechanical').toLowerCase()] || services.mechanical
  return { issue_type: issueType, providers: providers.map(p => ({ ...p, type: 'roadside_service', call_url: `tel:${p.phone.replace(/[^0-9+]/g, '')}` })) }
}

async function getFuelPricesInline(lat, lng) {
  const EIA_KEY = process.env.EIA_API_KEY
  if (!EIA_KEY) return { prices: [], maps_url: `https://www.google.com/maps/search/diesel+fuel/@${lat},${lng},12z` }
  try {
    const region = lng < -100 ? (lat > 42 ? 'R40' : 'R50') : lng < -85 ? (lat > 40 ? 'R20' : 'R30') : (lat > 40 ? 'R1Y' : 'R1Z')
    const regionName = { R40: 'Rocky Mountain', R50: 'West Coast', R20: 'Midwest', R30: 'Gulf Coast', R1Y: 'East Coast', R1Z: 'Southeast' }[region]
    const res = await fetch(`https://api.eia.gov/v2/petroleum/pri/gnd/data/?api_key=${EIA_KEY}&frequency=weekly&data[0]=value&facets[product][]=EPD2D&facets[duoarea][]=${region}&sort[0][column]=period&sort[0][direction]=desc&length=1`)
    if (res.ok) {
      const data = await res.json()
      const price = parseFloat(data?.response?.data?.[0]?.value)
      if (price) {
        return {
          type: 'fuel_prices', region: regionName, diesel_avg: price.toFixed(2),
          prices: [
            { station: `${regionName} Avg`, price: `$${price.toFixed(2)}` },
            { station: 'Pilot/Flying J', price: `$${(price - 0.05).toFixed(2)}`, note: 'Loyalty ~5¢ off' },
            { station: "Love's", price: `$${(price - 0.03).toFixed(2)}`, note: 'Loyalty ~3¢ off' },
          ],
          maps_url: `https://www.google.com/maps/search/diesel+fuel/@${lat},${lng},12z`,
        }
      }
    }
  } catch {}
  return { prices: [], maps_url: `https://www.google.com/maps/search/diesel+fuel/@${lat},${lng},12z` }
}

async function checkWeatherInline(lat, lng, location) {
  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,wind_speed_10m,wind_gusts_10m,weather_code,precipitation&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_sum&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&forecast_days=3&timezone=auto`)
    if (!res.ok) throw new Error()
    const data = await res.json()
    const cur = data.current || {}
    const codes = { 0:'Clear',1:'Clear',2:'Partly cloudy',3:'Overcast',45:'Foggy',48:'Freezing fog',51:'Drizzle',61:'Rain',63:'Rain',65:'Heavy rain',66:'Freezing rain',71:'Snow',73:'Snow',75:'Heavy snow',80:'Showers',95:'Thunderstorm',96:'T-storm w/hail' }
    const alerts = []
    if (cur.wind_speed_10m > 40) alerts.push('HIGH WIND — watch high-profile loads')
    if ([66,67].includes(cur.weather_code)) alerts.push('FREEZING RAIN — bridges hazardous')
    if ([71,73,75].includes(cur.weather_code)) alerts.push('SNOW — reduce speed')
    if ([95,96,99].includes(cur.weather_code)) alerts.push('THUNDERSTORM — seek shelter')
    const daily = data.daily || {}
    return {
      type: 'weather', location: location || `${lat.toFixed(1)}, ${lng.toFixed(1)}`,
      current: { temp: Math.round(cur.temperature_2m), condition: codes[cur.weather_code] || 'Unknown', wind: Math.round(cur.wind_speed_10m), precip: cur.precipitation || 0 },
      alerts,
      forecast: (daily.time || []).map((d, i) => ({ date: d, high: daily.temperature_2m_max?.[i], low: daily.temperature_2m_min?.[i], condition: codes[daily.weather_code?.[i]] || '—' })),
    }
  } catch { return { type: 'weather', error: 'Weather unavailable' } }
}

async function getLoadStatusInline(ownerId, loadId, sbUrl, sKey) {
  if (!sbUrl || !sKey) return { error: 'Not configured' }
  const h = { 'apikey': sKey, 'Authorization': `Bearer ${sKey}`, 'Content-Type': 'application/json' }
  for (const f of ['load_number', 'load_id', 'id']) {
    const res = await fetch(`${sbUrl}/rest/v1/loads?owner_id=eq.${ownerId}&${f}=eq.${encodeURIComponent(loadId)}&select=*&limit=1`, { headers: h })
    if (res.ok) {
      const rows = await res.json()
      if (rows.length > 0) {
        const l = rows[0]
        return { type: 'load_status', load_number: l.load_number, status: l.status, origin: l.origin, destination: l.destination, rate: parseFloat(l.rate) || 0, broker: l.broker_name, broker_phone: l.broker_phone, driver: l.carrier_name, equipment: l.equipment }
      }
    }
  }
  return { error: 'Load not found' }
}

async function findLoadsInline(ownerId, origin, dest, equip, sbUrl, sKey) {
  if (!sbUrl || !sKey) return { loads: [], count: 0 }
  const h = { 'apikey': sKey, 'Authorization': `Bearer ${sKey}`, 'Content-Type': 'application/json' }
  const res = await fetch(`${sbUrl}/rest/v1/loads?status=eq.Rate Con Received&select=*&order=created_at.desc&limit=20`, { headers: h })
  if (!res.ok) return { loads: [], count: 0 }
  const rows = await res.json()
  const loads = rows.filter(l => {
    const mo = !origin || (l.origin || '').toLowerCase().includes(origin.toLowerCase())
    const md = !dest || (l.destination || '').toLowerCase().includes(dest.toLowerCase())
    const me = !equip || (l.equipment || '').toLowerCase().includes(equip.toLowerCase())
    return mo && md && me
  }).slice(0, 5).map(l => ({
    type: 'load_card', load_number: l.load_number, origin: l.origin, destination: l.destination,
    rate: parseFloat(l.rate) || 0, miles: l.miles, broker: l.broker_name, equipment: l.equipment,
  }))
  return { type: 'load_results', loads, count: loads.length }
}

async function webSearchInline(query) {
  try {
    const res = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`)
    if (res.ok) {
      const data = await res.json()
      const results = []
      if (data.AbstractText) results.push({ title: data.Heading || query, snippet: data.AbstractText.slice(0, 300), url: data.AbstractURL, source: data.AbstractSource })
      for (const t of (data.RelatedTopics || []).slice(0, 2)) {
        if (t.Text) results.push({ title: t.Text?.slice(0, 80), snippet: t.Text?.slice(0, 200), url: t.FirstURL, source: 'Web' })
      }
      if (results.length > 0) return { type: 'web_results', results }
    }
  } catch {}
  return { type: 'web_results', results: [{ title: `Search: ${query}`, snippet: 'Tap to search', url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`, source: 'Web' }] }
}

async function getLaneIntelInline(ownerId, originState, destState, sbUrl, sKey) {
  if (!sbUrl || !sKey) return { error: 'Not configured' }
  const h = { 'apikey': sKey, 'Authorization': `Bearer ${sKey}`, 'Content-Type': 'application/json' }
  const os = (originState || '').toUpperCase(), ds = (destState || '').toUpperCase()

  // Fetch prediction
  const predRes = await fetch(`${sbUrl}/rest/v1/lane_predictions?owner_id=eq.${ownerId}&origin_state=eq.${os}&dest_state=eq.${ds}&limit=1`, { headers: h })
  const pred = predRes.ok ? (await predRes.json())?.[0] : null

  // Fetch last 8 weeks
  const histRes = await fetch(`${sbUrl}/rest/v1/lane_history?owner_id=eq.${ownerId}&origin_state=eq.${os}&dest_state=eq.${ds}&order=week_start.desc&limit=8&select=week_start,avg_rpm,load_count,avg_gross,avg_miles`, { headers: h })
  const history = histRes.ok ? await histRes.json() : []

  if (!pred && history.length === 0) {
    return { type: 'lane_intel', lane: `${os} → ${ds}`, error: 'No data for this lane yet. Run more loads to build history.' }
  }

  return {
    type: 'lane_intel',
    lane: `${os} → ${ds}`,
    current_rpm: pred ? parseFloat(pred.predicted_rpm) : parseFloat(history[0]?.avg_rpm || 0),
    trend: pred?.trend || 'stable',
    trend_pct: pred ? parseFloat(pred.trend_pct) : 0,
    confidence: pred?.confidence || 0,
    week_count: history.length,
    total_loads: history.reduce((s, w) => s + (w.load_count || 0), 0),
    history: history.map(w => ({ week: w.week_start, rpm: parseFloat(w.avg_rpm), loads: w.load_count, gross: parseFloat(w.avg_gross) })),
    season_note: pred?.season_multiplier > 1.08 ? 'Peak season — rates elevated' : pred?.season_multiplier < 0.92 ? 'Slow season — rates soft' : 'Normal season',
  }
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 3959, dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}
