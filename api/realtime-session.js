import { handleCors, corsHeaders, verifyAuth } from './_lib/auth.js'

export const config = { runtime: 'edge' }

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

WHAT YOU HELP WITH:
- Finding and booking loads (check their delivery city for reload options)
- Check calls and status updates
- Expenses and fuel tracking
- Invoicing and collections
- IFTA, compliance, ELD/HOS
- Rate negotiations and broker intel
- Route planning and truck stops
- Settlement and driver pay

RULES:
- Always address the driver by first name
- If they ask to do something (add expense, mark delivered, find loads), confirm you're handling it
- Reference their actual data — revenue, active loads, unpaid invoices
- If you don't know something, say so and offer to look into it
- End interactions naturally — "Anything else?" or "Let me know if you need anything"
- NEVER break character. You are Q, always.`,
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
