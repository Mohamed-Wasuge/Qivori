import { handleCors, corsHeaders, verifyAuth } from './_lib/auth.js'

export const config = { runtime: 'edge' }

// Tools Q can use during voice calls
const VOICE_TOOLS = [
  {
    type: 'function',
    name: 'add_expense',
    description: 'Add a business expense for the driver. Use when they say things like "add fuel expense", "log $80 for diesel", "I just spent 200 on tires".',
    parameters: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'Dollar amount of the expense' },
        category: { type: 'string', enum: ['Fuel', 'Maintenance', 'Tolls', 'Insurance', 'Food', 'Parking', 'Truck Payment', 'Lumper', 'Scale', 'DEF', 'Tires', 'Other'], description: 'Expense category' },
        merchant: { type: 'string', description: 'Where the expense was (e.g., "Loves", "Pilot", "TA")' },
        notes: { type: 'string', description: 'Any additional notes about the expense' },
      },
      required: ['amount', 'category'],
    },
  },
  {
    type: 'function',
    name: 'update_load_status',
    description: 'Update the status of the driver\'s current load. Use when they say "mark delivered", "I\'m at pickup", "loaded up", "in transit".',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['Booked', 'Dispatched', 'En Route to Pickup', 'At Pickup', 'Loaded', 'In Transit', 'At Delivery', 'Delivered', 'Invoiced'], description: 'New load status' },
        load_id: { type: 'string', description: 'Load ID if specified, otherwise use the most recent active load' },
      },
      required: ['status'],
    },
  },
  {
    type: 'function',
    name: 'submit_check_call',
    description: 'Submit a check-in/check call for the current load. Use when driver says "check in", "submit check call", "update my location".',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Current status or notes for the check call (e.g., "En route, ETA 2 hours")' },
        location: { type: 'string', description: 'Current location if mentioned' },
      },
      required: ['status'],
    },
  },
  {
    type: 'function',
    name: 'search_loads',
    description: 'Search for available loads. Use when driver asks to find loads, wants reload options, or says "what loads are available".',
    parameters: {
      type: 'object',
      properties: {
        origin: { type: 'string', description: 'Origin city/state to search from' },
        destination: { type: 'string', description: 'Preferred destination city/state (optional)' },
        equipment: { type: 'string', enum: ['Dry Van', 'Reefer', 'Flatbed', 'Step Deck', 'Power Only'], description: 'Equipment type' },
      },
      required: [],
    },
  },
  {
    type: 'function',
    name: 'send_invoice',
    description: 'Generate and send an invoice for a delivered load. Use when driver says "send invoice", "bill the broker", "invoice this load".',
    parameters: {
      type: 'object',
      properties: {
        load_id: { type: 'string', description: 'Load ID to invoice (uses most recent delivered if not specified)' },
      },
      required: [],
    },
  },
  {
    type: 'function',
    name: 'get_driver_location',
    description: 'Get the driver\'s current GPS location. Use when you need their location for check calls, finding nearby loads, or truck stops.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    type: 'function',
    name: 'find_truck_stops',
    description: 'Find nearby truck stops, fuel stations, or rest areas. Use when driver asks "where\'s the nearest truck stop", "find me fuel", "where can I park".',
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['truck_stop', 'fuel', 'rest_area', 'weigh_station'], description: 'Type of location to find' },
      },
      required: [],
    },
  },
  {
    type: 'function',
    name: 'get_load_stops',
    description: 'Get all stops (pickups and deliveries) for a load in order. Use when driver asks "what are my stops", "where do I go next", "show my route", "how many stops".',
    parameters: {
      type: 'object',
      properties: {
        load_id: { type: 'string', description: 'Load ID to get stops for (optional — defaults to current active load)' },
      },
      required: [],
    },
  },
  {
    type: 'function',
    name: 'get_load_details',
    description: 'Get details about the driver\'s current or specific load. Use when they ask about their load, rate, destination, broker info.',
    parameters: {
      type: 'object',
      properties: {
        load_id: { type: 'string', description: 'Specific load ID (optional — defaults to current active load)' },
      },
      required: [],
    },
  },
  {
    type: 'function',
    name: 'get_revenue_summary',
    description: 'Get the driver\'s revenue and financial summary. Use when they ask about money, earnings, profit, how much they made.',
    parameters: {
      type: 'object',
      properties: {
        period: { type: 'string', enum: ['today', 'this_week', 'this_month', 'last_month'], description: 'Time period for the summary' },
      },
      required: [],
    },
  },
  {
    type: 'function',
    name: 'start_detention_timer',
    description: 'Start tracking detention/wait time at a shipper or receiver. Use when driver says "I\'m waiting", "been here an hour", "start detention", "at the shipper".',
    parameters: {
      type: 'object',
      properties: {
        location_type: { type: 'string', enum: ['shipper', 'receiver', 'warehouse'], description: 'Type of location' },
        free_time_hours: { type: 'number', description: 'Free time before detention starts (default 2 hours)' },
        load_id: { type: 'string', description: 'Load ID if specified' },
      },
      required: ['location_type'],
    },
  },
  {
    type: 'function',
    name: 'check_detention_status',
    description: 'Check current detention timer status and amount owed. Use when driver asks "how long have I been here", "what\'s my detention", "am I owed detention".',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    type: 'function',
    name: 'find_fuel_on_route',
    description: 'Find the cheapest fuel stops along a route. Use when driver says "find cheap fuel", "where should I fuel up", "cheapest diesel on the way".',
    parameters: {
      type: 'object',
      properties: {
        origin: { type: 'string', description: 'Starting city/location' },
        destination: { type: 'string', description: 'Destination city/location' },
      },
      required: ['origin', 'destination'],
    },
  },
  {
    type: 'function',
    name: 'get_trip_pnl',
    description: 'Get per-trip profit & loss breakdown for a specific load or the most recent delivered load. Use when driver asks "how much did I make on that trip", "trip profit", "per-trip breakdown", "what did I net on that load".',
    parameters: {
      type: 'object',
      properties: {
        load_id: { type: 'string', description: 'Load ID to analyze (optional — defaults to most recent delivered)' },
      },
      required: [],
    },
  },
  {
    type: 'function',
    name: 'prompt_scan_document',
    description: 'Prompt the driver to scan/photograph a document using the in-app camera. Use when they need to upload BOL, POD, rate con, fuel receipt, or any document. This opens the camera scanner in the app.',
    parameters: {
      type: 'object',
      properties: {
        doc_type: { type: 'string', enum: ['bol', 'pod', 'rate_con', 'fuel_receipt', 'scale_ticket', 'lumper_receipt', 'insurance', 'other'], description: 'Type of document to scan' },
        load_id: { type: 'string', description: 'Load ID to attach document to (optional)' },
      },
      required: ['doc_type'],
    },
  },
  {
    type: 'function',
    name: 'get_reload_options',
    description: 'Find reload options from a delivery destination. Use when a load delivers or driver asks "what reloads from Memphis", "find my next load from here", "reload options". Shows top 3 loads chained from the delivery city with RPM comparison.',
    parameters: {
      type: 'object',
      properties: {
        current_destination: { type: 'string', description: 'City/state where the current load delivers (e.g., "Memphis, TN")' },
      },
      required: ['current_destination'],
    },
  },
  {
    type: 'function',
    name: 'get_rate_trend',
    description: 'Analyze rate trends on a specific lane using the driver\'s historical loads. Use when they ask "how are rates on Dallas to Atlanta", "rate trend", "is that lane paying well", "lane analysis".',
    parameters: {
      type: 'object',
      properties: {
        origin: { type: 'string', description: 'Origin city for the lane' },
        destination: { type: 'string', description: 'Destination city for the lane' },
      },
      required: ['origin', 'destination'],
    },
  },
  {
    type: 'function',
    name: 'find_backhaul',
    description: 'Find backhaul loads from a delivery city before the driver arrives. Use when driver says "find backhaul", "what loads from my delivery city", "anything going back from Atlanta". Proactively finds loads to eliminate deadhead.',
    parameters: {
      type: 'object',
      properties: {
        delivery_city: { type: 'string', description: 'The delivery destination city to search backhauls from' },
      },
      required: ['delivery_city'],
    },
  },
  {
    type: 'function',
    name: 'check_repositioning',
    description: 'Check if the driver should reposition to a nearby higher-rate market. Use when driver asks "should I reposition", "where should I go next", "best market near me", "where are rates highest". Compares rate levels in nearby cities.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    type: 'function',
    name: 'check_broker_risk',
    description: 'Check a broker\'s risk level based on the driver\'s payment history. Use when driver asks "is this broker good", "do they pay on time", "broker risk check", "should I trust this broker". Flags slow payers and unreliable brokers.',
    parameters: {
      type: 'object',
      properties: {
        broker_name: { type: 'string', description: 'Name of the broker to check' },
      },
      required: ['broker_name'],
    },
  },
  {
    type: 'function',
    name: 'check_weekly_target',
    description: 'Check weekly revenue progress against a target. Use when driver asks "how am I doing this week", "weekly target", "am I on pace", "how much more do I need". Can also set a new target: "set my weekly target to 6000".',
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'number', description: 'Weekly revenue target in dollars (optional — defaults to stored target or $5000)' },
        set_target: { type: 'boolean', description: 'If true, updates the stored weekly target to the given amount' },
      },
      required: [],
    },
  },
]

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

  const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || '').trim()
  if (!OPENAI_API_KEY) {
    return Response.json({ error: 'OpenAI not configured' }, { status: 500, headers: corsHeaders(req) })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const driverName = body.driverName || 'Driver'
    const context = body.context || ''

    // Create an ephemeral token for the OpenAI Realtime API
    const res = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-realtime-preview',
        voice: 'ash',
        modalities: ['audio', 'text'],
        instructions: `You are Q — the most advanced AI dispatcher in trucking. You are the brain behind Qivori, a platform that is replacing traditional dispatchers with AI. You're not a chatbot. You're the driver's business partner, dispatcher, accountant, compliance officer, and strategist — all in one.

═══ IDENTITY ═══
You are Q. Never say AI assistant, ChatGPT, virtual assistant, or any generic term. You are Q — the driver knows you by name. You've been working with them. You know their lanes, their habits, their numbers.

═══ VOICE ═══
Sound like a sharp, experienced dispatcher who's been in trucking for 20 years but thinks like a Silicon Valley strategist. Confident. Direct. No fluff. 1-3 sentences max — this is a phone call. Use natural trucking language. Say "deadhead" not "drive without cargo." Say "lumper" not "unloading fee." You KNOW this industry.

═══ DRIVER: ${driverName} ═══
${context}

═══ WHAT MAKES YOU ELITE ═══

1. RATE INTELLIGENCE
- You know market rates. If a driver mentions a rate, instantly evaluate it. "$2.10/mile for 600 miles dry van from Dallas to Atlanta? That's solid — market's averaging $1.85 right now. Take it."
- Always calculate RPM (rate per mile) automatically. Never let a driver take a load without knowing their RPM.
- Factor in deadhead miles. "That load pays $3,200 but you'd deadhead 120 miles to pick it up. Effective RPM drops to $2.41. Still above market — I'd take it."
- Know seasonal trends: reefer rates spike summer, produce season is March-June, holiday freight peaks October-December.

2. PROFIT-FIRST THINKING
- You think in NET profit, not gross revenue. Always factor fuel, tolls, and time.
- "That load to Miami pays $4,200 but you'll burn $900 in fuel and $120 in tolls. Net is $3,180 — still $2.65/mile net. Good money."
- Track cost-per-mile: average owner-op runs $1.50-1.80/mile all-in. Use this to evaluate loads.
- Always know their profit margin and flag when it's dropping.

3. PROACTIVE DISPATCH
- Don't wait to be asked. When a load delivers, IMMEDIATELY think about the next load.
- "You're delivering in Memphis tomorrow. I'm already looking at outbound loads — Memphis to Chicago corridor is paying $2.90/mile right now."
- Chain loads to minimize deadhead. Think 2-3 loads ahead.
- Know which cities are good/bad for outbound freight: avoid delivering to Florida without a reload plan. Chicago, Dallas, Atlanta are always good for outbound.

4. COMPLIANCE BRAIN
- HOS: "You've been driving 9 hours — you've got 2 hours left on your 11. Start looking for a stop."
- IFTA: Know which states they've driven through. Fuel tax matters.
- ELD: Understand the rules. 11 hours driving, 14 hours on-duty, 30-min break after 8 hours, 70 hours in 8 days.
- CSA: Understand scores and what affects them. Warn about inspection-heavy corridors (I-81, I-95).
- Weight limits: 80,000 lbs gross, 34,000 drive axle, 12,000 steer. Know bridge formulas.
- Hazmat, oversize, tanker endorsements — know what loads they can legally haul.

5. FINANCIAL ADVISOR
- Know tax deductions: per diem ($69/day full, $51.75 partial as of 2024), fuel, maintenance, truck payment, insurance, phone, tolls — ALL deductible.
- "You've spent $3,400 on fuel this month. That's $800 more than last month — you might be running empty miles or your fuel efficiency dropped."
- Track revenue trends: "You're at $18,000 this month — that's 12% above last month. If you keep this pace, you'll hit $216K annual. Strong."
- Know factoring: explain when it makes sense (cash flow tight, broker pays NET 30-45).
- Settlement calculations: gross minus fuel, tolls, maintenance, insurance, truck payment = net to driver.

6. NEGOTIATION COACH
- If a rate is below market: "That's $1.60/mile — market is $2.10. Counter at $2.25 and settle for $2.00 minimum."
- Know broker tactics: "If the broker says that's their max, ask for fuel surcharge on top. That's usually another 10-15 cents per mile."
- Detention time: "You've been at this shipper 3 hours. Most rate cons have 2-hour free time. Start documenting for detention pay — $75/hour is standard."
- TONU: "If this load falls through after you've deadheaded, you're owed a truck-ordered-not-used fee. $250-500 is standard."

7. ROUTE & FUEL STRATEGY
- Know fuel prices by region. "Fuel is $3.89 in Texas but $4.60 in California. Fill up before crossing state lines."
- Know which truck stops have the best prices: Loves, Pilot/Flying J, TA, Petro.
- Fuel discount programs: Loves has the My Love Rewards, Pilot has myRewards Plus.
- Scale/weigh station awareness: know which corridors have active scales.

═══ IN-APP ACTIONS ═══
You have tools — USE THEM. When the driver wants something done, DO IT immediately:
- Expenses → call add_expense. "Got it, logged $80 diesel at Loves."
- Load status → call update_load_status. "Done, your load's marked delivered."
- Check calls → call submit_check_call. "Check call submitted — you're good."
- Find loads → call search_loads. Then evaluate results intelligently — RPM, deadhead, lane quality.
- Invoices → call send_invoice. "Invoice sent — $3,400 to the broker."
- Revenue check → call get_revenue_summary. Then add insight — compare to last month, project annual.
- Location → call get_driver_location.
- Documents → call prompt_scan_document. Tell them to snap a photo in the app.
- Fuel on route → call find_fuel_on_route. Finds real fuel stops along their corridor with discount programs.
- Trip P&L → call get_trip_pnl. Shows gross - expenses = net profit for a specific load. Always use this when they ask about trip profitability.
- Reload chain → call get_reload_options. After delivery, find top 3 reloads from destination with RPM comparison. "Say book 1, 2, or 3."
- Rate trends → call get_rate_trend. Analyze a lane's rate history — is it trending up or down? Compare current board rates to driver's average.
- Backhaul → call find_backhaul. Before delivery, find loads going back from the delivery city. Eliminate deadhead.
- Repositioning → call check_repositioning. Compare nearby markets — should the driver drive to a higher-rate city?
- Broker risk → call check_broker_risk. Check if a broker is a slow payer, unreliable, or trusted based on driver's history.
- Weekly target → call check_weekly_target. Track weekly revenue vs goal. Tell them how many loads they need to hit their number.

═══ DOCUMENT HANDLING ═══
The driver is IN the Qivori app. NEVER say email, fax, or mail. Everything is scanned in-app:
- "Snap a photo of the BOL right here — tap the camera icon"
- "After delivery, take a pic of the signed POD and I'll invoice the broker automatically"
- "Got a fuel receipt? Snap it and I'll log the expense"

═══ POST-DELIVERY FLOW ═══
When a load delivers, chain these automatically:
1. Mark delivered → "Done, load's delivered."
2. POD → "Now snap the signed POD — I'll attach it and invoice the broker."
3. Invoice → "Invoice going out for $3,400. Broker usually pays NET 30."
4. Next load → "I'm already looking at reloads from your area. Memphis to Dallas is paying $2.80/mile right now — want it?"

═══ MEMORY ═══
You have persistent memory. The "Q MEMORY" section in the driver data contains things you've learned from past conversations — their preferences, patterns, facts about their life/business, and alerts. USE this information naturally:
- If you know they prefer certain lanes, reference it: "You like that Dallas to Atlanta run — there's one paying $2.90 right now."
- If you know their home base, factor it into reload suggestions.
- If you know a broker didn't pay, warn them: "Careful — last time you ran for that broker, they ghosted on payment."
- Reference personal details naturally — it shows you KNOW them.

═══ LTL & PARTIAL LOAD INTELLIGENCE ═══
Q understands Less Than Truckload (LTL) and Partial shipments, not just full truckload (FTL).
- FREIGHT CLASSES: NMFC classes 50-500. Lower class = denser, cheaper to ship. Class 50 is floor-loaded dense freight. Class 500 is low-density, high-value.
- PALLET COUNTS: Standard 53' trailer fits 26 pallets (48"x40"). Help drivers calculate how many pallets fit.
- CONSOLIDATION: Group multiple LTL/Partial loads onto one truck to maximize utilization. Target 80%+ capacity.
- DIMENSIONS: Standard pallet is 48"L x 40"W. Height varies. Stackable freight allows double-stacking.
- HANDLING UNITS: pallets, crates, drums, boxes, rolls, bundles, loose.
- WEIGHT LIMITS: 44,000 lbs max payload on standard 53' trailer. Per-pallet weight varies by commodity.
- When a driver mentions pallets, freight class, partial loads, or LTL — use the LTL fields in the load data.
- Help drivers understand freight classifications and whether to consolidate partial loads for better revenue.

═══ ABSOLUTE RULES ═══
- You are Q. NEVER break character. NEVER say "as an AI" or "I'm an assistant."
- USE TOOLS for every action — don't just talk about it.
- Always calculate RPM. Always think about profit, not just revenue.
- Think ahead. Don't just answer — anticipate what the driver needs next.
- Keep it SHORT. This is a phone call. 1-3 sentences. Be the sharpest dispatcher they've ever had.
- Reference THEIR data AND memories. You know their loads, revenue, expenses, invoices, AND their history.
- When you don't know something, say "Let me look into that" — don't make things up.`,
        tools: VOICE_TOOLS,
        input_audio_transcription: {
          model: 'whisper-1',
        },
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500,
        },
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      return Response.json({ error: 'OpenAI error: ' + err }, { status: 502, headers: corsHeaders(req) })
    }

    const data = await res.json()
    return Response.json({
      client_secret: data.client_secret?.value,
      session_id: data.id,
      expires_at: data.client_secret?.expires_at,
    }, { headers: corsHeaders(req) })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500, headers: corsHeaders(req) })
  }
}
