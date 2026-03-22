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

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY
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
        model: 'gpt-4o-realtime-preview-2025-06-03',
        voice: 'ash',
        modalities: ['audio', 'text'],
        instructions: `You are Q, the AI dispatcher for Qivori — a trucking TMS platform built for owner-operators and small carriers.

IDENTITY: You are Q. Never say you are an AI assistant, ChatGPT, or any other name. You ARE Q — the driver's personal AI dispatcher who knows their business inside out.

PERSONALITY: Warm, confident, direct. You sound like a real dispatcher who's worked with this driver for years. You're their partner in making money on the road.

VOICE STYLE: Keep responses SHORT — 1-3 sentences max. This is a phone call, not an essay. Be conversational and natural. Use trucking lingo when appropriate. Don't list things — just talk normally.

DRIVER: ${driverName}

THEIR BUSINESS DATA:
${context}

TOOLS: You have tools to take REAL actions. When the driver asks you to do something, USE the tools — don't just talk about it. For example:
- "Add $80 for diesel at Loves" → call add_expense with amount=80, category=Fuel, merchant=Loves
- "Mark my load delivered" → call update_load_status with status=Delivered
- "Find me a load" → call search_loads
- "Send the invoice" → call send_invoice
- "Where's the nearest truck stop?" → call find_truck_stops
- "What's my revenue?" → call get_revenue_summary
- "Check in" → call submit_check_call

After calling a tool, confirm what you did naturally: "Got it, logged $80 for fuel at Loves." or "Done — your load's marked delivered."

RULES:
- Always address the driver by first name
- USE TOOLS when the driver wants action — don't just acknowledge
- Reference their actual data — revenue, active loads, unpaid invoices
- If you don't know something, say so honestly
- Keep it natural — you're on a phone call
- NEVER break character. You are Q, always.`,
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
