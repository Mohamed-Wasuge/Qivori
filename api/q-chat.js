/**
 * /api/q-chat — Q AI Chat backend
 *
 * Receives a message + conversation history + driver context from the mobile app,
 * calls Claude claude-haiku-4-5-20251001 for a fast/cheap response, returns the reply.
 *
 * POST body: { message: string, history: [{role, content}], context: { name, plan, weekEarnings, activeLoad } }
 */

import { handleCors, corsHeaders, verifyAuth } from './_lib/auth.js'

export const config = { runtime: 'edge' }

// ── Claude API ──────────────────────────────────────────────────────────────

function buildSystemPrompt(ctx = {}) {
  const { name = 'Driver', plan = 'standard', weekEarnings = 0, activeLoad = null } = ctx

  const loadLine = activeLoad
    ? `Their current load is ${activeLoad.origin || 'unknown'} → ${activeLoad.dest || activeLoad.destination || 'unknown'} with ${activeLoad.broker || 'a broker'} at $${activeLoad.rate || activeLoad.gross_pay || '?'}.`
    : 'They have no active load right now.'

  return `You are Q, an AI dispatcher and business advisor built specifically for owner-operator truck drivers. You help with:
- Load decisions (is this load worth taking?)
- Broker issues (non-payment, disputes, lowballing)
- Business finances (expenses, taxes, IFTA, cash flow)
- Compliance (HOS, FMCSA, DOT inspections)
- Route planning and fuel optimization
- Negotiation tactics with brokers
- Legal questions (refer to a lawyer for specifics but give practical guidance)

The driver's name is ${name}. They are on the ${plan} plan.
This week they've earned $${weekEarnings}.
${loadLine}

Be direct, practical, and empathetic. These are hard-working people who don't need corporate-speak.
Keep answers concise — they may be reading on a phone. Use plain language.
If they ask something outside trucking, gently redirect to how it relates to their trucking business.`
}

// ── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })
  }

  // Auth
  const { user, error: authError } = await verifyAuth(req)
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(req) })
  }

  // Parse body
  let body = {}
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400, headers: corsHeaders(req) })
  }

  const { message, history = [], context = {} } = body

  if (!message || typeof message !== 'string' || !message.trim()) {
    return Response.json({ error: 'message is required' }, { status: 400, headers: corsHeaders(req) })
  }

  // Validate + sanitize history
  const safeHistory = Array.isArray(history)
    ? history
        .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .map(m => ({ role: m.role, content: m.content }))
        .slice(-20) // keep last 20 turns max before trimming to 10 below
    : []

  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (!anthropicKey) {
    console.error('[q-chat] ANTHROPIC_API_KEY not set')
    return Response.json({ error: 'AI not configured' }, { status: 503, headers: corsHeaders(req) })
  }

  try {
    const systemPrompt = buildSystemPrompt(context)

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [
          ...safeHistory.slice(-10),
          { role: 'user', content: message.trim() },
        ],
      }),
    })

    if (!claudeRes.ok) {
      const errText = await claudeRes.text().catch(() => '')
      console.error('[q-chat] Claude API error', claudeRes.status, errText)
      return Response.json(
        { error: 'AI service error', status: claudeRes.status },
        { status: 502, headers: corsHeaders(req) }
      )
    }

    const data = await claudeRes.json()

    const reply = data?.content?.[0]?.text
    if (!reply) {
      console.error('[q-chat] Unexpected Claude response shape', JSON.stringify(data).slice(0, 200))
      return Response.json({ error: 'Empty response from AI' }, { status: 502, headers: corsHeaders(req) })
    }

    return Response.json({ reply }, { headers: corsHeaders(req) })
  } catch (err) {
    console.error('[q-chat] Unexpected error:', err.message)
    return Response.json({ error: err.message || 'Internal error' }, { status: 500, headers: corsHeaders(req) })
  }
}
